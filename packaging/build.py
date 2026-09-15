"""Run natively on each target OS. Python is embedded by PyInstaller."""
import os
import platform
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sep = os.pathsep
args = [
    sys.executable,
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--name",
    "CADGPT",
    "--paths",
    str(root / "agent"),
    "--collect-all",
    "keyring",
    "--collect-all",
    "platformdirs",
    "--add-data",
    f"{root / 'agent/cadgpt_agent/freecad_worker.py'}{sep}cadgpt_agent",
    "--add-data",
    f"{root / 'agent/cadgpt_agent/autocad'}{sep}cadgpt_agent/autocad",
]
if platform.system() == "Darwin":
    args += ["--windowed", "--osx-bundle-identifier", "com.cadgpt.bridge"]
else:
    args += ["--console"]
args += [str(root / "agent/launcher.py")]
subprocess.run(args, cwd=root, check=True)

