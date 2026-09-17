"""Unit tests for headless Blender worker and BlenderStrategy.

Exercises input validation, BMesh lifecycle (including explicit bm.free()),
CLI argument parsing, mock bpy/bmesh execution, and error handling.
"""
from __future__ import annotations

import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from cadgpt_agent import blender_worker
from cadgpt_agent.blender_worker import (
    BOOLEAN_OPERATIONS,
    BOOLEAN_SOLVERS,
    EXPORT_FORMATS,
    PRIMITIVE_TYPES,
    TEXTURE_TYPES,
    parse_cli_args,
    run,
)
from cadgpt_agent.strategies.blender import BLENDER_OPS, BlenderStrategy


class MockBMVert:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.co = MagicMock()
        self.co.x = x
        self.co.y = y
        self.co.z = z
        self.normal = MagicMock()
        self.normal.x = 0.0
        self.normal.y = 0.0
        self.normal.z = 1.0


class MockBMFace:
    def __init__(self, normal=(0.0, 0.0, 1.0)):
        self.normal = MagicMock()
        self.normal.x = normal[0]
        self.normal.y = normal[1]
        self.normal.z = normal[2]
        self.smooth = False
        self.verts = [
            MockBMVert(0.0, 0.0, 0.0),
            MockBMVert(10.0, 0.0, 0.0),
            MockBMVert(0.0, 10.0, 0.0),
        ]


class MockBMesh:
    def __init__(self):
        self.faces = [MockBMFace()]
        self.verts = [MockBMVert(0.0, 0.0, 0.0), MockBMVert(10.0, 0.0, 0.0), MockBMVert(0.0, 10.0, 0.0)]
        self.edges = []
        self.freed = False

    def from_mesh(self, mesh):
        pass

    def to_mesh(self, mesh):
        pass

    def free(self):
        self.freed = True

    class faces_lookup:
        @staticmethod
        def ensure_lookup_table():
            pass

    class verts_lookup:
        @staticmethod
        def ensure_lookup_table():
            pass

    class edges_lookup:
        @staticmethod
        def ensure_lookup_table():
            pass


class MockModifier:
    def __init__(self, name, mod_type):
        self.name = name
        self.type = mod_type
        self.subdivision_type = None
        self.levels = 0
        self.render_levels = 0
        self.texture = None
        self.strength = 1.0
        self.mid_level = 0.5
        self.operation = None
        self.solver = None
        self.object = None


class MockBlenderObject:
    def __init__(self, name, obj_type="MESH"):
        self.name = name
        self.type = obj_type
        self.data = MagicMock()
        self.data.name = name
        self.data.polygons = []
        self.data.vertices = []
        self.location = MagicMock(x=0.0, y=0.0, z=0.0)
        self.dimensions = MagicMock(x=10.0, y=10.0, z=10.0)
        self.modifiers = MagicMock()
        self._modifier_store = {}
        self.modifiers.new.side_effect = self._add_modifier
        self.modifiers.get.side_effect = self._get_modifier
        self.hide_viewport = False
        self.hide_render = False

    def _add_modifier(self, name, type):
        mod = MockModifier(name, type)
        self._modifier_store[name] = mod
        return mod

    def _get_modifier(self, name, default=None):
        return self._modifier_store.get(name, default)


class BlenderWorkerValidationTests(unittest.TestCase):
    """Tests parameter validation across all 5 Blender operations."""

    def test_create_blender_mesh_validation(self):
        valid = {
            "name": "Base_Cube",
            "primitive_type": "cube",
            "dimensions": {"x": 50.0, "y": 30.0, "z": 10.0},
            "subdivisions": 2,
            "location": {"x": 10.0, "y": 0.0, "z": -5.0},
            "smooth_shading": True,
            "confirmed": True,
        }
        # Missing confirmed
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "confirmed": False}, None, Path("."))

        # Invalid primitive_type
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "primitive_type": "teapot"}, None, Path("."))

        # Subdivisions out of bounds
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "subdivisions": 5}, None, Path("."))
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "subdivisions": -1}, None, Path("."))

        # Dimensions negative or non-finite
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "dimensions": {"x": -1.0, "y": 10.0, "z": 10.0}}, None, Path("."))
        with self.assertRaises(ValueError):
            blender_worker.create_blender_mesh({**valid, "dimensions": {"x": float("nan"), "y": 10.0, "z": 10.0}}, None, Path("."))

    def test_extrude_subdivide_mesh_validation(self):
        valid = {
            "object_name": "BaseCage",
            "extrude_distance": 15.0,
            "subdivision_levels": 3,
            "crease_edges": 0.8,
            "confirmed": True,
        }
        # Missing confirmed
        with self.assertRaises(ValueError):
            blender_worker.extrude_subdivide_mesh({**valid, "confirmed": False}, None, Path("."))

        # Invalid distance
        with self.assertRaises(ValueError):
            blender_worker.extrude_subdivide_mesh({**valid, "extrude_distance": 20000.0}, None, Path("."))

        # Invalid subdivision levels
        with self.assertRaises(ValueError):
            blender_worker.extrude_subdivide_mesh({**valid, "subdivision_levels": 0}, None, Path("."))
        with self.assertRaises(ValueError):
            blender_worker.extrude_subdivide_mesh({**valid, "subdivision_levels": 6}, None, Path("."))

        # Invalid crease_edges
        with self.assertRaises(ValueError):
            blender_worker.extrude_subdivide_mesh({**valid, "crease_edges": 1.5}, None, Path("."))

    def test_displace_sculpt_mesh_validation(self):
        valid = {
            "object_name": "Terrain",
            "displace_strength": 5.0,
            "midlevel": 0.5,
            "texture_type": "voronoi",
            "texture_scale": 12.5,
            "voxel_remesh_size": 1.0,
            "confirmed": True,
        }
        # Missing confirmed
        with self.assertRaises(ValueError):
            blender_worker.displace_sculpt_mesh({**valid, "confirmed": False}, None, Path("."))

        # Invalid texture_type
        with self.assertRaises(ValueError):
            blender_worker.displace_sculpt_mesh({**valid, "texture_type": "perlin"}, None, Path("."))

        # Invalid midlevel
        with self.assertRaises(ValueError):
            blender_worker.displace_sculpt_mesh({**valid, "midlevel": 1.5}, None, Path("."))

        # Invalid texture_scale
        with self.assertRaises(ValueError):
            blender_worker.displace_sculpt_mesh({**valid, "texture_scale": 0.0}, None, Path("."))

        # Invalid voxel_remesh_size
        with self.assertRaises(ValueError):
            blender_worker.displace_sculpt_mesh({**valid, "voxel_remesh_size": 150.0}, None, Path("."))

    def test_boolean_blender_mesh_validation(self):
        valid = {
            "target_object": "Handle",
            "tool_object": "Cutter",
            "operation": "difference",
            "solver": "exact",
            "confirmed": True,
        }
        # Missing confirmed
        with self.assertRaises(ValueError):
            blender_worker.boolean_blender_mesh({**valid, "confirmed": False}, None, Path("."))

        # Invalid operation
        with self.assertRaises(ValueError):
            blender_worker.boolean_blender_mesh({**valid, "operation": "xor"}, None, Path("."))

        # Invalid solver
        with self.assertRaises(ValueError):
            blender_worker.boolean_blender_mesh({**valid, "solver": "approximate"}, None, Path("."))

    def test_export_blender_scene_validation(self):
        valid = {
            "format": "gltf",
            "apply_modifiers": True,
            "confirmed": True,
        }
        # Missing confirmed
        with self.assertRaises(ValueError):
            blender_worker.export_blender_scene({**valid, "confirmed": False}, None, Path("."))

        # Invalid format
        with self.assertRaises(ValueError):
            blender_worker.export_blender_scene({**valid, "format": "3ds"}, None, Path("."))

    def test_cli_argument_parsing(self):
        # Full blender invocation with --
        argv1 = ["blender", "-b", "--factory-startup", "--python", "worker.py", "--", "/path/to/request.json", "/path/to/result.json"]
        req, res = parse_cli_args(argv1)
        self.assertEqual(str(req), "/path/to/request.json")
        self.assertEqual(str(res), "/path/to/result.json")

        # Direct script invocation without --
        argv2 = ["worker.py", "req.json", "res.json"]
        req2, res2 = parse_cli_args(argv2)
        self.assertEqual(str(req2), "req.json")
        self.assertEqual(str(res2), "res.json")

        # Incomplete arguments
        with self.assertRaises(ValueError):
            parse_cli_args(["worker.py", "only_one.json"])


class BlenderWorkerMockExecutionTests(unittest.TestCase):
    """Tests BMesh lifecycle and operation execution using mocked bpy and bmesh."""

    def setUp(self):
        self.mock_bpy = MagicMock()
        self.mock_bmesh = MagicMock()

        self.objects_store = {}
        self.textures_store = {}

        self.mock_bpy.data.objects = MagicMock()
        self.mock_bpy.data.objects.__iter__.side_effect = lambda: iter(self.objects_store.values())
        self.mock_bpy.data.objects.get.side_effect = lambda k, default=None: self.objects_store.get(k, default)
        self.mock_bpy.data.objects.remove.side_effect = lambda obj, do_unlink=True: self.objects_store.pop(obj.name, None)

        def mock_new_obj(name, mesh):
            obj = MockBlenderObject(name)
            self.objects_store[name] = obj
            return obj

        self.mock_bpy.data.objects.new.side_effect = mock_new_obj
        self.mock_bpy.data.meshes.new.side_effect = lambda name: MagicMock(name=name)

        def mock_new_tex(name, type):
            tex = MagicMock(name=name, type=type)
            self.textures_store[name] = tex
            return tex

        self.mock_bpy.data.textures.get.side_effect = lambda k, default=None: self.textures_store.get(k, default)
        self.mock_bpy.data.textures.new.side_effect = mock_new_tex

        self.active_bm = None

        def mock_bmesh_new():
            self.active_bm = MockBMesh()
            return self.active_bm

        self.mock_bmesh.new.side_effect = mock_bmesh_new
        self.mock_bmesh.types.BMVert = MockBMVert

    def test_create_blender_mesh_cube_frees_bmesh(self):
        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            res = blender_worker.create_blender_mesh(
                {
                    "op": "create_blender_mesh",
                    "name": "TestCube",
                    "primitive_type": "cube",
                    "dimensions": {"x": 100.0, "y": 50.0, "z": 20.0},
                    "subdivisions": 2,
                    "smooth_shading": True,
                    "confirmed": True,
                },
                None,
                Path("."),
            )
            self.assertEqual(res["name"], "TestCube")
            self.assertEqual(res["subdivisions"], 2)
            self.assertIn("TestCube", self.objects_store)
            obj = self.objects_store["TestCube"]
            self.assertEqual(obj.dimensions, (100.0, 50.0, 20.0))
            subsurf = obj.modifiers.get("Subdivision")
            self.assertIsNotNone(subsurf)
            self.assertEqual(subsurf.levels, 2)
            self.assertTrue(self.active_bm.freed, "bm.free() must be explicitly invoked")

    def test_create_blender_mesh_monkey_primitive(self):
        def mock_monkey_add():
            monkey = MockBlenderObject("Suzanne")
            self.objects_store["Suzanne"] = monkey
            self.mock_bpy.context.active_object = monkey

        self.mock_bpy.ops.mesh.primitive_monkey_add.side_effect = mock_monkey_add

        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            res = blender_worker.create_blender_mesh(
                {
                    "op": "create_blender_mesh",
                    "name": "Suzanne",
                    "primitive_type": "monkey",
                    "subdivisions": 1,
                    "confirmed": True,
                },
                None,
                Path("."),
            )
            self.assertEqual(res["name"], "Suzanne")
            self.assertTrue(self.active_bm.freed, "bm.free() must be explicitly invoked")

    def test_extrude_subdivide_mesh_missing_object_raises(self):
        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            with self.assertRaises(ValueError) as ctx:
                blender_worker.extrude_subdivide_mesh(
                    {
                        "op": "extrude_subdivide_mesh",
                        "object_name": "NonExistentMesh",
                        "extrude_distance": 10.0,
                        "subdivision_levels": 2,
                        "confirmed": True,
                    },
                    None,
                    Path("."),
                )
            self.assertIn("not found in scene", str(ctx.exception))

    def test_extrude_subdivide_mesh_success_and_frees_bmesh(self):
        obj = MockBlenderObject("BaseCage")
        self.objects_store["BaseCage"] = obj

        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            res = blender_worker.extrude_subdivide_mesh(
                {
                    "op": "extrude_subdivide_mesh",
                    "object_name": "BaseCage",
                    "extrude_distance": 15.0,
                    "subdivision_levels": 3,
                    "crease_edges": 0.8,
                    "confirmed": True,
                },
                None,
                Path("."),
            )
            self.assertEqual(res["object_name"], "BaseCage")
            self.assertEqual(res["subdivision_levels"], 3)
            subsurf = obj.modifiers.get("Subdivision")
            self.assertIsNotNone(subsurf)
            self.assertEqual(subsurf.levels, 3)
            self.assertTrue(self.active_bm.freed, "bm.free() must be explicitly invoked")

    def test_displace_sculpt_mesh_configures_texture_and_modifier(self):
        obj = MockBlenderObject("TerrainMesh")
        self.objects_store["TerrainMesh"] = obj

        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            res = blender_worker.displace_sculpt_mesh(
                {
                    "op": "displace_sculpt_mesh",
                    "object_name": "TerrainMesh",
                    "displace_strength": 5.0,
                    "midlevel": 0.5,
                    "texture_type": "voronoi",
                    "texture_scale": 12.5,
                    "voxel_remesh_size": 1.0,
                    "confirmed": True,
                },
                None,
                Path("."),
            )
            self.assertEqual(res["object_name"], "TerrainMesh")
            mod = obj.modifiers.get("Displace")
            self.assertIsNotNone(mod)
            self.assertEqual(mod.strength, 5.0)
            self.assertIn("Displace_TerrainMesh_voronoi", self.textures_store)

    def test_boolean_blender_mesh_subtracts_and_removes_tool(self):
        target = MockBlenderObject("Handle")
        tool = MockBlenderObject("CylinderCutter")
        self.objects_store["Handle"] = target
        self.objects_store["CylinderCutter"] = tool

        with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
            res = blender_worker.boolean_blender_mesh(
                {
                    "op": "boolean_blender_mesh",
                    "target_object": "Handle",
                    "tool_object": "CylinderCutter",
                    "operation": "difference",
                    "solver": "exact",
                    "confirmed": True,
                },
                None,
                Path("."),
            )
            self.assertEqual(res["target_object"], "Handle")
            self.assertNotIn("CylinderCutter", self.objects_store, "tool object must be removed from scene")
            mod = target.modifiers.get("Boolean")
            self.assertIsNotNone(mod)
            self.assertEqual(mod.operation, "DIFFERENCE")

    def test_export_blender_scene_writes_stl_and_blend(self):
        obj = MockBlenderObject("ExportMesh")
        self.objects_store["ExportMesh"] = obj

        with tempfile.TemporaryDirectory() as td:
            job_dir = Path(td)
            doc_dir = job_dir / "project"
            doc_dir.mkdir()
            (doc_dir / "cad").mkdir()
            (doc_dir / "meshes").mkdir()

            with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
                res = blender_worker.export_blender_scene(
                    {
                        "op": "export_blender_scene",
                        "format": "gltf",
                        "apply_modifiers": True,
                        "confirmed": True,
                    },
                    doc_dir,
                    job_dir,
                )
                self.assertEqual(res["format"], "gltf")
                preview_stl = Path(res["preview_stl"])
                self.assertTrue(preview_stl.is_file(), "preview.stl must exist")
                stl_size = preview_stl.stat().st_size
                # Verify exact 84 + 50*N binary STL size formula
                self.assertGreaterEqual(stl_size, 84)
                self.assertEqual((stl_size - 84) % 50, 0)

    def test_run_dispatcher_success_and_error(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            req_path = d / "request.json"
            res_path = d / "result.json"

            # Valid run
            req_path.write_text(
                json.dumps({
                    "op": "create_blender_mesh",
                    "name": "Box",
                    "primitive_type": "cube",
                    "confirmed": True,
                }),
                encoding="utf-8",
            )
            with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
                run(req_path, res_path)
                self.assertTrue(res_path.is_file())
                result_data = json.loads(res_path.read_text(encoding="utf-8"))
                self.assertEqual(result_data["status"], "success")
                self.assertEqual(result_data["op"], "create_blender_mesh")

            # Error run: invalid primitive
            req_path.write_text(
                json.dumps({
                    "op": "create_blender_mesh",
                    "name": "Bad",
                    "primitive_type": "invalid_shape",
                    "confirmed": True,
                }),
                encoding="utf-8",
            )
            with patch.dict("sys.modules", {"bpy": self.mock_bpy, "bmesh": self.mock_bmesh}):
                with self.assertRaises(ValueError):
                    run(req_path, res_path)
                result_data = json.loads(res_path.read_text(encoding="utf-8"))
                self.assertEqual(result_data["status"], "error")


class BlenderStrategyTests(unittest.TestCase):
    """Tests BlenderStrategy invocation parameters, argv shape, and artifacts."""

    def test_strategy_supports_operations(self):
        strategy = BlenderStrategy()
        for op in BLENDER_OPS:
            self.assertTrue(strategy.supports(op), f"BlenderStrategy must support {op}")
        self.assertFalse(strategy.supports("create_box"))
        self.assertFalse(strategy.supports("extrude_rect"))

    def test_build_argv_enforces_background_and_factory_startup(self):
        strategy = BlenderStrategy()
        cad_path = Path("/usr/bin/blender")
        job_dir = Path("/tmp/cadgpt/jobs/test-job")
        doc_dir = Path("/tmp/cadgpt/documents/test-doc")

        argv = strategy.build_argv(cad_path, job_dir, doc_dir)
        self.assertEqual(argv[0], str(cad_path))
        self.assertIn("--background", argv)
        self.assertIn("--factory-startup", argv)
        self.assertIn("--python", argv)
        self.assertIn("--", argv)
        worker_idx = argv.index("--python") + 1
        self.assertTrue(argv[worker_idx].endswith("blender_worker.py"))
        dash_idx = argv.index("--")
        self.assertEqual(argv[dash_idx + 1], str(job_dir / "request.json"))
        self.assertEqual(argv[dash_idx + 2], str(job_dir / "result.json"))

    def test_artifacts_resolution(self):
        strategy = BlenderStrategy()
        job_dir = Path("/tmp/cadgpt/jobs/test-job")
        doc_dir = Path("/tmp/cadgpt/documents/test-doc")

        art = strategy.artifacts("create_blender_mesh", job_dir, doc_dir)
        self.assertEqual(art["native"], doc_dir / "design.blend")
        self.assertEqual(art["mesh"], job_dir / "preview.stl")
        self.assertIsNone(art["scene"])

        art_scene = strategy.artifacts("read_scene", job_dir, doc_dir)
        self.assertEqual(art_scene["scene"], job_dir / "scene.json")


if __name__ == "__main__":
    unittest.main()
