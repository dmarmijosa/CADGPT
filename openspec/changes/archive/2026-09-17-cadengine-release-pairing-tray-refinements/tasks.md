# Tasks: CAD Engine Release Packaging, Pairing HUD & System Tray Refinements

Source specs: `agent-cli-daemon-lifecycle`, `governance-security-supplychain`, `gui-onboarding-system-tray` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-release-pairing-tray-refinements/specs) (read-only). References: [proposal.md](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-release-pairing-tray-refinements/proposal.md), [design.md](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-release-pairing-tray-refinements/design.md).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~480 lines across 4 work units |
| Review budget | 400 lines per PR slice |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes — 4 sequenced feature branches |
| Chain strategy | feature-branch-chain |
| Delivery strategy | auto-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low
```

## Work Units Summary

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| WU1 | Default Service & Zero-URL Pairing HUD + Auto-Enrollment | `feat/zero-url-pairing-hud` | `python -m unittest agent.tests.test_gui agent.tests.test_agent -v` | Tkinter, Keyring, Service daemon | Revert `gui.py`, `main.py`, `service.py`, `test_gui.py`, `test_agent.py` |
| WU2 | System Tray Asset Resolution & Complete Branding Purge | `feat/tray-assets-brand-purge` | `python -m unittest agent.tests.test_gui agent.tests.test_strategies -v` | PyInstaller, Pillow, CSS | Revert `gui.py`, `build.py`, `Dockerfile`, `stitch.css`, `deployment.md`, `apps/web/README.md`, `test_strategies.py` |
| WU3 | Release Pipeline Harmonization & Obsolete Release Decommissioning | `feat/release-pipeline-decommission` | `python packaging/build.py --dry-run` | GitHub Actions, gh CLI | Revert `.github/workflows/release.yml`, `README.md` |
| WU4 | End-to-End Verification & Regression Testing | `test/e2e-regression-verification` | `npm test && python -m unittest discover -s agent/tests -v` | Polyglot (Node.js 24 + Python 3.13) | Test runner configurations |

---

## Work Unit 1: Default Service & Zero-URL Pairing HUD + Auto-Enrollment

- [x] 1.1 Define universal production server constant `DEFAULT_SERVER = "https://cadengine.danny-armijos.com"` in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) and [`agent/cadgpt_agent/main.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py); update `OnboardingController.__init__` and `SystemTrayDaemon._read_server` to fall back to `DEFAULT_SERVER` when neither `--server` nor `config.json["server"]` is configured.
- [x] 1.2 Redesign Step 4 HUD in `_render_step4` in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) by eliminating `self.server_entry`, `step4_server_url_label`, and manual "Generate Code" button; render a prominent Monospace Courier 20 bold pairing code display card (`PairCode.TLabel`), dedicated "Copy Code" button with clipboard synchronization and 2000 ms feedback label flip (`btn_copied`), and direct "Open Dashboard" button launching `{server_url}/pair`.
- [x] 1.3 Implement offline 12-character fallback in `request_pairing_code()` in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) using CSPRNG `secrets.token_hex(6).upper()`, formatted as `XXXX-XXXX-XXXX`, displaying immediately in the pairing HUD while launching background retry polling without modal error dialogs.
- [x] 1.4 Wire automatic native background daemon enrollment by invoking `install_service()` from [`agent/cadgpt_agent/service.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/service.py) within `_on_pairing_success()` in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py) upon confirmed pairing approval.
- [x] 1.5 Eliminate interactive Tkinter `askstring` dialogs and terminal `input()` prompts in `run_foreground_loop` and `cmd_pair` in [`agent/cadgpt_agent/main.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py), resolving server directly using precedence: (1) CLI argument `--server`, (2) saved `config.json["server"]`, (3) universal constant `DEFAULT_SERVER`.
- [x] 1.6 Author unit tests in [`agent/tests/test_gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_gui.py) validating `DEFAULT_SERVER` constant fallback, Step 4 URL input absence, offline 12-character fallback code generation on network failure, and `install_service()` automatic invocation on pairing approval.
- [x] 1.7 Author unit tests in [`agent/tests/test_agent.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_agent.py) asserting `cmd_pair` and `run_foreground_loop` default directly to `DEFAULT_SERVER` without prompting terminal stdin or Tkinter dialogs.

## Work Unit 2: System Tray Asset Resolution & Complete Branding Purge

- [x] 2.1 Implement multi-tier tray icon resolution in `get_tray_icon_image()` in [`agent/cadgpt_agent/gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py), querying: (1) `sys._MEIPASS / "cadgpt_agent" / "assets" / "favicon.ico"` when running in a PyInstaller frozen bundle, (2) `Path(__file__).parent / "assets" / "favicon.ico"`, (3) `apps/web/public/favicon.ico`, (4) local `icon.png`, falling back cleanly to programmatic 3D isometric cube rendering via `create_cube_icon_image()`.
- [x] 2.2 Verify asset bundling configuration in [`packaging/build.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py), ensuring PyInstaller `--add-data` directive bundles `apps/web/public/favicon.ico` to destination `cadgpt_agent/assets`.
- [x] 2.3 Purge residual "CAD Agent Designer" branding in [`docs/deployment.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/docs/deployment.md) (header title and sign-in instructions), replacing with official "CAD Engine" branding.
- [x] 2.4 Purge residual "CAD Agent Designer" branding in [`apps/web/README.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/README.md) (header title) and [`Dockerfile`](file:///Users/danny/Documents/ChatGPT/CADGPT/Dockerfile) (header multi-stage build description), replacing with "CAD Engine".
- [x] 2.5 Purge residual "CAD Agent Designer" branding in [`deploy/themes/cadgpt/login/resources/css/stitch.css`](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css) and [`openspec/specs/mcp-client-onboarding/spec.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/specs/mcp-client-onboarding/spec.md), replacing with "CAD Engine".
- [x] 2.6 Update AutoCAD LISP strategy test paths in [`agent/tests/test_strategies.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_strategies.py) from `C:\Program Files\CAD Agent Designer\...` to `C:\Program Files\CAD Engine\...`.
- [x] 2.7 Author unit tests in [`agent/tests/test_gui.py`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_gui.py) validating tray icon loader tiers, specifically verifying `sys._MEIPASS` bundle path resolution with mocked frozen environment.

## Work Unit 3: Release Pipeline Harmonization & Obsolete Release Decommissioning

- [x] 3.1 Update Linux packaging step in [`.github/workflows/release.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml) to package strictly `cadengine-linux-x64.tar.gz` (lowercase) and remove legacy `CADGPT-linux-x64.tar.gz` copy.
- [x] 3.2 Update macOS packaging step in [`.github/workflows/release.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml) to eliminate legacy `CADGPT-macos-${{ matrix.arch }}.dmg` copy, retaining exclusively `CADEngine-macos-${{ matrix.arch }}.dmg`.
- [x] 3.3 Update prerelease publication notes in [`.github/workflows/release.yml`](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml) to detail Blender 4.x organic modeling worker, WiX v4 elevated MSI installer, 4-step Zero-URL onboarding wizard, system tray daemon, and bilingual i18n.
- [x] 3.4 Align onboarding and packaging instructions in [`README.md`](file:///Users/danny/Documents/ChatGPT/CADGPT/README.md) documenting Zero-URL pairing HUD and automatic native daemon enrollment, and verify Linux download archive commands reference `cadengine-linux-x64.tar.gz`.
- [x] 3.5 Execute runbook decommissioning obsolete GitHub release `v0.1.0-alpha.2` using `gh release delete v0.1.0-alpha.2 --yes` and verify deletion with `gh release list`.

## Work Unit 4: End-to-End Verification & Regression Testing

- [x] 4.1 Execute packaging asset validation and dry-run via `python packaging/build.py --dry-run` to ensure all bundled paths (including `apps/web/public/favicon.ico`) and WiX XML configurations validate cleanly.
- [x] 4.2 Perform a recursive repository scan for "CAD Agent Designer" (`git grep -i "CAD Agent Designer"`) verifying exactly zero residual occurrences remain across active source files, guides, stylesheets, and tests.
- [x] 4.3 Execute complete agent unit test suite via `python -m unittest discover -s agent/tests -v` verifying all test cases pass without regressions.
- [x] 4.4 Execute full monorepo test suite via `npm test` verifying all web, api, and i18n tests pass without errors.
- [x] 4.5 Perform manual dry-run validation of `cadengine --help`, `cadengine pair --help`, and `cadengine gui` entry point dispatching.
