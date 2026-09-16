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
import time
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


def _document_path(doc_dir, data=None):
    if data and (data.get("native_path") or data.get("nativePath")):
        return Path(data.get("native_path") or data.get("nativePath"))
    if doc_dir is not None:
        return Path(doc_dir) / "design.FCStd"
    return None


def _open_document(doc_dir, data=None):
    import FreeCAD
    doc_path = _document_path(doc_dir, data)
    return FreeCAD.openDocument(str(doc_path))


def _open_or_new(data, doc_dir):
    """Create ops append to an existing design when its file is present (D4),
    otherwise start a new document that `run()` saves under `doc_dir` or native_path."""
    import FreeCAD
    doc_path = _document_path(doc_dir, data)
    if doc_path is not None and doc_path.is_file():
        return _open_document(doc_dir, data)
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


_EXTRUDE_BOX_ARGS = {
    # Rectangle drawn on `plane`, extruded along its normal by `depth`.
    # `Part.makeBox(length, width, height, position)` extents map as:
    "XY": lambda w, h, d: (w, h, d),  # X=width, Y=height, Z=depth (normal)
    "XZ": lambda w, h, d: (w, d, h),  # X=width, Y=depth (normal), Z=height
    "YZ": lambda w, h, d: (d, w, h),  # X=depth (normal), Y=width, Z=height
}


def _extrude_rect(data, doc_dir):
    width = _mm(data.get("width"), "width")
    height = _mm(data.get("height"), "height")
    depth = _mm(data.get("depth"), "depth")
    plane = data.get("plane")
    if plane not in _EXTRUDE_BOX_ARGS:
        raise ValueError("plane must be one of XY, XZ, YZ")
    box_args = _EXTRUDE_BOX_ARGS[plane](width, height, depth)
    x, y, z = _position(data)
    return _create_primitive(data, doc_dir, "Extrude", x, y, z,
                              lambda Part, vec: Part.makeBox(*box_args, vec))


def _create_wedge(data, doc_dir):
    length = _mm(data.get("length"), "length")
    width = _mm(data.get("width"), "width")
    height = _mm(data.get("height"), "height")
    top_raw = data.get("top_length") if data.get("top_length") is not None else data.get("top_x", 0)
    top_length = _bounded(top_raw if top_raw is not None else 0, "top_length", 0, 10000)
    x, y, z = _position(data)

    def _build_wedge(Part, vec):
        try:
            return Part.makeWedge(length, width, height, top_length, vec)
        except TypeError:
            w = Part.makeWedge(length, width, height, top_length)
            if hasattr(vec, "Length") and vec.Length > 0:
                w.translate(vec)
            return w

    return _create_primitive(data, doc_dir, "Wedge", x, y, z, _build_wedge)


_PLANE_NORMALS = {
    "XY": lambda d: (0.0, 0.0, d),
    "XZ": lambda d: (0.0, d, 0.0),
    "YZ": lambda d: (d, 0.0, 0.0),
}

_PLANE_2D_TO_3D = {
    "XY": lambda u, v, x, y, z: (x + u, y + v, z),
    "XZ": lambda u, v, x, y, z: (x + u, y, z + v),
    "YZ": lambda u, v, x, y, z: (x, y + u, z + v),
}


BUNDLED_FONT_PATH = Path(__file__).resolve().parent / "fonts" / "Inter-Bold.ttf"

OS_FONT_FALLBACKS = {
    "Windows": [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ],
    "Darwin": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ],
    "Linux": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ],
}


def _resolve_font(font_param=None):
    """Resolve font file path following the fallback chain:
    1. Explicit font path (must exist and end with .ttf or .otf).
    2. Bundled font: agent/cadgpt_agent/fonts/Inter-Bold.ttf.
    3. OS system fallbacks by platform.
    Raises ValueError if no valid font is found.
    """
    if font_param and isinstance(font_param, str):
        p = Path(font_param)
        if p.suffix.lower() in (".ttf", ".otf") and p.is_file():
            return str(p.resolve())
        print(f"cadgpt worker warning: font path '{font_param}' not found or invalid format; falling back", flush=True)

    if os.path.isfile(str(BUNDLED_FONT_PATH)):
        return str(BUNDLED_FONT_PATH.resolve())

    import platform
    sys_name = platform.system()
    candidate_paths = OS_FONT_FALLBACKS.get(sys_name, [])
    for p_str in candidate_paths:
        if os.path.isfile(p_str):
            return p_str

    for os_key, p_list in OS_FONT_FALLBACKS.items():
        if os_key != sys_name:
            for p_str in p_list:
                if os.path.isfile(p_str):
                    return p_str

    raise ValueError("No valid TrueType or OpenType font found on host system.")


def _extrude_polygon(data, doc_dir):
    raw_points = data.get("points")
    if not isinstance(raw_points, list) or len(raw_points) < 3 or len(raw_points) > 100:
        raise ValueError("points must be a list of 3 to 100 2D coordinate pairs")
    points = []
    for i, pt in enumerate(raw_points):
        if not isinstance(pt, (list, tuple)) or len(pt) != 2:
            raise ValueError(f"points[{i}] must be a 2D coordinate pair [u, v]")
        u = _coord(pt[0], f"points[{i}][0]")
        v = _coord(pt[1], f"points[{i}][1]")
        points.append((u, v))

    raw_holes = data.get("holes")
    parsed_holes = []
    if raw_holes is not None:
        if not isinstance(raw_holes, list) or len(raw_holes) > 20:
            raise ValueError("holes must be a list of up to 20 hole loops")
        for h_idx, loop in enumerate(raw_holes):
            if not isinstance(loop, list) or len(loop) < 3 or len(loop) > 100:
                raise ValueError(f"holes[{h_idx}] must contain 3 to 100 2D coordinate pairs")
            hole_pts = []
            for pt_idx, pt in enumerate(loop):
                if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                    raise ValueError(f"holes[{h_idx}][{pt_idx}] must be a 2D coordinate pair [u, v]")
                hu = _coord(pt[0], f"holes[{h_idx}][{pt_idx}][0]")
                hv = _coord(pt[1], f"holes[{h_idx}][{pt_idx}][1]")
                hole_pts.append((hu, hv))
            parsed_holes.append(hole_pts)

    depth = _mm(data.get("depth"), "depth")
    plane = data.get("plane", "XY")
    if plane not in _PLANE_NORMALS:
        raise ValueError("plane must be one of XY, XZ, YZ")
    x, y, z = _position(data)

    document = _open_or_new(data, doc_dir)
    import FreeCAD
    import Part

    if points[0] != points[-1]:
        points = list(points) + [points[0]]
    pts_3d = [FreeCAD.Vector(*_PLANE_2D_TO_3D[plane](u, v, x, y, z)) for u, v in points]
    outer_wire = Part.makePolygon(pts_3d)

    hole_wires = []
    for hole_pts in parsed_holes:
        if hole_pts[0] != hole_pts[-1]:
            hole_pts = list(hole_pts) + [hole_pts[0]]
        h_pts_3d = [FreeCAD.Vector(*_PLANE_2D_TO_3D[plane](hu, hv, x, y, z)) for hu, hv in hole_pts]
        hole_wires.append(Part.makePolygon(h_pts_3d))

    if hole_wires:
        try:
            face = Part.Face([outer_wire] + hole_wires)
        except Exception:
            outer_face = Part.Face(outer_wire)
            for hw in hole_wires:
                try:
                    outer_face = outer_face.cut(Part.Face(hw))
                except Exception:
                    pass
            face = outer_face
    else:
        face = Part.Face(outer_wire)

    normal = FreeCAD.Vector(*_PLANE_NORMALS[plane](depth))
    shape = face.extrude(normal)

    obj = document.addObject("Part::Feature", data.get("name") or "ExtrudePolygon")
    obj.Shape = shape
    document.recompute()
    return document


def _create_text_3d(data, doc_dir):
    text = data.get("text")
    if not isinstance(text, str) or not (1 <= len(text) <= 120):
        raise ValueError("text must be a non-empty string between 1 and 120 characters")
    size = _mm(data.get("size"), "size")
    thickness = _mm(data.get("thickness"), "thickness")
    mode = data.get("mode", "flat")
    if mode not in ("flat", "emboss", "engrave"):
        raise ValueError("mode must be one of flat, emboss, engrave")
    target_name = None
    if mode in ("emboss", "engrave"):
        raw_target = data.get("target_object")
        if not raw_target:
            raise ValueError("target_object is required for emboss and engrave modes")
        target_name = _object_name(raw_target, "target_object")
    plane = data.get("plane", "XY")
    if plane not in _PLANE_NORMALS:
        raise ValueError("plane must be one of XY, XZ, YZ")
    x, y, z = _position(data)
    tracking = _bounded(data.get("tracking", 0.0) if data.get("tracking") is not None else 0.0, "tracking", -5, 50)
    font_file = _resolve_font(data.get("font"))

    document = _open_or_new(data, doc_dir)
    target = None
    if target_name is not None:
        target = _get_object(document, target_name)

    import FreeCAD
    import Draft
    import Part

    make_shapestring = getattr(Draft, "make_shapestring", None) or getattr(Draft, "makeShapeString", None)
    if make_shapestring is None:
        raise RuntimeError("Draft.make_shapestring is unavailable")

    try:
        ss_obj = make_shapestring(String=text, FontFile=font_file, Size=size, Tracking=tracking)
    except TypeError:
        ss_obj = make_shapestring(text, font_file, size, tracking)

    shape_2d = ss_obj.Shape if hasattr(ss_obj, "Shape") else ss_obj

    if plane == "XY":
        extrude_vec = FreeCAD.Vector(0.0, 0.0, -thickness if mode == "engrave" else thickness)
        rotation = FreeCAD.Rotation()
    elif plane == "XZ":
        extrude_vec = FreeCAD.Vector(0.0, 0.0, thickness if mode == "engrave" else -thickness)
        rotation = FreeCAD.Rotation(FreeCAD.Vector(1, 0, 0), 90)
    elif plane == "YZ":
        extrude_vec = FreeCAD.Vector(0.0, 0.0, -thickness if mode == "engrave" else thickness)
        rotation = FreeCAD.Rotation(FreeCAD.Vector(1, 1, 1), 120)

    if hasattr(shape_2d, "extrude"):
        text_solid = shape_2d.extrude(extrude_vec)
    else:
        text_solid = shape_2d

    placement = FreeCAD.Placement(FreeCAD.Vector(x, y, z), rotation)
    if hasattr(text_solid, "Placement"):
        text_solid.Placement = placement
    elif hasattr(text_solid, "transformShape"):
        mat = placement.toMatrix()
        text_solid.transformShape(mat)

    if hasattr(document, "removeObject") and hasattr(ss_obj, "Name"):
        try:
            document.removeObject(ss_obj.Name)
        except Exception:
            pass

    feature_name = data.get("name") or "Text3D"
    if mode == "flat":
        obj = document.addObject("Part::Feature", feature_name)
        obj.Shape = text_solid
        document.recompute()
        return document
    elif mode == "emboss":
        if hasattr(target.Shape, "fuse"):
            target.Shape = target.Shape.fuse(text_solid)
        else:
            text_feature = document.addObject("Part::Feature", "TextTool")
            text_feature.Shape = text_solid
            fuse_obj = document.addObject("Part::Fuse", feature_name)
            fuse_obj.Base, fuse_obj.Tool = target, text_feature
        document.recompute()
        return document
    elif mode == "engrave":
        if hasattr(target.Shape, "cut"):
            target.Shape = target.Shape.cut(text_solid)
        else:
            text_feature = document.addObject("Part::Feature", "TextTool")
            text_feature.Shape = text_solid
            cut_obj = document.addObject("Part::Cut", feature_name)
            cut_obj.Base, cut_obj.Tool = target, text_feature
        document.recompute()
        return document


def _boolean(feature_type):
    def handler(data, doc_dir):
        base_name = _object_name(data.get("base"), "base")
        tool_name = _object_name(data.get("tool"), "tool")
        document = _open_document(doc_dir, data)
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
    document = _open_document(doc_dir, data)
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
    document = _open_document(doc_dir, data)
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
    document = _open_document(doc_dir, data)
    obj = _get_object(document, name)
    # `obj.Shape` is an immutable view; scale a copy about the object's own
    # centre so it grows in place, then assign it back.
    shape = obj.Shape.copy()
    shape.scale(factor, shape.BoundBox.Center)
    obj.Shape = shape
    document.recompute()
    return document


def _fillet(data, doc_dir):
    name = _object_name(data.get("object"), "object")
    radius = _mm(data.get("radius"), "radius")
    edge_indices = data.get("edge_indices")
    if edge_indices is not None:
        if not isinstance(edge_indices, list) or any(isinstance(x, bool) or not isinstance(x, int) or x <= 0 for x in edge_indices):
            raise ValueError("edge_indices must be a list of 1-based positive integers")
    document = _open_document(doc_dir, data)
    obj = _get_object(document, name)
    edges = obj.Shape.Edges
    num_edges = len(edges)
    if edge_indices:
        for idx in edge_indices:
            if not (1 <= idx <= num_edges):
                raise ValueError(f"edge index {idx} out of range [1, {num_edges}]")
        selected_edges = [edges[idx - 1] for idx in edge_indices]
    else:
        selected_edges = edges
    import Part
    if hasattr(obj.Shape, "makeFillet"):
        new_shape = obj.Shape.makeFillet(radius, selected_edges)
    elif hasattr(Part, "makeFillet"):
        new_shape = Part.makeFillet(obj.Shape, radius, selected_edges)
    else:
        new_shape = obj.Shape.makeFillet(radius, selected_edges)
    obj.Shape = new_shape
    document.recompute()
    return document


def _chamfer(data, doc_dir):
    name = _object_name(data.get("object"), "object")
    distance = _mm(data.get("distance"), "distance")
    edge_indices = data.get("edge_indices")
    if edge_indices is not None:
        if not isinstance(edge_indices, list) or any(isinstance(x, bool) or not isinstance(x, int) or x <= 0 for x in edge_indices):
            raise ValueError("edge_indices must be a list of 1-based positive integers")
    document = _open_document(doc_dir, data)
    obj = _get_object(document, name)
    edges = obj.Shape.Edges
    num_edges = len(edges)
    if edge_indices:
        for idx in edge_indices:
            if not (1 <= idx <= num_edges):
                raise ValueError(f"edge index {idx} out of range [1, {num_edges}]")
        selected_edges = [edges[idx - 1] for idx in edge_indices]
    else:
        selected_edges = edges
    import Part
    if hasattr(obj.Shape, "makeChamfer"):
        new_shape = obj.Shape.makeChamfer(distance, selected_edges)
    elif hasattr(Part, "makeChamfer"):
        new_shape = Part.makeChamfer(obj.Shape, distance, selected_edges)
    else:
        new_shape = obj.Shape.makeChamfer(distance, selected_edges)
    obj.Shape = new_shape
    document.recompute()
    return document


def _loft(data, doc_dir):
    raw_sections = data.get("sections")
    if not isinstance(raw_sections, list) or len(raw_sections) < 2 or len(raw_sections) > 20:
        raise ValueError("sections must be a list of 2 to 20 cross-section profiles")
    sections = []
    for i, sec in enumerate(raw_sections):
        if not isinstance(sec, list) or len(sec) < 3 or len(sec) > 100:
            raise ValueError(f"sections[{i}] must contain 3 to 100 3D coordinate points")
        sec_points = []
        for j, pt in enumerate(sec):
            if not isinstance(pt, (list, tuple)) or len(pt) != 3:
                raise ValueError(f"sections[{i}][{j}] must be a 3D coordinate [x, y, z]")
            px = _coord(pt[0], f"sections[{i}][{j}][0]")
            py = _coord(pt[1], f"sections[{i}][{j}][1]")
            pz = _coord(pt[2], f"sections[{i}][{j}][2]")
            sec_points.append((px, py, pz))
        sections.append(sec_points)
    solid = bool(data.get("solid", True))
    ruled = bool(data.get("ruled", False))
    x, y, z = _position(data)

    document = _open_or_new(data, doc_dir)
    import FreeCAD
    import Part

    wires = []
    for sec in sections:
        if sec[0] != sec[-1]:
            sec = list(sec) + [sec[0]]
        pts_3d = [FreeCAD.Vector(px + x, py + y, pz + z) for px, py, pz in sec]
        wires.append(Part.makePolygon(pts_3d))

    try:
        loft_shape = Part.makeLoft(wires, solid, ruled)
    except TypeError:
        loft_shape = Part.makeLoft(wires, is_solid=solid, is_ruled=ruled)

    obj = document.addObject("Part::Feature", "Loft")
    obj.Shape = loft_shape
    document.recompute()
    return document


def _read_scene(data, doc_dir):
    return _open_document(doc_dir, data)


def _top_level_objects(document):
    """Objects with an empty `InList`: not consumed by another feature."""
    return [obj for obj in document.Objects if not obj.InList]


def _export_stl(document, path):
    import MeshPart
    top_level = _top_level_objects(document)
    if len(top_level) == 1:
        shape = top_level[0].Shape
    else:
        import Part
        shape = Part.makeCompound([obj.Shape for obj in top_level])
    mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.1, AngularDeflection=0.26, Relative=False)
    mesh.write(str(path))


_EXPORT_FORMATS = ("step", "stl", "dxf")


def _export_design(data, doc_dir):
    # Validated before any FreeCAD import, per the general worker contract:
    # malformed input must never reach a single FreeCAD call.
    fmt = data.get("format")
    if fmt not in _EXPORT_FORMATS:
        raise ValueError("format must be one of step, stl, dxf")
    document = _open_document(doc_dir, data)
    top_level = _top_level_objects(document)
    doc_path = _document_path(doc_dir, data)
    export_dir = doc_dir if doc_dir is not None else (doc_path.parent if doc_path else Path("."))
    export_path = Path(export_dir) / f"export.{fmt}"
    if fmt == "step":
        import Part
        Part.export(top_level, str(export_path))
    elif fmt == "stl":
        _export_stl(document, export_path)
    else:
        try:
            import importDXF
            importDXF.export(top_level, str(export_path))
        except Exception as exc:
            raise ValueError("dxf export unavailable in this FreeCAD installation") from exc
    return document


OPS = {
    "create_box": _create_box,
    "create_cylinder": _create_cylinder,
    "create_sphere": _create_sphere,
    "create_cone": _create_cone,
    "extrude_rect": _extrude_rect,
    "create_wedge": _create_wedge,
    "extrude_polygon": _extrude_polygon,
    "boolean_cut": _boolean_cut,
    "boolean_union": _boolean_union,
    "boolean_intersect": _boolean_intersect,
    "fillet": _fillet,
    "chamfer": _chamfer,
    "loft": _loft,
    "translate_object": _translate_object,
    "rotate_object": _rotate_object,
    "scale_object": _scale_object,
    "read_scene": _read_scene,
    "export_design": _export_design,
    "create_text_3d": _create_text_3d,
}

# Every op except the two read-only/non-mutating ones persists a change to disk.
MUTATING_OPS = set(OPS) - {"read_scene", "export_design"}


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
    native_path_str = data.get("native_path") or data.get("nativePath")
    native_path = Path(native_path_str) if native_path_str else None
    target_doc = _document_path(doc_dir, data)

    # Before any write, if targeting an existing document file, ensure backup sibling exists
    backup_file = None
    if target_doc and target_doc.is_file() and op in MUTATING_OPS:
        ts = int(time.time())
        backup_file = target_doc.parent / f"{target_doc.name}.{ts}.bak"
        counter = 1
        while backup_file.exists():
            backup_file = target_doc.parent / f"{target_doc.name}.{ts}_{counter}.bak"
            counter += 1
        import shutil
        shutil.copy2(target_doc, backup_file)

    try:
        document = handler(data, doc_dir)
        if op in MUTATING_OPS:
            # A reopened document already has a FileName; a new one is saved
            # under doc_dir or native_path.
            if native_path:
                if document.FileName:
                    document.save()
                else:
                    document.saveAs(str(native_path))
            elif document.FileName:
                document.save()
            else:
                target_p = _document_path(doc_dir, data)
                if target_p:
                    document.saveAs(str(target_p))
        if op == "read_scene":
            _write_scene(document, job_dir)
        _export_stl(document, Path(job_dir) / "preview.stl")
        import FreeCAD
        FreeCAD.closeDocument(document.Name)
    except Exception:
        if backup_file and backup_file.is_file() and target_doc:
            import shutil
            shutil.copy2(backup_file, target_doc)
        raise


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
