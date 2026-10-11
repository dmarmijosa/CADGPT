"""Civil 3D and SOLIDWORKS support, fully simulated.

Neither product can run on CI (Windows-only, licensed). Every test here
mocks the boundary instead: `winreg` is faked, `platform.system()` is
patched, and `subprocess.Popen` is replaced so no CAD or PowerShell process
is ever started. What is asserted is everything CAD Engine itself controls —
detection, capability gating, the exact argv, the rendered `run.scr` /
`plan.json`, validation, and the executor's artifact handling.
"""
import io
import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from cadgpt_agent import discovery
from cadgpt_agent.discovery import discover
from cadgpt_agent.executor import STRATEGIES, _decode_tail, execute
from cadgpt_agent.strategies.autocad import _LSP_PATH, render_script
from cadgpt_agent.strategies.civil3d import CIVIL3D_CREATE_OPS, Civil3DStrategy
from cadgpt_agent.strategies.solidworks import (
    _WORKER,
    SOLIDWORKS_OPS,
    SolidWorksStrategy,
    build_feature,
)

from test_discovery import FULL_TREE, make_fake_winreg

CIVIL_TREE = {
    "R25.1": {
        "ACAD-9100": {
            "AcadLocation": None,
            "locales": {"ACAD-9100:409": {"ProductName": "Autodesk Civil 3D 2026 - English"}},
        }
    }
}


def _job(**overrides):
    base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad", confirmed=True)
    base.update(overrides)
    return base


def _run_execute(root, job, cad, writes):
    """Run `execute` with Popen mocked; `writes(job_dir)` fakes the CAD output."""
    with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
        process = popen.return_value
        process.stdout = io.BytesIO(b"")

        def finish(timeout):
            writes(Path(root) / "jobs" / job["id"])
            return 0

        process.wait.side_effect = finish
        message = execute(job, [cad], root)
        return popen.call_args, message


class Civil3DDiscoveryTests(unittest.TestCase):
    def _discover(self, tree, enable_autocad=False, c3d_folder=False):
        d = tempfile.mkdtemp()
        install_dir = Path(d) / "AutoCAD 2026"
        install_dir.mkdir()
        if c3d_folder:
            (install_dir / "C3D").mkdir()
        console = install_dir / "accoreconsole.exe"
        console.touch()
        product = next(iter(tree["R25.1"]))
        tree = {"R25.1": {product: {**tree["R25.1"][product], "AcadLocation": str(install_dir)}}}
        with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
             patch("cadgpt_agent.discovery.winreg", make_fake_winreg(tree)), \
             patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
            cads = discover(enable_autocad=enable_autocad)
        return cads, str(console.resolve())

    def test_civil3d_product_name_reports_both_autocad_and_civil3d(self):
        cads, console = self._discover(CIVIL_TREE)
        names = sorted(c["name"] for c in cads if c["path"] == console)
        self.assertEqual(names, ["AutoCAD", "Civil3D"])
        civil = next(c for c in cads if c["name"] == "Civil3D")
        autocad = next(c for c in cads if c["name"] == "AutoCAD")
        self.assertNotEqual(civil["id"], autocad["id"])
        self.assertEqual(civil["capabilities"]["ops"], discovery.CIVIL3D_OPS)
        self.assertIn("extrude_cross_section", civil["capabilities"]["ops"])
        self.assertNotIn("extrude_cross_section", autocad["capabilities"]["ops"])
        self.assertTrue(civil["capabilities"]["mesh"])

    def test_c3d_folder_marks_a_plain_autocad_registry_entry_as_civil3d(self):
        cads, _ = self._discover(FULL_TREE, c3d_folder=True)
        self.assertIn("Civil3D", [c["name"] for c in cads])

    def test_plain_autocad_has_no_civil3d_entry(self):
        cads, _ = self._discover(FULL_TREE)
        self.assertNotIn("Civil3D", [c["name"] for c in cads])

    def test_civil3d_follows_the_enable_autocad_gate(self):
        cads, _ = self._discover(CIVIL_TREE)
        self.assertFalse(next(c for c in cads if c["name"] == "Civil3D")["executable"])
        cads, _ = self._discover(CIVIL_TREE, enable_autocad=True)
        civil = next(c for c in cads if c["name"] == "Civil3D")
        self.assertTrue(civil["executable"])
        self.assertTrue(civil["capabilities"]["execute"])

    def test_civil3d_ops_extend_autocad_ops(self):
        self.assertEqual(discovery.CIVIL3D_OPS[: len(discovery.AUTOCAD_OPS)], discovery.AUTOCAD_OPS)
        strategy = Civil3DStrategy()
        for op in discovery.CIVIL3D_OPS:
            self.assertTrue(strategy.supports(op), op)


class Civil3DStrategyTests(unittest.TestCase):
    DESIGN = Path("/opt/cadgpt/documents/doc-1/design.dwg")
    STL = Path("/opt/cadgpt/jobs/job-1/preview.stl")

    def test_cross_section_golden_script(self):
        data = dict(bottom_width=12, top_width=8, height=2.5, length=100, position=dict(x=1, y=2, z=3))
        script = render_script("extrude_cross_section", data, Path("/opt/cadgpt/autocad/cadgpt.lsp"),
                               self.DESIGN, self.STL, create_ops=CIVIL3D_CREATE_OPS)
        self.assertEqual(
            script,
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            "(cadgpt-extrude-cross-section 12.0 8.0 2.5 100.0 1.0 2.0 3.0)\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_SAVEAS\r\n2018\r\n/opt/cadgpt/documents/doc-1/design.dwg\r\n"
            "_QUIT\r\n",
        )

    def test_plain_autocad_rejects_the_civil_op(self):
        with self.assertRaises(ValueError):
            render_script("extrude_cross_section", dict(bottom_width=1, top_width=1, height=1, length=1),
                          _LSP_PATH, self.DESIGN, self.STL)
        self.assertFalse(STRATEGIES["AutoCAD"].supports("extrude_cross_section"))

    def test_cross_section_rejects_bad_numbers_before_rendering(self):
        good = dict(bottom_width=12, top_width=8, height=2, length=50)
        for key, bad in (("bottom_width", -1), ("top_width", float("nan")), ("height", 0),
                         ("length", 10001), ("length", None), ("height", "2")):
            with self.subTest(key=key, bad=bad), self.assertRaises(ValueError):
                render_script("extrude_cross_section", {**good, key: bad}, _LSP_PATH,
                              self.DESIGN, self.STL, create_ops=CIVIL3D_CREATE_OPS)

    def test_lisp_defines_cross_section_without_activex(self):
        lsp = _LSP_PATH.read_text(encoding="utf-8")
        self.assertIn("(defun cadgpt-extrude-cross-section (bw tw h len x y z)", lsp)
        body = lsp.split("(defun cadgpt-extrude-cross-section", 1)[1].split("(defun ", 1)[0]
        self.assertNotIn("vlax", body)
        self.assertNotIn("vla-", body)

    def test_executor_runs_civil3d_with_product_switches(self):
        with tempfile.TemporaryDirectory() as root:
            job = _job(type="extrude_cross_section", bottom_width=10, top_width=6, height=2, length=40)
            cad = dict(id="cad", name="Civil3D", path="C:/AutoCAD 2026/accoreconsole.exe", executable=True)

            def writes(job_dir):
                (job_dir / "design.dwg").write_bytes(b"AC1032")
                (job_dir / "preview.stl").write_bytes(b"\0" * 84)

            call, message = _run_execute(root, job, cad, writes)
            argv = call.args[0]
            self.assertEqual(argv[0], "C:/AutoCAD 2026/accoreconsole.exe")
            self.assertEqual(argv[-4:], ["/product", "C3D", "/l", "en-US"])
            self.assertIn("/isolate", argv)
            self.assertFalse(call.kwargs["shell"])
            script = (Path(root) / "jobs" / job["id"] / "run.scr").read_text(encoding="utf-8")
            self.assertIn("(cadgpt-extrude-cross-section 10.0 6.0 2.0 40.0 0.0 0.0 0.0)", script)
            self.assertIn("design.dwg", message)

    def test_civil3d_output_is_decoded_as_utf16(self):
        self.assertEqual(_decode_tail(bytearray("error".encode("utf-16-le")), "Civil3D"), "error")


class SolidWorksDiscoveryTests(unittest.TestCase):
    def _windows_install(self, d):
        pf = Path(d) / "Program Files"
        sw_dir = pf / "SOLIDWORKS Corp" / "SOLIDWORKS"
        sw_dir.mkdir(parents=True)
        exe = sw_dir / "SLDWORKS.exe"
        exe.touch()
        return pf, exe

    def _discover_windows(self, enable_solidworks):
        with tempfile.TemporaryDirectory() as d:
            pf, exe = self._windows_install(d)
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg({})), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {
                     "ProgramFiles": str(pf), "LOCALAPPDATA": str(Path(d) / "LocalAppData")}):
                cads = discover(enable_solidworks=enable_solidworks)
            return [c for c in cads if c["path"] == str(exe.resolve())]

    def test_detected_in_program_files_but_not_executable_without_the_flag(self):
        matches = self._discover_windows(enable_solidworks=False)
        self.assertEqual(len(matches), 1)
        cad = matches[0]
        self.assertEqual(cad["name"], "SolidWorks")
        self.assertFalse(cad["executable"])
        self.assertEqual(cad["capabilities"]["ops"], discovery.SOLIDWORKS_OPS)
        self.assertTrue(cad["capabilities"]["mesh"])

    def test_executable_with_the_flag(self):
        cad = self._discover_windows(enable_solidworks=True)[0]
        self.assertTrue(cad["executable"])
        self.assertTrue(cad["capabilities"]["execute"])

    def test_never_executable_off_windows_even_with_the_flag(self):
        with tempfile.TemporaryDirectory() as d:
            exe = Path(d) / "SLDWORKS.exe"
            exe.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Darwin"):
                cads = discover(str(exe), enable_solidworks=True)
        cad = next(c for c in cads if c["name"] == "SolidWorks")
        self.assertFalse(cad["executable"])

    def test_discovery_ops_match_strategy_ops(self):
        self.assertEqual(tuple(discovery.SOLIDWORKS_OPS), SOLIDWORKS_OPS)


class SolidWorksStrategyTests(unittest.TestCase):
    def test_box_is_converted_to_metres(self):
        feature = build_feature("create_box", dict(length=100, width=50, height=20,
                                                   position=dict(x=10, y=-5, z=2)))
        self.assertEqual(feature, {"kind": "box", "x": 0.01, "y": -0.005, "z": 0.002,
                                   "length": 0.1, "width": 0.05, "height": 0.02})

    def test_cylinder_feature(self):
        feature = build_feature("create_cylinder", dict(radius=5, height=30))
        self.assertEqual(feature, {"kind": "cylinder", "x": 0.0, "y": 0.0, "z": 0.0,
                                   "radius": 0.005, "height": 0.03})

    def test_extrude_rect_maps_planes_like_freecad(self):
        xz = build_feature("extrude_rect", dict(width=10, height=20, depth=5, plane="XZ"))
        self.assertEqual((xz["length"], xz["width"], xz["height"]), (0.01, 0.005, 0.02))
        with self.assertRaises(ValueError):
            build_feature("extrude_rect", dict(width=10, height=20, depth=5, plane="AB"))

    def test_rejects_bad_numbers_and_unknown_ops(self):
        for data in (dict(length=-1, width=1, height=1), dict(length=1, width=float("inf"), height=1),
                     dict(length=1, width=1, height=20000), dict(length=1, width=1)):
            with self.subTest(data=data), self.assertRaises(ValueError):
                build_feature("create_box", data)
        with self.assertRaises(ValueError):
            build_feature("create_sphere", dict(radius=1))

    def test_export_requires_existing_part_and_known_format(self):
        strategy = SolidWorksStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir, doc_dir = Path(d) / "job", Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            with self.assertRaises(ValueError):
                strategy.render_plan({"op": "export_design", "format": "step"}, job_dir, doc_dir)
            (doc_dir / "design.SLDPRT").write_bytes(b"part")
            with self.assertRaises(ValueError):
                strategy.render_plan({"op": "export_design", "format": "dwg"}, job_dir, doc_dir)
            plan = strategy.render_plan({"op": "export_design", "format": "step"}, job_dir, doc_dir)
            self.assertTrue(plan["open_existing"])
            self.assertEqual(plan["export"], str(doc_dir / "export.step"))
            self.assertIsNone(plan["feature"])

    def test_executor_builds_fixed_powershell_argv_and_plan(self):
        with tempfile.TemporaryDirectory() as root:
            job = _job(type="create_box", length=10, width=20, height=30, documentId=str(uuid.uuid4()))
            cad = dict(id="cad", name="SolidWorks", path="C:/SOLIDWORKS/SLDWORKS.exe", executable=True)

            def writes(job_dir):
                doc_dir = Path(root) / "documents" / job["documentId"]
                (doc_dir / "design.SLDPRT").write_bytes(b"part")
                (job_dir / "preview.stl").write_bytes(b"\0" * 84)

            with patch.dict("cadgpt_agent.strategies.solidworks.os.environ", {"SystemRoot": "C:/Windows"}):
                call, message = _run_execute(root, job, cad, writes)
            argv = call.args[0]
            job_dir = Path(root) / "jobs" / job["id"]
            self.assertEqual(argv, [
                str(Path("C:/Windows") / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
                "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                "-File", str(_WORKER), str(job_dir / "plan.json"),
            ])
            self.assertFalse(call.kwargs["shell"])
            plan = json.loads((job_dir / "plan.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["op"], "create_box")
            self.assertFalse(plan["open_existing"])
            self.assertEqual(plan["stl"], str(job_dir / "preview.stl"))
            self.assertEqual(plan["feature"]["kind"], "box")
            self.assertTrue(plan["native"].endswith("design.SLDPRT"))
            self.assertIn("design.SLDPRT", message)

    def test_executor_rejects_unsupported_op_before_spawning(self):
        with tempfile.TemporaryDirectory() as root, \
             patch("cadgpt_agent.executor.subprocess.Popen") as popen:
            cad = dict(id="cad", name="SolidWorks", path="C:/SLDWORKS.exe", executable=True)
            with self.assertRaises(ValueError):
                execute(_job(type="create_blender_mesh"), [cad], root)
            popen.assert_not_called()

    def test_worker_script_is_shipped_and_never_evaluates_plan_content(self):
        self.assertTrue(_WORKER.is_file())
        script = _WORKER.read_text(encoding="utf-8")
        for forbidden in ("Invoke-Expression", "iex ", "Start-Process", "& $", "[scriptblock]"):
            self.assertNotIn(forbidden, script)
        # Only quits SOLIDWORKS when the worker launched it itself.
        self.assertIn("if (-not $wasRunning) { $sw.ExitApp() }", script)


if __name__ == "__main__":
    unittest.main()
