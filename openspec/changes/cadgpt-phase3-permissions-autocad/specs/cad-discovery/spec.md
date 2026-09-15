## cad-discovery (MODIFIED)

Purpose: keep AutoCAD's reported op set truthful as parity ops land. Prerequisite: Spike A gates which ops may ever appear in `AUTOCAD_OPS`.

### Requirement: AutoCAD Reported Op Set Matches Allowlist (P2, GATED ON Spike A)
GATED ON Spike A — an op MUST only enter `AUTOCAD_OPS` after Spike A records it as live-proven. Discovery's `AUTOCAD_OPS` MUST report exactly the AutoCAD ops that are both implemented and present in `ops-allowlist.json`; a test (`test_ops_allowlist.py`) MUST assert `AUTOCAD_OPS` is a subset of the canonical op names in `ops-allowlist.json`.
#### Scenario: Reported ops match allowlist subset
- GIVEN `AUTOCAD_OPS` currently lists N ops
- WHEN `test_ops_allowlist.py` runs
- THEN every op in `AUTOCAD_OPS` is present in `ops-allowlist.json`
#### Scenario: Unproven op excluded from AUTOCAD_OPS
- GIVEN Spike A has not proven a given op family live
- WHEN discovery reports `AUTOCAD_OPS`
- THEN that op family's names are absent
