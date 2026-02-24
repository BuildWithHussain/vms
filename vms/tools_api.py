import uuid

import frappe
from frappe import _

from vms.r2 import (
	generate_presigned_download_url,
	generate_presigned_upload_url,
	generate_presigned_view_url,
)


@frappe.whitelist()
def get_tool_upload_url(file_name: str, content_type: str):
	"""Generate a presigned upload URL for a tool input file (stored under tools/ prefix)."""
	settings = frappe.get_single("VMS Settings")
	from vms.r2 import get_r2_client

	client = get_r2_client()

	ext = file_name.rsplit(".", 1)[-1] if "." in file_name else ""
	r2_key = f"tools/{uuid.uuid4().hex}.{ext}"

	url = client.generate_presigned_url(
		"put_object",
		Params={
			"Bucket": settings.r2_bucket_name,
			"Key": r2_key,
			"ContentType": content_type,
		},
		ExpiresIn=settings.presigned_url_expiry or 3600,
	)

	return {"upload_url": url, "r2_key": r2_key}


@frappe.whitelist()
def start_compression(r2_key: str, file_name: str, file_size: int | str = 0):
	"""Create a compress job and enqueue the ffmpeg background task."""
	if not r2_key:
		frappe.throw(_("R2 key is required"))
	if not file_name:
		frappe.throw(_("File name is required"))

	file_size = int(file_size or 0)

	job = frappe.get_doc(
		{
			"doctype": "VMS Compress Job",
			"original_file_name": file_name,
			"original_r2_key": r2_key,
			"original_size": file_size,
			"status": "Queued",
			"progress": 0,
		}
	)
	job.insert(ignore_permissions=True)
	frappe.db.commit()

	frappe.enqueue(
		"vms.tools.run_compression",
		job_name=job.name,
		queue="long",
		enqueue_after_commit=True,
	)

	return {"job_name": job.name, "status": "Queued"}


@frappe.whitelist(methods=["GET"])
def get_compress_status(job_name: str):
	"""Get the status and details of a compression job."""
	if not frappe.db.exists("VMS Compress Job", job_name):
		frappe.throw(_("Job not found"), frappe.DoesNotExistError)

	job = frappe.get_doc("VMS Compress Job", job_name)

	result = {
		"job_name": job.name,
		"status": job.status,
		"progress": job.progress,
		"original_file_name": job.original_file_name,
		"original_size": job.original_size,
		"compressed_size": job.compressed_size,
		"compressed_file_name": job.compressed_file_name,
		"error_message": job.error_message,
	}

	if job.status == "Complete" and job.compressed_r2_key:
		result["download_url"] = generate_presigned_download_url(
			job.compressed_r2_key, job.compressed_file_name or job.original_file_name
		)

	return result


@frappe.whitelist(methods=["GET"])
def get_compress_jobs(page: int | str = 1, page_size: int | str = 20):
	"""List compression jobs for the current user."""
	page = int(page)
	page_size = min(int(page_size), 50)
	start = (page - 1) * page_size

	filters = {"owner": frappe.session.user}

	total = frappe.db.count("VMS Compress Job", filters=filters)

	jobs = frappe.get_all(
		"VMS Compress Job",
		filters=filters,
		fields=[
			"name",
			"original_file_name",
			"original_size",
			"compressed_size",
			"status",
			"progress",
			"creation",
		],
		order_by="creation desc",
		start=start,
		page_length=page_size,
	)

	return {
		"jobs": jobs,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": -(-total // page_size) if total else 0,
	}
