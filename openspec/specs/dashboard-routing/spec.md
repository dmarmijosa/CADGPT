## dashboard-routing (NEW)

Purpose: build routing/component architecture from scratch (`app.routes.ts` is currently empty).

### Requirement: Route Structure
The app MUST define lazy-loaded routes for dashboard home, devices, designs list, design detail, job history, and informational pages.
#### Scenario: Lazy route loads on navigation
- GIVEN the app is loaded at root
- WHEN the user navigates to `/designs`
- THEN the designs feature module loads on demand

### Requirement: Auth Guard
Every dashboard route except informational/public pages MUST require a valid OIDC session and redirect unauthenticated users to sign-in.
#### Scenario: Unauthenticated redirect
- GIVEN no active session
- WHEN a user navigates to `/designs/:id`
- THEN the router redirects to sign-in before rendering
