# Design: CADGPT Phase 2 — CAD Assistant

Inputs: proposal (obs 129), research (obs 128), explore (obs 125). Code read: `apps/api/src/{main,store,auth,security}.ts`, `agent/cadgpt_agent/{executor,freecad_worker,discovery,main}.py`, `apps/web/src/app/*`, `apps/api/test/*`, `agent/tests/test_agent.py`.

## Technical Approach

Keep the existing shape of every layer and extend it additively: Express handlers + Zod at the boundary, one `McpServer` per request closing over `owner` (OIDC `sub`), `node:sqlite` store, one agent subprocess per job with `shell=False` and exclusive `mkdir`. New concepts: a `documents` registry (stable design identity), an `op` discriminator on jobs, a `CadStrategy` seam in the agent, a binary mesh channel (device-auth upload, owner-auth download), and a routed Angular app with a lazy three.js viewer. **Paths never cross the wire in either direction**: the agent derives all filesystem locations from validated UUIDs.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Design identity | `documents` table; jobs get `type` + `document_id` | Job-chain via `parentJobId` | Modify/read/viewer need one identity that outlives a job; additive now avoids a breaking change later |
| D2 | Column naming | `owner`, `created`, `updated` (not `owner_sub`, `*_at`) | Proposal literal names | Follow existing `devices`/`jobs` convention; `owner` already holds the OIDC `sub` |
| D3 | Path handling | Agent derives `root/documents/<document_id>/design.<ext>`; `native_path` stored for display only | Server sends path to agent; agent reports path used for later ops | Preserves "no caller-controlled paths"; server DB never becomes a path oracle |
| D4 | Tool granularity | Many small tools, one Zod schema each; `create_*` accept optional `documentId` to add to an existing design | Separate `add_*` tools; composite tools; op DSL | Halves tool count without widening any single schema; matches `create_box` precedent |
| D5 | Object addressing | FreeCAD internal `Name` / AutoCAD handle, regex-bound, returned by `read_scene`; worker resolves via `doc.getObject()` and rejects unknown | Integer indexes | Stable across recomputes; string is a dictionary key, never interpreted as code or path |
| D6 | Device selection | `deviceId`/`cadId` optional; auto-resolve when exactly one online executable CAD matches; otherwise return `selection_required` + candidates | Always require ids | Removes friction for the common one-device case; keeps the choice with the user when ambiguous |
| D7 | Async tool results | Tools return `{jobId, documentId, status:'queued'}`; `get_job` polls | Block MCP request until done | Jobs take up to 120 s over a 5 s poll loop; stateless transport must not hang |
| D8 | Mesh format | Binary STL via `MeshPart.meshFromShape(LinearDeflection=0.1, AngularDeflection=0.26, Relative=False)` | GLB | GLB headless is falsified (research B1); STL proven (S9, 10684 B = 84 + 50×212 facets, i.e. binary) |
| D9 | Mesh transport | Agent `POST /api/agent/jobs/:id/mesh` with device credential; file under `DATA_DIR/meshes/<jobId>.stl`; owner reads `GET /api/designs/:id/mesh` via OIDC | Signed object storage | No new infra; reuses both existing auth schemes unchanged |
| D10 | Agent execution seam | `CadStrategy` protocol; `FreeCadStrategy` (single allowlisted worker, per-op functions) and `AutoCadStrategy` (`.scr` template + allowlisted `.lsp`) | One script per op; subclass-per-CAD in executor | Same trust boundary as phase 1; strategy only builds argv/artifacts, executor keeps replay/timeout/env logic |
| D11 | Capabilities | `cad.capabilities = {execute, edition, ops[], mesh}`; keep boolean `executable` mirrored for phase 1 agents | Replace boolean | Additive; `enqueue` gates on `ops.includes(op)`, falling back to a FreeCAD op list when `capabilities` is absent |
| D12 | AutoCAD opt-in (EULA open item) | Adapter ships behind agent flag `--enable-autocad`; discovery reports `execute=false` without it; README notes user-owned license responsibility | Block slice 13 until legal answer | Unblocks engineering; the user, not the project, accepts unattended Core Console use |
| D13 | AutoCAD mesh (spike open item) | Slice 14 conditional; until it passes, `capabilities.mesh=false` and viewer shows "Preview not available for AutoCAD; download DWG" | Assume `EXPORT`/`3DPRINT` works | Research A4: STLOUT excluded from Core Console; unproven path stays out of the critical chain |
| D14 | Registry detection (open item) | `HKLM\SOFTWARE\Autodesk\AutoCAD\R*\ACAD-*` → `AcadLocation`; require `<AcadLocation>\accoreconsole.exe` to exist; glob fallback `Program Files\Autodesk\AutoCAD 20*\accoreconsole.exe`; manual `--cad-path` may point at `accoreconsole.exe` directly | Run the exe to probe `PROGRAM` | Never executes untrusted binaries (existing rule); registry read unit-tested with a mocked `winreg` |
| D15 | three.js integration (open item) | App is CSR + zoneless today (no `zone.js`, no `@angular/ssr`). Viewer boots in `afterNextRender` with `await import('./three-scene')`; render loop via rAF outside signals | Eager import in component file | Cost-free SSR safety; keeps `three` out of the initial bundle |
| D16 | Web state | Signals + `resource()` in a `WorkspaceStore`; `AuthService` wraps `UserManager`; functional `authGuard` | NgRx/RxJS store | Project already uses signals and signal forms; small surface |
| D17 | Concurrency per document | At most one `queued|running` job per `document_id` (409) | Optimistic | Reopen→mutate→save on the same file cannot overlap safely |

## Data Model (slice 1)

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL,
  cad_kind TEXT NOT NULL CHECK (cad_kind IN ('FreeCAD','AutoCAD')),
  name TEXT NOT NULL, native_path TEXT, created INTEGER NOT NULL,
  updated INTEGER NOT NULL, latest_job_id TEXT);
CREATE INDEX IF NOT EXISTS documents_owner ON documents(owner, updated DESC);
CREATE TABLE IF NOT EXISTS meshes (
  job_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, device_id TEXT NOT NULL,
  size INTEGER NOT NULL, sha256 TEXT NOT NULL, created INTEGER NOT NULL);
-- additive, idempotent: run only if PRAGMA table_info(jobs) lacks the column
ALTER TABLE jobs ADD COLUMN type TEXT;        -- NULL = phase 1 create_box
ALTER TABLE jobs ADD COLUMN document_id TEXT;
```

`Store.migrate()` runs in the constructor after `CREATE TABLE IF NOT EXISTS`; it reads `PRAGMA table_info(jobs)` and issues each `ALTER` only when missing. `heartbeat()` returns `{ id, expires, type, documentId, ...payload }`; phase 1 rows map `type=null → 'create_box'`. `complete()` accepts `{ ok, result ≤16000, nativePath? ≤1024, scene? }` and, on success, updates `documents.updated/latest_job_id/native_path` in the same transaction. `/api/agent/results/:id` body limit stays inside the 32 kb JSON cap.

## MCP Tool Catalog

Common param fragments: `deviceId?: z.uuid()`, `cadId?: /^[a-f0-9]{24}$/`, `preferredCad?: z.enum(['FreeCAD','AutoCAD'])`, `documentId?: z.uuid()`, `name?: /^[A-Za-z0-9 _-]{1,60}$/` (display only), `mm = z.number().finite().positive().max(10000)`, `coord = z.number().finite().min(-100000).max(100000)`, `position?: {x,y,z: coord}`, `object: /^[A-Za-z][A-Za-z0-9_]{0,31}$/` (FreeCAD Name) or `/^[0-9A-F]{1,16}$/` (AutoCAD handle), `confirmed: z.literal(true)` on every mutating tool. All schemas `.strict()`.

| Batch | Tool | Params | Kind |
|---|---|---|---|
| A | `list_devices` | — | read (exists) |
| A | `list_documents` | — | read, DB |
| A | `get_job` | `jobId` | read, DB |
| A | `create_box` | selection, `documentId?`, `name?`, `length,width,height: mm`, `position?`, `confirmed` | job |
| A | `create_cylinder` | selection, `documentId?`, `radius,height: mm`, `position?`, `confirmed` | job |
| A | `create_sphere` | selection, `documentId?`, `radius: mm`, `position?`, `confirmed` | job |
| A | `create_cone` | selection, `documentId?`, `radius1: mm, radius2: mm∪0, height: mm`, `position?`, `confirmed` | job |
| B1 | `boolean_cut` / `boolean_union` / `boolean_intersect` | `documentId`, `base: object`, `tool: object`, `confirmed` | job |
| B1 | `extrude_rect` | selection, `documentId?`, `width,height,depth: mm`, `plane: z.enum(['XY','XZ','YZ'])`, `position?`, `confirmed` | job |
| B2 | `translate_object` | `documentId`, `object`, `dx,dy,dz: coord`, `confirmed` | job |
| B2 | `rotate_object` | `documentId`, `object`, `axis: z.enum(['X','Y','Z'])`, `degrees: z.number().min(-360).max(360)`, `confirmed` | job |
| B2 | `scale_object` | `documentId`, `object`, `factor: z.number().min(0.001).max(1000)`, `confirmed` | job |
| B2 | `read_scene` | `documentId` | job (read op, returns `scene` JSON ≤12 kB) |
| B2 | `export_design` | `documentId`, `format: z.enum(['step','stl','dxf'])`, `confirmed` | job |
| opt | `create_pyramid` | `sides: z.int().min(3).max(12)`, `baseEdge,height: mm` | job (B1 if budget allows) |

Rules: numeric/enum/uuid/regex-bound identifiers only; no free text reaches the worker; `name` never leaves the DB. Server-side `enqueue(owner, op, input)` checks: device owned+online, `cad.capabilities.ops` includes `op` (or FreeCAD fallback list), document owned and `cad_kind` matches, D17 lock, ≤5 active per device. Agent re-validates `op ∈ OPS` and every bound before spawning.

`McpServer({ instructions })` outline: units are millimeters; always confirm dimensions before mutating; one primitive per call, then booleans; use `read_scene` before modifying; `get_job` after every job; default tolerances (±0.1 mm general, ±0.02 mm fits); name objects by function; design for manufacturability (wall ≥1.2 mm for print, fillets on load paths); architectural conventions (axis grid, floor-to-floor, wall thickness ranges). Resources: `cadgpt://guidance/mechanical`, `cadgpt://guidance/architectural`, `cadgpt://guidance/units-tolerances`. Prompts: `design_brief` (elicit intent → parametric plan), `design_review` (read scene, check tolerance/fit/manufacturability).

## Agent Strategy

```python
class CadStrategy(Protocol):
    kind: str                                   # 'FreeCAD' | 'AutoCAD'
    def supports(self, op: str) -> bool: ...
    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path) -> list[str]: ...
    def env(self, base: dict[str, str]) -> dict[str, str]: ...
    def artifacts(self, op: str, job_dir: Path, doc_dir: Path) -> Artifacts: ...  # native, mesh|None, scene|None
```

`executor.execute(job, cads, root)`: validate id/expiry/op/bounds → pick CAD by `cadId` and strategy by `cad.name` → `job_dir = root/jobs/<job_id>` exclusive `mkdir` (unchanged) → `doc_dir = root/documents/<document_id>` `mkdir(exist_ok=True, 0o700)` → write `request.json = {op, params, document_id}` (no paths) → `Popen(strategy.build_argv(...), shell=False, stdin=DEVNULL, cwd=job_dir)` with the sanitized env plus `CADGPT_JOB_DIR`, `CADGPT_DOC_DIR` → 4 kB tail drain, 120 s kill → verify `artifacts()` exist → return `ExecResult(summary, native_path, mesh, scene)`. `main.py` uploads `mesh` first (if any), then reports the result; upload failure is reported as `ok=True` with a "preview unavailable" note (the design exists locally).

FreeCAD worker: `OPS: dict[str, Callable]`; `create_*` with `documentId` absent → `newDocument` + `saveAs(doc_dir/design.FCStd)`; otherwise `openDocument` → mutate → `recompute()` → `save()`. Booleans create `Part::Cut|Fuse|Common` with `Base`/`Tool`. Transforms mutate `obj.Placement`/`obj.Shape.scale`. Mesh: compound of objects with empty `InList` (top-level, not consumed) → `MeshPart.meshFromShape(...).write(job_dir/preview.stl)`. `read_scene` writes `scene.json` `[{name,label,type,bbox,volume}]`. Unknown op → exit 2.

AutoCAD strategy: argv `[accoreconsole.exe, "/i", doc_dir/design.dwg | <bundle>/autocad/blank.dwg, "/s", job_dir/run.scr, "/isolate"]`. `run.scr` rendered from a per-op template with `repr(float)` numbers, validated handles, and agent-derived paths only: `(load "<bundle>/autocad/cadgpt.lsp") (cadgpt-create-box 10.0 20.0 30.0 0.0 0.0 0.0) _.SAVEAS 2018 "<doc_dir>/design.dwg" _.QUIT`. `cadgpt.lsp` exposes one `cadgpt-<op>` function per allowlisted op (core AutoLISP only, no `vlax-*`, per research A3). Decode console output with `utf-16-le`/`replace` fallback (Core Console quirk). STL only in slice 14.

## Discovery

`cad = {id, name, path, version:'Not verified', executable, capabilities:{execute, edition:'full'|'lt'|'unknown'|null, console: str|null, ops: [...], mesh: bool}}`. FreeCAD: `execute = name.lower() in ('freecadcmd','freecadcmd.exe')`, `ops = FREECAD_OPS`, `mesh=True`. AutoCAD: registry per D14; `edition='full'` iff `accoreconsole.exe` found next to `AcadLocation` and ProductID lacks `LT`; `execute = edition=='full' and enable_autocad_flag`; `ops = AUTOCAD_OPS`; `mesh=False`. `cadSchema` gains `capabilities: z.object({...}).optional()`.

## Mesh Upload / Serve

`POST /api/agent/jobs/:id/mesh` — `token(q)` device auth; job must be `running` on that device; `Content-Type: application/octet-stream`; `Content-Length ≤ 25 MiB` and streamed byte count enforced (destroy socket at cap+1); `X-Mesh-Sha256` header verified by a streaming hash; binary STL sanity `size == 84 + 50*facets`; write to `DATA_DIR/meshes/<jobId>.stl.part` → `rename`. Per-device quota 500 MiB (sum of `meshes.size`); keep the newest 5 meshes per document, unlink older. Route mounted before `express.json` is irrelevant (json parser ignores octet-stream), but it gets its own `rateLimit({limit: 30})`.
`GET /api/designs`, `GET /api/designs/:id` (OIDC `cad:read`, owner-scoped), `GET /api/designs/:id/mesh` → `latest_job_id` mesh → `res.sendFile` with `Content-Type: model/stl`, `Cache-Control: private, no-store`. CSP unchanged: `connect-src 'self'` covers same-origin `fetch`; helmet defaults (CORP same-origin, nosniff) apply. The browser fetches with the bearer header and calls `STLLoader.parse(arrayBuffer)`.

## Web Architecture

```
app/
  core/auth/{auth.service,auth.guard}.ts   UserManager wrapper; signals user/token/ready; functional guard
  core/api/{api-client,models}.ts          fetch + bearer; typed DTOs
  core/state/workspace.store.ts            signals + resource(): devices, jobs, designs
  layout/shell/                            header, left rail nav, footer (<router-outlet>)
  pages/{home,about,callback,pair,connect,devices,designs,design-detail,jobs}/  lazy loadComponent
  features/viewer/{stl-viewer.ts,three-scene.ts}
  ui/{button,badge,panel,empty-state,dimension}  atoms
```
Routes: `''` home (public), `about` (public), `callback` (runs `signinRedirectCallback`, then `navigateByUrl(sessionStorage.returnUrl)`), `pair`, `connect` (`device` query → `input()` via `withComponentInputBinding()`), `devices`, `designs`, `designs/:id`, `jobs`, `**` → `''`. Guard: `await auth.ready(); return auth.user() ? true : (auth.login(state.url), false)`. Viewer: `StlViewer` (`meshUrl = input.required<string>()`), `afterNextRender` → dynamic import of `three-scene.ts` (imports `three`, `three/addons/loaders/STLLoader.js`, `three/addons/controls/OrbitControls.js`), `ResizeObserver`, `DestroyRef` disposes renderer. Deps: `three@0.186`, `@types/three` (dev).

Design-system intent (full pass with `frontend-design` in apply): subject is precision engineering; the memorable element is the design-detail page where the viewer canvas is the hero and dimensions in mm are the typographic motif (tabular numerals); one grotesque family; cool drafting-paper neutrals with a single technical blue; left-aligned, persistent left rail; no all-caps eyebrows, no numbered markers except the genuine pairing→connect sequence.

## Onboarding

After `poll` returns a credential, `main.py` opens `server + '/connect?device=' + deviceId` (UUID, not secret; `--headless` prints it). `ConnectPage` shows: the MCP resource URL `origin + '/mcp'`, Claude steps (Settings → Connectors → Add custom connector → paste URL → sign in), ChatGPT steps (Settings → Connectors → Developer mode → Add → paste URL), a live device status card polling `/api/devices`, and "Try `list_devices`". `PairPage` links to `/connect` after approval. Packaging: no change (post-install run already reaches `main()`); docs updated in slice 15.

## Data Flow

```
MCP client ─OIDC─▶ POST /mcp ─▶ tool(zod) ─▶ Store.enqueue(op, document) ─▶ jobs
                                                                    │ poll (device cred)
agent main ◀───────────────────────────────────────────────────────┘
  │ executor ─▶ CadStrategy ─▶ Popen(argv, shell=False) ─▶ worker/.scr
  │            job_dir/{request.json, preview.stl, scene.json}  doc_dir/design.{FCStd,dwg}
  ├─▶ POST /api/agent/jobs/:id/mesh (octet-stream) ─▶ DATA_DIR/meshes/<job>.stl + meshes row
  └─▶ POST /api/agent/results/:id ─▶ jobs.status, documents.latest_job_id
browser ─OIDC─▶ GET /api/designs/:id/mesh ─▶ STLLoader.parse ─▶ three canvas
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/store.ts` | Modify | documents/meshes tables, `migrate()`, per-op schemas, `enqueue(owner, op, input)`, document/mesh methods |
| `apps/api/src/mesh.ts` | Create | streaming upload (cap, sha256, STL sanity), quota, serve helper |
| `apps/api/src/tools.ts` | Create | tool catalog registration (`registerTools(server, store, owner, auth)`), instructions, prompts/resources |
| `apps/api/src/main.ts` | Modify | mount tools, `/api/designs*`, `/api/agent/jobs/:id/mesh`, results body extension |
| `apps/api/test/{documents,mesh,tools}.test.ts` | Create | node:test coverage |
| `agent/cadgpt_agent/strategies/{__init__,base,freecad,autocad}.py` | Create | `CadStrategy`, implementations |
| `agent/cadgpt_agent/executor.py` | Modify | generic validate/dispatch, doc_dir, `ExecResult` |
| `agent/cadgpt_agent/freecad_worker.py` | Modify | `OPS` dispatch, reopen/save, MeshPart STL, scene.json |
| `agent/cadgpt_agent/autocad/{cadgpt.lsp,blank.dwg,templates/*.scr}` | Create | allowlisted scripts |
| `agent/cadgpt_agent/discovery.py` | Modify | registry + accoreconsole, `capabilities` |
| `agent/cadgpt_agent/main.py` | Modify | `--enable-autocad`, mesh upload, open `/connect` |
| `agent/tests/test_{strategies,discovery,upload}.py` | Create | unittest, mocked Popen/winreg/urlopen |
| `apps/web/src/app/**` | Rewrite | structure above; `app.html/app.ts` shrink to shell + outlet |
| `apps/web/package.json` | Modify | `three`, `@types/three` |
| `README.md`, `SECURITY.md`, `docs/` | Modify | compatibility table, mesh exception, AutoCAD opt-in and license note, connect guide |

## Security Invariants

1. No tool parameter is code, script text, or a path; identifiers are regex-bound. 2. Agent validates op + bounds independently of the server. 3. `shell=False`, fixed argv, sanitized env, exclusive job dir, 120 s kill, 4 kB tail. 4. Filesystem locations derive from UUIDs; the server never sends paths. 5. Device credential only for `/api/agent/*`; OIDC only for `/mcp`, `/api/designs*`. 6. Mesh upload: size cap, streaming hash, STL structural check, quota, job-bound file name, `running` job precondition. 7. Documented exception: the STL preview leaves the machine; native files do not. 8. AutoCAD execution is opt-in.
Threat notes: upload abuse → cap, quota, rate limit, precondition; tool-schema drift → agent-side `OPS` allowlist is the second gate and a test asserts the server catalog ⊆ agent allowlist (shared `ops.json` fixture); malicious `read_scene` output → treated as data, ≤12 kB, rendered as text only.

## Threat Matrix

| Boundary | Cases | Applicability | Design response | Planned RED tests |
|---|---|---|---|---|
| Documentation-like / executable-file classification | manual `--cad-path` pointing at `notes.txt`, `README.sh`, `acad.exe` (GUI), `acadlt.exe` | Applicable — discovery classifies executables | Only `freecadcmd*` and `accoreconsole.exe` basenames yield `execute=true`; LT and GUI binaries stay detection-only | one test per basename class |
| Subprocess argv composition | params with `1e309`, `NaN`, negative, strings in numeric fields, `object` with `..`/`;`/quotes | Applicable | Zod + agent bounds; `.scr` rendered via `repr(float)` and regex-checked handles; golden-script equality test | per strategy: `shell=False`, argv[0] equality, golden `.scr`, rejection of each malformed value |
| Caller-controlled paths | `documentId` not a UUID, path separators in ids, symlinked doc dir | Applicable | `uuid.UUID(...)` round-trip check; `doc_dir` under `root/documents` asserted via `resolve().is_relative_to(root)` | traversal rejection test |
| Upload boundary | oversize, mismatched sha256, ASCII STL, non-running job, foreign device | Applicable | see Mesh section | one test per case |
| Git repository selection / Commit / Push / PR commands | — | N/A — no VCS or PR automation in this change | — | — |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| api unit (`tsx --test`) | migrate idempotence on a phase 1 DB, document ownership, D17 lock, capability gating, selection resolution, mesh cap/hash/quota/precondition, tool catalog ⊆ agent allowlist | `Store(':memory:')` fixtures as today; upload tested via `http.request` against a listening app |
| agent unit (`unittest`) | each strategy: `Popen` mocked, assert `shell=False`, argv equality, env sanitization, replay refusal; `.scr` golden; discovery with mocked `winreg`/glob; uploader with mocked `urlopen` (no redirect) | existing `test_agent.py` pattern |
| web unit (Vitest) | `authGuard` redirect + return URL, `callback` navigation, `WorkspaceStore` resources, `StlViewer` mounts a canvas with `three-scene` mocked | `TestBed` + `RouterTestingHarness` |
| integration (manual, documented) | FreeCAD 1.1.3 end-to-end create → modify → preview; Windows AutoCAD DWG job; slice 14 spike | checklist in `docs/` |

## Migration / Rollout

Additive schema; `migrate()` idempotent; phase 1 agents keep working (`type=null`, no `capabilities`). Mesh files deletable. AutoCAD off until `--enable-autocad`.

## Slice Mapping (400-line budget)

| Proposal slice | Fit | Design decision |
|---|---|---|
| 1 documents + job columns | Fits | store + tests |
| 2 strategy split + worker + STL | **Exceeds** → 2a `CadStrategy` + `FreeCadStrategy` refactor (behaviour-preserving) + tests; 2b worker `OPS` + primitives + booleans + STL + scene | |
| 3 tools batch A + instructions | **Exceeds** → 3a `tools.ts` batch A + selection + tests; 3b instructions/prompts/resources text | |
| 4 tools batch B | **Exceeds** → 4a B1 (booleans, extrude); 4b B2 (transforms, read_scene, export) | |
| 5 mesh upload/serve + README | Borderline → `mesh.ts` + routes + tests; README exception travels with it | |
| 6 agent upload | Fits | |
| 7 routing skeleton + guard | Fits (shell minimal, pages as stubs) | |
| 8 viewer | Fits | |
| 9–11 dashboard | Fits as three slices; home/about copy in 9 | |
| 12 discovery | Fits | |
| 13 AutoCAD strategy + scripts + DWG | **Exceeds** → 13a strategy + `.lsp` + create ops + `--enable-autocad`; 13b modify/read ops + API gating | |
| 14 AutoCAD STL (conditional) | Fits | |
| 15 connect page + agent open + docs | Fits | |

## Open Questions (recorded as decisions with fallbacks)

- [ ] D12 Autodesk EULA — opt-in flag; revisit wording with legal input.
- [ ] D13 Windows spike for `EXPORT`/`3DPRINT` in Core Console — gates slice 14 only.
- [ ] D14 registry layout verification on a real Windows install — glob + manual path fallback.
- [ ] D15 confirmed CSR + zoneless; `afterNextRender` guard retained.
