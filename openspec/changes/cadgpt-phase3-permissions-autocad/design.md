# Design: CADGPT Phase 3 — File-Permissions Allowlist + AutoCAD Op Parity

Inputs: proposal + exploration (`openspec/changes/cadgpt-phase3-permissions-autocad/*`). Code read: `apps/api/src/store.ts` (api_keys triad, `heartbeat`, `complete`, `documents`), `agent/cadgpt_agent/executor.py` (`resolve_document_dir`, `execute`), `strategies/autocad.py` (`_CREATE_OPS`), `discovery.py` (`AUTOCAD_OPS`), `agent/tests/test_ops_allowlist.py`. **DEFERRED** — design only; no source edited this cycle. Two disjoint pillars ship as independent PR chains (P1, P2).

## Technical Approach

Extend every layer additively, reusing the exact shapes phase 2 established. P1: a per-device `allowed_roots` table (mirroring the `api_keys` owner-scoped triad), OIDC-only management routes, delivery piggy-backed on the existing `heartbeat` response, and a NEW agent containment function that sits **beside** `resolve_document_dir` (never relaxes it). The server validates path *shape*; the agent enforces *real containment* at execution time against the latest delivered allowlist. P2: new AutoLISP + `.scr` op families gated behind a live Spike A; nothing ships until proven on the Windows host.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Path authorization model | Folder allowlist (per-device roots) | Arbitrary caller paths; copy-to-sandbox | Allowlist bounds an LLM-driven MCP attack surface to owner-chosen folders; user explicitly wants in-place edit, so a sandbox copy is rejected |
| D2 | Enforcement location | **Agent** canonicalizes + containment-checks at job execution | Server-side path validation as the gate | Server cannot `stat` a remote agent's filesystem; only the agent can `.resolve()` symlinks/junctions locally, so it is the sole authority |
| D3 | Delivery channel | Extend `heartbeat` response with `allowedRoots: string[]` | New dedicated pull route | Reuses the 5s poll transport with zero new auth; accepts a bounded staleness window (D4) |
| D4 | Staleness / revocation (Spike B — Locked 2026-09-15) | Enforcement uses the **latest delivered** allowlist; staleness ≤ one poll interval (5s). A job already running runs to completion; a newly-out-of-allowlist path is rejected at the next execution | Server-forced mid-job kill; strong consistency | Poll transport is inherently eventually-consistent; a 5s window is acceptable and containment is re-checked per job before any file open |
| D5 | Corruption safety | Mandatory backup-before-modify (sibling `<name>.<ts>.bak`) before opening for write; save-back to the SAME path only on success; original untouched on failure/120s timeout | Save-in-place with no backup | The 120s subprocess kill can corrupt a real user file mid-write; a backup is the only safe rollback |
| D6 | Owner invariant | Path must resolve inside the owner's device's allowlist; owner strictly from credential; no body field selects owner or a foreign root | Owner/root in request body | Preserves phase-1/2 owner-cannot-choose-owner invariant across the new route |
| D7 | Store table | `allowed_roots` mirroring `api_keys` (owner-scoped add/list/remove, `UNIQUE(owner,device_id,path)`) | Ad-hoc column on `devices` | Reuses a proven, tested ownership pattern; additive, empty by default |
| D8 | AutoCAD op parity | Incremental AutoLISP/`.scr` per op family, Spike A first | Commit the full op set up front | Core Console feasibility for booleans/transforms/read_scene/export is UNPROVEN (only `_STLOUT` proven; `_-EXPORT`/`3DPRINT` hang; no vlax/ActiveX) |
| D9 | PR topology | Two independent chains | One combined change | Pillars touch nearly disjoint files; independent 400/800-line budgets and rollback |

> **Confirmation Note (D4 / Spike B — 2026-09-15)**:
> Decision D4 is confirmed and locked:
> - Allowlist delivery is piggybacked on the device `heartbeat` poll response (`allowedRoots: string[]`).
> - Allowlist staleness is bounded to ≤ one poll interval (5s).
> - A job already running runs to completion even if its root is revoked mid-job.
> - Containment is strictly re-checked at the next job execution before any file open or write.

## Data Model (P1)

```sql
CREATE TABLE IF NOT EXISTS allowed_roots (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL,
  path TEXT NOT NULL, created INTEGER NOT NULL,
  UNIQUE(owner, device_id, path));
CREATE INDEX IF NOT EXISTS allowed_roots_owner ON allowed_roots(owner, created DESC);
```

Owner-scoped methods mirror `api_keys`: `addRoot(owner, deviceId, path)` (device-ownership checked), `listRoots(owner, deviceId)`, `removeRoot(owner, id)` (foreign id → 404, no existence leak). `heartbeat` gains `allowedRoots: string[]` (roots for the polling device). `/api/agent/results/:id` Zod schema accepts optional `nativePath` (≤1024); `complete()` already writes `documents.native_path` via `COALESCE`.

## Management API (OIDC-only, NOT authAny)

- `POST /api/devices/:deviceId/roots` `{ path }` → device-ownership check, server-side path validation (absolute POSIX/Windows/UNC form; reject `..`, NUL, relative) → `addRoot`.
- `GET  /api/devices/:deviceId/roots` → owner+device scoped list.
- `DELETE /api/roots/:id` → owner-scoped remove.

Server validation is **shape-only**; the note stands that REAL containment is enforced by the agent (server cannot stat a remote path).

## Agent Containment (NEW fn, parallel to `resolve_document_dir`)

```python
def resolve_external_path(requested: str, allowed_roots: list[str]) -> Path:
    target = Path(requested).resolve()                     # defeats symlink/junction
    for root in allowed_roots:
        if target.is_relative_to(Path(root).resolve()):    # both canonicalized
            return target
    raise ValueError("Path outside the authorized allowlist")
```

Windows also normalizes UNC (`\\host\share`) and drive-relative (`C:foo`) forms before the check. `resolve_document_dir` is untouched — the UUID sandbox path is unaffected.

## Open-by-Path Flow (P1)

New MCP tool `open_external_design { deviceId?, cadId?, path, name?, confirmed }` binds a `documents` row with `native_path` set (owner from credential; `path` is the only path field and never selects owner/root). Subsequent modify/boolean/transform tools operate on that `documentId` as today.

```
MCP client ─OIDC─▶ open_external_design(path) ─▶ enqueue(op=open_external) ─▶ jobs
agent poll (device cred) ◀── heartbeat{ job, allowedRoots } ──┐
  ├─ resolve_external_path(path, allowedRoots)  ── reject if outside ──▶ result ok=false
  ├─ copy original ─▶ <name>.<ts>.bak            (BEFORE any write)
  ├─ Popen(worker/.scr, shell=False)  open native file ─▶ mutate ─▶ save-back SAME path
  │     └─ failure / 120s kill ─▶ original intact (backup untouched)
  └─ POST /api/agent/results/:id { ok, result, nativePath } ─▶ documents.native_path
```

Worker change: `freecad_worker.py` / `strategies/autocad.py` open the contained native path (not `design.FCStd`/`design.dwg`) when the job carries one, back it up first, and save back on success.

## AutoCAD Op Parity (P2, Spike-Gated)

**Spike A is the FIRST P2 task**: a live Windows-host experiment proving each op family in Core Console (or discovering the working command/keyword sequence) before any op is committed to `AUTOCAD_OPS`. Candidate mappings (CRLF `.scr`, `_`-prefixed English commands, `FILEDIA 0`, forward-slash `(load ...)`, per `docs/autocad-stl-spike.md`):

| Op family | Candidate command | Fallback if Spike A refutes |
|---|---|---|
| boolean_cut/union/intersect | `_UNION` / `_SUBTRACT` / `_INTERSECT` | none — hold op family |
| translate/rotate/scale | `_MOVE` / `_ROTATE3D`\|`_ROTATE` / `_SCALE` | none — hold op family |
| read_scene | object enumeration via AutoLISP | DXF/text dump parse |
| export | `_STLOUT` (proven) → derive others | STLOUT-based export only |

New `cadgpt-<op>` AutoLISP functions in `autocad/cadgpt.lsp` + per-op `.scr` sequences in `strategies/autocad.py` (core AutoLISP only, no vlax/ActiveX). `AUTOCAD_OPS` in `discovery.py` grows only for proven ops; `enqueueOp` gating in `tools.ts` is already per-CAD (additive). Add `test_ops_allowlist.py`-style assertion tying AutoCAD's committed op set to `ops-allowlist.json` (mirroring the FreeCAD superset test).

## File Changes

| File | Action | Pillar |
|---|---|---|
| `apps/api/src/store.ts` | Modify — `allowed_roots` table + triad, `heartbeat.allowedRoots` | P1 |
| `apps/api/src/main.ts` | Modify — OIDC roots routes, `/results/:id` nativePath | P1 |
| `apps/api/src/tools.ts` | Modify — `open_external_design` tool, owner invariant | P1 |
| `agent/cadgpt_agent/executor.py` | Modify — NEW `resolve_external_path` | P1 |
| `agent/cadgpt_agent/main.py` | Modify — cache `allowedRoots` in poll loop | P1 |
| `agent/cadgpt_agent/freecad_worker.py` | Modify — open/backup/save-back by path | P1 |
| `agent/cadgpt_agent/strategies/autocad.py` | Modify — open-by-path; new op `.scr` | P1+P2 |
| `agent/cadgpt_agent/autocad/cadgpt.lsp` | Modify — boolean/transform/scene/export fns | P2 |
| `agent/cadgpt_agent/discovery.py` | Modify — grow `AUTOCAD_OPS` (spike-gated) | P2 |
| `apps/web/src/app/pages/*`, `core/api`, `core/state` | Modify — allowlist UI (devices/keys triad template) | P1 |
| `ops-allowlist.json`, `agent/tests/test_ops_allowlist.py` | Modify — AutoCAD parity assertion | P2 |
| `apps/api/test/*`, `agent/tests/*` | Create — route/containment/backup tests | P1+P2 |

## Threat Matrix

| Boundary | Cases | Applicability | Design response | Planned RED tests |
|---|---|---|---|---|
| Caller-controlled paths | symlink/junction escape, `..`, NUL, UNC, drive-relative, path outside allowlist | Applicable — user-chosen folders, higher stakes than UUID sandbox | `resolve_external_path` canonicalizes + `is_relative_to` each `.resolve()`d root; server rejects malformed shape | one test per escape vector (symlink, junction, `..`, NUL, UNC, drive-relative, foreign root) |
| Subprocess argv composition | `.scr` numeric/handle injection for new AutoCAD ops | Applicable — new `.scr` sequences | `repr(float)` numbers, regex-bound handles, agent-derived paths only; golden `.scr` equality | golden `.scr` per new op; malformed-value rejection |
| Executable-file classification | discovery basename gate | N/A — unchanged; no new binary classification | — | — |
| Documentation-like paths / Git repo selection / Commit / Push / PR | — | N/A — no VCS/PR automation in this change | — | — |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| api unit (`tsx --test`) | `allowed_roots` add/list/remove ownership, device-ownership check, owner-from-credential on the new route, `heartbeat.allowedRoots`, `nativePath` write | `Store(':memory:')` fixtures |
| agent unit (`unittest`) | `resolve_external_path` per escape vector; backup-created-before-modify; original-intact-on-timeout; `.scr` goldens; AutoCAD ops ⊆ `ops-allowlist.json` | mocked `Popen`; tmpdir + symlink/junction fixtures |
| web unit (Vitest) | allowlist resource + add/remove UI | `TestBed` |
| integration (manual) | **Spike A** live Windows op-family proof; FreeCAD in-place edit end-to-end | checklist in `docs/` |

## Migration / Rollout

Additive and capability-gated per pillar. P1: `allowed_roots` starts empty; revert drops the heartbeat field + `open_external_design` and the agent falls back to UUID-only sandbox. P2: `AUTOCAD_OPS` unchanged until Spike A proves each op; reverting AutoLISP/`.scr` restores the 5-create-op adapter. Each slice independently revertible.

## Open Questions

- [ ] Spike A: which exact Core Console command/keyword sequence works per op family (blocks P2 op commit).
- [ ] Backup naming: timestamped `.bak` vs. fixed sibling; retention/cleanup of backups (recommend timestamped, keep newest N).
- [ ] Concurrency: reuse phase-2 D17 one-active-job-per-document lock for in-place edits (assumed yes).
