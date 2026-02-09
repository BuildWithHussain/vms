import frappe


def after_install():
	create_roles()


def create_roles():
	for role_name in ("Video Creator", "Video Editor"):
		if not frappe.db.exists("Role", role_name):
			frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 0,
				}
			).insert(ignore_permissions=True)

	frappe.db.commit()
