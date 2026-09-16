"""Unit tests for agent/cadgpt_agent/vision.py image-to-CAD CV pipeline."""
import base64
import math
import unittest

import cv2
import numpy as np

from cadgpt_agent.vision import (
    binarize_image,
    calibrate_and_transform_coordinates,
    decode_image_payload,
    extract_contours_and_holes,
    polygon_signed_area,
    process_image,
)


def make_test_image_b64(
    width: int = 400,
    height: int = 400,
    outer_box: tuple[int, int, int, int] = (50, 50, 350, 350),
    holes: list[tuple[int, int, int, int]] | None = None,
    bg_color: int = 255,
    fg_color: int = 0,
    as_data_uri: bool = False,
    rotated_deg: float = 0.0,
) -> str:
    """Create a synthetic binary/grayscale test image and return base64 or Data URI."""
    img = np.full((height, width), bg_color, dtype=np.uint8)

    if rotated_deg != 0.0:
        # Create a rotated rectangle to introduce staircase quantization
        cx, cy = (outer_box[0] + outer_box[2]) // 2, (outer_box[1] + outer_box[3]) // 2
        bw, bh = outer_box[2] - outer_box[0], outer_box[3] - outer_box[1]
        rect = ((cx, cy), (bw, bh), rotated_deg)
        box = cv2.boxPoints(rect)
        box = np.int32(box)
        cv2.drawContours(img, [box], 0, fg_color, -1)
    else:
        cv2.rectangle(img, (outer_box[0], outer_box[1]), (outer_box[2], outer_box[3]), fg_color, -1)

    if holes:
        for h in holes:
            cv2.rectangle(img, (h[0], h[1]), (h[2], h[3]), bg_color, -1)

    _, buf = cv2.imencode(".png", img)
    raw_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    if as_data_uri:
        return f"data:image/png;base64,{raw_b64}"
    return raw_b64


class VisionDecodeTests(unittest.TestCase):
    def test_decode_raw_base64_valid(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        self.assertIsInstance(gray, np.ndarray)
        self.assertEqual(gray.shape, (400, 400))
        self.assertEqual(gray.dtype, np.uint8)

    def test_decode_data_uri_valid(self):
        data_uri = make_test_image_b64(as_data_uri=True)
        gray = decode_image_payload(data_uri)
        self.assertIsInstance(gray, np.ndarray)
        self.assertEqual(gray.shape, (400, 400))

    def test_decode_rejects_corrupted_base64(self):
        with self.assertRaises(ValueError) as ctx:
            decode_image_payload("this_is_not_valid_base64_content_at_all!!==")
        self.assertIn("Corrupted or invalid base64", str(ctx.exception))

    def test_decode_rejects_short_payload(self):
        with self.assertRaises(ValueError) as ctx:
            decode_image_payload("abc123==")
        self.assertIn("at least 20 characters", str(ctx.exception))

    def test_decode_rejects_non_string(self):
        with self.assertRaises(ValueError):
            decode_image_payload(12345)  # type: ignore

    def test_decode_rejects_malformed_data_uri(self):
        with self.assertRaises(ValueError) as ctx:
            decode_image_payload("data:image/png;base64_without_comma_separator_123456789")
        self.assertIn("missing comma separator", str(ctx.exception))

    def test_decode_transparent_png_composited_on_white(self):
        # 4-channel BGRA image with transparent background
        rgba = np.zeros((100, 100, 4), dtype=np.uint8)
        # Foreground square with alpha 255
        rgba[20:80, 20:80, :3] = 0  # Black foreground
        rgba[20:80, 20:80, 3] = 255  # Opaque
        # Background has alpha 0
        _, buf = cv2.imencode(".png", rgba)
        b64 = base64.b64encode(buf.tobytes()).decode("ascii")
        gray = decode_image_payload(b64)
        self.assertEqual(gray.shape, (100, 100))
        # Background should be white (255)
        self.assertEqual(gray[5, 5], 255)
        # Foreground should be black (0)
        self.assertEqual(gray[50, 50], 0)


class VisionThresholdTests(unittest.TestCase):
    def test_otsu_threshold(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        binary = binarize_image(gray, threshold_mode="otsu", invert=False)
        self.assertEqual(binary.shape, (400, 400))
        # Foreground should be 255
        self.assertEqual(binary[200, 200], 255)
        # Background should be 0
        self.assertEqual(binary[10, 10], 0)

    def test_adaptive_threshold(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        binary = binarize_image(gray, threshold_mode="adaptive", invert=False)
        self.assertEqual(binary.shape, (400, 400))
        self.assertIn(binary[200, 200], (0, 255))

    def test_canny_threshold(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        binary = binarize_image(gray, threshold_mode="canny", invert=False)
        self.assertEqual(binary.shape, (400, 400))
        # Edge along rectangle boundary (50, 50) should be dilated/active
        self.assertTrue(np.any(binary[48:53, 48:53] > 0))

    def test_invert_flag(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        bin_normal = binarize_image(gray, threshold_mode="otsu", invert=False)
        bin_inverted = binarize_image(gray, threshold_mode="otsu", invert=True)
        self.assertTrue(np.array_equal(bin_inverted, cv2.bitwise_not(bin_normal)))

    def test_unsupported_threshold_mode(self):
        b64 = make_test_image_b64()
        gray = decode_image_payload(b64)
        with self.assertRaises(ValueError) as ctx:
            binarize_image(gray, threshold_mode="magic_wand")
        self.assertIn("Unsupported threshold mode", str(ctx.exception))


class VisionHierarchyAndHolesTests(unittest.TestCase):
    def test_single_outer_boundary_no_holes(self):
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350), holes=None)
        res = process_image(b64, threshold_mode="otsu")
        self.assertIn("outer_boundary", res)
        self.assertIn("holes", res)
        self.assertEqual(len(res["holes"]), 0)
        self.assertGreaterEqual(len(res["outer_boundary"]), 3)

    def test_nested_through_holes_detected(self):
        # 1 outer plate with 2 through holes
        holes = [(100, 100, 150, 150), (220, 220, 280, 280)]
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350), holes=holes)
        res = process_image(b64, threshold_mode="otsu")
        self.assertIn("outer_boundary", res)
        self.assertEqual(len(res["holes"]), 2)
        for h in res["holes"]:
            self.assertGreaterEqual(len(h), 3)

    def test_winding_order(self):
        holes = [(100, 100, 200, 200)]
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350), holes=holes)
        res = process_image(b64, threshold_mode="otsu")
        # Outer boundary must be CCW (signed area > 0)
        outer_area = polygon_signed_area(res["outer_boundary"])
        self.assertGreater(outer_area, 0, "Outer boundary must have positive signed area (CCW)")
        # Holes must be CW (signed area < 0)
        hole_area = polygon_signed_area(res["holes"][0])
        self.assertLess(hole_area, 0, "Inner hole must have negative signed area (CW)")

    def test_douglas_peucker_reduction_exceeds_60_percent(self):
        # A rotated rectangle produces many staircase contour points
        b64 = make_test_image_b64(outer_box=(60, 60, 340, 340), rotated_deg=25.0)
        gray = decode_image_payload(b64)
        binary = binarize_image(gray, threshold_mode="otsu")
        root_pts, _, raw_count = extract_contours_and_holes(binary, tolerance=0.005)
        simplified_count = len(root_pts)
        reduction = (raw_count - simplified_count) / raw_count
        self.assertGreaterEqual(
            reduction,
            0.60,
            f"Expected at least 60% reduction, got {reduction * 100:.1f}% ({raw_count} -> {simplified_count})",
        )


class VisionMetricCalibrationTests(unittest.TestCase):
    def test_width_reference_dimension(self):
        # Outer box is 300 px wide (50 to 350)
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350))
        ref = {"type": "width", "value_mm": 150.0}
        res = process_image(b64, threshold_mode="otsu", reference_dimension=ref)
        # S = 150.0 / 300.0 = 0.5 mm/px
        self.assertAlmostEqual(res["scaling_factor"], 0.5, places=2)
        self.assertAlmostEqual(res["bounds_mm"]["width"], 150.0, delta=1.0)

    def test_height_reference_dimension(self):
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 250))  # height 200 px
        ref = {"type": "height", "value_mm": 100.0}
        res = process_image(b64, threshold_mode="otsu", reference_dimension=ref)
        self.assertAlmostEqual(res["scaling_factor"], 0.5, places=2)
        self.assertAlmostEqual(res["bounds_mm"]["height"], 100.0, delta=1.0)

    def test_points_reference_dimension(self):
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350))
        # 200 px distance between (100, 100) and (300, 100)
        ref = {"type": "points", "value_mm": 50.0, "points": [[100, 100], [300, 100]]}
        res = process_image(b64, threshold_mode="otsu", reference_dimension=ref)
        self.assertAlmostEqual(res["scaling_factor"], 0.25, places=3)

    def test_default_scaling_factor_is_one(self):
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350))
        res = process_image(b64, threshold_mode="otsu")
        self.assertEqual(res["scaling_factor"], 1.0)

    def test_centered_origin_and_y_inversion(self):
        # Box from u=100..300, v=100..300. Center is (200, 200).
        # A vertex above center in raster (v < 200) must map to positive Y in CAD.
        root_pts = np.array([[100, 100], [300, 100], [300, 300], [100, 300]])
        res = calibrate_and_transform_coordinates(root_pts, [], reference_dimension={"type": "width", "value_mm": 100.0})
        # S = 100 / 200 = 0.5
        # u_center=200, v_center=200
        # u=100, v=100 -> x = (100-200)*0.5 = -50, y = (200-100)*0.5 = +50
        pts = res["outer_boundary"]
        # One of the vertices should be [-50.0, 50.0]
        self.assertTrue(any(p == [-50.0, 50.0] for p in pts), f"Expected [-50, 50] in {pts}")
        # One of the vertices should be [50.0, -50.0] (u=300, v=300 -> x=+50, y=-50)
        self.assertTrue(any(p == [50.0, -50.0] for p in pts), f"Expected [50, -50] in {pts}")

    def test_reject_invalid_reference_dimension(self):
        b64 = make_test_image_b64()
        with self.assertRaises(ValueError):
            process_image(b64, reference_dimension={"type": "invalid", "value_mm": 50.0})
        with self.assertRaises(ValueError):
            process_image(b64, reference_dimension={"type": "width", "value_mm": -10.0})
        with self.assertRaises(ValueError):
            process_image(b64, reference_dimension={"type": "points", "value_mm": 50.0, "points": [[0, 0]]})


if __name__ == "__main__":
    unittest.main()
