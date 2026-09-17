# Proposal: CAD Engine Phase 6 — Tray GUI, Blender, Governance & Integrity

## Intent
Deliver zero-bloat system tray and onboarding wizard with hard CAD gating, headless Blender organic modeling via MCP, workspace governance, and deep file integrity validation.

## Scope

### In Scope
- **GUI & Tray**: `pystray` + Tkinter (<2MB); 4-step wizard (EN/ES); CAD gate blocking without FreeCAD/AutoCAD; Blender PATH fallback; tray HUD, pairing code, unpair; web i18n.
- **Blender (MCP)**: Headless worker; external AI invariant; 5 tools (`create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`); guidance tool.
- **Workspace Governance**: Standard 5 folders (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`); `project.json` manifest; audit and confirmed reorganize tools.
- **File Integrity**: Binary STL validator ($84 + 50 \times N$, finite floats); DWG/FCStd/Blend magic checks; upload/serve gates.

### Out of Scope
- Embedded LLMs in MCP/agent.
- Qt/PySide runtimes.
- Unconfirmed file moves.
- Admin UAC prompts.

## Capabilities

### New Capabilities
- `gui-onboarding-system-tray`: 4-step wizard, blocking CAD gate, Blender PATH fallback, tray HUD, bilingual i18n.
- `blender-execution-engine`: Headless worker, 5 modeling tools, multi-format scene export.
- `workspace-directory-governance`: Standard 5 folders, `project.json`, confirmed reorganization.
- `file-integrity-anti-corruption`: Binary STL validator, CAD magic checks, upload/serve gates.

### Modified Capabilities
- `openspec/specs/mcp-cad-operations`: 5 Blender tools, project governance tools, engine router.
- `openspec/specs/cad-discovery`: Detect Blender binaries; add 'Blender' to API store.
- `openspec/specs/expert-design-guidance`: Add `cadgpt://guidance/modeling-engine-selection`.

## Affected Areas
- `agent/`: GUI (wizard/tray), i18n, discovery, Blender worker, workspace, integrity.
- `apps/api/`: Store schema, Blender & governance tools, guidance, validation gates.
- `apps/web/`: i18n service, language switcher, bilingual views.
- `packaging/`: Dependencies (`pystray`, `Pillow`), PyInstaller, WiX MSI.

## Risks & Mitigations
- **macOS UI thread crash**: Run UI loop on main thread; background pollers on worker threads.
- **Windows PATH fail**: Set HKCU PATH first; fallback to `config.json["blenderPath"]`.
- **Large STL lag**: Stream 64KB chunks; validate coordinates sequentially.
- **Accidental file moving**: Non-destructive audit; require `confirmed: true` before execution.

## Rollback Plan
- **GUI/Tray**: Revert to CLI loop; remove `pystray`/`Pillow`.
- **Blender**: Remove Blender from discovery/schema; unregister tools.
- **Governance**: Retain flat document dirs without 5 folders.
- **Integrity**: Revert to legacy STL checks in `mesh.ts`.

## Success Criteria
- [ ] Wizard blocks advance if neither FreeCAD nor AutoCAD detected.
- [ ] Tray runs with 3D cube icon, status HUD, pairing code, unpair.
- [ ] GUI and web client support full EN/ES switching.
- [ ] Blender worker executes 5 tools and exports STL/glTF.
- [ ] Guidance routes CAD vs Blender prompts accurately.
- [ ] Projects follow 5-folder layout with valid `project.json`.
- [ ] Corrupt STLs and invalid headers rejected.
- [ ] `npm test` and agent unit tests pass.
