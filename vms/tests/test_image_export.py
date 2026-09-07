# Copyright (c) 2026, BWH and Contributors
# See license.txt

import io
import os
import unittest

from PIL import Image

from vms.image_export import (
	TARGET_FORMATS,
	_encode,
	converted_file_name,
	is_convertible_still,
	is_heic,
)


class TestConvertibleStillDetection(unittest.TestCase):
	def test_raw_is_convertible(self):
		self.assertTrue(is_convertible_still("image/x-sony-arw", "DSC02816.ARW"))
		self.assertTrue(is_convertible_still("application/octet-stream", "DSC02816.arw"))

	def test_heic_is_convertible_by_extension_or_mime(self):
		self.assertTrue(is_heic(None, "IMG_0001.HEIC"))
		self.assertTrue(is_heic("image/heif", "renamed"))
		self.assertTrue(is_convertible_still(None, "IMG_0001.heic"))

	def test_ordinary_images_are_not_convertible(self):
		for file_name in ("photo.jpg", "photo.png", "clip.mp4", "notes.txt", "noext"):
			self.assertFalse(is_convertible_still("image/jpeg", file_name))

	def test_missing_values(self):
		self.assertFalse(is_convertible_still(None, None))


class TestConvertedFileName(unittest.TestCase):
	def test_swaps_the_extension(self):
		self.assertEqual(converted_file_name("DSC02816.ARW", "jpg"), "DSC02816.jpg")
		self.assertEqual(converted_file_name("IMG_0001.heic", "png"), "IMG_0001.png")

	def test_keeps_dotted_stems(self):
		self.assertEqual(converted_file_name("beach.trip.2026.arw", "jpg"), "beach.trip.2026.jpg")

	def test_handles_no_extension(self):
		self.assertEqual(converted_file_name("scan", "jpg"), "scan.jpg")


class TestEncode(unittest.TestCase):
	def _decode(self, data):
		img = Image.open(io.BytesIO(data))
		img.load()
		return img

	def test_jpeg_flattens_alpha_onto_white(self):
		src = Image.new("RGBA", (8, 8), (0, 128, 255, 0))
		out = self._decode(_encode(src, TARGET_FORMATS["jpeg"][0]))
		self.assertEqual(out.format, "JPEG")
		self.assertEqual(out.mode, "RGB")
		self.assertEqual(out.getpixel((0, 0)), (255, 255, 255))

	def test_png_keeps_alpha(self):
		src = Image.new("RGBA", (8, 8), (10, 20, 30, 40))
		out = self._decode(_encode(src, TARGET_FORMATS["png"][0]))
		self.assertEqual(out.format, "PNG")
		self.assertEqual(out.mode, "RGBA")
		self.assertEqual(out.getpixel((0, 0)), (10, 20, 30, 40))

	def test_png_stays_rgb_when_opaque(self):
		src = Image.new("RGB", (8, 8), (5, 5, 5))
		out = self._decode(_encode(src, TARGET_FORMATS["png"][0]))
		self.assertEqual(out.mode, "RGB")


def _sample(env):
	path = os.environ.get(env)
	return path if path and os.path.exists(path) else None


@unittest.skipUnless(_sample("VMS_TEST_ARW"), "set VMS_TEST_ARW to a .arw file to run")
class TestArwExport(unittest.TestCase):
	def test_arw_converts_to_a_usable_jpeg(self):
		from vms.image_export import _render

		img = _render(_sample("VMS_TEST_ARW"), "image/x-sony-arw", "sample.arw")
		data = _encode(img, TARGET_FORMATS["jpeg"][0])
		out = Image.open(io.BytesIO(data))
		self.assertEqual(out.format, "JPEG")
		self.assertGreaterEqual(out.width, 640)


@unittest.skipUnless(_sample("VMS_TEST_HEIC"), "set VMS_TEST_HEIC to a .heic file to run")
class TestHeicExport(unittest.TestCase):
	def test_heic_converts_to_a_usable_png(self):
		from vms.image_export import _render

		img = _render(_sample("VMS_TEST_HEIC"), "image/heic", "sample.heic")
		data = _encode(img, TARGET_FORMATS["png"][0])
		out = Image.open(io.BytesIO(data))
		self.assertEqual(out.format, "PNG")
		self.assertGreaterEqual(out.width, 320)
