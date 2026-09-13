## freecad-execution (MODIFIED)

### Requirement: Per-Operation Dispatch
The FreeCAD worker MUST branch on an `op` field in `request.json` to run the requested operation instead of always running the box+STEP pipeline; modify operations MUST reopen the existing `.FCStd`, mutate, recompute, and save before re-export.
(Previously: `freecad_worker.py` always created one box and exported STEP; no `op` branching existed.)
#### Scenario: Create operation
- GIVEN a job with `op = "create_box"`
- WHEN the worker runs
- THEN it creates the box and exports the expected artifacts
#### Scenario: Modify operation reopens existing document
- GIVEN a job with `op = "boolean_union"` and a `document_id` pointing to an existing `.FCStd`
- WHEN the worker runs
- THEN it opens the file, applies the mutation, recomputes, saves, then re-exports STL

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
