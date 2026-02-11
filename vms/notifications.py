import frappe
from frappe import _


def send_comment_notification(doc, method):
	"""Send email notification when a new review comment is added.

	- Notify the asset uploader when someone else comments on their upload.
	- Notify the parent comment author when someone replies to their comment.
	"""
	frappe.enqueue(
		_send_comment_email,
		queue="short",
		comment_name=doc.name,
		now=frappe.flags.in_test,
	)


def _send_comment_email(comment_name):
	comment = frappe.get_doc("VMS Review Comment", comment_name)
	asset = frappe.get_doc("VMS Asset", comment.asset)

	commenter_name = _get_commenter_display_name(comment)
	asset_url = _get_review_url(asset)

	recipients = set()

	# 1. Notify the uploader (if someone else commented)
	if asset.uploaded_by and asset.uploaded_by != comment.commented_by:
		recipients.add(asset.uploaded_by)

	# 2. Notify parent comment author (if this is a reply)
	if comment.parent_comment:
		parent = frappe.get_doc("VMS Review Comment", comment.parent_comment)
		if parent.commented_by and parent.commented_by != comment.commented_by:
			recipients.add(parent.commented_by)

	if not recipients:
		return

	subject = _("{0} commented on {1}").format(commenter_name, asset.file_name)
	timestamp_str = ""
	if comment.video_timestamp is not None and comment.video_timestamp > 0:
		timestamp_str = f" at {_format_timestamp(comment.video_timestamp)}"

	is_reply = bool(comment.parent_comment)
	action_text = _("replied to a comment") if is_reply else _("left a comment")

	message = f"""
<p><strong>{commenter_name}</strong> {action_text} on <strong>{asset.file_name}</strong>{timestamp_str}:</p>
<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; margin: 12px 0; color: #555;">
{frappe.utils.escape_html(comment.comment_text)}
</blockquote>
<p><a href="{asset_url}">View in Review</a></p>
"""

	try:
		frappe.sendmail(
			recipients=list(recipients),
			subject=subject,
			message=message,
			reference_doctype="VMS Review Comment",
			reference_name=comment.name,
			now=True,
		)
	except Exception:
		frappe.log_error(title=_("VMS: Failed to send comment notification"))


def _get_commenter_display_name(comment):
	if comment.guest_name:
		return f"{comment.guest_name} (Guest)"
	if comment.commented_by:
		return frappe.db.get_value("User", comment.commented_by, "full_name") or comment.commented_by
	return _("Someone")


def _get_review_url(asset):
	site_url = frappe.utils.get_url()
	return f"{site_url}/vms/review/{asset.name}"


def _format_timestamp(seconds):
	mins = int(seconds) // 60
	secs = int(seconds) % 60
	return f"{mins}:{secs:02d}"
