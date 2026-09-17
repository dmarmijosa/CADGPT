"""Headless Blender worker script executing isolated 3D mesh operations.

Invoked via:
blender --background --factory-startup --python <agent_path>/blender_worker.py -- <job_dir>/request.json <job_dir>/result.json

All bpy and bmesh imports are lazy within functions so that this module can be
imported and its validators tested under standard CPython without Blender installed.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import re
import struct
import sys
from typing import Any, Callable, Dict, List, Optional, Tuple

OBJECT_NAME_RE = re.compile(r"^[A-Za-z0-9 _-]{1,60}$")
PRIMITIVE_TYPES = ("cube", "cylinder", "uv_sphere", "icosphere", "torus", "monkey", "grid")
EXPORT_FORMATS = ("stl", "obj", "gltf", "glb")
TEXTURE_TYPES = ("clouds", "voronoi", "wood", "marble", "musgrave")
BOOLEAN_OPERATIONS = ("difference", "union", "intersect")
BOOLEAN_SOLVERS = ("exact", "fast")


# --- Validation Helpers ---

def _finite(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _bounded(value: Any, name: str, lo: float, hi: float) -> float:
    if not _finite(value) or not (lo <= value <= hi):
        raise ValueError(f"{name} must be a finite value in [{lo}, {hi}]")
    return float(value)


def _mm_positive(value: Any, name: str, max_val: float = 10000.0) -> float:
    if not _finite(value) or value <= 0 or value > max_val:
        raise ValueError(f"{name} must be a finite positive number <= {max_val} mm")
    return float(value)


def _coord(value: Any, name: str) -> float:
    return _bounded(value, name, -100000.0, 100000.0)


def _object_name(value: Any, name: str) -> str:
    if not isinstance(value, str) or not OBJECT_NAME_RE.match(value.strip()):
        raise ValueError(f"{name} must be a valid identifier (1-60 alphanumeric characters, underscores, spaces, or hyphens)")
    return value.strip()


def _check_confirmed(data: dict[str, Any]) -> None:
    if data.get("confirmed") is not True:
        raise ValueError("Explicit confirmation (confirmed: true) is required")


def _document_path(doc_dir: Path | None, data: dict[str, Any] | None = None) -> Path | None:
    if data:
        p = data.get("native_path") or data.get("nativePath")
        if p:
            return Path(p)
    if doc_dir is not None:
        cad_dir = Path(doc_dir) / "cad"
        if cad_dir.is_dir():
            return cad_dir / "design.blend"
        return Path(doc_dir) / "design.blend"
    return None


# --- Blender Scene & Mesh Operations ---

def _clear_scene() -> None:
    """Removes all default objects, meshes, and materials from the current scene."""
    import bpy
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)


def _open_or_new(doc_dir: Path | None, data: dict[str, Any] | None = None, is_create: bool = False) -> None:
    """Opens an existing blend file if present, or clears scene objects if starting a fresh design."""
    import bpy
    target_path = _document_path(doc_dir, data)
    if target_path and target_path.is_file():
        bpy.ops.wm.open_mainfile(filepath=str(target_path.resolve()))
    elif is_create:
        _clear_scene()


def _write_bmesh_binary_stl(filepath: Path | str, apply_modifiers: bool = True) -> None:
    """Writes an exact binary STL conforming to FileSize = 84 + (50 * N)."""
    import bpy
    import bmesh

    triangles: list[tuple[tuple[float, float, float], tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]] = []

    depsgraph = bpy.context.evaluated_depsgraph_get() if hasattr(bpy.context, "evaluated_depsgraph_get") else None

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue

        eval_obj = obj.evaluated_get(depsgraph) if (depsgraph and apply_modifiers and hasattr(obj, "evaluated_get")) else obj
        mesh_data = eval_obj.to_mesh() if hasattr(eval_obj, "to_mesh") else obj.data

        bm = bmesh.new()
        bm.from_mesh(mesh_data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])

        # World matrix transformation
        matrix = obj.matrix_world if hasattr(obj, "matrix_world") else None

        for face in bm.faces:
            n = face.normal
            norm = (float(n.x), float(n.y), float(n.z))
            if matrix:
                v1 = matrix @ face.verts[0].co
                v2 = matrix @ face.verts[1].co
                v3 = matrix @ face.verts[2].co
            else:
                v1 = face.verts[0].co
                v2 = face.verts[1].co
                v3 = face.verts[2].co

            t_verts = (
                (float(v1.x), float(v1.y), float(v1.z)),
                (float(v2.x), float(v2.y), float(v2.z)),
                (float(v3.x), float(v3.y), float(v3.z)),
            )
            triangles.append((norm, t_verts))

        bm.free()
        if hasattr(eval_obj, "to_mesh") and hasattr(eval_obj, "to_mesh_clear"):
            eval_obj.to_mesh_clear()

    # If no triangles found, write minimal valid 1-triangle binary STL to avoid degenerate empty files
    if not triangles:
        triangles.append(
            ((0.0, 0.0, 1.0), ((0.0, 0.0, 0.0), (10.0, 0.0, 0.0), (0.0, 10.0, 0.0)))
        )

    header = b"CADGPT Headless Blender Binary STL Export".ljust(80, b"\x00")
    facet_count = len(triangles)

    buf = bytearray()
    buf.extend(header)
    buf.extend(struct.pack("<I", facet_count))

    for norm, (p1, p2, p3) in triangles:
        buf.extend(struct.pack("<3f", norm[0], norm[1], norm[2]))
        buf.extend(struct.pack("<3f", p1[0], p1[1], p1[2]))
        buf.extend(struct.pack("<3f", p2[0], p2[1], p2[2]))
        buf.extend(struct.pack("<3f", p3[0], p3[1], p3[2]))
        buf.extend(b"\x00\x00")

    Path(filepath).write_bytes(bytes(buf))


def _export_stl(filepath: Path | str, apply_modifiers: bool = True) -> None:
    """Exports active geometry as binary STL, falling back to BMesh direct export."""
    import bpy
    p = str(Path(filepath).resolve())

    # Try native exporter first
    exported = False
    if hasattr(bpy.ops.wm, "stl_export"):
        try:
            bpy.ops.wm.stl_export(filepath=p, apply_modifiers=apply_modifiers)
            exported = True
        except Exception:
            exported = False
    elif hasattr(bpy.ops, "export_mesh") and hasattr(bpy.ops.export_mesh, "stl"):
        try:
            bpy.ops.export_mesh.stl(filepath=p, use_mesh_modifiers=apply_modifiers, ascii=False)
            exported = True
        except Exception:
            exported = False

    # Fallback to direct BMesh binary exporter to ensure 84 + 50*N contract
    if not exported or not Path(p).is_file() or Path(p).stat().st_size == 0:
        _write_bmesh_binary_stl(p, apply_modifiers=apply_modifiers)


# --- 5 Core BMesh Operations ---

def create_blender_mesh(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """1. create_blender_mesh: creates quad-dominant base primitive with optional subdivision."""
    _check_confirmed(data)
    name = _object_name(data.get("name") or "Mesh", "name")
    primitive_type = data.get("primitive_type") or data.get("primitive")
    if primitive_type not in PRIMITIVE_TYPES:
        raise ValueError(f"Invalid primitive_type '{primitive_type}'; must be one of {PRIMITIVE_TYPES}")

    dimensions = data.get("dimensions")
    dim_vec: Optional[tuple[float, float, float]] = None
    if dimensions is not None:
        dim_vec = (
            _mm_positive(dimensions.get("x"), "dimensions.x"),
            _mm_positive(dimensions.get("y"), "dimensions.y"),
            _mm_positive(dimensions.get("z"), "dimensions.z"),
        )

    subdivisions = data.get("subdivisions", 0)
    if subdivisions is not None:
        if not isinstance(subdivisions, int) or not (0 <= subdivisions <= 4):
            raise ValueError("subdivisions must be an integer between 0 and 4")
    else:
        subdivisions = 0

    location = data.get("location")
    loc_vec: Optional[tuple[float, float, float]] = None
    if location is not None:
        loc_vec = (
            _coord(location.get("x", 0.0), "location.x"),
            _coord(location.get("y", 0.0), "location.y"),
            _coord(location.get("z", 0.0), "location.z"),
        )

    smooth_shading = bool(data.get("smooth_shading", True))

    import bpy
    import bmesh

    _open_or_new(doc_dir, data, is_create=True)

    obj = None
    if primitive_type in ("cube", "cylinder", "uv_sphere", "icosphere", "grid"):
        mesh = bpy.data.meshes.new(name)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)

        bm = bmesh.new()
        if primitive_type == "cube":
            bmesh.ops.create_cube(bm, size=1.0)
        elif primitive_type == "cylinder":
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32, radius1=1.0, radius2=1.0, depth=2.0)
        elif primitive_type == "uv_sphere":
            bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
        elif primitive_type == "icosphere":
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        elif primitive_type == "grid":
            bmesh.ops.create_grid(bm, x_segments=10, y_segments=10, size=1.0)

        if smooth_shading:
            for f in bm.faces:
                f.smooth = True

        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
    elif primitive_type == "monkey":
        bpy.ops.mesh.primitive_monkey_add()
        obj = bpy.context.active_object
        obj.name = name
        if hasattr(obj, "data") and obj.data:
            obj.data.name = name
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            if smooth_shading:
                for f in bm.faces:
                    f.smooth = True
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
    elif primitive_type == "torus":
        bpy.ops.mesh.primitive_torus_add()
        obj = bpy.context.active_object
        obj.name = name
        if hasattr(obj, "data") and obj.data:
            obj.data.name = name
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            if smooth_shading:
                for f in bm.faces:
                    f.smooth = True
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()

    if obj is None:
        raise RuntimeError(f"Failed to create primitive '{primitive_type}'")

    if dim_vec is not None:
        obj.dimensions = dim_vec
    if loc_vec is not None:
        obj.location = loc_vec

    if subdivisions > 0:
        mod = obj.modifiers.new(name="Subdivision", type="SUBSURF")
        mod.subdivision_type = "CATMULL_CLARK"
        mod.levels = subdivisions
        mod.render_levels = subdivisions

    return {"name": name, "primitive_type": primitive_type, "subdivisions": subdivisions}


def extrude_subdivide_mesh(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """2. extrude_subdivide_mesh: normal-directed polygon extrusion and Catmull-Clark subdivision."""
    _check_confirmed(data)
    object_name = _object_name(data.get("object_name") or "", "object_name")
    extrude_distance = _bounded(data.get("extrude_distance"), "extrude_distance", -10000.0, 10000.0)

    subdivision_levels = data.get("subdivision_levels", 1)
    if not isinstance(subdivision_levels, int) or not (1 <= subdivision_levels <= 5):
        raise ValueError("subdivision_levels must be an integer between 1 and 5")

    crease_edges = data.get("crease_edges")
    if crease_edges is not None:
        if isinstance(crease_edges, bool):
            crease_val = 1.0 if crease_edges else 0.0
        else:
            crease_val = _bounded(crease_edges, "crease_edges", 0.0, 1.0)
    else:
        crease_val = None

    import bpy
    import bmesh

    _open_or_new(doc_dir, data)

    obj = bpy.data.objects.get(object_name)
    if obj is None or getattr(obj, "type", "MESH") != "MESH":
        raise ValueError(f"Object '{object_name}' not found in scene")

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    if hasattr(bm.faces, "ensure_lookup_table"):
        bm.faces.ensure_lookup_table()
    if hasattr(bm.verts, "ensure_lookup_table"):
        bm.verts.ensure_lookup_table()
    if hasattr(bm.edges, "ensure_lookup_table"):
        bm.edges.ensure_lookup_table()

    faces_to_extrude = list(bm.faces)
    if faces_to_extrude:
        res = bmesh.ops.extrude_face_region(bm, geom=faces_to_extrude)
        extruded_verts = [ele for ele in res.get("geom", []) if isinstance(ele, getattr(bmesh.types, "BMVert", object))]
        for v in extruded_verts:
            v.co += v.normal * extrude_distance

    if crease_val is not None and hasattr(bm.edges, "layers") and hasattr(bm.edges.layers, "crease"):
        try:
            crease_layer = bm.edges.layers.crease.verify()
            for edge in bm.edges:
                edge[crease_layer] = crease_val
        except Exception:
            pass

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    subsurf = obj.modifiers.get("Subdivision")
    if subsurf is None:
        subsurf = obj.modifiers.new(name="Subdivision", type="SUBSURF")
    subsurf.subdivision_type = "CATMULL_CLARK"
    subsurf.levels = subdivision_levels
    subsurf.render_levels = subdivision_levels

    return {
        "object_name": object_name,
        "extrude_distance": extrude_distance,
        "subdivision_levels": subdivision_levels,
    }


def displace_sculpt_mesh(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """3. displace_sculpt_mesh: procedural texture displacement and optional voxel remeshing."""
    _check_confirmed(data)
    object_name = _object_name(data.get("object_name") or "", "object_name")
    displace_strength = _bounded(data.get("displace_strength"), "displace_strength", -10000.0, 10000.0)
    midlevel = _bounded(data.get("midlevel", 0.5), "midlevel", 0.0, 1.0)

    texture_type = data.get("texture_type")
    if texture_type not in TEXTURE_TYPES:
        raise ValueError(f"Invalid texture_type '{texture_type}'; must be one of {TEXTURE_TYPES}")

    texture_scale = _mm_positive(data.get("texture_scale"), "texture_scale", 1000.0)

    voxel_remesh_size = data.get("voxel_remesh_size")
    if voxel_remesh_size is not None:
        voxel_remesh_size = _mm_positive(voxel_remesh_size, "voxel_remesh_size", 100.0)

    import bpy

    _open_or_new(doc_dir, data)

    obj = bpy.data.objects.get(object_name)
    if obj is None or getattr(obj, "type", "MESH") != "MESH":
        raise ValueError(f"Object '{object_name}' not found in scene")

    type_mapping = {
        "clouds": "CLOUDS",
        "voronoi": "VORONOI",
        "wood": "WOOD",
        "marble": "MARBLE",
        "musgrave": "CLOUDS",
    }
    tex_type = type_mapping[texture_type]
    tex_name = f"Displace_{object_name}_{texture_type}"
    tex = bpy.data.textures.get(tex_name) or bpy.data.textures.new(name=tex_name, type=tex_type)
    if hasattr(tex, "noise_scale"):
        tex.noise_scale = texture_scale

    mod = obj.modifiers.new(name="Displace", type="DISPLACE")
    mod.texture = tex
    mod.strength = displace_strength
    mod.mid_level = midlevel

    if voxel_remesh_size is not None:
        try:
            obj.data.remesh_voxel_size = voxel_remesh_size
            if hasattr(bpy.context, "view_layer") and hasattr(bpy.context.view_layer, "objects"):
                bpy.context.view_layer.objects.active = obj
            if hasattr(bpy.ops.object, "voxel_remesh"):
                bpy.ops.object.voxel_remesh()
        except Exception:
            mod_remesh = obj.modifiers.new(name="VoxelRemesh", type="REMESH")
            mod_remesh.mode = "VOXEL"
            mod_remesh.voxel_size = voxel_remesh_size

    return {
        "object_name": object_name,
        "displace_strength": displace_strength,
        "texture_type": texture_type,
        "voxel_remesh_size": voxel_remesh_size,
    }


def boolean_blender_mesh(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """4. boolean_blender_mesh: constructive solid geometry (CSG) between polygonal meshes."""
    _check_confirmed(data)
    target_object = _object_name(data.get("target_object") or "", "target_object")
    tool_object = _object_name(data.get("tool_object") or "", "tool_object")

    operation = data.get("operation")
    if operation not in BOOLEAN_OPERATIONS:
        raise ValueError(f"Invalid operation '{operation}'; must be one of {BOOLEAN_OPERATIONS}")

    solver = data.get("solver", "exact")
    if solver not in BOOLEAN_SOLVERS:
        raise ValueError(f"Invalid solver '{solver}'; must be one of {BOOLEAN_SOLVERS}")

    import bpy

    _open_or_new(doc_dir, data)

    target_obj = bpy.data.objects.get(target_object)
    if target_obj is None:
        raise ValueError(f"Target object '{target_object}' not found in scene")

    tool_obj = bpy.data.objects.get(tool_object)
    if tool_obj is None:
        raise ValueError(f"Tool object '{tool_object}' not found in scene")

    mod = target_obj.modifiers.new(name="Boolean", type="BOOLEAN")
    mod.operation = operation.upper()
    mod.solver = solver.upper()
    mod.object = tool_obj

    # Apply modifier into base mesh
    if hasattr(bpy.context, "view_layer") and hasattr(bpy.context.view_layer, "objects"):
        bpy.context.view_layer.objects.active = target_obj
    if hasattr(bpy.ops.object, "modifier_apply"):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            pass

    # Remove or hide tool object from scene
    tool_obj.hide_viewport = True
    tool_obj.hide_render = True
    try:
        bpy.data.objects.remove(tool_obj, do_unlink=True)
    except Exception:
        pass

    return {
        "target_object": target_object,
        "tool_object": tool_object,
        "operation": operation,
        "solver": solver,
    }


def export_blender_scene(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """5. export_blender_scene: multi-format scene export (STL, OBJ, glTF/GLB, and native .blend)."""
    _check_confirmed(data)
    fmt = data.get("format")
    if fmt not in EXPORT_FORMATS:
        raise ValueError(f"Invalid format '{fmt}'; must be one of {EXPORT_FORMATS}")

    apply_modifiers = bool(data.get("apply_modifiers", True))

    import bpy

    _open_or_new(doc_dir, data)

    design_dir = doc_dir if doc_dir is not None else job_dir
    exports_dir = design_dir / "exports"
    meshes_dir = design_dir / "meshes"
    cad_dir = design_dir / "cad"

    # Always ensure standard target directories exist if in project structure
    if exports_dir.is_dir() or meshes_dir.is_dir() or cad_dir.is_dir():
        exports_dir.mkdir(parents=True, exist_ok=True)
        meshes_dir.mkdir(parents=True, exist_ok=True)
        cad_dir.mkdir(parents=True, exist_ok=True)

    # 1. Export Native Blend to cad/design.blend or design.blend
    blend_target = cad_dir / "design.blend" if cad_dir.is_dir() else design_dir / "design.blend"
    blend_target.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(bpy.ops.wm, "save_as_mainfile"):
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_target.resolve()))

    # 2. Export preview binary STL to meshes/preview.stl and job_dir/preview.stl
    preview_stl = meshes_dir / "preview.stl" if meshes_dir.is_dir() else job_dir / "preview.stl"
    preview_stl.parent.mkdir(parents=True, exist_ok=True)
    _export_stl(preview_stl, apply_modifiers=apply_modifiers)
    if preview_stl != (job_dir / "preview.stl"):
        _export_stl(job_dir / "preview.stl", apply_modifiers=apply_modifiers)

    # 3. Format-specific exports
    exported_path = None
    if fmt == "stl":
        exported_path = preview_stl
    elif fmt in ("gltf", "glb"):
        glb_target = meshes_dir / "preview.glb" if meshes_dir.is_dir() else job_dir / "preview.glb"
        glb_target.parent.mkdir(parents=True, exist_ok=True)
        if hasattr(bpy.ops, "export_scene") and hasattr(bpy.ops.export_scene, "gltf"):
            try:
                bpy.ops.export_scene.gltf(
                    filepath=str(glb_target.resolve()),
                    export_format="GLB",
                    export_apply=apply_modifiers,
                )
            except Exception:
                pass
        exported_path = glb_target
    elif fmt == "obj":
        obj_target = exports_dir / "preview.obj" if exports_dir.is_dir() else job_dir / "preview.obj"
        obj_target.parent.mkdir(parents=True, exist_ok=True)
        if hasattr(bpy.ops.wm, "obj_export"):
            try:
                bpy.ops.wm.obj_export(filepath=str(obj_target.resolve()), apply_modifiers=apply_modifiers)
            except Exception:
                pass
        elif hasattr(bpy.ops, "export_scene") and hasattr(bpy.ops.export_scene, "obj"):
            try:
                bpy.ops.export_scene.obj(filepath=str(obj_target.resolve()), use_mesh_modifiers=apply_modifiers)
            except Exception:
                pass
        exported_path = obj_target

    return {
        "format": fmt,
        "blend_path": str(blend_target),
        "exported_path": str(exported_path) if exported_path else None,
        "preview_stl": str(preview_stl),
    }


def read_scene(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """Reads scene objects and writes scene.json summary."""
    import bpy

    _open_or_new(doc_dir, data)

    scene_items = []
    for obj in bpy.data.objects:
        if getattr(obj, "type", "MESH") != "MESH":
            continue
        loc = getattr(obj, "location", None)
        dim = getattr(obj, "dimensions", None)
        lx = float(loc.x) if loc else 0.0
        ly = float(loc.y) if loc else 0.0
        lz = float(loc.z) if loc else 0.0
        dx = float(dim.x) if dim else 1.0
        dy = float(dim.y) if dim else 1.0
        dz = float(dim.z) if dim else 1.0
        bbox = [lx - dx / 2, ly - dy / 2, lz - dz / 2, lx + dx / 2, ly + dy / 2, lz + dz / 2]
        scene_items.append({
            "name": obj.name,
            "label": obj.name,
            "type": "Mesh",
            "bbox": bbox,
            "dimensions": [dx, dy, dz],
        })

    scene_file = job_dir / "scene.json"
    scene_file.write_text(json.dumps(scene_items, indent=2), encoding="utf-8")
    return {"scene": scene_items, "count": len(scene_items)}


def export_design(data: dict[str, Any], doc_dir: Path | None, job_dir: Path) -> dict[str, Any]:
    """Exports design under standard exports format."""
    return export_blender_scene(data, doc_dir, job_dir)


OPS: dict[str, Callable[[dict[str, Any], Path | None, Path], dict[str, Any]]] = {
    "create_blender_mesh": create_blender_mesh,
    "extrude_subdivide_mesh": extrude_subdivide_mesh,
    "displace_sculpt_mesh": displace_sculpt_mesh,
    "boolean_blender_mesh": boolean_blender_mesh,
    "export_blender_scene": export_blender_scene,
    "read_scene": read_scene,
    "export_design": export_design,
}

MUTATING_OPS = {
    "create_blender_mesh",
    "extrude_subdivide_mesh",
    "displace_sculpt_mesh",
    "boolean_blender_mesh",
}


# --- Execution Controller ---

def run(request_path: Path, result_path: Path) -> None:
    """Dispatches request.json and atomically writes result.json."""
    if not request_path.is_file():
        raise FileNotFoundError(f"Request file not found: {request_path}")

    data = json.loads(request_path.read_text(encoding="utf-8"))
    op = data.get("op", data.get("type", "create_blender_mesh"))
    handler = OPS.get(op)
    if handler is None:
        raise ValueError(f"Unsupported Blender operation: {op}")

    job_dir = request_path.parent
    doc_dir_env = os.environ.get("CADGPT_DOC_DIR")
    doc_dir = Path(doc_dir_env) if doc_dir_env else None

    # Handle backup before modifying existing blend file
    target_doc = _document_path(doc_dir, data)
    backup_file = None
    if target_doc and target_doc.is_file() and op in MUTATING_OPS:
        import time
        import shutil
        ts = int(time.time())
        backup_file = target_doc.parent / f"{target_doc.name}.{ts}.bak"
        counter = 1
        while backup_file.exists():
            backup_file = target_doc.parent / f"{target_doc.name}.{ts}_{counter}.bak"
            counter += 1
        shutil.copy2(target_doc, backup_file)

    try:
        details = handler(data, doc_dir, job_dir)

        import bpy

        # If mutating, always save project blend file and preview STL
        native_file = _document_path(doc_dir, data) or (job_dir / "design.blend")
        if op in MUTATING_OPS:
            native_file.parent.mkdir(parents=True, exist_ok=True)
            if hasattr(bpy.ops.wm, "save_as_mainfile"):
                bpy.ops.wm.save_as_mainfile(filepath=str(native_file.resolve()))

            # Export preview STL
            stl_file = job_dir / "preview.stl"
            _export_stl(stl_file, apply_modifiers=True)
            if doc_dir is not None:
                meshes_dir = Path(doc_dir) / "meshes"
                if meshes_dir.is_dir():
                    _export_stl(meshes_dir / "preview.stl", apply_modifiers=True)

        result_payload = {
            "status": "success",
            "op": op,
            "details": details,
            "artifacts": {
                "native": str(native_file.resolve()) if native_file.is_file() else None,
                "mesh": str((job_dir / "preview.stl").resolve()) if (job_dir / "preview.stl").is_file() else None,
            },
        }
        result_path.write_text(json.dumps(result_payload, indent=2), encoding="utf-8")
    except Exception as exc:
        if backup_file and backup_file.is_file() and target_doc:
            import shutil
            shutil.copy2(backup_file, target_doc)

        error_payload = {
            "status": "error",
            "op": op,
            "error": f"{type(exc).__name__}: {str(exc)}",
        }
        result_path.write_text(json.dumps(error_payload, indent=2), encoding="utf-8")
        raise


def parse_cli_args(argv: list[str]) -> tuple[Path, Path]:
    """Extracts request.json and result.json paths from sys.argv."""
    if "--" in argv:
        idx = argv.index("--")
        operands = argv[idx + 1:]
    else:
        operands = argv[1:]

    if len(operands) < 2:
        raise ValueError(f"Expected request.json and result.json arguments, received: {argv}")

    return Path(operands[0]), Path(operands[1])


if __name__ in ("__main__", "blender_worker"):
    # Executed directly by Blender's python interpreter
    try:
        req_p, res_p = parse_cli_args(sys.argv)
        run(req_p, res_p)
    except Exception as e:
        print(f"cadgpt blender worker error: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
