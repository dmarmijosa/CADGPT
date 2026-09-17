# Tasks: Phase 6 — Tray GUI, Blender, Governance & Integrity

Source specs: `file-integrity-anti-corruption`, `workspace-directory-governance`, `blender-execution-engine`, `gui-onboarding-system-tray`, `mcp-cad-operations`, `cad-discovery`, `expert-design-guidance` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-phase6-tray-gui-blender-workspace-integrity/specs) (read-only).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~1,850 lines |
| Review budget | 400 lines/PR |
| 400-line budget risk | High |
| Chained PRs recommended | Yes — 4 branches |
| Chain strategy | stacked-to-main |
| Delivery strategy | auto-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

## Work Units Summary

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| WU1 | Integrity & Magic Gates | `python -m unittest agent.tests.test_integrity` | Python & Node.js | Revert integrity files |
| WU2 | Workspace Governance | `python -m unittest agent.tests.test_workspace` | Python & Node.js | Revert workspace files |
| WU3 | Headless Blender & Tools | `python -m unittest agent.tests.test_blender_worker` | Blender & Node.js | Revert blender files |
| WU4 | GUI Wizard, Tray & i18n | `python -m unittest agent.tests.test_gui` | Tkinter & Angular | Revert GUI, i18n |

---

## Work Unit 1: Deep File Integrity & Magic Byte Validation Gates

- [x] 1.1 Implement binary STL validator in [`agent/cadgpt_agent/integrity.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/integrity.py) and [`apps/api/src/integrity.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/integrity.ts) enforcing $84 + (50 \times N)$ size, ASCII guard, and finite non-zero floats.
- [x] 1.2 Implement magic byte checks in `integrity.py` and `integrity.ts` for DWG (`AC10xx`), FCStd (`PK\x03\x04`+`Document.xml`), and Blend (`BLENDER`).
- [x] 1.3 Add pre-upload and serve gates in [`agent/cadgpt_agent/upload.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/upload.py), [`apps/api/src/mesh.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/mesh.ts), and [`apps/api/src/main.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts).
- [x] 1.4 Author RED tests and passing suites in [`agent/tests/test_integrity.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_integrity.py) and [`apps/api/test/integrity.test.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/integrity.test.ts).

## Work Unit 2: Workspace Directory Governance

- [x] 2.1 Scaffold 5 folders (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`) and atomic `project.json` in [`agent/cadgpt_agent/workspace.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/workspace.py).
- [x] 2.2 Implement read-only `audit_project_structure` tool in [`apps/api/src/tools.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts) returning non-disruptive reorganization plans.
- [x] 2.3 Implement `reorganize_project_structure` tool in [`apps/api/src/tools.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts) with `confirmed: true` gate and path containment.
- [x] 2.4 Add workspace unit and integration tests in [`agent/tests/test_workspace.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_workspace.py) and [`apps/api/test/workspace.test.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/workspace.test.ts).

## Work Unit 3: Headless Blender Engine & Precision Modeling Tools

- [x] 3.1 Create headless worker [`agent/cadgpt_agent/blender_worker.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/blender_worker.py) with 120s timeout, `bm.free()`, and 5 BMesh operations.
- [x] 3.2 Create [`agent/cadgpt_agent/strategies/blender.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/strategies/blender.py) and export `BLENDER_OPS` in [`agent/cadgpt_agent/discovery.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py).
- [x] 3.3 Register 5 Blender MCP tools and add 'Blender' to CAD store schema in [`apps/api/src/store.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/store.ts) and [`apps/api/src/tools.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts).
- [x] 3.4 Add `cadgpt://guidance/modeling-engine-selection` and `select_modeling_engine` tool in [`apps/api/src/guidance.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/guidance.ts).
- [x] 3.5 Add tests in [`agent/tests/test_blender_worker.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_blender_worker.py), [`agent/tests/test_discovery.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_discovery.py), and [`apps/api/test/guidance.test.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/guidance.test.ts).

## Work Unit 4: Cross-Platform Onboarding GUI, Tray App & Bilingual i18n

- [x] 4.1 Implement 4-step wizard in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) with blocking CAD gate, Blender PATH fallback, and pairing HUD.
- [x] 4.2 Implement `pystray` system tray daemon in `gui.py` with 3D cube icon, status HUD, unpair action, and main-thread loop.
- [x] 4.3 Implement bilingual i18n in [`agent/cadgpt_agent/i18n.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/i18n.py) and Angular `TranslationService` (Signals) in [`apps/web/src/app/core/i18n/`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/).
- [x] 4.4 Add dependencies in [`agent/pyproject.toml`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml) (`pystray`, `Pillow`) and bundle assets in [`packaging/build.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py).
- [x] 4.5 Add GUI tests in [`agent/tests/test_gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_gui.py) and web i18n tests in [`apps/web/src/app/core/i18n/i18n.service.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/i18n.service.spec.ts).
