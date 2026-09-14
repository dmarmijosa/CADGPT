## autocad-execution-adapter (NEW)

Purpose: DWG-artifact AutoCAD execution via Core Console; STL preview via `STLOUT`, proven feasible by the slice-14 live spike (2026-09-14, AutoCAD 2026 full).

### Requirement: Core Console Strategy
The agent MUST execute AutoCAD jobs via `accoreconsole.exe /i <dwg> /s <script.scr>`, loading only allowlisted `.lsp` files, with `shell=False` and fixed argv.
#### Scenario: Fixed invocation
- GIVEN a dispatched AutoCAD job
- WHEN the agent spawns the process
- THEN argv contains only `accoreconsole.exe`, `/i`, the job's DWG path, `/s`, and the fixed script path, `shell=False`

### Requirement: DWG Artifact Required
Every successful AutoCAD job MUST produce a downloadable DWG artifact.
#### Scenario: Job succeeds with DWG only
- GIVEN a completed AutoCAD job
- WHEN inspected
- THEN a DWG file exists and is downloadable by the owner

### Requirement: STL Preview via STLOUT (spike-proven)
The slice-14 live spike (docs/autocad-stl-spike.md) proved `STLOUT` exports a valid binary STL headless from Core Console on full AutoCAD, refuting research A4. AutoCAD STL preview MUST use `_STLOUT`; `EXPORT`/`3DPRINT` MUST NOT be used (they hang headless). `STLOUT` is absent in AutoCAD LT, but discovery gates AutoCAD execution to full editions only, so `capabilities.mesh` is true only for full editions.
#### Scenario: STL export on full AutoCAD
- GIVEN AutoCAD full with a console (capabilities.mesh true)
- WHEN an AutoCAD create job completes
- THEN the agent also writes preview.stl via STLOUT and uploads it, alongside the DWG artifact
#### Scenario: LT or no console
- GIVEN AutoCAD LT or no accoreconsole (capabilities.mesh false)
- WHEN an AutoCAD job completes
- THEN only the DWG artifact is produced; no STL upload is attempted

### Requirement: Edition and Availability Discovery
The system MUST report a CAD as executable only for full AutoCAD with `accoreconsole.exe` present, and non-executable for LT or when `accoreconsole.exe` is missing.
#### Scenario: Full AutoCAD detected
- GIVEN a Windows host with `accoreconsole.exe` present
- WHEN discovery runs
- THEN the entry reports `executable=true`, edition `full`
#### Scenario: LT or missing Core Console
- GIVEN AutoCAD LT or no `accoreconsole.exe` present (AutoLISP exists on LT only ≥2024, insufficient for Core Console execution)
- WHEN discovery runs
- THEN the entry reports `executable=false`
