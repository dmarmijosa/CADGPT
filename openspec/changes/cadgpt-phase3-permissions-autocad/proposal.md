# Proposal: CADGPT Phase 3 — File-Permissions Allowlist + AutoCAD Op Parity + Dashboard Redesign

Handoff: confirmed pre-proposal from exploration (`openspec/changes/cadgpt-phase3-permissions-autocad/exploration.md`). Product decisions confirmed; none re-opened. **DEFERRED** — planning artifacts only; no source touched this cycle.

## Intent

Today the agent can only touch documents it created in its UUID sandbox: `resolve_document_dir` resolves `root/documents/<uuid>` and rejects every external path; workers always open the managed `design.FCStd`/`design.dwg`. Users want the agent to edit existing drawings **in place**, and want AutoCAD to design/redesign/modify like FreeCAD (which covers all 13 ops; AutoCAD exposes 5 create ops). Owner-cannot-choose-owner (owner derived from credential) stays invariant throughout.

## Scope

### In Scope (two separable pillars)
- **P1 File-permissions allowlist**: per-device `allowed_roots` store table + OIDC-only management API + dashboard UI; delivery to the agent via the heartbeat response; NEW agent containment function for allowlisted folders (parallel to `resolve_document_dir`, never a relaxation); `documents.native_path` put to real use for path-bound docs; new MCP tool(s) to open an existing design by path; backup-before-modify + save-back.
- **P2 AutoCAD op parity**: new AutoLISP functions + `.scr` sequences for boolean_cut/union/intersect, translate/rotate/scale, read_scene, export; `AUTOCAD_OPS`/capability updates; a test tying AutoCAD's op set to `ops-allowlist.json`.
- **P3 Web dashboard redesign**: restyle the Angular dashboard (`apps/web`) taking the Stitch project `https://stitch.withgoogle.com/projects/17866282666749971536` as the visual reference; must incorporate the P1 allowlist management surface and the per-OS agent install/pairing/keep-alive guidance (README §"Keep the agent running") as first-class UI. See `redesign-reference.md`. Execution note: the redesign is being carried out in a client that has the Stitch MCP (Gemini); Claude Code's session does NOT have the Stitch MCP, so this pillar documents intent + reference only.

### Out of Scope / Gating Spikes (do NOT resolve now)
- **Spike A (gating P2)**: AutoCAD Core Console feasibility for booleans/transforms/read_scene/export is UNPROVEN (only `_STLOUT` proven; `_-EXPORT`/`3DPRINT` hang; no vlax/ActiveX). A live Windows-host spike MUST precede committing the op set.
- **Spike B (gating P1)**: allowlist poll-delivery staleness window and revocation-mid-job semantics are undefined and MUST be specified.
- Arbitrary paths; copy-to-managed-sandbox (both explicitly rejected).

## Capabilities

### New Capabilities
- `file-permissions-allowlist`: per-device allowed-roots storage, OIDC management API/UI, heartbeat delivery, agent containment + backup/save-back, open-by-path MCP tool.

### Modified Capabilities
- `autocad-execution-adapter`: op set expands to FreeCAD parity via new AutoLISP/`.scr` (spike-gated).
- `cad-discovery`: `AUTOCAD_OPS` reports the new ops.
- `document-registry`: `native_path` becomes live for path-bound documents; `/api/agent/results/:id` accepts `nativePath`.
- `freecad-execution`: worker opens/saves-back an existing file by contained path.
- `mcp-cad-operations`: new open-by-path tool; owner still from credential.
- `job-lifecycle`: heartbeat response carries allowlist alongside `{ job }`.
- `web-dashboard` (P3): visual restyle referencing the Stitch project; surfaces the P1 allowlist UI and per-OS agent install/pairing/keep-alive guidance. UI-only; no API/agent contract change.

## Approach

- **P1**: reuse the existing dashboard triad (`resource()` + `ApiClient` + Nest route, per `pages/devices/*`). Server-authoritative allowlist stored per device, owner from credential; delivered by extending `heartbeat()` (Approach 1 — matches dashboard-managed intent). A NEW agent containment function canonicalizes the caller path, rejects symlink/junction/UNC escapes via `.resolve()`, and confirms containment inside an allowlisted root before any open. Backup-before-modify writes a sidecar copy before the 120s-timeout-bound subprocess runs; save-back only on success.
- **P2**: incremental AutoLISP spikes per op family (mirrors phase-2 STLOUT precedent). No new op ships until Spike A proves it live.
- Pillars touch nearly disjoint files → independent PR chains under the 800-line budget.

## Affected Areas

| Area | Impact | Pillar |
|------|--------|--------|
| `apps/api/src/store.ts` | Modified | allowed_roots table, `native_path` write, heartbeat shape |
| `apps/api/src/tools.ts` | Modified | open-by-path tool, owner invariant |
| `apps/api/src/main.ts` | Modified | OIDC allowlist routes, `/results/:id` nativePath |
| `agent/cadgpt_agent/executor.py` | New fn | allowlist containment (parallel to `resolve_document_dir`) |
| `agent/cadgpt_agent/freecad_worker.py`, `strategies/autocad.py` | Modified | open/backup/save-back by path |
| `agent/cadgpt_agent/discovery.py`, `autocad/cadgpt.lsp` | Modified/New | P2 op parity |
| `agent/cadgpt_agent/main.py` | Modified | allowlist delivery to poll loop |
| `apps/web/src/app/pages/*`, `core/api`, `core/state` | Modified | allowlist management UI |
| `openspec/specs/*`, `ops-allowlist.json`, `agent/tests/test_ops_allowlist.py` | Modified/New | specs + parity test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Symlink/junction/UNC escape on user-chosen folder (higher stakes than UUID sandbox) | High | Canonicalize + `.resolve()` containment check in new fn; deny on any escape; unit tests for each escape vector |
| In-place save corrupts a real file under 120s timeout | High | Mandatory backup-before-modify; save-back only on success; restore on failure |
| Owner-cannot-choose-owner regressed by new allowlist route | Med | Owner strictly from credential; route-level test |
| Allowlist staleness / revocation-mid-job undefined | High | Spike B specifies delivery + revocation semantics before P1 apply |
| AutoCAD Core Console op feasibility unproven | High | Spike A gates P2 op set; ship only proven ops |
| No parity test ties AutoCAD ops to `ops-allowlist.json` | Med | Add `test_ops_allowlist.py` assertion as part of P2 |

## Rollback Plan

Feature is additive and capability-gated per pillar. **P1**: allowlist starts empty; new `allowed_roots` table is additive (revert drops no sandbox data); disable by removing the heartbeat field and open-by-path tool, agent falls back to UUID-only sandbox behavior. **P2**: `AUTOCAD_OPS` unchanged until spike-proven; reverting the AutoLISP/`.scr` restores the 5-create-op AutoCAD adapter. Each PR slice is independently revertible.

## Dependencies

- Windows host with full AutoCAD for Spike A + parity tests.
- Spike B resolved before P1 apply (delivery/revocation semantics).
- Existing Keycloak OIDC + device-credential dual-auth (unchanged).

## Suggested PR Slicing (chained, per pillar)

**P1**: (1) allowed_roots table + OIDC routes + owner test → (2) heartbeat delivery + agent containment fn + tests → (3) FreeCAD open/backup/save-back by path → (4) open-by-path MCP tool + `native_path` write → (5) dashboard allowlist UI.
**P2**: (A) Spike A (gating) → (B) boolean AutoLISP + `.scr` → (C) transform AutoLISP → (D) read_scene/export (spike-permitting) → (E) `AUTOCAD_OPS`/discovery + parity test.
**P3** (UI-only, independent chain; executed via the Stitch-MCP client): (i) design tokens + shell restyle from the Stitch reference → (ii) restyle existing pages (home, devices, designs, jobs, connect, keys, callback) → (iii) allowlist management surface (depends on P1 API) → (iv) per-OS install/pairing/keep-alive guidance surfaced in-app.

## Success Criteria

- [ ] Spike A recorded before any AutoCAD op is committed; Spike B specifies delivery + revocation before P1 apply.
- [ ] Agent opens/modifies an existing file only inside an allowlisted, canonicalized, non-escaping folder; symlink/junction/UNC attempts denied.
- [ ] A backup exists before any in-place modify; original restored on failure.
- [ ] Owner derived from credential on every new allowlist route; no body-field owner.
- [ ] AutoCAD's committed op set matches `ops-allowlist.json` via `test_ops_allowlist.py`.
- [ ] Each PR slice stays within the 800-line budget; P1, P2, and P3 ship as independent chains.
- [ ] P3 restyle matches the Stitch reference, keeps every page's behavior/tests green, stays theme-aware and responsive, and surfaces the P1 allowlist UI + per-OS agent guidance.
