import frappe
import requests
from frappe import _

from vms.r2 import (
	delete_r2_object,
	generate_presigned_download_url,
	generate_presigned_upload_url,
	generate_presigned_view_url,
	get_r2_client,
)


@frappe.whitelist()
def test_r2_connection():
	"""Test R2 credentials by calling head_bucket."""
	settings = frappe.get_single("VMS Settings")
	if not settings.r2_account_id or not settings.r2_access_key_id or not settings.r2_bucket_name:
		frappe.throw(_("R2 credentials are incomplete. Please fill in all required fields."))

	client = get_r2_client()
	client.head_bucket(Bucket=settings.r2_bucket_name)
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
	if not frappe.db.exists("VMS Asset", asset_name):
		return {"status": "ok"}

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status == "Uploading":
		asset.delete(ignore_permissions=True)
	return {"status": "ok"}


@frappe.whitelist()
def get_upload_url(file_name: str, content_type: str, project: str | None = None, category: str = "Source"):
	"""Generate a presigned upload URL for direct upload to R2.

	Returns dict with upload_url, r2_key, and asset_name.
	If project is omitted, the asset goes to the Inbox.
	"""
	settings = frappe.get_single("VMS Settings")

	# Validate file extension
	ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
	allowed = [e.strip().lower() for e in (settings.allowed_extensions or "").split(",") if e.strip()]
	if allowed and ext not in allowed:
		frappe.throw(_("File type '{0}' is not allowed. Allowed types: {1}").format(ext, ", ".join(allowed)))

	# Validate project exists if provided
	if project and not frappe.db.exists("VMS Project", project):
		frappe.throw(_("Project {0} does not exist").format(project))

	# Validate category
	valid_categories = ("Source", "Cut", "Review", "Final")
	if category not in valid_categories:
		frappe.throw(
			_("Invalid category '{0}'. Must be one of: {1}").format(category, ", ".join(valid_categories))
		)

	# Generate presigned URL
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

	asset = frappe.get_doc(asset_doc)
	asset.insert(ignore_permissions=True)

	return {
		"upload_url": upload_url,
		"r2_key": r2_key,
		"asset_name": asset.name,
	}


@frappe.whitelist()
def confirm_upload(asset_name: str, file_size: int):
	"""Mark an asset as Ready after successful upload to R2."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if asset.status != "Uploading":
		frappe.throw(_("Asset is not in Uploading status"))

	asset.status = "Ready"
	asset.file_size = int(file_size)
	asset.uploaded_at = frappe.utils.now_datetime()
	asset.save(ignore_permissions=True)

	# Enqueue thumbnail generation as background job
	frappe.enqueue(
		"vms.thumbnails.generate_thumbnail",
		asset_name=asset.name,
		queue="default",
		enqueue_after_commit=True,
	)

	return {"status": "ok", "asset_name": asset.name}


def _create_audit_log(
	action: str,
	asset_name: str,
	file_name: str | None = None,
	file_type: str | None = None,
	project: str | None = None,
	file_size: int | None = None,
):
	"""Create an audit log entry. Never raises — failures are logged silently."""
	try:
		doc = frappe.get_doc(
			{
				"doctype": "VMS Audit Log",
				"action": action,
				"asset_name": asset_name,
				"user": frappe.session.user,
				"timestamp": frappe.utils.now_datetime(),
				"file_name": file_name,
				"file_type": file_type,
				"project": project,
				"file_size": file_size,
			}
		)
		doc.insert(ignore_permissions=True)
	except Exception:
		frappe.logger("vms").warning(f"Failed to create audit log for {action} on {asset_name}")


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
	asset.save(ignore_permissions=True)

	return {"status": "ok", "asset_name": asset.name, "project": target_project}


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
	"""Delete an asset and its R2 object(s)."""
	asset = frappe.get_doc("VMS Asset", asset_name)
	r2_key = asset.r2_key

	# Capture metadata before deletion for the audit log
	audit_data = {
		"file_name": asset.file_name,
		"file_type": asset.file_type,
		"project": asset.project,
		"file_size": asset.file_size,
	}

	# Delete linked review comments first (they have a required Link to VMS Asset)
	comments = frappe.get_all(
		"VMS Review Comment",
		filters={"asset": asset_name},
		pluck="name",
	)
	for comment_name in comments:
		frappe.delete_doc("VMS Review Comment", comment_name, ignore_permissions=True)

	# Delete attached thumbnail File doc
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

	# Delete the asset doc before R2 — DB operations are transactional,
	# R2 deletion is not, so we do it last to avoid orphaned docs.
	asset.delete()

	_create_audit_log(
		action="Delete",
		asset_name=asset_name,
		**audit_data,
	)

	# Only delete from R2 after all DB operations succeed.
	# Ignore errors (e.g. key already deleted / doesn't exist) so orphaned docs can still be cleaned up.
	if r2_key:
		try:
			delete_r2_object(r2_key)
		except Exception:
			frappe.logger("vms").warning(f"R2 object {r2_key} not found or already deleted")

	return {"status": "ok"}


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

	return {"status": "ok", "asset_name": asset.name, "old_file_name": old_file_name, "new_file_name": new_file_name}


@frappe.whitelist()
def update_asset_category(asset_name: str, category: str):
	"""Change an asset's category (Source/Cut/Review/Final)."""
	valid_categories = ("Source", "Cut", "Review", "Final")
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

	for log in logs:
		u = user_map.get(log.user, {})
		log["user_full_name"] = u.get("full_name", log.user)
		log["user_image"] = u.get("user_image")

	return {
		"logs": logs,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size),  # ceil division
	}
