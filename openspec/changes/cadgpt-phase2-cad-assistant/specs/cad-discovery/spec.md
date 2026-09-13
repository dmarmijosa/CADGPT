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
