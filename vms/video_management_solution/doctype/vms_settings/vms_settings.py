import frappe
from frappe.model.document import Document


class VMSSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allowed_extensions: DF.SmallText | None
		max_file_size: DF.Int
		presigned_url_expiry: DF.Int
		r2_access_key_id: DF.Data | None
		r2_account_id: DF.Data | None
		r2_bucket_name: DF.Data | None
		r2_public_url: DF.Data | None
		r2_secret_access_key: DF.Password | None
	# end: auto-generated types

	pass
