"""Wraps the Blender worker's headless subprocess pipeline."""
from __future__ import annotations

import json
from pathlib import Path

from .base import Artifacts


BLENDER_OPS = (
    "create_blender_mesh",
    "extrude_subdivide_mesh",
    "displace_sculpt_mesh",
    "boolean_blender_mesh",
    "export_blender_scene",
    "read_scene",
    "export_design",
)


class BlenderStrategy:
    kind = "Blender"

    def supports(self, op: str) -> bool:
        return op in BLENDER_OPS

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        worker = Path(__file__).resolve().parent.parent / "blender_worker.py"
        request_file = job_dir / "request.json"
        result_file = job_dir / "result.json"
        return [
            str(cad_path),
            "--background",
            "--factory-startup",
            "--python",
            str(worker),
            "--",
            str(request_file),
            str(result_file),
        ]

    def env(self, base: dict[str, str]) -> dict[str, str]:
        # Inherit sanitized base environment
        return dict(base)

    def artifacts(self, op: str, job_dir: Path, doc_dir: Path | None) -> Artifacts:
        request_file = job_dir / "request.json"
        native_path = None
        if request_file.is_file():
            try:
                data = json.loads(request_file.read_text(encoding="utf-8"))
                p = data.get("native_path") or data.get("nativePath")
                if p:
                    native_path = Path(p)
            except Exception:
                pass

        design_dir = doc_dir if doc_dir is not None else job_dir
        cad_dir = design_dir / "cad"
        blend_file = cad_dir / "design.blend" if cad_dir.is_dir() else design_dir / "design.blend"

        return {
            "native": native_path if native_path else blend_file,
            "mesh": job_dir / "preview.stl",
            "scene": job_dir / "scene.json" if op == "read_scene" else None,
        }
