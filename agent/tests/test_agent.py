import io
import json
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from cadgpt_agent.executor import execute, validate
from cadgpt_agent.main import server_url
from cadgpt_agent.discovery import discover
from cadgpt_agent import freecad_worker

class Tests(unittest.TestCase):
    def job(self):
        return dict(id=str(uuid.uuid4()), expires=time.time()*1000+60000, cadId="cad", length=1, width=2, height=3, confirmed=True)
    def test_bounds(self):
        for value in (float("nan"), float("inf"), -1, 0, 10001, True):
            with self.assertRaises(ValueError):
                validate(dict(self.job(), length=value))
        with self.assertRaises(ValueError):
            validate(dict(self.job(), expires=0))
    def test_secure_origin(self):
        self.assertEqual(server_url("https://example.com/"), "https://example.com")
        self.assertEqual(server_url("http://localhost:3000"), "http://localhost:3000")
        for url in ("http://example.com", "https://user:pass@example.com", "https://example.com/path"):
            with self.assertRaises(ValueError):
                server_url(url)
    def test_manual_detection(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "FreeCADCmd"
            path.touch()
            self.assertTrue(any(c["path"] == str(path.resolve()) and c["executable"] for c in discover(str(path))))
    def test_subprocess_is_fixed_and_replay_refused(self):
        with tempfile.TemporaryDirectory() as d:
            job = self.job()
            cads = [dict(id="cad", name="FreeCAD", path="/trusted/FreeCADCmd", executable=True)]
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")
                def finish(timeout):
                    (Path(d) / job["id"] / "design.FCStd").write_bytes(b"test")
                    return 0
                process.wait.side_effect = finish
                execute(job, cads, d)
                self.assertFalse(popen.call_args.kwargs["shell"])
                self.assertEqual(popen.call_args.args[0][0], "/trusted/FreeCADCmd")
                with self.assertRaises(FileExistsError):
                    execute(job, cads, d)
    def test_unknown_cad_rejected(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            execute(self.job(), [], d)

    def test_autocad_create_job_success_message_names_design_dwg(self):
        """13b.4: the DWG-artifact-required postcondition (spec
        autocad-execution-adapter "Job succeeds with DWG only") is enforced by
        `execute()` checking `artifacts()["native"]` before reporting success;
        this confirms the AutoCAD create path actually reports `design.dwg`,
        mirroring `test_subprocess_is_fixed_and_replay_refused` for FreeCAD."""
        with tempfile.TemporaryDirectory() as d:
            job = dict(
                id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                type="create_box", length=10, width=20, height=30, confirmed=True,
            )
            cads = [dict(id="cad", name="AutoCAD", path="/trusted/accoreconsole.exe", executable=True)]
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")
                def finish(timeout):
                    (Path(d) / job["id"] / "design.dwg").write_bytes(b"test")
                    return 0
                process.wait.side_effect = finish
                message = execute(job, cads, d)
                self.assertFalse(popen.call_args.kwargs["shell"])
                self.assertEqual(popen.call_args.args[0][0], "/trusted/accoreconsole.exe")
                self.assertIn("design.dwg", message)
                self.assertTrue(message.startswith("Created "))

    def test_autocad_create_job_without_design_dwg_fails(self):
        """The postcondition's negative case: `accoreconsole` exits 0 but never
        wrote `design.dwg` (e.g. a silent script failure) — `execute()` must
        raise instead of reporting success."""
        with tempfile.TemporaryDirectory() as d:
            job = dict(
                id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                type="create_box", length=10, width=20, height=30, confirmed=True,
            )
            cads = [dict(id="cad", name="AutoCAD", path="/trusted/accoreconsole.exe", executable=True)]
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")
                process.wait.return_value = 0  # exits 0, no design.dwg ever written
                with self.assertRaises(RuntimeError):
                    execute(job, cads, d)


class FreecadWorkerValidationTests(unittest.TestCase):
    """2b.1 (RED): malformed request.json values are rejected before any
    FreeCAD call. None of these need FreeCAD/Part/MeshPart stubbed: if the
    worker attempted `import FreeCAD` before validating, this would raise
    `ModuleNotFoundError` instead of `ValueError`, and the test would fail."""

    def test_unknown_op_exits_with_code_2_and_spawns_no_cad_work(self):
        with self.assertRaises(SystemExit) as ctx:
            freecad_worker.run(Path("/unused"), Path("/unused"), {"op": "delete_everything"})
        self.assertEqual(ctx.exception.code, 2)

    def test_malformed_numeric_values_rejected_for_create_box(self):
        for value in (float("nan"), float("1e309"), -1, 0, 10001, True):
            with self.assertRaises(ValueError):
                freecad_worker.OPS["create_box"]({"length": value, "width": 1, "height": 1}, Path("/unused"))

    def test_malformed_object_names_rejected_before_lookup(self):
        for bad_name in ("..", "a;b", "a'b", 'a"b', "a/b", "../../etc"):
            with self.assertRaises(ValueError):
                freecad_worker.OPS["boolean_cut"]({"base": bad_name, "tool": "Box"}, Path("/unused"))
            with self.assertRaises(ValueError):
                freecad_worker.OPS["translate_object"](
                    {"object": bad_name, "dx": 1, "dy": 1, "dz": 1}, Path("/unused"))

    def test_out_of_range_transform_and_scale_params_rejected(self):
        with self.assertRaises(ValueError):
            freecad_worker.OPS["rotate_object"]({"object": "Box", "axis": "X", "degrees": 361}, Path("/unused"))
        with self.assertRaises(ValueError):
            freecad_worker.OPS["scale_object"]({"object": "Box", "factor": 0.0001}, Path("/unused"))

    def test_malformed_plane_rejected_before_any_freecad_import(self):
        """4a.3: an unrecognized `plane` must fail before FreeCAD is imported.
        `sys.modules["FreeCAD"]`/`Part` are not stubbed here, so a premature
        import would raise `ModuleNotFoundError` instead of `ValueError`."""
        for value in ("XYZ", "xy", "", None, 42):
            with self.assertRaises(ValueError):
                freecad_worker.OPS["extrude_rect"](
                    {"width": 10, "height": 10, "depth": 10, "plane": value}, Path("/unused"))

    def test_export_design_rejects_unknown_format_before_any_freecad_import(self):
        """4b.6/4b.7: `format` must be validated before `_open_document()` is
        called; FreeCAD/Part are not stubbed here, so a premature import
        would raise `ModuleNotFoundError` instead of `ValueError`."""
        for value in ("obj", "STL", "", None, 42):
            with self.assertRaises(ValueError):
                freecad_worker.OPS["export_design"]({"format": value}, Path("/unused"))


class _FakeVector:
    """The only fake needing a real class: `Placement.Base + Vector(...)`."""
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = x, y, z

    def __add__(self, other):
        return _FakeVector(self.x + other.x, self.y + other.y, self.z + other.z)


class _FakeShape:
    """Mimics a Part shape: `copy()` returns a mutable clone; `scale()` records its call."""

    def __init__(self):
        self.BoundBox = SimpleNamespace(XMin=0.0, YMin=0.0, ZMin=0.0, XMax=10.0, YMax=10.0, ZMax=10.0,
                                        Center=_FakeVector())
        self.Volume = 1000.0
        self.scale_calls = []

    def copy(self):
        return _FakeShape()

    def scale(self, factor, center=None):
        self.scale_calls.append((factor, center))


def _fake_shape():
    return _FakeShape()


def _fake_object(name):
    placement = SimpleNamespace(Base=_FakeVector(), Rotation=SimpleNamespace(multiply=lambda other: other))
    return SimpleNamespace(Name=name, Label=name, TypeId="Part::Feature", Shape=_fake_shape(),
                            Placement=placement, InList=[], Base=None, Tool=None)


class _FakeDocument:
    def __init__(self, name="Doc", file_name=""):
        self.Name, self.Objects, self.FileName = name, [], file_name
        self.recompute_calls = self.save_calls = 0
        self.saveas_path = None

    def addObject(self, type_id, name):
        obj = _fake_object(name)
        self.Objects.append(obj)
        return obj

    def getObject(self, name):
        return next((o for o in self.Objects if o.Name == name), None)

    def recompute(self):
        self.recompute_calls += 1

    def saveAs(self, path):
        self.saveas_path = path

    def save(self):
        self.save_calls += 1


class _FakeFreeCAD:
    Vector = _FakeVector

    def __init__(self):
        self.last_document = None

    def Rotation(self, axis, degrees):
        return SimpleNamespace(multiply=lambda other: other)

    def Placement(self, base, rotation):
        return SimpleNamespace(Base=base, Rotation=rotation)

    def newDocument(self, name):
        self.last_document = _FakeDocument(name)
        return self.last_document

    def openDocument(self, path):
        document = _FakeDocument("Reopened", file_name=path)
        document.addObject("Part::Feature", "Box")
        self.last_document = document
        return document

    def closeDocument(self, name):
        pass


class _FakePart:
    """Every `make*`/`makeCompound` builder takes different args but yields
    the same fake shape, so one catch-all attribute resolves them all and
    records its call args for assertions that need to inspect them."""
    def __init__(self):
        self.calls = {}

    def __getattr__(self, name):
        def builder(*args, **kwargs):
            self.calls[name] = args
            return _fake_shape()
        return builder


class _FakeMeshPart:
    FACETS = 12  # binary STL: 84 + 50*facets bytes

    @staticmethod
    def meshFromShape(**kwargs):
        payload = b"\x00" * 80 + _FakeMeshPart.FACETS.to_bytes(4, "little") + b"\x00" * (50 * _FakeMeshPart.FACETS)
        return SimpleNamespace(write=lambda path: Path(path).write_bytes(payload))


class _FakeImportDXF:
    """Fakes FreeCAD's `importDXF` module (only its `.export` entry point)."""

    def __init__(self):
        self.calls = []

    def export(self, objs, path):
        self.calls.append((objs, path))
        Path(path).write_text("DXF", encoding="utf-8")


class FreecadWorkerOpsTests(unittest.TestCase):
    """2b.9: one test per op class (create/modify+boolean/transform/read_scene)
    plus an STL byte-shape assertion. FreeCAD/Part/MeshPart are stubbed via
    `sys.modules` injection so the worker's lazy imports resolve to fakes."""

    def setUp(self):
        self.fake_freecad = _FakeFreeCAD()
        self.fake_part = _FakePart()
        self.fake_dxf = _FakeImportDXF()
        sys.modules["FreeCAD"] = self.fake_freecad
        sys.modules["Part"] = self.fake_part
        sys.modules["MeshPart"] = _FakeMeshPart()
        sys.modules["importDXF"] = self.fake_dxf

    def tearDown(self):
        for name in ("FreeCAD", "Part", "MeshPart", "importDXF"):
            sys.modules.pop(name, None)

    def test_create_box_creates_new_document_saves_and_exports_stl(self):
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d)
            freecad_worker.run(job_dir, job_dir, {"op": "create_box", "length": 10, "width": 20, "height": 30})
            document = self.fake_freecad.last_document
            self.assertEqual(document.saveas_path, str(job_dir / "design.FCStd"))
            self.assertEqual(document.save_calls, 0)
            stl = job_dir / "preview.stl"
            self.assertTrue(stl.is_file())
            self.assertEqual(stl.stat().st_size, 84 + 50 * _FakeMeshPart.FACETS)

    def test_boolean_union_with_document_id_reopens_recomputes_saves_and_exports_stl(self):
        with tempfile.TemporaryDirectory() as d:
            doc_dir = Path(d)
            freecad_worker.run(doc_dir, doc_dir, {
                "op": "boolean_union", "document_id": "existing", "base": "Box", "tool": "Box",
            })
            document = self.fake_freecad.last_document
            self.assertEqual(document.save_calls, 1)
            self.assertGreaterEqual(document.recompute_calls, 1)
            self.assertTrue((doc_dir / "preview.stl").is_file())

    def test_translate_object_mutates_placement_on_reopened_document(self):
        with tempfile.TemporaryDirectory() as d:
            doc_dir = Path(d)
            freecad_worker.run(doc_dir, doc_dir, {
                "op": "translate_object", "document_id": "existing", "object": "Box", "dx": 1, "dy": 2, "dz": 3,
            })
            document = self.fake_freecad.last_document
            box = document.getObject("Box")
            self.assertEqual((box.Placement.Base.x, box.Placement.Base.y, box.Placement.Base.z), (1, 2, 3))
            self.assertEqual(document.save_calls, 1)

    def test_scale_object_scales_a_copy_and_assigns_it_back(self):
        """`obj.Shape` is immutable in FreeCAD: the worker must scale a copy
        about the shape centre and assign the copy back to the feature."""
        with tempfile.TemporaryDirectory() as d:
            doc_dir = Path(d)
            freecad_worker.run(doc_dir, doc_dir, {
                "op": "scale_object", "document_id": "existing", "object": "Box", "factor": 2,
            })
            box = self.fake_freecad.last_document.getObject("Box")
            self.assertEqual(len(box.Shape.scale_calls), 1)
            factor, center = box.Shape.scale_calls[0]
            self.assertEqual(factor, 2.0)
            self.assertIsNotNone(center)

    def test_extrude_rect_maps_plane_to_makebox_args(self):
        """4a.3: each `plane` maps width/height/depth onto the right
        `Part.makeBox(length, width, height, position)` extents."""
        expected = {"XY": (10, 20, 30), "XZ": (10, 30, 20), "YZ": (30, 10, 20)}
        for plane, box_args in expected.items():
            with tempfile.TemporaryDirectory() as d:
                job_dir = Path(d)
                freecad_worker.run(job_dir, job_dir, {
                    "op": "extrude_rect", "width": 10, "height": 20, "depth": 30, "plane": plane,
                })
                recorded = self.fake_part.calls["makeBox"]
                self.assertEqual(recorded[:3], box_args)
                document = self.fake_freecad.last_document
                self.assertEqual(document.saveas_path, str(job_dir / "design.FCStd"))

    def test_read_scene_writes_scene_json_without_saving(self):
        with tempfile.TemporaryDirectory() as d:
            doc_dir = Path(d)
            freecad_worker.run(doc_dir, doc_dir, {"op": "read_scene", "document_id": "existing"})
            document = self.fake_freecad.last_document
            self.assertEqual(document.save_calls, 0)
            scene = json.loads((doc_dir / "scene.json").read_text())
            self.assertEqual(scene[0]["name"], "Box")
            self.assertIn("bbox", scene[0])
            self.assertIn("volume", scene[0])

    def test_export_design_happy_path_per_format_does_not_save_the_document(self):
        """4b.7/4b.8: one export per allowlisted format, asserting each format's
        own artifact/call while confirming `export_design` never mutates the
        reopened document (`document.save_calls == 0`, no `saveAs`)."""
        for fmt in ("step", "stl", "dxf"):
            with tempfile.TemporaryDirectory() as d:
                doc_dir = Path(d)
                freecad_worker.run(doc_dir, doc_dir, {
                    "op": "export_design", "document_id": "existing", "format": fmt,
                })
                document = self.fake_freecad.last_document
                self.assertEqual(document.save_calls, 0)
                self.assertIsNone(document.saveas_path)
                if fmt == "step":
                    objs, path = self.fake_part.calls["export"]
                    self.assertEqual(list(objs), document.Objects)
                    self.assertEqual(path, str(doc_dir / "export.step"))
                elif fmt == "stl":
                    exported = doc_dir / "export.stl"
                    self.assertTrue(exported.is_file())
                    self.assertEqual(exported.stat().st_size, 84 + 50 * _FakeMeshPart.FACETS)
                else:
                    self.assertEqual(self.fake_dxf.calls[-1][1], str(doc_dir / "export.dxf"))


if __name__ == "__main__":
    unittest.main()
