import frappe


def get_project_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Editor" in frappe.get_roles(user):
		return ""

	# Video Creators can only see their own projects
	return f"`tabVMS Project`.owner_user = {frappe.db.escape(user)}"


def get_asset_permission_query_conditions(user):
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	if "Video Editor" in frappe.get_roles(user):
		return ""

	# Video Creators can only see assets in their own projects
	return (
		f"`tabVMS Asset`.project IN "
		f"(SELECT name FROM `tabVMS Project` WHERE owner_user = {frappe.db.escape(user)})"
	)
