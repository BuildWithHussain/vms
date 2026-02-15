# Copyright (c) 2026, BWH and Contributors
# See license.txt

import json
import unittest

import frappe
import requests
from frappe.tests import IntegrationTestCase


class TestUpload(IntegrationTestCase):
	"""Integration tests for the upload API (single PUT + multipart) against MinIO/S3."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Ensure a VMS Project exists for upload tests
		if not frappe.db.exists("VMS Project", {"project_name": "Test Upload Project"}):
			frappe.get_doc(
				{
					"doctype": "VMS Project",
					"project_name": "Test Upload Project",
					"owner_user": "Administrator",
				}
			).insert(ignore_permissions=True)
			frappe.db.commit()
		cls.project = frappe.get_value("VMS Project", {"project_name": "Test Upload Project"}, "name")

	# ------------------------------------------------------------------
	# Single PUT upload (< 100 MB)
	# ------------------------------------------------------------------

	def test_single_upload_returns_presigned_url(self):
		"""get_upload_url should return a presigned URL for small files."""
		from vms.api import get_upload_url

		result = get_upload_url(
			file_name="test_video.mp4",
			content_type="video/mp4",
			file_size=1024,
			project=self.project,
		)

		self.assertIn("upload_url", result)
		self.assertIn("r2_key", result)
		self.assertIn("asset_name", result)
		self.assertFalse(result["multipart"])
		self.assertTrue(result["upload_url"].startswith("http"))

		# Cleanup
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_single_upload_creates_asset_in_uploading_status(self):
		"""get_upload_url should create a VMS Asset in 'Uploading' status."""
		from vms.api import get_upload_url

		result = get_upload_url(
			file_name="status_test.mp4",
			content_type="video/mp4",
			file_size=1024,
			project=self.project,
		)

		asset = frappe.get_doc("VMS Asset", result["asset_name"])
		self.assertEqual(asset.status, "Uploading")
		self.assertEqual(asset.file_name, "status_test.mp4")
		self.assertEqual(asset.file_type, "video/mp4")
		self.assertEqual(asset.project, self.project)

		# Cleanup
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_single_upload_end_to_end(self):
		"""Full single PUT upload: get URL → PUT file → confirm."""
		from vms.api import confirm_upload, get_upload_url

		file_data = b"\x00" * 1024  # 1 KB of data
		result = get_upload_url(
			file_name="e2e_small.mp4",
			content_type="video/mp4",
			file_size=len(file_data),
			project=self.project,
		)

		# Actually upload data to MinIO via presigned URL
		resp = requests.put(
			result["upload_url"],
			data=file_data,
			headers={"Content-Type": "video/mp4"},
			timeout=10,
		)
		self.assertIn(resp.status_code, (200, 201), f"PUT failed: {resp.status_code} {resp.text}")

		# Confirm the upload
		confirm_result = confirm_upload(asset_name=result["asset_name"], file_size=len(file_data))
		self.assertEqual(confirm_result["status"], "ok")

		# Verify asset is now Ready
		asset = frappe.get_doc("VMS Asset", result["asset_name"])
		self.assertEqual(asset.status, "Ready")
		self.assertEqual(asset.file_size, len(file_data))
		self.assertIsNotNone(asset.uploaded_at)

		# Cleanup
		from vms.r2 import delete_r2_object

		delete_r2_object(result["r2_key"])
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	# ------------------------------------------------------------------
	# Multipart upload (> 100 MB)
	# ------------------------------------------------------------------

	def test_multipart_upload_returns_upload_id(self):
		"""get_upload_url should return multipart=True and upload_id for large files."""
		from vms.api import MULTIPART_PART_SIZE, MULTIPART_THRESHOLD, get_upload_url

		result = get_upload_url(
			file_name="big_video.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		self.assertTrue(result["multipart"])
		self.assertIn("upload_id", result)
		self.assertEqual(result["part_size"], MULTIPART_PART_SIZE)
		self.assertNotIn("upload_url", result)

		# Cleanup: abort the multipart upload
		from vms.r2 import abort_multipart_upload

		try:
			abort_multipart_upload(result["r2_key"], result["upload_id"])
		except Exception:
			pass
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_get_part_upload_url(self):
		"""get_part_upload_url should return a presigned URL for a specific part."""
		from vms.api import MULTIPART_THRESHOLD, get_part_upload_url, get_upload_url

		result = get_upload_url(
			file_name="parts_test.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		part_result = get_part_upload_url(
			r2_key=result["r2_key"],
			upload_id=result["upload_id"],
			part_number=1,
		)

		self.assertIn("url", part_result)
		self.assertTrue(part_result["url"].startswith("http"))

		# Cleanup
		from vms.r2 import abort_multipart_upload

		try:
			abort_multipart_upload(result["r2_key"], result["upload_id"])
		except Exception:
			pass
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_multipart_upload_end_to_end(self):
		"""Full multipart upload: initiate → upload parts → complete → confirm."""
		from vms.api import (
			MULTIPART_THRESHOLD,
			complete_multipart,
			confirm_upload,
			get_part_upload_url,
			get_upload_url,
		)

		# S3 minimum part size is 5 MB (except last part).
		# We'll use 2 parts: one 5 MB + one small final part.
		part1_size = 5 * 1024 * 1024  # 5 MB
		part2_size = 1024  # 1 KB
		total_size = part1_size + part2_size

		result = get_upload_url(
			file_name="multipart_e2e.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,  # trigger multipart
			project=self.project,
		)

		self.assertTrue(result["multipart"])

		parts = []

		# Upload part 1 (5 MB of zeroes)
		part1_url = get_part_upload_url(result["r2_key"], result["upload_id"], 1)["url"]
		resp1 = requests.put(
			part1_url,
			data=b"\x00" * part1_size,
			headers={"Content-Type": "video/mp4"},
			timeout=30,
		)
		self.assertIn(resp1.status_code, (200, 201), f"Part 1 PUT failed: {resp1.status_code}")
		etag1 = resp1.headers.get("ETag", "").strip('"')
		self.assertTrue(etag1, "Part 1 ETag is empty")
		parts.append({"PartNumber": 1, "ETag": etag1})

		# Upload part 2 (1 KB)
		part2_url = get_part_upload_url(result["r2_key"], result["upload_id"], 2)["url"]
		resp2 = requests.put(
			part2_url,
			data=b"\x00" * part2_size,
			headers={"Content-Type": "video/mp4"},
			timeout=10,
		)
		self.assertIn(resp2.status_code, (200, 201), f"Part 2 PUT failed: {resp2.status_code}")
		etag2 = resp2.headers.get("ETag", "").strip('"')
		self.assertTrue(etag2, "Part 2 ETag is empty")
		parts.append({"PartNumber": 2, "ETag": etag2})

		# Complete multipart upload
		complete_result = complete_multipart(
			asset_name=result["asset_name"],
			upload_id=result["upload_id"],
			parts=parts,
		)
		self.assertEqual(complete_result["status"], "ok")

		# Confirm upload
		confirm_result = confirm_upload(
			asset_name=result["asset_name"],
			file_size=total_size,
		)
		self.assertEqual(confirm_result["status"], "ok")

		# Verify asset is Ready
		asset = frappe.get_doc("VMS Asset", result["asset_name"])
		self.assertEqual(asset.status, "Ready")
		self.assertEqual(asset.file_size, total_size)

		# Cleanup
		from vms.r2 import delete_r2_object

		delete_r2_object(result["r2_key"])
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_multipart_complete_with_quoted_etags(self):
		"""complete_multipart should handle ETags wrapped in double quotes."""
		from vms.api import (
			MULTIPART_THRESHOLD,
			complete_multipart,
			get_part_upload_url,
			get_upload_url,
		)

		part_size = 5 * 1024 * 1024  # 5 MB minimum

		result = get_upload_url(
			file_name="quoted_etag_test.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		# Upload a single part
		part_url = get_part_upload_url(result["r2_key"], result["upload_id"], 1)["url"]
		resp = requests.put(
			part_url,
			data=b"\x00" * part_size,
			headers={"Content-Type": "video/mp4"},
			timeout=30,
		)
		self.assertIn(resp.status_code, (200, 201))
		raw_etag = resp.headers.get("ETag", "")

		# Deliberately wrap ETag in quotes (simulating browser behavior)
		quoted_etag = f'"{raw_etag.strip(chr(34))}"'
		parts = [{"PartNumber": 1, "ETag": quoted_etag}]

		# Should succeed — the API strips quotes
		complete_result = complete_multipart(
			asset_name=result["asset_name"],
			upload_id=result["upload_id"],
			parts=parts,
		)
		self.assertEqual(complete_result["status"], "ok")

		# Cleanup
		from vms.r2 import delete_r2_object

		delete_r2_object(result["r2_key"])
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_multipart_complete_with_json_string_parts(self):
		"""complete_multipart should accept parts as a JSON string (from frontend)."""
		from vms.api import (
			MULTIPART_THRESHOLD,
			complete_multipart,
			get_part_upload_url,
			get_upload_url,
		)

		part_size = 5 * 1024 * 1024

		result = get_upload_url(
			file_name="json_parts_test.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		part_url = get_part_upload_url(result["r2_key"], result["upload_id"], 1)["url"]
		resp = requests.put(
			part_url,
			data=b"\x00" * part_size,
			headers={"Content-Type": "video/mp4"},
			timeout=30,
		)
		self.assertIn(resp.status_code, (200, 201))
		etag = resp.headers.get("ETag", "").strip('"')

		# Pass parts as JSON string (like a real HTTP request would)
		parts_json = json.dumps([{"PartNumber": 1, "ETag": etag}])
		complete_result = complete_multipart(
			asset_name=result["asset_name"],
			upload_id=result["upload_id"],
			parts=parts_json,
		)
		self.assertEqual(complete_result["status"], "ok")

		# Cleanup
		from vms.r2 import delete_r2_object

		delete_r2_object(result["r2_key"])
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	# ------------------------------------------------------------------
	# Abort multipart
	# ------------------------------------------------------------------

	def test_abort_multipart(self):
		"""abort_multipart should clean up the upload and delete the asset."""
		from vms.api import MULTIPART_THRESHOLD, abort_multipart, get_upload_url

		result = get_upload_url(
			file_name="abort_test.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		# Asset should exist in Uploading status
		self.assertTrue(frappe.db.exists("VMS Asset", result["asset_name"]))

		abort_result = abort_multipart(
			asset_name=result["asset_name"],
			upload_id=result["upload_id"],
		)
		self.assertEqual(abort_result["status"], "ok")

		# Asset should be deleted
		self.assertFalse(frappe.db.exists("VMS Asset", result["asset_name"]))

	def test_abort_nonexistent_asset(self):
		"""abort_multipart should succeed silently for non-existent assets."""
		from vms.api import abort_multipart

		result = abort_multipart(
			asset_name="VMS-ASSET-NONEXISTENT",
			upload_id="fake-upload-id",
		)
		self.assertEqual(result["status"], "ok")

	# ------------------------------------------------------------------
	# Validation
	# ------------------------------------------------------------------

	def test_upload_rejects_invalid_category(self):
		"""get_upload_url should reject invalid categories."""
		from vms.api import get_upload_url

		with self.assertRaises(frappe.exceptions.ValidationError):
			get_upload_url(
				file_name="test.mp4",
				content_type="video/mp4",
				file_size=1024,
				project=self.project,
				category="InvalidCategory",
			)

	def test_upload_rejects_nonexistent_project(self):
		"""get_upload_url should reject non-existent projects."""
		from vms.api import get_upload_url

		with self.assertRaises(frappe.exceptions.ValidationError):
			get_upload_url(
				file_name="test.mp4",
				content_type="video/mp4",
				file_size=1024,
				project="NONEXISTENT-PROJECT",
			)

	def test_upload_to_inbox(self):
		"""get_upload_url should work without a project (Inbox upload)."""
		from vms.api import get_upload_url

		result = get_upload_url(
			file_name="inbox_test.mp4",
			content_type="video/mp4",
			file_size=1024,
		)

		self.assertIn("upload_url", result)
		asset = frappe.get_doc("VMS Asset", result["asset_name"])
		self.assertFalse(asset.project)

		# Cleanup
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_confirm_upload_rejects_non_uploading_asset(self):
		"""confirm_upload should reject assets not in 'Uploading' status."""
		from vms.api import confirm_upload, get_upload_url

		result = get_upload_url(
			file_name="confirm_reject_test.mp4",
			content_type="video/mp4",
			file_size=1024,
			project=self.project,
		)

		# Manually set to Ready
		frappe.db.set_value("VMS Asset", result["asset_name"], "status", "Ready")
		frappe.db.commit()

		with self.assertRaises(frappe.exceptions.ValidationError):
			confirm_upload(asset_name=result["asset_name"], file_size=1024)

		# Cleanup
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_complete_multipart_rejects_empty_parts(self):
		"""complete_multipart should reject an empty parts list."""
		from vms.api import MULTIPART_THRESHOLD, complete_multipart, get_upload_url

		result = get_upload_url(
			file_name="empty_parts_test.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		with self.assertRaises(frappe.exceptions.ValidationError):
			complete_multipart(
				asset_name=result["asset_name"],
				upload_id=result["upload_id"],
				parts=[],
			)

		# Cleanup
		from vms.r2 import abort_multipart_upload

		try:
			abort_multipart_upload(result["r2_key"], result["upload_id"])
		except Exception:
			pass
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_get_part_upload_url_rejects_invalid_part_number(self):
		"""get_part_upload_url should reject part_number < 1."""
		from vms.api import get_part_upload_url

		with self.assertRaises(frappe.exceptions.ValidationError):
			get_part_upload_url(r2_key="fake/key", upload_id="fake", part_number=0)

	def test_fail_upload_deletes_uploading_asset(self):
		"""fail_upload should delete assets in 'Uploading' status."""
		from vms.api import fail_upload, get_upload_url

		result = get_upload_url(
			file_name="fail_test.mp4",
			content_type="video/mp4",
			file_size=1024,
			project=self.project,
		)

		fail_result = fail_upload(asset_name=result["asset_name"])
		self.assertEqual(fail_result["status"], "ok")
		self.assertFalse(frappe.db.exists("VMS Asset", result["asset_name"]))

	# ------------------------------------------------------------------
	# CORS configuration
	# ------------------------------------------------------------------

	@unittest.skip("MinIO does not support PutBucketCors — tested manually against R2")
	def test_configure_bucket_cors(self):
		"""configure_bucket_cors should set CORS rules exposing ETag."""
		from vms.r2 import configure_bucket_cors, get_r2_client

		configure_bucket_cors()

		# Verify CORS was applied
		settings = frappe.get_single("VMS Settings")
		client = get_r2_client()
		cors = client.get_bucket_cors(Bucket=settings.r2_bucket_name)
		rules = cors.get("CORSRules", [])

		self.assertTrue(len(rules) > 0, "No CORS rules found on bucket")
		rule = rules[0]
		self.assertIn("ETag", rule.get("ExposeHeaders", []))

	# ------------------------------------------------------------------
	# Threshold
	# ------------------------------------------------------------------

	def test_threshold_is_2gb(self):
		"""MULTIPART_THRESHOLD should be 2 GB."""
		from vms.api import MULTIPART_THRESHOLD

		self.assertEqual(MULTIPART_THRESHOLD, 2 * 1024 * 1024 * 1024)

	def test_file_under_2gb_uses_single_put(self):
		"""Files under 2 GB should use single PUT, not multipart."""
		from vms.api import get_upload_url

		# 1.5 GB — under threshold
		result = get_upload_url(
			file_name="medium_file.mp4",
			content_type="video/mp4",
			file_size=int(1.5 * 1024 * 1024 * 1024),
			project=self.project,
		)

		self.assertFalse(result["multipart"])
		self.assertIn("upload_url", result)

		# Cleanup
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()

	def test_file_over_2gb_uses_multipart(self):
		"""Files over 2 GB should trigger multipart upload."""
		from vms.api import MULTIPART_THRESHOLD, get_upload_url

		result = get_upload_url(
			file_name="huge_file.mp4",
			content_type="video/mp4",
			file_size=MULTIPART_THRESHOLD + 1,
			project=self.project,
		)

		self.assertTrue(result["multipart"])
		self.assertIn("upload_id", result)

		# Cleanup
		from vms.r2 import abort_multipart_upload

		try:
			abort_multipart_upload(result["r2_key"], result["upload_id"])
		except Exception:
			pass
		frappe.delete_doc("VMS Asset", result["asset_name"], ignore_permissions=True)
		frappe.db.commit()
