"""Wraps the existing single-op FreeCAD pipeline; behavior-preserving for phase 1."""
from pathlib import Path

from .base import Artifacts


class FreeCadStrategy:
    kind = "FreeCAD"

    def supports(self, op: str) -> bool:
        return op == "create_box"

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        worker = Path(__file__).resolve().parent.parent / "freecad_worker.py"
        return [str(cad_path), str(worker)]

    def env(self, base: dict[str, str]) -> dict[str, str]:
        environment = dict(base)
        environment["QT_QPA_PLATFORM"] = "offscreen"
        return environment

    def artifacts(self, op: str, job_dir: Path, doc_dir: Path | None) -> Artifacts:
        return {"native": job_dir / "box.FCStd", "mesh": None, "scene": None}
