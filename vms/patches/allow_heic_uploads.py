import frappe


def execute():
	settings = frappe.get_single("VMS Settings")
	current = settings.allowed_extensions or ""
	exts = [e.strip().lower() for e in current.split(",") if e.strip()]

	added = [e for e in ("heic", "heif") if e not in exts]
	if not added:
		return

	insert_at = exts.index("arw") if "arw" in exts else len(exts)
	exts[insert_at:insert_at] = added
	settings.allowed_extensions = ",".join(exts)
	settings.save(ignore_permissions=True)
	frappe.db.commit()
