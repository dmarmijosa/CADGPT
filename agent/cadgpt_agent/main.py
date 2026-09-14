"""Foreground agent: pair once, then poll while the user keeps it running."""
import argparse
import json
import os
from pathlib import Path
import platform
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import keyring
from platformdirs import user_data_dir
from .discovery import discover
from .executor import execute
from .upload import upload_mesh

SERVICE = "CADGPT"
MAX_RESPONSE = 65536

def server_url(value):
    u = urllib.parse.urlsplit(value)
    if u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise ValueError("Use a server origin, without credentials, path, query, or fragment")
    if u.scheme != "https" and not (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")):
        raise ValueError("HTTPS is required except for loopback development")
    return value.rstrip("/")

def request(server, route, payload, credential=None):
    headers = {"Content-Type": "application/json"}
    if credential:
        headers["Authorization"] = "Bearer " + credential
    req = urllib.request.Request(server + route, data=json.dumps(payload).encode(), headers=headers, method="POST")
    # Refuse redirects so credentials cannot be forwarded to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
        raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise ValueError("Server response exceeds limit")
        return json.loads(raw)

def _note_preview_unavailable(result, exc):
    """Append a "preview unavailable" note without flipping the job's own
    success. Merges into the JSON `{message, ...}` shape when present
    (design "main.py uploads mesh first ... upload failure is reported as
    ok=True with a preview unavailable note")."""
    note = "preview unavailable (upload failed: " + type(exc).__name__ + ")"
    try:
        payload = json.loads(result)
    except (TypeError, ValueError):
        payload = None
    if isinstance(payload, dict) and "message" in payload:
        payload["message"] = payload["message"] + " " + note
        return json.dumps(payload)
    return result + " " + note

def run_job(job, cads, jobs, server, credential, upload=upload_mesh):
    """Execute one job, then upload its STL preview (if the worker produced
    one) before returning the result the caller posts to the server.

    A mesh upload failure never flips a successful job to `ok=False`: it only
    appends a "preview unavailable" note, since the design (native FCStd/DWG)
    exists locally regardless of upload outcome.
    """
    try:
        result = execute(job, cads, jobs)
    except Exception as exc:
        return False, str(exc)[:4000]
    preview = jobs / job["id"] / "preview.stl"
    if preview.is_file():
        try:
            upload(server, job["id"], credential, preview)
        except Exception as exc:
            print("Preview upload failed: " + type(exc).__name__, flush=True)
            result = _note_preview_unavailable(result, exc)
    return True, result

def main():
    parser = argparse.ArgumentParser(description="Connect this CAD computer to your CADGPT server.")
    parser.add_argument("--server", help="CADGPT HTTPS server origin")
    parser.add_argument("--cad-path", help="Manual FreeCADCmd or AutoCAD executable path")
    parser.add_argument("--headless", action="store_true", help="Print pairing URL instead of opening a browser")
    parser.add_argument("--allow-file-credentials", action="store_true", help="Explicitly allow owner-only file storage when no OS keyring exists")
    parser.add_argument("--pair", action="store_true", help="Discard saved credential and pair again")
    args = parser.parse_args()
    root = Path(user_data_dir("CADGPT", appauthor=False))
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    config_file = root / "config.json"
    config = json.loads(config_file.read_text()) if config_file.exists() else {}
    value = args.server or config.get("server")
    if not value:
        try:
            import tkinter as tk
            from tkinter.simpledialog import askstring
            window = tk.Tk()
            window.withdraw()
            value = askstring("Connect CADGPT", "Your CADGPT server URL (https://…):")
            window.destroy()
        except Exception:
            value = input("CADGPT server URL (https://…): ").strip()
    if not value:
        return
    server = server_url(value)
    manual = args.cad_path or config.get("cadPath")
    config_file.write_text(json.dumps({"server": server, "cadPath": manual}))
    cads = discover(manual)
    file = root / "credential.json"
    credential = None
    use_file = False
    try:
        if args.pair:
            try:
                keyring.delete_password(SERVICE, server)
            except keyring.errors.PasswordDeleteError:
                pass
        else:
            credential = keyring.get_password(SERVICE, server)
    except keyring.errors.KeyringError:
        if not args.allow_file_credentials:
            raise RuntimeError("OS keyring unavailable. Configure a keyring, or explicitly use --allow-file-credentials on a trusted single-user host.")
        if os.name == "nt":
            raise RuntimeError("File credential fallback is disabled on Windows; configure Windows Credential Manager.")
        use_file = True
        if file.exists() and not args.pair:
            if file.stat().st_mode & 0o077:
                raise RuntimeError("Credential file must be readable only by its owner (chmod 600)")
            saved = json.loads(file.read_text())
            if saved["server"] == server:
                credential = saved["credential"]
    if not credential:
        pair = request(server, "/api/pairings", {"name": platform.node()[:80] or "CAD computer", "cads": cads})
        print("Open " + server + "/pair")
        print("Confirm this pairing code: " + pair["userCode"], flush=True)
        if not args.headless:
            webbrowser.open(server + "/pair")
            if platform.system() == "Darwin" and getattr(__import__("sys"), "frozen", False):
                import tkinter as tk
                from tkinter.messagebox import showinfo
                window = tk.Tk()
                window.withdraw()
                showinfo("Link this CAD computer", "Open " + server + "/pair\n\nPairing code: " + pair["userCode"] + "\n\nEnter this code in the dashboard, then click OK here.")
                window.destroy()
        for _ in range(120):
            time.sleep(5)
            state = request(server, "/api/pairings/poll", {"deviceSecret": pair["deviceSecret"]})
            if not state["pending"]:
                credential = state["credential"]
                if use_file:
                    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                    with os.fdopen(fd, "w") as stream:
                        json.dump({"server": server, "credential": credential}, stream)
                else:
                    keyring.set_password(SERVICE, server, credential)
                break
        if not credential:
            raise RuntimeError("Pairing expired. Restart the agent to try again.")
    jobs = root / "jobs"
    jobs.mkdir(mode=0o700, exist_ok=True)
    print("Connected. Keep this agent running. Press Ctrl+C to stop.", flush=True)
    while True:
        try:
            state = request(server, "/api/agent/poll", {"cads": cads}, credential)
            if state["job"]:
                ok, result = run_job(state["job"], cads, jobs, server, credential)
                # 16000 matches the server's `/api/agent/results/:id` cap and
                # must not cut a JSON-wrapped `{message, scene}` payload in half.
                request(server, "/api/agent/results/" + state["job"]["id"], {"ok": ok, "result": result[:16000]}, credential)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise RuntimeError("Device access revoked or invalid. Stop and re-pair explicitly.") from exc
            print("Server unavailable. No local operation will be replayed.", flush=True)
        except (urllib.error.URLError, TimeoutError):
            print("Connection lost. Waiting to reconnect; jobs are not replayed.", flush=True)
        time.sleep(5)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
