"""Discover installations without running untrusted executables."""
import hashlib
import os
from pathlib import Path
import platform
import shutil

# `winreg` only exists on Windows. Guarding the import keeps this module
# importable on macOS/Linux, and lets tests monkeypatch `discovery.winreg`
# with a fake module without ever touching the real one.
if platform.system() == "Windows":
    import winreg
else:
    winreg = None

FREECAD_OPS = [
    "create_box", "create_cylinder", "create_sphere", "create_cone", "extrude_rect",
    "boolean_cut", "boolean_union", "boolean_intersect",
    "translate_object", "rotate_object", "scale_object",
    "read_scene", "export_design",
]

# Ops the AutoCAD adapter can actually run today. Kept in lockstep with
# `strategies.autocad` so the API's capability check (`cad.capabilities.ops`)
# advertises exactly the proven ops (Pillar 2 parity).
AUTOCAD_OPS = [
    "create_box", "create_cylinder", "create_sphere", "create_cone", "extrude_rect",
    "boolean_cut", "boolean_union", "boolean_intersect",
    "translate_object", "rotate_object", "scale_object",
    "read_scene", "export_design",
]



def _iter_subkeys(key):
    """Yield subkey names under `key`, never touching a candidate binary."""
    index = 0
    while True:
        try:
            yield winreg.EnumKey(key, index)
        except OSError:
            return
        index += 1


def _registry_value(key, name):
    try:
        value, _ = winreg.QueryValueEx(key, name)
        return value
    except OSError:
        return None


def _autocad_product_name(product_key):
    # `ProductName` lives on the locale subkey (e.g. `ACAD-9101:40A`), not on
    # the product key itself.
    for locale in _iter_subkeys(product_key):
        locale_key = winreg.OpenKey(product_key, locale)
        name = _registry_value(locale_key, "ProductName")
        if name:
            return name
    return None


def _autocad_registry_installs():
    """Read `HKLM\\SOFTWARE\\Autodesk\\AutoCAD\\R*\\ACAD-*` for `AcadLocation`.

    Per D14: only reports an install when `accoreconsole.exe` is confirmed to
    exist on disk next to the reported location. Never opens or runs that
    binary — existence is checked with `Path.exists()` only.
    """
    installs = []
    if winreg is None:
        return installs
    try:
        autocad_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Autodesk\AutoCAD")
    except OSError:
        return installs
    for release in _iter_subkeys(autocad_key):
        if not release.upper().startswith("R"):
            continue
        release_key = winreg.OpenKey(autocad_key, release)
        for product in _iter_subkeys(release_key):
            if not product.upper().startswith("ACAD-"):
                continue
            product_key = winreg.OpenKey(release_key, product)
            location = _registry_value(product_key, "AcadLocation")
            if not location:
                continue
            console = Path(location) / "accoreconsole.exe"
            if not console.exists():
                continue
            product_name = _autocad_product_name(product_key) or ""
            edition = "lt" if "lt" in product_name.lower() else "full"
            installs.append({"console": console, "edition": edition})
    return installs


def discover(manual=None, enable_autocad=False):
    system = platform.system()
    paths = []
    console_editions = {}  # str(path) -> 'full' | 'lt', for accoreconsole.exe candidates

    for binary in ("FreeCADCmd", "freecadcmd", "freecad", "FreeCAD", "acad", "acadlt"):
        found = shutil.which(binary)
        if found:
            paths.append(Path(found))
    if system == "Windows":
        program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
        for root in (program_files, Path(os.environ.get("LOCALAPPDATA", "")) / "Programs"):
            paths.extend(root.glob("FreeCAD*/bin/FreeCADCmd.exe"))
            paths.extend(root.glob("Autodesk/AutoCAD*/acad*.exe"))
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\acad.exe") as key:
                paths.append(Path(winreg.QueryValue(key, None)))
        except (ImportError, OSError, AttributeError):
            pass
        for install in _autocad_registry_installs():
            paths.append(install["console"])
            console_editions[str(install["console"])] = install["edition"]
        # Glob fallback (D14): only matches full-edition folder names
        # ("AutoCAD 20*"), never "AutoCAD LT 20*" — LT never ships
        # accoreconsole.exe (spec cad-discovery "Full-vs-LT Signal").
        for console in program_files.glob("Autodesk/AutoCAD 20*/accoreconsole.exe"):
            paths.append(console)
            console_editions.setdefault(str(console), "full")
    elif system == "Darwin":
        for root in (Path("/Applications"), Path.home() / "Applications"):
            paths.extend(root.glob("FreeCAD*.app/Contents/Resources/bin/FreeCADCmd"))
            paths.extend(root.glob("FreeCAD*.app/Contents/MacOS/FreeCADCmd"))
            paths.extend(root.glob("Autodesk/AutoCAD*/*.app"))
            paths.extend(root.glob("Autodesk/AutoCAD*.app"))
    else:
        for root in (Path("/usr/bin"), Path("/usr/local/bin")):
            paths.extend(root.glob("*reecad*"))
        paths.extend(Path("/opt").glob("FreeCAD*/bin/FreeCADCmd"))
    environments = Path.home() / ".conda/environments.txt"
    if environments.is_file():
        for line in environments.read_text().splitlines()[:100]:
            root = Path(line)
            paths.extend([root / "bin/freecadcmd", root / "bin/FreeCADCmd", root / "Library/bin/FreeCADCmd.exe"])
    if manual:
        manual_path = Path(manual).expanduser()
        paths.append(manual_path)
        if manual_path.name.lower() == "accoreconsole.exe":
            # Manual `--cad-path` pointing straight at accoreconsole.exe
            # (D14): presence alone implies full edition (LT never ships it).
            console_editions.setdefault(str(manual_path), "full")

    result = {}
    for path in paths:
        if not path.exists():
            continue
        p = str(path.resolve())
        is_console = path.name.lower() == "accoreconsole.exe"
        name = "AutoCAD" if is_console or "autocad" in p.lower() or path.name.lower().startswith("acad") else "FreeCAD"
        identity = hashlib.sha256(p.encode()).hexdigest()[:24]
        if name == "FreeCAD":
            executable = path.name.lower() in ("freecadcmd", "freecadcmd.exe")
            capabilities = dict(execute=executable, edition=None, console=None, ops=FREECAD_OPS, mesh=True)
        else:
            edition = console_editions.get(str(path), "lt" if "lt" in path.name.lower() else ("full" if is_console else "unknown"))
            console = p if is_console else None
            # D12: AutoCAD execution is opt-in behind agent flag
            # `--enable-autocad`. Even a confirmed full-edition
            # accoreconsole.exe stays non-executable without it; LT never
            # becomes executable regardless of the flag (no Core Console).
            executable = bool(enable_autocad and edition == "full" and console is not None)
            # STL preview (`_STLOUT`) is proven on full editions only (slice
            # 14.0 spike); STLOUT is absent from LT (no Core Console at all),
            # so LT never advertises mesh regardless of the `--enable-autocad`
            # flag or `execute`.
            mesh = edition == "full"
            capabilities = dict(execute=executable, edition=edition, console=console, ops=AUTOCAD_OPS, mesh=mesh)
        result[identity] = dict(id=identity, name=name, path=p, version="Not verified", executable=executable, capabilities=capabilities)
    return list(result.values())[:30]
