## agent-cli-daemon-lifecycle (NEW)

Purpose: Provide an enterprise-grade command-line interface (`cadengine`) and native background daemon lifecycle management across Windows, Linux, and macOS, packaged with elevated installer and PATH registration.

### Requirement: Unified CLI Entry Points and Command Dispatch
The agent package MUST expose `cadengine` as the primary executable entry point and MUST preserve `cadgpt-agent` as a backward-compatible alias. When executed without subcommands, the CLI MUST retain default foreground worker execution accepting legacy command-line arguments (`--server`, `--headless`, `--cad-path`, `--allow-file-credentials`, `--enable-autocad`). When a subcommand is specified, the CLI MUST dispatch to the appropriate subcommand handler (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`).

#### Scenario: Default foreground daemon execution without subcommand
- GIVEN the CLI binary is invoked as `cadengine --server https://example.com/api` without a subcommand
- WHEN argument parsing completes
- THEN it executes the foreground worker loop connecting to `https://example.com/api`

#### Scenario: Backward compatibility alias execution
- GIVEN the CLI binary is invoked as `cadgpt-agent status`
- WHEN argument parsing completes
- THEN it executes the `status` subcommand identically to `cadengine status`

#### Scenario: Unknown subcommand rejection
- GIVEN the CLI binary is invoked with an unrecognized subcommand `cadengine invalid-cmd`
- WHEN argument parsing executes
- THEN the CLI exits with non-zero status and outputs command usage information to stderr

---

### Requirement: Diagnostic Status Subcommand
The `status` subcommand MUST inspect the local host environment and output a structured diagnostic report. It MUST verify:
1. Host operating system, architecture, and Python runtime version.
2. Configuration file presence and server endpoint setting (`config.json`).
3. OS Keyring credentials stored under service name `"CADGPT"`.
4. Server reachability, HTTP latency, and TLS validity via a probe to `/api/health`.
5. Detected local CAD installations and executable capabilities via `discover()`.
6. Native OS background service / scheduled task registration and running status.
The subcommand MUST support a `--json` flag to emit raw JSON. The CLI MUST exit with code 0 if the agent is configured and the server is reachable, or code 1 if credentials are missing or the server cannot be reached.

#### Scenario: Healthy agent diagnostic check
- GIVEN an agent configured with valid credentials in OS Keyring and a reachable server
- WHEN `cadengine status` is executed
- THEN it prints green health indicators for configuration, keyring, server latency, and CAD discovery, and exits with code 0

#### Scenario: Missing credentials diagnostic check
- GIVEN an agent host with no stored credentials in the OS Keyring
- WHEN `cadengine status` is executed
- THEN it reports that the device is unpaired, highlights missing credentials, and exits with code 1

#### Scenario: Machine-readable JSON output
- GIVEN any agent installation
- WHEN `cadengine status --json` is executed
- THEN stdout contains valid JSON with keys `host`, `config`, `keyring`, `server`, `cads`, and `service`

---

### Requirement: Version and Update Notification Subcommand
The `version` subcommand (and `--version` flag) MUST output the current semantic version of `cadengine`. When executed interactively or with `--check`, it SHOULD query the GitHub Releases endpoint (`https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest`) with a 2.5-second network timeout. If a newer semantic version is available, the command MUST print an actionable upgrade advisory. If the check times out or network is unavailable, the command MUST display the local version without failing.

#### Scenario: Display local version string
- GIVEN `cadengine` version 0.2.0 is installed
- WHEN `cadengine version` is executed
- THEN stdout outputs `cadengine v0.2.0`

#### Scenario: Upgrade notification when newer release exists
- GIVEN `cadengine` v0.2.0 is installed and GitHub latest release is v0.3.0
- WHEN `cadengine version --check` is executed
- THEN stdout outputs the current version and displays an update notice indicating v0.3.0 is available

#### Scenario: Graceful fallback when update check is offline
- GIVEN the host has no internet connection
- WHEN `cadengine version --check` is executed
- THEN stdout outputs `cadengine v0.2.0` without throwing an unhandled exception or non-zero exit code

---

### Requirement: Interactive and Headless Device Pairing Subcommand
The `pair` subcommand MUST purge any existing credential for the target server, initiate the device pairing handshake against `/api/pairings`, and output the 12-character verification code and verification URL to stdout. Unless `--headless` is passed, the command MUST attempt to launch the host system's default web browser to the verification URL. The command MUST poll `/api/pairings/poll` until confirmed or expired. Upon confirmation, the CLI MUST securely persist the bearer token in the OS Keyring under service `"CADGPT"`, store `deviceId` and `server` in `config.json`, and output the post-pairing connect URL.

#### Scenario: Interactive pairing flow with browser launch
- GIVEN an unpaired workstation with a graphical display
- WHEN `cadengine pair --server https://cadengine.example.com` is run
- THEN it prints the 12-character verification code, launches the default browser to `/pair`, polls the server until authorized, and stores the resulting token in the OS Keyring

#### Scenario: Headless pairing flow
- GIVEN a headless workstation or remote SSH session
- WHEN `cadengine pair --server https://cadengine.example.com --headless` is run
- THEN it displays the verification code and URL on the terminal without attempting to launch a browser, and polls until authorization completes

---

### Requirement: Self-Service Device Unpairing and Local Credential Wipe
The `unpair` subcommand MUST read the stored server URL and device token, and perform an authenticated HTTP `POST /api/agent/unpair` with `Authorization: Bearer <token>`. The server MUST mark the device record as revoked (`revoked = 1`) and cancel any queued jobs for the device. Whether the server API call succeeds, times out, or fails, `cadengine unpair` MUST unconditionally delete the secret from the OS Keyring (`keyring.delete_password("CADGPT", server)`), remove any fallback file credentials, and delete `deviceId` from `config.json`.

#### Scenario: Clean online device unpairing
- GIVEN a paired device with valid credentials in the OS Keyring
- WHEN `cadengine unpair` is executed
- THEN the agent sends `POST /api/agent/unpair`, the server revokes the device, the local keyring secret is deleted, `deviceId` is removed from `config.json`, and exit code is 0

#### Scenario: Offline unpairing performs unconditional local purge
- GIVEN a paired device where the server is unreachable
- WHEN `cadengine unpair --force` is executed
- THEN the network error is logged as a warning, local OS Keyring credentials and `config.json` device state are unconditionally wiped, and exit code is 0

---

### Requirement: Rotating File Logging and Inspection Subcommand
The agent MUST configure file-based rotating logging via `logging.handlers.RotatingFileHandler` targeting `logs/cadengine.log` under the platform user data directory (`user_data_dir("CADGPT")`). The logger MUST cap file size at 5 MB per file and retain 3 rotated backups (`cadengine.log.1`, etc.).
The `logs` subcommand MUST output log entries:
1. `cadengine logs` MUST output the last N lines (default 50, configurable via `-n`).
2. `cadengine logs -f` MUST stream newly appended log entries in real time until interrupted by SIGINT (Ctrl+C).

#### Scenario: Log file rotation at size limit
- GIVEN the active log file reaches 5,242,880 bytes
- WHEN a new log record is emitted
- THEN the current log file is rolled over to `cadengine.log.1` and a new `cadengine.log` is opened

#### Scenario: View recent log entries
- GIVEN existing log file with 200 lines
- WHEN `cadengine logs -n 20` is executed
- THEN the last 20 log lines are printed to stdout

#### Scenario: Live tail streaming of logs
- GIVEN `cadengine logs -f` is active
- WHEN new log events occur in the background worker
- THEN new lines immediately appear on stdout until the user terminates the command

---

### Requirement: Offline CAD Worker Smoke Test Subcommand
The `test` subcommand MUST verify local CAD worker execution without requiring network connectivity or server dispatch. The command MUST execute `discover()` and, for each executable CAD engine detected (or the specific engine targeted via `--cad <freecad|autocad>`), execute an isolated benchmark in a temporary directory (`tempfile.TemporaryDirectory()`). The test runner MUST pass a synthetic `request.json` (creating a standard solid and exporting STL), invoke the strategy subprocess with a 30-second timeout, and assert that:
1. The subprocess exits with code 0.
2. The native project file (`design.FCStd` or `design.dwg`) is generated.
3. A non-empty binary `preview.stl` is generated.
The CLI MUST print elapsed execution timing and exit with code 0 if all tested CAD engines pass, or code 1 if any engine fails.

#### Scenario: Successful FreeCAD smoke test
- GIVEN a host with `freecadcmd` discovered and executable
- WHEN `cadengine test --cad freecad` is executed
- THEN it runs the synthetic test in a temp directory, verifies `design.FCStd` and `preview.stl`, prints execution duration, and exits with code 0

#### Scenario: Smoke test failure reports detailed diagnostics
- GIVEN a CAD binary that crashes or returns non-zero during test execution
- WHEN `cadengine test` is executed
- THEN stdout displays the subprocess stderr output, marks the test as failed, and exits with code 1

---

### Requirement: Native OS Daemon Management
The `service` subcommand (`install`, `start`, `stop`, `status`, `uninstall`) MUST manage the background worker according to the host platform's native service supervisor:
1. **Windows**: The command MUST manage a Windows Scheduled Task named `"CADEngineAgent"` configured with `/SC ONLOGON` and `/RL LIMITED` using `schtasks.exe`. The command MUST NOT install a Session 0 Windows Service (`sc.exe`), ensuring the daemon runs inside the interactive user desktop session (Session 1+) with access to the Windows Credential Manager keyring and user-profile CAD licensing.
2. **Linux**: The command MUST generate and manage a user systemd service file at `~/.config/systemd/user/cadengine.service` managed via `systemctl --user`.
3. **macOS**: The command MUST generate and manage a user LaunchAgent property list at `~/Library/LaunchAgents/com.cadengine.agent.plist` managed via `launchctl`.

#### Scenario: Windows service installation creates ONLOGON task
- GIVEN a Windows host
- WHEN `cadengine service install` is executed
- THEN it executes `schtasks /Create /TN "CADEngineAgent" /TR "\"<path>\cadengine.exe\"" /SC ONLOGON /RL LIMITED /F` and confirms task creation

#### Scenario: Linux service installation creates systemd unit
- GIVEN a Linux host with systemd
- WHEN `cadengine service install` is executed
- THEN it writes `~/.config/systemd/user/cadengine.service`, runs `systemctl --user daemon-reload`, and enables the service unit

#### Scenario: macOS service installation creates LaunchAgent plist
- GIVEN a macOS host
- WHEN `cadengine service install` is executed
- THEN it writes `~/Library/LaunchAgents/com.cadengine.agent.plist` and loads it via `launchctl`

#### Scenario: Querying background service status
- GIVEN an installed and running background service
- WHEN `cadengine service status` is executed
- THEN it queries the platform supervisor and outputs whether the daemon is active, stopped, or uninstalled

---

### Requirement: WiX v4 Elevated MSI Installer with PATH Registration
Windows distribution MUST provide an MSI installer built with WiX Toolset v4 producing `CADEngine-Setup-x64.msi`. The installer MUST:
1. Require administrative elevation via User Account Control (UAC) at install time.
2. Install the application payload into `%ProgramFiles%\CAD Engine\`.
3. Add `%ProgramFiles%\CAD Engine\` to the system-wide `PATH` environment variable using MSI's standard `<Environment>` element.
4. Provide CustomActions that register the `ONLOGON` Scheduled Task upon installation and delete the Scheduled Task upon uninstallation.
5. Upon MSI uninstallation, cleanly remove all installed files, restore the system `PATH`, and leave no orphaned service tasks.

#### Scenario: Elevated MSI installation registers binary and PATH
- GIVEN a Windows 64-bit machine running `CADEngine-Setup-x64.msi`
- WHEN installation completes with administrative elevation
- THEN `cadengine.exe` exists in `%ProgramFiles%\CAD Engine\`, `%ProgramFiles%\CAD Engine\` is added to system `PATH`, and the `CADEngineAgent` logon task is registered

#### Scenario: MSI uninstallation cleanly removes application and PATH
- GIVEN an installed CAD Engine MSI package
- WHEN the user uninstalls CAD Engine via Windows Settings / Add or Remove Programs
- THEN the installation directory is deleted, the directory is removed from system `PATH`, and the scheduled task is removed

---

### Requirement: System Doctor and Auto-Remediation Subcommand
The `doctor` subcommand MUST execute an end-to-end diagnostic roadmap verifying each critical stage of the CADEngine operational lifecycle:
1. Network and TLS handshake to the configured server origin.
2. Device credential authentication and active paired registration status.
3. Background daemon / Scheduled Task running health and process responsiveness.
4. CAD backend availability probing for FreeCAD (`FreeCADCmd` / `freecadcmd`) and AutoCAD (`accoreconsole.exe`).
If NO CAD backend is detected, the `doctor` command MUST report the exact missing dependency and provide automated remediation (`cadengine doctor --fix` or interactive prompt) to provision a standalone headless FreeCAD environment via Conda/Miniforge or platform package manager, append the environment to `~/.conda/environments.txt`, and automatically re-run the doctor probe without disrupting existing running processes.

#### Scenario: Doctor passes with all checks green
- GIVEN an agent host with valid credentials, running daemon, and FreeCAD installed
- WHEN `cadengine doctor` is executed
- THEN it outputs checkmarks for Server, Auth, Service, and CAD Engine, exiting with code 0

#### Scenario: Doctor detects missing CAD and auto-provisions FreeCAD
- GIVEN an agent host connected to server but lacking FreeCAD or AutoCAD
- WHEN `cadengine doctor --fix` is executed
- THEN it detects the absence of a CAD backend, installs headless FreeCAD in a dedicated environment, registers it in `environments.txt`, and re-runs the probe reporting all checks passed

---

### Requirement: Self-Update Subcommand
The `update` subcommand MUST check for published updates against GitHub Releases API (`https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest`), compare semantic versions, and if a newer version is available:
1. Download the release binary or archive matching the host OS and architecture.
2. Verify SHA-256 hash against the published `SHA256SUMS.txt`.
3. Atomically replace the current `cadengine` binary.
4. Trigger a restart of the native background service or Scheduled Task.
If already on the latest version, it MUST exit cleanly with code 0 reporting up to date.

#### Scenario: Update command updates binary and restarts service
- GIVEN `cadengine` v0.1.0 is installed and v0.2.0 is published on GitHub Releases
- WHEN `cadengine update` is executed
- THEN it downloads v0.2.0, validates SHA-256, replaces the local binary, restarts the background service, and outputs `Successfully updated to v0.2.0`

