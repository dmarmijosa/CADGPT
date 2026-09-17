# blender-execution-engine (NEW)

Purpose: Enable headless 3D mesh modeling, procedural subdivision surfaces, procedural texture displacement, mesh booleans, and multi-format scene exports in Blender via isolated subprocess execution without embedding AI models inside the worker.

---

### Requirement: Headless Subprocess Worker Execution & Isolation
The agent MUST execute Blender operations using a dedicated headless worker script (`blender_worker.py`) launched via subprocess:
1. **Subprocess Invocation**:
   The execution command MUST strictly follow:
   ```bash
   blender --background --factory-startup --python <agent_path>/blender_worker.py -- <job_dir>/request.json <job_dir>/result.json
   ```
   - `--background` (`-b`): MUST run Blender headlessly without instantiating an X11, Wayland, or Win32 display window.
   - `--factory-startup`: MUST be enforced on every invocation to suppress user preferences, third-party add-ons, or custom default blend files.
2. **Execution Timeout**:
   - The subprocess execution MUST enforce a strict timeout of 120 seconds.
   - If execution exceeds 120 seconds, the agent MUST terminate the subprocess (`process.kill()`) and return a timeout failure.
3. **Diagnostic Capture**:
   - On error or non-zero exit code, the agent MUST capture the tail buffer of `stdout` and `stderr` (up to 4096 bytes) and record it in the job result.
4. **Memory Management**:
   - The worker script MUST explicitly invoke `bm.free()` after procedural BMesh manipulations to prevent memory leaks across iterative modifier evaluations.
5. **Architectural Invariant**:
   - The worker and MCP server MUST NOT embed any artificial intelligence, machine learning model weights, or local inference engines. All intelligence resides strictly in external clients calling typed MCP operations.

#### Scenario: Headless execution produces deterministic result
- GIVEN a valid Blender job payload in `<job_dir>/request.json`
- WHEN the agent launches Blender with `--background` and `--factory-startup`
- THEN Blender executes headlessly, processes the operation, and writes `<job_dir>/result.json` with status `"success"`

#### Scenario: Worker execution exceeding 120 seconds is terminated
- GIVEN a complex procedural operation that runs longer than 120 seconds
- WHEN the execution timer expires
- THEN the agent kills the subprocess and marks the job as failed with a timeout error

#### Scenario: Worker crash captures diagnostic tail
- GIVEN an invalid modifier parameter that triggers a worker script exception
- WHEN Blender exits with a non-zero exit code
- THEN the agent captures the last 4096 bytes of stderr/stdout and returns it in the error response

---

### Requirement: Mesh Primitive Creation (`create_blender_mesh`)
The worker MUST support `create_blender_mesh` to construct base mesh primitives with quad-dominant topology:
1. **Supported Primitives**:
   The parameter `primitive_type` MUST support: `'cube'`, `'cylinder'`, `'uv_sphere'`, `'icosphere'`, `'torus'`, `'monkey'`, and `'grid'`.
2. **Parameters**:
   - `name`: String identifier (1–60 characters, alphanumeric with underscores/hyphens).
   - `dimensions`: Optional `{ x, y, z }` object specifying scale in millimeters (finite positive numbers $\le 10000\text{ mm}$).
   - `subdivisions`: Optional integer between 0 and 4 (default `0`). When $>0$, applies Catmull-Clark subdivision modifier.
   - `location`: Optional `{ x, y, z }` world position in millimeters bounded within $[-100000, 100000]\text{ mm}$.
   - `smooth_shading`: Boolean (default `true`). When `true`, enables smooth face normals (`use_smooth = True`).
   - `confirmed`: Literal `true`.
3. **Scene Lifecycle**:
   - If starting a new design, the worker MUST clear default scene objects (default cube, lamp, camera) before constructing the mesh.
   - The newly created object MUST be assigned the specified `name`.

#### Scenario: Create subdivided monkey primitive with smooth shading
- GIVEN a job with `op = "create_blender_mesh"`, `name = "Suzanne"`, `primitive_type = "monkey"`, `subdivisions = 2`, `smooth_shading = true`, and `confirmed = true`
- WHEN the worker executes
- THEN it creates a quad-dominant Suzanne mesh, applies a subdivision surface modifier of level 2, enables smooth shading, and writes `result.json`

#### Scenario: Primitive dimensions scaled in millimeters
- GIVEN a job with `op = "create_blender_mesh"`, `primitive_type = "cube"`, and `dimensions = { x: 50.0, y: 30.0, z: 10.0 }`
- WHEN the worker executes
- THEN the resulting cube dimensions are set to exactly 50mm by 30mm by 10mm

---

### Requirement: Extrusion and Subdivision Surfaces (`extrude_subdivide_mesh`)
The worker MUST support `extrude_subdivide_mesh` to perform normal-directed polygon extrusion and Catmull-Clark subdivision:
1. **Parameters**:
   - `object_name`: String identifier of an existing mesh object in the scene.
   - `extrude_distance`: Finite number in $[-10000, 10000]\text{ mm}$ specifying extrusion distance along face normals.
   - `subdivision_levels`: Integer between 1 and 5 specifying Catmull-Clark modifier levels.
   - `crease_edges`: Optional number between 0.0 and 1.0 (or boolean) specifying edge crease weight to retain crisp boundaries during subdivision.
   - `confirmed`: Literal `true`.
2. **BMesh Processing**:
   - The worker MUST load the object geometry into BMesh, identify boundary or selected faces, extrude them along normal vectors, and commit back to mesh data.
   - The worker MUST apply a `Subsurf` modifier configured to Catmull-Clark with `levels = subdivision_levels` and `render_levels = subdivision_levels`.
   - The worker MUST free the BMesh instance upon completion.

#### Scenario: Extrude faces and apply Catmull-Clark subdivision
- GIVEN an existing mesh named `"BaseCage"`
- WHEN `extrude_subdivide_mesh` executes with `extrude_distance = 15.0`, `subdivision_levels = 3`, and `crease_edges = 0.8`
- THEN the faces are extruded outward by 15 mm, edge crease weights are set to 0.8, and a level-3 subdivision surface modifier is active

#### Scenario: Nonexistent object name fails validation
- GIVEN a scene without an object named `"MissingMesh"`
- WHEN `extrude_subdivide_mesh` runs with `object_name = "MissingMesh"`
- THEN the worker raises an error indicating the object does not exist in the scene

---

### Requirement: Procedural Texture Displacement & Sculpting (`displace_sculpt_mesh`)
The worker MUST support `displace_sculpt_mesh` to generate organic surface relief and optional voxel remeshing:
1. **Parameters**:
   - `object_name`: String identifier of target mesh object.
   - `displace_strength`: Finite number in $[-10000, 10000]\text{ mm}$ specifying displacement amplitude.
   - `midlevel`: Finite number between 0.0 and 1.0 (default `0.5`).
   - `texture_type`: Enum `['clouds', 'voronoi', 'wood', 'marble', 'musgrave']`.
   - `texture_scale`: Finite positive number in $(0, 1000]$ specifying noise feature size.
   - `voxel_remesh_size`: Optional finite positive number in $(0, 100]\text{ mm}$. When supplied, executes OpenVDB voxel remeshing before or after displacement.
   - `confirmed`: Literal `true`.
2. **Modifier Pipeline**:
   - The worker MUST create a procedural texture of type `texture_type`, configure its noise parameters, and bind it to a `Displace` modifier.
   - If `voxel_remesh_size` is specified, the worker MUST evaluate voxel remeshing to reconstitute uniform manifold quad/triangle density across the sculpted surface.

#### Scenario: Apply Voronoi displacement to mesh surface
- GIVEN an existing mesh `"TerrainMesh"`
- WHEN `displace_sculpt_mesh` executes with `texture_type = "voronoi"`, `displace_strength = 5.0`, and `texture_scale = 12.5`
- THEN a Displace modifier is attached with a Voronoi texture offset by 5 mm amplitude

#### Scenario: Voxel remesh reconstructs uniform surface topology
- GIVEN a mesh with irregular stretched polygons
- WHEN `displace_sculpt_mesh` runs with `voxel_remesh_size = 1.0`
- THEN the worker applies OpenVDB voxel remeshing at 1.0 mm voxel resolution producing uniform manifold topology

---

### Requirement: Mesh Boolean Operations (`boolean_blender_mesh`)
The worker MUST support `boolean_blender_mesh` to execute CSG operations between polygonal meshes:
1. **Parameters**:
   - `target_object`: String identifier of modified object.
   - `tool_object`: String identifier of cutting/uniting object.
   - `operation`: Enum `['difference', 'union', 'intersect']`.
   - `solver`: Enum `['exact', 'fast']` (default `'exact'`).
   - `confirmed`: Literal `true`.
2. **Execution & Cleanup**:
   - The worker MUST attach a `BOOLEAN` modifier to `target_object` referencing `tool_object`.
   - The worker MUST apply the modifier into the base mesh.
   - Unless specified otherwise, the worker MUST remove or hide `tool_object` from the active scene so it does not interfere with visual renders or exports.

#### Scenario: Exact boolean difference carves cavity in target mesh
- GIVEN target mesh `"Handle"` and cutting tool mesh `"CylinderCutter"`
- WHEN `boolean_blender_mesh` executes with `operation = "difference"`, `solver = "exact"`
- THEN `"CylinderCutter"` geometry is subtracted from `"Handle"` and the modifier is applied to the mesh

---

### Requirement: Multi-Format Scene Export (`export_blender_scene`)
The worker MUST support `export_blender_scene` to produce binary STL, Wavefront OBJ, glTF, and native Blender project files:
1. **Parameters**:
   - `format`: Enum `['stl', 'obj', 'gltf', 'glb']`.
   - `apply_modifiers`: Boolean (default `true`). When `true`, all modifier stacks are baked into exported geometry.
   - `confirmed`: literal `true`.
2. **Output File Contracts**:
   - **Binary STL**: Exported to `meshes/preview.stl` adhering strictly to binary STL specifications ($84 + 50 \times N$ bytes).
   - **glTF / GLB**: Exported to `meshes/preview.glb` with WebGL-compatible vertex attributes and normal vectors.
   - **Native Blend**: The worker MUST save the full native project file to `cad/design.blend` preserving modifier stacks, materials, and object hierarchies.

#### Scenario: Export scene produces binary STL preview and GLB asset
- GIVEN a modified Blender scene with active subdivision modifiers
- WHEN `export_blender_scene` runs with `format = "gltf"` and `apply_modifiers = true`
- THEN the worker saves `cad/design.blend`, generates `meshes/preview.glb`, and exports `meshes/preview.stl` with baked modifiers
