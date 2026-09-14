# Archive Report — CADGPT Phase 2 — CAD Assistant

**Date**: 2026-09-14 | **Change**: cadgpt-phase2-cad-assistant | **Status**: ARCHIVED AND CLOSED | **Mode**: hybrid (openspec + Engram)

## Executive Summary

CADGPT Phase 2 (CAD Assistant) shipped 20 merged slices across all 11 capabilities (document registry, MCP tools, mesh preview, viewer, dashboard, expert guidance, AutoCAD adapter, job lifecycle enhancements, FreeCAD multi-op worker, discovery improvements, MCP client onboarding). All 11 capabilities PASS verification (0 CRITICAL). Tests green: api 55, web 42, agent 80. Deployed to production (cadengine.danny-armijos.com) at main @ 7e9db32. Archive contains proposal, spec deltas, design, tasks (114/115 complete with 4 documented deferrals), apply-progress, verify-report, and 11 canonical spec files.

## What Shipped

### By Area

| Area | Slices | Capability | Notes |
|------|--------|-----------|-------|
| **Data Model** | 1, 2c | document-registry, job-lifecycle | `documents` table (id/owner/device_id/cad_kind/name/native_path/created/updated/latest_job_id), schema validation, environment config |
| **Agent Worker** | 2a, 2b | freecad-execution | CadStrategy protocol, FreeCadStrategy, 11-op dispatch (create/boolean/transform/read_scene/export), MeshPart STL export, OPS allowlist validation |
| **MCP API Tools** | 3a, 3b, 4a, 4b | mcp-cad-operations, expert-design-guidance | 15 strict Zod tools (list_devices, list_documents, get_job, 5 create ops, 3 boolean ops, extrude, 3 transform ops, read_scene, export), device/CAD selection, MCP instructions/prompts/guidance resources |
| **Mesh Upload/Serve** | 5, 6 | mesh-preview-upload | Device-auth upload (25 MiB cap), per-device quota, owner-scoped download, agent upload step after FreeCAD export |
| **Web Dashboard** | 7, 8, 9, 10, 11 | dashboard-routing, mesh-viewer, mcp-client-onboarding | Routes (auth guard, lazy pages), STL viewer (three.js, SSR-safe), workspace store, devices/designs/jobs pages, post-pairing connect step |
| **AutoCAD Adapter** | 12, 13a, 13b, 14 | cad-discovery, autocad-execution-adapter | Discovery (accoreconsole.exe detection, full-vs-LT, capabilities object), Core Console strategy (fixed 6-token argv, `shell=False`), `.lsp` allowlist, DWG artifact, STL preview via STLOUT (spike-proven), LT-only create ops (modify/read deferred) |
| **Docs/Connect** | 15 | mcp-client-onboarding | Connect page (Claude/ChatGPT distinct steps), README updates, SECURITY.md notes |

### Verification Summary

- **Status**: PASS
- **Capabilities**: 11/11 pass (document-registry, mcp-cad-operations, mesh-preview-upload, mesh-viewer, dashboard-routing, mcp-client-onboarding, expert-design-guidance, autocad-execution-adapter, job-lifecycle, freecad-execution, cad-discovery)
- **Tests**: api 55/55 pass, web 42/42 pass, agent 80/80 pass
- **Critical Issues**: 0
- **Repo State**: All 20 slices merged to main @ 7e9db32, deployed healthy to cadengine.danny-armijos.com

### Verification Report Details

Per `openspec/changes/archive/2026-09-14-cadgpt-phase2-cad-assistant/verify-report.md` (obs 150):
- All 11 capabilities PASS with full security invariant coverage
- 114/115 itemized tasks complete (4 documented deferrals: 4b.7, 13b.6, 14.4, 2c.5)
- No CRITICAL issues
- Spec scenarios fully covered by test suites

## Research Findings (Refuted)

Two empirical research findings documented during this change refute prior claims:

1. **Research A4 (REFUTED)**: "STLOUT excluded from AutoCAD Core Console"
   - **Refutation Date**: 2026-09-14, live spike on AutoCAD 2026 host
   - **Finding**: `STLOUT` successfully exports valid binary STL (684 bytes = 84 + 50×12 facets) headless via accoreconsole
   - **Impact**: AutoCAD STL preview (slice 14) ships with STLOUT, not EXPORT/3DPRINT (which hang headless)
   - **Design Correction**: D13 updated; autocad-execution-adapter spec requires STLOUT only; no EXPORT/3DPRINT anywhere in codebase

2. **Research B1 (REFUTED)**: "FreeCAD headless GLB export viable"
   - **Refutation Date**: During design phase (obs 128)
   - **Finding**: FreeCAD headless GLB generation fails (no WebGL renderer); STL + MeshPart proven functional
   - **Impact**: Mesh export uses STL only (via MeshPart.meshFromShape), not GLB
   - **Design Correction**: D8 confirmed; all mesh export paths use STL

## Accepted Deferrals (Follow-ups, Not Gaps)

All documented in tasks.md, apply-progress.md, and state.yaml. None block the change; all have recorded reasons:

| Task | Deferral Reason | Follow-up Action |
|------|-----------------|------------------|
| **4b.7** — optional `label` parameter on `create_*` tools | Scope creep; actionable guidance already in place (MCP resources); optional feature | Phase 3 enhancement |
| **13b.6** — AutoCAD modify/read ops (boolean, transform, read_scene, export) | Requires non-vlax scene readback; AutoCAD `read_scene` cannot robustly report volume/bbox via Core Console without ActiveX | Phase 3 spike + implement |
| **14.4** — N/A (conditional fail branch) | Spike passed; no fail-case logic needed | None (recordkeeping only) |
| **2c.5 (partial)** — `.env.example` optional-var comments (`OIDC_JWKS_URL`, `DATA_DIR`, `NODE_ENV`) | Blocked by sandbox dotenv-write protection; required vars already present | Manual post-deployment update outside sandbox |

## Size/Exception History

Design and apply phases recorded multiple `size:exception` approvals (user-accepted budget overruns). All are structural, not discretionary cuts:

| Slice | Estimated | Actual | Delta | Reason | Approval |
|-------|-----------|--------|-------|--------|----------|
| 2b | 340 | 478 | +138 | 11 real ops × validation + per-op test coverage + shared validators | user-accepted |
| 3a | 260 | 580 | +320 | 7 MCP registrations × full Zod schema + RED tests + gate functions + 6 tests | user-accepted |
| 4b | 600 | 711 | +111 | Batch B2 tools (transform/read/export) + shared allowlist fixture + edge-case tests | flagged, user-accepted |
| 7 | 600 | 729 | +129 | Full color/type/radius/spacing token system + brand-new pages + shell redesign | user-accepted |
| 9 | 600 | 729 | +129 | Design system implementation; no comment/blank/doc cuts (structural necessity) | user-accepted |

Verified at apply time via `git diff --numstat` in apply-progress.md. No code quality issues; structural necessity, not corner-cut.

## Artifact Locations

### In Archive Folder
- `proposal.md` — Phase 2 intent, scope, capabilities, approach, risks, rollback
- `design.md` — Technical approach, architecture decisions (D1–D17), data model, MCP tool catalog, agent strategy, security rules
- `tasks.md` — 115 itemized tasks (114 complete), dependency graph, suggested work units, per-slice acceptance criteria
- `apply-progress.md` — Slice-by-slice implementation progress, workload forecasts, budget decisions, delivery strategy notes
- `verify-report.md` — Capability compliance matrix, test evidence, security invariants, final PASS verdict
- `specs/` (11 subdirs) — Delta specs (all NEW): document-registry, mcp-cad-operations, mesh-preview-upload, mesh-viewer, dashboard-routing, mcp-client-onboarding, expert-design-guidance, autocad-execution-adapter, job-lifecycle, freecad-execution, cad-discovery

### In Canonical Specs (openspec/specs/)
- 11 new capability specs synced from delta specs, byte-identical copy verified

### Engram Archive Observation (referenced)
- `sdd/cadgpt-phase2-cad-assistant/verify-report` (obs 150) — Final verification state, all requirement/scenario mappings, test counts, security evidence

## Conditions and Caveats

- **No CRITICAL issues** block this archive; all flagged items are documented deferrals or follow-ups
- **AutoCAD support is opt-in** (`--enable-autocad` flag); users accept Autodesk Core Console EULA responsibility (noted in SECURITY.md, README.md)
- **STL preview for AutoCAD LT unavailable** (STLOUT not in Core Console on LT editions); create-only capability on LT
- **AutoCAD modify/read ops deferred** (live test revealed non-vlax scene readback gap); documented for phase 3
- **Mesh preview security exception documented** (README.md "mesh preview leaves the machine" note)
- **`.env.example` partial** (3 optional-var comment lines blocked by sandbox write protection; content documented in docs/deployment.md)

## Rollback Considerations

Per the proposal rollback plan:
- Schema changes additive (new table, nullable columns); phase 1 jobs remain readable
- `document_id` nullable; jobs without it still process (backward-compatible)
- FreeCAD strategy behavior-preserving compared to phase 1
- AutoCAD behind opt-in flag; no forced execution
- DWG artifacts on AutoCAD; DWG download is optional (no mandated integration)
- STL upload separate step; failure tolerant (job still succeeds)
- Dashboard routes optional; phase 1 REST API unchanged
- Mesh upload/download separate from job completion

Rollback to phase 1: revert `executor.py`/`strategies/`, drop new tables (migrate no-op on rerun), remove tool registrations, disable routes.

## Metadata

- **Change ID**: cadgpt-phase2-cad-assistant
- **Proposal Observation**: obs 129
- **Spec Observation**: obs 131 (merged from 11 delta specs; delta specs now at rest in archive)
- **Design Observation**: obs 133
- **Tasks Observation**: Created at spec phase, updated at apply phase; final state in archive folder
- **Verify Report Observation**: obs 150
- **Archive Report Observation**: (this document, persisted to Engram topic_key `sdd/cadgpt-phase2-cad-assistant/archive-report`)
- **Artifact Store Mode**: hybrid (openspec files + Engram)
- **Git Status at Archive**: main @ 7e9db32 (all 20 slices merged, CI green, deployed)
- **Archive Completion Date**: 2026-09-14
- **Canonical Specs Synced**: ✓ 11/11 (byte-identical verification passed)
- **Change Folder Moved**: ✓ openspec/changes/cadgpt-phase2-cad-assistant → openspec/changes/archive/2026-09-14-cadgpt-phase2-cad-assistant/

## Final Status

**The CADGPT Phase 2 SDD change cycle is COMPLETE and CLOSED.**

The change is archived, canonical specs are synced, and all artifacts are preserved. Recommendations from verify-report remain open (4b.7 and 13b.6 as phase-3 follow-ups; 2c.5 as manual post-deployment). No blockers remain.
