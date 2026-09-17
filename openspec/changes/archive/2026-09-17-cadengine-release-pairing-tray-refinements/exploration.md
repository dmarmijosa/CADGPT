# Exploration: CAD Engine Release, Pairing Flow & System Tray Refinements

**Change ID:** `cadengine-release-pairing-tray-refinements`  
**Target Release:** `v0.2.0-alpha.1`  
**Status:** In Progress  
**Author:** sdd-explore subagent  

---

## 1. Executive Summary

This exploration analyzes the transition of **CAD Engine** from its experimental alpha stages into a polished, production-ready `v0.2.0-alpha.1` release. Through an in-depth audit of the repository, three core areas were investigated:

1. **Releases & Packaging Pipeline**:
   - The obsolete release `v0.1.0-alpha.2` on GitHub was published under the legacy title `"CAD Agent Designer"`, distributed outdated `CADGPT-*` archive names, lacked the Blender 3D modeling worker, and omitted the WiX v4 elevated MSI installer.
   - We define the clean decommissioning strategy for `v0.1.0-alpha.2` and establish the unified release pipeline in `.github/workflows/release.yml`, `packaging/build.py`, `packaging/windows.iss`, `packaging/wix/cadengine.wxs`, and `README.md` targeting `v0.2.0-alpha.1`.

2. **Default Service & Pairing Code Experience**:
   - The default server URL across the agent CLI, GUI, and background daemon must be permanently locked to production: `https://cadengine.danny-armijos.com`.
   - All legacy interactive server URL prompts—including Tkinter `askstring` dialogs and terminal `input()` prompts in `main.py` and `cmd_pair`—are eliminated.
   - Step 4 of the Onboarding Wizard (`gui.py`) is streamlined into a **Zero-URL pairing experience**: the server entry field and "Generate Code" buttons are removed; the wizard automatically contacts the production server to acquire the 12-character ephemeral pairing code (with fallback random 12-character generation if offline), presenting a clean HUD with one-click clipboard copy and direct web dashboard launch across Windows, macOS, and Linux.
   - Successful pairing automatically enrolls the workstation in native background startup (`install_service()`).

3. **System Tray Identity, Logon Lifecycle & Consistent Branding**:
   - Residual traces of the legacy name `"CAD Agent Designer"` (in `docs/deployment.md`, `Dockerfile`, CSS theme comments, `apps/web/README.md`, and tests) are identified for complete replacement with `"CAD Engine"`.
   - The system tray icon is guaranteed to load the official CAD Engine 3D isometric cube logo (`favicon.ico` / PNG asset) across both unpacked development and PyInstaller-bundled environments (`sys._MEIPASS`), backed by programmatic isometric cube rendering.
   - Native OS logon daemons (`schtasks.exe` on Windows, user `systemd` on Linux, and `launchd` on macOS) are validated to ensure seamless background execution without administrator elevation warnings at logon.
   - System tray menu actions (`Status Header`, `View Pairing Code`, `View Connection Status HUD`, `Open Web Dashboard`, `Unpair Device...`, `Exit / Quit`) are audited for thread safety and macOS main-thread Cocoa compliance.

```
+----------------------------------------------------------------------------------------------------+
|                CAD ENGINE REFINEMENTS & RELEASE PIPELINE (v0.2.0-alpha.1)                          |
+-----------------------------------+--------------------------------+-------------------------------+
|     1. RELEASES & PACKAGING       |   2. ZERO-URL PAIRING FLOW     |    3. TRAY & LOGON LIFECYCLE  |
| - Delete/Obsolete v0.1.0-alpha.2  | - Default: cadengine.          | - 3D Cube Icon Resolution     |
| - Clean .github/release.yml       |   danny-armijos.com            |   (PyInstaller + dev paths)   |
| - Remove CADGPT-* asset copies    | - Remove URL input in Step 4   | - Native ONLOGON Tasks:       |
| - Harmonize Linux tar.gz naming   | - Auto-request 12-char code    |   schtasks / systemd / launchd|
| - WiX v4 MSI + Inno Setup EXE     | - 12-char random offline code  | - Unpair modal + service stop |
| - macOS DMG (arm64 & x64)         | - One-click Copy & Open Dash   | - Remove legacy 'CAD Agent    |
| - README download table aligned   | - Auto-enroll install_service()|   Designer' branding residues |
+-----------------------------------+--------------------------------+-------------------------------+
```

---

## 2. Current State Assessment

### 2.1 GitHub Releases & Packaging Pipeline

- **Existing Release on GitHub (`gh release list` / `gh release view v0.1.0-alpha.2`)**:
  - A release exists tagged as `v0.1.0-alpha.2`, titled `"CAD Agent Designer v0.1.0-alpha.2 — ..."`.
  - Its published assets are:
    - `CADGPT-linux-x64.tar.gz` (33.84 MiB)
    - `CADGPT-macos-arm64.dmg` (14.19 MiB)
    - `CADGPT-macos-x64.dmg` (14.73 MiB)
    - `CADGPT-Setup-windows-x64.exe` (12.36 MiB)
    - `SHA256SUMS.txt` (361 B)
  - **Deficiencies of `v0.1.0-alpha.2`**:
    1. Uses the outdated product identity `"CAD Agent Designer"`.
    2. Assets use the old prefix `CADGPT-*` instead of `CADEngine-*`.
    3. Lacks the Blender worker (`blender_worker.py`), meaning organic modeling tools fail when executed against this release.
    4. Lacks the WiX v4 elevated MSI installer (`CADEngine-Setup-x64.msi`).
    5. Lacks the 4-step GUI Onboarding Wizard and System Tray daemon assets.

- **Workflow Review (`.github/workflows/release.yml`)**:
  - The release workflow builds on matrix: `windows-2022`, `ubuntu-24.04`, `macos-15` (arm64), and `macos-15-intel` (x64).
  - Lines 67–72 duplicate archives with legacy names:
    ```yaml
    - if: matrix.platform == 'linux'
      run: |
        tar -czf dist/CADEngine-linux-x64.tar.gz -C dist cadengine
        cp dist/CADEngine-linux-x64.tar.gz dist/CADGPT-linux-x64.tar.gz
    - if: matrix.platform == 'macos'
      run: |
        hdiutil create -volname "CAD Engine" -srcfolder dist/cadengine.app -ov -format UDZO dist/CADEngine-macos-${{ matrix.arch }}.dmg
        cp dist/CADEngine-macos-${{ matrix.arch }}.dmg dist/CADGPT-macos-${{ matrix.arch }}.dmg
    ```
  - **Case Discrepancy with `README.md`**:
    - `README.md` (lines 17, 59, 97) references `cadengine-linux-x64.tar.gz` (lowercase).
    - `release.yml` produces `dist/CADEngine-linux-x64.tar.gz` (capitalized). Since GitHub release download URLs are case-sensitive, downloading `cadengine-linux-x64.tar.gz` produces HTTP 404.
  - Release notes in `release.yml` line 101 omit Blender 3D organic modeling, Onboarding Wizard, and Tray Daemon features.

- **PyInstaller Bundling (`packaging/build.py`)**:
  - Bundles `--add-data` for `freecad_worker.py`, `blender_worker.py`, `vision.py`, `gui.py`, `i18n.py`, `autocad`, `fonts`, and `apps/web/public/favicon.ico`.
  - In `build.py` line 138, `favicon.ico` is copied to destination `cadgpt_agent/assets`.
  - However, in `agent/cadgpt_agent/gui.py` lines 194–205:
    ```python
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "apps/web/public/favicon.ico",
        Path(__file__).resolve().parent / "icon.png",
    ]
    ```
    `gui.py` **fails** to look in `Path(__file__).resolve().parent / "assets" / "favicon.ico"` or `sys._MEIPASS`! In a packaged binary, `favicon.ico` is placed in `cadgpt_agent/assets/favicon.ico`, so the packaged app fails to load the disk icon and falls back to the generated cube.

- **Windows Installers (`packaging/windows.iss` & `packaging/wix/cadengine.wxs`)**:
  - `windows.iss`: Inno Setup outputs `CADEngine-Setup-windows-x64.exe`, installs to `{autopf}\CAD Engine`, registers system `PATH`, and sets `schtasks /Create /TN "CADEngineAgent" /TR "{app}\cadengine.exe" /SC ONLOGON /RL LIMITED /F`.
  - `cadengine.wxs`: WiX v4 outputs `CADEngine-Setup-x64.msi`, installs to `%ProgramFiles%\CAD Engine\`, registers system `PATH`, and registers `CADEngineAgent` logon task via deferred custom action.

---

### 2.2 Server Defaults & Pairing Dialog Flow

- **Default Server URL Inconsistencies**:
  - `agent/cadgpt_agent/gui.py` line 236: Defaults to `"http://localhost:3000"`.
  - `agent/cadgpt_agent/gui.py` lines 970, 974: `SystemTrayDaemon` defaults to `"http://localhost:3000"`.
  - `agent/cadgpt_agent/main.py` lines 455–465: `cmd_pair` prompts for input:
    ```python
    value = input("CAD Engine server URL (https://…): ").strip()
    ```
  - `agent/cadgpt_agent/main.py` lines 1175–1191: `run_foreground_loop` launches an interactive Tkinter `askstring` dialog:
    ```python
    value = askstring("Connect CAD Engine", "Your CAD Engine server URL (https://…):")
    ```
  - These prompts disrupt automation, confuse end-users who do not know the server URL, and fail in headless or automated sessions.

- **Step 4 Onboarding GUI Over-Complexity (`agent/cadgpt_agent/gui.py:787-802`)**:
  - Step 4 currently renders an editable text box (`self.server_entry`) prefilled with the server URL and a "Generate Code" button.
  - This exposes internal configuration details to non-technical users and introduces friction.
  - Requirement: Remove the URL entry field entirely. Step 4 should display **only** the 12-character pairing code with one-click "Copy Code" and "Open Dashboard" buttons.

- **Offline / Failure Fallback for Pairing Code**:
  - If the workstation cannot reach the server, Step 4 currently displays an error label (`Pairing error: ...`) and leaves the user stuck.
  - The onboarding wizard should request the 12-character code from the server, but if the network call fails or the server is temporarily unreachable, it should generate a random 12-character alphanumeric pairing code (format `XXXX-XXXX-XXXX` or hex `XXXXXXXXXXXX`) to keep the UI responsive while background polling retries.

- **Logon Enrollment on Pairing**:
  - Upon successful pairing, credentials are saved to the OS keyring, but background service installation (`install_service()`) is not automatically invoked, leaving the workstation unable to survive reboot unless the user manually runs `cadengine service install`.

---

### 2.3 System Tray, Logon Lifecycle & Residual Branding

- **Residual Branding Audit ("CAD Agent Designer")**:
  A repository-wide scan for `"CAD Agent Designer"` revealed active files that still contain legacy branding:
  1. `docs/deployment.md` (lines 1, 101): `# Deploy a CAD Agent Designer server...` and `Sign in as the same CAD Agent Designer account...`.
  2. `Dockerfile` (line 3): `# Multi-stage build for the CAD Agent Designer server...`.
  3. `deploy/themes/cadgpt/login/resources/css/stitch.css` (line 3): `* Tokens match CAD Agent Designer...`.
  4. `apps/web/README.md` (line 1): `# CAD Agent Designer dashboard`.
  5. `agent/tests/test_strategies.py` (lines 772, 782): Tests asserting `C:\Program Files\CAD Agent Designer\autocad\cadgpt.lsp` instead of `C:\Program Files\CAD Engine\autocad\cadgpt.lsp`.
  6. `openspec/specs/mcp-client-onboarding/spec.md` (line 9): `signing in with CAD Agent Designer credentials`.

- **System Tray Implementation (`agent/cadgpt_agent/gui.py:944-1172`)**:
  - Uses `pystray` with context menu:
    - Status label (`CAD Engine: Connected (v0.2.0-alpha.1)` or `CAD Engine: Disconnected`)
    - `View Pairing Code` (displays device ID / active code)
    - `View Connection Status` (displays HUD dialog with server URL, hostname, device ID, active engines, ping latency)
    - `Open Web Dashboard` (opens default browser)
    - `Unpair Device...` (prompts confirmation, deletes server registration, purges local credentials and config)
    - `Exit` (stops icon and exits)
  - **Thread Safety**: On macOS, `pystray.Icon.run()` must run on the main OS thread to avoid Cocoa thread affinity crashes. This is currently satisfied when launched via `cmd_gui`.

---

## 3. Proposed Architecture & Implementation Plan

### 3.1 Pillar 1: Clean Release Pipeline & Obsoleting Strategy for v0.2.0-alpha.1

#### A. Obsoleting & Cleaning Old GitHub Releases
1. **GitHub Release Decommissioning**:
   - The old release `v0.1.0-alpha.2` must be deleted from GitHub Releases:
     ```bash
     gh release delete v0.1.0-alpha.2 --yes
     ```
   - This prevents users and automated update checks (`cadengine update` / `check_latest_release()`) from discovering obsolete binaries that lack the Blender engine and have outdated branding.
   - The git tag `v0.1.0-alpha.2` may remain in git history for commit traceability or be cleaned.

2. **Clean Release Tag for `v0.2.0-alpha.1`**:
   - Prepare and publish `v0.2.0-alpha.1` with a complete set of clean release assets:
     - `CADEngine-Setup-x64.msi` (elevated WiX v4 installer)
     - `CADEngine-Setup-windows-x64.exe` (Inno Setup installer)
     - `CADEngine-macos-arm64.dmg` (Apple Silicon disk image)
     - `CADEngine-macos-x64.dmg` (Intel Mac disk image)
     - `cadengine-linux-x64.tar.gz` (Linux portable archive, lowercase name matching README)
     - `SHA256SUMS.txt` (SHA-256 checksums)

#### B. Workflow Refinement (`.github/workflows/release.yml`)
- Eliminate legacy `CADGPT-*` file copies (`CADGPT-linux-x64.tar.gz` and `CADGPT-macos-*.dmg`).
- Ensure Linux tarball is packaged as `dist/cadengine-linux-x64.tar.gz` (and optionally create `CADEngine-linux-x64.tar.gz` as a symlink/copy so neither case fails).
- Update the GitHub release publication step in `release.yml` with comprehensive release notes:
  ```yaml
  - name: Publish prerelease
    env:
      GH_TOKEN: ${{ github.token }}
      TAG: ${{ inputs.tag || github.ref_name }}
    run: |
      gh release create "$TAG" artifacts/* \
        --verify-tag \
        --prerelease \
        --title "CAD Engine $TAG — unsigned alpha" \
        --notes "CAD Engine $TAG: Unified CLI and daemons (schtasks, systemd, launchctl); WiX v4 elevated MSI installer with PATH integration; FreeCAD 1.1.3 (20 operations); AutoCAD 2026 Core Console (13 operations); Blender 4.x organic modeling engine (5 operations); 4-step onboarding wizard and system tray daemon; bilingual internationalization (English & Spanish); Google OAuth2 identity provider."
  ```

#### C. Packaging Build Fix (`packaging/build.py` & `gui.py`)
- In `gui.py`: Update `get_tray_icon_image()` to check:
  1. `Path(sys._MEIPASS) / "cadgpt_agent" / "assets" / "favicon.ico"` (if `getattr(sys, "frozen", False)`)
  2. `Path(__file__).resolve().parent / "assets" / "favicon.ico"`
  3. `Path(__file__).resolve().parent.parent.parent / "apps/web/public/favicon.ico"`
  4. Programmatic fallback via `create_cube_icon_image(size)`.

---

### 3.2 Pillar 2: Production Service URL & Zero-URL Pairing UX

#### A. Production Server Default Constant
Define a unified constant across the agent codebase:
```python
DEFAULT_SERVER = "https://cadengine.danny-armijos.com"
```
Apply `DEFAULT_SERVER` across:
- `agent/cadgpt_agent/gui.py`: `OnboardingController.__init__`, `SystemTrayDaemon._read_server`.
- `agent/cadgpt_agent/main.py`: `cmd_pair`, `run_foreground_loop`, `cmd_status`, `run_doctor_checks`, `cmd_gui`.

#### B. Eliminate Interactive Server Prompts
- Remove the `askstring` dialog from `main.py` lines 1175–1191.
- Remove the terminal `input("CAD Engine server URL...")` prompt from `cmd_pair` and `run_foreground_loop`.
- Precedence order:
  1. CLI argument (`--server <url>`)
  2. User config (`config.json["server"]`)
  3. Default constant (`https://cadengine.danny-armijos.com`)

#### C. Redesign Step 4 Onboarding GUI (`_render_step4`)
1. **Remove Server URL UI**:
   - Delete `self.server_entry` and the "Generate Code" button.
2. **Immediate Pairing Code Handshake**:
   - On transition to Step 4, immediately request an ephemeral pairing code from `self.controller.server_url` (`POST /api/pairings`).
   - If the request fails (e.g. server offline or network timeout), generate a local fallback 12-character uppercase code (e.g. `secrets.token_hex(6).upper()`) and format as `XXXX-XXXX-XXXX` or 12 alphanumeric characters.
3. **Clean, Focused UI Layout**:
   - **Instruction text**: "Enter this pairing code in your CAD Engine web dashboard:"
   - **Pairing Code Display**: Large, high-contrast monospace font (`PairCode.TLabel`), padded and easily readable.
   - **Action Buttons**:
     - `Copy Code` (`btn_copy`): Copies code to OS clipboard with `self.master.update()` to guarantee X11 clipboard capture on Linux, switching button text to "Copied!" for 2 seconds.
     - `Open Dashboard` (`btn_open_pairing`): Launches `https://cadengine.danny-armijos.com/pair` in the default system browser via `webbrowser.open()`.
   - **Status Indicator**:
     - Polling: "Waiting for approval in web dashboard..."
     - Approved: "Pairing successful! Workstation registered."
4. **Automatic Background Logon Enrollment**:
   - In `_on_pairing_success()`: Invoke `install_service()` to register the native startup daemon (`schtasks.exe` on Windows, `systemd` on Linux, `launchctl` on macOS).

```
+-------------------------------------------------------------------------+
|                  Step 4 / 4 — Server Pairing & Startup                  |
+-------------------------------------------------------------------------+
|                                                                         |
|  Enter this code in your CAD Engine web dashboard to link this machine: |
|                                                                         |
|                    +-------------------------------+                    |
|                    |       A7B2 - 9C4E - 3F1D      |                    |
|                    +-------------------------------+                    |
|                                                                         |
|         [ Copy Code ]                  [ Open Dashboard -> ]            |
|                                                                         |
|  (o) Waiting for approval in web dashboard...                           |
|                                                                         |
+-------------------------------------------------------------------------+
|  [ Back ]                                                   [ Finish ]  |
+-------------------------------------------------------------------------+
```

---

### 3.3 Pillar 3: System Tray Identity, Logon Integration & Complete Brand Unification

#### A. Residual Branding Elimination
Update all lingering `"CAD Agent Designer"` references:
- `docs/deployment.md`: Update title and prose to `"CAD Engine"`.
- `Dockerfile`: Update comment to `"CAD Engine server"`.
- `deploy/themes/cadgpt/login/resources/css/stitch.css`: Update comment to `"CAD Engine"`.
- `apps/web/README.md`: Update title to `"CAD Engine dashboard"`.
- `agent/tests/test_strategies.py`: Update paths `C:\Program Files\CAD Agent Designer\...` to `C:\Program Files\CAD Engine\...`.
- `openspec/specs/mcp-client-onboarding/spec.md`: Update to `"CAD Engine credentials"`.

#### B. System Tray Icon Resolution
Enhance `get_tray_icon_image()` in `gui.py` to check:
1. `Path(sys._MEIPASS) / "cadgpt_agent" / "assets" / "favicon.ico"` (PyInstaller frozen app)
2. `Path(__file__).resolve().parent / "assets" / "favicon.ico"` (installed egg/wheel)
3. `Path(__file__).resolve().parent.parent.parent / "apps" / "web" / "public" / "favicon.ico"` (source tree)
4. Programmatic fallback: `create_cube_icon_image(size)` using Pillow to render the 3D isometric shaded cube with distinct facet colors (Top: Light Indigo `#6366F1`, Left: Dark Indigo `#3730A3`, Right: Medium Indigo `#4338CA`).

#### C. Cross-Platform Logon Verification
- **Windows**:
  - `packaging/windows.iss`: Inno Setup registers `schtasks /Create /TN "CADEngineAgent" /TR "{app}\cadengine.exe" /SC ONLOGON /RL LIMITED /F`.
  - `packaging/wix/cadengine.wxs`: WiX registers `CADEngineAgent` ONLOGON scheduled task.
  - `agent/cadgpt_agent/service.py`: `install_service()` executes `schtasks /Create /TN "CADEngineAgent" /SC ONLOGON /RL LIMITED /F`.
- **Linux**:
  - `service.py`: Installs `~/.config/systemd/user/cadengine.service`, runs `systemctl --user daemon-reload` and `systemctl --user enable cadengine`.
- **macOS**:
  - `service.py`: Writes `~/Library/LaunchAgents/com.cadengine.agent.plist` with `RunAtLoad=true` and `KeepAlive=true`, loads via `launchctl load`.
- **Unpair Integration**:
  - Clicking `Unpair Device...` from the tray prompts for confirmation, revokes device on the server, deletes OS keyring credentials, and calls `stop_service()` / unregisters daemon.

---

## 4. Traceability Matrix

| Component | File Path | Current Behavior | Target Behavior |
|---|---|---|---|
| Release Workflow | [.github/workflows/release.yml](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml) | Creates `CADGPT-*` legacy copies; Linux tarball is `CADEngine-*.tar.gz`; outdated release notes. | Remove `CADGPT-*` copies; package `cadengine-linux-x64.tar.gz`; update release notes to include Blender, GUI, Tray, i18n, WiX MSI. |
| Packaging Script | [packaging/build.py](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py) | Copies `favicon.ico` to `cadgpt_agent/assets`. | Retain asset copying; verified in PyInstaller `--add-data`. |
| Tray Icon Loader | [agent/cadgpt_agent/gui.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L191-L207) | Only searches `apps/web/public/favicon.ico` and `icon.png`; fails in packaged app. | Search `sys._MEIPASS`, `cadgpt_agent/assets/favicon.ico`, and source paths before cube generator fallback. |
| Default Server | [agent/cadgpt_agent/gui.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L236) | Defaults to `http://localhost:3000`. | Define `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"` as universal default. |
| Step 4 Wizard | [agent/cadgpt_agent/gui.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L779-L850) | Displays editable server URL input and "Generate Code" button. | Remove URL input field; auto-request code on display; fallback to 12-char random code; auto-call `install_service()` on success. |
| Foreground Loop | [agent/cadgpt_agent/main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py#L1175-L1192) | Prompts for server URL using Tkinter `askstring` and terminal `input()`. | Eliminate `askstring` and `input()`; default directly to `DEFAULT_SERVER`. |
| Pair Subcommand | [agent/cadgpt_agent/main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py#L455-L465) | Prompts for server URL via `input()` if absent. | Default directly to `DEFAULT_SERVER`. |
| Deployment Docs | [docs/deployment.md](file:///Users/danny/Documents/ChatGPT/CADGPT/docs/deployment.md#L1) | References `"CAD Agent Designer"`. | Rebrand to `"CAD Engine"`. |
| CSS Theme Tokens | [deploy/themes/cadgpt/login/resources/css/stitch.css](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css#L3) | References `"CAD Agent Designer"`. | Rebrand to `"CAD Engine"`. |
| Strategy Tests | [agent/tests/test_strategies.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_strategies.py#L772) | Uses `C:\Program Files\CAD Agent Designer\...`. | Update to `C:\Program Files\CAD Engine\...`. |
| Web README | [apps/web/README.md](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/README.md#L1) | References `"CAD Agent Designer"`. | Rebrand to `"CAD Engine"`. |
| MCP Onboarding Spec | [openspec/specs/mcp-client-onboarding/spec.md](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/mcp-client-onboarding/spec.md#L9) | References `"CAD Agent Designer"`. | Rebrand to `"CAD Engine"`. |

---

## 5. Test & Validation Strategy

1. **Unit Tests (`agent/tests/test_gui.py`)**:
   - `test_default_server_url_is_production`: Assert default server in `OnboardingController` and `SystemTrayDaemon` is `https://cadengine.danny-armijos.com`.
   - `test_step4_renders_no_url_entry`: Verify `Step 4` contains no Entry widget for server URL and renders only the code container and action buttons.
   - `test_step4_fallback_random_code_on_network_failure`: Mock network timeout on `request_pairing_code` and assert that a valid 12-character random code is generated and displayed without throwing unhandled exceptions.
   - `test_step4_auto_installs_service_on_success`: Assert `_on_pairing_success` invokes `install_service()`.
   - `test_tray_icon_resolves_packaged_assets`: Test `get_tray_icon_image()` locates asset in mock `_MEIPASS` and module `assets/` directories.

2. **CLI & Daemon Tests (`agent/tests/test_agent.py`)**:
   - Assert `run_foreground_loop` without `--server` connects to `DEFAULT_SERVER` without popping `askstring` or prompting `input()`.
   - Assert `cmd_pair` without `--server` pairs against `DEFAULT_SERVER` without prompting.

3. **Packaging & Dry-Run Tests (`agent/tests/test_packaging.py`)**:
   - Verify `packaging/build.py --dry-run` validates all packaging assets and checks PyInstaller data mappings.
   - Verify `packaging/wix/cadengine.wxs` and `packaging/windows.iss` compile and pass XML/syntax validation.

4. **Integration & Regression Tests**:
   - Full suite execution: `python -m unittest discover -s agent/tests -v` (341+ tests).
   - Full web suite execution: `npm test` (156 api tests + 106 web tests).

---

## 6. Implementation Slices & Risk Analysis

| Slice | Scope | Primary Files | Risk | Mitigation |
|---|---|---|---|---|
| **Slice 1: Default Service & Zero-URL Pairing** | Set default server to production; eliminate `askstring`/`input()` prompts; update Step 4 GUI to display only pairing code, copy button, and open dashboard button; add offline code generation and `install_service()` trigger. | `agent/cadgpt_agent/gui.py`, `agent/cadgpt_agent/main.py`, `agent/tests/test_gui.py`, `agent/tests/test_agent.py` | Low | Tests mock network and verify UI layout without requiring a live display. |
| **Slice 2: Tray Icon & Brand Unification** | Fix tray icon path resolution for packaged and source layouts; replace all remaining occurrences of "CAD Agent Designer" across docs, themes, and tests. | `agent/cadgpt_agent/gui.py`, `docs/deployment.md`, `Dockerfile`, `stitch.css`, `test_strategies.py` | Low | Pure string/path refactoring; verified with ripgrep. |
| **Slice 3: Clean Release Pipeline & Obsoletion** | Decommission obsolete GitHub release `v0.1.0-alpha.2`; update `.github/workflows/release.yml`, `packaging/build.py`, and `README.md`; prepare release pipeline for `v0.2.0-alpha.1`. | `.github/workflows/release.yml`, `packaging/build.py`, `README.md` | Medium | Verify artifact filenames match download table; test release pipeline with workflow dispatch dry-run. |

---

## 7. Next Recommended Steps

1. Create the OpenSpec proposal and design:
   - `openspec/changes/cadengine-release-pairing-tray-refinements/proposal.md`
   - `openspec/changes/cadengine-release-pairing-tray-refinements/design.md`
   - `openspec/changes/cadengine-release-pairing-tray-refinements/tasks.md`
2. Update/create relevant delta specs under `openspec/changes/cadengine-release-pairing-tray-refinements/specs/`:
   - `gui-onboarding-system-tray/spec.md` (delta for Zero-URL pairing, production default, packaged icon resolution)
   - `agent-cli-daemon-lifecycle/spec.md` (delta for default production server URL and prompt elimination)
3. Proceed through implementation slices, run full regression tests, and execute release cleaning commands.
