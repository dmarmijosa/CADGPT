## document-registry (NEW)

Purpose: stable identity for one design across multiple jobs (create → modify → modify).

### Requirement: Document Identity
The system MUST maintain a `documents` table (`id, owner, deviceId, cadId, nativePath, latestMeshPath, createdAt, updatedAt`), keyed by `owner` = OIDC `sub`.
#### Scenario: Create registers a document
- GIVEN an owner creates a design via an MCP tool
- WHEN the create job succeeds
- THEN the system inserts one `documents` row owned by that `sub` and returns its `documentId`
#### Scenario: Modify reuses identity
- GIVEN documentId D owned by the caller
- WHEN the caller invokes a modify tool with D
- THEN the job references D; no new document row is created

### Requirement: Owner-Scoped Access
The system MUST reject any read/write on a `documentId` not owned by the caller's `sub`.
#### Scenario: Cross-owner access denied
- GIVEN D is owned by owner A
- WHEN owner B requests D via any tool
- THEN the system returns not-found/forbidden and enqueues no job

### Requirement: Listing
The system MUST expose `list_documents`, scoped to the caller's own documents.
#### Scenario: List scoped to owner
- GIVEN owner A has 2 documents, owner B has 1
- WHEN A calls list_documents
- THEN the result contains exactly A's 2 documents
