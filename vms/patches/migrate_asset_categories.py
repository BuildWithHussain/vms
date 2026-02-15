import frappe


def execute():
	"""Migrate old VMS Asset category values to new ones.

	Old: Source, Cut, Review, Final
	New: Footage, For Review, Deliverable

	Mapping:
	  Source, Cut → Footage
	  Review      → For Review
	  Final       → Deliverable
	"""
	frappe.db.sql(
		"""
		UPDATE `tabVMS Asset`
		SET category = CASE
			WHEN category IN ('Source', 'Cut') THEN 'Footage'
			WHEN category = 'Review' THEN 'For Review'
			WHEN category = 'Final' THEN 'Deliverable'
			ELSE category
		END
		WHERE category IN ('Source', 'Cut', 'Review', 'Final')
		"""
	)
