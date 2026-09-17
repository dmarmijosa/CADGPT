"""Unit tests for workspace directory governance and manifest management."""
from __future__ import annotations

import json
import os
from pathlib import Path
import struct
import tempfile
import time
import unittest

from cadgpt_agent.workspace import (
    STANDARD_DIRECTORIES,
    audit_project,
    categorize_file,
    init_project,
    index_asset,
    is_path_contained,
    load_project_manifest,
    reconstitute_manifest,
    reorganize_project,
    save_project_manifest,
)


def _make_valid_stl(num_facets: int = 2) -> bytes:
    header = b"Binary STL header test file 80 bytes" + b"\x00" * 44
    out = bytearray(header)
    out.extend(struct.pack("<I", num_facets))
    for i in range(num_facets):
        # 12 finite floats + 2 attribute bytes
        floats = (0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 5.0, 10.0, float(i + 1))
        out.extend(struct.pack("<12fH", *floats, 0))
    return bytes(out)


class WorkspaceScaffoldingTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.project_dir = Path(self.tmp_dir.name) / "test_project"

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_init_project_scaffolds_5_folders_and_manifest(self):
        manifest = init_project(self.project_dir, name="RobotArm", primary_engine="FreeCAD")

        for folder in STANDARD_DIRECTORIES:
            folder_path = self.project_dir / folder
            self.assertTrue(folder_path.is_dir(), f"Folder {folder} must exist")

        manifest_path = self.project_dir / "project.json"
        self.assertTrue(manifest_path.is_file(), "project.json must exist")

        loaded = load_project_manifest(self.project_dir)
        self.assertEqual(loaded["name"], "RobotArm")
        self.assertEqual(loaded["primaryEngine"], "FreeCAD")
        self.assertEqual(loaded["version"], "1.0.0")
        self.assertIsInstance(loaded["inventory"], list)
        self.assertEqual(len(loaded["inventory"]), 0)
        self.assertIn("projectId", loaded)
        self.assertIn("createdAt", loaded)
        self.assertIn("updatedAt", loaded)

    def test_init_project_preserves_existing_manifest(self):
        m1 = init_project(self.project_dir, name="Original")
        m2 = init_project(self.project_dir, name="AttemptedOverwrite")
        self.assertEqual(m1["projectId"], m2["projectId"])
        self.assertEqual(m2["name"], "Original")


class ManifestAtomicOperationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.project_dir = Path(self.tmp_dir.name)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_atomic_write_and_read(self):
        manifest = {
            "projectId": "11111111-2222-3333-4444-555555555555",
            "name": "AtomicTest",
            "primaryEngine": "Blender",
            "createdAt": "2026-09-17T00:00:00Z",
            "updatedAt": "2026-09-17T00:00:00Z",
            "version": "1.0.0",
            "inventory": [],
        }
        save_project_manifest(self.project_dir, manifest)
        loaded = load_project_manifest(self.project_dir)
        self.assertEqual(loaded["projectId"], manifest["projectId"])
        self.assertEqual(loaded["primaryEngine"], "Blender")

    def test_load_nonexistent_manifest_raises_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            load_project_manifest(self.project_dir / "nonexistent")

    def test_load_corrupt_manifest_raises_value_error(self):
        manifest_file = self.project_dir / "project.json"
        manifest_file.write_text("{ this is not valid json")
        with self.assertRaises(ValueError):
            load_project_manifest(self.project_dir)

    def test_save_manifest_missing_required_field_raises(self):
        invalid_manifest = {
            "projectId": "11111111-2222-3333-4444-555555555555",
            # missing required fields
        }
        with self.assertRaises(ValueError):
            save_project_manifest(self.project_dir, invalid_manifest)


class AssetCategorizationAndIndexingTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.project_dir = Path(self.tmp_dir.name)
        init_project(self.project_dir)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_categorization_rules(self):
        self.assertEqual(categorize_file("cad/design.FCStd"), "cad")
        self.assertEqual(categorize_file("model.blend"), "cad")
        self.assertEqual(categorize_file("drawing.dwg"), "cad")
        self.assertEqual(categorize_file("blueprint.dwg"), "references")

        self.assertEqual(categorize_file("preview.stl"), "meshes")
        self.assertEqual(categorize_file("preview.glb"), "meshes")

        self.assertEqual(categorize_file("assembly.step"), "exports")
        self.assertEqual(categorize_file("layout.dxf"), "exports")
        self.assertEqual(categorize_file("model.iges"), "exports")

        self.assertEqual(categorize_file("sketch.png"), "references")
        self.assertEqual(categorize_file("spec.pdf"), "references")
        self.assertEqual(categorize_file("concept.jpg"), "references")

        self.assertEqual(categorize_file("thumbnail.png"), "renders")
        self.assertEqual(categorize_file("render_camera1.png"), "renders")
        self.assertEqual(categorize_file("renders/screenshot.png"), "renders")

    def test_index_asset_computes_sha256_and_integrity(self):
        stl_data = _make_valid_stl(3)
        stl_path = self.project_dir / "meshes" / "preview.stl"
        stl_path.write_bytes(stl_data)

        entry = index_asset(self.project_dir, "meshes/preview.stl")
        self.assertEqual(entry["relativePath"], "meshes/preview.stl")
        self.assertEqual(entry["category"], "meshes")
        self.assertEqual(entry["size"], len(stl_data))
        self.assertEqual(entry["facetCount"], 3)
        self.assertTrue(entry["magicVerified"])
        self.assertTrue(entry["integrityVerified"])
        self.assertRegex(entry["sha256"], r"^[0-9a-f]{64}$")


class AuditAndReorganizationTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.project_dir = Path(self.tmp_dir.name)
        init_project(self.project_dir, name="AuditTest")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_audit_identifies_unorganized_root_image_without_disk_mutation(self):
        sketch_path = self.project_dir / "sketch.png"
        sketch_path.write_bytes(b"dummy png data")

        report = audit_project(self.project_dir)
        self.assertFalse(report["compliant"])
        self.assertEqual(len(report["reorganizationPlan"]), 1)

        plan = report["reorganizationPlan"][0]
        self.assertEqual(plan["source"], "sketch.png")
        self.assertEqual(plan["destination"], "references/sketch.png")
        self.assertEqual(plan["category"], "references")
        self.assertEqual(plan["reason"], "misplaced_reference")

        # Invariant: audit MUST NOT mutate disk
        self.assertTrue(sketch_path.is_file(), "sketch.png must remain on disk during read-only audit")
        self.assertFalse((self.project_dir / "references" / "sketch.png").exists())

    def test_audit_verifies_fully_compliant_project(self):
        stl_data = _make_valid_stl(1)
        stl_path = self.project_dir / "meshes" / "preview.stl"
        stl_path.write_bytes(stl_data)

        # Update manifest to track this asset
        entry = index_asset(self.project_dir, "meshes/preview.stl")
        manifest = load_project_manifest(self.project_dir)
        manifest["inventory"].append(entry)
        save_project_manifest(self.project_dir, manifest)

        report = audit_project(self.project_dir)
        self.assertTrue(report["compliant"])
        self.assertEqual(len(report["reorganizationPlan"]), 0)
        self.assertEqual(len(report["discrepancies"]["missingFiles"]), 0)
        self.assertEqual(len(report["discrepancies"]["untrackedFiles"]), 0)
        self.assertEqual(len(report["discrepancies"]["modifiedFiles"]), 0)

    def test_audit_recovers_corrupted_manifest(self):
        stl_data = _make_valid_stl(1)
        (self.project_dir / "meshes" / "preview.stl").write_bytes(stl_data)

        # Corrupt manifest
        (self.project_dir / "project.json").write_text("{corrupt")

        report = audit_project(self.project_dir)
        self.assertTrue(report["manifestRecovered"])
        recovered = load_project_manifest(self.project_dir)
        self.assertEqual(len(recovered["inventory"]), 1)
        self.assertEqual(recovered["inventory"][0]["relativePath"], "meshes/preview.stl")

    def test_reorganize_rejected_without_confirmation(self):
        (self.project_dir / "sketch.png").write_bytes(b"image")
        with self.assertRaises(ValueError) as ctx:
            reorganize_project(self.project_dir, confirmed=False)
        self.assertIn("confirmed must be True", str(ctx.exception))
        self.assertTrue((self.project_dir / "sketch.png").is_file())

    def test_reorganize_rejects_path_traversal_attempts(self):
        plan = [
            {
                "source": "sketch.png",
                "destination": "../../etc/shadow",
                "category": "references",
                "reason": "malicious",
            }
        ]
        with self.assertRaises(ValueError) as ctx:
            reorganize_project(self.project_dir, confirmed=True, plan=plan)
        self.assertIn("path traversal", str(ctx.exception))

    def test_confirmed_reorganization_moves_files_preserves_mtime_and_updates_manifest(self):
        sketch_path = self.project_dir / "sketch.png"
        sketch_path.write_bytes(b"dummy image bytes")

        # Set specific mtime in the past
        past_time = time.time() - 3600
        os.utime(sketch_path, (past_time, past_time))
        expected_mtime_ns = sketch_path.stat().st_mtime_ns

        result = reorganize_project(self.project_dir, confirmed=True)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["moved"]), 1)
        self.assertTrue(result["manifestUpdated"])

        # Check file moved
        self.assertFalse(sketch_path.exists())
        dest_path = self.project_dir / "references" / "sketch.png"
        self.assertTrue(dest_path.is_file())

        # Check mtime preserved (within 1 ms tolerance)
        actual_mtime_ns = dest_path.stat().st_mtime_ns
        self.assertAlmostEqual(actual_mtime_ns / 1e9, expected_mtime_ns / 1e9, delta=0.01)

        # Check manifest updated
        manifest = load_project_manifest(self.project_dir)
        inventories = [i for i in manifest["inventory"] if i["relativePath"] == "references/sketch.png"]
        self.assertEqual(len(inventories), 1)
        self.assertEqual(inventories[0]["category"], "references")

        # Re-audit should now be compliant
        report = audit_project(self.project_dir)
        self.assertTrue(report["compliant"])


class PathContainmentTests(unittest.TestCase):
    def test_path_containment_checks(self):
        root = Path("/home/user/project")
        self.assertTrue(is_path_contained(root / "cad" / "design.FCStd", root))
        self.assertTrue(is_path_contained(root / "references" / "sketch.png", root))
        self.assertFalse(is_path_contained("/home/user/other/file.txt", root))
        self.assertFalse(is_path_contained(root / ".." / "outside.txt", root))


if __name__ == "__main__":
    unittest.main()
