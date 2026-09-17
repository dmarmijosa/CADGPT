# Tasks: CAD Engine Governance, Versioning & Security

Source specs: `agent-cli-daemon-lifecycle`, `autocad-execution-adapter`, `governance-security-supplychain`, `mcp-client-onboarding` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-governance-versioning-security/specs) (read-only).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~550 lines across 4 units |
| Review budget | 400 lines per PR |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes — 4 branch sequence |
| Chain strategy | feature-branch-chain |
| Delivery strategy | ask-on-risk |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium
```

## Work Units Summary

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| WU1 | Polyglot Versioning & API/MCP | `npm test -w apps/api -- test/health.test.ts` | Node.js & Python CLI | Revert `version.ts`, manifests, packaging |
| WU2 | AutoCAD Parity & Docs | `npm test -w apps/web` | Angular SSR & Docs | Revert HTML pages, `README.md` |
| WU3 | Release Policy & Prereleases | `python -m unittest agent.tests.test_agent -v` | GitHub Actions & HTTP | Revert `release.yml`, `main.py` |
| WU4 | Governance, Security & CI/CD | `npm test` | CodeQL & Dependabot | Remove `LICENSE`, `SECURITY.md`, CI YAMLs |

---

## Work Unit 1: Polyglot Versioning & API/MCP Centralization

- [x] 1.1 Create [`apps/api/src/version.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/version.ts) exporting [`APP_VERSION`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/version.ts#L1) = `'0.2.0-alpha.1'` and [`SERVER_NAME`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/version.ts#L2) = `'cad-engine'`.
- [x] 1.2 Update [`apps/api/src/main.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts) to serve `APP_VERSION` on `GET /api/health` and instantiate `McpServer` with `SERVER_NAME` and `APP_VERSION`.
- [x] 1.3 Update version to `0.2.0-alpha.1` in [`package.json`](file:///Users/danny/Documents/ChatGPT/CADGPT/package.json), [`apps/api/package.json`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/package.json), and [`apps/web/package.json`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/package.json).
- [x] 1.4 Update [`agent/pyproject.toml`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml) (`version = "0.2.0a1"`), [`agent/cadgpt_agent/__init__.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/__init__.py) (`__version__ = "0.2.0-alpha.1"`), and [`agent/cadgpt_agent/main.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py) (`VERSION = "0.2.0-alpha.1"`).
- [x] 1.5 Update [`packaging/wix/cadengine.wxs`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/wix/cadengine.wxs) (`Version="0.2.0"`) and [`packaging/windows.iss`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) (`AppVersion=0.2.0-alpha.1`).
- [x] 1.6 Update brand text to "CAD Engine" and version badge to `v0.2.0-alpha.1` in [`apps/web/src/app/layout/shell/shell.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.html).
- [x] 1.7 Create test [`apps/api/test/health.test.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/health.test.ts) verifying `GET /api/health` status 200 with `0.2.0-alpha.1` and MCP server metadata.

## Work Unit 2: AutoCAD 2026 Core Console Parity & Documentation Overhaul

- [x] 2.1 Overhaul copy in [`apps/web/src/app/pages/home/home.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/home/home.html) for AutoCAD 2026 Core Console 13-op parity, 3D booleans, binary STL, DWG/DXF, MASSPROP, and LT detection-only.
- [x] 2.2 Overhaul copy in [`apps/web/src/app/pages/about/about.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.html) and [`README.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/README.md) for 13-op Core Console execution and LT detection-only disclaimer.

## Work Unit 3: GitHub Release Policy & Prerelease Discovery

- [x] 3.1 Update [`.github/workflows/release.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml) setting `prerelease: true, draft: false` and rename job to `release`.
- [x] 3.2 Update [`agent/cadgpt_agent/main.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py) `check_latest_release()` to query GitHub releases endpoint and select first non-draft release.
- [x] 3.3 Author unit tests in [`agent/tests/test_agent.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_agent.py) validating prerelease discovery against mocked GitHub Releases responses.

## Work Unit 4: Open-Source Governance, Security Policy & CI/CD

- [x] 4.1 Create root [`LICENSE`](file:///Users/danny/Documents/ChatGPT/CADGPT/LICENSE) with Apache License 2.0 text, patent grants, retaliation terms, and trademark reservations.
- [x] 4.2 Create [`SECURITY.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/SECURITY.md) defining 0.2.x support window, GitHub advisory channel, 48h/5d/14d/90d SLAs, and safe harbor.
- [x] 4.3 Create [`.github/workflows/codeql.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/codeql.yml) configuring CodeQL SAST for `javascript-typescript` and `python` using `security-extended`.
- [x] 4.4 Create [`.github/dependabot.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/dependabot.yml) with weekly updates across root npm, apps/api, apps/web, agent pip, and github-actions.
