"""Cross-platform packaging and build script for CAD Engine.

Builds:
1. Native `cadengine` binary via PyInstaller (plus backward-compatible `cadgpt-agent` alias).
2. WiX v4 elevated Windows Installer (`CADEngine-Setup-x64.msi`) if WiX toolset is installed.
3. Inno Setup Windows installer fallback (`CADEngine-Setup-windows-x64.exe`) if ISCC is installed.

Supports `--dry-run` to validate packaging assets and preview commands without execution.
"""

import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    parser = argparse.ArgumentParser(description="Build and package CAD Engine")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate build configuration and print planned commands without execution",
    )
    parser.add_argument(
        "--dist-dir",
        type=Path,
        default=ROOT / "dist",
        help="Destination directory for distribution packages (default: ROOT/dist)",
    )
    parser.add_argument(
        "--skip-pyinstaller",
        action="store_true",
        help="Skip PyInstaller compilation step",
    )
    parser.add_argument(
        "--skip-wix",
        action="store_true",
        help="Skip WiX v4 MSI compilation step",
    )
    parser.add_argument(
        "--skip-inno",
        action="store_true",
        help="Skip Inno Setup compilation step",
    )
    return parser.parse_args()


def validate_packaging_assets():
    """Verify that required source and packaging files exist and are valid."""
    launcher = ROOT / "agent" / "launcher.py"
    if not launcher.is_file():
        raise FileNotFoundError(f"Agent launcher not found: {launcher}")

    worker = ROOT / "agent" / "cadgpt_agent" / "freecad_worker.py"
    if not worker.is_file():
        raise FileNotFoundError(f"FreeCAD worker not found: {worker}")

    gui_file = ROOT / "agent" / "cadgpt_agent" / "gui.py"
    if not gui_file.is_file():
        raise FileNotFoundError(f"GUI module not found: {gui_file}")

    i18n_file = ROOT / "agent" / "cadgpt_agent" / "i18n.py"
    if not i18n_file.is_file():
        raise FileNotFoundError(f"i18n module not found: {i18n_file}")

    wix_file = ROOT / "packaging" / "wix" / "cadengine.wxs"
    if not wix_file.is_file():
        raise FileNotFoundError(f"WiX v4 source not found: {wix_file}")

    # Validate WiX XML
    try:
        tree = ET.parse(str(wix_file))
        root_tag = tree.getroot().tag
        if not root_tag.endswith("Wix"):
            raise ValueError(f"Unexpected WiX root element: {root_tag}")
    except Exception as e:
        raise ValueError(f"Invalid WiX XML in {wix_file}: {e}")

    iss_file = ROOT / "packaging" / "windows.iss"
    if not iss_file.is_file():
        raise FileNotFoundError(f"Inno Setup script not found: {iss_file}")

    return True


def get_pyinstaller_command(dist_dir: Path) -> list[str]:
    """Construct PyInstaller execution arguments for cadengine."""
    sep = os.pathsep
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--name",
        "cadengine",
        "--distpath",
        str(dist_dir),
        "--paths",
        str(ROOT / "agent"),
        "--collect-all",
        "keyring",
        "--collect-all",
        "platformdirs",
        "--collect-all",
        "cv2",
        "--collect-all",
        "numpy",
        "--collect-all",
        "pystray",
        "--collect-all",
        "PIL",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/freecad_worker.py'}{sep}cadgpt_agent",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/vision.py'}{sep}cadgpt_agent",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/gui.py'}{sep}cadgpt_agent",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/i18n.py'}{sep}cadgpt_agent",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/autocad'}{sep}cadgpt_agent/autocad",
        "--add-data",
        f"{ROOT / 'agent/cadgpt_agent/fonts'}{sep}cadgpt_agent/fonts",
        "--add-data",
        f"{ROOT / 'apps/web/public/favicon.ico'}{sep}cadgpt_agent/assets",
    ]
    if platform.system() == "Darwin":
        args += ["--windowed", "--osx-bundle-identifier", "com.cadengine.agent"]
    else:
        args += ["--console"]
    args += [str(ROOT / "agent/launcher.py")]
    return args


def create_alias_symlink(dist_dir: Path, dry_run: bool = False):
    """Create cadgpt-agent alias or symlink pointing to cadengine."""
    cadengine_dir = dist_dir / "cadengine"
    is_windows = platform.system() == "Windows"
    binary_name = "cadengine.exe" if is_windows else "cadengine"
    alias_name = "cadgpt-agent.exe" if is_windows else "cadgpt-agent"

    binary_path = cadengine_dir / binary_name
    alias_path = cadengine_dir / alias_name

    if dry_run:
        print(f"[DRY-RUN] Would create alias: {alias_path} -> {binary_path}")
        return

    if not binary_path.exists():
        print(f"Notice: Source binary not found for alias creation: {binary_path}")
        return

    if alias_path.exists() or alias_path.is_symlink():
        try:
            alias_path.unlink()
        except Exception:
            pass

    if is_windows:
        shutil.copy2(str(binary_path), str(alias_path))
        print(f"Created alias copy: {alias_path}")
    else:
        os.symlink(binary_name, str(alias_path))
        print(f"Created alias symlink: {alias_path} -> {binary_name}")


def build_wix_msi(dist_dir: Path, dry_run: bool = False):
    """Build WiX v4 elevated MSI installer if wix CLI is available."""
    wix_bin = shutil.which("wix")
    wix_src = ROOT / "packaging" / "wix" / "cadengine.wxs"
    msi_out = dist_dir / "CADEngine-Setup-x64.msi"
    source_dir = dist_dir / "cadengine"

    if not wix_bin:
        print("Notice: WiX CLI ('wix') not found in PATH; skipping MSI creation.")
        return False

    cmd = [
        wix_bin,
        "build",
        str(wix_src),
        "-o",
        str(msi_out),
        "-d",
        f"SourceDir={source_dir}",
    ]

    if dry_run:
        print(f"[DRY-RUN] Would execute WiX build: {' '.join(cmd)}")
        return True

    print(f"Building WiX v4 MSI: {msi_out}...")
    subprocess.run(cmd, cwd=ROOT, check=True)
    print(f"WiX v4 MSI built successfully: {msi_out}")
    return True


def build_inno_setup(dry_run: bool = False):
    """Build Inno Setup installer fallback if iscc compiler is available."""
    iscc_bin = shutil.which("iscc")
    iss_src = ROOT / "packaging" / "windows.iss"

    if not iscc_bin:
        print("Notice: Inno Setup compiler ('iscc') not found in PATH; skipping Inno Setup installer.")
        return False

    cmd = [iscc_bin, str(iss_src)]

    if dry_run:
        print(f"[DRY-RUN] Would execute Inno Setup: {' '.join(cmd)}")
        return True

    print(f"Building Inno Setup installer: {iss_src}...")
    subprocess.run(cmd, cwd=ROOT, check=True)
    print("Inno Setup installer built successfully.")
    return True


def main():
    args = parse_args()
    dist_dir = args.dist_dir

    print(f"== CAD Engine Packaging (Platform: {platform.system()} {platform.machine()}) ==")
    validate_packaging_assets()
    print("[OK] Packaging asset validation passed (wix/cadengine.wxs, windows.iss, agent/launcher.py).")

    # 1. PyInstaller Build
    if not args.skip_pyinstaller:
        pyinstaller_cmd = get_pyinstaller_command(dist_dir)
        if args.dry_run:
            print(f"[DRY-RUN] Would execute PyInstaller: {' '.join(pyinstaller_cmd)}")
        else:
            print(f"Running PyInstaller for cadengine...")
            subprocess.run(pyinstaller_cmd, cwd=ROOT, check=True)
            print("[OK] PyInstaller build complete.")

        # Alias/symlink
        create_alias_symlink(dist_dir, dry_run=args.dry_run)

    # 2. WiX v4 MSI Compilation (Windows target or cross-platform tool)
    if not args.skip_wix:
        build_wix_msi(dist_dir, dry_run=args.dry_run)

    # 3. Inno Setup Fallback
    if not args.skip_inno:
        build_inno_setup(dry_run=args.dry_run)

    print("== Packaging completed successfully ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
