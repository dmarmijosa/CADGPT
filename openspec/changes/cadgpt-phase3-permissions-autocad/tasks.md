# Tasks: CADGPT Phase 3 — File-Permissions Allowlist + AutoCAD Op Parity + Dashboard Redesign

Source: proposal, design, redesign-reference, and 5 delta specs (`file-permissions-allowlist`,
`autocad-execution-adapter`, `cad-discovery`, `document-registry`, `mcp-cad-operations`) in
`openspec/changes/cadgpt-phase3-permissions-autocad/`. **DEFERRED** — checklist only, no
implementation this cycle. Three pillars (P1, P2, P3) ship as three **independent** PR chains;
none blocks the others except P3's allowlist-surface slice, which depends on P1's API.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | P1 ≈ 1,600–1,900 across 6 slices; P2 ≈ 700–1,000 across 5 slices (open-ended pending Spike A); P3 ≈ 1,400–1,800 across 5 slices |
| Review budget (this project) | 800 changed lines per PR slice |
| 800-line budget risk | High — P1 slice 2, P2 boolean/transform slices, and every P3 restyle slice sit close to or historically over budget (phase-2 precedent: shell+2-page restyle alone hit 729/600) |
| Chained PRs recommended | Yes — three independent chains, split into slices below |
| Suggested split | P1: 6 slices (Spike B → store → heartbeat/containment → FreeCAD save-back → MCP tool → dashboard UI). P2: 5 slices (Spike A → boolean → transform → read_scene/export → discovery+parity). P3: 5 slices (tokens/shell → pages a → pages b → allowlist surface → per-OS guidance) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

`ask-on-risk` → the orchestrator MUST stop and ask the user to pick a chain strategy
(stacked-to-main / feature-branch-chain / size:exception) **per pillar** before `sdd-apply`
starts P1 slice 1, P2 slice 1, or P3 slice 1. Historical precedent on this repo (phase-2 tasks)
shows restyle-heavy and multi-op slices routinely exceed budget by 15–190%; flag each such
slice for a size:exception ask rather than silently splitting further once inside `sdd-apply`.

## Independent Chains

- **P1 (file-permissions allowlist)** — blocked on Spike B (task P1.0). Independently
  deliverable; P3.3 depends on P1's routes/heartbeat shape but P1 itself depends on nothing else.
- **P2 (AutoCAD op parity)** — blocked on Spike A (task P2.0). No op ships until its family is
  spike-proven; independently deliverable, touches disjoint files from P1/P3.
- **P3 (dashboard redesign)** — UI-only, independent chain, executed in the **Gemini client
  with the Stitch MCP** (Claude Code's session has no Stitch MCP access — see
  `redesign-reference.md`). Every restyle task keeps its page's existing Vitest suite green.

## Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| P1.0 | Lock Spike B (staleness window + revocation-mid-job) | PR P1-1 | N/A — decision record, no code | N/A — design confirmation only | Revert design.md D4 confirmation note |
| P1.1 | `allowed_roots` table + owner-scoped methods + OIDC-only routes | PR P1-2 | `npm test -w apps/api -- roots` | N/A — store/route unit tests only | Drop `allowed_roots` table + route mounts |
| P1.2 | Heartbeat delivery + `resolve_external_path` + escape-vector RED tests | PR P1-3 | `python -m unittest agent.tests.test_executor -v` | Manual: poll a device with 2 allowlisted roots, inspect heartbeat body | Revert `heartbeat()` field + drop `resolve_external_path` |
| P1.3 | FreeCAD open/backup/save-back by path | PR P1-4 | `python -m unittest agent.tests.test_freecad_worker -v` | Manual: modify a real file inside an allowlisted folder, confirm `.bak` sibling | Revert worker path-open branch; UUID sandbox path unaffected |
| P1.4 | `open_external_design` MCP tool + `native_path` write + `/results/:id` nativePath | PR P1-5 | `npm test -w apps/api -- tools` | Manual: call tool via MCP client against an allowlisted path | Remove tool registration + nativePath schema field |
| P1.5 | Dashboard allowlist management UI | PR P1-6 | `npm test -w apps/web -- roots` (`ng test`) | Manual: `/devices/:id/roots` add/remove in a browser | Revert page + API-client method; API unaffected |
| P2.0 | Lock Spike A (live Windows-host op-family proof) | PR P2-1 | N/A — spike record, no shipped op | Manual: live AutoCAD 2026 host, Core Console experiment | Revert spike doc; no `AUTOCAD_OPS` change yet |
| P2.1 | Boolean AutoLISP + `.scr` (spike-permitting) | PR P2-2 | `python -m unittest agent.tests.test_strategies -v` | Manual: Windows host, `boolean_union` against a real DWG | Revert `.lsp`/`.scr` boolean block; op excluded from `AUTOCAD_OPS` |
| P2.2 | Transform AutoLISP + `.scr` (spike-permitting) | PR P2-3 | `python -m unittest agent.tests.test_strategies -v` | Manual: Windows host, `translate`/`rotate`/`scale` against a real DWG | Revert `.lsp`/`.scr` transform block |
| P2.3 | `read_scene`/`export` (spike-permitting) | PR P2-4 | `python -m unittest agent.tests.test_strategies -v` | Manual: Windows host, non-vlax read/export attempt | Revert read/export branch; hold op family if spike refutes |
| P2.4 | `AUTOCAD_OPS`/discovery update + `ops-allowlist.json` parity test | PR P2-5 | `python -m unittest agent.tests.test_ops_allowlist -v` | N/A — static assertion test | Revert `AUTOCAD_OPS` additions; discovery reverts to 5 create ops |
| P3.1 | Design tokens + shell restyle (Stitch reference) | PR P3-1 | `npm test -w apps/web` (`ng test`) | Manual (Gemini/Stitch): visual diff shell vs. Stitch project at 400px + dark/light | Revert token/shell CSS; page content unaffected |
| P3.2 | Restyle pages group A (home, about, devices, designs) | PR P3-2 | `npm test -w apps/web -- home devices designs about` | Manual (Gemini/Stitch): visual diff each page | Revert page CSS/templates only; routes/logic unaffected |
| P3.3 | Restyle pages group B (design-detail, jobs, connect, pair, callback, keys) | PR P3-3 | `npm test -w apps/web -- design-detail jobs connect pair callback keys` | Manual (Gemini/Stitch): visual diff each page | Revert page CSS/templates only |
| P3.4 | Allowlist management surface (depends on P1.4/P1.5 API) | PR P3-4 | `npm test -w apps/web -- roots` | Manual: add/remove a root from the redesigned surface | Revert surface; stub/hide behind a flag if P1 not yet merged |
| P3.5 | Per-OS install/pairing/keep-alive guidance in-app | PR P3-5 | `npm test -w apps/web -- connect` | Manual: copy-paste each OS's systemd/launchd/Task-Scheduler snippet and run it | Revert guidance block; README remains the fallback source |

---

## P1 Phase 0: Spike B — Lock Delivery Staleness + Revocation Semantics (BLOCKING, PR P1-1)

- [x] P1.0.1 Confirm and lock design.md D4 (`openspec/changes/cadgpt-phase3-permissions-autocad/design.md`, read-only reference): heartbeat-delivered allowlist, staleness ≤ one poll interval (5s), a running job completes even if its root is revoked mid-job, containment is re-checked at the next execution.
- [x] P1.0.2 Record the locked decision as a dated confirmation note appended to `openspec/changes/cadgpt-phase3-permissions-autocad/design.md` D4, removing the "Spike B" pending marker from the file-permissions-allowlist spec's gated scenarios once confirmed.
- [x] P1.0.3 No P1 code task below may start until P1.0 is checked complete.

## P1 Phase 1: `allowed_roots` Store + OIDC-Only Routes (PR P1-2, depends on: P1.0)

- [x] P1.1.1 (RED) Add `apps/api/test/roots.test.ts`: owner invariant test — body-supplied `owner` field is ignored/rejected (spec "Body-supplied owner rejected"); device-credential/API-key auth on `/roots` routes returns 401/403 (spec "Device credential cannot manage allowlist").
- [x] P1.1.2 Add `allowed_roots` table DDL to `apps/api/src/store.ts` per design D7 (`id, owner, deviceId, path, created`, `UNIQUE(owner, device_id, path)`, index on `(owner, created DESC)`).
- [x] P1.1.3 Add `addRoot(owner, deviceId, path)` (device-ownership checked), `listRoots(owner, deviceId)`, `removeRoot(owner, id)` (foreign id → 404, no existence leak) to `apps/api/src/store.ts`, mirroring the `api_keys` triad.
- [x] P1.1.4 Add `POST /api/devices/:deviceId/roots`, `GET /api/devices/:deviceId/roots`, `DELETE /api/roots/:id` to `apps/api/src/main.ts`, gated OIDC-session-only (not `authAny`); server-side path-shape validation (absolute POSIX/Windows/UNC, reject `..`/NUL/relative).
- [x] P1.1.5 Tests in `apps/api/test/roots.test.ts`: root stored per owner+device (spec "Root stored per owner and device"); root invisible to other owners (spec "Root invisible to other owners"); add derives owner from session (spec "Add derives owner from session").

Acceptance: an OIDC session adds a root with no body `owner` field and the row is keyed to that
session's `sub`+device only; a device-credential request to any `/roots` route is rejected;
a foreign owner never sees another owner's root. ~330 changed lines.

## P1 Phase 2: Heartbeat Delivery + Agent Containment Function (PR P1-3, depends on: P1.1)

- [x] P1.2.1 Extend `heartbeat()` in `apps/api/src/store.ts` to return `allowedRoots: string[]` for the polling device, alongside `{ job }` (spec "Heartbeat carries allowlist snapshot").
- [x] P1.2.2 Cache `allowedRoots` from the poll response in `agent/cadgpt_agent/main.py`'s poll loop, refreshed every 5s cycle.
- [x] P1.2.3 (RED) Add `agent/tests/test_executor.py` — one test per escape vector, all asserting `resolve_external_path` denies before the fn exists: symlink escape, junction escape, `..` traversal, NUL byte, UNC path outside allowlist, drive-relative (`C:foo`) outside allowlist, path outside every allowlisted root (foreign root) (design Threat Matrix "Caller-controlled paths" — all 7 applicable cases; spec "Symlink/junction escape rejected", "UNC path outside allowlist rejected").
- [x] P1.2.4 Implement `resolve_external_path(requested: str, allowed_roots: list[str]) -> Path` in `agent/cadgpt_agent/executor.py`, parallel to (never modifying) `resolve_document_dir`: `.resolve()` the target, normalize Windows UNC/drive-relative forms, `is_relative_to()` against each `.resolve()`d root.
- [x] P1.2.5 Confirm all P1.2.3 RED tests pass GREEN against the P1.2.4 implementation; add the positive case (spec "Canonical path inside root accepted").

Acceptance: heartbeat response contains `{ job, allowedRoots }` for a device with 2 roots; every
symlink/junction/`..`/NUL/UNC/drive-relative/foreign-root path is denied before any file
operation. ~300 changed lines.

## P1 Phase 3: FreeCAD Open/Backup/Save-Back by Path (PR P1-4, depends on: P1.2)

- [x] P1.3.1 (RED) Add `agent/tests/test_freecad_worker.py` cases: backup created before any write to the original path (spec "Backup created before write"); timeout aborts and restores from backup (spec "Timeout aborts without corruption"); failed op restores from backup (spec "Failed op restores from backup").
- [x] P1.3.2 In `agent/cadgpt_agent/freecad_worker.py`, when a job carries a contained native path (via `resolve_external_path`), open that path instead of `design.FCStd`; copy it to a timestamped `<name>.<ts>.bak` sibling BEFORE any write.
- [x] P1.3.3 Save back to the SAME native path only on success; on subprocess failure or 120s timeout, restore the original from the `.bak` copy and report unchanged (design D5).
- [x] P1.3.4 Mirror the open/backup/save-back branch in `agent/cadgpt_agent/strategies/autocad.py` for path-bound DWG jobs (used later by P2's boolean/transform ops).
- [x] P1.3.5 Confirm all P1.3.1 RED tests pass GREEN.

Acceptance: a modify job against an allowlisted file always has a `.bak` sibling before any
write; a 120s timeout or non-zero exit leaves the original byte-identical to the backup.
~290 changed lines.

## P1 Phase 4: Open-by-Path MCP Tool + `native_path` Write (PR P1-5, depends on: P1.3)

- [x] P1.4.1 (RED) Add a schema test asserting `open_external_design` has no `owner`/`username` field (spec mcp-cad-operations "Owner not a parameter"); add a validation test asserting an out-of-allowlist path enqueues no job and binds no document (spec "Out-of-allowlist path rejected at validation").
- [x] P1.4.2 Register `open_external_design { deviceId?, cadId?, path, name?, confirmed }` in `apps/api/src/tools.ts`; owner derives strictly from the OIDC subject.
- [x] P1.4.3 Validate containment via the agent's function result at execution time (server does shape-only validation before enqueue); on success set `documents.native_path` non-null at creation (spec document-registry "Open-by-path sets native_path on creation").
- [x] P1.4.4 Extend the `/api/agent/results/:id` Zod schema in `apps/api/src/main.ts` to accept optional `nativePath` (≤1024 chars); persist to `documents.native_path` via `COALESCE` only when it validates as contained (spec document-registry "Results with nativePath persists native_path", "Out-of-allowlist nativePath rejected").
- [x] P1.4.5 Enforce save-back path pinning: a modify job against a path-bound document always targets that document's stored `native_path`, never an alternate path (spec "Modify job path matches native_path", "Drifted native_path blocks save").
- [x] P1.4.6 Tests in `apps/api/test/tools.test.ts`: open-by-path binds `native_path` + owner from `sub` (spec "Open-by-path binds native_path", "Enqueue only after containment passes"); results endpoint rejects an out-of-allowlist `nativePath`.

Acceptance: `open_external_design` has zero owner/username fields in its schema; a path outside
every allowlisted root enqueues nothing; `/results/:id` only ever writes a `native_path` that
re-validates as contained. ~330 changed lines.

## P1 Phase 5: Dashboard Allowlist Management UI (PR P1-6, depends on: P1.4)

- [x] P1.5.1 Add `listRoots`/`addRoot`/`removeRoot` methods to `apps/web/src/app/core/api/api-client.ts`, following the `pages/devices/*` + `pages/keys/*` triad template.
- [x] P1.5.2 Add a `resource()`-backed roots signal to `apps/web/src/app/core/state/workspace.store.ts`.
- [x] P1.5.3 Build the allowlist management surface under `apps/web/src/app/pages/devices/*` (or a new `pages/roots/*`): list roots per device, add-root form (absolute-path input), remove button.
- [x] P1.5.4 Tests (Vitest/`TestBed`): add/remove root updates the resource; a root added by another owner never renders in this owner's list.

Acceptance: an authenticated owner can add/list/remove allowed roots for their own device only,
end to end through the dashboard. ~350 changed lines.

---

## P2 Phase 0: Spike A — Prove AutoCAD Core Console Op Feasibility (BLOCKING, PR P2-1)

- [x] P2.0.1 On a live Windows host with full AutoCAD 2026, run the candidate command sequences from design.md's op-family table (`_UNION`/`_SUBTRACT`/`_INTERSECT`, `_MOVE`/`_ROTATE3D`|`_ROTATE`/`_SCALE`, AutoLISP object enumeration for `read_scene`, export beyond the proven `_STLOUT`) headless via `accoreconsole.exe`.
- [x] P2.0.2 Record the result per op family (proven / refuted / fallback sequence found) in a new `docs/autocad-op-parity-spike.md`, mirroring `docs/autocad-stl-spike.md` (read-only reference for format).
- [x] P2.0.3 No op family in P2.1–P2.3 may be implemented unless P2.0.2 records it as live-proven for that family; a refuted family is held (not implemented) per design D8.

## P2 Phase 1: Boolean AutoLISP + `.scr` (PR P2-2, depends on: P2.0 proving boolean family)

- [x] P2.1.1 (RED) Add golden `.scr`-equality tests to `agent/tests/test_strategies.py` for `boolean_cut`/`boolean_union`/`boolean_intersect`, plus a malformed-handle rejection test (design Threat Matrix "Subprocess argv composition" — applicable), before the AutoLISP functions exist.
- [x] P2.1.2 Add `cadgpt-boolean-cut`/`-union`/`-intersect` functions to `agent/cadgpt_agent/autocad/cadgpt.lsp`, core AutoLISP only (no vlax/ActiveX).
- [x] P2.1.3 Add the corresponding `.scr` sequence generation to `agent/cadgpt_agent/strategies/autocad.py`: regex-bound object handles, agent-derived paths only, opens the job's DWG (via `native_path` when path-bound, per P1.3.4), applies the boolean, saves in place (spec autocad-execution-adapter "Boolean op modifies existing DWG").
- [x] P2.1.4 Confirm P2.1.1 tests pass GREEN; add the pre-spike-resolution guard test (spec "Boolean op refused before Spike A resolves" — asserts rejection when the op is absent from `AUTOCAD_OPS`).

Acceptance: `boolean_union` against an existing DWG opens, applies, and saves via the exact
golden `.scr` form; a malformed handle is rejected before any subprocess spawns.
~290 changed lines (spike-permitting; 0 if P2.0 refutes booleans).

## P2 Phase 2: Transform AutoLISP + `.scr` (PR P2-3, depends on: P2.0 proving transform family)

- [x] P2.2.1 (RED) Add golden `.scr`-equality tests for `translate`/`rotate`/`scale`, plus a malformed-numeric rejection test (`repr(float)` bound), before the functions exist.
- [x] P2.2.2 Add `cadgpt-translate`/`-rotate`/`-scale` functions to `agent/cadgpt_agent/autocad/cadgpt.lsp`.
- [x] P2.2.3 Add the corresponding `.scr` sequence generation to `agent/cadgpt_agent/strategies/autocad.py`, mirroring P2.1.3's open/apply/save-in-place shape (spec "Transform op modifies existing DWG").
- [x] P2.2.4 Confirm P2.2.1 tests pass GREEN; add the pre-spike-resolution guard test (spec "Transform op refused before Spike A resolves").

Acceptance: `translate`/`rotate`/`scale` against an existing DWG produce the exact golden `.scr`
form and save in place; an out-of-range numeric value is rejected before spawn.
~290 changed lines (spike-permitting; 0 if P2.0 refutes transforms).

## P2 Phase 3: `read_scene` / `export` (PR P2-4, depends on: P2.0 proving read_scene/export)

- [ ] P2.3.1 (RED, conditional on P2.0 proving `read_scene`) Add a test asserting `read_scene` returns enumerated entities without any vlax/ActiveX call.
- [ ] P2.3.2 (conditional) Add `cadgpt-read-scene` to `agent/cadgpt_agent/autocad/cadgpt.lsp` using core AutoLISP object enumeration only (spec "Scene read returns entity list").
- [ ] P2.3.3 (RED, conditional on P2.0 proving a non-hanging export mechanism) Add a golden test asserting `export` never invokes `_-EXPORT` or `3DPRINT` (spec "Export produces artifact via proven mechanism").
- [ ] P2.3.4 (conditional) Extend `agent/cadgpt_agent/strategies/autocad.py` export handling to the proven mechanism for each additional format beyond STL.
- [ ] P2.3.5 For any family P2.0 refutes: add the "refused before Spike A resolves" guard test only (spec "Scene read refused..." / "Export refused...") and leave the op out of `AUTOCAD_OPS`; do not implement.

Acceptance: `read_scene`/`export` ship only for spike-proven mechanisms; a refuted family stays
absent from `AUTOCAD_OPS` and its refusal is test-covered. ~300 changed lines if both families
prove live; 0–100 if refuted (guard tests only).

## P2 Phase 4: `AUTOCAD_OPS`/Discovery Update + Parity Test (PR P2-5, depends on: P2.1–P2.3)

- [ ] P2.4.1 Update `AUTOCAD_OPS` in `agent/cadgpt_agent/discovery.py` to list exactly the ops proven and implemented in P2.1–P2.3 (spec cad-discovery "Reported ops match allowlist subset").
- [ ] P2.4.2 Update the enqueue gate in `apps/api/src/tools.ts`/`store.ts` so AutoCAD's advertised `capabilities.ops` includes the newly proven ops (additive, per-CAD gating already in place from phase 2).
- [ ] P2.4.3 (RED then GREEN) Add/extend `agent/tests/test_ops_allowlist.py`: assert `AUTOCAD_OPS` is a subset of `ops-allowlist.json`'s canonical op names (spec "Reported ops match allowlist subset"); assert any unproven family's names are absent (spec "Unproven op excluded from AUTOCAD_OPS").

Acceptance: every op in `AUTOCAD_OPS` is present in `ops-allowlist.json`; no unproven op family
appears anywhere in discovery output. ~100 changed lines.

---

## P3 Phase 1: Design Tokens + Shell Restyle (PR P3-1, executed via Gemini + Stitch MCP)

- [ ] P3.1.1 Note: this task and every P3 task below is executed in the Gemini client with the
  Stitch MCP connected (`redesign-reference.md`, read-only); Claude Code documents intent only.
- [ ] P3.1.2 Extract color/type/spacing tokens from the Stitch project
  (`https://stitch.withgoogle.com/projects/17866282666749971536`, external reference) into
  `apps/web/src/styles.css`, keeping the "CAD Agent Designer" brand name and drafting-paper/
  technical direction unless Stitch clearly supersedes it.
- [ ] P3.1.3 Restyle `apps/web/src/app/layout/shell/*` (header, left rail, footer) from the new tokens; MUST stay theme-aware (light/dark) and responsive at ~400px.
- [ ] P3.1.4 Keep every existing shell Vitest spec green (`apps/web/src/app/layout/shell/shell.spec.ts`); update only assertions tied to removed/renamed classes, never behavior.

Acceptance: shell renders per the Stitch reference at both themes and ~400px width; the shell's
existing test suite passes unmodified in behavior. ~350 changed lines.

## P3 Phase 2: Restyle Pages Group A (PR P3-2, depends on: P3.1)

- [ ] P3.2.1 Restyle `apps/web/src/app/pages/home/*`, `pages/about/*`, `pages/devices/*`, `pages/designs/*` from the P3.1 tokens; behavior unchanged.
- [ ] P3.2.2 Keep each page's existing Vitest suite green; theme-aware and responsive at ~400px for all four pages.
- [ ] P3.2.3 Preserve the fixed auth-reactive behavior (Sign in vs. dashboard CTA; no hung "Signing you in…") across the restyle.

Acceptance: home/about/devices/designs match the Stitch visual reference, keep passing tests,
and remain theme-aware/responsive. ~450 changed lines.

## P3 Phase 3: Restyle Pages Group B (PR P3-3, depends on: P3.1)

- [ ] P3.3.1 Restyle `apps/web/src/app/pages/design-detail/*`, `pages/jobs/*`, `pages/connect/*`, `pages/pair/*`, `pages/callback/*`, `pages/keys/*` from the P3.1 tokens; behavior unchanged.
- [ ] P3.3.2 Keep each page's existing Vitest suite green; theme-aware and responsive at ~400px for all six pages.
- [ ] P3.3.3 Preserve the callback-recovers-instead-of-dead-ends behavior fixed earlier.

Acceptance: design-detail/jobs/connect/pair/callback/keys match the Stitch visual reference,
keep passing tests, and remain theme-aware/responsive. ~600 changed lines (near budget — split
into per-page slices if it exceeds 800 in practice).

## P3 Phase 4: Allowlist Management Surface (PR P3-4, depends on: P1.4, P1.5, P3.1)

- [ ] P3.4.1 Restyle the P1.5 allowlist management surface to match the P3.1 tokens/layout.
- [ ] P3.4.2 If P1 has not yet merged when this slice starts, stub or hide the surface behind a feature flag rather than blocking the redesign chain (per `redesign-reference.md`).
- [ ] P3.4.3 Keep the P1.5.4 Vitest suite green; theme-aware and responsive at ~400px.

Acceptance: the allowlist surface is visually consistent with the rest of the redesigned
dashboard and its existing tests stay green (or is safely stubbed if P1 is not yet merged).
~250 changed lines.

## P3 Phase 5: Per-OS Install/Pairing/Keep-Alive Guidance (PR P3-5, depends on: P3.1)

- [ ] P3.5.1 Surface the README §"Keep the agent running" content (`README.md`, read-only source) as copy-paste steps in-app for Linux systemd, macOS launchd, and Windows Task Scheduler — not just a link.
- [ ] P3.5.2 Add the guidance to `apps/web/src/app/pages/connect/*` (or a dedicated install page), each OS's snippet in its own copy-paste block.
- [ ] P3.5.3 Extend `apps/web/src/app/pages/connect/*`'s existing Vitest suite to assert each OS block renders distinct, copy-pasteable content.
- [ ] P3.5.4 Set dashboard example-gallery/copy expectations per `redesign-reference.md`'s design-quality lesson: present CADGPT as mechanical/parametric/architectural, not organic sculpting.

Acceptance: a user can copy-paste a working keep-alive snippet for their OS directly from the
dashboard; the connect page's test suite passes with the new content covered.
~200 changed lines.
