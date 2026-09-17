# Tasks: CAD Engine Phase 7 — i18n, About Page, Author Attribution & Governance

Source specs: `web-i18n-author-attribution`, `consent-governance`, `mcp-client-onboarding` in [specs](file:///Users/danny/Documents/ChatGPT/CADGPT/openspec/changes/archive/2026-09-17-cadengine-phase7-i18n-about-author-governance/specs) (read-only). Reference: [i18n.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/i18n.py) (read-only).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | ~750 lines across 4 work units |
| Review budget | 400 lines per PR slice |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes — 4 sequenced feature branches |
| Chain strategy | feature-branch-chain |
| Delivery strategy | auto-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium
```

## Work Units Summary

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| WU1 | OS i18n & Dictionaries | `npm test -w apps/web -- --include i18n.service.spec.ts` | Translation service & Vitest | Revert `translation.service.ts`, `translations.ts` |
| WU2 | Connect View i18n | `npm test -w apps/web -- --include connect.spec.ts` | Angular DOM & Vitest | Revert `connect.html`, `connect.ts`, `connect.spec.ts` |
| WU3 | Shell Footer & Review | `npm test -w apps/web -- --include shell.spec.ts` | Shell layout & Vitest | Revert `shell.html`, `shell.ts`, `shell.css` |
| WU4 | Tri-Engine & About | `npm test -w apps/web -- --include about.spec.ts` | About page & Vitest | Revert `about.html`, `about.ts`, `about.css` |

---

## Work Unit 1: OS Language Priority Detection & Core i18n Dictionary Expansion

- [x] 1.1 Update `getInitialLanguage()` in [translation.service.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translation.service.ts) to evaluate `localStorage`, then inspect `navigator.languages` array and `navigator.language` hierarchy, returning `'es'` or `'en'` with fallback to `'en'`.
- [x] 1.2 Expand [translations.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts) with complete EN and ES dictionaries covering `connect.*`, `about.*`, `footer.*`, and `consent.*` with 100% key parity.
- [x] 1.3 Author unit tests in [i18n.service.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/i18n.service.spec.ts) testing multi-locale navigator arrays, fallbacks, key parity, and storage precedence.

## Work Unit 2: Connect Page Full Bilingual Internationalization

- [x] 2.1 Import `TranslatePipe` into `ConnectPage` component imports in [connect.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.ts).
- [x] 2.2 Overhaul [connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) replacing all hardcoded English text (eyebrow, Claude/ChatGPT guides, device statuses, keep-alive tabs, and mechanical CAD hints) with `TranslatePipe` expressions.
- [x] 2.3 Update unit tests in [connect.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.spec.ts) verifying localized text rendering, dynamic `aria-label` copy bindings, and snippet integrity across languages.

## Work Unit 3: Persistent Data Treatment Review & Author Attribution in Footer

- [x] 3.1 Update `Shell` in [shell.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.ts) adding `isReviewingConsent` signal, `openConsentReview()`, and `closeConsentReview()` methods, adjusting `showConsentSheet`.
- [x] 3.2 Update [shell.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.html) adding Danny Armijos author attribution with secure external links (`rel="noopener noreferrer"`) and data governance review button in footer; render active verification badge and Close button on consent sheet during review mode.
- [x] 3.3 Update [shell.css](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.css) for footer attribution styling, governance review button, active badge, and review action controls.
- [x] 3.4 Author unit tests in [shell.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.spec.ts) validating review mode opening from footer, Close button dismissal, and non-destructive retention of consent timestamps.

## Work Unit 4: About Page Overhaul (Tri-Engine Architecture, Blender 4.x & Author Card)

- [x] 4.1 Overhaul [about.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.html) adding Tri-Engine Architecture breakdown (FreeCAD, AutoCAD, Blender 4.x), Blender 4.x in Compatibility table, Danny Armijos author card with secure social links (`rel="noopener noreferrer"`), and full `TranslatePipe` bindings.
- [x] 4.2 Update [about.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.ts) and [about.css](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.css) for responsive Tri-Engine cards, author profile section, and localized account deletion workflow.
- [x] 4.3 Update unit tests in [about.spec.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.spec.ts) verifying Blender 4.x presence, author link security attributes (`target="_blank"`, `rel="noopener noreferrer"`), and localized dialog assertions.
