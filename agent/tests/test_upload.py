"""6.1/6.4: agent-side mesh upload — call shape, local refusal, and the
main.py job loop's upload-then-report ordering (tolerant of upload failure).
"""
import hashlib
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock

from cadgpt_agent.main import run_job
from cadgpt_agent.upload import upload_mesh


def _stl_bytes(facets=4):
    return b"\x00" * 80 + facets.to_bytes(4, "little") + b"\x00" * (50 * facets)


class _FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def read(self):
        return b""


class _FakeOpener:
    """Captures the built `Request` and streams its body, mirroring
    `main.py`'s own `NoRedirect`-opener discipline."""

    def __init__(self):
        self.request = None
        self.timeout = None
        self.body = None

    def open(self, req, timeout=None):
        self.request = req
        self.timeout = timeout
        self.body = req.data.read()
        return _FakeResponse()


class UploadMeshCallShapeTests(unittest.TestCase):
    """6.1 (RED): the upload call shape, asserted before wiring into main.py."""

    def test_posts_expected_method_url_headers_and_streamed_body(self):
        payload = _stl_bytes()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "preview.stl"
            path.write_bytes(payload)
            opener = _FakeOpener()

            upload_mesh("https://cadgpt.example", "job-123", "device-secret", path, opener=opener)

            req = opener.request
            self.assertEqual(req.get_method(), "POST")
            self.assertEqual(req.full_url, "https://cadgpt.example/api/agent/jobs/job-123/mesh")
            self.assertEqual(req.headers["Authorization"], "Bearer device-secret")
            self.assertEqual(req.headers["Content-type"], "application/octet-stream")
            self.assertEqual(req.headers["Content-length"], str(len(payload)))
            self.assertEqual(req.headers["X-mesh-sha256"], hashlib.sha256(payload).hexdigest())
            self.assertEqual(opener.body, payload)
            self.assertEqual(opener.timeout, 60)

    def test_oversized_file_refused_locally_without_any_network_call(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "preview.stl"
            # 84 + 50*facets sized so the total exceeds the 25 MiB cap, but
            # still passes the binary-STL shape check on its own.
            facets = (26 * 1024 * 1024) // 50
            path.write_bytes(b"\x00" * 80 + facets.to_bytes(4, "little") + b"\x00" * (50 * facets))
            opener = _FakeOpener()

            with self.assertRaises(ValueError):
                upload_mesh("https://cadgpt.example", "job-1", "cred", path, opener=opener)
            self.assertIsNone(opener.request)

    def test_non_stl_bytes_refused_locally_without_any_network_call(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "preview.stl"
            path.write_bytes(b"not a binary stl at all")
            opener = _FakeOpener()

            with self.assertRaises(ValueError):
                upload_mesh("https://cadgpt.example", "job-1", "cred", path, opener=opener)
            self.assertIsNone(opener.request)


class RunJobPreviewUploadTests(unittest.TestCase):
    """6.2-6.4: main.py's job loop uploads the preview before reporting the
    result, and tolerates an upload failure without flipping `ok`."""

    def job(self):
        return {"id": "job-1", "cadId": "cad"}

    def test_success_path_uploads_mesh_before_reporting_and_adds_no_note(self):
        with tempfile.TemporaryDirectory() as jobs_root:
            jobs = Path(jobs_root)
            job_dir = jobs / "job-1"
            job_dir.mkdir()
            (job_dir / "preview.stl").write_bytes(_stl_bytes())
            calls = []

            def fake_execute(job, cads, root):
                calls.append("execute")
                return "Created design.FCStd. CAD files remain on this device."

            upload = Mock(side_effect=lambda *a, **kw: calls.append("upload"))

            import cadgpt_agent.main as main_module
            with unittest.mock.patch.object(main_module, "execute", fake_execute):
                ok, result = run_job(self.job(), [], jobs, "https://cadgpt.example", "cred", upload=upload)

            self.assertTrue(ok)
            self.assertEqual(result, "Created design.FCStd. CAD files remain on this device.")
            self.assertEqual(calls, ["execute", "upload"])
            upload.assert_called_once_with("https://cadgpt.example", "job-1", "cred", job_dir / "preview.stl")

    def test_upload_failure_still_reports_ok_true_with_preview_unavailable_note(self):
        with tempfile.TemporaryDirectory() as jobs_root:
            jobs = Path(jobs_root)
            job_dir = jobs / "job-1"
            job_dir.mkdir()
            (job_dir / "preview.stl").write_bytes(_stl_bytes())

            import cadgpt_agent.main as main_module
            with unittest.mock.patch.object(
                main_module, "execute",
                lambda job, cads, root: "Created design.FCStd. CAD files remain on this device.",
            ):
                for failure in (
                    urllib.error.URLError("connection lost"),
                    urllib.error.HTTPError("https://cadgpt.example", 413, "Payload Too Large", {}, None),
                    ConnectionResetError("reset by peer"),
                ):
                    upload = Mock(side_effect=failure)
                    ok, result = run_job(self.job(), [], jobs, "https://cadgpt.example", "cred", upload=upload)
                    self.assertTrue(ok)
                    self.assertIn("preview unavailable", result)
                    self.assertIn("(upload failed:", result)

    def test_upload_failure_merges_note_into_json_message_shape(self):
        with tempfile.TemporaryDirectory() as jobs_root:
            jobs = Path(jobs_root)
            job_dir = jobs / "job-1"
            job_dir.mkdir()
            (job_dir / "preview.stl").write_bytes(_stl_bytes())

            import cadgpt_agent.main as main_module
            with unittest.mock.patch.object(
                main_module, "execute",
                lambda job, cads, root: '{"message": "Read scene from design.FCStd.", "scene": []}',
            ):
                upload = Mock(side_effect=urllib.error.URLError("connection lost"))
                ok, result = run_job(self.job(), [], jobs, "https://cadgpt.example", "cred", upload=upload)

            self.assertTrue(ok)
            import json
            payload = json.loads(result)
            self.assertIn("preview unavailable", payload["message"])
            self.assertEqual(payload["scene"], [])

    def test_no_preview_file_posts_no_mesh_and_no_note(self):
        with tempfile.TemporaryDirectory() as jobs_root:
            jobs = Path(jobs_root)
            (jobs / "job-1").mkdir()  # no preview.stl written

            import cadgpt_agent.main as main_module
            with unittest.mock.patch.object(
                main_module, "execute",
                lambda job, cads, root: "Created design.FCStd. CAD files remain on this device.",
            ):
                upload = Mock()
                ok, result = run_job(self.job(), [], jobs, "https://cadgpt.example", "cred", upload=upload)

            self.assertTrue(ok)
            self.assertEqual(result, "Created design.FCStd. CAD files remain on this device.")
            upload.assert_not_called()

    def test_failed_execute_never_attempts_upload_and_reports_ok_false(self):
        with tempfile.TemporaryDirectory() as jobs_root:
            jobs = Path(jobs_root)

            import cadgpt_agent.main as main_module

            def failing_execute(job, cads, root):
                raise RuntimeError("FreeCAD failed to create the document.")

            with unittest.mock.patch.object(main_module, "execute", failing_execute):
                upload = Mock()
                ok, result = run_job(self.job(), [], jobs, "https://cadgpt.example", "cred", upload=upload)

            self.assertFalse(ok)
            self.assertIn("FreeCAD failed", result)
            upload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
