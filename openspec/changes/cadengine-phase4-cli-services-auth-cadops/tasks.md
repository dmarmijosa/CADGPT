# Tasks: CAD Engine Phase 4 — CLI, Daemons, Social Auth & CAD Ops

Source specs: `social-authentication`, `freecad-execution`, `mcp-cad-operations`, `cad-discovery`, `agent-cli-daemon-lifecycle` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-phase4-cli-services-auth-cadops) (read-only).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~1,500 lines across 4 work units |
| Review budget | 400 lines per PR slice |
| 400-line budget risk | High |
| Chained PRs recommended | Yes — 4 sequenced feature branches |
| Chain strategy | feature-branch-chain |
| Delivery strategy | ask-on-risk |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

## Work Units Summary

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| WU1 | Social Auth & Stitch UI | `docker compose -f deploy/compose.yaml config` | Keycloak login redirect | Revert realm JSONs & `stitch.css` |
| WU2 | 5 Advanced FreeCAD Ops | `npm test -w apps/api -- tools-b2 && python -m unittest discover -s agent/tests -v` | FreeCAD worker execution | Revert `ops-allowlist.json`, schemas, worker |
| WU3 | Agent CLI Evolution | `npm test -w apps/api -- unpair && python -m unittest agent.tests.test_agent -v` | CLI subcommands & API unpair | Revert CLI entry points & unpair route |
| WU4 | Daemons & Packaging | `python packaging/build.py --dry-run` | Launchctl, systemd, task scheduler | Revert WiX script, ISS, and daemon handlers |

---

## Work Unit 1: Social Authentication & Stitch Precision CAD Styling

- [x] 1.1 Configure Google IdP in [cadgpt-realm.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/cadgpt-realm.json) and [cadgpt-realm.prod.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/prod/cadgpt-realm.prod.json) (`alias: "google"`, `trustEmail: true`, `syncMode: "IMPORT"`, `${env.GOOGLE_CLIENT_ID}`, `${env.GOOGLE_CLIENT_SECRET}`).
- [x] 1.2 Update [stitch.css](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css) styling `#kc-social-providers`, `#social-google`, and divider with `#131B2E` surface, `#00F0FF` glow, Google SVG icon, and responsive sizing.

## Work Unit 2: Advanced FreeCAD Modeling Operations

- [x] 2.1 Update [ops-allowlist.json](file:///Users/danny/Documents/ChatGPT/CADGPT/ops-allowlist.json) to 18 operations and export `FREECAD_OPS` in [discovery.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py).
- [x] 2.2 Add strict Zod schemas for `create_wedge`, `extrude_polygon`, `fillet`, `chamfer`, and `loft` in [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts).
- [x] 2.3 Implement handlers for `create_wedge`, `extrude_polygon`, `fillet`, `chamfer`, and `loft` in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) with OCC backup rollback and 1-based edge bounds checks.
- [x] 2.4 Add unit tests in [test_freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_freecad_worker.py), parity tests in [test_ops_allowlist.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_ops_allowlist.py), and schema tests in [tools-b2.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/tools-b2.test.ts).

## Work Unit 3: Agent CLI Evolution

- [x] 3.1 Register dual entry points `cadengine` and `cadgpt-agent` in [pyproject.toml](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml).
- [x] 3.2 Implement CLI subcommands (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`, `doctor`, `update`) and `RotatingFileHandler` (5MB, 3 backups) in [main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py).
- [x] 3.3 Implement `doctor` diagnostics and `--fix` auto-provisioning for headless FreeCAD, plus `update` release downloader with SHA-256 validation in [main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py).
- [x] 3.4 Implement `POST /api/agent/unpair` in [main.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts) and revocation in [store.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/store.ts); purge local OS Keyring (`CADGPT`) unconditionally in CLI unpair.
- [x] 3.5 Add unpair tests in [unpair.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/unpair.test.ts), doctor/update and CLI tests in [test_agent.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_agent.py).

## Work Unit 4: Background Daemons & Windows MSI Packaging

- [ ] 4.1 Add daemon commands to [main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py) for Windows `schtasks /SC ONLOGON /RL LIMITED`, Linux user systemd, and macOS LaunchAgent.
- [ ] 4.2 Author WiX v4 installer [cadengine.wxs](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/wix/cadengine.wxs) targeting `%ProgramFiles%\CAD Engine\`, system `PATH`, and `ONLOGON` task actions.
- [ ] 4.3 Update [windows.iss](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) and [build.py](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py) for PyInstaller `cadengine` build.
