## agent-cli-daemon-lifecycle (MODIFIED)

Purpose: Provide an enterprise-grade command-line interface (`cadengine`) and native background daemon lifecycle management across Windows, Linux, and macOS, packaged with elevated installer and PATH registration.

---

### MODIFIED Requirement: Unified CLI Entry Points and Command Dispatch
The agent package MUST expose `cadengine` as the primary executable entry point and MUST preserve `cadgpt-agent` as a backward-compatible alias.
1. **Command Routing**: When a subcommand is specified, the CLI MUST dispatch to the appropriate subcommand handler (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`, `doctor`, `update`).
2. **Foreground Daemon Execution**: When executed without subcommands, the CLI MUST retain default foreground worker execution accepting command-line arguments (`--server`, `--headless`, `--cad-path`, `--allow-file-credentials`, `--enable-autocad`, `--blender-path`).
3. **Universal Production Server Resolution**: The CLI and agent runtime MUST define a universal production server constant `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"`. When neither `--server` nor `config.json["server"]` is provided, the CLI MUST default connectivity to `DEFAULT_SERVER`.
4. **Elimination of Interactive Server Prompts**: The CLI and foreground loops MUST NOT present blocking graphical dialogs (such as Tkinter simpledialog `askstring`) or terminal text prompts (`input()`) to solicit server URLs during foreground worker startup or unattended execution.

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

#### Scenario: Foreground loop defaults to universal production server without interactive prompts
- GIVEN the CLI binary is invoked as `cadengine` with no `--server` argument and no server URL stored in `config.json`
- WHEN the foreground worker initializes
- THEN it resolves target server to `https://cadengine.danny-armijos.com` and begins worker execution without prompting the user via `askstring` or terminal `input()`

---

### MODIFIED Requirement: Interactive and Headless Device Pairing Subcommand
The `pair` subcommand MUST purge any existing credential for the target server, initiate the device pairing handshake against `/api/pairings`, and output the 12-character verification code and verification URL to stdout:
1. **Server URL Resolution**: If `--server` is omitted and no server is configured in `config.json`, the command MUST automatically resolve the target server to `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"`. The command MUST NOT solicit the server URL via interactive terminal prompts (`input()`).
2. **Browser Launch**: Unless `--headless` is passed, the command MUST attempt to launch the host system's default web browser to the verification URL (`/pair`).
3. **Approval Polling & Credential Storage**: The command MUST poll `/api/pairings/poll` until confirmed or expired. Upon confirmation, the CLI MUST securely persist the bearer token in the OS Keyring under service `"CADGPT"`, store `deviceId` and `server` in `config.json`, and output the post-pairing connect URL.

#### Scenario: Interactive pairing flow with browser launch
- GIVEN an unpaired workstation with a graphical display
- WHEN `cadengine pair --server https://cadengine.example.com` is run
- THEN it prints the 12-character verification code, launches the default browser to `/pair`, polls the server until authorized, and stores the resulting token in the OS Keyring

#### Scenario: Headless pairing flow
- GIVEN a headless workstation or remote SSH session
- WHEN `cadengine pair --server https://cadengine.example.com --headless` is run
- THEN it displays the verification code and URL on the terminal without attempting to launch a browser, and polls until authorization completes

#### Scenario: Pairing without server flag defaults to production server without terminal prompts
- GIVEN an unpaired workstation where neither `--server` is supplied nor is a server specified in `config.json`
- WHEN `cadengine pair` is executed
- THEN it initiates the pairing handshake directly against `https://cadengine.danny-armijos.com` without prompting the user via terminal `input()`
