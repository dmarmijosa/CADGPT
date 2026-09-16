"""Unit tests for agent executor path containment (resolve_external_path).

Covers all 7 escape vectors in the design Threat Matrix ('Caller-controlled paths'):
- symlink escape
- junction / directory link escape
- '..' parent traversal escape
- NUL byte injection
- UNC path outside allowlist
- drive-relative ('C:foo') outside allowlist
- foreign root (path outside every allowlisted root)

Plus the positive acceptance case:
- canonical path inside allowed root accepted
"""
import json
import os
from pathlib import Path
import platform
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch
import uuid

from cadgpt_agent.executor import execute, resolve_external_path


class ExternalPathContainmentTests(unittest.TestCase):
    def setUp(self):
        self.root_temp = tempfile.TemporaryDirectory()
        self.outside_temp = tempfile.TemporaryDirectory()
        self.allowed_root = Path(self.root_temp.name).resolve()
        self.outside_root = Path(self.outside_temp.name).resolve()

    def tearDown(self):
        self.root_temp.cleanup()
        self.outside_temp.cleanup()

    # 1. Symlink escape
    def test_symlink_escape_denied(self):
        outside_file = self.outside_root / "secret.FCStd"
        outside_file.write_text("secret")
        link = self.allowed_root / "link_to_outside.FCStd"
        try:
            link.symlink_to(outside_file)
        except OSError:
            self.skipTest("Symlinks not supported in this environment")

        with self.assertRaises(ValueError):
            resolve_external_path(str(link), [str(self.allowed_root)])

    # 2. Junction / directory reparse link escape
    def test_junction_escape_denied(self):
        outside_dir = self.outside_root / "nested"
        outside_dir.mkdir()
        outside_file = outside_dir / "target.dwg"
        outside_file.write_text("dwg")
        junction_dir = self.allowed_root / "junction_link"
        try:
            junction_dir.symlink_to(outside_dir, target_is_directory=True)
        except OSError:
            self.skipTest("Directory links/junctions not supported in this environment")

        path_through_junction = junction_dir / "target.dwg"
        with self.assertRaises(ValueError):
            resolve_external_path(str(path_through_junction), [str(self.allowed_root)])

    # 3. '..' parent traversal escape
    def test_parent_traversal_denied(self):
        sub = self.allowed_root / "sub"
        sub.mkdir()
        traversal_path = str(sub / ".." / ".." / self.outside_root.name / "file.txt")
        with self.assertRaises(ValueError):
            resolve_external_path(traversal_path, [str(self.allowed_root)])

    # 4. NUL byte injection
    def test_nul_byte_denied(self):
        malicious_path = str(self.allowed_root / "model\0.FCStd")
        with self.assertRaises(ValueError):
            resolve_external_path(malicious_path, [str(self.allowed_root)])

    # 5. UNC path outside allowlist
    def test_unc_path_outside_allowlist_denied(self):
        unc_backslash = r"\\server\share\design.dwg"
        unc_forward = "//server/share/design.dwg"
        with self.assertRaises(ValueError):
            resolve_external_path(unc_backslash, [str(self.allowed_root)])
        with self.assertRaises(ValueError):
            resolve_external_path(unc_forward, [str(self.allowed_root)])

    # 6. Drive-relative ('C:foo') outside allowlist
    def test_drive_relative_outside_allowlist_denied(self):
        drive_relative = "C:escape_model.dwg"
        with self.assertRaises(ValueError):
            resolve_external_path(drive_relative, [str(self.allowed_root)])

    # 7. Foreign root (path outside every allowlisted root)
    def test_foreign_root_outside_allowlist_denied(self):
        foreign_file = self.outside_root / "external.FCStd"
        foreign_file.write_text("content")
        with self.assertRaises(ValueError):
            resolve_external_path(str(foreign_file), [str(self.allowed_root)])

    # Positive acceptance case: Canonical path inside root accepted
    def test_canonical_path_inside_root_accepted(self):
        project_dir = self.allowed_root / "project" / "sub"
        project_dir.mkdir(parents=True)
        valid_file = project_dir / "assembly.FCStd"
        valid_file.write_text("fcstd")

        resolved = resolve_external_path(str(valid_file), [str(self.allowed_root)])
        self.assertIsInstance(resolved, Path)
        self.assertEqual(resolved, valid_file.resolve())

    # Additional boundary: multiple allowed roots
    def test_multiple_allowed_roots_accepted(self):
        other_temp = tempfile.TemporaryDirectory()
        try:
            second_root = Path(other_temp.name).resolve()
            file_in_second = second_root / "part.dwg"
            file_in_second.write_text("dwg")

            resolved = resolve_external_path(str(file_in_second), [str(self.allowed_root), str(second_root)])
            self.assertEqual(resolved, file_in_second.resolve())
        finally:
            other_temp.cleanup()

    # Empty roots or empty path rejected
    def test_empty_roots_or_empty_path_rejected(self):
        with self.assertRaises(ValueError):
            resolve_external_path("", [str(self.allowed_root)])
        with self.assertRaises(ValueError):
            resolve_external_path(str(self.allowed_root / "part.FCStd"), [])


class AnalyzeImageToCadExecutorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.cads = [{
            "id": "cad-freecad",
            "name": "FreeCAD",
            "path": str(self.root / "fake_freecad"),
            "executable": True,
            "capabilities": {"execute": True, "ops": ["analyze_image_to_cad", "extrude_polygon"]},
        }]
        Path(self.cads[0]["path"]).write_text("#!/bin/sh\nexit 0\n")
        Path(self.cads[0]["path"]).chmod(0o755)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_inspection_mode_writes_inspection_json_and_skips_subprocess(self):
        try:
            from .test_vision import make_test_image_b64
        except (ImportError, ValueError):
            from test_vision import make_test_image_b64
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350), holes=[(100, 100, 150, 150)])
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "cadId": "cad-freecad",
            "type": "analyze_image_to_cad",
            "image_base64": b64,
            "create_solid": False,
            "threshold_mode": "otsu",
            "tolerance": 0.0025,
            "expires": (time.time() + 300) * 1000,
            "confirmed": True,
        }

        with patch("cadgpt_agent.executor.subprocess.Popen") as popen_mock:
            res_str = execute(job, self.cads, str(self.root))
            popen_mock.assert_not_called()

        res = json.loads(res_str)
        self.assertIn("outer_boundary", res)
        self.assertIn("holes", res)
        self.assertEqual(len(res["holes"]), 1)
        self.assertIn("scaling_factor", res)
        self.assertIn("bounds_mm", res)
        self.assertIn("vertex_count", res)

        inspection_file = self.root / "jobs" / job_id / "inspection.json"
        self.assertTrue(inspection_file.is_file())
        saved_data = json.loads(inspection_file.read_text(encoding="utf-8"))
        self.assertEqual(saved_data["vertex_count"], res["vertex_count"])

    def test_solid_generation_mode_delegates_to_extrude_polygon_subprocess(self):
        try:
            from .test_vision import make_test_image_b64
        except (ImportError, ValueError):
            from test_vision import make_test_image_b64
        b64 = make_test_image_b64(outer_box=(50, 50, 350, 350))
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "cadId": "cad-freecad",
            "type": "analyze_image_to_cad",
            "image_base64": b64,
            "create_solid": True,
            "depth": 15.0,
            "plane": "XY",
            "expires": (time.time() + 300) * 1000,
            "confirmed": True,
        }

        with patch("cadgpt_agent.executor.subprocess.Popen") as popen_mock:
            job_dir = self.root / "jobs" / job_id
            def side_effect(*args, **kwargs):
                (job_dir / "design.FCStd").write_text("fake_fcstd")
                (job_dir / "preview.stl").write_text("solid fake_stl\nendsolid\n")
                mock_proc = MagicMock()
                mock_proc.wait.return_value = 0
                mock_proc.stdout.read.side_effect = [b"Extrusion complete", b""]
                return mock_proc

            popen_mock.side_effect = side_effect
            res_str = execute(job, self.cads, str(self.root))
            popen_mock.assert_called_once()

        self.assertIn("Created", res_str)
        request_file = self.root / "jobs" / job_id / "request.json"
        self.assertTrue(request_file.is_file())
        req = json.loads(request_file.read_text(encoding="utf-8"))
        self.assertEqual(req["op"], "extrude_polygon")
        self.assertIn("points", req)
        self.assertIn("holes", req)
        self.assertEqual(req["depth"], 15.0)
        self.assertEqual(req["plane"], "XY")

    def test_solid_mode_requires_confirmed_and_depth(self):
        try:
            from .test_vision import make_test_image_b64
        except (ImportError, ValueError):
            from test_vision import make_test_image_b64
        b64 = make_test_image_b64()
        job_base = {
            "id": str(uuid.uuid4()),
            "cadId": "cad-freecad",
            "type": "analyze_image_to_cad",
            "image_base64": b64,
            "create_solid": True,
            "expires": (time.time() + 300) * 1000,
        }
        with self.assertRaises(ValueError) as ctx:
            execute({**job_base, "depth": 10.0}, self.cads, str(self.root))
        self.assertIn("confirmation required", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            execute({**job_base, "confirmed": True}, self.cads, str(self.root))
        self.assertIn("depth must be finite", str(ctx.exception))

    def test_corrupt_base64_raises_value_error(self):
        job = {
            "id": str(uuid.uuid4()),
            "cadId": "cad-freecad",
            "type": "analyze_image_to_cad",
            "image_base64": "corrupt_base64_data_string_not_valid",
            "create_solid": False,
            "expires": (time.time() + 300) * 1000,
            "confirmed": True,
        }
        with self.assertRaises(ValueError):
            execute(job, self.cads, str(self.root))


if __name__ == "__main__":
    unittest.main()
