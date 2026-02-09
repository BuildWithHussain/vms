import frappe
from frappe import _

from vms.r2 import generate_presigned_upload_url, generate_presigned_view_url


@frappe.whitelist()
def get_upload_url(file_name: str, content_type: str, project: str):
	"""Generate a presigned upload URL for direct upload to R2.

	Returns dict with upload_url, r2_key, and asset_name.
	"""
	settings = frappe.get_single("VMS Settings")

	# Validate file extension
	ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
	allowed = [e.strip().lower() for e in (settings.allowed_extensions or "").split(",") if e.strip()]
	if allowed and ext not in allowed:
		frappe.throw(_("File type '{0}' is not allowed. Allowed types: {1}").format(ext, ", ".join(allowed)))

	# Validate project exists
	if not frappe.db.exists("VMS Project", project):
		frappe.throw(_("Project {0} does not exist").format(project))

	# Generate presigned URL
	upload_url, r2_key = generate_presigned_upload_url(file_name, content_type, project)

	# Create asset record in Uploading status
	asset = frappe.get_doc(
		{
			"doctype": "VMS Asset",
			"project": project,
			"file_name": file_name,
			"r2_key": r2_key,
			"file_type": content_type,
			"status": "Uploading",
			"uploaded_by": frappe.session.user,
		}
	)
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

	return {"status": "ok", "asset_name": asset.name}


@frappe.whitelist()
def get_view_url(asset_name: str):
	"""Get a presigned view URL for streaming an asset."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_view_url(asset.r2_key)

	return {"url": url}
