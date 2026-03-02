import os
import subprocess
import tempfile
import uuid
from urllib.request import urlretrieve

import frappe
from frappe import _

from vms.r2 import (
	generate_presigned_download_url,
	upload_r2_object,
)


@frappe.whitelist()
def generate_proxy(asset_name: str):
	"""Enqueue proxy generation for a VMS Asset.

	Creates a 720p H.264 MP4 version optimised for browser streaming.
	The original file is kept intact for downloads.
	"""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no uploaded file"))

	if asset.proxy_status == "Processing":
		frappe.throw(_("Proxy is already being generated"))

	if asset.proxy_status == "Ready":
		frappe.throw(_("Proxy already exists"))

	asset.proxy_status = "Processing"
	asset.save(ignore_permissions=True)
	frappe.db.commit()

	_publish_proxy_progress(asset, "Processing")

	frappe.enqueue(
		"vms.proxy.run_proxy_generation",
		asset_name=asset_name,
		queue="long",
		timeout=7200,
		enqueue_after_commit=True,
	)

	return {"status": "Processing"}


@frappe.whitelist(methods=["GET"])
def get_proxy_status(asset_name: str):
	"""Get proxy generation status for an asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	proxy_status, proxy_r2_key = frappe.db.get_value(
		"VMS Asset", asset_name, ["proxy_status", "proxy_r2_key"]
	)

	return {
		"proxy_status": proxy_status or "",
		"has_proxy": bool(proxy_r2_key),
	}


def run_proxy_generation(asset_name: str):
	"""Background job: generate a 720p streaming proxy for a VMS Asset."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	try:
		with tempfile.TemporaryDirectory() as tmpdir:
			# Download source file from R2
			ext = _get_extension(asset.file_name)
			input_path = os.path.join(tmpdir, f"input{ext}")

			frappe.logger("vms").info(f"Proxy: downloading source for {asset_name}")
			download_url = generate_presigned_download_url(asset.r2_key, asset.file_name)
			urlretrieve(download_url, input_path)

			# Generate 720p proxy
			output_path = os.path.join(tmpdir, "proxy.mp4")

			frappe.logger("vms").info(f"Proxy: transcoding {asset_name} to 720p")
			_ffmpeg_proxy(input_path, output_path)

			# Upload proxy to R2
			proxy_size = os.path.getsize(output_path)
			proxy_r2_key = f"proxy/{uuid.uuid4().hex}.mp4"

			frappe.logger("vms").info(f"Proxy: uploading {asset_name} ({proxy_size} bytes)")
			upload_r2_object(proxy_r2_key, output_path, "video/mp4")

		# Update asset record
		asset.reload()
		asset.proxy_status = "Ready"
		asset.proxy_r2_key = proxy_r2_key
		asset.save(ignore_permissions=True)
		frappe.db.commit()

		_publish_proxy_progress(asset, "Ready")
		frappe.logger("vms").info(f"Proxy: complete for {asset_name}")

	except Exception as e:
		frappe.logger("vms").error(f"Proxy generation failed for {asset_name}: {e}")
		asset.reload()
		asset.proxy_status = "Error"
		asset.save(ignore_permissions=True)
		frappe.db.commit()
		_publish_proxy_progress(asset, "Error", str(e)[:500])


def _ffmpeg_proxy(input_path: str, output_path: str):
	"""Transcode video to a 720p H.264 MP4 optimised for streaming."""
	cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		input_path,
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"28",
		"-pix_fmt",
		"yuv420p",
		"-vf",
		"scale='min(1280,iw)':-2",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-movflags",
		"+faststart",
		output_path,
	]

	result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
	if result.returncode != 0:
		raise RuntimeError(f"ffmpeg proxy generation failed: {result.stderr[-500:]}")


def _get_extension(filename: str) -> str:
	if "." in filename:
		return "." + filename.rsplit(".", 1)[1].lower()
	return ".mp4"


def _publish_proxy_progress(asset, status, error_message=None):
	"""Send realtime update about proxy generation."""
	frappe.publish_realtime(
		"proxy_generation_progress",
		{
			"asset_name": asset.name,
			"status": status,
			"error_message": error_message,
		},
		user=asset.uploaded_by or frappe.session.user,
	)
