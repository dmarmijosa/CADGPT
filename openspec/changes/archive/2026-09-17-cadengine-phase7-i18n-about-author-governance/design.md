# Technical Design: Phase 7 Comprehensive i18n, About Overhaul, Author Attribution & Governance

## 1. Context & Invariants
Phase 7 delivers hierarchical browser OS language detection, complete bilingual (EN/ES) UI internationalization across all views, persistent voluntary GDPR / ISO 27001 consent review from the footer, Tri-Engine architectural documentation including Blender 4.x, and formal author attribution for Danny Armijos.

- **Storage Priority Invariant**: User manual preference stored in `localStorage.getItem('cadgpt_lang')` (`'en'` or `'es'`) strictly takes precedence over `navigator.languages` and `navigator.language`.
- **Zero Involuntary Revocation Invariant**: Reopening `#consent-sheet` in voluntary review mode (`isReviewingConsent`) and dismissing it via the "Close" button must never revoke stored consent or wipe `cadgpt:consent:v1:<sub_id>`.
- **Gating Integrity Invariant**: Unconsented users encountering `#consent-sheet` during mandatory initial gating must continue to be blocked until `#consent-accept-check` is checked and `#consent-accept-btn` is clicked.
- **Security & Link Accessibility Invariant**: All external hyperlinks targeting LinkedIn or the personal website must enforce `rel="noopener noreferrer"` and `target="_blank"`.
- **Dictionary Key Parity Invariant**: Centralized dictionaries `en` and `es` in `translations.ts` must declare 100% key parity with zero untranslated template literals.

## 2. Architecture Decisions

| Area | Option | Tradeoff | Decision |
|---|---|---|---|
| **OS Language Detection** | 1. `navigator.language` only<br>2. HTTP `Accept-Language`<br>3. `navigator.languages` array hierarchy | 1 misses user language preference list; 2 requires backend roundtrip; 3 runs synchronously on client and checks ordered preferences. | **Option 3**: Hierarchical candidate scanning: `localStorage` -> `navigator.languages` -> `navigator.language` -> `'en'`. |
| **Template i18n** | 1. Hardcoded bilingual templates (`*ngIf="lang==='es'"`)<br>2. `@angular/localize`<br>3. Signal-based `TranslatePipe` | 1 causes template bloat and maintenance drift; 2 requires separate build artifacts per locale; 3 enables instant in-memory reactive language toggling. | **Option 3**: Angular Signal `TranslationService` + `TranslatePipe`. |
| **Persistent Consent Review** | 1. Route to `/privacy`<br>2. Revoke and force re-consent<br>3. Non-destructive review mode in `#consent-sheet` | 1 duplicates legal copy across routes; 2 disrupts user workflows; 3 reuses existing verified bottom sheet with a safe "Close" dismiss action. | **Option 3**: `isReviewingConsent` signal with verified status badge and non-destructive "Close" action. |
| **Tri-Engine Documentation** | 1. External wiki link<br>2. Modal popup<br>3. Structured card grid on About page | 1 sends users off-platform; 2 hides information behind clicks; 3 provides immediate architectural transparency with dark Stitch Precision cards. | **Option 3**: Tri-Engine architecture section (FreeCAD, AutoCAD, Blender 4.x) and Compatibility matrix update. |
| **Author Attribution** | 1. Code comments only<br>2. Dedicated modal<br>3. Persistent shell footer + About author card | 1 is invisible to end users; 2 is intrusive; 3 provides accessible and professional attribution with secure external links. | **Option 3**: Persistent shell footer attribution and dedicated About page author card. |

## 3. Data Flow
1. **App Initialization**:
   - `TranslationService.getInitialLanguage()` evaluates `localStorage('cadgpt_lang')`.
   - If missing, scans `navigator.languages` (array) then `navigator.language` (string) for `'es'` / `'en'`.
   - Sets reactive signal `currentLang`.
2. **Template Binding**:
   - `TranslatePipe` binds keys (`connect.*`, `about.*`, `footer.*`, `consent.*`) reactively to `currentLang()`.
   - Changing language immediately updates all rendered templates synchronously.
3. **Consent Review Flow**:
   - Consented user clicks "Data Treatment & CAD Governance" in footer -> `openConsentReview()`.
   - `isReviewingConsent` sets to `true`; `showConsentSheet` computed becomes `true`.
   - Sheet renders active verified status badge and "Close" button.
   - User clicks "Close" -> `closeConsentReview()` sets `isReviewingConsent` to `false`; sheet closes without altering consent state.

## 4. Interfaces & Contracts

### 4.1 Shell State Additions (`apps/web/src/app/layout/shell/shell.ts`)
```typescript
readonly isReviewingConsent = signal(false);
openConsentReview(): void;
closeConsentReview(): void;
showConsentSheet = computed(() => this.isConsentRequired() || this.isReviewingConsent());
```

### 4.2 Translation Dictionaries (`apps/web/src/app/core/i18n/translations.ts`)
Keys defined across `footer.*`, `consent.*`, `connect.*`, and `about.*` with 100% parity across `en` and `es`.
