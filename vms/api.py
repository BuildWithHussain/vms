import json

import frappe
import requests
from frappe import _

from vms.r2 import (
	abort_multipart_upload,
	complete_multipart_upload,
	configure_bucket_cors,
	create_multipart_upload,
	delete_r2_object,
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
	if not frappe.db.exists("VMS Asset", asset_name):
		return {"status": "ok"}

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status == "Uploading":
		asset.delete(ignore_permissions=True)
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
		max_gb = round(max_size / (1024**3), 1)
		frappe.throw(_("File size exceeds the maximum allowed size of {0} GB").format(max_gb))

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
	if not frappe.db.exists("VMS Asset", asset_name):
		return {"status": "ok"}

	asset = frappe.get_doc("VMS Asset", asset_name)
	if asset.status == "Uploading":
		try:
			abort_multipart_upload(asset.r2_key, upload_id)
		except Exception:
			frappe.logger("vms").warning(f"Failed to abort multipart upload for {asset_name}")
		asset.delete(ignore_permissions=True)

	return {"status": "ok"}


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

	# Check for duplicate folder name in the same project
	existing = frappe.db.exists("VMS Folder", {"folder_name": folder_name, "project": project})
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

	# Check for duplicate name in same project
	existing = frappe.db.exists(
		"VMS Folder", {"folder_name": new_name, "project": folder.project, "name": ["!=", folder.name]}
	)
	if existing:
		frappe.throw(_("A folder named '{0}' already exists in this project").format(new_name))

	folder.folder_name = new_name
	folder.save(ignore_permissions=True)

	return {"name": folder.name, "folder_name": folder.folder_name}


@frappe.whitelist()
def delete_folder(folder_name: str):
	"""Delete a folder and move its assets back to the project root."""
	folder = frappe.get_doc("VMS Folder", folder_name)

	# Move all assets in this folder back to project root (folder = None)
	frappe.db.set_value(
		"VMS Asset",
		{"folder": folder_name},
		"folder",
		None,
		update_modified=False,
	)

	folder.delete(ignore_permissions=True)
	return {"status": "ok"}


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
		like_filters = {"file_name": ["like", f"%{query}%"], "status": ["!=", "Uploading"]}
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
	return {"setup_complete": bool(settings.setup_complete)}


@frappe.whitelist()
def complete_setup():
	"""Mark VMS setup as complete."""
	settings = frappe.get_single("VMS Settings")
	settings.setup_complete = 1
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}
