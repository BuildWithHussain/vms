import frappe


def get_project_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Manager" in frappe.get_roles(user):
		return ""

	return "1=0"


def get_asset_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Manager" in frappe.get_roles(user):
		return ""

	return "1=0"


def get_comment_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Manager" in frappe.get_roles(user):
		return ""

	return "1=0"


def get_audit_log_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Manager" in frappe.get_roles(user):
		return ""

	return "1=0"
