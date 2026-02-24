import frappe
from frappe.utils import add_days, now_datetime


def purge_expired_trash():
	"""Permanently delete trashed assets older than the configured retention period."""
	settings = frappe.get_single("VMS Settings")
	retention_days = int(settings.trash_retention_days or 7)

	if retention_days <= 0:
		return

	cutoff = add_days(now_datetime(), -retention_days)

	expired = frappe.get_all(
		"VMS Asset",
		filters={"deleted_at": ["<=", cutoff]},
		pluck="name",
	)

	if not expired:
		return

	from vms.api import _hard_delete_asset

	for asset_name in expired:
		try:
			_hard_delete_asset(asset_name)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.logger("vms").warning(f"Failed to purge expired trash asset {asset_name}")
