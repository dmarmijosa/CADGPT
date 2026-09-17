# Proposal: CAD Engine Release, Pairing Flow & System Tray Refinements

## Intent
Decommission obsolete release `v0.1.0-alpha.2`, streamline clean `v0.2.0-alpha.1` packaging pipelines, enforce universal production default `https://cadengine.danny-armijos.com` eliminating server prompts, simplify Step 4 into a Zero-URL pairing HUD with auto-enrollment, and purge residual "CAD Agent Designer" branding.

## Scope

### In Scope
- **Release & Packaging**: Decommission `v0.1.0-alpha.2` from GitHub Releases; update `.github/workflows/release.yml` removing legacy `CADGPT-*` archives and standardizing `cadengine-linux-x64.tar.gz`; fix packaged tray icon lookup in `packaging/build.py` and `gui.py`.
- **Default Service & Zero-URL Pairing**: Set `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"`; eliminate terminal and GUI URL prompts; redesign Step 4 GUI to display only pairing code with Copy and Open Dashboard actions; add 12-char offline fallback; auto-enroll background service upon pairing.
- **System Tray & Branding**: Purge residual "CAD Agent Designer" references across docs, styles, and tests; guarantee tray icon resolution in PyInstaller bundles (`sys._MEIPASS`) and source trees.

### Out of Scope
- Modifying CAD kernel execution workers (FreeCAD, AutoCAD, Blender).
- Web application route changes or Keycloak theme alterations.
- Elevated Windows service architecture changes.

## Capabilities

### Modified Capabilities
- `openspec/specs/gui-onboarding-system-tray`: Zero-URL pairing HUD, 12-char code acquisition with offline fallback, automatic `install_service()` enrollment, and packaged tray icon asset resolution.
- `openspec/specs/agent-cli-daemon-lifecycle`: Universal production server default constant, elimination of interactive server URL prompts across CLI commands and foreground loops.
- `openspec/specs/governance-security-supplychain`: Release pipeline harmonization, removal of legacy archive names, obsolete release decommissioning, and clean "CAD Engine" branding.

## Affected Areas
- `.github/workflows/release.yml`: Release matrix and packaging targets.
- `agent/cadgpt_agent/gui.py`: Step 4 UX redesign, tray icon asset pathing, default server.
- `agent/cadgpt_agent/main.py`: Prompt removal, default server unification.
- `docs/deployment.md`, `apps/web/README.md`, `Dockerfile`, `deploy/themes/cadgpt/...`: Residual branding cleanups.
- `agent/tests/`: Step 4 UI tests, CLI prompt removal tests, tray icon asset tests.

## Rollback Plan
- Re-tag and restore previous workflow definitions in `.github/workflows/release.yml`.
- Revert GUI Step 4 and `main.py` commits to restore manual server URL entry and dialogs.
- Existing keyring credentials and scheduled tasks remain intact.

## Success Criteria
- [ ] Obsolete GitHub release `v0.1.0-alpha.2` decommissioned.
- [ ] `.github/workflows/release.yml` produces `cadengine-linux-x64.tar.gz` without legacy `CADGPT-*` archives.
- [ ] Universal default `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"` enforced with zero server prompts.
- [ ] Step 4 displays solely pairing code with Copy and Open Dashboard actions, plus offline fallback.
- [ ] Successful pairing automatically registers background service.
- [ ] Tray icon resolves CAD Engine cube in packaged binaries and unpacked mode.
- [ ] Zero occurrences of "CAD Agent Designer" remain across docs, styles, and tests.
- [ ] All unit and packaging tests pass.
