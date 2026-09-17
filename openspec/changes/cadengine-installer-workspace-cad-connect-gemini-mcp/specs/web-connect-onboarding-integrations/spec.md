## web-connect-onboarding-integrations (NEW)

Purpose: Provide comprehensive, bilingual integration guides on the web dashboard Connect page (`/connect`) for API Key management, Google Gemini (API and Function Calling), and Generic MCP Clients (Cursor, Windsurf, Claude Desktop, Antigravity) with 100% translation parity across English and Spanish.

---

### Requirement: Prominent API Key Setup Guide and Scope Delegation
The web dashboard Connect page (`apps/web/src/app/pages/connect/`) MUST present a prominent, dedicated API Key Setup panel positioned at the top of the `/connect` view:
1. **Direct Navigation**:
   - The panel MUST provide an internal router link directing users to the API Key management page (`/api-keys`).
2. **Scope Guidance**:
   - The guide MUST explicitly specify the required scopes for MCP and REST client access:
     - `cad:read`: Read geometry, inspect CAD scenes, view device status, and export 3D meshes.
     - `cad:write`: Create 3D solids, apply boolean operations, translate/rotate bodies, and modify drawings.
3. **Bearer Authorization Syntax**:
   - The guide MUST display the standard HTTP authorization header syntax:
     ```http
     Authorization: Bearer <your_api_key>
     ```
   - The snippet MUST include an interactive copy button with localized clipboard feedback (`connect.copy_snippet` / `connect.snippet_copied`).

#### Scenario: Connect page renders dedicated API Key guide at top of view
- GIVEN a user navigating to `/connect`
- WHEN the page renders
- THEN the API Key setup panel is positioned at the top of the main content area, displaying a badge, descriptive lead text, and a direct router link to `/api-keys`

#### Scenario: API Key guide links to /api-keys and details required scopes
- GIVEN a user reviewing the API Key guide on `/connect`
- WHEN the user reads the scope requirements
- THEN the text clearly identifies `cad:read` and `cad:write` scopes and clicking the link navigates to `/api-keys` without a full page reload

#### Scenario: Bearer authorization snippet is copyable with clipboard feedback
- GIVEN the API Key guide displaying `Authorization: Bearer <your_api_key>`
- WHEN the user clicks the copy snippet button
- THEN the header string is copied to the system clipboard and the button updates its label to "Copied!" (or "¡Copiado!") temporarily

---

### Requirement: Google Gemini Integration Guide
The Connect page MUST provide a dedicated integration guide for Google Gemini (API and Function Calling):
1. **SDK & API Architecture**:
   - The guide MUST document connecting Google Gemini models (Gemini 2.5 Flash, Gemini 1.5 Pro) to CAD Engine using the official Google GenAI Python SDK (`google-genai`), Vertex AI, or Gemini CLI.
2. **Copyable Python Integration Snippet**:
   - The guide MUST present an interactive, copyable Python code snippet demonstrating:
     - Initialization of `genai.Client()`.
     - Configuration of endpoint `https://cadengine.danny-armijos.com/mcp` and `CADENGINE_API_KEY` Bearer authentication.
     - Invocation of Gemini function calling declarations targeting CAD Engine parametric tools (e.g. creating solids, boolean operations).
3. **Copy Action & Feedback**:
   - The code block MUST provide a one-click copy button that places the complete Python snippet onto the system clipboard.

#### Scenario: Google Gemini guide section renders with copyable Python SDK snippet
- GIVEN a user viewing `/connect`
- WHEN navigating to the Google Gemini section
- THEN the section displays a Gemini badge, lead instructions, and an interactive code box containing the Python GenAI SDK integration snippet

#### Scenario: Gemini snippet copy button provides instant visual feedback
- GIVEN the Gemini code snippet box
- WHEN the user clicks "Copy snippet"
- THEN the complete Python script is copied to the clipboard and the button displays confirmation feedback

---

### Requirement: Generic MCP Client Integration and Configuration Matrix
The Connect page MUST provide a unified Generic MCP Client integration section compatible with all standard Model Context Protocol clients:
1. **Standard `mcpServers` JSON Configuration**:
   - The guide MUST present the standard MCP configuration snippet:
     ```json
     {
       "mcpServers": {
         "cadengine": {
           "url": "https://cadengine.danny-armijos.com/mcp",
           "headers": {
             "Authorization": "Bearer YOUR_API_KEY"
           }
         }
       }
     }
     ```
   - The JSON block MUST provide an interactive copy button.
2. **Client Configuration Matrix**:
   - The guide MUST present a structured lookup table indicating exact configuration file paths for principal MCP clients:
     - **Cursor**: `.cursor/mcp.json`
     - **Windsurf**: `~/.codeium/windsurf/mcp_config.json`
     - **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
     - **Antigravity / Gemini CLI**: `~/.gemini/antigravity-cli/mcp/`

#### Scenario: Generic MCP client panel displays standard mcpServers configuration snippet
- GIVEN a user seeking to configure a third-party MCP client
- WHEN the user views the Generic MCP Client panel on `/connect`
- THEN it renders the JSON `mcpServers` object with the production CAD Engine URL and Bearer Authorization header placeholder

#### Scenario: MCP config matrix displays configuration paths for Cursor, Windsurf, Claude Desktop, and Antigravity
- GIVEN the Generic MCP section on `/connect`
- WHEN the user inspects the client paths table
- THEN each client (Cursor, Windsurf, Claude Desktop, Antigravity) is listed with its exact filesystem configuration path

#### Scenario: Copying generic MCP snippet copies valid JSON to clipboard
- GIVEN the generic MCP configuration snippet
- WHEN the user clicks the copy button
- THEN the JSON content is copied to the clipboard and verified as valid JSON

---

### Requirement: Bilingual Translation Parity Across English and Spanish
The Connect page internationalization dictionary in `apps/web/src/app/core/i18n/translations.ts` MUST maintain 100% translation parity across English (`en`) and Spanish (`es`):
1. **Complete Dictionary Parity**:
   - Every translation key defined under `connect.api_key_*`, `connect.gemini_*`, and `connect.generic_mcp_*` in `en` MUST have an exact corresponding entry in `es`.
2. **Synchronous Reactivity**:
   - When the user toggles between English and Spanish in the application navigation header, all API Key steps, Gemini guides, Generic MCP configuration tables, and button feedback states MUST update instantaneously via `TranslatePipe` without requiring page reload.

#### Scenario: Full translation parity between English and Spanish for Connect keys
- GIVEN `translations.ts` in `apps/web`
- WHEN comparing the set of keys in `en` versus `es` for the Connect namespace
- THEN the keys match 100% with no missing or undefined Spanish translations

#### Scenario: Dynamic language switch translates API Key, Gemini, and Generic MCP sections instantaneously
- GIVEN a user viewing `/connect` in English
- WHEN the user toggles the language selector to Spanish
- THEN all headings, scope descriptions, code block labels, and table headers immediately switch to Spanish
