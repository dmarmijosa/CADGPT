# Proposal: CADGPT Phase 2 — CAD Assistant (dual connector, expert MCP, viewer, dashboard)

Handoff: preproposal rev 2 (obs 127), explore (obs 125), research (obs 128), product decisions (obs 126). All decisions below are confirmed; none are re-opened here.

## Intent

Phase 1 proves one operation (`create_box` → STEP) on FreeCAD. Users cannot modify a design, see a result, or use AutoCAD. Phase 2 turns CADGPT into a usable assistant: create and modify designs through allowlisted MCP tools, preview results in the browser, run on AutoCAD where technically proven, and guide users from pairing to a connected Claude/ChatGPT client.

## Scope

### In Scope
- Many small allowlisted MCP tools (one per operation, strict Zod schema); identity from OIDC `sub`; tool selects/asks for target device + CAD.
- Minimal `documents` registry (stable design identity); jobs carry `type` + `document_id`; reopen → mutate → save → re-export.
- Multi-operation FreeCAD worker; binary STL export via `MeshPart.meshFromShape`.
- Agent uploads STL to API with device credential; stored under `DATA_DIR/meshes`, size-capped; served to owner.
- three.js viewer (`STLLoader` from `three/addons/loaders`) with zoneless/SSR guard.
- Dashboard redesign with routing from scratch (`frontend-design` skill), informational pages, post-pairing "connect your MCP client" step.
- Expert design guidance as MCP server instructions/prompt resources (mm units, tolerances, naming, parametric intent).
- AutoCAD adapter: `accoreconsole.exe /i <dwg> /s <script.scr>` loading allowlisted `.lsp`; discovery finds `accoreconsole.exe` and distinguishes full vs LT; DWG downloadable artifact.
- README/docs: preserve security posture; document the "mesh preview leaves the machine" exception.

### Out of Scope
- Operation DSL / batch programs; any free-form Python, AutoLISP, or shell from the model.
- Signed object storage; GLB export from FreeCAD (proven non-viable headless).
- AutoCAD 3D preview unless the Windows EXPORT/3DPRINT spike passes (conditional slice).
- Google sign-in (Keycloak IdP config, documentation mention only); macOS installer; job-dir GC policy.

## Capabilities

### New Capabilities
- `document-registry`: documents table, ownership, listing, job linkage.
- `mcp-cad-operations`: allowlisted create/modify/read tools, device+CAD selection, schema validation.
- `mesh-preview-upload`: device-authenticated STL upload, storage limits, owner-scoped retrieval.
- `mesh-viewer`: browser STL rendering on a design route.
- `dashboard-routing`: route structure, auth guard, lazy pages, informational pages.
- `mcp-client-onboarding`: post-pairing guided connect step (Claude/ChatGPT).
- `expert-design-guidance`: MCP instructions/prompt resources content.
- `autocad-execution-adapter`: Core Console strategy, allowlisted scripts, DWG artifact, edition-aware capability flags.

### Modified Capabilities
- `job-lifecycle`: jobs gain `type` and `document_id`; compatibility check becomes per-CAD capability, not FreeCAD-hardcoded.
- `freecad-execution`: single-op worker becomes per-operation dispatch with STL export step.
- `cad-discovery`: `executable` becomes a real per-CAD capability; add `accoreconsole.exe` and full-vs-LT signal.

## Approach

- Agent `executor.py` → Strategy dispatch (FreeCAD, AutoCAD); each strategy keeps exclusive-mkdir replay protection, sanitized env, `shell=False`, fixed scripts.
- API keeps the existing dual-auth split: OIDC for MCP/dashboard, device credential for `/api/agent/*` (upload reuses it). Binary route gets its own size cap, separate from the 32 kb JSON limit.
- Schema changes are additive (new table, nullable columns) so phase 1 jobs remain readable.
- Web: routing skeleton lands before the viewer so the viewer ships on `/designs/:id` once, not in `app.html` then moved.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/store.ts` | Modified | `documents` table, job `type`/`document_id`, per-op Zod schemas |
| `apps/api/src/main.ts` | Modified | tool registrations, instructions/prompt resources, mesh upload/serve routes, CSP check |
| `agent/cadgpt_agent/executor.py` | Modified | strategy dispatch, upload step |
| `agent/cadgpt_agent/freecad_worker.py` | Modified | op branching, MeshPart STL export |
| `agent/cadgpt_agent/autocad/*.scr,*.lsp` | New | allowlisted AutoCAD scripts |
| `agent/cadgpt_agent/discovery.py` | Modified | accoreconsole detection, edition flag |
| `agent/cadgpt_agent/main.py` | Modified | open onboarding page after pairing |
| `agent/tests/` | Modified | coverage per strategy (mock Popen pattern) |
| `apps/web/src/app/**` | Rewritten | routes, pages, viewer, design system; add `three` + `@types/three` |
| `packaging/*`, `agent/launcher.py` | Modified | onboarding step wiring |
| `README.md`, `docs/`, `SECURITY.md` | Modified | compatibility table, exception, MCP connect guide |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| AutoCAD headless STL unproven | High | Adapter ships DWG-only; preview is a separate conditional slice gated by spike result |
| Autodesk EULA on unattended Core Console | Med | Flag in docs; design records decision; no blocker |
| Tool surface erodes "no arbitrary code" claim | Med | One schema per tool, no string-to-code params; agent re-validates against allowlist |
| Binary upload abuse/storage growth | Med | Device auth, per-file cap, per-device quota, job-bound file names |
| three.js under zoneless/SSR | Med | `afterNextRender` guard, browser-only dynamic import; spike in design |
| Dashboard rewrite exceeds review budget | High | Chained PR slices below; routing skeleton first |
| Registry-based AutoCAD detection wrong | Med | Verify on Windows; fall back to path glob + PROGRAM sysvar probe via script |

## Rollback Plan

Each PR slice is independently revertible. Schema changes are additive; reverting drops no phase 1 data. Mesh files live only under `DATA_DIR/meshes` and can be deleted. AutoCAD adapter defaults to `executable=False` until discovery confirms Core Console; reverting restores detection-only behavior. Web rewrite is replaced wholesale on revert (no shared state with API).

## Dependencies

- FreeCAD 1.x headless (verified 1.1.3): MeshPart STL, open/modify/save.
- three 0.186.x with addons.
- Windows machine with full AutoCAD for adapter tests and the STL spike.
- Existing Keycloak OIDC deployment (unchanged).

## Suggested PR Slicing (chained, ≤400 lines each)

| # | Slice | Area | Depends on |
|---|-------|------|-----------|
| 1 | `documents` table + job `type`/`document_id` + tests | api | — |
| 2 | Executor strategy split + multi-op FreeCAD worker + STL export + tests | agent | — |
| 3 | MCP tools batch A (create primitives, list documents, select device) + expert instructions resource | api | 1 |
| 4 | MCP tools batch B (modify/boolean/transform/read scene) | api | 3, 2 |
| 5 | Mesh upload/serve routes + limits + README exception | api, docs | 1 |
| 6 | Agent upload step after export + tests | agent | 2, 5 |
| 7 | Web routing skeleton + auth guard + lazy pages | web | — |
| 8 | STL viewer component on `/designs/:id` | web | 7, 5 |
| 9–11 | Dashboard redesign: shell/nav + informational pages; devices/designs; jobs history | web | 7 |
| 12 | Discovery: accoreconsole + full/LT + tests | agent | 2 |
| 13 | AutoCAD strategy + `.scr`/`.lsp` + DWG artifact + tests | agent, api | 12, 4 |
| 14 | Conditional: AutoCAD STL preview (post-spike) | agent | 13, 6 |
| 15 | Post-pairing MCP-connect step (web page + agent open) + docs | web, agent, packaging | 9 |

Ordering rationale: FreeCAD end-to-end value (1–6, 8) first because it has verified evidence and unblocks the viewer; routing skeleton (7) is pulled ahead of the viewer to avoid rework; dashboard redesign next; AutoCAD last because its preview is unproven and it depends on the strategy split and tool batches; onboarding step last because it needs the redesigned dashboard page. Docs travel with the slice that changes behavior.

## Success Criteria

- [ ] From a Claude/ChatGPT MCP client, a user creates a design, then modifies it in a later call, and both jobs reference the same document.
- [ ] Dashboard renders the STL preview of the latest job for that document.
- [ ] No MCP tool accepts code, script text, or file paths from the model; agent rejects unknown ops.
- [ ] On full AutoCAD (Windows), a job produces a downloadable DWG; on LT or missing Core Console, discovery reports the CAD as non-executable.
- [ ] After pairing, the user sees the guided "connect your MCP client" step.
- [ ] README compatibility table and security section reflect phase 2, including the mesh-preview exception.
- [ ] Every PR slice stays under 400 changed lines; agent tests assert `shell=False` and fixed argv for both strategies.
