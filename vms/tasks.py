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


def cleanup_expired_compress_jobs():
	"""Delete compress jobs and their R2 output files older than the configured retention period."""
	settings = frappe.get_single("VMS Settings")
	retention_days = int(settings.tools_retention_days or 7)

	if retention_days <= 0:
		return

	cutoff = add_days(now_datetime(), -retention_days)

	expired = frappe.get_all(
		"VMS Compress Job",
		filters={"creation": ["<=", cutoff]},
		fields=["name", "original_r2_key", "compressed_r2_key"],
	)

	if not expired:
		return

	from vms.r2 import delete_r2_object

	for job in expired:
		try:
			# Delete R2 objects
			if job.original_r2_key:
				delete_r2_object(job.original_r2_key)
			if job.compressed_r2_key:
				delete_r2_object(job.compressed_r2_key)
			# Delete the job record
			frappe.delete_doc("VMS Compress Job", job.name, ignore_permissions=True)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.logger("vms").warning(f"Failed to cleanup compress job {job.name}")
