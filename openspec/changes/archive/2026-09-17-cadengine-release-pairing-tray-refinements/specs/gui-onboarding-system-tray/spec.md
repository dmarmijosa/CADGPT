## gui-onboarding-system-tray (MODIFIED)

Purpose: Provide a lightweight, cross-platform desktop graphical user interface consisting of a progressive 4-step onboarding wizard, a hard CAD prerequisite verification gate, Blender tool discovery with user-level PATH/configuration support, a background system tray daemon with connection HUD and unpair controls, and complete bilingual internationalization (English and Spanish) across the agent and web application.

---

### MODIFIED Requirement: Progressive 4-Step Onboarding Wizard Architecture
The agent desktop application MUST provide a progressive 4-step onboarding wizard implemented using standard `tkinter` (`ttk`) and `pystray` with total packaging overhead not exceeding 5 MB:
1. **Step 1 — Language Selection & Welcome**:
   - The wizard MUST present an interactive language toggle supporting English (`en`) and Spanish (`es`).
   - Switching language MUST dynamically update all UI text, labels, and explanations across the wizard in real time.
2. **Step 2 — Parametric CAD Prerequisite Verification Gate**:
   - The wizard MUST invoke the local discovery engine to detect installed CAD kernels.
   - The step MUST display detection status for FreeCAD and AutoCAD.
   - Progression MUST be blocked unless at least one valid CAD kernel is verified.
3. **Step 3 — Blender Tool Discovery & Configuration**:
   - The wizard MUST probe for a local Blender installation.
   - If detected, the wizard MUST display the detected executable path and enable Blender capabilities.
   - If not detected, the wizard MUST present explicit user options to configure Blender or proceed without it.
4. **Step 4 — Zero-URL Pairing HUD & Native Service Auto-Enrollment**:
   - The wizard MUST eliminate manual server URL entry fields (`self.server_entry`) and manual code generation buttons from the user interface, locking default connectivity to the production server `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"` (unless previously configured in `config.json`).
   - The step MUST present a clean, high-contrast Zero-URL pairing HUD displaying exclusively the 12-character ephemeral pairing code (formatted as `XXXX-XXXX-XXXX`), an action button to copy the code to the system clipboard ("Copy Code" / "Copiar Código"), and an action button to launch the default web browser directly to the web dashboard pairing route ("Open Web Dashboard" / "Abrir Panel Web").
   - **Offline 12-Character Fallback**: If the network request to `POST /api/pairings` fails, times out, or the server is temporarily unreachable, the wizard MUST NOT display a blocking error dialog; instead, it MUST generate a random 12-character alphanumeric pairing code locally (using cryptographically secure randomness `secrets.token_hex(6).upper()`) and display it in the pairing HUD while background polling retries connection.
   - **Automatic Native Service Enrollment**: Upon confirmed pairing approval, the wizard MUST securely persist the authentication token in the OS Keyring under service `"CADGPT"`, persist `deviceId` and `server` in `config.json`, and MUST automatically invoke `install_service()` to enroll the workstation in native background startup (`schtasks.exe` on Windows, user `systemd` unit on Linux, `launchd` plist on macOS) without requiring manual terminal commands or administrative elevation prompts.

#### Scenario: First launch runs onboarding wizard when credentials are absent
- GIVEN the agent executable is launched interactively without existing keyring credentials
- WHEN the application initializes
- THEN it opens the 4-step onboarding wizard starting on Step 1 (Language & Welcome)

#### Scenario: Language toggle updates wizard text dynamically
- GIVEN the onboarding wizard is open in English
- WHEN the user clicks the Spanish language toggle ("Español")
- THEN all visible step headings, instructions, button labels, and descriptions immediately switch to Spanish without restarting the application

#### Scenario: Approved pairing advances to completion, enrolls background service, and launches tray
- GIVEN the user is on Step 4 viewing the 12-character pairing code
- WHEN the user approves the pairing in the web dashboard
- THEN the background polling loop detects approval, stores credentials in the OS keyring, invokes `install_service()` to register the native background daemon, closes the wizard, and launches the persistent system tray icon

#### Scenario: Zero-URL pairing HUD displays 12-character code without server URL input
- GIVEN the user navigates from Step 3 to Step 4 of the onboarding wizard
- WHEN Step 4 initializes
- THEN the step displays the 12-character pairing code formatted with hyphen separators, renders "Copy Code" and "Open Web Dashboard" action buttons, and contains no server URL input field or manual code generation button

#### Scenario: Offline fallback generates 12-character pairing code when server is unreachable
- GIVEN the host machine has no network connectivity to the CAD Engine production server
- WHEN Step 4 initializes
- THEN the wizard generates a random 12-character hexadecimal fallback code locally, displays it in the pairing HUD, enables the "Copy Code" button, and continues background retry polling without raising an unhandled exception or modal error dialog

---

### MODIFIED Requirement: Background System Tray Application
The agent MUST provide a background system tray process using `pystray` to maintain workstation connectivity and lifecycle management:
1. **Visual Identity & Packaged Tray Icon Resolution**:
   - The tray icon MUST use the official CAD Engine 3D isometric cube logo across all deployment formats:
     - In PyInstaller packaged executable bundles (`getattr(sys, "frozen", False)`), the icon loader MUST resolve `Path(sys._MEIPASS) / "cadgpt_agent" / "assets" / "favicon.ico"`.
     - In unpackaged source runs, the loader MUST resolve `Path(__file__).parent / "assets" / "favicon.ico"` and fallback to `apps/web/public/favicon.ico`.
     - If no physical asset file is accessible on disk, the loader MUST dynamically render a high-DPI 3D isometric cube image in PIL using official CAD Engine brand colors (`#2563EB`, `#1D4ED8`, `#3B82F6`) as a programmatic fallback.
   - On macOS, the icon MUST render as a native Menu Bar Extra item.
   - On Windows, the icon MUST reside in the Taskbar Notification Area with balloon notification support.
2. **Tray Context Menu**:
   The tray context menu MUST expose the following actions:
   - **Status Header**: Non-clickable label displaying current connection state (e.g. `"CAD Engine: Connected (v0.2.0-alpha.1)"` or `"CAD Engine: Disconnected"`).
   - **View Pairing Code** (`Ver código de vinculación`): Displays the active pairing code if pending, or the workstation Device ID if already paired.
   - **View Connection Status** (`Ver estado de conexión`): Opens a lightweight HUD dialog displaying Server URL, Workstation Hostname, Device ID, Active Engines (FreeCAD, AutoCAD, Blender), and Heartbeat Latency.
   - **Open Web Dashboard** (`Abrir Panel Web`): Launches the default system browser to the configured server web URL.
   - **Unpair Device...** (`Desvincular equipo...`): Displays a modal confirmation prompt (`"Are you sure you want to disconnect this device? Saved credentials will be removed."`). Upon user confirmation, it revokes the device registration on the API server, deletes credentials from the OS keyring, and resets the agent to unpaired state.
   - **Exit / Quit** (`Salir`): Gracefully terminates polling workers, removes the tray icon, and exits the process.
3. **Thread Safety & macOS Main Thread Guarantee**:
   - On macOS and Windows, the GUI event loop MUST run on the main OS thread to prevent Cocoa/Win32 threading crashes.
   - Network polling and job worker processes MUST run on background threads communicating via thread-safe queues.

#### Scenario: Tray menu opens connection status HUD
- GIVEN the system tray application is running and connected
- WHEN the user clicks "View Connection Status"
- THEN a dialog displays the server URL, device ID, active engines (FreeCAD, AutoCAD, Blender), and last heartbeat latency

#### Scenario: Unpair confirmation revokes credentials and resets state
- GIVEN a paired agent running in the system tray
- WHEN the user selects "Unpair Device..." and confirms the confirmation dialog
- THEN the agent sends a revocation request to the API server, removes the device token from the OS keyring, and transitions to unpaired state

#### Scenario: Graceful exit terminates background poller
- GIVEN the system tray application is running
- WHEN the user selects "Exit"
- THEN the agent stops network polling, unregisters the tray icon, and cleanly exits the process

#### Scenario: Tray icon resolves favicon asset in packaged PyInstaller binary
- GIVEN the agent is running as a packaged PyInstaller executable (`sys.frozen = True`)
- WHEN `get_tray_icon_image()` executes
- THEN it successfully loads the 3D cube icon from `sys._MEIPASS/cadgpt_agent/assets/favicon.ico` without falling back to blank or raising FileNotFoundError
