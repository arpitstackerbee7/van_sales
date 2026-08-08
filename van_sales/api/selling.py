"""Posting sales from the field.

A van sale is an ordinary Sales Invoice against the van's warehouse with
``update_stock`` on -- not a POS invoice. Stock leaves the van as the
invoice submits, so what the rep hands over and what ERPNext believes is
on the van stay in step without a separate delivery note.

Every write is idempotent on ``client_uid``. The device queues documents
while offline and retries them on reconnect; a retry that arrives after a
request already succeeded must return the original invoice, never a second
one.

Documents are inserted without ``ignore_permissions``, so Frappe still
decides whether this user may create a Sales Invoice for this company.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from van_sales.api.utils import (
	apply_provenance,
	default_company,
	get_settings,
	idempotent_create,
	parse_payload,
	require_any_role,
)
from van_sales.van_sales.doctype.van_sales_profile.van_sales_profile import get_profile_for_user


def _resolve_profile(profile_name: str | None = None):
	"""The van this user is selling from."""
	profile_name = profile_name or get_profile_for_user()

	if not profile_name:
		frappe.throw(
			_("You are not assigned to a van. Ask your administrator for a Van Sales Profile."),
			title=_("No Van"),
		)

	profile = frappe.get_cached_doc("Van Sales Profile", profile_name)

	if cint(profile.disabled):
		frappe.throw(_("Van profile {0} is disabled.").format(profile_name))

	assigned = {row.user for row in profile.users}
	if frappe.session.user not in assigned and "System Manager" not in frappe.get_roles():
		frappe.throw(
			_("You are not assigned to van {0}.").format(profile_name), frappe.PermissionError
		)

	return profile


def _check_credit(customer: str, company: str, extra_amount: float, on_credit: bool) -> None:
	"""Block a credit sale that breaches the limit; never block a cash sale.

	A cash sale settles at the door, so it cannot increase exposure. Only
	terms sales are gated.
	"""
	if not on_credit:
		return

	if not cint(get_settings().block_sales_over_credit_limit):
		return

	from erpnext.selling.doctype.customer.customer import check_credit_limit

	# Raises with ERPNext's own message, which names the limit and the gap.
	check_credit_limit(customer, company, extra_amount=flt(extra_amount))


def _add_items(doc, items: list[dict], warehouse: str) -> None:
	if not items:
		frappe.throw(_("An invoice needs at least one line."))

	for line in items:
		item_code = line.get("item_code")
		if not item_code:
			frappe.throw(_("Every line needs an item code."))

		qty = flt(line.get("qty"))
		if qty <= 0:
			frappe.throw(_("Quantity for {0} must be greater than zero.").format(item_code))

		row = doc.append(
			"items",
			{
				"item_code": item_code,
				"qty": qty,
				"uom": line.get("uom"),
				"warehouse": line.get("warehouse") or warehouse,
				"batch_no": line.get("batch_no"),
			},
		)

		# Let the rep's negotiated rate through, but only as an explicit
		# override -- otherwise the server prices the line itself.
		if line.get("rate") is not None:
			row.rate = flt(line.get("rate"))

		if line.get("discount_percentage") is not None:
			row.discount_percentage = flt(line.get("discount_percentage"))


@frappe.whitelist(methods=["POST"])
def create_invoice(payload=None):
	"""Post a van sale.

	payload = {
	  client_uid, customer, items[], profile?, on_credit?, submit?,
	  geo{latitude,longitude}, captured_at?, remarks?
	}
	"""
	require_any_role("Van Sales User", "Van Sales Manager")
	payload = parse_payload(payload)

	return idempotent_create(
		"Sales Invoice", payload, lambda: _build_invoice(payload)
	)


def _compose_invoice(payload: dict, profile):
	"""Build a fully priced, fully taxed invoice in memory without saving it.

	Both the cart preview and the real post go through here, so the total the
	rep reads on the payment screen is calculated by the same code that will
	post it. The app never computes tax itself.
	"""
	customer = payload.get("customer")

	if not customer:
		frappe.throw(_("A customer is required."))

	doc = frappe.new_doc("Sales Invoice")
	doc.customer = customer
	doc.company = profile.company
	doc.posting_date = payload.get("posting_date") or nowdate()
	doc.set_posting_time = 0
	doc.currency = profile.currency
	doc.selling_price_list = profile.selling_price_list
	doc.update_stock = cint(profile.update_stock_on_invoice)
	doc.set_warehouse = profile.warehouse
	doc.remarks = payload.get("remarks")

	if profile.cost_center:
		doc.cost_center = profile.cost_center
	if profile.debit_to:
		doc.debit_to = profile.debit_to
	if profile.taxes_and_charges:
		doc.taxes_and_charges = profile.taxes_and_charges

	_add_items(doc, payload.get("items") or [], profile.warehouse)
	apply_provenance(doc, payload)

	# Pull in the tax template rows, rates, and totals.
	doc.run_method("set_missing_values")
	if profile.taxes_and_charges:
		doc.run_method("set_taxes")
	doc.run_method("calculate_taxes_and_totals")

	return doc


def _totals(doc) -> dict:
	return {
		"net_total": flt(doc.net_total),
		"total_taxes": flt(doc.total_taxes_and_charges),
		"grand_total": flt(doc.grand_total),
		"rounded_total": flt(doc.rounded_total) or flt(doc.grand_total),
		"currency": doc.currency,
		"items": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"uom": row.uom,
				"rate": flt(row.rate),
				"amount": flt(row.amount),
			}
			for row in doc.items
		],
		"taxes": [
			{"description": tax.description, "rate": flt(tax.rate), "amount": flt(tax.tax_amount)}
			for tax in doc.taxes
		],
	}


@frappe.whitelist()
def quote(payload=None):
	"""Price a basket without posting anything.

	Lets the cart show the exact tax and total the server would charge,
	including pricing rules, rather than the app applying a hardcoded rate.
	"""
	require_any_role("Van Sales User", "Van Sales Manager")
	payload = parse_payload(payload)

	profile = _resolve_profile(payload.get("profile"))
	doc = _compose_invoice(payload, profile)

	customer = payload.get("customer")
	limit_amount = 0.0
	outstanding = 0.0

	if customer:
		from erpnext.selling.doctype.customer.customer import get_credit_limit

		from van_sales.api.customers import _receivables

		limit_amount = flt(get_credit_limit(customer, profile.company))
		outstanding = flt(
			(_receivables([customer], profile.company).get(customer) or {}).get("outstanding")
		)

	after = outstanding + flt(doc.grand_total)

	return {
		**_totals(doc),
		"credit": {
			"limit": limit_amount,
			"outstanding": outstanding,
			"balance_after": after,
			"over_limit": bool(limit_amount and after > limit_amount),
			"over_by": max(0.0, after - limit_amount) if limit_amount else 0.0,
			"blocks_credit_sale": bool(cint(get_settings().block_sales_over_credit_limit)),
		},
	}


def _build_invoice(payload: dict) -> dict:
	profile = _resolve_profile(payload.get("profile"))
	doc = _compose_invoice(payload, profile)

	on_credit = bool(payload.get("on_credit"))
	_check_credit(payload["customer"], profile.company, flt(doc.grand_total), on_credit)

	doc.insert()

	if cint(payload.get("submit", 1)):
		doc.submit()

	return {
		"name": doc.name,
		"doctype": "Sales Invoice",
		"docstatus": cint(doc.docstatus),
		"outstanding_amount": flt(doc.outstanding_amount),
		"posting_date": str(doc.posting_date),
		"duplicate": False,
		**_totals(doc),
	}


@frappe.whitelist(methods=["POST"])
def create_return(payload=None):
	"""Post a credit note against a delivered invoice.

	Returns always reference a parent invoice: it is what ties the credit to
	a price and a batch, and it is what stops a return being used to inject
	stock that was never sold.
	"""
	require_any_role("Van Sales User", "Van Delivery Driver", "Van Sales Manager")
	payload = parse_payload(payload)

	return idempotent_create("Sales Invoice", payload, lambda: _build_return(payload))


def _build_return(payload: dict) -> dict:
	from erpnext.controllers.sales_and_purchase_return import make_return_doc

	against = payload.get("return_against")
	if not against:
		frappe.throw(_("A return must reference the invoice it is against."))

	if not frappe.db.exists("Sales Invoice", {"name": against, "docstatus": 1}):
		frappe.throw(_("Invoice {0} is not submitted and cannot be returned against.").format(against))

	doc = make_return_doc("Sales Invoice", against)

	# make_return_doc copies every line; keep only what is coming back, at the
	# quantities the rep counted.
	wanted = {
		line["item_code"]: line
		for line in (payload.get("items") or [])
		if line.get("item_code") and flt(line.get("qty")) > 0
	}
	if not wanted:
		frappe.throw(_("Nothing to return."))

	kept = []
	for row in doc.items:
		requested = wanted.get(row.item_code)
		if not requested:
			continue

		# Return quantities are negative on a credit note.
		row.qty = -abs(flt(requested.get("qty")))
		row.stock_qty = row.qty * flt(row.conversion_factor or 1)

		# Damaged or expired goods must not land back in saleable van stock.
		reason = (requested.get("reason") or "good").lower()
		row.van_return_reason = reason
		if reason in ("damaged", "expired") and payload.get("scrap_warehouse"):
			row.warehouse = payload["scrap_warehouse"]

		kept.append(row)

	if not kept:
		frappe.throw(_("None of the returned items appear on invoice {0}.").format(against))

	doc.items = kept
	for idx, row in enumerate(doc.items, start=1):
		row.idx = idx

	apply_provenance(doc, payload)
	doc.run_method("calculate_taxes_and_totals")
	doc.insert()

	if cint(payload.get("submit", 1)):
		doc.submit()

	return {
		"name": doc.name,
		"doctype": "Sales Invoice",
		"docstatus": cint(doc.docstatus),
		"is_return": 1,
		"return_against": against,
		"grand_total": flt(doc.grand_total),
		"currency": doc.currency,
		"duplicate": False,
	}


@frappe.whitelist()
def invoice_for_print(name: str):
	"""The minimum a 58mm thermal receipt needs, already rounded."""
	if not frappe.has_permission("Sales Invoice", "read", doc=name):
		frappe.throw(_("Not permitted to read this invoice."), frappe.PermissionError)

	doc = frappe.get_doc("Sales Invoice", name)
	company = frappe.db.get_value(
		"Company", doc.company, ["company_name", "tax_id", "phone_no"], as_dict=True
	)

	return {
		"name": doc.name,
		"posting_date": str(doc.posting_date),
		"posting_time": str(doc.posting_time),
		"company": company,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
		"customer_tax_id": frappe.db.get_value("Customer", doc.customer, "tax_id"),
		"currency": doc.currency,
		"items": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"uom": row.uom,
				"rate": flt(row.rate),
				"amount": flt(row.amount),
			}
			for row in doc.items
		],
		"taxes": [
			{"description": tax.description, "amount": flt(tax.tax_amount)} for tax in doc.taxes
		],
		"net_total": flt(doc.net_total),
		"total_taxes": flt(doc.total_taxes_and_charges),
		"grand_total": flt(doc.grand_total),
		"rounded_total": flt(doc.rounded_total) or flt(doc.grand_total),
		"outstanding_amount": flt(doc.outstanding_amount),
		"is_return": cint(doc.is_return),
	}
