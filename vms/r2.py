import os
import uuid

import boto3
import frappe


def get_r2_client():
	settings = frappe.get_single("VMS Settings")
	endpoint_url = os.environ.get(
		"VMS_S3_ENDPOINT_URL",
		f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
	)
	return boto3.client(
		"s3",
		endpoint_url=endpoint_url,
		aws_access_key_id=settings.r2_access_key_id,
		aws_secret_access_key=settings.get_password("r2_secret_access_key"),
		region_name="auto",
	)


def _make_r2_key(file_name, project):
	ext = file_name.rsplit(".", 1)[-1] if "." in file_name else ""
	prefix = project if project else "inbox"
	return f"{prefix}/{uuid.uuid4().hex}.{ext}"


def generate_presigned_upload_url(file_name, content_type, project):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	r2_key = _make_r2_key(file_name, project)

	url = client.generate_presigned_url(
		"put_object",
		Params={
			"Bucket": settings.r2_bucket_name,
			"Key": r2_key,
			"ContentType": content_type,
		},
		ExpiresIn=settings.presigned_url_expiry or 3600,
	)

	return url, r2_key


# ---------------------------------------------------------------------------
# Multipart upload helpers (for files > 100 MB)
# ---------------------------------------------------------------------------


def create_multipart_upload(file_name, content_type, project):
	"""Initiate an S3 multipart upload and return (r2_key, upload_id)."""
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	r2_key = _make_r2_key(file_name, project)

	resp = client.create_multipart_upload(
		Bucket=settings.r2_bucket_name,
		Key=r2_key,
		ContentType=content_type,
	)

	return r2_key, resp["UploadId"]


def generate_presigned_part_url(r2_key, upload_id, part_number):
	"""Generate a presigned URL for uploading a single part."""
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	url = client.generate_presigned_url(
		"upload_part",
		Params={
			"Bucket": settings.r2_bucket_name,
			"Key": r2_key,
			"UploadId": upload_id,
			"PartNumber": part_number,
		},
		ExpiresIn=settings.presigned_url_expiry or 3600,
	)

	return url


def complete_multipart_upload(r2_key, upload_id, parts):
	"""Complete a multipart upload. `parts` is a list of {PartNumber, ETag}."""
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	client.complete_multipart_upload(
		Bucket=settings.r2_bucket_name,
		Key=r2_key,
		UploadId=upload_id,
		MultipartUpload={"Parts": parts},
	)


def abort_multipart_upload(r2_key, upload_id):
	"""Abort a multipart upload, cleaning up uploaded parts."""
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	client.abort_multipart_upload(
		Bucket=settings.r2_bucket_name,
		Key=r2_key,
		UploadId=upload_id,
	)


def generate_presigned_view_url(r2_key):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	url = client.generate_presigned_url(
		"get_object",
		Params={
			"Bucket": settings.r2_bucket_name,
			"Key": r2_key,
		},
		ExpiresIn=settings.presigned_url_expiry or 3600,
	)

	return url


def generate_presigned_download_url(r2_key, file_name):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	url = client.generate_presigned_url(
		"get_object",
		Params={
			"Bucket": settings.r2_bucket_name,
			"Key": r2_key,
			"ResponseContentDisposition": f'attachment; filename="{file_name}"',
		},
		ExpiresIn=settings.presigned_url_expiry or 3600,
	)

	return url


def delete_r2_object(r2_key):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	client.delete_object(
		Bucket=settings.r2_bucket_name,
		Key=r2_key,
	)
