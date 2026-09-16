## cad-discovery (MODIFIED)

Purpose: Expand `FREECAD_OPS` in `discovery.py` to export all 20 allowlisted operations (including `create_text_3d` and `analyze_image_to_cad`) and ensure automated allowlist parity testing.

### Requirement: FreeCAD Operations Discovery Export
`discovery.py` MUST export `FREECAD_OPS` as an array containing all 20 allowlisted operations: `create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`, and `analyze_image_to_cad`.
(Previously: `FREECAD_OPS` exported 18 operations.)
Whenever `discover()` detects a FreeCAD executable binary on the host, the corresponding CAD entry's `capabilities["ops"]` MUST advertise `FREECAD_OPS`.
An automated test (`test_ops_allowlist.py`) MUST assert that `FREECAD_OPS` is identical (as a set and list) to the canonical operations declared in `ops-allowlist.json`.

#### Scenario: Discovery reports all 20 FreeCAD operations
- GIVEN an agent host with FreeCAD installed
- WHEN `discover()` runs
- THEN the FreeCAD entry's capabilities dictionary contains `ops` listing all 20 canonical operations

#### Scenario: Parity test verifies discovery matches allowlist fixture
- GIVEN `ops-allowlist.json` containing 20 operations
- WHEN `test_ops_allowlist.py` executes
- THEN it asserts that `FREECAD_OPS` matches `ops-allowlist.json` with zero missing or unexpected operations
