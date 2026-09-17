# web-i18n-author-attribution (NEW)

Purpose: Provide automated OS language detection, comprehensive bilingual (EN/ES) UI internationalization across all views and templates, persistent verified author attribution to Danny Armijos with secure external profiles, and transparent Tri-Engine architectural documentation including Blender 4.x.

### Requirement: OS Language Priority Scanner
The frontend translation service (`TranslationService.getInitialLanguage()`) MUST determine the initial interface language through a deterministic hierarchical candidate evaluation:
1. **Local Storage Precedence**:
   - The service MUST check `localStorage.getItem('cadgpt_lang')` first.
   - If a stored preference equal to `'en'` or `'es'` exists, the service MUST immediately return that language, taking strict precedence over browser or operating system settings.
2. **Navigator Candidate Scanning**:
   - If no valid stored preference exists, the service MUST construct an ordered candidate list starting with all entries in `navigator.languages` (if defined and an array), followed by `navigator.language` (if defined as a string).
   - The service MUST iterate through the candidate list in order:
     - If a candidate tag (converted to lower case) starts with `'es'`, the service MUST return `'es'`.
     - If a candidate tag (converted to lower case) starts with `'en'`, the service MUST return `'en'`.
3. **Deterministic Fallback**:
   - If no candidate tag begins with `'es'` or `'en'`, or if `navigator` is undefined or inaccessible, the service MUST fall back to `'en'`.
4. **Daemon Alignment**:
   - The evaluation order MUST mirror the candidate priority structure implemented in the Python agent's `detect_locale()` function.

#### Scenario: Stored language in localStorage takes precedence
- GIVEN a user with `'es'` saved under `localStorage` key `'cadgpt_lang'`
- WHEN `TranslationService.getInitialLanguage()` executes in a browser reporting `navigator.languages = ['en-US', 'en']`
- THEN the service returns `'es'`

#### Scenario: Spanish detected as primary OS language in navigator.languages
- GIVEN `localStorage` has no stored `'cadgpt_lang'` value
- WHEN `TranslationService.getInitialLanguage()` evaluates `navigator.languages = ['es-ES', 'es', 'en-US']`
- THEN the service returns `'es'`

#### Scenario: English detected as primary OS language in navigator.languages
- GIVEN `localStorage` has no stored `'cadgpt_lang'` value
- WHEN `TranslationService.getInitialLanguage()` evaluates `navigator.languages = ['en-US', 'es-ES']`
- THEN the service returns `'en'`

#### Scenario: Fallback to navigator.language when navigator.languages is empty
- GIVEN `localStorage` has no stored `'cadgpt_lang'` value and `navigator.languages` is empty or undefined
- WHEN `TranslationService.getInitialLanguage()` evaluates `navigator.language = 'es-419'`
- THEN the service returns `'es'`

#### Scenario: Default fallback to English for unsupported locales
- GIVEN `localStorage` has no stored `'cadgpt_lang'` value
- WHEN `TranslationService.getInitialLanguage()` evaluates `navigator.languages = ['de-DE', 'fr-FR', 'ja-JP']`
- THEN the service returns `'en'`

---

### Requirement: Comprehensive Bilingual Dictionaries and Template Coverage
The Angular web application (`apps/web`) MUST maintain complete bilingual coverage across English (`en`) and Spanish (`es`):
1. **Dictionary Key Parity**:
   - The centralized dictionary record (`TRANSLATIONS` in `apps/web/src/app/core/i18n/translations.ts`) MUST declare 100% key parity between `'en'` and `'es'`.
   - Every key defined under `'en'` MUST have a corresponding localized value in `'es'`, and every key defined under `'es'` MUST have a corresponding localized value in `'en'`.
2. **Template Internationalization via TranslatePipe**:
   - All user-facing text literals in `connect.html`, `about.html`, `shell.html` (footer), and the consent bottom sheet review mode MUST be bound using `TranslatePipe` (e.g. `{{ 'connect.title' | translate }}`).
   - Templates MUST NOT contain unlocalized hardcoded English or Spanish text literals.
3. **Structured Namespace Schema**:
   - The dictionaries MUST provide keys covering:
     - `footer.*`: Author attribution lead, author name, personal website link, and data governance review button.
     - `consent.*`: Active consent status badge and review mode close button.
     - `connect.*`: Eyebrow, page title, subtitle, resource URL card, copy buttons and feedback, Claude setup steps 1–4, ChatGPT setup steps 1–3, device status indicators (loading, online, offline, lookup, empty, pair link), keep-alive daemon instructions for Linux (systemd), macOS (launchd), and Windows (PowerShell), and mechanical CAD modeling prompts.
     - `about.*`: Alpha status disclaimers, Tri-Engine architecture overviews (FreeCAD, AutoCAD, Blender 4.x), compatibility table headers and rows, security and quota limits, author bio and roles, and account governance / right-to-erasure confirmation dialogs.
4. **Synchronous Reactive Switching**:
   - When `TranslationService.setLanguage()` is invoked with a new language, all views, active components, and layout templates MUST update all displayed text literals synchronously without requiring a browser page reload.

#### Scenario: 100% Dictionary key parity verified
- GIVEN the `TRANSLATIONS` dictionary in `translations.ts`
- WHEN automated test suites compare the set of keys in `en` with the set of keys in `es`
- THEN the difference between the two key sets is empty

#### Scenario: Zero hardcoded literals in connect and about views
- GIVEN the compiled templates `connect.html` and `about.html`
- WHEN inspected for static user-visible strings
- THEN all user-facing labels, descriptions, table cells, and button texts reference `TranslatePipe` keys

#### Scenario: Dynamic language switching updates templates immediately
- GIVEN the user viewing the About or Connect page in English
- WHEN the user toggles the language switch to Spanish (`'es'`)
- THEN all headings, descriptions, buttons, and status labels update immediately to their Spanish translations without full-page navigation

---

### Requirement: Author Attribution and Secure Social Links
The web application MUST credit design, architecture, and engineering to **Danny Armijos** across all client views:
1. **Shell Footer Attribution**:
   - The persistent application shell footer (`shell.html`) MUST render author attribution attributing the project to Danny Armijos (`footer.author_lead` and `footer.author_name`).
   - The footer MUST include direct clickable links to:
     - Danny Armijos's LinkedIn Profile: `https://www.linkedin.com/in/dmarmijosa/`
     - Danny Armijos's Personal Website: `https://www.danny-armijos.com/`
2. **About Page Author Profile**:
   - The About page (`about.html`) MUST include an "Author & Engineering Lead" section (`about.author_title`) highlighting Danny Armijos's role as Software Architect & CAD Systems Engineer and creator of CAD Engine.
   - The profile card MUST present dedicated action buttons linking to the author's LinkedIn profile and personal website.
3. **Security and Accessibility Controls**:
   - Every external hyperlink targeting LinkedIn or the author's website MUST declare `target="_blank"` and `rel="noopener noreferrer"` to eliminate reverse tab-nabbing vulnerabilities.
   - Every link MUST provide an explicit, localized `aria-label` attribute describing the destination for assistive screen readers.

#### Scenario: Persistent footer renders author attribution and external links
- GIVEN any route rendered within the application shell (`shell.html`)
- WHEN the footer is displayed in the viewport
- THEN it displays "Danny Armijos" with valid links to LinkedIn and the personal website

#### Scenario: About page displays author and engineering lead card
- GIVEN a user navigating to `/about`
- WHEN the About page renders
- THEN the author card is present with role description, engineering bio, and action buttons linking to LinkedIn and the author website

#### Scenario: External author links enforce security and accessibility attributes
- GIVEN any author hyperlink in `shell.html` or `about.html`
- WHEN inspecting the anchor tag in the DOM
- THEN the element has `target="_blank"`, `rel="noopener noreferrer"`, and an informative `aria-label`

---

### Requirement: About Page Tri-Engine Architecture & Blender 4.x Matrix
The About page (`about.html`) MUST provide comprehensive documentation of the platform's multi-kernel execution capabilities:
1. **Tri-Engine Architectural Section**:
   - The page MUST present a dedicated "Tri-Engine Architecture" section explaining how CAD Engine dispatches operations across three specialized kernels:
     - **FreeCAD (Parametric CSG & B-Rep)**: Constructive Solid Geometry, boundary representation, constraint sketch solver, feature tree, and STEP/IGES engineering export.
     - **AutoCAD 2026 (Drafting & Core Console)**: Headless Core Console execution (`accoreconsole.exe`), native DWG/DXF artifact generation, 3D ACIS solid primitives, booleans, transforms, and MASSPROP volumetric verification.
     - **Blender 4.x (Polygonal & Organic 3D Modeling)**: Headless Python API execution (`blender -b`), Catmull-Clark subdivision surfaces (`Subsurf`), procedural displacement modifiers, quad topology, and binary glTF/OBJ/STL asset export.
2. **Compatibility Matrix Inclusion**:
   - The Compatibility table MUST include a row for Blender 4.x with:
     - CAD / Platform: `Blender 4.x (headless background execution, Windows / macOS / Linux)`
     - Alpha Behavior: `Headless 3D polygonal modeling, subdivision surfaces, procedural displacement, quad topology, and binary glTF/OBJ/STL preview export. Enabled with --enable-blender.`
3. **Responsive Visual Styling**:
   - The Tri-Engine architecture cards MUST be styled using the Stitch Precision dark theme tokens (`var(--stitch-surface)`, `var(--stitch-border)`, `var(--stitch-primary)`), adapting seamlessly across desktop and mobile viewports.

#### Scenario: Tri-Engine architecture cards rendered on About page
- GIVEN a user navigating to `/about`
- WHEN the page loads
- THEN three distinct architecture cards for FreeCAD, AutoCAD, and Blender 4.x are displayed detailing their respective geometric capabilities

#### Scenario: Compatibility table contains Blender 4.x entry
- GIVEN the compatibility table in `about.html`
- WHEN table rows are evaluated
- THEN a row detailing Blender 4.x headless background execution, supported mesh operations, and `--enable-blender` is present
