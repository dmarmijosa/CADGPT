import io
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from cadgpt_agent.executor import execute, validate
from cadgpt_agent.main import server_url
from cadgpt_agent.discovery import discover

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
                    (Path(d) / job["id"] / "box.FCStd").write_bytes(b"test")
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

if __name__ == "__main__":
    unittest.main()
