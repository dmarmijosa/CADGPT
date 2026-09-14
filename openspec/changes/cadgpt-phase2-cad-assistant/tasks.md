# Tasks: CADGPT Phase 2 — CAD Assistant

Source: proposal (obs 129), spec (obs 131), design (obs 133). Design maps proposal's 15 slices to 19 implementation slices by splitting slices 2, 3, 4, 13 into a/b halves to stay under the 400-line review budget. Tasks below follow that exact mapping, in dependency order.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4,100 total across 19 slices (range 110–340 per slice) |
| 400-line budget risk | Medium (three slices — 2b ~340, 5 ~300, 13a ~320 — sit close to budget; all others stay well under) |
| Chained PRs recommended | Yes |
| Suggested split | 19 chained slices, PR 1 → PR 19, per Suggested Work Units below |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium
```

`ask-on-risk` maps to "Decision needed before apply: Yes" per the review workload guard — the orchestrator must ask the user to pick a chain strategy (stacked-to-main, feature-branch-chain, or size:exception) before `sdd-apply` starts slice 1.

## Notes

- **F2 (column naming)**: `documents`/`meshes` use `owner`/`created`/`updated` column names, matching the existing `devices`/`jobs` convention (design D2). This intentionally supersedes the proposal's literal names (`owner_sub`, `*_at`); no task should reintroduce the proposal's naming.
- **Word-budget tradeoff**: like the spec (obs 131) and design (obs 133) artifacts for this change, this tasks artifact exceeds the generic size-budget guideline by design — 19 slices each need explicit files/tests/acceptance/estimate per the task brief. Accepted tradeoff, consistent with the precedent already recorded in state (obs 130).
- **Shared fixture (design risk 4)**: `ops-allowlist.json` lands at the **repo root** (task 4b.4) so both `apps/api/test` (`tsx --test`) and `agent/tests` (`unittest`) read the same file by relative path from their own test roots, with no cross-package import.
- **Docs placement**: docs travel with the slice that changes behavior — README's upload/mesh exception ships in slice 5; AutoCAD opt-in/license note ships in slice 13a; MCP connect guide ships in slice 15.
- **Slice 14 is conditional**: it only proceeds past its spike task if the Windows EXPORT/3DPRINT headless STL spike passes. A failed spike is not a blocked task — it is a valid outcome that skips the rest of the slice.

## Dependency Graph

```
1 ──┬─▶ 3a ─▶ 3b ─▶ 4a ─▶ 4b ──────────────┬─▶ 13a ─▶ 13b ─▶ 14
    └─▶ 5 ──────────────────────┬─▶ 6 ─────┘                 ▲
2a ─┬─▶ 2b ───────────────────▶─┘                             │
    └─▶ 12 ─────────────────────────────────────────────────┘
7 ──┬─▶ 8 (needs 5 too)
    └─▶ 9 ─▶ 10 ─▶ 11
              └────────▶ 15
```

## Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `documents`/`meshes` tables + job `type`/`document_id` | PR 1 | `npm test -w apps/api -- documents` | N/A — pure store-layer change, covered by unit tests | Drop new tables/columns; `migrate()` no-ops on rerun |
| 2a | `CadStrategy` protocol + `FreeCadStrategy` (behavior-preserving) | PR 2 | `python -m unittest agent.tests.test_strategies -v` | Manual: run phase-1 `create_box` job end-to-end, diff argv | Revert `executor.py`/`strategies/` to pre-refactor pipeline |
| 2b | Worker `OPS` dispatch + STL export + scene | PR 3 | `python -m unittest agent.tests.test_agent -v` | Manual: FreeCAD 1.1.3 create→modify→STL on a real host | Revert `freecad_worker.py`; STL export step is additive |
| 3a | Tools batch A + device/CAD selection + enqueue gate | PR 4 | `npm test -w apps/api -- tools` | N/A — MCP tool schema/enqueue unit tests only | Remove `tools.ts` registration calls from `main.ts` |
| 3b | MCP instructions/prompts/resources text | PR 5 | `npm test -w apps/api -- tools` | Manual: connect an MCP client, read `cadgpt://guidance/*` | Remove instructions/resources block; tools still work |
| 4a | Tools batch B1 (booleans, extrude) | PR 6 | `npm test -w apps/api -- tools` | Manual: `boolean_union` via MCP client against a live document | Remove batch B1 registrations |
| 4b | Tools batch B2 (transforms, read_scene, export) + shared `ops-allowlist.json` | PR 7 | `npm test -w apps/api -- tools` && `python -m unittest agent.tests.test_agent -v` | Manual: `read_scene` via MCP client | Remove batch B2 registrations; fixture stays reusable |
| 5 | Mesh upload/serve routes + limits + README exception | PR 8 | `npm test -w apps/api -- mesh` | Manual: `curl` a device-signed STL upload against a running API | Remove `mesh.ts` mount; delete `DATA_DIR/meshes` |
| 6 | Agent upload step after export | PR 9 | `python -m unittest agent.tests.test_upload -v` | Manual: agent job with API upload target reachable | Revert `main.py` upload call; jobs still complete |
| 7 | Web routing skeleton + auth guard | PR 10 | `npm test -w apps/web -- auth` | Manual: `ng serve`, navigate `/designs/:id` unauthenticated | Revert `app.routes.ts` to empty; stub pages removable |
| 8 | STL viewer on `/designs/:id` | PR 11 | `npm test -w apps/web -- stl-viewer` | Manual: open a design with a completed job in a browser | Remove `features/viewer/`; design-detail falls back to pending only |
| 9 | Dashboard shell/nav + informational pages | PR 12 | `npm test -w apps/web -- home` | Manual: visit `/`, `/about` unauthenticated | Revert shell/nav styling; pages remain functional |
| 10 | Dashboard devices/designs pages + `WorkspaceStore` | PR 13 | `npm test -w apps/web -- workspace-store` | Manual: `/devices`, `/designs` with a real session | Revert pages to slice-7 stubs |
| 11 | Dashboard jobs history | PR 14 | `npm test -w apps/web -- jobs` | Manual: `/jobs` with mixed job statuses | Revert page to slice-7 stub |
| 12 | Discovery: accoreconsole + full/LT detection | PR 15 | `python -m unittest agent.tests.test_discovery -v` | Manual: run discovery on a Windows host with AutoCAD LT and full | Revert `discovery.py`; FreeCAD-only executable logic returns |
| 13a | AutoCAD strategy + `.lsp`/`.scr` + create ops + `--enable-autocad` | PR 16 | `python -m unittest agent.tests.test_strategies -v` | Manual: Windows host, `--enable-autocad`, run a create job | Revert strategy file + flag; AutoCAD stays non-executable |
| 13b | AutoCAD modify/read ops + API capability gating | PR 17 | `npm test -w apps/api -- tools` && `python -m unittest agent.tests.test_strategies -v` | Manual: Windows host, modify job against an existing DWG | Revert API gate change; AutoCAD stays create-only |
| 14 | Conditional: AutoCAD STL preview (post-spike) | PR 18 | `python -m unittest agent.tests.test_strategies -v` | **Spike required first**: manual Windows EXPORT/3DPRINT headless test | Revert strategy STL branch; `capabilities.mesh` reverts to false |
| 15 | Post-pairing connect step + agent open + docs | PR 19 | `npm test -w apps/web -- connect` && `python -m unittest agent.tests.test_agent -v` | Manual: full pairing flow, confirm `/connect?device=<uuid>` opens | Revert `main.py` open-URL call and `ConnectPage` content |

---

## Slice 1 — `documents` table + job `type`/`document_id` (PR 1, depends on: —)

- [x] 1.1 Add `documents` and `meshes` table DDL (D1 Data Model) to `apps/api/src/store.ts` constructor, guarded by `CREATE TABLE IF NOT EXISTS`. Columns: `owner`/`created`/`updated` per repo convention (F2/D2), not the proposal's literal names.
- [x] 1.2 Add `Store.migrate()`: read `PRAGMA table_info(jobs)`, add `type`/`document_id` columns only when missing; called from the constructor after table creation.
- [x] 1.3 Add `createDocument(owner, deviceId, cadKind, name)`, `getDocument(id, owner)`, `listDocuments(owner)`; update `complete()` to bump `documents.updated/latest_job_id/native_path` in the same transaction on success.
- [x] 1.4 Update `heartbeat()`/`enqueue()` to accept/return `type`/`documentId`; map phase-1 rows `type=null → 'create_box'`.
- [x] 1.5 Add D17 concurrency lock: reject enqueue when the target `document_id` already has a `queued|running` job (409).
- [x] 1.6 Tests in `apps/api/test/documents.test.ts`: migrate idempotence on a phase-1 DB fixture (run twice, assert one column addition); document creation scoped to `owner`; cross-owner `getDocument` returns not-found (spec document-registry "Cross-owner access denied"); `list_documents` returns only the caller's rows (spec "List scoped to owner"); D17 lock rejects a second active job on the same document.

Acceptance: `migrate()` is idempotent and non-destructive on an existing phase-1 `jobs` table; a document row inserts with `owner` = caller's `sub`; a non-owner request for that document returns not-found/forbidden. ~180 changed lines.

## Slice 2a — `CadStrategy` protocol + `FreeCadStrategy` refactor (PR 2, depends on: —)

- [x] 2a.1 (RED) Add `agent/tests/test_strategies.py` asserting today's FreeCAD job argv/env/`shell=False` baseline (Subprocess argv composition threat row — applicable), captured **before** the refactor lands.
- [x] 2a.2 Define `CadStrategy` Protocol in `agent/cadgpt_agent/strategies/base.py` (`supports`, `build_argv`, `env`, `artifacts`) per design.
- [x] 2a.3 Implement `FreeCadStrategy` in `agent/cadgpt_agent/strategies/freecad.py`, wrapping the current single-op pipeline unchanged — no new ops yet, behavior-preserving.
- [x] 2a.4 (RED) Add the "Caller-controlled paths" guard test (applicable threat row) to `agent/tests/test_strategies.py`: `document_id` not a UUID is rejected; a UUID with path separators is rejected; symlinked `doc_dir` is rejected via `resolve().is_relative_to(root)`.
- [x] 2a.5 Update `agent/cadgpt_agent/executor.py`: select the FreeCAD strategy by `cad.name`; add `uuid.UUID(...)` round-trip validation and `doc_dir = root/documents/<document_id>` containment check before any `Popen`; preserve exclusive job-dir `mkdir`, sanitized env, `shell=False`, fixed argv.
- [x] 2a.6 Confirm `agent/tests/test_strategies.py` passes against the refactored `executor.py`/`strategies/freecad.py` with byte-identical argv to the 2a.1 baseline.

Acceptance: the existing phase-1 `create_box` job produces byte-identical argv/env after the refactor; a malformed or path-shaped `document_id` is rejected before any subprocess spawns. ~150 changed lines.

## Slice 2b — Worker `OPS` dispatch + STL export + scene (PR 3, depends on: 2a)

- [x] 2b.1 (RED) Add per-op malformed-value rejection tests to `agent/tests/test_agent.py` (Subprocess argv composition row — applicable): `NaN`/`1e309`/negative mm, out-of-range values, object ids containing `..`/`;`/quotes — asserted to fail before any FreeCAD call.
- [x] 2b.2 Add `OPS: dict[str, Callable]` dispatch in `agent/cadgpt_agent/freecad_worker.py`, keyed by allowlisted op name; unknown op exits 2 with no CAD process spawned.
- [x] 2b.3 Implement `create_box`/`create_cylinder`/`create_sphere`/`create_cone`: `newDocument` + `saveAs(doc_dir/design.FCStd)` when `documentId` is absent.
- [x] 2b.4 Implement the reopen path: `openDocument` → mutate → `recompute()` → `save()` when `documentId` is present (spec freecad-execution "Modify operation reopens existing document").
- [x] 2b.5 Implement `boolean_cut`/`boolean_union`/`boolean_intersect` (`Part::Cut|Fuse|Common` on `Base`/`Tool`).
- [x] 2b.6 Implement `translate_object`/`rotate_object`/`scale_object` mutating `obj.Placement`/`obj.Shape.scale`; resolve objects via `doc.getObject()`, rejecting unknown names (D5).
- [x] 2b.7 Implement `read_scene`: write `scene.json` as `[{name,label,type,bbox,volume}]` from a compound of top-level objects (empty `InList`).
- [x] 2b.8 Add the STL export step after every successful op via `MeshPart.meshFromShape(LinearDeflection=0.1, AngularDeflection=0.26, Relative=False).write(job_dir/preview.stl)`, alongside the native save (spec freecad-execution "STL Export Step").
- [x] 2b.9 Extend `agent/tests/test_agent.py`: one test per op class (create/modify/boolean/transform/read_scene) and an STL byte-shape assertion (`size == 84 + 50*facets`).

Acceptance: `boolean_union` with a `document_id` reopens, recomputes, saves, and exports STL; an unknown op exits 2 without spawning a CAD process; every malformed numeric/id input from 2b.1 is rejected pre-spawn. ~340 changed lines (near budget — do not add scope here).

**Delivered at 478 changed lines** (`git diff --numstat`: `executor.py` +15/-5, `freecad_worker.py` +245/-13, `strategies/freecad.py` +9/-3, `test_agent.py` +183/-1, `test_strategies.py` +2/-2), ~138 over the 400-line hard cap, after two honest simplification passes (generic `_bounded`/`_mm` validators, a shared `_create_primitive`/`_boolean` factory, `SimpleNamespace`-based test fakes instead of full classes). No comment, blank line, doc, or test was cut to chase the number. The overage is structural: 11 real ops each need pre-FreeCAD validation, and per-op-class positive coverage (2b.9) needs a stubbed `FreeCAD`/`Part`/`MeshPart` surface plus the `request.json` op/param passthrough in `executor.py` that this slice's task list didn't itemize but the design's `request.json = {op, params, document_id}` shape requires. See apply-progress.md for the proposed two-PR split (`2b-i`: 2b.1-2b.4+2b.8; `2b-ii`: 2b.5-2b.7+2b.9) if `size:exception` is not accepted.

## Slice 2c — Environment configuration (PR 3b, depends on: —; requested by the user on 2026-09-14)

- [x] 2c.1 Add `apps/api/src/config/envs.ts` following the user's `micro-env` pattern: `import "dotenv/config"`, a `joi` schema with `.unknown(true)`, throw `Config validation error: ...` on failure, export a typed `envs` object. Variables: `PORT` (number, default 3000), `HOST` (string, default 127.0.0.1), `PUBLIC_ORIGIN` (uri, required), `OIDC_ISSUER` (uri, required), `OIDC_AUDIENCE` (string, required), `OIDC_JWKS_URL` (uri, optional), `DATA_DIR` (string, optional), `NODE_ENV` (development|production|test, default development).
- [x] 2c.2 Replace every `process.env.*` read in `apps/api/src/main.ts` with `envs.*`; keep behavior identical (same defaults, same validation in `security.ts`).
- [x] 2c.3 Add `joi` and `dotenv` to `apps/api/package.json`; `apps/api/test/envs.test.ts` covering: valid env parses with defaults; missing `PUBLIC_ORIGIN` throws `Config validation error`; unknown keys are tolerated.
- [x] 2c.4 Angular environments: `apps/web/src/environments/environment.ts` (development: `production: false`, `apiBaseUrl: ''`) and `environment.prod.ts` (`production: true`, `apiBaseUrl: ''`); add `fileReplacements` to the `production` build configuration in `apps/web/angular.json`; import `environment` where the API base is composed in `apps/web/src/app/app.ts` (relative URLs stay relative — runtime `/api/config` remains the source of OIDC settings so one image serves every environment).
- [ ] 2c.5 Document the variables in `.env.example` (unchanged names) and a short "Configuration" subsection in `docs/deployment.md`. **Partially done**: `docs/deployment.md` has the "Configuration" subsection; the root `.env.example` addition (optional-var comments for `OIDC_JWKS_URL`/`DATA_DIR`/`NODE_ENV`) was blocked by the sandbox's dotenv-file write guard (writes to any `.env*` path are denied regardless of tool, even though the file holds only placeholder values, not real secrets) — required names (`PUBLIC_ORIGIN`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `HOST`, `PORT`) were already present and unchanged, so this is a small manual follow-up, not new content.

Acceptance: `npm run build && npm test` green; starting the API without `PUBLIC_ORIGIN` fails fast with `Config validation error`; production Angular build uses `environment.prod.ts`. ~150 changed lines.

## Slice 3a — MCP tools batch A + device/CAD selection (PR 4, depends on: 1)

- [x] 3a.1 (RED) Add `apps/api/test/tools.test.ts` schema-rejection test: `create_box` with an extra free-text/code field fails validation and enqueues no job (spec mcp-cad-operations "Schema rejects code-shaped input").
- [x] 3a.2 Create `apps/api/src/tools.ts` with `registerTools(server, store, owner, auth)`; register `list_devices`, `list_documents`, `get_job`, `create_box`, `create_cylinder`, `create_sphere`, `create_cone` with strict (`.strict()`) Zod schemas using the shared param fragments (`deviceId`, `cadId`, `mm`, `coord`, `confirmed`).
- [x] 3a.3 (RED) Add ambiguous-device test: two paired devices with the same CAD, tool called without `deviceId`, expect a `selection_required` response (spec "Ambiguous device requires explicit choice").
- [x] 3a.4 Implement device/CAD auto-resolve (D6): auto-resolve when exactly one online executable CAD matches; otherwise return `selection_required` + candidates.
- [x] 3a.5 Implement `enqueue(owner, op, input)` gate: device owned+online, `cad.capabilities.ops` includes `op` (fallback FreeCAD op list when `capabilities` absent), document owned and `cad_kind` matches, D17 lock, ≤5 active jobs per device (spec job-lifecycle "Active Job Cap Unchanged", "Non-FreeCAD capability check").
- [x] 3a.6 Mount `registerTools` in `apps/api/src/main.ts`.
- [x] 3a.7 Tests: owner-not-a-parameter check on every batch-A schema (spec mcp-cad-operations "Owner not a parameter"); enqueue capacity-cap and D17-lock tests.

Acceptance: a code-shaped extra field fails schema validation before enqueue; an ambiguous device/CAD pair returns a choice request instead of guessing. ~260 changed lines.

**Delivered at 580 changed lines** (`git diff --numstat`: `main.ts` +2/-39, `store.ts` +13/-2, `tools.ts` +353/-0 new file, `tools.test.ts` +171/-0 new file), 180 over the 400-line hard cap. `main.ts` itself shrank (net -37) since the three inline tool registrations it used to carry moved out; the overage is structural in the two new files: 7 MCP tool registrations (5 create-ops + 2 reads + `get_job`) each need a full `.strict()` Zod schema, description, and annotations block (passing the whole schema, not `.shape`, to `registerTool` — required so the MCP SDK's `normalizeObjectSchema` preserves `.strict()` instead of silently stripping the extra field the RED test needs rejected), plus the `resolveCad`/`enqueueOp` gate functions with D6/D11/D17 commentary, plus 6 required tests (3a.1, 3a.3, 3a.7's three checks, and the happy-path test the apply prompt explicitly requested). No comment, blank line, doc, or test was cut to chase the number. See apply-progress.md Slice 3a "Workload / PR Boundary" for the size:exception recommendation.

## Slice 3b — MCP instructions/prompts/resources text (PR 5, depends on: 3a)

- [x] 3b.1 (RED) Add a test asserting the instructions/resource text contains no code-fence, script, or path-like example (spec expert-design-guidance "No Code/Path Hints in Guidance").
- [x] 3b.2 Add `McpServer({ instructions })` content to `apps/api/src/tools.ts`: mm units, confirm-before-mutating, default tolerances (±0.1 mm general, ±0.02 mm fits), naming conventions, DfM guidance (mechanical + architectural).
- [x] 3b.3 Add resources `cadgpt://guidance/mechanical`, `cadgpt://guidance/architectural`, `cadgpt://guidance/units-tolerances`.
- [x] 3b.4 Add prompts `design_brief` (elicit intent → parametric plan) and `design_review` (read scene, check tolerance/fit/manufacturability).

Acceptance: an MCP client reading instructions/resources receives documented conventions with zero code/path examples (verified by 3b.1). ~120 changed lines.

## Slice 4a — MCP tools batch B1: booleans, extrude (PR 6, depends on: 3a, 2b)

- [x] 4a.1 (RED) Add a schema-rejection test: an `object` id containing `..`/`;`/quotes fails validation before enqueue (Subprocess argv composition threat row — applicable, api-side half).
- [x] 4a.2 Register `boolean_cut`/`boolean_union`/`boolean_intersect` in `apps/api/src/tools.ts` (`documentId`, `base: object`, `tool: object`, `confirmed`).
- [x] 4a.3 Register `extrude_rect` (`selection`, `documentId?`, `width,height,depth: mm`, `plane: z.enum(['XY','XZ','YZ'])`, `position?`, `confirmed`). Also added `extrude_rect` to the FreeCAD worker's `OPS` table (`agent/cadgpt_agent/freecad_worker.py`) — not itemized separately but required for the tool to be functional, per the apply batch's explicit instruction.
- [x] 4a.4 Add the shared `object` regex validator (FreeCAD `Name` `^[A-Za-z][A-Za-z0-9_]{0,31}$` or AutoCAD handle `^[0-9A-F]{1,16}$`) per D5, reused by both new tools.
- [x] 4a.5 Tests: per-tool schema validation plus an enqueue-wiring test hitting the 3a.5 gate.

Acceptance: `boolean_union` with a malformed object id (containing `;`) fails validation before enqueue (verified by 4a.1). ~200 changed lines.

## Slice 4b — MCP tools batch B2: transforms, read_scene, export + shared allowlist fixture (PR 7, depends on: 4a)

- [x] 4b.1 Register `translate_object`/`rotate_object`/`scale_object` (`documentId`, `object`, bounded numeric params, `confirmed`).
- [x] 4b.2 Register `read_scene` (`documentId` only), returning `scene` JSON capped at ≤12 kB, rendered as data/text only, never interpreted.
- [x] 4b.3 Register `export_design` (`documentId`, `format: z.enum(['step','stl','dxf'])`, `confirmed`).
- [x] 4b.4 Create `ops-allowlist.json` at the **repo root** listing every server-exposed op (design risk 4 — shared fixture both `apps/api/test` and `agent/tests` read by relative path).
- [x] 4b.5 (RED) Add a test asserting the server tool catalog is a subset of `ops-allowlist.json`, and a matching `agent/tests` test asserting the agent's `OPS` dict is a superset of the same fixture (spec mcp-cad-operations "Agent re-validates allowlist").
- [x] 4b.6 Tests: transform-bounds rejection (`rotate_object` degrees outside [-360,360], `scale_object` factor outside [0.001,1000]); `export_design` format-enum rejection; `read_scene` 12 kB cap enforcement.

Acceptance: the server tool catalog is verified (by 4b.5) to be a subset of the shared `ops-allowlist.json`, which the agent's allowlist also covers. ~220 changed lines estimated in this file; **actual authored diff is 711 lines** (see apply-progress.md "Budget overrun" note) — exceeds the 600-line review budget even excluding 4b.7. Flagged for a delivery-strategy decision (size:exception vs. PR split) before this branch opens a PR.

- [ ] 4b.7 Follow-up from slice 3b guidance: add an optional `label` parameter (regex `^[A-Za-z][A-Za-z0-9_]{0,31}$`, same as worker object names) to every `create_*` tool, forward it in the job payload, set `obj.Label` in the worker's `_create_primitive`, and include `label` in `read_scene` output so the "name features by function" guidance is actionable.

## Slice 5 — Mesh upload/serve routes + limits + README (PR 8, depends on: 1)

- [ ] 5.1 (RED) Add `apps/api/test/mesh.test.ts` covering the Upload boundary threat row (applicable — one test per case): oversize rejected and stores nothing; mismatched `X-Mesh-Sha256` rejected; non-binary/ASCII STL rejected; non-`running` job rejected; foreign device rejected; quota-exceeded rejected.
- [ ] 5.2 Create `apps/api/src/mesh.ts`: `POST /api/agent/jobs/:id/mesh` — device-credential auth via `token(q)`, job must be `running` on that device, `Content-Type: application/octet-stream`, streamed byte-count cap 25 MiB (destroy socket at cap+1), streaming `X-Mesh-Sha256` verification, binary STL sanity `size == 84 + 50*facets`.
- [ ] 5.3 Write to `DATA_DIR/meshes/<jobId>.stl.part` then rename; enforce a 500 MiB per-device quota (sum of `meshes.size`); retain the newest 5 meshes per document, unlink older ones; job-bound file naming only (client-supplied filename header ignored, spec mesh-preview-upload "Client-supplied name ignored").
- [ ] 5.4 Add a dedicated `rateLimit({limit: 30})` to the mesh upload route.
- [ ] 5.5 Add `GET /api/designs`, `GET /api/designs/:id` (OIDC `cad:read`, owner-scoped), `GET /api/designs/:id/mesh` → `res.sendFile` with `Content-Type: model/stl`, `Cache-Control: private, no-store`; mount all in `apps/api/src/main.ts`.
- [ ] 5.6 Update `README.md`: compatibility table plus the "mesh preview leaves the machine" security exception note (docs travel with this behavior-changing slice).
- [ ] 5.7 Tests: owner-scoped retrieval (non-owner request returns not-found/forbidden, spec "Non-owner cannot fetch mesh"); confirm every case from 5.1 passes against the implemented route.

Acceptance: every malformed/oversize/mismatched/foreign-device/non-running-job upload is rejected and stores nothing; only the document's owner can `GET` its mesh. ~300 changed lines (borderline — keep scope frozen at this list).

- [ ] 5.7 README follow-up from slice 2b: update the "Try the first operation" walkthrough (job artifacts are now `design.FCStd` and `preview.stl`; `box.step` is no longer produced) and the compatibility table wording.

## Slice 6 — Agent upload step after export (PR 9, depends on: 2b, 5)

- [ ] 6.1 (RED) Add `agent/tests/test_upload.py` with mocked `urlopen` (no redirect) asserting the upload call shape (device credential header, `X-Mesh-Sha256`, streamed body) before wiring it into `main.py`.
- [ ] 6.2 In `agent/cadgpt_agent/main.py`, after a successful export, `POST` the produced STL to `/api/agent/jobs/:id/mesh` with the device credential and a streaming sha256 header.
- [ ] 6.3 On upload failure, still report the job result as `ok=True` with a "preview unavailable" note — the design exists locally regardless of upload outcome.
- [ ] 6.4 Extend `agent/tests/test_upload.py`: success path, upload-failure-tolerant path (job still reports `ok=True`).

Acceptance: a failed mesh upload never flips a successful CAD job to a failed status. ~110 changed lines.

## Slice 7 — Web routing skeleton + auth guard (PR 10, depends on: —)

- [ ] 7.1 (RED) Add a Vitest test asserting an unauthenticated navigation to `/designs/:id` redirects to sign-in before any component renders (spec dashboard-routing "Unauthenticated redirect").
- [ ] 7.2 Define lazy routes in `apps/web/src/app/app.routes.ts` (currently empty): `''` (home, public), `about` (public), `callback`, `pair`, `connect`, `devices`, `designs`, `designs/:id`, `jobs`, `**` → `''`.
- [ ] 7.3 Implement `apps/web/src/app/core/auth/auth.service.ts` wrapping `UserManager`, with signals for `user`/`token`/`ready`.
- [ ] 7.4 Implement the functional `apps/web/src/app/core/auth/auth.guard.ts`: `await auth.ready(); return auth.user() ? true : (auth.login(state.url), false)`.
- [ ] 7.5 Implement `apps/web/src/app/layout/shell/*` (header, left rail nav, footer, `<router-outlet>`).
- [ ] 7.6 Add stub `loadComponent` pages under `apps/web/src/app/pages/{home,about,callback,pair,connect,devices,designs,design-detail,jobs}/` sufficient to compile and navigate; full content lands in slices 8–11 and 15.
- [ ] 7.7 Add a lazy-loading test: `/designs` loads its module on demand (spec dashboard-routing "Lazy route loads on navigation").

Acceptance: navigating to `/designs/:id` without a session redirects to sign-in before rendering (verified by 7.1); `/designs` loads lazily. ~260 changed lines.

## Slice 8 — STL viewer on `/designs/:id` (PR 11, depends on: 7, 5)

- [ ] 8.1 Add `three@0.186` and `@types/three` (dev) to `apps/web/package.json`.
- [ ] 8.2 (RED) Add a Vitest test (SSR-pass guard) asserting zero three.js/WebGL loading occurs during a simulated server-rendered pass (spec mesh-viewer "SSR pass skips three.js").
- [ ] 8.3 Implement `apps/web/src/app/features/viewer/stl-viewer.ts`: `meshUrl = input.required<string>()`, `afterNextRender` → dynamic `import('./three-scene')` only in the browser.
- [ ] 8.4 Implement `apps/web/src/app/features/viewer/three-scene.ts`: scene setup, `STLLoader` from `three/addons/loaders`, `OrbitControls`, `ResizeObserver`, `DestroyRef` disposes the renderer.
- [ ] 8.5 Wire `apps/web/src/app/pages/design-detail/*`: fetch `GET /api/designs/:id` and `GET /api/designs/:id/mesh` (bearer), pass the mesh URL into `StlViewer` only when a mesh exists.
- [ ] 8.6 (RED, F1) Add a Vitest test for the pending-state scenario: a document with only a queued/running job renders a pending UI state and never constructs a mesh URL or invokes `STLLoader` (spec mesh-viewer "Pending State Without Mesh").
- [ ] 8.7 Implement the pending state in `design-detail`: when no mesh exists yet, render pending copy instead of attempting a mesh fetch/load (satisfies 8.6).
- [ ] 8.8 Tests: `StlViewer` mounts a canvas only when `meshUrl` is present (`three-scene` mocked); preview renders after job completion (spec "Preview renders after job completion").

Acceptance: opening `/designs/:id` for a document with only a queued job shows pending — not an error — and never calls `STLLoader` (8.6/8.7); after job completion the same route renders the STL geometry (8.8); no three.js/WebGL code runs during any server-rendered pass (8.2). ~280 changed lines.

## Slice 9 — Dashboard shell/nav + informational pages (PR 12, depends on: 7)

- [ ] 9.1 Apply the `frontend-design` pass to shell/nav: drafting-paper neutrals + one technical blue, persistent left rail, one grotesque type family, tabular numerals for mm dimensions (design "Design-system intent").
- [ ] 9.2 Build real home page content (public) in `apps/web/src/app/pages/home/*`.
- [ ] 9.3 Build real about page content (public) in `apps/web/src/app/pages/about/*`.
- [ ] 9.4 Tests: home/about render without an active session; left rail nav renders on every authenticated route.

Acceptance: home/about render for an unauthenticated visitor; the left rail nav renders on every authenticated route. ~180 changed lines.

## Slice 10 — Dashboard devices/designs pages + `WorkspaceStore` (PR 13, depends on: 9)

- [ ] 10.1 Implement `apps/web/src/app/core/state/workspace.store.ts`: signals + `resource()` for devices, jobs, designs (D16).
- [ ] 10.2 Implement `apps/web/src/app/core/api/{api-client,models}.ts`: typed `fetch` + bearer client and DTOs.
- [ ] 10.3 Build the devices page (list + status) and designs list page (backed by `list_documents`) under `apps/web/src/app/pages/{devices,designs}/*`.
- [ ] 10.4 Tests: `WorkspaceStore` resource loading/error states (`TestBed`); designs list renders only the authenticated owner's documents (ties to spec document-registry "List scoped to owner").

Acceptance: the designs list page renders only the authenticated owner's documents. ~240 changed lines.

## Slice 11 — Dashboard jobs history (PR 14, depends on: 9, 10)

- [ ] 11.1 Build the jobs history page under `apps/web/src/app/pages/jobs/*`, consuming `WorkspaceStore.jobs`; show status/type/document link.
- [ ] 11.2 Tests: jobs list renders each status (queued/running/succeeded/failed) and links to `document_id` when present.

Acceptance: the jobs history page shows each job's `type` and links to its `document_id` when present. ~120 changed lines.

## Slice 12 — Discovery: accoreconsole + full/LT detection (PR 15, depends on: 2a)

- [x] 12.1 (RED) Add `agent/tests/test_discovery.py` cases for the "Documentation-like/executable-file classification" threat row (applicable — one test per basename class): `notes.txt`, `README.sh`, `acad.exe` (GUI), `acadlt.exe` must all yield `execute=false`.
- [x] 12.2 Add `accoreconsole.exe` detection in `agent/cadgpt_agent/discovery.py` per D14: read `HKLM\SOFTWARE\Autodesk\AutoCAD\R*\ACAD-*` → `AcadLocation`; require `<AcadLocation>\accoreconsole.exe` to exist; glob fallback `Program Files\Autodesk\AutoCAD 20*\accoreconsole.exe`; manual `--cad-path` may point at `accoreconsole.exe` directly.
- [x] 12.3 Compute `executable` per-CAD capability replacing the hardcoded FreeCAD-only boolean: FreeCAD via `freecadcmd*` basename; AutoCAD via `accoreconsole.exe` presence + full edition (spec cad-discovery "Executable as Per-CAD Capability"). **Deviation (D12, stated explicitly per orchestrator instruction)**: `capabilities.execute`/`executable` for AutoCAD stay hardcoded `False` in this slice even when `accoreconsole.exe` + full edition are confirmed, because `--enable-autocad` does not exist yet — it lands in 13a.5. `edition`/`console` are still populated so 13a can flip `execute` once the flag threads through.
- [x] 12.4 Add `capabilities: {execute, edition, console, ops, mesh}` on the CAD entry; mirror the boolean `executable` for phase-1 agents; distinguish full vs LT via ProductID (spec "Full-vs-LT Signal").
- [x] 12.5 Tests: mocked `winreg`/glob — LT detected (`edition='lt'`, `executable=false`); full AutoCAD detected (`edition='full'`, `accoreconsole.exe` path reported); confirm all 12.1 cases pass.

Acceptance: discovery never executes an untrusted binary to probe capability (verified by 12.1); edition distinction is registry/glob-based only. ~200 changed lines.

## Slice 13a — AutoCAD strategy + `.lsp`/create ops + `--enable-autocad` (PR 16, depends on: 12, 4b)

- [x] 13a.1 (RED) Add a golden `.scr` equality test per create op to `agent/tests/test_strategies.py`, plus a malformed numeric/handle rejection test, before the strategy exists (Subprocess argv composition threat row — applicable). Confirmed RED: temporarily removed `strategies/autocad.py` and reran `test_strategies.py` — import failed (`ModuleNotFoundError: No module named 'cadgpt_agent.strategies.autocad'`), all new tests uncollectible. Restored and confirmed GREEN.
- [x] 13a.2 Implement `AutoCadStrategy.build_argv` in `agent/cadgpt_agent/strategies/autocad.py`: `[accoreconsole.exe, "/i", doc_dir/design.dwg | blank.dwg, "/s", job_dir/run.scr, "/isolate"]`, `shell=False` (enforced by the executor's existing `Popen(..., shell=False)`, unchanged).
- [x] 13a.3 Kept the pre-existing `agent/cadgpt_agent/autocad/blank.dwg` (orchestrator-provided, untouched). **Deviation**: rendered `run.scr` at runtime from validated numbers in `build_argv`/`render_script`, instead of static per-op `.scr` templates — safer (no template-substitution surface) and matches the task brief's own preferred alternative ("prefer runtime rendering from validated numbers (safer, no free text)").
- [x] 13a.4 Created `agent/cadgpt_agent/autocad/cadgpt.lsp` exposing one `cadgpt-<op>` function per allowlisted create op (`cadgpt-create-box/-cylinder/-sphere/-cone`, `cadgpt-extrude-rect`), core AutoLISP only (`command`, `strcat`, `rtos`, `if`), no `vlax-*`/`vla-*` (research A3).
- [x] 13a.5 Gated `AutoCadStrategy` selection behind `executable=True`, itself gated by agent flag `--enable-autocad` (D12): `discovery.discover()` gained `enable_autocad=False` param; `execute = enable_autocad and edition=='full' and console is not None`. Added `--enable-autocad` (`store_true`) to `agent/cadgpt_agent/main.py`, threaded into `discover(manual, enable_autocad=args.enable_autocad)`.
- [x] 13a.6 Added `executor._decode_tail(tail, cad_kind)`: `utf-16-le`/`errors="replace"` for AutoCAD, `utf-8`/`errors="replace"` for other CADs; used to append a bounded (≤500 char) diagnostic snippet to the "CAD engine failed to create the document" error.
- [x] 13a.7 Updated `README.md` (compatibility table + new "AutoCAD (opt-in, experimental)" section) and `SECURITY.md` (opt-in/licensing paragraph) with the `--enable-autocad` flag and an explicit Autodesk-EULA/unattended-use responsibility note (D12).
- [x] 13a.8 Confirmed all 13a.1 golden/malformed tests pass (GREEN). Added `AutoCadExecutorGatingTests`: an AutoCAD `cads` entry with `executable=False` is unreachable through `executor.execute` (`popen.assert_not_called()`, `ValueError` raised) even though `AutoCadStrategy.supports(op)` is `True`; a matching entry with `executable=True` dispatches with the fixed 6-token argv. Added `EnableAutocadFlagTests` in `test_discovery.py`: full AutoCAD stays `execute=False` without the flag, becomes `execute=True` with it, LT stays `execute=False` even with the flag, FreeCAD is unaffected.

Acceptance: without `--enable-autocad`, no AutoCAD job can be dispatched; with it, argv is exactly the fixed 6-token form for every create op (verified by 13a.1/13a.8). ~320 changed lines (near budget — do not add scope here).

## Slice 13b — AutoCAD API capability gating (create-only) (PR 17, depends on: 13a)

Re-scoped 2026-09-14 after a live spike: AutoCAD object addressing for modify ops
needs handles from `read_scene`, and `read_scene` is not robust without ActiveX
(`vlax-ename->vla-object` returns nil in Core Console; volume/bbox only via
locale-dependent MASSPROP parsing). AutoCAD therefore ships as create + DWG +
STL preview (slice 14); modify/read ops are deferred to a future phase with a
dedicated non-vlax scene-readback design. The load-bearing API work still lands
here so AutoCAD create jobs can be enqueued at all.

- [x] 13b.1 (RED) Add an API test asserting an AutoCAD-targeted document rejects any op outside its `capabilities.ops` before a job is enqueued, and accepts a create op that is in it.
- [x] 13b.2 Accept and persist `capabilities` on the CAD entry: extend `cadSchema` in `apps/api/src/store.ts` with an optional `capabilities` object (`{execute?, edition?, console?, ops?, mesh?}`) and store/return it on the device's cad list so `enqueueOp` reads AutoCAD's real `ops`.
- [x] 13b.3 Generalize `Store.enqueue()`'s hardcoded `name === 'FreeCAD' && executable` check to `executable` + a matching document `cadKind`, so AutoCAD create jobs enqueue; keep FreeCAD behavior identical. Generalize the same check in the `POST /api/jobs` create-box REST route if present.
- [x] 13b.4 Enforce the DWG-artifact-required postcondition for AutoCAD create jobs (spec autocad-execution-adapter "Job succeeds with DWG only" / "DWG Artifact Required"): a successful AutoCAD job must leave a downloadable `design.dwg`.
- [x] 13b.5 Tests: AutoCAD create op with `capabilities.ops` enqueues and produces a DWG; an op absent from `capabilities.ops` is rejected at the API before enqueue (confirms 13b.1); FreeCAD enqueue path unchanged.
- [ ] 13b.6 (deferred, documented) AutoCAD modify (boolean/transform) and read_scene/export ops: record as a follow-up requiring a non-vlax per-solid scene readback (handle enumeration works; volume/bbox need a robust source). Do NOT implement here. **Deferral recorded 2026-09-14**: intentionally left unimplemented per the re-scope note above; `AUTOCAD_OPS`/`AutoCadStrategy._CREATE_OPS` stay at the 5 create ops, no boolean/transform/read/export AutoCAD code was added in this slice.

Acceptance: AutoCAD create jobs enqueue and produce a downloadable DWG; any op not in the CAD's advertised `capabilities.ops` is rejected at the API before enqueue; FreeCAD is unaffected. ~260 changed lines.

## Slice 14 — Conditional: AutoCAD STL preview (PR 18, depends on: 13b, 6)

- [ ] 14.0 **SPIKE (blocking, run first)**: on a Windows host with full AutoCAD, attempt headless STL export via `EXPORT`/`3DPRINT` from Core Console against a representative DWG. **Pass**: a valid binary STL (`size == 84 + 50*facets`) is produced with `accoreconsole.exe` and no interactive dialog. **Fail**: no STL produced, a hang, or a required interactive prompt. Record the result in `docs/` before proceeding to 14.1.
- [ ] 14.1 (conditional on 14.0 = pass, RED) Add a golden command-sequence test for the export step and an STL byte-shape assertion, before implementing it.
- [ ] 14.2 (conditional on 14.0 = pass) Implement STL export in `AutoCadStrategy.artifacts()` (`agent/cadgpt_agent/strategies/autocad.py`) via the proven `EXPORT`/`3DPRINT` sequence; `STLOUT` MUST NOT be used (unavailable in Core Console and LT per research A4, spec autocad-execution-adapter "STL Preview Is Conditional On Spike").
- [ ] 14.3 (conditional on 14.0 = pass) Set `capabilities.mesh=true` for AutoCAD in `agent/cadgpt_agent/discovery.py` once export is proven; the slice 6 upload step already covers AutoCAD jobs unchanged.
- [ ] 14.4 (conditional on 14.0 = fail) Leave `capabilities.mesh=false` for AutoCAD (already the default from slices 12/13); no further code changes — the slice 8 pending/unavailable path already covers "no mesh" for any CAD kind (spec "No spike, no STL").

Acceptance: `capabilities.mesh` for AutoCAD is `true` only if 14.0 passed and is verified by the 14.1 golden test; otherwise it stays `false` and no `STLOUT` call exists anywhere in the codebase. ~150 changed lines if the spike passes; 0 (skipped, aside from the recorded spike result) if it fails.

## Slice 15 — Post-pairing connect step + agent open + docs (PR 19, depends on: 9)

- [ ] 15.1 (RED) Add a Vitest test asserting `ConnectPage` renders both Claude-specific and ChatGPT-specific instruction sets, distinct from each other (spec mcp-client-onboarding).
- [ ] 15.2 In `agent/cadgpt_agent/main.py`, after `poll` returns a credential, open `server + '/connect?device=' + deviceId` (UUID only, never the secret); `--headless` prints it instead of opening a browser.
- [ ] 15.3 Build `apps/web/src/app/pages/connect/*`: MCP resource URL (`origin + '/mcp'`), Claude-specific steps (Settings → Connectors → Add custom connector → paste URL → sign in), ChatGPT-specific steps (Settings → Connectors → Developer mode → Add → paste URL), a live device-status card polling `/api/devices`, a "Try `list_devices`" callout.
- [ ] 15.4 Link `apps/web/src/app/pages/pair/*` → `/connect` after approval.
- [ ] 15.5 Update `README.md`/`docs/`: MCP connect guide, cross-reference to the AutoCAD opt-in and mesh-preview exception notes already added in slices 5 and 13a.
- [ ] 15.6 Tests: confirm 15.1 passes; add an agent test (mocked `webbrowser.open`) asserting the opened URL contains only the device UUID, never the secret.

Acceptance: the connect step never displays the device secret, only its UUID (15.6); Claude and ChatGPT instructions are visibly distinct (15.1). ~220 changed lines.
