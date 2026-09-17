# Exploration: CAD Engine Phase 7 — Comprehensive i18n, About Page Overhaul, Author Attribution & Persistent Data Governance

**Change ID:** `cadengine-phase7-i18n-about-author-governance`  
**Target Release:** `v0.2.0-alpha.2`  
**Status:** In Progress  
**Author:** sdd-explore subagent  

---

## 1. Executive Summary

Phase 7 resolves user-facing internationalization gaps, enriches architectural transparency with Blender 4.x integration details, guarantees persistent GDPR / ISO/IEC 27001 compliance accessibility from any page, and establishes formal author attribution.

This exploration investigates the existing codebase across the Angular frontend (`apps/web`) and Python agent (`agent/cadgpt_agent`), analyzing the delta between the current baseline and required behavior across five core pillars:

1. **Default OS Language Detection & Daemon Alignment:**
   - Enhances [`TranslationService.getInitialLanguage()`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translation.service.ts) to evaluate `navigator.languages` and `navigator.language` hierarchically when `localStorage` has no stored preference.
   - Verifies functional parity with the Python agent's [`detect_locale()`](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/i18n.py#L188-L208).
   - Augments the Angular unit test suite in [`i18n.service.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/i18n.service.spec.ts) with multi-locale mock scenarios.

2. **Exhaustive Internationalization (i18n) of All Literals:**
   - Audits all untranslated strings across [`connect.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) (eyebrow, Claude/ChatGPT setup guides, device status messages, keep-alive snippets, and modeling hints).
   - Audits untranslated English and hardcoded Spanish blocks in [`about.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.html) (status disclaimers, compatibility matrix, security items, and the account deletion dialog).
   - Expands both `en` and `es` dictionaries in [`translations.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts) with comprehensive, structured key hierarchies.

3. **Persistent Data Treatment & CAD Governance in App Shell:**
   - Extends [`shell.html`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.html), [`shell.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.ts), and [`shell.css`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.css) with a persistent footer trigger allowing users who have previously accepted data processing terms to review the bottom sheet anytime.
   - Decouples mandatory initial gating from voluntary policy review, introducing a "Close" dismiss action in review mode that does not revoke stored consent.

4. **About Page Overhaul — Blender 4.x & Tri-Engine Architecture:**
   - Incorporates Blender 4.x into the compatibility matrix: headless background execution (`blender -b`), Python API, subdivision surfaces (Subsurf), procedural displacement modifiers, quad topology, and binary glTF/OBJ/STL preview exports.
   - Formulates the Tri-Engine Architecture articulating the distinct mechanical and artistic roles of **FreeCAD** (parametric CSG / B-Rep), **AutoCAD** (2D drafting, DWG/DXF, Core Console ACIS solids), and **Blender** (polygonal meshes, organic subdivision surfaces).

5. **Author Attribution & Accessible Social Links:**
   - Attributes design and development to **Danny Armijos**.
   - Integrates accessible external links (`rel="noopener noreferrer"`, `target="_blank"`) to LinkedIn ([https://www.linkedin.com/in/dmarmijosa/](https://www.linkedin.com/in/dmarmijosa/)) and Personal Website ([https://www.danny-armijos.com/](https://www.danny-armijos.com/)) in both the persistent footer and the About page.

```
+----------------------------------------------------------------------------------------------------+
|                         CAD ENGINE PLATFORM (PHASE 7 ARCHITECTURE)                                 |
+-----------------------------------+--------------------------------+-------------------------------+
|    1. OS I18N & LOCALIZATION      |  2. PERSISTENT GOVERNANCE      | 3. TRI-ENGINE & ATTRIBUTION   |
|  - navigator.languages hierarchy  |  - Persistent Footer Trigger   | - FreeCAD (CSG / B-Rep)       |
|  - Storage preference precedence  |  - Voluntary Review vs Gating  | - AutoCAD (DWG / Core Console)|
|  - Alignment with agent Python    |  - Close without reset consent | - Blender 4.x (Subdiv / glTF) |
|  - 100% template coverage (pipe)  |  - GDPR / ISO 27001 retention  | - Author Danny Armijos Links  |
+-----------------------------------+--------------------------------+-------------------------------+
```

---

## 2. Current State vs. Desired State

### 2.1 Default OS Language Detection

#### Current Implementation ([apps/web/src/app/core/i18n/translation.service.ts:12-29](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translation.service.ts#L12-L29))
```typescript
private getInitialLanguage(): SupportedLanguage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(this.storageKey);
      if (stored === 'en' || stored === 'es') {
        return stored;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      if (navigator.language.toLowerCase().startsWith('es')) {
        return 'es';
      }
    }
  } catch {
    // Ignore security errors or missing storage
  }
  return 'en';
}
```

#### Issues Identified:
1. **Ignores `navigator.languages` array:** In modern browsers, `navigator.languages` contains the prioritized list of preferred locales configured in the operating system or browser settings (e.g., `['es-ES', 'es', 'en-US', 'en']`). Looking solely at `navigator.language` ignores secondary preferences or cases where `navigator.languages[0]` reflects OS hierarchy while `navigator.language` reflects browser UI locale.
2. **Missing English Priority Check:** If a user specifies `['en-US', 'es-ES']`, checking for Spanish prefix across non-ordered properties could prematurely trigger Spanish if not scanned in user-preference order.
3. **Alignment with Python Agent ([agent/cadgpt_agent/i18n.py:188-208](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/i18n.py#L188-L208)):**
   ```python
   def detect_locale() -> str:
       """Detect default system locale, defaulting to 'es' if starting with 'es', else 'en'."""
       candidates: list[Optional[str]] = [
           os.environ.get("LC_ALL"),
           os.environ.get("LC_MESSAGES"),
           os.environ.get("LANG"),
       ]
       try:
           candidates.append(locale.getlocale()[0])
       except Exception:
           pass
       try:
           candidates.append(locale.getdefaultlocale()[0])
       except Exception:
           pass

       for cand in candidates:
           if cand and cand.lower().startswith("es"):
               return "es"
       return "en"
   ```
   The Python implementation scans candidate variables in priority order. The web app should mirror this candidate scanning across `navigator.languages` and `navigator.language`.

#### Desired Design for `getInitialLanguage()`:
```typescript
private getInitialLanguage(): SupportedLanguage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(this.storageKey);
      if (stored === 'en' || stored === 'es') {
        return stored;
      }
    }
    if (typeof navigator !== 'undefined') {
      const candidates: string[] = [];
      if (Array.isArray(navigator.languages)) {
        candidates.push(...navigator.languages);
      }
      if (navigator.language) {
        candidates.push(navigator.language);
      }
      for (const cand of candidates) {
        if (typeof cand === 'string') {
          const lower = cand.toLowerCase();
          if (lower.startsWith('es')) {
            return 'es';
          }
          if (lower.startsWith('en')) {
            return 'en';
          }
        }
      }
    }
  } catch {
    // Ignore security errors or missing storage
  }
  return 'en';
}
```

---

### 2.2 Text Literals & Internationalization (i18n)

#### Audit of Untranslated Strings in `connect.html` ([apps/web/src/app/pages/connect/connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html)):
1. **Header & Eyebrow:**
   - `"CONNECT YOUR MCP CLIENT"` (Line 2)
   - `"Almost there."` (Line 3)
   - `"Paste this deployment's MCP resource URL into Claude or ChatGPT to finish connecting."` (Line 4)
2. **Resource URL Panel:**
   - `"MCP resource URL"` (Line 8)
   - `'Copy ' + resourceUrl` aria label (Line 16)
   - `copied() ? 'Copied!' : 'Copy URL'` (Line 18)
3. **Claude & ChatGPT Steps Panels:**
   - `"Connect Claude"` (Line 23)
   - `"Open Claude and go to Settings → Connectors."` (Line 25)
   - `"Choose Add custom connector."` (Line 26)
   - `"Paste the MCP resource URL above."` (Line 27)
   - `"Sign in with your CAD Agent Designer account when prompted."` (Line 28)
   - `"Connect ChatGPT"` (Line 33)
   - `"Open ChatGPT and go to Settings → Connectors."` (Line 35)
   - `"Turn on Developer mode."` (Line 36)
   - `"Choose Add and paste the MCP resource URL above."` (Line 37)
4. **Device Status Panel:**
   - `"Device status"` (Line 42)
   - `"Could not load device status."` (Line 44)
   - `"Waiting for this computer to come online…"` (Line 49)
   - `"Online"` / `"Offline"` (Line 49, 65)
   - `"Looking up this device…"` (Line 54)
   - `"This device was not found. Check your linked computers."` (Line 56)
   - `"Loading device status…"` (Line 59)
   - `"No linked computers yet. Pair one first."` (Line 72)
5. **Keep-Alive Section:**
   - `"Keep the agent running"` (Line 79)
   - `"Configure the agent to survive user logouts and system reboots on your CAD workstation."` (Line 80)
   - `"systemd service"` / `"launchd LaunchAgent"` / `"Task Scheduler (PowerShell)"` (Lines 89, 112, 139)
   - Instruction paragraphs for Linux, macOS, and Windows (Lines 92, 115, 142)
   - Button aria-labels and labels (`"Copy Linux systemd snippet"`, `"Copied!"`, `"Copy snippet"`)
   - `"Load immediately:"` hint (Line 130)
6. **Try It Callout:**
   - `"Try it — Mechanical & Parametric CAD"` (Line 161)
   - Prompt instructions & hint text (Lines 163-171)

#### Audit of Untranslated Strings in `about.html` ([apps/web/src/app/pages/about/about.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.html)):
1. **Status Panel:**
   - `"Status"` heading (Line 7)
   - Description text regarding experimental alpha, unsigned installers, macOS notarization (Lines 9-11)
2. **Compatibility Matrix:**
   - `"Compatibility"` heading (Line 15)
   - Table headers (`"CAD / platform"`, `"Alpha behavior"`) (Lines 19-20)
   - Rows for FreeCAD CLI, FreeCAD GUI, AutoCAD 2026 Core Console, AutoCAD LT, AutoCAD Linux (Lines 24-53)
3. **Security and Limitations:**
   - `"Security and limitations"` heading (Line 58)
   - All 5 bullet points regarding OIDC tokens, pairing code TTL, revocation, STL mesh quota, backend instance (Lines 60-75)
   - Links: `"Read the full README ↗"`, `"SECURITY.md ↗"`, `"on GitHub."` (Lines 77-78)
4. **Account Governance & Modal (Currently Hardcoded in Spanish):**
   - Headings and descriptions in English/Spanish mix: `"Account Governance / Right to Erasure"`, `"Eliminar cuenta"`, `"PELIGRO / IRREVERSIBLE"`, `"¿Eliminar cuenta permanentemente?"`, warning list, input instructions, buttons (`"Cancelar"`, `"Eliminar permanentemente"`).

---

### 2.3 Persistent Data Treatment Review Trigger in Footer

#### Current Implementation ([apps/web/src/app/layout/shell/shell.ts:25-34](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.ts#L25-L34))
```typescript
readonly consentAccepted = signal(false);
readonly isDismissed = signal(false);

readonly isConsentRequired = computed(() => {
  if (this.isDismissed()) return false;
  const user = this.auth.user();
  if (!user) return false;
  return !this.auth.hasConsent();
});
```

#### Invariant and Usability Gap:
- Once an authenticated user accepts consent (`auth.recordConsent()`), `hasConsent()` becomes `true`.
- The consent sheet (`#consent-sheet`) is guarded by `@if (isConsentRequired())`. Consequently, after initial onboarding, the sheet is permanently inaccessible.
- Under GDPR Article 7(3) and ISO/IEC 27001 transparency controls, users must be able to inspect data processing policies and understand their data treatment terms at any time during their active session.
- If reopened from the footer, closing the sheet must **not** clear or revoke consent.

#### Desired Design:
- Introduce a reactive review signal: `readonly isReviewingConsent = signal(false)`.
- Reopening trigger in `footer`:
  ```html
  <button
    type="button"
    class="footer-link-btn"
    (click)="openConsentReview()"
    aria-haspopup="dialog"
  >
    {{ 'footer.data_governance_btn' | translate }}
  </button>
  ```
- Computed sheet visibility:
  ```typescript
  readonly showConsentSheet = computed(() => this.isConsentRequired() || this.isReviewingConsent());
  ```
- When `isReviewingConsent()` is `true` and user already has consent (`auth.hasConsent()`):
  - Render a status badge confirming that consent is active.
  - Present a clean "Close" button (`consent.close_btn` / "Cerrar" / "Close").
  - Allow closing by clicking backdrop or clicking "Close" button without calling `clearConsent()`.

---

### 2.4 About Page Overhaul: Blender 4.x & Tri-Engine Architecture

#### Current State:
- `about.html` only describes FreeCAD and AutoCAD.
- While Phase 6 introduced `BlenderStrategy`, `blender_worker.py`, and discovery for Blender binaries in `agent/cadgpt_agent/`, the web dashboard's About page does not reflect Blender's capabilities or explain how the three engines operate collectively.

#### Desired Architecture:
1. **Tri-Engine Architecture Section:**
   - **FreeCAD:** Parametric CSG (Constructive Solid Geometry), boundary representation (B-Rep), constraint sketcher, STEP/IGES engineering export.
   - **AutoCAD:** 2D architectural/mechanical drafting, native DWG/DXF layer management, headless 3D solid modeling via `accoreconsole.exe`, and MASSPROP volumetric analysis.
   - **Blender 4.x:** Headless 3D polygonal modeling via Python API (`blender -b`), Catmull-Clark subdivision surfaces (`Subsurf`), procedural displacement modifiers, quad topology, and binary glTF/OBJ/STL preview mesh generation.
2. **Compatibility Matrix Addition:**
   - Entry: `Blender 4.x (headless background execution, Windows / macOS / Linux)`
   - Behavior: `Headless 3D polygonal modeling, subdivision surfaces, procedural displacement, quad topology, and binary glTF/OBJ/STL preview export. Enabled with --enable-blender.`

---

### 2.5 Author Attribution & Social Links

#### Requirements:
- Author: **Danny Armijos**
- LinkedIn: `https://www.linkedin.com/in/dmarmijosa/`
- Personal Website: `https://www.danny-armijos.com/`
- Security and Accessibility: All external links must include `target="_blank"`, `rel="noopener noreferrer"`, and descriptive `aria-label` attributes.
- Placement:
  1. Persistent Shell Footer (`shell.html`): Compact attribution with author name and clickable links.
  2. About Page (`about.html`): Dedicated Author & Lead Maintainer card highlighting engineering background and direct profile links.

---

## 3. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Browser Initialization
        NAV["navigator.languages / navigator.language"]
        STORE["localStorage('cadgpt_lang')"]
        INIT["TranslationService.getInitialLanguage()"]
        STORE -->|Stored Preference Exists| INIT
        NAV -->|No Stored Preference| INIT
        INIT -->|Fallback 'en'| ACTIVE_LANG["currentLang() Signal"]
    end

    subgraph App Shell & Footer
        FOOTER["Footer (All Pages)"]
        AUTH_LINK["Author Attribution<br/>Danny Armijos (LinkedIn, Web)"]
        GOV_BTN["'Data Treatment & CAD Governance' Trigger"]
        FOOTER --> AUTH_LINK
        FOOTER --> GOV_BTN
    end

    subgraph Governance Sheet Modes
        GOV_BTN -->|Click| REVIEW_MODE["isReviewingConsent.set(true)"]
        NEW_USER["New Authenticated User"] -->|!hasConsent()| GATE_MODE["isConsentRequired() = true"]
        
        REVIEW_MODE --> SHEET["#consent-sheet Modal"]
        GATE_MODE --> SHEET
        
        SHEET -->|Review Mode| CLOSE_ACT["Close Button -> Dismiss (Consent Untouched)"]
        SHEET -->|Gate Mode| ACCEPT_ACT["Checkbox + Accept -> recordConsent()"]
    end

    subgraph Tri-Engine Execution
        ABOUT_PAGE["About Page View"]
        ABOUT_PAGE --> CSG["FreeCAD: Parametric CSG / STEP"]
        ABOUT_PAGE --> DWG["AutoCAD: Drafting / accoreconsole DWG"]
        ABOUT_PAGE --> POLY["Blender 4.x: Subdiv / glTF Meshes"]
    end
```

---

## 4. Detailed Translation Dictionary Specification

Below is the planned additions to [`TRANSLATIONS`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts) for `en` and `es`:

### 4.1 English Dictionary (`en`)
```typescript
// Shell Footer & Author
'footer.author_lead': 'Developed by',
'footer.author_name': 'Danny Armijos',
'footer.author_website': 'Website',
'footer.data_governance_btn': 'Data Treatment & CAD Governance',

// Consent Sheet Review Mode
'consent.status_active': 'Active Data Processing Consent Verified',
'consent.close_btn': 'Close',

// Connect Page
'connect.eyebrow': 'CONNECT YOUR MCP CLIENT',
'connect.title': 'Almost there.',
'connect.subtitle': "Paste this deployment's MCP resource URL into Claude or ChatGPT to finish connecting.",
'connect.mcp_url_title': 'MCP resource URL',
'connect.copy_url': 'Copy URL',
'connect.copied': 'Copied!',
'connect.copy_aria': 'Copy {url}',
'connect.claude_title': 'Connect Claude',
'connect.claude_step1': 'Open Claude and go to Settings → Connectors.',
'connect.claude_step2': 'Choose Add custom connector.',
'connect.claude_step3': 'Paste the MCP resource URL above.',
'connect.claude_step4': 'Sign in with your CAD Agent Designer account when prompted.',
'connect.chatgpt_title': 'Connect ChatGPT',
'connect.chatgpt_step1': 'Open ChatGPT and go to Settings → Connectors.',
'connect.chatgpt_step2': 'Turn on Developer mode.',
'connect.chatgpt_step3': 'Choose Add and paste the MCP resource URL above.',
'connect.device_title': 'Device status',
'connect.device_error': 'Could not load device status.',
'connect.device_waiting': 'Waiting for this computer to come online…',
'connect.device_online': 'Online',
'connect.device_offline': 'Offline',
'connect.device_looking_up': 'Looking up this device…',
'connect.device_not_found_lead': 'This device was not found. Check',
'connect.device_linked_link': 'your linked computers',
'connect.device_loading': 'Loading device status…',
'connect.device_empty_lead': 'No linked computers yet.',
'connect.device_pair_link': 'Pair one first',
'connect.keep_alive_title': 'Keep the agent running',
'connect.keep_alive_desc': 'Configure the agent to survive user logouts and system reboots on your CAD workstation.',
'connect.linux_name': 'Linux',
'connect.linux_subtitle': 'systemd service',
'connect.linux_instruction': 'Create a service under /etc/systemd/system/cadengine.service (replace youruser with your paired account):',
'connect.linux_copy_aria': 'Copy Linux systemd snippet',
'connect.macos_name': 'macOS',
'connect.macos_subtitle': 'launchd LaunchAgent',
'connect.macos_instruction': 'Create ~/Library/LaunchAgents/com.cadengine.agent.plist to run within your user session:',
'connect.macos_copy_aria': 'Copy macOS launchd snippet',
'connect.macos_hint': 'Load immediately:',
'connect.windows_name': 'Windows',
'connect.windows_subtitle': 'Task Scheduler (PowerShell)',
'connect.windows_instruction': 'Run in an Administrator PowerShell (replace YOURUSER with the account that paired):',
'connect.windows_copy_aria': 'Copy Windows PowerShell snippet',
'connect.copy_snippet': 'Copy snippet',
'connect.snippet_copied': 'Copied!',
'connect.try_title': 'Try it — Mechanical & Parametric CAD',
'connect.try_desc': 'Once connected, ask your assistant to run list_devices, or ask it to model mechanical components: "Create a mounting bracket with 4 counterbore holes" or "Model an extruded enclosure profile".',
'connect.try_hint': 'Note: CAD Agent Designer specializes in precision parametric and mechanical CAD modeling (primitives, transforms, booleans, and extrusions), alongside polygonal subdivision modeling with Blender 4.x.',

// About Page
'about.status_title': 'Status',
'about.status_desc': 'CAD Engine is an experimental alpha, not a hosted service. Installers are unsigned and macOS builds are not notarized; you deploy and operate your own backend.',
'about.arch_title': 'Tri-Engine Architecture',
'about.arch_desc': 'CAD Engine unifies three specialized engineering engines into a single allowlisted execution surface, delegating operations to the optimal kernel based on geometric modeling requirements:',
'about.arch_freecad_title': 'FreeCAD (Parametric CSG & B-Rep)',
'about.arch_freecad_desc': 'Constructive Solid Geometry (CSG), boundary representation (B-Rep), parametric sketch constraints, feature trees, and STEP/IGES engineering export.',
'about.arch_autocad_title': 'AutoCAD (Drafting & DWG Interoperability)',
'about.arch_autocad_desc': 'Headless Core Console execution (accoreconsole.exe), native DWG/DXF artifact generation, 3D ACIS solid primitives, transforms, booleans, and MASSPROP volumetric verification.',
'about.arch_blender_title': 'Blender 4.x (Polygonal & Organic 3D Modeling)',
'about.arch_blender_desc': 'Headless Python API execution (blender -b), subdivision surfaces (Subsurf), procedural displacement, quad topology, and binary glTF/OBJ/STL asset export.',
'about.compat_title': 'Compatibility',
'about.compat_th_cad': 'CAD / platform',
'about.compat_th_behavior': 'Alpha behavior',
'about.compat_freecad_cmd': 'FreeCAD, working FreeCADCmd / freecadcmd',
'about.compat_freecad_cmd_desc': 'Headless create, modify, read, and export; an STL preview mesh uploads for the dashboard.',
'about.compat_freecad_gui': 'FreeCAD GUI-only, AppImage, Flatpak or Snap',
'about.compat_freecad_gui_desc': 'May need a manual path or a separate command-line install.',
'about.compat_autocad_core': 'AutoCAD 2026 Core Console (accoreconsole.exe), Windows',
'about.compat_autocad_core_desc': 'Full 13-operation headless execution (3D primitives, booleans, transforms, MASSPROP volumetric validation) producing native DWG/DXF artifacts and binary STL preview via headless STLOUT. Enabled with --enable-autocad.',
'about.compat_autocad_lt': 'AutoCAD LT, or AutoCAD without accoreconsole.exe',
'about.compat_autocad_lt_desc': 'Installation detection only; execution disabled (AutoCAD LT lacks Core Console, 3D solid modeling, and STLOUT support).',
'about.compat_autocad_linux': 'AutoCAD on Linux',
'about.compat_autocad_linux_desc': 'Not a supported target.',
'about.compat_blender': 'Blender 4.x (headless background execution, Windows / macOS / Linux)',
'about.compat_blender_desc': 'Headless 3D polygonal modeling, subdivision surfaces, procedural displacement, quad topology, and binary glTF/OBJ/STL preview export. Enabled with --enable-blender.',
'about.security_title': 'Security and limitations',
'about.security_oidc': 'Identity comes from a validated OIDC token; a request cannot choose its own owner.',
'about.security_pairing': 'Device pairing codes are one-use and expire in 10 minutes.',
'about.security_revocation': 'Revoking a device blocks new requests and cancels queued jobs, but cannot stop one already running locally.',
'about.security_cad_files': 'Native CAD files stay on the linked computer. The STL preview mesh is the exception: capped at 25 MiB per file, with a 500 MiB per-device quota.',
'about.security_store': 'The store supports one backend instance; this alpha is not built to scale horizontally.',
'about.security_readme': 'Read the full README ↗',
'about.security_policy': 'SECURITY.md ↗',
'about.security_github': 'on GitHub.',
'about.author_title': 'Author & Engineering Lead',
'about.author_role': 'Software Architect & CAD Systems Engineer',
'about.author_bio': 'Creator and lead developer of CAD Engine, bridging frontier AI assistants with mechanical CAD kernels and 3D modeling runtimes.',
'about.author_linkedin_btn': 'LinkedIn Profile ↗',
'about.author_website_btn': 'Personal Website ↗',
'about.gov_title': 'Account Governance / Right to Erasure',
'about.gov_desc': 'Exercise your Right to Erasure ("Derecho al olvido" under GDPR & CCPA). Deleting your account permanently purges all CAD documents, 3D preview meshes, linked devices, API keys, and job history.',
'about.gov_delete_btn': 'Delete account',
'about.gov_dialog_badge': 'DANGER / IRREVERSIBLE',
'about.gov_dialog_title': 'Permanently delete account?',
'about.gov_dialog_lead': 'This action is destructive and irreversible. Once confirmed:',
'about.gov_dialog_item1': 'All your CAD cloud files and documents will be deleted.',
'about.gov_dialog_item2': 'All 3D preview meshes (.stl) will be physically purged.',
'about.gov_dialog_item3': 'All linked machines and devices will be revoked.',
'about.gov_dialog_item4': 'All your API keys and job history will be destroyed.',
'about.gov_dialog_item5': 'Your session will be closed and your Keycloak identity erased.',
'about.gov_dialog_instruction': 'To confirm permanent deletion, type exactly ELIMINAR in the following field:',
'about.gov_dialog_cancel': 'Cancel',
'about.gov_dialog_confirm': 'Permanently delete',
'about.gov_dialog_deleting': 'Deleting...',
'about.gov_error_generic': 'Error deleting account.'
```

### 4.2 Spanish Dictionary (`es`)
```typescript
// Shell Footer & Author
'footer.author_lead': 'Desarrollado por',
'footer.author_name': 'Danny Armijos',
'footer.author_website': 'Sitio Web',
'footer.data_governance_btn': 'Tratamiento de Datos y Gobernanza CAD',

// Consent Sheet Review Mode
'consent.status_active': 'Consentimiento Activo de Tratamiento de Datos Verificado',
'consent.close_btn': 'Cerrar',

// Connect Page
'connect.eyebrow': 'CONECTE SU CLIENTE MCP',
'connect.title': 'Casi listo.',
'connect.subtitle': 'Pegue la URL del recurso MCP de este despliegue en Claude o ChatGPT para completar la conexión.',
'connect.mcp_url_title': 'URL del recurso MCP',
'connect.copy_url': 'Copiar URL',
'connect.copied': '¡Copiado!',
'connect.copy_aria': 'Copiar {url}',
'connect.claude_title': 'Conectar Claude',
'connect.claude_step1': 'Abra Claude y vaya a Configuración → Conectores.',
'connect.claude_step2': 'Seleccione Agregar conector personalizado.',
'connect.claude_step3': 'Pegue la URL del recurso MCP indicada arriba.',
'connect.claude_step4': 'Inicie sesión con su cuenta de CAD Agent Designer cuando se le solicite.',
'connect.chatgpt_title': 'Conectar ChatGPT',
'connect.chatgpt_step1': 'Abra ChatGPT y vaya a Configuración → Conectores.',
'connect.chatgpt_step2': 'Active el Modo de desarrollador.',
'connect.chatgpt_step3': 'Seleccione Agregar y pegue la URL del recurso MCP indicada arriba.',
'connect.device_title': 'Estado del dispositivo',
'connect.device_error': 'No se pudo cargar el estado del dispositivo.',
'connect.device_waiting': 'Esperando a que este equipo se conecte…',
'connect.device_online': 'En línea',
'connect.device_offline': 'Desconectado',
'connect.device_looking_up': 'Buscando este dispositivo…',
'connect.device_not_found_lead': 'No se encontró este dispositivo. Revise',
'connect.device_linked_link': 'sus computadoras vinculadas',
'connect.device_loading': 'Cargando estado del dispositivo…',
'connect.device_empty_lead': 'Aún no hay computadoras vinculadas.',
'connect.device_pair_link': 'Vincule una primero',
'connect.keep_alive_title': 'Mantenga el agente en ejecución',
'connect.keep_alive_desc': 'Configure el agente para que continúe ejecutándose tras cerrar sesión o reiniciar su estación de trabajo CAD.',
'connect.linux_name': 'Linux',
'connect.linux_subtitle': 'servicio systemd',
'connect.linux_instruction': 'Cree un servicio en /etc/systemd/system/cadengine.service (reemplace youruser con su cuenta vinculada):',
'connect.linux_copy_aria': 'Copiar snippet de Linux systemd',
'connect.macos_name': 'macOS',
'connect.macos_subtitle': 'LaunchAgent de launchd',
'connect.macos_instruction': 'Cree ~/Library/LaunchAgents/com.cadengine.agent.plist para ejecutar dentro de su sesión de usuario:',
'connect.macos_copy_aria': 'Copiar snippet de macOS launchd',
'connect.macos_hint': 'Cargar inmediatamente:',
'connect.windows_name': 'Windows',
'connect.windows_subtitle': 'Programador de tareas (PowerShell)',
'connect.windows_instruction': 'Ejecute en PowerShell como Administrador (reemplace YOURUSER con la cuenta vinculada):',
'connect.windows_copy_aria': 'Copiar snippet de Windows PowerShell',
'connect.copy_snippet': 'Copiar snippet',
'connect.snippet_copied': '¡Copiado!',
'connect.try_title': 'Pruébelo — CAD Mecánico y Paramétrico',
'connect.try_desc': 'Una vez conectado, solicite a su asistente ejecutar list_devices, o modele componentes mecánicos: "Cree un soporte de montaje con 4 orificios avellanados" o "Modele un perfil de gabinete extruido".',
'connect.try_hint': 'Nota: CAD Agent Designer se especializa en modelado CAD mecánico y paramétrico de precisión (primitivas, transformaciones, booleanas y extrusiones), junto con modelado poligonal por subdivisión con Blender 4.x.',

// About Page
'about.status_title': 'Estado',
'about.status_desc': 'CAD Engine es una versión alfa experimental, no un servicio alojado. Los instaladores no están firmados y las compilaciones de macOS no están notarizadas; usted despliega y opera su propio backend.',
'about.arch_title': 'Arquitectura de Triple Motor',
'about.arch_desc': 'CAD Engine unifica tres motores de ingeniería especializados en una única superficie de ejecución restringida, delegando operaciones al kernel óptimo según los requerimientos geométricos:',
'about.arch_freecad_title': 'FreeCAD (CSG Paramétrico y B-Rep)',
'about.arch_freecad_desc': 'Geometría Sólida Constructiva (CSG), representación por bordes (B-Rep), restricciones de bocetos paramétricos, árbol de operaciones y exportación de ingeniería STEP/IGES.',
'about.arch_autocad_title': 'AutoCAD (Dibujo y Compatibilidad DWG)',
'about.arch_autocad_desc': 'Ejecución desatendida mediante Core Console (accoreconsole.exe), generación nativa de artefactos DWG/DXF, primitivas de sólidos ACIS 3D, transformaciones, operaciones booleanas y verificación volumétrica MASSPROP.',
'about.arch_blender_title': 'Blender 4.x (Modelado Poligonal y Orgánico 3D)',
'about.arch_blender_desc': 'Ejecución desatendida mediante API de Python (blender -b), superficies de subdivisión (Subsurf), desplazamiento procedimental, topología de quads y exportación de activos binarios glTF/OBJ/STL.',
'about.compat_title': 'Compatibilidad',
'about.compat_th_cad': 'CAD / plataforma',
'about.compat_th_behavior': 'Comportamiento en alfa',
'about.compat_freecad_cmd': 'FreeCAD, ejecutable FreeCADCmd / freecadcmd operativo',
'about.compat_freecad_cmd_desc': 'Creación, modificación, lectura y exportación desatendida; sube una malla de previsualización STL para el panel.',
'about.compat_freecad_gui': 'FreeCAD solo GUI, AppImage, Flatpak o Snap',
'about.compat_freecad_gui_desc': 'Puede requerir una ruta manual o una instalación de línea de comandos independiente.',
'about.compat_autocad_core': 'AutoCAD 2026 Core Console (accoreconsole.exe), Windows',
'about.compat_autocad_core_desc': 'Ejecución desatendida completa de 13 operaciones (primitivas 3D, booleanas, transformaciones, validación volumétrica MASSPROP) produciendo artefactos nativos DWG/DXF y previsualización STL binaria mediante STLOUT headless. Habilitado con --enable-autocad.',
'about.compat_autocad_lt': 'AutoCAD LT o AutoCAD sin accoreconsole.exe',
'about.compat_autocad_lt_desc': 'Solo detección de instalación; ejecución deshabilitada (AutoCAD LT carece de Core Console, modelado de sólidos 3D y soporte para STLOUT).',
'about.compat_autocad_linux': 'AutoCAD en Linux',
'about.compat_autocad_linux_desc': 'No es una plataforma compatible.',
'about.compat_blender': 'Blender 4.x (ejecución desatendida en segundo plano, Windows / macOS / Linux)',
'about.compat_blender_desc': 'Modelado poligonal 3D desatendido, superficies de subdivisión, desplazamiento procedimental, topología de quads y exportación de previsualización binaria glTF/OBJ/STL. Habilitado con --enable-blender.',
'about.security_title': 'Seguridad y limitaciones',
'about.security_oidc': 'La identidad proviene de un token OIDC validado; una solicitud no puede definir su propio propietario.',
'about.security_pairing': 'Los códigos de vinculación de dispositivos son de un solo uso y caducan a los 10 minutos.',
'about.security_revocation': 'Revocar un dispositivo bloquea nuevas solicitudes y cancela trabajos en cola, pero no detiene los que ya están en ejecución local.',
'about.security_cad_files': 'Los archivos CAD nativos permanecen en la computadora vinculada. La malla de previsualización STL es la excepción: limitada a 25 MiB por archivo, con una cuota de 500 MiB por dispositivo.',
'about.security_store': 'El almacenamiento admite una única instancia de backend; esta versión alfa no está diseñada para escalar horizontalmente.',
'about.security_readme': 'Lea el README completo ↗',
'about.security_policy': 'SECURITY.md ↗',
'about.security_github': 'en GitHub.',
'about.author_title': 'Autor y Responsable de Ingeniería',
'about.author_role': 'Arquitecto de Software e Ingeniero de Sistemas CAD',
'about.author_bio': 'Creador y desarrollador principal de CAD Engine, uniendo modelos de IA de frontera con motores CAD mecánicos y entornos de modelado 3D.',
'about.author_linkedin_btn': 'Perfil de LinkedIn ↗',
'about.author_website_btn': 'Sitio Web Personal ↗',
'about.gov_title': 'Gobernanza de Cuenta / Derecho al Olvido',
'about.gov_desc': 'Ejerza su Derecho al Olvido (conforme al RGPD y CCPA). Eliminar su cuenta purga de forma permanente todos los documentos CAD, mallas de previsualización 3D, dispositivos vinculados, claves de API e historial de trabajos.',
'about.gov_delete_btn': 'Eliminar cuenta',
'about.gov_dialog_badge': 'PELIGRO / IRREVERSIBLE',
'about.gov_dialog_title': '¿Eliminar cuenta permanentemente?',
'about.gov_dialog_lead': 'Esta acción es destructiva e irreversible. Una vez confirmada:',
'about.gov_dialog_item1': 'Se eliminarán todos tus archivos y documentos CAD de la nube.',
'about.gov_dialog_item2': 'Se purgarán físicamente todas las mallas de previsualización 3D (.stl).',
'about.gov_dialog_item3': 'Se revocarán todas tus máquinas y dispositivos vinculados.',
'about.gov_dialog_item4': 'Se destruirán todas tus claves de API y el historial de trabajos.',
'about.gov_dialog_item5': 'Se cerrará tu sesión y se eliminará tu identidad en Keycloak.',
'about.gov_dialog_instruction': 'Para confirmar la eliminación permanente, escribe exactamente ELIMINAR en el siguiente campo:',
'about.gov_dialog_cancel': 'Cancelar',
'about.gov_dialog_confirm': 'Eliminar permanentemente',
'about.gov_dialog_deleting': 'Eliminando...',
'about.gov_error_generic': 'Error al eliminar la cuenta.'
```

---

## 5. Technical Invariants & Verification Strategy

### 5.1 Invariant Preservation

1. **Storage Priority Invariant:**
   User manual preference stored in `localStorage.getItem('cadgpt_lang')` (`'en'` or `'es'`) strictly takes precedence over `navigator.languages` and `navigator.language`.

2. **Zero Involuntary Revocation Invariant:**
   Reopening `#consent-sheet` in voluntary review mode from the footer trigger and subsequently dismissing it via the "Close" button must **never** invoke `AuthService.clearConsent()`. The user's ISO/IEC timestamp in `cadgpt:consent:v1:<sub_id>` must remain intact.

3. **Gating Integrity Invariant:**
   Unconsented authenticated users encountering `#consent-sheet` during mandatory initial gating must continue to be blocked until `#consent-accept-check` is checked and `#consent-accept-btn` is clicked.

4. **Security & Link Accessibility Invariant:**
   All external links to GitHub, LinkedIn, or the author's website must enforce `rel="noopener noreferrer"` and `target="_blank"` to protect against tab-nabbing vulnerabilities and ensure screen-reader clarity.

5. **Existing Spec Compatibility Invariant:**
   - In [`connect.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.spec.ts), assertions verify `'Add custom connector'`, `'Developer mode'`, `'Mechanical & Parametric CAD'`, and `'primitives, transforms, booleans, and extrusions'`. The English translations precisely preserve these phrases.
   - In [`about.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/about/about.spec.ts), table text checks `'AutoCAD 2026 Core Console'`, `'Full 13-operation headless execution'`, `'MASSPROP'`, etc. The English translations preserve these phrases. Modal delete dialog checks can be configured to support bilingual regex (e.g. `/PELIGRO \/ IRREVERSIBLE|DANGER \/ IRREVERSIBLE/`), mirroring [`shell.spec.ts`](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/layout/shell/shell.spec.ts).

---

## 6. Implementation Plan & Work Slices

### Slice 1: Default OS Language Detection & Test Suite Expansion
- Update `apps/web/src/app/core/i18n/translation.service.ts`:
  - Inspect `navigator.languages` (array) then `navigator.language` (string).
  - Iterate candidate locales: return `'es'` if starts with `'es'`, return `'en'` if starts with `'en'`. Fall back to `'en'`.
- Augment `apps/web/src/app/core/i18n/i18n.service.spec.ts`:
  - Test `navigator.languages = ['es-ES', 'en-US']` yields `'es'`.
  - Test `navigator.languages = ['en-US', 'es-ES']` yields `'en'`.
  - Test `navigator.language = 'es-419'` yields `'es'` when `navigator.languages` is empty.
  - Test `localStorage` priority over `navigator.languages`.

### Slice 2: Translation Dictionaries & Template Wireup (`connect` & `about`)
- Update `apps/web/src/app/core/i18n/translations.ts`:
  - Add all planned `connect.*`, `about.*`, `footer.*`, and `consent.*` keys to `en` and `es`.
- Update `apps/web/src/app/pages/connect/connect.ts` & `connect.html`:
  - Add `TranslatePipe` to `imports` in `ConnectPage`.
  - Replace hardcoded literals with `translate` pipe.
- Update `apps/web/src/app/pages/about/about.ts` & `about.html`:
  - Replace hardcoded English and Spanish text with `translate` pipe.

### Slice 3: Persistent Data Treatment (GDPR / ISO 27001) in Footer
- Update `apps/web/src/app/layout/shell/shell.ts`:
  - Add `readonly isReviewingConsent = signal(false)`.
  - Add `openConsentReview()`: sets `isReviewingConsent.set(true)`.
  - Add `closeConsentReview()`: sets `isReviewingConsent.set(false)`.
  - Update `showConsentSheet = computed(() => this.isConsentRequired() || this.isReviewingConsent())`.
- Update `apps/web/src/app/layout/shell/shell.html`:
  - Add footer trigger button for Data Treatment & CAD Governance.
  - In `#consent-sheet`, conditionally render Close button and verified status when `isReviewingConsent() && auth.hasConsent()`.
- Update `apps/web/src/app/layout/shell/shell.css`:
  - Style `.footer-link-btn`, `.stitch-consent-review-bar`, `.consent-status-badge`, and `.btn-close`.
- Augment `apps/web/src/app/layout/shell/shell.spec.ts`:
  - Add test: user with consent can click footer link to open sheet, inspect terms, and dismiss via close button without clearing consent.

### Slice 4: About Page Overhaul — Blender 4.x & Tri-Engine Architecture
- Update `apps/web/src/app/pages/about/about.html`:
  - Add Tri-Engine Architecture section (FreeCAD CSG, AutoCAD DWG/Core Console, Blender 4.x Subdiv/glTF).
  - Add Blender 4.x row to the Compatibility matrix table.
- Update `apps/web/src/app/pages/about/about.css`:
  - Add styles for Tri-Engine architecture cards and grid.
- Augment `apps/web/src/app/pages/about/about.spec.ts`:
  - Verify Blender 4.x presence in the compatibility table.

### Slice 5: Author Attribution & Social Links
- Update `apps/web/src/app/layout/shell/shell.html` & `shell.css`:
  - Render Danny Armijos author attribution in footer with external links to LinkedIn and Website.
- Update `apps/web/src/app/pages/about/about.html` & `about.css`:
  - Render Author & Maintainer profile panel with social buttons (`rel="noopener noreferrer"`).
- Verify across viewport widths (desktop, tablet 800px, mobile 480px).

---

## 7. Conclusion & Next Steps

This exploration establishes a concrete, non-breaking roadmap for Phase 7. All technical patterns align with the existing Angular signals architecture and the Python agent's discovery/execution engine.

Proceed to the SDD proposal and specification phase to finalize the delta contracts before implementation.
