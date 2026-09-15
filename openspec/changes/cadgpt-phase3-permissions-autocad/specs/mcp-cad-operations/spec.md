## mcp-cad-operations (MODIFIED)

Purpose: extend the owner/schema invariants to the new open-by-path tool (P1).

### Requirement: Open-by-Path Tool Owner and Path Invariants (P1)
The open-by-path tool MUST derive `owner` from the verified OIDC `sub` and MUST NOT accept an `owner`/`username` parameter; it MUST validate the supplied path via the agent's containment function before enqueueing, and MUST reject any path not resolvable inside a currently allowlisted root.
#### Scenario: Owner not a parameter
- GIVEN the open-by-path tool schema
- WHEN inspected
- THEN it has no `owner`/`username` field
#### Scenario: Out-of-allowlist path rejected at validation
- GIVEN a path outside every allowlisted root
- WHEN the tool validates the request
- THEN no job is enqueued and no document is created or bound
#### Scenario: Enqueue only after containment passes
- GIVEN a path inside an allowlisted root
- WHEN the tool validates and enqueues
- THEN the resulting job references `native_path`, and owner equals the caller's `sub`
