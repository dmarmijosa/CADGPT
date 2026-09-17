## agent-cli-daemon-lifecycle (MODIFIED)

Purpose: Provide an enterprise-grade command-line interface (`cadengine`) and native background daemon lifecycle management across Windows, Linux, and macOS, packaged with elevated installer and PATH registration, maintaining strict backward compatibility for stored credentials and supporting GitHub prerelease discovery.

### Requirement: Version and Update Notification Subcommand
The `version` subcommand (and `--version` flag) MUST output the current semantic version of `cadengine` as `0.2.0-alpha.1`. The agent package MUST declare `version = "0.2.0a1"` in `agent/pyproject.toml` adhering to PEP 440 pre-release specifications, and export `__version__ = "0.2.0-alpha.1"` in `agent/cadgpt_agent/__init__.py`. When executed interactively or with `--check`, `check_latest_release()` MUST query the GitHub Releases list endpoint (`https://api.github.com/repos/dmarmijosa/CADGPT/releases`) with a 2.5-second network timeout, selecting the first release entry where `draft` is false. If a newer semantic version or prerelease is available, the command MUST print an actionable upgrade advisory. If the check times out or network is unavailable, the command MUST display the local version without failing.
(Previously: The `version` subcommand (and `--version` flag) MUST output the current semantic version of `cadengine`. When executed interactively or with `--check`, it SHOULD query the GitHub Releases endpoint (`https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest`) with a 2.5-second network timeout. If a newer semantic version is available, the command MUST print an actionable upgrade advisory. If the check times out or network is unavailable, the command MUST display the local version without failing.)

#### Scenario: Display local prerelease version string
- GIVEN `cadengine` version `0.2.0-alpha.1` is installed
- WHEN `cadengine version` is executed
- THEN stdout outputs `cadengine v0.2.0-alpha.1`

#### Scenario: Upgrade notification when newer prerelease exists
- GIVEN `cadengine` v0.2.0-alpha.1 is installed and a newer release `v0.2.0-alpha.2` is published on GitHub Releases (`prerelease: true, draft: false`)
- WHEN `cadengine version --check` is executed
- THEN it queries `/releases`, identifies `v0.2.0-alpha.2` as the latest non-draft release, and displays an update notice indicating `v0.2.0-alpha.2` is available

#### Scenario: Graceful fallback when update check is offline
- GIVEN the host has no internet connection
- WHEN `cadengine version --check` is executed
- THEN stdout outputs `cadengine v0.2.0-alpha.1` without throwing an unhandled exception or non-zero exit code

---

### Requirement: Self-Update Subcommand
The `update` subcommand MUST check for published updates against the GitHub Releases API list endpoint (`https://api.github.com/repos/dmarmijosa/CADGPT/releases`), parse the latest published release where `draft` is false (including prereleases), compare semantic versions, and if a newer version is available:
1. Download the release binary or archive matching the host OS and architecture.
2. Verify SHA-256 hash against the published `SHA256SUMS.txt`.
3. Atomically replace the current `cadengine` binary.
4. Trigger a restart of the native background service or Scheduled Task.
If already on the latest version, it MUST exit cleanly with code 0 reporting up to date.
(Previously: The `update` subcommand MUST check for published updates against GitHub Releases API (`https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest`), compare semantic versions, and if a newer version is available: 1. Download the release binary or archive matching the host OS and architecture. 2. Verify SHA-256 hash against the published `SHA256SUMS.txt`. 3. Atomically replace the current `cadengine` binary. 4. Trigger a restart of the native background service or Scheduled Task. If already on the latest version, it MUST exit cleanly with code 0 reporting up to date.)

#### Scenario: Update command updates binary from published prerelease
- GIVEN `cadengine` v0.2.0-alpha.1 is installed and `v0.2.0-alpha.2` is published on GitHub Releases as a non-draft prerelease
- WHEN `cadengine update` is executed
- THEN it queries `/releases`, detects `v0.2.0-alpha.2`, downloads the release asset, validates SHA-256, replaces the local binary, restarts the background service, and outputs `Successfully updated to v0.2.0-alpha.2`

---

### Requirement: OS Keyring Backward-Compatibility Shim and Product Rebranding
The agent CLI and daemon runtime MUST preserve `SERVICE = "CADGPT"` in `agent/cadgpt_agent/main.py` as the storage service key across all OS Keyring operations (Windows Credential Manager, macOS Keychain, Linux SecretService) for storing, retrieving, and wiping device authentication tokens. The CLI MUST NOT migrate or rename the keyring service key to "cadengine", ensuring existing paired device credentials remain valid across upgrades. Concurrently, all user-facing terminal output, log outputs, help texts, and daemon identifiers MUST adopt the unified "CAD Engine" (`cadengine`) branding, while preserving `cadgpt-agent` as a command alias and `user_data_dir("CADGPT")` for application storage compatibility.
(Previously: The `status`, `pair`, and `unpair` subcommands referenced OS Keyring credentials stored under service name `"CADGPT"` without an explicit preservation requirement preventing breaking credential key migrations during product rebranding.)

#### Scenario: Existing paired credentials preserved across upgrade
- GIVEN an agent workstation paired under prior versions with token stored in OS Keyring under service `"CADGPT"`
- WHEN the agent binary is upgraded to `0.2.0-alpha.1` and `cadengine status` or daemon execution runs
- THEN it successfully reads the existing authentication token from OS Keyring under service `"CADGPT"` without requiring re-pairing

#### Scenario: Rebranded CLI output with legacy keyring storage
- GIVEN an unpaired workstation
- WHEN `cadengine pair` successfully completes
- THEN the token is stored in OS Keyring under service `"CADGPT"`, and terminal output displays "CAD Engine" branding and connection links
