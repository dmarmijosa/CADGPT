"""Unit and integration tests for Onboarding GUI Wizard, Tray daemon, and bilingual i18n."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from agent.cadgpt_agent.gui import (
    DEFAULT_SERVER,
    INSTALL_COMMANDS,
    VERSION,
    OnboardingController,
    OnboardingWizard,
    SystemTrayDaemon,
    create_cube_icon_image,
    get_install_guide_for_system,
    get_tray_icon_image,
    register_user_blender_path,
)
from agent.cadgpt_agent.i18n import (
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
    detect_locale,
    get_language,
    set_language,
    t,
)


class I18nCompletenessAndFunctionalityTests(unittest.TestCase):
    """Verify dictionary symmetry, locale detection, persistence, and interpolation."""

    def test_translation_dictionaries_have_identical_keys(self):
        en_keys = set(TRANSLATIONS["en"].keys())
        es_keys = set(TRANSLATIONS["es"].keys())
        missing_in_es = en_keys - es_keys
        missing_in_en = es_keys - en_keys
        self.assertEqual(missing_in_es, set(), f"Keys missing in ES: {missing_in_es}")
        self.assertEqual(missing_in_en, set(), f"Keys missing in EN: {missing_in_en}")

    def test_no_empty_translation_values(self):
        for lang in ("en", "es"):
            for key, val in TRANSLATIONS[lang].items():
                self.assertTrue(
                    isinstance(val, str) and len(val.strip()) > 0,
                    f"Translation for {lang}.{key} is empty or invalid",
                )

    def test_detect_locale_spanish_variants(self):
        for spanish_locale in ("es_ES.UTF-8", "es_MX.UTF-8", "es_AR", "ES"):
            with patch.dict(os.environ, {"LANG": spanish_locale}):
                self.assertEqual(detect_locale(), "es")

    def test_detect_locale_non_spanish(self):
        for other in ("en_US.UTF-8", "en_GB", "fr_FR", "de_DE", "C"):
            with patch.dict(os.environ, {"LANG": other, "LC_ALL": "", "LC_MESSAGES": ""}):
                self.assertEqual(detect_locale(), "en")

    def test_get_and_set_language_persistence(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cfg_path = Path(tmp_dir) / "config.json"
            # Initially no config
            self.assertEqual(set_language("es", cfg_path), "es")
            self.assertEqual(get_language(cfg_path), "es")

            # Verify file content
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            self.assertEqual(data.get("language"), "es")

            # Switch to English
            self.assertEqual(set_language("en", cfg_path), "en")
            self.assertEqual(get_language(cfg_path), "en")

            # Fallback on unsupported language
            self.assertEqual(set_language("it", cfg_path), DEFAULT_LANGUAGE)

    def test_translate_formatting_and_fallback(self):
        # Format params
        res_en = t("hud_server_url", "en", url="https://example.com")
        self.assertEqual(res_en, "Server URL: https://example.com")

        res_es = t("hud_server_url", "es", url="https://example.com")
        self.assertEqual(res_es, "URL del Servidor: https://example.com")

        # Unknown key returns the key itself
        self.assertEqual(t("unknown.custom.key", "en"), "unknown.custom.key")


class OnboardingCadPrerequisiteGateTests(unittest.TestCase):
    """Verify non-bypassable CAD prerequisite verification gate (FreeCAD / AutoCAD)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.tmp.name) / "config.json"

    def tearDown(self):
        self.tmp.cleanup()

    @patch("agent.cadgpt_agent.gui.discover")
    def test_blocks_advancement_when_no_cad_kernel_detected(self, mock_discover):
        mock_discover.return_value = []
        controller = OnboardingController(config_path=self.cfg_path)

        self.assertFalse(controller.cad_prerequisite_met)
        self.assertFalse(controller.freecad_found)
        self.assertFalse(controller.autocad_found)

        allowed, error_msg = controller.can_advance_from_step(2)
        self.assertFalse(allowed)
        self.assertTrue(len(error_msg) > 0)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_blocks_when_only_blender_is_detected(self, mock_discover):
        mock_discover.return_value = [
            {"name": "Blender", "path": "/usr/bin/blender", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)

        # Blender is present, but parametric CAD is missing!
        self.assertTrue(controller.blender_found)
        self.assertFalse(controller.cad_prerequisite_met)

        allowed, _ = controller.can_advance_from_step(2)
        self.assertFalse(allowed)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_passes_gate_when_freecad_detected(self, mock_discover):
        mock_discover.return_value = [
            {"name": "FreeCAD", "path": "/usr/bin/freecadcmd", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)

        self.assertTrue(controller.cad_prerequisite_met)
        self.assertTrue(controller.freecad_found)
        self.assertEqual(controller.freecad_path, "/usr/bin/freecadcmd")

        allowed, _ = controller.can_advance_from_step(2)
        self.assertTrue(allowed)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_passes_gate_when_autocad_detected(self, mock_discover):
        mock_discover.return_value = [
            {"name": "AutoCAD", "path": "C:\\AutoCAD\\accoreconsole.exe", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)

        self.assertTrue(controller.cad_prerequisite_met)
        self.assertTrue(controller.autocad_found)

        allowed, _ = controller.can_advance_from_step(2)
        self.assertTrue(allowed)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_recheck_unblocks_gate_after_installation(self, mock_discover):
        # Initial probe: missing
        mock_discover.return_value = []
        controller = OnboardingController(config_path=self.cfg_path)
        self.assertFalse(controller.can_advance_from_step(2)[0])

        # Simulated installation + Re-check
        mock_discover.return_value = [
            {"name": "FreeCAD", "path": "/usr/bin/freecadcmd", "executable": True}
        ]
        controller.refresh_discovery()
        self.assertTrue(controller.cad_prerequisite_met)
        self.assertTrue(controller.can_advance_from_step(2)[0])

    def test_install_guides_exist_for_supported_os(self):
        for os_name in ("Windows", "Darwin", "Linux"):
            guide = INSTALL_COMMANDS.get(os_name)
            self.assertIsNotNone(guide)
            self.assertIn("cmd", guide)
            self.assertIn("url", guide)


class OnboardingBlenderFallbackTests(unittest.TestCase):
    """Verify Blender tool discovery, optional status, opt-out, and custom path persistence."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.tmp.name) / "config.json"

    def tearDown(self):
        self.tmp.cleanup()

    @patch("agent.cadgpt_agent.gui.discover")
    def test_step3_always_allows_advance_even_if_blender_missing(self, mock_discover):
        mock_discover.return_value = [
            {"name": "FreeCAD", "path": "/usr/bin/freecadcmd", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)
        self.assertFalse(controller.blender_found)

        allowed, _ = controller.can_advance_from_step(3)
        self.assertTrue(allowed, "Blender is optional and must not block progression")

    @patch("agent.cadgpt_agent.gui.discover")
    def test_discovered_blender_is_preselected_enabled(self, mock_discover):
        mock_discover.return_value = [
            {"name": "Blender", "path": "/Applications/Blender.app", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)
        self.assertTrue(controller.blender_found)
        self.assertTrue(controller.blender_enabled)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_user_can_opt_out_of_blender(self, mock_discover):
        mock_discover.return_value = [
            {"name": "Blender", "path": "/usr/bin/blender", "executable": True}
        ]
        controller = OnboardingController(config_path=self.cfg_path)
        self.assertTrue(controller.blender_enabled)

        controller.opt_out_blender()
        self.assertFalse(controller.blender_enabled)

    def test_custom_blender_path_registration(self):
        # Create a dummy fake blender binary
        fake_blender = Path(self.tmp.name) / "my_blender"
        fake_blender.write_text("#!/bin/sh\nexit 0")
        fake_blender.chmod(0o755)

        with patch("agent.cadgpt_agent.gui.discover") as mock_disc:
            mock_disc.return_value = [
                {"name": "Blender", "path": str(fake_blender.resolve()), "executable": True}
            ]
            controller = OnboardingController(config_path=self.cfg_path)
            ok = controller.configure_custom_blender(str(fake_blender))
            self.assertTrue(ok)
            self.assertTrue(controller.blender_found)
            self.assertEqual(controller.blender_path, str(fake_blender.resolve()))

            # Verify saved to config.json
            cfg = json.loads(self.cfg_path.read_text(encoding="utf-8"))
            self.assertEqual(cfg.get("blenderPath"), str(fake_blender.resolve()))


class OnboardingPairingEnrollmentTests(unittest.TestCase):
    """Verify ephemeral 12-char code generation, poll approval, and keyring persistence."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.tmp.name) / "config.json"

    def tearDown(self):
        self.tmp.cleanup()

    @patch("urllib.request.urlopen")
    def test_request_pairing_code_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(
            {"userCode": "ABCD-1234-EFGH", "deviceSecret": "device-secret-xyz"}
        ).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        controller = OnboardingController(config_path=self.cfg_path)
        data = controller.request_pairing_code("http://localhost:3000")

        self.assertEqual(data["userCode"], "ABCD-1234-EFGH")
        self.assertEqual(controller.pairing_code, "ABCD-1234-EFGH")
        self.assertEqual(controller.device_secret, "device-secret-xyz")
        self.assertTrue(controller.pairing_pending)
        self.assertFalse(controller.pairing_completed)

        # Server URL saved to config
        cfg = json.loads(self.cfg_path.read_text(encoding="utf-8"))
        self.assertEqual(cfg.get("server"), "http://localhost:3000")

    @patch("keyring.set_password")
    @patch("urllib.request.urlopen")
    def test_poll_pairing_status_flow(self, mock_urlopen, mock_keyring_set):
        controller = OnboardingController(config_path=self.cfg_path)
        controller.device_secret = "test-secret"
        controller.server_url = "http://localhost:3000"

        # 1. Pending response
        mock_resp_pending = MagicMock()
        mock_resp_pending.read.return_value = json.dumps({"pending": True}).encode("utf-8")
        mock_resp_pending.__enter__.return_value = mock_resp_pending
        mock_urlopen.return_value = mock_resp_pending

        res1 = controller.poll_pairing_status()
        self.assertTrue(res1["pending"])
        self.assertFalse(controller.pairing_completed)
        self.assertFalse(controller.can_advance_from_step(4)[0])

        # 2. Approved response
        mock_resp_approved = MagicMock()
        mock_resp_approved.read.return_value = json.dumps(
            {"pending": False, "credential": "cad_cred_123", "deviceId": "dev_987"}
        ).encode("utf-8")
        mock_resp_approved.__enter__.return_value = mock_resp_approved
        mock_urlopen.return_value = mock_resp_approved

        res2 = controller.poll_pairing_status()
        self.assertFalse(res2["pending"])
        self.assertTrue(controller.pairing_completed)
        self.assertEqual(controller.credential, "cad_cred_123")
        self.assertEqual(controller.device_id, "dev_987")
        self.assertTrue(controller.can_advance_from_step(4)[0])

        # Keyring and config saved
        mock_keyring_set.assert_called_once_with(
            "CADGPT", "http://localhost:3000", "cad_cred_123"
        )
        cfg = json.loads(self.cfg_path.read_text(encoding="utf-8"))
        self.assertEqual(cfg.get("deviceId"), "dev_987")

    def test_default_server_constant(self):
        self.assertEqual(DEFAULT_SERVER, "https://cadengine.danny-armijos.com")
        controller = OnboardingController(config_path=self.cfg_path)
        self.assertEqual(controller.server_url, DEFAULT_SERVER)

        with patch("agent.cadgpt_agent.gui.discover", return_value=[]):
            daemon = SystemTrayDaemon(config_path=self.cfg_path)
            self.assertEqual(daemon.server, DEFAULT_SERVER)

    @patch("urllib.request.urlopen")
    def test_request_pairing_code_offline_fallback(self, mock_urlopen):
        import re
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")
        controller = OnboardingController(config_path=self.cfg_path)
        data = controller.request_pairing_code()

        self.assertTrue(data.get("offline"))
        self.assertIsNone(data.get("deviceSecret"))
        self.assertIsNotNone(data.get("userCode"))
        code = data["userCode"]
        self.assertEqual(controller.pairing_code, code)
        self.assertTrue(controller.pairing_pending)
        # Verify 12-character uppercase hexadecimal formatted as XXXX-XXXX-XXXX
        self.assertTrue(bool(re.match(r"^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$", code)))

    @patch("agent.cadgpt_agent.service.install_service")
    def test_step4_auto_enrolls_native_service(self, mock_install):
        controller = OnboardingController(config_path=self.cfg_path)
        mock_master = MagicMock()
        with patch("agent.cadgpt_agent.gui.ttk") as mock_ttk, \
             patch("agent.cadgpt_agent.gui.tk") as mock_tk, \
             patch("agent.cadgpt_agent.gui.messagebox") as mock_msgbox:
            wizard = OnboardingWizard(master=mock_master, controller=controller)
            wizard.pair_status_lbl = MagicMock()
            wizard._on_pairing_success()
            mock_install.assert_called_once()

    def test_step4_renders_no_url_entry(self):
        controller = OnboardingController(config_path=self.cfg_path)
        mock_master = MagicMock()
        with patch("agent.cadgpt_agent.gui.ttk") as mock_ttk, \
             patch("agent.cadgpt_agent.gui.tk") as mock_tk, \
             patch("agent.cadgpt_agent.gui.messagebox") as mock_msgbox:
            wizard = OnboardingWizard(master=mock_master, controller=controller)
            wizard.show_step(4)
            self.assertFalse(hasattr(wizard, "server_entry"))
            self.assertTrue(hasattr(wizard, "copy_btn"))
            self.assertTrue(hasattr(wizard, "code_container"))


class SystemTrayDaemonUnitTests(unittest.TestCase):
    """Verify system tray status HUD, unpair action, and menu construction."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.tmp.name) / "config.json"
        self.cfg_path.write_text(
            json.dumps({"server": "http://localhost:3000", "deviceId": "dev-alpha"}),
            encoding="utf-8",
        )

    def tearDown(self):
        self.tmp.cleanup()

    @patch("agent.cadgpt_agent.gui.discover")
    def test_status_label_connected_and_disconnected(self, mock_discover):
        mock_discover.return_value = []
        daemon = SystemTrayDaemon(server="http://localhost:3000", config_path=self.cfg_path)

        daemon.is_connected = False
        lbl_disc = daemon.get_status_label()
        self.assertIn("Disconnected", lbl_disc)

        daemon.is_connected = True
        lbl_conn = daemon.get_status_label()
        self.assertIn("Connected", lbl_conn)
        self.assertIn(VERSION, lbl_conn)

    @patch("urllib.request.urlopen")
    @patch("agent.cadgpt_agent.gui.discover")
    def test_check_connection_success_and_latency(self, mock_discover, mock_urlopen):
        mock_discover.return_value = []
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        daemon = SystemTrayDaemon(server="http://localhost:3000", config_path=self.cfg_path)
        ok = daemon.check_connection()

        self.assertTrue(ok)
        self.assertTrue(daemon.is_connected)
        self.assertIsNotNone(daemon.heartbeat_latency_ms)

    @patch("urllib.request.urlopen")
    @patch("agent.cadgpt_agent.gui.discover")
    def test_check_connection_failure(self, mock_discover, mock_urlopen):
        mock_discover.return_value = []
        mock_urlopen.side_effect = Exception("Connection refused")

        daemon = SystemTrayDaemon(server="http://localhost:3000", config_path=self.cfg_path)
        ok = daemon.check_connection()

        self.assertFalse(ok)
        self.assertFalse(daemon.is_connected)
        self.assertIsNone(daemon.heartbeat_latency_ms)

    @patch("keyring.delete_password")
    @patch("keyring.get_password")
    @patch("urllib.request.urlopen")
    @patch("agent.cadgpt_agent.gui.discover")
    def test_unpair_purges_credentials_and_resets_state(
        self, mock_discover, mock_urlopen, mock_get_pwd, mock_del_pwd
    ):
        mock_discover.return_value = []
        mock_get_pwd.return_value = "secret-token"

        cred_file = self.cfg_path.parent / "credential.json"
        cred_file.write_text(json.dumps({"server": "http://localhost:3000", "credential": "tok"}))

        daemon = SystemTrayDaemon(server="http://localhost:3000", config_path=self.cfg_path)
        self.assertEqual(daemon.device_id, "dev-alpha")

        ok = daemon.unpair()
        self.assertTrue(ok)
        self.assertIsNone(daemon.device_id)
        self.assertFalse(daemon.is_connected)

        # Keyring deleted
        mock_del_pwd.assert_called_once_with("CADGPT", "http://localhost:3000")

        # credential.json deleted
        self.assertFalse(cred_file.exists())

        # deviceId removed from config.json
        cfg = json.loads(self.cfg_path.read_text(encoding="utf-8"))
        self.assertNotIn("deviceId", cfg)

    @patch("agent.cadgpt_agent.gui.discover")
    def test_build_menu_structure(self, mock_discover):
        mock_discover.return_value = []
        daemon = SystemTrayDaemon(server="http://localhost:3000", config_path=self.cfg_path)
        menu = daemon.build_menu()
        self.assertIsNotNone(menu)


class VisualAssetAndRegistrationTests(unittest.TestCase):
    """Verify 3D isometric cube icon generation and user PATH config."""

    def test_create_cube_icon_image(self):
        img = create_cube_icon_image(64)
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (64, 64))
        self.assertEqual(img.mode, "RGBA")

    def test_get_tray_icon_image(self):
        img = get_tray_icon_image(32)
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (32, 32))

    def test_get_tray_icon_image_from_meipass(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            meipass_path = Path(tmp_dir) / "meipass"
            assets_dir = meipass_path / "cadgpt_agent" / "assets"
            assets_dir.mkdir(parents=True, exist_ok=True)
            icon_file = assets_dir / "favicon.ico"

            from PIL import Image
            test_img = Image.new("RGBA", (16, 16), color="blue")
            test_img.save(str(icon_file), format="ICO")

            with patch.object(sys, "frozen", True, create=True), \
                 patch.object(sys, "_MEIPASS", str(meipass_path), create=True):
                img = get_tray_icon_image(32)
                self.assertIsNotNone(img)
                self.assertEqual(img.size, (32, 32))

    def test_get_tray_icon_image_fallback_to_cube(self):
        with patch("pathlib.Path.is_file", return_value=False), \
             patch("agent.cadgpt_agent.gui.create_cube_icon_image") as mock_cube:
            mock_cube.return_value = MagicMock()
            img = get_tray_icon_image(32)
            mock_cube.assert_called_once_with(32)

    def test_register_user_blender_path_saves_config(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cfg_file = Path(tmp_dir) / "config.json"
            dummy_bin = Path(tmp_dir) / "blender.exe"
            dummy_bin.touch()

            ok = register_user_blender_path(str(dummy_bin), config_path=cfg_file)
            self.assertTrue(ok)

            cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
            self.assertEqual(cfg.get("blenderPath"), str(dummy_bin.resolve()))


class OnboardingWizardUiTests(unittest.TestCase):
    """Test OnboardingWizard UI interaction flow with mocked Tkinter widgets."""

    def test_wizard_step_flow_and_navigation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cfg_path = Path(tmp_dir) / "config.json"
            controller = OnboardingController(config_path=cfg_path)
            mock_master = MagicMock()

            with patch("agent.cadgpt_agent.gui.ttk") as mock_ttk, \
                 patch("agent.cadgpt_agent.gui.tk") as mock_tk, \
                 patch("agent.cadgpt_agent.gui.messagebox") as mock_msgbox:
                wizard = OnboardingWizard(master=mock_master, controller=controller)
                self.assertEqual(wizard.controller.current_step, 1)

                # Advancing from step 1 should succeed
                wizard.go_next()
                self.assertEqual(wizard.controller.current_step, 2)

                # On step 2, if CAD is not detected, go_next triggers warning and does not advance
                wizard.controller.cad_prerequisite_met = False
                wizard.go_next()
                self.assertEqual(wizard.controller.current_step, 2)
                mock_msgbox.showwarning.assert_called_once()

                # When CAD is detected, go_next advances to step 3
                wizard.controller.cad_prerequisite_met = True
                wizard.go_next()
                self.assertEqual(wizard.controller.current_step, 3)

                # Advancing from step 3 advances to step 4
                wizard.go_next()
                self.assertEqual(wizard.controller.current_step, 4)

                # Go back goes from step 4 to step 3
                wizard.go_back()
                self.assertEqual(wizard.controller.current_step, 3)


if __name__ == "__main__":
    unittest.main()
