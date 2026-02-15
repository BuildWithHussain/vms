import frappe


def execute():
	"""Rename 'Asset' category to 'Footage' on VMS Asset."""
	frappe.db.sql(
		"""
		UPDATE `tabVMS Asset`
		SET category = 'Footage'
		WHERE category = 'Asset'
		"""
	)
