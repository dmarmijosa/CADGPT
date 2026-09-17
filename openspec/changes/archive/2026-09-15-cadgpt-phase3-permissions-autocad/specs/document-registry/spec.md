## document-registry (MODIFIED)

Purpose: make `native_path` live for path-bound documents opened via the allowlist (P1).

### Requirement: Native Path Persistence via Agent Results (P1)
`/api/agent/results/:id` MUST accept an optional `nativePath` field and, when present, MUST validate it as a contained, allowlisted path before persisting it to `documents.native_path` for the job's referenced document.
#### Scenario: Results with nativePath persists native_path
- GIVEN a completed job result body containing a valid `nativePath` inside an allowlisted root
- WHEN `/api/agent/results/:id` processes it
- THEN `documents.native_path` is set to that value for the job's document
#### Scenario: Out-of-allowlist nativePath rejected
- GIVEN a result body containing a `nativePath` outside every allowlisted root
- WHEN the endpoint validates it
- THEN the request is rejected and `native_path` is left unchanged

### Requirement: Path-Bound Document Identity (P1)
A document created via the open-by-path tool MUST have `documents.native_path` set non-null immediately upon creation, and every subsequent modify job against that document MUST target the same `native_path`.
#### Scenario: Open-by-path sets native_path on creation
- GIVEN a caller invokes open-by-path with an allowlisted path
- WHEN the document row is created
- THEN `native_path` is non-null and equals the supplied path
#### Scenario: Modify job path matches native_path
- GIVEN path-bound document D with `native_path` P
- WHEN a modify job for D is enqueued
- THEN the job's target path equals P; no alternate path is accepted
