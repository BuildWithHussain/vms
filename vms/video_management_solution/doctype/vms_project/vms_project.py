import frappe
from frappe.model.document import Document


class VMSProject(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		description: DF.TextEditor | None
		due_date: DF.Date | None
		naming_series: DF.Literal["VMS-PROJ-.#####"]
		owner_user: DF.Link | None
		project_name: DF.Data
		status: DF.Literal["Open", "In Progress", "In Review", "Completed", "Archived"]
		thumbnail_url: DF.Data | None
	# end: auto-generated types

	pass
