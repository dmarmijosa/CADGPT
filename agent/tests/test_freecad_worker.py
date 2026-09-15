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


if __name__ == "__main__":
    unittest.main()
