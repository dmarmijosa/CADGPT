## job-lifecycle (MODIFIED)

### Requirement: Job Type and Document Linkage
Jobs MUST carry a `type` discriminator and a nullable `document_id` referencing `documents`; compatibility checks MUST evaluate the declared per-CAD capability rather than a hardcoded FreeCAD check.
(Previously: no `type` column; `enqueue()` hardcoded `c.name === 'FreeCAD' && c.executable` as the only compatibility check.)
#### Scenario: Modify job references prior document
- GIVEN document D exists from a prior create job
- WHEN a modify job is enqueued for D
- THEN the row stores `document_id = D`, `type = 'modify'`
#### Scenario: Non-FreeCAD capability check
- GIVEN a device declares AutoCAD as executable
- WHEN a job requiring AutoCAD is enqueued
- THEN the check passes on the declared capability, not a FreeCAD literal

### Requirement: Active Job Cap Unchanged
The system MUST continue capping active jobs per device at 5, regardless of `type`.
(Previously: same cap, enforced without a `type` dimension.)
#### Scenario: Cap enforced across types
- GIVEN a device has 5 active jobs of mixed types
- WHEN another is enqueued
- THEN it is rejected until one completes
