# consent-governance (NEW)

Purpose: Enforce GDPR, CCPA, and ISO/IEC 27001 data treatment consent across Keycloak user registration and the Angular web dashboard (specifically for Google SSO first-broker logins), presenting an accessible slide-up bottom sheet that blocks progression until explicitly accepted.

### Requirement: Keycloak Registration Slide-Up Consent Bottom Sheet
The Keycloak custom login theme (`deploy/themes/cadgpt/login/`) MUST provide a registration template (`register.ftl`) that presents a legal data treatment and privacy governance notice before an account can be created:
1. **Visual Elements**:
   - The template MUST render a backdrop overlay container (`#consent-backdrop`) and a slide-up bottom sheet panel (`#consent-sheet`).
   - The sheet MUST display a regulatory compliance badge ("GDPR & ISO/IEC 27001") and a localized heading ("Tratamiento de Datos y Gobernanza CAD").
   - The body text MUST explicitly disclose:
     - **Local Containment**: CAD parametric models and engineering scripts execute locally on paired user devices.
     - **Preview Mesh Retention**: Only triangulated 3D preview meshes (STL) are temporarily stored on the server to enable browser viewing.
     - **Right to Erasure**: Users retain an unconditional Right to Erasure ("Derecho al olvido") to permanently purge all account data and paired machine links at any time.
2. **Consent Gating & Blocking Behavior**:
   - The sheet MUST include a mandatory checkbox (`#consent-accept-check`) confirming the user has read and accepted the Terms of Service and Privacy Policy.
   - The action button (`#consent-accept-btn`, "Aceptar y Continuar") MUST remain disabled until `#consent-accept-check` is checked.
   - The main registration form submission button (`input[type="submit"]` or `#kc-form-submit`) MUST remain disabled or blocked until the bottom sheet consent is successfully accepted.
   - Dismissing the sheet without checking the acceptance box MUST NOT grant access to registration submission.

#### Scenario: Bottom sheet presented upon opening registration page
- GIVEN an unauthenticated user navigating to the CAD Engine registration page
- WHEN Keycloak renders `register.ftl`
- THEN `#consent-sheet` and `#consent-backdrop` are present in the DOM and the sheet animates into view from the bottom of the viewport

#### Scenario: Registration blocked while consent checkbox is unchecked
- GIVEN the consent bottom sheet displayed to the user
- WHEN the user has not checked `#consent-accept-check`
- THEN `#consent-accept-btn` is disabled and the user cannot proceed with registration

#### Scenario: Accepting consent dismisses bottom sheet and enables registration
- GIVEN the user checks `#consent-accept-check`
- WHEN the user clicks `#consent-accept-btn`
- THEN `#consent-sheet` slides down out of view, `#consent-backdrop` is hidden, and registration form submission is unlocked

#### Scenario: Dismissing sheet keeps registration blocked
- GIVEN the user clicks `#consent-close` or clicks outside on `#consent-backdrop` without checking acceptance
- WHEN the modal closes or attempts to close
- THEN the main form submit button remains disabled with a warning prompt requiring consent acceptance

---

### Requirement: Stitch Design System Glassmorphic Bottom Sheet Styling
The theme stylesheet (`deploy/themes/cadgpt/login/resources/css/stitch.css`) and Angular application styles MUST style the consent bottom sheet in alignment with the Stitch Precision CAD workbench design system:
1. **Backdrop (`.stitch-consent-backdrop`)**:
   - MUST use a deep dark scrim: `background: rgba(9, 13, 22, 0.75)` with `backdrop-filter: blur(12px)`.
   - MUST use a fixed overlay covering the entire viewport (`inset: 0`) with z-index `1000`.
   - MUST transition opacity with cubic-bezier easing (`0.3s cubic-bezier(0.16, 1, 0.3, 1)`).
2. **Bottom Sheet Panel (`.stitch-consent-sheet`)**:
   - MUST be fixed at the bottom viewport: `position: fixed; bottom: 0; left: 50%; width: 100%; max-width: 680px`.
   - Default resting state MUST be off-screen: `transform: translate(-50%, 100%)`.
   - Active state (`.stitch-consent-sheet.active`) MUST animate into view: `transform: translate(-50%, 0%)` using transition timing `0.4s cubic-bezier(0.16, 1, 0.3, 1)`.
   - Surface styling: MUST use `background: var(--stitch-surface)` (`#0D1322`), top border `2px solid var(--stitch-primary)` (`#00F0FF`), side borders `1px solid var(--stitch-border)`, top border radii `16px`, and an elevated cyan drop glow shadow `0 -12px 48px rgba(0, 0, 0, 0.85), 0 0 24px -4px rgba(0, 240, 255, 0.25)`.
3. **Typography & Controls**:
   - Regulatory badge: Monospace typography, cyan tint (`color: var(--stitch-primary); background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.3)`).
   - Primary action button: Follows `.stitch-btn-primary` with cyan gradient, dark bold text, and disabled state styling (`opacity: 0.4; cursor: not-allowed`).
4. **Accessibility**:
   - The bottom sheet MUST declare `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="consent-title"`.

#### Scenario: Bottom sheet renders with Stitch Precision tokens
- GIVEN the registration or web page loading the consent sheet
- WHEN rendered in a browser
- THEN the sheet displays a `#0D1322` dark surface, `#00F0FF` electric cyan top border accent, and blurred backdrop

#### Scenario: Smooth GPU-accelerated slide-up transition
- GIVEN the consent sheet in its default translated state `translate(-50%, 100%)`
- WHEN the `.active` class is added
- THEN the panel transitions smoothly to `translate(-50%, 0%)` using hardware-accelerated transforms without layout reflows

#### Scenario: Screen reader accessibility
- GIVEN an assistive screen reader active on the page
- WHEN the bottom sheet activates
- THEN focus is trapped inside the dialog and the dialog role and title are announced

---

### Requirement: Angular Web Client First-Login Consent Gate for Google SSO
Because users authenticating via Google Social Login bypass `register.ftl` through Keycloak's `first broker login` flow, the Angular web application (`apps/web/`) MUST enforce a first-login consent verification gate:
1. **Consent Detection**:
   - Upon authentication initialization (e.g. in `AuthService` or an application initialization guard), the client MUST inspect whether legal consent has been recorded for the authenticated user (checking `localStorage` key `cadgpt:consent:v1:<sub_or_version>` or backend user profile state).
2. **Modal Interception**:
   - If consent is missing, the Angular client MUST immediately display the Stitch Precision CAD slide-up consent bottom sheet component over the dashboard.
   - The component MUST intercept user interactions, block route transitions to CAD tools or designs, and prevent execution of jobs or API calls until consent is granted.
3. **Consent Acknowledgment**:
   - When the user checks the agreement checkbox and clicks "Aceptar y Continuar":
     - The client MUST persist the consent record with an ISO 8601 timestamp and agreement version (`v1`).
     - The modal MUST slide down and disappear.
     - Full interactive access to the CAD workbench dashboard MUST be unlocked.
4. **Returning User Bypass**:
   - For users with valid consent already stored, the application MUST NOT show the bottom sheet and MUST allow immediate access to the dashboard.

#### Scenario: Google SSO first-time login triggers consent bottom sheet
- GIVEN a user completing Google OAuth authentication for the first time
- WHEN redirected to the Angular dashboard without prior consent recorded
- THEN the dashboard is blurred and the slide-up consent bottom sheet is presented modally

#### Scenario: Acknowledging consent unlocks web dashboard
- GIVEN the consent modal displayed on the web dashboard
- WHEN the user selects the checkbox and clicks "Aceptar y Continuar"
- THEN consent is recorded in local storage with the current timestamp, the modal slides down, and the dashboard becomes active

#### Scenario: Returning authenticated user bypasses consent modal
- GIVEN a user who has previously accepted data treatment consent
- WHEN logging in or refreshing the dashboard
- THEN the application verifies the stored consent record and allows immediate access without displaying the bottom sheet
