import os
import subprocess
import tempfile
import uuid
from urllib.request import urlretrieve

import frappe

from vms.r2 import (
	generate_presigned_download_url,
	upload_r2_object,
)


def run_compression(job_name: str):
	"""Background job: download file from R2, compress with ffmpeg, upload result back to R2."""
	job = frappe.get_doc("VMS Compress Job", job_name)

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

			frappe.logger("vms").info(f"Downloading source file for compression: {job_name}")
			download_url = generate_presigned_download_url(job.original_r2_key, job.original_file_name)
			urlretrieve(download_url, input_path)

			job.progress = 20
			job.save(ignore_permissions=True)
			frappe.db.commit()
			_publish_progress(job)

			# Run ffmpeg compression
			output_name = _make_output_filename(job.original_file_name)
			output_path = os.path.join(tmpdir, output_name)

			frappe.logger("vms").info(f"Starting ffmpeg compression: {job_name}")
			_ffmpeg_compress(input_path, output_path)

			job.progress = 80
			job.save(ignore_permissions=True)
			frappe.db.commit()
			_publish_progress(job)

			# Upload compressed file to R2
			compressed_size = os.path.getsize(output_path)
			r2_key = f"tools/{uuid.uuid4().hex}.mp4"

			frappe.logger("vms").info(f"Uploading compressed file to R2: {job_name}")
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
		frappe.logger("vms").info(f"Compression complete: {job_name}")

	except Exception as e:
		frappe.logger("vms").error(f"Compression failed for {job_name}: {e}")
		job.reload()
		job.status = "Error"
		job.error_message = str(e)[:500]
		job.save(ignore_permissions=True)
		frappe.db.commit()
		_publish_progress(job)


def _ffmpeg_compress(input_path: str, output_path: str):
	"""Run ffmpeg to compress video using the recommended settings from the issue."""
	cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i", input_path,
		"-c:v", "libx264",
		"-preset", "medium",
		"-crf", "23",
		"-pix_fmt", "yuv420p",
		"-vf", "scale='min(1920,iw)':-2",
		"-c:a", "aac",
		"-b:a", "160k",
		"-movflags", "+faststart",
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
