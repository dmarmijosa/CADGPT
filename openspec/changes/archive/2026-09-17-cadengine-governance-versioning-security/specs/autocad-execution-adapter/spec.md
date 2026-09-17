## autocad-execution-adapter (MODIFIED)

Purpose: Headless execution of 13 canonical CAD operations on AutoCAD 2026 Core Console (`accoreconsole.exe`) on Windows with non-interactive binary STL preview, native DWG/DXF artifact delivery, and volumetric MASSPROP validation, with AutoCAD LT designated strictly as detection-only.

### Requirement: Core Console Strategy
The agent MUST execute AutoCAD jobs via `accoreconsole.exe /i <dwg> /s <script.scr>`, loading only allowlisted `.lsp` files, with `shell=False` and fixed argv. When started with `--enable-autocad` on a Windows host with AutoCAD 2026 Core Console, the agent MUST support full headless execution across all 13 canonical AutoCAD operations:
- 3D Primitives: `create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`
- Booleans: `boolean_cut`, `boolean_union`, `boolean_intersect`
- Transforms: `translate_object`, `rotate_object`, `scale_object`
- Read & Verification: `read_scene` (via AutoLISP entity enumeration) and volumetric validation via `MASSPROP`
- Export: `export_design` (supporting DWG, DXF via `_DXFOUT ... 16`, SAT via `_ACISOUT`, and binary STL preview via non-interactive `_STLOUT`)
(Previously: The agent MUST execute AutoCAD jobs via `accoreconsole.exe /i <dwg> /s <script.scr>`, loading only allowlisted `.lsp` files, with `shell=False` and fixed argv, without specifying the full 13-operation parity suite or MASSPROP validation.)

#### Scenario: Fixed invocation of 13-op suite
- GIVEN a dispatched AutoCAD job executing any operation in the 13-op suite
- WHEN the agent spawns the process
- THEN argv contains only `accoreconsole.exe`, `/i`, the job's DWG path, `/s`, and the fixed script path, `shell=False`

#### Scenario: Mass properties volumetric validation
- GIVEN a 3D solid created or modified via Core Console
- WHEN the script executes `MASSPROP` validation
- THEN solid bounding box and mass properties are verified and recorded without interactive prompts

---

### Requirement: DWG Artifact Required
Every successful AutoCAD job MUST produce a downloadable native DWG artifact (`_SAVEAS 2018`). When an `export_design` job requests DXF or SAT formats, the adapter MUST produce valid 16-decimal DXF (`_DXFOUT <path> 16`) or ACIS solid (`_ACISOUT`) artifacts alongside the DWG.
(Previously: Every successful AutoCAD job MUST produce a downloadable DWG artifact.)

#### Scenario: Job succeeds with DWG only
- GIVEN a completed AutoCAD create or modify job
- WHEN inspected
- THEN a valid DWG file exists and is downloadable by the owner

#### Scenario: Export op produces DXF artifact alongside DWG
- GIVEN an AutoCAD job with `op = "export_design"` requesting `format = "dxf"`
- WHEN execution completes
- THEN both the primary DWG artifact and a valid DXF file with 16-decimal precision are produced

---

### Requirement: STL Preview via STLOUT (spike-proven)
The slice-14 live spike (docs/autocad-stl-spike.md) proved `STLOUT` exports a valid binary STL headless from Core Console on full AutoCAD, refuting research A4. AutoCAD STL preview MUST use headless, non-interactive `_STLOUT _ALL "" _Y <path>` on AutoCAD 2026 Core Console; `EXPORT`/`3DPRINT` MUST NOT be used (they hang headless). `STLOUT` is absent in AutoCAD LT, but discovery gates AutoCAD execution to full editions only, so `capabilities.mesh` is true only for full editions.
(Previously: The slice-14 live spike (docs/autocad-stl-spike.md) proved `STLOUT` exports a valid binary STL headless from Core Console on full AutoCAD, refuting research A4. AutoCAD STL preview MUST use `_STLOUT`; `EXPORT`/`3DPRINT` MUST NOT be used (they hang headless). `STLOUT` is absent in AutoCAD LT, but discovery gates AutoCAD execution to full editions only, so `capabilities.mesh` is true only for full editions.)

#### Scenario: STL export on full AutoCAD
- GIVEN AutoCAD full with a console (capabilities.mesh true)
- WHEN an AutoCAD create, modify, or export job completes
- THEN the agent writes preview.stl via non-interactive STLOUT and uploads it, alongside the DWG artifact

#### Scenario: LT or no console
- GIVEN AutoCAD LT or no accoreconsole (capabilities.mesh false)
- WHEN an AutoCAD job completes
- THEN only the DWG artifact is produced; no STL upload is attempted

---

### Requirement: Edition and Availability Discovery
The system MUST report a CAD as executable only for full AutoCAD with `accoreconsole.exe` present, and non-executable for LT or when `accoreconsole.exe` is missing. AutoCAD LT MUST be classified strictly as detection-only (`executable=false`, `edition="lt"`), because AutoCAD LT does not ship `accoreconsole.exe` and lacks 3D modeling and STLOUT capabilities.
(Previously: The system MUST report a CAD as executable only for full AutoCAD with `accoreconsole.exe` present, and non-executable for LT or when `accoreconsole.exe` is missing.)

#### Scenario: Full AutoCAD detected
- GIVEN a Windows host with `accoreconsole.exe` present
- WHEN discovery runs
- THEN the entry reports `executable=true`, edition `full`, and advertises 13 supported operations

#### Scenario: LT or missing Core Console
- GIVEN AutoCAD LT or no `accoreconsole.exe` present (AutoLISP exists on LT only ≥2024, insufficient for Core Console execution)
- WHEN discovery runs
- THEN the entry reports `edition="lt"`, `executable=false` (detection-only)

---

### Requirement: AutoCAD Parity Documentation and UI Representation
User-facing documentation (`README.md`, `docs/deployment.md`) and web interface views (`home.html`, `about.html`) MUST accurately represent AutoCAD 2026 Core Console as supporting 13-operation parity (primitives, booleans, transforms, binary STL preview, DWG/DXF, and MASSPROP), and MUST explicitly document AutoCAD LT as detection-only without execution support.
(Previously: User documentation and web UI described AutoCAD as "detected only / partial" or "create-only without preview", failing to reflect live 13-operation Core Console capabilities.)

#### Scenario: Web dashboard capability matrix rendering
- GIVEN a user viewing the web dashboard capabilities panel or about page
- WHEN the AutoCAD section is displayed
- THEN it indicates full headless support for primitives, booleans, transforms, binary STL preview, DWG/DXF, and MASSPROP on AutoCAD 2026 Core Console, and designates AutoCAD LT as detection-only

#### Scenario: Documentation consistency check
- GIVEN project `README.md` and `docs/deployment.md`
- WHEN reviewed
- THEN all references document 13-op parity on AutoCAD 2026 Core Console and clarify that LT is detection-only
