## cad-discovery (MODIFIED)

Purpose: Expand local discovery to probe Blender binaries across OS environments and user configuration, export `BLENDER_OPS` alongside `FREECAD_OPS` and `AUTOCAD_OPS`, and expand the API CAD store schema to accept `'Blender'`.

### Requirement: FreeCAD Operations Discovery Export
`discovery.py` MUST export `FREECAD_OPS` as an array containing all 20 allowlisted FreeCAD operations: `create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`, and `analyze_image_to_cad`.
(Previously: `FREECAD_OPS` exported 18 operations prior to typography and image-to-CAD additions.)
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

---

### Requirement: Blender Operations Discovery and Binary Probing
`discovery.py` MUST export `BLENDER_OPS` as an array containing the allowlisted Blender operations: `create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`, `read_scene`, and `export_design`.
Whenever `discover()` detects a Blender installation on the host, the corresponding CAD entry MUST set `name = "Blender"` and its `capabilities["ops"]` MUST advertise `BLENDER_OPS`.
1. **OS Binary Probing Locations**:
   The discovery engine MUST probe:
   - System `PATH` for `blender` or `blender.exe`.
   - **Windows**: `C:\Program Files\Blender Foundation\Blender*\blender.exe` and `%LOCALAPPDATA%\Programs\Blender Foundation\Blender*\blender.exe`.
   - **macOS**: `/Applications/Blender.app/Contents/MacOS/Blender` and `~/Applications/Blender.app/Contents/MacOS/Blender`.
   - **Linux**: `/usr/bin/blender`, `/usr/local/bin/blender`, `/snap/bin/blender`, and flatpak export paths.
2. **Configuration Override**:
   - If a custom path is specified in `config.json["blenderPath"]` or via manual `--blender-path` argument, the discovery engine MUST probe that explicit path and register it if present on disk.
3. **Capabilities Metadata**:
   - A detected Blender binary MUST advertise capabilities: `execute: true`, `edition: "standard"`, `mesh: true`, and `ops: BLENDER_OPS`.
(Previously: discovery engine only probed FreeCAD and AutoCAD, and did not detect Blender installations.)

#### Scenario: Discovery detects Blender on macOS
- GIVEN a macOS host with `/Applications/Blender.app/Contents/MacOS/Blender` present
- WHEN `discover()` runs
- THEN it returns a CAD entry with `name = "Blender"`, `execute = true`, and `capabilities["ops"]` containing `BLENDER_OPS`

#### Scenario: Discovery resolves custom path from config.json
- GIVEN `config.json` containing `"blenderPath": "/opt/blender-4.0/blender"`
- WHEN `discover()` executes
- THEN it resolves and verifies the configured Blender executable and advertises it in detected CAD devices

#### Scenario: Discovery excludes Blender when absent
- GIVEN a host computer without Blender installed or configured
- WHEN `discover()` runs
- THEN the returned CAD list contains zero entries with `name = "Blender"`

---

### Requirement: API Store Schema Support for Blender
The API store schema and database layer MUST recognize `'Blender'` as a first-class CAD engine:
1. **Schema Validation**:
   - In `apps/api/src/store.ts`, the CAD registration schema MUST permit `'Blender'`:
     `name: z.enum(['FreeCAD', 'AutoCAD', 'Blender'])`
2. **Database Storage**:
   - The SQLite database check constraint on table `documents` (`cad_kind`) MUST accept `'Blender'` alongside `'FreeCAD'` and `'AutoCAD'`.
(Previously: store schema only accepted `'FreeCAD'` and `'AutoCAD'`, causing schema validation errors when registering Blender.)

#### Scenario: API store accepts device registration reporting Blender
- GIVEN an agent reporting a CAD entry with `name = "Blender"` and `capabilities.ops = BLENDER_OPS`
- WHEN the agent registers device capabilities with the API
- THEN schema validation succeeds and the Blender engine is stored in the device record

#### Scenario: Document creation supports Blender cadKind
- GIVEN a request to create a document with `cadKind = "Blender"`
- WHEN `store.createDocument` is called
- THEN the document is persisted in SQLite with `cad_kind = 'Blender'` without constraint violation
