# Tasks: CAD Engine Phase 5 — Image-to-CAD, OCR & Privacy

Source specs: `typography-3d`, `image-to-cad-pipeline`, `consent-governance`, `user-account-lifecycle` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/cadengine-phase5-image-to-cad-ocr-privacy/specs) (read-only).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~1,600 lines |
| Review budget | 400 lines per PR slice |
| 400-line budget risk | High |
| Chained PRs recommended | Yes — 4 feature branches |
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
| WU1 | 3D Typography & Holes | `python -m unittest agent.tests.test_freecad_worker -v` | FreeCAD worker | Revert allowlist, schemas, worker |
| WU2 | Image-to-CAD CV | `python -m unittest agent.tests.test_vision -v` | Agent CV & MCP | Revert `vision.py`, MCP schemas |
| WU3 | Consent Bottom Sheet | `npm test -w apps/web -- --include auth.service.spec.ts` | Keycloak & Angular | Revert `register.ftl`, `stitch.css`, gate |
| WU4 | Account Deletion | `npm test -w apps/api -- store account` | NestJS, Keycloak, SQLite | Revert `keycloak.ts`, `store.ts`, route |

---

## Work Unit 1: 3D Typography & Multi-Wire Polygon Extrusions

- [x] 1.1 Update [ops-allowlist.json](file:///Users/danny/Documents/ChatGPT/CADGPT/ops-allowlist.json) to 20 ops and export `FREECAD_OPS` in [discovery.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py).
- [x] 1.2 Bundle [Inter-Bold.ttf](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/fonts/Inter-Bold.ttf), add font fallbacks, and implement `_create_text_3d` in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) with `flat`/`emboss`/`engrave` modes.
- [x] 1.3 Support nested holes in `_extrude_polygon` in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) and add Zod schemas in [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts).
- [x] 1.4 Add tests in [test_freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_freecad_worker.py), [test_ops_allowlist.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_ops_allowlist.py), and [tools.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/tools.test.ts).

## Work Unit 2: Metric Image-to-CAD Computer Vision Pipeline

- [x] 2.1 Add `opencv-python-headless` and `numpy` in [pyproject.toml](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml) and implement [vision.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/vision.py) with binarization, `RETR_TREE`, nested holes, and Douglas-Peucker reduction.
- [x] 2.2 Implement metric calibration ($S = \text{dim}_{mm} / D_{px}$) and inverted-Y centered CAD mapping in [vision.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/vision.py).
- [x] 2.3 Add `analyzeImageToCadSchema` and tool dispatch in [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts) for inspection and solid generation.
- [x] 2.4 Add CV tests in [test_vision.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_vision.py) and schema tests in [tools.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/tools.test.ts).

## Work Unit 3: Consent Governance & Slide-Up Bottom Sheet

- [x] 3.1 Author [register.ftl](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/register.ftl) with `#consent-backdrop`, `#consent-sheet`, GDPR/ISO notice, mandatory checkbox, and submit gating.
- [x] 3.2 Add `.stitch-consent-sheet` and `.stitch-consent-backdrop` in [stitch.css](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css) with 12px blur, `#0D1322` surface, `#00F0FF` border, and slide-up animation.
- [x] 3.3 Implement first-login consent check in [auth.service.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/auth/auth.service.ts) via `cadgpt:consent:v1:<sub_or_version>` to intercept Google SSO.
- [x] 3.4 Add unit tests in [auth.service.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/auth/auth.service.spec.ts) for modal interception, timestamp storage, and returning user bypass.

## Work Unit 4: Fail-Fast Atomic Account Deletion Cascade

- [ ] 4.1 Implement `KeycloakAdminService` in [keycloak.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/keycloak.ts) and `deleteAccount` in [store.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/store.ts) with mesh unlinking and 7-table SQLite cascade.
- [ ] 4.2 Wire `DELETE /api/account` in [main.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts) enforcing JWT `sub` extraction, `cad:write` scope, and 502 abort on Keycloak failure.
- [ ] 4.3 Implement destructive confirmation dialog in [about.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.html) / [about.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.ts) requiring typed `"ELIMINAR"`, calling endpoint, and clearing session.
- [ ] 4.4 Add cascade tests in [store.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/store.test.ts), endpoint tests in [account.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/account.test.ts), and modal tests in [about.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.spec.ts).
