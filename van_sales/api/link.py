"""Link-field lookups, the way the desk does them.

Tapping Customer or Item in this app should feel like clicking a Link field
in ERPNext: type a few characters, pick from the list, move on. Rather than
reimplement that search, this delegates to ``frappe.desk.search.search_link``
-- the exact endpoint the desk uses -- so results, ordering, the searchable
fields configured on the doctype, and user permissions all behave
identically to what the user already knows.

Customer and Item have their own richer endpoints, because a van rep
choosing a customer needs the balance and a rep choosing an item needs the
price and what is on the van. This is for everything else: mode of payment,
warehouse, UOM, batch.
"""

import frappe
from frappe import _

# Only doctypes the app has a legitimate reason to browse. Without this an
# authenticated user could enumerate any doctype through the app's own
# namespace, which is not something a van sales app should offer.
ALLOWED_DOCTYPES = {
	"Customer",
	"Item",
	"Mode of Payment",
	"Warehouse",
	"UOM",
	"Batch",
	"Price List",
	"Sales Person",
	"Territory",
	"Customer Group",
	"Vehicle",
	"Driver",
}


@frappe.whitelist()
def search(
	doctype: str,
	txt: str = "",
	filters=None,
	page_length: int = 20,
):
	"""Search a link target, returning the desk's own result shape."""
	if doctype not in ALLOWED_DOCTYPES:
		frappe.throw(
			_("{0} cannot be searched from the app.").format(doctype),
			frappe.PermissionError,
		)

	if not frappe.has_permission(doctype, "read"):
		frappe.throw(
			_("You are not permitted to read {0}.").format(_(doctype)),
			frappe.PermissionError,
		)

	from frappe.desk.search import search_link

	search_link(
		doctype=doctype,
		txt=txt or "",
		filters=filters,
		page_length=page_length,
	)

	# search_link writes into frappe.response rather than returning, which is
	# how the desk consumes it. Hand it back as a normal payload instead.
	results = frappe.response.get("results") or []

	return {
		"doctype": doctype,
		"options": [
			{
				"value": row.get("value"),
				"label": row.get("label") or row.get("value"),
				"description": row.get("description"),
			}
			for row in results
		],
	}
