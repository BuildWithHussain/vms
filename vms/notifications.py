import frappe
from frappe import _


def send_comment_notification(doc, method):
	"""Send in-app + email notifications when a new review comment is added.

	- Notify the asset uploader when someone else comments on their upload.
	- Notify the parent comment author when someone replies to their comment.
	- Notify @mentioned users.
	"""
	# Skip notifications from guest users (no from_user for Notification Log)
	if not doc.commented_by:
		return

	frappe.enqueue(
		_process_comment_notifications,
		queue="short",
		comment_name=doc.name,
		now=frappe.flags.in_test,
	)


def _process_comment_notifications(comment_name):
	from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification

	comment = frappe.get_doc("VMS Review Comment", comment_name)
	asset = frappe.get_doc("VMS Asset", comment.asset)

	commenter_name = _get_commenter_display_name(comment)
	review_link = f"/vms/review/{asset.name}"

	# --- Collect recipients ---
	# 1. Asset uploader (if someone else commented)
	comment_recipients = set()
	if asset.uploaded_by and asset.uploaded_by != comment.commented_by:
		comment_recipients.add(asset.uploaded_by)

	# 2. Parent comment author (if this is a reply)
	if comment.parent_comment:
		parent = frappe.get_doc("VMS Review Comment", comment.parent_comment)
		if parent.commented_by and parent.commented_by != comment.commented_by:
			comment_recipients.add(parent.commented_by)

	# 3. @mentioned users
	mentioned_users = _extract_mentioned_users(comment.comment_text)
	# Remove the commenter themselves from mentions
	mentioned_users.discard(comment.commented_by)

	# --- In-app notifications (Notification Log) ---
	# enqueue_create_notification expects email addresses, not User names
	# (User.name is email for normal users but "Administrator" for admin)

	# Notify mentioned users (type: Mention)
	if mentioned_users:
		mention_emails = _user_names_to_emails(mentioned_users)
		if mention_emails:
			mention_subject = _("<b>{0}</b> mentioned you in a comment on <b>{1}</b>").format(
				commenter_name, asset.file_name
			)
			enqueue_create_notification(
				mention_emails,
				{
					"type": "Mention",
					"document_type": "VMS Review Comment",
					"document_name": comment.name,
					"subject": mention_subject,
					"from_user": comment.commented_by,
					"email_content": comment.comment_text,
					"link": review_link,
				},
			)

	# Notify uploader + reply author (type: Alert) — exclude already-mentioned users
	alert_recipients = comment_recipients - mentioned_users
	if alert_recipients:
		alert_emails = _user_names_to_emails(alert_recipients)
		if alert_emails:
			is_reply = bool(comment.parent_comment)
			action = _("replied to your comment") if is_reply else _("commented")
			alert_subject = _("<b>{0}</b> {1} on <b>{2}</b>").format(commenter_name, action, asset.file_name)
			enqueue_create_notification(
				alert_emails,
				{
					"type": "Alert",
					"document_type": "VMS Review Comment",
					"document_name": comment.name,
					"subject": alert_subject,
					"from_user": comment.commented_by,
					"email_content": comment.comment_text,
					"link": review_link,
				},
			)

	# --- Email notifications (existing behavior) ---
	_send_comment_email(comment, asset, commenter_name, comment_recipients)


def _user_names_to_emails(user_names):
	"""Convert User names to email addresses for enqueue_create_notification.

	User.name is typically the email, but "Administrator" is a special case.
	"""
	if not user_names:
		return []

	return frappe.get_all(
		"User",
		filters={"name": ["in", list(user_names)], "enabled": 1},
		pluck="email",
	)


def _extract_mentioned_users(html_text):
	"""Extract @mentioned user emails from tiptap HTML output."""
	if not html_text:
		return set()

	from bs4 import BeautifulSoup

	soup = BeautifulSoup(html_text, "html.parser")
	emails = set()
	for mention in soup.find_all(class_="mention"):
		data_id = mention.get("data-id")
		if data_id:
			emails.add(data_id)
	return emails


def _send_comment_email(comment, asset, commenter_name, recipients):
	"""Send email notification to recipients."""
	if not recipients:
		return

	asset_url = _get_review_url(asset)
	subject = _("{0} commented on {1}").format(commenter_name, asset.file_name)

	timestamp_str = ""
	if comment.video_timestamp is not None and comment.video_timestamp > 0:
		timestamp_str = f" at {_format_timestamp(comment.video_timestamp)}"

	is_reply = bool(comment.parent_comment)
	action_text = _("replied to a comment") if is_reply else _("left a comment")

	message = f"""
<p><strong>{commenter_name}</strong> {action_text} on <strong>{asset.file_name}</strong>{timestamp_str}:</p>
<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; margin: 12px 0; color: #555;">
{frappe.utils.sanitize_html(comment.comment_text)}
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
