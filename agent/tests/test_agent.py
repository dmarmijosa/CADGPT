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


class _FakeVector:
    """The only fake needing a real class: `Placement.Base + Vector(...)`."""
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = x, y, z

    def __add__(self, other):
        return _FakeVector(self.x + other.x, self.y + other.y, self.z + other.z)


def _fake_shape():
    bbox = SimpleNamespace(XMin=0.0, YMin=0.0, ZMin=0.0, XMax=10.0, YMax=10.0, ZMax=10.0)
    return SimpleNamespace(BoundBox=bbox, Volume=1000.0, scale=lambda factor: None)


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
    the same fake shape, so one catch-all attribute resolves them all."""
    def __getattr__(self, name):
        return lambda *args, **kwargs: _fake_shape()


class _FakeMeshPart:
    FACETS = 12  # binary STL: 84 + 50*facets bytes

    @staticmethod
    def meshFromShape(**kwargs):
        payload = b"\x00" * 80 + _FakeMeshPart.FACETS.to_bytes(4, "little") + b"\x00" * (50 * _FakeMeshPart.FACETS)
        return SimpleNamespace(write=lambda path: Path(path).write_bytes(payload))


class FreecadWorkerOpsTests(unittest.TestCase):
    """2b.9: one test per op class (create/modify+boolean/transform/read_scene)
    plus an STL byte-shape assertion. FreeCAD/Part/MeshPart are stubbed via
    `sys.modules` injection so the worker's lazy imports resolve to fakes."""

    def setUp(self):
        self.fake_freecad = _FakeFreeCAD()
        sys.modules["FreeCAD"] = self.fake_freecad
        sys.modules["Part"] = _FakePart()
        sys.modules["MeshPart"] = _FakeMeshPart()

    def tearDown(self):
        for name in ("FreeCAD", "Part", "MeshPart"):
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


if __name__ == "__main__":
    unittest.main()
