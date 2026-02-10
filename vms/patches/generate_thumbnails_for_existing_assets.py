import frappe

from vms.thumbnails import generate_thumbnail


def execute():
	assets = frappe.get_all(
		"VMS Asset",
		filters={"status": "Ready", "thumbnail_url": ("in", ("", None))},
		pluck="name",
	)

	for asset_name in assets:
		try:
			generate_thumbnail(asset_name)
		except Exception:
			frappe.log_error(f"Thumbnail generation failed for {asset_name}")
