import frappe


def seed_test_settings():
	"""Configure VMS Settings for MinIO in CI/test environments.

	Usage:
	    bench --site <site> execute vms.seed.seed_test_settings
	"""
	settings = frappe.get_doc("VMS Settings")
	settings.r2_account_id = "test"
	settings.r2_access_key_id = "minioadmin"
	settings.r2_bucket_name = "vms-media"
	settings.r2_secret_access_key = "minioadmin"
	settings.setup_complete = 1
	settings.save(ignore_permissions=True)
