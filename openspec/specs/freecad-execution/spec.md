## freecad-execution (MODIFIED)

### Requirement: Per-Operation Dispatch
The FreeCAD worker MUST branch on an `op` field in `request.json` to run the requested operation across all 18 allowlisted operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`); modify operations MUST reopen the existing `.FCStd`, mutate, recompute, and save before re-export. If an unknown or unallowlisted `op` is received, the worker MUST exit immediately with code 2 without modifying any document or executing CAD operations.
(Previously: `freecad_worker.py` only supported 13 initial operations.)
#### Scenario: Create operation
- GIVEN a job with `op = "create_box"`
- WHEN the worker runs
- THEN it creates the box and exports the expected artifacts
#### Scenario: Modify operation reopens existing document
- GIVEN a job with `op = "boolean_union"` and a `document_id` pointing to an existing `.FCStd`
- WHEN the worker runs
- THEN it opens the file, applies the mutation, recomputes, saves, then re-exports STL
#### Scenario: Advanced operation dispatch
- GIVEN a job with `op = "create_wedge"` or `op = "loft"`
- WHEN the worker runs
- THEN it branches to the designated handler, generates the parametric geometry, saves the document, and exports preview STL
#### Scenario: Unknown op rejection
- GIVEN a job with `op = "unsupported_operation"`
- WHEN the worker runs
- THEN it exits with code 2 and makes no changes to disk

### Requirement: STL Export Step
After every successful operation, the worker MUST export a binary STL via `MeshPart.meshFromShape` + mesh `write()`, in addition to the native save.
(Previously: worker exported only STEP; no mesh export existed.)
#### Scenario: STL produced alongside native save
- GIVEN a successful create or modify operation
- WHEN the worker completes
- THEN both the native `.FCStd` save and a binary STL exist in the job directory

### Requirement: Executor Strategy Dispatch
`executor.py` MUST dispatch to a FreeCAD or AutoCAD strategy per the job's declared CAD, preserving exclusive job-dir creation, sanitized environment, `shell=False`, and fixed argv per strategy.
(Previously: `execute()` was one hardcoded FreeCAD pipeline with no strategy selection.)
#### Scenario: FreeCAD strategy selected
- GIVEN a job targeting a FreeCAD device
- WHEN the executor dispatches
- THEN it runs the FreeCAD strategy with unchanged replay/sandboxing guarantees

### Requirement: Wedge and Extruded Polygon Primitives
The FreeCAD worker MUST support `create_wedge` and `extrude_polygon` operations:
1. `create_wedge`: MUST construct a wedge solid via `Part.makeWedge(dx, dy, dz, top_length, pos)` with finite positive millimeters `length` (dx), `width` (dy), and `height` (dz). If `top_length` is omitted or 0, it MUST create a knife-edge wedge.
2. `extrude_polygon`: MUST accept an array of 2D vertex points (`points`, between 3 and 100 points, each coordinate bounded in `[-100000, 100000]`), a positive `depth` in millimeters, and a projection plane (`"XY"`, `"XZ"`, or `"YZ"`). The worker MUST map the 2D coordinates to 3D space, close the polygon loop, form a planar face (`Part.Face(Part.makePolygon(...))`), and extrude the face along the plane normal vector by `depth`.

#### Scenario: Create knife-edge wedge primitive
- GIVEN a job with `op = "create_wedge"`, `length = 50`, `width = 20`, `height = 30`, and `top_length = 0`
- WHEN the worker executes
- THEN it generates a `Part::Feature` wedge solid with a sharp top edge and non-zero volume

#### Scenario: Create wedge with flat top ridge
- GIVEN a job with `op = "create_wedge"`, `length = 60`, `width = 30`, `height = 40`, and `top_length = 15`
- WHEN the worker executes
- THEN it generates a truncated wedge with top ridge length equal to 15 mm

#### Scenario: Extrude closed polygon on XY plane
- GIVEN a job with `op = "extrude_polygon"`, `points = [[0, 0], [40, 0], [50, 20], [10, 20]]`, `depth = 12`, and `plane = "XY"`
- WHEN the worker executes
- THEN it creates a 3D extruded prism solid of 12 mm thickness along the Z axis

#### Scenario: Reject polygon with fewer than 3 vertices
- GIVEN a job with `op = "extrude_polygon"` and `points = [[0, 0], [10, 10]]`
- WHEN the worker validates the request
- THEN it raises a validation error and rejects execution before invoking FreeCAD

---

### Requirement: Fillet and Chamfer Feature Dressing
The FreeCAD worker MUST support parametric edge dressing operations `fillet` and `chamfer` on existing document objects:
1. `fillet`: MUST apply a rounding fillet of `radius` millimeters to the object named in `object` within `document_id`. If `edge_indices` is omitted or empty, all edges of the object MUST be filleted. If `edge_indices` is specified, only the designated 1-based edge indices MUST be filleted.
2. `chamfer`: MUST apply a planar bevel of `distance` millimeters to the object named in `object` within `document_id`. If `edge_indices` is omitted or empty, all edges of the object MUST be chamfered. If `edge_indices` is specified, only the designated 1-based edge indices MUST be chamfered.
3. **Safety & Rollback**: All edge indices MUST be verified against `1 <= idx <= len(obj.Shape.Edges)`. If an edge index is out of bounds or OpenCASCADE fails to compute the fillet/chamfer geometry, the worker MUST catch the exception, restore the document from the pre-mutation backup file, and raise an error.

#### Scenario: Fillet all edges of existing solid
- GIVEN an existing document containing object `"Box"`
- WHEN `fillet` is executed with `object = "Box"` and `radius = 2.0` without edge indices
- THEN all sharp edges of `"Box"` are rounded with a 2.0 mm fillet and the document recomputes successfully

#### Scenario: Chamfer specific edge indices
- GIVEN an existing document containing object `"ExtrudePolygon"` having 8 edges
- WHEN `chamfer` is executed with `object = "ExtrudePolygon"`, `distance = 1.5`, and `edge_indices = [1, 3]`
- THEN only edges 1 and 3 receive a 1.5 mm chamfer bevel

#### Scenario: Invalid edge index triggers backup rollback
- GIVEN an existing document with object `"Box"` having 12 edges
- WHEN `fillet` is executed with `edge_indices = [99]`
- THEN validation fails, the worker restores the original document from backup, and reports the error without corrupting the document

---

### Requirement: Loft Skinning Across Cross Sections
The FreeCAD worker MUST support the `loft` operation to generate 3D solids or surfaces skinned across multiple cross-sectional profile wires:
1. The operation MUST accept `sections`, containing an array of 2 to 20 profiles, where each profile contains 3 to 100 3D coordinate points `[x, y, z]`.
2. The worker MUST form a closed wire for each section (`Part.makePolygon(...)`) and invoke `Part.makeLoft(wires, solid=solid, ruled=ruled)`.
3. The `solid` parameter MUST default to `true` (creating a closed 3D solid) and support `false` (creating an open lofted surface shell).
4. The `ruled` parameter MUST default to `false` (smooth B-spline interpolation) and support `true` (ruled planar surfaces between section profiles).

#### Scenario: Smooth solid loft through multiple profiles
- GIVEN a job with `op = "loft"`, `sections` containing 3 closed diamond profiles at Z=0, Z=150, and Z=300, and `solid = true`
- WHEN the worker executes
- THEN it creates a closed manifold 3D solid skinned smoothly through all 3 sections

#### Scenario: Ruled surface loft with solid set to false
- GIVEN a job with `op = "loft"`, `sections` containing 2 polygonal cross sections, `solid = false`, and `ruled = true`
- WHEN the worker executes
- THEN it creates a ruled open surface shell between the two profile wires

#### Scenario: Reject loft with fewer than two sections
- GIVEN a job with `op = "loft"` and `sections` containing only 1 profile wire
- WHEN the worker validates the request
- THEN it raises a validation error and aborts execution before calling FreeCAD
