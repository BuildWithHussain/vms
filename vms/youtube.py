import os
import tempfile

import frappe
import requests
from frappe import _

from vms.r2 import generate_presigned_download_url

CONNECTED_APP_NAME = "vms-youtube"
SCOPES = [
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube.readonly",
]
AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOCATION_URI = "https://oauth2.googleapis.com/revoke"


def _get_or_create_connected_app(client_id: str, client_secret: str):
	"""Create or update the VMS YouTube Connected App."""
	if frappe.db.exists("Connected App", CONNECTED_APP_NAME):
		app = frappe.get_doc("Connected App", CONNECTED_APP_NAME)
		app.client_id = client_id
		app.client_secret = client_secret
		app.authorization_uri = AUTHORIZATION_URI
		app.token_uri = TOKEN_URI
		app.revocation_uri = REVOCATION_URI

		# Update scopes
		app.scopes = []
		for scope in SCOPES:
			app.append("scopes", {"scope": scope})

		# Update query parameters for offline access
		app.query_parameters = []
		app.append("query_parameters", {"key": "access_type", "value": "offline"})
		app.append("query_parameters", {"key": "prompt", "value": "consent"})

		app.save(ignore_permissions=True)
		return app

	app = frappe.get_doc(
		{
			"doctype": "Connected App",
			"provider_name": "YouTube",
			"client_id": client_id,
			"client_secret": client_secret,
			"authorization_uri": AUTHORIZATION_URI,
			"token_uri": TOKEN_URI,
			"revocation_uri": REVOCATION_URI,
		}
	)

	for scope in SCOPES:
		app.append("scopes", {"scope": scope})

	app.append("query_parameters", {"key": "access_type", "value": "offline"})
	app.append("query_parameters", {"key": "prompt", "value": "consent"})

	app.insert(ignore_permissions=True, set_name=CONNECTED_APP_NAME)

	return app


def _fetch_channel_name(token_cache):
	"""Fetch the YouTube channel name using the stored access token."""
	access_token = token_cache.get_password("access_token")
	resp = requests.get(
		"https://www.googleapis.com/youtube/v3/channels",
		params={"part": "snippet", "mine": "true"},
		headers={"Authorization": f"Bearer {access_token}"},
		timeout=15,
	)
	resp.raise_for_status()
	data = resp.json()

	items = data.get("items", [])
	if items:
		return items[0]["snippet"]["title"]
	return "Unknown Channel"


@frappe.whitelist()
def connect_youtube(client_id: str, client_secret: str):
	"""Save OAuth credentials, create Connected App, and return the auth URL."""
	frappe.only_for("System Manager")

	if not client_id or not client_secret:
		frappe.throw(_("Client ID and Client Secret are required"))

	# Save credentials to VMS Settings
	settings = frappe.get_single("VMS Settings")
	settings.youtube_client_id = client_id
	settings.youtube_client_secret = client_secret
	settings.save(ignore_permissions=True)

	# Create/update Connected App
	connected_app = _get_or_create_connected_app(client_id, client_secret)

	# Initiate OAuth flow
	auth_url = connected_app.initiate_web_application_flow(
		success_uri="/vms?settings=youtube&youtube_connected=1"
	)

	return {"auth_url": auth_url}


@frappe.whitelist()
def finalize_youtube_connection():
	"""Called after OAuth redirect — verify token exists and fetch channel info."""
	frappe.only_for("System Manager")

	if not frappe.db.exists("Connected App", CONNECTED_APP_NAME):
		frappe.throw(_("YouTube Connected App not found. Please connect again."))

	connected_app = frappe.get_doc("Connected App", CONNECTED_APP_NAME)

	try:
		token_cache = connected_app.get_active_token(frappe.session.user)
	except Exception:
		frappe.throw(_("YouTube authorization failed. Please try connecting again."))

	if not token_cache:
		frappe.throw(_("No YouTube token found. Please connect again."))

	# Fetch channel name
	try:
		channel_name = _fetch_channel_name(token_cache)
	except Exception as e:
		frappe.log_error(f"Failed to fetch YouTube channel name: {e}")
		channel_name = "Connected"

	# Update VMS Settings
	settings = frappe.get_single("VMS Settings")
	settings.youtube_connected = 1
	settings.youtube_connected_user = frappe.session.user
	settings.youtube_channel_name = channel_name
	settings.save(ignore_permissions=True)

	return {"connected": True, "channel_name": channel_name}


@frappe.whitelist()
def disconnect_youtube():
	"""Disconnect YouTube — clear tokens and settings."""
	frappe.only_for("System Manager")

	settings = frappe.get_single("VMS Settings")
	user = settings.youtube_connected_user

	# Delete Token Cache first (linked to Connected App)
	if user:
		token_cache_name = f"{CONNECTED_APP_NAME}-{user}"
		if frappe.db.exists("Token Cache", token_cache_name):
			frappe.delete_doc("Token Cache", token_cache_name, ignore_permissions=True, force=True)

	# Then delete Connected App
	if frappe.db.exists("Connected App", CONNECTED_APP_NAME):
		frappe.delete_doc("Connected App", CONNECTED_APP_NAME, ignore_permissions=True, force=True)

	# Clear settings
	settings.youtube_connected = 0
	settings.youtube_connected_user = None
	settings.youtube_channel_name = None
	settings.save(ignore_permissions=True)

	return {"connected": False}


@frappe.whitelist(methods=["GET"])
def get_youtube_redirect_uri():
	"""Return the OAuth redirect URI that must be registered in Google Cloud Console."""
	base_url = frappe.utils.get_url()
	callback_path = "api/method/frappe.integrations.doctype.connected_app.connected_app.callback"
	return {"redirect_uri": f"{base_url}/{callback_path}/{CONNECTED_APP_NAME}"}


@frappe.whitelist(methods=["GET"])
def get_youtube_status():
	"""Return current YouTube connection status."""
	settings = frappe.get_single("VMS Settings")

	return {
		"connected": bool(settings.youtube_connected),
		"channel_name": settings.youtube_channel_name or "",
		"has_credentials": bool(settings.youtube_client_id),
	}


@frappe.whitelist()
def upload_to_youtube(
	asset_name: str,
	title: str,
	description: str = "",
	privacy_status: str = "unlisted",
):
	"""Validate and enqueue a YouTube upload job."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	settings = frappe.get_single("VMS Settings")
	if not settings.youtube_connected:
		frappe.throw(_("YouTube is not connected. Please connect in Settings."))

	asset = frappe.get_doc("VMS Asset", asset_name)
	if not asset.r2_key:
		frappe.throw(_("Asset has no uploaded file"))

	if asset.youtube_upload_status in ("Queued", "Uploading"):
		frappe.throw(_("Upload is already in progress"))

	if privacy_status not in ("public", "unlisted", "private"):
		frappe.throw(_("Invalid privacy status"))

	# Mark as queued
	frappe.db.set_value("VMS Asset", asset_name, "youtube_upload_status", "Queued")
	frappe.db.commit()

	frappe.enqueue(
		"vms.youtube.process_youtube_upload",
		asset_name=asset_name,
		title=title,
		description=description,
		privacy_status=privacy_status,
		queue="default",
		enqueue_after_commit=True,
		timeout=3600,
	)

	return {"status": "ok", "youtube_upload_status": "Queued"}


@frappe.whitelist(methods=["GET"])
def get_youtube_upload_status(asset_name: str):
	"""Get the YouTube upload status for an asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	data = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["youtube_upload_status", "youtube_video_id", "youtube_video_url"],
		as_dict=True,
	)

	return {
		"youtube_upload_status": data.youtube_upload_status or "",
		"youtube_video_id": data.youtube_video_id or "",
		"youtube_video_url": data.youtube_video_url or "",
	}


@frappe.whitelist()
def reset_youtube_upload(asset_name: str):
	"""Reset YouTube upload status to allow re-upload."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	frappe.db.set_value(
		"VMS Asset",
		asset_name,
		{
			"youtube_upload_status": None,
			"youtube_video_id": None,
			"youtube_video_url": None,
		},
	)

	return {"status": "ok"}


def process_youtube_upload(
	asset_name: str,
	title: str,
	description: str,
	privacy_status: str,
):
	"""Background job: download from R2 and upload to YouTube."""
	from google.oauth2.credentials import Credentials
	from googleapiclient.discovery import build
	from googleapiclient.http import MediaFileUpload

	asset = frappe.get_doc("VMS Asset", asset_name)

	try:
		frappe.db.set_value("VMS Asset", asset_name, "youtube_upload_status", "Uploading")
		frappe.db.commit()

		frappe.publish_realtime(
			"youtube_upload_progress",
			{"asset_name": asset_name, "stage": "downloading", "percent": 0},
		)

		settings = frappe.get_single("VMS Settings")

		# Get OAuth token
		connected_app = frappe.get_doc("Connected App", CONNECTED_APP_NAME)
		token_cache = connected_app.get_active_token(settings.youtube_connected_user)

		if not token_cache:
			raise Exception("YouTube token not found or expired. Please reconnect.")

		token_data = token_cache.get_json()

		# Build Google credentials from token cache
		credentials = Credentials(
			token=token_data.get("access_token"),
			refresh_token=token_data.get("refresh_token"),
			token_uri=TOKEN_URI,
			client_id=settings.youtube_client_id,
			client_secret=settings.get_password("youtube_client_secret"),
		)

		youtube = build("youtube", "v3", credentials=credentials)

		# Download video from R2 to temp file
		with tempfile.TemporaryDirectory() as tmpdir:
			ext = os.path.splitext(asset.file_name)[1] or ".mp4"
			video_path = os.path.join(tmpdir, f"upload{ext}")

			download_url = generate_presigned_download_url(asset.r2_key, asset.file_name)
			frappe.logger().info(f"Downloading {asset.file_name} from R2 for YouTube upload")

			resp = requests.get(download_url, stream=True, timeout=30)
			resp.raise_for_status()

			total_size = int(resp.headers.get("content-length", 0))
			downloaded = 0

			with open(video_path, "wb") as f:
				for chunk in resp.iter_content(chunk_size=10 * 1024 * 1024):
					f.write(chunk)
					downloaded += len(chunk)
					if total_size:
						percent = int((downloaded / total_size) * 40)  # 0-40% for download
						frappe.publish_realtime(
							"youtube_upload_progress",
							{"asset_name": asset_name, "stage": "downloading", "percent": percent},
						)

			frappe.publish_realtime(
				"youtube_upload_progress",
				{"asset_name": asset_name, "stage": "uploading", "percent": 40},
			)

			# Upload to YouTube
			body = {
				"snippet": {
					"title": title,
					"description": description,
					"categoryId": "22",  # People & Blogs
				},
				"status": {
					"privacyStatus": privacy_status,
				},
			}

			media = MediaFileUpload(
				video_path,
				mimetype=asset.file_type or "video/mp4",
				resumable=True,
				chunksize=10 * 1024 * 1024,
			)

			request = youtube.videos().insert(
				part="snippet,status",
				body=body,
				media_body=media,
			)

			response = None
			while response is None:
				status, response = request.next_chunk()
				if status:
					percent = 40 + int(status.progress() * 60)  # 40-100% for upload
					frappe.publish_realtime(
						"youtube_upload_progress",
						{"asset_name": asset_name, "stage": "uploading", "percent": percent},
					)

			video_id = response["id"]
			video_url = f"https://www.youtube.com/watch?v={video_id}"

			frappe.db.set_value(
				"VMS Asset",
				asset_name,
				{
					"youtube_upload_status": "Complete",
					"youtube_video_id": video_id,
					"youtube_video_url": video_url,
				},
			)
			frappe.db.commit()

			frappe.publish_realtime(
				"youtube_upload_progress",
				{
					"asset_name": asset_name,
					"stage": "complete",
					"percent": 100,
					"video_id": video_id,
					"video_url": video_url,
				},
			)

			frappe.logger().info(f"YouTube upload complete: {video_url}")

	except Exception as e:
		frappe.log_error(f"YouTube upload failed for {asset_name}: {e}")
		frappe.db.set_value("VMS Asset", asset_name, "youtube_upload_status", "Error")
		frappe.db.commit()

		error_message = str(e)

		# Extract readable error from Google API errors
		try:
			from googleapiclient.errors import HttpError

			if isinstance(e, HttpError):
				import json

				error_detail = json.loads(e.content.decode())
				error_message = error_detail.get("error", {}).get("message", str(e))
		except Exception:
			pass

		frappe.publish_realtime(
			"youtube_upload_progress",
			{"asset_name": asset_name, "stage": "error", "percent": 0, "error": error_message},
		)
