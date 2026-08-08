"""Collections against invoices that already exist.

This is not how a van cash sale settles. A sale closed at the door carries
its payment on the invoice itself -- see ``van_sales.api.selling`` -- so one
document is posted and it comes back Paid.

What lands here is the other case: a driver or rep collecting against
invoices raised days earlier. Those stay **draft** Payment Entries. The
collector records what they took; the cashier reconciles and submits at day
close. That split keeps the person holding the cash from also being the one
who closes the books on it.

Cheques post the same way but carry their number, bank and value date, so a
post-dated cheque is visible against the customer long before it clears.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from van_sales.api.utils import (
	apply_provenance,
	default_company,
	idempotent_create,
	parse_payload,
	require_any_role,
)


def _mode_account(mode_of_payment: str, company: str) -> str | None:
	return frappe.db.get_value(
		"Mode of Payment Account",
		{"parent": mode_of_payment, "company": company},
		"default_account",
	)


def _receivable_account(customer: str, company: str) -> str:
	from erpnext.accounts.party import get_party_account

	account = get_party_account("Customer", customer, company)
	if not account:
		frappe.throw(_("No receivable account is set for {0}.").format(customer))

	return account


@frappe.whitelist(methods=["POST"])
def create_receipt(payload=None):
	"""Record a collection against a customer.

	payload = {
	  client_uid, customer, paid_amount, mode_of_payment,
	  allocations: [{invoice, amount}], reference_no?, reference_date?,
	  bank?, company?, geo{}, captured_at?, remarks?
	}

	Anything not allocated to an invoice stays unallocated on the entry --
	it sits on account until the cashier decides where it belongs.
	"""
	require_any_role(
		"Van Sales User", "Van Delivery Driver", "Pre Sales User", "Van Sales Manager"
	)
	payload = parse_payload(payload)

	return idempotent_create("Payment Entry", payload, lambda: _build_receipt(payload))


def _build_receipt(payload: dict) -> dict:
	customer = payload.get("customer")
	if not customer:
		frappe.throw(_("A customer is required."))

	paid_amount = flt(payload.get("paid_amount"))
	if paid_amount <= 0:
		frappe.throw(_("The amount received must be greater than zero."))

	company = payload.get("company") or default_company()
	mode_of_payment = payload.get("mode_of_payment")

	doc = frappe.new_doc("Payment Entry")
	doc.payment_type = "Receive"
	doc.company = company
	doc.posting_date = payload.get("posting_date") or nowdate()
	doc.party_type = "Customer"
	doc.party = customer
	doc.paid_amount = paid_amount
	doc.received_amount = paid_amount
	doc.mode_of_payment = mode_of_payment
	doc.remarks = payload.get("remarks")

	doc.paid_from = _receivable_account(customer, company)

	paid_to = payload.get("paid_to") or (_mode_account(mode_of_payment, company) if mode_of_payment else None)
	if not paid_to:
		frappe.throw(
			_("No account is set for mode of payment {0} in {1}.").format(mode_of_payment, company)
		)
	doc.paid_to = paid_to

	# Cheque details. ERPNext requires both together, and the value date is
	# what makes a post-dated cheque a PDC rather than a cleared receipt.
	if payload.get("reference_no") or payload.get("reference_date"):
		doc.reference_no = payload.get("reference_no")
		doc.reference_date = payload.get("reference_date") or nowdate()

	_allocate(doc, payload.get("allocations") or [], customer, company, paid_amount)

	apply_provenance(doc, payload)

	# Deliberately no manual set_missing_values() here. Payment Entry resolves
	# party_account inside validate(), so calling it early raises before the
	# document is ready. insert() runs validate() in the right order.
	doc.insert()

	is_pdc = bool(doc.reference_date and getdate(doc.reference_date) > getdate(doc.posting_date))

	settled_invoices = {
		row.reference_name: flt(
			frappe.db.get_value("Sales Invoice", row.reference_name, "outstanding_amount")
		)
		for row in doc.references
		if row.reference_doctype == "Sales Invoice"
	}

	return {
		"name": doc.name,
		"doctype": "Payment Entry",
		"docstatus": cint(doc.docstatus),
		"paid_amount": flt(doc.paid_amount),
		"unallocated_amount": flt(doc.unallocated_amount),
		"is_post_dated": is_pdc,
		"posting_date": str(doc.posting_date),
		"invoice_outstanding": settled_invoices,
		"duplicate": False,
	}


@frappe.whitelist()
def suggest_allocation(customer: str, amount: float, company: str | None = None):
	"""Spread an amount over open invoices, oldest first.

	This is a suggestion the rep can override, not a rule. Oldest-first is
	what collections chasing actually wants, and it stops the newest invoice
	being settled while a 60-day one ages further.
	"""
	from van_sales.api.customers import open_invoices

	company = company or default_company()
	remaining = flt(amount)
	suggestions = []

	for invoice in open_invoices(customer, company)["invoices"]:
		if remaining <= 0:
			break

		allocated = min(remaining, flt(invoice["outstanding_amount"]))
		remaining -= allocated

		suggestions.append(
			{
				"invoice": invoice["name"],
				"due_date": invoice["due_date"],
				"days_overdue": invoice["days_overdue"],
				"outstanding_amount": flt(invoice["outstanding_amount"]),
				"amount": allocated,
			}
		)

	return {
		"allocations": suggestions,
		"unallocated": remaining,
		"customer": customer,
	}


@frappe.whitelist()
def my_collections(from_date: str | None = None, to_date: str | None = None, company: str | None = None):
	"""What this user has collected and not yet had finalised.

	The cash figure the rep sees has to be the same number the cashier will
	count, so it is derived from the entries themselves rather than a tally
	the app keeps.
	"""
	company = company or default_company()
	from_date = from_date or nowdate()
	to_date = to_date or nowdate()

	entries = frappe.get_all(
		"Payment Entry",
		filters={
			"company": company,
			"payment_type": "Receive",
			"party_type": "Customer",
			"owner": frappe.session.user,
			"posting_date": ("between", [from_date, to_date]),
			"docstatus": ("<", 2),
		},
		fields=[
			"name",
			"party",
			"party_name",
			"paid_amount",
			"mode_of_payment",
			"reference_no",
			"reference_date",
			"posting_date",
			"docstatus",
			"unallocated_amount",
		],
		order_by="creation desc",
		limit_page_length=0,
	)

	cash_modes = frappe.get_all(
		"Mode of Payment", filters={"type": "Cash"}, pluck="name"
	)

	cash_on_hand = sum(
		flt(e.paid_amount) for e in entries if e.mode_of_payment in cash_modes
	)

	return {
		"from_date": from_date,
		"to_date": to_date,
		"entries": entries,
		"cash_on_hand": cash_on_hand,
		"total_collected": sum(flt(e.paid_amount) for e in entries),
		"draft_count": len([e for e in entries if cint(e.docstatus) == 0]),
	}
