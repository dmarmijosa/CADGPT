"""Tests for FreeCAD worker and executor path-bound backup/save-back semantics.

Covers P1 Phase 3 (PR P1-4):
- Backup created before write (spec 'Backup created before write')
- Timeout aborts without corruption and restores from backup (spec 'Timeout aborts without corruption')
- Failed op restores from backup (spec 'Failed op restores from backup')
- Native path open and save-back
"""
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from cadgpt_agent.executor import execute
from cadgpt_agent import freecad_worker


class FreeCadWorkerBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.allowed_root = Path(self.temp_dir.name).resolve()
        self.cad_path = "/usr/bin/FreeCADCmd"
        self.cads = [{"id": "cad", "name": "FreeCAD", "path": self.cad_path, "executable": True}]

    def tearDown(self):
        self.temp_dir.cleanup()

    def _job(self, **kwargs):
        defaults = {
            "id": str(uuid.uuid4()),
            "cadId": "cad",
            "expires": time.time() * 1000 + 60000,
            "confirmed": True,
            "type": "create_box",
            "length": 10,
            "width": 20,
            "height": 30,
        }
        defaults.update(kwargs)
        return defaults

    def test_backup_created_before_write(self):
        """Spec 'Backup created before write': before any write to the allowlisted
        file, a backup copy exists as a timestamped sibling."""
        original_file = self.allowed_root / "part.FCStd"
        original_bytes = b"initial_clean_fcstd_bytes"
        original_file.write_bytes(original_bytes)

        job = self._job(native_path=str(original_file))
        backup_verified = []

        with patch("cadgpt_agent.executor.subprocess.Popen") as popen_mock:
            process = popen_mock.return_value
            process.stdout = io.BytesIO(b"ok")

            def mock_wait(timeout=None):
                # Inspect directory for the .bak sibling BEFORE mutating the file
                bak_files = list(self.allowed_root.glob("part.FCStd.*.bak"))
                if bak_files and bak_files[0].read_bytes() == original_bytes:
                    backup_verified.append(bak_files[0])
                # Simulate mutation
                original_file.write_bytes(b"mutated_success_bytes")
                return 0

            process.wait.side_effect = mock_wait
            execute(job, self.cads, str(self.allowed_root), allowed_roots=[str(self.allowed_root)])

            self.assertTrue(len(backup_verified) >= 1, "Backup was not created before the write")
            self.assertEqual(original_file.read_bytes(), b"mutated_success_bytes")
            # Verify the backup sibling is still intact
            self.assertEqual(backup_verified[0].read_bytes(), original_bytes)

    def test_timeout_aborts_without_corruption(self):
        """Spec 'Timeout aborts without corruption': 120s timeout kills process
        and restores the original file byte-identically from backup."""
        original_file = self.allowed_root / "part.FCStd"
        original_bytes = b"initial_clean_fcstd_bytes"
        original_file.write_bytes(original_bytes)

        job = self._job(native_path=str(original_file))

        with patch("cadgpt_agent.executor.subprocess.Popen") as popen_mock:
            process = popen_mock.return_value
            process.stdout = io.BytesIO(b"")

            calls = 0

            def mock_wait(timeout=None):
                nonlocal calls
                calls += 1
                if calls == 1:
                    # Corrupt the file partially during execution
                    original_file.write_bytes(b"partial_corrupted_in_progress")
                    raise subprocess.TimeoutExpired(cmd=["FreeCADCmd"], timeout=120)
                return -9

            process.wait.side_effect = mock_wait
            with self.assertRaises(RuntimeError) as ctx:
                execute(job, self.cads, str(self.allowed_root), allowed_roots=[str(self.allowed_root)])

            self.assertIn("120-second", str(ctx.exception))
            # Verify original file was restored byte-identically
            self.assertEqual(original_file.read_bytes(), original_bytes)

    def test_failed_op_restores_from_backup(self):
        """Spec 'Failed op restores from backup': non-zero exit restores original
        from backup copy."""
        original_file = self.allowed_root / "part.FCStd"
        original_bytes = b"initial_clean_fcstd_bytes"
        original_file.write_bytes(original_bytes)

        job = self._job(native_path=str(original_file))

        with patch("cadgpt_agent.executor.subprocess.Popen") as popen_mock:
            process = popen_mock.return_value
            process.stdout = io.BytesIO(b"fatal error in worker")

            def mock_wait(timeout=None):
                # Corrupt the file partially during failed op
                original_file.write_bytes(b"broken_half_written")
                return 1

            process.wait.side_effect = mock_wait
            with self.assertRaises(RuntimeError):
                execute(job, self.cads, str(self.allowed_root), allowed_roots=[str(self.allowed_root)])

            # Verify original file was restored byte-identically
            self.assertEqual(original_file.read_bytes(), original_bytes)

    def test_worker_run_with_native_path_opens_and_saves_native_path(self):
        """P1.3.2/P1.3.3: freecad_worker.run opens native_path when provided in data
        and saves back to it on success."""
        native_file = self.allowed_root / "design.FCStd"
        native_file.write_bytes(b"fcstd_content")

        job_dir = self.allowed_root / "job1"
        job_dir.mkdir()
        data = {
            "op": "create_box",
            "native_path": str(native_file),
            "length": 10,
            "width": 10,
            "height": 10,
        }

        # Mock FreeCAD document
        mock_doc = MagicMock()
        mock_doc.FileName = str(native_file)
        mock_doc.Objects = []

        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            FreeCAD.newDocument.return_value = mock_doc

            freecad_worker.run(job_dir, None, data)

            # Assert openDocument was called with native_file
            FreeCAD.openDocument.assert_called_with(str(native_file))
            # Assert document.save() was called to save back to the same path
            mock_doc.save.assert_called()


class FreeCadAdvancedOpsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.job_dir = Path(self.temp_dir.name) / "job"
        self.job_dir.mkdir()
        self.doc_dir = Path(self.temp_dir.name) / "doc"
        self.doc_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _setup_mock_doc(self, num_edges=12):
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_box = MagicMock()
        mock_box.Name = "Box"
        mock_box.InList = []
        mock_edges = [MagicMock() for _ in range(num_edges)]
        mock_box.Shape.Edges = mock_edges
        mock_box.Shape.BoundBox = MagicMock(XMin=0, YMin=0, ZMin=0, XMax=10, YMax=10, ZMax=10)
        mock_box.Shape.Volume = 1000.0
        mock_doc.Objects = [mock_box]
        mock_doc.getObject.side_effect = lambda name: mock_box if name == "Box" else None
        return mock_doc, mock_box, mock_edges

    def test_create_wedge_knife_edge(self):
        """Scenario: Create knife-edge wedge primitive."""
        data = {
            "op": "create_wedge",
            "length": 50,
            "width": 20,
            "height": 30,
            "top_length": 0,
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Part
            FreeCAD.newDocument.return_value = mock_doc
            FreeCAD.openDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            mock_doc.addObject.assert_called_with("Part::Feature", "Wedge")
            Part.makeWedge.assert_called()
            args, _ = Part.makeWedge.call_args
            self.assertEqual(args[:4], (50.0, 20.0, 30.0, 0.0))

    def test_create_wedge_truncated(self):
        """Scenario: Create wedge with flat top ridge."""
        data = {
            "op": "create_wedge",
            "length": 60,
            "width": 30,
            "height": 40,
            "top_length": 15,
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Part
            FreeCAD.newDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            args, _ = Part.makeWedge.call_args
            self.assertEqual(args[:4], (60.0, 30.0, 40.0, 15.0))

    def test_create_wedge_validation(self):
        """Rejects non-positive dimensions and negative top_length."""
        with self.assertRaises(ValueError):
            freecad_worker._create_wedge({"length": -10, "width": 20, "height": 30}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_wedge({"length": 10, "width": 0, "height": 30}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_wedge({"length": 10, "width": 20, "height": 30, "top_length": -1}, self.doc_dir)

    def test_extrude_polygon_xy_plane(self):
        """Scenario: Extrude closed polygon on XY plane."""
        data = {
            "op": "extrude_polygon",
            "points": [[0, 0], [40, 0], [50, 20], [10, 20]],
            "depth": 12,
            "plane": "XY",
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Part
            FreeCAD.newDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            mock_doc.addObject.assert_called_with("Part::Feature", "ExtrudePolygon")
            # Loop was closed to 5 vertices
            make_poly_call = Part.makePolygon.call_args[0][0]
            self.assertEqual(len(make_poly_call), 5)
            Part.Face.assert_called()
            Part.Face.return_value.extrude.assert_called()

    def test_extrude_polygon_validation(self):
        """Scenario: Reject polygon with fewer than 3 vertices or out of bounds coordinates."""
        with self.assertRaises(ValueError):
            freecad_worker._extrude_polygon({"points": [[0, 0], [10, 10]], "depth": 10, "plane": "XY"}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._extrude_polygon({"points": [[0, 0], [10, 0], [10, 10]], "depth": -5, "plane": "XY"}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._extrude_polygon({"points": [[0, 0], [10, 0], [10, 10]], "depth": 5, "plane": "INVALID"}, self.doc_dir)

    def test_fillet_all_edges(self):
        """Scenario: Fillet all edges of existing solid."""
        mock_doc, mock_box, mock_edges = self._setup_mock_doc(num_edges=12)
        orig_shape = mock_box.Shape
        data = {
            "op": "fillet",
            "object": "Box",
            "radius": 2.0,
        }
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            orig_shape.makeFillet.assert_called_with(2.0, mock_edges)
            mock_doc.recompute.assert_called()

    def test_fillet_specific_edge_indices(self):
        """Fillet with 1-based edge_indices."""
        mock_doc, mock_box, mock_edges = self._setup_mock_doc(num_edges=12)
        orig_shape = mock_box.Shape
        data = {
            "op": "fillet",
            "object": "Box",
            "radius": 2.0,
            "edge_indices": [1, 3],
        }
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            orig_shape.makeFillet.assert_called_with(2.0, [mock_edges[0], mock_edges[2]])

    def test_fillet_invalid_edge_index_triggers_rollback(self):
        """Scenario: Invalid edge index triggers backup rollback without corrupting document."""
        mock_doc, mock_box, _ = self._setup_mock_doc(num_edges=12)
        # Create an existing design file on disk to verify rollback
        design_file = self.doc_dir / "design.FCStd"
        original_bytes = b"pristine_fcstd_data_before_fillet"
        design_file.write_bytes(original_bytes)

        data = {
            "op": "fillet",
            "object": "Box",
            "radius": 2.0,
            "edge_indices": [99],
        }
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            with self.assertRaises(ValueError) as ctx:
                freecad_worker.run(self.job_dir, self.doc_dir, data)
            self.assertIn("out of range", str(ctx.exception))
            # Verify file was rolled back from backup
            self.assertEqual(design_file.read_bytes(), original_bytes)

    def test_chamfer_specific_edge_indices(self):
        """Scenario: Chamfer specific edge indices."""
        mock_doc, mock_box, mock_edges = self._setup_mock_doc(num_edges=8)
        orig_shape = mock_box.Shape
        mock_box.Name = "ExtrudePolygon"
        mock_doc.getObject.side_effect = lambda name: mock_box if name == "ExtrudePolygon" else None
        data = {
            "op": "chamfer",
            "object": "ExtrudePolygon",
            "distance": 1.5,
            "edge_indices": [1, 3],
        }
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            orig_shape.makeChamfer.assert_called_with(1.5, [mock_edges[0], mock_edges[2]])

    def test_chamfer_invalid_edge_index_triggers_rollback(self):
        """Invalid edge index (0 is not 1-based) triggers rollback."""
        mock_doc, mock_box, _ = self._setup_mock_doc(num_edges=8)
        design_file = self.doc_dir / "design.FCStd"
        original_bytes = b"pristine_fcstd_data_before_chamfer"
        design_file.write_bytes(original_bytes)

        data = {
            "op": "chamfer",
            "object": "Box",
            "distance": 1.5,
            "edge_indices": [0],
        }
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            FreeCAD.openDocument.return_value = mock_doc
            with self.assertRaises(ValueError):
                freecad_worker.run(self.job_dir, self.doc_dir, data)
            self.assertEqual(design_file.read_bytes(), original_bytes)

    def test_loft_smooth_solid(self):
        """Scenario: Smooth solid loft through multiple profiles."""
        data = {
            "op": "loft",
            "sections": [
                [[0, 0, 0], [10, 0, 0], [10, 10, 0]],
                [[0, 0, 50], [15, 0, 50], [15, 15, 50]],
                [[0, 0, 100], [5, 0, 100], [5, 5, 100]],
            ],
            "solid": True,
            "ruled": False,
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Part
            FreeCAD.newDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            mock_doc.addObject.assert_called_with("Part::Feature", "Loft")
            self.assertEqual(Part.makePolygon.call_count, 3)
            Part.makeLoft.assert_called()

    def test_loft_ruled_surface(self):
        """Scenario: Ruled surface loft with solid set to false."""
        data = {
            "op": "loft",
            "sections": [
                [[0, 0, 0], [10, 0, 0], [10, 10, 0]],
                [[0, 0, 50], [15, 0, 50], [15, 15, 50]],
            ],
            "solid": False,
            "ruled": True,
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Part
            FreeCAD.newDocument.return_value = mock_doc
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            mock_doc.addObject.assert_called_with("Part::Feature", "Loft")
            Part.makeLoft.assert_called_with(unittest.mock.ANY, False, True)

    def test_loft_validation_rejects_fewer_than_two_sections(self):
        """Scenario: Reject loft with fewer than two sections."""
        with self.assertRaises(ValueError):
            freecad_worker._loft({
                "sections": [[[0, 0, 0], [10, 0, 0], [10, 10, 0]]],
            }, self.doc_dir)


if __name__ == "__main__":
    unittest.main()
