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
   - The step MUST display detection status for FreeCAD and AutoCAD across Windows, Linux, and macOS.
   - Progression MUST be strictly blocked unless at least one valid CAD kernel is verified.
3. **Step 3 — Blender Tool Discovery & Configuration**:
   - The wizard MUST probe for a local Blender installation.
   - If detected, the wizard MUST display the detected executable path and enable Blender capabilities.
   - If not detected, the wizard MUST present explicit user options to install Blender, configure a custom path, or proceed without it.
4. **Step 4 — Server Pairing, Workspace Display & Startup Enrollment**:
   - The wizard MUST request an ephemeral 12-character pairing code from the configured API server (`POST /api/pairings`).
   - The wizard MUST display the pairing code, provide a one-click button to open the web dashboard pairing page in the default web browser, and poll the server for user approval.
   - **Local Workspace Working Directory**: Step 4 MUST explicitly display the active local CAD workspace working directory (`%LOCALAPPDATA%\CADGPT\jobs` on Windows, `~/Library/Application Support/CADGPT/jobs` on macOS, or `~/.local/share/CADGPT/jobs` on Linux), clarifying that all CAD project files, solids, and intermediate exports remain strictly local.
   - Upon confirmed pairing, the wizard MUST save the device credentials to the OS secure keyring (`keyring`), save the device configuration, and configure native background execution.

#### Scenario: First launch runs onboarding wizard when credentials are absent
- GIVEN the agent executable is launched interactively without existing keyring credentials
- WHEN the application initializes
- THEN it opens the 4-step onboarding wizard starting on Step 1 (Language & Welcome)

#### Scenario: Language toggle updates wizard text dynamically
- GIVEN the onboarding wizard is open in English
- WHEN the user clicks the Spanish language toggle ("Español")
- THEN all visible step headings, instructions, button labels, and descriptions immediately switch to Spanish without restarting the application

#### Scenario: Approved pairing advances to completion and launches tray
- GIVEN the user is on Step 4 viewing the 12-character pairing code
- WHEN the user approves the pairing in the web dashboard
- THEN the background polling loop detects approval, stores credentials in the OS keyring, closes the wizard, and launches the persistent system tray icon

#### Scenario: Step 4 displays active local workspace directory
- GIVEN the user advances to Step 4 of the onboarding wizard
- WHEN the step renders
- THEN it displays a dedicated workspace information card showing the absolute path to the local CAD workspace (`.../CADGPT/jobs`) and confirming local drawing persistence

---

### MODIFIED Requirement: Hard CAD Prerequisite Verification Gate
The onboarding wizard MUST enforce a non-bypassable verification gate requiring at least one verified parametric CAD kernel (FreeCAD or AutoCAD) across Windows, Linux, and macOS:
1. **Blocking Condition**: If local discovery detects neither FreeCAD nor AutoCAD on the host workstation:
   - The "Next" / "Siguiente" progression button MUST be strictly disabled.
   - If the user attempts to proceed, the wizard MUST display an explanatory alert stating that CAD Engine requires FreeCAD or AutoCAD for precision 3D engineering geometry.
2. **Guided Multi-OS Installation Commands**:
   - The wizard MUST provide OS-specific guided installation commands with an interactive copy button and official web download links:
     - **Windows**: Command `winget install FreeCAD.FreeCAD` and link to official FreeCAD download page.
     - **macOS**: Command `brew install --cask freecad` and link to official FreeCAD DMG installer.
     - **Linux**: Command `sudo apt install freecad` (or distribution equivalent) and Flathub package link.
3. **Instant Re-Check Capability**:
   - The wizard MUST provide a dedicated "Re-check / Volver a comprobar" button.
   - Clicking this button MUST trigger immediate re-discovery of host CAD installations in-memory (`refresh_discovery()`) without restarting the wizard, resetting state, or discarding user input.
   - Once a supported CAD kernel is detected, the blocking gate MUST immediately clear and the "Next" button MUST become enabled.

#### Scenario: Wizard blocks advancement when no CAD kernel is detected
- GIVEN a host computer with neither FreeCAD nor AutoCAD installed
- WHEN Step 2 executes discovery
- THEN the step displays a missing prerequisite alert, disables the "Next" progression button, and shows guided installation commands for the current OS

#### Scenario: Re-check unblocks wizard upon FreeCAD installation
- GIVEN the wizard is currently blocked on Step 2
- WHEN the user installs FreeCAD on the host machine and clicks "Re-check"
- THEN discovery detects the newly installed FreeCAD binary, updates the status indicator to verified, and enables the "Next" button

#### Scenario: Host with AutoCAD detected passes prerequisite gate
- GIVEN a host workstation with AutoCAD detected via registry
- WHEN Step 2 executes discovery
- THEN the step marks AutoCAD as verified and allows immediate progression to Step 3

#### Scenario: Multi-OS CAD blocking across Linux and macOS
- GIVEN a macOS or Linux host lacking FreeCAD
- WHEN Step 2 renders
- THEN it displays `brew install --cask freecad` (on macOS) or `sudo apt install freecad` (on Linux) with an interactive copy button and keeps the progression button disabled until installed

---

### MODIFIED Requirement: Blender Tool Discovery and Path Configuration
The onboarding wizard MUST detect local Blender installations while providing flexible configuration, guided installation UX, and opt-out mechanics:
1. **Automated Discovery**:
   - The wizard MUST probe standard system locations:
     - Windows: `C:\Program Files\Blender Foundation\Blender*\blender.exe`, `%LOCALAPPDATA%\Programs\Blender Foundation\...`, and `PATH`.
     - macOS: `/Applications/Blender.app/Contents/MacOS/Blender`, `~/Applications/...`, and `PATH`.
     - Linux: `/usr/bin/blender`, `/usr/local/bin/blender`, `/snap/bin/blender`, `flatpak`.
2. **Missing Blender Handling & Guided Installation UX**:
   - If Blender is not detected, the wizard MUST NOT block progression and MUST present explicit user options:
     - **"Instalar Blender" / "Install Blender" Button**: A prominent action button that launches the official Blender download portal (`https://www.blender.org/download/`) or opens the platform package installer.
     - **OS-Specific Guided Install Commands**: Display copyable platform installation commands (`winget install BlenderFoundation.Blender` on Windows, `brew install --cask blender` on macOS, `sudo apt install blender` on Linux) with an interactive copy button.
     - **Custom Path Browser**: A browse button allowing the user to select a custom `blender` executable anywhere on the filesystem.
     - **Instant Re-Check**: A dedicated "Re-check / Volver a comprobar" button that refreshes local discovery in-memory without resetting wizard state.
     - **"Continue without Blender"**: Allows the user to opt out. Blender tools remain disabled, and the agent completes onboarding with CAD capabilities only.
3. **User-Level Path Configuration**:
   - If the user selects a custom Blender executable located outside the system `PATH`:
     - The agent MUST attempt to append the directory to the user environment `PATH` without requiring administrator (UAC) elevation.
     - If environment modification is restricted or fails, the agent MUST persist the absolute path in the user configuration file `config.json["blenderPath"]`.
     - The agent MUST use `config.json["blenderPath"]` as a primary invocation target during headless execution.

#### Scenario: Discovered Blender is automatically activated
- GIVEN Blender is installed in a standard program directory
- WHEN Step 3 runs
- THEN the wizard displays the detected Blender version and path, pre-selecting it as enabled

#### Scenario: User configures custom Blender binary without admin elevation
- GIVEN Blender is installed in a custom non-PATH folder
- WHEN the user browses and selects the Blender executable
- THEN the agent saves the absolute path into `config.json["blenderPath"]` and marks Blender as ready without requesting UAC admin elevation

#### Scenario: User opts out of Blender and completes onboarding
- GIVEN Blender is not installed on the workstation
- WHEN the user selects "Continue without Blender" and proceeds
- THEN the agent registers device capabilities advertising FreeCAD/AutoCAD operations while excluding Blender operations

#### Scenario: User installs Blender via guided action and clicks Re-check
- GIVEN Blender is initially missing on Step 3
- WHEN the user clicks "Install Blender", installs the package via the guided command, and clicks "Re-check"
- THEN discovery detects Blender, displays its version and executable path, and marks 3D organic modeling as ready

---

### MODIFIED Requirement: Background System Tray Application
The agent MUST provide a background system tray process using `pystray` to maintain workstation connectivity and lifecycle management:
1. **Visual Identity**:
   - The tray icon MUST use the CAD Engine 3D isometric cube logo derived from `favicon.ico` / PNG assets.
   - On macOS, the icon MUST render as a native Menu Bar Extra item.
   - On Windows, the icon MUST reside in the Taskbar Notification Area with balloon notification support.
2. **Tray Context Menu**:
   The tray context menu MUST expose the following actions:
   - **Status Header**: Non-clickable label displaying current connection state (e.g. `"CAD Engine: Connected (v0.2.0-alpha.1)"` or `"CAD Engine: Disconnected"`).
   - **View Pairing Code** (`Ver código de vinculación`): Displays the active pairing code if pending, or the workstation Device ID if already paired.
   - **View Connection Status** (`Ver estado de conexión`): Opens a lightweight HUD dialog displaying Server URL, Workstation Hostname, Device ID, Active Engines (FreeCAD, AutoCAD, Blender), Heartbeat Latency, and **Active Workspace Directory** (`%LOCALAPPDATA%\CADGPT\jobs` on Windows, `~/Library/Application Support/CADGPT/jobs` on macOS, or `~/.local/share/CADGPT/jobs` on Linux).
   - **Open Web Dashboard** (`Abrir Panel Web`): Launches the default system browser to the configured server web URL.
   - **Unpair Device...** (`Desvincular equipo...`): Displays a modal confirmation prompt (`"Are you sure you want to disconnect this device? Saved credentials will be removed."`). Upon user confirmation, it revokes the device registration on the API server, deletes credentials from the OS keyring, and resets the agent to unpaired state.
   - **Exit / Quit** (`Salir`): Gracefully terminates polling workers, removes the tray icon, and exits the process.
3. **Thread Safety & macOS Main Thread Guarantee**:
   - On macOS and Windows, the GUI event loop MUST run on the main OS thread to prevent Cocoa/Win32 threading crashes.
   - Network polling and job worker processes MUST run on background threads communicating via thread-safe queues.

#### Scenario: Tray menu opens connection status HUD with workspace directory
- GIVEN the system tray application is running and connected
- WHEN the user clicks "View Connection Status"
- THEN a dialog displays the server URL, device ID, active engines (FreeCAD, AutoCAD, Blender), last heartbeat latency, and the absolute path to the local CAD workspace working directory

#### Scenario: Unpair confirmation revokes credentials and resets state
- GIVEN a paired agent running in the system tray
- WHEN the user selects "Unpair Device..." and confirms the confirmation dialog
- THEN the agent sends a revocation request to the API server, removes the device token from the OS keyring, and transitions to unpaired state

#### Scenario: Graceful exit terminates background poller
- GIVEN the system tray application is running
- WHEN the user selects "Exit"
- THEN the agent stops network polling, unregisters the tray icon, and cleanly exits the process
