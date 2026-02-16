import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

import frappe

WHISPER_CPP_VERSION = "v1.8.3"
WHISPER_CPP_REPO = "https://github.com/ggerganov/whisper.cpp.git"


def after_install():
	create_roles()
	assign_video_manager_to_system_managers()
	ensure_transcription_dependencies()


def after_migrate():
	assign_video_manager_to_system_managers()
	ensure_transcription_dependencies()


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


def assign_video_manager_to_system_managers():
	"""Ensure all System Managers also have the Video Manager role."""
	system_managers = frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User"},
		fields=["parent"],
		pluck="parent",
	)

	for user_email in system_managers:
		if user_email == "Administrator":
			continue
		if not frappe.db.exists("Has Role", {"parent": user_email, "role": "Video Manager"}):
			user = frappe.get_doc("User", user_email)
			user.append("roles", {"role": "Video Manager"})
			user.save(ignore_permissions=True)

	frappe.db.commit()


def ensure_transcription_dependencies():
	"""Install whisper-cli and ffmpeg if not already present."""
	_ensure_ffmpeg()
	_ensure_whisper_cli()


def _ensure_ffmpeg():
	"""Install ffmpeg if not on PATH."""
	if shutil.which("ffmpeg"):
		return

	system = platform.system()
	frappe.logger().info("ffmpeg not found — attempting to install...")

	try:
		if system == "Darwin" and shutil.which("brew"):
			_run(["brew", "install", "ffmpeg"])
		elif system == "Linux":
			_run(["sudo", "apt-get", "update", "-y"])
			_run(["sudo", "apt-get", "install", "-y", "ffmpeg"])
		else:
			frappe.log_error(
				title="ffmpeg not installed",
				message="Could not auto-install ffmpeg. Please install manually.",
			)
			return

		if shutil.which("ffmpeg"):
			frappe.logger().info("ffmpeg installed successfully")
		else:
			frappe.log_error(
				title="ffmpeg installation failed",
				message="ffmpeg was installed but is not on PATH.",
			)
	except Exception as e:
		frappe.log_error(
			title="ffmpeg installation failed",
			message=f"Auto-install failed: {e}\n\nInstall manually:\n"
			f"  macOS: brew install ffmpeg\n"
			f"  Linux: sudo apt-get install -y ffmpeg",
		)


def _ensure_whisper_cli():
	"""Install whisper-cli if not on PATH."""
	if shutil.which("whisper-cli"):
		return

	system = platform.system()
	frappe.logger().info("whisper-cli not found — attempting to install...")

	try:
		if system == "Darwin" and shutil.which("brew"):
			_run(["brew", "install", "whisper-cpp"])
		elif system == "Linux":
			_build_whisper_from_source()
		else:
			frappe.log_error(
				title="whisper-cli not installed",
				message="Could not auto-install whisper-cli. Please install manually.",
			)
			return

		if shutil.which("whisper-cli"):
			frappe.logger().info("whisper-cli installed successfully")
		else:
			frappe.log_error(
				title="whisper-cli installation failed",
				message="whisper-cli was installed but is not on PATH.",
			)
	except Exception as e:
		frappe.log_error(
			title="whisper-cli installation failed",
			message=f"Auto-install failed: {e}\n\nInstall manually:\n"
			f"  macOS: brew install whisper-cpp\n"
			f"  Linux: see https://github.com/ggerganov/whisper.cpp",
		)


def _build_whisper_from_source():
	"""Build whisper.cpp from source on Linux and install to /usr/local/bin."""
	# Ensure build tools are available
	for tool in ("git", "cmake", "make"):
		if not shutil.which(tool):
			_run(["sudo", "apt-get", "update", "-y"])
			_run(["sudo", "apt-get", "install", "-y", "build-essential", "cmake", "git"])
			break

	with tempfile.TemporaryDirectory() as tmpdir:
		src_dir = Path(tmpdir) / "whisper.cpp"
		build_dir = src_dir / "build"

		_run(
			["git", "clone", "--depth=1", f"--branch={WHISPER_CPP_VERSION}", WHISPER_CPP_REPO, str(src_dir)]
		)
		build_dir.mkdir(exist_ok=True)
		_run(["cmake", "-B", str(build_dir), "-S", str(src_dir)])
		_run(["cmake", "--build", str(build_dir), "--config", "Release", "-j"])

		# Install the binary
		binary = build_dir / "bin" / "whisper-cli"
		if not binary.exists():
			# Older build layout
			binary = build_dir / "whisper-cli"
		if binary.exists():
			_run(["sudo", "install", "-m", "0755", str(binary), "/usr/local/bin/whisper-cli"])
		else:
			raise FileNotFoundError(
				f"whisper-cli binary not found in build output at {build_dir}"
			)


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
	"""Run a command, raising on failure."""
	frappe.logger().info(f"Running: {' '.join(cmd)}")
	result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, **kwargs)
	if result.returncode != 0:
		raise RuntimeError(
			f"Command failed ({result.returncode}): {' '.join(cmd)}\n"
			f"stdout: {result.stdout[-500:] if result.stdout else ''}\n"
			f"stderr: {result.stderr[-500:] if result.stderr else ''}"
		)
	return result
