# Proposal: CAD Engine Installer Workspace, CAD Prerequisite Gate & Connect Overhaul

## Intent
Provide user CAD workspace transparency (`jobs`) across the Windows installer and desktop GUI HUD, enforce a mandatory CAD prerequisite gate with automated winget FreeCAD installation, overhaul the web Connect page (`/connect`) with Google Gemini, Generic MCP, and API Key guides under 100% bilingual parity, and standardize releases on the 4 principal installers.

## Scope

### In Scope
- **Workspace Transparency**: Declare `{localappdata}\CADGPT\jobs` in Inno Setup (`uninsneveruninstall`) and `UpdateReadyMemo`; display workspace paths across Linux, Windows, and macOS in Wizard and Tray Status HUD.
- **Multi-OS CAD Prerequisite Gate**: Clarify FreeCAD/Blender are unbundled; enforce non-bypassable CAD prerequisite blocking across all platforms (Windows, Linux, macOS) with guided installation commands (`winget`, `brew`, `apt`); add Pascal Script CAD detection in Inno Setup prompting automated `winget` installation or download.
- **Blender Installation & Discovery UX**: Add explicit "Instalar Blender" / "Install Blender" action button in Step 3, OS-specific install commands with copy action, and an instant "Re-check / Volver a comprobar" button.
- **Connect Page Overhaul**: Add guides for Google Gemini (Function Calling/Python SDK) and Generic MCP clients (Cursor, Windsurf, Claude Desktop, Antigravity) with JSON snippets; add API Key instructions with full English and Spanish parity.
- **Principal Installers Pipeline**: Standardize CI/CD on the 4 principal installers (Windows EXE, macOS ARM64/Intel DMGs, Linux tar.gz) and align documentation.

### Out of Scope
- Bundling FreeCAD or Blender binaries directly into installers.
- Modifications to CAD kernel execution workers.
- Alterations to Keycloak auth themes or database schemas.

## Capabilities

### New Capabilities
- `installer-packaging-distribution`: Inno Setup workspace declaration with `uninsneveruninstall`, FreeCAD prerequisite inspection with winget prompt, and 4 principal installers CI/CD standardization.
- `web-connect-onboarding-integrations`: Dedicated `/connect` integration guides for Google Gemini, Generic MCP clients, and API Key management with full EN/ES parity.

### Modified Capabilities
- `gui-onboarding-system-tray`: Active workspace directory display in Wizard and Status HUD; multi-OS CAD prerequisite enforcement; Step 3 "Instalar Blender" action button with guided install commands and instant re-check.

## Affected Areas
- `packaging/windows.iss`, `packaging/build.py`, `.github/workflows/release.yml`, `README.md`
- `agent/cadgpt_agent/gui.py`, `agent/cadgpt_agent/i18n.py`, `agent/tests/test_gui.py`
- `apps/web/src/app/pages/connect/` (`connect.html`, `connect.ts`, `connect.spec.ts`)
- `apps/web/src/app/core/i18n/translations.ts`

## Rollback Plan
- Revert Inno Setup Pascal scripts and directory declarations in `packaging/windows.iss`.
- Revert GUI HUD and wizard additions in `agent/cadgpt_agent/gui.py`.
- Revert frontend additions in `apps/web` to restore previous connector layout.
- User CAD drawings in `%LOCALAPPDATA%\CADGPT\jobs` remain untouched.

## Success Criteria
- [ ] Inno Setup declares `{localappdata}\CADGPT\jobs` (`uninsneveruninstall`) and displays workspace in `UpdateReadyMemo`.
- [ ] Inno Setup detects missing CAD kernels and prompts for automated FreeCAD installation via `winget`.
- [ ] Multi-OS CAD prerequisite gate strictly blocks progression in Wizard Step 2 across Windows, Linux, and macOS until FreeCAD or AutoCAD is detected.
- [ ] Wizard Step 3 provides "Instalar Blender" button, OS-specific install commands, and instant Re-check button.
- [ ] Status HUD and Wizard display the active local workspace directory.
- [ ] Connect page provides Gemini, Generic MCP, and API Key setup guides with copyable snippets.
- [ ] Connect page text achieves 100% English and Spanish translation parity.
- [ ] Release workflow outputs strictly the 4 principal installers plus `SHA256SUMS.txt`.
- [ ] All web, agent, and packaging unit tests pass.

