"""What the app needs to know the moment it signs in.

The whole navigation model comes from here. The app ships one binary for
every role and renders what ``bootstrap`` tells it to -- so a role change
made on the desk takes effect at the user's next sync, with nothing to
configure on the phone.

Which van a rep is on comes from their Van Sales Profile: the warehouse
they carry stock in, the price list they sell at, and the payment modes
they may take. No POS Profile is read anywhere.
"""

import frappe
from frappe import _
from frappe.utils import cint

# Ordered most specific first: a user holding several roles lands on the
# screen for the narrowest job they do.
ROLE_HOMES = (
	("Van Sales User", "van", "van_home"),
	("Pre Sales Team Leader", "team_leader", "approvals"),
	("Pre Sales User", "pre_sales", "presales_home"),
	("Van Delivery Driver", "driver", "trip"),
	("Van Store Incharge", "store", "picking"),
	("Van Sales Manager", "management", "dashboard"),
)

# Tabs per persona: (route, label, icon). The app maps icon names to its own
# icon set; keeping them as names rather than glyphs leaves that choice to
# the client. PROFILE_TAB is appended to every persona -- everyone has a
# profile, and it is the one screen that must never depend on a role.
PERSONA_TABS = {
	"van": [
		("van_home", "Route", "route"),
		("invoice", "Sell", "scan"),
		("customers", "Customers", "customers"),
		("replenish", "Stock", "stock"),
	],
	"pre_sales": [
		("presales_home", "My day", "route"),
		("order", "New SO", "plus"),
		("orders", "Orders", "orders"),
		("customers", "Accounts", "customers"),
	],
	"team_leader": [
		("approvals", "Approvals", "approvals"),
		("team", "Team", "team"),
		("orders", "Orders", "orders"),
		("customers", "Accounts", "customers"),
	],
	"driver": [
		("trip", "Trip", "route"),
		("deliveries", "Deliver", "scan"),
		("collect", "Collect", "cash"),
		("customers", "Accounts", "customers"),
	],
	"store": [
		("picking", "Pick", "scan"),
		("loading", "Load", "stock"),
		("shortages", "Shortage", "alert"),
		("requests", "Requests", "orders"),
	],
	"management": [
		("dashboard", "Dashboard", "dashboard"),
		("sales", "Sales", "chart"),
		("alerts", "Alerts", "alert"),
		("reports", "Reports", "orders"),
	],
}

PROFILE_TAB = ("profile", "Profile", "person")


@frappe.whitelist()
def bootstrap():
	"""Everything the app needs to render its first screen."""
	return build_bootstrap()


def build_bootstrap() -> dict:
	user = frappe.session.user
	roles = frappe.get_roles(user)
	personas = [p for role, p, _home in ROLE_HOMES if role in roles]

	if not personas and "System Manager" in roles:
		# Lets an implementer open the app on a fresh site before roles are
		# handed out, without granting field staff anything extra.
		personas = ["management"]

	if not personas:
		frappe.throw(
			_("Your user has no Van Sales role. Ask your administrator to assign one."),
			frappe.PermissionError,
			title=_("No Access"),
		)

	active = personas[0]
	home = next(h for _r, p, h in ROLE_HOMES if p == active)

	user_doc = frappe.db.get_value(
		"User", user, ["full_name", "user_image", "language", "time_zone"], as_dict=True
	)

	return {
		"user": {
			"id": user,
			"full_name": user_doc.full_name,
			"image": user_doc.user_image,
			"language": user_doc.language or "en",
			"time_zone": user_doc.time_zone,
			"roles": roles,
		},
		"personas": personas,
		"active_persona": active,
		"home": home,
		"tabs": {
			persona: [
				{"route": r, "label": lbl, "icon": ic}
				for r, lbl, ic in (*PERSONA_TABS[persona], PROFILE_TAB)
			]
			for persona in personas
		},
		"vans": get_van_profiles(),
		"defaults": get_defaults(),
		"policy": get_policy(),
		"server_time": frappe.utils.now(),
	}


def get_van_profiles() -> list[dict]:
	"""Van Sales Profiles this user is assigned to."""
	profile_names = frappe.get_all(
		"Van Sales Profile User",
		filters={"user": frappe.session.user, "parenttype": "Van Sales Profile"},
		pluck="parent",
	)
	if not profile_names:
		return []

	profiles = frappe.get_all(
		"Van Sales Profile",
		filters={"name": ("in", profile_names), "disabled": 0},
		fields=[
			"name",
			"company",
			"warehouse",
			"source_warehouse",
			"vehicle",
			"currency",
			"selling_price_list",
			"cost_center",
			"taxes_and_charges",
			"update_stock_on_invoice",
		],
	)

	vans = []
	for profile in profiles:
		warehouse = frappe.db.get_value(
			"Warehouse",
			profile.warehouse,
			["vehicle", "default_driver", "warehouse_name"],
			as_dict=True,
		)

		vans.append(
			{
				"profile": profile.name,
				"company": profile.company,
				"warehouse": profile.warehouse,
				"warehouse_name": warehouse.warehouse_name if warehouse else profile.warehouse,
				"source_warehouse": profile.source_warehouse,
				"vehicle": profile.vehicle or (warehouse.vehicle if warehouse else None),
				"driver": warehouse.default_driver if warehouse else None,
				"currency": profile.currency,
				"price_list": profile.selling_price_list,
				"cost_center": profile.cost_center,
				"taxes_and_charges": profile.taxes_and_charges,
				"update_stock_on_invoice": bool(cint(profile.update_stock_on_invoice)),
				"payment_modes": frappe.get_all(
					"Van Payment Mode",
					filters={"parent": profile.name, "parenttype": "Van Sales Profile"},
					fields=["mode_of_payment", "default_account", "is_default"],
					order_by="idx",
				),
			}
		)

	return vans


def get_defaults() -> dict:
	from van_sales.api.utils import default_company

	# Same resolution the read endpoints use, so the company the app displays
	# is the company its figures were calculated against.
	company = default_company()

	return {
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency") if company else None,
		"country": frappe.db.get_value("Company", company, "country") if company else None,
		"date_format": frappe.db.get_single_value("System Settings", "date_format"),
		"float_precision": cint(frappe.db.get_single_value("System Settings", "float_precision")) or 2,
		"currency_precision": cint(frappe.db.get_single_value("System Settings", "currency_precision"))
		or 2,
	}


def get_policy() -> dict:
	"""Server-owned rules the app must honour, so they are never hardcoded on the device."""
	from van_sales.api.utils import setting

	return {
		"barcode_scanning": bool(cint(setting("enable_barcode_scanning", 1))),
		"require_scan_to_add_item": bool(cint(setting("require_scan_to_add_item", 0))),
		"manual_item_search": bool(cint(setting("allow_manual_item_search", 1))),
		"offline_window_hours": cint(setting("offline_window_hours", 72)) or 72,
		"max_queue_age_hours": cint(setting("max_queue_age_hours", 48)) or 48,
		"capture_gps": bool(cint(setting("require_gps_on_post", 1))),
		"gps_max_accuracy_meters": cint(setting("gps_max_accuracy_meters", 100)) or 100,
		"block_over_credit_limit": bool(cint(setting("block_sales_over_credit_limit", 1))),
		"payment_on_invoice": bool(cint(setting("record_payment_on_invoice", 1))),
		"customer_creation_needs_approval": bool(
			cint(setting("customer_creation_needs_approval", 1))
		),
	}
