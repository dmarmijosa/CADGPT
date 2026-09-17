# Apply Progress: Phase 6 — Tray GUI, Blender, Governance & Integrity

## Work Unit 1: Deep File Integrity & Magic Byte Validation Gates

### Completed Tasks
- [x] 1.1 Implement binary STL validator in `agent/cadgpt_agent/integrity.py` and `apps/api/src/integrity.ts` enforcing exact formula $FileSize = 84 + (50 \times N)$ bytes, ASCII `"solid "` rejection, finite float coordinates rejecting NaN/Infinity, and rejection of degenerate all-zero coordinates within bounds $[-100000, 100000]$ mm.
- [x] 1.2 Implement magic byte checks in `agent/cadgpt_agent/integrity.py` and `apps/api/src/integrity.ts` for DWG (`AC10xx`), FCStd (`PK\x03\x04` + `Document.xml` zip archive check), and Blend (BLENDER header regex `^BLENDER[-_][vV][0-9]{3}$`).
- [x] 1.3 Wire pre-upload gate in `agent/cadgpt_agent/upload.py`, mesh ingestion gate in `apps/api/src/mesh.ts`, and serve/download verification gate in `apps/api/src/main.ts`.
- [x] 1.4 Author comprehensive unit test suites in `agent/tests/test_integrity.py` and `apps/api/test/integrity.test.ts` testing all valid and invalid scenarios (corrupt sizes, NaN coordinates, ASCII headers, magic bytes, valid payloads).

### Files Created & Modified (WU1)
- `agent/cadgpt_agent/integrity.py`: Created module implementing `validate_binary_stl`, `validate_dwg`, `validate_fcstd`, `validate_blend`, `validate_cad_format`, `validate_file_integrity`.
- `apps/api/src/integrity.ts`: Created module implementing TypeScript equivalents for binary STL validation, DWG/FCStd/Blend magic checks, and `IntegrityError` (extending `DomainError`).
- `agent/cadgpt_agent/upload.py`: Wired `validate_binary_stl(path, max_bytes=MAX_UPLOAD_BYTES)` pre-upload gate in `upload_mesh`.
- `apps/api/src/mesh.ts`: Injected binary STL validation on `.part` upload before renaming to final `.stl` (unlinking `.part` on failure); added on-disk binary STL validation serve gate in `GET /api/designs/:id/mesh` returning HTTP 500 upon corruption.
- `apps/api/src/main.ts`: Updated 500 error handler to preserve `DomainError` integrity messages.
- `agent/tests/test_upload.py`: Updated test helper `_stl_bytes` with valid non-degenerate triangle coordinates.
- `agent/tests/test_integrity.py`: 31 tests covering valid/corrupt STLs, NaN/Infinity floats, out-of-bounds coords, degenerate zeros, DWG signatures, FCStd ZIP structures, and Blend headers.
- `apps/api/test/integrity.test.ts`: 13 comprehensive tests covering binary STL validation, magic byte checks, format dispatch, and serve gate HTTP 500 on disk corruption.

---

## Work Unit 2: Workspace Directory Governance

### Completed Tasks
- [x] 2.1 Scaffold 5 folders (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`) and atomic `project.json` manifest in `agent/cadgpt_agent/workspace.py`:
  * Standard 5-folder project initialization (`init_project`).
  * Atomic `project.json` read/write helper using temporary file + atomic rename (`load_project_manifest`, `save_project_manifest`).
  * Asset tracking, categorization (`cad`, `meshes`, `exports`, `renders`, `references`), SHA-256 calculation, and deep integrity checks integration (`index_asset`).
  * Audit and reorganization engine logic in Python workspace module (`audit_project`, `reorganize_project`, `reconstitute_manifest`).
- [x] 2.2 Implement read-only `audit_project_structure` tool in `apps/api/src/tools.ts`:
  * Strict Zod schema validating `project_dir`, `documentId`, or `projectId` with `readOnlyHint: true`.
  * Path containment validation against `allowedRoots`.
  * Scans 5-folder layout, detects unorganized files, computes file hashes/sizes, and produces non-disruptive reorganization plan with reasons without mutating disk.
- [x] 2.3 Implement `reorganize_project_structure` tool in `apps/api/src/tools.ts`:
  * Strict Zod schema requiring `confirmed: z.literal(true)` and write permission gate.
  * Strict path traversal prevention ensuring source and target are inside `project_dir` and within allowed roots.
  * Atomic file move, mtime preservation (`utimes`), and updating `project.json` manifest.
- [x] 2.4 Author comprehensive unit and integration tests:
  * In `agent/tests/test_workspace.py`: 15 tests covering 5-folder scaffolding, atomic manifest writes, corrupt manifest recovery, asset categorization and indexing with STL integrity, non-disruptive audit without disk mutation, unconfirmed reorganize rejection, path traversal rejection, and confirmed atomic moves with mtime preservation.
  * In `apps/api/test/workspace.test.ts`: 6 tests covering schema validation, read-only audit MCP tool with non-disruptive plan, unconfirmed reorganize rejection (400), path traversal attempt rejection (400), unauthorized path outside allowedRoots rejection (400), and confirmed reorganization with mtime preservation, manifest update, and compliant re-audit.

### Files Created & Modified (WU2)
- `agent/cadgpt_agent/workspace.py`: Created module implementing 5-folder scaffolding, atomic manifest I/O, asset tracking with SHA-256 and integrity checks, audit engine, and safe reorganization with mtime preservation.
- `apps/api/src/workspace.ts`: Created TypeScript workspace governance engine mirroring Python logic, implementing directory scaffolding, atomic manifest I/O, asset indexing with binary STL and CAD magic integrity gates, non-disruptive audit, and confirmed atomic reorganization with mtime preservation.
- `apps/api/src/store.ts`: Added `listAllRoots(owner: string)` to query all allowed roots for an owner across devices.
- `apps/api/src/tools.ts`: Exported `auditProjectStructureSchema`, `reorganizeProjectStructureSchema`, and `workspaceSchemas` (`.strict()`); implemented `resolveProjectDir` with allowed roots containment; registered `audit_project_structure` (readOnlyHint: true) and `reorganize_project_structure` (with write gate and `confirmed: true` validation).
- `agent/tests/test_workspace.py`: Created unit test suite covering scaffolding, atomic manifest operations, asset categorization and indexing, audit report generation, corrupt manifest recovery, and user-confirmed reorganization.
- `apps/api/test/workspace.test.ts`: Created integration test suite covering schema validation, read-only audit MCP tool, unconfirmed reorganize rejection (400), path traversal rejection (400), allowed roots enforcement (400), and confirmed reorganization with manifest persistence.
- `openspec/changes/cadengine-phase6-tray-gui-blender-workspace-integrity/tasks.md`: Marked tasks 2.1 to 2.4 as completed `[x]`.

---

## Work Unit 3: Headless Blender Engine & Precision Modeling Tools

### Completed Tasks
- [x] 3.1 Create headless worker `agent/cadgpt_agent/blender_worker.py`:
  * Headless CLI parser accepting `-- <job_dir>/request.json <job_dir>/result.json`.
  * Pure Python bounds validation for all parameters rejecting extra code-like keys, `owner`/`username`, NaN, inf, out-of-range dimensions, and invalid enums.
  * Scene lifecycle management (`_open_or_new`, `_save_blend_and_artifacts`) with default object cleanup for create ops and artifact generation (`preview.stl`, optional formats).
  * Direct binary STL exporter using struct packing enforcing exact $FileSize = 84 + (50 \times N)$ byte layout and normal/vertex packing.
  * 5 BMesh operations (`create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`) with mandatory `bm.free()` in `try...finally` blocks to guarantee zero memory leaks.
  * Structured error serialization producing `{ "ok": false, "error": "...", "step": "..." }`.
- [x] 3.2 Implement `BlenderStrategy` and engine discovery:
  * `agent/cadgpt_agent/strategies/blender.py`: CLI strategy invoking `<blender_path> --background --factory-startup --python <worker_script> -- <job_dir>/request.json <job_dir>/result.json` with 120s timeout and 4096-byte diagnostic stderr/stdout tail buffer.
  * `agent/cadgpt_agent/executor.py`: Registered `BlenderStrategy` under `'Blender'`, increased diagnostic tail buffer to 4096 bytes.
  * `agent/cadgpt_agent/discovery.py`: Exported `BLENDER_OPS` catalog (`create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`); multi-OS binary search across standard install paths on macOS (`/Applications/Blender.app/Contents/MacOS/Blender`), Windows (`C:\Program Files\Blender Foundation\Blender *\blender.exe`), and Linux (`/usr/bin/blender`, `/usr/local/bin/blender`, `/snap/bin/blender`); support for config override via `config.json` `blenderPath` and CLI `--blender-path`.
  * `agent/cadgpt_agent/main.py`: Added `--blender-path` flag to CLI and passed to discovery.
- [x] 3.3 Register 5 Blender MCP tools and add 'Blender' CAD store schema:
  * `apps/api/src/store.ts`: Added `'Blender'` to `cadSchema` `name` enum and SQLite `CHECK (cad_kind IN ('FreeCAD','AutoCAD','Blender'))` constraint; updated `createDocument` type definition.
  * `apps/api/src/tools.ts`: Exported `createBlenderMeshSchema`, `extrudeSubdivideMeshSchema`, `displaceSculptMeshSchema`, `booleanBlenderMeshSchema`, `exportBlenderSceneSchema`, and `blenderSchemas` with strict `.strict()` bounds and no `owner`/`username` leakage; updated `enqueueOp` to support `'Blender'`; registered all 5 Blender tools with write gates and confirmation checks.
- [x] 3.4 Add expert design guidance for modeling engine selection:
  * `apps/api/src/guidance.ts`: Added `cadgpt://guidance/modeling-engine-selection` guidance resource with architectural trade-offs between FreeCAD (parametric engineering/tolerances), AutoCAD (2D drafting/DWG precision), and Blender (organic, subdivision surface, high-poly mesh sculpting, glTF/FBX visualization) without hardcoded code/path hints.
  * Added `select_modeling_engine` MCP tool with strict Zod schema (`selectModelingEngineSchema`) and routing logic (`determineModelingEngine`) analyzing requirements, tolerances, target domains, and file formats.
- [x] 3.5 Author comprehensive unit and integration test suites:
  * `agent/tests/test_blender_worker.py`: 17 tests verifying bounds validators, CLI parsing, mock BPy/BMesh execution ensuring `bm.free()` is called in `finally` blocks, scene lifecycle, and `BlenderStrategy` command line construction.
  * `agent/tests/test_discovery.py`: 23 tests (added `BlenderDiscoveryTests`) verifying `BLENDER_OPS` catalog parity, multi-OS probe paths, and config overrides.
  * `apps/api/test/guidance.test.ts`: 4 new integration tests verifying engine selection routing for organic/sculpting (Blender), parametric/mating (FreeCAD), architectural/DWG (AutoCAD), and guidance URI discovery.
  * `apps/api/test/tools.test.ts`: Added schema validation and integration tests covering all 5 Blender MCP tools and write-scope permission enforcement.

### Files Created & Modified (WU3)
- `agent/cadgpt_agent/blender_worker.py`: Created headless Blender worker module with pure Python validators, scene lifecycle, binary STL exporter, 5 BMesh operations, and `bm.free()` lifecycle.
- `agent/cadgpt_agent/strategies/blender.py`: Created `BlenderStrategy` enforcing headless flags, 120s timeout, artifact resolution, and diagnostic capture.
- `agent/cadgpt_agent/executor.py`: Registered `BlenderStrategy` in `STRATEGIES`, expanded process tail buffer to 4096 bytes.
- `agent/cadgpt_agent/discovery.py`: Exported `BLENDER_OPS`, added multi-OS binary search paths, config override, and Blender capability advertising.
- `agent/cadgpt_agent/main.py`: Added `--blender-path` CLI option and wired to discovery.
- `apps/api/src/store.ts`: Added `'Blender'` to `cadSchema` enum and SQLite table check constraint.
- `apps/api/src/tools.ts`: Exported strict Blender schemas, updated `enqueueOp`, and registered 5 Blender MCP tools.
- `apps/api/src/guidance.ts`: Added `cadgpt://guidance/modeling-engine-selection` resource, `selectModelingEngineSchema`, and registered `select_modeling_engine` tool.
- `agent/tests/test_blender_worker.py`: Created test suite covering CLI parsing, validators, BMesh lifecycle (`bm.free()`), operations, and strategy execution.
- `agent/tests/test_discovery.py`: Added Blender discovery tests covering candidate paths, platform branches, and config overrides.
- `apps/api/test/guidance.test.ts`: Added integration tests for modeling engine guidance resource and selection tool.
- `apps/api/test/tools.test.ts`: Added Blender schema and MCP tool happy path / permission gate integration tests.
- `openspec/changes/cadengine-phase6-tray-gui-blender-workspace-integrity/tasks.md`: Marked tasks 3.1 to 3.5 completed `[x]`.

---

## Work Unit 4: Cross-Platform Onboarding GUI, Tray App & Bilingual i18n

### Completed Tasks
- [x] 4.1 Implement 4-step wizard in `agent/cadgpt_agent/gui.py` with blocking CAD gate, Blender PATH fallback, and pairing HUD:
  * Uses tkinter/ttk with modern clean styling (`OnboardingWizard` and decoupled `OnboardingController`).
  * Step 1: Language Selection & Welcome with live dynamic re-translation between English (`en`) and Spanish (`es`).
  * Step 2: Parametric CAD Prerequisite Verification Gate querying `discover()`; blocks progression if neither FreeCAD nor AutoCAD detected; displays OS-tailored guided install commands (winget, brew, apt) and official download links; provides "Re-check / Volver a comprobar" button that triggers immediate re-discovery and unblocks progression upon installation.
  * Step 3: Blender Tool Discovery & Configuration; auto-selects if found; if missing, presents file browser for custom executable, non-elevated user PATH / `config.json["blenderPath"]` registration, download link, or "Continue without Blender" opt-out.
  * Step 4: Server Pairing & Startup Enrollment; requests ephemeral 12-character pairing code via `POST /api/pairings`, displays code with one-click clipboard copy and web pairing page launcher, polls `/api/pairings/poll` for user dashboard approval, and persists credentials in OS keyring and `config.json["deviceId"]`.
- [x] 4.2 Implement `pystray` system tray daemon in `agent/cadgpt_agent/gui.py`:
  * Generates 3D isometric cube icon with distinctive facet shading via Pillow (`create_cube_icon_image` and `get_tray_icon_image`).
  * macOS Menu Bar Extra and Windows Taskbar Notification Area support.
  * Tray menu: Status header with version, View Pairing Code, View Connection Status HUD dialog (server URL, workstation hostname, device ID, active engines, heartbeat latency), Open Web Dashboard, Unpair Device... (with confirmation modal, API revocation, keyring purge, and state reset), Exit / Quit (graceful shutdown).
  * Main-thread GUI/tray event loop guarantee (`daemon.run()`) with daemon background polling worker.
- [x] 4.3 Implement bilingual internationalization:
  * In `agent/cadgpt_agent/i18n.py`: locale detection (Spanish variants `es_*` -> `'es'`, else `'en'`), translations dictionary with complete key symmetry covering wizard steps, modals, tray menu items, and HUD labels; persistence in `config.json["language"]`.
  * In `apps/web/src/app/core/i18n/`: `TranslationService` with Angular Signals (`currentLang` signal, `translate()` method, `t()`, `switchLanguage()`), persistent `localStorage`, `TranslatePipe`, and language switcher in shell header (`EN` / `ES`). Updated views (`home`, `pair`, `devices`, `designs`, `jobs`, `about`, and shell) with bilingual support.
- [x] 4.4 Dependencies and packaging:
  * Added `pystray>=0.19` and `Pillow>=10.0` to `agent/pyproject.toml` dependencies.
  * Updated `packaging/build.py` to validate `gui.py` and `i18n.py` packaging assets, collect `pystray` and `PIL` bundles, and bundle application icons.
- [x] 4.5 Comprehensive tests:
  * In `agent/tests/test_gui.py`: 27 unit tests covering i18n dictionary completeness and symmetry, locale detection, language persistence, parametric CAD gate blocking and re-check unblocking, Blender discovery and non-elevated user PATH configuration, server pairing code generation and polling, system tray status labels, connection check, unpair credential wipe, menu construction, and UI wizard step navigation with mocked Tkinter widgets.
  * In `apps/web/src/app/core/i18n/i18n.service.spec.ts`: 8 unit tests covering default language detection, localStorage persistence, dynamic language switching, key translation, parameter interpolation, and `TranslatePipe` transformation.

### Files Created & Modified (WU4)
- `agent/cadgpt_agent/i18n.py`: Created bilingual internationalization module with locale detection, dictionary lookup, interpolation, and config persistence.
- `agent/cadgpt_agent/gui.py`: Created module implementing `OnboardingController`, `OnboardingWizard` (Tkinter/TTK), `SystemTrayDaemon` (Pystray), 3D isometric cube icon generator (Pillow), and user PATH registration.
- `agent/cadgpt_agent/main.py`: Added `cmd_gui` handler and `cadengine gui` subcommand to top-level CLI.
- `agent/pyproject.toml`: Added `pystray>=0.19` and `Pillow>=10.0` dependencies.
- `packaging/build.py`: Updated asset validation for `gui.py` and `i18n.py`, added `--collect-all pystray` and `--collect-all PIL`, and bundled icon data.
- `apps/web/src/app/core/i18n/translations.ts`: Created translation dictionary for English and Spanish covering all shell navigation, consent disclosures, and page views.
- `apps/web/src/app/core/i18n/translation.service.ts`: Created reactive `TranslationService` using Angular Signals and localStorage persistence.
- `apps/web/src/app/core/i18n/translate.pipe.ts`: Created standalone `TranslatePipe`.
- `apps/web/src/app/core/i18n/index.ts`: Created barrel export index.
- `apps/web/src/app/core/i18n/i18n.service.spec.ts`: Created unit test suite for TranslationService and TranslatePipe.
- `apps/web/src/app/layout/shell/shell.ts`: Injected `TranslationService` and imported `TranslatePipe`.
- `apps/web/src/app/layout/shell/shell.html`: Added language switcher in header and localized navigation rail, footer, and consent dialog.
- `apps/web/src/app/layout/shell/shell.css`: Added styles for `.lang-switcher`, `.lang-btn`, and `.lang-divider`.
- `apps/web/src/app/layout/shell/shell.spec.ts`: Updated consent sheet assertions and added dynamic language switching integration test.
- `apps/web/src/app/pages/pair/` (`pair.ts`, `pair.html`): Localized pairing form and instructions.
- `apps/web/src/app/pages/home/` (`home.ts`, `home.html`): Localized hero and manifesto.
- `apps/web/src/app/pages/devices/` (`devices.ts`, `devices.html`): Localized titles, headers, status labels, and empty state.
- `apps/web/src/app/pages/designs/` (`designs.ts`, `designs.html`): Localized titles and empty state.
- `apps/web/src/app/pages/jobs/` (`jobs.ts`, `jobs.html`): Localized titles, loading, and empty state.
- `apps/web/src/app/pages/about/` (`about.ts`, `about.html`): Localized header and title.
- `agent/tests/test_gui.py`: Created test suite with 27 unit tests.
- `openspec/changes/cadengine-phase6-tray-gui-blender-workspace-integrity/tasks.md`: Marked tasks 4.1 to 4.5 completed `[x]`.

---

## Work Unit Evidence Table

| Work Unit | Test Command | Result | Pass/Fail | Evidence Summary |
|---|---|---|---|---|
| WU1 (Python Focused) | `python -m unittest agent.tests.test_integrity -v` | Ran 31 tests in 0.003s | PASS (31 passed, 0 failed) | Verified $84+50N$ formula, ASCII solid guard, NaN/-Inf/+Inf rejection, degenerate all-zero geometry rejection, coordinate bounds $[-100000, 100000]$ mm, DWG `AC10xx` signatures, FCStd ZIP with `Document.xml`, and Blend header regex. |
| WU1 (API Focused) | `npm test -w apps/api -- test/integrity.test.ts` | Ran 139 tests in 0.420s | PASS (139 passed, 0 failed) | Verified all STL coordinate and structural tests in Node.js, ZIP central directory parsing for `Document.xml`, DWG/Blend headers, and HTTP 500 serve gate on disk corruption. |
| WU1 (Python Full Discover) | `python -m unittest discover -s agent/tests -v` | Ran 274 tests in 0.186s | PASS (274 passed, 0 failed) | Verified all agent unit tests across executor, strategies, vision, upload, and integrity modules. |
| WU1 (Full Monorepo Test) | `npm test` | API: 139 passed; Web: 84 passed in 1.32s | PASS (223 passed, 0 failed) | Full test suite passed across all workspaces without regression. |
| WU1 (Prettier Format) | `npm run format:check` | All matched files use Prettier code style | PASS | Code formatting check clean across all files. |
| WU2 (Python Focused) | `python -m unittest agent.tests.test_workspace -v` | Ran 15 tests in 0.182s | PASS (15 passed, 0 failed) | Verified scaffolding 5 folders (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`), atomic `project.json` I/O, asset indexing with SHA-256 and STL facet/integrity checks, non-disruptive audit with zero disk mutation, corrupt manifest recovery, unconfirmed move rejection, path traversal rejection, and confirmed reorganization with mtime preservation. |
| WU2 (API Focused) | `npm test -w apps/api -- test/workspace.test.ts` | Ran 145 tests in 0.515s | PASS (145 passed, 0 failed) | Verified `audit_project_structure` and `reorganize_project_structure` strict Zod schemas, code-shaped input rejection, read-only audit MCP tool reporting non-disruptive plan, unconfirmed reorganize rejection (400), unauthorized path outside allowedRoots rejection (400), path traversal attempt rejection (400), and confirmed reorganization moving files, preserving mtime, updating manifest, and achieving `compliant: true`. |
| WU2 (Python Full Discover) | `python -m unittest discover -s agent/tests -v` | Ran 289 tests in 0.357s | PASS (289 passed, 0 failed) | Full agent test suite passing with 0 failures across all 289 unit tests. |
| WU2 (Full Monorepo Test) | `npm test` | API: 145 passed; Web: 84 passed in 1.09s | PASS (229 passed, 0 failed) | Full test suite passing across all monorepo workspaces without regression. |
| WU2 (Prettier Format) | `npm run format:check` | All matched files use Prettier code style | PASS | Prettier formatting check clean across all workspace files. |
| WU3 (Python Focused) | `uv run python -m unittest agent.tests.test_blender_worker agent.tests.test_discovery -v` | Ran 40 tests in 0.052s | PASS (40 passed, 0 failed) | Verified Blender CLI invocation, argument validation, BPy/BMesh lifecycle with explicit `bm.free()`, 5 core mesh operations, scene export formats, and multi-OS binary discovery. |
| WU3 (API Focused) | `npm test -w apps/api -- test/guidance.test.ts test/tools.test.ts` | Ran 156 tests in 0.448s | PASS (156 passed, 0 failed) | Verified modeling engine selection guidance and routing tool, 5 Blender MCP tool schemas and enqueue wiring, 'Blender' document store persistence, and write permissions. |
| WU3 (Python Full Discover) | `uv run python -m unittest discover -s agent/tests -v` | Ran 313 tests in 0.359s | PASS (313 passed, 0 failed) | Full agent test suite passing with 0 failures across all 313 unit tests. |
| WU3 (Full Monorepo Test) | `npm test` | API: 156 passed; Web: 84 passed in 1.43s | PASS (240 passed, 0 failed) | Full test suite passing across all monorepo workspaces without regression. |
| WU3 (Prettier Format) | `npm run format:check` | All matched files use Prettier code style | PASS | Prettier formatting check clean across all workspace files. |
| WU4 (Python Focused) | `uv run python -m unittest agent.tests.test_gui -v` | Ran 27 tests in 0.017s | PASS (27 passed, 0 failed) | Verified i18n dictionary completeness/symmetry, locale detection, language persistence, parametric CAD gate blocking and re-check unblocking, Blender discovery and user PATH config, server pairing code generation and polling, tray status labels, connection latency check, unpair credential wipe, menu construction, and wizard step navigation. |
| WU4 (Web Focused) | `npm test -w apps/web -- --watch=false` | Ran 93 tests in 1.10s | PASS (93 passed, 0 failed) | Verified TranslationService default detection, localStorage persistence, dynamic language switching, key lookup with fallback and interpolation, TranslatePipe transforms, shell header switcher, and localized view rendering across home, pair, devices, designs, jobs, and about pages. |
| WU4 (Python Full Discover) | `uv run python -m unittest discover -s agent/tests -v` | Ran 340 tests in 0.442s | PASS (340 passed, 0 failed) | Full agent test suite passing with 0 failures across all 340 unit tests. |
| WU4 (Full Monorepo Test) | `npm test` | API: 156 passed; Web: 93 passed in 1.17s | PASS (249 passed, 0 failed) | Full test suite passing across all monorepo workspaces without regression. |
| WU4 (Prettier Format) | `npm run format:check` | All matched files use Prettier code style | PASS | Code formatting check clean across all workspace files. |

