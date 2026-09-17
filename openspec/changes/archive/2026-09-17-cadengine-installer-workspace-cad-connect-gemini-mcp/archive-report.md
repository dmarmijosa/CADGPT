# Archive Report — CAD Engine Installer Workspace, CAD Prerequisite Gate & Connect Overhaul

**Date**: 2026-09-17 | **Change**: `cadengine-installer-workspace-cad-connect-gemini-mcp` | **Status**: ARCHIVED AND CLOSED | **Mode**: openspec | **Target Release**: `v0.2.0-alpha.1`

---

## 1. Executive Summary

The change `cadengine-installer-workspace-cad-connect-gemini-mcp` has satisfied all technical design specifications, completed all 20 tasks across 4 work units, passed all verification suites with zero blockers and zero critical findings, and is hereby archived for **CAD Engine `v0.2.0-alpha.1`**.

Key capabilities shipped and canonicalized:
1. **Windows Installer Workspace Preservation & CAD Prerequisite Winget Prompt**:
   - Inno Setup script (`packaging/windows.iss`) declares `{localappdata}\CADGPT` and `{localappdata}\CADGPT\jobs` with `Flags: uninsneveruninstall`, guaranteeing that user CAD projects survive uninstallation and upgrade.
   - `UpdateReadyMemo` explicitly separates application binaries (`{autopf}\CAD Engine`) from local user designs (`{localappdata}\CADGPT\jobs`).
   - `CurStepChanged(ssPostInstall)` verifies CAD installation (`IsFreeCADInstalled`, `IsAutoCADInstalled`) and prompts to auto-install FreeCAD via `winget` or redirects to the official download portal.
2. **Multi-OS Parametric CAD Prerequisite Gate & Step 3 Blender UX**:
   - Step 2 enforces a hard blocking gate across Windows, Linux, and macOS when neither FreeCAD nor AutoCAD is detected, displaying OS-specific install commands (`winget`, `brew`, `apt`) and an instant "Re-check" button.
   - Step 3 adds guided Blender installation assistance ("Install Blender" button, platform install commands, custom path browse, and Re-check).
   - Step 4 and the system tray connection status HUD (`on_view_status_hud`) display the active local workspace working directory path.
3. **Web Connect Page Overhaul (`/connect`)**:
   - Added a prominent API Key Setup Guide panel linking to `/api-keys` with `cad:read`/`cad:write` scope descriptions and copyable Bearer authorization snippet.
   - Added Google Gemini integration guide with copyable Python GenAI SDK (`google-genai`) script.
   - Added Generic MCP Client section with universal `mcpServers` JSON configuration snippet and a client config path matrix table for Cursor, Windsurf, Claude Desktop, and Antigravity.
   - Strict compile-time key parity between English and Spanish via derived `TranslationKey` types, and runtime Zod validation for route inputs.
4. **Principal Installers Standardization**:
   - Release workflow (`.github/workflows/release.yml`) and build script (`packaging/build.py`) verified to produce strictly the 4 principal installers (`.exe`, 2x `.dmg`, `.tar.gz`) plus `SHA256SUMS.txt`.

---

## 2. Deliverables Summary

| Work Unit | Scope | Deliverables & Implementation Highlights |
|---|---|---|
| **WU1: Connect Page Overhaul (/connect)** | Web Frontend (`connect.html`, `connect.ts`, `translations.ts`, `styles.css`) | - Added prominent API Key Setup Guide panel with internal router link to `/api-keys`.<br>- Added Google Gemini guide section with copyable Python GenAI SDK script.<br>- Added Generic MCP Client section with `mcpServers` JSON and client config path matrix table.<br>- Added 24 new i18n keys with 100% symmetric EN/ES parity.<br>- Added unit tests in `connect.spec.ts` with Zod route parameter validation. |
| **WU2: Multi-OS CAD Prerequisite Gate & Step 3 Blender Installation UX** | Desktop Agent GUI & i18n (`gui.py`, `i18n.py`, `test_gui.py`) | - Enforced non-bypassable CAD gate in Step 2 with OS-specific install commands and `_on_recheck_cad()`.<br>- Enhanced Step 3 when Blender is missing with "Install Blender" button, OS commands, custom browse, and `_on_recheck_blender()`.<br>- Exposed local workspace directory (`jobs`) in Step 4 card and tray status HUD dialog.<br>- Added new i18n keys and unit tests in `test_gui.py`. |
| **WU3: Windows Inno Setup Workspace Preservation & FreeCAD Prerequisite Winget Prompt** | Windows Installer Packaging (`packaging/windows.iss`) | - Declared `{localappdata}\CADGPT\jobs` in `[Dirs]` with `Flags: uninsneveruninstall`.<br>- Customized `UpdateReadyMemo` separating binaries from workspace directory.<br>- Implemented Pascal detection `IsFreeCADInstalled` and `IsAutoCADInstalled`.<br>- Added post-install FreeCAD automated `winget` installation prompt in `CurStepChanged(ssPostInstall)`. |
| **WU4: Principal Installers Standardization & Verification** | CI/CD, Packaging & Test Automation | - Verified `.github/workflows/release.yml` and `packaging/build.py` standardizing on 4 principal packages.<br>- Confirmed absence of redundant legacy archives (`CADGPT-*`).<br>- Verified complete monorepo test suites: 156 API + 111 Web + 359 Agent tests passing with 0 failures.<br>- Validated dry-run packaging and CLI `--help` entry points. |

---

## 3. Verification & Test Metrics

- **Verdict**: **PASS**
- **Requirements Verified**: 11/11 Compliant (100%)
- **Scenarios Verified**: 33/33 Compliant (100%)
- **Tasks Completed**: 20/20 Complete (`[x]`)
- **Blockers**: 0
- **Critical Findings**: 0

### Test Execution Summary
- **Python Agent Unit Tests**: 359 passed, 0 failed, 0 errors (0.83s)
- **API Backend Tests**: 156 passed, 0 failed (0.69s)
- **Web Frontend Tests**: 111 passed across 18 test files, 0 failed (1.81s)
- **Total Automated Tests**: 626 passed, 0 failed
- **Packaging Dry-Run**: `python packaging/build.py --dry-run` passed cleanly (exit code 0)
- **Production Compilation**: `npm run build` compiled API and Web bundles cleanly

---

## 4. Canonical Specification Promotions

1. [`openspec/specs/gui-onboarding-system-tray/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/gui-onboarding-system-tray/spec.md): Updated to include Step 2 CAD gate, Step 3 Blender UX, Step 4 workspace card, and Status HUD workspace line.
2. [`openspec/specs/installer-packaging-distribution/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/installer-packaging-distribution/spec.md): Promoted new domain specification governing Inno Setup workspace preservation, winget prerequisite prompt, and 4 principal installers standardization.
3. [`openspec/specs/web-connect-onboarding-integrations/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/web-connect-onboarding-integrations/spec.md): Promoted new domain specification governing Connect page API key guide, Gemini script, Generic MCP client matrix, and bilingual translation parity.

---

## 5. Archive Folder

The active change directory has been moved to:
`openspec/changes/archive/2026-09-17-cadengine-installer-workspace-cad-connect-gemini-mcp/`
