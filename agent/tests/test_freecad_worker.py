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

    def test_font_resolution_default_bundled_font(self):
        """Scenario: Default resolution resolves to bundled Inter-Bold font."""
        font = freecad_worker._resolve_font(None)
        self.assertTrue(font.endswith("Inter-Bold.ttf"))
        self.assertTrue(os.path.isfile(font))

    def test_font_resolution_explicit_valid_font(self):
        """Scenario: Explicit font path resolves when file exists."""
        temp_font = self.job_dir / "test_font.ttf"
        temp_font.write_bytes(b"dummy_ttf_bytes")
        font = freecad_worker._resolve_font(str(temp_font))
        self.assertEqual(font, str(temp_font.resolve()))

    def test_font_resolution_nonexistent_path_falls_back_to_bundled(self):
        """Scenario: Nonexistent font path gracefully falls back to bundled font."""
        font = freecad_worker._resolve_font("/nonexistent/custom.ttf")
        self.assertTrue(font.endswith("Inter-Bold.ttf"))
        self.assertTrue(os.path.isfile(font))

    def test_font_resolution_falls_back_to_os_when_bundled_missing(self):
        """Scenario: Headless environment resolves to system OS font when bundled is absent."""
        def mock_isfile(p):
            if str(p).endswith("Inter-Bold.ttf"):
                return False
            return str(p).endswith("Arial.ttf")

        with patch("os.path.isfile", side_effect=mock_isfile):
            font = freecad_worker._resolve_font()
            self.assertTrue(font.endswith("Arial.ttf"))

    def test_font_resolution_fails_when_no_fonts_found(self):
        """Scenario: Resolution fails with diagnostic error when no valid fonts found."""
        with patch("os.path.isfile", return_value=False):
            with self.assertRaises(ValueError) as ctx:
                freecad_worker._resolve_font()
            self.assertIn("No valid TrueType or OpenType font", str(ctx.exception))

    def test_create_text_3d_validation(self):
        """Scenario: Rejection of empty text and invalid parameters."""
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": ""}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "A" * 121}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": -5}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 0}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 2, "mode": "invalid"}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 2, "mode": "emboss"}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 2, "plane": "INVALID"}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 2, "position": {"x": 150000}}, self.doc_dir)
        with self.assertRaises(ValueError):
            freecad_worker._create_text_3d({"text": "OK", "size": 10, "thickness": 2, "tracking": 999}, self.doc_dir)

    def test_create_text_3d_flat_xy(self):
        """Scenario: Generate flat 3D text solid on XY plane."""
        data = {
            "op": "create_text_3d",
            "text": "CAD-01",
            "size": 12.0,
            "thickness": 2.5,
            "mode": "flat",
            "plane": "XY",
            "tracking": 1.5,
        }
        mock_doc = MagicMock()
        mock_doc.FileName = ""
        mock_doc.Name = "CADGPTDesign"
        mock_doc.Objects = []
        mock_ss = MagicMock()
        mock_ss.Name = "ShapeString"
        mock_shape_2d = MagicMock()
        mock_ss.Shape = mock_shape_2d
        mock_solid = MagicMock()
        mock_shape_2d.extrude.return_value = mock_solid

        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Draft": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Draft
            FreeCAD.newDocument.return_value = mock_doc
            Draft.make_shapestring.return_value = mock_ss
            freecad_worker.run(self.job_dir, self.doc_dir, data)

            Draft.make_shapestring.assert_called_with(
                String="CAD-01",
                FontFile=unittest.mock.ANY,
                Size=12.0,
                Tracking=1.5,
            )
            mock_shape_2d.extrude.assert_called()
            mock_doc.addObject.assert_called_with("Part::Feature", "Text3D")

    def test_create_text_3d_emboss(self):
        """Scenario: Emboss text onto existing solid surface."""
        mock_doc, mock_bracket, _ = self._setup_mock_doc()
        mock_bracket.Name = "Bracket"
        orig_shape = mock_bracket.Shape
        mock_doc.getObject.side_effect = lambda name: mock_bracket if name == "Bracket" else None

        data = {
            "op": "create_text_3d",
            "text": "REV-2",
            "size": 10.0,
            "thickness": 1.0,
            "mode": "emboss",
            "target_object": "Bracket",
        }
        mock_ss = MagicMock()
        mock_ss.Name = "ShapeString"
        mock_shape_2d = MagicMock()
        mock_ss.Shape = mock_shape_2d
        mock_solid = MagicMock()
        mock_shape_2d.extrude.return_value = mock_solid
        orig_shape.fuse.return_value = MagicMock()

        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Draft": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Draft
            FreeCAD.newDocument.return_value = mock_doc
            FreeCAD.openDocument.return_value = mock_doc
            Draft.make_shapestring.return_value = mock_ss
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            orig_shape.fuse.assert_called_with(mock_solid)

    def test_create_text_3d_engrave(self):
        """Scenario: Engrave text into existing solid surface."""
        mock_doc, mock_panel, _ = self._setup_mock_doc()
        mock_panel.Name = "Panel"
        orig_shape = mock_panel.Shape
        mock_doc.getObject.side_effect = lambda name: mock_panel if name == "Panel" else None

        data = {
            "op": "create_text_3d",
            "text": "OFF",
            "size": 8.0,
            "thickness": 0.5,
            "mode": "engrave",
            "target_object": "Panel",
        }
        mock_ss = MagicMock()
        mock_ss.Name = "ShapeString"
        mock_shape_2d = MagicMock()
        mock_ss.Shape = mock_shape_2d
        mock_solid = MagicMock()
        mock_shape_2d.extrude.return_value = mock_solid
        orig_shape.cut.return_value = MagicMock()

        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Draft": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Draft
            FreeCAD.newDocument.return_value = mock_doc
            FreeCAD.openDocument.return_value = mock_doc
            Draft.make_shapestring.return_value = mock_ss
            freecad_worker.run(self.job_dir, self.doc_dir, data)
            orig_shape.cut.assert_called_with(mock_solid)

    def test_create_text_3d_boolean_failure_triggers_rollback(self):
        """Scenario: Boolean failure triggers automatic document rollback."""
        mock_doc, mock_panel, _ = self._setup_mock_doc()
        mock_panel.Name = "Panel"
        mock_doc.getObject.side_effect = lambda name: mock_panel if name == "Panel" else None

        design_file = self.doc_dir / "design.FCStd"
        original_bytes = b"pristine_fcstd_data_before_text_engrave"
        design_file.write_bytes(original_bytes)

        data = {
            "op": "create_text_3d",
            "text": "FAIL",
            "size": 8.0,
            "thickness": 0.5,
            "mode": "engrave",
            "target_object": "Panel",
        }
        mock_ss = MagicMock()
        mock_ss.Name = "ShapeString"
        mock_shape_2d = MagicMock()
        mock_ss.Shape = mock_shape_2d
        mock_solid = MagicMock()
        mock_shape_2d.extrude.return_value = mock_solid
        mock_panel.Shape.cut.side_effect = RuntimeError("OpenCASCADE Boolean Cut failure")

        with patch.dict("sys.modules", {"FreeCAD": MagicMock(), "Draft": MagicMock(), "Part": MagicMock(), "MeshPart": MagicMock()}):
            import FreeCAD
            import Draft
            FreeCAD.newDocument.return_value = mock_doc
            FreeCAD.openDocument.return_value = mock_doc
            Draft.make_shapestring.return_value = mock_ss
            with self.assertRaises(RuntimeError) as ctx:
                freecad_worker.run(self.job_dir, self.doc_dir, data)
            self.assertIn("Boolean Cut failure", str(ctx.exception))
            self.assertEqual(design_file.read_bytes(), original_bytes)

    def test_extrude_polygon_with_nested_holes(self):
        """Scenario: Extrude polygon with nested hole cutouts."""
        data = {
            "op": "extrude_polygon",
            "points": [[0, 0], [100, 0], [100, 100], [0, 100]],
            "holes": [
                [[20, 20], [40, 20], [40, 40], [20, 40]],
                [[60, 60], [80, 60], [80, 80], [60, 80]],
            ],
            "depth": 10.0,
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
            self.assertEqual(Part.makePolygon.call_count, 3)
            Part.Face.assert_called()
            mock_doc.addObject.assert_called_with("Part::Feature", "ExtrudePolygon")

    def test_extrude_polygon_holes_validation(self):
        """Scenario: Reject invalid hole loops in extrude_polygon."""
        with self.assertRaises(ValueError):
            freecad_worker._extrude_polygon({
                "points": [[0, 0], [10, 0], [10, 10]],
                "holes": [[[0, 0], [5, 5]]],
                "depth": 5,
            }, self.doc_dir)

        with self.assertRaises(ValueError):
            freecad_worker._extrude_polygon({
                "points": [[0, 0], [10, 0], [10, 10]],
                "holes": [[[0, 0], [5, 0], [5, 5]]] * 21,
                "depth": 5,
            }, self.doc_dir)


if __name__ == "__main__":
    unittest.main()
