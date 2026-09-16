"""Wraps the FreeCAD worker's per-op pipeline (see `freecad_worker.OPS`)."""
from pathlib import Path

from .base import Artifacts
from ..freecad_worker import OPS


class FreeCadStrategy:
    kind = "FreeCAD"

    def supports(self, op: str) -> bool:
        return op in OPS or op == "analyze_image_to_cad"

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        worker = Path(__file__).resolve().parent.parent / "freecad_worker.py"
        return [str(cad_path), str(worker)]

    def env(self, base: dict[str, str]) -> dict[str, str]:
        environment = dict(base)
        environment["QT_QPA_PLATFORM"] = "offscreen"
        return environment

    def artifacts(self, op: str, job_dir: Path, doc_dir: Path | None) -> Artifacts:
        request_file = job_dir / "request.json"
        native_path = None
        if request_file.is_file():
            try:
                import json
                data = json.loads(request_file.read_text(encoding="utf-8"))
                p = data.get("native_path") or data.get("nativePath")
                if p:
                    native_path = Path(p)
            except Exception:
                pass
        design_dir = doc_dir if doc_dir is not None else job_dir
        return {
            "native": native_path if native_path else design_dir / "design.FCStd",
            "mesh": job_dir / "preview.stl",
            "scene": job_dir / "scene.json" if op == "read_scene" else None,
        }
