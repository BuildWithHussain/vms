import uuid

import boto3
import frappe


def get_r2_client():
	settings = frappe.get_single("VMS Settings")
	return boto3.client(
		"s3",
		endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
		aws_access_key_id=settings.r2_access_key_id,
		aws_secret_access_key=settings.get_password("r2_secret_access_key"),
		region_name="auto",
	)


def generate_presigned_upload_url(file_name, content_type, project):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	ext = file_name.rsplit(".", 1)[-1] if "." in file_name else ""
	r2_key = f"{project}/{uuid.uuid4().hex}.{ext}"

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


def delete_r2_object(r2_key):
	settings = frappe.get_single("VMS Settings")
	client = get_r2_client()

	client.delete_object(
		Bucket=settings.r2_bucket_name,
		Key=r2_key,
	)
