## mcp-client-onboarding (MODIFIED)

Purpose: Guide the user from pairing to a connected Claude/ChatGPT MCP client, enforcing unified `cad-engine` server naming and `0.2.0-alpha.1` protocol versioning, with comprehensive bilingual (EN/ES) internationalization across all onboarding guides, device statuses, and operating system daemon instructions.

### Requirement: Post-Pairing Connect Step and Bilingual Internationalization
After a device completes pairing (or when navigating to the Connect route `/connect`), the web application (`apps/web/src/app/pages/connect/`) MUST present a guided "connect your MCP client" step displaying connection instructions, device health states, and system keep-alive configuration snippets updated for `cad-engine` and release `0.2.0-alpha.1`, with full bilingual internationalization:
1. **Bilingual Onboarding Guides**:
   - The Connect view MUST render all headers, eyebrow text (`connect.eyebrow`), subtitles, and step-by-step instructions for Claude (`connect.claude_*`) and ChatGPT (`connect.chatgpt_*`) through `TranslatePipe`.
   - Claude instructions MUST detail: navigating to Settings → Connectors, adding custom connector, pasting the MCP resource URL, and signing in with CAD Agent Designer credentials.
   - ChatGPT instructions MUST detail: navigating to Settings → Connectors, enabling Developer mode, adding connector, and pasting the MCP resource URL.
2. **Localized Copy Actions & Accessibility**:
   - All interactive copy buttons (`connect.copy_url`, `connect.copy_snippet`) and temporary feedback states (`connect.copied`, `connect.snippet_copied`) MUST use localized dictionary keys.
   - Dynamic `aria-label` attributes on copy buttons MUST translate dynamically to reflect the action and target resource in the active language.
3. **Localized Device Health States**:
   - The device status indicator panel MUST translate all operational statuses via `TranslatePipe`:
     - `"connect.device_title"`: "Device status" / "Estado del dispositivo"
     - `"connect.device_waiting"`: "Waiting for this computer to come online…" / "Esperando a que este equipo se conecte…"
     - `"connect.device_online"`: "Online" / "En línea"
     - `"connect.device_offline"`: "Offline" / "Desconectado"
     - `"connect.device_looking_up"`: "Looking up this device…" / "Buscando este dispositivo…"
     - `"connect.device_not_found_lead"` / `"connect.device_linked_link"`: Link prompt when device is missing
     - `"connect.device_empty_lead"` / `"connect.device_pair_link"`: Link prompt when no devices have been paired
4. **Localized Cross-Platform Daemon Keep-Alive Instructions**:
   - The keep-alive section (`connect.keep_alive_*`) MUST render localized titles, descriptions, platform names, subtitles, and instructions for:
     - Linux: `systemd` service configuration and paths (`connect.linux_*`).
     - macOS: `launchd` LaunchAgent configuration, path, and `launchctl load` hint (`connect.macos_*`).
     - Windows: Task Scheduler PowerShell command and administrative instructions (`connect.windows_*`).
5. **Synchronous Language Reactivity**:
   - Switching the active UI language MUST immediately re-render all Connect page copy, status labels, daemon tabs, and modeling hints without reloading or disrupting copied states.
(Previously: The Post-Pairing Connect step displayed hardcoded English connection instructions, device status messages, and daemon snippets with no internationalization, dictionary keys, or reactive language toggling.)

#### Scenario: Step shown after pairing with Claude instructions (Bilingual)
- GIVEN a device pairing just completed or the user navigating to `/connect`
- WHEN the onboarding step is shown in English or Spanish
- THEN Claude-specific MCP connection instructions referencing `cad-engine` are rendered in the selected language via `TranslatePipe`

#### Scenario: Step shown after pairing with ChatGPT instructions (Bilingual)
- GIVEN the Connect page displayed in the browser
- WHEN the user views the ChatGPT connector card
- THEN ChatGPT-specific MCP connection instructions referencing `cad-engine` and Developer mode are displayed in the active language

#### Scenario: Device status states render localized text
- GIVEN a paired device in either online, offline, or pending state
- WHEN the device status panel renders
- THEN the status indicator and description string use the corresponding `connect.device_*` localized translation

#### Scenario: Keep-alive daemon instructions render localized text across operating systems
- GIVEN a user reviewing agent service persistence on the Connect page
- WHEN expanding Linux, macOS, or Windows keep-alive tabs
- THEN the service descriptions, configuration instructions, and copy button aria-labels are rendered using localized strings from `translations.ts`

#### Scenario: Dynamic language switch updates Connect page immediately
- GIVEN a user on `/connect` viewing instructions in English
- WHEN the user selects Spanish in the language switcher
- THEN all headers, Claude/ChatGPT guides, device statuses, and keep-alive instructions update to Spanish immediately without page navigation
