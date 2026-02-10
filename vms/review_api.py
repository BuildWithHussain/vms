import frappe
from frappe import _

from vms.r2 import generate_presigned_view_url


@frappe.whitelist()
def get_review_data(asset_name: str):
	"""Get asset info + project info for the review page header."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	data = {
		"name": asset.name,
		"file_name": asset.file_name,
		"file_type": asset.file_type,
		"file_size": asset.file_size,
		"status": asset.status,
		"category": asset.category,
		"duration_seconds": asset.duration_seconds,
		"uploaded_by": asset.uploaded_by,
		"uploaded_at": asset.uploaded_at,
	}

	if asset.project:
		project = frappe.get_doc("VMS Project", asset.project)
		data["project"] = {
			"name": project.name,
			"project_name": project.project_name,
		}
	else:
		data["project"] = None

	return data


@frappe.whitelist()
def get_review_view_url(asset_name: str):
	"""Get a presigned view URL for video playback in review page."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_view_url(asset.r2_key)
	return {"url": url}


@frappe.whitelist(methods=["GET"])
def get_comments(asset_name: str, sort_by: str = "timestamp"):
	"""Get flat list of comments for an asset with commenter info.

	Client builds the thread tree from parent_comment references.
	"""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	order_by = "video_timestamp asc, creation asc"
	if sort_by == "recent":
		order_by = "creation desc"

	comments = frappe.get_all(
		"VMS Review Comment",
		filters={"asset": asset_name},
		fields=[
			"name",
			"asset",
			"parent_comment",
			"comment_text",
			"video_timestamp",
			"commented_by",
			"guest_name",
			"is_resolved",
			"has_annotation",
			"creation",
			"modified",
		],
		order_by=order_by,
		limit=500,
	)

	# Attach commenter info
	for comment in comments:
		if comment.commented_by:
			user = frappe.db.get_value(
				"User",
				comment.commented_by,
				["full_name", "user_image"],
				as_dict=True,
			)
			if user:
				comment["commenter_name"] = user.full_name
				comment["commenter_image"] = user.user_image
			else:
				comment["commenter_name"] = comment.commented_by
				comment["commenter_image"] = None
		elif comment.guest_name:
			comment["commenter_name"] = comment.guest_name
			comment["commenter_image"] = None
		else:
			comment["commenter_name"] = "Unknown"
			comment["commenter_image"] = None

	return comments


@frappe.whitelist()
def add_comment(
	asset_name: str,
	comment_text: str,
	video_timestamp: float | None = None,
	parent_comment: str | None = None,
	annotation_data: str | None = None,
):
	"""Add a comment to an asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	if parent_comment and not frappe.db.exists("VMS Review Comment", parent_comment):
		frappe.throw(_("Parent comment {0} does not exist").format(parent_comment))

	doc = frappe.get_doc(
		{
			"doctype": "VMS Review Comment",
			"asset": asset_name,
			"comment_text": comment_text,
			"video_timestamp": video_timestamp,
			"parent_comment": parent_comment,
			"commented_by": frappe.session.user,
		}
	)

	if annotation_data:
		doc.annotation_data = annotation_data
		doc.has_annotation = 1

	doc.insert(ignore_permissions=True)

	# Return the created comment with commenter info
	user = frappe.db.get_value(
		"User",
		frappe.session.user,
		["full_name", "user_image"],
		as_dict=True,
	)

	return {
		"name": doc.name,
		"asset": doc.asset,
		"parent_comment": doc.parent_comment,
		"comment_text": doc.comment_text,
		"video_timestamp": doc.video_timestamp,
		"commented_by": doc.commented_by,
		"commenter_name": user.full_name if user else frappe.session.user,
		"commenter_image": user.user_image if user else None,
		"is_resolved": doc.is_resolved,
		"has_annotation": doc.has_annotation,
		"creation": str(doc.creation),
		"modified": str(doc.modified),
	}


@frappe.whitelist()
def get_annotation_data(comment_name: str):
	"""Get annotation JSON data for a single comment (fetched on demand)."""
	if not frappe.db.exists("VMS Review Comment", comment_name):
		frappe.throw(_("Comment {0} does not exist").format(comment_name))

	data = frappe.db.get_value(
		"VMS Review Comment",
		comment_name,
		["annotation_data", "has_annotation", "video_timestamp"],
		as_dict=True,
	)

	return {
		"annotation_data": data.annotation_data,
		"has_annotation": data.has_annotation,
		"video_timestamp": data.video_timestamp,
	}


@frappe.whitelist()
def delete_comment(comment_name: str):
	"""Delete a comment and all its replies."""
	if not frappe.db.exists("VMS Review Comment", comment_name):
		frappe.throw(_("Comment {0} does not exist").format(comment_name))

	# Delete replies first
	replies = frappe.get_all(
		"VMS Review Comment",
		filters={"parent_comment": comment_name},
		pluck="name",
	)
	for reply_name in replies:
		frappe.delete_doc("VMS Review Comment", reply_name, ignore_permissions=True)

	frappe.delete_doc("VMS Review Comment", comment_name, ignore_permissions=True)

	return {"status": "ok"}


@frappe.whitelist()
def resolve_comment(comment_name: str, is_resolved: int):
	"""Toggle the resolved flag on a comment."""
	if not frappe.db.exists("VMS Review Comment", comment_name):
		frappe.throw(_("Comment {0} does not exist").format(comment_name))

	doc = frappe.get_doc("VMS Review Comment", comment_name)
	doc.is_resolved = int(is_resolved)
	doc.save(ignore_permissions=True)

	return {"status": "ok", "is_resolved": doc.is_resolved}
