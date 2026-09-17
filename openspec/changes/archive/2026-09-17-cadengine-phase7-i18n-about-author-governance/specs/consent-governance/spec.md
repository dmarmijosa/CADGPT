## consent-governance (MODIFIED)

Purpose: Enforce GDPR, CCPA, and ISO/IEC 27001 data treatment consent across Keycloak user registration and the Angular web dashboard, while enabling persistent, voluntary data treatment inspection from the application shell footer in a non-destructive review mode.

### Requirement: Angular Web Client First-Login Consent Gate and Persistent Review
Because users authenticating via Google Social Login bypass `register.ftl` through Keycloak's `first broker login` flow, the Angular web application (`apps/web/`) MUST enforce a first-login consent verification gate, while providing a persistent footer trigger for ongoing voluntary compliance review:
1. **Consent Detection**:
   - Upon authentication initialization (e.g. in `AuthService` or an application initialization guard), the client MUST inspect whether legal consent has been recorded for the authenticated user (checking `localStorage` key `cadgpt:consent:v1:<sub_id>` or backend user profile state).
2. **Modal Interception**:
   - If consent is missing, the Angular client MUST immediately display the Stitch Precision CAD slide-up consent bottom sheet component (`#consent-sheet`) over the dashboard in mandatory gating mode (`isConsentRequired() = true`).
   - The component MUST intercept user interactions, block route transitions to CAD tools or designs, and prevent execution of jobs or API calls until consent is granted.
3. **Consent Acknowledgment**:
   - When the user checks the agreement checkbox and clicks "Aceptar y Continuar" (or localized equivalent):
     - The client MUST persist the consent record with an ISO 8601 timestamp and agreement version (`v1`).
     - The modal MUST slide down and disappear.
     - Full interactive access to the CAD workbench dashboard MUST be unlocked.
4. **Returning User Bypass & Persistent Review Access**:
   - For users with valid consent already stored, the application MUST NOT show the bottom sheet during initial route loading and MUST allow immediate access to the dashboard.
   - However, the persistent application shell footer MUST provide a trigger button ("Data Treatment & CAD Governance" / "Tratamiento de Datos y Gobernanza CAD") enabling consented users to reopen and review data treatment terms at any time.
(Previously: For users with valid consent already stored, the application MUST NOT show the bottom sheet and MUST allow immediate access to the dashboard, with no mechanism to reopen or inspect terms once accepted.)

#### Scenario: Google SSO first-time login triggers consent bottom sheet
- GIVEN a user completing Google OAuth authentication for the first time
- WHEN redirected to the Angular dashboard without prior consent recorded
- THEN the dashboard is blurred and the slide-up consent bottom sheet is presented modally in mandatory gating mode

#### Scenario: Acknowledging consent unlocks web dashboard
- GIVEN the consent modal displayed on the web dashboard
- WHEN the user selects the checkbox and clicks "Aceptar y Continuar"
- THEN consent is recorded in local storage with the current timestamp, the modal slides down, and the dashboard becomes active

#### Scenario: Returning authenticated user bypasses initial consent modal
- GIVEN a user who has previously accepted data treatment consent
- WHEN logging in or refreshing the dashboard
- THEN the application verifies the stored consent record and allows immediate access without displaying the bottom sheet

---

### Requirement: Persistent Footer Review Trigger and Non-Destructive Dismissal
The application shell (`apps/web/src/app/layout/shell/`) MUST provide a persistent footer trigger allowing authenticated users to review data treatment terms without risking accidental revocation of their active consent:
1. **Persistent Review Trigger**:
   - The persistent footer in `shell.html` MUST render a trigger button (`footer.data_governance_btn`, "Data Treatment & CAD Governance" / "Tratamiento de Datos y Gobernanza CAD").
   - Clicking this trigger MUST set `isReviewingConsent` to `true`, displaying the `#consent-sheet` bottom sheet.
2. **Non-Destructive Review Mode**:
   - When `#consent-sheet` is rendered while `auth.hasConsent()` is `true` and `isReviewingConsent()` is `true`:
     - The sheet MUST display an active verification badge (`consent.status_active`: "Active Data Processing Consent Verified" / "Consentimiento Activo de Tratamiento de Datos Verificado").
     - The sheet MUST display a dedicated "Close" button (`consent.close_btn`: "Close" / "Cerrar") rather than requiring the acceptance checkbox.
     - The acceptance checkbox (`#consent-accept-check`) and mandatory gating submit button (`#consent-accept-btn`) MUST NOT be required to dismiss the dialog.
3. **Preservation of Consent Record**:
   - Clicking the "Close" button, pressing Escape, or clicking the backdrop overlay in review mode MUST dismiss the sheet by resetting `isReviewingConsent` to `false`.
   - The dismissal MUST NOT invoke `clearConsent()` or alter the stored consent key `cadgpt:consent:v1:<sub_id>` or timestamp.
(Previously: The consent bottom sheet lacked review mode, lacked an active consent verification badge, lacked a non-destructive Close action, and could not be voluntarily opened from the footer.)

#### Scenario: Consented user opens bottom sheet from footer trigger
- GIVEN an authenticated user who previously accepted consent (`auth.hasConsent() = true`)
- WHEN the user clicks the footer "Data Treatment & CAD Governance" button
- THEN `#consent-sheet` slides up displaying the active consent verification badge and a "Close" button

#### Scenario: Dismissing review sheet preserves existing consent timestamp
- GIVEN the consent sheet open in voluntary review mode with an existing consent record in `localStorage`
- WHEN the user clicks the "Close" button or clicks the backdrop scrim
- THEN the consent sheet slides down and closes, and the original consent timestamp in `localStorage` remains completely intact and unmodified

#### Scenario: Unconsented user continues to be blocked until explicit acceptance
- GIVEN an authenticated user with no consent recorded (`auth.hasConsent() = false`)
- WHEN the consent sheet is displayed
- THEN the sheet displays in mandatory gating mode requiring `#consent-accept-check` to be checked, and does not display the voluntary review "Close" button
