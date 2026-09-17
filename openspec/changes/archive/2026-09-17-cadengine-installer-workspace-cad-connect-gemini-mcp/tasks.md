# Tasks: CAD Engine Installer Workspace, CAD Prerequisite Gate & Connect Overhaul

Source specs: `gui-onboarding-system-tray`, `installer-packaging-distribution`, `web-connect-onboarding-integrations` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-installer-workspace-cad-connect-gemini-mcp/specs) (read-only). References: [proposal.md](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-installer-workspace-cad-connect-gemini-mcp/proposal.md), [design.md](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-installer-workspace-cad-connect-gemini-mcp/design.md).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~780 lines across 4 work units |
| Review budget | 400 lines per PR slice |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes — 4 sequenced feature branches |
| Chain strategy | feature-branch-chain |
| Delivery strategy | auto-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium
```

## Work Units Summary

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| WU1 | Connect Page Overhaul (/connect) | `feat/connect-gemini-mcp-apikey` | `npm test -w apps/web -- --include connect.spec.ts` | Angular DOM, Vitest | Revert `connect.html`, `connect.ts`, `connect.spec.ts`, `translations.ts` |
| WU2 | Multi-OS CAD Prerequisite Gate & Step 3 Blender Installation UX | `feat/cad-gate-blender-workspace-ux` | `python -m unittest agent.tests.test_gui -v` | Tkinter, Discovery, i18n | Revert `gui.py`, `i18n.py`, `test_gui.py` |
| WU3 | Windows Inno Setup Workspace Preservation & FreeCAD Prerequisite Winget Prompt | `feat/inno-workspace-winget-prompt` | `python packaging/build.py --dry-run` | Inno Setup Pascal Script | Revert `packaging/windows.iss` |
| WU4 | Principal Installers Standardization & Verification | `test/principal-installers-e2e` | `npm test && python -m unittest discover -s agent/tests -v` | Polyglot (Node.js 24 + Python 3.13) | Release workflows, packaging configs |

---

## Work Unit 1: Connect Page Overhaul (/connect)

- [x] 1.1 Add prominent API Key Setup Guide panel at the top of [`apps/web/src/app/pages/connect/connect.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) with internal router link to `/api-keys`, explicit scope guidance (`cad:read` and `cad:write`), and interactive copyable Bearer authorization header snippet (`Authorization: Bearer <your_api_key>`).
- [x] 1.2 Add Google Gemini integration guide section to [`connect.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) with a copyable Python GenAI SDK (`google-genai`) script targeting the `/mcp` endpoint with function calling declarations and `CADENGINE_API_KEY` Bearer authentication.
- [x] 1.3 Add Generic MCP Client integration guide section to [`connect.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) with universal `mcpServers` JSON configuration snippet and a client configuration path matrix table for Cursor (`.cursor/mcp.json`), Windsurf (`~/.codeium/windsurf/mcp_config.json`), Claude Desktop (`claude_desktop_config.json`), and Antigravity (`~/.gemini/antigravity-cli/mcp/`).
- [x] 1.4 Implement `geminiPythonSnippet` and `genericMcpSnippet` computed signals and snippet copy handlers in [`apps/web/src/app/pages/connect/connect.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.ts).
- [x] 1.5 Expand [`apps/web/src/app/core/i18n/translations.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts) adding all `connect.api_key_*`, `connect.gemini_*`, and `connect.generic_mcp_*` dictionary keys with 100% symmetric key parity across English (`en`) and Spanish (`es`).
- [x] 1.6 Update unit tests in [`apps/web/src/app/pages/connect/connect.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.spec.ts) validating API key panel rendering, router link, Gemini snippet generation, generic MCP path matrix table, and bilingual language switching.
- [x] 1.7 Verify frontend test suite passes via `npm test -w apps/web`.

## Work Unit 2: Multi-OS CAD Prerequisite Gate & Step 3 Blender Installation UX

- [x] 2.1 Enforce the non-bypassable CAD prerequisite gate in Step 2 of [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) blocking advancement across Windows, Linux, and macOS when neither FreeCAD nor AutoCAD is detected; display OS-specific guided install commands (`winget`, `brew`, `apt`) with copy actions and instant Re-check button (`_on_recheck_cad`).
- [x] 2.2 Enhance Step 3 in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) when Blender is not detected by adding a prominent "Instalar Blender" / "Install Blender" button opening the official download URL, displaying copyable platform installation commands (`winget install BlenderFoundation.Blender`, `brew install --cask blender`, `sudo apt install blender`), providing custom path browse action, and adding an instant Re-check button (`_on_recheck_blender`).
- [x] 2.3 Add workspace working directory transparency in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py): render active local workspace path (`.../CADGPT/jobs`) in a dedicated card in Step 4, and expose the workspace path in the system tray Status HUD dialog (`on_view_status_hud`).
- [x] 2.4 Add bilingual translation dictionary entries to [`agent/cadgpt_agent/i18n.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/i18n.py) in English and Spanish for `hud_workspace_dir`, `step4_workspace_label`, `step4_workspace_hint`, `step3_install_cmd_label`, and `step3_install_blender`.
- [x] 2.5 Author unit tests in [`agent/tests/test_gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_gui.py) asserting Step 2 CAD gate blocking and re-check, Step 3 guided Blender actions, Step 4 workspace card rendering, and status HUD workspace directory formatting.
- [x] 2.6 Verify desktop agent test suite passes via `python -m unittest discover -s agent/tests -v`.

## Work Unit 3: Windows Inno Setup Workspace Preservation & FreeCAD Prerequisite Winget Prompt

- [x] 3.1 Declare `{localappdata}\CADGPT` and `{localappdata}\CADGPT\jobs` in the `[Dirs]` section of [`packaging/windows.iss`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) with `Flags: uninsneveruninstall` ensuring user CAD projects survive uninstallation.
- [x] 3.2 Implement `UpdateReadyMemo` in Pascal script (`[Code]`) of [`packaging/windows.iss`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) explicitly separating the application binaries directory (`{autopf}\CAD Engine`) from the local workspace directory (`{localappdata}\CADGPT\jobs`) and confirming local design storage.
- [x] 3.3 Implement Pascal functions `IsAutoCADInstalled` and `IsFreeCADInstalled` in [`packaging/windows.iss`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) inspecting registry keys and common filesystem paths.
- [x] 3.4 Implement `CurStepChanged(ssPostInstall)` in [`packaging/windows.iss`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) prompting the user when neither CAD kernel is found to install FreeCAD automatically via `winget.exe install FreeCAD.FreeCAD` (on "Yes") or redirect to the FreeCAD download portal (on "No").
- [x] 3.5 Test packaging configuration and asset verification with dry-run via `python packaging/build.py --dry-run`.

## Work Unit 4: Principal Installers Standardization & Verification

- [x] 4.1 Verify and configure [`.github/workflows/release.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml), [`packaging/build.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py), and [`README.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/README.md) to standardize strictly on the 4 principal installers (`CADEngine-Setup-windows-x64.exe`, `CADEngine-macos-arm64.dmg`, `CADEngine-macos-x64.dmg`, `cadengine-linux-x64.tar.gz`) plus `SHA256SUMS.txt`.
- [x] 4.2 Verify absence of redundant legacy archives (`CADGPT-*`) and obsolete release build targets in packaging scripts and workflows.
- [x] 4.3 Execute complete monorepo test suites via `npm test` verifying all web, api, and i18n tests pass without regressions.
- [x] 4.4 Execute complete agent unit test suite via `python -m unittest discover -s agent/tests -v` verifying all agent and GUI test cases pass.
- [x] 4.5 Perform manual dry-run validation of packaging build commands and CLI help entry points.
