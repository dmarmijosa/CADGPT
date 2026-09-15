## file-permissions-allowlist (NEW)

Purpose: let an owner authorize the agent to open/modify existing files in specific folders, in place, without relaxing the UUID sandbox. Prerequisite: Spike B (allowlist delivery staleness + revocation-mid-job semantics) is confirmed and locked (2026-09-15): staleness ≤ 5s (heartbeat poll interval), running jobs complete, containment re-checked at next execution.

### Requirement: Allowed-Roots Storage (P1)
The system MUST persist an `allowed_roots` table scoped per `deviceId` and per `owner` (OIDC `sub`), storing at minimum `id, owner, deviceId, path, createdAt`, additive to and independent from the UUID document sandbox.
#### Scenario: Root stored per owner and device
- GIVEN owner A adds root R for device D
- WHEN the row is persisted
- THEN it is keyed to owner A and device D only
#### Scenario: Root invisible to other owners
- GIVEN R belongs to owner A
- WHEN owner B lists allowed roots for device D
- THEN R is absent from B's result

### Requirement: OIDC-Only Allowlist Management API (P1)
The system MUST expose add/list/remove endpoints for `allowed_roots` gated by OIDC session auth only (not device credential or API key), and MUST derive `owner` strictly from the verified OIDC `sub`; the request body MUST NOT set `owner`.
#### Scenario: Add derives owner from session
- GIVEN an authenticated OIDC session for sub S
- WHEN S calls add-root with a body containing no owner field
- THEN the stored row's owner is S
#### Scenario: Body-supplied owner rejected
- GIVEN a request body containing an `owner` field different from the session `sub`
- WHEN the add-root endpoint validates it
- THEN the request is rejected or the field is ignored; the row's owner remains the session `sub`
#### Scenario: Device credential cannot manage allowlist
- GIVEN a request authenticated only by device credential/API key
- WHEN it calls add/list/remove on `allowed_roots`
- THEN the system returns 401/403 and no row changes

### Requirement: Heartbeat Delivery of Allowlist (P1)
The heartbeat response MUST include the calling device's current `allowed_roots` snapshot alongside `{ job }`, refreshed each poll interval (staleness bounded to ≤ 5s). A job running at the moment of root revocation MUST be permitted to complete; the revoked root is excluded on the subsequent heartbeat poll and containment is re-checked at the next job execution.
#### Scenario: Heartbeat carries allowlist snapshot
- GIVEN device D has 2 allowed roots
- WHEN D polls heartbeat
- THEN the response contains `{ job, allowedRoots }` with both roots
#### Scenario: Revocation reflected within 5-second poll window
- GIVEN a root is removed via the management API
- WHEN D next polls heartbeat (within 5s)
- THEN the removed root is absent from `allowedRoots`; a job already mid-execution against the revoked root completes, while any subsequent execution re-checks containment and rejects paths under the revoked root

### Requirement: Agent Path Containment Function (P1)
The agent MUST implement a NEW containment function, parallel to and independent from `resolve_document_dir`, that canonicalizes the caller-supplied path, resolves symlinks/junctions via `.resolve()`, and authorizes it only when the fully resolved path is inside at least one currently-allowlisted root; it MUST reject any UNC path whose resolved target is not itself inside an allowlisted root.
#### Scenario: Canonical path inside root accepted
- GIVEN root R is allowlisted and path P resolves strictly inside R
- WHEN the containment function checks P
- THEN it returns authorized
#### Scenario: Symlink/junction escape rejected
- GIVEN P is a symlink whose resolved target is outside every allowlisted root
- WHEN the containment function checks P
- THEN it returns denied and no file operation proceeds
#### Scenario: UNC path outside allowlist rejected
- GIVEN P is a UNC path resolving outside every allowlisted root
- WHEN the containment function checks P
- THEN it returns denied

### Requirement: Backup-Before-Modify (P1)
Before any in-place modify writes to an allowlisted file, the agent MUST create a recoverable backup of the original file first; if the modify subprocess fails or exceeds the 120s timeout, the agent MUST abort leaving no partial corruption, restoring the original from backup if any partial write occurred.
#### Scenario: Backup created before write
- GIVEN a validated modify job against an allowlisted file
- WHEN the worker begins the operation
- THEN a backup copy exists before any write to the original path
#### Scenario: Timeout aborts without corruption
- GIVEN the modify subprocess exceeds 120s
- WHEN the agent times it out
- THEN the original file is restored from backup and reports unchanged, not partially written
#### Scenario: Failed op restores from backup
- GIVEN the modify subprocess exits non-zero
- WHEN the agent handles the failure
- THEN the original file matches the pre-operation backup

### Requirement: Open-by-Path MCP Tool (P1)
The system MUST expose an MCP tool that binds a document to a caller-supplied path by validating containment via the agent's function before any open, then sets `documents.native_path`; owner MUST derive from the OIDC subject and never from a tool parameter.
#### Scenario: Open-by-path binds native_path
- GIVEN a path inside an allowlisted root
- WHEN the caller invokes the open-by-path tool
- THEN a document row is created/updated with `native_path` set to that path, owned by the caller's `sub`
#### Scenario: Path outside allowlist rejected
- GIVEN a path outside every allowlisted root
- WHEN the tool validates it
- THEN no job is enqueued and no document is bound

### Requirement: Save-Back to Same Path (P1)
A modify job against a path-bound document MUST save the result back to that document's `native_path` only, and MUST re-verify containment immediately before writing.
#### Scenario: Modify saves to original path
- GIVEN a path-bound document D with `native_path` P
- WHEN a modify job for D succeeds
- THEN the output is written to P, not any other location
#### Scenario: Drifted native_path blocks save
- GIVEN P no longer resolves inside any currently allowlisted root
- WHEN the save-back step re-checks containment
- THEN the write is aborted and the job reports failure
