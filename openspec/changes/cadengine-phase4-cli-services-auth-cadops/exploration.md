# Exploration — cadengine-phase4-cli-services-auth-cadops

This document explores the architectural design, trade-offs, security invariants, and implementation plan for **Phase 4** of CAD Engine (formerly CADGPT). Phase 4 transitions the developer tool into an enterprise-ready workstation utility across four pillars:

1. **Agent CLI Evolution**: Transitioning binary identity to `cadengine` (with backward-compatible alias `cadgpt-agent`) and introducing first-class subcommands (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`).
2. **Native OS Background Execution & Installers**: Machine-wide elevation, PATH registration, native background daemon management via systemd (Linux), LaunchAgent (macOS), and Scheduled Task / Windows Service (Windows), with MSI and native package distributions.
3. **Google Social Login & Keycloak Integration**: Configuring Google Cloud OAuth 2.0 Identity Provider within the Keycloak realm and styling the "Sign in with Google" component within the Stitch Precision CAD workbench theme.
4. **Advanced Professional CAD Modeling (FreeCAD 1.1.3)**: Expanding the allowlisted modeling toolset beyond basic boxes/cylinders to support complex organic, mechanical, and fantasy geometries (such as Irelia's contour blade) via `loft`, `chamfer`, `fillet`, `create_wedge`, and `extrude_polygon`.

---

## 1. Current State (Verified in Codebase)

### 1.1 Agent CLI & Packaging
- **Entry point and arguments (`agent/cadgpt_agent/main.py:97-205`)**: Uses flat `argparse` flags (`--server`, `--cad-path`, `--headless`, `--allow-file-credentials`, `--pair`, `--enable-autocad`). There are no subcommands (`status`, `service`, `test`, etc.).
- **Data directory & Keyring identity (`main.py:21, 111`)**: `SERVICE = "CADGPT"`, directory is `user_data_dir("CADGPT", appauthor=False)`. Saved configuration `config.json` stores only `{"server": server, "cadPath": manual}`; it does **not** persist `deviceId` or daemon state.
- **Packaging (`agent/pyproject.toml:9-10`, `packaging/build.py:16-17`, `packaging/windows.iss:2-9`)**:
  - `pyproject.toml` registers only `cadgpt-agent = "cadgpt_agent.main:main"`.
  - `packaging/build.py` builds `--name CADGPT` via PyInstaller.
  - `packaging/windows.iss` builds `CADGPT-Setup-windows-x64.exe` (Inno Setup), installing to `{autopf}\CAD Agent Designer`, but does **not** register `cadengine` into system PATH, does **not** configure a background service/task, and produces an `.exe`, not an `.msi`.
- **Logging**: Currently uses raw `print("...", flush=True)` to stdout. No file-based rotating logger exists in `agent/cadgpt_agent/`. When executed headless or in the background, logs are lost unless redirected by an external supervisor.

### 1.2 Auth & Keycloak Realm Configuration
- **Development Realm (`deploy/cadgpt-realm.json`) & Production Realm (`deploy/prod/cadgpt-realm.prod.json`)**:
  - Realm name: `cadgpt`.
  - Client: `cadgpt-web` (public client, PKCE S256).
  - Scope: `cad:read`, `cad:write`, `profile`, `email`.
  - Identity Providers: The `identityProviders` array is currently completely absent from both realm JSON files. Only username/password local authentication is configured.
- **Theme (`deploy/themes/cadgpt/login/resources/css/stitch.css`)**:
  - Implements the Stitch Precision CAD workbench theme (Inter + JetBrains Mono, Space Canvas `#090D16`, Surface `#0D1322`, Electric Cyan `#00F0FF`).
  - No CSS selectors exist for `#kc-social-providers`, `#social-google`, or social login divider rules.
- **Keycloak Operational Constraint (`docs/deployment.md:78`, `deploy/prod/compose.yaml:46`)**:
  - Container command is `start --import-realm`.
  - Keycloak's `--import-realm` **only runs on first boot when the database is empty**. Applying realm changes to the live instance at `https://cadengine.danny-armijos.com/auth` requires either Keycloak Admin REST API updates (`/admin/realms/cadgpt/identity-providers`) or using `kcadm.sh`.

### 1.3 Device Unpairing & Revocation
- **API routes (`apps/api/src/main.ts:117-124`)**:
  - `DELETE /api/devices/:id` requires user JWT authorization (`auth(q.headers.authorization, 'cad:write')`).
  - The agent currently has no authenticated self-service revocation endpoint using its device credential token (`token(q)`).

### 1.4 CAD Operations & Allowlist
- **Worker dispatch (`agent/cadgpt_agent/freecad_worker.py:263-277`)**:
  - Supports 13 ops: primitives (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`), booleans (`boolean_cut`, `boolean_union`, `boolean_intersect`), transforms (`translate_object`, `rotate_object`, `scale_object`), and inspection/export (`read_scene`, `export_design`).
  - Lacks advanced surfacing, contouring, or feature-dressing operations (`loft`, `chamfer`, `fillet`, `create_wedge`, `extrude_polygon`).
- **Allowlist alignment (`ops-allowlist.json`, `apps/api/src/tools.ts:14-28`, `agent/cadgpt_agent/discovery.py:16-21`)**:
  - All three files currently pin the exact same 13 operations.
  - Tests (`agent/tests/test_ops_allowlist.py:34`) explicitly assert that unproven ops (`fillet`, `chamfer`, `loft`, `sweep`) are excluded from active allowlists.

---

## 2. Technical Deep Dive & Architectural Pillars

```
+----------------------------------------------------------------------------------------------------+
|                                    CAD ENGINE PLATFORM (PHASE 4)                                   |
+-----------------------------------+--------------------------------+-------------------------------+
|          1. AGENT CLI             |      2. SERVICES & INSTALL     |   3. AUTH & PROFESSIONAL CAD  |
|  - Alias: `cadengine`             |  - Windows: MSI / SchTasks     |  - Keycloak Google IdP        |
|  - Status / Health Diagnostic     |  - macOS: LaunchAgent Plist    |  - Stitch UI Social Button    |
|  - Self-revoking Unpair           |  - Linux: systemd user service |  - FreeCAD 1.1.3 Ops:         |
|  - Test / Smoke Runner            |  - Machine PATH registration   |    Loft, Chamfer, Fillet,     |
|  - Rotating File Logger (Logs)    |  - Elevated Admin Installer    |    Wedge, ExtrudePolygon      |
+-----------------------------------+--------------------------------+-------------------------------+
```

---

### Pillar 1: Agent CLI Evolution (`cadengine`)

#### 1.1 Binary Identity & Backward Compatibility
- In `agent/pyproject.toml`, expose both CLI entry points:
  ```toml
  [project.scripts]
  cadengine = "cadgpt_agent.main:main"
  cadgpt-agent = "cadgpt_agent.main:main"
  ```
- PyInstaller in `packaging/build.py`:
  - Build binary name as `cadengine` (or `cadengine.exe`).
  - On macOS/Linux, create a symlink `cadgpt-agent -> cadengine`.
  - On Windows, bundle a lightweight wrapper or dual executable `cadgpt-agent.exe`.
- In-memory service identifier:
  - Keep `keyring` service name as `"CADGPT"` to avoid orphaning existing paired tokens in the OS credential vault.
  - Keep root folder fallback as `user_data_dir("CADGPT")` for seamless upgrades, while allowing symlink or migration to `CADEngine`.

#### 1.2 CLI Subcommands Specification
The CLI will utilize `argparse` with subcommands while falling back to foreground daemon execution if no subcommand is supplied:

```
cadengine [--server <url>] [--headless] ...      # Default: runs foreground worker
cadengine status [--json]                         # System diagnostic & connection verification
cadengine version [--check]                       # Local version & GitHub release check
cadengine pair [--server <url>] [--headless]     # Interactive or headless pairing
cadengine unpair [--force]                        # Self-revoking unpair and credential wipe
cadengine service <install|start|stop|status|uninstall> # Background daemon management
cadengine logs [-f] [-n 50]                       # Stream / inspect rotating agent logs
cadengine test [--cad <freecad|autocad>]          # Local smoke test without server dispatch
```

##### Detailed Command Behavior:
1. **`cadengine status`**:
   - Gathers host metadata: OS, architecture, Python version, working directory.
   - Reads `config.json` and credentials: checks for stored credential in OS Keyring.
   - Tests server connectivity: HTTP `HEAD` or `/api/health` probe against configured server, measuring latency and TLS handshake validity.
   - Executes `discover()`: prints all detected FreeCAD and AutoCAD paths, versions, and execution capabilities.
   - Queries background service status: checks whether systemd / LaunchAgent / Windows Scheduled Task is active.
   - Outputs clean, colored terminal summary with exit code 0 (healthy) or 1 (misconfigured/offline).

2. **`cadengine version` / `--version`**:
   - Prints current version (e.g., `cadengine v0.2.0`).
   - Concurrently checks `https://api.github.com/repos/dmarmijosa/CADGPT/releases/latest` (with a 2.5s timeout).
   - If a newer semantic tag exists, outputs actionable notification:
     `Update available: v0.3.0 (run 'cadengine service stop' and download installer)`.

3. **`cadengine pair`**:
   - Clears any existing credential.
   - Initiates pairing protocol against `/api/pairings`.
   - In terminal: displays the human-readable 12-char pairing code and verification URL.
   - If not `--headless`: launches system browser to `/pair`.
   - Polls `/api/pairings/poll` until confirmed.
   - Saves token to OS Keyring, persists `deviceId` and `server` in `config.json`.
   - Displays post-pairing connect link (`/connect?device=<id>`).

4. **`cadengine unpair`**:
   - Reads server URL and credential token.
   - Calls server endpoint: **New agent self-revocation route**: `POST /api/agent/unpair` with `Authorization: Bearer <credential>`.
   - The server marks the device as `revoked = 1`, cancels queued jobs, and returns `{ "unpaired": true }`.
   - Deletes keyring secret: `keyring.delete_password("CADGPT", server)`.
   - Deletes fallback `credential.json` (if present) and removes `deviceId` from `config.json`.
   - Prints confirmation: `Device [uuid] unpaired and local credentials wiped.`

5. **`cadengine service <action>`**:
   - Manages the native OS service manager (see Pillar 2).

6. **`cadengine logs`**:
   - Configures `logging.handlers.RotatingFileHandler` writing to `user_data_dir/logs/cadengine.log` (5 MB, 3 backups).
   - `cadengine logs` prints last `N` lines (default 50).
   - `cadengine logs -f` implements active tail streaming with clean Ctrl+C handling.

7. **`cadengine test`**:
   - Local smoke test executing discovered FreeCAD/AutoCAD binaries without needing server dispatch.
   - Invokes `discovery.discover()`.
   - For each detected executable, spins up an isolated sandbox in `tempfile.TemporaryDirectory()`.
   - Generates a synthetic test `request.json` (e.g., 10x10x10mm box with STL export).
   - Executes strategy command via `subprocess.run(..., timeout=30)`.
   - Verifies exit code 0, checks that `design.FCStd` / `design.dwg` exists and `preview.stl` is valid non-empty binary STL.
   - Prints benchmark timing: `[PASS] FreeCADCmd (1.1.3): generated solid + STL mesh in 0.38s`.

---

### Pillar 2: Native OS Background Execution & Installers

#### 2.1 The Windows Architecture Dilemma: Session 0 vs Logon Scheduled Task

> [!WARNING]
> **Critical Architectural Constraint on Windows**:
> A traditional Windows Service installed via `sc.exe` runs in **Session 0** under the `NT AUTHORITY\SYSTEM` account.
> 1. **Session 0 Isolation**: Session 0 prohibits interactive UI and display contexts. Some FreeCAD builds (compiled against Qt/OpenGL) and AutoCAD `accoreconsole.exe` instances crash or fail to initialize graphics/COM libraries in Session 0 without a virtual desktop display context.
> 2. **Windows Credential Manager Isolation**: The OS Keyring on Windows (`wincred`) accesses the Credential Vault for the **currently logged-in user profile** (`HKCU`). A service running under `SYSTEM` cannot read the user's stored keyring token!
> 3. **License Context**: AutoCAD licensing tokens and user profile configurations are located in `HKCU\Software\Autodesk`.

**Solution: Windows Logon Scheduled Task with Highest Available Privileges**
Instead of a Session 0 Service, `cadengine service install` and the Windows installer will register a **Windows Scheduled Task** triggered `ONLOGON` for the active user:
- Creation: `schtasks /Create /TN "CADEngineAgent" /TR "\"<INSTALLDIR>\cadengine.exe\"" /SC ONLOGON /RL LIMITED /F`
- Query: `schtasks /Query /TN "CADEngineAgent" /FO LIST`
- Start: `schtasks /Run /TN "CADEngineAgent"`
- Stop: `schtasks /End /TN "CADEngineAgent"`
- Delete: `schtasks /Delete /TN "CADEngineAgent" /F`

This guarantees that:
- The agent runs in the user's interactive session (Session 1+).
- The agent has full access to the user's Windows Credential Manager keyring.
- AutoCAD and FreeCAD run with normal desktop user permissions and licensing.

#### 2.2 macOS LaunchAgent Architecture
- File: `~/Library/LaunchAgents/com.cadengine.agent.plist`
- Content:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
      <key>Label</key>
      <string>com.cadengine.agent</string>
      <key>ProgramArguments</key>
      <array>
          <string>/usr/local/bin/cadengine</string>
      </array>
      <key>RunAtLoad</key>
      <true/>
      <key>KeepAlive</key>
      <true/>
      <key>StandardOutPath</key>
      <string>/Users/USER/Library/Application Support/CADGPT/logs/stdout.log</string>
      <key>StandardErrorPath</key>
      <string>/Users/USER/Library/Application Support/CADGPT/logs/stderr.log</string>
  </dict>
  </plist>
  ```
- Managed via `launchctl bootstrap gui/<uid> ...` or `launchctl load/unload`.

#### 2.3 Linux systemd User Service
- File: `~/.config/systemd/user/cadengine.service`
- Content:
  ```ini
  [Unit]
  Description=CAD Engine Background Worker
  After=network.target

  [Service]
  Type=simple
  ExecStart=/usr/local/bin/cadengine
  Restart=always
  RestartSec=5s
  Environment=PYTHONUNBUFFERED=1

  [Install]
  WantedBy=default.target
  ```
- Managed via `systemctl --user daemon-reload`, `systemctl --user enable --now cadengine`.

#### 2.4 Installer Strategy: WiX Toolset vs Inno Setup for Windows
| Feature | Inno Setup (`windows.iss`) | WiX Toolset (`cadengine.wxs`) | Recommendation |
|---|---|---|---|
| Output Format | `.exe` (Single file setup) | `.msi` (Standard Windows Installer) | WiX produces true `.msi` required by enterprise IT / Intune |
| Elevation | `PrivilegesRequired=admin` | Native UAC Elevation prompt | Both prompt for Admin |
| PATH Registration | Custom Pascal script or Registry modification | Native `<Environment>` element | WiX handles PATH natively and cleanly uninstalls it |
| Task/Service Setup | `[Run]` / `[UninstallRun]` `schtasks` | CustomAction executing `schtasks` | Both support `schtasks` |
| Uninstaller | Inno uninstaller in registry | Standard MSI database uninstall | WiX integrates with Windows Add/Remove programs without custom exe |

**Decision**:
- Provide an enterprise **WiX Toolset v4** project in `packaging/wix/` producing `CADEngine-Setup-x64.msi`.
- In parallel, update `packaging/windows.iss` to ensure developer machines without WiX can still build a fully elevated admin installer that registers `cadengine` in PATH and sets up the auto-start task.

---

### Pillar 3: Google Social Login & Keycloak Integration

#### 3.1 Keycloak Realm Configuration
Keycloak 26.4.7 supports brokered identity providers via the `identityProviders` array in `cadgpt-realm.json` and `cadgpt-realm.prod.json`.

```json
"identityProviders": [
  {
    "alias": "google",
    "displayName": "Google",
    "providerId": "google",
    "enabled": true,
    "updateProfileFirstLoginMode": "on",
    "trustEmail": true,
    "storeToken": false,
    "addReadTokenRoleOnCreate": false,
    "authenticateByDefault": false,
    "linkOnly": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "config": {
      "clientId": "${env.GOOGLE_CLIENT_ID}",
      "clientSecret": "${env.GOOGLE_CLIENT_SECRET}",
      "defaultScope": "openid profile email",
      "guiOrder": "1",
      "syncMode": "IMPORT"
    }
  }
]
```

#### 3.2 Google Cloud Console Setup & Redirect URI
- OAuth 2.0 Web Client Application
- Authorized JavaScript Origins:
  - `https://cadengine.danny-armijos.com`
- Authorized Redirect URIs:
  - `https://cadengine.danny-armijos.com/auth/realms/cadgpt/broker/google/endpoint`
  - For local dev: `http://localhost:8080/auth/realms/cadgpt/broker/google/endpoint`

#### 3.3 Stitch Theme CSS Styling (`deploy/themes/cadgpt/login/resources/css/stitch.css`)
Keycloak's `login.ftl` (PatternFly v5 / Keycloak v2) generates:
```html
<div id="kc-social-providers" class="pf-v5-c-login__main-footer-band">
  <div class="pf-v5-c-divider pf-m-text">
    <span class="pf-v5-c-divider__text">or continue with</span>
  </div>
  <ul class="pf-v5-c-login__main-footer-band-item">
    <li>
      <a id="social-google" class="pf-v5-c-button pf-m-secondary pf-m-block" href="...">
        <span class="pf-v5-c-button__icon"><svg ...></svg></span>
        <span class="pf-v5-c-button__text">Google</span>
      </a>
    </li>
  </ul>
</div>
```

**Stitch Design Tokens Applied**:
- Clean divider with `--stitch-border` (`rgba(255, 255, 255, 0.12)`) and muted text `--stitch-ink-muted`.
- `#social-google`:
  - Background: `var(--stitch-surface-variant)` (`#131b2e`).
  - Border: `1px solid rgba(255, 255, 255, 0.16)`.
  - Color: `var(--stitch-ink)` (`#f8fafc`).
  - Hover: Border `var(--stitch-primary)` (`#00f0ff`), subtle cyan box-shadow `0 0 14px rgba(0, 240, 255, 0.25)`, text glow.
  - Active: `transform: scale(0.99)`.
  - Icon: Embedded Google multi-color SVG icon with high DPI fidelity.

---

### Pillar 4: Advanced Professional CAD Modeling (FreeCAD 1.1.3)

To model complex geometries like Irelia's contour blade, mechanical turbine blades, or ergonomic handles, the worker requires 5 new operations.

#### 4.1 New Operation Specifications

##### 1. `create_wedge`
- **Description**: Creates a right-angled or truncated wedge/ramp primitive.
- **Parameters**:
  - `length`: positive mm (dx)
  - `width`: positive mm (dy)
  - `height`: positive mm (dz)
  - `top_length`: non-negative mm (optional, length of top ridge along X; default 0 = knife edge)
  - `position`: optional `{x, y, z}`
  - `confirmed`: literal `true`
- **FreeCAD API**:
  `Part.makeWedge(dx, dy, dz, top_length, FreeCAD.Vector(x, y, z))`

##### 2. `extrude_polygon`
- **Description**: Extrudes an arbitrary closed 2D polygon along a plane normal. Essential for blade profiles, aerodynamic airfoils, hexagonal brackets, and cams.
- **Parameters**:
  - `points`: array of `[u, v]` coordinate pairs (3 to 100 points, non-self-intersecting).
  - `depth`: positive mm.
  - `plane`: `"XY"`, `"XZ"`, or `"YZ"`.
  - `position`: optional `{x, y, z}`.
  - `confirmed`: literal `true`.
- **FreeCAD API**:
  ```python
  pts_3d = [map_plane(u, v, plane) for u, v in points]
  if pts_3d[0] != pts_3d[-1]: pts_3d.append(pts_3d[0])
  wire = Part.makePolygon(pts_3d)
  face = Part.Face(wire)
  solid = face.extrude(plane_normal * depth)
  ```

##### 3. `fillet`
- **Description**: Rounds sharp edges of an existing object with a specified radius.
- **Parameters**:
  - `documentId`: UUID of existing document.
  - `object`: name of base object (e.g. `"Box"`, `"ExtrudePolygon"`).
  - `radius`: positive mm.
  - `edge_indices`: optional array of 1-based edge indices. If omitted or empty, all edges are filleted.
  - `confirmed`: literal `true`.
- **FreeCAD API**:
  `Part::Fillet` feature added to document, linking `Base = obj`, `Edges = [(idx, radius, radius), ...]`.

##### 4. `chamfer`
- **Description**: Bevels sharp edges of an existing object with a specified distance.
- **Parameters**:
  - `documentId`: UUID of existing document.
  - `object`: name of base object.
  - `distance`: positive mm.
  - `edge_indices`: optional array of 1-based edge indices. If omitted, all edges are chamfered.
  - `confirmed`: literal `true`.
- **FreeCAD API**:
  `Part::Chamfer` feature added to document, linking `Base = obj`, `Edges = [(idx, distance, distance), ...]`.

##### 5. `loft`
- **Description**: Creates a 3D solid by skinning through a sequence of cross-sectional profiles (wires).
- **Parameters**:
  - `sections`: array of 2 to 20 profiles, where each profile is an array of 3 to 100 `[x, y, z]` points forming a closed loop.
  - `solid`: boolean (default `true`).
  - `ruled`: boolean (default `false` for smooth B-spline interpolation, `true` for ruled linear transitions).
  - `position`: optional `{x, y, z}`.
  - `confirmed`: literal `true`.
- **FreeCAD API**:
  ```python
  wires = [Part.makePolygon(close_loop(pts)) for pts in sections]
  loft_shape = Part.makeLoft(wires, solid=solid, ruled=ruled)
  ```

#### 4.2 The "Irelia Blade" Modeling Walkthrough
Using these 5 operations, a complex fantasy blade is achieved parametrically:
1. **Loft**: Define 3 cross sections (Hilt diamond at Z=0, Mid-blade widened diamond at Z=160, Tip diamond at Z=320). Run `loft(sections=[sec0, sec1, sec2], solid=True)` to create the organic, tapered double-edged blade solid.
2. **Extrude Polygon**: Create the ornate guard and blade ring floating at the hilt using `extrude_polygon(points=[...], depth=8, plane="XY")`.
3. **Boolean Union**: Combine blade and guard (`boolean_union`).
4. **Chamfer**: Bevel the cutting edges (`chamfer(object="BladeLoft", distance=1.5)`).
5. **Fillet**: Smooth the spine ridge and hilt transition (`fillet(object="BladeUnion", radius=2.0)`).

---

## 3. Comparative Evaluation & Trade-offs

### 3.1 Windows Service vs Windows Scheduled Task
- **Option A: Traditional Windows Service (Session 0)**
  - *Pros*: Runs even if no user logs in; standard enterprise Windows management (`services.msc`).
  - *Cons*: Severe Session 0 isolation breaks GUI/Qt/OpenGL contexts; cannot access logged-in user's Credential Manager vault; AutoCAD licensing failures.
- **Option B: Windows Scheduled Task (`ONLOGON`) [SELECTED]**
  - *Pros*: Runs in the user's interactive session (Session 1+); full access to Windows Credential Manager; FreeCAD and AutoCAD execute identically to manual user runs; clean startup and teardown via `schtasks`.
  - *Cons*: Requires an active user desktop session (which matches workstation CAD usage).

### 3.2 CLI Pairing & Unpairing Flow
- **Option A: Require Web Dashboard for Unpair**
  - *Pros*: Server is authoritative.
  - *Cons*: Frustrating user experience when a machine is decommissioned or reformatted from CLI.
- **Option B: Self-Revoking CLI Unpair via Bearer Credential [SELECTED]**
  - *Pros*: Single command `cadengine unpair` calls `POST /api/agent/unpair` using its stored token, wipes local credentials, and exits cleanly. Zero browser interaction required.
  - *Cons*: Needs a small new route in `apps/api`.

### 3.3 FreeCAD Modeling: Mesh-based vs Parametric Feature-based
- **Option A: Direct Shape operations (`Shape.makeFillet`, `Shape.makeChamfer`)**
  - *Pros*: Pure OpenCASCADE geometry, fast.
  - *Cons*: Bypasses FreeCAD's document object tree; doesn't appear as a feature in `design.FCStd`.
- **Option B: Document Feature Objects (`Part::Fillet`, `Part::Chamfer`, `Part::Loft`) [SELECTED]**
  - *Pros*: Fully parametric in the generated `design.FCStd` file; shows in FreeCAD tree view when opened by human CAD designers; supports recomputation and native backup rollback.
  - *Cons*: Requires careful management of `Base` and `InList` references (already supported by `_top_level_objects`).

---

## 4. Risks, Security Invariants & Mitigations

1. **Topological Naming & Edge Index Fragility in Fillet/Chamfer**:
   - *Risk*: If an edge index is invalid or changes after a boolean operation, OpenCASCADE can throw an unhandled exception or fail to compute.
   - *Mitigation*: Validate all `edge_indices` against `1 <= idx <= len(obj.Shape.Edges)`. Provide default behavior (all edges) if omitted. Wrap FreeCAD worker execution with automatic file backup restoration on exception (`freecad_worker.py:302-339`).
2. **Self-Intersecting Polygons and Twisted Lofts**:
   - *Risk*: A caller submitting twisted cross-sections can cause OpenCASCADE kernel crashes or non-manifold solids.
   - *Mitigation*: Enforce strict bounds on point coordinates (`[-100000, 100000]`), section count (2-20), and points per section (3-100). The 120-second subprocess execution timeout protects the agent process from hangs.
3. **Keycloak Production Realm Sync**:
   - *Risk*: Modifying `cadgpt-realm.prod.json` does not automatically update Keycloak if the container volume already has an initialized PostgreSQL database.
   - *Mitigation*: Document and provide an administrative sync script utilizing Keycloak Admin REST API (`/admin/realms/cadgpt/identity-providers`) to idempotently create or update the Google identity provider without dropping database volumes.
4. **Credential Security during Unpair**:
   - *Risk*: Partial failure where server revokes token but local keyring is locked or vice versa.
   - *Mitigation*: Local credentials must be wiped **regardless** of whether the remote API call succeeds (best-effort network call, unconditional local wipe).

---

## 5. Recommended Implementation Slices

We recommend implementing Phase 4 in four orderly slices:

### Slice 1: Google Identity Provider & Stitch Theme
- Update `deploy/cadgpt-realm.json` and `deploy/prod/cadgpt-realm.prod.json` with `identityProviders` config for Google.
- Add Keycloak login styling for `#kc-social-providers` and `#social-google` in `deploy/themes/cadgpt/login/resources/css/stitch.css`.
- Update `deploy/prod/compose.yaml` and `.env.example` to document `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Slice 2: Advanced FreeCAD 1.1.3 Operations & API Tools
- Implement `create_wedge`, `extrude_polygon`, `fillet`, `chamfer`, and `loft` in `agent/cadgpt_agent/freecad_worker.py`.
- Update `agent/cadgpt_agent/discovery.py` (`FREECAD_OPS`).
- Update shared fixture `ops-allowlist.json`.
- Update API Zod schemas, types, and tool catalog in `apps/api/src/tools.ts`.
- Add comprehensive unit tests in `agent/tests/test_freecad_worker.py` and `apps/api/test/tools-b2.test.ts`.

### Slice 3: Agent CLI Evolution (`cadengine`) & API Unpair Route
- Add `POST /api/agent/unpair` in `apps/api/src/main.ts` and `apps/api/src/store.ts`.
- Implement CLI subcommands (`status`, `version`, `pair`, `unpair`, `logs`, `test`) in `agent/cadgpt_agent/main.py` (or refactored `cli.py`).
- Implement file-based rotating logger (`user_data_dir/logs/agent.log`).
- Update `agent/pyproject.toml` to declare both `cadengine` and `cadgpt-agent` scripts.
- Add CLI unit tests covering subcommands and error states.

### Slice 4: Native OS Services & Windows MSI Packaging
- Implement `cadengine service <install|start|stop|status|uninstall>` supporting LaunchAgent (macOS), systemd (Linux), and Scheduled Task (Windows).
- Build WiX Toolset v4 setup (`packaging/wix/cadengine.wxs`) producing `CADEngine-Setup-x64.msi` with UAC admin elevation and PATH registration.
- Update Inno Setup script (`packaging/windows.iss`) for fallback EXE compilation.
- Update packaging build script `packaging/build.py` to target `cadengine`.

---

## 6. Conclusion

Phase 4 elevates CAD Engine into an industrial-grade CAD automation ecosystem. The transition to `cadengine` with full service management and diagnostic tooling resolves the operational friction of background agent execution. The addition of Google authentication modernizes access control, and the FreeCAD 1.1.3 modeling expansion (`loft`, `chamfer`, `fillet`, `wedge`, `extrude_polygon`) enables intricate mechanical and organic designs that were previously impossible with basic primitives alone.
