"""Fixed allowlisted jobs; no shell, arbitrary Python, or caller-controlled paths."""
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import uuid

from .strategies.autocad import AutoCadStrategy
from .strategies.blender import BlenderStrategy
from .strategies.freecad import FreeCadStrategy

# Keyed by cad["name"].
STRATEGIES = {"FreeCAD": FreeCadStrategy(), "AutoCAD": AutoCadStrategy(), "Blender": BlenderStrategy()}

# Mirrors the server-side re-enforcement in `apps/api/src/tools.ts`.
SCENE_CAP_BYTES = 12_000

def _cap_scene(scene):
    """Drop trailing scene entries once the JSON-encoded prefix would exceed
    the ≤12 kB contract (design "MCP Tool Catalog")."""
    kept = []
    size = 2  # "[]"
    for entry in scene:
        chunk_size = len(json.dumps(entry).encode("utf-8")) + 1
        if size + chunk_size > SCENE_CAP_BYTES:
            break
        size += chunk_size
        kept.append(entry)
    return kept, len(kept) < len(scene)

def _decode_tail(tail, cad_kind):
    """Decode a captured stdout/stderr tail for inclusion in an error message.

    AutoCAD Core Console emits UTF-16LE on stdout (a documented quirk); every
    other CAD strategy in this codebase emits plain UTF-8/ASCII. `errors`
    stays `"replace"` either way so a decode mismatch never raises.
    """
    encoding = "utf-16-le" if cad_kind == "AutoCAD" else "utf-8"
    return bytes(tail).decode(encoding, errors="replace").strip()

def validate(job):
    if str(uuid.UUID(job["id"])) != job["id"]:
        raise ValueError("Invalid job identifier")
    if job["expires"] <= time.time() * 1000:
        raise ValueError("Job expired")
    # Only the legacy/default op has agent-level dimension bounds here; every
    # other op's params are re-validated inside the FreeCAD worker itself
    # (before any FreeCAD call), since the worker is the one that understands
    # each op's own parameter shape.
    op = job.get("type") or "create_box"
    if op == "create_box":
        for key in ("length", "width", "height"):
            n = job[key]
            if isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not 0 < n <= 10000:
                raise ValueError("Dimensions must be finite and between 0 and 10000 mm")
    if op == "analyze_image_to_cad":
        if job.get("create_solid") is True:
            if job.get("confirmed") is not True:
                raise ValueError("Explicit confirmation required")
            depth = job.get("depth")
            if isinstance(depth, bool) or not isinstance(depth, (int, float)) or not math.isfinite(depth) or not 0 < depth <= 10000:
                raise ValueError("depth must be finite and between 0 and 10000 mm when create_solid is true")
    else:
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

def resolve_external_path(requested: str, allowed_roots: list[str]) -> Path:
    """Validate `requested` path against `allowed_roots` and return its canonical Path.

    Parallel to and independent from `resolve_document_dir`.
    Canonicalizes the caller-supplied path, resolves symlinks and junctions via
    `.resolve()`, normalizes Windows UNC and drive-relative forms, and authorizes
    it only when the fully resolved path is inside at least one currently-allowlisted
    root. Rejects symlink/junction escapes, `..` traversals, NUL bytes, UNC paths
    outside the allowlist, drive-relative paths outside the allowlist, and paths
    outside every allowlisted root.
    """
    if not requested or not isinstance(requested, str):
        raise ValueError("Invalid path")
    if "\0" in requested:
        raise ValueError("Path contains NUL byte")
    if not allowed_roots:
        raise ValueError("Path outside allowed roots")

    # Normalize UNC backslashes to forward slashes for cross-platform consistency
    norm_requested = requested.replace("\\", "/") if requested.startswith(r"\\") else requested
    target = Path(norm_requested).resolve()

    for root_str in allowed_roots:
        if not root_str or not isinstance(root_str, str):
            continue
        if "\0" in root_str:
            continue
        norm_root = root_str.replace("\\", "/") if root_str.startswith(r"\\") else root_str
        root_resolved = Path(norm_root).resolve()
        try:
            if target.is_relative_to(root_resolved):
                return target
        except (ValueError, AttributeError):
            continue

    raise ValueError("Path outside allowed roots")

def execute(job, cads, root, allowed_roots=None, timeout=120):
    validate(job)
    # Selection is CAD-neutral: pick the entry matching `cadId` that is
    # marked executable AND has a registered strategy for its `name`. An
    # AutoCAD entry with `executable=False` (D12: no `--enable-autocad`) is
    # unreachable here regardless of what `AutoCadStrategy.supports()` says.
    cad = next((c for c in cads if c["id"] == job["cadId"] and c["executable"] and c["name"] in STRATEGIES), None)
    if not cad:
        raise ValueError("Compatible CAD executable not found")
    strategy = STRATEGIES[cad["name"]]
    op = job.get("type") or "create_box"
    if not strategy.supports(op):
        raise ValueError("Unsupported operation for this CAD strategy")

    # Native path handling (P1.3): when the job targets an existing file,
    # resolve and verify containment against allowed_roots, then create a
    # timestamped sibling backup before any write.
    native_path_raw = job.get("native_path") or job.get("nativePath") or job.get("path")
    contained_path = None
    backup_path = None
    if native_path_raw:
        contained_path = resolve_external_path(native_path_raw, allowed_roots or [])
        if contained_path.is_file():
            ts = int(time.time())
            backup_path = contained_path.parent / f"{contained_path.name}.{ts}.bak"
            counter = 1
            while backup_path.exists():
                backup_path = contained_path.parent / f"{contained_path.name}.{ts}_{counter}.bak"
                counter += 1
            shutil.copy2(contained_path, backup_path)

    # Reject a malformed or path-shaped document_id before any directory or subprocess exists.
    doc_dir = resolve_document_dir(root, job.get("documentId"))
    # Job scratch directories live under `<root>/jobs/<job_id>` -- a clean
    # top-level sibling of `<root>/documents/<document_id>` (see
    # `resolve_document_dir`), never loose directly in `root`.
    directory = Path(root) / "jobs" / job["id"]
    # `parents=True` creates `<root>/jobs` on first use; exclusive creation of
    # the leaf directory still provides local replay protection, including
    # after a crash.
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    if doc_dir is not None:
        doc_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    request = directory / "request.json"
    if op == "analyze_image_to_cad":
        from .vision import process_image
        image_base64 = job.get("image_base64")
        if not image_base64 or not isinstance(image_base64, str):
            raise ValueError("image_base64 is required for analyze_image_to_cad")
        vision_result = process_image(
            image_base64=image_base64,
            threshold_mode=job.get("threshold_mode", "otsu"),
            invert=bool(job.get("invert", False)),
            tolerance=float(job.get("tolerance", 0.0025)),
            reference_dimension=job.get("reference_dimension"),
        )
        if not bool(job.get("create_solid", False)):
            inspection_path = directory / "inspection.json"
            inspection_path.write_text(json.dumps(vision_result), encoding="utf-8")
            return json.dumps(vision_result)

        worker_op = "extrude_polygon"
        extrude_params = {
            "op": worker_op,
            "document_id": job.get("documentId"),
            "name": job.get("name", "ImageToCad"),
            "points": vision_result["outer_boundary"],
            "holes": vision_result["holes"],
            "depth": job["depth"],
            "plane": job.get("plane", "XY"),
        }
        if job.get("position") is not None:
            extrude_params["position"] = job["position"]
        if contained_path is not None:
            extrude_params["native_path"] = str(contained_path)
        request.write_text(json.dumps(extrude_params), encoding="utf-8")
    else:
        worker_op = op
        # request.json carries the op discriminator plus every non-envelope job
        # field as-is; the worker re-validates each value before touching FreeCAD.
        # No path ever crosses this boundary: only the UUID document_id does.
        envelope_keys = {"id", "cadId", "expires", "confirmed", "type", "documentId", "deviceId"}
        params = {k: v for k, v in job.items() if k not in envelope_keys}
        if contained_path is not None:
            params["native_path"] = str(contained_path)
        request.write_text(json.dumps({"op": op, "document_id": job.get("documentId"), **params}), encoding="utf-8")
    base_env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH")}
    base_env["CADGPT_JOB_DIR"] = str(directory.resolve())
    if doc_dir is not None:
        base_env["CADGPT_DOC_DIR"] = str(doc_dir.resolve())
    if contained_path is not None:
        base_env["CADGPT_NATIVE_PATH"] = str(contained_path.resolve())
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
            if len(tail) > 4096:
                del tail[:-4096]
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        code = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        if backup_path and backup_path.is_file() and contained_path:
            shutil.copy2(backup_path, contained_path)
        raise RuntimeError("The CAD engine exceeded the 120-second execution limit")
    finally:
        reader.join(timeout=5)
        process.stdout.close()
    artifacts = strategy.artifacts(worker_op, directory, doc_dir)
    output = contained_path if contained_path else artifacts["native"]
    if code != 0 or not output.is_file():
        if backup_path and backup_path.is_file() and contained_path:
            shutil.copy2(backup_path, contained_path)
        detail = _decode_tail(tail, cad["name"])[-500:]
        message = "The CAD engine failed to create the document. Check local installation compatibility."
        raise RuntimeError(message + (" " + detail if detail else ""))
    scene_path = artifacts.get("scene")
    if scene_path is not None and scene_path.is_file():
        scene, truncated = _cap_scene(json.loads(scene_path.read_text(encoding="utf-8")))
        payload = {"message": "Read scene from " + str(output) + ".", "scene": scene}
        if truncated:
            payload["truncated"] = True
        return json.dumps(payload)
    if op == "export_design":
        export_path = (doc_dir or directory) / ("export." + str(job.get("format")))
        if not export_path.is_file():
            raise RuntimeError("The CAD engine failed to export the design.")
        size = export_path.stat().st_size
        return "Exported " + export_path.name + " (" + str(size) + " bytes). CAD files remain on this device."
    return "Created " + str(output) + ". CAD files remain on this device."
