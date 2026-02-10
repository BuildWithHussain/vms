import frappe
from frappe.model.document import Document


class VMSReviewComment(Document):
	def before_insert(self):
		if not self.commented_by:
			self.commented_by = frappe.session.user
