# user-account-lifecycle (NEW)

Purpose: Empower users to exercise their Right to Erasure ("Derecho al olvido" under GDPR/CCPA) by providing a secure account deletion endpoint (`DELETE /api/account`) keyed strictly to the OIDC JWT `sub`, unlinking physical preview meshes from disk, atomically purging SQLite database records across all user-partitioned tables, deleting the user entity via Keycloak Admin REST API, and providing an Angular destructive confirmation dialog requiring the user to type `"ELIMINAR"`.

### Requirement: Authenticated Account Deletion Endpoint (DELETE /api/account)
The NestJS API (`apps/api/`) MUST expose a dedicated account deletion endpoint at `DELETE /api/account` (and alias `DELETE /api/users/me`):
1. **Authentication & Scope Verification**:
   - The endpoint MUST require Bearer authentication via a verified OIDC JWT.
   - The request MUST be authorized for the `cad:write` scope. Unauthenticated requests MUST be rejected with HTTP `401 Unauthorized`, and tokens lacking write permissions MUST be rejected with HTTP `403 Forbidden`.
2. **Strict Identity Derivation (Anti-IDOR Invariant)**:
   - The target account identity MUST be derived exclusively from the token's `sub` claim (`req.user.sub`).
   - The endpoint MUST NOT accept an `owner`, `userId`, or `username` parameter in the URL path, query string, or request body. Any caller attempt to provide a target identifier MUST be ignored or rejected.
3. **Execution Order and Success Response**:
   - The handler MUST coordinate three purge operations in strict order:
     1. Call Keycloak Admin REST API to delete the user identity.
     2. Scan and delete all physical mesh files on disk for the user's jobs and documents.
     3. Execute the atomic SQLite cascade purge across all user-partitioned tables.
   - Upon successful completion of all three stages, the endpoint MUST return HTTP `204 No Content` (or `200 OK` with `{ ok: true }`).

#### Scenario: Unauthenticated deletion request rejected
- GIVEN a request to `DELETE /api/account` without an Authorization header
- WHEN the API evaluates the request
- THEN it immediately responds with HTTP 401 Unauthorized and performs no cleanup

#### Scenario: Token without cad:write scope rejected
- GIVEN a request to `DELETE /api/account` with a JWT containing only `cad:read` scope
- WHEN the API evaluates permissions
- THEN it responds with HTTP 403 Forbidden and makes no changes

#### Scenario: Identity strictly derived from JWT sub claim
- GIVEN a valid token with `sub = "usr-123"` sending `DELETE /api/account?owner=usr-456`
- WHEN the API processes the deletion
- THEN the query parameter is ignored, and only data belonging to `"usr-123"` is purged

#### Scenario: Successful full deletion returns success
- GIVEN an authenticated user with `sub = "usr-valid"`
- WHEN `DELETE /api/account` completes successfully across Keycloak, disk, and SQLite
- THEN the endpoint returns HTTP 204 No Content

---

### Requirement: Keycloak Admin REST API Identity Purge
To prevent orphaned authentication credentials, Keycloak sessions, and brokered social links, the API MUST integrate with Keycloak's Admin REST API:
1. **Admin Client Service (`KeycloakAdminService`)**:
   - The API MUST initialize a `KeycloakAdminService` capable of obtaining an administrative bearer token via the Keycloak OpenID Connect token endpoint (`POST /realms/master/protocol/openid-connect/token` or dedicated confidential service client in the `cadgpt` realm).
2. **User Deletion Invocation**:
   - The service MUST issue `DELETE /admin/realms/{realm}/users/{userId}`, where `{userId}` is the user's `sub` identifier.
3. **Fail-Fast Invariant**:
   - The Keycloak Admin API call MUST execute **before** committing irreversible database deletion.
   - If Keycloak returns an HTTP 5xx server error or encounters a network failure:
     - The deletion flow MUST abort immediately.
     - The API MUST return HTTP `502 Bad Gateway`.
     - The user's database records and disk files MUST remain preserved and uncorrupted.
   - If Keycloak returns `204 No Content` (user deleted) or `404 Not Found` (user was already removed from Keycloak), the flow MUST proceed to filesystem and database deletion.

#### Scenario: Keycloak Admin API purges user identity
- GIVEN an authenticated user with Keycloak user ID matching `sub`
- WHEN `KeycloakAdminService.deleteUser(sub)` is invoked
- THEN Keycloak receives the DELETE request, invalidates all sessions, and deletes the user record

#### Scenario: Keycloak unreachable aborts cascade and returns 502
- GIVEN Keycloak Admin endpoint is temporarily unreachable or returning HTTP 500
- WHEN account deletion is attempted
- THEN the service throws an error, the database transaction is not started, and HTTP 502 Bad Gateway is returned

#### Scenario: Pre-deleted Keycloak entity tolerated gracefully
- GIVEN a user whose Keycloak entity was previously removed by an administrator (`404 Not Found`)
- WHEN account deletion runs
- THEN the service treats 404 as idempotent success and continues with database and disk cleanup

---

### Requirement: Physical Mesh File Unlinking from Disk
The backend MUST ensure that physical preview mesh files (`.stl`) stored on the server's filesystem are removed to prevent storage leaks:
1. **Mesh File Identification**:
   - Prior to deleting database records, the system MUST retrieve all mesh file identifiers belonging to the user:
     `SELECT job_id FROM meshes WHERE document_id IN (SELECT id FROM documents WHERE owner = :owner)`
2. **Filesystem Unlinking**:
   - For each identified `job_id`, the system MUST resolve the full path `<dataDir>/meshes/<jobId>.stl` (and any sibling `.part` temporary upload files).
   - The system MUST unlink each file using safe deletion (`unlinkIfExists`).
   - If a file has already been removed from disk or does not exist, the unlinking function MUST catch `ENOENT` and continue without throwing an error.

#### Scenario: User meshes removed from filesystem
- GIVEN an owner with 4 stored mesh files on disk
- WHEN account deletion executes
- THEN all 4 corresponding `.stl` files are deleted from `<dataDir>/meshes/`

#### Scenario: Missing disk mesh files do not fail deletion
- GIVEN a database record for a mesh whose file was manually deleted from disk
- WHEN account deletion unlinks meshes
- THEN the missing file is skipped gracefully and deletion continues

#### Scenario: Temporary part upload files cleaned up
- GIVEN an incomplete or in-flight upload file `<dataDir>/meshes/<jobId>.part`
- WHEN account deletion unlinks meshes
- THEN the temporary `.part` file is deleted alongside the primary mesh

---

### Requirement: Transactional SQLite Cascade Purge
The persistence layer (`Store.deleteAccount(owner, dataDir)`) MUST execute an atomic, transactional purge across all user-partitioned SQLite tables:
1. **Transactional Boundary**:
   - The cascade MUST execute inside a synchronous `BEGIN IMMEDIATE ... COMMIT` transaction.
2. **Multi-Table Deletion Order**:
   - The deletion MUST cascade through all 7 user tables in referential dependency order:
     1. `DELETE FROM meshes WHERE document_id IN (SELECT id FROM documents WHERE owner = :owner);`
     2. `DELETE FROM documents WHERE owner = :owner;`
     3. `DELETE FROM jobs WHERE owner = :owner;`
     4. `DELETE FROM allowed_roots WHERE owner = :owner;`
     5. `DELETE FROM devices WHERE owner = :owner;`
     6. `DELETE FROM api_keys WHERE owner = :owner;`
     7. `DELETE FROM pairings WHERE owner = :owner;`
3. **Rollback Guarantee**:
   - If any SQL statement encounters a constraint violation or I/O failure, the transaction MUST roll back (`ROLLBACK`), leaving all tables intact.
4. **Tenant Isolation**:
   - The deletion query MUST strictly match `owner = :owner`. Records belonging to other users MUST NOT be affected.

#### Scenario: Atomic purge clears all 7 tables for user
- GIVEN a user with records across pairings, devices, jobs, documents, meshes, allowed_roots, and api_keys
- WHEN `Store.deleteAccount(owner)` executes
- THEN all rows across all 7 tables matching `owner = :owner` are deleted

#### Scenario: Transaction failure rolls back cleanly
- GIVEN a database failure during the execution of one of the deletion statements
- WHEN the exception is raised
- THEN the transaction rolls back completely and no tables suffer partial deletion

#### Scenario: Multi-tenant isolation preserved
- GIVEN two users "owner-A" and "owner-B" with active records
- WHEN account deletion is performed for "owner-A"
- THEN all records for "owner-A" are deleted, and all records for "owner-B" remain unchanged

---

### Requirement: Angular Destructive Confirmation Dialog with Typed Verification
The web dashboard (`apps/web/`) MUST provide an accessible, safe confirmation workflow to prevent accidental account destruction:
1. **Destructive Trigger**:
   - The client MUST expose an "Eliminar cuenta" button in the Account / About settings interface styled with destructive alert styling (`.btn-destructive`, border and text `var(--stitch-alert)` `#EF4444`).
2. **Confirmation Modal Dialog**:
   - Clicking the trigger MUST display a modal dialog detailing the permanent consequences of the action:
     - All CAD documents and 3D preview meshes will be erased.
     - All paired machines and device keys will be revoked.
     - All API keys and job history will be destroyed.
     - The action is irreversible.
3. **Typed Verification Guard ("ELIMINAR")**:
   - The modal MUST contain a text input field requiring the user to type the exact word `"ELIMINAR"` (case-sensitive).
   - The final "Eliminar permanentemente" action button MUST remain disabled until the input value equals `"ELIMINAR"` exactly.
4. **Client Cleanup and Session Termination**:
   - Upon successful execution of `DELETE /api/account`, the client MUST:
     - Call `AuthService.logout()` to destroy the `oidc-client-ts` session.
     - Clear local storage (including tokens, consent records, and cached preferences).
     - Clear session storage.
     - Redirect the browser to the application landing page.

#### Scenario: Deletion button disabled until ELIMINAR is typed
- GIVEN the account deletion dialog open in the web client
- WHEN the user types `"eliminar"` (lowercase) or an incomplete string
- THEN the confirm button remains disabled and non-clickable

#### Scenario: Exact typed match enables deletion action
- GIVEN the user types `"ELIMINAR"` into the verification input
- WHEN the input value is evaluated
- THEN the confirm button is enabled and styled with alert red accent

#### Scenario: Execution triggers backend call, session purge, and redirect
- GIVEN the user clicks the confirmed deletion button
- WHEN the API responds with success
- THEN local tokens and storage are cleared, the user is logged out, and the window redirects to the landing page
