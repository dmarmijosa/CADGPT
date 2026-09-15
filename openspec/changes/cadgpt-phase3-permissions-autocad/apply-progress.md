# Apply Progress — cadgpt-phase3-permissions-autocad

## Pillar 1: File-Permissions Allowlist (Completed)

### Slice P1.0 — Spike B: Lock Delivery Staleness + Revocation Semantics (PR P1-1)
- **Status**: done (tasks P1.0.1-P1.0.3 complete).
- **Completed Tasks**:
  - [x] P1.0.1 Confirm and lock design.md D4: heartbeat-delivered allowlist, staleness ≤ 5s, running jobs complete, containment re-checked at next execution.
  - [x] P1.0.2 Recorded locked decision in `design.md` D4, removed Spike B pending marker.
  - [x] P1.0.3 Gating passed for P1 implementation.

### Slice P1.1 — `allowed_roots` Store + OIDC-Only Routes (PR P1-2)
- **Status**: done (tasks P1.1.1-P1.1.5 complete, commit `94ff6db`).
- **Completed Tasks**:
  - [x] P1.1.1 (RED) Added owner invariant and 401/403 auth tests in `apps/api/test/roots.test.ts`.
  - [x] P1.1.2 Added `allowed_roots` table DDL to `apps/api/src/store.ts`.
  - [x] P1.1.3 Added `addRoot`, `listRoots`, `removeRoot` owner-scoped triad to `apps/api/src/store.ts`.
  - [x] P1.1.4 Added OIDC-only routes `POST /api/devices/:deviceId/roots`, `GET /api/devices/:deviceId/roots`, `DELETE /api/roots/:id` with path-shape validation.
  - [x] P1.1.5 All tests pass GREEN.

### Slice P1.2 — Heartbeat Delivery + Agent Containment Function (PR P1-3)
- **Status**: done (tasks P1.2.1-P1.2.5 complete, commit `7284893`).
- **Completed Tasks**:
  - [x] P1.2.1 Extended `heartbeat()` in `apps/api/src/store.ts` to return `allowedRoots: string[]`.
  - [x] P1.2.2 Cached `allowedRoots` in `agent/cadgpt_agent/main.py` poll loop.
  - [x] P1.2.3 (RED) Added 7 path-escape vector tests in `agent/tests/test_executor.py`.
  - [x] P1.2.4 Implemented `resolve_external_path` in `agent/cadgpt_agent/executor.py`.
  - [x] P1.2.5 All P1.2.3 tests pass GREEN plus positive containment tests.

### Slice P1.3 — FreeCAD Open/Backup/Save-Back by Path (PR P1-4)
- **Status**: done (tasks P1.3.1-P1.3.5 complete, commit `28ec508`).
- **Completed Tasks**:
  - [x] P1.3.1 (RED) Added backup-before-write, timeout restore, and error restore tests in `agent/tests/test_freecad_worker.py`.
  - [x] P1.3.2 Implemented `.bak` sibling creation before write in `agent/cadgpt_agent/freecad_worker.py`.
  - [x] P1.3.3 Implemented save-back in place and backup restoration on error/timeout.
  - [x] P1.3.4 Mirrored open/backup/save-back in `agent/cadgpt_agent/strategies/autocad.py`.
  - [x] P1.3.5 All P1.3.1 tests pass GREEN.

### Slice P1.4 — Open-by-Path MCP Tool + `native_path` Write (PR P1-5)
- **Status**: done (tasks P1.4.1-P1.4.6 complete, commit `5e28ef6`).
- **Completed Tasks**:
  - [x] P1.4.1 (RED) Added schema test asserting no `owner`/`username` in `open_external_design` and out-of-allowlist path rejection.
  - [x] P1.4.2 Registered `open_external_design` in `apps/api/src/tools.ts`.
  - [x] P1.4.3 Added `createDocument(..., nativePath)` with `native_path` persistence.
  - [x] P1.4.4 Extended `/api/agent/results/:id` schema to accept optional `nativePath` and validate against allowlist before saving.
  - [x] P1.4.5 Enforced save-back path pinning and drifted root revocation checks.
  - [x] P1.4.6 All tests in `apps/api/test/tools.test.ts` pass GREEN.

### Slice P1.5 — Dashboard Allowlist Management UI (PR P1-6)
- **Status**: done (tasks P1.5.1-P1.5.4 complete, commit `01af7e2`).
- **Completed Tasks**:
  - [x] P1.5.1 Added `listRoots`, `addRoot`, `removeRoot` to `apps/web/src/app/core/api/api-client.ts`.
  - [x] P1.5.2 Added `selectedDeviceId` signal and `roots` resource to `apps/web/src/app/core/state/workspace.store.ts`.
  - [x] P1.5.3 Added allowlist management UI under `apps/web/src/app/pages/devices/*`.
  - [x] P1.5.4 Added unit tests in `apps/web/src/app/pages/devices/devices.spec.ts` and `workspace.store.spec.ts`; all 65 web tests pass GREEN.
