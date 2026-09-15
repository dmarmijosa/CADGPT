import io
import json
import logging
import platform
import sys
import tempfile
import time
import unittest
import urllib.error
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
                    (Path(d) / "jobs" / job["id"] / "design.FCStd").write_bytes(b"test")
                    return 0
                process.wait.side_effect = finish
                execute(job, cads, d)
                self.assertFalse(popen.call_args.kwargs["shell"])
                self.assertEqual(popen.call_args.args[0][0], str(Path("/trusted/FreeCADCmd")))
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
                    (Path(d) / "jobs" / job["id"] / "design.dwg").write_bytes(b"test")
                    return 0
                process.wait.side_effect = finish
                message = execute(job, cads, d)
                self.assertFalse(popen.call_args.kwargs["shell"])
                self.assertEqual(popen.call_args.args[0][0], str(Path("/trusted/accoreconsole.exe")))
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


class ConnectStepTests(unittest.TestCase):
    """15.6 (RED): after pairing completes, the agent guides the user to the
    post-pairing "connect your MCP client" step (spec mcp-client-onboarding).
    The opened URL MUST carry only the device UUID -- never the device
    secret/credential returned alongside it by `/api/pairings/poll`."""

    DEVICE_ID = "11111111-2222-3333-4444-555555555555"
    SECRET = "super-secret-device-credential-do-not-leak"

    def test_opens_the_connect_url_with_only_the_device_id(self):
        from cadgpt_agent.main import open_connect_step

        with patch("cadgpt_agent.main.webbrowser.open") as browser_open:
            url = open_connect_step("https://cadgpt.example", self.DEVICE_ID, False)

        browser_open.assert_called_once_with("https://cadgpt.example/connect?device=" + self.DEVICE_ID)
        self.assertIn(self.DEVICE_ID, url)
        self.assertNotIn(self.SECRET, url)

    def test_headless_prints_the_url_instead_of_opening_a_browser(self):
        from cadgpt_agent.main import open_connect_step

        with patch("cadgpt_agent.main.webbrowser.open") as browser_open:
            url = open_connect_step("https://cadgpt.example", self.DEVICE_ID, True)

        browser_open.assert_not_called()
        self.assertEqual(url, "https://cadgpt.example/connect?device=" + self.DEVICE_ID)
        self.assertNotIn(self.SECRET, url)


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


class CliDispatchTests(unittest.TestCase):
    def test_unknown_subcommand_rejected(self):
        with self.assertRaises(SystemExit) as ctx:
            from cadgpt_agent.main import main
            main(["invalid-cmd"])
        self.assertEqual(ctx.exception.code, 2)

    def test_default_foreground_dispatch_without_subcommand(self):
        from cadgpt_agent.main import main
        with patch("cadgpt_agent.main.run_foreground_loop") as mock_loop:
            mock_loop.return_value = 0
            ret = main(["--server", "https://example.com/api"])
            self.assertEqual(ret, 0)
            mock_loop.assert_called_once()
            args = mock_loop.call_args[0][0]
            self.assertEqual(args.server, "https://example.com/api")
            self.assertIsNone(args.subcommand)

    def test_version_outputs_semver_string(self):
        from cadgpt_agent.main import main, VERSION
        out = io.StringIO()
        with patch("sys.stdout", out):
            ret = main(["version"])
        self.assertEqual(ret, 0)
        self.assertIn(f"cadengine v{VERSION}", out.getvalue())

    def test_version_flag_outputs_semver_string(self):
        from cadgpt_agent.main import main, VERSION
        out = io.StringIO()
        with patch("sys.stdout", out):
            ret = main(["--version"])
        self.assertEqual(ret, 0)
        self.assertIn(f"cadengine v{VERSION}", out.getvalue())

    def test_version_check_newer_release_notifies_upgrade(self):
        from cadgpt_agent.main import main, VERSION
        out = io.StringIO()
        with patch("sys.stdout", out), patch("cadgpt_agent.main.check_latest_release", return_value="0.9.9"):
            ret = main(["version", "--check"])
        self.assertEqual(ret, 0)
        output = out.getvalue()
        self.assertIn(f"cadengine v{VERSION}", output)
        self.assertIn("An update is available: v0.9.9", output)

    def test_version_check_offline_falls_back_gracefully(self):
        from cadgpt_agent.main import main, VERSION
        out = io.StringIO()
        with patch("sys.stdout", out), patch("cadgpt_agent.main.check_latest_release", return_value=None):
            ret = main(["version", "--check"])
        self.assertEqual(ret, 0)
        self.assertIn(f"cadengine v{VERSION}", out.getvalue())
        self.assertNotIn("An update is available", out.getvalue())


class StatusSubcommandTests(unittest.TestCase):
    def test_status_healthy_returns_0(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200
            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="token123"), \
                 patch("urllib.request.urlopen", return_value=mock_resp), \
                 patch("cadgpt_agent.main.discover", return_value=[{"id": "1", "name": "FreeCAD", "path": "/bin/FreeCADCmd", "executable": True}]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": True, "active": True, "status": "active", "name": "test"}):
                ret = main(["status"])
                self.assertEqual(ret, 0)

    def test_status_unpaired_returns_1(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200
            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value=None), \
                 patch("urllib.request.urlopen", return_value=mock_resp), \
                 patch("cadgpt_agent.main.discover", return_value=[]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": False, "active": False, "status": "not installed", "name": "test"}):
                ret = main(["status"])
                self.assertEqual(ret, 1)

    def test_status_json_schema(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200
            out = io.StringIO()
            with patch("sys.stdout", out), \
                 patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="token123"), \
                 patch("urllib.request.urlopen", return_value=mock_resp), \
                 patch("cadgpt_agent.main.discover", return_value=[]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": True, "active": True, "status": "active", "name": "test"}):
                ret = main(["status", "--json"])
                self.assertEqual(ret, 0)
                data = json.loads(out.getvalue())
                for key in ("host", "config", "keyring", "server", "cads", "service"):
                    self.assertIn(key, data)


class PairUnpairSubcommandTests(unittest.TestCase):
    def test_pair_headless_persists_credentials(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("cadgpt_agent.main.discover", return_value=[]), \
                 patch("cadgpt_agent.main.request") as mock_req, \
                 patch("cadgpt_agent.main.open_connect_step") as mock_connect, \
                 patch("keyring.delete_password"), \
                 patch("keyring.set_password") as mock_set_pw:
                mock_req.side_effect = [
                    {"userCode": "CODE-1234", "deviceSecret": "secret-123"},
                    {"pending": False, "credential": "cred-token-456", "deviceId": "dev-uuid-789"},
                ]
                with patch("cadgpt_agent.main.time.sleep"):
                    ret = main(["pair", "--server", "https://example.com", "--headless"])
                self.assertEqual(ret, 0)
                mock_set_pw.assert_called_with("CADGPT", "https://example.com", "cred-token-456")
                mock_connect.assert_called_with("https://example.com", "dev-uuid-789", True)
                cfg = json.loads((Path(td) / "config.json").read_text())
                self.assertEqual(cfg["deviceId"], "dev-uuid-789")

    def test_unpair_calls_server_and_unconditionally_wipes(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://example.com", "deviceId": "dev-123"}))
            cred_file = Path(td) / "credential.json"
            cred_file.write_text(json.dumps({"server": "https://example.com", "credential": "bearer-tok"}))

            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="bearer-tok"), \
                 patch("keyring.delete_password") as mock_del, \
                 patch("cadgpt_agent.main.request") as mock_req:
                ret = main(["unpair"])
                self.assertEqual(ret, 0)
                mock_req.assert_called_once_with("https://example.com", "/api/agent/unpair", {}, credential="bearer-tok")
                mock_del.assert_called_with("CADGPT", "https://example.com")
                self.assertFalse(cred_file.exists())
                updated_cfg = json.loads(config.read_text())
                self.assertNotIn("deviceId", updated_cfg)

    def test_unpair_offline_force_unconditionally_wipes(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://example.com", "deviceId": "dev-123"}))
            cred_file = Path(td) / "credential.json"
            cred_file.write_text(json.dumps({"server": "https://example.com", "credential": "bearer-tok"}))

            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="bearer-tok"), \
                 patch("keyring.delete_password") as mock_del, \
                 patch("cadgpt_agent.main.request", side_effect=urllib.error.URLError("Server unreachable")):
                ret = main(["unpair", "--force"])
                self.assertEqual(ret, 0)
                mock_del.assert_called_with("CADGPT", "https://example.com")
                self.assertFalse(cred_file.exists())
                updated_cfg = json.loads(config.read_text())
                self.assertNotIn("deviceId", updated_cfg)


class LoggingSubcommandTests(unittest.TestCase):
    def test_rotating_file_handler_configuration(self):
        from cadgpt_agent.main import setup_logging
        with tempfile.TemporaryDirectory() as td:
            logger, log_path = setup_logging(root_dir=td, log_filename="cadengine.log")
            self.assertEqual(log_path, Path(td) / "logs" / "cadengine.log")
            rfh = next(h for h in logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler))
            self.assertEqual(rfh.maxBytes, 5 * 1024 * 1024)
            self.assertEqual(rfh.backupCount, 3)

    def test_logs_subcommand_outputs_lines(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            logs_dir = Path(td) / "logs"
            logs_dir.mkdir(parents=True)
            log_file = logs_dir / "cadengine.log"
            log_file.write_text("".join(f"line {i}\n" for i in range(100)))

            out = io.StringIO()
            with patch("sys.stdout", out), patch("cadgpt_agent.main.user_data_dir", return_value=td):
                ret = main(["logs", "-n", "20"])
            self.assertEqual(ret, 0)
            lines = out.getvalue().strip().splitlines()
            self.assertEqual(len(lines), 20)
            self.assertEqual(lines[0], "line 80")
            self.assertEqual(lines[-1], "line 99")


class TestSubcommandTests(unittest.TestCase):
    def test_smoke_test_successful(self):
        from cadgpt_agent.main import main
        cad = {"id": "cad-1", "name": "FreeCAD", "path": "/bin/FreeCADCmd", "executable": True}
        with patch("cadgpt_agent.main.discover", return_value=[cad]), \
             patch("cadgpt_agent.main.execute") as mock_exec:
            def fake_exec(job, cads, root, **kwargs):
                jdir = Path(root) / "jobs" / job["id"]
                jdir.mkdir(parents=True, exist_ok=True)
                (jdir / "design.FCStd").write_bytes(b"fcstd-data")
                (jdir / "preview.stl").write_bytes(b"A" * 100)
                return "ok"
            mock_exec.side_effect = fake_exec
            out = io.StringIO()
            with patch("sys.stdout", out):
                ret = main(["test", "--cad", "freecad"])
            self.assertEqual(ret, 0)
            self.assertIn("[PASS] FreeCAD smoke test succeeded", out.getvalue())

    def test_smoke_test_failure_reports_diagnostics(self):
        from cadgpt_agent.main import main
        cad = {"id": "cad-1", "name": "FreeCAD", "path": "/bin/FreeCADCmd", "executable": True}
        with patch("cadgpt_agent.main.discover", return_value=[cad]), \
             patch("cadgpt_agent.main.execute", side_effect=RuntimeError("Subprocess crashed")):
            err = io.StringIO()
            with patch("sys.stderr", err):
                ret = main(["test", "--cad", "freecad"])
            self.assertEqual(ret, 1)
            self.assertIn("[FAIL] FreeCAD smoke test failed: Subprocess crashed", err.getvalue())


class DoctorSubcommandTests(unittest.TestCase):
    def test_doctor_all_green(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example", "deviceId": "dev-1"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200
            cad = {"id": "cad-1", "name": "FreeCAD", "path": "/bin/FreeCADCmd", "executable": True}
            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="tok"), \
                 patch("urllib.request.urlopen", return_value=mock_resp), \
                 patch("cadgpt_agent.main.discover", return_value=[cad]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": True, "active": True, "status": "active", "name": "service"}):
                ret = main(["doctor"])
                self.assertEqual(ret, 0)

    def test_doctor_missing_cad_fails_without_fix(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example", "deviceId": "dev-1"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200
            with patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="tok"), \
                 patch("urllib.request.urlopen", return_value=mock_resp), \
                 patch("cadgpt_agent.main.discover", return_value=[]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": True, "active": True, "status": "active", "name": "service"}), \
                 patch("sys.stdin.isatty", return_value=False):
                ret = main(["doctor"])
                self.assertEqual(ret, 1)

    def test_doctor_fix_provisions_headless_freecad_and_registers_environment(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "home"
            home.mkdir()
            config = Path(td) / "config.json"
            config.write_text(json.dumps({"server": "https://server.example", "deviceId": "dev-1"}))
            mock_resp = io.BytesIO(b'{"status": "ok"}')
            mock_resp.status = 200

            cad = {"id": "cad-1", "name": "FreeCAD", "path": "/bin/FreeCADCmd", "executable": True}
            discover_calls = [[] , [cad]]

            def mock_urlopen(*a, **kw):
                r = io.BytesIO(b'{"status": "ok"}')
                r.status = 200
                return r

            with patch("cadgpt_agent.main.Path.home", return_value=home), \
                 patch("cadgpt_agent.main.user_data_dir", return_value=td), \
                 patch("keyring.get_password", return_value="tok"), \
                 patch("urllib.request.urlopen", side_effect=mock_urlopen), \
                 patch("cadgpt_agent.main.discover", side_effect=lambda *a, **kw: discover_calls.pop(0) if discover_calls else [cad]), \
                 patch("cadgpt_agent.main.get_service_status", return_value={"installed": True, "active": True, "status": "active", "name": "service"}), \
                 patch("shutil.which", return_value="/usr/bin/conda"), \
                 patch("subprocess.run") as mock_run:
                mock_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
                ret = main(["doctor", "--fix"])
                self.assertEqual(ret, 0)
                env_file = home / ".conda" / "environments.txt"
                self.assertTrue(env_file.is_file())
                self.assertIn("cadengine-freecad", env_file.read_text())


class UpdateSubcommandTests(unittest.TestCase):
    def test_update_already_latest(self):
        from cadgpt_agent.main import main, VERSION
        release_json = json.dumps({"tag_name": f"v{VERSION}"}).encode()
        mock_resp = io.BytesIO(release_json)
        out = io.StringIO()
        with patch("sys.stdout", out), patch("urllib.request.urlopen", return_value=mock_resp):
            ret = main(["update"])
        self.assertEqual(ret, 0)
        self.assertIn("already up to date", out.getvalue())

    def test_update_downloads_verifies_sha256_replaces_and_restarts(self):
        import hashlib
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            binary = Path(td) / "cadengine"
            binary.write_bytes(b"old-binary")

            new_bytes = b"brand-new-executable-binary"
            sha = hashlib.sha256(new_bytes).hexdigest()
            asset_name = "cadengine-darwin" if platform.system() == "Darwin" else ("cadengine-windows.exe" if platform.system() == "Windows" else "cadengine-linux")
            sums_content = f"{sha}  {asset_name}\n".encode()

            release_payload = {
                "tag_name": "v0.9.0",
                "assets": [
                    {"name": "SHA256SUMS.txt", "browser_download_url": "https://download/sums"},
                    {"name": asset_name, "browser_download_url": "https://download/bin"},
                ]
            }

            def fake_urlopen(req, timeout=10):
                url = req.full_url if hasattr(req, "full_url") else str(req)
                if "releases/latest" in url:
                    return io.BytesIO(json.dumps(release_payload).encode())
                elif "download/sums" in url:
                    return io.BytesIO(sums_content)
                elif "download/bin" in url:
                    return io.BytesIO(new_bytes)
                raise ValueError("Unexpected URL: " + url)

            with patch("urllib.request.urlopen", side_effect=fake_urlopen), \
                 patch("cadgpt_agent.main.get_agent_executable", return_value=str(binary)), \
                 patch("cadgpt_agent.main.restart_service") as mock_restart:
                ret = main(["update"])
                self.assertEqual(ret, 0)
                self.assertEqual(binary.read_bytes(), new_bytes)
                mock_restart.assert_called_once()

    def test_update_sha256_mismatch_fails(self):
        from cadgpt_agent.main import main
        with tempfile.TemporaryDirectory() as td:
            binary = Path(td) / "cadengine"
            binary.write_bytes(b"old-binary")

            new_bytes = b"brand-new-executable-binary"
            asset_name = "cadengine-darwin" if platform.system() == "Darwin" else ("cadengine-windows.exe" if platform.system() == "Windows" else "cadengine-linux")
            sums_content = f"badhash1234567890  {asset_name}\n".encode()

            release_payload = {
                "tag_name": "v0.9.0",
                "assets": [
                    {"name": "SHA256SUMS.txt", "browser_download_url": "https://download/sums"},
                    {"name": asset_name, "browser_download_url": "https://download/bin"},
                ]
            }

            def fake_urlopen(req, timeout=10):
                url = req.full_url if hasattr(req, "full_url") else str(req)
                if "releases/latest" in url:
                    return io.BytesIO(json.dumps(release_payload).encode())
                elif "download/sums" in url:
                    return io.BytesIO(sums_content)
                elif "download/bin" in url:
                    return io.BytesIO(new_bytes)
                raise ValueError("Unexpected URL: " + url)

            err = io.StringIO()
            with patch("sys.stderr", err), \
                 patch("urllib.request.urlopen", side_effect=fake_urlopen), \
                 patch("cadgpt_agent.main.get_agent_executable", return_value=str(binary)):
                ret = main(["update"])
                self.assertEqual(ret, 1)
                self.assertEqual(binary.read_bytes(), b"old-binary")
                self.assertIn("SHA-256 verification failed", err.getvalue())


class ServiceSubcommandTests(unittest.TestCase):
    def test_service_commands_dispatch(self):
        from cadgpt_agent.main import main
        with patch("cadgpt_agent.main.install_service") as m_inst, \
             patch("cadgpt_agent.main.start_service") as m_start, \
             patch("cadgpt_agent.main.stop_service") as m_stop, \
             patch("cadgpt_agent.main.get_service_status", return_value={"name": "test", "installed": True, "active": True, "status": "active"}) as m_stat, \
             patch("cadgpt_agent.main.uninstall_service") as m_uninst:
            self.assertEqual(main(["service", "install"]), 0)
            m_inst.assert_called_once()
            self.assertEqual(main(["service", "start"]), 0)
            m_start.assert_called_once()
            self.assertEqual(main(["service", "stop"]), 0)
            m_stop.assert_called_once()
            self.assertEqual(main(["service", "status"]), 0)
            m_stat.assert_called_once()
            self.assertEqual(main(["service", "uninstall"]), 0)
            m_uninst.assert_called_once()


if __name__ == "__main__":
    unittest.main()

