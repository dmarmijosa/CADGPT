# Exploration: CAD Engine Installer Workspace, CAD Prerequisite Gate & Gemini/Generic MCP Connect Overhaul

**Change ID:** `cadengine-installer-workspace-cad-connect-gemini-mcp`  
**Target Release:** `v0.2.0-alpha.1`  
**Status:** In Progress  
**Author:** sdd-explore subagent  

---

## 1. Executive Summary

This exploration investigates four critical enhancements to **CAD Engine** spanning installer architecture, local workspace governance, CAD prerequisite enforcement, web dashboard client onboarding, and release distribution:

1. **Workspace Directory in Installer & GUI**:
   - Investigates declaring and exposing the local CAD workspace working directory (`%LOCALAPPDATA%\CADGPT\jobs` on Windows, `~/Library/Application Support/CADGPT/jobs` on macOS, and `~/.local/share/CADGPT/jobs` on Linux) alongside the binary installation directory (`{autopf}\CAD Engine`).
   - In `packaging/windows.iss`: defines Inno Setup custom directory declaration and `UpdateReadyMemo` summary informing users where CAD drawings, meshes, and job artifacts reside, marked with `uninsneveruninstall` so user drawings are never deleted on uninstall.
   - In `agent/cadgpt_agent/gui.py`: displays the active workspace working directory in both the 4-step Onboarding Wizard and in the System Tray connection status HUD (`on_view_status_hud()`).

2. **CAD Prerequisite Gate & Guided FreeCAD Installation**:
   - Evaluates the core packaging invariant: FreeCAD is **not** bundled inside the ~67MB CAD Engine installer (which would bloat it past 1.5GB), but a parametric CAD kernel (FreeCAD or AutoCAD) is strictly required to execute 3D operations.
   - In `packaging/windows.iss`: implements Pascal Script detection in `[Code]` checking registry and disk paths for FreeCAD and AutoCAD. If missing, the installer prompts to launch automated installation via `winget install FreeCAD.FreeCAD` or opens the official FreeCAD download page.
   - In `agent/cadgpt_agent/gui.py`: validates Step 2 CAD prerequisite gate blocking logic, guided install commands, and instant Re-check mechanics, alongside Step 3 Blender discovery.

3. **Connect Page Overhaul (`/connect`)**:
   - Overhauls `apps/web/src/app/pages/connect/` (`connect.html`, `connect.ts`, `connect.spec.ts`) to provide first-class integration guides for:
     - **Google Gemini** (API and Function Calling with Python SDK / Vertex AI / Gemini CLI).
     - **Generic MCP Clients** (Claude Desktop, Cursor, Windsurf, Antigravity) with standard `mcpServers` JSON config snippets.
   - Adds a prominent, dedicated **API Key Instruction Guide** explaining:
     - How to generate an API key at `/api-keys` with `cad:read` and `cad:write` scopes.
     - Where and how to configure the key (Bearer token in `Authorization: Bearer <key>` header and in `mcpServers.headers`).
   - Delivers 100% bilingual parity across English and Spanish in `apps/web/src/app/core/i18n/translations.ts`.

4. **Principal Installers in Release**:
   - Streamlines the release distribution to exactly the **4 principal installers**:
     1. Windows x64: Inno Setup executable (`CADEngine-Setup-windows-x64.exe`)
     2. macOS Apple Silicon: Disk image (`CADEngine-macos-arm64.dmg`)
     3. macOS Intel: Disk image (`CADEngine-macos-x64.dmg`)
     4. Linux x64: Portable archive (`cadengine-linux-x64.tar.gz`)
     - Plus `SHA256SUMS.txt`.
   - Deprecates experimental WiX v4 MSI installer from the primary release pipeline, simplifies `.github/workflows/release.yml`, and aligns `README.md` download links.

```
+----------------------------------------------------------------------------------------------------+
|               CAD ENGINE INSTALLER, WORKSPACE & CONNECT OVERHAUL ARCHITECTURE                      |
+-----------------------------------+--------------------------------+-------------------------------+
|    1. WORKSPACE IN INSTALLER/GUI  |     2. GUIDED CAD PREREQUISITE |    3. CONNECT OVERHAUL (/connect)
| - Windows.iss Workspace Declared  | - FreeCAD Not Bundled (~67MB)  | - Google Gemini Function Call |
|   {localappdata}\CADGPT\jobs      | - Inno Setup Pascal Check:     | - Generic MCP (Cursor/Windsurf|
| - uninsneveruninstall on jobs/    |   RegKeyExists + FindFirst     |   Claude Desktop, Antigravity)|
| - Status HUD & Wizard display     | - Winget install prompt / DL   | - Dedicated API Key Guide:    |
|   active local workspace path     | - gui.py Step 2 gate & recheck |   cad:read / cad:write scopes |
+-----------------------------------+--------------------------------+ - Full EN/ES translations     |
|              4. PRINCIPAL INSTALLERS PIPELINE (Inno EXE, 2x macOS DMGs, Linux tar.gz)              |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Current State Assessment

### 2.1 Workspace Working Directory in Installer & GUI

- **Agent Workspace Layout ([agent/cadgpt_agent/main.py:169](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py#L169), [gui.py:112](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L112))**:
  - The agent resolves its local data root using `user_data_dir("CADGPT", appauthor=False)`.
  - On Windows, this resolves to `%LOCALAPPDATA%\CADGPT`.
  - Inside this directory, the agent creates:
    - `config.json`: Server origin, language preference, custom Blender path, device UUID.
    - `jobs/<job_id>/`: Execution scratchpads containing native source files (`design.FCStd`, `design.dwg`, `design.blend`), exported files (`model.step`, `layout.dxf`), and preview meshes (`preview.stl`).
    - `logs/cadengine.log`: Rotating diagnostic execution logs.
  - In `workspace.py`, projects are managed under `projects/<project_id>/` with 5 standardized folders (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`).
- **Installer Visibility ([packaging/windows.iss:5](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss#L5))**:
  - `packaging/windows.iss` defines `DefaultDirName={autopf}\CAD Engine`.
  - The installer currently provides **zero information** about where CAD files and job outputs are written. Users assume drawings are saved inside `C:\Program Files\CAD Engine`, which requires administrator elevation and leads to permission errors or confusion when trying to locate their drawings.
  - Furthermore, `windows.iss` does not declare `{localappdata}\CADGPT\jobs` in `[Dirs]`, missing the opportunity to ensure the directory exists with `uninsneveruninstall` protection.
- **GUI HUD Visibility ([agent/cadgpt_agent/gui.py:1082-1107](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L1082-L1107))**:
  - `on_view_status_hud()` displays Server URL, Hostname, Device ID, Active Engines, Latency, and Status.
  - It does **not** display the active workspace path. Users viewing the status HUD cannot see where local drawings are stored.
  - Similarly, the 4-step Onboarding Wizard does not state the workspace location.

---

### 2.2 CAD Prerequisite Gate & Guided FreeCAD Installation

- **Installer Size vs Kernel Bloat**:
  - The self-contained `cadengine` PyInstaller binary with bundled Python 3.13 runtime is ~67 MB.
  - FreeCAD (complete with OpenCASCADE Technology, Coin3D, Qt, Python, and Boost libraries) is ~500 MB compressed or ~1.5 GB uncompressed.
  - Bundling FreeCAD directly into the CAD Engine installer would bloat the installer to >1.5 GB, causing excessive download times and wasting disk space for users who already possess FreeCAD or AutoCAD.
  - However, CAD Engine **cannot generate 3D solids** without FreeCAD (`FreeCADCmd`) or full AutoCAD with Core Console (`accoreconsole.exe`).
- **Inno Setup Prerequisite Detection ([packaging/windows.iss:36-51](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss#L36-L51))**:
  - Currently, `windows.iss` only has a `NeedsAddPath` function in `[Code]`.
  - It does **not** inspect whether FreeCAD or AutoCAD is installed before finishing setup.
  - If a user installs CAD Engine on a clean Windows machine and launches it, the agent immediately blocks at Step 2 of the GUI or fails jobs in the background.
- **Agent GUI CAD Gate ([agent/cadgpt_agent/gui.py:593-678](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L593-L678))**:
  - Step 2 enforces a hard prerequisite gate: if neither FreeCAD nor AutoCAD is detected, the "Next" progression button is disabled.
  - It shows OS-specific install commands (`winget install FreeCAD.FreeCAD` on Windows, `brew install --cask freecad` on macOS, `sudo apt install freecad` on Linux) and a `Download FreeCAD` button.
  - It includes an instant `Re-check` button (`controller.refresh_discovery()`).
  - In Step 3, Blender is correctly treated as optional with custom path browsing and opt-out checkboxes.

---

### 2.3 Connect Page Overhaul (`/connect`)

- **Current Connect Page ([apps/web/src/app/pages/connect/connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html))**:
  - Focuses almost exclusively on Claude (`Settings → Connectors`) and ChatGPT (`Developer mode`).
  - Lacks instructions for **Google Gemini** (API / Function Calling).
  - Lacks instructions for **Generic MCP clients** (Cursor, Windsurf, Antigravity, Claude Desktop) that require an `mcpServers` configuration snippet in JSON format.
  - Lacks a dedicated, prominent **API Key Instruction Guide** explaining how to create an API key at `/api-keys`, which scopes to choose (`cad:read`, `cad:write`), and where to insert the Bearer token in headers.
- **Translations Status ([apps/web/src/app/core/i18n/translations.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts))**:
  - The bilingual translation dictionary currently supports English and Spanish, but lacks keys for Gemini, Generic MCP clients, and API key instruction guides.

---

### 2.4 Principal Installers in Release

- **Current Release Configuration**:
  - `.github/workflows/release.yml` currently attempts to install WiX v4 (`dotnet tool install --global wix`) and build both an MSI and an Inno Setup EXE on Windows.
  - `packaging/build.py` treats Inno Setup as a fallback step (`build_inno_setup`).
  - `README.md` lists both `CADEngine-Setup-x64.msi` and `CADEngine-Setup-windows-x64.exe`.
- **Simplification to 4 Principal Installers**:
  - To ensure maximum installer reliability, predictable elevated installation, and clean user experience, the release distribution must standardize strictly on the **4 principal installers**:
    1. Windows x64: `CADEngine-Setup-windows-x64.exe` (Inno Setup)
    2. macOS Apple Silicon: `CADEngine-macos-arm64.dmg`
    3. macOS Intel: `CADEngine-macos-x64.dmg`
    4. Linux x64: `cadengine-linux-x64.tar.gz`
    - Plus `SHA256SUMS.txt`.
  - WiX MSI is not required in the principal distribution, which speeds up Windows GitHub Actions builds and eliminates external .NET tool dependencies in CI.

---

## 3. Proposed Architecture & Implementation Details

### 3.1 Pillar 1: Workspace Working Directory in Installer & GUI

#### A. Inno Setup (`packaging/windows.iss`) Implementation
1. **Directory Declaration in `[Dirs]`**:
   ```pascal
   [Dirs]
   Name: "{localappdata}\CADGPT"; Flags: uninsneveruninstall
   Name: "{localappdata}\CADGPT\jobs"; Flags: uninsneveruninstall
   ```
   - Flags `uninsneveruninstall` guarantees that when a user uninstalls CAD Engine, their drawings, 3D models, and job logs are **never** deleted.
2. **Workspace Information in `UpdateReadyMemo`**:
   Add a customized summary in `[Code]`:
   ```pascal
   function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
   var
     S: String;
   begin
     S := MemoDirInfo + NewLine + NewLine;
     S := S + 'CAD Project & Workspace Directory:' + NewLine;
     S := S + Space + ExpandConstant('{localappdata}\CADGPT\jobs') + NewLine;
     S := S + Space + '(All native CAD drawings .FCStd/.dwg remain strictly local)' + NewLine + NewLine;
     S := S + 'Background Service:' + NewLine;
     S := S + Space + 'Windows Task Scheduler ONLOGON Task (CADEngineAgent)' + NewLine;
     Result := S;
   end;
   ```
3. **Dedicated Workspace Info Page**:
   Create a custom information step during setup (`wpSelectDir` -> `wpWorkspaceInfo` -> `wpReady`) using `CreateOutputMsgPage` explaining the separation between application binaries (`C:\Program Files\CAD Engine`) and user CAD workspaces (`%LOCALAPPDATA%\CADGPT\jobs`).

#### B. Agent GUI & HUD (`agent/cadgpt_agent/gui.py`) Implementation
1. **In `SystemTrayDaemon.on_view_status_hud()`**:
   - Resolve workspace directory:
     ```python
     workspace_dir = str((self.config_path.parent / "jobs").resolve())
     ```
   - Append to status HUD message:
     ```python
     f"{t('hud_workspace_dir', lang, path=workspace_dir)}\n"
     ```
   - In `i18n.py`:
     - EN: `'hud_workspace_dir': 'Workspace Directory: {path}'`
     - ES: `'hud_workspace_dir': 'Directorio del Espacio de Trabajo: {path}'`
2. **In `OnboardingWizard` (Step 4 & Step 2)**:
   - Display a clean workspace card:
     ```python
     workspace_path = str(self.controller.config_path.parent / "jobs")
     ttk.Label(card, text=f"Local Workspace: {workspace_path}", style="Sub.TLabel").pack(anchor="w")
     ```

---

### 3.2 Pillar 2: CAD Prerequisite Gate & Guided FreeCAD Installation

#### A. Inno Setup (`packaging/windows.iss`) FreeCAD/AutoCAD Detection
In `[Code]`, implement automated inspection and guided package installation:

```pascal
function IsAutoCADInstalled: Boolean;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\Autodesk\AutoCAD') or
            RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node\Autodesk\AutoCAD');
end;

function IsFreeCADInstalled: Boolean;
var
  FindRec: TFindRec;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\FreeCAD') or
            RegKeyExists(HKEY_CURRENT_USER, 'Software\FreeCAD') or
            RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node\FreeCAD');
  if not Result then
  begin
    if FindFirst(ExpandConstant('{commonpf}\FreeCAD*'), FindRec) then
    begin
      try
        Result := True;
      finally
        FindClose(FindRec);
      end;
    end;
  end;
  if not Result then
  begin
    if FindFirst(ExpandConstant('{localappdata}\Programs\FreeCAD*'), FindRec) then
    begin
      try
        Result := True;
      finally
        FindClose(FindRec);
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if not (IsFreeCADInstalled or IsAutoCADInstalled) then
    begin
      if MsgBox('CAD Engine requires a parametric CAD kernel (FreeCAD or AutoCAD) to execute 3D modeling operations.' + #13#10 + #13#10 +
                'Neither FreeCAD nor AutoCAD was detected on this computer.' + #13#10 + #13#10 +
                'Would you like to install FreeCAD now using Windows Package Manager (winget)?' + #13#10 +
                '(Click "No" to open the official FreeCAD download page instead)',
                mbConfirmation, MB_YESNO) = IDYES then
      begin
        Exec('winget.exe', 'install FreeCAD.FreeCAD --accept-package-agreements --accept-source-agreements', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      end
      else
      begin
        ShellExec('open', 'https://www.freecad.org/downloads.php', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
      end;
    end;
  end;
end;
```

#### B. Agent GUI Step 2 CAD Prerequisite Gate
- Validated existing Step 2 logic:
  - Non-bypassable CAD gate enforces that at least one of FreeCAD or AutoCAD must be verified before the "Continue" button unlocks.
  - Clear OS-tailored guidance commands and download links.
  - Instant `Re-check` button refreshes discovery in-memory without losing wizard progress.
  - Step 3 handles Blender discovery as an optional tool with custom executable selection and non-blocking opt-out.

---

### 3.3 Pillar 3: Connect Page Overhaul (`/connect`)

#### A. Dedicated API Key Instruction Guide
Add a prominent, styled panel at the top of `/connect`:

```html
<section class="panel api-key-guide-panel" data-testid="api-key-guide">
  <div class="panel-header">
    <span class="status highlight">{{ 'connect.api_key_step_badge' | translate }}</span>
    <h2>{{ 'connect.api_key_guide_title' | translate }}</h2>
  </div>
  <p>{{ 'connect.api_key_guide_lead' | translate }}</p>

  <ol class="guide-steps">
    <li>
      {{ 'connect.api_key_step1_prefix' | translate }}
      <a routerLink="/api-keys"><strong>{{ 'connect.api_key_step1_link' | translate }}</strong></a>.
    </li>
    <li>
      {{ 'connect.api_key_step2_prefix' | translate }}
      <code>cad:read</code> {{ 'connect.api_key_step2_and' | translate }} <code>cad:write</code>
      {{ 'connect.api_key_step2_suffix' | translate }}
    </li>
    <li>
      {{ 'connect.api_key_step3_text' | translate }}
      <div class="snippet-box">
        <pre><code>Authorization: Bearer cad_prefix_secret</code></pre>
      </div>
    </li>
  </ol>
</section>
```

#### B. Google Gemini Integration Guide (API & Function Calling)
Add a dedicated guide section for Google Gemini:

```html
<section class="panel" data-testid="gemini-steps">
  <div class="os-guide-header">
    <span class="status">{{ 'connect.gemini_badge' | translate }}</span>
    <h2>{{ 'connect.gemini_title' | translate }}</h2>
  </div>
  <p>{{ 'connect.gemini_subtitle' | translate }}</p>

  <div class="snippet-box">
    <pre><code>{{ geminiPythonSnippet() }}</code></pre>
    <button
      type="button"
      class="quiet"
      (click)="copySnippet(geminiPythonSnippet(), 'gemini')"
    >
      {{ (copiedSnippet() === 'gemini' ? 'connect.snippet_copied' : 'connect.copy_snippet') | translate }}
    </button>
  </div>
</section>
```

Where `geminiPythonSnippet()` in `connect.ts` provides:
```python
# Google Gemini 2.5 / 1.5 with CAD Engine MCP / REST Integration
import os
from google import genai
from google.genai import types

client = genai.Client()
CAD_API_KEY = os.environ.get("CADENGINE_API_KEY", "cad_YOUR_KEY_HERE")
CAD_ENDPOINT = "https://cadengine.danny-armijos.com/mcp"

# Register CAD Engine operations as Gemini function declarations
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Model a mechanical mounting plate 100x50x10mm with 4 M5 corner holes in FreeCAD",
    config=types.GenerateContentConfig(
        tools=[...],  # Auto-mapped from CAD Engine tool schema
    ),
)
```

#### C. Generic MCP Client Integration Guide (Cursor, Windsurf, Claude Desktop, Antigravity)
Add a unified generic MCP configuration section:

```html
<section class="panel" data-testid="generic-mcp-steps">
  <div class="os-guide-header">
    <span class="status">{{ 'connect.generic_mcp_badge' | translate }}</span>
    <h2>{{ 'connect.generic_mcp_title' | translate }}</h2>
  </div>
  <p>{{ 'connect.generic_mcp_subtitle' | translate }}</p>

  <div class="snippet-box">
    <pre><code>{{ genericMcpSnippet() }}</code></pre>
    <button
      type="button"
      class="quiet"
      (click)="copySnippet(genericMcpSnippet(), 'generic-mcp')"
    >
      {{ (copiedSnippet() === 'generic-mcp' ? 'connect.snippet_copied' : 'connect.copy_snippet') | translate }}
    </button>
  </div>

  <table class="data mcp-paths-table">
    <thead>
      <tr>
        <th>{{ 'connect.mcp_client_col' | translate }}</th>
        <th>{{ 'connect.mcp_config_path_col' | translate }}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Cursor</strong></td>
        <td><code>.cursor/mcp.json</code></td>
      </tr>
      <tr>
        <td><strong>Windsurf</strong></td>
        <td><code>~/.codeium/windsurf/mcp_config.json</code></td>
      </tr>
      <tr>
        <td><strong>Claude Desktop</strong></td>
        <td><code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)<br><code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows)</td>
      </tr>
      <tr>
        <td><strong>Antigravity / Gemini CLI</strong></td>
        <td><code>~/.gemini/antigravity-cli/mcp/</code></td>
      </tr>
    </tbody>
  </table>
</section>
```

Where `genericMcpSnippet()` produces:
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

#### D. Bilingual Translation Parity (`translations.ts`)
Add symmetric translation keys to both `en` and `es`:
- `connect.api_key_step_badge`
- `connect.api_key_guide_title`
- `connect.api_key_guide_lead`
- `connect.api_key_step1_prefix`, `step1_link`, `step2_prefix`, `step2_and`, `step2_suffix`, `step3_text`
- `connect.gemini_badge`, `gemini_title`, `gemini_subtitle`
- `connect.generic_mcp_badge`, `generic_mcp_title`, `generic_mcp_subtitle`
- `connect.mcp_client_col`, `connect.mcp_config_path_col`

---

### 3.4 Pillar 4: Principal Installers in Release

#### A. The 4 Principal Release Packages
Streamline the distribution to strictly the 4 principal installers:
1. **Windows x64**: `CADEngine-Setup-windows-x64.exe` (Inno Setup)
2. **macOS Apple Silicon**: `CADEngine-macos-arm64.dmg` (UDZO disk image)
3. **macOS Intel**: `CADEngine-macos-x64.dmg` (UDZO disk image)
4. **Linux x64**: `cadengine-linux-x64.tar.gz` (POSIX tar.gz archive)
5. **Checksums**: `SHA256SUMS.txt`

#### B. CI Workflow Updates (`.github/workflows/release.yml`)
- Remove WiX v4 installation step:
  ```yaml
  # WiX v4 removal: Inno Setup is the principal Windows installer
  - if: matrix.platform == 'windows'
    shell: pwsh
    run: |
      if (-not (Test-Path "C:\Program Files (x86)\Inno Setup 6\ISCC.exe")) {
        choco install innosetup --no-progress -y
      }
  ```
- Eliminate legacy `CADGPT-*` copies:
  - Linux: generate `dist/cadengine-linux-x64.tar.gz` (and optionally symlink/copy `CADEngine-linux-x64.tar.gz` for case insensitivity).
  - macOS: generate `dist/CADEngine-macos-${{ matrix.arch }}.dmg` (no `CADGPT-*`).
- Artifact upload pattern:
  ```yaml
  path: |
    dist/*.exe
    dist/*.dmg
    dist/*.tar.gz
  ```

#### C. Build Script (`packaging/build.py`) & README Updates
- In `packaging/build.py`: Set `--skip-wix` as default or deprecate WiX step; designate `build_inno_setup` as the primary Windows package builder.
- In `README.md`: Update the Download table to cleanly present the 4 principal installers without WiX MSI clutter.

---

## 4. Traceability Matrix

| Requirement / Component | File Path | Current Behavior | Target Behavior |
|---|---|---|---|
| Inno Setup Workspace | [packaging/windows.iss](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) | Installs to `{autopf}\CAD Engine`; no mention of workspace; no `uninsneveruninstall` on jobs folder. | Declare `{localappdata}\CADGPT\jobs` in `[Dirs]` with `uninsneveruninstall`; show workspace in `UpdateReadyMemo` and custom info page. |
| Inno Setup CAD Check | [packaging/windows.iss](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) | No check for FreeCAD/AutoCAD; finishes without warning. | Check FreeCAD/AutoCAD registry and disk in `[Code]`; prompt to run `winget install FreeCAD.FreeCAD` or open download page. |
| Status HUD Workspace | [agent/cadgpt_agent/gui.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L1082) | Status HUD displays server, host, device, engines, latency, status. | Add `hud_workspace_dir` displaying `%LOCALAPPDATA%\CADGPT\jobs` (or platform equivalent). |
| Wizard Workspace Info | [agent/cadgpt_agent/gui.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/gui.py#L779) | Onboarding wizard displays pairing code; no workspace info. | Display active local workspace path so users know where designs are saved. |
| Connect API Key Guide | [apps/web/src/app/pages/connect/connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) | No API key guide; only links resource URL. | Prominent API Key instruction panel with `/api-keys` link, scopes explanation (`cad:read`, `cad:write`), and header format. |
| Connect Gemini Guide | [apps/web/src/app/pages/connect/connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) | No Google Gemini instructions. | Google Gemini Function Calling & API guide with copyable Python SDK snippet. |
| Connect Generic MCP | [apps/web/src/app/pages/connect/connect.html](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/pages/connect/connect.html) | Only covers Claude & ChatGPT web connectors. | Generic MCP section with `mcpServers` JSON snippet and paths for Cursor, Windsurf, Claude Desktop, Antigravity. |
| Connect i18n Parity | [apps/web/src/app/core/i18n/translations.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/web/src/app/core/i18n/translations.ts) | Missing translation keys for Gemini, Generic MCP, and API keys. | Complete symmetrical English and Spanish translation keys for all new panels. |
| 4 Principal Installers | [.github/workflows/release.yml](file:///Users/danny/Documents/ChatGPT/CADGPT/.github/workflows/release.yml), [README.md](file:///Users/danny/Documents/ChatGPT/CADGPT/README.md) | Builds WiX MSI and duplicates legacy `CADGPT-*` archives. | Maintain strictly the 4 principal installers (Inno EXE, 2x macOS DMGs, Linux tar.gz) and clean download table. |

---

## 5. Test & Validation Strategy

1. **Web Connect Page Unit Tests (`apps/web/src/app/pages/connect/connect.spec.ts`)**:
   - Verify `api-key-guide` panel renders with `/api-keys` link and scope guidance.
   - Verify `gemini-steps` panel renders with valid Python snippet.
   - Verify `generic-mcp-steps` panel renders with valid `mcpServers` JSON block.
   - Verify client config path table contains Cursor, Windsurf, Claude Desktop, and Antigravity.
   - Switch language to Spanish (`es`) and assert that all new panels, badges, and aria-labels translate cleanly.

2. **Agent GUI & HUD Unit Tests (`agent/tests/test_gui.py`)**:
   - Assert `on_view_status_hud()` includes the resolved workspace directory (`.../jobs`).
   - Assert `hud_workspace_dir` translates in English and Spanish.

3. **Inno Setup & Packaging Validation (`agent/tests/test_packaging.py`)**:
   - Verify `windows.iss` parses successfully with `IsFreeCADInstalled`, `IsAutoCADInstalled`, `UpdateReadyMemo`, and `[Dirs]` workspace declarations.
   - Verify `packaging/build.py --dry-run` executes with Inno Setup as primary Windows builder.

4. **Full Regression Suite**:
   - Run Python test suite: `./.venv/bin/python -m unittest discover -s agent/tests -v`.
   - Run Web & API test suite: `npm test`.

---

## 6. Implementation Slices & Risk Analysis

| Slice | Scope | Primary Files | Risk | Mitigation |
|---|---|---|---|---|
| **Slice 1: Connect Page Overhaul** | Add API key guide, Gemini guide, generic MCP section, and full EN/ES translations. | `apps/web/src/app/pages/connect/connect.html`, `connect.ts`, `connect.spec.ts`, `translations.ts` | Low | Pure frontend template and translation update; verified by Vitest suite. |
| **Slice 2: Workspace & Guided CAD in Inno Setup & GUI** | Update `windows.iss` with workspace declaration, FreeCAD check and winget prompt; add workspace path to GUI HUD and wizard. | `packaging/windows.iss`, `agent/cadgpt_agent/gui.py`, `agent/cadgpt_agent/i18n.py`, `agent/tests/test_gui.py` | Low | Pascal script tested via ISCC dry run; GUI tested via existing mock harnesses. |
| **Slice 3: Principal Installers Release Alignment** | Simplify release workflow to the 4 principal installers; align `README.md` and `build.py`. | `.github/workflows/release.yml`, `packaging/build.py`, `README.md`, `agent/tests/test_packaging.py` | Low | Eliminates WiX CI dependency and avoids legacy archive duplication. |

---

## 7. Next Recommended Steps

1. Create OpenSpec change artifacts under `openspec/changes/cadengine-installer-workspace-cad-connect-gemini-mcp/`:
   - `proposal.md`
   - `design.md`
   - `tasks.md`
   - Delta specs: `specs/mcp-client-onboarding/spec.md` and `specs/gui-onboarding-system-tray/spec.md`.
2. Implement Slice 1: Connect Page overhaul and bilingual translations.
3. Implement Slice 2: Inno Setup workspace declaration + FreeCAD detection & GUI HUD workspace path.
4. Implement Slice 3: Release workflow and documentation alignment with the 4 principal installers.
5. Execute full test suites and confirm all checks pass.
