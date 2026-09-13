# Apply Progress — cadgpt-phase2-cad-assistant

## Slice 1 — `documents` table + job `type`/`document_id` (PR 1)

**Status**: done (tasks 1.1-1.6 complete). 18/19 slices remain (2a onward).

### Completed Tasks
- [x] 1.1 Added `documents` and `meshes` table DDL (D1 Data Model) to `Store` constructor, guarded by `CREATE TABLE IF NOT EXISTS`; `owner`/`created`/`updated` naming per D2/F2.
- [x] 1.2 Added `Store.migrate()`: reads `PRAGMA table_info(jobs)`, adds `type`/`document_id` columns only when missing; called from the constructor right after table creation. Method kept public so tests can call it directly.
- [x] 1.3 Added `createDocument(owner, deviceId, cadKind, name)`, `getDocument(id, owner)`, `listDocuments(owner)`. Updated `complete()` to run inside a `BEGIN IMMEDIATE` transaction and, on success with a `document_id`, bump `documents.updated`/`latest_job_id`/`native_path` (new optional `nativePath` param, `COALESCE`d so it never null-clobbers an existing path).
- [x] 1.4 Updated `enqueue()` to accept optional `type` (default `'create_box'`) and `documentId` (default `null`) params; updated `heartbeat()` to return `type`/`documentId` on the picked-up job, mapping `type=null → 'create_box'` and `document_id=null → null` for phase-1 rows.
- [x] 1.5 Added the D17 concurrency lock inside `enqueue()`: when `documentId` is passed, a `queued`/`running` job already referencing that document throws `DomainError(409, ...)` before the per-device cap check.
- [x] 1.6 Added `apps/api/test/documents.test.ts` (7 tests): migrate idempotence on a simulated phase-1 `jobs` table (called twice, asserts exactly one `type`/`document_id` addition each), document creation scoped to owner, cross-owner `getDocument` denial, `list_documents` scoping, D17 lock rejection, `complete()` bumping `documents` fields, and phase-1 `type=null → 'create_box'` mapping.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `apps/api/src/store.ts` | Modified | Added `documents`/`meshes` DDL, `migrate()`, `createDocument`/`getDocument`/`listDocuments`, D17 lock in `enqueue()`, `type`/`documentId` in `enqueue()`/`heartbeat()`, transactional `documents` bump in `complete()`. |
| `apps/api/test/documents.test.ts` | Created | 7 tests covering all of task 1.6's listed scenarios plus two extra regression tests (complete() bump, phase-1 default mapping). |

### Deviations from Design
None — implementation matches design D1/D2/D17 and the migration approach in the Testing Strategy / Migration sections. `complete()` gained an optional `nativePath` parameter (not yet wired to the `/api/agent/results/:id` route body) so the transactional bump described in task 1.3 has somewhere to source the value from once slice 2b/6 start passing it; existing callers are unaffected since the parameter is optional and defaults to `undefined` (`COALESCE` keeps the prior value).

### Issues Found
None.

### `apps/api/src/main.ts` compatibility
No changes needed. `store.enqueue(owner, p)` and `store.complete(token, id, result, ok)` calls in `main.ts` compile unchanged against the new optional parameters (`type`, `documentId`, `nativePath` all have defaults).

### Remaining Tasks
- [ ] 2a.1-2a.6 (Slice 2a — `CadStrategy` protocol + `FreeCadStrategy` refactor, PR 2)
- [ ] 2b.1-2b.9 (Slice 2b — Worker `OPS` dispatch + STL export + scene, PR 3)
- [ ] 3a.1-3a.7 through 15.1-15.2 (Slices 3a-15, PRs 4-19; see tasks.md Dependency Graph)

### Workload / PR Boundary
- Mode: stacked-to-main chained PR slice (per session `chain_strategy: stacked-to-main`)
- Current work unit: Slice 1 — `documents` table + job `type`/`document_id`
- Boundary: starts at the phase-1 `Store` (pairings/devices/jobs only); ends with `documents`/`meshes` tables live, `migrate()` idempotent, and `enqueue`/`heartbeat`/`complete` document-aware. No MCP tools, upload routes, or agent changes were added (out of scope for this slice).
- Estimated review budget impact: 153 changed lines (61 insertions + 8 deletions in `store.ts`, 84-line new test file) — well under the 400-line hard cap and under the ~180-line task estimate.
- Rollback boundary: drop `documents`/`meshes` tables and the two `jobs` columns; `migrate()` no-ops on a rerun against an unmodified phase-1 DB.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -w apps/api -- documents` is not a distinct filter in this repo's `tsx --test test/*.test.ts` runner; ran the full api suite: `npm test -w api` → `tests 15`, `pass 15`, `fail 0` (includes the 7 new `documents.test.ts` tests). |
| Runtime harness command/scenario and exact result | N/A — pure store-layer change, covered by unit tests (per tasks.md Suggested Work Units row 1). No live device/agent involved in slice 1. |
| Rollback boundary | Revert `apps/api/src/store.ts` to the pre-slice-1 version and delete `apps/api/test/documents.test.ts`; no other file touched. `migrate()` is a no-op if rerun against a DB that already has the columns. |

### Full Check (repo root)
```
npm run build   → api tsc build OK; web (Angular) build OK, no errors
npm test        → api: 15/15 pass; web (Vitest via `ng test`): 1/1 pass
```

### Status
6/6 slice-1 tasks complete (tasks.md 1.1-1.6 marked `[x]`). Ready for `sdd-verify` on slice 1, or `sdd-apply` again to continue with slice 2a.

## Slice 2a — `CadStrategy` protocol + `FreeCadStrategy` refactor (PR 2)

**Status**: done (tasks 2a.1-2a.6 complete). 17/19 slices remain (2b onward).

### Completed Tasks
- [x] 2a.1 (RED) Added `agent/tests/test_strategies.py::BaselineArgvEnvTests` capturing today's FreeCAD job argv/env/`shell=False` baseline. Verified independently: ran this test against the pre-refactor `executor.py` (via `git show HEAD:...`) — passed — then restored the refactor and re-ran — passed again, confirming a true byte-identical characterization rather than a test coupled to the new code.
- [x] 2a.2 Defined `CadStrategy` Protocol in `agent/cadgpt_agent/strategies/base.py`: `kind`, `supports(op)`, `build_argv(cad_path, job_dir, doc_dir)`, `env(base)`, `artifacts(op, job_dir, doc_dir)` returning a `TypedDict` (`native`, `mesh`, `scene`), matching design's Agent Strategy section verbatim.
- [x] 2a.3 Implemented `FreeCadStrategy` in `agent/cadgpt_agent/strategies/freecad.py`: `supports` only accepts `"create_box"` (no new ops yet); `build_argv` returns `[cad_path, worker_path]` unchanged; `env` adds only `QT_QPA_PLATFORM=offscreen` on top of the executor's sanitized base; `artifacts` returns `job_dir/"box.FCStd"` as `native` (worker output filename unchanged — `freecad_worker.py` itself is untouched in this slice, per task scope).
- [x] 2a.4 (RED) Added `agent/tests/test_strategies.py::CallerControlledPathTests`: non-UUID `document_id` rejected; four path-shaped-but-invalid variants (`../../etc/passwd`, UUID+`/../../etc`, leading `/`, UUID with trailing `/`) rejected; a pre-existing symlink at `documents/<uuid>` pointing outside root rejected via `resolve().is_relative_to(root)` (asserts the target directory stays empty — no write-through). Added a fifth "happy path" test confirming a valid `document_id` is accepted, creates `doc_dir`, and sets `CADGPT_DOC_DIR`.
- [x] 2a.5 Updated `agent/cadgpt_agent/executor.py`: added `STRATEGIES = {"FreeCAD": FreeCadStrategy()}` keyed by `cad["name"]`; added `resolve_document_dir(root, document_id)` doing the `uuid.UUID(...)` round-trip check then `doc_dir.resolve().is_relative_to(root_resolved)` containment check, called **before** the job directory is created and before any `Popen` — so a malformed/path-shaped `document_id` never leaves an orphaned job dir or spawns a process; `strategy.supports(op)` gate added (op defaults to `job.get("type") or "create_box"`, matching slice 1's `heartbeat()` null-mapping); exclusive job-dir `mkdir(mode=0o700, parents=False, exist_ok=False)`, sanitized env construction, `shell=False`, and fixed 2-element argv all preserved unchanged; `doc_dir` (when present) is `mkdir(mode=0o700, parents=True, exist_ok=True)` and exposed to the strategy/worker via `CADGPT_DOC_DIR`, additive and absent when no `documentId` is on the job.
- [x] 2a.6 Confirmed `agent/tests/test_strategies.py` (10 assertions across both classes) passes against the refactored `executor.py`/`strategies/freecad.py`, and re-confirmed the 2a.1 baseline is byte-identical to the pre-refactor version by running it against both revisions of the file (see 2a.1 evidence above). Full suite: `agent/tests/test_agent.py` (5) + `agent/tests/test_strategies.py` (5) = 10/10 pass, including the untouched phase-1 `test_subprocess_is_fixed_and_replay_refused` and `test_unknown_cad_rejected`.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `agent/cadgpt_agent/strategies/__init__.py` | Created | Package marker for the new `strategies` subpackage. |
| `agent/cadgpt_agent/strategies/base.py` | Created | `CadStrategy` Protocol + `Artifacts` TypedDict per design's Agent Strategy section. |
| `agent/cadgpt_agent/strategies/freecad.py` | Created | `FreeCadStrategy`: behavior-preserving wrap of the current single-op (`create_box`) pipeline. |
| `agent/cadgpt_agent/executor.py` | Modified | Strategy dispatch by `cad.name`; `resolve_document_dir()` guard (UUID round-trip + symlink-safe containment) run before job-dir creation and before `Popen`; `CADGPT_DOC_DIR` env var added only when a document is present; job-dir creation, env sanitization, `shell=False`, fixed argv, 120 s timeout, 4 KB tail all unchanged. |
| `agent/pyproject.toml` | Modified | Added `[tool.setuptools.packages.find] include = ["cadgpt_agent*"]` so the new `strategies` subpackage (and any future ones) is explicitly included in real (non-editable) builds, not left to auto-discovery heuristics. |
| `agent/tests/test_strategies.py` | Created | `BaselineArgvEnvTests` (2a.1) + `CallerControlledPathTests` (2a.4), 5 test methods total. |

### Deviations from Design
None — implementation matches design D3 (path handling) and D10 (`CadStrategy` protocol) exactly, including the Agent Strategy section's method signatures. One clarification made explicit in code, not a deviation: `doc_dir` is computed relative to the same `root` parameter `execute()` already receives (the agent's local jobs root, matching current `main.py` call sites), so `documents/` lands as a sibling of individual job directories under that same root — consistent with the literal `doc_dir = root/documents/<document_id>` in task 2a.5 and design's Agent Strategy pseudocode, and requires no change to `main.py`'s call convention.

### Issues Found
None.

### Remaining Tasks
- [ ] 2b.1-2b.9 (Slice 2b — Worker `OPS` dispatch + STL export + scene, PR 3)
- [ ] 3a.1-3a.7 through 15.1-15.2 (Slices 3a-15, PRs 4-19; see tasks.md Dependency Graph)

### Workload / PR Boundary
- Mode: stacked-to-main chained PR slice (per session `chain_strategy: stacked-to-main`)
- Current work unit: Slice 2a — `CadStrategy` protocol + `FreeCadStrategy` refactor
- Boundary: starts at the phase-1 hardcoded `executor.execute()` (single FreeCAD pipeline, no strategy seam, no document identity); ends with a `CadStrategy` protocol, one `FreeCadStrategy` implementation wrapping the unchanged pipeline, and a caller-controlled-paths guard wired into `executor.py` ahead of every `Popen`. No new CAD operations, no STL export, no upload, no AutoCAD — all out of scope for this slice (2b+).
- Estimated review budget impact: 226 insertions + 7 deletions = 233 changed lines across 6 files — under the 400-line hard cap; above the task's ~150-line estimate because the RED test file covers both threat-matrix rows explicitly (baseline + 4 malformed-id shapes + symlink + happy path) rather than the minimum one-test-per-row; not shrunk to hit the estimate per the review-workload guard's no-code-golf rule.
- Rollback boundary: revert `agent/cadgpt_agent/executor.py` and `agent/pyproject.toml`, delete `agent/cadgpt_agent/strategies/` and `agent/tests/test_strategies.py`; slice 1 (`documents` table, `store.ts`) is untouched and unaffected by this rollback.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `<scratch-venv>/bin/python -m unittest discover -s agent/tests -v` → `Ran 10 tests in 0.005s` / `OK` (5 pre-existing `test_agent.py` + 5 new `test_strategies.py`, all passing). |
| Runtime harness command/scenario and exact result | N/A — no live FreeCADCmd/AutoCAD process or dashboard involved in this slice; `Popen` is mocked in every test per the existing `test_agent.py` pattern (no real subprocess boundary changed, only argv/env construction and a pre-`Popen` validation guard). |
| Rollback boundary | See "Workload / PR Boundary" above — revert `executor.py`/`pyproject.toml`, delete the two new paths; no `apps/**` file was touched by this slice. |

### Status
6/6 slice-2a tasks complete (tasks.md 2a.1-2a.6 marked `[x]`). Cumulative: 12/? tasks complete across slices 1-2a. Ready for `sdd-verify` on slices 1-2a, or `sdd-apply` again to continue with slice 2b.
