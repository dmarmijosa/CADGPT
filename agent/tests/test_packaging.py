import io
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "packaging"))
import build as packaging_build


class WiXInstallerTests(unittest.TestCase):
    """Validate packaging/wix/cadengine.wxs against spec requirements."""

    @classmethod
    def setUpClass(cls):
        cls.wxs_path = ROOT / "packaging" / "wix" / "cadengine.wxs"
        cls.tree = ET.parse(str(cls.wxs_path))
        cls.root = cls.tree.getroot()
        cls.ns = {"wix": "http://wixtoolset.org/schemas/v4/wxs"}

    def test_wix_v4_namespace_and_root(self):
        self.assertEqual(self.root.tag, "{http://wixtoolset.org/schemas/v4/wxs}Wix")

    def test_package_attributes_and_per_machine_scope(self):
        package = self.root.find("wix:Package", self.ns)
        self.assertIsNotNone(package, "Package element missing")
        self.assertEqual(package.get("Name"), "CAD Engine")
        self.assertEqual(package.get("Scope"), "perMachine", "Must require elevated UAC scope")
        self.assertIn("UpgradeCode", package.attrib)

    def test_target_directory_program_files_cad_engine(self):
        std_dir = self.root.find(".//wix:StandardDirectory[@Id='ProgramFiles64Folder']", self.ns)
        self.assertIsNotNone(std_dir, "ProgramFiles64Folder missing")
        install_folder = std_dir.find("wix:Directory[@Id='INSTALLFOLDER']", self.ns)
        self.assertIsNotNone(install_folder, "INSTALLFOLDER missing")
        self.assertEqual(install_folder.get("Name"), "CAD Engine")

    def test_system_path_environment_element(self):
        env = self.root.find(".//wix:Environment[@Id='UpdatePath']", self.ns)
        self.assertIsNotNone(env, "Environment element for PATH missing")
        self.assertEqual(env.get("Name"), "PATH")
        self.assertEqual(env.get("Value"), "[INSTALLFOLDER]")
        self.assertEqual(env.get("System"), "yes")
        self.assertEqual(env.get("Permanent"), "no")
        self.assertEqual(env.get("Part"), "last")

    def test_custom_actions_and_execute_sequence(self):
        register_action = self.root.find(".//wix:CustomAction[@Id='RegisterScheduledTask']", self.ns)
        self.assertIsNotNone(register_action)
        cmd = register_action.get("ExeCommand", "")
        self.assertIn("schtasks.exe", cmd)
        self.assertIn("CADEngineAgent", cmd)
        self.assertIn("ONLOGON", cmd)
        self.assertIn("LIMITED", cmd)
        self.assertEqual(register_action.get("Execute"), "deferred")
        self.assertEqual(register_action.get("Impersonate"), "no")

        unregister_action = self.root.find(".//wix:CustomAction[@Id='UnregisterScheduledTask']", self.ns)
        self.assertIsNotNone(unregister_action)
        unreg_cmd = unregister_action.get("ExeCommand", "")
        self.assertIn("schtasks.exe", unreg_cmd)
        self.assertIn("/Delete", unreg_cmd)
        self.assertIn("CADEngineAgent", unreg_cmd)

        seq = self.root.find(".//wix:InstallExecuteSequence", self.ns)
        self.assertIsNotNone(seq)
        reg_seq = seq.find("wix:Custom[@Action='RegisterScheduledTask']", self.ns)
        self.assertIsNotNone(reg_seq)
        unreg_seq = seq.find("wix:Custom[@Action='UnregisterScheduledTask']", self.ns)
        self.assertIsNotNone(unreg_seq)


class InnoSetupConfigTests(unittest.TestCase):
    """Validate packaging/windows.iss against spec requirements."""

    @classmethod
    def setUpClass(cls):
        cls.iss_path = ROOT / "packaging" / "windows.iss"
        cls.content = cls.iss_path.read_text(encoding="utf-8")

    def test_app_name_and_output_filename(self):
        self.assertIn("AppName=CAD Engine", self.content)
        self.assertIn("OutputBaseFilename=CADEngine-Setup-windows-x64", self.content)
        self.assertIn("DefaultDirName={autopf}\\CAD Engine", self.content)

    def test_system_path_registration(self):
        self.assertIn("ChangesEnvironment=yes", self.content)
        self.assertIn("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", self.content)
        self.assertIn("NeedsAddPath", self.content)

    def test_scheduled_task_run_entries(self):
        self.assertIn('schtasks.exe"; Parameters: "/Create /TN ""CADEngineAgent""', self.content)
        self.assertIn('schtasks.exe"; Parameters: "/Delete /TN ""CADEngineAgent""', self.content)


class BuildScriptTests(unittest.TestCase):
    """Validate packaging/build.py orchestration and dry-run mode."""

    def test_validate_packaging_assets(self):
        self.assertTrue(packaging_build.validate_packaging_assets())

    def test_get_pyinstaller_command(self):
        cmd = packaging_build.get_pyinstaller_command(Path("/tmp/dist"))
        self.assertIn("PyInstaller", " ".join(cmd))
        self.assertIn("cadengine", cmd)
        self.assertIn(str(ROOT / "agent/launcher.py"), cmd)

    def test_create_alias_symlink_dry_run(self):
        stdout = io.StringIO()
        with patch("sys.stdout", stdout):
            packaging_build.create_alias_symlink(Path("/tmp/dist"), dry_run=True)
        self.assertIn("[DRY-RUN] Would create alias", stdout.getvalue())

    def test_create_alias_symlink_posix(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dist = Path(tmpdir)
            cad_dir = dist / "cadengine"
            cad_dir.mkdir(parents=True)
            bin_path = cad_dir / ("cadengine.exe" if platform.system() == "Windows" else "cadengine")
            bin_path.write_text("binary", encoding="utf-8")

            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                packaging_build.create_alias_symlink(dist, dry_run=False)
            alias_path = cad_dir / ("cadgpt-agent.exe" if platform.system() == "Windows" else "cadgpt-agent")
            self.assertTrue(alias_path.exists())

    def test_build_wix_msi_dry_run_when_wix_present(self):
        with patch("shutil.which", return_value="/usr/local/bin/wix"):
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                res = packaging_build.build_wix_msi(Path("/tmp/dist"), dry_run=True)
            self.assertTrue(res)
            self.assertIn("[DRY-RUN] Would execute WiX build", stdout.getvalue())

    def test_build_wix_msi_when_wix_absent(self):
        with patch("shutil.which", return_value=None):
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                res = packaging_build.build_wix_msi(Path("/tmp/dist"), dry_run=False)
            self.assertFalse(res)
            self.assertIn("skipping MSI creation", stdout.getvalue())

    def test_build_inno_setup_dry_run_when_iscc_present(self):
        with patch("shutil.which", return_value="/usr/local/bin/iscc"):
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                res = packaging_build.build_inno_setup(dry_run=True)
            self.assertTrue(res)
            self.assertIn("[DRY-RUN] Would execute Inno Setup", stdout.getvalue())

    def test_build_inno_setup_when_iscc_absent(self):
        with patch("shutil.which", return_value=None):
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                res = packaging_build.build_inno_setup(dry_run=False)
            self.assertFalse(res)
            self.assertIn("skipping Inno Setup installer", stdout.getvalue())

    def test_cli_dry_run_execution(self):
        stdout = io.StringIO()
        with patch("sys.stdout", stdout), \
             patch("sys.argv", ["build.py", "--dry-run"]):
            code = packaging_build.main()
        self.assertEqual(code, 0)
        out = stdout.getvalue()
        self.assertIn("CAD Engine Packaging", out)
        self.assertIn("[DRY-RUN] Would execute PyInstaller", out)
        self.assertIn("Packaging completed successfully", out)


if __name__ == "__main__":
    unittest.main()
