## freecad-execution (MODIFIED)

Purpose: Expand FreeCAD worker execution to support parametric 3D typography (`create_text_3d`) and multi-contour nested cutouts (holes) in `extrude_polygon`.

### Requirement: Per-Operation Dispatch
The FreeCAD worker MUST branch on an `op` field in `request.json` to run the requested operation across all 19 allowlisted worker operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`); modify operations MUST reopen the existing `.FCStd`, mutate, recompute, and save before re-export. If an unknown or unallowlisted `op` is received, the worker MUST exit immediately with code 2 without modifying any document or executing CAD operations.
(Previously: `freecad_worker.py` supported 18 operations without 3D typography.)
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
#### Scenario: 3D typography operation dispatch
- GIVEN a job with `op = "create_text_3d"`, `text = "CAD-01"`, `size = 15.0`, `thickness = 2.0`, and `mode = "flat"`
- WHEN the worker runs
- THEN it branches to the 3D typography handler, constructs the text solid, saves the document, and exports preview STL
#### Scenario: Unknown op rejection
- GIVEN a job with `op = "unsupported_operation"`
- WHEN the worker runs
- THEN it exits with code 2 and makes no changes to disk

---

### Requirement: Wedge and Extruded Polygon Primitives
The FreeCAD worker MUST support `create_wedge` and `extrude_polygon` operations:
1. `create_wedge`: MUST construct a wedge solid via `Part.makeWedge(dx, dy, dz, top_length, pos)` with finite positive millimeters `length` (dx), `width` (dy), and `height` (dz). If `top_length` is omitted or 0, it MUST create a knife-edge wedge.
2. `extrude_polygon`: MUST accept an array of 2D outer vertex points (`points`, between 3 and 100 points, each coordinate bounded in `[-100000, 100000]`), an optional array of nested hole vertex arrays (`holes`, containing 0 to 20 hole loops where each loop contains 3 to 100 2D coordinate points bounded in `[-100000, 100000]`), a positive `depth` in millimeters, and a projection plane (`"XY"`, `"XZ"`, or `"YZ"`). The worker MUST map the 2D coordinates to 3D space, close the polygon loops, form a planar face with internal hole loops subtracted from the outer boundary (`Part.Face(outer_wire).cut(hole_faces)` or composite wire face), and extrude the resulting face along the plane normal vector by `depth`.
(Previously: `extrude_polygon` supported only a single outer closed loop without inner cutout holes.)

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

#### Scenario: Extrude polygon with nested hole cutouts
- GIVEN a job with `op = "extrude_polygon"`, `points = [[0, 0], [100, 0], [100, 100], [0, 100]]`, `holes = [[[20, 20], [40, 20], [40, 40], [20, 40]], [[60, 60], [80, 60], [80, 80], [60, 80]]]`, and `depth = 10`
- WHEN the worker executes
- THEN it creates a 100x100x10 mm solid plate featuring two distinct 20x20 mm square through-holes

#### Scenario: Reject polygon with fewer than 3 vertices
- GIVEN a job with `op = "extrude_polygon"` and `points = [[0, 0], [10, 10]]`
- WHEN the worker validates the request
- THEN it raises a validation error and rejects execution before invoking FreeCAD

---

### Requirement: 3D Typography Solid Generation
The FreeCAD worker MUST support the `create_text_3d` operation to generate 3D lettering and mechanical engravings on solid geometry:
1. **API Invocation & Font Resolution**: The worker MUST call `Draft.make_shapestring` (or fallback `Draft.makeShapeString`) passing the text string, resolved font file path, letter height `size`, and tracking offset. The font MUST resolve via caller-supplied font, bundled `Inter-Bold.ttf`, or standard operating system fonts.
2. **Solid Creation**: The worker MUST extrude the generated planar glyph shapes along the normal vector of the specified `plane` (`XY`, `XZ`, `YZ`) by `thickness` millimeters.
3. **Operational Modes**:
   - `flat`: MUST place the extruded text solid at `position` as a standalone object without modifying other objects.
   - `emboss`: MUST require `target_object` and perform a boolean union (`Shape.fuse`) uniting the text solid outward onto the target object.
   - `engrave`: MUST require `target_object`, position the text solid recessed into the target object, and perform a boolean cut (`Shape.cut`) subtracting the text solid from the target object.
4. **Safety & Rollback**: If `target_object` is missing for emboss/engrave or the OpenCASCADE boolean kernel encounters an error, the worker MUST catch the exception, restore the document from the pre-mutation backup file, and raise an error without corrupting the `.FCStd` file.

#### Scenario: Standalone 3D text creation
- GIVEN a job with `op = "create_text_3d"`, `text = "FREE-CAD"`, `size = 10.0`, `thickness = 2.0`, and `mode = "flat"`
- WHEN the worker executes
- THEN it creates a standalone 3D text solid with 10 mm letter height and 2 mm thickness

#### Scenario: Emboss text onto target solid
- GIVEN an existing solid `"Bracket"` in `document_id`
- WHEN `create_text_3d` executes with `mode = "emboss"`, `target_object = "Bracket"`, `text = "REV-2"`, and `thickness = 1.0`
- THEN the text geometry is united with `"Bracket"`, producing a single fused solid

#### Scenario: Engrave text into target solid
- GIVEN an existing solid `"Panel"` in `document_id`
- WHEN `create_text_3d` executes with `mode = "engrave"`, `target_object = "Panel"`, `text = "OFF"`, and `thickness = 0.5`
- THEN the text geometry is subtracted from `"Panel"`, cutting a 0.5 mm recessed cavity into the panel surface
