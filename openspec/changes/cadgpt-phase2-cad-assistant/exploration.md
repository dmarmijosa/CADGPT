## Exploration: CADGPT Phase 2 — dual CAD connector, expert MCP, dashboard redesign, three.js viewer

### Current State

**API (`apps/api/src/*`, NestJS 12 + Express 5, single file per concern)**
- `main.ts`: bootstraps one Nest app used only as an Express host (`bodyParser: false`, helmet CSP from `security.ts`, global 32kb JSON limit, 180 req/min rate limit). Routes are plain Express handlers wrapped in `wrap()` for async error forwarding. Auth is a single `authenticator()` closure (`auth.ts`, `jose` + remote JWKS) called per-route with an optional required scope (`cad:read` default, `cad:write` for mutations). Device-to-API auth uses a separate bearer scheme: raw `token()` extraction + `Store.device()` hash lookup (device credentials, not OIDC tokens) for `/api/agent/poll` and `/api/agent/results/:id`.
- MCP is mounted at `POST /mcp` as one handler that authenticates the OWNER (OIDC) via `auth(header)`, builds a **fresh `McpServer` + stateless `StreamableHTTPServerTransport` per request** (`sessionIdGenerator: undefined`), registers 3 tools inline (`list_devices`, `list_jobs`, `create_box`), and tears the server down on `res.close`. Tool identity comes from the already-verified OIDC `sub` (`owner`) — confirms product point 5 ("do NOT ask for username") is already the pattern; a new tool just needs to close over `owner`.
- `store.ts` (`node:sqlite` `DatabaseSync`, WAL) has 3 tables: `pairings` (one-shot device pairing flow), `devices` (`id, owner, name, token_hash, cads JSON, last_seen, revoked`), `jobs` (`id, device_id, owner, payload JSON, status, expires, created, result`). Job lifecycle is a simple state machine: `queued → running → succeeded|failed`, plus timeout-derived `expired` (never claimed) and `unknown` (claimed but result never reported — deliberately never auto-requeued, comment: "a lost result has an unknown outcome"). `enqueue()` hardcodes a FreeCAD-only device/cad compatibility check (`c.name === 'FreeCAD' && c.executable`) and a max-5-active-jobs-per-device cap. `payload` is `JSON.stringify` of the Zod-validated tool input, so a new job type = a new Zod schema + a JSON blob column already generic enough to hold it (no migration needed for job *content*, only for lifecycle/type discrimination if operations diverge — e.g. no `type` or `docId` column yet).
- No file/blob table or storage path exists anywhere in `apps/api`. There is no upload endpoint, no multipart handling (body parser is JSON-only, 32kb cap), no object storage client, and no static file serving other than the built Angular app. Any mesh upload work is 100% new surface: new size limits, new content-type handling (binary GLB/STL, not JSON), new auth (must accept the *device credential* bearer scheme like `/api/agent/*`, not OIDC), and a storage location (`DATA_DIR` already exists as a 0700 dir pattern for the SQLite file — natural place for a `DATA_DIR/meshes/{jobId}.glb` convention, or a dedicated subdir/table for versions if "modify" produces multiple mesh revisions per document).
- `auth.ts` / `security.ts` are small, single-purpose, and were already written defensively (loopback-only HTTP exception, CSP locked to `'self'` + issuer origin, no inline scripts). Any new page (onboarding, MCP-connect step) must fit inside the existing CSP directives or the CSP object needs an explicit, minimal extension.

**Agent — dual-CAD execution (`agent/cadgpt_agent/*`, Python 3.11+, single console entrypoint)**
- `discovery.py` detects candidate binaries by **name matching only** (`shutil.which` for `FreeCADCmd/freecadcmd/freecad/FreeCAD/acad/acadlt`, OS-specific glob patterns, Windows registry `App Paths\acad.exe`, a `~/.conda/environments.txt` scan for Conda FreeCAD). Classification: `name = "AutoCAD" if "autocad" in path.lower() or path.name.startswith("acad")`, and `executable` is **only ever `True` for FreeCAD** (`name == "FreeCAD" and path.name in ("freecadcmd","freecadcmd.exe")`). **There is no `accoreconsole.exe` detection at all**, and **no full-vs-LT distinction** — `acadlt` is matched into the same "AutoCAD" bucket with `executable=False` always, i.e. today AutoCAD is permanently "detection only, never executable" by construction, not by a runtime check. `version` is hardcoded to the literal string `"Not verified"` — no `-v`/`/product` probe is ever run (consistent with the "avoid running untrusted executables" comment at the top of the file).
- `executor.py` is a single hardcoded FreeCAD pipeline: validate job → allocate `job_dir` with **exclusive `mkdir` (0700, `exist_ok=False`)** as replay protection → write `request.json` → spawn `[cad_path, worker.py]` with a sanitized env (`QT_QPA_PLATFORM=offscreen`, stripped `PYTHON*`/`*_LIBRARY_PATH`) → drain stdout to a 4KB tail buffer via a daemon thread → 120s hard timeout → require `box.FCStd` to exist. This is a clean **Strategy pattern candidate**: `execute(job, cads, root)` today *is* the FreeCAD strategy; a second AutoCAD strategy (`accoreconsole.exe input_dwg /s script.scr` or `.lsp` via `(command...)`) can sit beside it if `discovery.py` is extended to (a) look for `accoreconsole.exe` specifically as a distinct binary name/path pattern (it ships inside the full AutoCAD install tree, not `acad.exe`), and (b) make `executable` a real per-tool capability check rather than a hardcoded FreeCAD-only boolean. Full-vs-LT is derivable in principle from install path conventions (LT installs to a differently-named directory and does not ship `accoreconsole.exe`/does not support ObjectARX-level scripting the same way) — **this must be verified in research, not assumed**, since `accoreconsole.exe` presence is the most reliable proxy for "full AutoCAD, scriptable" vs LT.
- `freecad_worker.py` is the only code that runs inside FreeCAD's own Python. Today it does exactly one thing (box + STEP export) with no parametrization beyond the 3 dimensions baked into `request.json`. A multi-operation worker needs either (a) one script that branches on an `op` field in `request.json` (simplest, keeps "single allowlisted script" security posture), or (b) one script per operation type invoked by name (more files, same trust boundary). GLB export from FreeCAD 1.x is via the `Import` module (`Import.export(objs, path)` with a `.glb`/`.gltf` extension) — **not yet verified against this repo's target FreeCAD version; must be confirmed in research**, consistent with the task's instruction to record it as an assumption.
- `main.py` is the pairing + poll loop; it opens a browser to `{server}/pair` today. This is the natural insertion point for "step 3: guided MCP client connect" — either as a second browser-opened page served by the same Angular app after pairing completes, or as a print/webview step inside the agent itself. No such step exists today; `main.py` prints "Connected. Keep this agent running." and goes straight into the poll loop.
- `agent/tests/test_agent.py` (stdlib `unittest`, run via `python -m unittest discover`) covers bounds validation, secure-origin parsing, manual detection, the fixed-subprocess/replay-refusal guarantee, and unknown-CAD rejection. A second execution backend and new job schemas will need equivalent coverage; the existing test style (mock `subprocess.Popen`, assert `shell=False` and argv[0]) is the established pattern to follow.

**Web (`apps/web`, Angular 22.1, Vitest via `@angular/build:unit-test`)**
- Single-screen SPA: `App` (`app.ts`) does OIDC (`oidc-client-ts` `UserManager`, session-storage-backed, manual `/callback` redirect handling — no `AuthGuard`/route-based flow), signal-based state (`devices`, `jobs`, `model` via `@angular/forms/signals` `form()`), and directly renders everything in `app.html` (hero, pairing form, device list, one job-creation form for `create_box`, job history). `app.routes.ts` is an **empty `Routes` array** — `provideRouter([])` is wired in `app.config.ts` but nothing uses it yet, so there is no routing infrastructure to build on for "informational pages" or a dashboard/viewer split; this is greenfield within an already-present router provider.
- `package.json`: Angular 22, RxJS 7.8, `oidc-client-ts` 3.5.0, TypeScript ~6.0.2, Vitest 4, `jsdom`, `prettier` (no ESLint). **No three.js, no `@types/three`, no `@angular/animations`, no component library, no CSS framework** — `app.css` is hand-written. Any 3D viewer and design-system work starts from zero dependencies; three.js + its types must be added fresh.
- No E2E tooling; `ng test` is the only test entrypoint (Vitest-backed, no coverage config).

**Packaging (`packaging/`, `agent/launcher.py`)**
- `packaging/build.py` runs PyInstaller against `agent/launcher.py` (which just wraps `main()` with error dialogs). `packaging/windows.iss` (Inno Setup) installs the PyInstaller output and runs `CADGPT.exe` once post-install (`Flags: nowait postinstall skipifsilent`). There is no macOS installer script found (only `.iss` for Windows) despite `build.py` branching on `platform.system() == "Darwin"` for `--windowed`/bundle id — packaging for macOS delivery format is incomplete or out of this repo's current scope. The natural "connect your MCP client" step is either (a) appended inside `agent/main.py` after the poll loop starts successfully (print/open a doc URL), or (b) a page served by the Angular app once pairing is approved (state transition already exists: `pending: false` → dashboard shows the device) — no code currently does either.

### Affected Areas

- `apps/api/src/main.ts` — new job-type routes, new/expanded MCP tool registrations, new mesh upload endpoint (binary body handling, device-credential auth reuse), CSP/static-serving implications for new pages.
- `apps/api/src/store.ts` — new Zod schemas per operation, job schema needs a discriminator (e.g. `type` column) if operations diverge structurally from `Box`, likely a `documents`/`projects` table if "modify existing design" needs a persistent registry beyond one-job-one-file-dir, and a mesh/asset table or `DATA_DIR` convention for uploaded previews.
- `agent/cadgpt_agent/discovery.py` — add `accoreconsole.exe` detection, real per-CAD `executable`/capability flags, full-vs-LT signal.
- `agent/cadgpt_agent/executor.py` — refactor `execute()` into a strategy dispatch (FreeCAD vs AutoCAD), generalize the single-job-type validation into per-operation validators, add mesh export + upload step after native file save.
- `agent/cadgpt_agent/freecad_worker.py` — becomes multi-operation (branch on `op`), add GLB/mesh export call.
- New AutoCAD worker artifact (`.scr`/`.lsp`) — does not exist yet, net-new file(s).
- `agent/cadgpt_agent/main.py` — insertion point for "connect your MCP client" guided step.
- `apps/web/src/app/*` — full redesign: routing (`app.routes.ts` currently empty), component split (dashboard, pairing, job creation, informational pages), new three.js viewer component, new dependency (`three`, `@types/three`).
- `packaging/build.py`, `packaging/windows.iss`, `agent/launcher.py` — MCP-client-connect step placement; no macOS installer script currently in repo.
- `agent/tests/test_agent.py` — needs new coverage for second execution backend and new job types, following the existing mock-`Popen` pattern.
- README.md (`## Compatibility`, `## Run from source`) — documents current "AutoCAD: discovery only" state and the "no arbitrary Python/AutoLISP/shell exposed" security posture that phase 2 must preserve for the *tool* surface (mesh upload is an explicit, acknowledged exception to "files never leave the machine", not to "no arbitrary code execution").

### Approaches

**(a) Tool granularity — MCP tool design**

1. **Many small tools** (`create_box`, `create_cylinder`, `extrude_sketch`, `boolean_union`, `transform_object`, `export_mesh`, `open_document`, `list_scene`, ...)
   - Pros: each tool has a tight Zod schema (easy validation, easy allowlisting per-operation on the agent side, matches existing `boxSchema` pattern exactly, clearest audit trail per job row), maps 1:1 to a FreeCAD worker branch or AutoCAD script.
   - Cons: tool list grows fast (professional CAD ops are numerous), more MCP registration boilerplate in `main.ts`, harder for the model to compose multi-step designs in one call.
   - Effort: Medium (incremental, additive — lowest regression risk).

2. **Few composite tools** (`create_shape`, `modify_shape`, `read_scene` with a large discriminated-union input)
   - Pros: fewer MCP registrations, one job schema family, dashboard/job history stays simple.
   - Cons: Zod discriminated unions get large and harder to keep "professionally instructed" (design guidance embedded in tool descriptions gets diluted across many shapes), agent-side validation/allowlisting logic concentrates risk in one big `validate()`, harder to reason about "no arbitrary code execution" guarantee per operation.
   - Effort: Medium — similar code volume to (1), different shape.

3. **Validated operation-DSL** (one `run_operations` tool accepting an ordered list of pre-approved operation objects, executed as a mini-program against one document)
   - Pros: naturally supports "modify existing design" as a sequence, best fit for real CAD workflows (sketch → extrude → boolean → export in one job), smallest MCP surface.
   - Cons: highest implementation and review risk — closest in shape to "arbitrary code execution" that the README explicitly disclaims; needs a strict allowlisted operation grammar and per-op validation to stay inside the existing security posture; largest single PR/design surface, hardest to review incrementally under the 400-line budget.
   - Effort: High.

**(b) Mesh transport — agent upload to API vs signed object storage**

1. **Agent uploads mesh directly to API** (reuse the existing device-credential bearer scheme, `POST /api/agent/results/:id` pattern extended or a new `/api/agent/meshes/:id` endpoint with a binary body and explicit size cap)
   - Pros: no new infra dependency, reuses existing auth model 1:1, consistent with "server already brokers device↔owner", `DATA_DIR` already exists as the storage root.
   - Cons: API process now handles binary uploads and must serve them back to the browser (new static/streaming route, new storage growth on the API host, needs its own size/quota limits distinct from the existing 32kb JSON cap).
   - Effort: Low–Medium.

2. **Signed object storage** (API issues a short-lived signed URL, agent PUTs the mesh directly to object storage, dashboard fetches from there)
   - Pros: keeps the API process stateless for large binaries, standard scalable pattern, offloads storage growth.
   - Cons: net-new infrastructure dependency (S3-compatible store or equivalent) not present anywhere in this repo today (no `deploy/` config, no SDK dependency) — meaningfully larger scope than the rest of phase 2, contradicts the project's otherwise fully self-hosted/Keycloak-only footprint unless self-hosted (e.g. MinIO) is added to `deploy/`.
   - Effort: High (new infra + new deploy/docker-compose changes + new secrets).

**(c) State model for "modify existing design"**

1. **Project/document per job dir** (current model: each job gets its own `job_dir`, `revoke`/`enqueue` stay device-scoped, "modify" jobs reference a previous job's output path)
   - Pros: zero schema migration beyond adding a `parentJobId`/`sourcePath` reference, matches existing exclusive-mkdir replay protection, minimal blast radius.
   - Cons: "which document is this?" becomes an implicit chain of job IDs, harder to expose "list my designs" cleanly to the model/dashboard, cleanup/GC policy unclear (job dirs are not currently pruned).
   - Effort: Low.

2. **Persistent project/document registry** (new `documents` table: `id, owner, deviceId, cadId, nativePath, latestMeshPath, createdAt`; jobs reference a `documentId`)
   - Pros: natural fit for `list_scene`/`read` tools, clean dashboard "my designs" view, clear place to hang mesh-version history for the three.js viewer.
   - Cons: new table + migration, new ownership/authorization checks (must reuse the `owner` pattern from `devices`), more moving parts for phase 2's first cut.
   - Effort: Medium.

### Recommendation

Start with **(a) many small tools** (extendable incrementally, matches the existing `boxSchema`/`create_box` precedent and keeps each PR under the 400-line review budget), **(b) agent uploads mesh directly to the API** (no new infra, reuses the device-credential auth already built), and **(c) a persistent document registry** introduced early (even a minimal one) because "modify existing design" and the three.js viewer both need a stable identity for "this design" that outlives a single job — bolting that on later than phase 2 would force a breaking schema change. Reserve the operation-DSL approach (a.3) for a later phase once several discrete tools have proven out the validation/allowlisting pattern for individual operations.

### Risks

- **AutoCAD execution is the largest unverified technical bet**: `accoreconsole.exe` detection, full-vs-LT distinction, and `.scr`/`.lsp`-driven STL export are all currently assumptions per the task brief, not verified against a real AutoCAD full install in this exploration — needs `sdd-research` or a hands-on spike before design commits to a specific script/command sequence.
- **FreeCAD GLB export via `Import` module** is likewise unverified against the specific FreeCAD version this repo targets (1.1.3 Conda was verified for STEP/box only, not mesh export).
- **Mesh upload is a stated, deliberate exception to "files never leave the machine"** (README) — needs explicit user-facing consent/copy in the redesigned dashboard, and the security model (auth, size limits, storage) has zero prior art in this codebase to build on.
- **Operation surface growth vs. "no arbitrary code execution" guarantee**: every new create/modify/read tool must stay inside allowlisted, Zod-validated, parametrized shapes — the existing README security claim is a hard constraint on tool design, not just an implementation detail.
- **No routing/component architecture exists yet in `apps/web`** — the dashboard redesign is closer to a rewrite than an incremental change; sizing this against the 400-line review budget will likely require deliberate chained-PR slicing (routing skeleton → dashboard components → viewer component → informational pages) as separate work units.
- **No macOS installer script** currently exists despite `build.py` supporting a Darwin `--windowed` build — the "on install, open a web page" flow (product point 2) may need a macOS-side packaging gap closed as part of this change, not assumed to exist.
- **`job` schema has no discriminator column today** — introducing multiple operation types without an explicit `type`/`op` column on `jobs` (or a `documents` table) risks ad-hoc parsing of the `payload` JSON blob to infer job kind, which the current codebase deliberately avoids elsewhere (everything is Zod-typed at the boundary).

### Ready for Proposal

Yes — the codebase has enough established patterns (Zod-validated tool schemas, device-credential vs OIDC dual auth, allowlisted single-script execution, exclusive-mkdir job dirs) to design phase 2 incrementally. Before `sdd-propose` locks in AutoCAD scripting details and the FreeCAD mesh-export call, recommend routing through `sdd-research` first to verify the two starred assumptions (accoreconsole/.scr/.lsp behavior on full AutoCAD, and FreeCAD `Import` GLB export) since neither can be confirmed by reading this repo alone.
