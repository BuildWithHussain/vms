import shutil

import frappe


def after_install():
	create_roles()
	check_whisper_installation()


def after_migrate():
	check_whisper_installation()


def create_roles():
	for role_name in ("Video Manager",):
		if not frappe.db.exists("Role", role_name):
			frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 0,
				}
			).insert(ignore_permissions=True)

	frappe.db.commit()


def check_whisper_installation():
	"""Log a warning if whisper-cli is not found on the system PATH."""
	if not shutil.which("whisper-cli"):
		frappe.log_error(
			title="whisper-cli not installed",
			message=(
				"whisper-cli is not found on the system PATH. "
				"Transcription will not work until it is installed.\n\n"
				"Install with: brew install whisper-cpp"
			),
		)
	if not shutil.which("ffmpeg"):
		frappe.log_error(
			title="ffmpeg not installed",
			message=(
				"ffmpeg is not found on the system PATH. "
				"Audio extraction for transcription will not work.\n\n"
				"Install with: brew install ffmpeg"
			),
		)
