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

## Slice 2b — Worker `OPS` dispatch + STL export + scene (PR 3)

**Status**: functionally done (tasks 2b.1-2b.9 complete, all tests pass) — **budget exception needed** (478 changed lines vs the 400-line hard cap; see Workload / PR Boundary below). Not committed. 16/19 slices remain (3a onward).

### Completed Tasks
- [x] 2b.1 (RED) Added `FreecadWorkerValidationTests` to `agent/tests/test_agent.py`: unknown op → `SystemExit(2)`; `NaN`/`1e309`/negative/zero/out-of-range `length` rejected for `create_box`; `..`/`;`/`'`/`"`/`/`-shaped object names rejected for `boolean_cut`'s `base`/`tool` and `translate_object`'s `object`; out-of-range `degrees`/`factor` rejected for `rotate_object`/`scale_object`. None of these stub `FreeCAD`/`Part`/`MeshPart`: if the worker imported them before validating, the tests would see `ModuleNotFoundError` instead of the asserted `ValueError`/`SystemExit`, so the test suite itself proves the "before any FreeCAD call" ordering.
- [x] 2b.2 Rewrote `agent/cadgpt_agent/freecad_worker.py` around an `OPS: dict[str, Callable]` table (11 ops) with zero module-scope `FreeCAD`/`Part`/`MeshPart` imports — every import is lazy, inside the handler body, after that handler's own validation. `run(job_dir, doc_dir, data)` looks up `data["op"]` in `OPS`; a miss calls `sys.exit(2)` before touching any CAD module.
- [x] 2b.3 Implemented `create_box`/`create_cylinder`/`create_sphere`/`create_cone` via a shared `_create_primitive` helper: validates all dimension/position params first (pure Python), then `_open_or_new` — `FreeCAD.newDocument(...)` when `document_id` is absent, reopening otherwise (see 2b.4) — adds one `Part::Feature`, sets its `Shape`, `recompute()`s. `run()` then `saveAs(doc_dir/design.FCStd)` when `document_id` is absent (falls back to `job_dir` as `doc_dir` for the phase-1/no-document path, since `CADGPT_DOC_DIR` is only set when a document exists).
- [x] 2b.4 Implemented the reopen path inside `_open_or_new`/`_open_document`: `FreeCAD.openDocument(str(doc_dir/"design.FCStd"))` when `document_id` is present. `run()` centralizes the save decision: `document.save()` when `document_id` is present, `saveAs(...)` otherwise — so every create-with-`document_id` and every boolean/transform op (which always reopen) exercises `openDocument → mutate (in the handler) → recompute() (in the handler) → save() (in run())`.
- [x] 2b.5 Implemented `boolean_cut`/`boolean_union`/`boolean_intersect` via a `_boolean(feature_type)` factory: validates `base`/`tool` object-name format, reopens, resolves both via `doc.getObject()` (raising on `None`), creates `Part::Cut|Fuse|Common`, assigns `Base`/`Tool`, recomputes.
- [x] 2b.6 Implemented `translate_object` (`obj.Placement = FreeCAD.Placement(placement.Base + FreeCAD.Vector(dx,dy,dz), placement.Rotation)`), `rotate_object` (`FreeCAD.Rotation(unit_vector, degrees)` composed via `.multiply()` onto the existing rotation), `scale_object` (`obj.Shape.scale(factor)`); all three validate the object name (D5 regex) and their own numeric bounds before `_open_document`, then resolve via `_get_object` (wraps `doc.getObject()`, raises `ValueError` on an unknown name).
- [x] 2b.7 Implemented `read_scene`: opens the existing document (no mutation, no save) and, in `run()`, writes `scene.json` as a JSON array of `{name, label, type, bbox, volume}` built from `_top_level_objects` (objects with an empty `InList` — i.e. not consumed as a boolean's `Base`/`Tool`).
- [x] 2b.8 Added `_export_stl`: builds a single shape (the lone top-level object's `Shape`, or `Part.makeCompound(...)` over all top-level shapes when there's more than one), calls `MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.1, AngularDeflection=0.26, Relative=False)`, writes `job_dir/preview.stl`. `run()` calls this after every successful op, including `read_scene`.
- [x] 2b.9 Added `FreecadWorkerOpsTests` to `agent/tests/test_agent.py`: `test_create_box_...` (create + STL byte-shape assertion `size == 84 + 50*facets`), `test_boolean_union_with_document_id_reopens_recomputes_saves_and_exports_stl` (modify **and** boolean class combined, matching the slice's own acceptance-line example), `test_translate_object_mutates_placement_on_reopened_document` (transform class), `test_read_scene_writes_scene_json_without_saving` (read_scene class, and proves it never calls `save()`). `FreeCAD`/`Part`/`MeshPart` are injected into `sys.modules` in `setUp`/removed in `tearDown`; the fakes are minimal (`SimpleNamespace`-based) except `_FakeVector`, which needs a real `__add__`.

### Necessary infrastructure beyond the itemized 2b.1-2b.9 list
- **`agent/cadgpt_agent/executor.py`**: `validate()` now only enforces the legacy `length`/`width`/`height` bounds when the resolved op is `create_box` (previously unconditional, which would `KeyError` on any new op's job dict); every other op's params are validated inside the worker instead (defense-in-depth boundary moved to where the op-specific schema actually lives). The `request.json` write is now generic: `{"op": op, "document_id": job.get("documentId"), **params}` where `params` is every job field except the envelope keys (`id`, `cadId`, `expires`, `confirmed`, `type`, `documentId`) — required because the design's `request.json = {op, params, document_id}` shape (Agent Strategy / Data Flow sections) didn't exist before this slice; argv stays the fixed 2-element `[cad_path, worker_path]` untouched.
- **`agent/cadgpt_agent/strategies/freecad.py`**: `supports(op)` now delegates to `op in OPS` (imported from `freecad_worker`, safe since that module does no FreeCAD import at load time) instead of the phase-1 hardcoded `op == "create_box"`. `artifacts()` now returns `native = (doc_dir or job_dir)/"design.FCStd"`, `mesh = job_dir/"preview.stl"`, and `scene = job_dir/"scene.json"` only for `read_scene`.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `agent/cadgpt_agent/freecad_worker.py` | Rewritten | 11-op `OPS` dispatch, pure-Python validation, create/reopen/save, booleans, transforms, `read_scene`, STL export, `scene.json` write. |
| `agent/cadgpt_agent/executor.py` | Modified | Op-conditional legacy dimension check in `validate()`; generic `op`/`document_id`/params `request.json` write. |
| `agent/cadgpt_agent/strategies/freecad.py` | Modified | `supports()` delegates to the worker's `OPS` table; `artifacts()` returns `design.FCStd`/`preview.stl`/`scene.json`. |
| `agent/tests/test_agent.py` | Modified | Added `FreecadWorkerValidationTests` (2b.1) and `FreecadWorkerOpsTests` (2b.9) plus their `SimpleNamespace`-based FreeCAD/Part/MeshPart fakes; updated the phase-1 `finish()` mock to write `design.FCStd` instead of `box.FCStd`. |
| `agent/tests/test_strategies.py` | Modified | Updated both mocked `finish()` callbacks (baseline + valid-document-id tests) to write `design.FCStd` at the new artifact location. |

### Deviations from Design
- **STEP export dropped.** Phase 1's `freecad_worker.py` exported `box.step` via `Part.export(...)`. Neither the design's "Per-Operation Dispatch" nor "STL Export Step" requirement (spec `freecad-execution`) mentions STEP; the design's Agent Strategy section only describes the native `.FCStd` save plus the new STL export. This slice drops the STEP export entirely — flagged per the task brief's explicit instruction to report if design drops STEP. If STEP export is still wanted (e.g. for external CAD interchange), it would need a follow-up task; it's cheap to re-add as one `Part.export([...], job_dir/"design.step")` call inside `run()`.
- **Artifact renamed `box.FCStd` → `design.FCStd`.** Task 2b.3 literally specifies `saveAs(doc_dir/design.FCStd)` even when `documentId` is absent. Since `doc_dir` is only set (via `CADGPT_DOC_DIR`) when a document exists, the worker falls back to `job_dir` as the save location in that case — so the rename applies uniformly, including the phase-1/no-document path. Updated the two pre-existing tests (`test_agent.py::Tests::test_subprocess_is_fixed_and_replay_refused`, `test_strategies.py::BaselineArgvEnvTests`/`CallerControlledPathTests`) that mocked this filename, so they stay byte-consistent with the new artifact contract rather than silently passing against a name the code no longer produces.
- **`executor.py` request.json passthrough was not an itemized 2b task** but is required by the design's `request.json = {op, params, document_id}` shape; documented above under "Necessary infrastructure."

### Issues Found
None — all 18 agent tests pass (5 phase-1 + 5 slice-2a + 8 new-2b).

### Remaining Tasks
- [ ] 3a.1-3a.7 through 15.1-15.2 (Slices 3a-15, PRs 4-19; see tasks.md Dependency Graph)

### Workload / PR Boundary
- Mode: stacked-to-main chained PR slice (per session `chain_strategy: stacked-to-main`) — **budget exception required, not yet granted**.
- Current work unit: Slice 2b — Worker `OPS` dispatch + STL export + scene.
- Boundary: starts at slice 2a's single-op (`create_box`-only) `FreeCadStrategy`; ends with all 11 catalog ops dispatchable, validated, and tested through the worker, plus the `executor.py`/`strategies/freecad.py` plumbing needed to actually route `op`/params/`document_id` to it. No MCP tools, upload routes, or AutoCAD were touched (out of scope; slices 3a+).
- **Estimated review budget impact: 478 changed lines** (`git diff --numstat` total: 15+5+245+13+9+3+183+1+2+2), **78 over the 400-line hard cap** and ~138 over the tasks.md ~340 estimate. Two honest simplification passes were applied before reporting this number (generic `_bounded`/`_mm` validators and a shared `_create_primitive`/`_boolean` factory in the worker; `SimpleNamespace`-based fakes and a catch-all `_FakePart.__getattr__` in the tests) — no comment, blank line, doc, or test was removed to chase the cap, per the review-workload guard's no-code-golf rule.
  - **Root cause of the overage**: (1) `freecad_worker.py` is a near-total rewrite (17 → 248 lines) because it now dispatches 11 real ops instead of one, each needing its own pre-FreeCAD bound/format validation; (2) 2b.9's "one test per op class" requirement needs a stubbed `FreeCAD`/`Part`/`MeshPart` surface (~75 lines of fakes) to exercise the reopen/save/mutate paths under plain CPython; (3) the `executor.py`/`strategies/freecad.py` plumbing to actually carry `op` + params through `request.json` wasn't itemized as its own 2b subtask but is required by the design's data shape.
  - **Proposed split**, if `size:exception` is not accepted: **2b-i** (`freecad_worker.py`'s validation helpers + `OPS` skeleton + the four `create_*` ops + reopen/save + STL export, tasks 2b.1-2b.4/2b.8, plus `executor.py`/`strategies/freecad.py`, plus `FreecadWorkerValidationTests` + the `create_box` half of `FreecadWorkerOpsTests`) vs. **2b-ii** (booleans/transforms/`read_scene`, tasks 2b.5-2b.7, plus the remaining three `FreecadWorkerOpsTests` methods and the boolean/transform half of `FreecadWorkerValidationTests`'s bad-object-name test). Both halves share the same fakes and `OPS` table, so 2b-ii would build directly on 2b-i's branch (still `stacked-to-main`); the slice's own acceptance line (`boolean_union` reopen+recompute+save+STL) would only be verifiable once 2b-ii lands, mirroring how slice 2 was already split into 2a/2b.
  - **Recommendation**: accept `size:exception` — the overage is bounded (~20%), the split point above still leaves 2b-i without a working acceptance-testable slice (booleans are explicitly part of the acceptance line), and none of the four files can be sensibly divided further without duplicating the shared `OPS`/fake-module infrastructure across two PRs.
- Rollback boundary: revert `agent/cadgpt_agent/freecad_worker.py`, `executor.py`, `strategies/freecad.py`, and the two test files to their slice-2a versions; no `apps/**` file or other slice was touched.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `<scratch-venv>/bin/python -m unittest discover -s agent/tests -v` → `Ran 18 tests in 0.006s` / `OK` (5 phase-1 + 5 slice-2a + 4 `FreecadWorkerValidationTests` + 4 `FreecadWorkerOpsTests`, all passing). |
| Runtime harness command/scenario and exact result | N/A — no live FreeCADCmd process available in this environment; every worker op is exercised via `sys.modules` stubs (`FreeCAD`/`Part`/`MeshPart`) rather than a real FreeCAD install. A manual smoke recipe against a real FreeCAD 1.1.3 headless install is provided in the return summary for the orchestrator to run separately. |
| Rollback boundary | See "Workload / PR Boundary" above — revert the five listed files; slices 1/2a are untouched and unaffected. |

### Status
9/9 slice-2b tasks complete and tested (tasks.md 2b.1-2b.9 marked `[x]`), but **not committed**: 478 changed lines exceeds the 400-line hard cap by 78 lines. Cumulative: 21/? tasks complete across slices 1-2b. Blocked on a budget decision (`size:exception` recommended, or the 2b-i/2b-ii split above) before this lands as a PR. `sdd-verify` can still run against the working tree; `sdd-apply` should not start slice 3a until the budget decision is made, since 3a depends on 2b's `op` catalog being finalized.
