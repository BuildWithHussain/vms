import frappe
from frappe.model.document import Document


class VMSAsset(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		duration_seconds: DF.Float
		file_name: DF.Data
		file_size: DF.Int
		file_type: DF.Data | None
		naming_series: DF.Literal["VMS-ASSET-.#####"]
		project: DF.Link | None
		r2_key: DF.Data | None
		status: DF.Literal["Uploading", "Ready", "Processing", "Error"]
		thumbnail_url: DF.Data | None
		uploaded_at: DF.Datetime | None
		uploaded_by: DF.Link | None
	# end: auto-generated types

	pass
