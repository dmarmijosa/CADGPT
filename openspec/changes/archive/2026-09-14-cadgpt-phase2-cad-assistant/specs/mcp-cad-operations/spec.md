## mcp-cad-operations (NEW)

Purpose: many small allowlisted tools replace the single `create_box` tool.

### Requirement: Allowlisted Tool Schemas (no code/path parameters)
Each MCP tool MUST expose a strict Zod schema of typed, bounded parameters (numbers, enums, `deviceId`, `documentId`) and MUST NOT accept a parameter representing code, script text, shell command, or file path.
#### Scenario: Schema rejects code-shaped input
- GIVEN the `create_box` schema
- WHEN a caller supplies an extra free-text/code field
- THEN validation fails and no job is enqueued
#### Scenario: Agent re-validates allowlist
- GIVEN a job payload whose `op` is not in the agent's allowlist
- WHEN the agent receives it
- THEN the agent refuses execution and reports failure without invoking any CAD process

### Requirement: Device and CAD Selection
Each tool MUST resolve a `deviceId` and target CAD before enqueueing; if the caller's device+CAD choice is ambiguous, the tool MUST ask instead of guessing.
#### Scenario: Ambiguous device requires explicit choice
- GIVEN owner has 2 paired devices with the same CAD
- WHEN owner invokes a create tool without `deviceId`
- THEN the tool returns a choice request

### Requirement: Identity From OIDC Subject
Tools MUST derive the owner from the verified OIDC `sub` and MUST NOT accept a username/owner parameter; tools take `deviceId`/`documentId` only.
#### Scenario: Owner not a parameter
- GIVEN any tool schema
- WHEN inspected
- THEN it has no `owner`/`username` field
