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
import math
import os
import re
from pathlib import Path

from .base import Artifacts
from ..freecad_worker import _EXTRUDE_BOX_ARGS, _bounded, _coord, _mm, _position

_WORKER = Path(__file__).resolve().parent.parent / "solidworks" / "solidworks_worker.ps1"

_CREATE_OPS = ("create_box", "create_cylinder", "extrude_rect")
# Ops that change an existing part's bodies. Bodies are addressed as
# `Body<N>`: the 1-based position in `IPartDoc.GetBodies2`, the same names
# `read_scene` reports (SOLIDWORKS' own body names contain characters the
# MCP object-name schema rejects).
_EDIT_OPS = ("translate_object", "rotate_object", "boolean_cut", "boolean_union", "boolean_intersect")
SOLIDWORKS_OPS = (*_CREATE_OPS, "export_design", "read_scene", *_EDIT_OPS)
_EXPORT_FORMATS = ("step", "stl")
_BODY_RE = re.compile(r"^Body[1-9][0-9]{0,3}$")
_BOOLEAN_KINDS = {"boolean_cut": "cut", "boolean_union": "union", "boolean_intersect": "intersect"}


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


def _body(value, name):
    if not isinstance(value, str) or not _BODY_RE.match(value):
        raise ValueError(f"{name} must be a SOLIDWORKS body reference like Body1 (from read_scene)")
    return value


def build_edit(op, data):
    """Return the validated edit description for an op on existing bodies."""
    if op == "translate_object":
        return {"kind": "translate", "body": _body(data.get("object"), "object"),
                "dx": _m(_coord(data.get("dx"), "dx")), "dy": _m(_coord(data.get("dy"), "dy")),
                "dz": _m(_coord(data.get("dz"), "dz"))}
    if op == "rotate_object":
        axis = data.get("axis")
        if axis not in ("X", "Y", "Z"):
            raise ValueError("axis must be one of X, Y, Z")
        degrees = _bounded(data.get("degrees"), "degrees", -360, 360)
        center = data.get("center") or {}
        return {"kind": "rotate", "body": _body(data.get("object"), "object"), "axis": axis,
                "radians": math.radians(degrees),
                "cx": _m(_coord(center.get("x", 0), "center.x")),
                "cy": _m(_coord(center.get("y", 0), "center.y")),
                "cz": _m(_coord(center.get("z", 0), "center.z"))}
    if op in _BOOLEAN_KINDS:
        base = _body(data.get("base"), "base")
        tool = _body(data.get("tool"), "tool")
        if base == tool:
            raise ValueError("base and tool must be different bodies")
        return {"kind": _BOOLEAN_KINDS[op], "base": base, "tool": tool}
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
            "edit": None,
            "scene": None,
        }
        if op in ("export_design", "read_scene", *_EDIT_OPS) and not plan["open_existing"]:
            raise ValueError(f"{op} needs an existing SOLIDWORKS part")
        if op == "read_scene":
            plan["scene"] = str(job_dir / "scene.json")
        elif op in _EDIT_OPS:
            plan["edit"] = build_edit(op, request)
        elif op == "export_design":
            fmt = request.get("format")
            if fmt not in _EXPORT_FORMATS:
                raise ValueError(f"format must be one of {', '.join(_EXPORT_FORMATS)}")
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
            "scene": job_dir / "scene.json" if op == "read_scene" else None,
        }
