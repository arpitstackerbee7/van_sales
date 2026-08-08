"""Install-time setup for Van Sales.

The roles created here decide which home screen and tabs the mobile app
renders. They deliberately carry no document permissions of their own --
what a user may actually read or write still comes from the standard
ERPNext roles (Sales User, Stock User, Accounts User) on their Role Profile.
Keeping the two separate means a permission change on the desk needs no
change in the app.
"""

import frappe

from van_sales.setup.custom_fields import create_van_sales_custom_fields

# role -> what it unlocks in the app, kept in sync with van_sales.api.session
APP_ROLES = {
	"Van Sales User": "Sells from a van: invoicing, receipts, returns, replenishment.",
	"Pre Sales User": "Takes orders at allocated customers ahead of delivery.",
	"Pre Sales Team Leader": "Reviews, edits and approves the team's sales orders.",
	"Van Delivery Driver": "Delivers assigned trips and collects against them.",
	"Van Store Incharge": "Picks, stages and loads vans against sales orders.",
	"Van Sales Manager": "Reads the management dashboard and exception alerts.",
}


def after_install() -> None:
	create_roles()
	create_van_sales_custom_fields()
	frappe.db.commit()


def create_roles() -> None:
	for role_name, description in APP_ROLES.items():
		if frappe.db.exists("Role", role_name):
			continue

		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": role_name,
				"desk_access": 0,
				"is_custom": 1,
				"description": description,
			}
		).insert(ignore_permissions=True)
