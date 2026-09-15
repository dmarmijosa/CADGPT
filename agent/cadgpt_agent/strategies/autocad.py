"""AutoCAD Core Console strategy: create ops only (slice 13a), plus STL
preview export (slice 14).

Renders a per-job `run.scr` from validated numeric input and invokes
`accoreconsole.exe` with a fixed six-token argv. No caller free text ever
reaches the script: every number is validated through the same bounds as the
FreeCAD worker (`agent/cadgpt_agent/freecad_worker.py`) and written back out
via `repr(float(...))`; only fixed command tokens, the `(load ...)` path, the
resulting numeric literals, and the job-dir-derived STL/DWG paths appear in
`run.scr`.

STL preview export uses `_STLOUT` (proven live on AutoCAD 2026 Core Console
per `docs/autocad-stl-spike.md`, slice 14.0): `_STLOUT` + `_ALL` + an empty
line to finish selection + `_Y` (binary) + the STL path produces a valid
binary STL non-interactively. `_-EXPORT`/`3DPRINT` are NOT used — both hang
on an interactive prompt under Core Console (spike result), which is why
research finding A4 ("STLOUT excluded from Core Console") was refuted for
AutoCAD 2026 and is no longer treated as a constraint here.

Modify/read ops (booleans, transforms, `read_scene`, `export_design`) are
deferred (slice 13b.6) and are intentionally unsupported here (`supports()`
is False).
"""
import json
from pathlib import Path

from .base import Artifacts
# Reused deliberately (not duplicated): the AutoCAD adapter must accept the
# exact same numeric bounds as the FreeCAD worker (design "AutoCAD strategy"),
# and both are pure functions with no FreeCAD import at module scope, so
# importing them here never touches FreeCAD.
from ..freecad_worker import _EXTRUDE_BOX_ARGS, _mm, _position

_AUTOCAD_DIR = Path(__file__).resolve().parent.parent / "autocad"
_BLANK_DWG = _AUTOCAD_DIR / "blank.dwg"
_LSP_PATH = _AUTOCAD_DIR / "cadgpt.lsp"


def _num(value):
    """Render one already-bounds-checked number as its script literal.

    `value` must already have passed through `_mm`/`_coord` (both raise
    `ValueError` on anything non-finite or out of range) before reaching
    here; this only controls the textual form written to `run.scr`.
    """
    return repr(float(value))


def _lisp_call(function_name, *numbers):
    return "(" + function_name + " " + " ".join(_num(n) for n in numbers) + ")"


def _create_box_call(data):
    length = _mm(data.get("length"), "length")
    width = _mm(data.get("width"), "width")
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _lisp_call("cadgpt-create-box", length, width, height, x, y, z)


def _create_cylinder_call(data):
    radius = _mm(data.get("radius"), "radius")
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _lisp_call("cadgpt-create-cylinder", radius, height, x, y, z)


def _create_sphere_call(data):
    radius = _mm(data.get("radius"), "radius")
    x, y, z = _position(data)
    return _lisp_call("cadgpt-create-sphere", radius, x, y, z)


def _create_cone_call(data):
    radius1 = _mm(data.get("radius1"), "radius1")
    radius2 = _mm(data.get("radius2"), "radius2", allow_zero=True)
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _lisp_call("cadgpt-create-cone", radius1, radius2, height, x, y, z)


def _extrude_rect_call(data):
    width = _mm(data.get("width"), "width")
    height = _mm(data.get("height"), "height")
    depth = _mm(data.get("depth"), "depth")
    plane = data.get("plane")
    if plane not in _EXTRUDE_BOX_ARGS:
        raise ValueError("plane must be one of XY, XZ, YZ")
    box_args = _EXTRUDE_BOX_ARGS[plane](width, height, depth)
    x, y, z = _position(data)
    return _lisp_call("cadgpt-extrude-rect", *box_args, x, y, z)


# Create-only subset of `discovery.AUTOCAD_OPS`; booleans/transforms land in
# slice 13b once their `.lsp`/`.scr` mapping exists.
_CREATE_OPS = {
    "create_box": _create_box_call,
    "create_cylinder": _create_cylinder_call,
    "create_sphere": _create_sphere_call,
    "create_cone": _create_cone_call,
    "extrude_rect": _extrude_rect_call,
}


def render_script(op, data, lisp_path, design_path, stl_path):
    """Build the exact CRLF `run.scr` body for one allowlisted create op.

    Only fixed command tokens, the `(load ...)` path, the rendered
    `(cadgpt-<op> ...)` call (validated numbers only), and the job-dir/
    doc-dir-derived STL/SAVEAS target paths ever appear here — never caller
    free text. Raises `ValueError` before any text is assembled if a
    parameter is missing, non-finite, or out of bounds.

    Order: create the solid first, then `_STLOUT` it (the solid must already
    exist in the drawing), then `_SAVEAS` the DWG, then `_QUIT` — matching the
    slice 14.0 spike's proven sequence.
    """
    builder = _CREATE_OPS.get(op)
    if builder is None:
        raise ValueError("Unsupported AutoCAD create operation: " + str(op))
    call = builder(data)
    # FILEDIA 0 keeps the SAVEAS filename prompt on the command line instead
    # of opening a dialog (Core Console has no display to show one on).
    # Every command/keyword is `_`-prefixed to force English/global command
    # names regardless of the AutoCAD UI language (verified on a live host).
    lines = [
        "FILEDIA",
        "0",
        '(load "' + lisp_path.as_posix() + '")',
        call,
        # STLOUT prompts: "Select objects:" -> _ALL, then an empty line to
        # finish selection, then "Create a binary STL file? [Yes/No]" -> _Y,
        # then the filename prompt -> the STL path. Proven live (spike 14.0).
        "_STLOUT",
        "_ALL",
        "",
        "_Y",
        stl_path.as_posix(),
        "_SAVEAS",
        "2018",
        design_path.as_posix(),
        "_QUIT",
    ]
    return "\r\n".join(lines) + "\r\n"


class AutoCadStrategy:
    kind = "AutoCAD"

    def supports(self, op: str) -> bool:
        return op in _CREATE_OPS

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        request = json.loads((job_dir / "request.json").read_text(encoding="utf-8"))
        native_path_str = request.get("native_path") or request.get("nativePath")
        if native_path_str:
            design_path = Path(native_path_str)
        else:
            design_dir = doc_dir if doc_dir is not None else job_dir
            design_path = design_dir / "design.dwg"
        # The STL preview is always job-scoped (never caller input), mirroring
        # `FreeCadStrategy.artifacts()`'s `mesh = job_dir / "preview.stl"`.
        stl_path = job_dir / "preview.stl"
        script = render_script(request.get("op"), request, _LSP_PATH, design_path, stl_path)
        script_path = job_dir / "run.scr"
        # `newline=""` is required: the string already carries literal CRLF,
        # and without it Python's text-mode translation would corrupt every
        # embedded "\n" into the platform line separator.
        script_path.write_text(script, encoding="utf-8", newline="")
        input_dwg = design_path if design_path.is_file() else _BLANK_DWG
        return [str(cad_path), "/i", str(input_dwg), "/s", str(script_path), "/isolate"]

    def env(self, base: dict[str, str]) -> dict[str, str]:
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
        return {
            "native": native_path if native_path else design_dir / "design.dwg",
            # Proven live via `_STLOUT` (slice 14.0 spike, docs/autocad-stl-spike.md).
            "mesh": job_dir / "preview.stl",
            "scene": None,
        }
