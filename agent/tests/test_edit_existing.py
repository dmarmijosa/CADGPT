"""Editing existing designs: AutoCAD / Civil 3D 2D drafting and SOLIDWORKS
scene reads and body edits. Fully simulated — `subprocess.Popen` is mocked,
so no CAD or PowerShell process ever starts.
"""
import io
import json
import math
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from cadgpt_agent import discovery
from cadgpt_agent.executor import STRATEGIES, execute
from cadgpt_agent.strategies.autocad import _LSP_PATH, MAX_POLYLINE_POINTS, render_script
from cadgpt_agent.strategies.civil3d import CIVIL3D_CREATE_OPS
from cadgpt_agent.strategies.solidworks import _WORKER, SolidWorksStrategy, build_edit

LISP = Path("/opt/cadgpt/autocad/cadgpt.lsp")
DESIGN = Path("/opt/cadgpt/documents/doc-1/design.dwg")
STL = Path("/opt/cadgpt/jobs/job-1/preview.stl")
HEADER = 'FILEDIA\r\n0\r\n(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
STLOUT = "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"


def _script(op, data, create_ops=None):
    return render_script(op, data, LISP, DESIGN, STL, create_ops=create_ops)


def _job(**overrides):
    base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad", confirmed=True)
    base.update(overrides)
    return base


class AutoCad2DScriptTests(unittest.TestCase):
    def test_open_polyline_golden_script(self):
        data = dict(points=[dict(x=0, y=0), dict(x=10, y=0), dict(x=10, y=5)])
        self.assertEqual(
            _script("draw_polyline", data),
            HEADER + "(cadgpt-draw-polyline '((0.0 0.0) (10.0 0.0) (10.0 5.0)) 0 0.0 nil)\r\n"
            + STLOUT + "_SAVEAS\r\n2018\r\n/opt/cadgpt/documents/doc-1/design.dwg\r\n_QUIT\r\n",
        )

    def test_closed_polyline_with_layer_and_elevation(self):
        data = dict(points=[dict(x=0, y=0), dict(x=4, y=0), dict(x=4, y=3)], closed=True,
                    elevation=-2.5, layer="Lot_Lines-01")
        self.assertIn("(cadgpt-draw-polyline '((0.0 0.0) (4.0 0.0) (4.0 3.0)) 1 -2.5 \"Lot_Lines-01\")",
                      _script("draw_polyline", data))

    def test_circle_golden_call(self):
        data = dict(radius=7.5, center=dict(x=1, y=-2), layer="Holes")
        self.assertIn('(cadgpt-draw-circle 7.5 1.0 -2.0 0.0 "Holes")', _script("draw_circle", data))

    def test_delete_object_saves_in_place(self):
        self.assertEqual(
            _script("delete_object", dict(object="2A3F")),
            HEADER + '(cadgpt-delete "2A3F")\r\n' + STLOUT + "_QSAVE\r\n_QUIT\r\n",
        )

    def test_layer_names_that_could_break_the_script_are_rejected(self):
        pts = [dict(x=0, y=0), dict(x=1, y=1)]
        for layer in ('A"B', "with space", "back\\slash", "", "x" * 32, "*", 5):
            with self.subTest(layer=layer), self.assertRaises(ValueError):
                _script("draw_polyline", dict(points=pts, layer=layer))

    def test_polyline_point_validation(self):
        two = [dict(x=0, y=0), dict(x=1, y=1)]
        bad_inputs = [
            dict(points=[dict(x=0, y=0)]),
            dict(points=[dict(x=i, y=0) for i in range(MAX_POLYLINE_POINTS + 1)]),
            dict(points=two, closed=True),
            dict(points=two, closed="yes"),
            dict(points=[dict(x=0, y=0), dict(x=float("nan"), y=1)]),
            dict(points=[dict(x=0, y=0), dict(x=1, y=200001)]),
            dict(points=[dict(x=0, y=0), [1, 1]]),
            dict(points="0,0 1,1"),
        ]
        for data in bad_inputs:
            with self.subTest(data=str(data)[:60]), self.assertRaises(ValueError):
                _script("draw_polyline", data)

    def test_delete_rejects_non_handle(self):
        for handle in ("../x", '2A"', "", None):
            with self.subTest(handle=handle), self.assertRaises(ValueError):
                _script("delete_object", dict(object=handle))

    def test_civil3d_inherits_2d_drafting(self):
        self.assertIn("draw_polyline", CIVIL3D_CREATE_OPS)
        self.assertIn("(cadgpt-draw-circle", _script("draw_circle", dict(radius=1), CIVIL3D_CREATE_OPS))
        for op in discovery.AUTOCAD_2D_OPS:
            self.assertTrue(STRATEGIES["Civil3D"].supports(op), op)
            self.assertTrue(STRATEGIES["AutoCAD"].supports(op), op)
            self.assertIn(op, discovery.CIVIL3D_OPS)


class AutoCad2DLispTests(unittest.TestCase):
    def setUp(self):
        self.lsp = _LSP_PATH.read_text(encoding="utf-8")

    def test_defines_2d_functions(self):
        for name in ("cadgpt-draw-polyline", "cadgpt-draw-circle", "cadgpt-delete",
                     "cadgpt-json-escape", "cadgpt-entity-bbox"):
            self.assertIn("(defun " + name + " ", self.lsp)

    def test_scene_label_is_escaped_with_a_length_budget(self):
        self.assertIn("(cadgpt-json-escape (cdr (assoc 8 d)) 60)", self.lsp)
        self.assertNotIn("(substr (cadgpt-json-escape", self.lsp)

    def test_parentheses_are_balanced(self):
        depth, in_string, i = 0, False, 0
        for line in self.lsp.splitlines():
            i = 0
            while i < len(line):
                c = line[i]
                if in_string:
                    if c == "\\":
                        i += 2
                        continue
                    if c == '"':
                        in_string = False
                elif c == ";":
                    break
                elif c == '"':
                    in_string = True
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    self.assertGreaterEqual(depth, 0)
                i += 1
        self.assertEqual(depth, 0)
        self.assertFalse(in_string)


class AutoCadEditionOpsTests(unittest.TestCase):
    def test_lt_never_advertises_2d_ops(self):
        with tempfile.TemporaryDirectory() as d:
            exe = Path(d) / "acadlt.exe"
            exe.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Darwin"):
                cads = discovery.discover(str(exe))
        lt = next(c for c in cads if c["name"] == "AutoCAD")
        for op in discovery.AUTOCAD_2D_OPS:
            self.assertNotIn(op, lt["capabilities"]["ops"])


class SolidWorksEditTests(unittest.TestCase):
    def test_translate_is_converted_to_metres(self):
        self.assertEqual(build_edit("translate_object", dict(object="Body2", dx=10, dy=-5, dz=0)),
                         {"kind": "translate", "body": "Body2", "dx": 0.01, "dy": -0.005, "dz": 0.0})

    def test_rotate_uses_radians_and_centre(self):
        edit = build_edit("rotate_object", dict(object="Body1", axis="Z", degrees=90,
                                                center=dict(x=100, y=0, z=0)))
        self.assertEqual(edit["kind"], "rotate")
        self.assertAlmostEqual(edit["radians"], math.pi / 2)
        self.assertEqual((edit["cx"], edit["cy"], edit["cz"]), (0.1, 0.0, 0.0))

    def test_booleans(self):
        for op, kind in (("boolean_cut", "cut"), ("boolean_union", "union"),
                         ("boolean_intersect", "intersect")):
            self.assertEqual(build_edit(op, dict(base="Body1", tool="Body2")),
                             {"kind": kind, "base": "Body1", "tool": "Body2"})
        with self.assertRaises(ValueError):
            build_edit("boolean_cut", dict(base="Body1", tool="Body1"))

    def test_body_references_are_strict(self):
        for body in ("Boss-Extrude1", "Body0", "body1", "Body1; Remove-Item", "../Body1", "Body12345", None):
            with self.subTest(body=body), self.assertRaises(ValueError):
                build_edit("translate_object", dict(object=body, dx=1, dy=0, dz=0))
        with self.assertRaises(ValueError):
            build_edit("rotate_object", dict(object="Body1", axis="W", degrees=10))
        with self.assertRaises(ValueError):
            build_edit("rotate_object", dict(object="Body1", axis="X", degrees=720))
        with self.assertRaises(ValueError):
            build_edit("scale_object", dict(object="Body1", factor=2))

    def test_edits_and_scene_reads_need_an_existing_part(self):
        strategy = SolidWorksStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir, doc_dir = Path(d) / "job", Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            for request in ({"op": "read_scene"},
                            {"op": "translate_object", "object": "Body1", "dx": 1, "dy": 0, "dz": 0}):
                with self.subTest(op=request["op"]), self.assertRaises(ValueError):
                    strategy.render_plan(request, job_dir, doc_dir)
            (doc_dir / "design.SLDPRT").write_bytes(b"part")
            scene_plan = strategy.render_plan({"op": "read_scene"}, job_dir, doc_dir)
            self.assertEqual(scene_plan["scene"], str(job_dir / "scene.json"))
            self.assertIsNone(scene_plan["edit"])
            self.assertIsNone(scene_plan["feature"])
            edit_plan = strategy.render_plan({"op": "boolean_cut", "base": "Body1", "tool": "Body2"},
                                             job_dir, doc_dir)
            self.assertEqual(edit_plan["edit"]["kind"], "cut")

    def test_executor_returns_the_scene_for_an_external_part(self):
        with tempfile.TemporaryDirectory() as root:
            part = Path(root) / "allowed" / "bracket.SLDPRT"
            part.parent.mkdir()
            part.write_bytes(b"part")
            job = _job(type="read_scene", native_path=str(part))
            cad = dict(id="cad", name="SolidWorks", path="C:/SLDWORKS.exe", executable=True)
            scene = [{"name": "Body1", "label": "Boss-Extrude1", "type": "SolidBody",
                      "bbox": [0, 0, 0, 10, 20, 30], "volume": 6000.0}]
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                popen.return_value.stdout = io.BytesIO(b"")

                def finish(timeout):
                    (Path(root) / "jobs" / job["id"] / "scene.json").write_text(json.dumps(scene), encoding="utf-8")
                    return 0

                popen.return_value.wait.side_effect = finish
                payload = json.loads(execute(job, [cad], root, allowed_roots=[str(part.parent)]))
            self.assertEqual(payload["scene"], scene)
            plan = json.loads((Path(root) / "jobs" / job["id"] / "plan.json").read_text(encoding="utf-8"))
            self.assertTrue(plan["open_existing"])
            self.assertEqual(Path(plan["native"]).resolve(), part.resolve())
            # The executor backs up an external file before the CAD touches it.
            self.assertTrue(list(part.parent.glob("bracket.SLDPRT.*.bak")))

    def test_worker_implements_edits_and_bomless_scene(self):
        script = _WORKER.read_text(encoding="utf-8")
        for needle in ("InsertMoveCopyBody2", "InsertCombineFeature", "GetBodies2", "GetBodyBox",
                       "GetMassProperties", "UTF8Encoding $false", "Invoke-Edit", "Write-Scene"):
            self.assertIn(needle, script)
        self.assertNotIn("Invoke-Expression", script)
        for op in ("read_scene", "translate_object", "rotate_object", "boolean_cut"):
            self.assertIn(op, discovery.SOLIDWORKS_OPS)
            self.assertTrue(STRATEGIES["SolidWorks"].supports(op), op)


if __name__ == "__main__":
    unittest.main()
