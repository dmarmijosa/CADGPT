import io
import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path, PureWindowsPath
from unittest.mock import patch

from cadgpt_agent.executor import execute
from cadgpt_agent.strategies.autocad import AutoCadStrategy, render_script, _LSP_PATH, _BLANK_DWG

class BaselineArgvEnvTests(unittest.TestCase):
    """2a.1 (RED): capture today's FreeCAD argv/env before the strategy refactor.

    Written and passed against the pre-refactor `executor.py`; must keep
    passing byte-identical after the `CadStrategy` refactor lands (2a.6).
    """

    def job(self, **overrides):
        base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                    length=1, width=2, height=3, confirmed=True)
        base.update(overrides)
        return base

    def cads(self):
        return [dict(id="cad", name="FreeCAD", path="/trusted/FreeCADCmd", executable=True)]

    def run_execute(self, d, job):
        with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
            process = popen.return_value
            process.stdout = io.BytesIO(b"done")

            def finish(timeout):
                (Path(d) / "jobs" / job["id"] / "design.FCStd").write_bytes(b"test")
                return 0

            process.wait.side_effect = finish
            execute(job, self.cads(), d)
            return popen

    def test_create_box_argv_and_env_are_unchanged_by_the_refactor(self):
        with tempfile.TemporaryDirectory() as d:
            job = self.job()
            popen = self.run_execute(d, job)
            argv = popen.call_args.args[0]
            kwargs = popen.call_args.kwargs
            self.assertFalse(kwargs["shell"])
            self.assertEqual(len(argv), 2)
            self.assertEqual(argv[0], str(Path("/trusted/FreeCADCmd")))
            self.assertTrue(argv[1].endswith("freecad_worker.py"))
            env = kwargs["env"]
            self.assertEqual(env["CADGPT_JOB_DIR"], str((Path(d) / "jobs" / job["id"]).resolve()))
            self.assertEqual(env["QT_QPA_PLATFORM"], "offscreen")
            self.assertNotIn("CADGPT_DOC_DIR", env)
            for leaked in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH"):
                self.assertNotIn(leaked, env)

class CallerControlledPathTests(unittest.TestCase):
    """2a.4 (RED): the caller-controlled-paths guard (Threat Matrix row)."""

    def job(self, **overrides):
        base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                    length=1, width=2, height=3, confirmed=True)
        base.update(overrides)
        return base

    def cads(self):
        return [dict(id="cad", name="FreeCAD", path="/trusted/FreeCADCmd", executable=True)]

    def test_document_id_not_a_uuid_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            job = self.job(documentId="not-a-uuid")
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                with self.assertRaises(ValueError):
                    execute(job, self.cads(), d)
                popen.assert_not_called()

    def test_document_id_with_path_separators_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            malformed_ids = (
                "../../etc/passwd",
                str(uuid.uuid4()) + "/../../etc",
                "/" + str(uuid.uuid4()),
                str(uuid.uuid4()).upper() + "/",
            )
            for document_id in malformed_ids:
                job = self.job(documentId=document_id)
                with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                    with self.assertRaises(ValueError):
                        execute(job, self.cads(), d)
                    popen.assert_not_called()

    def test_symlinked_document_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            document_id = str(uuid.uuid4())
            (Path(root) / "documents").mkdir(mode=0o700)
            (Path(root) / "documents" / document_id).symlink_to(outside, target_is_directory=True)
            job = self.job(documentId=document_id)
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                with self.assertRaises(ValueError):
                    execute(job, self.cads(), root)
                popen.assert_not_called()
            self.assertEqual(list(Path(outside).iterdir()), [])

    def test_valid_document_id_is_accepted_and_scoped_under_root(self):
        with tempfile.TemporaryDirectory() as d:
            document_id = str(uuid.uuid4())
            job = self.job(documentId=document_id)
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")

                def finish(timeout):
                    (Path(d) / "documents" / document_id / "design.FCStd").write_bytes(b"test")
                    return 0

                process.wait.side_effect = finish
                execute(job, self.cads(), d)
            env = popen.call_args.kwargs["env"]
            expected_doc_dir = Path(d) / "documents" / document_id
            self.assertEqual(env["CADGPT_DOC_DIR"], str(expected_doc_dir.resolve()))
            self.assertTrue(expected_doc_dir.is_dir())

    def test_create_job_design_lives_under_documents_not_loose_in_root(self):
        """A create op's design must land in its own `documents/<id>/`
        directory -- a clean top-level sibling of `jobs/<job_id>/` -- and
        never directly in the shared data root."""
        with tempfile.TemporaryDirectory() as d:
            document_id = str(uuid.uuid4())
            job = self.job(documentId=document_id)
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")

                def finish(timeout):
                    (Path(d) / "documents" / document_id / "design.FCStd").write_bytes(b"test")
                    return 0

                process.wait.side_effect = finish
                execute(job, self.cads(), d)
            job_dir = Path(d) / "jobs" / job["id"]
            doc_dir = Path(d) / "documents" / document_id
            self.assertTrue(job_dir.is_dir())
            self.assertTrue((doc_dir / "design.FCStd").is_file())
            # Nothing loose directly in the shared root: only the `jobs` and
            # `documents` top-level directories exist there.
            self.assertEqual(sorted(p.name for p in Path(d).iterdir()), ["documents", "jobs"])
            self.assertFalse((Path(d) / "design.FCStd").exists())


class ExecutorSceneResultShapeTests(unittest.TestCase):
    """4b.6/4b.8: when `scene.json` exists, the executor posts `result` as a
    JSON string `{message, scene}`, capping `scene` at ≤12 kB independently
    of the worker (defense in depth, mirroring `apps/api/src/tools.ts`)."""

    def job(self, **overrides):
        base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                    type="read_scene", documentId=str(uuid.uuid4()), confirmed=True)
        base.update(overrides)
        return base

    def cads(self):
        return [dict(id="cad", name="FreeCAD", path="/trusted/FreeCADCmd", executable=True)]

    def run_with_scene(self, scene):
        job = self.job()
        with tempfile.TemporaryDirectory() as d:
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")

                def finish(timeout):
                    # `execute()` already created doc_dir (exist_ok=True) before Popen.
                    doc_dir = Path(d) / "documents" / job["documentId"]
                    (doc_dir / "design.FCStd").write_bytes(b"test")
                    (Path(d) / "jobs" / job["id"] / "scene.json").write_text(json.dumps(scene), encoding="utf-8")
                    return 0

                process.wait.side_effect = finish
                return json.loads(execute(job, self.cads(), d))

    def test_oversized_scene_is_capped_and_marked_truncated_small_scene_is_not(self):
        big_scene = [
            {"name": f"Obj{i}", "label": f"Obj{i}", "type": "Part::Feature",
             "bbox": [0, 0, 0, 10, 10, 10], "volume": 1000.0}
            for i in range(400)
        ]
        big = self.run_with_scene(big_scene)
        self.assertIn("message", big)
        self.assertLess(len(json.dumps(big["scene"]).encode("utf-8")), 12100)
        self.assertLess(len(big["scene"]), len(big_scene))
        self.assertTrue(big["truncated"])

        small_scene = [{"name": "Box", "label": "Box", "type": "Part::Feature",
                         "bbox": [0, 0, 0, 10, 10, 10], "volume": 1000.0}]
        small = self.run_with_scene(small_scene)
        self.assertEqual(small["scene"], small_scene)
        self.assertNotIn("truncated", small)


class AutoCadScriptGoldenTests(unittest.TestCase):
    """13a.1/14.1 (RED): golden `run.scr` equality per create op, written and
    confirmed failing before `AutoCadStrategy`/`render_script` existed (13a),
    then extended (14.1) to cover the `_STLOUT` preview-export block proven
    live in the slice 14.0 spike (`docs/autocad-stl-spike.md`).

    `render_script` is exercised directly with synthetic `lisp_path`/
    `design_path`/`stl_path` values so the golden strings never depend on
    where this checkout happens to live on disk.
    """

    LISP_PATH = Path("/opt/cadgpt/autocad/cadgpt.lsp")
    DESIGN_PATH = Path("/opt/cadgpt/documents/doc-1/design.dwg")
    # Job-dir-derived, distinct from DESIGN_PATH's doc-dir location — proves
    # the STL path is never sourced from caller params.
    STL_PATH = Path("/opt/cadgpt/jobs/job-1/preview.stl")
    SCENE_PATH = Path("/opt/cadgpt/jobs/job-1/scene.json")

    def expected(self, call):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            + call + "\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_SAVEAS\r\n2018\r\n/opt/cadgpt/documents/doc-1/design.dwg\r\n"
            "_QUIT\r\n"
        )

    def expected_modify(self, call):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            + call + "\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_QSAVE\r\n"
            "_QUIT\r\n"
        )

    def expected_read_scene(self, call):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            + call + "\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_QUIT\r\n"
        )

    def expected_export_dxf(self):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            "_DXFOUT\r\n/opt/cadgpt/documents/doc-1/export.dxf\r\n16\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_QUIT\r\n"
        )

    def expected_export_sat(self):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            "_ACISOUT\r\n_ALL\r\n\r\n/opt/cadgpt/documents/doc-1/export.sat\r\n"
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/jobs/job-1/preview.stl\r\n"
            "_QUIT\r\n"
        )

    def expected_export_stl(self):
        return (
            "FILEDIA\r\n0\r\n"
            '(load "/opt/cadgpt/autocad/cadgpt.lsp")\r\n'
            "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n/opt/cadgpt/documents/doc-1/export.stl\r\n"
            "_QUIT\r\n"
        )

    def test_boolean_cut_golden_script(self):
        data = {"base": "2A", "tool": "2B"}
        script = render_script("boolean_cut", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-boolean-cut "2A" "2B")'))

    def test_boolean_union_golden_script(self):
        data = {"base": "2A", "tool": "2B"}
        script = render_script("boolean_union", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-boolean-union "2A" "2B")'))

    def test_boolean_intersect_golden_script(self):
        data = {"base": "2A", "tool": "2B"}
        script = render_script("boolean_intersect", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-boolean-intersect "2A" "2B")'))

    def test_translate_object_golden_script(self):
        data = {"object": "2A", "dx": 10, "dy": 20, "dz": 30}
        script = render_script("translate_object", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-translate "2A" 10.0 20.0 30.0)'))
        # Also test alias 'translate'
        script_alias = render_script("translate", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script_alias, self.expected_modify('(cadgpt-translate "2A" 10.0 20.0 30.0)'))

    def test_rotate_object_golden_script(self):
        data = {"object": "2A", "axis": "X", "degrees": 90}
        script = render_script("rotate_object", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-rotate "2A" "X" 90.0 0.0 0.0 0.0)'))
        # Also test alias 'rotate'
        script_alias = render_script("rotate", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script_alias, self.expected_modify('(cadgpt-rotate "2A" "X" 90.0 0.0 0.0 0.0)'))

    def test_rotate_object_with_center_golden_script(self):
        data = {"object": "2A", "axis": "Z", "degrees": -45, "center": {"x": 5, "y": 10, "z": 15}}
        script = render_script("rotate_object", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-rotate "2A" "Z" -45.0 5.0 10.0 15.0)'))

    def test_scale_object_golden_script(self):
        data = {"object": "2A", "factor": 2.5}
        script = render_script("scale_object", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-scale "2A" 2.5 0.0 0.0 0.0)'))
        # Also test alias 'scale'
        script_alias = render_script("scale", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script_alias, self.expected_modify('(cadgpt-scale "2A" 2.5 0.0 0.0 0.0)'))

    def test_scale_object_with_center_golden_script(self):
        data = {"object": "2A", "factor": 0.5, "center": {"x": 1, "y": 2, "z": 3}}
        script = render_script("scale_object", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected_modify('(cadgpt-scale "2A" 0.5 1.0 2.0 3.0)'))

    def test_read_scene_golden_script(self):
        data = {}
        script = render_script("read_scene", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, scene_path=self.SCENE_PATH)
        self.assertEqual(script, self.expected_read_scene('(cadgpt-read-scene "/opt/cadgpt/jobs/job-1/scene.json")'))

    def test_export_design_dxf_golden_script(self):
        data = {"format": "dxf"}
        export_path = Path("/opt/cadgpt/documents/doc-1/export.dxf")
        script = render_script("export_design", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, export_path=export_path)
        self.assertEqual(script, self.expected_export_dxf())
        # Also test alias 'export'
        script_alias = render_script("export", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, export_path=export_path)
        self.assertEqual(script_alias, self.expected_export_dxf())

    def test_export_design_sat_golden_script(self):
        data = {"format": "sat"}
        export_path = Path("/opt/cadgpt/documents/doc-1/export.sat")
        script = render_script("export_design", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, export_path=export_path)
        self.assertEqual(script, self.expected_export_sat())

    def test_export_design_stl_golden_script(self):
        data = {"format": "stl"}
        export_path = Path("/opt/cadgpt/documents/doc-1/export.stl")
        script = render_script("export_design", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, export_path=export_path)
        self.assertEqual(script, self.expected_export_stl())

    def test_export_design_step_refuted_raises_value_error(self):
        """P2.3.5: STEP/IGES was refuted in Spike A; export with format=step must be rejected."""
        data = {"format": "step"}
        export_path = Path("/opt/cadgpt/documents/doc-1/export.step")
        with self.assertRaises(ValueError):
            render_script("export_design", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH, export_path=export_path)

    def test_export_design_unsupported_format_raises_value_error(self):
        data = {"format": "iges"}
        with self.assertRaises(ValueError):
            render_script("export_design", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_cadgpt_lsp_read_scene_uses_no_vlax_or_activex(self):
        """P2.3.1: assert read_scene returns enumerated entities without any
        vlax/ActiveX call."""
        code = _LSP_PATH.read_text(encoding="utf-8")
        self.assertIn("cadgpt-read-scene", code)
        code_lines = [line for line in code.splitlines() if not line.strip().startswith(";")]
        code_only = "\n".join(code_lines).lower()
        self.assertNotIn("vlax-", code_only)
        self.assertNotIn("vla-", code_only)
        self.assertIn('(ssget "_x" \'((0 . "3dsolid")))', code_only)




    def test_create_box_golden_script(self):
        data = {"length": 40, "width": 25, "height": 10}
        script = render_script("create_box", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-box 40.0 25.0 10.0 0.0 0.0 0.0)"))

    def test_create_box_with_position_golden_script(self):
        data = {"length": 1, "width": 2, "height": 3, "position": {"x": 5, "y": -5, "z": 2.5}}
        script = render_script("create_box", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-box 1.0 2.0 3.0 5.0 -5.0 2.5)"))

    def test_create_cylinder_golden_script(self):
        data = {"radius": 6, "height": 30}
        script = render_script("create_cylinder", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-cylinder 6.0 30.0 0.0 0.0 0.0)"))

    def test_create_sphere_golden_script(self):
        data = {"radius": 12.5}
        script = render_script("create_sphere", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-sphere 12.5 0.0 0.0 0.0)"))

    def test_create_cone_golden_script(self):
        data = {"radius1": 10, "radius2": 4, "height": 20}
        script = render_script("create_cone", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-cone 10.0 4.0 20.0 0.0 0.0 0.0)"))

    def test_create_cone_apex_golden_script(self):
        data = {"radius1": 10, "radius2": 0, "height": 20}
        script = render_script("create_cone", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-create-cone 10.0 0.0 20.0 0.0 0.0 0.0)"))

    def test_extrude_rect_xy_golden_script(self):
        data = {"width": 10, "height": 20, "depth": 5, "plane": "XY"}
        script = render_script("extrude_rect", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-extrude-rect 10.0 20.0 5.0 0.0 0.0 0.0)"))

    def test_extrude_rect_xz_golden_script(self):
        data = {"width": 10, "height": 20, "depth": 5, "plane": "XZ"}
        script = render_script("extrude_rect", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertEqual(script, self.expected("(cadgpt-extrude-rect 10.0 5.0 20.0 0.0 0.0 0.0)"))

    def test_stl_path_is_job_dir_derived_not_caller_input(self):
        """The STL path threaded into `run.scr` is whatever `stl_path` the
        caller (`AutoCadStrategy.build_argv`) computes from `job_dir` — never
        a value read out of `data`. Passing an attacker-shaped `data["stl_path"]`
        must have zero effect on the rendered script."""
        data = {"length": 1, "width": 1, "height": 1, "stl_path": "/etc/passwd"}
        script = render_script("create_box", data, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        self.assertIn(self.STL_PATH.as_posix(), script)
        self.assertNotIn("/etc/passwd", script)


class AutoCadMalformedInputTests(unittest.TestCase):
    """13a.1 (RED): malformed numeric input must raise before any script text
    is assembled — no free text or out-of-bounds number ever reaches a .scr."""

    LISP_PATH = Path("/opt/cadgpt/autocad/cadgpt.lsp")
    DESIGN_PATH = Path("/opt/cadgpt/documents/doc-1/design.dwg")
    STL_PATH = Path("/opt/cadgpt/jobs/job-1/preview.stl")

    def test_nan_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("create_box", {"length": float("nan"), "width": 1, "height": 1}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_infinite_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("create_cylinder", {"radius": float("inf"), "height": 1}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_negative_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("create_sphere", {"radius": -1}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_over_range_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("create_box", {"length": 10001, "width": 1, "height": 1}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_missing_value_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("create_cone", {"radius1": 10, "height": 20}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_unsupported_op_is_rejected(self):
        with self.assertRaises(ValueError):
            render_script("unsupported_op", {"base": "2A", "tool": "2B"}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_malformed_handle_is_rejected_for_booleans(self):
        for op in ("boolean_cut", "boolean_union", "boolean_intersect"):
            for bad in (None, "", "2A; _QUIT", "2A\r\n", "2A\"2B", "2A 2B", "2A/2B", "x" * 33, 123):
                with self.assertRaises(ValueError):
                    render_script(op, {"base": bad, "tool": "2B"}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
                with self.assertRaises(ValueError):
                    render_script(op, {"base": "2A", "tool": bad}, self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_malformed_handle_is_rejected_for_transforms(self):
        for op in ("translate_object", "rotate_object", "scale_object"):
            for bad in (None, "", "2A; _QUIT", "2A\r\n", "2A\"2B", "2A 2B", "2A/2B", "x" * 33, 123):
                with self.assertRaises(ValueError):
                    render_script(op, {"object": bad, "dx": 1, "dy": 1, "dz": 1, "axis": "X", "degrees": 0, "factor": 1},
                                  self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

    def test_malformed_numeric_is_rejected_for_transforms(self):
        # translate: non-finite or out-of-range coords, missing coords
        for bad_coord in (float("nan"), float("inf"), 100001, -100001):
            with self.assertRaises(ValueError):
                render_script("translate_object", {"object": "2A", "dx": bad_coord, "dy": 0, "dz": 0},
                              self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        with self.assertRaises(ValueError):
            render_script("translate_object", {"object": "2A", "dx": 0},
                          self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

        # rotate: invalid axis, non-finite or out-of-range degrees
        for bad_axis in ("W", None, 123, ""):
            with self.assertRaises(ValueError):
                render_script("rotate_object", {"object": "2A", "axis": bad_axis, "degrees": 45},
                              self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)
        for bad_deg in (float("nan"), float("inf"), 361, -361):
            with self.assertRaises(ValueError):
                render_script("rotate_object", {"object": "2A", "axis": "X", "degrees": bad_deg},
                              self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)

        # scale: non-positive, out-of-range factor
        for bad_factor in (0, -1, 0.0001, 1001, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                render_script("scale_object", {"object": "2A", "factor": bad_factor},
                              self.LISP_PATH, self.DESIGN_PATH, self.STL_PATH)




class AutoCadStrategyArgvTests(unittest.TestCase):
    """13a.2/13a.8: fixed six-token argv, blank.dwg vs existing design.dwg
    selection, and CRLF `run.scr` on disk."""

    def make_request(self, job_dir, op, params):
        (job_dir / "request.json").write_text(json.dumps({"op": op, **params}), encoding="utf-8")

    def test_argv_is_the_fixed_six_token_form_for_every_create_op(self):
        strategy = AutoCadStrategy()
        cases = [
            ("create_box", {"length": 1, "width": 1, "height": 1}),
            ("create_cylinder", {"radius": 1, "height": 1}),
            ("create_sphere", {"radius": 1}),
            ("create_cone", {"radius1": 1, "radius2": 0, "height": 1}),
            ("extrude_rect", {"width": 1, "height": 1, "depth": 1, "plane": "XY"}),
        ]
        for op, params in cases:
            with tempfile.TemporaryDirectory() as d:
                job_dir = Path(d)
                self.make_request(job_dir, op, params)
                argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, None)
                self.assertEqual(len(argv), 6)
                self.assertEqual(argv[0], str(Path("/trusted/accoreconsole.exe")))
                self.assertEqual(argv[1], "/i")
                self.assertEqual(argv[2], str(_BLANK_DWG))
                self.assertEqual(argv[3], "/s")
                self.assertEqual(argv[4], str(job_dir / "run.scr"))
                self.assertEqual(argv[5], "/isolate")

    def test_input_dwg_is_design_dwg_when_it_already_exists(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d) / "job"
            doc_dir = Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            (doc_dir / "design.dwg").write_bytes(b"existing")
            self.make_request(job_dir, "create_box", {"length": 1, "width": 1, "height": 1})
            argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, doc_dir)
            self.assertEqual(argv[2], str(doc_dir / "design.dwg"))

    def test_run_scr_uses_crlf_line_endings(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d)
            self.make_request(job_dir, "create_box", {"length": 1, "width": 1, "height": 1})
            strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, None)
            raw = (job_dir / "run.scr").read_bytes()
            self.assertNotIn(b"\r\r\n", raw)
            self.assertIn(b"\r\n", raw)
            self.assertTrue(raw.decode("utf-8").startswith("FILEDIA\r\n0\r\n"))

    def test_malformed_request_raises_and_writes_no_script(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d)
            self.make_request(job_dir, "create_box", {"length": float("nan"), "width": 1, "height": 1})
            with self.assertRaises(ValueError):
                strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, None)
            self.assertFalse((job_dir / "run.scr").exists())

    def test_run_scr_load_line_points_at_the_real_cadgpt_lsp(self):
        self.assertTrue(_LSP_PATH.is_file(), "agent/cadgpt_agent/autocad/cadgpt.lsp must exist")
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d)
            self.make_request(job_dir, "create_box", {"length": 1, "width": 1, "height": 1})
            strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, None)
            script = (job_dir / "run.scr").read_text(encoding="utf-8")
            self.assertIn('(load "' + _LSP_PATH.as_posix() + '")', script)

    def test_supports_all_proven_ops(self):
        strategy = AutoCadStrategy()
        for op in ("create_box", "create_cylinder", "create_sphere", "create_cone", "extrude_rect",
                   "boolean_cut", "boolean_union", "boolean_intersect",
                   "translate_object", "rotate_object", "scale_object",
                   "translate", "rotate", "scale",
                   "read_scene", "export_design", "export"):
            self.assertTrue(strategy.supports(op))
        for op in ("unknown_op", "unsupported_xyz"):
            self.assertFalse(strategy.supports(op))


    def test_argv_for_boolean_op_modifies_existing_dwg(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d) / "job"
            doc_dir = Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            (doc_dir / "design.dwg").write_bytes(b"existing")
            self.make_request(job_dir, "boolean_union", {"base": "2A", "tool": "2B"})
            argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, doc_dir)
            self.assertEqual(argv[2], str(doc_dir / "design.dwg"))
            scr = (job_dir / "run.scr").read_bytes().decode("utf-8")
            self.assertIn('(cadgpt-boolean-union "2A" "2B")', scr)
            self.assertIn("_QSAVE\r\n_QUIT\r\n", scr)

    def test_argv_for_transform_op_modifies_existing_dwg(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d) / "job"
            doc_dir = Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            (doc_dir / "design.dwg").write_bytes(b"existing")
            self.make_request(job_dir, "translate_object", {"object": "2A", "dx": 10, "dy": 20, "dz": 30})
            argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, doc_dir)
            self.assertEqual(argv[2], str(doc_dir / "design.dwg"))
            scr = (job_dir / "run.scr").read_bytes().decode("utf-8")
            self.assertIn('(cadgpt-translate "2A" 10.0 20.0 30.0)', scr)
            self.assertIn("_QSAVE\r\n_QUIT\r\n", scr)

    def test_argv_for_read_scene_op(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d) / "job"
            doc_dir = Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            (doc_dir / "design.dwg").write_bytes(b"existing")
            self.make_request(job_dir, "read_scene", {})
            argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, doc_dir)
            self.assertEqual(argv[2], str(doc_dir / "design.dwg"))
            scr = (job_dir / "run.scr").read_bytes().decode("utf-8")
            self.assertIn('(cadgpt-read-scene "' + (job_dir / "scene.json").as_posix() + '")', scr)
            self.assertNotIn("_QSAVE", scr)
            self.assertNotIn("_SAVEAS", scr)
            self.assertIn("_QUIT\r\n", scr)

    def test_argv_for_export_design_dxf_op(self):
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d) / "job"
            doc_dir = Path(d) / "doc"
            job_dir.mkdir()
            doc_dir.mkdir()
            (doc_dir / "design.dwg").write_bytes(b"existing")
            self.make_request(job_dir, "export_design", {"format": "dxf"})
            argv = strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, doc_dir)
            self.assertEqual(argv[2], str(doc_dir / "design.dwg"))
            scr = (job_dir / "run.scr").read_bytes().decode("utf-8")
            self.assertIn("_DXFOUT", scr)
            self.assertNotIn("_QSAVE", scr)
            self.assertNotIn("_SAVEAS", scr)
            self.assertIn("_QUIT\r\n", scr)

    def test_unproven_ops_refused_from_autocad_ops(self):
        """P2.4: spec 'Unproven op excluded from AUTOCAD_OPS' — asserts that
        unproven or refuted ops are excluded from AUTOCAD_OPS."""
        from cadgpt_agent import discovery
        for op in ("step_export", "iges_export", "fillet", "chamfer", "loft", "sweep"):
            self.assertNotIn(op, discovery.AUTOCAD_OPS)

    def test_proven_ops_included_in_autocad_ops(self):
        """P2.4: spec 'Reported ops match allowlist subset' — asserts all proven
        ops are listed in AUTOCAD_OPS."""
        from cadgpt_agent import discovery
        for op in ("create_box", "create_cylinder", "create_sphere", "create_cone", "extrude_rect",
                   "boolean_cut", "boolean_union", "boolean_intersect",
                   "translate_object", "rotate_object", "scale_object",
                   "read_scene", "export_design"):
            self.assertIn(op, discovery.AUTOCAD_OPS)


    def test_run_scr_contains_the_stlout_block_with_job_dir_stl_path(self):
        """14.1 (RED): the rendered `run.scr` on disk must include the proven
        `_STLOUT`/`_ALL`/`_Y` sequence targeting `job_dir/preview.stl`."""
        strategy = AutoCadStrategy()
        with tempfile.TemporaryDirectory() as d:
            job_dir = Path(d)
            self.make_request(job_dir, "create_box", {"length": 1, "width": 1, "height": 1})
            strategy.build_argv(Path("/trusted/accoreconsole.exe"), job_dir, None)
            # Read raw bytes (not `read_text`, which would normalize the
            # embedded literal "\r\n" via universal-newline translation).
            script = (job_dir / "run.scr").read_bytes().decode("utf-8")
            self.assertIn(
                "_STLOUT\r\n_ALL\r\n\r\n_Y\r\n" + (job_dir / "preview.stl").as_posix(), script
            )


class AutoCadArtifactsTests(unittest.TestCase):
    """14.2/14.3: `artifacts()` exposes the STL preview job-dir-derived,
    independent of `doc_dir` (unlike the doc-scoped `native` DWG)."""

    def test_mesh_is_job_dir_preview_stl(self):
        strategy = AutoCadStrategy()
        job_dir = Path("/opt/cadgpt/jobs/job-1")
        artifacts = strategy.artifacts("create_box", job_dir, None)
        self.assertEqual(artifacts["mesh"], job_dir / "preview.stl")
        self.assertEqual(artifacts["native"], job_dir / "design.dwg")

    def test_mesh_stays_job_scoped_even_with_a_doc_dir(self):
        strategy = AutoCadStrategy()
        job_dir = Path("/opt/cadgpt/jobs/job-1")
        doc_dir = Path("/opt/cadgpt/documents/doc-1")
        artifacts = strategy.artifacts("create_box", job_dir, doc_dir)
        self.assertEqual(artifacts["mesh"], job_dir / "preview.stl")
        self.assertEqual(artifacts["native"], doc_dir / "design.dwg")


class AutoCadNoExportMechanismTests(unittest.TestCase):
    """14 constraint: `_STLOUT` is the only proven headless export mechanism
    (spike 14.0); `_-EXPORT`/`3DPRINT` hang under Core Console and must never
    be reintroduced into the AutoCAD strategy source."""

    def test_no_export_or_3dprint_command_in_autocad_strategy_source(self):
        """The module docstring is allowed to mention `EXPORT`/`3DPRINT` to
        explain why they are rejected; the actual command-token literals fed
        into `run.scr` must never include them."""
        source = Path(__file__).resolve().parent.parent / "cadgpt_agent" / "strategies" / "autocad.py"
        text = source.read_text(encoding="utf-8")
        # Strip the leading module docstring (delimited by the first pair of `"""`).
        _, _, code_after_docstring = text.partition('"""')
        _, _, code = code_after_docstring.partition('"""')
        self.assertNotIn("3DPRINT", code.upper())
        self.assertNotIn("-EXPORT", code.upper())


class AutoCadExecutorGatingTests(unittest.TestCase):
    """13a.5/13a.8: without `--enable-autocad`, discovery reports
    `executable=False` for AutoCAD, so `executor.execute` must never select
    it — the strategy is registered but unreachable through the gate."""

    def job(self, **overrides):
        base = dict(id=str(uuid.uuid4()), expires=time.time() * 1000 + 60000, cadId="cad",
                    type="create_box", length=1, width=1, height=1, confirmed=True)
        base.update(overrides)
        return base

    def test_autocad_entry_with_executable_false_is_unreachable(self):
        cads = [dict(id="cad", name="AutoCAD", path="/trusted/accoreconsole.exe", executable=False)]
        with tempfile.TemporaryDirectory() as d:
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                with self.assertRaises(ValueError):
                    execute(self.job(), cads, d)
                popen.assert_not_called()

    def test_autocad_entry_with_executable_true_dispatches(self):
        cads = [dict(id="cad", name="AutoCAD", path="/trusted/accoreconsole.exe", executable=True)]
        job = self.job()
        with tempfile.TemporaryDirectory() as d:
            with patch("cadgpt_agent.executor.subprocess.Popen") as popen:
                process = popen.return_value
                process.stdout = io.BytesIO(b"done")

                def finish(timeout):
                    (Path(d) / "jobs" / job["id"] / "design.dwg").write_bytes(b"DWG")
                    return 0

                process.wait.side_effect = finish
                execute(job, cads, d)
            argv = popen.call_args.args[0]
            self.assertFalse(popen.call_args.kwargs["shell"])
            self.assertEqual(len(argv), 6)
            self.assertEqual(argv[1], "/i")


class AutoCadWindowsPathRenderingTests(unittest.TestCase):
    """Regression for the Windows-only .scr path bug (release build caught it):
    AutoLISP `(load ...)` requires forward slashes, and AutoCAD accepts them in
    the STLOUT/SAVEAS filename prompts, so every path written into run.scr must
    be forward-slashed even when the agent runs on Windows. Using
    PureWindowsPath here reproduces the Windows behavior on any host."""

    def _render(self):
        return render_script(
            "create_box",
            {"length": 40.0, "width": 25.0, "height": 10.0},
            PureWindowsPath(r"C:\Program Files\CAD Engine\autocad\cadgpt.lsp"),
            PureWindowsPath(r"C:\Users\u\AppData\Local\CADGPT\documents\d1\design.dwg"),
            PureWindowsPath(r"C:\Users\u\AppData\Local\CADGPT\jobs\j1\preview.stl"),
        )

    def test_windows_paths_render_with_forward_slashes_only(self):
        script = self._render()
        # No path line may contain a backslash — that would break `(load ...)`.
        for line in script.splitlines():
            self.assertNotIn("\\", line)
        self.assertIn('(load "C:/Program Files/CAD Engine/autocad/cadgpt.lsp")', script)
        self.assertIn("C:/Users/u/AppData/Local/CADGPT/jobs/j1/preview.stl", script)
        self.assertIn("C:/Users/u/AppData/Local/CADGPT/documents/d1/design.dwg", script)


if __name__ == "__main__":
    unittest.main()
