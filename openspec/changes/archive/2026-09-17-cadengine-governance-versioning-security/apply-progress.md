# Apply Progress — cadengine-governance-versioning-security

## Work Unit 1: Polyglot Versioning & API/MCP Centralization (Completed)

### Summary
Work Unit 1 aligns the monorepo versioning to `0.2.0-alpha.1` across polyglot boundaries (TypeScript NodeNext, Python PEP 440, Windows WiX v4, and Inno Setup), centralizes version and server identity in `apps/api/src/version.ts`, serves `APP_VERSION` on `GET /api/health`, initializes `McpServer` with `SERVER_NAME = 'cad-engine'` and `APP_VERSION = '0.2.0-alpha.1'`, updates the web shell brand text to "CAD Engine" and badge to `v0.2.0-alpha.1`, and validates all behavior with focused automated tests.

### Completed Tasks
- [x] **1.1** Created [`apps/api/src/version.ts`](apps/api/src/version.ts) exporting [`APP_VERSION`](apps/api/src/version.ts#L1) = `'0.2.0-alpha.1'` and [`SERVER_NAME`](apps/api/src/version.ts#L2) = `'cad-engine'`.
- [x] **1.2** Updated [`apps/api/src/main.ts`](apps/api/src/main.ts) to serve `APP_VERSION` on `GET /api/health` and instantiate `McpServer` with `SERVER_NAME` and `APP_VERSION`.
- [x] **1.3** Updated version to `0.2.0-alpha.1` in [`package.json`](package.json), [`apps/api/package.json`](apps/api/package.json), and [`apps/web/package.json`](apps/web/package.json).
- [x] **1.4** Updated [`agent/pyproject.toml`](agent/pyproject.toml) (`version = "0.2.0a1"`), [`agent/cadgpt_agent/__init__.py`](agent/cadgpt_agent/__init__.py) (`__version__ = "0.2.0-alpha.1"`), and [`agent/cadgpt_agent/main.py`](agent/cadgpt_agent/main.py) (`VERSION = "0.2.0-alpha.1"`).
- [x] **1.5** Updated [`packaging/wix/cadengine.wxs`](packaging/wix/cadengine.wxs) (`Version="0.2.0"`) and [`packaging/windows.iss`](packaging/windows.iss) (`AppVersion=0.2.0-alpha.1`).
- [x] **1.6** Updated brand text to "CAD Engine" and version badge to `v0.2.0-alpha.1` in [`apps/web/src/app/layout/shell/shell.html`](apps/web/src/app/layout/shell/shell.html) and aligned assertions in [`apps/web/src/app/layout/shell/shell.spec.ts`](apps/web/src/app/layout/shell/shell.spec.ts).
- [x] **1.7** Created test [`apps/api/test/health.test.ts`](apps/api/test/health.test.ts) verifying `GET /api/health` status 200 with `0.2.0-alpha.1` and MCP server metadata.

### Files Changed
- [`apps/api/src/version.ts`](apps/api/src/version.ts) (created)
- [`apps/api/src/main.ts`](apps/api/src/main.ts)
- [`package.json`](package.json)
- [`apps/api/package.json`](apps/api/package.json)
- [`apps/web/package.json`](apps/web/package.json)
- [`agent/pyproject.toml`](agent/pyproject.toml)
- [`agent/cadgpt_agent/__init__.py`](agent/cadgpt_agent/__init__.py)
- [`agent/cadgpt_agent/main.py`](agent/cadgpt_agent/main.py)
- [`packaging/wix/cadengine.wxs`](packaging/wix/cadengine.wxs)
- [`packaging/windows.iss`](packaging/windows.iss)
- [`apps/web/src/app/layout/shell/shell.html`](apps/web/src/app/layout/shell/shell.html)
- [`apps/web/src/app/layout/shell/shell.spec.ts`](apps/web/src/app/layout/shell/shell.spec.ts)
- [`apps/api/test/health.test.ts`](apps/api/test/health.test.ts) (created)

---

## Work Unit 2: AutoCAD 2026 Core Console Parity & Documentation Overhaul (Completed)

### Summary
Work Unit 2 overhauls user-facing documentation and frontend interfaces to accurately represent AutoCAD 2026 Core Console (`accoreconsole.exe`) execution capabilities. It communicates full 13-operation parity (3D primitives: box, cylinder, sphere, cone, extrude; 3D booleans: cut, union, intersect; transforms: translate, rotate, scale; AutoLISP `read_scene`; MASSPROP volumetric verification) on Windows with native DWG/DXF artifact delivery and headless binary STL mesh preview via non-interactive `_STLOUT`. It explicitly documents AutoCAD LT as detection-only (`executable=false`) due to the absence of `accoreconsole.exe` and lack of 3D solid/STLOUT support. All corresponding web unit tests in Angular were updated and validated.

### Completed Tasks
- [x] **2.1** Overhauled copy in [`apps/web/src/app/pages/home/home.html`](apps/web/src/app/pages/home/home.html) for AutoCAD 2026 Core Console 13-op parity, 3D booleans, binary STL preview via STLOUT, DWG/DXF, MASSPROP, and LT detection-only disclaimer, with automated DOM test assertions in [`apps/web/src/app/pages/home/home.spec.ts`](apps/web/src/app/pages/home/home.spec.ts).
- [x] **2.2** Overhauled copy in [`apps/web/src/app/pages/about/about.html`](apps/web/src/app/pages/about/about.html) (compatibility table, status, and CAD Engine branding) with DOM test assertions in [`apps/web/src/app/pages/about/about.spec.ts`](apps/web/src/app/pages/about/about.spec.ts), updated [`README.md`](README.md) (header, compatibility table, AutoCAD experimental 13-op section, MCP client architecture), and updated [`docs/deployment.md`](docs/deployment.md).

### Files Changed
- [`apps/web/src/index.html`](apps/web/src/index.html)
- [`apps/web/src/app/pages/home/home.html`](apps/web/src/app/pages/home/home.html)
- [`apps/web/src/app/pages/home/home.spec.ts`](apps/web/src/app/pages/home/home.spec.ts)
- [`apps/web/src/app/pages/about/about.html`](apps/web/src/app/pages/about/about.html)
- [`apps/web/src/app/pages/about/about.spec.ts`](apps/web/src/app/pages/about/about.spec.ts)
- [`README.md`](README.md)
- [`docs/deployment.md`](docs/deployment.md)
- [`openspec/changes/cadengine-governance-versioning-security/tasks.md`](openspec/changes/cadengine-governance-versioning-security/tasks.md)

---

## Work Unit 3: GitHub Release Policy & Prerelease Discovery (Completed)

### Summary
Work Unit 3 aligns GitHub Actions release automation with prerelease delivery requirements and upgrades the CAD Engine agent update subsystem to discover and handle published GitHub prereleases. The release workflow (`.github/workflows/release.yml`) was renamed to `release` and configured to publish non-draft prereleases (`--prerelease`, `draft: false`). The agent CLI (`agent/cadgpt_agent/main.py`) was updated to point `GITHUB_RELEASES_URL` at `https://api.github.com/repos/dmarmijosa/CADGPT/releases`, enhance `parse_semver` to compare prerelease precedence, and update both `check_latest_release()` and `cmd_update()` to handle list responses and select the first non-draft release. Comprehensive unit tests were authored in `agent/tests/test_agent.py` validating prerelease discovery, draft release filtering, upgrade notifications, and self-update flows against mocked GitHub Releases list responses.

### Completed Tasks
- [x] **3.1** Updated [`.github/workflows/release.yml`](.github/workflows/release.yml) setting `prerelease: true, draft: false` via `gh release create --prerelease` and renamed job from `draft` to `release`.
- [x] **3.2** Updated [`agent/cadgpt_agent/main.py`](agent/cadgpt_agent/main.py) `GITHUB_RELEASES_URL` to `https://api.github.com/repos/dmarmijosa/CADGPT/releases`, updated `parse_semver()` for prerelease precedence, and updated `check_latest_release()` and `cmd_update()` to parse list responses selecting the first non-draft release.
- [x] **3.3** Authored unit tests in [`agent/tests/test_agent.py`](agent/tests/test_agent.py) validating prerelease discovery, draft release skipping, upgrade notifications, SemVer prerelease precedence, and `cadengine update` replacement against mocked GitHub Releases list responses.

### Files Changed
- [`.github/workflows/release.yml`](.github/workflows/release.yml)
- [`agent/cadgpt_agent/main.py`](agent/cadgpt_agent/main.py)
- [`agent/tests/test_agent.py`](agent/tests/test_agent.py)
- [`openspec/changes/cadengine-governance-versioning-security/tasks.md`](openspec/changes/cadengine-governance-versioning-security/tasks.md)

---

## Work Unit 4: Open-Source Governance, Security Policy & CI/CD (Completed)

### Summary
Work Unit 4 establishes foundational open-source governance, vulnerability management, multi-language static security analysis, and automated dependency maintenance for CAD Engine. The project root now includes the canonical Apache License 2.0 with copyright attribution, patent grants, patent retaliation terms, and trademark reservations for CAD Engine and CADGPT. `SECURITY.md` was upgraded with a formal supported version window (0.2.x active, older EOL), dual intake channels (GitHub Private Vulnerability Reporting and `security@cadengine.dev`), explicit response SLAs (48h acknowledgment, 5d triage, 14d critical fix, 90d embargo), and comprehensive Safe Harbor protections under CFAA and DMCA for good-faith researchers, while preserving existing CAD execution sandbox guidance. In `.github/workflows/codeql.yml`, multi-language CodeQL SAST is configured for `javascript-typescript` and `python` with the `security-extended` query suite across pushes, pull requests to main, and a weekly Monday cron. In `.github/dependabot.yml`, automated weekly dependency updates and PR grouping are configured across 5 workspace targets (root npm, apps/api, apps/web, agent pip, and github-actions). All test suites (Node.js API, Angular web, Python agent) and formatting checks pass cleanly.

### Completed Tasks
- [x] **4.1** Created root [`LICENSE`](LICENSE) with canonical Apache License 2.0 text, copyright header (`Copyright 2026 CAD Engine Contributors`), patent grants (Section 3), retaliation terms, and trademark reservations (Section 6).
- [x] **4.2** Updated [`SECURITY.md`](SECURITY.md) defining 0.2.x supported versions table, GitHub Private Vulnerability Reporting channel, security email (`security@cadengine.dev`), response SLAs (48h acknowledgment, 5d triage, 14d critical fix, 30d medium/low fix, 90d embargo), and explicit Safe Harbor protections, while preserving existing CAD sandbox guidance.
- [x] **4.3** Created [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) configuring CodeQL SAST matrix for `javascript-typescript` and `python` with `security-extended` query suite, triggered on push to `main` and `codex/**`, pull request targeting `main`, and weekly cron (`0 6 * * 1`).
- [x] **4.4** Created [`.github/dependabot.yml`](.github/dependabot.yml) with weekly updates and grouped PRs across 5 targets: root npm (`/`), backend API npm (`/apps/api`), web frontend npm (`/apps/web`), agent pip (`/agent`), and CI/CD (`/` github-actions).

### Files Changed
- [`LICENSE`](LICENSE) (created)
- [`SECURITY.md`](SECURITY.md)
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) (created)
- [`.github/dependabot.yml`](.github/dependabot.yml) (created)
- [`openspec/changes/cadengine-governance-versioning-security/tasks.md`](openspec/changes/cadengine-governance-versioning-security/tasks.md)

---

## Work Unit Evidence Table

| Work Unit | Assigned Tasks | Goal | Focused Test Command | Result | Rollback Boundary |
|---|---|---|---|---|---|
| **WU1** | 1.1 - 1.7 | Polyglot Versioning & API/MCP Centralization | `npm test -w apps/api -- test/health.test.ts` | **PASS** (126/126 passed, 0 failed; all 4 health/MCP tests verified) | Revert `version.ts`, manifests, packaging, and shell updates |
| **WU2** | 2.1 - 2.2 | AutoCAD 2026 Parity & Documentation Overhaul | `npm test -w apps/web -- --watch=false` | **PASS** (84/84 passed, 0 failed; all home & about DOM specs verified) | Revert `home.html`, `about.html`, `home.spec.ts`, `about.spec.ts`, `index.html`, `README.md`, `docs/deployment.md` |
| **WU3** | 3.1 - 3.3 | Release Policy & Prerelease Discovery | `PATH=.venv/bin:$PATH python3 -m unittest agent/tests/test_agent.py -v` | **PASS** (53/53 passed, 0 failed; all prerelease discovery and update tests verified) | Revert `release.yml`, `main.py`, `test_agent.py` |
| **WU4** | 4.1 - 4.4 | Open-Source Governance, Security Policy & CI/CD | `npm test && PATH=.venv/bin:$PATH python3 -m unittest discover -s agent/tests -v && npm run format:check` | **PASS** (126 api tests, 84 web tests, 243 python tests passed, 0 failed; Prettier code style verified) | Remove `LICENSE`, `codeql.yml`, `dependabot.yml`; revert `SECURITY.md` |
