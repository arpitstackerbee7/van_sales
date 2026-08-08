# Copyright (c) 2026, Yasir Shaikh and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class VanSalesSettings(Document):
	def validate(self):
		if self.offline_window_hours and self.offline_window_hours < 1:
			frappe.throw(_("Offline sign-in window must be at least one hour."))

		if self.allow_negative_stock_in_van and not self.negative_stock_clearing_hours:
			frappe.throw(_("Set a clearing window before allowing negative stock in vans."))
