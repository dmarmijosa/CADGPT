# Proposal: CAD Engine Phase 7 — Comprehensive i18n, About Page Overhaul, Author Attribution & Persistent Data Governance

## Intent
Deliver automatic OS language detection, complete bilingual (EN/ES) UI coverage, persistent GDPR/ISO 27001 consent review, Tri-Engine architectural transparency with Blender 4.x, and formal author attribution for Danny Armijos.

## Scope

### In Scope
- **OS Language Detection**: Prioritize `localStorage`, then inspect `navigator.languages` and `navigator.language` ('es' vs 'en'); align behavior with `agent/cadgpt_agent/i18n.py`.
- **Exhaustive UI i18n**: Fully translate `connect.html`, `about.html`, shell footer, and consent review literals using `TranslatePipe` and comprehensive `en`/`es` dictionaries.
- **Persistent Governance Review**: Add persistent footer trigger to reopen `#consent-sheet` in non-destructive review mode (`isReviewingConsent`) with "Close" action, preserving active consent timestamps.
- **About Page Overhaul**: Document Tri-Engine Architecture (FreeCAD CSG/B-Rep, AutoCAD DWG/Core Console, Blender 4.x Subdiv/glTF) and add Blender 4.x to Compatibility table.
- **Author Attribution**: Add Danny Armijos attribution and secure external links (LinkedIn, Website) to footer and About page.

### Out of Scope
- Backend API schema or database mutations.
- Modifying Keycloak theme authentication templates (`register.ftl`).
- New CAD modeling operations or worker execution scripts.

## Capabilities

### New Capabilities
- `openspec/specs/web-i18n-author-attribution`: Browser OS language detection, centralized bilingual dictionaries, full template translation, and verified author attribution links.

### Modified Capabilities
- `openspec/specs/consent-governance`: Add persistent footer review trigger, review mode decoupling, and non-destructive sheet dismissal without revoking consent.
- `openspec/specs/mcp-client-onboarding`: Internationalize all client connection guides, OS keep-alive instructions, and setup snippets for Claude and ChatGPT.

## Affected Areas
- `apps/web/src/app/core/i18n/`: `translation.service.ts` (OS detection), `translations.ts` (EN/ES dictionaries), unit tests.
- `apps/web/src/app/layout/shell/`: `shell.html`, `shell.ts`, `shell.css` (footer trigger, review mode signal, author links).
- `apps/web/src/app/pages/connect/`: `connect.html`, `connect.ts` (`TranslatePipe` migration).
- `apps/web/src/app/pages/about/`: `about.html`, `about.ts`, `about.css` (Tri-Engine, Blender 4.x, author profile, i18n).

## Rollback Plan
- Revert `apps/web` Git commits to restore hardcoded templates and legacy `getInitialLanguage()`.
- Unset `isReviewingConsent` and remove footer triggers; fallback to first-login gating only.
- Stored user preferences and consent timestamps remain backward-compatible.

## Success Criteria
- [ ] `getInitialLanguage()` correctly detects Spanish and English from `navigator.languages` while honoring `localStorage`.
- [ ] Zero raw untranslated text literals remain in `connect.html`, `about.html`, and shell footer.
- [ ] Language switching toggles all literals between EN and ES synchronously.
- [ ] Consented users can reopen `#consent-sheet` from footer and close it without clearing consent.
- [ ] About page documents Tri-Engine architecture and includes Blender 4.x in Compatibility table.
- [ ] Author attribution displays Danny Armijos with valid LinkedIn and Website links (`rel="noopener noreferrer"`).
- [ ] `npm test` passes in `apps/web` with all new unit tests.
