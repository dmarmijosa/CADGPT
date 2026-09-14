# Verify Report — cadgpt-phase2-cad-assistant

**Date**: 2026-09-14 | **Change**: cadgpt-phase2-cad-assistant | **Mode**: full artifacts | **Repo**: main @ 7e9db32 (all 20 slices merged, deployed, healthy)

## Task Completeness

114/115 itemized tasks `[x]`. Remaining `[ ]` / partial, all documented deferrals:

- **4b.7** — optional `label` param on `create_*` tools: deferred follow-up.
- **13b.6** — AutoCAD modify/read ops: deferred, needs a non-vlax scene readback (recorded in `docs/autocad-stl-spike.md` and re-scope note above slice 13b in `tasks.md`).
- **14.4** — N/A: the 14.0 spike passed, so the fail-branch does not apply.
- **2c.5 (partial)** — `.env.example` optional-var comment lines did not land in main (sandbox dotenv-write guard blocked the edit); `docs/deployment.md` Configuration section is present with full variable documentation. Required variable names in `.env.example` are already correct and unchanged.

None of these are silent drops — every one is recorded in `tasks.md`/`apply-progress.md`/`state.yaml` with an explicit reason, and no spec requirement depends on them.

## Test / Build Evidence (re-run on `main`, 2026-09-14)

| Command | Result |
|---|---|
| `npm test -w api` | `tests 55`, `pass 55`, `fail 0` |
| `npm test -w web -- --watch=false` | `Test Files 14 passed (14)`, `Tests 42 passed (42)` |
| agent (prepared venv) `python -m unittest discover -s agent/tests -v` | `Ran 80 tests` / `OK` |
| `npm run build` | api `tsc` OK; Angular build OK (`three-scene` lazy chunk 567.88 kB, separate from `main`) |
| `npm run format:check` | `All matched files use Prettier code style!` |

## Capability Compliance Matrix (11 capabilities, 30 requirements, 38 scenarios)

| Capability | Verdict | Evidence |
|---|---|---|
| document-registry | PASS | `apps/api/src/store.ts` documents table (owner/created/updated), `createDocument`/`getDocument`/`listDocuments`; `documents.test.ts` covers cross-owner denial, owner-scoped listing, D17 lock |
| mcp-cad-operations | PASS | `apps/api/src/tools.ts` — 15 `.strict()` Zod objects, no owner/username field (test-asserted); agent re-validates via `freecad_worker.py` `OPS` dict ⊇ `ops-allowlist.json` |
| mesh-preview-upload | PASS | `apps/api/src/mesh.ts` — device-credential auth, 25 MiB cap, per-device quota, streaming sha256 verify, job-bound naming, owner-scoped GET with `Cache-Control: private, no-store` |
| mesh-viewer | PASS | `stl-viewer.ts`/`three-scene.ts` with `afterNextRender` + dynamic import SSR guard; pending-state test; `STLLoader` from `three/addons/loaders` |
| dashboard-routing | PASS | `app.routes.ts` lazy routes; functional `auth.guard.ts` redirects before render |
| mcp-client-onboarding | PASS | `pages/connect/*` distinct Claude/ChatGPT panels (7/7 tests), triggered post-pairing via `main.py::open_connect_step` |
| expert-design-guidance | PASS | `McpServer({instructions})` + 3 `cadgpt://guidance/*` resources + 2 prompts; test asserts no code/script/path examples |
| autocad-execution-adapter | PASS | Fixed 6-token argv, `shell=False`; DWG-required postcondition; STLOUT-only STL export (live-spike-proven on AutoCAD 2026, 684-byte binary); no EXPORT/3DPRINT anywhere |
| job-lifecycle | PASS | `type`/`document_id` columns; capability-based compatibility check generalized (13b.3); 5-active-job cap unchanged |
| freecad-execution | PASS | `freecad_worker.py` 11-op `OPS` dispatch; reopen→mutate→recompute→save; STL export after every op via `MeshPart.meshFromShape` |
| cad-discovery | PASS | `accoreconsole.exe` registry+glob detection, full-vs-LT via ProductID, `capabilities` object; never executes an untrusted binary to probe |

No CRITICAL issues. Every spec scenario maps to a passing test in the suites above.

## Security Invariants Confirmed

- No arbitrary code/script/path params in MCP schemas: 15 `.strict()` ZodObjects in `tools.ts`.
- Agent re-validates op allowlist independently of the API.
- `shell=False`, fixed argv (`executor.py:111`); golden-argv tests for both strategies.
- Owner from OIDC `sub` (`apps/api/src/auth.ts:22`), never a tool parameter.
- Mesh upload: device-auth, size cap, per-device quota, owner-scoped download.
- AutoCAD `.scr`: numbers via `repr(float(value))` + fixed tokens only; `cadgpt.lsp` has no `vlax-*`/`vla-*`.
- STL/DWG paths derived from validated UUIDs (`resolve_document_dir`: UUID round-trip + `resolve().is_relative_to(root)`).

## WARNINGS (non-blocking)

1. `.env.example` optional-var comments (2c.5) blocked by sandbox write-protection; content is documented in `docs/deployment.md` instead.
2. Several slices exceeded the original 400-line budget and used a user-accepted `size:exception` (2b, 3a, 4b, 7, 9, 10) — a recorded process tradeoff, not a quality defect.

## SUGGESTIONS

1. Track 4b.7 and 13b.6 as phase-3 follow-up items rather than leaving them open indefinitely in this change.
2. Apply the deferred `.env.example` lines outside the sandbox to fully close 2c.5.

## Final Verdict: PASS

All 11 capabilities PASS. Recommendation: proceed to `sdd-archive`.
