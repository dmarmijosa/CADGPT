"""Executed by FreeCADCmd's own Python, not the bundled agent interpreter.

Validation and the `OPS` dispatch table are pure Python: this module imports
no `FreeCAD`/`Part`/`MeshPart` at module scope, so it can be imported and its
validators exercised under plain CPython (unit tests). Every op handler
performs its own bound/format validation first and only then lazily imports
`FreeCAD`/`Part` inside the function body, guaranteeing malformed input never
reaches a single FreeCAD call.
"""
import json
import math
import os
import re
import sys
from pathlib import Path

OBJECT_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,31}$")


def _finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _bounded(value, name, lo, hi):
    if not _finite(value) or not (lo <= value <= hi):
        raise ValueError(f"{name} must be a finite value in [{lo}, {hi}]")
    return float(value)


def _mm(value, name, allow_zero=False):
    lo = 0 if allow_zero else sys.float_info.min
    return _bounded(value, name, lo, 10000)


def _coord(value, name):
    return _bounded(value, name, -100000, 100000)


def _object_name(value, name):
    if not isinstance(value, str) or not OBJECT_NAME_RE.match(value):
        raise ValueError(f"{name} is not a valid object name")
    return value


def _position(data):
    position = data.get("position") or {}
    return (
        _coord(position.get("x", 0), "position.x"),
        _coord(position.get("y", 0), "position.y"),
        _coord(position.get("z", 0), "position.z"),
    )


def _document_path(doc_dir):
    return Path(doc_dir) / "design.FCStd"


def _open_document(doc_dir):
    import FreeCAD
    return FreeCAD.openDocument(str(_document_path(doc_dir)))


def _open_or_new(data, doc_dir):
    """Create ops append to an existing design when its file is present (D4),
    otherwise start a new document that `run()` saves under `doc_dir`."""
    import FreeCAD
    if _document_path(doc_dir).is_file():
        return _open_document(doc_dir)
    return FreeCAD.newDocument("CADGPTDesign")


def _get_object(document, name):
    obj = document.getObject(name)
    if obj is None:
        raise ValueError(f"Unknown object: {name}")
    return obj


def _create_primitive(data, doc_dir, feature_name, x, y, z, build_shape):
    """Open (documentId present) or create a new document, add one shape."""
    document = _open_or_new(data, doc_dir)
    import FreeCAD
    import Part
    obj = document.addObject("Part::Feature", feature_name)
    obj.Shape = build_shape(Part, FreeCAD.Vector(x, y, z))
    document.recompute()
    return document


def _create_box(data, doc_dir):
    length = _mm(data.get("length"), "length")
    width = _mm(data.get("width"), "width")
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _create_primitive(data, doc_dir, "Box", x, y, z,
                              lambda Part, vec: Part.makeBox(length, width, height, vec))


def _create_cylinder(data, doc_dir):
    radius = _mm(data.get("radius"), "radius")
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _create_primitive(data, doc_dir, "Cylinder", x, y, z,
                              lambda Part, vec: Part.makeCylinder(radius, height, vec))


def _create_sphere(data, doc_dir):
    radius = _mm(data.get("radius"), "radius")
    x, y, z = _position(data)
    return _create_primitive(data, doc_dir, "Sphere", x, y, z,
                              lambda Part, vec: Part.makeSphere(radius, vec))


def _create_cone(data, doc_dir):
    radius1 = _mm(data.get("radius1"), "radius1")
    radius2 = _mm(data.get("radius2"), "radius2", allow_zero=True)
    height = _mm(data.get("height"), "height")
    x, y, z = _position(data)
    return _create_primitive(data, doc_dir, "Cone", x, y, z,
                              lambda Part, vec: Part.makeCone(radius1, radius2, height, vec))


def _boolean(feature_type):
    def handler(data, doc_dir):
        base_name = _object_name(data.get("base"), "base")
        tool_name = _object_name(data.get("tool"), "tool")
        document = _open_document(doc_dir)
        base = _get_object(document, base_name)
        tool = _get_object(document, tool_name)
        result = document.addObject(f"Part::{feature_type}", feature_type)
        result.Base, result.Tool = base, tool
        document.recompute()
        return document
    return handler


_boolean_cut = _boolean("Cut")
_boolean_union = _boolean("Fuse")
_boolean_intersect = _boolean("Common")


def _translate_object(data, doc_dir):
    name = _object_name(data.get("object"), "object")
    dx, dy, dz = (_coord(data.get(k), k) for k in ("dx", "dy", "dz"))
    document = _open_document(doc_dir)
    obj = _get_object(document, name)
    import FreeCAD
    placement = obj.Placement
    obj.Placement = FreeCAD.Placement(placement.Base + FreeCAD.Vector(dx, dy, dz), placement.Rotation)
    document.recompute()
    return document


def _rotate_object(data, doc_dir):
    name = _object_name(data.get("object"), "object")
    axis = data.get("axis")
    if axis not in ("X", "Y", "Z"):
        raise ValueError("axis must be one of X, Y, Z")
    degrees = _bounded(data.get("degrees"), "degrees", -360, 360)
    document = _open_document(doc_dir)
    obj = _get_object(document, name)
    import FreeCAD
    unit_vectors = {"X": FreeCAD.Vector(1, 0, 0), "Y": FreeCAD.Vector(0, 1, 0), "Z": FreeCAD.Vector(0, 0, 1)}
    rotation = FreeCAD.Rotation(unit_vectors[axis], degrees)
    placement = obj.Placement
    obj.Placement = FreeCAD.Placement(placement.Base, rotation.multiply(placement.Rotation))
    document.recompute()
    return document


def _scale_object(data, doc_dir):
    name = _object_name(data.get("object"), "object")
    factor = _bounded(data.get("factor"), "factor", 0.001, 1000)
    document = _open_document(doc_dir)
    obj = _get_object(document, name)
    obj.Shape.scale(factor)
    document.recompute()
    return document


def _read_scene(data, doc_dir):
    return _open_document(doc_dir)


OPS = {
    "create_box": _create_box,
    "create_cylinder": _create_cylinder,
    "create_sphere": _create_sphere,
    "create_cone": _create_cone,
    "boolean_cut": _boolean_cut,
    "boolean_union": _boolean_union,
    "boolean_intersect": _boolean_intersect,
    "translate_object": _translate_object,
    "rotate_object": _rotate_object,
    "scale_object": _scale_object,
    "read_scene": _read_scene,
}

# Every op except the read-only one persists a mutation back to disk.
MUTATING_OPS = set(OPS) - {"read_scene"}


def _top_level_objects(document):
    """Objects with an empty `InList`: not consumed by another feature."""
    return [obj for obj in document.Objects if not obj.InList]


def _export_stl(document, job_dir):
    import MeshPart
    top_level = _top_level_objects(document)
    if len(top_level) == 1:
        shape = top_level[0].Shape
    else:
        import Part
        shape = Part.makeCompound([obj.Shape for obj in top_level])
    mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.1, AngularDeflection=0.26, Relative=False)
    mesh.write(str(Path(job_dir) / "preview.stl"))


def _write_scene(document, job_dir):
    scene = [{
        "name": obj.Name, "label": obj.Label, "type": obj.TypeId,
        "bbox": [obj.Shape.BoundBox.XMin, obj.Shape.BoundBox.YMin, obj.Shape.BoundBox.ZMin,
                 obj.Shape.BoundBox.XMax, obj.Shape.BoundBox.YMax, obj.Shape.BoundBox.ZMax],
        "volume": obj.Shape.Volume,
    } for obj in _top_level_objects(document)]
    (Path(job_dir) / "scene.json").write_text(json.dumps(scene), encoding="utf-8")


def run(job_dir, doc_dir, data):
    """Dispatch `data["op"]` to its handler. Unknown op exits 2; no CAD work runs."""
    op = data.get("op", "create_box")
    handler = OPS.get(op)
    if handler is None:
        sys.exit(2)
    document = handler(data, doc_dir)
    if op in MUTATING_OPS:
        # A reopened document already has a FileName; a new one is saved
        # under doc_dir (which the executor sets to the job dir when the job
        # carries no document_id).
        if document.FileName:
            document.save()
        else:
            document.saveAs(str(_document_path(doc_dir)))
    if op == "read_scene":
        _write_scene(document, job_dir)
    _export_stl(document, job_dir)
    import FreeCAD
    FreeCAD.closeDocument(document.Name)


# FreeCADCmd executes a script file with `__name__` set to the file stem, not
# "__main__". The package import used by the unit tests is excluded so the
# module can be imported without side effects.
if __name__ in ("__main__", "freecad_worker"):
    _job_dir = Path(os.environ["CADGPT_JOB_DIR"])
    _doc_dir = Path(os.environ.get("CADGPT_DOC_DIR", str(_job_dir)))
    _data = json.loads((_job_dir / "request.json").read_text(encoding="utf-8"))
    try:
        run(_job_dir, _doc_dir, _data)
    except SystemExit:
        raise
    except Exception as exc:  # FreeCADCmd may swallow exceptions into exit 0.
        print("cadgpt worker error: " + type(exc).__name__ + ": " + str(exc)[:300], flush=True)
        sys.exit(1)
