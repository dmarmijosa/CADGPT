## cad-discovery (MODIFIED)

### Requirement: Executable as Per-CAD Capability
Discovery MUST compute `executable` per detected CAD from that CAD's own verified capability (FreeCAD's `freecadcmd`; AutoCAD's `accoreconsole.exe` + full edition), not a hardcoded FreeCAD-only boolean.
(Previously: `executable` was `True` only when `name == "FreeCAD"`; AutoCAD was always `False` by construction.)
#### Scenario: AutoCAD full becomes executable
- GIVEN `accoreconsole.exe` is found and the install is full AutoCAD
- WHEN discovery runs
- THEN that entry reports `executable=true`

### Requirement: accoreconsole.exe Detection
Discovery MUST search for `accoreconsole.exe` as a distinct binary alongside existing `acad.exe`/`acadlt` detection.
(Previously: no `accoreconsole.exe` detection existed.)
#### Scenario: Core Console found
- GIVEN a full AutoCAD install on the host
- WHEN discovery scans
- THEN it reports the `accoreconsole.exe` path

### Requirement: Full-vs-LT Signal
Discovery MUST distinguish full AutoCAD from LT and expose an edition flag on the CAD entry.
(Previously: `acadlt` merged into the same "AutoCAD" bucket with no edition distinction.)
#### Scenario: LT detected
- GIVEN an AutoCAD LT install with no `accoreconsole.exe`
- WHEN discovery scans
- THEN the entry reports edition `lt`, `executable=false`

---

### Requirement: FreeCAD Operations Discovery Export
`discovery.py` MUST export `FREECAD_OPS` as an array containing all 18 allowlisted operations: `create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, and `export_design`.
Whenever `discover()` detects a FreeCAD executable binary on the host, the corresponding CAD entry's `capabilities["ops"]` MUST advertise `FREECAD_OPS`.
An automated test (`test_ops_allowlist.py`) MUST assert that `FREECAD_OPS` is identical (as a set and list) to the canonical operations declared in `ops-allowlist.json`.

#### Scenario: Discovery reports all 18 FreeCAD operations
- GIVEN an agent host with FreeCAD installed
- WHEN `discover()` runs
- THEN the FreeCAD entry's capabilities dictionary contains `ops` listing all 18 canonical operations

#### Scenario: Parity test verifies discovery matches allowlist fixture
- GIVEN `ops-allowlist.json` containing 18 operations
- WHEN `test_ops_allowlist.py` executes
- THEN it asserts that `FREECAD_OPS` matches `ops-allowlist.json` with zero missing or unexpected operations
