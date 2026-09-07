import io
import os
import tempfile

import frappe
import requests
from frappe import _
from PIL import Image, ImageOps

from vms.r2 import generate_presigned_view_url
from vms.raw_images import is_raw, open_raw_preview

HEIC_EXTENSIONS = frozenset({".heic", ".heif"})
HEIC_MIMES = frozenset({"image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"})

TARGET_FORMATS = {
	"jpeg": ("JPEG", "image/jpeg", "jpg"),
	"jpg": ("JPEG", "image/jpeg", "jpg"),
	"png": ("PNG", "image/png", "png"),
}

JPEG_QUALITY = 90
_WHITE = (255, 255, 255)

MAX_SOURCE_BYTES = 300 * 1024 * 1024


def _extension(file_name: str | None) -> str:
	if not file_name:
		return ""
	return os.path.splitext(file_name)[1].lower()


def is_heic(file_type: str | None = None, file_name: str | None = None) -> bool:
	if file_type in HEIC_MIMES:
		return True
	return _extension(file_name) in HEIC_EXTENSIONS


def is_convertible_still(file_type: str | None = None, file_name: str | None = None) -> bool:
	return is_raw(file_type, file_name) or is_heic(file_type, file_name)


def converted_file_name(file_name: str, ext: str) -> str:
	base = os.path.splitext(file_name)[0] or file_name
	return f"{base}.{ext}"


def _register_heif():
	try:
		from pillow_heif import register_heif_opener
	except ImportError:
		frappe.throw(_("HEIC support is not installed on the server (pillow-heif)."))
	register_heif_opener()


def _render(src_path: str, file_type: str | None, file_name: str | None) -> Image.Image:
	if is_raw(file_type, file_name):
		return open_raw_preview(src_path)

	if is_heic(file_type, file_name):
		_register_heif()

	img = Image.open(src_path)
	img.load()
	return ImageOps.exif_transpose(img)


def _has_alpha(img: Image.Image) -> bool:
	return img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info


def _encode(img: Image.Image, pil_format: str) -> bytes:
	buf = io.BytesIO()
	if pil_format == "JPEG":
		if _has_alpha(img):
			rgba = img.convert("RGBA")
			flattened = Image.new("RGB", rgba.size, _WHITE)
			flattened.paste(rgba, mask=rgba.split()[-1])
			img = flattened
		else:
			img = img.convert("RGB")
		img.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
	else:
		img = img.convert("RGBA") if _has_alpha(img) else img.convert("RGB")
		img.save(buf, "PNG", optimize=True)
	return buf.getvalue()


def _download_source(r2_key: str, dest_path: str):
	resp = requests.get(generate_presigned_view_url(r2_key), stream=True, timeout=120)
	resp.raise_for_status()
	# nosemgrep: frappe-semgrep-rules.rules.security.frappe-security-file-traversal
	with open(dest_path, "wb") as f:
		for chunk in resp.iter_content(chunk_size=1024 * 1024):
			f.write(chunk)


def convert_asset_image(asset, target_format: str) -> tuple[bytes, str, str]:
	fmt = TARGET_FORMATS.get((target_format or "").lower())
	if not fmt:
		frappe.throw(_("Unsupported download format."))
	pil_format, mime, ext = fmt

	if not is_convertible_still(asset.file_type, asset.file_name):
		frappe.throw(_("This file is not available as JPEG or PNG."))

	if asset.file_size and asset.file_size > MAX_SOURCE_BYTES:
		frappe.throw(_("This file is too large to convert on download. Download the original instead."))

	with tempfile.TemporaryDirectory(prefix="vms_export_") as tmp:
		src_path = os.path.join(tmp, f"source{_extension(asset.file_name) or '.bin'}")
		_download_source(asset.r2_key, src_path)
		img = _render(src_path, asset.file_type, asset.file_name)
		data = _encode(img, pil_format)

	return data, mime, converted_file_name(asset.file_name, ext)


def serve_converted_download(asset, target_format: str):
	data, mime, out_name = convert_asset_image(asset, target_format)

	from vms.deletion import _create_audit_log

	_create_audit_log(
		action="Download",
		asset_name=asset.name,
		file_name=out_name,
		file_type=mime,
		project=asset.project,
		file_size=len(data),
	)

	frappe.local.response.filename = out_name
	frappe.local.response.filecontent = data
	frappe.local.response.content_type = mime
	frappe.local.response.type = "download"
