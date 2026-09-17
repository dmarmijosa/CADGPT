## mcp-cad-operations (MODIFIED)

Purpose: Expand the allowlisted MCP tool catalog from 20 to 27 operations, introducing strict Zod parameter schemas and validation for 5 Blender organic modeling tools (`create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`) and 2 workspace governance tools (`audit_project_structure`, `reorganize_project_structure`).

### Requirement: Allowlisted Tool Schemas (no code/path parameters)
Each MCP tool MUST expose a strict Zod schema (`.strict()`) of typed, bounded parameters (numbers, enums, `deviceId`, `documentId`, `projectId`) and MUST NOT accept a parameter representing code, script text, shell command, or unvalidated file path. The allowlist MUST encompass exactly the 27 registered operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`, `analyze_image_to_cad`, `create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`, `audit_project_structure`, `reorganize_project_structure`).
(Previously: allowlist contained 20 operations without Blender modeling or workspace directory governance tools.)

#### Scenario: Schema rejects code-shaped input
- GIVEN the `create_box` schema
- WHEN a caller supplies an extra free-text/code field
- THEN validation fails and no job is enqueued

#### Scenario: Agent re-validates allowlist
- GIVEN a job payload whose `op` is not in the agent's allowlist
- WHEN the agent receives it
- THEN the agent refuses execution and reports failure without invoking any CAD or Blender process

#### Scenario: Schema rejects extra unexpected keys on advanced operations
- GIVEN the `create_wedge` tool schema
- WHEN a caller provides an unpermitted field such as `{ script: "Part.show(...)" }`
- THEN Zod schema validation fails with an unrecognized key error and no job is enqueued

#### Scenario: Schema rejects unexpected keys on 3D text operation
- GIVEN the `create_text_3d` tool schema
- WHEN a caller provides an unexpected field `{ font_script: "system.exec(...)" }`
- THEN Zod schema validation fails with an unrecognized key error and no job is enqueued

#### Scenario: Schema rejects code-shaped input on Blender tool
- GIVEN the `create_blender_mesh` tool schema
- WHEN a caller supplies an unexpected field `{ bpy_code: "bpy.ops.mesh.primitive_cube_add()" }`
- THEN Zod schema validation fails with an unrecognized key error and no job is enqueued

---

### Requirement: Parameter Schemas for Phase 5 CAD and Vision Operations
The API MUST export strict Zod validation schemas for `create_text_3d` and `analyze_image_to_cad` and register them with MCP annotations indicating mutation status:
1. `create_text_3d`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string between 1 and 64 characters.
   - `documentId`: optional UUID.
   - `name`: optional string identifier pattern (`^[A-Za-z][A-Za-z0-9_]{0,31}$|^[0-9A-F]{1,16}$`).
   - `text`: string between 1 and 120 UTF-8 characters.
   - `size`: finite positive number in $(0, 10000]\text{ mm}$ (capital letter height).
   - `thickness`: finite positive number in $(0, 10000]\text{ mm}$.
   - `mode`: enum `['flat', 'emboss', 'engrave']` (default `'flat'`).
   - `target_object`: optional string identifier; MUST be required if `mode` is `'emboss'` or `'engrave'`.
   - `plane`: enum `['XY', 'XZ', 'YZ']` (default `'XY'`).
   - `position`: optional `{ x, y, z }` coordinates bounded in `[-100000, 100000]`.
   - `tracking`: optional finite number in `[-5, 50]` (default `0`).
   - `font`: optional string between 1 and 120 characters.
   - `confirmed`: literal `true`.
2. `analyze_image_to_cad`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string between 1 and 64 characters.
   - `documentId`: optional UUID.
   - `name`: optional string identifier pattern.
   - `image_base64`: string with minimum length of 20 characters (raw base64 or Data URI).
   - `reference_dimension`: optional object containing:
     - `type`: enum `['width', 'height', 'points']`.
     - `value_mm`: finite positive number in $(0, 10000]\text{ mm}$.
     - `points`: optional array of exactly two 2D coordinate tuples `[[u1, v1], [u2, v2]]`.
   - `threshold_mode`: enum `['otsu', 'adaptive', 'canny']` (default `'otsu'`).
   - `invert`: boolean (default `false`).
   - `tolerance`: finite number in `[0.0001, 0.05]` (default `0.0025`).
   - `create_solid`: boolean (default `false`).
   - `depth`: optional finite positive number in $(0, 10000]\text{ mm}$; MUST be required when `create_solid` is `true`.
   - `plane`: enum `['XY', 'XZ', 'YZ']` (default `'XY'`).
   - `position`: optional `{ x, y, z }` coordinates.
   - `confirmed`: literal `true`.
(Previously: Defined Phase 5 operations `create_text_3d` and `analyze_image_to_cad`.)

#### Scenario: Valid create_text_3d flat request enqueues job
- GIVEN a caller invoking `create_text_3d` with `text = "CAD"`, `size = 10`, `thickness = 2`, `mode = "flat"`, and `confirmed = true`
- WHEN the schema validates the input
- THEN validation succeeds and the job is enqueued

#### Scenario: Emboss mode without target_object fails validation
- GIVEN a caller invoking `create_text_3d` with `mode = "emboss"` and omitting `target_object`
- WHEN the schema or tool handler validates the input
- THEN validation fails requiring `target_object` for embossing

#### Scenario: Valid analyze_image_to_cad request with solid generation enqueues job
- GIVEN a caller invoking `analyze_image_to_cad` with valid `image_base64`, `create_solid = true`, `depth = 12.0`, and `confirmed = true`
- WHEN the schema validates the input
- THEN validation succeeds and the pipeline executes

#### Scenario: analyze_image_to_cad rejects create_solid when depth is omitted
- GIVEN a caller invoking `analyze_image_to_cad` with `create_solid = true` but omitting `depth`
- WHEN the schema or handler validates the input
- THEN validation fails requiring `depth` when `create_solid` is true

---

### Requirement: Parameter Schemas for Phase 6 Blender and Governance Operations
The API MUST export strict Zod validation schemas (`.strict()`) for the 5 Blender operations and 2 workspace governance operations, registered with MCP annotations:
1. `create_blender_mesh`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string between 1 and 64 characters.
   - `documentId`: optional UUID.
   - `name`: optional string identifier (`^[A-Za-z0-9 _-]{1,60}$`).
   - `primitive_type`: enum `['cube', 'cylinder', 'uv_sphere', 'icosphere', 'torus', 'monkey', 'grid']`.
   - `dimensions`: optional `{ x, y, z }` object with finite positive numbers $\le 10000\text{ mm}$.
   - `subdivisions`: optional integer in $[0, 4]$ (default `0`).
   - `location`: optional `{ x, y, z }` coordinates in $[-100000, 100000]\text{ mm}$.
   - `smooth_shading`: optional boolean (default `true`).
   - `confirmed`: literal `true`.
2. `extrude_subdivide_mesh`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string.
   - `documentId`: optional UUID.
   - `object_name`: string identifier (`^[A-Za-z0-9 _-]{1,60}$`).
   - `extrude_distance`: finite number in $[-10000, 10000]\text{ mm}$.
   - `subdivision_levels`: integer in $[1, 5]$ (default `1`).
   - `crease_edges`: optional finite number in $[0.0, 1.0]$.
   - `confirmed`: literal `true`.
3. `displace_sculpt_mesh`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string.
   - `documentId`: optional UUID.
   - `object_name`: string identifier.
   - `displace_strength`: finite number in $[-10000, 10000]\text{ mm}$.
   - `midlevel`: optional finite number in $[0.0, 1.0]$ (default `0.5`).
   - `texture_type`: enum `['clouds', 'voronoi', 'wood', 'marble', 'musgrave']`.
   - `texture_scale`: finite positive number in $(0, 1000]$.
   - `voxel_remesh_size`: optional finite positive number in $(0, 100]\text{ mm}$.
   - `confirmed`: literal `true`.
4. `boolean_blender_mesh`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string.
   - `documentId`: optional UUID.
   - `target_object`: string identifier.
   - `tool_object`: string identifier.
   - `operation`: enum `['difference', 'union', 'intersect']`.
   - `solver`: optional enum `['exact', 'fast']` (default `'exact'`).
   - `confirmed`: literal `true`.
5. `export_blender_scene`:
   - `deviceId`: optional UUID.
   - `cadId`: optional string.
   - `documentId`: optional UUID.
   - `format`: enum `['stl', 'obj', 'gltf', 'glb']`.
   - `apply_modifiers`: optional boolean (default `true`).
   - `confirmed`: literal `true`.
6. `audit_project_structure`:
   - `deviceId`: optional UUID.
   - `projectId`: UUID.
7. `reorganize_project_structure`:
   - `deviceId`: optional UUID.
   - `projectId`: UUID.
   - `confirmed`: literal `true`.
(Previously: Phase 6 Blender and workspace governance operations were not registered in MCP catalog.)

#### Scenario: Valid create_blender_mesh request enqueues job
- GIVEN a caller invoking `create_blender_mesh` with `primitive_type = "monkey"`, `subdivisions = 2`, `smooth_shading = true`, and `confirmed = true`
- WHEN the schema validates the input
- THEN validation succeeds and the job is enqueued

#### Scenario: create_blender_mesh rejects invalid primitive type
- GIVEN a caller invoking `create_blender_mesh` with `primitive_type = "teapot"`
- WHEN the schema validates the input
- THEN validation fails with an invalid enum value error and no job is enqueued

#### Scenario: audit_project_structure runs as read-only tool
- GIVEN a caller invoking `audit_project_structure` with a valid `projectId`
- WHEN the schema validates the input
- THEN validation succeeds without requiring `confirmed: true` because the tool is read-only

#### Scenario: reorganize_project_structure requires confirmed: true
- GIVEN a caller invoking `reorganize_project_structure` with `projectId` but omitting `confirmed`
- WHEN the schema validates the input
- THEN validation fails requiring `confirmed: true` before executing file reorganization
