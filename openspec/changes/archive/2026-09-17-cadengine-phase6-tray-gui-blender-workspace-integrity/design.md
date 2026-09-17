# Technical Design: Phase 6 Tray GUI, Blender, Governance & Integrity

## 1. Context & Invariants
Phase 6 delivers a system tray, 4-step wizard, headless Blender MCP worker, 5-folder project governance, and deep integrity gates.
- **External AI**: AI models are external clients; MCP server and agent never embed LLM weights.
- **Main-Thread UI**: GUI runs on main OS thread; polling and workers run on background daemons.
- **Governance**: Restructuring requires explicit `confirmed: true` and path containment.

## 2. Architecture Decisions

| Area | Option | Tradeoff | Decision |
|---|---|---|---|
| **GUI & Tray** | 1. Qt6/PySide6<br>2. pywebview<br>3. `pystray` + `tkinter` | Qt adds >200MB; pywebview has WebKitGTK bugs; `pystray`+`tkinter` adds <2MB via Python stdlib. | **Option 3**: `pystray` + `tkinter` (<2MB) for tray and wizard. |
| **CAD Gate** | 1. Soft warning<br>2. Admin UAC<br>3. Hard gate + HKCU fallback | Soft warnings cause runtime failures; UAC alarms users; user PATH avoids elevation. | **Option 3**: Wizard blocks without CAD; Blender uses HKCU PATH / config fallback. |
| **Blender Worker** | 1. Embedded `bpy`<br>2. Socket daemon<br>3. CLI subprocess | Embedded `bpy` conflicts with Python; sockets leak; CLI subprocess guarantees isolation. | **Option 3**: CLI subprocess with 120s timeout & `bm.free()`. |
| **i18n** | 1. gettext<br>2. Angular localize<br>3. Dicts + Signals | Build matrices block dynamic switching; runtime dicts switch instantly without reloads. | **Option 3**: `i18n.py` dictionary; Angular Signal `TranslationService`. |
| **Workspace & Integrity** | 1. Flat dir + ext check<br>2. 5-folder + deep validator | Flat layouts sprawl; extension checks miss corrupt floats that crash Three.js and slicers. | **Option 2**: 5 standard folders, `project.json`, and $84+50N$ STL validator. |

## 3. Data Flow
1. **Request**: External AI calls strictly typed MCP tool in `apps/api/src/tools.ts`.
2. **Dispatch**: Agent routes job to FreeCAD, AutoCAD, or Blender worker.
3. **Integrity**: Output files pass magic bytes (DWG, FCStd, Blend) and STL coordinates ($84+50N$, finite floats).
4. **Governance**: Atomic `project.json` write registers file hashes in 5-folder root.
5. **Serve Gate**: Verifies disk integrity before streaming to Three.js viewer or web downloads.

## 4. Interfaces & Contracts

### 4.1 MCP Tools & Guidance (27 Tools Total)
- **Guidance**: `cadgpt://guidance/modeling-engine-selection` and `select_modeling_engine` tool -> `{ recommended_engine, rationale, suggested_tools }`.
- **5 Blender Tools**: `create_blender_mesh` (primitives), `extrude_subdivide_mesh` (subdivision), `displace_sculpt_mesh` (noise displacement/remesh), `boolean_blender_mesh` (CSG), `export_blender_scene` (stl/obj/gltf/blend).
- **2 Governance Tools**: `audit_project_structure` (read-only plan), `reorganize_project_structure` (confirmed atomic moves).

### 4.2 Manifest Schema (`project.json`)
```json
{
  "projectId": "UUID", "name": "string", "primaryEngine": "FreeCAD|AutoCAD|Blender",
  "createdAt": "ISO8601", "updatedAt": "ISO8601", "version": "1.0.0",
  "inventory": [{"relativePath": "meshes/preview.stl", "category": "meshes", "size": 150084, "sha256": "hex64", "lastModified": 1758069905000, "magicVerified": true, "integrityVerified": true, "facetCount": 3000}]
}
```

## 5. File Changes Table

| Path | Action | Description |
|---|---|---|
| `agent/cadgpt_agent/gui/` (`wizard.py`, `tray.py`) | Create | 4-step wizard (CAD gate), `pystray` tray daemon (HUD/unpair). |
| `agent/cadgpt_agent/` (`i18n.py`, `integrity.py`, `workspace.py`) | Create | Bilingual dicts, STL ($84+50N$) & magic checks, 5 folders. |
| `agent/cadgpt_agent/` (`blender_worker.py`, `strategies/blender.py`) | Create | Headless 5-op bmesh worker, `BlenderStrategy` (120s timeout). |
| `agent/cadgpt_agent/` (`discovery.py`, `executor.py`, `upload.py`) | Modify | Probe Blender (`BLENDER_OPS`), dispatch strategy, pre-upload gate. |
| `apps/api/src/` (`tools.ts`, `guidance.ts`, `store.ts`) | Modify | Register 7 tools (.strict), guidance router, "Blender" schema. |
| `apps/api/src/` (`integrity.ts`, `mesh.ts`) | Create/Mod | STL coordinate validation, upload stream & serve gates. |
| `apps/web/src/app/core/i18n/` | Create | Angular `TranslationService` (Signals), header selector, dicts. |
| `packaging/build.py` | Modify | Bundle `pystray`, `Pillow`, and tray assets in PyInstaller & WiX. |

## 6. Testing Strategy

- **Integrity (`test_integrity.py`, `integrity.spec.ts`)**: STL formula ($84+50N$), NaN/Inf float rejection, ASCII guard, and magic headers (DWG, FCStd, Blend).
- **Blender Worker (`test_blender_worker.py`)**: Headless execution of 5 operations, Catmull-Clark subdivision, and format exports.
- **Discovery & Parity (`test_discovery.py`, `test_ops_allowlist.py`)**: Multi-platform probing and `BLENDER_OPS` schema parity.
- **Governance (`test_workspace.py`)**: Atomic `project.json` updates, read-only audit, path traversal rejection, and confirmed moves.
- **GUI & i18n (`test_gui_i18n.py`)**: Locale detection, language toggle, CAD blocking gate, and Signal reactivity.

## 7. Threat Matrix

| Threat | Attack Vector | Mitigation |
|---|---|---|
| **Tampering** (T) | Corrupt STL crashes viewer/slicer with `NaN` floats. | Enforce size $84 + 50N$ and finite floats before commit or streaming. |
| **Elevation** (E) | Unauthorized UAC prompts during PATH update. | Restrict PATH updates to User environment (`HKCU\\Environment\\Path`); fallback to config. |
| **Denial of Service** (D) | Infinite procedural loop stalls workstation. | Enforce `--background --factory-startup` with 120s timeout (`kill()`) and `bm.free()`. |
| **Path Traversal** (T) | Reorganization escapes root via `../../etc/shadow`. | Validate paths reside within project root using containment checks. |
| **Repudiation** (R) | AI client moves or overwrites user files without consent. | Two-phase safety: `audit_project_structure` is read-only; `reorganize` requires `confirmed: true`. |
