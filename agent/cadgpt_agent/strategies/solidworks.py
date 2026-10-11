"""SOLIDWORKS strategy: COM automation through a fixed PowerShell worker.

SOLIDWORKS has no headless command-line modeler. The supported automation
surface is its COM API (`SldWorks.Application`, Windows only), which still
needs a licensed install and a Windows desktop session. The agent therefore
never runs `SLDWORKS.exe` directly: it launches the system PowerShell with a
fixed, shipped worker (`solidworks/solidworks_worker.ps1`) that drives the
COM API with the window hidden.

All validation happens here, in Python, before any process starts. This
strategy renders a `plan.json` holding only already-validated numbers
(converted to metres, the SOLIDWORKS API unit), a fixed feature kind, and
job/doc-dir-derived paths. The worker reads that plan and nothing else: no
caller free text ever reaches PowerShell, and the argv is fixed.
"""
import json
import os
from pathlib import Path

from .base import Artifacts
from ..freecad_worker import _EXTRUDE_BOX_ARGS, _mm, _position

_WORKER = Path(__file__).resolve().parent.parent / "solidworks" / "solidworks_worker.ps1"

SOLIDWORKS_OPS = ("create_box", "create_cylinder", "extrude_rect", "export_design")
_EXPORT_FORMATS = ("step", "stl")


def _m(value_mm):
    """Millimetres (already bounds-checked) to metres for the SOLIDWORKS API."""
    return float(value_mm) / 1000.0


def _position_m(data):
    return [_m(v) for v in _position(data)]


def _box_feature(length, width, height, data):
    x, y, z = _position_m(data)
    return {"kind": "box", "x": x, "y": y, "z": z,
            "length": _m(length), "width": _m(width), "height": _m(height)}


def build_feature(op, data):
    """Return the validated feature description for a create op.

    Raises `ValueError` before any file is written when a parameter is
    missing, non-finite or out of bounds (same bounds as the FreeCAD worker).
    """
    if op == "create_box":
        return _box_feature(_mm(data.get("length"), "length"), _mm(data.get("width"), "width"),
                            _mm(data.get("height"), "height"), data)
    if op == "create_cylinder":
        radius = _mm(data.get("radius"), "radius")
        height = _mm(data.get("height"), "height")
        x, y, z = _position_m(data)
        return {"kind": "cylinder", "x": x, "y": y, "z": z, "radius": _m(radius), "height": _m(height)}
    if op == "extrude_rect":
        width = _mm(data.get("width"), "width")
        height = _mm(data.get("height"), "height")
        depth = _mm(data.get("depth"), "depth")
        plane = data.get("plane")
        if plane not in _EXTRUDE_BOX_ARGS:
            raise ValueError("plane must be one of XY, XZ, YZ")
        return _box_feature(*_EXTRUDE_BOX_ARGS[plane](width, height, depth), data)
    raise ValueError("Unsupported SOLIDWORKS operation: " + str(op))


def _powershell():
    # Absolute path under %SystemRoot% so a PATH entry can never shadow it.
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    return str(Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe")


class SolidWorksStrategy:
    kind = "SolidWorks"

    def supports(self, op: str) -> bool:
        return op in SOLIDWORKS_OPS

    def _native(self, request, job_dir, doc_dir):
        native = request.get("native_path") or request.get("nativePath")
        if native:
            return Path(native)
        return (doc_dir if doc_dir is not None else job_dir) / "design.SLDPRT"

    def render_plan(self, request, job_dir, doc_dir):
        op = request.get("op")
        native = self._native(request, job_dir, doc_dir)
        plan = {
            "op": op,
            "native": str(native),
            "open_existing": native.is_file(),
            "stl": str(job_dir / "preview.stl"),
            "export": None,
            "feature": None,
        }
        if op == "export_design":
            fmt = request.get("format")
            if fmt not in _EXPORT_FORMATS:
                raise ValueError(f"format must be one of {', '.join(_EXPORT_FORMATS)}")
            if not plan["open_existing"]:
                raise ValueError("export_design needs an existing SOLIDWORKS part")
            plan["export"] = str((doc_dir if doc_dir is not None else job_dir) / f"export.{fmt}")
        else:
            plan["feature"] = build_feature(op, request)
        return plan

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        request = json.loads((job_dir / "request.json").read_text(encoding="utf-8"))
        plan_path = job_dir / "plan.json"
        plan_path.write_text(json.dumps(self.render_plan(request, job_dir, doc_dir)), encoding="utf-8")
        return [
            _powershell(),
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(_WORKER),
            str(plan_path),
        ]

    def env(self, base: dict[str, str]) -> dict[str, str]:
        return dict(base)

    def artifacts(self, op: str, job_dir: Path, doc_dir: Path | None) -> Artifacts:
        request_file = job_dir / "request.json"
        request = {}
        if request_file.is_file():
            try:
                request = json.loads(request_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {
            "native": self._native(request, job_dir, doc_dir),
            "mesh": job_dir / "preview.stl",
            "scene": None,
        }
