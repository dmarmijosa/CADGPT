"""Unit tests for binary STL and CAD magic header integrity validators."""
import io
import math
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

from cadgpt_agent.integrity import (
    validate_binary_stl,
    validate_dwg,
    validate_fcstd,
    validate_blend,
    validate_cad_format,
    validate_file_integrity,
    DWG_SIGNATURES,
)


def _make_stl_bytes(
    facets: int = 1,
    header_prefix: bytes = b"\x00" * 6,
    header_fill: bytes = b"\x00" * 74,
    facet_coords=None,
    extra_bytes: bytes = b"",
) -> bytes:
    header = (header_prefix + header_fill)[:80]
    count = struct.pack("<I", facets)
    data = header + count

    if facet_coords is not None:
        data += facet_coords
    else:
        for i in range(facets):
            # 12 floats: nx, ny, nz, x1, y1, z1, x2, y2, z2, x3, y3, z3, then uint16 attr
            data += struct.pack(
                "<12fH",
                0.0, 0.0, 1.0,
                0.0, 0.0, 0.0,
                10.0 + i, 0.0, 0.0,
                0.0, 10.0, 0.0,
                0,
            )
    return data + extra_bytes


def _make_fcstd_bytes(include_document_xml: bool = True) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        if include_document_xml:
            zf.writestr("Document.xml", "<AppGeoDocument/>")
        zf.writestr("GuiDocument.xml", "<GuiDocument/>")
    return buf.getvalue()


class BinaryStlValidatorTests(unittest.TestCase):
    """Deep binary STL structural and coordinate validation tests."""

    def test_valid_single_facet_stl_passes(self):
        payload = _make_stl_bytes(facets=1)
        self.assertEqual(len(payload), 84 + 50)
        result = validate_binary_stl(payload)
        self.assertEqual(result, 1)

    def test_valid_multi_facet_stl_passes(self):
        payload = _make_stl_bytes(facets=50)
        self.assertEqual(len(payload), 84 + 50 * 50)
        result = validate_binary_stl(payload)
        self.assertEqual(result, 50)

    def test_valid_zero_facet_stl_passes(self):
        payload = _make_stl_bytes(facets=0)
        self.assertEqual(len(payload), 84)
        result = validate_binary_stl(payload)
        self.assertEqual(result, 0)

    def test_valid_stl_from_file_path(self):
        payload = _make_stl_bytes(facets=3)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "test.stl"
            p.write_bytes(payload)
            self.assertEqual(validate_binary_stl(p), 3)
            self.assertEqual(validate_binary_stl(str(p)), 3)

    def test_valid_stl_from_stream(self):
        payload = _make_stl_bytes(facets=2)
        stream = io.BytesIO(payload)
        self.assertEqual(validate_binary_stl(stream), 2)

    def test_too_small_file_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(b"\x00" * 83)
        self.assertIn("too small", str(ctx.exception).lower())

    def test_ascii_solid_prefix_rejected(self):
        payload = _make_stl_bytes(facets=1, header_prefix=b"solid ")
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn('solid ', str(ctx.exception))

    def test_truncated_facets_size_mismatch_rejected(self):
        # Claims 10 facets (584 bytes), but only provides 4 facets worth of bytes
        payload = _make_stl_bytes(facets=10)[: 84 + 50 * 4]
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("size mismatch", str(ctx.exception).lower())

    def test_extra_trailing_bytes_size_mismatch_rejected(self):
        payload = _make_stl_bytes(facets=1, extra_bytes=b"\x00")
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("size mismatch", str(ctx.exception).lower())

    def test_nan_coordinate_rejected(self):
        corrupt_facet = struct.pack(
            "<12fH",
            0.0, 0.0, 1.0,
            float("nan"), 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=corrupt_facet)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("non-finite", str(ctx.exception).lower())

    def test_positive_infinity_coordinate_rejected(self):
        corrupt_facet = struct.pack(
            "<12fH",
            0.0, 0.0, 1.0,
            0.0, 0.0, 0.0,
            float("inf"), 0.0, 0.0,
            0.0, 1.0, 0.0,
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=corrupt_facet)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("non-finite", str(ctx.exception).lower())

    def test_negative_infinity_coordinate_rejected(self):
        corrupt_facet = struct.pack(
            "<12fH",
            float("-inf"), 0.0, 1.0,
            0.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=corrupt_facet)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("non-finite", str(ctx.exception).lower())

    def test_degenerate_all_zero_coordinates_rejected(self):
        all_zero_facet = struct.pack(
            "<12fH",
            0.0, 0.0, 1.0,  # normal
            0.0, 0.0, 0.0,  # v1 all zero
            0.0, 0.0, 0.0,  # v2 all zero
            0.0, 0.0, 0.0,  # v3 all zero
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=all_zero_facet)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("degenerate all-zero", str(ctx.exception).lower())

    def test_coordinate_exceeding_positive_bounds_rejected(self):
        out_of_bounds = struct.pack(
            "<12fH",
            0.0, 0.0, 1.0,
            100000.1, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=out_of_bounds)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("out of engineering bounds", str(ctx.exception).lower())

    def test_coordinate_exceeding_negative_bounds_rejected(self):
        out_of_bounds = struct.pack(
            "<12fH",
            0.0, 0.0, 1.0,
            -100000.5, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0,
        )
        payload = _make_stl_bytes(facets=1, facet_coords=out_of_bounds)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload)
        self.assertIn("out of engineering bounds", str(ctx.exception).lower())

    def test_max_bytes_cap_enforced(self):
        payload = _make_stl_bytes(facets=1)
        with self.assertRaises(ValueError) as ctx:
            validate_binary_stl(payload, max_bytes=len(payload) - 1)
        self.assertIn("exceeds maximum allowable size", str(ctx.exception).lower())


class MagicHeaderValidatorTests(unittest.TestCase):
    """Magic byte check tests for DWG, FCStd, and Blend formats."""

    def test_all_dwg_valid_signatures_pass(self):
        for sig in DWG_SIGNATURES:
            buf = sig + b"\x00" * 10
            self.assertEqual(validate_dwg(buf), sig.decode("ascii"))

    def test_blank_dwg_fixture_passes(self):
        blank_dwg = Path(__file__).resolve().parent.parent / "cadgpt_agent" / "autocad" / "blank.dwg"
        if blank_dwg.is_file():
            self.assertEqual(validate_dwg(blank_dwg), "AC1032")

    def test_invalid_dwg_signature_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_dwg(b"AC1009_invalid")
        self.assertIn("invalid dwg signature", str(ctx.exception).lower())

    def test_dwg_too_short_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_dwg(b"AC10")
        self.assertIn("too small", str(ctx.exception).lower())

    def test_valid_fcstd_passes(self):
        payload = _make_fcstd_bytes(include_document_xml=True)
        self.assertTrue(validate_fcstd(payload))

    def test_fcstd_missing_document_xml_rejected(self):
        payload = _make_fcstd_bytes(include_document_xml=False)
        with self.assertRaises(ValueError) as ctx:
            validate_fcstd(payload)
        self.assertIn("missing document.xml", str(ctx.exception).lower())

    def test_fcstd_missing_zip_magic_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_fcstd(b"NOT_ZIP_DATA")
        self.assertIn("missing zip magic", str(ctx.exception).lower())

    def test_fcstd_corrupt_zip_rejected(self):
        # Begins with PK\x03\x04 but corrupted afterwards
        corrupt = b"PK\x03\x04" + b"\xff" * 20
        with self.assertRaises(ValueError) as ctx:
            validate_fcstd(corrupt)
        self.assertIn("corrupt zip structure", str(ctx.exception).lower())

    def test_valid_blend_signatures_pass(self):
        valid_headers = [
            b"BLENDER-v400",
            b"BLENDER_v306",
            b"BLENDER-V293",
            b"BLENDER_V500",
        ]
        for h in valid_headers:
            buf = h + b"\x00" * 20
            self.assertEqual(validate_blend(buf), h.decode("ascii"))

    def test_invalid_blend_signatures_rejected(self):
        invalid_headers = [
            b"BLENDER-v40\x00",  # missing digit
            b"BLENDER-abcd",      # letters instead of version number
            b"NOTBLENDER40",      # wrong prefix
            b"BLENDER.v400",      # dot instead of dash/underscore
        ]
        for h in invalid_headers:
            with self.assertRaises(ValueError) as ctx:
                validate_blend(h)
            self.assertIn("invalid blender blend header", str(ctx.exception).lower())

    def test_blend_too_short_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_blend(b"BLENDER-v4")
        self.assertIn("too small", str(ctx.exception).lower())


class UnifiedIntegrityDispatcherTests(unittest.TestCase):
    """Tests for validate_cad_format and validate_file_integrity."""

    def test_dispatcher_by_format(self):
        stl_payload = _make_stl_bytes(facets=1)
        self.assertEqual(validate_cad_format(stl_payload, "stl"), 1)

        dwg_payload = b"AC1032" + b"\x00" * 10
        self.assertEqual(validate_cad_format(dwg_payload, ".dwg"), "AC1032")

        fcstd_payload = _make_fcstd_bytes(include_document_xml=True)
        self.assertTrue(validate_cad_format(fcstd_payload, "FCStd"))

        blend_payload = b"BLENDER-v400" + b"\x00" * 10
        self.assertEqual(validate_cad_format(blend_payload, ".blend"), "BLENDER-v400")

    def test_dispatcher_unsupported_format_raises(self):
        with self.assertRaises(ValueError) as ctx:
            validate_cad_format(b"data", "step")
        self.assertIn("unsupported cad format", str(ctx.exception).lower())

    def test_validate_file_integrity_with_real_files(self):
        with tempfile.TemporaryDirectory() as d:
            stl_path = Path(d) / "model.stl"
            stl_path.write_bytes(_make_stl_bytes(facets=2))
            self.assertEqual(validate_file_integrity(stl_path), 2)

            dwg_path = Path(d) / "drawing.dwg"
            dwg_path.write_bytes(b"AC1032" + b"\x00" * 10)
            self.assertEqual(validate_file_integrity(dwg_path), "AC1032")

            fcstd_path = Path(d) / "part.fcstd"
            fcstd_path.write_bytes(_make_fcstd_bytes(include_document_xml=True))
            self.assertTrue(validate_file_integrity(fcstd_path))

            blend_path = Path(d) / "scene.blend"
            blend_path.write_bytes(b"BLENDER-v400" + b"\x00" * 10)
            self.assertEqual(validate_file_integrity(blend_path), "BLENDER-v400")

    def test_validate_file_integrity_missing_file_raises_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            validate_file_integrity("/non/existent/path.stl")


if __name__ == "__main__":
    unittest.main()
