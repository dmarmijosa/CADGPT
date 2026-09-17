# Archive Report — CAD Engine Release Packaging, Pairing HUD & System Tray Refinements

**Date**: 2026-09-17 | **Change**: `cadengine-release-pairing-tray-refinements` | **Status**: ARCHIVED AND CLOSED | **Mode**: openspec | **Target Release**: `v0.2.0-alpha.1`

---

## 1. Executive Summary

The change `cadengine-release-pairing-tray-refinements` has successfully satisfied all technical design specifications, completed all 24 tasks across 4 work units, passed all verification suites with zero blockers and zero critical findings, and is hereby archived for the target release **CAD Engine `v0.2.0-alpha.1`**.

This change harmonized the workstation onboarding flow, CLI/daemon execution, system tray visual identity, repository branding, and multi-platform packaging pipelines:
1. **Zero-URL Pairing HUD**: Step 4 of the desktop onboarding wizard was completely re-architected into a streamlined Zero-URL HUD. Manual server URL entry fields and manual code generation triggers were eliminated. Workstations default directly to the universal production endpoint `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"`.
2. **Offline 12-Character Fallback**: If the initial network handshake to `POST /api/pairings` fails or times out, the client generates a cryptographically secure 12-character uppercase hexadecimal code (`secrets.token_hex(6).upper()`, formatted as `XXXX-XXXX-XXXX`) locally and non-blockingly, keeping the HUD immediately responsive while background threads retry connectivity.
3. **Autonomous Native Service Auto-Enrollment**: Upon confirmed pairing approval in `_on_pairing_success()`, the wizard automatically invokes `install_service()`, enrolling the workstation in native background daemon startup (`schtasks.exe` on Windows, user `systemd` unit on Linux, `launchd` plist on macOS) without requiring manual terminal commands or administrative elevation.
4. **Interactive Prompt Elimination**: The CLI foreground worker loop (`run_foreground_loop`) and pairing subcommand (`cmd_pair`) no longer present blocking Tkinter dialogs (`askstring`) or terminal stdin prompts (`input()`), resolving endpoints seamlessly via precedence: (1) `--server`, (2) saved `config.json["server"]`, (3) `DEFAULT_SERVER`.
5. **Multi-Tier Tray Icon Resolution**: `get_tray_icon_image()` queries (1) PyInstaller frozen bundle path `sys._MEIPASS / "cadgpt_agent" / "assets" / "favicon.ico"`, (2) local module assets, (3) web public assets, and (4) local `icon.png`, falling back cleanly to programmatic 3D isometric cube rendering via Pillow.
6. **Harmonized Release Pipeline & Obsolete Release Decommissioning**: Linux packaging produces strictly `cadengine-linux-x64.tar.gz` (lowercase), matching documentation and curl scripts; legacy duplicate `CADGPT-*` archives were eliminated from `.github/workflows/release.yml`; obsolete release `v0.1.0-alpha.2` was decommissioned from GitHub Releases; and residual occurrences of "CAD Agent Designer" were purged across docs, stylesheets, and test suites.

Delta specs have been promoted to canonical `openspec/specs/` (`gui-onboarding-system-tray`, `agent-cli-daemon-lifecycle`, and `governance-security-supplychain`). The change directory is archived to `openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/`.

---

## 2. Deliverables Summary

| Work Unit | Scope | Deliverables & Implementation Highlights |
|---|---|---|
| **WU1: Default Service & Zero-URL Pairing HUD + Auto-Enrollment** | Agent Desktop GUI & CLI (`gui.py`, `main.py`, `service.py`) | - Defined `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"` in `gui.py` and `main.py`.<br>- Redesigned Step 4 HUD (`_render_step4`): Monospace Courier 20 bold pairing code card (`PairCode.TLabel`), dedicated "Copy Code" button with 2000 ms feedback label flip (`btn_copied`), and "Open Dashboard" button launching `{server_url}/pair`.<br>- Implemented offline 12-char fallback via CSPRNG `secrets.token_hex(6).upper()` formatted as `XXXX-XXXX-XXXX`.<br>- Integrated automatic `install_service()` invocation upon confirmed pairing approval.<br>- Eliminated blocking `askstring` and terminal `input()` prompts in CLI startup paths. |
| **WU2: System Tray Asset Resolution & Complete Branding Purge** | System Tray, Packaging, Documentation & Stylesheets | - Multi-tier tray icon resolution in `get_tray_icon_image()` with `sys._MEIPASS` frozen check.<br>- Configured PyInstaller `--add-data` directive in `packaging/build.py` bundling `favicon.ico`.<br>- Purged residual "CAD Agent Designer" branding in `docs/deployment.md`, `apps/web/README.md`, `Dockerfile`, `stitch.css`, and `mcp-client-onboarding/spec.md`.<br>- Updated AutoCAD LISP strategy test paths in `test_strategies.py` to `C:\Program Files\CAD Engine\...`. |
| **WU3: Release Pipeline Harmonization & Obsolete Release Decommissioning** | GitHub Actions Workflow & Release Assets | - Standardized Linux packaging step in `.github/workflows/release.yml` to strictly lowercase `cadengine-linux-x64.tar.gz`.<br>- Removed legacy duplicate `CADGPT-*` archive copies (`CADGPT-linux-x64.tar.gz`, `CADGPT-macos-*.dmg`).<br>- Updated prerelease publication notes detailing Blender 4.x, WiX v4 MSI, Zero-URL wizard, system tray daemon, and bilingual i18n.<br>- Aligned onboarding and packaging documentation in `README.md`.<br>- Decommissioned obsolete GitHub release `v0.1.0-alpha.2` via `gh release delete`. |
| **WU4: End-to-End Verification & Regression Testing** | Test Automation, Quality Gates & Dry Runs | - Packaging asset validation and dry run via `python packaging/build.py --dry-run`.<br>- Repository branding scan confirming 0 residual occurrences of "CAD Agent Designer".<br>- Full agent unit test suite: 349/349 tests passed.<br>- Full monorepo test suite: 262/262 tests passed (156 API + 106 Web).<br>- Production compilation and Prettier code formatting verified 100% clean. |

---

## 3. Verification & Test Outcomes

- **Verdict**: **PASS**
- **Requirements Verified**: 5/5 Compliant (100%)
- **Scenarios Verified**: 21/21 Compliant (100%)
- **Tasks Completed**: 24/24 Complete (`[x]`)
- **Blockers**: 0
- **Critical Findings**: 0

### Test Execution Metrics
- **Python Agent Unit Tests**: 349 passed, 0 failed, 0 errors (0.72s)
  - `test_gui.py`: Default server resolution, Zero-URL HUD layout, offline fallback code generation, native service auto-enrollment, and `sys._MEIPASS` asset lookup.
  - `test_agent.py`: Headless and interactive pairing without stdin prompts, foreground loop server resolution.
  - `test_strategies.py`: AutoCAD LISP strategy paths under `CAD Engine`.
- **API Backend Tests (`apps/api`)**: 156 passed, 0 failed (0.48s)
- **Web Frontend Tests (`apps/web`)**: 106 passed across 18 test suites, 0 failed (1.15s)
- **Total Monorepo Tests**: 611 passed, 0 failed
- **Packaging Dry-Run**: `python packaging/build.py --dry-run` passed cleanly (exit code 0)
- **Production Build**: `npm run build` compiled NestJS API and Angular web bundles cleanly in 2.14s
- **Code Style Gate**: `npm run format:check` validated 100% Prettier compliance

---

## 4. Canonical Specification Promotions

The delta specifications defined in `openspec/changes/cadengine-release-pairing-tray-refinements/specs/` have been promoted into canonical `openspec/specs/`:

### 1. [`openspec/specs/gui-onboarding-system-tray/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/gui-onboarding-system-tray/spec.md)
- **Requirement: Progressive 4-Step Onboarding Wizard Architecture**:
  - Replaced manual server URL entry and code generation button with Zero-URL pairing HUD.
  - Standardized default production server connectivity to `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"`.
  - Added cryptographic 12-character local offline fallback (`secrets.token_hex(6).upper()`, `XXXX-XXXX-XXXX`).
  - Added automatic user-level background service registration via `install_service()` upon pairing approval.
  - Added scenarios: `Approved pairing advances to completion, enrolls background service, and launches tray`, `Zero-URL pairing HUD displays 12-character code without server URL input`, `Offline fallback generates 12-character pairing code when server is unreachable`.
- **Requirement: Background System Tray Application**:
  - Added multi-tier asset resolution specifying `sys._MEIPASS` frozen check, source paths, and PIL 3D isometric cube fallback.
  - Added scenario: `Tray icon resolves favicon asset in packaged PyInstaller binary`.

### 2. [`openspec/specs/agent-cli-daemon-lifecycle/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/agent-cli-daemon-lifecycle/spec.md)
- **Requirement: Unified CLI Entry Points and Command Dispatch**:
  - Specified universal production server resolution constant `DEFAULT_SERVER`.
  - Eliminated interactive Tkinter `askstring` and terminal `input()` prompts from foreground startup.
  - Added scenario: `Foreground loop defaults to universal production server without interactive prompts`.
- **Requirement: Interactive and Headless Device Pairing Subcommand**:
  - Added `DEFAULT_SERVER` automatic resolution when `--server` is omitted.
  - Eliminated terminal `input()` prompts during headless and interactive pairing flows.
  - Added scenario: `Pairing without server flag defaults to production server without terminal prompts`.

### 3. [`openspec/specs/governance-security-supplychain/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/governance-security-supplychain/spec.md)
- **Requirement: GitHub Releases Prerelease Delivery Policy**:
  - Standardized Linux release artifact name strictly as lowercase `cadengine-linux-x64.tar.gz`.
  - Prohibited generation or upload of legacy `CADGPT-*` duplicate archives.
  - Formally decommissioned obsolete GitHub release `v0.1.0-alpha.2`.
  - Enforced complete product rebranding to "CAD Engine" with zero residual occurrences of "CAD Agent Designer".
  - Added scenarios: `Tagged alpha release creation` (updated title), `Linux archive naming harmonization and legacy asset elimination`, `Obsolete release v0.1.0-alpha.2 decommissioning`, `Clean product branding with zero residual CAD Agent Designer references`.

---

## 5. Target Release Milestone: v0.2.0-alpha.1

The completion and archival of this change establishes the baseline for public prerelease **v0.2.0-alpha.1**:
- **Artifacts Ready for Tag & Packaging**:
  - `CADEngine-Setup-x64.msi` (WiX v4 elevated installer)
  - `CADEngine-Setup-windows-x64.exe` (Inno Setup installer)
  - `CADEngine-macos-arm64.dmg` (macOS Apple Silicon disk image)
  - `CADEngine-macos-x64.dmg` (macOS Intel disk image)
  - `cadengine-linux-x64.tar.gz` (Linux x86_64 tarball)
  - `SHA256SUMS.txt` (SHA-256 manifest)
- **Branding State**: 100% unified under "CAD Engine".
- **Documentation State**: Onboarding instructions, curl install snippets, and API endpoints aligned with Zero-URL workflow.

---

## 6. Artifact Inventory

Archived Directory: `openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/`

- [`proposal.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/proposal.md) — Scope, problem statement, proposed solutions, and rollback boundaries.
- [`exploration.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/exploration.md) — Research spikes into Zero-URL pairing, PyInstaller frozen asset resolution, and packaging naming.
- [`design.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/design.md) — Technical specifications, architecture invariants, and component designs.
- [`tasks.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/tasks.md) — 24 completed work tasks across 4 work units.
- [`verify-report.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/verify-report.md) — Comprehensive verification report with PASS verdict and test logs.
- [`archive-report.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-release-pairing-tray-refinements/archive-report.md) — This archive closure report.
- `specs/` — Delta specification copies preserved for historical traceability.
