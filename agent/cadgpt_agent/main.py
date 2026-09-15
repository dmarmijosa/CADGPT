"""Enterprise CLI entry point and foreground agent daemon lifecycle."""

import argparse
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser

import keyring
from platformdirs import user_data_dir

from .discovery import discover
from .executor import execute
from .service import (
    get_agent_executable,
    get_service_status,
    install_service,
    restart_service,
    start_service,
    stop_service,
    uninstall_service,
)
from .upload import upload_mesh

VERSION = "0.1.0"
# Kept as "CADGPT" for compatibility: this is the OS keyring service name used
# to look up credentials already stored by previously paired devices. Renaming
# it would orphan every existing device's saved credential.
SERVICE = "CADGPT"
MAX_RESPONSE = 65536
GITHUB_RELEASES_URL = (
    "https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest"
)


def server_url(value):
    u = urllib.parse.urlsplit(value)
    if (
        u.username
        or u.password
        or u.query
        or u.fragment
        or u.path not in ("", "/")
    ):
        raise ValueError(
            "Use a server origin, without credentials, path, query, or fragment"
        )
    if u.scheme != "https" and not (
        u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")
    ):
        raise ValueError("HTTPS is required except for loopback development")
    return value.rstrip("/")


def open_connect_step(server, device_id, headless):
    """After pairing completes, guide the user to the post-pairing "connect

    your MCP client" step (spec mcp-client-onboarding). The URL carries only the
    device UUID -- never the device secret/credential the poll response also
    returns -- so it is always safe to print or open in a browser.
    """
    url = server + "/connect?device=" + device_id
    print("Next: connect your MCP client at " + url, flush=True)
    if not headless:
        webbrowser.open(url)
    return url


def request(server, route, payload, credential=None):
    headers = {"Content-Type": "application/json"}
    if credential:
        headers["Authorization"] = "Bearer " + credential
    req = urllib.request.Request(
        server + route,
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )

    # Refuse redirects so credentials cannot be forwarded to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):

        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    with urllib.request.build_opener(NoRedirect).open(
        req, timeout=20
    ) as response:
        raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise ValueError("Server response exceeds limit")
        return json.loads(raw)


def _note_preview_unavailable(result, exc):
    """Append a "preview unavailable" note without flipping the job's own

    success. Merges into the JSON `{message, ...}` shape when present (design
    "main.py uploads mesh first ... upload failure is reported as ok=True with a
    preview unavailable note").
    """
    note = "preview unavailable (upload failed: " + type(exc).__name__ + ")"
    try:
        payload = json.loads(result)
    except (TypeError, ValueError):
        payload = None
    if isinstance(payload, dict) and "message" in payload:
        payload["message"] = payload["message"] + " " + note
        return json.dumps(payload)
    return result + " " + note


def run_job(
    job,
    cads,
    root,
    server,
    credential,
    upload=upload_mesh,
    allowed_roots=None,
):
    """Execute one job, then upload its STL preview (if the worker produced

    one) before returning the result the caller posts to the server.

    A mesh upload failure never flips a successful job to `ok=False`: it only
    appends a "preview unavailable" note, since the design (native FCStd/DWG)
    exists locally regardless of upload outcome.
    """
    try:
        if allowed_roots is not None:
            result = execute(job, cads, root, allowed_roots=allowed_roots)
        else:
            result = execute(job, cads, root)
    except Exception as exc:
        return False, str(exc)[:4000]
    preview = root / "jobs" / job["id"] / "preview.stl"
    if preview.is_file():
        try:
            upload(server, job["id"], credential, preview)
        except Exception as exc:
            print("Preview upload failed: " + type(exc).__name__, flush=True)
            result = _note_preview_unavailable(result, exc)
    return True, result


# ---------------------------------------------------------------------------
# Logging with RotatingFileHandler (5MB cap, 3 backups)
# ---------------------------------------------------------------------------


def get_log_path(root_dir=None):
    """Resolve active log file path, checking agent.log and cadengine.log."""
    if root_dir is None:
        root_dir = Path(user_data_dir(SERVICE, appauthor=False))
    log_dir = Path(root_dir) / "logs"
    if (log_dir / "agent.log").is_file() and not (
        log_dir / "cadengine.log"
    ).is_file():
        return log_dir / "agent.log"
    return log_dir / "cadengine.log"


def setup_logging(root_dir=None, log_filename=None):
    """Configure rotating file logging (5 MB, 3 backups) under root_dir/logs."""
    if root_dir is None:
        root_dir = Path(user_data_dir(SERVICE, appauthor=False))
    log_dir = Path(root_dir) / "logs"
    log_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
    if log_filename is None:
        log_path = get_log_path(root_dir)
    else:
        log_path = log_dir / log_filename

    logger = logging.getLogger("cadgpt_agent")
    logger.setLevel(logging.INFO)

    for h in logger.handlers:
        if (
            isinstance(h, RotatingFileHandler)
            and Path(h.baseFilename) == log_path.resolve()
        ):
            return logger, log_path

    handler = RotatingFileHandler(
        str(log_path),
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8",
    )
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger, log_path


def tail_file(file_path, n=50, follow=False, stop_event=None):
    """Print the last n lines of file_path, optionally following new lines."""
    target = Path(file_path)
    if not target.is_file():
        print(f"Log file not found at {target}")
        return
    with open(target, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
        for line in lines[-n:]:
            sys.stdout.write(line)
        sys.stdout.flush()
        if not follow:
            return
        while True:
            if stop_event and stop_event.is_set():
                break
            line = f.readline()
            if line:
                sys.stdout.write(line)
                sys.stdout.flush()
            else:
                try:
                    time.sleep(0.5)
                except KeyboardInterrupt:
                    break


# ---------------------------------------------------------------------------
# Version & SemVer Helpers
# ---------------------------------------------------------------------------


def parse_semver(v: str):
    """Parse version string into a comparable 3-tuple (major, minor, patch)."""
    v = v.lstrip("v").strip()
    base = v.split("-")[0]
    parts = []
    for part in base.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def check_latest_release(timeout=2.5):
    """Fetch latest release tag from GitHub Releases API."""
    try:
        req = urllib.request.Request(
            GITHUB_RELEASES_URL,
            headers={
                "User-Agent": "cadengine",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
            return data.get("tag_name", "").lstrip("v").strip()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Subcommand Handlers
# ---------------------------------------------------------------------------


def cmd_version(args):
    """Handle version subcommand and --check flag."""
    print(f"cadengine v{VERSION}")
    check = getattr(args, "check", False)
    if check:
        latest = check_latest_release(timeout=2.5)
        if latest and parse_semver(latest) > parse_semver(VERSION):
            print(
                f"An update is available: v{latest} (current: v{VERSION}). Run"
                " 'cadengine update' to upgrade."
            )
    return 0


def cmd_status(args):
    """Handle status subcommand, supporting human-readable and --json output."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    config_file = root / "config.json"
    cfg = json.loads(config_file.read_text()) if config_file.is_file() else {}
    server = getattr(args, "server", None) or cfg.get("server")

    host_info = {
        "os": platform.system(),
        "arch": platform.machine(),
        "python": platform.python_version(),
    }

    config_info = {
        "exists": config_file.is_file(),
        "path": str(config_file),
        "server": server,
        "cadPath": cfg.get("cadPath"),
        "deviceId": cfg.get("deviceId"),
    }

    has_credential = False
    source = None
    if server:
        try:
            cred = keyring.get_password(SERVICE, server)
            if cred:
                has_credential = True
                source = "keyring"
        except Exception:
            pass
        if not has_credential:
            cred_file = root / "credential.json"
            if cred_file.is_file():
                try:
                    saved = json.loads(cred_file.read_text())
                    if saved.get("server") == server and saved.get(
                        "credential"
                    ):
                        has_credential = True
                        source = "file"
                except Exception:
                    pass

    keyring_info = {
        "service": SERVICE,
        "hasCredential": has_credential,
        "source": source,
    }

    server_info = {
        "url": server,
        "reachable": False,
        "latencyMs": None,
        "tls": False,
    }
    if server:
        try:
            u = urllib.parse.urlsplit(server)
            server_info["tls"] = u.scheme == "https"
            t0 = time.time()
            req = urllib.request.Request(
                f"{server}/api/health",
                headers={"User-Agent": "cadengine-status"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                server_info["latencyMs"] = round((time.time() - t0) * 1000, 2)
                server_info["reachable"] = resp.status == 200
                try:
                    data = json.loads(resp.read().decode())
                    server_info["status"] = data.get("status")
                except Exception:
                    pass
        except Exception as exc:
            server_info["error"] = str(exc)

    cad_path = getattr(args, "cad_path", None) or cfg.get("cadPath")
    enable_autocad = getattr(args, "enable_autocad", False)
    cads = discover(cad_path, enable_autocad=enable_autocad)
    service_info = get_service_status()

    is_json = getattr(args, "json", False)
    report = {
        "host": host_info,
        "config": config_info,
        "keyring": keyring_info,
        "server": server_info,
        "cads": cads,
        "service": service_info,
    }

    healthy = bool(has_credential and server_info["reachable"])

    if is_json:
        print(json.dumps(report, indent=2))
    else:
        print("=== CAD Engine Diagnostic Status ===")
        print(
            f"Host:      {host_info['os']} {host_info['arch']} (Python"
            f" {host_info['python']})"
        )
        print(
            f"Config:    {'Found' if config_info['exists'] else 'Missing'}"
            f" ({config_info['path']})"
        )
        print(f"Server:    {server or 'Not configured'}")
        if server_info["reachable"]:
            print(
                "           Reachable"
                f" ({server_info['latencyMs']} ms, TLS: {server_info['tls']})"
            )
        else:
            err = server_info.get("error", "Unreachable")
            print(f"           [FAIL] {err}")
        print(
            "Auth:     "
            f" {'[OK] Stored in ' + source if has_credential else '[FAIL] No credentials found'}"
        )
        print(
            f"Service:   {service_info['status'].capitalize()}"
            f" ({service_info['name']})"
        )
        exec_cads = [c for c in cads if c.get("executable")]
        print(f"CADs:      {len(exec_cads)} executable engine(s) detected")
        for c in cads:
            status_tag = "[EXEC]" if c.get("executable") else "[DETECTED]"
            print(f"  - {status_tag} {c['name']} ({c['path']})")

    return 0 if healthy else 1


def cmd_pair(args):
    """Handle interactive or headless pairing flow."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    config_file = root / "config.json"
    config = json.loads(config_file.read_text()) if config_file.is_file() else {}

    value = getattr(args, "server", None) or config.get("server")
    if not value:
        try:
            value = input(
                "CAD Agent Designer server URL (https://…): "
            ).strip()
        except Exception:
            value = None
    if not value:
        print("Error: Server URL is required for pairing.", file=sys.stderr)
        return 1

    server = server_url(value)
    manual = getattr(args, "cad_path", None) or config.get("cadPath")
    config["server"] = server
    if manual:
        config["cadPath"] = manual
    config_file.write_text(json.dumps(config))

    cads = discover(manual, enable_autocad=getattr(args, "enable_autocad", False))
    file = root / "credential.json"
    use_file = False

    # Purge existing credential for server
    try:
        keyring.delete_password(SERVICE, server)
    except Exception:
        pass
    if file.is_file():
        try:
            file.unlink()
        except Exception:
            pass

    try:
        keyring.get_password(SERVICE, server)
    except keyring.errors.KeyringError:
        if not getattr(args, "allow_file_credentials", False):
            raise RuntimeError(
                "OS keyring unavailable. Configure a keyring, or explicitly"
                " use --allow-file-credentials on a trusted single-user host."
            )
        if os.name == "nt":
            raise RuntimeError(
                "File credential fallback is disabled on Windows; configure"
                " Windows Credential Manager."
            )
        use_file = True

    pair = request(
        server,
        "/api/pairings",
        {"name": platform.node()[:80] or "CAD computer", "cads": cads},
    )
    print(f"Open {server}/pair")
    print(f"Confirm this pairing code: {pair['userCode']}", flush=True)

    headless = getattr(args, "headless", False)
    if not headless:
        webbrowser.open(server + "/pair")
        if platform.system() == "Darwin" and getattr(sys, "frozen", False):
            try:
                import tkinter as tk
                from tkinter.messagebox import showinfo

                window = tk.Tk()
                window.withdraw()
                showinfo(
                    "Link this CAD computer",
                    f"Open {server}/pair\n\nPairing code:"
                    f" {pair['userCode']}\n\nEnter this code in the dashboard,"
                    " then click OK here.",
                )
                window.destroy()
            except Exception:
                pass

    credential = None
    for _ in range(120):
        time.sleep(5)
        state = request(
            server,
            "/api/pairings/poll",
            {"deviceSecret": pair["deviceSecret"]},
        )
        if not state["pending"]:
            credential = state["credential"]
            device_id = state["deviceId"]
            config["deviceId"] = device_id
            config_file.write_text(json.dumps(config))
            if use_file:
                fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as stream:
                    json.dump(
                        {"server": server, "credential": credential}, stream
                    )
            else:
                keyring.set_password(SERVICE, server, credential)
            open_connect_step(server, device_id, headless)
            break

    if not credential:
        print("Pairing expired. Try again.", file=sys.stderr)
        return 1

    print("Pairing successful!")
    return 0


def cmd_unpair(args):
    """Handle unpair subcommand: POST /api/agent/unpair, then unconditional wipe."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    config_file = root / "config.json"
    config = json.loads(config_file.read_text()) if config_file.is_file() else {}

    server = getattr(args, "server", None) or config.get("server")
    credential = None
    if server:
        try:
            credential = keyring.get_password(SERVICE, server)
        except Exception:
            pass
        if not credential:
            cred_file = root / "credential.json"
            if cred_file.is_file():
                try:
                    saved = json.loads(cred_file.read_text())
                    if saved.get("server") == server:
                        credential = saved.get("credential")
                except Exception:
                    pass

    # Authenticated POST /api/agent/unpair
    if server and credential:
        try:
            request(server, "/api/agent/unpair", {}, credential=credential)
            print("Device successfully revoked on server.")
        except Exception as exc:
            print(
                f"Warning: Server unpair request failed: {exc}", file=sys.stderr
            )

    # Unconditional local credential wipe
    if server:
        try:
            keyring.delete_password(SERVICE, server)
        except Exception:
            pass

    cred_file = root / "credential.json"
    if cred_file.is_file():
        try:
            cred_file.unlink()
        except Exception:
            pass

    if config_file.is_file():
        try:
            cfg = json.loads(config_file.read_text())
            if "deviceId" in cfg:
                del cfg["deviceId"]
                config_file.write_text(json.dumps(cfg))
        except Exception:
            pass

    print("Local device credentials and configuration wiped.")
    return 0


def cmd_service(args):
    """Handle service management commands (install, start, stop, status, uninstall)."""
    action = getattr(args, "action", None)
    if action == "install":
        install_service()
        print("Service installed successfully.")
    elif action == "start":
        start_service()
        print("Service started.")
    elif action == "stop":
        stop_service()
        print("Service stopped.")
    elif action == "status":
        status = get_service_status()
        print(f"Service: {status['name']}")
        print(f"Installed: {status['installed']}")
        print(f"Active: {status['active']}")
        print(f"Status: {status['status']}")
    elif action == "uninstall":
        uninstall_service()
        print("Service uninstalled.")
    else:
        print(f"Unknown service action: {action}", file=sys.stderr)
        return 1
    return 0


def cmd_logs(args):
    """Handle logs inspection with line count and follow support."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    log_file = get_log_path(root)
    lines_count = getattr(args, "lines", 50)
    follow = getattr(args, "follow", False)

    if not log_file.is_file():
        print(f"Log file not found at {log_file}")
        return 0

    tail_file(log_file, n=lines_count, follow=follow)
    return 0


def cmd_test(args):
    """Handle offline smoke test against discovered CAD binaries."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    config_file = root / "config.json"
    cfg = json.loads(config_file.read_text()) if config_file.is_file() else {}

    target_cad = getattr(args, "cad", None)
    cads = discover(cfg.get("cadPath"), enable_autocad=True)

    candidates = [c for c in cads if c.get("executable")]
    if target_cad:
        candidates = [
            c for c in candidates if c["name"].lower() == target_cad.lower()
        ]

    if not candidates:
        print(
            "No executable CAD engine found"
            f"{' matching ' + target_cad if target_cad else ''}.",
            file=sys.stderr,
        )
        return 1

    all_passed = True
    for cad in candidates:
        print(
            f"Running smoke test on {cad['name']} ({cad['path']})...",
            flush=True,
        )
        t0 = time.time()
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "cadId": cad["id"],
            "type": "create_box",
            "length": 10.0,
            "width": 10.0,
            "height": 10.0,
            "confirmed": True,
            "expires": time.time() * 1000 + 60000,
        }
        with tempfile.TemporaryDirectory() as d:
            try:
                execute(job, [cad], d, timeout=30)
                native_ext = ".dwg" if cad["name"] == "AutoCAD" else ".FCStd"
                native_candidates = list(Path(d).glob(f"**/*{native_ext}"))
                if not native_candidates:
                    raise RuntimeError(
                        f"Native project file *{native_ext} not found in output."
                    )

                preview_candidates = list(Path(d).glob("**/preview.stl"))
                if (
                    not preview_candidates
                    or preview_candidates[0].stat().st_size <= 84
                ):
                    raise RuntimeError(
                        "Non-empty binary preview.stl not found in output."
                    )

                elapsed = round(time.time() - t0, 3)
                print(f"[PASS] {cad['name']} smoke test succeeded in {elapsed}s.")
            except Exception as exc:
                all_passed = False
                print(
                    f"[FAIL] {cad['name']} smoke test failed: {exc}",
                    file=sys.stderr,
                )

    return 0 if all_passed else 1


# ---------------------------------------------------------------------------
# Doctor & Auto-Remediation
# ---------------------------------------------------------------------------


def provision_headless_freecad():
    """Auto-provision headless FreeCAD via conda/mamba/micromamba or package manager."""
    conda_bin = (
        shutil.which("micromamba")
        or shutil.which("mamba")
        or shutil.which("conda")
    )
    env_dir = Path.home() / ".conda" / "envs" / "cadengine-freecad"

    if conda_bin:
        print(
            f"Found package manager at {conda_bin}. Creating environment at"
            f" {env_dir}..."
        )
        cmd = [
            conda_bin,
            "create",
            "-y",
            "-p",
            str(env_dir),
            "-c",
            "conda-forge",
            "freecad",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(
                f"Conda environment creation failed: {res.stderr or res.stdout}"
            )
    else:
        system = platform.system()
        if system == "Darwin" and shutil.which("brew"):
            print("Provisioning FreeCAD via Homebrew...")
            res = subprocess.run(
                ["brew", "install", "--cask", "freecad"],
                capture_output=True,
                text=True,
            )
            if res.returncode != 0:
                raise RuntimeError(
                    f"Homebrew installation failed: {res.stderr or res.stdout}"
                )
        elif system == "Linux" and shutil.which("apt-get"):
            print("Provisioning FreeCAD via apt-get...")
            res = subprocess.run(
                ["sudo", "apt-get", "update"], capture_output=True, text=True
            )
            res2 = subprocess.run(
                ["sudo", "apt-get", "install", "-y", "freecad"],
                capture_output=True,
                text=True,
            )
            if res2.returncode != 0:
                raise RuntimeError(
                    f"apt-get installation failed: {res2.stderr or res2.stdout}"
                )
        else:
            raise RuntimeError(
                "No supported package manager (conda, mamba, micromamba, brew,"
                " apt-get) available for automated FreeCAD provisioning."
            )

    conda_dir = Path.home() / ".conda"
    conda_dir.mkdir(parents=True, exist_ok=True)
    env_txt = conda_dir / "environments.txt"
    lines = (
        env_txt.read_text(encoding="utf-8").splitlines()
        if env_txt.is_file()
        else []
    )
    if str(env_dir) not in lines:
        lines.append(str(env_dir))
        env_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Registered {env_dir} in {env_txt}")


def run_doctor_checks(args, root, config_file, cfg):
    server = getattr(args, "server", None) or cfg.get("server")
    results = {}

    # 1. Network & TLS
    print("1. Checking Server & Network...")
    net_ok = False
    if server:
        try:
            u = urllib.parse.urlsplit(server)
            tls = u.scheme == "https"
            t0 = time.time()
            req = urllib.request.Request(
                f"{server}/api/health",
                headers={"User-Agent": "cadengine-doctor"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                lat = round((time.time() - t0) * 1000, 2)
                net_ok = resp.status == 200
                print(
                    f"   [OK] Server reachable at {server} ({lat}ms, TLS:"
                    f" {tls})"
                )
        except Exception as e:
            print(f"   [FAIL] Server unreachable: {e}")
    else:
        print("   [FAIL] No server configured.")
    results["network"] = net_ok

    # 2. Authentication / Credentials
    print("2. Checking Credentials...")
    auth_ok = False
    if server:
        try:
            cred = keyring.get_password(SERVICE, server)
            if cred:
                auth_ok = True
        except Exception:
            pass
        if not auth_ok:
            cred_file = root / "credential.json"
            if cred_file.is_file():
                try:
                    s = json.loads(cred_file.read_text())
                    if s.get("server") == server and s.get("credential"):
                        auth_ok = True
                except Exception:
                    pass
    if auth_ok:
        dev_id = cfg.get("deviceId", "paired")
        print(f"   [OK] Credentials verified (Device: {dev_id})")
    else:
        print("   [FAIL] Device is unpaired. Run 'cadengine pair'.")
    results["auth"] = auth_ok

    # 3. Background Service
    print("3. Checking Background Service...")
    svc = get_service_status()
    if svc["active"]:
        print(f"   [OK] Service active ({svc['name']})")
    elif svc["installed"]:
        print(f"   [WARN] Service installed but stopped ({svc['name']})")
    else:
        print(f"   [WARN] Service not installed ({svc['name']})")
    results["service"] = svc["installed"] or svc["active"]

    # 4. CAD Engine Discovery
    print("4. Checking CAD Backends...")
    cads = discover(cfg.get("cadPath"), enable_autocad=True)
    exec_cads = [c for c in cads if c.get("executable")]
    if exec_cads:
        for c in exec_cads:
            print(f"   [OK] CAD backend detected: {c['name']} at {c['path']}")
        results["cad"] = True
    else:
        print(
            "   [FAIL] No CAD backend detected (FreeCADCmd or"
            " accoreconsole.exe)."
        )
        results["cad"] = False

    return results, cads


def cmd_doctor(args):
    """Handle doctor diagnostic roadmap with --fix auto-remediation."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    config_file = root / "config.json"
    cfg = json.loads(config_file.read_text()) if config_file.is_file() else {}

    print("=== CAD Engine Doctor Diagnostics ===")
    results, _ = run_doctor_checks(args, root, config_file, cfg)

    if not results["cad"]:
        fix = getattr(args, "fix", False)
        if not fix and sys.stdin.isatty():
            try:
                choice = (
                    input("Auto-provision headless FreeCAD? [y/N]: ")
                    .strip()
                    .lower()
                )
                fix = choice in ("y", "yes")
            except Exception:
                fix = False
        if fix:
            print("\nAuto-provisioning headless FreeCAD...")
            try:
                provision_headless_freecad()
                print("Re-running doctor checks after provisioning...")
                results, _ = run_doctor_checks(args, root, config_file, cfg)
            except Exception as exc:
                print(f"[FAIL] Auto-provisioning failed: {exc}", file=sys.stderr)

    overall = all(results.values())
    if overall:
        print("\nAll doctor checks passed!")
        return 0
    else:
        print("\nSome doctor checks failed. See diagnostics above.")
        return 1


# ---------------------------------------------------------------------------
# Self-Update Command
# ---------------------------------------------------------------------------


def cmd_update(args):
    """Handle update subcommand: check GitHub release, verify SHA256, atomic replace, restart."""
    print("Checking for updates on GitHub Releases...")
    try:
        req = urllib.request.Request(
            GITHUB_RELEASES_URL,
            headers={
                "User-Agent": "cadengine-updater",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            release = json.loads(resp.read().decode())
    except Exception as exc:
        print(f"Failed to check for updates: {exc}", file=sys.stderr)
        return 1

    remote_tag = release.get("tag_name", "").lstrip("v").strip()
    if parse_semver(remote_tag) <= parse_semver(VERSION):
        print(f"cadengine is already up to date (v{VERSION}).")
        return 0

    print(f"Found new release v{remote_tag} (current: v{VERSION}).")
    assets = release.get("assets", [])

    sums_asset = next((a for a in assets if a["name"] == "SHA256SUMS.txt"), None)
    if not sums_asset:
        print("Error: Release missing SHA256SUMS.txt asset.", file=sys.stderr)
        return 1

    sys_name = platform.system().lower()
    target_asset = None
    for a in assets:
        name = a["name"].lower()
        if name == "sha256sums.txt":
            continue
        if sys_name == "windows" and (
            "windows" in name or "win64" in name or name.endswith(".exe")
        ):
            target_asset = a
            break
        elif sys_name == "darwin" and (
            "darwin" in name or "macos" in name or "osx" in name
        ):
            target_asset = a
            break
        elif sys_name == "linux" and "linux" in name:
            target_asset = a
            break

    if not target_asset:
        non_sums = [a for a in assets if a["name"] != "SHA256SUMS.txt"]
        if non_sums:
            target_asset = non_sums[0]
        else:
            print(
                "Error: No release binary found for this platform.",
                file=sys.stderr,
            )
            return 1

    print(f"Downloading {target_asset['name']}...")
    with tempfile.TemporaryDirectory() as td:
        asset_path = Path(td) / target_asset["name"]
        sums_path = Path(td) / "SHA256SUMS.txt"

        sums_req = urllib.request.Request(
            sums_asset["browser_download_url"],
            headers={"User-Agent": "cadengine-updater"},
        )
        with urllib.request.urlopen(sums_req, timeout=30) as r:
            sums_path.write_bytes(r.read())

        asset_req = urllib.request.Request(
            target_asset["browser_download_url"],
            headers={"User-Agent": "cadengine-updater"},
        )
        with urllib.request.urlopen(asset_req, timeout=60) as r:
            asset_bytes = r.read()
            asset_path.write_bytes(asset_bytes)

        computed_sha = hashlib.sha256(asset_bytes).hexdigest()
        sums_text = sums_path.read_text(encoding="utf-8")
        expected_sha = None
        for line in sums_text.splitlines():
            parts = line.strip().split()
            if len(parts) >= 2 and (
                parts[1] == target_asset["name"]
                or parts[1] == f"*{target_asset['name']}"
            ):
                expected_sha = parts[0]
                break

        if not expected_sha or computed_sha.lower() != expected_sha.lower():
            print(
                "Error: SHA-256 verification failed"
                f" (computed {computed_sha}, expected {expected_sha}).",
                file=sys.stderr,
            )
            return 1

        print("SHA-256 verified successfully.")

        target_bin = Path(get_agent_executable())
        temp_bin = target_bin.parent / (target_bin.name + ".new")
        temp_bin.write_bytes(asset_bytes)
        try:
            temp_bin.chmod(0o755)
        except Exception:
            pass
        os.replace(temp_bin, target_bin)
        print(f"Replaced binary at {target_bin}")

        try:
            restart_service()
            print("Restarted background service.")
        except Exception as e:
            print(f"Note: Background service restart skipped or failed: {e}")

    print(f"Successfully updated to v{remote_tag}")
    return 0


# ---------------------------------------------------------------------------
# Default Foreground Polling Loop
# ---------------------------------------------------------------------------


def run_foreground_loop(args):
    """Legacy foreground loop connecting to server, pairing if needed, and polling."""
    root = Path(user_data_dir(SERVICE, appauthor=False))
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    setup_logging(root)
    config_file = root / "config.json"
    config = json.loads(config_file.read_text()) if config_file.exists() else {}
    value = getattr(args, "server", None) or config.get("server")
    if not value:
        try:
            import tkinter as tk
            from tkinter.simpledialog import askstring

            window = tk.Tk()
            window.withdraw()
            value = askstring(
                "Connect CAD Agent Designer",
                "Your CAD Agent Designer server URL (https://…):",
            )
            window.destroy()
        except Exception:
            value = input(
                "CAD Agent Designer server URL (https://…): "
            ).strip()
    if not value:
        return 0
    server = server_url(value)
    manual = getattr(args, "cad_path", None) or config.get("cadPath")
    config["server"] = server
    if manual:
        config["cadPath"] = manual
    config_file.write_text(json.dumps(config))
    cads = discover(
        manual, enable_autocad=getattr(args, "enable_autocad", False)
    )
    file = root / "credential.json"
    credential = None
    use_file = False
    try:
        if getattr(args, "pair", False):
            try:
                keyring.delete_password(SERVICE, server)
            except keyring.errors.PasswordDeleteError:
                pass
        else:
            credential = keyring.get_password(SERVICE, server)
    except keyring.errors.KeyringError:
        if not getattr(args, "allow_file_credentials", False):
            raise RuntimeError(
                "OS keyring unavailable. Configure a keyring, or explicitly"
                " use --allow-file-credentials on a trusted single-user host."
            )
        if os.name == "nt":
            raise RuntimeError(
                "File credential fallback is disabled on Windows; configure"
                " Windows Credential Manager."
            )
        use_file = True
        if file.exists() and not getattr(args, "pair", False):
            if file.stat().st_mode & 0o077:
                raise RuntimeError(
                    "Credential file must be readable only by its owner (chmod"
                    " 600)"
                )
            saved = json.loads(file.read_text())
            if saved["server"] == server:
                credential = saved["credential"]
    if not credential:
        pair = request(
            server,
            "/api/pairings",
            {"name": platform.node()[:80] or "CAD computer", "cads": cads},
        )
        print("Open " + server + "/pair")
        print("Confirm this pairing code: " + pair["userCode"], flush=True)
        if not getattr(args, "headless", False):
            webbrowser.open(server + "/pair")
            if platform.system() == "Darwin" and getattr(sys, "frozen", False):
                try:
                    import tkinter as tk
                    from tkinter.messagebox import showinfo

                    window = tk.Tk()
                    window.withdraw()
                    showinfo(
                        "Link this CAD computer",
                        "Open "
                        + server
                        + "/pair\n\nPairing code: "
                        + pair["userCode"]
                        + "\n\nEnter this code in the dashboard, then click OK"
                        " here.",
                    )
                    window.destroy()
                except Exception:
                    pass
        for _ in range(120):
            time.sleep(5)
            state = request(
                server,
                "/api/pairings/poll",
                {"deviceSecret": pair["deviceSecret"]},
            )
            if not state["pending"]:
                credential = state["credential"]
                config["deviceId"] = state["deviceId"]
                config_file.write_text(json.dumps(config))
                if use_file:
                    fd = os.open(
                        file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
                    )
                    with os.fdopen(fd, "w") as stream:
                        json.dump(
                            {"server": server, "credential": credential}, stream
                        )
                else:
                    keyring.set_password(SERVICE, server, credential)
                open_connect_step(
                    server, state["deviceId"], getattr(args, "headless", False)
                )
                break
        if not credential:
            raise RuntimeError(
                "Pairing expired. Restart the agent to try again."
            )

    (root / "jobs").mkdir(mode=0o700, exist_ok=True)
    print(
        "Connected. Keep this agent running. Press Ctrl+C to stop.", flush=True
    )
    allowed_roots: list[str] = []
    while True:
        try:
            state = request(
                server, "/api/agent/poll", {"cads": cads}, credential
            )
            allowed_roots = state.get("allowedRoots", [])
            if state["job"]:
                ok, result = run_job(
                    state["job"],
                    cads,
                    root,
                    server,
                    credential,
                    allowed_roots=allowed_roots,
                )
                request(
                    server,
                    "/api/agent/results/" + state["job"]["id"],
                    {"ok": ok, "result": result[:16000]},
                    credential,
                )
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise RuntimeError(
                    "Device access revoked or invalid. Stop and re-pair"
                    " explicitly."
                ) from exc
            print(
                "Server unavailable. No local operation will be replayed.",
                flush=True,
            )
        except (urllib.error.URLError, TimeoutError):
            print(
                "Connection lost. Waiting to reconnect; jobs are not"
                " replayed.",
                flush=True,
            )
        time.sleep(5)


# ---------------------------------------------------------------------------
# CLI Argument Parser & Entry Point
# ---------------------------------------------------------------------------


def create_parser():
    """Create and return the top-level CLI argument parser with subparsers."""
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument("--server", default=argparse.SUPPRESS, help="CAD Agent Designer HTTPS server origin")
    parent_parser.add_argument("--cad-path", default=argparse.SUPPRESS, help="Manual FreeCADCmd or AutoCAD executable path")
    parent_parser.add_argument("--enable-autocad", action="store_true", default=argparse.SUPPRESS,
                               help="Opt in to running full AutoCAD via Core Console (accoreconsole.exe)")

    parser = argparse.ArgumentParser(
        prog="cadengine",
        parents=[parent_parser],
        description="Connect this CAD computer to your CAD Agent Designer server.",
    )
    parser.add_argument("--version", action="store_true", help="Show cadengine version")
    parser.add_argument("--headless", action="store_true", help="Print pairing URL instead of opening a browser")
    parser.add_argument("--allow-file-credentials", action="store_true", help="Explicitly allow owner-only file storage when no OS keyring exists")
    parser.add_argument("--pair", action="store_true", help="Discard saved credential and pair again")

    subparsers = parser.add_subparsers(dest="subcommand")

    # status
    p_status = subparsers.add_parser("status", parents=[parent_parser], help="Inspect local environment, server reachability, credentials, CADs, and service")
    p_status.add_argument("--json", action="store_true", help="Emit raw JSON")

    # version
    p_version = subparsers.add_parser("version", help="Show version and check for updates")
    p_version.add_argument("--check", action="store_true", help="Check GitHub Releases for newer version")

    # pair
    p_pair = subparsers.add_parser("pair", parents=[parent_parser], help="Pair this workstation with the server")
    p_pair.add_argument("--headless", action="store_true", help="Headless pairing flow")
    p_pair.add_argument("--allow-file-credentials", action="store_true", help="Allow fallback file credentials")

    # unpair
    p_unpair = subparsers.add_parser("unpair", parents=[parent_parser], help="Revoke device on server and purge local credentials")
    p_unpair.add_argument("--force", action="store_true", help="Force unpair locally even if server is offline")

    # service
    p_service = subparsers.add_parser("service", help="Manage background daemon service")
    p_service.add_argument("action", choices=["install", "start", "stop", "status", "uninstall"], help="Service action")

    # logs
    p_logs = subparsers.add_parser("logs", help="View or follow agent logs")
    p_logs.add_argument("-n", "--lines", type=int, default=50, help="Number of lines to output")
    p_logs.add_argument("-f", "--follow", action="store_true", help="Follow log entries in real time")

    # test
    p_test = subparsers.add_parser("test", help="Run local offline CAD smoke test")
    p_test.add_argument("--cad", choices=["freecad", "autocad"], type=str.lower, help="Specific CAD engine to test")

    # doctor
    p_doctor = subparsers.add_parser("doctor", parents=[parent_parser], help="Run end-to-end diagnostic roadmap")
    p_doctor.add_argument("--fix", action="store_true", help="Auto-remediate missing dependencies (e.g. provision headless FreeCAD)")

    # update
    subparsers.add_parser("update", help="Update cadengine to latest GitHub release")

    return parser


def main(argv=None):
    if argv is None:
        argv = sys.argv[1:]

    parser = create_parser()
    args = parser.parse_args(argv)

    if getattr(args, "version", False) and not args.subcommand:
        print(f"cadengine v{VERSION}")
        return 0

    if args.subcommand == "status":
        return cmd_status(args)
    elif args.subcommand == "version":
        return cmd_version(args)
    elif args.subcommand == "pair":
        return cmd_pair(args)
    elif args.subcommand == "unpair":
        return cmd_unpair(args)
    elif args.subcommand == "service":
        return cmd_service(args)
    elif args.subcommand == "logs":
        return cmd_logs(args)
    elif args.subcommand == "test":
        return cmd_test(args)
    elif args.subcommand == "doctor":
        return cmd_doctor(args)
    elif args.subcommand == "update":
        return cmd_update(args)

    # Subcommand is None: execute backward-compatible foreground loop
    return run_foreground_loop(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        pass
