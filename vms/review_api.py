import frappe
from frappe import _

from vms.r2 import generate_presigned_download_url, generate_presigned_view_url


def _validate_public_token(asset_name, token):
	"""Validate guest access via public review token.

	Returns True if guest access is valid, False if user is authenticated.
	Throws AuthenticationError if guest access is invalid.
	"""
	if frappe.session.user and frappe.session.user != "Guest":
		return False

	if not token:
		frappe.throw(_("Authentication required"), frappe.AuthenticationError)

	result = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["is_public_review", "review_token"],
		as_dict=True,
	)

	if not result or not result.is_public_review or result.review_token != token:
		frappe.throw(_("Invalid or expired review link"), frappe.AuthenticationError)

	return True


@frappe.whitelist(allow_guest=True)
def get_review_data(asset_name: str, token: str | None = None):
	"""Get asset info + project info for the review page header."""
	is_guest = _validate_public_token(asset_name, token)

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
		"is_public_review": asset.is_public_review,
		"transcription_status": asset.transcription_status or "",
	}

	# Only expose review_token to authenticated users
	if not is_guest:
		data["review_token"] = asset.review_token

	# Split history
	if asset.split_from and frappe.db.exists("VMS Asset", asset.split_from):
		data["split_from"] = {
			"name": asset.split_from,
			"file_name": frappe.db.get_value("VMS Asset", asset.split_from, "file_name"),
		}
	else:
		data["split_from"] = None

	# Check if this asset has been split into parts
	split_parts = frappe.get_all(
		"VMS Asset",
		filters={"split_from": asset.name},
		fields=["name", "file_name"],
		order_by="creation asc",
	)
	data["split_parts"] = split_parts if split_parts else None

	if asset.project:
		project = frappe.get_doc("VMS Project", asset.project)
		data["project"] = {
			"name": project.name,
			"project_name": project.project_name,
		}
	else:
		data["project"] = None

	return data


@frappe.whitelist(allow_guest=True)
def get_review_view_url(asset_name: str, token: str | None = None):
	"""Get a presigned view URL for video playback in review page."""
	_validate_public_token(asset_name, token)

	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_view_url(asset.r2_key)
	return {"url": url}


@frappe.whitelist(methods=["GET"], allow_guest=True)
def get_comments(asset_name: str, sort_by: str = "timestamp", token: str | None = None):
	"""Get flat list of comments for an asset with commenter info.

	Client builds the thread tree from parent_comment references.
	"""
	_validate_public_token(asset_name, token)

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


@frappe.whitelist(allow_guest=True)
def add_comment(
	asset_name: str,
	comment_text: str,
	video_timestamp: float | None = None,
	parent_comment: str | None = None,
	annotation_data: str | None = None,
	token: str | None = None,
	guest_name: str | None = None,
):
	"""Add a comment to an asset."""
	is_guest = _validate_public_token(asset_name, token)

	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	if parent_comment and not frappe.db.exists("VMS Review Comment", parent_comment):
		frappe.throw(_("Parent comment {0} does not exist").format(parent_comment))

	if is_guest and not guest_name:
		frappe.throw(_("Guest name is required"))

	doc = frappe.get_doc(
		{
			"doctype": "VMS Review Comment",
			"asset": asset_name,
			"comment_text": comment_text,
			"video_timestamp": video_timestamp,
			"parent_comment": parent_comment,
			"commented_by": None if is_guest else frappe.session.user,
			"guest_name": guest_name if is_guest else None,
		}
	)

	if annotation_data:
		doc.annotation_data = annotation_data
		doc.has_annotation = 1

	doc.insert(ignore_permissions=True)

	# Return the created comment with commenter info
	if is_guest:
		commenter_name = guest_name
		commenter_image = None
	else:
		user = frappe.db.get_value(
			"User",
			frappe.session.user,
			["full_name", "user_image"],
			as_dict=True,
		)
		commenter_name = user.full_name if user else frappe.session.user
		commenter_image = user.user_image if user else None

	return {
		"name": doc.name,
		"asset": doc.asset,
		"parent_comment": doc.parent_comment,
		"comment_text": doc.comment_text,
		"video_timestamp": doc.video_timestamp,
		"commented_by": doc.commented_by,
		"guest_name": doc.guest_name,
		"commenter_name": commenter_name,
		"commenter_image": commenter_image if not is_guest else None,
		"is_resolved": doc.is_resolved,
		"has_annotation": doc.has_annotation,
		"creation": str(doc.creation),
		"modified": str(doc.modified),
	}


@frappe.whitelist(allow_guest=True)
def get_annotation_data(comment_name: str, token: str | None = None):
	"""Get annotation JSON data for a single comment (fetched on demand)."""
	if not frappe.db.exists("VMS Review Comment", comment_name):
		frappe.throw(_("Comment {0} does not exist").format(comment_name))

	# Look up the asset from the comment to validate token
	asset_name = frappe.db.get_value("VMS Review Comment", comment_name, "asset")
	if token:
		_validate_public_token(asset_name, token)

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


@frappe.whitelist()
def toggle_public_review(asset_name: str, enable: int):
	"""Toggle public review on/off for an asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	doc = frappe.get_doc("VMS Asset", asset_name)
	doc.is_public_review = int(enable)
	doc.save(ignore_permissions=True)

	return {
		"is_public_review": doc.is_public_review,
		"review_token": doc.review_token,
	}


@frappe.whitelist(methods=["GET"])
def get_mentionable_users():
	"""Get list of users who can be @mentioned in comments.

	Returns only users with VMS-related roles (Video Manager or System Manager).
	"""
	vms_roles = ["Video Manager", "System Manager"]

	# Get distinct users who have at least one VMS role
	user_emails = list(
		set(
			frappe.get_all(
				"Has Role",
				filters={
					"role": ["in", vms_roles],
					"parenttype": "User",
				},
				pluck="parent",
			)
		)
	)

	if not user_emails:
		return []

	users = frappe.get_all(
		"User",
		filters={
			"enabled": 1,
			"name": ["in", user_emails],
		},
		fields=["name", "full_name", "user_image"],
	)

	return users


@frappe.whitelist(allow_guest=True)
def get_guest_download_url(asset_name: str, token: str):
	"""Get a presigned download URL for guest users with a valid token."""
	_validate_public_token(asset_name, token)

	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no R2 key"))

	url = generate_presigned_download_url(asset.r2_key, asset.file_name)
	return {"url": url}
