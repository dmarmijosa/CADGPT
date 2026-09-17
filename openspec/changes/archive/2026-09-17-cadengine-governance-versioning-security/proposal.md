# Proposal: CAD Engine Governance, Versioning & Security

## Intent
Unify versioning to `0.2.0-alpha.1`, standardize branding to "CAD Engine", document AutoCAD 2026 Core Console 13-op parity, adopt Apache-2.0 with vulnerability SLAs, and automate CodeQL/Dependabot.

## Scope

### In Scope
- **Version Unification**: Monorepo alignment to `0.2.0-alpha.1` (`0.2.0a1` in `pyproject.toml`, `0.2.0` in WiX).
- **API & MCP**: Centralize `apps/api/src/version.ts`; return `cad-engine` and `0.2.0-alpha.1` on `/api/health` and MCP.
- **AutoCAD Parity**: Document Core Console 13-op parity and binary STL preview in web and README; retain LT detection-only.
- **Release Strategy**: Set `prerelease: true, draft: false` in `release.yml`; update CLI updater to query `/releases`.
- **Branding & Shims**: Unify title to CAD Engine; retain `cadgpt-agent` alias, `CADGPT` keyring, and `cadgpt-web` client ID.
- **License & Security**: Add Apache-2.0 `LICENSE`; add `SECURITY.md` (0.2.x support, 48h/5d/14d SLAs, safe harbor).
- **CI/CD**: Add `codeql.yml` (JS/TS, Python) and `dependabot.yml`.

### Out of Scope
- AutoCAD LT headless execution.
- Keyring migration away from `CADGPT`.
- Modifying Keycloak client ID.

## Capabilities

### New Capabilities
- `governance-security-supplychain`: Apache-2.0 license, vulnerability SLAs, safe harbor, CodeQL, and Dependabot.

### Modified Capabilities
- `openspec/specs/autocad-execution-adapter`: Core Console 13-op parity and binary STL preview copy.
- `openspec/specs/agent-cli-daemon-lifecycle`: Version `0.2.0-alpha.1`, prerelease updater query, and keyring shim.
- `openspec/specs/mcp-client-onboarding`: MCP server name `cad-engine` and version `0.2.0-alpha.1`.

## Affected Areas

| Area | Changes |
|---|---|
| Manifests | Root `package.json`, `apps/*/package.json`, `agent/pyproject.toml`, packaging |
| `apps/api/` | `src/version.ts`, `src/main.ts`, `src/mcp.ts`, health test |
| `apps/web/` | Brand shell, index title, `home.html`, `about.html`, specs |
| `agent/` | `__init__.py`, `main.py` release check, version tests |
| Docs/Legal | `LICENSE`, `SECURITY.md`, `README.md`, `docs/deployment.md` |
| CI/CD | `codeql.yml`, `dependabot.yml`, `release.yml` |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Keyring credential loss | Preserve `SERVICE = "CADGPT"` in `main.py` |
| WiX MSI schema error | Keep numeric `Version="0.2.0"` in `cadengine.wxs` |
| Auto-updater 404 | Query `/releases` instead of `/releases/latest` |
| Script breakage | Retain `cadgpt-agent` alias in `pyproject.toml` |

## Rollback Plan
- **Manifests**: Revert versions across package manifests and `version.ts`.
- **Workflows**: Delete `codeql.yml` and `dependabot.yml`.
- **Releases**: Revert `release.yml` and `main.py`.
- **Legal**: Remove `LICENSE` and revert `SECURITY.md`.

## Success Criteria
- [ ] Manifests and CLI declare `0.2.0-alpha.1` (`0.2.0a1` in PEP 440).
- [ ] `/api/health` and MCP return `cad-engine` and `0.2.0-alpha.1`.
- [ ] Web and README document AutoCAD Core Console 13-op parity.
- [ ] CLI update check detects GitHub prereleases.
- [ ] `cadgpt-agent` alias and `CADGPT` keyring work.
- [ ] Apache-2.0 `LICENSE` and `SECURITY.md` SLAs exist.
- [ ] CodeQL and Dependabot validate cleanly.
- [ ] `npm test` and Python unit tests pass.
