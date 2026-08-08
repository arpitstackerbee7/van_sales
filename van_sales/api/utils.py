"""Shared helpers for the mobile API.

Everything the app posts arrives with a ``client_uid``: a UUID the device
generates *before* the document enters its offline queue. It is the only
thing that makes a retry safe. The queue cannot know whether a request that
timed out was actually applied, so it retries; ``idempotent_create`` turns
that retry into a lookup instead of a second document.
"""

import json
from collections.abc import Callable

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

# Fields written by apply_provenance, in one place so the custom fields and
# the writer cannot drift apart.
PROVENANCE_FIELDS = (
	"van_client_uid",
	"van_source",
	"van_latitude",
	"van_longitude",
	"van_posted_at",
)


def parse_payload(payload) -> dict:
	"""Accept either a real dict or the JSON string a form-encoded post sends."""
	if payload is None:
		return {}

	if isinstance(payload, str):
		try:
			payload = json.loads(payload)
		except (ValueError, TypeError):
			frappe.throw(_("Malformed request payload."), title=_("Bad Request"))

	if not isinstance(payload, dict):
		frappe.throw(_("Request payload must be an object."), title=_("Bad Request"))

	return payload


def require_any_role(*roles: str) -> None:
	"""Gate an endpoint on app roles.

	This guards the endpoint only. Document-level access is still enforced by
	Frappe's own permission layer when the document is saved, so a user who
	slips past this check still cannot write anything they lack rights to.
	"""
	if "Administrator" in frappe.get_roles():
		return

	if not set(roles) & set(frappe.get_roles()):
		frappe.throw(
			_("Your roles do not allow this action."),
			frappe.PermissionError,
			title=_("Not Permitted"),
		)


def apply_provenance(doc, payload: dict) -> None:
	"""Stamp where and when the device created this document."""
	doc.van_client_uid = payload.get("client_uid")
	doc.van_source = payload.get("source") or "Van Sales App"

	geo = payload.get("geo") or {}
	if geo:
		doc.van_latitude = flt(geo.get("latitude"))
		doc.van_longitude = flt(geo.get("longitude"))

	# The device clock is the truth for *when the sale happened*; the server
	# clock is the truth for when it synced. Keep both.
	doc.van_posted_at = payload.get("captured_at") or now_datetime()


def find_by_client_uid(doctype: str, client_uid: str) -> dict | None:
	"""Return a summary of an already-posted document, or None."""
	if not client_uid:
		return None

	existing = frappe.db.get_value(
		doctype,
		{"van_client_uid": client_uid},
		["name", "docstatus"],
		as_dict=True,
	)
	if not existing:
		return None

	return {
		"name": existing.name,
		"docstatus": cint(existing.docstatus),
		"doctype": doctype,
		"duplicate": True,
	}


def idempotent_create(doctype: str, payload: dict, build: Callable[[], dict]) -> dict:
	"""Run ``build`` unless this client_uid has already produced a document.

	The pre-check handles the common case cheaply. The unique key on
	``van_client_uid`` handles the race where two retries arrive together --
	one wins, the other lands here and reads back the winner's document.
	"""
	client_uid = payload.get("client_uid")
	if not client_uid:
		frappe.throw(_("client_uid is required so a retry cannot post twice."))

	if existing := find_by_client_uid(doctype, client_uid):
		return existing

	try:
		return build()
	except frappe.DuplicateEntryError:
		frappe.db.rollback()
		if existing := find_by_client_uid(doctype, client_uid):
			return existing
		raise


def get_settings():
	return frappe.get_cached_doc("Van Sales Settings")


def setting(fieldname: str, default=None):
	"""Read one Van Sales Setting, tolerating a field the cache has not seen.

	A settings read must never be the thing that breaks sign-in. Right after
	an upgrade the cached Single can predate a newly added field, so fall
	back to the documented default rather than raising.
	"""
	value = get_settings().get(fieldname)
	return default if value is None else value


def default_company() -> str:
	"""The company every read on this request should be scoped to.

	The van's own company wins over the user's default. On a site with more
	than one company those differ often enough, and getting it wrong is not
	a cosmetic error: outstanding balances and credit limits are stored per
	company, so the rep would be shown a customer with nothing owing and no
	limit while the invoice posts against a different set of books.
	"""
	from van_sales.van_sales.doctype.van_sales_profile.van_sales_profile import (
		get_profile_for_user,
	)

	if profile := get_profile_for_user():
		if company := frappe.db.get_value("Van Sales Profile", profile, "company"):
			return company

	company = frappe.defaults.get_user_default("Company")
	if not company:
		company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		frappe.throw(_("No default company is set for your user."))
	return company
