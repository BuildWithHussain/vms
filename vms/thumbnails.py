import os
import shutil
import subprocess
import tempfile

import frappe
import requests
from PIL import Image

from vms.r2 import generate_presigned_view_url

IMAGE_MIME_PREFIXES = ("image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff")
THUMB_MAX_WIDTH = 640


def _is_image(file_type):
	return file_type and any(file_type.startswith(prefix) for prefix in IMAGE_MIME_PREFIXES)


def _download_file(presigned_url, dest_path):
	resp = requests.get(presigned_url, stream=True, timeout=120)
	resp.raise_for_status()
	with open(dest_path, "wb") as f:
		for chunk in resp.iter_content(chunk_size=1024 * 1024):
			f.write(chunk)


def _generate_image_thumbnail(src_path, thumb_path):
	"""Resize image to max THUMB_MAX_WIDTH wide, save as JPEG."""
	img = Image.open(src_path)
	img = img.convert("RGB")
	if img.width > THUMB_MAX_WIDTH:
		ratio = THUMB_MAX_WIDTH / img.width
		img = img.resize((THUMB_MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)
	img.save(thumb_path, "JPEG", quality=80)


def _generate_video_thumbnail(video_path, thumb_path, asset_name):
	"""Extract a single frame at 1s using FFmpeg."""
	result = subprocess.run(
		[
			"ffmpeg",
			"-ss",
			"1",
			"-i",
			video_path,
			"-vframes",
			"1",
			"-f",
			"image2",
			"-q:v",
			"3",
			thumb_path,
		],
		capture_output=True,
		timeout=60,
	)

	if result.returncode != 0 or not os.path.exists(thumb_path):
		frappe.logger("vms").error(
			f"FFmpeg failed for {asset_name}: {result.stderr.decode(errors='replace')}"
		)
		return False
	return True


def generate_thumbnail(asset_name):
	"""Generate a JPEG thumbnail from an asset (runs as background job).

	For videos: extracts a single frame at 1s using FFmpeg.
	For images: resizes to max 640px wide.
	Saves as a public Frappe File and sets thumbnail_url.
	"""
	tmp_dir = tempfile.mkdtemp(prefix="vms_thumb_")
	try:
		asset = frappe.get_doc("VMS Asset", asset_name)
		if not asset.r2_key:
			return

		if asset.thumbnail_url:
			return

		presigned_url = generate_presigned_view_url(asset.r2_key)
		ext = asset.file_name.rsplit(".", 1)[-1].lower() if "." in asset.file_name else "bin"
		src_path = os.path.join(tmp_dir, f"input.{ext}")
		thumb_path = os.path.join(tmp_dir, "thumb.jpg")

		_download_file(presigned_url, src_path)

		if _is_image(asset.file_type):
			_generate_image_thumbnail(src_path, thumb_path)
		else:
			if not _generate_video_thumbnail(src_path, thumb_path, asset_name):
				return

		with open(thumb_path, "rb") as f:
			content = f.read()

		file_doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"{asset_name}.jpg",
				"attached_to_doctype": "VMS Asset",
				"attached_to_name": asset_name,
				"content": content,
				"is_private": 0,
			}
		)
		file_doc.save(ignore_permissions=True)

		asset.reload()
		asset.thumbnail_url = file_doc.file_url
		asset.save(ignore_permissions=True)
		frappe.db.commit()

	except Exception:
		frappe.logger("vms").error(
			f"Thumbnail generation failed for {asset_name}",
			exc_info=True,
		)
	finally:
		shutil.rmtree(tmp_dir, ignore_errors=True)
