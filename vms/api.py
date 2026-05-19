import json
import uuid

import frappe
import requests
from frappe import _

from vms.r2 import (
	complete_multipart_upload,
	configure_bucket_cors,
	create_multipart_upload,
	generate_presigned_download_url,
	generate_presigned_part_url,
	generate_presigned_upload_url,
	generate_presigned_view_url,
	get_r2_client,
)


@frappe.whitelist()
def test_r2_connection():
	"""Test R2 credentials by calling head_bucket, then configure CORS."""
	settings = frappe.get_single("VMS Settings")
	if not settings.r2_account_id or not settings.r2_access_key_id or not settings.r2_bucket_name:
		frappe.throw(_("R2 credentials are incomplete. Please fill in all required fields."))

	client = get_r2_client()
	client.head_bucket(Bucket=settings.r2_bucket_name)

	# Auto-configure CORS so browsers can read ETag headers (required for multipart uploads)
	try:
		configure_bucket_cors()
	except Exception:
		frappe.logger("vms").warning("Failed to configure CORS on R2 bucket — multipart uploads may not work")

	return {"status": "ok"}


@frappe.whitelist()
def get_bucket_usage():
	"""Get R2 bucket storage usage via the Cloudflare API."""
	settings = frappe.get_single("VMS Settings")
	api_token = settings.get_password("cloudflare_api_token")
	if not api_token:
		frappe.throw(_("Cloudflare API Token is not configured in VMS Settings."))

	resp = requests.get(
		f"https://api.cloudflare.com/client/v4/accounts/{settings.r2_account_id}/r2/buckets/{settings.r2_bucket_name}/usage",
		headers={"Authorization": f"Bearer {api_token}"},
		timeout=10,
	)
	data = resp.json()
	if not data.get("success"):
		errors = data.get("errors", [])
		msg = errors[0].get("message", "Unknown error") if errors else "Unknown error"
		frappe.throw(_("Cloudflare API error: {0}").format(msg))

	result = data["result"]
	return {
		"payload_size": int(result.get("payloadSize", 0)),
		"object_count": int(result.get("objectCount", 0)),
		"metadata_size": int(result.get("metadataSize", 0)),
	}


@frappe.whitelist()
def fail_upload(asset_name: str):
	"""Mark an asset as Failed and delete the record."""
	from vms.deletion import cleanup_failed_upload

	cleanup_failed_upload(asset_name)
	return {"status": "ok"}


# 2 GB threshold — files larger than this use multipart upload
MULTIPART_THRESHOLD = 2 * 1024 * 1024 * 1024
# 512 MB per part (R2/S3 minimum is 5 MB, max 5 GB per part)
MULTIPART_PART_SIZE = 512 * 1024 * 1024


@frappe.whitelist()
def get_upload_url(
	file_name: str,
	content_type: str,
	file_size: int = 0,
	project: str | None = None,
	category: str = "Footage",
	folder: str | None = None,
):
	"""Generate a presigned upload URL for direct upload to R2.

	For files > 2 GB, initiates a multipart upload instead.
	Returns dict with upload_url (or upload_id for multipart), r2_key, and asset_name.
	If project is omitted, the asset goes to the Inbox.
	"""
	settings = frappe.get_single("VMS Settings")
	file_size = int(file_size or 0)

	# Validate file size against settings
	max_size = int(settings.max_file_size or 0)
	if max_size and file_size and file_size > max_size:
		max_mb = max_size / (1024**2)
		if max_mb >= 1024 and max_mb % 1024 == 0:
			size_label = f"{int(max_mb / 1024)} GB"
		elif max_mb >= 1024:
			size_label = f"{round(max_mb / 1024, 1)} GB"
		else:
			size_label = f"{int(max_mb)} MB"
		frappe.throw(_("File size exceeds the maximum allowed size of {0}").format(size_label))

	# Validate file extension
	ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
	allowed = [e.strip().lower() for e in (settings.allowed_extensions or "").split(",") if e.strip()]
	if allowed and ext not in allowed:
		frappe.throw(_("File type '{0}' is not allowed. Allowed types: {1}").format(ext, ", ".join(allowed)))

	# Validate project exists if provided
	if project and not frappe.db.exists("VMS Project", project):
		frappe.throw(_("Project {0} does not exist").format(project))

	# Validate category
	valid_categories = ("Footage", "For Review", "Deliverable")
	if category not in valid_categories:
		frappe.throw(
			_("Invalid category '{0}'. Must be one of: {1}").format(category, ", ".join(valid_categories))
		)

	# Validate folder belongs to the project (if provided)
	if folder:
		if not project:
			frappe.throw(_("Cannot specify a folder without a project"))
		folder_doc = frappe.db.get_value("VMS Folder", folder, ["project"], as_dict=True)
		if not folder_doc:
			frappe.throw(_("Folder {0} does not exist").format(folder))
		if folder_doc.project != project:
			frappe.throw(_("Folder does not belong to this project"))

	# Decide: single PUT vs multipart
	use_multipart = file_size > MULTIPART_THRESHOLD

	if use_multipart:
		r2_key, upload_id = create_multipart_upload(file_name, content_type, project)
	else:
		upload_url, r2_key = generate_presigned_upload_url(file_name, content_type, project)

	# Create asset record in Uploading status
	asset_doc = {
		"doctype": "VMS Asset",
		"file_name": file_name,
		"r2_key": r2_key,
		"file_type": content_type,
		"status": "Uploading",
		"category": category,
		"uploaded_by": frappe.session.user,
	}
	if project:
		asset_doc["project"] = project
	if folder:
		asset_doc["folder"] = folder

	asset = frappe.get_doc(asset_doc)
	asset.insert(ignore_permissions=True)

	result = {
		"r2_key": r2_key,
		"asset_name": asset.name,
		"multipart": use_multipart,
	}

	if use_multipart:
		result["upload_id"] = upload_id
		result["part_size"] = MULTIPART_PART_SIZE
	else:
		result["upload_url"] = upload_url

	return result


@frappe.whitelist()
def get_part_upload_url(r2_key: str, upload_id: str, part_number: int):
	"""Get a presigned URL for uploading a single part of a multipart upload."""
	part_number = int(part_number)
	if part_number < 1:
		frappe.throw(_("Part number must be >= 1"))

	url = generate_presigned_part_url(r2_key, upload_id, part_number)
	return {"url": url}


@frappe.whitelist()
def complete_multipart(asset_name: str, upload_id: str, parts: str | list):
	"""Complete a multipart upload by combining all parts."""
	if isinstance(parts, str):
		parts = json.loads(parts)

	if not parts:
		frappe.throw(_("No parts provided for multipart completion"))

	# Sanitize ETags — S3/R2 requires them without surrounding quotes
	for part in parts:
		if isinstance(part.get("ETag"), str):
			part["ETag"] = part["ETag"].strip('"')

	# Sort by part number to ensure correct order
	parts = sorted(parts, key=lambda p: p["PartNumber"])

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status != "Uploading":
		frappe.throw(_("Asset is not in Uploading status"))

	complete_multipart_upload(asset.r2_key, upload_id, parts)

	return {"status": "ok"}


@frappe.whitelist()
def abort_multipart(asset_name: str, upload_id: str):
	"""Abort a multipart upload and clean up."""
	from vms.deletion import cleanup_aborted_multipart

	cleanup_aborted_multipart(asset_name, upload_id)
	return {"status": "ok"}


@frappe.whitelist()
def confirm_upload(asset_name: str, file_size: int, version_of: str | None = None):
	"""Mark an asset as Ready after successful upload to R2.

	If version_of is provided, treats this as a version upload:
	- Saves the target asset's current state as a VMS Asset Version record
	- Copies the uploaded (source) asset's file data onto the target asset
	- Bumps the target's version number
	- Deletes the temporary source asset record
	- Returns the target asset info
	"""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if asset.status != "Uploading":
		frappe.throw(_("Asset is not in Uploading status"))

	asset.status = "Ready"
	asset.file_size = int(file_size)
	asset.uploaded_at = frappe.utils.now_datetime()
	asset.save(ignore_permissions=True)

	if version_of:
		return _apply_version_swap(source_asset=asset, target_name=version_of)

	# Enqueue thumbnail generation as background job
	frappe.enqueue(
		"vms.thumbnails.generate_thumbnail",
		asset_name=asset.name,
		queue="default",
		enqueue_after_commit=True,
	)

	return {"status": "ok", "asset_name": asset.name}


def _apply_version_swap(source_asset, target_name: str) -> dict:
	"""Swap a newly uploaded temp asset's file data onto the target asset.

	1. Save target's current state as a VMS Asset Version
	2. Copy source's file fields onto target
	3. Bump target version, clear thumbnail
	4. Delete the temp source asset record (R2 object stays)
	5. Enqueue thumbnail generation + audit log for target
	"""
	target = frappe.get_doc("VMS Asset", target_name)

	if target.status != "Ready":
		frappe.throw(_("Target asset must be in Ready status"))
	if target.deleted_at:
		frappe.throw(_("Cannot upload a new version of a trashed asset"))

	current_version = target.version or 1

	# Save target's current state as a version record
	frappe.get_doc(
		{
			"doctype": "VMS Asset Version",
			"asset": target.name,
			"version_number": current_version,
			"r2_key": target.r2_key,
			"file_size": target.file_size,
			"file_type": target.file_type,
			"file_name": target.file_name,
			"uploaded_by": target.uploaded_by,
			"uploaded_at": target.uploaded_at,
			"thumbnail_url": target.thumbnail_url,
		}
	).insert(ignore_permissions=True)

	# Capture source asset's file data before deleting the temp record
	new_r2_key = source_asset.r2_key
	new_file_name = source_asset.file_name
	new_file_type = source_asset.file_type
	new_file_size = source_asset.file_size
	new_uploaded_by = source_asset.uploaded_by
	new_uploaded_at = source_asset.uploaded_at

	# Delete the temp source asset first to avoid r2_key uniqueness violation
	frappe.delete_doc("VMS Asset", source_asset.name, ignore_permissions=True, force=True)

	# Copy source asset's file data onto target
	target.r2_key = new_r2_key
	target.file_name = new_file_name
	target.file_type = new_file_type
	target.file_size = new_file_size
	target.uploaded_by = new_uploaded_by
	target.uploaded_at = new_uploaded_at
	target.version = current_version + 1
	target.thumbnail_url = None
	target.save(ignore_permissions=True)

	# Enqueue thumbnail generation for target
	frappe.enqueue(
		"vms.thumbnails.generate_thumbnail",
		asset_name=target.name,
		queue="default",
		enqueue_after_commit=True,
	)

	_create_audit_log(
		action="New Version",
		asset_name=target.name,
		file_name=target.file_name,
		file_type=target.file_type,
		project=target.project,
		file_size=target.file_size,
	)

	return {
		"status": "ok",
		"asset_name": target.name,
		"version_of": target.name,
		"version": target.version,
	}


@frappe.whitelist()
def send_upload_report(files: str):
	"""Send an email report to the uploader after bulk upload completes."""
	file_list = json.loads(files)
	if len(file_list) < 2:
		return {"status": "skipped"}

	total = len(file_list)
	completed = sum(1 for f in file_list if f.get("status") == "done")
	failed = sum(1 for f in file_list if f.get("status") == "error")
	cancelled = sum(1 for f in file_list if f.get("status") == "cancelled")

	user = frappe.session.user
	user_name = frappe.db.get_value("User", user, "full_name") or user
	site_url = frappe.utils.get_url()

	rows = ""
	for f in file_list:
		status_label = f.get("status", "unknown")
		if status_label == "done":
			status_icon = "&#9989;"
		elif status_label == "error":
			status_icon = "&#10060;"
		else:
			status_icon = "&#9888;"
		size_mb = f.get("size", 0) / (1024 * 1024)
		error_note = f" &mdash; {frappe.utils.escape_html(f['error'])}" if f.get("error") else ""
		rows += (
			f'<tr><td style="padding:6px 8px;">{status_icon}</td>'
			f'<td style="padding:6px 8px;">{frappe.utils.escape_html(f["name"])}</td>'
			f'<td style="padding:6px 8px;">{size_mb:.1f} MB</td>'
			f'<td style="padding:6px 8px;">{status_label}{error_note}</td></tr>'
		)

	subject = f"Upload Report: {completed}/{total} files uploaded successfully"
	message = f"""\
<p>Hi {frappe.utils.escape_html(user_name)},</p>
<p>Your bulk upload has completed. Here's a summary:</p>
<table style="border-collapse:collapse;width:100%;">
<tr style="background:#f5f5f5;">
<th style="padding:6px 8px;text-align:left;"></th>
<th style="padding:6px 8px;text-align:left;">File</th>
<th style="padding:6px 8px;text-align:left;">Size</th>
<th style="padding:6px 8px;text-align:left;">Status</th>
</tr>
{rows}
</table>
<p style="margin-top:16px;"><strong>Summary:</strong> {completed} completed\
{f", {failed} failed" if failed else ""}\
{f", {cancelled} cancelled" if cancelled else ""} out of {total} total.</p>
<p><a href="{site_url}/vms">Open VMS</a></p>
"""

	try:
		frappe.sendmail(
			recipients=[user],
			subject=subject,
			message=message,
			now=True,
		)
	except Exception:
		frappe.log_error(title=_("VMS: Failed to send upload report email"))

	return {"status": "ok"}


def _create_audit_log(
	action: str,
	asset_name: str,
	file_name: str | None = None,
	file_type: str | None = None,
	project: str | None = None,
	file_size: int | None = None,
):
	"""Create an audit log entry. Delegates to deletion module."""
	from vms.deletion import _create_audit_log as _audit

	_audit(
		action=action,
		asset_name=asset_name,
		file_name=file_name,
		file_type=file_type,
		project=project,
		file_size=file_size,
	)


@frappe.whitelist()
def get_view_url(asset_name: str):
	"""Get a presigned view URL for streaming an asset."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_view_url(asset.r2_key)

	return {"url": url}


@frappe.whitelist()
def get_download_url(asset_name: str):
	"""Get a presigned download URL for an asset (with Content-Disposition: attachment)."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_download_url(asset.r2_key, asset.file_name)

	_create_audit_log(
		action="Download",
		asset_name=asset.name,
		file_name=asset.file_name,
		file_type=asset.file_type,
		project=asset.project,
		file_size=asset.file_size,
	)

	return {"url": url}


@frappe.whitelist()
def move_asset(asset_name: str, target_project: str):
	"""Move an asset to a different project (or from Inbox to a project)."""
	if not frappe.db.exists("VMS Project", target_project):
		frappe.throw(_("Target project {0} does not exist").format(target_project))

	asset = frappe.get_doc("VMS Asset", asset_name)
	asset.project = target_project
	asset.folder = None  # clear folder when moving to a different project
	asset.save(ignore_permissions=True)

	return {"status": "ok", "asset_name": asset.name, "project": target_project}


@frappe.whitelist()
def create_folder(folder_name: str, project: str):
	"""Create a folder within a project."""
	folder_name = (folder_name or "").strip()
	if not folder_name:
		frappe.throw(_("Folder name cannot be empty"))
	if not frappe.db.exists("VMS Project", project):
		frappe.throw(_("Project {0} does not exist").format(project))

	# Check for duplicate folder name in the same project (exclude trashed)
	existing = frappe.db.exists(
		"VMS Folder", {"folder_name": folder_name, "project": project, "deleted_at": ["is", "not set"]}
	)
	if existing:
		frappe.throw(_("A folder named '{0}' already exists in this project").format(folder_name))

	doc = frappe.get_doc(
		{
			"doctype": "VMS Folder",
			"folder_name": folder_name,
			"project": project,
		}
	)
	doc.insert(ignore_permissions=True)

	return {"name": doc.name, "folder_name": doc.folder_name, "project": doc.project}


@frappe.whitelist()
def rename_folder(folder_name_id: str, new_name: str):
	"""Rename a folder."""
	new_name = (new_name or "").strip()
	if not new_name:
		frappe.throw(_("Folder name cannot be empty"))

	folder = frappe.get_doc("VMS Folder", folder_name_id)

	# Check for duplicate name in same project (exclude trashed)
	existing = frappe.db.exists(
		"VMS Folder",
		{
			"folder_name": new_name,
			"project": folder.project,
			"name": ["!=", folder.name],
			"deleted_at": ["is", "not set"],
		},
	)
	if existing:
		frappe.throw(_("A folder named '{0}' already exists in this project").format(new_name))

	folder.folder_name = new_name
	folder.save(ignore_permissions=True)

	return {"name": folder.name, "folder_name": folder.folder_name}


@frappe.whitelist()
def delete_folder(folder_name: str):
	"""Soft-delete a folder (move to trash)."""
	from vms.deletion import soft_delete_folder

	soft_delete_folder(folder_name)
	return {"status": "ok"}


@frappe.whitelist()
def restore_folder(folder_name: str):
	"""Restore a folder from trash."""
	from vms.deletion import restore_folder as _restore_folder

	_restore_folder(folder_name)
	return {"status": "ok"}


@frappe.whitelist()
def permanently_delete_folder(folder_name: str):
	"""Permanently delete a trashed folder."""
	from vms.deletion import hard_delete_folder

	hard_delete_folder(folder_name)
	return {"status": "ok"}


@frappe.whitelist(methods=["GET"])
def get_trash_folders(page=1, page_size=20):
	"""Get paginated folders in trash (deleted_at is set)."""
	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	filters = {"deleted_at": ["is", "set"]}

	total = frappe.db.count("VMS Folder", filters=filters)

	folders = frappe.get_all(
		"VMS Folder",
		filters=filters,
		fields=[
			"name",
			"folder_name",
			"project",
			"deleted_at",
			"deleted_by",
		],
		order_by="deleted_at desc",
		start=start,
		page_length=page_size,
	)

	# Enrich with user info
	user_emails = list({f.deleted_by for f in folders if f.deleted_by})
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	# Enrich with project names
	project_ids = list({f.project for f in folders if f.project})
	project_map = {}
	if project_ids:
		projects = frappe.get_all(
			"VMS Project",
			filters={"name": ["in", project_ids]},
			fields=["name", "project_name"],
		)
		project_map = {p.name: p.project_name for p in projects}

	for folder in folders:
		d = user_map.get(folder.deleted_by, {})
		folder["deleter_name"] = d.get("full_name", folder.deleted_by)
		folder["project_name"] = project_map.get(folder.project, folder.project)

	return {
		"folders": folders,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size) if total else 0,
	}


@frappe.whitelist()
def move_assets_to_folder(asset_names: str | list, folder: str | None = None):
	"""Move assets into a folder (or back to project root if folder is None)."""
	if isinstance(asset_names, str):
		import json

		asset_names = json.loads(asset_names)

	if folder and not frappe.db.exists("VMS Folder", folder):
		frappe.throw(_("Folder {0} does not exist").format(folder))

	for asset_name in asset_names:
		asset = frappe.get_doc("VMS Asset", asset_name)
		asset.folder = folder
		asset.save(ignore_permissions=True)

	return {"status": "ok", "count": len(asset_names)}


@frappe.whitelist(methods=["GET"])
def get_project_assets(project, folder=None, category=None, page=1, page_size=20):
	"""Get project assets with server-side folder/category filtering and pagination.

	Parameters:
		project: VMS Project ID (required)
		folder: VMS Folder ID. None = root-level assets only. Ignored when category is set.
		category: "For Review" or "Deliverable". Returns matching assets across ALL folders.
		page: Page number (1-indexed, default 1)
		page_size: Items per page (default 20, max 100)
	"""
	if not frappe.db.exists("VMS Project", project):
		frappe.throw(_("Project {0} does not exist").format(project))

	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	filters = {"project": project, "status": ["!=", "Uploading"], "deleted_at": ["is", "not set"]}

	if category:
		filters["category"] = category
	elif folder:
		filters["folder"] = folder
	else:
		filters["folder"] = ["is", "not set"]

	total = frappe.db.count("VMS Asset", filters=filters)

	assets = frappe.get_all(
		"VMS Asset",
		filters=filters,
		fields=[
			"name",
			"file_name",
			"category",
			"status",
			"file_size",
			"file_type",
			"uploaded_by",
			"uploaded_at",
			"creation",
			"thumbnail_url",
			"is_public_review",
			"review_token",
			"folder",
			"_user_tags",
			"card_color",
		],
		order_by="creation desc",
		start=start,
		page_length=page_size,
	)

	# Enrich with uploader info
	user_emails = list({a.uploaded_by for a in assets if a.uploaded_by})
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	for asset in assets:
		u = user_map.get(asset.uploaded_by, {})
		asset["uploader_name"] = u.get("full_name", asset.uploaded_by)
		asset["uploader_image"] = u.get("user_image")
		asset["tags"] = _parse_user_tags(asset.get("_user_tags"))

	return {
		"assets": assets,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size),
	}


def _parse_user_tags(value):
	"""Convert Frappe's comma-delimited `_user_tags` string into a clean list."""
	if not value:
		return []
	return [t for t in (tag.strip() for tag in value.split(",")) if t]


@frappe.whitelist(methods=["GET"])
def get_inbox_assets(page=1, page_size=20):
	"""Get paginated assets that have no project (Uncategorised / Inbox).

	Parameters:
		page: Page number (1-indexed, default 1)
		page_size: Items per page (default 20, max 100)
	"""
	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	filters = {"project": ["is", "not set"], "status": ["!=", "Uploading"], "deleted_at": ["is", "not set"]}

	total = frappe.db.count("VMS Asset", filters=filters)

	assets = frappe.get_all(
		"VMS Asset",
		filters=filters,
		fields=[
			"name",
			"file_name",
			"category",
			"status",
			"file_size",
			"file_type",
			"uploaded_by",
			"uploaded_at",
			"creation",
			"thumbnail_url",
			"_user_tags",
			"card_color",
		],
		order_by="creation desc",
		start=start,
		page_length=page_size,
	)

	# Enrich with uploader info
	user_emails = list({a.uploaded_by for a in assets if a.uploaded_by})
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	for asset in assets:
		u = user_map.get(asset.uploaded_by, {})
		asset["uploader_name"] = u.get("full_name", asset.uploaded_by)
		asset["uploader_image"] = u.get("user_image")
		asset["tags"] = _parse_user_tags(asset.get("_user_tags"))

	return {
		"assets": assets,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size),
	}


@frappe.whitelist()
def add_asset_tag(asset_name: str, tag: str):
	"""Add a user tag to a VMS Asset. Returns the updated tag list."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	tag = (tag or "").strip()
	if not tag:
		frappe.throw(_("Tag cannot be empty"))
	if len(tag) > 50:
		frappe.throw(_("Tag is too long (max 50 chars)"))

	frappe.get_doc("VMS Asset", asset_name).check_permission("write")

	from frappe.desk.doctype.tag.tag import DocTags

	DocTags("VMS Asset").add(asset_name, tag)

	tags_str = frappe.db.get_value("VMS Asset", asset_name, "_user_tags") or ""
	return {"tags": _parse_user_tags(tags_str)}


@frappe.whitelist()
def remove_asset_tag(asset_name: str, tag: str):
	"""Remove a user tag from a VMS Asset. Returns the updated tag list."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	frappe.get_doc("VMS Asset", asset_name).check_permission("write")

	from frappe.desk.doctype.tag.tag import DocTags

	DocTags("VMS Asset").remove(asset_name, tag)

	tags_str = frappe.db.get_value("VMS Asset", asset_name, "_user_tags") or ""
	return {"tags": _parse_user_tags(tags_str)}


# Curated palette for asset card accent colours. Empty string clears the colour.
ALLOWED_CARD_COLORS = {"", "red", "amber", "green", "blue", "purple", "pink"}


@frappe.whitelist()
def set_asset_card_color(asset_name: str, color: str = ""):
	"""Set (or clear) the accent colour for an asset card. Pass empty string to clear."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	color = (color or "").strip().lower()
	if color not in ALLOWED_CARD_COLORS:
		frappe.throw(_("Invalid colour {0}").format(color))

	frappe.get_doc("VMS Asset", asset_name).check_permission("write")

	frappe.db.set_value("VMS Asset", asset_name, "card_color", color)
	return {"card_color": color}


@frappe.whitelist()
def get_vms_users():
	"""Get all users with the Video Manager role."""
	user_names = frappe.get_all(
		"Has Role",
		filters={"role": "Video Manager", "parenttype": "User"},
		pluck="parent",
	)
	if not user_names:
		return []

	users = frappe.get_all(
		"User",
		filters={"name": ["in", user_names], "enabled": 1},
		fields=["name", "email", "full_name", "user_image", "last_active"],
		order_by="full_name asc",
	)
	return users


@frappe.whitelist()
def delete_asset(asset_name: str):
	"""Soft-delete an asset by moving it to trash."""
	from vms.deletion import soft_delete_asset

	soft_delete_asset(asset_name)
	return {"status": "ok"}


@frappe.whitelist(methods=["GET"])
def get_trash_assets(page=1, page_size=20):
	"""Get paginated assets in trash (deleted_at is set)."""
	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	filters = {"deleted_at": ["is", "set"]}

	total = frappe.db.count("VMS Asset", filters=filters)

	assets = frappe.get_all(
		"VMS Asset",
		filters=filters,
		fields=[
			"name",
			"file_name",
			"category",
			"status",
			"file_size",
			"file_type",
			"uploaded_by",
			"uploaded_at",
			"creation",
			"thumbnail_url",
			"project",
			"deleted_at",
			"deleted_by",
		],
		order_by="deleted_at desc",
		start=start,
		page_length=page_size,
	)

	# Enrich with user info (uploader + deleter)
	user_emails = list(
		{a.uploaded_by for a in assets if a.uploaded_by} | {a.deleted_by for a in assets if a.deleted_by}
	)
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	# Enrich with project names
	project_ids = list({a.project for a in assets if a.project})
	project_map = {}
	if project_ids:
		projects = frappe.get_all(
			"VMS Project",
			filters={"name": ["in", project_ids]},
			fields=["name", "project_name"],
		)
		project_map = {p.name: p.project_name for p in projects}

	for asset in assets:
		u = user_map.get(asset.uploaded_by, {})
		asset["uploader_name"] = u.get("full_name", asset.uploaded_by)
		asset["uploader_image"] = u.get("user_image")
		d = user_map.get(asset.deleted_by, {})
		asset["deleter_name"] = d.get("full_name", asset.deleted_by)
		asset["project_name"] = project_map.get(asset.project, asset.project)

	return {
		"assets": assets,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size) if total else 0,
	}


@frappe.whitelist()
def restore_asset(asset_name: str):
	"""Restore an asset from trash."""
	from vms.deletion import restore_asset as _restore

	_restore(asset_name)
	return {"status": "ok"}


@frappe.whitelist()
def permanently_delete_asset(asset_name: str):
	"""Permanently delete a trashed asset (hard delete)."""
	from vms.deletion import hard_delete_asset

	hard_delete_asset(asset_name)
	return {"status": "ok"}


@frappe.whitelist()
def empty_trash():
	"""Permanently delete all assets and folders in trash."""
	from vms.deletion import empty_all_trash

	result = empty_all_trash()
	return {"status": "ok", "count": result["asset_count"] + result["folder_count"]}


@frappe.whitelist()
def rename_asset(asset_name: str, new_file_name: str):
	"""Rename an asset's display file name (metadata only, no R2 changes)."""
	new_file_name = (new_file_name or "").strip()
	if not new_file_name:
		frappe.throw(_("File name cannot be empty"))
	if len(new_file_name) > 255:
		frappe.throw(_("File name must be 255 characters or fewer"))

	asset = frappe.get_doc("VMS Asset", asset_name)
	old_file_name = asset.file_name
	asset.file_name = new_file_name
	asset.save(ignore_permissions=True)

	_create_audit_log(
		action="Rename",
		asset_name=asset.name,
		file_name=new_file_name,
		file_type=asset.file_type,
		project=asset.project,
		file_size=asset.file_size,
	)

	return {
		"status": "ok",
		"asset_name": asset.name,
		"old_file_name": old_file_name,
		"new_file_name": new_file_name,
	}


@frappe.whitelist()
def update_asset_category(asset_name: str, category: str):
	"""Change an asset's category (Footage/For Review/Deliverable)."""
	valid_categories = ("Footage", "For Review", "Deliverable")
	if category not in valid_categories:
		frappe.throw(
			_("Invalid category '{0}'. Must be one of: {1}").format(category, ", ".join(valid_categories))
		)

	asset = frappe.get_doc("VMS Asset", asset_name)
	asset.category = category
	asset.save(ignore_permissions=True)

	return {"status": "ok", "asset_name": asset.name, "category": category}


@frappe.whitelist(methods=["GET"])
def get_audit_logs(
	action: str | None = None,
	user: str | None = None,
	project: str | None = None,
	search: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	page: int = 1,
	page_size: int = 20,
):
	"""Get paginated audit logs with optional filters."""
	filters = {}
	if action:
		filters["action"] = action
	if user:
		filters["user"] = user
	if project:
		filters["project"] = project
	if search:
		filters["file_name"] = ["like", f"%{search}%"]
	if from_date:
		filters["timestamp"] = [">=", from_date]
	if to_date:
		if "timestamp" in filters:
			filters["timestamp"] = ["between", [from_date, to_date + " 23:59:59"]]
		else:
			filters["timestamp"] = ["<=", to_date + " 23:59:59"]

	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	total = frappe.db.count("VMS Audit Log", filters=filters)

	logs = frappe.get_all(
		"VMS Audit Log",
		filters=filters,
		fields=[
			"name",
			"action",
			"asset_name",
			"user",
			"timestamp",
			"file_name",
			"file_type",
			"project",
			"file_size",
		],
		order_by="timestamp desc",
		start=start,
		page_length=page_size,
	)

	# Enrich with user info
	user_emails = list({log.user for log in logs})
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	# Enrich with project titles
	project_ids = list({log.project for log in logs if log.project})
	project_map = {}
	if project_ids:
		projects = frappe.get_all(
			"VMS Project",
			filters={"name": ["in", project_ids]},
			fields=["name", "project_name"],
		)
		project_map = {p.name: p.project_name for p in projects}

	for log in logs:
		u = user_map.get(log.user, {})
		log["user_full_name"] = u.get("full_name", log.user)
		log["user_image"] = u.get("user_image")
		log["project_name"] = project_map.get(log.project, log.project)

	return {
		"logs": logs,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size),  # ceil division
	}


@frappe.whitelist(methods=["GET"])
def get_audit_log_filters():
	"""Get distinct users and projects for audit log filter dropdowns."""
	user_names = frappe.get_all(
		"VMS Audit Log",
		fields=["user"],
		group_by="user",
		order_by="user asc",
		pluck="user",
	)
	user_info = {}
	if user_names:
		user_docs = frappe.get_all(
			"User",
			filters={"name": ["in", user_names]},
			fields=["name", "full_name"],
		)
		user_info = {u.name: u.full_name for u in user_docs}

	project_ids = frappe.get_all(
		"VMS Audit Log",
		fields=["project"],
		filters={"project": ["is", "set"]},
		group_by="project",
		order_by="project asc",
		pluck="project",
	)
	project_info = {}
	if project_ids:
		project_docs = frappe.get_all(
			"VMS Project",
			filters={"name": ["in", project_ids]},
			fields=["name", "project_name"],
		)
		project_info = {p.name: p.project_name for p in project_docs}

	return {
		"users": [{"value": name, "label": user_info.get(name, name)} for name in user_names],
		"projects": [{"value": pid, "label": project_info.get(pid, pid)} for pid in project_ids],
	}


@frappe.whitelist(methods=["GET"])
def search_assets(query: str, project: str | None = None, limit: int = 10):
	"""Search VMS assets using SQLite FTS.

	Falls back to SQL LIKE if the search index is not built yet.
	"""
	query = (query or "").strip()
	if not query:
		return {"results": []}

	limit = min(50, max(1, int(limit)))

	filters = {}
	if project:
		filters["project"] = project

	try:
		from vms.search import VMSSearch

		search_engine = VMSSearch()
		result = search_engine.search(query, filters=filters)

		results = []
		for item in result.get("results", [])[:limit]:
			results.append(
				{
					"name": item.get("name"),
					"file_name": item.get("title"),
					"project": item.get("project"),
					"category": item.get("category"),
					"file_type": item.get("file_type"),
				}
			)
	except Exception:
		# Fallback to SQL LIKE search if index doesn't exist
		like_filters = {
			"file_name": ["like", f"%{query}%"],
			"status": ["!=", "Uploading"],
			"deleted_at": ["is", "not set"],
		}
		if project:
			like_filters["project"] = project

		results = frappe.get_all(
			"VMS Asset",
			filters=like_filters,
			fields=["name", "file_name", "project", "category", "file_type"],
			order_by="modified desc",
			page_length=limit,
		)

	# Enrich with project names
	project_ids = list({r.get("project") or r["project"] for r in results if r.get("project")})
	project_map = {}
	if project_ids:
		project_docs = frappe.get_all(
			"VMS Project",
			filters={"name": ["in", project_ids]},
			fields=["name", "project_name"],
		)
		project_map = {p.name: p.project_name for p in project_docs}

	for r in results:
		r["project_name"] = project_map.get(r.get("project"), r.get("project"))

	return {"results": results}


@frappe.whitelist(methods=["GET"])
def search_projects(query: str, limit: int = 5):
	"""Search VMS projects by name."""
	query = (query or "").strip()
	if not query:
		return {"results": []}

	limit = min(20, max(1, int(limit)))

	results = frappe.get_all(
		"VMS Project",
		filters={"project_name": ["like", f"%{query}%"]},
		fields=["name", "project_name", "status"],
		order_by="modified desc",
		page_length=limit,
	)

	return {"results": results}


@frappe.whitelist(methods=["GET"])
def get_setup_status():
	"""Check if VMS setup wizard has been completed."""
	settings = frappe.get_single("VMS Settings")
	return {
		"setup_complete": bool(settings.setup_complete),
		"is_system_manager": "System Manager" in frappe.get_roles(),
	}


@frappe.whitelist()
def complete_setup():
	"""Mark VMS setup as complete. Only System Managers can do this."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Only System Managers can complete setup", frappe.PermissionError)
	settings = frappe.get_single("VMS Settings")
	settings.setup_complete = 1
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def reset_setup():
	"""Reset VMS setup so the wizard runs again. Only System Managers can do this."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Only System Managers can reset setup", frappe.PermissionError)
	settings = frappe.get_single("VMS Settings")
	settings.setup_complete = 0
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


# ── Asset Format Conversion ──────────────────────────────────────────────────


@frappe.whitelist()
def convert_asset_to_mp4(asset_name: str):
	"""Start converting an asset to MP4 format. Sets status to Processing and enqueues a background job."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if asset.status != "Ready":
		frappe.throw(_("Asset must be in Ready status to convert"))

	if asset.file_type == "video/mp4":
		frappe.throw(_("Asset is already in MP4 format"))

	asset.status = "Processing"
	asset.save(ignore_permissions=True)

	frappe.enqueue(
		"vms.tools.run_asset_conversion",
		asset_name=asset.name,
		queue="long",
		enqueue_after_commit=True,
	)

	return {"status": "ok", "asset_name": asset.name}


# ── Project Sharing ──────────────────────────────────────────────────────────


@frappe.whitelist()
def enable_project_sharing(project: str):
	"""Generate a share token for a project and return the public URL."""
	doc = frappe.get_doc("VMS Project", project)
	if not doc.share_token:
		doc.share_token = uuid.uuid4().hex
		doc.save(ignore_permissions=True)

	site_url = frappe.utils.get_url()
	return {
		"share_token": doc.share_token,
		"share_url": f"{site_url}/vms/shared/{project}?token={doc.share_token}",
	}


@frappe.whitelist()
def disable_project_sharing(project: str):
	"""Remove the share token, revoking all public links."""
	doc = frappe.get_doc("VMS Project", project)
	doc.share_token = None
	doc.save(ignore_permissions=True)
	return {"status": "ok"}


def _validate_project_token(project_name, token):
	"""Validate guest access via project share token.

	Returns True if guest access is valid, False if user is authenticated.
	Raises AuthenticationError if guest access is invalid.
	"""
	if frappe.session.user and frappe.session.user != "Guest":
		return False

	if not token:
		frappe.throw(_("Authentication required"), frappe.AuthenticationError)

	result = frappe.db.get_value(
		"VMS Project",
		project_name,
		["share_token"],
		as_dict=True,
	)

	if not result or not result.share_token or result.share_token != token:
		frappe.throw(_("Invalid or expired share link"), frappe.AuthenticationError)

	return True


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_shared_project(project: str, token: str | None = None):
	"""Get project info for a shared project (guest-accessible)."""
	_validate_project_token(project, token)

	doc = frappe.db.get_value(
		"VMS Project",
		project,
		["name", "project_name", "status", "description", "thumbnail_url"],
		as_dict=True,
	)
	if not doc:
		frappe.throw(_("Project not found"), frappe.DoesNotExistError)

	return doc


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_shared_project_assets(project: str, token: str | None = None, page=1, page_size=20):
	"""Get assets for a shared project (guest-accessible, paginated)."""
	_validate_project_token(project, token)

	# Verify project still has sharing enabled
	share_token = frappe.db.get_value("VMS Project", project, "share_token")
	if not share_token:
		frappe.throw(_("This project is no longer shared"), frappe.AuthenticationError)

	page = max(1, int(page))
	page_size = min(100, max(1, int(page_size)))
	start = (page - 1) * page_size

	filters = {"project": project, "status": ["!=", "Uploading"], "deleted_at": ["is", "not set"]}

	total = frappe.db.count("VMS Asset", filters=filters)

	assets = frappe.get_all(
		"VMS Asset",
		filters=filters,
		fields=[
			"name",
			"file_name",
			"category",
			"file_size",
			"file_type",
			"uploaded_at",
			"creation",
			"thumbnail_url",
		],
		order_by="creation desc",
		start=start,
		page_length=page_size,
	)

	return {
		"assets": assets,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size) if total else 0,
	}


@frappe.whitelist(allow_guest=True)
def get_shared_asset_view_url(asset_name: str, project: str, token: str | None = None):
	"""Get a presigned view URL for an asset in a shared project (guest-accessible)."""
	_validate_project_token(project, token)

	asset = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["r2_key", "project"],
		as_dict=True,
	)

	if not asset or asset.project != project:
		frappe.throw(_("Asset not found in this project"), frappe.DoesNotExistError)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_view_url(asset.r2_key)
	return {"url": url}


# ── Asset Versions ───────────────────────────────────────────────────────────


@frappe.whitelist(methods=["GET"])
def get_asset_versions(asset_name: str):
	"""Get version history for an asset, including the current version."""
	asset = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		[
			"name",
			"version",
			"file_name",
			"file_size",
			"file_type",
			"uploaded_by",
			"uploaded_at",
			"thumbnail_url",
		],
		as_dict=True,
	)
	if not asset:
		frappe.throw(_("Asset not found"), frappe.DoesNotExistError)

	# Get historical versions
	versions = frappe.get_all(
		"VMS Asset Version",
		filters={"asset": asset_name},
		fields=[
			"name",
			"version_number",
			"file_name",
			"file_size",
			"file_type",
			"uploaded_by",
			"uploaded_at",
			"thumbnail_url",
		],
		order_by="version_number desc",
	)

	# Enrich with uploader info
	user_emails = list(
		{v.uploaded_by for v in versions if v.uploaded_by} | {asset.uploaded_by}
		if asset.uploaded_by
		else set()
	)
	user_map = {}
	if user_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", user_emails]},
			fields=["name", "full_name", "user_image"],
		)
		user_map = {u.name: u for u in users}

	for v in versions:
		u = user_map.get(v.uploaded_by, {})
		v["uploader_name"] = u.get("full_name", v.uploaded_by)
		v["uploader_image"] = u.get("user_image")

	# Current version info
	cu = user_map.get(asset.uploaded_by, {})
	current = {
		"version_number": asset.version or 1,
		"file_name": asset.file_name,
		"file_size": asset.file_size,
		"file_type": asset.file_type,
		"uploaded_by": asset.uploaded_by,
		"uploaded_at": asset.uploaded_at,
		"thumbnail_url": asset.thumbnail_url,
		"uploader_name": cu.get("full_name", asset.uploaded_by),
		"uploader_image": cu.get("user_image"),
		"is_current": True,
	}

	return {
		"current": current,
		"versions": versions,
		"total_versions": len(versions) + 1,
	}


@frappe.whitelist()
def get_version_download_url(asset_name: str, version_number: int):
	"""Get a presigned download URL for a specific version of an asset."""
	version_number = int(version_number)

	asset = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["name", "version", "r2_key", "file_name", "file_type", "project", "file_size"],
		as_dict=True,
	)
	if not asset:
		frappe.throw(_("Asset not found"), frappe.DoesNotExistError)

	# Current version — use asset's r2_key directly
	if version_number == (asset.version or 1):
		r2_key = asset.r2_key
		file_name = asset.file_name
		file_size = asset.file_size
		file_type = asset.file_type
	else:
		# Historical version
		ver = frappe.db.get_value(
			"VMS Asset Version",
			{"asset": asset_name, "version_number": version_number},
			["r2_key", "file_name", "file_size", "file_type"],
			as_dict=True,
		)
		if not ver:
			frappe.throw(_("Version not found"), frappe.DoesNotExistError)
		r2_key = ver.r2_key
		file_name = ver.file_name
		file_size = ver.file_size
		file_type = ver.file_type

	if not r2_key:
		frappe.throw(_("Version has no R2 key"))

	url = generate_presigned_download_url(r2_key, file_name)

	_create_audit_log(
		action="Download",
		asset_name=asset.name,
		file_name=file_name,
		file_type=file_type,
		project=asset.project,
		file_size=file_size,
	)

	return {"url": url}


@frappe.whitelist()
def restore_version(asset_name: str, version_number: int):
	"""Restore a historical version as the current version.

	Saves the current asset state as a new VMS Asset Version record,
	then copies the target version's file data back onto the asset.
	"""
	version_number = int(version_number)
	asset = frappe.get_doc("VMS Asset", asset_name)

	if asset.status not in ("Ready", "Error"):
		frappe.throw(_("Asset must be in Ready or Error status to restore a version"))

	if asset.deleted_at:
		frappe.throw(_("Cannot restore a version of a trashed asset"))

	current_version = asset.version or 1
	if version_number == current_version:
		frappe.throw(_("This is already the current version"))

	# Look up the target historical version
	ver = frappe.db.get_value(
		"VMS Asset Version",
		{"asset": asset_name, "version_number": version_number},
		["name", "r2_key", "file_name", "file_size", "file_type", "uploaded_by", "uploaded_at", "thumbnail_url"],
		as_dict=True,
	)
	if not ver:
		frappe.throw(_("Version not found"), frappe.DoesNotExistError)

	# Save current asset state as a version record
	frappe.get_doc(
		{
			"doctype": "VMS Asset Version",
			"asset": asset.name,
			"version_number": current_version,
			"r2_key": asset.r2_key,
			"file_size": asset.file_size,
			"file_type": asset.file_type,
			"file_name": asset.file_name,
			"uploaded_by": asset.uploaded_by,
			"uploaded_at": asset.uploaded_at,
			"thumbnail_url": asset.thumbnail_url,
		}
	).insert(ignore_permissions=True)

	# Apply target version data to the asset
	new_version = current_version + 1
	asset.r2_key = ver.r2_key
	asset.file_name = ver.file_name
	asset.file_size = ver.file_size
	asset.file_type = ver.file_type
	asset.uploaded_by = ver.uploaded_by
	asset.uploaded_at = ver.uploaded_at
	asset.thumbnail_url = ver.thumbnail_url
	asset.version = new_version
	asset.save(ignore_permissions=True)

	# Delete the historical version record (it's now the current version)
	frappe.delete_doc("VMS Asset Version", ver.name, ignore_permissions=True)

	# Enqueue thumbnail regeneration
	frappe.enqueue(
		"vms.thumbnails.generate_thumbnail",
		asset_name=asset.name,
		queue="default",
		enqueue_after_commit=True,
	)

	_create_audit_log(
		action="Version Restored",
		asset_name=asset.name,
		file_name=asset.file_name,
		file_type=asset.file_type,
		project=asset.project,
		file_size=asset.file_size,
	)

	return {"status": "ok", "asset_name": asset.name, "version": new_version}


@frappe.whitelist(allow_guest=True)
def get_shared_asset_download_url(asset_name: str, project: str, token: str | None = None):
	"""Get a presigned download URL for an asset in a shared project (guest-accessible)."""
	_validate_project_token(project, token)

	asset = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["r2_key", "file_name", "project"],
		as_dict=True,
	)

	if not asset or asset.project != project:
		frappe.throw(_("Asset not found in this project"), frappe.DoesNotExistError)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_download_url(asset.r2_key, asset.file_name)
	return {"url": url}
