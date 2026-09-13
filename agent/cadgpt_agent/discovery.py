"""Discover installations without running untrusted executables."""
import hashlib
import os
from pathlib import Path
import platform
import shutil

def discover(manual=None):
    system = platform.system()
    paths = []
    for binary in ("FreeCADCmd", "freecadcmd", "freecad", "FreeCAD", "acad", "acadlt"):
        found = shutil.which(binary)
        if found:
            paths.append(Path(found))
    if system == "Windows":
        for root in (Path(os.environ.get("ProgramFiles", "C:/Program Files")), Path(os.environ.get("LOCALAPPDATA", "")) / "Programs"):
            paths.extend(root.glob("FreeCAD*/bin/FreeCADCmd.exe"))
            paths.extend(root.glob("Autodesk/AutoCAD*/acad*.exe"))
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\acad.exe") as key:
                paths.append(Path(winreg.QueryValue(key, None)))
        except (ImportError, OSError):
            pass
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
        paths.append(Path(manual).expanduser())
    result = {}
    for path in paths:
        if not path.exists():
            continue
        p = str(path.resolve())
        name = "AutoCAD" if "autocad" in p.lower() or path.name.lower().startswith("acad") else "FreeCAD"
        command = name == "FreeCAD" and path.name.lower() in ("freecadcmd", "freecadcmd.exe")
        identity = hashlib.sha256(p.encode()).hexdigest()[:24]
        result[identity] = dict(id=identity, name=name, path=p, version="Not verified", executable=command)
    return list(result.values())[:30]
