# Design: CAD Engine Governance, Versioning & Security

## Architecture Decisions

| ADR | Decision & Alternatives | Rationale |
|---|---|---|
| **ADR-1: Versioning** | `0.2.0-alpha.1` in npm; PEP 440 `0.2.0a1` in `pyproject.toml`; WiX `0.2.0`. Alt: Uniform string. | MSI requires numeric versions; Python mandates PEP 440. Aligns monorepo cleanly. |
| **ADR-2: Identity** | `APP_VERSION = '0.2.0-alpha.1'` and `SERVER_NAME = 'cad-engine'` in `apps/api/src/version.ts`. Alt: JSON import. | Prevents cross-directory imports in TS NodeNext; feeds `/api/health` and MCP. |
| **ADR-3: AutoCAD Parity** | Document 13-op parity, 3D booleans, transforms, binary STL, DWG/DXF, MASSPROP for Core Console; LT detection-only (`executable=false`). Alt: Legacy copy. | Aligns web/docs with verified engine. LT lacks `accoreconsole.exe`. |
| **ADR-4: Prereleases** | `prerelease: true, draft: false` in `release.yml`. Query `/releases` in `main.py` for first non-draft release. Alt: `/releases/latest`. | `/releases/latest` hides prereleases; drafts hide assets from CLI updaters. |
| **ADR-5: Rebranding & Shims** | Rebrand UI to 'CAD Engine'. Keep `SERVICE = "CADGPT"` in keyring, `cadgpt-agent` alias, `cadgpt-web` client ID. Alt: Full rename. | Prevents invalidating paired OS credentials and breaking scripts. |
| **ADR-6: Governance** | Apache-2.0 `LICENSE` + `SECURITY.md` (0.2.x support, 48h ack, 5d triage, 14d fix, safe harbor). Alt: MIT. | Grants patent rights and retaliation clause; safe harbor protects researchers. |
| **ADR-7: CI/CD Security** | CodeQL (JS/TS, Python) + Dependabot (5 workspace targets). Alt: Single scanner. | Multi-language SAST and automated dependency updates without external SaaS. |

## Data Flow & Architecture

```mermaid
flowchart LR
    V[version.ts] --> H[/api/health] & MCP[/mcp]
    GH[/releases] --> UPD[cadengine update]
    KR[Keyring:CADGPT] --> CLI[cadengine daemon]
    CI[CI/CD] --> CQL[CodeQL] & DEP[Dependabot]
```

## Interfaces & Contracts

### 1. Version Source of Truth (`apps/api/src/version.ts`)
```typescript
export const APP_VERSION = '0.2.0-alpha.1';
export const SERVER_NAME = 'cad-engine';
```
- `GET /api/health`: `{ status: 'ok', version: APP_VERSION }`.
- `new McpServer({ name: SERVER_NAME, version: APP_VERSION })`: Returns `serverInfo` on `initialize`.

### 2. GitHub Releases Query Contract (`agent/cadgpt_agent/main.py`)
```python
GITHUB_RELEASES_URL = "https://api.github.com/repos/dmarmijosa/CADGPT/releases"
# Queries list; returns tag_name of first release where draft is False.
```

### 3. Dependabot Targets (`.github/dependabot.yml`)
Configures 5 weekly targets (`npm` on `/`, `/apps/api`, `/apps/web`; `pip` on `/agent`; `github-actions` on `/`) with `open-pull-requests-limit: 10`.

## File Changes Table

| File Path | Action | Description |
|---|---|---|
| `apps/api/src/version.ts` | Create | Exports `APP_VERSION = '0.2.0-alpha.1'` and `SERVER_NAME = 'cad-engine'`. |
| `apps/api/src/main.ts` | Modify | Uses `version.ts` for health/MCP; preserves `cadgpt-web`. |
| `apps/api/test/health.test.ts` | Create | Verifies `/api/health` returns `0.2.0-alpha.1`. |
| `package.json`, `apps/*/package.json` | Modify | Set version to `0.2.0-alpha.1`. |
| `agent/pyproject.toml` | Modify | Set `version = "0.2.0a1"`; preserve `cadgpt-agent` alias. |
| `agent/cadgpt_agent/__init__.py` | Modify | Export `__version__ = "0.2.0-alpha.1"`. |
| `agent/cadgpt_agent/main.py` | Modify | Set `VERSION = "0.2.0-alpha.1"`; keep `SERVICE = "CADGPT"`; query `/releases`. |
| `packaging/wix/cadengine.wxs`, `windows.iss` | Modify | Set numeric `Version="0.2.0"` in WiX and `AppVersion=0.2.0-alpha.1` in Inno. |
| `apps/web/src/index.html`, `shell/shell.html` | Modify | Rebrand to CAD Engine, badge `v0.2.0-alpha.1`. |
| `apps/web/src/app/pages/home/home.html`, `about/about.html` | Modify | AutoCAD Core Console 13-op parity + binary STL; LT detection-only. |
| `apps/web/src/app/pages/connect/connect.ts` | Modify | Update service snippets to `cadengine.service` and `CADEngineAgent`. |
| `README.md`, `docs/deployment.md` | Modify | Align AutoCAD 13-op parity, binary STL, and CAD Engine branding. |
| `LICENSE` | Create | Apache-2.0 text with patent grant, retaliation, and trademark terms. |
| `SECURITY.md` | Modify | Set 0.2.x support, advisory URL, 48h/5d/14d SLAs, safe harbor. |
| `.github/workflows/codeql.yml` | Create | CodeQL SAST for JS/TS and Python (`security-extended`). |
| `.github/dependabot.yml` | Create | Dependabot schedules for 5 ecosystem targets. |
| `.github/workflows/release.yml` | Modify | Rename job to `release`, publish prerelease (`prerelease: true, draft: false`). |

## Testing Strategy

- **API & MCP**: `npm test -w api` validates `0.2.0-alpha.1` payload and MCP handshake.
- **Agent CLI**: `python -m unittest discover -s agent/tests -v` verifies `cadengine version` and prerelease parsing.
- **Web & Packaging**: `npm test -w web` verifies branding; WiX compilation validates MSI syntax.
- **CI Workflows**: Validate GitHub Actions YAML schemas (`codeql.yml`, `dependabot.yml`, `release.yml`).

## Threat Matrix (STRIDE)

| Threat | STRIDE | Severity | Mitigation |
|---|---|---|---|
| **Submarine Patent Claims** | Legal | High | Apache-2.0 Section 3 patent grant and retaliation clause. |
| **Keyring Credential Loss** | DoS | High | Retain `SERVICE = "CADGPT"` in `main.py` for token storage. |
| **Prerelease Auto-Update 404** | DoS | Medium | Query `/releases` instead of `/releases/latest` for updates. |
| **Vulnerable Dependencies** | Tampering | High | Weekly Dependabot PRs across all 5 workspace ecosystems. |
| **Code Injection Flaws** | Elevation | High | CodeQL SAST on push/PR for TypeScript and Python. |
| **Unauthorized Fork Branding** | Spoofing | Medium | Apache-2.0 Section 6 trademark reservation for CAD Engine / CADGPT. |
