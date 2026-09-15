## autocad-execution-adapter (MODIFIED)

Purpose: extend Core Console execution beyond create+STLOUT-preview toward FreeCAD op parity. Prerequisite: Spike A (live Windows-host feasibility proof) MUST precede committing any op below — only `_STLOUT` is proven; `_-EXPORT`/`3DPRINT` hang; no vlax/ActiveX exists. All requirements in this delta are P2 and GATED ON Spike A.

### Requirement: Boolean Operations via Core Console (P2, GATED ON Spike A)
GATED ON Spike A — boolean feasibility in Core Console is UNPROVEN. Once Spike A proves it live, the agent MUST execute `boolean_cut`, `boolean_union`, `boolean_intersect` as AutoLISP-driven `.scr` sequences that open the job's DWG (via `native_path` when path-bound), apply the boolean, and save in place.
#### Scenario: Boolean op modifies existing DWG (post-spike)
- GIVEN Spike A has recorded a live-proven boolean result and a modify job with `op = "boolean_union"` targets an existing DWG
- WHEN the agent runs the job
- THEN the DWG is opened, the boolean applied, and the same file saved
#### Scenario: Boolean op refused before Spike A resolves
- GIVEN Spike A has not recorded a live-proven result
- WHEN a boolean job is dispatched to AutoCAD
- THEN `AUTOCAD_OPS` MUST NOT list the op and the job MUST be rejected as unsupported

### Requirement: Transform Operations via Core Console (P2, GATED ON Spike A)
GATED ON Spike A — transform feasibility in Core Console is UNPROVEN. Once proven, the agent MUST execute `translate`, `rotate`, `scale` as AutoLISP-driven `.scr` sequences against the opened DWG, saving in place.
#### Scenario: Transform op modifies existing DWG (post-spike)
- GIVEN Spike A has proven transform feasibility and a modify job with `op = "translate"` targets an existing DWG
- WHEN the agent runs the job
- THEN the entity is moved and the same file saved
#### Scenario: Transform op refused before Spike A resolves
- GIVEN Spike A has not recorded a live-proven result
- WHEN a transform job is dispatched to AutoCAD
- THEN `AUTOCAD_OPS` MUST NOT list the op and the job MUST be rejected as unsupported

### Requirement: Scene Read via Core Console (P2, GATED ON Spike A)
GATED ON Spike A — object enumeration in Core Console has no live spike (no vlax/ActiveX). Once proven, `read_scene` MUST enumerate entities in the opened DWG via an allowlisted `.lsp` routine and return structured data, without any vlax/ActiveX call.
#### Scenario: Scene read returns entity list (post-spike)
- GIVEN Spike A has proven scene enumeration without vlax/ActiveX
- WHEN a `read_scene` job runs against an existing DWG
- THEN the job result contains the enumerated entities
#### Scenario: Scene read refused before Spike A resolves
- GIVEN Spike A has not recorded a live-proven result
- WHEN a `read_scene` job is dispatched to AutoCAD
- THEN `AUTOCAD_OPS` MUST NOT list the op and the job MUST be rejected as unsupported

### Requirement: Export via Core Console (P2, GATED ON Spike A)
GATED ON Spike A — `_-EXPORT` and `3DPRINT` are known to hang headless; export MUST NOT reuse those commands. Once Spike A proves a non-hanging export path, the `export` op MUST produce the requested artifact via that proven mechanism only.
#### Scenario: Export produces artifact via proven mechanism (post-spike)
- GIVEN Spike A has proven a non-hanging export mechanism for format F
- WHEN an `export` job requests format F
- THEN the artifact is produced without invoking `_-EXPORT` or `3DPRINT`
#### Scenario: Export refused before Spike A resolves
- GIVEN Spike A has not recorded a live-proven result for any format
- WHEN an `export` job is dispatched to AutoCAD
- THEN `AUTOCAD_OPS` MUST NOT list `export` and the job MUST be rejected as unsupported
