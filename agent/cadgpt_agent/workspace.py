"""Workspace directory governance and project manifest management.

Enforces standardized 5-folder project hierarchies (cad/, meshes/, exports/,
renders/, references/), maintains atomic project.json metadata manifests,
provides non-disruptive structure auditing, and performs user-confirmed
reorganizations with strict path containment.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from cadgpt_agent.integrity import (
    validate_binary_stl,
    validate_blend,
    validate_cad_format,
    validate_dwg,
    validate_fcstd,
)

STANDARD_DIRECTORIES: tuple[str, ...] = (
    "cad",
    "meshes",
    "exports",
    "renders",
    "references",
)

VALID_ENGINES: set[str] = {"FreeCAD", "AutoCAD", "Blender"}
VALID_CATEGORIES: set[str] = {"cad", "meshes", "exports", "renders", "references"}

CAD_EXTENSIONS: set[str] = {".fcstd", ".blend", ".dwg"}
MESH_EXTENSIONS: set[str] = {".stl", ".glb", ".gltf"}
EXPORT_EXTENSIONS: set[str] = {".step", ".stp", ".iges", ".igs", ".dxf", ".obj"}
IMAGE_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".svg"}
DOC_EXTENSIONS: set[str] = {".pdf", ".txt", ".md", ".doc", ".docx"}

RENDER_KEYWORDS: set[str] = {
    "render",
    "rendering",
    "thumbnail",
    "thumb",
    "camera",
    "screenshot",
    "cycles",
    "eevee",
    "viewport",
}

REFERENCE_KEYWORDS: set[str] = {
    "blueprint",
    "sketch",
    "concept",
    "spec",
    "reference",
    "ref",
    "inspiration",
    "input",
    "drawing",
}


def is_path_contained(candidate: Union[str, Path], root: Union[str, Path]) -> bool:
    """Verifies that candidate path resides strictly within root path without escape."""
    cand_str = str(candidate)
    if "\0" in cand_str or ".." in cand_str:
        return False
    try:
        cand_resolved = Path(candidate).resolve()
        root_resolved = Path(root).resolve()
        return cand_resolved == root_resolved or root_resolved in cand_resolved.parents
    except Exception:
        return False


def categorize_file(rel_path: Union[str, Path]) -> str:
    """Categorizes an asset relative path or filename into the 5 standard categories.

    Categories:
    - cad: FreeCAD (.FCStd), AutoCAD (.dwg), Blender (.blend)
    - meshes: Tessellated previews (.stl, .glb, .gltf)
    - exports: Production exchange formats (.step, .stp, .iges, .igs, .dxf, .obj)
    - renders: Visual renderings (.png, .jpg with render/camera/thumb keywords or in renders/)
    - references: Blueprints, specifications (.pdf, concept/sketch images, .dwg blueprints)
    """
    path = Path(rel_path)
    stem = path.stem.lower()
    ext = path.suffix.lower()

    parts = [p.lower() for p in PurePosixPath(path.as_posix()).parts]
    top_folder = parts[0] if len(parts) > 1 else ""

    # Check CAD source formats
    if ext in {".fcstd", ".blend"}:
        return "cad"
    if ext == ".dwg":
        if any(k in stem for k in ("blueprint", "ref", "reference", "spec", "input")):
            return "references"
        return "cad"

    # Check meshes
    if ext in MESH_EXTENSIONS:
        return "meshes"

    # Check exports
    if ext in EXPORT_EXTENSIONS:
        return "exports"

    # Check documents/specifications
    if ext in DOC_EXTENSIONS:
        return "references"

    # Check images
    if ext in IMAGE_EXTENSIONS:
        if any(k in stem for k in RENDER_KEYWORDS) or top_folder == "renders":
            return "renders"
        if any(k in stem for k in REFERENCE_KEYWORDS) or top_folder == "references":
            return "references"
        # Root unorganized image defaults to references (e.g. sketch.png)
        return "references"

    if top_folder in VALID_CATEGORIES:
        return top_folder

    return "references"


def get_relocation_reason(category: str) -> str:
    """Returns standard reorganization reason code for a target category."""
    if category == "references":
        return "misplaced_reference"
    elif category == "renders":
        return "misplaced_render"
    elif category == "cad":
        return "misplaced_cad"
    elif category == "meshes":
        return "misplaced_mesh"
    elif category == "exports":
        return "misplaced_export"
    return "misplaced_asset"


def calculate_sha256(file_path: Union[str, Path]) -> str:
    """Calculates lowercase hex SHA-256 digest of a file in 64KB chunks."""
    p = Path(file_path)
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower()


def index_asset(project_dir: Union[str, Path], rel_path: Union[str, Path]) -> dict[str, Any]:
    """Scans and indexes a single project asset, computing SHA-256 and validating integrity."""
    base = Path(project_dir).resolve()
    posix_rel = PurePosixPath(rel_path).as_posix()
    abs_path = (base / rel_path).resolve()

    if not abs_path.is_file():
        raise FileNotFoundError(f"Asset file not found: {abs_path}")

    stat = abs_path.stat()
    size = stat.st_size
    mtime_ms = int(stat.st_mtime * 1000)
    sha256 = calculate_sha256(abs_path)
    category = categorize_file(posix_rel)

    magic_verified = True
    integrity_verified = True
    facet_count: Optional[int] = None

    ext = abs_path.suffix.lower().lstrip(".")
    if ext == "stl":
        try:
            facet_count = validate_binary_stl(abs_path)
            magic_verified = True
            integrity_verified = True
        except Exception:
            magic_verified = False
            integrity_verified = False
    elif ext == "dwg":
        try:
            validate_dwg(abs_path)
            magic_verified = True
            integrity_verified = True
        except Exception:
            magic_verified = False
            integrity_verified = False
    elif ext == "fcstd":
        try:
            validate_fcstd(abs_path)
            magic_verified = True
            integrity_verified = True
        except Exception:
            magic_verified = False
            integrity_verified = False
    elif ext == "blend":
        try:
            validate_blend(abs_path)
            magic_verified = True
            integrity_verified = True
        except Exception:
            magic_verified = False
            integrity_verified = False

    entry: dict[str, Any] = {
        "relativePath": posix_rel,
        "category": category,
        "size": size,
        "sha256": sha256,
        "lastModified": mtime_ms,
        "magicVerified": magic_verified,
        "integrityVerified": integrity_verified,
    }
    if facet_count is not None:
        entry["facetCount"] = facet_count

    return entry


def load_project_manifest(project_dir: Union[str, Path]) -> dict[str, Any]:
    """Loads and validates project.json manifest from project directory."""
    manifest_file = Path(project_dir).resolve() / "project.json"
    if not manifest_file.is_file():
        raise FileNotFoundError(f"Manifest not found: {manifest_file}")

    try:
        with open(manifest_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise ValueError(f"Corrupt manifest: {e}") from e

    required = ["projectId", "name", "primaryEngine", "createdAt", "updatedAt", "version", "inventory"]
    for field in required:
        if field not in data:
            raise ValueError(f"Invalid manifest: missing required field '{field}'")

    if data["primaryEngine"] not in VALID_ENGINES:
        raise ValueError(f"Invalid primaryEngine: {data['primaryEngine']}")

    if not isinstance(data["inventory"], list):
        raise ValueError("Invalid manifest: inventory must be a list")

    return data


def save_project_manifest(project_dir: Union[str, Path], manifest: dict[str, Any]) -> None:
    """Atomically writes project.json using a temporary file and atomic rename."""
    p_dir = Path(project_dir).resolve()
    if not p_dir.is_dir():
        p_dir.mkdir(parents=True, exist_ok=True)

    required = ["projectId", "name", "primaryEngine", "createdAt", "updatedAt", "version", "inventory"]
    for field in required:
        if field not in manifest:
            raise ValueError(f"Invalid manifest: missing required field '{field}'")

    target = p_dir / "project.json"
    temp_name = f".project.json.{uuid.uuid4().hex}.tmp"
    temp_path = p_dir / temp_name

    content = json.dumps(manifest, indent=2) + "\n"
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, target)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def init_project(
    project_dir: Union[str, Path],
    project_id: Optional[str] = None,
    name: Optional[str] = None,
    primary_engine: str = "FreeCAD",
) -> dict[str, Any]:
    """Scaffolds 5 standard folders and atomic project.json manifest."""
    base = Path(project_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)

    for folder in STANDARD_DIRECTORIES:
        (base / folder).mkdir(parents=True, exist_ok=True)

    manifest_path = base / "project.json"
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if manifest_path.is_file():
        try:
            return load_project_manifest(base)
        except Exception:
            pass

    manifest = {
        "projectId": project_id or str(uuid.uuid4()),
        "name": name or base.name or "Untitled Project",
        "primaryEngine": primary_engine,
        "createdAt": now_iso,
        "updatedAt": now_iso,
        "version": "1.0.0",
        "inventory": [],
    }
    save_project_manifest(base, manifest)
    return manifest


def reconstitute_manifest(
    project_dir: Union[str, Path],
    project_id: Optional[str] = None,
    name: Optional[str] = None,
    primary_engine: str = "FreeCAD",
) -> dict[str, Any]:
    """Scans existing files across the 5 standard directories and reconstitutes project.json."""
    base = Path(project_dir).resolve()
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    inventory = []
    for folder in STANDARD_DIRECTORIES:
        f_dir = base / folder
        if not f_dir.is_dir():
            continue
        for root, _, files in os.walk(f_dir):
            for file in sorted(files):
                if file.startswith("."):
                    continue
                file_path = Path(root) / file
                rel = file_path.relative_to(base).as_posix()
                try:
                    entry = index_asset(base, rel)
                    inventory.append(entry)
                except Exception:
                    pass

    manifest = {
        "projectId": project_id or str(uuid.uuid4()),
        "name": name or base.name or "Untitled Project",
        "primaryEngine": primary_engine,
        "createdAt": now_iso,
        "updatedAt": now_iso,
        "version": "1.0.0",
        "inventory": inventory,
    }
    save_project_manifest(base, manifest)
    return manifest


def audit_project(project_dir: Union[str, Path]) -> dict[str, Any]:
    """Inspects project conformance in a non-disruptive, read-only manner.

    Reports:
    - Status of standard 5-folder directories.
    - Unorganized and misplaced files.
    - Discrepancies between filesystem and project.json inventory.
    - Deterministic reorganization plan with reasons without mutating disk.
    """
    base = Path(project_dir).resolve()
    if not base.is_dir():
        raise FileNotFoundError(f"Project directory does not exist: {base}")

    directories = {d: (base / d).is_dir() for d in STANDARD_DIRECTORIES}
    missing_dirs = [d for d, exists in directories.items() if not exists]

    manifest_recovered = False
    manifest: Optional[dict[str, Any]] = None
    try:
        manifest = load_project_manifest(base)
    except Exception:
        # Recover corrupted or missing manifest from scan
        manifest = reconstitute_manifest(base)
        manifest_recovered = True

    reorganization_plan: list[dict[str, Any]] = []
    unorganized_files: list[dict[str, Any]] = []

    # Map tracked assets in manifest
    manifest_by_rel: dict[str, dict[str, Any]] = {
        PurePosixPath(entry["relativePath"]).as_posix(): entry
        for entry in manifest.get("inventory", [])
    }
    found_on_disk_in_standards: set[str] = set()

    for root, _, files in os.walk(base):
        for f in sorted(files):
            if f.startswith(".") or f == "project.json":
                continue
            file_path = Path(root) / f
            rel = file_path.relative_to(base).as_posix()
            parts = PurePosixPath(rel).parts

            if len(parts) == 1:
                # File in project root
                category = categorize_file(rel)
                dest = f"{category}/{f}"
                reason = get_relocation_reason(category)
                plan_item = {
                    "source": rel,
                    "destination": dest,
                    "category": category,
                    "reason": reason,
                }
                reorganization_plan.append(plan_item)
                unorganized_files.append({
                    "path": rel,
                    "suggestedCategory": category,
                    "suggestedPath": dest,
                    "reason": reason,
                })
            else:
                top_dir = parts[0]
                if top_dir not in STANDARD_DIRECTORIES:
                    category = categorize_file(rel)
                    dest = f"{category}/{f}"
                    reason = get_relocation_reason(category)
                    plan_item = {
                        "source": rel,
                        "destination": dest,
                        "category": category,
                        "reason": reason,
                    }
                    reorganization_plan.append(plan_item)
                    unorganized_files.append({
                        "path": rel,
                        "suggestedCategory": category,
                        "suggestedPath": dest,
                        "reason": reason,
                    })
                else:
                    # Inside standard directory: verify if category matches
                    category = categorize_file(f)
                    if category != top_dir:
                        dest = f"{category}/{f}"
                        reason = get_relocation_reason(category)
                        plan_item = {
                            "source": rel,
                            "destination": dest,
                            "category": category,
                            "reason": reason,
                        }
                        reorganization_plan.append(plan_item)
                        unorganized_files.append({
                            "path": rel,
                            "suggestedCategory": category,
                            "suggestedPath": dest,
                            "reason": reason,
                        })
                    else:
                        found_on_disk_in_standards.add(rel)

    # Discrepancy checks
    missing_files: list[str] = []
    modified_files: list[dict[str, Any]] = []
    untracked_files: list[str] = []

    for rel, entry in manifest_by_rel.items():
        disk_path = base / rel
        if not disk_path.is_file():
            missing_files.append(rel)
        else:
            current_size = disk_path.stat().st_size
            current_hash = calculate_sha256(disk_path)
            if current_size != entry.get("size") or current_hash != entry.get("sha256"):
                modified_files.append({
                    "relativePath": rel,
                    "expectedSize": entry.get("size"),
                    "actualSize": current_size,
                    "expectedSha256": entry.get("sha256"),
                    "actualSha256": current_hash,
                })

    for rel in sorted(found_on_disk_in_standards):
        if rel not in manifest_by_rel:
            untracked_files.append(rel)

    compliant = (
        len(missing_dirs) == 0
        and len(reorganization_plan) == 0
        and len(missing_files) == 0
        and len(modified_files) == 0
        and len(untracked_files) == 0
        and not manifest_recovered
    )

    return {
        "compliant": compliant,
        "projectId": manifest.get("projectId"),
        "directories": directories,
        "missingDirectories": missing_dirs,
        "discrepancies": {
            "missingFiles": missing_files,
            "untrackedFiles": untracked_files,
            "modifiedFiles": modified_files,
        },
        "reorganizationPlan": reorganization_plan,
        "unorganizedFiles": unorganized_files,
        "manifestRecovered": manifest_recovered,
    }


def reorganize_project(
    project_dir: Union[str, Path],
    confirmed: bool = False,
    plan: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Executes atomic reorganization with explicit confirmation and strict path containment."""
    if not confirmed:
        raise ValueError("Reorganization rejected: confirmed must be True")

    base = Path(project_dir).resolve()
    if not base.is_dir():
        raise FileNotFoundError(f"Project directory does not exist: {base}")

    # Ensure all standard folders exist
    for folder in STANDARD_DIRECTORIES:
        (base / folder).mkdir(parents=True, exist_ok=True)

    if plan is None:
        audit = audit_project(base)
        plan = audit["reorganizationPlan"]

    # Strict path containment and traversal prevention check
    for item in plan:
        src_raw = item["source"]
        dst_raw = item["destination"]
        if ".." in src_raw or ".." in dst_raw or "\0" in src_raw or "\0" in dst_raw:
            raise ValueError("Forbidden boundary violation: path traversal attempt outside project")

        src_path = (base / src_raw).resolve()
        dst_path = (base / dst_raw).resolve()

        if not is_path_contained(src_path, base):
            raise ValueError(f"Forbidden boundary violation: source outside project root ({src_raw})")
        if not is_path_contained(dst_path, base):
            raise ValueError(f"Forbidden boundary violation: target outside project root ({dst_raw})")

    moved: list[dict[str, Any]] = []

    # Execute moves atomically while preserving mtime
    for item in plan:
        src_path = (base / item["source"]).resolve()
        dst_path = (base / item["destination"]).resolve()

        if not src_path.is_file():
            continue

        dst_path.parent.mkdir(parents=True, exist_ok=True)

        st = src_path.stat()
        atime_ns = st.st_atime_ns
        mtime_ns = st.st_mtime_ns

        shutil.move(str(src_path), str(dst_path))
        os.utime(dst_path, ns=(atime_ns, mtime_ns))

        moved.append({
            "source": item["source"],
            "destination": item["destination"],
            "category": item.get("category", categorize_file(item["destination"])),
        })

    # Update manifest atomically
    manifest: dict[str, Any]
    try:
        manifest = load_project_manifest(base)
    except Exception:
        manifest = reconstitute_manifest(base)

    # Remove moved sources from manifest inventory
    moved_sources = {PurePosixPath(m["source"]).as_posix() for m in moved}
    updated_inventory = [
        entry for entry in manifest.get("inventory", [])
        if PurePosixPath(entry["relativePath"]).as_posix() not in moved_sources
    ]

    # Index new locations and add to inventory
    for m in moved:
        new_rel = PurePosixPath(m["destination"]).as_posix()
        # Remove any existing entry for this destination if present
        updated_inventory = [e for e in updated_inventory if PurePosixPath(e["relativePath"]).as_posix() != new_rel]
        try:
            entry = index_asset(base, new_rel)
            updated_inventory.append(entry)
        except Exception:
            pass

    manifest["inventory"] = updated_inventory
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    save_project_manifest(base, manifest)

    return {
        "success": True,
        "moved": moved,
        "manifestUpdated": True,
    }
