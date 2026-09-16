import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from cadgpt_agent import service
from cadgpt_agent.main import main


class ServiceLifecycleTests(unittest.TestCase):
    """Verify daemon lifecycle across Windows, Linux, and macOS."""

    def test_get_agent_executable_frozen(self):
        with patch.object(sys, "frozen", True, create=True), \
             patch.object(sys, "executable", "/opt/cadengine/cadengine"):
            self.assertEqual(service.get_agent_executable(), "/opt/cadengine/cadengine")

    def test_get_agent_executable_which_cadengine(self):
        with patch.object(sys, "frozen", False, create=True), \
             patch("shutil.which", side_effect=lambda name: "/usr/local/bin/cadengine" if name == "cadengine" else None):
            self.assertEqual(service.get_agent_executable(), "/usr/local/bin/cadengine")

    def test_get_agent_executable_which_cadgpt_agent(self):
        with patch.object(sys, "frozen", False, create=True), \
             patch("shutil.which", side_effect=lambda name: "/usr/local/bin/cadgpt-agent" if name == "cadgpt-agent" else None):
            self.assertEqual(service.get_agent_executable(), "/usr/local/bin/cadgpt-agent")

    def test_get_agent_command_python_fallback(self):
        with patch.object(sys, "frozen", False, create=True):
            exe, args = service.get_agent_command("/usr/bin/python3")
            self.assertEqual(exe, "/usr/bin/python3")
            self.assertEqual(args, ["-m", "cadgpt_agent.main"])

    def test_get_agent_command_binary(self):
        exe, args = service.get_agent_command("/usr/local/bin/cadengine")
        self.assertEqual(exe, "/usr/local/bin/cadengine")
        self.assertEqual(args, [])

    # === Windows Tests ===

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_install_service(self, mock_run, mock_platform):
        service.install_service(exe_path=r"C:\Program Files\CAD Engine\cadengine.exe")
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        self.assertEqual(cmd[0], "schtasks")
        self.assertEqual(cmd[1], "/Create")
        self.assertEqual(cmd[2], "/TN")
        self.assertEqual(cmd[3], "CADEngineAgent")
        self.assertEqual(cmd[4], "/TR")
        self.assertIn(r"C:\Program Files\CAD Engine\cadengine.exe", cmd[5])
        self.assertEqual(cmd[6], "/SC")
        self.assertEqual(cmd[7], "ONLOGON")
        self.assertEqual(cmd[8], "/RL")
        self.assertEqual(cmd[9], "LIMITED")
        self.assertEqual(cmd[10], "/F")

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_start_service(self, mock_run, mock_platform):
        service.start_service()
        mock_run.assert_called_once_with(["schtasks", "/Run", "/TN", "CADEngineAgent"], check=True)

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_stop_service_running(self, mock_run, mock_platform):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        service.stop_service()
        mock_run.assert_called_once_with(
            ["schtasks", "/End", "/TN", "CADEngineAgent"],
            capture_output=True,
            text=True,
        )

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_stop_service_already_stopped(self, mock_run, mock_platform):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="ERROR: There is no instance of the task running.",
        )
        # Should not raise
        service.stop_service()

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_uninstall_service(self, mock_run, mock_platform):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        service.uninstall_service()
        mock_run.assert_called_once_with(
            ["schtasks", "/Delete", "/TN", "CADEngineAgent", "/F"],
            capture_output=True,
            text=True,
        )

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_get_service_status_active(self, mock_run, mock_platform):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='"CADEngineAgent","N/A","Running"',
            stderr="",
        )
        status = service.get_service_status()
        self.assertTrue(status["installed"])
        self.assertTrue(status["active"])
        self.assertEqual(status["status"], "active")
        self.assertEqual(status["name"], "CADEngineAgent")

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.run")
    def test_windows_get_service_status_not_installed(self, mock_run, mock_platform):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="ERROR: The system cannot find the file specified.",
        )
        status = service.get_service_status()
        self.assertFalse(status["installed"])
        self.assertFalse(status["active"])
        self.assertEqual(status["status"], "not installed")

    # === Linux Tests ===

    @patch("platform.system", return_value="Linux")
    @patch("subprocess.run")
    def test_linux_install_service(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                service.install_service(exe_path="/usr/local/bin/cadengine")
                unit_file = Path(tmpdir) / ".config" / "systemd" / "user" / "cadengine.service"
                self.assertTrue(unit_file.is_file())
                content = unit_file.read_text(encoding="utf-8")
                self.assertIn("ExecStart=/usr/local/bin/cadengine", content)
                self.assertIn("WantedBy=default.target", content)
                self.assertEqual(mock_run.call_count, 2)
                mock_run.assert_any_call(["systemctl", "--user", "daemon-reload"], check=True)
                mock_run.assert_any_call(["systemctl", "--user", "enable", "cadengine.service"], check=True)

    @patch("platform.system", return_value="Linux")
    @patch("subprocess.run")
    def test_linux_start_and_stop_service(self, mock_run, mock_platform):
        service.start_service()
        mock_run.assert_called_with(["systemctl", "--user", "start", "cadengine.service"], check=True)

        service.stop_service()
        mock_run.assert_called_with(["systemctl", "--user", "stop", "cadengine.service"], check=True)

    @patch("platform.system", return_value="Linux")
    @patch("subprocess.run")
    def test_linux_get_service_status(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                unit_file = Path(tmpdir) / ".config" / "systemd" / "user" / "cadengine.service"
                unit_file.parent.mkdir(parents=True, exist_ok=True)
                unit_file.write_text("dummy", encoding="utf-8")

                mock_run.return_value = MagicMock(returncode=0, stdout="active\n", stderr="")
                status = service.get_service_status()
                self.assertTrue(status["installed"])
                self.assertTrue(status["active"])
                self.assertEqual(status["status"], "active")

    @patch("platform.system", return_value="Linux")
    @patch("subprocess.run")
    def test_linux_uninstall_service(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                unit_file = Path(tmpdir) / ".config" / "systemd" / "user" / "cadengine.service"
                unit_file.parent.mkdir(parents=True, exist_ok=True)
                unit_file.write_text("dummy", encoding="utf-8")

                service.uninstall_service()
                self.assertFalse(unit_file.exists())

    # === macOS (Darwin) Tests ===

    @patch("platform.system", return_value="Darwin")
    @patch("subprocess.run")
    def test_macos_install_service(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                service.install_service(exe_path="/usr/local/bin/cadengine")
                plist = Path(tmpdir) / "Library" / "LaunchAgents" / "com.cadengine.agent.plist"
                self.assertTrue(plist.is_file())
                content = plist.read_text(encoding="utf-8")
                self.assertIn("<string>com.cadengine.agent</string>", content)
                self.assertIn("<string>/usr/local/bin/cadengine</string>", content)
                self.assertIn("<key>KeepAlive</key>", content)
                mock_run.assert_called_with(["launchctl", "load", str(plist)], check=True)

    @patch("platform.system", return_value="Darwin")
    @patch("subprocess.run")
    def test_macos_start_and_stop_service(self, mock_run, mock_platform):
        service.start_service()
        mock_run.assert_called_with(["launchctl", "start", "com.cadengine.agent"], check=True)

        service.stop_service()
        mock_run.assert_called_with(["launchctl", "stop", "com.cadengine.agent"], check=True)

    @patch("platform.system", return_value="Darwin")
    @patch("subprocess.run")
    def test_macos_get_service_status(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                plist = Path(tmpdir) / "Library" / "LaunchAgents" / "com.cadengine.agent.plist"
                plist.parent.mkdir(parents=True, exist_ok=True)
                plist.write_text("dummy", encoding="utf-8")

                mock_run.return_value = MagicMock(returncode=0, stdout="1234 0 com.cadengine.agent", stderr="")
                status = service.get_service_status()
                self.assertTrue(status["installed"])
                self.assertTrue(status["active"])
                self.assertEqual(status["status"], "active")

    @patch("platform.system", return_value="Darwin")
    @patch("subprocess.run")
    def test_macos_uninstall_service(self, mock_run, mock_platform):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("pathlib.Path.home", return_value=Path(tmpdir)):
                plist = Path(tmpdir) / "Library" / "LaunchAgents" / "com.cadengine.agent.plist"
                plist.parent.mkdir(parents=True, exist_ok=True)
                plist.write_text("dummy", encoding="utf-8")

                service.uninstall_service()
                self.assertFalse(plist.exists())

    # === CLI Integration Tests ===

    @patch("cadgpt_agent.main.install_service")
    def test_cli_service_install_with_exe(self, mock_install):
        stdout = io.StringIO()
        with patch("sys.stdout", stdout):
            code = main(["service", "install", "--exe", "/custom/path/cadengine"])
        self.assertEqual(code, 0)
        mock_install.assert_called_once_with(exe_path="/custom/path/cadengine")

    @patch("cadgpt_agent.main.get_service_status")
    def test_cli_service_status_json(self, mock_status):
        mock_status.return_value = {
            "installed": True,
            "active": True,
            "status": "active",
            "name": "CADEngineAgent",
        }
        stdout = io.StringIO()
        with patch("sys.stdout", stdout):
            code = main(["service", "status", "--json"])
        self.assertEqual(code, 0)
        parsed = json.loads(stdout.getvalue())
        self.assertEqual(parsed["name"], "CADEngineAgent")
        self.assertTrue(parsed["active"])


if __name__ == "__main__":
    unittest.main()
