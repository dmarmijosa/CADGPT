# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Initial alpha release of CAD Agent Designer.
- Headless FreeCAD worker executing primitives (`box`, `cylinder`, `sphere`, `cone`) and boolean operations (`cut`, `union`, `intersect`).
- Model Context Protocol (MCP) server endpoints and device pairing workflow.
