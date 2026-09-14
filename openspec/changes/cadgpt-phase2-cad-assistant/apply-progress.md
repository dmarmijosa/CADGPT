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
