## mcp-cad-operations (MODIFIED)

Purpose: Expand the allowlisted MCP tool catalog from 13 to 18 operations, introducing strict Zod parameter schemas and validation for `create_wedge`, `extrude_polygon`, `fillet`, `chamfer`, and `loft`.

### Requirement: Allowlisted Tool Schemas (no code/path parameters)
Each MCP tool MUST expose a strict Zod schema (`.strict()`) of typed, bounded parameters (numbers, enums, `deviceId`, `documentId`) and MUST NOT accept a parameter representing code, script text, shell command, or unvalidated file path. The allowlist MUST encompass exactly the 18 registered operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`).
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

### Requirement: Device and CAD Selection
Each tool MUST resolve a `deviceId` and target CAD before enqueueing; if the caller's device+CAD choice is ambiguous, the tool MUST ask instead of guessing.
#### Scenario: Ambiguous device requires explicit choice
- GIVEN owner has 2 paired devices with the same CAD
- WHEN owner invokes a create tool without `deviceId`
- THEN the tool returns a choice request

### Requirement: Identity From OIDC Subject
Tools MUST derive the owner from the verified OIDC `sub` and MUST NOT accept a username/owner parameter; tools take `deviceId`/`documentId` only.
#### Scenario: Owner not a parameter
- GIVEN any tool schema
- WHEN inspected
- THEN it has no `owner`/`username` field

---

### Requirement: Parameter Schemas for Advanced CAD Operations
The API MUST export strict Zod validation schemas for the 5 advanced operations and register them with MCP annotations indicating mutation status:
1. `create_wedge`:
   - `length`, `width`, `height`: finite positive numbers in `(0, 10000]`.
   - `top_length`: optional finite non-negative number in `[0, 10000]`.
   - `position`: optional `{ x, y, z }` coordinates in `[-100000, 100000]`.
   - `confirmed`: literal `true`.
2. `extrude_polygon`:
   - `points`: array of 3 to 100 2D coordinate tuples `[u, v]`, each coordinate bounded in `[-100000, 100000]`.
   - `depth`: finite positive number in `(0, 10000]`.
   - `plane`: enum `['XY', 'XZ', 'YZ']`.
   - `position`: optional `{ x, y, z }` coordinates.
   - `confirmed`: literal `true`.
3. `fillet`:
   - `documentId`: valid UUID pointing to an existing document.
   - `object`: string matching object identifier pattern (`^[A-Za-z][A-Za-z0-9_]{0,31}$|^[0-9A-F]{1,16}$`).
   - `radius`: finite positive number in `(0, 10000]`.
   - `edge_indices`: optional array of 1-based positive integers.
   - `confirmed`: literal `true`.
4. `chamfer`:
   - `documentId`: valid UUID pointing to an existing document.
   - `object`: string matching object identifier pattern.
   - `distance`: finite positive number in `(0, 10000]`.
   - `edge_indices`: optional array of 1-based positive integers.
   - `confirmed`: literal `true`.
5. `loft`:
   - `sections`: array of 2 to 20 profile arrays, where each profile array contains 3 to 100 3D coordinate tuples `[x, y, z]` bounded in `[-100000, 100000]`.
   - `solid`: optional boolean (defaults to true).
   - `ruled`: optional boolean (defaults to false).
   - `position`: optional `{ x, y, z }` coordinates.
   - `confirmed`: literal `true`.

#### Scenario: Valid extrude_polygon request enqueues job
- GIVEN a caller invoking `extrude_polygon` with valid closed polygon coordinates, depth = 15, plane = "XY", and confirmed = true
- WHEN the schema validates the input
- THEN validation succeeds and the job is enqueued with status "queued"

#### Scenario: Extrude polygon rejects coordinate exceeding maximum bound
- GIVEN a caller invoking `extrude_polygon` with a vertex coordinate of 200,000 (exceeding 100,000 max bound)
- WHEN the schema validates the input
- THEN validation fails and no job is enqueued

#### Scenario: Fillet rejects missing documentId
- GIVEN a caller invoking `fillet` with object = "Box", radius = 2, and confirmed = true, but omitting documentId
- WHEN the schema validates the input
- THEN validation fails with a required field error on documentId

#### Scenario: Loft rejects fewer than 2 section profiles
- GIVEN a caller invoking `loft` with `sections` containing only 1 profile wire
- WHEN the schema validates the input
- THEN validation fails with an array length constraint error and no job is enqueued
