"""Customer, credit and receivables reads.

Every screen that precedes a sale answers one question first: what does
this customer already owe, and how far past due is it. So the list and the
detail both carry outstanding, credit headroom and ageing -- the rep should
never have to open a second screen to find out they cannot close the sale.

Allocation reuses ERPNext's Sales Team. A rep sees the customers their
Sales Person record is on; a team leader sees their whole subtree, because
Sales Person is a tree and ``lft``/``rgt`` already describe it.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from van_sales.api.utils import default_company

AGEING_BUCKETS = ("current", "1-30", "31-60", "60+")

# Scopes named after ERPNext's Sales Invoice statuses, but resolved two
# different ways on purpose.
#
# Credit Note and Return really are document states, so they match the
# status field directly. Paid, Unpaid and Overdue are asked about the
# *customer*, not a document: a customer holding one settled invoice and
# one open one is not "Paid", and matching on status would list them under
# both. Those three are answered from the balance instead.
#
# Overdue in particular must not use the status field. ERPNext flips an
# invoice to Overdue from a scheduled job, so a document past its due date
# still reads Unpaid until that runs -- which would leave the route screen
# reporting money overdue while the Overdue filter came back empty.
SCOPE_STATUSES = {
	"credit_note": ("Credit Note Issued",),
	"return": ("Return",),
}


def _bucket_for(due_date, as_on) -> str:
	if not due_date or getdate(due_date) >= getdate(as_on):
		return "current"

	days = (getdate(as_on) - getdate(due_date)).days
	if days <= 30:
		return "1-30"
	if days <= 60:
		return "31-60"
	return "60+"


def get_sales_person(user: str | None = None) -> str | None:
	"""The Sales Person record behind a user, via their Employee."""
	user = user or frappe.session.user

	employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
	if not employee:
		return None

	return frappe.db.get_value("Sales Person", {"employee": employee, "enabled": 1}, "name")


def _allocated_customers(include_team: bool = False) -> list[str] | None:
	"""Customers allocated to this user, or None when they may see everything.

	None and [] mean different things: None is "no allocation applies, fall
	back to normal permissions", [] is "allocated to nothing", which must
	return an empty list rather than the whole customer master.
	"""
	sales_person = get_sales_person()
	if not sales_person:
		return None

	people = [sales_person]

	if include_team:
		lft, rgt = frappe.db.get_value("Sales Person", sales_person, ["lft", "rgt"])
		if lft is not None and rgt is not None:
			people = frappe.get_all(
				"Sales Person",
				filters={"lft": (">=", lft), "rgt": ("<=", rgt), "enabled": 1},
				pluck="name",
			)

	return frappe.get_all(
		"Sales Team",
		filters={"sales_person": ("in", people), "parenttype": "Customer"},
		pluck="parent",
		distinct=True,
	)


def _receivables(customers: list[str] | None, company: str, as_on: str | None = None) -> dict:
	"""Outstanding and ageing per customer, from submitted sales invoices."""
	as_on = as_on or nowdate()

	filters = {
		"docstatus": 1,
		"company": company,
		"outstanding_amount": (">", 0),
	}
	if customers is not None:
		if not customers:
			return {}
		filters["customer"] = ("in", customers)

	rows = frappe.get_all(
		"Sales Invoice",
		filters=filters,
		fields=["customer", "outstanding_amount", "due_date", "grand_total"],
		limit_page_length=0,
	)

	summary: dict[str, dict] = {}
	for row in rows:
		entry = summary.setdefault(
			row.customer,
			{
				"outstanding": 0.0,
				"overdue": 0.0,
				"open_invoices": 0,
				"overdue_invoices": 0,
				"oldest_due_date": None,
				"ageing": dict.fromkeys(AGEING_BUCKETS, 0.0),
			},
		)

		amount = flt(row.outstanding_amount)
		bucket = _bucket_for(row.due_date, as_on)

		entry["outstanding"] += amount
		entry["open_invoices"] += 1
		entry["ageing"][bucket] += amount

		if bucket != "current":
			entry["overdue"] += amount
			entry["overdue_invoices"] += 1
			if not entry["oldest_due_date"] or getdate(row.due_date) < getdate(entry["oldest_due_date"]):
				entry["oldest_due_date"] = row.due_date

	return summary


def _customers_with_status(
	customers: list[str], company: str, scope: str
) -> set[str] | None:
	"""Customers holding at least one invoice in the requested status.

	Only used for the scopes that genuinely describe a document state.
	Returns None when the scope is not status-based, meaning no filtering
	here -- which is different from an empty set, that being "nobody".
	"""
	statuses = SCOPE_STATUSES.get(scope)
	if not statuses or not customers:
		return None

	return set(
		frappe.get_all(
			"Sales Invoice",
			filters={
				"docstatus": 1,
				"company": company,
				"customer": ("in", customers),
				"status": ("in", statuses),
			},
			pluck="customer",
			distinct=True,
		)
	)


def _credit_limit(customer: str, company: str) -> float:
	from erpnext.selling.doctype.customer.customer import get_credit_limit

	return flt(get_credit_limit(customer, company))


@frappe.whitelist()
def list_customers(
	search: str | None = None,
	scope: str = "all",
	include_team: int = 0,
	limit: int = 50,
	start: int = 0,
	company: str | None = None,
):
	"""Allocated customers with the money already on screen.

	``scope`` names an ERPNext invoice status: ``all``, ``paid``,
	``unpaid``, ``overdue``, ``credit_note`` or ``return``.
	"""
	company = company or default_company()
	allocated = _allocated_customers(include_team=cint(include_team))

	filters = {"disabled": 0}
	if allocated is not None:
		if not allocated:
			return {"customers": [], "total": 0}
		filters["name"] = ("in", allocated)

	or_filters = None
	if search:
		or_filters = {
			"name": ("like", f"%{search}%"),
			"customer_name": ("like", f"%{search}%"),
			"tax_id": ("like", f"%{search}%"),
		}

	# Permissions are applied here by frappe.get_all, so a user still only
	# sees customers their role and user permissions allow.
	customers = frappe.get_all(
		"Customer",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"customer_name",
			"customer_group",
			"territory",
			"payment_terms",
			"tax_id",
			"mobile_no",
			"primary_address",
		],
		order_by="customer_name asc",
		limit_page_length=0,
	)

	names = [c.name for c in customers]
	receivables = _receivables(names, company) if names else {}
	matching = _customers_with_status(names, company, scope)

	rows = []
	for customer in customers:
		money = receivables.get(customer.name, {})
		outstanding = flt(money.get("outstanding"))
		overdue = flt(money.get("overdue"))

		if matching is not None and customer.name not in matching:
			continue
		if scope == "paid" and outstanding > 0:
			continue
		if scope in ("unpaid", "due") and outstanding <= 0:
			continue
		if scope == "overdue" and overdue <= 0:
			continue

		limit_amount = _credit_limit(customer.name, company)

		rows.append(
			{
				**customer,
				"outstanding": outstanding,
				"overdue": overdue,
				"open_invoices": cint(money.get("open_invoices")),
				"overdue_invoices": cint(money.get("overdue_invoices")),
				"oldest_due_date": money.get("oldest_due_date"),
				"ageing": money.get("ageing") or dict.fromkeys(AGEING_BUCKETS, 0.0),
				"credit_limit": limit_amount,
				"credit_headroom": (limit_amount - outstanding) if limit_amount else None,
			}
		)

	total = len(rows)
	page = rows[cint(start) : cint(start) + cint(limit)]

	return {
		"customers": page,
		"total": total,
		"company": company,
		"totals": {
			"outstanding": sum(r["outstanding"] for r in rows),
			"overdue": sum(r["overdue"] for r in rows),
			"ageing": {
				bucket: sum(r["ageing"].get(bucket, 0) for r in rows) for bucket in AGEING_BUCKETS
			},
		},
	}


@frappe.whitelist()
def receivables_summary(include_team: int = 0, company: str | None = None):
	"""Just the money, for a screen that only wants the headline.

	The route screen shows total receivable and its ageing. Reusing
	list_customers for that would send every customer row to the phone to
	display one number.
	"""
	company = company or default_company()
	allocated = _allocated_customers(include_team=cint(include_team))

	if allocated is not None and not allocated:
		return {
			"outstanding": 0.0,
			"overdue": 0.0,
			"ageing": dict.fromkeys(AGEING_BUCKETS, 0.0),
			"customers_with_balance": 0,
			"customers_overdue": 0,
			"company": company,
		}

	summary = _receivables(allocated, company)

	ageing = dict.fromkeys(AGEING_BUCKETS, 0.0)
	for entry in summary.values():
		for bucket, amount in entry["ageing"].items():
			ageing[bucket] += amount

	return {
		"outstanding": sum(e["outstanding"] for e in summary.values()),
		"overdue": sum(e["overdue"] for e in summary.values()),
		"ageing": ageing,
		"customers_with_balance": len(summary),
		"customers_overdue": len([e for e in summary.values() if e["overdue"] > 0]),
		"company": company,
	}


@frappe.whitelist()
def snapshot(customer: str, company: str | None = None):
	"""Credit position for one customer, read before any sell action."""
	if not frappe.has_permission("Customer", "read", doc=customer):
		frappe.throw(_("Not permitted to read this customer."), frappe.PermissionError)

	company = company or default_company()
	money = _receivables([customer], company).get(customer, {})

	outstanding = flt(money.get("outstanding"))
	limit_amount = _credit_limit(customer, company)

	doc = frappe.db.get_value(
		"Customer",
		customer,
		[
			"name",
			"customer_name",
			"customer_group",
			"territory",
			"tax_id",
			"mobile_no",
			"payment_terms",
			"default_price_list",
			"is_frozen",
			"disabled",
		],
		as_dict=True,
	)

	return {
		**doc,
		"outstanding": outstanding,
		"overdue": flt(money.get("overdue")),
		"open_invoices": cint(money.get("open_invoices")),
		"overdue_invoices": cint(money.get("overdue_invoices")),
		"oldest_due_date": money.get("oldest_due_date"),
		"ageing": money.get("ageing") or dict.fromkeys(AGEING_BUCKETS, 0.0),
		"credit_limit": limit_amount,
		"credit_headroom": (limit_amount - outstanding) if limit_amount else None,
		"blocked": bool(cint(doc.is_frozen) or cint(doc.disabled)),
	}


@frappe.whitelist()
def statement(customer: str, company: str | None = None, from_date: str | None = None):
	"""Invoice-level statement: what was billed, paid against it, and left."""
	if not frappe.has_permission("Customer", "read", doc=customer):
		frappe.throw(_("Not permitted to read this customer."), frappe.PermissionError)

	company = company or default_company()
	from_date = from_date or add_days(nowdate(), -365)

	invoices = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 1,
			"company": company,
			"customer": customer,
			"posting_date": (">=", from_date),
		},
		fields=[
			"name",
			"posting_date",
			"due_date",
			"grand_total",
			"outstanding_amount",
			"is_return",
			"status",
			"currency",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=0,
	)

	payments = frappe.get_all(
		"Payment Entry",
		filters={
			"docstatus": ("<", 2),
			"company": company,
			"party_type": "Customer",
			"party": customer,
			"posting_date": (">=", from_date),
		},
		fields=[
			"name",
			"posting_date",
			"paid_amount",
			"mode_of_payment",
			"reference_no",
			"reference_date",
			"docstatus",
			"unallocated_amount",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=0,
	)

	lines = []
	for inv in invoices:
		paid = flt(inv.grand_total) - flt(inv.outstanding_amount)
		lines.append(
			{
				"doctype": "Sales Invoice",
				"name": inv.name,
				"date": inv.posting_date,
				"due_date": inv.due_date,
				"amount": flt(inv.grand_total),
				"paid": paid,
				"balance": flt(inv.outstanding_amount),
				"partial": paid > 0 and flt(inv.outstanding_amount) > 0,
				"state": "CREDIT" if cint(inv.is_return) else (inv.status or "").upper(),
				"currency": inv.currency,
			}
		)

	for pe in payments:
		lines.append(
			{
				"doctype": "Payment Entry",
				"name": pe.name,
				"date": pe.posting_date,
				"amount": -flt(pe.paid_amount),
				"paid": flt(pe.paid_amount),
				"balance": 0.0,
				"partial": False,
				"state": "DRAFT RECEIPT" if cint(pe.docstatus) == 0 else "RECEIPT",
				"mode_of_payment": pe.mode_of_payment,
				"reference_no": pe.reference_no,
				"reference_date": pe.reference_date,
				"unallocated": flt(pe.unallocated_amount),
			}
		)

	lines.sort(key=lambda row: getdate(row["date"]), reverse=True)

	billed = sum(flt(i.grand_total) for i in invoices if not cint(i.is_return))
	outstanding = sum(flt(i.outstanding_amount) for i in invoices)

	return {
		"customer": customer,
		"company": company,
		"from_date": from_date,
		"to_date": nowdate(),
		"billed": billed,
		"paid": billed - outstanding,
		"outstanding": outstanding,
		"lines": lines,
	}


@frappe.whitelist()
def open_invoices(customer: str, company: str | None = None):
	"""Unpaid invoices oldest first -- the allocation order for a receipt."""
	if not frappe.has_permission("Customer", "read", doc=customer):
		frappe.throw(_("Not permitted to read this customer."), frappe.PermissionError)

	company = company or default_company()

	invoices = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 1,
			"company": company,
			"customer": customer,
			"outstanding_amount": (">", 0),
		},
		fields=["name", "posting_date", "due_date", "grand_total", "outstanding_amount", "currency"],
		order_by="due_date asc, posting_date asc",
		limit_page_length=0,
	)

	today = nowdate()
	for inv in invoices:
		inv["days_overdue"] = max(0, (getdate(today) - getdate(inv.due_date)).days) if inv.due_date else 0
		inv["bucket"] = _bucket_for(inv.due_date, today)

	return {"invoices": invoices}
