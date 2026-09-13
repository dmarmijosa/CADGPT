## autocad-execution-adapter (NEW)

Purpose: DWG-artifact AutoCAD execution via Core Console; STL preview is conditional on an unproven spike (STLOUT is absent from Core Console and from LT per research).

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

### Requirement: STL Preview Is Conditional On Spike
STL export for AutoCAD MUST NOT be implemented unless the Windows EXPORT/3DPRINT headless spike confirms feasibility; `STLOUT` MUST NOT be used since it is unavailable in Core Console and in LT.
#### Scenario: Conditional STL export (post-spike only)
- GIVEN the spike confirmed headless STL export works via EXPORT/3DPRINT
- WHEN an AutoCAD job completes
- THEN the agent additionally uploads an STL mesh
#### Scenario: No spike, no STL
- GIVEN the spike has not run or failed
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
