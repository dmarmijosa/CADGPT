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
import os
import platform
import tempfile
import unittest
from pathlib import Path

from cadgpt_agent.executor import resolve_external_path


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


if __name__ == "__main__":
    unittest.main()
