import frappe

from vms.thumbnails import generate_thumbnail


def execute():
	"""Delete old non-WebP thumbnails and regenerate as WebP."""
	assets = frappe.get_all(
		"VMS Asset",
		filters=[
			["status", "=", "Ready"],
			["thumbnail_url", "is", "set"],
			["thumbnail_url", "not like", "%.webp"],
		],
		fields=["name", "thumbnail_url"],
	)

	for asset in assets:
		try:
			# Delete old thumbnail File doc
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

			# Clear thumbnail_url so generate_thumbnail won't skip
			frappe.db.set_value("VMS Asset", asset.name, "thumbnail_url", "")
			frappe.db.commit()

			# Regenerate as WebP
			generate_thumbnail(asset.name)

		except Exception:
			frappe.log_error(f"WebP thumbnail migration failed for {asset.name}")
