import frappe


def execute():
	"""Ensure existing rows have proper NULL (not 0000-00-00) for deleted_at fields.

	When Datetime columns are added during migration, some databases may set
	existing rows to '0000-00-00 00:00:00' instead of NULL. This caused the
	purge_expired_trash scheduler to treat every asset as expired trash.
	"""
	for doctype, table in [
		("VMS Asset", "tabVMS Asset"),
		("VMS Folder", "tabVMS Folder"),
		("VMS Review Comment", "tabVMS Review Comment"),
	]:
		if not frappe.db.has_column(doctype, "deleted_at"):
			continue

		frappe.db.sql(
			f"""
			UPDATE `{table}`
			SET `deleted_at` = NULL
			WHERE `deleted_at` IS NOT NULL
			  AND (`deleted_at` = '0000-00-00 00:00:00' OR `deleted_at` < '2000-01-01 00:00:00')
			"""
		)

	frappe.db.commit()
