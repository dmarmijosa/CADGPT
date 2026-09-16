"""Metric Image-to-CAD Computer Vision Pipeline.

Handles base64 decoding, image preprocessing, threshold binarization (Otsu, adaptive, Canny),
hierarchical contour extraction (RETR_TREE) with nested hole detection,
Douglas-Peucker polygon simplification, metric calibration, and centered CAD coordinate mapping.
"""
import base64
import binascii
import math
from typing import Any

import cv2
import numpy as np


def decode_image_payload(image_base64: str) -> np.ndarray:
    """Decode raw base64 or Data URI string to an 8-bit single-channel grayscale image."""
    if not isinstance(image_base64, str):
        raise ValueError("image_base64 must be a string")

    payload = image_base64.strip()
    if len(payload) < 20:
        raise ValueError("image_base64 payload must be at least 20 characters")
    if len(payload) > 5_000_000:
        raise ValueError("image_base64 payload exceeds 5 MB limit")

    if payload.startswith("data:"):
        if "," not in payload:
            raise ValueError("Invalid Data URI: missing comma separator")
        _, b64_part = payload.split(",", 1)
    else:
        b64_part = payload

    try:
        raw_bytes = base64.b64decode(b64_part, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"Corrupted or invalid base64 image data: {exc}") from exc

    if not raw_bytes:
        raise ValueError("Decoded image buffer is empty")

    nparr = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None or img.size == 0:
        raise ValueError("Failed to decode image from base64 payload")

    if len(img.shape) == 2:
        gray = img
    elif len(img.shape) == 3:
        if img.shape[2] == 4:
            # Alpha composite onto white background so transparent borders become background
            bgr = img[:, :, :3]
            alpha = img[:, :, 3].astype(float) / 255.0
            gray_bgr = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(float)
            gray = np.uint8(gray_bgr * alpha + 255.0 * (1.0 - alpha))
        elif img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img[:, :, 0]
    else:
        raise ValueError("Unsupported image array dimensions")

    if gray.dtype != np.uint8:
        gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)

    return gray


def binarize_image(gray: np.ndarray, threshold_mode: str = "otsu", invert: bool = False) -> np.ndarray:
    """Pre-processes with Gaussian blur and binarizes via Otsu, adaptive, or Canny."""
    mode = str(threshold_mode).lower().strip()
    if mode not in ("otsu", "adaptive", "canny"):
        raise ValueError(f"Unsupported threshold mode: {threshold_mode}. Expected 'otsu', 'adaptive', or 'canny'.")

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    if mode == "otsu":
        _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    elif mode == "adaptive":
        binary = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
        )
    elif mode == "canny":
        edges = cv2.Canny(blurred, 50, 150)
        kernel = np.ones((3, 3), np.uint8)
        binary = cv2.dilate(edges, kernel, iterations=1)

    if invert:
        binary = cv2.bitwise_not(binary)

    return binary


def polygon_signed_area(pts: list[list[float]]) -> float:
    """Calculate signed polygon area using Shoelace formula. Positive is CCW, negative is CW."""
    n = len(pts)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    return area / 2.0


def extract_contours_and_holes(
    binary: np.ndarray, tolerance: float = 0.0025
) -> tuple[np.ndarray, list[np.ndarray], int]:
    """Extract root contour and child holes using cv2.RETR_TREE, simplified with Douglas-Peucker."""
    if not isinstance(tolerance, (int, float)) or not math.isfinite(tolerance) or tolerance <= 0:
        raise ValueError("tolerance must be a positive finite number")

    contours, hierarchy = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if not contours or hierarchy is None or len(contours) == 0:
        raise ValueError("No contours found in image")

    h_tree = hierarchy[0]  # [Next, Previous, First_Child, Parent]

    # Find root contours (parent == -1)
    root_indices = [i for i in range(len(contours)) if h_tree[i][3] == -1]
    if not root_indices:
        raise ValueError("No root contour found in hierarchy")

    # Pick root contour with maximum enclosed area
    root_idx = max(root_indices, key=lambda idx: cv2.contourArea(contours[idx]))
    root_contour = contours[root_idx]
    raw_root_vertex_count = len(root_contour)

    if cv2.contourArea(root_contour) <= 0 and cv2.arcLength(root_contour, True) <= 0:
        raise ValueError("Root contour has zero area and perimeter")

    # Simplify root contour with Douglas-Peucker
    root_arc = cv2.arcLength(root_contour, True)
    root_epsilon = tolerance * root_arc
    approx_root = cv2.approxPolyDP(root_contour, root_epsilon, closed=True)
    root_pts = approx_root.reshape(-1, 2)
    if len(root_pts) < 3:
        raise ValueError("Simplified outer boundary has fewer than 3 vertices")

    # Child holes are direct children of root (Parent == root_idx)
    child_hole_indices = [j for j in range(len(contours)) if h_tree[j][3] == root_idx]
    holes_pts = []
    for h_idx in child_hole_indices:
        h_cnt = contours[h_idx]
        # Ignore degenerate 1-2 pixel noise
        if cv2.contourArea(h_cnt) < 1.0 and cv2.arcLength(h_cnt, True) < 4.0:
            continue
        h_arc = cv2.arcLength(h_cnt, True)
        h_epsilon = tolerance * h_arc
        approx_h = cv2.approxPolyDP(h_cnt, h_epsilon, closed=True)
        h_pts = approx_h.reshape(-1, 2)
        if len(h_pts) >= 3:
            holes_pts.append(h_pts)

    return root_pts, holes_pts, raw_root_vertex_count


def calibrate_and_transform_coordinates(
    root_pts: np.ndarray,
    holes_pts: list[np.ndarray],
    reference_dimension: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Transform pixel coordinates to centered metric CAD coordinates with Y-axis inversion."""
    u_coords = root_pts[:, 0]
    v_coords = root_pts[:, 1]
    u_min, u_max = float(np.min(u_coords)), float(np.max(u_coords))
    v_min, v_max = float(np.min(v_coords)), float(np.max(v_coords))

    d_px_w = u_max - u_min
    d_px_h = v_max - v_min
    u_center = (u_min + u_max) / 2.0
    v_center = (v_min + v_max) / 2.0

    scaling_factor = 1.0
    if reference_dimension:
        ref_type = reference_dimension.get("type")
        val_mm = reference_dimension.get("value_mm")
        if (
            val_mm is None
            or isinstance(val_mm, bool)
            or not isinstance(val_mm, (int, float))
            or not math.isfinite(val_mm)
            or val_mm <= 0
            or val_mm > 10000
        ):
            raise ValueError("reference_dimension.value_mm must be a positive finite number <= 10000")

        if ref_type == "width":
            if d_px_w <= 0:
                raise ValueError("Root contour bounding width is zero pixels")
            scaling_factor = float(val_mm) / d_px_w
        elif ref_type == "height":
            if d_px_h <= 0:
                raise ValueError("Root contour bounding height is zero pixels")
            scaling_factor = float(val_mm) / d_px_h
        elif ref_type == "points":
            points = reference_dimension.get("points")
            if not points or len(points) != 2:
                raise ValueError(
                    "reference_dimension points must be an array of two [u, v] coordinate pairs"
                )
            p1, p2 = points[0], points[1]
            u1, v1 = float(p1[0]), float(p1[1])
            u2, v2 = float(p2[0]), float(p2[1])
            dist_px = math.hypot(u2 - u1, v2 - v1)
            if dist_px <= 0:
                raise ValueError("Reference points distance is zero pixels")
            scaling_factor = float(val_mm) / dist_px
        else:
            raise ValueError(f"Unsupported reference_dimension type: {ref_type}")

    # CAD coordinate mapping with centered origin and Y-inversion:
    # x = (u - u_center) * S
    # y = (v_center - v) * S
    def transform(pts_2d: np.ndarray) -> list[list[float]]:
        out = []
        for u, v in pts_2d:
            x = round(float((u - u_center) * scaling_factor), 4)
            y = round(float((v_center - v) * scaling_factor), 4)
            if abs(x) > 100000 or abs(y) > 100000:
                raise ValueError(f"Transformed coordinate ({x}, {y}) exceeds CAD boundary of 100000 mm")
            out.append([x, y])
        return out

    outer_boundary = transform(root_pts)
    holes = [transform(h) for h in holes_pts]

    # Enforce winding order:
    # Outer boundary must be Counter-Clockwise (signed area > 0)
    if polygon_signed_area(outer_boundary) < 0:
        outer_boundary.reverse()

    # Holes must be Clockwise (signed area < 0)
    for h in holes:
        if polygon_signed_area(h) > 0:
            h.reverse()

    bounds_mm = {
        "width": round(d_px_w * scaling_factor, 4),
        "height": round(d_px_h * scaling_factor, 4),
    }
    vertex_count = len(outer_boundary) + sum(len(h) for h in holes)

    return {
        "outer_boundary": outer_boundary,
        "holes": holes,
        "scaling_factor": round(float(scaling_factor), 6),
        "bounds_mm": bounds_mm,
        "vertex_count": vertex_count,
    }


def process_image(
    image_base64: str,
    threshold_mode: str = "otsu",
    invert: bool = False,
    tolerance: float = 0.0025,
    reference_dimension: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute complete image-to-CAD computer vision pipeline."""
    gray = decode_image_payload(image_base64)
    binary = binarize_image(gray, threshold_mode=threshold_mode, invert=invert)
    root_pts, holes_pts, _ = extract_contours_and_holes(binary, tolerance=tolerance)
    return calibrate_and_transform_coordinates(
        root_pts, holes_pts, reference_dimension=reference_dimension
    )
