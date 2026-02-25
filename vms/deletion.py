"""Centralized deletion controller for VMS.

Every delete/restore/purge operation goes through this module. API endpoints
in api.py and review_api.py are thin wrappers that delegate here.
"""

import frappe
from frappe import _
from frappe.utils import add_days, now_datetime

from vms.r2 import delete_r2_object

# ── Audit Logging ────────────────────────────────────────────────────────────


def _create_audit_log(
	action: str,
	asset_name: str | None = None,
	file_name: str | None = None,
	file_type: str | None = None,
	project: str | None = None,
	file_size: int | None = None,
	target_doctype: str | None = None,
):
	"""Create an audit log entry. Never raises — failures are logged silently."""
	try:
		doc = frappe.get_doc(
			{
				"doctype": "VMS Audit Log",
				"action": action,
				"asset_name": asset_name,
				"user": frappe.session.user,
				"timestamp": now_datetime(),
				"file_name": file_name,
				"file_type": file_type,
				"project": project,
				"file_size": file_size,
				"target_doctype": target_doctype,
			}
		)
		doc.insert(ignore_permissions=True)
	except Exception:
		frappe.logger("vms").warning(f"Failed to create audit log for {action} on {asset_name}")


# ── Filter Helpers ───────────────────────────────────────────────────────────


def _expired_trash_filters(cutoff):
	"""Canonical filter for expired trash — always uses both guards."""
	return [["deleted_at", "is", "set"], ["deleted_at", "<=", cutoff]]


# ── Asset Deletion ───────────────────────────────────────────────────────────


def soft_delete_asset(asset_name: str):
	"""Soft-delete an asset: set deleted_at/deleted_by, cascade to comments."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	# Idempotent — don't overwrite original deleted_at
	if asset.deleted_at:
		return

	asset.deleted_at = now_datetime()
	asset.deleted_by = frappe.session.user
	asset.save(ignore_permissions=True)

	# Cascade soft-delete linked comments
	comments = frappe.get_all(
		"VMS Review Comment",
		filters={"asset": asset_name, "deleted_at": ["is", "not set"]},
		pluck="name",
	)
	for comment_name in comments:
		_cascade_soft_delete_comment(comment_name, via=f"asset:{asset_name}")

	_create_audit_log(
		action="Delete",
		asset_name=asset_name,
		file_name=asset.file_name,
		file_type=asset.file_type,
		project=asset.project,
		file_size=asset.file_size,
		target_doctype="VMS Asset",
	)


def hard_delete_asset(asset_name: str):
	"""Permanently delete an asset: doc, comments, thumbnails, R2 objects."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.deleted_at:
		frappe.throw(_("Asset is not in trash. Use delete to move it to trash first."))

	r2_key = asset.r2_key
	proxy_r2_key = asset.proxy_r2_key if hasattr(asset, "proxy_r2_key") else None

	audit_data = {
		"file_name": asset.file_name,
		"file_type": asset.file_type,
		"project": asset.project,
		"file_size": asset.file_size,
	}

	# Hard-delete all linked comments (including already soft-deleted)
	comments = frappe.get_all(
		"VMS Review Comment",
		filters={"asset": asset_name},
		pluck="name",
	)
	for comment_name in comments:
		frappe.delete_doc("VMS Review Comment", comment_name, ignore_permissions=True)

	# Delete attached thumbnail File docs
	thumbnail_files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": "VMS Asset",
			"attached_to_name": asset_name,
		},
		pluck="name",
	)
	for file_name in thumbnail_files:
		frappe.delete_doc("File", file_name, ignore_permissions=True)

	asset.delete(ignore_permissions=True)

	_create_audit_log(
		action="Permanent Delete",
		asset_name=asset_name,
		target_doctype="VMS Asset",
		**audit_data,
	)

	# Clean up R2 objects (non-blocking — errors logged)
	if r2_key:
		try:
			delete_r2_object(r2_key)
		except Exception:
			frappe.logger("vms").warning(f"R2 object {r2_key} not found or already deleted")
	if proxy_r2_key:
		try:
			delete_r2_object(proxy_r2_key)
		except Exception:
			frappe.logger("vms").warning(f"R2 proxy object {proxy_r2_key} not found or already deleted")


def restore_asset(asset_name: str):
	"""Restore an asset from trash, including cascade-deleted comments."""
	asset = frappe.get_doc("VMS Asset", asset_name)
	if not asset.deleted_at:
		frappe.throw(_("Asset is not in trash"))

	asset.deleted_at = None
	asset.deleted_by = None
	asset.save(ignore_permissions=True)

	# Restore only comments that were cascade-deleted via this asset
	cascade_comments = frappe.get_all(
		"VMS Review Comment",
		filters={
			"asset": asset_name,
			"deleted_via": f"asset:{asset_name}",
		},
		pluck="name",
	)
	for comment_name in cascade_comments:
		frappe.db.set_value(
			"VMS Review Comment",
			comment_name,
			{"deleted_at": None, "deleted_by": None, "deleted_via": None},
			update_modified=False,
		)

	_create_audit_log(
		action="Restore",
		asset_name=asset_name,
		file_name=asset.file_name,
		file_type=asset.file_type,
		project=asset.project,
		file_size=asset.file_size,
		target_doctype="VMS Asset",
	)


# ── Folder Deletion ─────────────────────────────────────────────────────────


def soft_delete_folder(folder_name: str):
	"""Soft-delete a folder. Assets stay in folder (not moved)."""
	folder = frappe.get_doc("VMS Folder", folder_name)

	if folder.deleted_at:
		return

	folder.deleted_at = now_datetime()
	folder.deleted_by = frappe.session.user
	folder.save(ignore_permissions=True)

	_create_audit_log(
		action="Delete",
		asset_name=folder_name,
		file_name=folder.folder_name,
		project=folder.project,
		target_doctype="VMS Folder",
	)


def hard_delete_folder(folder_name: str):
	"""Permanently delete a trashed folder. Clears folder ref on assets."""
	folder = frappe.get_doc("VMS Folder", folder_name)

	if not folder.deleted_at:
		frappe.throw(_("Folder is not in trash. Use delete to move it to trash first."))

	# Clear folder reference on assets
	frappe.db.set_value(
		"VMS Asset",
		{"folder": folder_name},
		"folder",
		None,
		update_modified=False,
	)

	audit_data = {
		"file_name": folder.folder_name,
		"project": folder.project,
	}

	folder.delete(ignore_permissions=True)

	_create_audit_log(
		action="Permanent Delete",
		asset_name=folder_name,
		target_doctype="VMS Folder",
		**audit_data,
	)


def restore_folder(folder_name: str):
	"""Restore a folder from trash."""
	folder = frappe.get_doc("VMS Folder", folder_name)
	if not folder.deleted_at:
		frappe.throw(_("Folder is not in trash"))

	folder.deleted_at = None
	folder.deleted_by = None
	folder.save(ignore_permissions=True)

	_create_audit_log(
		action="Restore",
		asset_name=folder_name,
		file_name=folder.folder_name,
		project=folder.project,
		target_doctype="VMS Folder",
	)


# ── Comment Deletion ─────────────────────────────────────────────────────────


def soft_delete_comment(comment_name: str):
	"""Soft-delete a comment and cascade to its replies."""
	if not frappe.db.exists("VMS Review Comment", comment_name):
		frappe.throw(_("Comment {0} does not exist").format(comment_name))

	comment = frappe.get_doc("VMS Review Comment", comment_name)

	if comment.deleted_at:
		return

	comment.deleted_at = now_datetime()
	comment.deleted_by = frappe.session.user
	comment.save(ignore_permissions=True)

	# Cascade to replies
	replies = frappe.get_all(
		"VMS Review Comment",
		filters={"parent_comment": comment_name, "deleted_at": ["is", "not set"]},
		pluck="name",
	)
	for reply_name in replies:
		_cascade_soft_delete_comment(reply_name, via=f"comment:{comment_name}")


def _cascade_soft_delete_comment(comment_name: str, via: str):
	"""Internal: soft-delete a comment as part of a cascade."""
	frappe.db.set_value(
		"VMS Review Comment",
		comment_name,
		{
			"deleted_at": now_datetime(),
			"deleted_by": frappe.session.user,
			"deleted_via": via,
		},
		update_modified=False,
	)


def hard_delete_comment(comment_name: str):
	"""Permanently delete a comment doc (used during asset hard-delete cascade)."""
	frappe.delete_doc("VMS Review Comment", comment_name, ignore_permissions=True)


# ── Bulk Operations ──────────────────────────────────────────────────────────


def empty_all_trash():
	"""Hard-delete all trashed assets and folders."""
	trashed_assets = frappe.get_all(
		"VMS Asset",
		filters={"deleted_at": ["is", "set"]},
		pluck="name",
	)
	for asset_name in trashed_assets:
		try:
			hard_delete_asset(asset_name)
		except Exception:
			frappe.logger("vms").warning(f"Failed to hard-delete asset {asset_name} during empty_trash")

	trashed_folders = frappe.get_all(
		"VMS Folder",
		filters={"deleted_at": ["is", "set"]},
		pluck="name",
	)
	for folder_name in trashed_folders:
		try:
			hard_delete_folder(folder_name)
		except Exception:
			frappe.logger("vms").warning(f"Failed to hard-delete folder {folder_name} during empty_trash")

	return {"asset_count": len(trashed_assets), "folder_count": len(trashed_folders)}


# ── Scheduler Entry Points ───────────────────────────────────────────────────


def purge_expired_trash():
	"""Scheduler: permanently delete trashed items older than retention period.

	Double-guard: requires deleted_at IS SET AND deleted_at <= cutoff.
	Returns early if trash_retention_days == 0 (Never).
	"""
	settings = frappe.get_single("VMS Settings")
	retention_days = int(settings.trash_retention_days or 0)

	if retention_days <= 0:
		return

	cutoff = add_days(now_datetime(), -retention_days)
	filters = _expired_trash_filters(cutoff)

	# Purge expired assets
	expired_assets = frappe.get_all("VMS Asset", filters=filters, pluck="name")
	for asset_name in expired_assets:
		try:
			hard_delete_asset(asset_name)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.logger("vms").warning(f"Failed to purge expired trash asset {asset_name}")

	# Purge expired folders
	expired_folders = frappe.get_all("VMS Folder", filters=filters, pluck="name")
	for folder_name in expired_folders:
		try:
			hard_delete_folder(folder_name)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.logger("vms").warning(f"Failed to purge expired trash folder {folder_name}")


def cleanup_expired_compress_jobs():
	"""Scheduler: delete compress jobs and their R2 output files older than retention period.

	Returns early if tools_retention_days == 0 (Never).
	"""
	settings = frappe.get_single("VMS Settings")
	retention_days = int(settings.tools_retention_days or 0)

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

	for job in expired:
		try:
			if job.original_r2_key:
				delete_r2_object(job.original_r2_key)
			if job.compressed_r2_key:
				delete_r2_object(job.compressed_r2_key)
			frappe.delete_doc("VMS Compress Job", job.name, ignore_permissions=True)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.logger("vms").warning(f"Failed to cleanup compress job {job.name}")


# ── Upload Cleanup ───────────────────────────────────────────────────────────


def cleanup_failed_upload(asset_name: str):
	"""Hard-delete of Uploading-status assets (no data to preserve)."""
	if not frappe.db.exists("VMS Asset", asset_name):
		return

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status == "Uploading":
		asset.delete(ignore_permissions=True)


def cleanup_aborted_multipart(asset_name: str, upload_id: str):
	"""Abort R2 multipart upload and hard-delete the asset doc."""
	from vms.r2 import abort_multipart_upload

	if not frappe.db.exists("VMS Asset", asset_name):
		return

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status == "Uploading":
		try:
			abort_multipart_upload(asset.r2_key, upload_id)
		except Exception:
			frappe.logger("vms").warning(f"Failed to abort multipart upload for {asset_name}")
		asset.delete(ignore_permissions=True)
