# Copyright (c) 2026, Yasir Shaikh and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class VanSalesProfile(Document):
	def validate(self):
		self.validate_warehouse_is_a_van()
		self.validate_company_links()
		self.validate_single_default_payment_mode()
		self.validate_user_not_double_assigned()

	def validate_warehouse_is_a_van(self):
		warehouse = frappe.db.get_value(
			"Warehouse", self.warehouse, ["is_van", "company", "is_group"], as_dict=True
		)

		if cint(warehouse.is_group):
			frappe.throw(_("{0} is a group warehouse and cannot hold van stock.").format(self.warehouse))

		if not cint(warehouse.is_van):
			frappe.throw(
				_("Warehouse {0} is not marked as a van. Tick <b>Is a Van</b> on it first.").format(
					frappe.bold(self.warehouse)
				)
			)

		if warehouse.company != self.company:
			frappe.throw(
				_("Warehouse {0} belongs to {1}, not {2}.").format(
					self.warehouse, warehouse.company, self.company
				)
			)

	def validate_company_links(self):
		for fieldname in ("cost_center", "write_off_cost_center", "debit_to", "write_off_account"):
			value = self.get(fieldname)
			if not value:
				continue

			doctype = "Cost Center" if "cost_center" in fieldname else "Account"
			company = frappe.db.get_value(doctype, value, "company")
			if company != self.company:
				frappe.throw(
					_("{0} {1} belongs to {2}, not {3}.").format(
						_(doctype), value, company, self.company
					)
				)

	def validate_single_default_payment_mode(self):
		defaults = [row for row in self.payment_modes if cint(row.is_default)]

		if len(defaults) > 1:
			frappe.throw(_("Only one payment mode can be the default."))

		if self.payment_modes and not defaults:
			self.payment_modes[0].is_default = 1

	def validate_user_not_double_assigned(self):
		"""A rep on two vans would make 'which stock am I holding' ambiguous."""
		users = [row.user for row in self.users]
		if not users:
			return

		if len(users) != len(set(users)):
			frappe.throw(_("The same user is listed twice on this profile."))

		clash = frappe.get_all(
			"Van Sales Profile User",
			filters={
				"user": ("in", users),
				"parenttype": "Van Sales Profile",
				"parent": ("!=", self.name),
			},
			fields=["user", "parent"],
			limit=1,
		)

		if clash:
			frappe.throw(
				_("{0} is already assigned to van profile {1}.").format(
					clash[0].user, frappe.bold(clash[0].parent)
				)
			)


def get_profile_for_user(user: str | None = None) -> str | None:
	"""Name of the van profile this user sells from, if any."""
	user = user or frappe.session.user

	profiles = frappe.get_all(
		"Van Sales Profile User",
		filters={"user": user, "parenttype": "Van Sales Profile"},
		pluck="parent",
	)
	if not profiles:
		return None

	enabled = frappe.get_all(
		"Van Sales Profile",
		filters={"name": ("in", profiles), "disabled": 0},
		pluck="name",
		limit=1,
	)

	return enabled[0] if enabled else None
