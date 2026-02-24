import frappe

from vms.thumbnails import IMAGE_MIME_PREFIXES, generate_thumbnail


def execute():
	"""Regenerate image thumbnails to apply EXIF orientation fix."""
	filters = [
		["status", "=", "Ready"],
		["thumbnail_url", "is", "set"],
		["file_type", "like", "image/%"],
	]
	assets = frappe.get_all("VMS Asset", filters=filters, fields=["name", "thumbnail_url"])

	for asset in assets:
		try:
			old_files = frappe.get_all(
				"File",
				filters={
					"attached_to_doctype": "VMS Asset",
					"attached_to_name": asset.name,
					"file_url": asset.thumbnail_url,
				},
				pluck="name",
			)
			for file_name in old_files:
				frappe.delete_doc("File", file_name, ignore_permissions=True)

			frappe.db.set_value("VMS Asset", asset.name, "thumbnail_url", "")
			frappe.db.commit()

			generate_thumbnail(asset.name)

		except Exception:
			frappe.log_error(f"EXIF thumbnail regeneration failed for {asset.name}")
