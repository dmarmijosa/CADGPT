# Proposal: CAD Engine Phase 4 — CLI, Daemons, Social Auth & CAD Ops

## Intent
Transform CAD Engine into an enterprise workstation utility via unified CLI (`cadengine`), native OS background daemons, MSI packaging, Google Keycloak login, and 5 advanced FreeCAD operations (`loft`, `chamfer`, `fillet`, `create_wedge`, `extrude_polygon`).

## Scope

### In Scope
- **CLI**: Dual entry points (`cadengine`, `cadgpt-agent`); subcommands (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`); rotating logs; `POST /api/agent/unpair`.
- **Services & Installers**: Windows `ONLOGON` task (avoids Session 0 limits); Linux user systemd; macOS LaunchAgent; WiX MSI with PATH setup.
- **Google Auth**: Keycloak `identityProviders` config; Stitch CSS for Google login button.
- **Professional CAD**: FreeCAD worker support for `loft`, `chamfer`, `fillet`, `create_wedge`, `extrude_polygon`; updated `ops-allowlist.json`, Zod schemas, discovery, unit tests.

### Out of Scope
- AutoCAD loft/fillet/chamfer parity.
- Session 0 Windows Services (`sc.exe`).
- Cloud rendering workers.

## Capabilities

### New Capabilities
- `agent-cli-daemon-lifecycle`: CLI subcommands, rotating logs, OS daemons, and MSI installer.
- `social-authentication`: Keycloak Google IdP config and Stitch UI styling.

### Modified Capabilities
- `openspec/specs/freecad-execution`: Dispatch and geometry handling for 5 new operations.
- `openspec/specs/mcp-cad-operations`: Parameter schemas and allowlist checks for new operations.
- `openspec/specs/cad-discovery`: `FREECAD_OPS` export reporting 18 operations.

## Affected Areas

| Area | Changes |
|---|---|
| `agent/` | CLI entry points, subcommands, logging, services, worker ops |
| `packaging/` | WiX v4 MSI installer, updated Inno Setup script |
| `apps/api/` | `/api/agent/unpair` route, Zod schemas in `tools.ts` |
| `deploy/` | Google IdP in realm JSONs, Stitch theme CSS |
| `tests/` | Updated `ops-allowlist.json` and worker/CLI tests |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Session 0 blocks keyring/UI | User `ONLOGON` Scheduled Task via `schtasks` |
| Keycloak DB skips `--import-realm` | Idempotent Keycloak Admin REST API sync |
| Fillet/chamfer topology errors | Validate edge indices, fallback to full shape, auto-restore |
| Unpair network failure | Best-effort server notification; unconditional local secret purge |

## Rollback Plan
- **CAD Ops**: Revert `ops-allowlist.json` and API schemas; worker ignores unlisted operations.
- **CLI/Services**: Run `cadengine service uninstall`; legacy `cadgpt-agent` remains.
- **Google Auth**: Disable Google provider in Keycloak Admin; local login unaffected.

## Success Criteria
- [ ] `cadengine` and `cadgpt-agent` run all subcommands (`status`, `pair`, `unpair`, `service`, `logs`, `test`).
- [ ] `cadengine service install` configures autostart on Windows, macOS, and Linux.
- [ ] WiX MSI installs `cadengine` to PATH and unregisters cleanly.
- [ ] Google login displays with Stitch styling and authenticates users.
- [ ] 5 new operations (`loft`, `chamfer`, `fillet`, `create_wedge`, `extrude_polygon`) produce valid `.FCStd` and STLs.
- [ ] `npm test` and `python -m unittest discover -s agent/tests -v` pass.
