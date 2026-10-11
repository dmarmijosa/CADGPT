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
    "create_box",
    "create_cylinder",
    "create_sphere",
    "create_cone",
    "extrude_rect",
    "create_wedge",
    "extrude_polygon",
    "boolean_cut",
    "boolean_union",
    "boolean_intersect",
    "fillet",
    "chamfer",
    "loft",
    "translate_object",
    "rotate_object",
    "scale_object",
    "read_scene",
    "export_design",
    "create_text_3d",
    "analyze_image_to_cad",
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

# 2D drafting on the same Core Console (`strategies.autocad`): polylines,
# circles and deletion by handle. Kept apart from AUTOCAD_OPS, which mirrors
# the shared 3D allowlist fixture. The transform ops in AUTOCAD_OPS already
# accept 2D handles too.
AUTOCAD_2D_OPS = ["draw_polyline", "draw_circle", "delete_object"]

# Civil 3D runs on the same accoreconsole.exe (`/product C3D`), so it
# inherits every AutoCAD op plus its own civil cross-section solid
# (`strategies.civil3d`).
CIVIL3D_OPS = [*AUTOCAD_OPS, *AUTOCAD_2D_OPS, "extrude_cross_section"]

# Kept in lockstep with `strategies.solidworks.SOLIDWORKS_OPS`.
SOLIDWORKS_OPS = [
    "create_box", "create_cylinder", "extrude_rect", "export_design", "read_scene",
    "translate_object", "rotate_object", "boolean_cut", "boolean_union", "boolean_intersect",
]

BLENDER_OPS = [
    "create_blender_mesh",
    "extrude_subdivide_mesh",
    "displace_sculpt_mesh",
    "boolean_blender_mesh",
    "export_blender_scene",
    "read_scene",
    "export_design",
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
            # Civil 3D registers as an ACAD-* product of its own ("Autodesk
            # Civil 3D 2026") and adds a `C3D` folder next to the console.
            civil3d = "civil 3d" in product_name.lower() or (Path(location) / "C3D").is_dir()
            installs.append({"console": console, "edition": edition, "civil3d": civil3d})
    return installs


def _is_solidworks(path):
    return path.name.lower() == "sldworks.exe"


def discover(manual=None, enable_autocad=False, blender_path=None, enable_solidworks=False):
    system = platform.system()
    paths = []
    console_editions = {}  # str(path) -> 'full' | 'lt', for accoreconsole.exe candidates
    civil3d_consoles = set()  # str(path) of consoles that also run Civil 3D

    for binary in ("FreeCADCmd", "freecadcmd", "freecad", "FreeCAD", "acad", "acadlt", "blender", "blender.exe"):
        found = shutil.which(binary)
        if found:
            paths.append(Path(found))
    if system == "Windows":
        program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
        for root in (program_files, Path(os.environ.get("LOCALAPPDATA", "")) / "Programs"):
            paths.extend(root.glob("FreeCAD*/bin/FreeCADCmd.exe"))
            paths.extend(root.glob("Autodesk/AutoCAD*/acad*.exe"))
            paths.extend(root.glob("Blender Foundation/Blender*/blender.exe"))
            paths.extend(root.glob("Blender Foundation/Blender*/blender"))
            paths.extend(root.glob("Blender*/blender.exe"))
            paths.extend(root.glob("SOLIDWORKS Corp*/SOLIDWORKS*/SLDWORKS.exe"))
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\acad.exe") as key:
                paths.append(Path(winreg.QueryValue(key, None)))
        except (ImportError, OSError, AttributeError):
            pass
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\blender.exe") as key:
                paths.append(Path(winreg.QueryValue(key, None)))
        except (ImportError, OSError, AttributeError):
            pass
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\SLDWORKS.exe") as key:
                paths.append(Path(winreg.QueryValue(key, None)))
        except (ImportError, OSError, AttributeError):
            pass
        for install in _autocad_registry_installs():
            paths.append(install["console"])
            console_editions[str(install["console"])] = install["edition"]
            if install.get("civil3d"):
                civil3d_consoles.add(str(install["console"]))
        # Glob fallback (D14): only matches full-edition folder names
        # ("AutoCAD 20*"), never "AutoCAD LT 20*" — LT never ships
        # accoreconsole.exe (spec cad-discovery "Full-vs-LT Signal").
        for console in program_files.glob("Autodesk/AutoCAD 20*/accoreconsole.exe"):
            paths.append(console)
            console_editions.setdefault(str(console), "full")
            if (console.parent / "C3D").is_dir():
                civil3d_consoles.add(str(console))
    elif system == "Darwin":
        for root in (Path("/Applications"), Path.home() / "Applications"):
            paths.extend(root.glob("FreeCAD*.app/Contents/Resources/bin/FreeCADCmd"))
            paths.extend(root.glob("FreeCAD*.app/Contents/MacOS/FreeCADCmd"))
            paths.extend(root.glob("FreeCAD*.app/Contents/Resources/bin/freecadcmd"))
            paths.extend(root.glob("Autodesk/AutoCAD*/*.app"))
            paths.extend(root.glob("Autodesk/AutoCAD*.app"))
            paths.extend(root.glob("Blender.app/Contents/MacOS/Blender"))
            paths.extend(root.glob("Blender*/Blender.app/Contents/MacOS/Blender"))
    else:
        for root in (Path("/usr/bin"), Path("/usr/local/bin"), Path.home() / ".local/bin"):
            paths.extend(root.glob("*reecad*"))
            paths.extend(root.glob("blender"))
        paths.extend(Path("/opt").glob("FreeCAD*/bin/FreeCADCmd"))
        paths.extend(Path.home().glob("blender*/blender"))
        paths.extend(Path("/snap/bin").glob("blender"))
        paths.extend(Path("/var/lib/flatpak/exports/bin").glob("*blender*"))
        paths.extend((Path.home() / ".local/share/flatpak/exports/bin").glob("*blender*"))
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
    if blender_path:
        paths.append(Path(blender_path).expanduser())
    else:
        try:
            from platformdirs import user_data_dir
            cfg_path = Path(user_data_dir("CADGPT", appauthor=False)) / "config.json"
            if cfg_path.is_file():
                import json
                cfg_data = json.loads(cfg_path.read_text(encoding="utf-8"))
                if cfg_data.get("blenderPath"):
                    paths.append(Path(cfg_data["blenderPath"]).expanduser())
        except Exception:
            pass

    result = {}
    for path in paths:
        if not path.exists():
            continue
        p = str(path.resolve())
        is_console = path.name.lower() == "accoreconsole.exe"
        if _is_solidworks(path):
            name = "SolidWorks"
        elif is_console or "autocad" in p.lower() or path.name.lower().startswith("acad"):
            name = "AutoCAD"
        elif "blender" in p.lower() or path.name.lower().startswith("blender"):
            name = "Blender"
        else:
            name = "FreeCAD"
        identity = hashlib.sha256(p.encode()).hexdigest()[:24]
        if name == "SolidWorks":
            # SOLIDWORKS is driven through its COM API by a PowerShell worker
            # (`strategies.solidworks`), so it only runs on Windows and only
            # when the user opts in with `--enable-solidworks`.
            executable = bool(enable_solidworks and system == "Windows")
            capabilities = dict(execute=executable, edition=None, console=None, ops=SOLIDWORKS_OPS, mesh=True)
        elif name == "Blender":
            executable = True
            capabilities = dict(execute=True, edition="standard", console=None, ops=BLENDER_OPS, mesh=True)
        elif name == "FreeCAD":
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
            # LT never executes, so it advertises the 3D set only.
            ops = [*AUTOCAD_OPS, *AUTOCAD_2D_OPS] if edition == "full" else AUTOCAD_OPS
            capabilities = dict(execute=executable, edition=edition, console=console, ops=ops, mesh=mesh)
        result[identity] = dict(id=identity, name=name, path=p, version="Not verified", executable=executable, capabilities=capabilities)
        if name == "AutoCAD" and is_console and str(path) in civil3d_consoles:
            # The same console also runs Civil 3D (`/product C3D`): report it
            # as its own CAD so jobs and documents stay Civil 3D-scoped.
            civil_identity = hashlib.sha256((p + "#civil3d").encode()).hexdigest()[:24]
            result[civil_identity] = dict(
                id=civil_identity, name="Civil3D", path=p, version="Not verified", executable=executable,
                capabilities=dict(execute=executable, edition="full", console=p, ops=CIVIL3D_OPS, mesh=True),
            )
    return list(result.values())[:30]
