"""Fixed allowlisted jobs; no shell, arbitrary Python, or caller-controlled paths."""
import json
import math
import os
from pathlib import Path
import subprocess
import time
import uuid

def validate(job):
    if str(uuid.UUID(job["id"])) != job["id"]:
        raise ValueError("Invalid job identifier")
    if job["expires"] <= time.time() * 1000:
        raise ValueError("Job expired")
    for key in ("length", "width", "height"):
        n = job[key]
        if isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not 0 < n <= 10000:
            raise ValueError("Dimensions must be finite and between 0 and 10000 mm")
    if job.get("confirmed") is not True:
        raise ValueError("Explicit confirmation required")

def execute(job, cads, root):
    validate(job)
    cad = next((c for c in cads if c["id"] == job["cadId"] and c["name"] == "FreeCAD" and c["executable"]), None)
    if not cad:
        raise ValueError("Compatible FreeCAD command-line executable not found")
    directory = Path(root) / job["id"]
    # Exclusive creation provides local replay protection, including after a crash.
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    request = directory / "request.json"
    request.write_text(json.dumps({k: job[k] for k in ("length", "width", "height")}), encoding="utf-8")
    worker = Path(__file__).with_name("freecad_worker.py")
    environment = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH")}
    environment["CADGPT_JOB_DIR"] = str(directory.resolve())
    environment["QT_QPA_PLATFORM"] = "offscreen"
    # Drain output continuously while retaining only 4 KB. No unbounded PIPE capture.
    process = subprocess.Popen([cad["path"], str(worker)], cwd=directory, env=environment,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False)
    import threading
    tail = bytearray()
    def drain():
        while True:
            chunk = process.stdout.read(1024)
            if not chunk:
                break
            tail.extend(chunk)
            if len(tail) > 4000:
                del tail[:-4000]
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        code = process.wait(timeout=120)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        raise RuntimeError("FreeCAD exceeded the 120-second execution limit")
    finally:
        reader.join(timeout=5)
        process.stdout.close()
    output = directory / "box.FCStd"
    if code != 0 or not output.is_file():
        raise RuntimeError("FreeCAD failed to create the document. Check local installation compatibility.")
    return "Created " + str(output) + ". CAD files remain on this device."
