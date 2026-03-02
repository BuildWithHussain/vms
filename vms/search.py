from typing import ClassVar

import frappe
from frappe.search.sqlite_search import SQLiteSearch


class VMSSearch(SQLiteSearch):
	INDEX_NAME = "vms_search.db"

	INDEX_SCHEMA: ClassVar[dict] = {
		"text_fields": ["title", "content"],
		"metadata_fields": ["doctype", "name", "project", "category", "file_type"],
		"tokenizer": "unicode61 remove_diacritics 2 tokenchars '-_.'",
	}

	INDEXABLE_DOCTYPES: ClassVar[dict] = {
		"VMS Asset": {
			"fields": [
				"name",
				{"title": "file_name"},
				{"content": "transcription"},
				"modified",
				"project",
				"category",
				"file_type",
			],
			"filters": {"status": ("!=", "Uploading")},
		},
	}

	def get_search_filters(self):
		user = frappe.session.user
		if user == "Administrator":
			return {}

		roles = frappe.get_roles(user)
		if "System Manager" in roles or "Video Manager" in roles:
			return {}

		# No access for users without VMS roles
		return {"project": []}

	def prepare_document(self, doc):
		document = super().prepare_document(doc)
		if not document:
			return None

		# If no transcription, use file_name as content so the doc is still searchable
		if not document.get("content"):
			document["content"] = document.get("title", "")

		return document
