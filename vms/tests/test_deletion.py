# Copyright (c) 2026, BWH and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime


def _make_project(name="Deletion Test Project"):
	"""Get or create a test project."""
	existing = frappe.db.get_value("VMS Project", {"project_name": name}, "name")
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "VMS Project",
			"project_name": name,
			"owner_user": "Administrator",
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def _make_asset(project=None, file_name="test.mp4", status="Ready"):
	"""Create a test VMS Asset."""
	doc = frappe.get_doc(
		{
			"doctype": "VMS Asset",
			"file_name": file_name,
			"r2_key": f"test/{frappe.generate_hash(length=8)}.mp4",
			"file_type": "video/mp4",
			"status": status,
			"category": "Footage",
			"uploaded_by": "Administrator",
			"project": project,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def _make_folder(project, folder_name="Test Folder"):
	"""Create a test VMS Folder."""
	doc = frappe.get_doc(
		{
			"doctype": "VMS Folder",
			"folder_name": folder_name,
			"project": project,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def _make_comment(asset, text="test comment", parent_comment=None):
	"""Create a test VMS Review Comment."""
	doc = frappe.get_doc(
		{
			"doctype": "VMS Review Comment",
			"asset": asset,
			"comment_text": text,
			"commented_by": "Administrator",
			"parent_comment": parent_comment,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


class TestPurgeRegression(IntegrationTestCase):
	"""CRITICAL: Regression tests for the purge bug that wiped 783 assets."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Purge Test Project")

	def test_purge_skips_assets_with_null_deleted_at(self):
		"""Normal assets (deleted_at=NULL) must survive purge."""
		a1 = _make_asset(self.project, "purge_null_1.mp4")
		a2 = _make_asset(self.project, "purge_null_2.mp4")
		a3 = _make_asset(self.project, "purge_null_3.mp4")

		from vms.deletion import purge_expired_trash

		# Set retention to 7 days
		frappe.db.set_single_value("VMS Settings", "trash_retention_days", "7")
		frappe.db.commit()

		purge_expired_trash()

		# All three must still exist
		self.assertTrue(frappe.db.exists("VMS Asset", a1))
		self.assertTrue(frappe.db.exists("VMS Asset", a2))
		self.assertTrue(frappe.db.exists("VMS Asset", a3))

	def test_purge_skips_assets_with_zero_deleted_at(self):
		"""Assets with deleted_at='0000-00-00' (migration artifact) must survive purge."""
		a1 = _make_asset(self.project, "purge_zero.mp4")

		# Simulate the migration bug: set deleted_at to zero datetime via SQL
		frappe.db.sql("UPDATE `tabVMS Asset` SET deleted_at = '0000-00-00 00:00:00' WHERE name = %s", a1)
		frappe.db.commit()

		from vms.deletion import purge_expired_trash

		frappe.db.set_single_value("VMS Settings", "trash_retention_days", "7")
		frappe.db.commit()

		purge_expired_trash()

		# Must still exist (the filter uses "is set" which should catch proper datetimes only)
		# Note: the sanitize patch should have cleaned this, but belt-and-suspenders
		self.assertTrue(frappe.db.exists("VMS Asset", a1))

	def test_purge_only_deletes_expired_assets(self):
		"""Only assets trashed beyond the retention period should be purged."""
		old_asset = _make_asset(self.project, "purge_old.mp4")
		recent_asset = _make_asset(self.project, "purge_recent.mp4")

		# Trash old asset 10 days ago
		old_time = add_days(now_datetime(), -10)
		frappe.db.set_value(
			"VMS Asset",
			old_asset,
			{
				"deleted_at": old_time,
				"deleted_by": "Administrator",
			},
		)

		# Trash recent asset 1 day ago
		recent_time = add_days(now_datetime(), -1)
		frappe.db.set_value(
			"VMS Asset",
			recent_asset,
			{
				"deleted_at": recent_time,
				"deleted_by": "Administrator",
			},
		)
		frappe.db.commit()

		from vms.deletion import purge_expired_trash

		frappe.db.set_single_value("VMS Settings", "trash_retention_days", "7")
		frappe.db.commit()

		purge_expired_trash()

		# Old asset should be gone, recent should survive
		self.assertFalse(frappe.db.exists("VMS Asset", old_asset))
		self.assertTrue(frappe.db.exists("VMS Asset", recent_asset))

	def test_purge_skips_when_retention_is_zero(self):
		"""retention=0 (Never) means no auto-purge, even for old trashed items."""
		asset = _make_asset(self.project, "purge_never.mp4")

		# Trash it 100 days ago
		old_time = add_days(now_datetime(), -100)
		frappe.db.set_value(
			"VMS Asset",
			asset,
			{
				"deleted_at": old_time,
				"deleted_by": "Administrator",
			},
		)
		frappe.db.commit()

		from vms.deletion import purge_expired_trash

		frappe.db.set_single_value("VMS Settings", "trash_retention_days", "0")
		frappe.db.commit()

		purge_expired_trash()

		# Must survive because retention is 0 (Never)
		self.assertTrue(frappe.db.exists("VMS Asset", asset))


class TestAssetSoftDelete(IntegrationTestCase):
	"""Tests for asset soft-delete and restore."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Asset Delete Project")

	def test_soft_delete_sets_deleted_at_and_deleted_by(self):
		asset = _make_asset(self.project, "soft_del.mp4")

		from vms.deletion import soft_delete_asset

		soft_delete_asset(asset)

		doc = frappe.get_doc("VMS Asset", asset)
		self.assertIsNotNone(doc.deleted_at)
		self.assertEqual(doc.deleted_by, "Administrator")

	def test_soft_delete_cascades_to_comments(self):
		asset = _make_asset(self.project, "cascade.mp4")
		c1 = _make_comment(asset, "root comment")
		c2 = _make_comment(asset, "reply", parent_comment=c1)

		from vms.deletion import soft_delete_asset

		soft_delete_asset(asset)

		# Both comments should be soft-deleted with deleted_via set
		for cn in [c1, c2]:
			comment = frappe.get_doc("VMS Review Comment", cn)
			self.assertIsNotNone(comment.deleted_at)
			self.assertEqual(comment.deleted_via, f"asset:{asset}")

	def test_soft_deleted_asset_excluded_from_listings(self):
		asset = _make_asset(self.project, "excluded.mp4")

		from vms.deletion import soft_delete_asset

		soft_delete_asset(asset)

		# The standard filter should exclude it
		assets = frappe.get_all(
			"VMS Asset",
			filters={"project": self.project, "deleted_at": ["is", "not set"]},
			pluck="name",
		)
		self.assertNotIn(asset, assets)

	def test_hard_delete_removes_doc_and_comments(self):
		asset = _make_asset(self.project, "hard_del.mp4")
		c1 = _make_comment(asset, "to be deleted")

		from vms.deletion import hard_delete_asset, soft_delete_asset

		soft_delete_asset(asset)
		hard_delete_asset(asset)

		self.assertFalse(frappe.db.exists("VMS Asset", asset))
		self.assertFalse(frappe.db.exists("VMS Review Comment", c1))

	def test_hard_delete_requires_trashed_state(self):
		asset = _make_asset(self.project, "not_trashed.mp4")

		from vms.deletion import hard_delete_asset

		with self.assertRaises(frappe.ValidationError):
			hard_delete_asset(asset)

	def test_double_soft_delete_is_idempotent(self):
		asset = _make_asset(self.project, "double_del.mp4")

		from vms.deletion import soft_delete_asset

		soft_delete_asset(asset)
		original_deleted_at = frappe.db.get_value("VMS Asset", asset, "deleted_at")

		# Second call should not overwrite
		soft_delete_asset(asset)
		current_deleted_at = frappe.db.get_value("VMS Asset", asset, "deleted_at")

		self.assertEqual(str(original_deleted_at), str(current_deleted_at))


class TestAssetRestore(IntegrationTestCase):
	"""Tests for asset restore."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Asset Restore Project")

	def test_restore_clears_deleted_fields(self):
		asset = _make_asset(self.project, "restore.mp4")

		from vms.deletion import restore_asset, soft_delete_asset

		soft_delete_asset(asset)
		restore_asset(asset)

		doc = frappe.get_doc("VMS Asset", asset)
		self.assertIsNone(doc.deleted_at)
		self.assertIsNone(doc.deleted_by)

	def test_restore_restores_cascade_deleted_comments(self):
		asset = _make_asset(self.project, "restore_cascade.mp4")
		c1 = _make_comment(asset, "cascade comment")

		from vms.deletion import restore_asset, soft_delete_asset

		soft_delete_asset(asset)

		# Verify comment was cascade-deleted
		self.assertIsNotNone(frappe.db.get_value("VMS Review Comment", c1, "deleted_at"))

		restore_asset(asset)

		# Comment should be restored
		comment = frappe.get_doc("VMS Review Comment", c1)
		self.assertIsNone(comment.deleted_at)
		self.assertIsNone(comment.deleted_via)

	def test_restore_does_not_restore_individually_deleted_comments(self):
		asset = _make_asset(self.project, "restore_indiv.mp4")
		c1 = _make_comment(asset, "individually deleted")

		from vms.deletion import restore_asset, soft_delete_asset, soft_delete_comment

		# Individually delete the comment first
		soft_delete_comment(c1)

		# Then soft-delete the asset
		soft_delete_asset(asset)

		# Restore the asset
		restore_asset(asset)

		# The individually deleted comment should NOT be restored
		comment = frappe.get_doc("VMS Review Comment", c1)
		self.assertIsNotNone(comment.deleted_at)


class TestFolderSoftDelete(IntegrationTestCase):
	"""Tests for folder soft-delete and restore."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Folder Delete Project")

	def test_soft_delete_folder_sets_deleted_at(self):
		folder = _make_folder(self.project, "del_folder")

		from vms.deletion import soft_delete_folder

		soft_delete_folder(folder)

		doc = frappe.get_doc("VMS Folder", folder)
		self.assertIsNotNone(doc.deleted_at)
		self.assertEqual(doc.deleted_by, "Administrator")

	def test_soft_delete_folder_does_not_move_assets(self):
		folder = _make_folder(self.project, "keep_assets_folder")
		asset = _make_asset(self.project, "folder_asset.mp4")
		frappe.db.set_value("VMS Asset", asset, "folder", folder)
		frappe.db.commit()

		from vms.deletion import soft_delete_folder

		soft_delete_folder(folder)

		# Asset should still reference the folder
		asset_folder = frappe.db.get_value("VMS Asset", asset, "folder")
		self.assertEqual(asset_folder, folder)

	def test_restore_folder_reappears(self):
		folder = _make_folder(self.project, "restore_folder")

		from vms.deletion import restore_folder, soft_delete_folder

		soft_delete_folder(folder)
		restore_folder(folder)

		doc = frappe.get_doc("VMS Folder", folder)
		self.assertIsNone(doc.deleted_at)
		self.assertIsNone(doc.deleted_by)

	def test_hard_delete_folder_clears_asset_folder_field(self):
		folder = _make_folder(self.project, "hard_del_folder")
		asset = _make_asset(self.project, "orphan_asset.mp4")
		frappe.db.set_value("VMS Asset", asset, "folder", folder)
		frappe.db.commit()

		from vms.deletion import hard_delete_folder, soft_delete_folder

		soft_delete_folder(folder)
		hard_delete_folder(folder)

		self.assertFalse(frappe.db.exists("VMS Folder", folder))
		asset_folder = frappe.db.get_value("VMS Asset", asset, "folder")
		self.assertIsNone(asset_folder)


class TestCommentSoftDelete(IntegrationTestCase):
	"""Tests for comment soft-delete."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Comment Delete Project")

	def test_soft_delete_comment_cascades_to_replies(self):
		asset = _make_asset(self.project, "comment_cascade.mp4")
		root = _make_comment(asset, "root")
		reply = _make_comment(asset, "reply", parent_comment=root)

		from vms.deletion import soft_delete_comment

		soft_delete_comment(root)

		root_doc = frappe.get_doc("VMS Review Comment", root)
		reply_doc = frappe.get_doc("VMS Review Comment", reply)

		self.assertIsNotNone(root_doc.deleted_at)
		self.assertIsNotNone(reply_doc.deleted_at)
		self.assertEqual(reply_doc.deleted_via, f"comment:{root}")

	def test_soft_deleted_comment_excluded_from_get_comments(self):
		asset = _make_asset(self.project, "comment_exclude.mp4")
		c1 = _make_comment(asset, "visible comment")
		c2 = _make_comment(asset, "hidden comment")

		from vms.deletion import soft_delete_comment

		soft_delete_comment(c2)

		# Simulate the get_comments filter
		visible = frappe.get_all(
			"VMS Review Comment",
			filters={"asset": asset, "deleted_at": ["is", "not set"]},
			pluck="name",
		)
		self.assertIn(c1, visible)
		self.assertNotIn(c2, visible)


class TestSettingsRetention(IntegrationTestCase):
	"""Tests for retention settings behavior."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.project = _make_project("Settings Test Project")

	def test_zero_retention_disables_compress_cleanup(self):
		"""tools_retention_days=0 means compress jobs are never auto-cleaned."""
		if not frappe.db.exists("DocType", "VMS Compress Job"):
			self.skipTest("VMS Compress Job DocType not found")

		frappe.db.set_single_value("VMS Settings", "tools_retention_days", "0")
		frappe.db.commit()

		from vms.deletion import cleanup_expired_compress_jobs

		# Should return early without deleting anything
		cleanup_expired_compress_jobs()

	def test_empty_trash_works_regardless_of_retention(self):
		"""Manual 'Empty Trash' should work even when retention is 0 (Never)."""
		asset = _make_asset(self.project, "manual_empty.mp4")

		from vms.deletion import empty_all_trash, soft_delete_asset

		soft_delete_asset(asset)

		frappe.db.set_single_value("VMS Settings", "trash_retention_days", "0")
		frappe.db.commit()

		result = empty_all_trash()
		self.assertGreaterEqual(result["asset_count"], 1)
		self.assertFalse(frappe.db.exists("VMS Asset", asset))
