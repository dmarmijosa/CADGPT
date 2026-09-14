import io
import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from cadgpt_agent.executor import execute

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
                (Path(d) / job["id"] / "design.FCStd").write_bytes(b"test")
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
            self.assertEqual(argv[0], "/trusted/FreeCADCmd")
            self.assertTrue(argv[1].endswith("freecad_worker.py"))
            env = kwargs["env"]
            self.assertEqual(env["CADGPT_JOB_DIR"], str((Path(d) / job["id"]).resolve()))
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
                    (Path(d) / job["id"] / "scene.json").write_text(json.dumps(scene), encoding="utf-8")
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


if __name__ == "__main__":
    unittest.main()
