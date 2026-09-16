## social-authentication (NEW)

Purpose: Enable enterprise and individual single sign-on (SSO) via Google OAuth 2.0 Identity Provider in Keycloak, integrated seamlessly into the Stitch Precision CAD workbench design system.

### Requirement: Keycloak Google Identity Provider Realm Configuration
The Keycloak realm configuration files (`deploy/cadgpt-realm.json` and `deploy/prod/cadgpt-realm.prod.json`) MUST define a Google Identity Provider within the `identityProviders` array. The provider entry MUST specify:
- `alias`: `"google"`
- `displayName`: `"Google"`
- `providerId`: `"google"`
- `enabled`: `true`
- `updateProfileFirstLoginMode`: `"on"`
- `trustEmail`: `true`
- `storeToken`: `false`
- `firstBrokerLoginFlowAlias`: `"first broker login"`
- `config`: MUST resolve `clientId` via `${env.GOOGLE_CLIENT_ID}`, `clientSecret` via `${env.GOOGLE_CLIENT_SECRET}`, `defaultScope` set to `"openid profile email"`, and `syncMode` set to `"IMPORT"`.

#### Scenario: Google Identity Provider loaded in Keycloak realm
- GIVEN a Keycloak instance starting with the configured realm definition
- WHEN Keycloak parses the realm configuration
- THEN the `"google"` identity provider is active and enabled for user authentication

#### Scenario: Secrets resolved from container environment variables
- GIVEN environment variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are supplied to the Keycloak container
- WHEN Keycloak initializes the provider configuration
- THEN the provider uses the injected client ID and secret without exposing hardcoded credentials in version control

#### Scenario: Automatic account linking via verified email
- GIVEN an existing CAD Engine user with email `engineer@example.com`
- WHEN the user signs in using a Google account with verified email `engineer@example.com`
- THEN Keycloak trusts the verified email and links the Google identity to the existing CAD Engine user account

---

### Requirement: OAuth 2.0 Broker Callback Endpoint Handling
Keycloak MUST expose and handle the standard OpenID Connect callback endpoint at `/auth/realms/cadgpt/broker/google/endpoint`. Upon receiving a valid authorization code from Google:
1. Keycloak MUST exchange the authorization code for Google ID and access tokens over TLS.
2. Keycloak MUST import or update the user profile (first name, last name, email).
3. Keycloak MUST issue CAD Engine realm tokens containing standard claims (`sub`, `email`, `name`) and realm scopes `openid`, `profile`, `email`, `cad:read`, and `cad:write`.
4. Subsequent API calls to CAD Engine backend with the issued JWT MUST be authorized for CAD read and write operations.

#### Scenario: Successful Google SSO authentication flow
- GIVEN a user completing Google OAuth consent at `accounts.google.com`
- WHEN Google redirects to `/auth/realms/cadgpt/broker/google/endpoint` with a valid authorization code
- THEN Keycloak establishes a realm session and issues a JWT carrying `cad:read` and `cad:write` scopes

#### Scenario: Denied consent or invalid OAuth code
- GIVEN a user cancels consent or Google returns an authorization error
- WHEN the callback endpoint receives the error query parameters
- THEN Keycloak displays a localized login error message and does not create an authenticated session

---

### Requirement: Stitch Precision Workbench Social Login UI Styling
The Keycloak login theme (`deploy/themes/cadgpt/login/resources/css/stitch.css`) MUST style social provider elements (`#kc-social-providers`, `#social-google`, and the separating divider) to match the Stitch Precision CAD workbench aesthetic:
1. **Divider**: A subtle separating rule using `--stitch-border` (`rgba(255, 255, 255, 0.12)`) and text "or continue with" styled with `--stitch-ink-muted` in JetBrains Mono / Inter typography.
2. **Google Button (`#social-google`)**:
   - Background: `var(--stitch-surface-variant)` (`#131B2E`).
   - Border: `1px solid rgba(255, 255, 255, 0.16)`.
   - Text Color: `var(--stitch-ink)` (`#F8FAFC`).
   - Border Radius: `4px` (consistent with CAD workbench buttons).
   - Icon: An inline or embedded high-DPI Google multi-color SVG icon.
   - Hover State: Border transition to `var(--stitch-primary)` (`#00F0FF`) with subtle cyan glow (`box-shadow: 0 0 14px rgba(0, 240, 255, 0.25)`).
   - Active State: `transform: scale(0.99)`.
   - Focus State: Accessible keyboard focus outline using `var(--stitch-primary)`.

#### Scenario: Google login button renders with Stitch tokens
- GIVEN a user navigating to the CAD Engine login page
- WHEN the login form renders
- THEN the Google login button displays with `#131B2E` background, high-DPI Google icon, and muted divider

#### Scenario: Google button hover interaction
- GIVEN the login page displayed on desktop
- WHEN the user hovers the cursor over `#social-google`
- THEN the border color illuminates in Electric Cyan (`#00F0FF`) with a `0 0 14px rgba(0, 240, 255, 0.25)` drop glow

#### Scenario: Responsive layout adaptation
- GIVEN a mobile viewport (width <= 480px)
- WHEN the login form renders
- THEN `#social-google` expands to 100% container width while maintaining minimum 44px touch target height
