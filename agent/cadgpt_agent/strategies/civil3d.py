"""Autodesk Civil 3D strategy: AutoCAD Core Console launched as Civil 3D.

Civil 3D installs on top of AutoCAD and ships the same `accoreconsole.exe`.
Passing `/product C3D` makes the console load the Civil 3D product profile
and object enablers, and `/l en-US` pins the command language so the
`_`-prefixed global commands in `cadgpt.lsp` resolve the same way on every
localized install. Everything else — the rendered `run.scr`, numeric
validation, the `(load ...)`-only script body, STL preview via `_STLOUT` —
is inherited unchanged from `AutoCadStrategy`.

On top of the 13 AutoCAD ops, Civil 3D adds `extrude_cross_section`: a
trapezoidal profile (road embankment, channel, levee) swept along +Y. It is
built from plain 3D solids so `_STLOUT` can preview it like any other op.
"""
from .autocad import _CREATE_OPS, AutoCadStrategy, _lisp_call
from ..freecad_worker import _mm, _position


def _extrude_cross_section_call(data):
    bottom_width = _mm(data.get("bottom_width"), "bottom_width")
    top_width = _mm(data.get("top_width"), "top_width")
    height = _mm(data.get("height"), "height")
    length = _mm(data.get("length"), "length")
    x, y, z = _position(data)
    return _lisp_call(
        "cadgpt-extrude-cross-section", bottom_width, top_width, height, length, x, y, z
    )


CIVIL3D_CREATE_OPS = {
    **_CREATE_OPS,
    "extrude_cross_section": _extrude_cross_section_call,
}


class Civil3DStrategy(AutoCadStrategy):
    kind = "Civil3D"
    create_ops = CIVIL3D_CREATE_OPS
    product_argv = ("/product", "C3D", "/l", "en-US")
