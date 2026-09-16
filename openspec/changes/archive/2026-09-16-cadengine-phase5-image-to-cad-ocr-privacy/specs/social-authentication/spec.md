## social-authentication (MODIFIED)

Purpose: Enforce first-login data governance and treatment consent verification for Google SSO sessions, bridging the Keycloak identity broker flow with the client consent gate.

### Requirement: First-Login Data Governance Consent Enforcement for Google SSO
Because users authenticating via the Google Identity Provider bypass Keycloak's standard self-registration template (`register.ftl`) through the `first broker login` flow, the system MUST enforce an active consent gate on first broker login:
1. **First-Login Interception**:
   - Following token exchange at `/auth/realms/cadgpt/broker/google/endpoint` and subsequent redirect to the Angular web application, the application MUST check whether legal data treatment consent has been recorded for the authenticated user (via local storage key `cadgpt:consent:v1:<sub_or_version>` or backend user profile state).
2. **Access Blocking**:
   - If consent is not recorded, the web application MUST immediately present the Stitch Precision CAD slide-up consent bottom sheet (`#consent-sheet`) modally.
   - The application MUST intercept navigation and disable interaction with CAD tools, device management, document creation, and job submission until consent is accepted.
3. **Consent Persistence & Unlocking**:
   - The user MUST actively check the consent agreement checkbox and click "Aceptar y Continuar".
   - Upon clicking acceptance, the application MUST persist the consent record with an ISO 8601 timestamp, dismiss the bottom sheet, and grant interactive access to the CAD workbench.
   - Subsequent logins for the same user with valid consent MUST NOT display the consent gate.

#### Scenario: Google SSO first login displays consent bottom sheet
- GIVEN a user completing Google SSO authentication for the first time
- WHEN the browser redirects to the CAD Engine web dashboard
- THEN the application intercepts route loading and displays the modal slide-up consent bottom sheet

#### Scenario: Dashboard access blocked until Google SSO user accepts consent
- GIVEN the consent bottom sheet displayed on the dashboard for a new Google SSO session
- WHEN the user attempts to navigate to designs or devices without accepting
- THEN interaction is blocked and the dashboard remains blurred behind the backdrop

#### Scenario: Accepted consent unlocks dashboard and persists state
- GIVEN the user checks the agreement checkbox and clicks "Aceptar y Continuar"
- WHEN the consent action executes
- THEN the consent record is stored locally with an ISO timestamp, the sheet slides down, and dashboard tools are unlocked

#### Scenario: Subsequent Google SSO logins bypass consent gate
- GIVEN a returning Google SSO user who previously accepted consent
- WHEN logging in through Google OAuth
- THEN the application verifies the existing consent record and opens the CAD dashboard directly
