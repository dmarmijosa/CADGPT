## mcp-cad-operations (MODIFIED)

Purpose: Expand the allowlisted MCP tool catalog from 18 to 20 operations, introducing strict Zod parameter schemas and validation for `create_text_3d` and `analyze_image_to_cad`.

### Requirement: Allowlisted Tool Schemas (no code/path parameters)
Each MCP tool MUST expose a strict Zod schema (`.strict()`) of typed, bounded parameters (numbers, enums, `deviceId`, `documentId`) and MUST NOT accept a parameter representing code, script text, shell command, or unvalidated file path. The allowlist MUST encompass exactly the 20 registered operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`, `analyze_image_to_cad`).
(Previously: allowlist contained 18 operations without typography or image analysis.)

#### Scenario: Schema rejects code-shaped input
- GIVEN the `create_box` schema
- WHEN a caller supplies an extra free-text/code field
- THEN validation fails and no job is enqueued

#### Scenario: Agent re-validates allowlist
- GIVEN a job payload whose `op` is not in the agent's allowlist
- WHEN the agent receives it
- THEN the agent refuses execution and reports failure without invoking any CAD process

#### Scenario: Schema rejects extra unexpected keys on advanced operations
- GIVEN the `create_wedge` tool schema
- WHEN a caller provides an unpermitted field such as `{ script: "Part.show(...)" }`
- THEN Zod schema validation fails with an unrecognized key error and no job is enqueued

#### Scenario: Schema rejects unexpected keys on 3D text operation
- GIVEN the `create_text_3d` tool schema
- WHEN a caller provides an unexpected field `{ font_script: "system.exec(...)" }`
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
