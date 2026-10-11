# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-alpha.3] - 2026-10-11

### Added
- **AutoCAD / Civil 3D 2D drafting**: `draw_polyline`, `draw_circle` (optional layer and elevation) and `delete_object`. `read_scene` now lists model-space lines, polylines, circles, arcs, text and points as well as 3D solids, with handle, layer and a DXF-derived bounding box, so the existing transforms can move, rotate and scale 2D entities in existing drawings.
- **SOLIDWORKS editing**: `read_scene` (solid bodies as `Body1`, `Body2`, … with name, bounding box and volume), `translate_object`, `rotate_object`, `boolean_cut`, `boolean_union` and `boolean_intersect` on existing `.SLDPRT` parts.

### Fixed
- `open_external_design` checks that the file extension matches the CAD, picks the only CAD that opens that type when several are online, and no longer leaves an orphaned document when the CAD cannot read files or queueing fails.
- AutoCAD scene labels escape layer names without ever splitting an escape sequence when truncating.

## [0.2.0-alpha.2] - 2026-10-11

### Added
- **Civil 3D support**: discovery of Civil 3D installs (registry product name or `C3D` folder next to `accoreconsole.exe`), reported as a separate `Civil3D` CAD that runs on the AutoCAD Core Console with `/product C3D /l en-US`. Inherits all 13 AutoCAD operations and adds `extrude_cross_section` (trapezoidal road embankment / channel / levee solid). Opt-in via `--enable-autocad`.
- **SOLIDWORKS support**: Windows discovery of `SLDWORKS.exe` and a fixed PowerShell worker that drives the SOLIDWORKS COM API for `create_box`, `create_cylinder`, `extrude_rect` and `export_design` (STEP/STL), saving native `.SLDPRT` with a binary STL preview. Opt-in via the new `--enable-solidworks` flag; `cadengine test --cad civil3d|solidworks`.
- API: `CAD_KINDS` shared list (`FreeCAD`, `AutoCAD`, `Civil3D`, `Blender`, `SolidWorks`), idempotent migration of the `documents.cad_kind` CHECK constraint, the `extrude_cross_section` MCP tool, and `civil` / `product` domains in `select_modeling_engine`.
- Landing page: "Works with" strip naming all five programs right under the hero, plus capability panels for Civil 3D, SOLIDWORKS and Blender. About page and footer updated to match.

### Fixed
- The landing hero (title, lead, part labels and status notes) now follows the selected language instead of always rendering in English.
- The About page no longer documents a non-existent `--enable-blender` flag; Blender is enabled automatically when detected, or via `--blender-path`.

### Notes
- Civil 3D and SOLIDWORKS execution is covered by simulated (mocked) tests only; it has not yet been verified against a live install.

## [0.2.0-alpha.1] - 2026-09-16

### Added
- **Social Authentication**: Google OAuth 2.0 Identity Provider integration in Keycloak (`cadgpt-realm.json` and `cadgpt-realm.prod.json`) with first-broker auto-registration.
- **Stitch Precision CAD Theme**: PatternFly v5 dark theme styling with `--stitch-surface-variant` (`#131B2E`), Electric Cyan (`#00F0FF`) focus glow, embedded multi-color Google SVG icon, and responsive viewport sizing.
- **Advanced FreeCAD 3D Modeling**:
  - `create_wedge`: Prismatic wedge primitives with parametric bounds.
  - `extrude_polygon`: 2D planar polygon wire definition (XY, XZ, YZ) extruded along normal vectors.
  - `fillet`: Edge rounding on target solids with radius constraints and optional edge index selection.
  - `chamfer`: Beveled edge cuts with distance constraints and optional edge index selection.
  - `loft`: Non-uniform cross-section skinning across multiple closed wire profiles (e.g. blades, wings) with OCC `.bak` document rollback protection.
- **Agent CLI Evolution**:
  - Registered dual entrypoints `cadengine` and `cadgpt-agent` in `pyproject.toml`.
  - Subcommands: `status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`, `doctor`, and `update`.
  - `cadengine doctor`: Comprehensive diagnostic checklist with `--fix` automated headless FreeCAD provisioning in dedicated conda environments.
  - `cadengine update`: GitHub Releases API integration with SHA-256 checksum verification and atomic binary swap.
  - Device revocation API: `POST /api/agent/unpair` with Bearer token authentication and local credential purge.
- **Cross-Platform Background Services**:
  - Windows: Elevated `ONLOGON` Scheduled Task via `schtasks.exe` ensuring execution in user sessions (Session 1+) with display and Credential Vault (`wincred`) access.
  - Linux: User systemd daemon (`systemd --user`) unit configuration.
  - macOS: LaunchAgent plist (`~/Library/LaunchAgents/com.cadengine.agent.plist`).
- **Elevated Windows MSI Installer**:
  - WiX Toolset v4 configuration (`packaging/wix/cadengine.wxs`) installing to `%ProgramFiles%\CAD Engine\`.
  - Elevated UAC admin execution and system `PATH` registration via WiX `<Environment>` element.
  - Automated Scheduled Task registration and clean uninstallation actions.

### Fixed
- Keycloak login/register layout overflow caused by duplicate card borders and margins on empty footer panels.
- Headless Linux runner testing by mocking OS keyring operations during CI runs.
- Windows file path normalization assertions in strategy test suites.

---

## [0.1.0-alpha.2] - 2026-09-15

### Added
- File permissions allowlist preventing arbitrary filesystem access.
- Safe open-by-path with automated document backup and recovery.
- AutoCAD 2026 Core Console (`accoreconsole.exe`) adapter with 13-operation parity.
- Redesigned Stitch precision CAD workbench dashboard and Three.js STL preview viewer.

---

## [0.1.0-alpha.1] - 2026-09-14

### Added
- Initial alpha release of CAD Engine.
- Headless FreeCAD worker executing primitives (`box`, `cylinder`, `sphere`, `cone`) and boolean operations (`cut`, `union`, `intersect`).
- Model Context Protocol (MCP) server endpoints and device pairing workflow.
