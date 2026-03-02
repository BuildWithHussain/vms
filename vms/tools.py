import json
import os
import subprocess
import tempfile
import uuid
from urllib.request import urlretrieve

import frappe

from vms.r2 import (
	delete_r2_object,
	generate_presigned_download_url,
	upload_r2_object,
)


def run_compression(compress_job_name: str):
	"""Background job: download file from R2, compress with ffmpeg, upload result back to R2."""
	job = frappe.get_doc("VMS Compress Job", compress_job_name)

	try:
		job.status = "Processing"
		job.progress = 0
		job.save(ignore_permissions=True)
		frappe.db.commit()

		_publish_progress(job)

		with tempfile.TemporaryDirectory() as tmpdir:
			# Download source file from R2
			ext = _get_extension(job.original_file_name)
			input_path = os.path.join(tmpdir, f"input{ext}")

			frappe.logger("vms").info(f"Downloading source file for compression: {compress_job_name}")
			download_url = generate_presigned_download_url(job.original_r2_key, job.original_file_name)
			urlretrieve(download_url, input_path)

			job.progress = 20
			job.save(ignore_permissions=True)
			frappe.db.commit()
			_publish_progress(job)

			# Run ffmpeg compression
			output_name = _make_output_filename(job.original_file_name)
			output_path = os.path.join(tmpdir, output_name)

			frappe.logger("vms").info(f"Starting ffmpeg compression: {compress_job_name}")
			_ffmpeg_compress(input_path, output_path)

			job.progress = 80
			job.save(ignore_permissions=True)
			frappe.db.commit()
			_publish_progress(job)

			# Upload compressed file to R2
			compressed_size = os.path.getsize(output_path)
			r2_key = f"tools/{uuid.uuid4().hex}.mp4"

			frappe.logger("vms").info(f"Uploading compressed file to R2: {compress_job_name}")
			upload_r2_object(r2_key, output_path, "video/mp4")

		# Update job record
		job.reload()
		job.status = "Complete"
		job.progress = 100
		job.compressed_r2_key = r2_key
		job.compressed_size = compressed_size
		job.compressed_file_name = output_name
		job.save(ignore_permissions=True)
		frappe.db.commit()

		_publish_progress(job)
		frappe.logger("vms").info(f"Compression complete: {compress_job_name}")

	except Exception as e:
		frappe.logger("vms").error(f"Compression failed for {compress_job_name}: {e}")
		job.reload()
		job.status = "Error"
		job.error_message = str(e)[:500]
		job.save(ignore_permissions=True)
		frappe.db.commit()
		_publish_progress(job)


def _ffmpeg_compress(input_path: str, output_path: str):
	"""Run ffmpeg to compress video. Tries smart remux for non-MP4 files with compatible codecs."""
	if _can_remux_to_mp4(input_path):
		copy_cmd = [
			"ffmpeg",
			"-hide_banner",
			"-y",
			"-i",
			input_path,
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			output_path,
		]
		result = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=3600)
		if result.returncode == 0:
			frappe.logger("vms").info("Smart remux succeeded — skipped transcoding")
			return
		frappe.logger("vms").info("Smart remux failed — falling back to full transcode")

	cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		input_path,
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"23",
		"-pix_fmt",
		"yuv420p",
		"-vf",
		"scale='min(1920,iw)':-2",
		"-c:a",
		"aac",
		"-b:a",
		"160k",
		"-movflags",
		"+faststart",
		output_path,
	]

	result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
	if result.returncode != 0:
		raise RuntimeError(f"ffmpeg compression failed: {result.stderr[-500:]}")


def _make_output_filename(original_name: str) -> str:
	"""Generate the output filename: original_compressed.mp4"""
	base = original_name.rsplit(".", 1)[0] if "." in original_name else original_name
	return f"{base}_compressed.mp4"


def _get_extension(filename: str) -> str:
	"""Get file extension from filename."""
	if "." in filename:
		return "." + filename.rsplit(".", 1)[1].lower()
	return ".mp4"


def _probe_codecs(input_path: str) -> dict:
	"""Use ffprobe to detect video/audio codecs and container format."""
	cmd = [
		"ffprobe",
		"-v",
		"quiet",
		"-print_format",
		"json",
		"-show_format",
		"-show_streams",
		input_path,
	]
	try:
		result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
		if result.returncode != 0:
			return {}
		return json.loads(result.stdout)
	except Exception:
		return {}


def _can_remux_to_mp4(input_path: str) -> bool:
	"""Check if input can be remuxed (stream copy) to MP4 without transcoding.

	Returns True when the container is NOT already MP4/MOV and the codecs
	are MP4-compatible (H.264/H.265 video + AAC audio). In that case a fast
	remux avoids an expensive re-encode.
	"""
	probe = _probe_codecs(input_path)
	if not probe:
		return False

	fmt = probe.get("format", {}).get("format_name", "")
	# Already MP4/MOV — remuxing won't compress, user wants actual transcoding
	if any(tag in fmt for tag in ("mp4", "mov", "m4a")):
		return False

	streams = probe.get("streams", [])
	video_ok = False
	audio_ok = True  # no audio streams is fine

	for stream in streams:
		codec = stream.get("codec_name", "").lower()
		codec_type = stream.get("codec_type", "")

		if codec_type == "video":
			video_ok = codec in ("h264", "hevc", "h265")
		elif codec_type == "audio":
			if codec not in ("aac",):
				audio_ok = False

	return video_ok and audio_ok


def _publish_progress(job):
	"""Send realtime update to the job owner."""
	frappe.publish_realtime(
		"compress_progress",
		{
			"job_name": job.name,
			"status": job.status,
			"progress": job.progress,
			"compressed_size": job.compressed_size,
			"error_message": job.error_message,
		},
		user=job.owner,
	)


# ── Asset Format Conversion ──────────────────────────────────────────────────


def run_asset_conversion(asset_name: str):
	"""Background job: convert a VMS Asset to MP4 in-place (replaces original in R2)."""
	asset = frappe.get_doc("VMS Asset", asset_name)
	old_r2_key = asset.r2_key

	try:
		_publish_conversion_progress(asset, "Processing")

		with tempfile.TemporaryDirectory() as tmpdir:
			# Download source file from R2
			ext = _get_extension(asset.file_name)
			input_path = os.path.join(tmpdir, f"input{ext}")

			frappe.logger("vms").info(f"Downloading asset for conversion: {asset_name}")
			download_url = generate_presigned_download_url(asset.r2_key, asset.file_name)
			urlretrieve(download_url, input_path)

			# Convert to MP4
			base = asset.file_name.rsplit(".", 1)[0] if "." in asset.file_name else asset.file_name
			output_name = f"{base}.mp4"
			output_path = os.path.join(tmpdir, output_name)

			frappe.logger("vms").info(f"Converting asset to MP4: {asset_name}")
			_ffmpeg_convert(input_path, output_path)

			# Upload converted file to R2
			new_size = os.path.getsize(output_path)
			project_prefix = asset.project if asset.project else "inbox"
			new_r2_key = f"{project_prefix}/{uuid.uuid4().hex}.mp4"

			frappe.logger("vms").info(f"Uploading converted file to R2: {asset_name}")
			upload_r2_object(new_r2_key, output_path, "video/mp4")

		# Update asset record
		asset.reload()
		asset.file_name = output_name
		asset.file_type = "video/mp4"
		asset.r2_key = new_r2_key
		asset.file_size = new_size
		asset.status = "Ready"
		asset.save(ignore_permissions=True)
		frappe.db.commit()

		# Delete old R2 object
		try:
			delete_r2_object(old_r2_key)
		except Exception:
			frappe.logger("vms").warning(f"Failed to delete old R2 object {old_r2_key}")

		_publish_conversion_progress(asset, "Ready")

		# Regenerate thumbnail for the new MP4
		frappe.enqueue(
			"vms.thumbnails.generate_thumbnail",
			asset_name=asset.name,
			queue="default",
			enqueue_after_commit=True,
		)

		frappe.logger("vms").info(f"Conversion complete: {asset_name}")

	except Exception as e:
		frappe.logger("vms").error(f"Conversion failed for {asset_name}: {e}")
		asset.reload()
		asset.status = "Error"
		asset.save(ignore_permissions=True)
		frappe.db.commit()
		_publish_conversion_progress(asset, "Error", str(e)[:500])


def _ffmpeg_convert(input_path: str, output_path: str):
	"""Convert video to MP4. Tries fast copy-remux first, falls back to transcode."""
	# Try copy-remux first (instant if codecs are MP4-compatible)
	copy_cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		input_path,
		"-c",
		"copy",
		"-movflags",
		"+faststart",
		output_path,
	]
	result = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=3600)
	if result.returncode == 0:
		return

	# Fall back to full transcode
	transcode_cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		input_path,
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"23",
		"-pix_fmt",
		"yuv420p",
		"-vf",
		"scale='min(1920,iw)':-2",
		"-c:a",
		"aac",
		"-b:a",
		"160k",
		"-movflags",
		"+faststart",
		output_path,
	]
	result = subprocess.run(transcode_cmd, capture_output=True, text=True, timeout=3600)
	if result.returncode != 0:
		raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[-500:]}")


def _publish_conversion_progress(asset, status, error_message=None):
	"""Send realtime update about asset conversion."""
	frappe.publish_realtime(
		"asset_conversion_progress",
		{
			"asset_name": asset.name,
			"status": status,
			"error_message": error_message,
		},
		user=asset.uploaded_by or frappe.session.user,
	)
