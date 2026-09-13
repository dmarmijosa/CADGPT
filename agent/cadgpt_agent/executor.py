"""Fixed allowlisted jobs; no shell, arbitrary Python, or caller-controlled paths."""
import json
import math
import os
from pathlib import Path
import subprocess
import threading
import time
import uuid

from .strategies.freecad import FreeCadStrategy

# Keyed by cad["name"]; extended with an AutoCAD strategy in a later slice.
STRATEGIES = {"FreeCAD": FreeCadStrategy()}

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

def resolve_document_dir(root, document_id):
    """Validate `document_id` and return its containment-checked directory, or None.

    Rejects anything that is not a canonical UUID (round-trip through
    `uuid.UUID`), and rejects any path — including one reached only through a
    symlink — that resolves outside `root`. No directory is created here.
    """
    if document_id is None:
        return None
    if not isinstance(document_id, str) or str(uuid.UUID(document_id)) != document_id:
        raise ValueError("Invalid document identifier")
    root_resolved = Path(root).resolve()
    doc_dir = root_resolved / "documents" / document_id
    if not doc_dir.resolve().is_relative_to(root_resolved):
        raise ValueError("Document path escapes the allowed root")
    return doc_dir

def execute(job, cads, root):
    validate(job)
    cad = next((c for c in cads if c["id"] == job["cadId"] and c["name"] == "FreeCAD" and c["executable"]), None)
    if not cad:
        raise ValueError("Compatible FreeCAD command-line executable not found")
    strategy = STRATEGIES.get(cad["name"])
    if strategy is None:
        raise ValueError("No execution strategy registered for this CAD")
    op = job.get("type") or "create_box"
    if not strategy.supports(op):
        raise ValueError("Unsupported operation for this CAD strategy")
    # Reject a malformed or path-shaped document_id before any directory or subprocess exists.
    doc_dir = resolve_document_dir(root, job.get("documentId"))
    directory = Path(root) / job["id"]
    # Exclusive creation provides local replay protection, including after a crash.
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    if doc_dir is not None:
        doc_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    request = directory / "request.json"
    request.write_text(json.dumps({k: job[k] for k in ("length", "width", "height")}), encoding="utf-8")
    base_env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH")}
    base_env["CADGPT_JOB_DIR"] = str(directory.resolve())
    if doc_dir is not None:
        base_env["CADGPT_DOC_DIR"] = str(doc_dir.resolve())
    environment = strategy.env(base_env)
    argv = strategy.build_argv(Path(cad["path"]), directory, doc_dir)
    # Drain output continuously while retaining only 4 KB. No unbounded PIPE capture.
    process = subprocess.Popen(argv, cwd=directory, env=environment,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False)
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
    artifacts = strategy.artifacts(op, directory, doc_dir)
    output = artifacts["native"]
    if code != 0 or not output.is_file():
        raise RuntimeError("FreeCAD failed to create the document. Check local installation compatibility.")
    return "Created " + str(output) + ". CAD files remain on this device."
