"""Slice 12 — AutoCAD discovery: accoreconsole detection, full-vs-LT edition,
per-CAD capabilities. Detection only: no test here ever executes a candidate
binary, and `winreg` is always mocked so macOS/Linux never import the real
module (guarded import in `discovery.py`).
"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cadgpt_agent import discovery
from cadgpt_agent.discovery import discover


class FakeWinreg:
    """Minimal fake of the subset of `winreg` this module calls.

    Modeled on a real registry tree so `_autocad_registry_installs` walks it
    with the exact same calls it would make against real Windows registry
    handles: `OpenKey`, `EnumKey` (index-based, raises `OSError` past the
    end), `QueryValueEx`, `QueryValue`.
    """

    HKEY_LOCAL_MACHINE = object()

    def __init__(self, tree, app_paths_value=None):
        # tree: {"R25.1": {"ACAD-9101": {"AcadLocation": ..., "locales": {"ACAD-9101:40A": {"ProductName": ...}}}}}
        self.tree = tree
        self.app_paths_value = app_paths_value

    def OpenKey(self, hive, path):
        if "App Paths" in path:
            if self.app_paths_value is None:
                raise OSError("not found")
            return ("app-paths",)
        if path == r"SOFTWARE\Autodesk\AutoCAD":
            return ("root",)
        # release key: r"SOFTWARE\Autodesk\AutoCAD\R25.1" style is never
        # requested directly by this module — only relative EnumKey/OpenKey
        # on already-open handles — so nothing else opens by full path here.
        raise OSError(f"unexpected OpenKey path: {path}")

    def EnumKey(self, key, index):
        if key == ("root",):
            releases = list(self.tree.keys())
        elif key[0] == "release":
            releases = list(self.tree[key[1]].keys())
        elif key[0] == "product":
            releases = list(self.tree[key[1]][key[2]]["locales"].keys())
        else:
            raise OSError("unknown key")
        if index >= len(releases):
            raise OSError("no more items")
        return releases[index]

    def OpenKey_dispatch(self, key, name):
        if key == ("root",):
            return ("release", name)
        if key[0] == "release":
            return ("product", key[1], name)
        if key[0] == "product":
            return ("locale", key[1], key[2], name)
        raise OSError("unknown key")

    def QueryValueEx(self, key, value_name):
        if key[0] == "product":
            product = self.tree[key[1]][key[2]]
            if value_name == "AcadLocation" and "AcadLocation" in product:
                return product["AcadLocation"], 1
        if key[0] == "locale":
            locale = self.tree[key[1]][key[2]]["locales"][key[3]]
            if value_name == "ProductName" and "ProductName" in locale:
                return locale["ProductName"], 1
        raise OSError("value not found")

    def QueryValue(self, key, subkey):
        return self.app_paths_value


class _PatchedOpenKey(FakeWinreg):
    """Redirect nested `OpenKey(key, subkey)` calls (2-arg form) through
    `OpenKey_dispatch`, matching how `winreg.OpenKey` overloads by arity."""

    def OpenKey(self, first, second):
        if isinstance(first, tuple):
            return self.OpenKey_dispatch(first, second)
        return super().OpenKey(first, second)


def make_fake_winreg(tree, app_paths_value=None):
    return _PatchedOpenKey(tree, app_paths_value=app_paths_value)


FULL_TREE = {
    "R25.1": {
        "ACAD-9101": {
            "AcadLocation": None,  # filled in per-test with a real temp path
            "locales": {"ACAD-9101:40A": {"ProductName": "AutoCAD 2026 - Español (Spanish)"}},
        }
    }
}

LT_TREE = {
    "R25.1": {
        "ACAD-9201": {
            "AcadLocation": None,
            "locales": {"ACAD-9201:40A": {"ProductName": "AutoCAD LT 2026 - Español (Spanish)"}},
        }
    }
}


class DocumentationLikeExecutableClassificationTests(unittest.TestCase):
    """12.1 (RED): threat matrix "Documentation-like/executable-file
    classification" — one case per basename class, all must yield
    execute=false via the new capabilities dict."""

    def _execute_for(self, filename):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / filename
            path.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Darwin"):
                cads = discover(str(path))
            matches = [c for c in cads if c["path"] == str(path.resolve())]
            self.assertEqual(len(matches), 1, f"expected exactly one entry for {filename}")
            cad = matches[0]
            self.assertFalse(cad["executable"], f"{filename}: legacy `executable` must be false")
            self.assertFalse(cad["capabilities"]["execute"], f"{filename}: capabilities.execute must be false")
            return cad

    def test_notes_txt(self):
        self._execute_for("notes.txt")

    def test_readme_sh(self):
        self._execute_for("README.sh")

    def test_acad_exe_gui(self):
        self._execute_for("acad.exe")

    def test_acadlt_exe(self):
        self._execute_for("acadlt.exe")


class AutoCadRegistryDetectionTests(unittest.TestCase):
    """12.2/12.3/12.4/12.5: registry-driven accoreconsole.exe detection,
    full-vs-LT edition, and per-CAD capabilities. Never imports real
    `winreg` — always patches `discovery.winreg` with a fake module."""

    def test_full_autocad_detected_with_console_and_edition(self):
        with tempfile.TemporaryDirectory() as d:
            install_dir = Path(d) / "AutoCAD 2026"
            install_dir.mkdir()
            console_path = install_dir / "accoreconsole.exe"
            console_path.touch()
            tree = {"R25.1": {"ACAD-9101": {**FULL_TREE["R25.1"]["ACAD-9101"], "AcadLocation": str(install_dir)}}}
            fake = make_fake_winreg(tree)
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", fake), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover()
            matches = [c for c in cads if c["path"] == str(console_path.resolve())]
            self.assertEqual(len(matches), 1)
            cad = matches[0]
            self.assertEqual(cad["name"], "AutoCAD")
            self.assertEqual(cad["capabilities"]["edition"], "full")
            self.assertEqual(cad["capabilities"]["console"], str(console_path.resolve()))
            # D12: execute stays false until --enable-autocad lands in 13a,
            # even for a confirmed full-edition console.
            self.assertFalse(cad["capabilities"]["execute"])
            self.assertFalse(cad["executable"])
            self.assertEqual(cad["capabilities"]["ops"], discovery.AUTOCAD_OPS)
            # Slice 14: STL preview is proven on full editions via `_STLOUT`.
            self.assertTrue(cad["capabilities"]["mesh"])

    def test_lt_has_no_console_and_reports_lt_edition_via_gui_binary(self):
        # LT never ships accoreconsole.exe (spec cad-discovery "Full-vs-LT
        # Signal"): only the GUI acadlt.exe is on disk, so registry lookup
        # finds no console and the LT entry comes from the acadlt.exe path.
        with tempfile.TemporaryDirectory() as d:
            install_dir = Path(d) / "AutoCAD LT 2026"
            install_dir.mkdir()
            acadlt_path = install_dir / "acadlt.exe"
            acadlt_path.touch()
            tree = {"R25.1": {"ACAD-9201": {**LT_TREE["R25.1"]["ACAD-9201"], "AcadLocation": str(install_dir)}}}
            fake = make_fake_winreg(tree)
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", fake), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover(str(acadlt_path))
            # No accoreconsole.exe anywhere: registry lookup finds none since
            # `<AcadLocation>/accoreconsole.exe` does not exist on disk.
            self.assertFalse(any(c["capabilities"]["console"] for c in cads))
            matches = [c for c in cads if c["path"] == str(acadlt_path.resolve())]
            self.assertEqual(len(matches), 1)
            cad = matches[0]
            self.assertEqual(cad["capabilities"]["edition"], "lt")
            self.assertFalse(cad["capabilities"]["execute"])
            self.assertFalse(cad["executable"])
            # LT never ships accoreconsole.exe/STLOUT: no execute, no mesh.
            self.assertFalse(cad["capabilities"]["mesh"])

    def test_glob_fallback_detects_full_when_registry_has_no_acadlocation(self):
        # The real verified host (AutoCAD 2026) has NO AcadLocation registry
        # value, so the registry path yields nothing and the glob fallback
        # (ProgramFiles/Autodesk/AutoCAD 20*/accoreconsole.exe) is what detects
        # the install. This exercises that exact load-bearing branch.
        with tempfile.TemporaryDirectory() as d:
            pf = Path(d) / "Program Files"
            install_dir = pf / "Autodesk" / "AutoCAD 2026"
            install_dir.mkdir(parents=True)
            console_path = install_dir / "accoreconsole.exe"
            console_path.touch()
            # Registry present but WITHOUT AcadLocation (mirrors the real host).
            tree = {"R25.1": {"ACAD-9101": {"locales": {"ACAD-9101:40A": {"ProductName": "AutoCAD 2026 - Espanol (Spanish)"}}}}}
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg(tree)), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(pf)}):
                cads = discover()
            matches = [c for c in cads if c["path"] == str(console_path.resolve())]
            self.assertEqual(len(matches), 1)
            cad = matches[0]
            self.assertEqual(cad["name"], "AutoCAD")
            self.assertEqual(cad["capabilities"]["edition"], "full")
            self.assertEqual(cad["capabilities"]["console"], str(console_path.resolve()))
            self.assertFalse(cad["capabilities"]["execute"])

    def test_glob_fallback_never_matches_lt_folder(self):
        # LT never ships accoreconsole.exe, and the glob is "AutoCAD 20*" which
        # cannot match "AutoCAD LT 2026": even if such a file existed, it must
        # not be picked up as a full-edition console.
        with tempfile.TemporaryDirectory() as d:
            pf = Path(d) / "Program Files"
            lt_dir = pf / "Autodesk" / "AutoCAD LT 2026"
            lt_dir.mkdir(parents=True)
            (lt_dir / "accoreconsole.exe").touch()  # should never be matched
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg({})), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(pf)}):
                cads = discover()
            self.assertFalse(any(c["capabilities"].get("console") for c in cads))

    def test_manual_cad_path_at_accoreconsole_exe(self):
        with tempfile.TemporaryDirectory() as d:
            console_path = Path(d) / "accoreconsole.exe"
            console_path.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg({})), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover(str(console_path))
            matches = [c for c in cads if c["path"] == str(console_path.resolve())]
            self.assertEqual(len(matches), 1)
            cad = matches[0]
            self.assertEqual(cad["name"], "AutoCAD")
            self.assertEqual(cad["capabilities"]["edition"], "full")
            self.assertEqual(cad["capabilities"]["console"], str(console_path.resolve()))
            self.assertFalse(cad["capabilities"]["execute"])

    def test_registry_open_failure_yields_no_autocad_entries(self):
        class RaisingWinreg(FakeWinreg):
            def OpenKey(self, hive, path):
                raise OSError("registry unavailable")

        with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
             patch("cadgpt_agent.discovery.winreg", RaisingWinreg({})), \
             patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": "/nonexistent-pf"}):
            cads = discover()
        self.assertFalse(any(c["name"] == "AutoCAD" for c in cads))

    def test_never_imports_real_winreg_on_macos(self):
        self.assertIsNone(discovery.winreg)

    def test_freecad_capabilities_unaffected(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "FreeCADCmd"
            path.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Darwin"):
                cads = discover(str(path))
            matches = [c for c in cads if c["path"] == str(path.resolve())]
            self.assertEqual(len(matches), 1)
            cad = matches[0]
            self.assertTrue(cad["executable"])
            self.assertTrue(cad["capabilities"]["execute"])
            self.assertEqual(cad["capabilities"]["ops"], discovery.FREECAD_OPS)
            self.assertTrue(cad["capabilities"]["mesh"])
            self.assertIsNone(cad["capabilities"]["edition"])
            self.assertIsNone(cad["capabilities"]["console"])


class EnableAutocadFlagTests(unittest.TestCase):
    """13a.5/13a.8: `enable_autocad` is the sole gate for AutoCAD `execute`;
    off by default (D12), and never true for LT even when passed."""

    def test_full_autocad_stays_non_executable_without_the_flag(self):
        with tempfile.TemporaryDirectory() as d:
            install_dir = Path(d) / "AutoCAD 2026"
            install_dir.mkdir()
            console_path = install_dir / "accoreconsole.exe"
            console_path.touch()
            tree = {"R25.1": {"ACAD-9101": {**FULL_TREE["R25.1"]["ACAD-9101"], "AcadLocation": str(install_dir)}}}
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg(tree)), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover()  # enable_autocad defaults to False
            cad = next(c for c in cads if c["path"] == str(console_path.resolve()))
            self.assertFalse(cad["capabilities"]["execute"])
            self.assertFalse(cad["executable"])

    def test_full_autocad_becomes_executable_with_the_flag(self):
        with tempfile.TemporaryDirectory() as d:
            install_dir = Path(d) / "AutoCAD 2026"
            install_dir.mkdir()
            console_path = install_dir / "accoreconsole.exe"
            console_path.touch()
            tree = {"R25.1": {"ACAD-9101": {**FULL_TREE["R25.1"]["ACAD-9101"], "AcadLocation": str(install_dir)}}}
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg(tree)), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover(enable_autocad=True)
            cad = next(c for c in cads if c["path"] == str(console_path.resolve()))
            self.assertTrue(cad["capabilities"]["execute"])
            self.assertTrue(cad["executable"])

    def test_lt_stays_non_executable_even_with_the_flag(self):
        with tempfile.TemporaryDirectory() as d:
            install_dir = Path(d) / "AutoCAD LT 2026"
            install_dir.mkdir()
            acadlt_path = install_dir / "acadlt.exe"
            acadlt_path.touch()
            tree = {"R25.1": {"ACAD-9201": {**LT_TREE["R25.1"]["ACAD-9201"], "AcadLocation": str(install_dir)}}}
            with patch("cadgpt_agent.discovery.platform.system", return_value="Windows"), \
                 patch("cadgpt_agent.discovery.winreg", make_fake_winreg(tree)), \
                 patch.dict("cadgpt_agent.discovery.os.environ", {"ProgramFiles": str(Path(d) / "empty-pf")}):
                cads = discover(str(acadlt_path), enable_autocad=True)
            cad = next(c for c in cads if c["path"] == str(acadlt_path.resolve()))
            self.assertFalse(cad["capabilities"]["execute"])
            self.assertFalse(cad["executable"])

    def test_freecad_capabilities_unaffected_by_the_flag(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "FreeCADCmd"
            path.touch()
            with patch("cadgpt_agent.discovery.platform.system", return_value="Darwin"):
                cads = discover(str(path), enable_autocad=True)
            cad = next(c for c in cads if c["path"] == str(path.resolve()))
            self.assertTrue(cad["capabilities"]["execute"])
            self.assertTrue(cad["executable"])


if __name__ == "__main__":
    unittest.main()
