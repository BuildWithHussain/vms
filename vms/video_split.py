import math
import os
import subprocess
import tempfile
from urllib.request import urlretrieve

import frappe
from frappe import _

from vms.r2 import (
	_make_r2_key,
	generate_presigned_download_url,
	get_r2_object_size,
	upload_r2_object,
)


def _get_video_duration(video_path: str) -> float:
	"""Get video duration in seconds using ffprobe."""
	cmd = [
		"ffprobe",
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		video_path,
	]
	result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
	if result.returncode != 0:
		raise RuntimeError(f"ffprobe failed: {result.stderr}")
	return float(result.stdout.strip())


def _split_video(video_path: str, output_dir: str, num_slices: int, base_name: str, ext: str) -> list[str]:
	"""Split video into N equal parts using ffmpeg with stream copy (no re-encode).

	Returns list of output file paths.
	"""
	duration = _get_video_duration(video_path)
	slice_duration = duration / num_slices

	output_paths = []
	for i in range(num_slices):
		start = i * slice_duration
		part_num = i + 1
		output_name = f"{base_name}-part{part_num}{ext}"
		output_path = os.path.join(output_dir, output_name)

		cmd = [
			"ffmpeg",
			"-hide_banner",
			"-y",
			"-ss",
			str(start),
			"-i",
			video_path,
			"-t",
			str(slice_duration),
			"-c",
			"copy",
			"-avoid_negative_ts",
			"make_zero",
			output_path,
		]

		result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
		if result.returncode != 0:
			raise RuntimeError(f"ffmpeg split failed for part {part_num}: {result.stderr}")

		output_paths.append(output_path)

	return output_paths


@frappe.whitelist()
def start_video_split(asset_name: str, num_slices: int = 2):
	"""Enqueue a video split job for the given asset."""
	num_slices = int(num_slices)
	if num_slices < 2 or num_slices > 10:
		frappe.throw(_("Number of slices must be between 2 and 10"))

	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no uploaded file"))

	if asset.status != "Ready":
		frappe.throw(_("Asset must be in Ready status to split"))

	# Mark as Processing
	asset.status = "Processing"
	asset.save(ignore_permissions=True)
	frappe.db.commit()

	job = frappe.enqueue(
		"vms.video_split.process_video_split",
		asset_name=asset_name,
		num_slices=num_slices,
		requested_by=frappe.session.user,
		queue="long",
		enqueue_after_commit=True,
		timeout=14400,  # 4 hours for very large files
	)

	return {
		"status": "ok",
		"job_id": job.id if job else None,
		"message": _("Video split started. You will be notified when complete."),
	}


@frappe.whitelist(methods=["GET"])
def get_split_parts(asset_name: str):
	"""Get all parts that were split from a given asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	parts = frappe.get_all(
		"VMS Asset",
		filters={"split_from": asset_name},
		fields=["name", "file_name", "file_size", "status"],
		order_by="creation asc",
	)
	return parts


@frappe.whitelist(methods=["GET"])
def get_split_status(asset_name: str | None = None):
	"""Check if an asset is currently being split, with progress info."""
	if not asset_name:
		frappe.throw(_("asset_name is required"))
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	status = frappe.db.get_value("VMS Asset", asset_name, "status")
	progress = None
	if status == "Processing":
		progress = frappe.cache.get_value(f"vms_split_progress:{asset_name}")
	return {"status": status, "progress": progress}


def _set_split_progress(asset_name: str, stage: str, current: int = 0, total: int = 0):
	"""Update split progress in cache for polling."""
	frappe.cache.set_value(
		f"vms_split_progress:{asset_name}",
		{"stage": stage, "current": current, "total": total},
		expires_in_sec=14400,  # match job timeout
	)


def process_video_split(asset_name: str, num_slices: int, requested_by: str):
	"""Background job: download video, split into N parts, upload each, create asset docs."""
	asset = frappe.get_doc("VMS Asset", asset_name)
	created_assets = []

	try:
		with tempfile.TemporaryDirectory() as tmpdir:
			# 1. Download from R2
			_set_split_progress(asset_name, "downloading")
			ext = _get_extension(asset.file_name)
			video_path = os.path.join(tmpdir, f"source{ext}")
			download_url = generate_presigned_download_url(asset.r2_key, asset.file_name)
			frappe.logger().info(f"Downloading video for split: {asset_name}")
			urlretrieve(download_url, video_path)

			# 2. Split using ffmpeg (no re-encode)
			_set_split_progress(asset_name, "splitting", 0, num_slices)
			base_name = asset.file_name.rsplit(".", 1)[0] if "." in asset.file_name else asset.file_name
			frappe.logger().info(f"Splitting video into {num_slices} parts: {asset_name}")
			output_paths = _split_video(video_path, tmpdir, num_slices, base_name, ext)

			# 3. Upload each slice and create asset records
			for i, slice_path in enumerate(output_paths):
				part_num = i + 1
				_set_split_progress(asset_name, "uploading", part_num, num_slices)
				slice_file_name = f"{base_name}-part{part_num}{ext}"
				r2_key = _make_r2_key(slice_file_name, asset.project)
				file_size = os.path.getsize(slice_path)

				frappe.logger().info(f"Uploading part {part_num}/{num_slices}: {slice_file_name}")
				upload_r2_object(r2_key, slice_path, content_type=asset.file_type or "video/mp4")

				# Create asset doc
				new_asset = frappe.get_doc(
					{
						"doctype": "VMS Asset",
						"file_name": slice_file_name,
						"r2_key": r2_key,
						"file_type": asset.file_type,
						"status": "Ready",
						"category": asset.category,
						"uploaded_by": requested_by,
						"uploaded_at": frappe.utils.now_datetime(),
						"file_size": file_size,
						"split_from": asset.name,
					}
				)
				if asset.project:
					new_asset.project = asset.project
				if asset.folder:
					new_asset.folder = asset.folder

				new_asset.insert(ignore_permissions=True)
				created_assets.append(new_asset)

				# Generate thumbnail for each slice
				frappe.enqueue(
					"vms.thumbnails.generate_thumbnail",
					asset_name=new_asset.name,
					queue="default",
					enqueue_after_commit=True,
				)

		# 4. Mark original as Ready again
		asset.reload()
		asset.status = "Ready"
		asset.save(ignore_permissions=True)
		frappe.db.commit()

		frappe.logger().info(f"Video split complete: {asset_name} → {len(created_assets)} parts")
		frappe.cache.delete_value(f"vms_split_progress:{asset_name}")

		# 5. Send email notification
		_send_split_complete_email(asset, created_assets, requested_by)

	except Exception as e:
		frappe.logger().error(f"Video split failed for {asset_name}: {e}")

		# Restore original asset status
		asset.reload()
		asset.status = "Ready"
		asset.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.cache.delete_value(f"vms_split_progress:{asset_name}")

		# Send error email
		_send_split_error_email(asset, requested_by, str(e))


def _send_split_complete_email(asset, created_assets, recipient):
	"""Send email when split is complete."""
	site_url = frappe.utils.get_url()
	project_name = ""
	if asset.project:
		project_name = frappe.db.get_value("VMS Project", asset.project, "project_name") or asset.project

	parts_html = ""
	for a in created_assets:
		size_mb = round((a.file_size or 0) / (1024 * 1024), 1)
		parts_html += f"<li>{a.file_name} ({size_mb} MB)</li>"

	message = f"""
<p>Your video <strong>{asset.file_name}</strong> has been split into {len(created_assets)} parts successfully.</p>
{f'<p>Project: <strong>{project_name}</strong></p>' if project_name else ''}
<p><strong>Created parts:</strong></p>
<ul>{parts_html}</ul>
<p><a href="{site_url}/vms{f'/projects/{asset.project}' if asset.project else '/media-pool'}">View in VMS</a></p>
"""

	try:
		frappe.sendmail(
			recipients=[recipient],
			subject=f"Video split complete: {asset.file_name}",
			message=message,
			reference_doctype="VMS Asset",
			reference_name=asset.name,
			now=True,
		)
	except Exception:
		frappe.log_error(title="VMS: Failed to send split completion email")


def _send_split_error_email(asset, recipient, error_msg):
	"""Send email when split fails."""
	message = f"""
<p>Failed to split video <strong>{asset.file_name}</strong>.</p>
<p>Error: {frappe.utils.escape_html(error_msg)}</p>
<p>Please try again or contact support if the issue persists.</p>
"""

	try:
		frappe.sendmail(
			recipients=[recipient],
			subject=f"Video split failed: {asset.file_name}",
			message=message,
			reference_doctype="VMS Asset",
			reference_name=asset.name,
			now=True,
		)
	except Exception:
		frappe.log_error(title="VMS: Failed to send split error email")


def _get_extension(filename: str) -> str:
	"""Get file extension from filename."""
	if "." in filename:
		return "." + filename.rsplit(".", 1)[1].lower()
	return ".mp4"
