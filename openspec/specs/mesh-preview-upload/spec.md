## mesh-preview-upload (NEW)

Purpose: agent uploads STL (not GLB — GLB export unproven headless) to the API for preview.

### Requirement: Device-Authenticated Upload
The API MUST expose a binary upload route authenticated by the existing device-credential bearer scheme (not OIDC).
#### Scenario: Valid device uploads mesh
- GIVEN a paired, non-revoked device credential
- WHEN the agent POSTs a binary STL for a completed job
- THEN the API stores it under `DATA_DIR/meshes` with a job-bound name and updates the document's `latestMeshPath`

### Requirement: Size Cap and Per-Device Quota
The API MUST reject uploads over a fixed per-file cap and enforce a per-device storage quota, independent of the 32 kb JSON limit.
#### Scenario: Oversized upload rejected
- GIVEN a file over the configured cap
- WHEN uploaded
- THEN the API rejects it and stores nothing
#### Scenario: Quota exceeded rejected
- GIVEN a device at its quota
- WHEN it uploads another mesh
- THEN the API rejects the request

### Requirement: Owner-Scoped Retrieval
The API MUST serve a stored mesh only to the OIDC-authenticated owner of its document.
#### Scenario: Non-owner cannot fetch mesh
- GIVEN a mesh belonging to owner A's document
- WHEN owner B requests it
- THEN the API returns not-found/forbidden

### Requirement: Job-Bound File Naming
Stored file names MUST derive from the job/document id server-side, never from a client-supplied name or path.
#### Scenario: Client-supplied name ignored
- GIVEN an upload with an arbitrary filename header
- WHEN stored
- THEN the stored path uses only the server-derived job-bound name
