# Deploy a CAD Agent Designer server before distributing agents

The GitHub repository hosts source and downloadable agents, not a running authentication or relay service.

## Production checklist

1. Provision a persistent server with Node 24 and HTTPS reverse proxy; run `npm ci && npm run build`.
2. Deploy Keycloak separately with its supported production database, TLS hostname, backups, SMTP, email verification and appropriate registration policy. **Do not deploy the supplied start-dev container to the Internet.**
3. Create the `cadgpt-web` public OAuth client using authorization code flow and required S256 PKCE. Disable password/direct grants.
4. Allow only `https://YOUR_CADGPT_HOST/callback` as redirect URI and the exact dashboard origin. Configure the logout return URI.
5. Create `cad:read` and `cad:write` client scopes and include them in access tokens. Add an audience mapper for `cadgpt-api`.
6. Set `PUBLIC_ORIGIN`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `DATA_DIR` and optionally `OIDC_JWKS_URL`. Start `npm start` from the repository root. Keep the API bound to loopback behind the proxy.
7. Route the dashboard, `/api`, `/mcp` and `/.well-known/oauth-protected-resource/mcp` to NestJS. Preserve Authorization headers. Disable caching for API/auth responses. Add request/body/rate limits at the proxy.
8. Link two test accounts with separate agents. Verify account A cannot list, revoke or submit jobs to B's device. Test revocation and expired pairing.
9. Test native unsigned packages on disposable machines before publishing an alpha release.

Do not enable wildcard redirects or pass-through access tokens intended for another API. The backend derives ownership exclusively from the verified JWT subject.

## Configuration

The API validates its environment once at process start (`apps/api/src/config/envs.ts`) and fails fast — with a `Config validation error: ...` message — if a required variable is missing or malformed. Copy `.env.example` to `.env` at the repository root before running `npm start`/`npm run dev`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PUBLIC_ORIGIN` | Yes | — | Public origin of the dashboard/API, must be a valid URI. Non-loopback origins must use `https:`. |
| `OIDC_ISSUER` | Yes | — | Keycloak realm issuer URL, must be a valid URI. Non-loopback issuers must use `https:`. |
| `OIDC_AUDIENCE` | Yes | — | Expected audience claim on access tokens (e.g. `cadgpt-api`). |
| `HOST` | No | `127.0.0.1` | Interface the API listens on. |
| `PORT` | No | `3000` | Port the API listens on. |
| `OIDC_JWKS_URL` | No | `${OIDC_ISSUER}/protocol/openid-connect/certs` | Override only if the identity provider exposes JWKS at a non-standard path. |
| `DATA_DIR` | No | `<repo-root>/data` (resolved relative to the process working directory) | Where the SQLite store and job files are written. |
| `NODE_ENV` | No | `development` | One of `development`, `production`, `test`. |

## Production on the VPS via GitHub Actions

`.github/workflows/deploy.yml` builds the server image, pushes it to GHCR, and deploys the stack (API + Keycloak + Postgres) to the VPS behind Easypanel's Traefik at `https://cadengine.danny-armijos.com`. It runs on every push to `main` and on manual dispatch.

### Prerequisites (one-time, manual)

1. **DNS**: create an A record for `cadengine.danny-armijos.com` pointing at `212.227.108.141` in Netlify DNS.
2. **SSH deploy key**: generate a dedicated key pair and install the public key for the `deployer` user on the VPS (`~deployer/.ssh/authorized_keys`). `deployer` already has passwordless `sudo`.
3. **GitHub secrets** (`gh secret set <NAME>` from the repo root, or *Settings → Secrets and variables → Actions*):

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | VPS hostname or IP, e.g. `212.227.108.141` |
   | `DEPLOY_USER` | `deployer` |
   | `DEPLOY_SSH_KEY` | Private half of the deploy key pair (PEM, keep the trailing newline) |
   | `KC_BOOTSTRAP_ADMIN_PASSWORD` | A generated password for the Keycloak `admin` bootstrap account |
   | `KC_DB_PASSWORD` | A generated password for the Keycloak Postgres role |

   ```bash
   gh secret set DEPLOY_HOST --body "212.227.108.141"
   gh secret set DEPLOY_USER --body "deployer"
   gh secret set DEPLOY_SSH_KEY < path/to/deploy_key
   gh secret set KC_BOOTSTRAP_ADMIN_PASSWORD --body "$(openssl rand -base64 24)"
   gh secret set KC_DB_PASSWORD --body "$(openssl rand -base64 24)"
   ```

   There is no `DEPLOY_SSH_KNOWN_HOSTS` secret: the workflow runs `ssh-keyscan` against `DEPLOY_HOST` at deploy time instead. That avoids maintaining a pinned host-key secret for a single static VPS; the trade-off is no protection against a MITM on the very first connection from a given runner.
4. Create a `production` GitHub Environment (*Settings → Environments*) if you want approval/protection rules on deploys; the workflow targets it but works without extra rules configured.

### What the pipeline does

1. **build**: checks out, builds the image from the root `Dockerfile`, and pushes `ghcr.io/dmarmijosa/cadgpt:sha-<short>` and, on `main`, `:latest`.
2. **deploy** (needs `build`, `environment: production`): copies `deploy/prod/compose.yaml`, `deploy/prod/cadgpt-realm.prod.json` and `deploy/prod/traefik-cadgpt.yml` to `/opt/cadgpt` on the VPS, writes `/opt/cadgpt/.env` (mode 600) from the secrets above plus the resolved image tag, installs the Traefik dynamic config at `/etc/easypanel/traefik/config/cadgpt.yml`, logs in to GHCR on the VPS with the workflow's own `GITHUB_TOKEN`, and runs `docker compose pull && up -d --remove-orphans`. It then probes `https://cadengine.danny-armijos.com/` with retries; a failed probe only warns, since DNS/ACME may still be propagating on a first deploy.

### First deploy

1. Wait for DNS to resolve and for Traefik to obtain a certificate (the health probe warning tells you if this is still in progress; retry `curl -I https://cadengine.danny-armijos.com/`).
2. Log in to the Keycloak admin console at `https://cadengine.danny-armijos.com/auth/admin` with the bootstrap admin account, then set a permanent admin password and disable further use of the bootstrap credentials.
3. Follow [Connect an MCP client](#connect-an-mcp-client) below to register the OAuth client(s) ChatGPT/Claude will use — this is not automated by the realm import.

### Rollback

Re-run the workflow via `workflow_dispatch` with the `image_tag` input set to a previously built tag (e.g. `sha-abc1234`, visible in the GHCR package list or a prior workflow run). This writes that tag into `/opt/cadgpt/.env` and re-runs `docker compose up -d` — no rebuild needed. Alternatively, SSH in and edit `CADGPT_IMAGE_TAG` in `/opt/cadgpt/.env` directly, then `sudo docker compose -f /opt/cadgpt/compose.yaml up -d`.

Keycloak realm changes are **not** rolled back this way: `start --import-realm` only imports on first boot (when the `cadgpt` realm does not yet exist), so later edits to `deploy/prod/cadgpt-realm.prod.json` require either deleting the realm first or applying the change through the admin console/API on the running instance.

### Operational notes

- **RAM budget**: roughly 3 GB available on the VPS; Keycloak is capped at 1 GB (`deploy.resources.limits.memory` in `deploy/prod/compose.yaml`), leaving headroom for the API, Postgres and Easypanel/Traefik itself.
- **Logs**: `sudo docker compose -f /opt/cadgpt/compose.yaml logs -f [cadgpt-api|cadgpt-keycloak|cadgpt-keycloak-db]`.
- **Backups**: back up the `cadgpt-data` volume (SQLite store) and the `keycloak-db-data` volume (Postgres) regularly — both hold identity-linked data. Example: `sudo docker run --rm -v cadgpt_cadgpt-data:/data -v $PWD:/backup alpine tar czf /backup/cadgpt-data.tgz -C / data` (adjust the volume name prefix to match `docker volume ls`).

## Connect an MCP client

Endpoint: `https://YOUR_CADGPT_HOST/mcp`. Transport: stateless Streamable HTTP (POST). OAuth protected resource metadata: `https://YOUR_CADGPT_HOST/.well-known/oauth-protected-resource/mcp`.

Tools:
- `list_devices`: requires `cad:read`.
- `list_jobs`: requires `cad:read`.
- `create_box`: requires `cad:read cad:write`, exact device/CAD IDs, numeric dimensions and explicit `confirmed: true`.

Register a **separate OAuth client for each AI integration** in the identity provider:
1. Obtain the exact redirect URI and client-authentication method required by the target ChatGPT/Claude integration UI.
2. Register only that redirect URI; enable code flow and PKCE as supported/required by that client. Do not reuse the browser client's ID or ship a client secret in Angular.
3. Assign the CAD scopes and `cadgpt-api` audience mapper to its access tokens. Turn on user consent for the integration.
4. Configure the integration with the public MCP endpoint, registered client ID and (only if the client requires confidential authentication) its secret in the integration's secure server-side configuration.
5. Sign in as the same CAD Agent Designer account that approved the device. Consent to the requested permissions.
6. First test `list_devices`; then explicitly authorize a small box on a disposable FreeCAD workspace.

Client setup screens, plan availability and OAuth registration requirements vary. Automatic dynamic client registration is **not implemented** here. Do not enable unrestricted dynamic registration as a shortcut. If the selected client cannot use a pre-registered OAuth client with this provider, stop and implement/test the required authorization integration before advertising compatibility.

MCP is implemented using the official TypeScript SDK v1.30 maintenance line. The handler authenticates every request and creates no cross-user MCP session. ChatGPT/Claude live account integration remains a deployment acceptance test, not a completed certification.

### The dashboard's guided step

After a device is paired and approved, its owner can open `/connect` in the dashboard for a
copy-pasteable resource URL and the same Claude/ChatGPT steps summarized above, plus a live status
card for the paired computer. That page is a client-side walkthrough only — it does not replace the
OAuth client registration steps above, and it never displays a device secret or credential, only
the device's UUID and the public MCP URL. See the [mesh preview exception](../README.md#security-and-limitations)
for what a connected client can retrieve today, and note that AutoCAD remains detection-only (no
execution adapter shipped yet) regardless of which client connects.

## Operational boundaries

Polling runs every five seconds while the foreground agent is alive. No auto-start service is installed. A job is accepted only if its device recently polled. Work claimed before disconnection is not requeued; an unknown outcome needs human inspection of local files.

The backend stores paths reported by devices for selection and displays local output paths in results. Treat device metadata as private account data. Use short retention policies before production; this alpha has no automatic job-history purge. SQLite and Keycloak contain identity-linked data requiring access controls and backups.

Official references:
- [Angular signal forms](https://angular.dev/guide/forms/signals/overview)
- [NestJS](https://docs.nestjs.com/)
- [Keycloak containers](https://www.keycloak.org/server/containers)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [PyInstaller operating modes](https://pyinstaller.org/en/stable/operating-mode.html)
