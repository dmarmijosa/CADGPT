"""Cross-platform native service and daemon lifecycle management.

Manages background agent worker via:
- Windows: schtasks /SC ONLOGON /RL LIMITED (Task: "CADEngineAgent")
- Linux: systemd user service (~/.config/systemd/user/cadengine.service)
- macOS: LaunchAgent plist (~/Library/LaunchAgents/com.cadengine.agent.plist)
"""

import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys

TASK_NAME_WINDOWS = "CADEngineAgent"
SYSTEMD_SERVICE_NAME = "cadengine.service"
LAUNCHAGENT_LABEL = "com.cadengine.agent"


def get_agent_executable() -> str:
    """Return path to executable binary for background service invocation."""
    if getattr(sys, "frozen", False):
        return sys.executable
    which_cadengine = shutil.which("cadengine")
    if which_cadengine:
        return which_cadengine
    which_cadgpt_agent = shutil.which("cadgpt-agent")
    if which_cadgpt_agent:
        return which_cadgpt_agent
    return sys.executable


def get_agent_command(exe_path: str = None) -> tuple[str, list[str]]:
    """Return executable path and extra arguments for background service invocation."""
    exe = exe_path or get_agent_executable()
    # If not running as a frozen binary and path points to a python interpreter,
    # invoke the cadgpt_agent.main module.
    if not getattr(sys, "frozen", False) and Path(exe).name.lower().startswith("python"):
        return exe, ["-m", "cadgpt_agent.main"]
    return exe, []


def get_service_status() -> dict:
    """Query the native platform service manager and return status dictionary."""
    system = platform.system()
    if system == "Windows":
        try:
            res = subprocess.run(
                ["schtasks", "/Query", "/TN", TASK_NAME_WINDOWS, "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if res.returncode == 0:
                is_running = "Running" in res.stdout
                status = "active" if is_running else "stopped"
                return {
                    "installed": True,
                    "active": is_running,
                    "status": status,
                    "name": TASK_NAME_WINDOWS,
                }
            return {
                "installed": False,
                "active": False,
                "status": "not installed",
                "name": TASK_NAME_WINDOWS,
            }
        except Exception as e:
            return {
                "installed": False,
                "active": False,
                "status": f"error: {e}",
                "name": TASK_NAME_WINDOWS,
            }

    elif system == "Darwin":
        plist = Path.home() / "Library/LaunchAgents" / f"{LAUNCHAGENT_LABEL}.plist"
        installed = plist.is_file()
        try:
            res = subprocess.run(
                ["launchctl", "list", LAUNCHAGENT_LABEL],
                capture_output=True,
                text=True,
                timeout=5,
            )
            active = res.returncode == 0
            status = "active" if active else ("stopped" if installed else "not installed")
            return {
                "installed": installed,
                "active": active,
                "status": status,
                "name": LAUNCHAGENT_LABEL,
            }
        except Exception as e:
            return {
                "installed": installed,
                "active": False,
                "status": f"error: {e}",
                "name": LAUNCHAGENT_LABEL,
            }

    else:  # Linux / default POSIX
        unit = Path.home() / ".config/systemd/user" / SYSTEMD_SERVICE_NAME
        installed = unit.is_file()
        try:
            res = subprocess.run(
                ["systemctl", "--user", "is-active", SYSTEMD_SERVICE_NAME],
                capture_output=True,
                text=True,
                timeout=5,
            )
            active = res.stdout.strip() == "active"
            status = "active" if active else ("stopped" if installed else "not installed")
            return {
                "installed": installed,
                "active": active,
                "status": status,
                "name": SYSTEMD_SERVICE_NAME,
            }
        except Exception as e:
            return {
                "installed": installed,
                "active": False,
                "status": f"error: {e}",
                "name": SYSTEMD_SERVICE_NAME,
            }


def install_service(exe_path: str = None, extra_args: list[str] = None) -> None:
    """Install and enable the background daemon."""
    exe, default_args = get_agent_command(exe_path)
    combined_args = list(default_args)
    if extra_args:
        combined_args.extend(extra_args)
    system = platform.system()

    if system == "Windows":
        tr_arg = f'"{exe}"' if not combined_args else f'"{exe}" ' + " ".join(combined_args)
        cmd = [
            "schtasks",
            "/Create",
            "/TN",
            TASK_NAME_WINDOWS,
            "/TR",
            tr_arg,
            "/SC",
            "ONLOGON",
            "/RL",
            "LIMITED",
            "/F",
        ]
        subprocess.run(cmd, check=True)

    elif system == "Darwin":
        plist_dir = Path.home() / "Library/LaunchAgents"
        plist_dir.mkdir(parents=True, exist_ok=True)
        plist_path = plist_dir / f"{LAUNCHAGENT_LABEL}.plist"
        args_elements = f"        <string>{exe}</string>\n" + "".join(
            f"        <string>{arg}</string>\n" for arg in combined_args
        )
        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{LAUNCHAGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
{args_elements}    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{str(Path.home() / ".cadengine.stdout.log")}</string>
    <key>StandardErrorPath</key>
    <string>{str(Path.home() / ".cadengine.stderr.log")}</string>
</dict>
</plist>
"""
        plist_path.write_text(plist_content, encoding="utf-8")
        try:
            subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
        except Exception:
            pass
        subprocess.run(["launchctl", "load", str(plist_path)], check=True)

    else:
        unit_dir = Path.home() / ".config/systemd/user"
        unit_dir.mkdir(parents=True, exist_ok=True)
        unit_path = unit_dir / SYSTEMD_SERVICE_NAME
        exec_start = exe if not combined_args else f"{exe} " + " ".join(combined_args)
        unit_content = f"""[Unit]
Description=CAD Engine Background Agent
After=network.target

[Service]
ExecStart={exec_start}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
"""
        unit_path.write_text(unit_content, encoding="utf-8")
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "--user", "enable", SYSTEMD_SERVICE_NAME], check=True)


def start_service() -> None:
    """Start the background service."""
    system = platform.system()
    if system == "Windows":
        subprocess.run(["schtasks", "/Run", "/TN", TASK_NAME_WINDOWS], check=True)
    elif system == "Darwin":
        subprocess.run(["launchctl", "start", LAUNCHAGENT_LABEL], check=True)
    else:
        subprocess.run(["systemctl", "--user", "start", SYSTEMD_SERVICE_NAME], check=True)


def stop_service() -> None:
    """Stop the background service."""
    system = platform.system()
    if system == "Windows":
        res = subprocess.run(
            ["schtasks", "/End", "/TN", TASK_NAME_WINDOWS],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            err = (res.stderr or res.stdout or "").lower()
            if "no instance" not in err and "not running" not in err:
                res.check_returncode()
    elif system == "Darwin":
        subprocess.run(["launchctl", "stop", LAUNCHAGENT_LABEL], check=True)
    else:
        subprocess.run(["systemctl", "--user", "stop", SYSTEMD_SERVICE_NAME], check=True)


def restart_service() -> None:
    """Restart the background service."""
    try:
        stop_service()
    except Exception:
        pass
    start_service()


def uninstall_service() -> None:
    """Uninstall the background service."""
    system = platform.system()
    if system == "Windows":
        res = subprocess.run(
            ["schtasks", "/Delete", "/TN", TASK_NAME_WINDOWS, "/F"],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            err = (res.stderr or res.stdout or "").lower()
            if "cannot find" not in err and "does not exist" not in err:
                res.check_returncode()
    elif system == "Darwin":
        plist_path = Path.home() / "Library/LaunchAgents" / f"{LAUNCHAGENT_LABEL}.plist"
        try:
            subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
        except Exception:
            pass
        if plist_path.is_file():
            plist_path.unlink()
    else:
        try:
            subprocess.run(["systemctl", "--user", "stop", SYSTEMD_SERVICE_NAME], capture_output=True)
            subprocess.run(["systemctl", "--user", "disable", SYSTEMD_SERVICE_NAME], capture_output=True)
        except Exception:
            pass
        unit_path = Path.home() / ".config/systemd/user" / SYSTEMD_SERVICE_NAME
        if unit_path.is_file():
            unit_path.unlink()
        try:
            subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
        except Exception:
            pass
