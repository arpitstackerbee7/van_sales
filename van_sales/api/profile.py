"""The signed-in user's own profile.

Reads join the User record to the Employee record linked by ``user_id``, so
the app shows one person rather than two half-populated screens.

Writes are the sensitive part. A rep saving their own profile must not be
able to reach anything that decides what they may do, so the payload is
never applied wholesale -- each field is copied across one at a time from
an explicit allow-list. Roles, enabled, user_type, api keys and the email
itself are unreachable from here by construction rather than by
validation: a field that is not in the list is never read, whatever the
client sends.

The split between what is editable and what is not follows who owns the
data. Your own contact details are yours. Your employment record --
designation, department, joining date, reporting line -- belongs to HR and
is read-only here, because a van rep editing their own designation is not
"profile management", it is an HR control being bypassed.
"""

import frappe
from frappe import _
from frappe.utils import cint

from van_sales.api.utils import parse_payload

# Fields on User the owner may change about themselves.
EDITABLE_USER_FIELDS = (
	"first_name",
	"middle_name",
	"last_name",
	"phone",
	"mobile_no",
	"gender",
	"birth_date",
	"location",
	"interest",
	"bio",
	"language",
	"time_zone",
	"user_image",
)

# Fields on Employee the owner may change. Deliberately tiny: contact
# details only. Everything that affects pay, hierarchy or entitlement is
# HR's to set.
EDITABLE_EMPLOYEE_FIELDS = (
	"cell_number",
	"personal_email",
	"current_address",
	"emergency_phone_number",
	"person_to_be_contacted",
	"relation",
)

# Shown, never written from the app.
READONLY_EMPLOYEE_FIELDS = (
	"name",
	"employee_name",
	"designation",
	"department",
	"branch",
	"company",
	"date_of_joining",
	"employment_type",
	"grade",
	"reports_to",
	"status",
	"image",
	"holiday_list",
)


def _employee_for(user: str) -> dict | None:
	name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not name:
		return None

	fields = list(dict.fromkeys(READONLY_EMPLOYEE_FIELDS + EDITABLE_EMPLOYEE_FIELDS))
	employee = frappe.db.get_value("Employee", name, fields, as_dict=True)

	if employee and employee.get("reports_to"):
		employee["reports_to_name"] = frappe.db.get_value(
			"Employee", employee["reports_to"], "employee_name"
		)

	return employee


@frappe.whitelist()
def get_profile():
	"""Everything the My Profile screen shows, in one round trip."""
	from van_sales.api.session import get_van_profiles

	user = frappe.session.user

	user_doc = frappe.db.get_value(
		"User",
		user,
		[
			"name",
			"email",
			"full_name",
			"first_name",
			"middle_name",
			"last_name",
			"username",
			"phone",
			"mobile_no",
			"gender",
			"birth_date",
			"location",
			"bio",
			"interest",
			"language",
			"time_zone",
			"user_image",
			"last_active",
			"last_login",
			"enabled",
		],
		as_dict=True,
	)

	employee = _employee_for(user)
	vans = get_van_profiles()

	return {
		"user": user_doc,
		"employee": employee,
		"van": vans[0] if vans else None,
		"roles": [r for r in frappe.get_roles(user) if r not in ("All", "Guest")],
		"editable": {
			"user": list(EDITABLE_USER_FIELDS),
			"employee": list(EDITABLE_EMPLOYEE_FIELDS) if employee else [],
		},
	}


@frappe.whitelist(methods=["POST"])
def update_profile(payload=None):
	"""Save the fields a user is allowed to change about themselves.

	Only keys present in the allow-lists are written. Anything else in the
	payload is ignored rather than rejected, so a client sending a stale or
	over-broad object still cannot move a protected field.
	"""
	payload = parse_payload(payload)
	user = frappe.session.user

	user_changes = {
		field: payload[field] for field in EDITABLE_USER_FIELDS if field in payload
	}

	# Field-by-field rather than doc.update(payload): the latter would
	# happily apply `roles` or `enabled` if they ever appeared in the
	# payload, which is exactly the failure this guards against.
	if user_changes:
		user_doc = frappe.get_doc("User", user)
		for field, value in user_changes.items():
			user_doc.set(field, value)

		# full_name is derived from the name parts; save() recomputes it via
		# set_full_name, so it never drifts from first/middle/last.
		user_doc.save(ignore_permissions=True)

	employee_payload = payload.get("employee") or {}
	employee_changes = {
		field: employee_payload[field]
		for field in EDITABLE_EMPLOYEE_FIELDS
		if field in employee_payload
	}

	if employee_changes:
		employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
		if not employee_name:
			frappe.throw(_("There is no Employee record linked to your user."))

		employee_doc = frappe.get_doc("Employee", employee_name)
		for field, value in employee_changes.items():
			employee_doc.set(field, value)
		employee_doc.save(ignore_permissions=True)

	frappe.db.commit()

	return {
		**get_profile(),
		"updated": {
			"user": sorted(user_changes),
			"employee": sorted(employee_changes),
		},
	}


@frappe.whitelist(methods=["POST"])
def change_password(old_password: str, new_password: str, logout_other_devices: int = 1):
	"""Change the signed-in user's password.

	Delegates to Frappe, which verifies the old password and enforces the
	site's strength policy -- there is no reason to reimplement either.
	"""
	from frappe.core.doctype.user.user import update_password as frappe_update_password

	if not old_password or not new_password:
		frappe.throw(_("Both the current and the new password are required."))

	frappe_update_password(
		new_password=new_password,
		old_password=old_password,
		logout_all_sessions=cint(logout_other_devices),
	)

	return {"changed": True}
