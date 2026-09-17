# Exploration — cadgpt-phase3-permissions-autocad

Two pillars: (1) a user-authorized per-device **folder allowlist** that lets the CAD
agent open and modify existing files in place; (2) **AutoCAD op parity** with FreeCAD
(booleans, transforms, read_scene, export). This change is **deferred** — these SDD
artifacts document it for a later implementation; nothing is built this week.

## Current state (verified in code)

- **Containment invariant holds.** `apps/api/src/tools.ts:35` `documentIdFrag = z.uuid().optional()`;
  booleans/transforms/read_scene/export require `documentId: z.uuid()` (lines ~121, 161, 194, 201).
  `nameFrag` comment (41-42): "Display name only — never a path, never reaches the CAD worker" — accurate.
- **Agent rejects external paths.** `agent/cadgpt_agent/executor.py` `resolve_document_dir(root, document_id)`
  rejects non-round-trip UUIDs, resolves `root/documents/<uuid>`, and rejects any resolved path escaping
  `root_resolved` (defeats symlink escapes via `.resolve()`). `validate()` requires `confirmed=True`.
  `execute()` never accepts an external path — only the UUID `documentId` and the agent's fixed
  `root` (`user_data_dir("CADGPT")`, set once in `main.py`).
- **Workers only open the managed file.** `freecad_worker.py` always opens `doc_dir/design.FCStd`;
  `strategies/autocad.py` always resolves `design_dir/design.dwg` (falling back to bundled
  `autocad/blank.dwg`). Neither takes a caller-supplied path.
- **`native_path` is dead plumbing.** `apps/api/src/store.ts` `documents` table already has `native_path TEXT`;
  `complete()` accepts an optional `nativePath` write, but `/api/agent/results/:id` Zod schema accepts only
  `{ok, result}`, so `native_path` is always NULL today. A natural home for the external file path.
- **No push channel to the agent.** `store.heartbeat` returns only `{ job }`; the agent poll loop reads only
  `state["job"]` every 5s. Any server-authoritative allowlist needs a new field in this response (or a new
  route) and carries an inherent staleness window.
- **Owner invariant.** Every route derives `owner` strictly from the credential (OIDC sub / API key / device
  credential), never a body field. Must extend to any new allowlist table/route.
- **AutoCAD parity gap.** `discovery.py` `AUTOCAD_OPS` = 5 create ops only; `strategies/autocad.py`
  `_CREATE_OPS` gates `supports()`; `autocad/cadgpt.lsp` defines only create-box/cylinder/sphere/cone +
  extrude-rect. Zero boolean/transform/scene-read/export AutoLISP exists. FreeCAD's `freecad_worker.py`
  OPS dict already covers all 13 ops in the shared `ops-allowlist.json`.
- **Op gating is already per-CAD.** `tools.ts` `enqueueOp` gates via `cad.capabilities?.ops ?? FREECAD_OPS`,
  so AutoCAD parity is additive there once `discovery.py`/`strategies/autocad.py` report the new ops.
- **Core Console constraints** (`docs/autocad-stl-spike.md`): CRLF `.scr`, `_`-prefixed English commands,
  `FILEDIA 0`, forward-slash `(load ...)` path, `_STLOUT` proven live for STL; `_-EXPORT`/`3DPRINT` hang.
  No vlax/ActiveX. **No live spike exists for booleans, transforms, or object enumeration in Core Console** —
  unproven, not just unimplemented.
- **Web templates.** `apps/web/src/app/pages/devices/*` and `pages/keys/*` follow a `WorkspaceStore`
  `resource()` + `ApiClient` method + Nest route triad with inline (non-`window.confirm`) revoke — a strong
  template for an allowlist management surface.

## Affected areas

- API: `apps/api/src/tools.ts`, `store.ts`, `main.ts` (path-bearing invariants, allowlist storage,
  `heartbeat()` shape, REST routes, `/api/agent/results/:id` accepting `nativePath`).
- Agent: `executor.py` (a NEW parallel containment function for allowlisted folders — not a relaxation of
  `resolve_document_dir`), `freecad_worker.py` + `strategies/autocad.py` (open/save-back/backup by path),
  `discovery.py` + `autocad/cadgpt.lsp` (AutoCAD op parity), `main.py` (allowlist delivery to the poll loop).
- Web: `pages/devices/*`, `pages/keys/*` (template), `core/api/api-client.ts`, `core/state/workspace.store.ts`.
- Specs/fixtures: `openspec/specs/document-registry`, `autocad-execution-adapter`, `cad-discovery`,
  `freecad-execution`, `ops-allowlist.json`, `agent/tests/test_ops_allowlist.py`.

## Approaches considered

1. **Server-mediated allowlist via poll response** — reuses existing transport, dashboard-managed, works for
   reconnecting agents. Cons: staleness window, heartbeat schema grows, new containment logic still required.
   Effort: Medium. **(Matches the user's dashboard-managed intent — preferred.)**
2. **Agent-local allowlist (no server)** — no new server schema/auth. Cons: contradicts dashboard-managed
   intent, no audit trail. Effort: Low-Medium.
3. **AutoCAD parity via incremental AutoLISP spikes per op family** — mirrors the phase-2 STLOUT spike
   precedent. Effort: Medium (booleans/transforms) + High/unknown (scene-read/export).

## Risks / unknowns (load-bearing)

- Symlink/junction/UNC escape on Windows unverified for a user-chosen-folder allowlist (higher stakes than
  the existing UUID sandbox).
- In-place save + backup semantics are new for both CAD strategies; the 120s subprocess timeout risks
  corrupting a real file without a prior backup.
- Owner-cannot-choose-owner invariant must extend to any new allowlist table/route.
- Allowlist delivery to an offline/reconnecting agent has an inherent staleness window; revocation-mid-job
  semantics undefined.
- AutoCAD `read_scene`/`export_design`/booleans/transforms feasibility in Core Console is **unproven** — a
  live spike on the Windows host is required before committing the AutoCAD op set (mirrors the phase-2 STLOUT
  spike that refuted a documented assumption).
- No test ties AutoCAD's op set to the shared `ops-allowlist.json` fixture today.

## Recommendation

The two pillars touch almost disjoint files and should ship as **separate change slices**. Both biggest
unknowns (allowlist delivery mechanism; AutoCAD Core Console feasibility) are best resolved by a scoped live
spike **as the first implementation task**, not now — since this change is deferred, the spikes are captured
as gating tasks in `tasks.md` rather than run this week.
