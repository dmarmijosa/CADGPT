# CAD Engine

**One Angular dashboard for your CAD computers, a NestJS API, and a self-contained Python agent.** Link your own computer to your account, discover CAD installations, and submit controlled CAD jobs remotely.

> **Experimental alpha — not a hosted service.** Deploy the backend before linking an agent. Installers are unsigned; macOS builds are not notarized. Full AutoCAD with Core Console supports 13 headless operations on Windows (AutoCAD LT is detected only). No claim of compatibility with every CAD version.

## Download

Latest prerelease: **[v0.2.0-alpha.1 →](https://github.com/dmarmijosa/CADGPT/releases/tag/v0.2.0-alpha.1)** (unsigned alpha). [All releases](https://github.com/dmarmijosa/CADGPT/releases).

| Computer | Download | Format |
|---|---|---|
| Windows x64 | [`CADEngine-Setup-windows-x64.exe`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/CADEngine-Setup-windows-x64.exe) | Inno Setup machine-wide installer, Python included |
| MacBook / Mac with Apple Silicon | [`CADEngine-macos-arm64.dmg`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/CADEngine-macos-arm64.dmg) | Disk image containing CAD Engine app, Python included |
| MacBook / Mac with Intel | [`CADEngine-macos-x64.dmg`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/CADEngine-macos-x64.dmg) | Disk image containing CAD Engine app, Python included |
| Linux x64 | [`cadengine-linux-x64.tar.gz`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/cadengine-linux-x64.tar.gz) | Portable application archive, Python included |
| All | [`SHA256SUMS.txt`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/SHA256SUMS.txt) | Integrity checksums |

Verify a download against `SHA256SUMS.txt` before running it (the builds are unsigned). Newer releases, when published, appear at the releases page above. CAD Engine does **not** install AutoCAD, FreeCAD, or Blender, and does not modify your existing Python installation.

## Install and link your computer

Have a compatible CAD installation (FreeCAD or AutoCAD) and your administrator's **CAD Engine HTTPS server URL** ready.

### Desktop GUI & Onboarding Wizard (Recommended)

CAD Engine includes a native, lightweight (<2 MB) cross-platform Onboarding Wizard and System Tray daemon:

1. **Launch the GUI**: Run the application or execute `cadengine gui` in terminal.
2. **Step 1 — Language Selection**: Switch dynamically between **English** and **Español**. The interface updates in real time.
3. **Step 2 — Parametric CAD Prerequisite Gate**: The wizard automatically probes for FreeCAD and AutoCAD.
   - **Hard Gate**: If neither CAD engine is detected, progression is blocked. The wizard provides guided installation commands (`winget install FreeCAD.FreeCAD` on Windows, `brew install --cask freecad` on macOS, `sudo apt install freecad` on Linux) and an instant **Re-check** button.
4. **Step 3 — Blender 3D Organic Modeling Tool**: Probes for Blender installations. If detected, it enables organic modeling tools. If not detected, you can specify your Blender path (stored safely without UAC administrator elevation) or choose **Continue without Blender**.
5. **Step 4 — Zero-URL Pairing HUD & Auto-Enrollment**: Automatically connects to the production server (`https://cadengine.danny-armijos.com`) without manual URL entry, displays a prominent 12-character ephemeral pairing code (with offline fallback code generation), provides one-click **Copy Code** and **Open Dashboard** buttons, and upon approval, saves credentials securely to OS keyring (`keyring`) while automatically registering the native background daemon (`schtasks` on Windows, `systemd` user service on Linux, `launchd` on macOS).
6. **System Tray Daemon (`pystray`)**: Once paired, CAD Engine minimizes to the system tray with a 3D isometric cube icon (macOS Menu Bar Extra / Windows Notification Area):
   - **Status Header**: Displays connection state and version (`v0.2.0-alpha.1`).
   - **View Pairing Code**: Look up active code or device ID.
   - **View Connection Status**: Real-time HUD showing Server URL, Device ID, Active Engines (FreeCAD, AutoCAD, Blender), and Ping Latency.
   - **Open Web Dashboard**: Quick shortcut to the web application.
   - **Unpair Device...**: Prompts for confirmation, revokes registration with the API, wipes local credentials, and resets state.
   - **Exit / Quit**: Cleanly shuts down background workers and removes tray icon.

### CLI & Headless Setup

For headless servers, remote SSH sessions, or unattended workstations:

#### Windows
1. Download `CADEngine-Setup-windows-x64.exe` from Releases.
2. Run the installer (registers system PATH and scheduled task options).
3. Connect interactively or via CLI: `cadengine --server https://your-cadgpt.example`.

#### macOS
1. Download `CADEngine-macos-arm64.dmg` or `CADEngine-macos-x64.dmg`.
2. Open disk image, move `CAD Engine.app` to Applications.
3. Launch from Applications or run via CLI: `/Applications/CADEngine.app/Contents/MacOS/cadengine --server https://your-cadgpt.example`.

#### Linux
1. Download and extract `cadengine-linux-x64.tar.gz`:
   ```bash
   tar -xzf cadengine-linux-x64.tar.gz
   ./cadengine/cadengine --server https://your-cadgpt.example
   ```
2. For headless servers without an active X11/Wayland display or keyring:
   ```bash
   ./cadengine/cadengine --server https://your-cadgpt.example --headless --allow-file-credentials
   ```

### Choosing a CAD installation

The agent searches common installation locations, PATH, Windows App Paths and Conda's environment list. No particular username, server, or Conda environment is required. Multiple installations appear separately.

For a custom FreeCAD installation:
```bash
cadgpt-agent --server https://your-cadgpt.example --cad-path /absolute/path/to/FreeCADCmd
```

Use `CADGPT.exe` or `./CADGPT` instead of `cadgpt-agent` for packaged builds. A detected GUI executable alone is **not** enough: this alpha requires a working FreeCAD command-line executable. Version is reported as unverified until actual operation testing; detection is not certification.

## Keep the agent running (survive logout and reboot)

Run interactively (a terminal window or `--headless` session) the agent stops the
moment you close it, and the device goes **Offline** — no jobs run. On a server or
any always-on machine, install it as a background service so it starts on boot and
restarts on crash. After the first pairing the agent reuses the saved server URL and
credential automatically, so **the service never needs to pair again** — it only has
to run **as the same OS user that paired**, because the credential lives in that
user's data directory (`~/.local/share/CADGPT` on Linux, `~/Library/Application
Support/CADGPT` on macOS, `%LOCALAPPDATA%\CADGPT` on Windows).

### Linux — systemd

For a headless server, install the portable build to a fixed location first:

```bash
cd /tmp
wget https://github.com/dmarmijosa/CADGPT/releases/download/v0.2.0-alpha.1/cadengine-linux-x64.tar.gz
# Verify against the release SHA256SUMS.txt (replace the hash with the published one):
echo "<sha256>  cadengine-linux-x64.tar.gz" | sha256sum -c -
sudo mkdir -p /opt/cadengine
sudo tar -xzf cadengine-linux-x64.tar.gz -C /opt/cadengine --strip-components=1
sudo ln -sf /opt/cadengine/cadengine /usr/local/bin/cadengine
sudo ln -sf /opt/cadengine/cadengine /usr/local/bin/cadgpt-agent
```

Pair once interactively so the credential is saved for your user:

```bash
cadengine --server https://your-cadgpt.example --headless --allow-file-credentials
```

#### Option A: User systemd service (Recommended)
Runs in your unprivileged user space without sudo, accessing your user config seamlessly:

```bash
mkdir -p ~/.config/systemd/user
tee ~/.config/systemd/user/cadengine.service >/dev/null <<'EOF'
[Unit]
Description=CAD Engine Background Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/cadengine --allow-file-credentials
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now cadengine
systemctl --user status cadengine --no-pager
```

#### Option B: System-wide systemd service
If running as a dedicated system account (replace `youruser` with the pairing user):

```bash
sudo tee /etc/systemd/system/cadengine.service >/dev/null <<'EOF'
[Unit]
Description=CAD Engine Background Agent
After=network-online.target
Wants=network-online.target

[Service]
User=youruser
ExecStart=/usr/local/bin/cadengine --server https://your-cadgpt.example --allow-file-credentials
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cadengine
sudo systemctl status cadengine --no-pager
journalctl -u cadengine -f
```

`Restart=always` recovers from crashes; `enable` starts it on every boot. `User=` **must** match the pairing user or the service will not find the stored credential. Add `--enable-autocad` to the `ExecStart` line only on a Windows host with AutoCAD. To manage: `systemctl restart cadengine` / `systemctl stop cadengine`.

### macOS — launchd (LaunchAgent)

A LaunchAgent runs in your user session (so it can reach Keychain) and starts again each time you log in. After copying `CAD Engine.app` to Applications and pairing once, create `~/Library/LaunchAgents/com.cadengine.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cadengine.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/CAD Engine.app/Contents/MacOS/cadengine</string>
    <string>--server</string>
    <string>https://your-cadgpt.example</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/cadengine.log</string>
  <key>StandardErrorPath</key><string>/tmp/cadengine.log</string>
</dict>
</plist>
```

Load it (starts immediately and on every login):

```bash
launchctl load ~/Library/LaunchAgents/com.cadengine.agent.plist
launchctl list | grep cadengine      # expect a PID in the first column
```

`KeepAlive` restarts it on crash. To stop: `launchctl unload ~/Library/LaunchAgents/com.cadengine.agent.plist`.

### Windows — Task Scheduler

Run the installed agent at log on and keep it alive. In an **administrator** PowerShell (replace `YOURUSER` with the account that paired):

```powershell
$exe = "C:\Program Files\CAD Engine\cadengine.exe"
$action  = New-ScheduledTaskAction -Execute $exe -Argument "--server https://your-cadgpt.example"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "YOURUSER"
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "CAD Engine" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -User "YOURUSER"
Start-ScheduledTask -TaskName "CAD Engine"
```

Run it at **log on of the paired user** (not as SYSTEM): the pairing credential is
stored in that user's Windows Credential Manager, which SYSTEM cannot read. The task
restarts the agent if it exits and starts it after each login. To remove:
`Unregister-ScheduledTask -TaskName "CAD Engine" -Confirm:$false`. Add
`--enable-autocad` to `-Argument` if this host also drives AutoCAD.

## Try the first operation

1. In the dashboard, select a detected FreeCAD command-line installation on an online computer.
2. Enter box dimensions in millimeters and explicitly confirm.
3. Click **Create new FreeCAD box**. Refresh to see the result.
4. Find `design.FCStd` and `preview.stl` in the job directory reported in the result; `box.step` is no longer produced. An `export.*` file (STEP, STL or DXF) appears only after an explicit export operation.

Native CAD files (`design.FCStd`) remain on that computer. Only the STL preview mesh — never the native file — is uploaded to the dashboard for a 3D preview; see [Security and limitations](#security-and-limitations). The agent creates a fresh directory for every job and never modifies an open drawing.

## Compatibility & Engines

CAD Engine bridges external AI clients (ChatGPT, Claude) to local CAD and 3D modeling kernels through allowlisted MCP tools. **No AI models run inside the MCP server or the agent; all reasoning is driven by the client.**

| Engine / Platform | Capabilities & Operations | Supported Workflows |
|---|---|---|
| **FreeCAD** (Linux / macOS / Windows) | 20 operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `fillet`, `chamfer`, `loft`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`, `create_text_3d`, `analyze_image_to_cad`) | Headless mechanical CSG solids, parametric B-Rep modeling, 3D embossed/engraved typography (`Inter-Bold`), metric OpenCV computer vision contour tracing, and STEP/IGES/DXF/STL exports. |
| **AutoCAD 2026 Core Console** (Windows) | 13 operations (`create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `boolean_cut`, `boolean_union`, `boolean_intersect`, `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`) | 2D/3D architectural drafting, CSG solid modeling, MASSPROP volumetric verification, native DWG/DXF generation, and non-interactive binary STL preview meshes via headless `_STLOUT`. Opt-in via `--enable-autocad`. |
| **Blender** (Linux / macOS / Windows) | 5 operations (`create_blender_mesh`, `extrude_subdivide_mesh`, `displace_sculpt_mesh`, `boolean_blender_mesh`, `export_blender_scene`) | Headless organic modeling, quad-dominant meshes (cube, cylinder, sphere, monkey), normal-directed extrusion with Catmull-Clark subdivision, procedural displacement (clouds, voronoi, wood, marble), mesh booleans, and binary STL/OBJ/glTF/blend exports. |
| **AutoCAD LT** (Windows) | Detection-only (`executable=false`) | Discovered in registry for inventory, but execution is disabled because LT does not ship Core Console and lacks 3D solid modeling and `STLOUT`. |

### Engine Guidance & Selection

The MCP server provides dedicated guidance resources and a deterministic routing tool to guide AI clients to the proper engine without code guessing:
- `cadgpt://guidance/modeling-engine-selection`: Comprehensive architectural boundaries between FreeCAD (mechanical engineering/tolerances), AutoCAD (architectural/DWG drafting), and Blender (organic meshes/sculpting).
- `select_modeling_engine`: Informational MCP tool that evaluates domain (`mechanical`, `architectural`, `organic`, `artistic`, `hybrid`), precision (`high_tolerance`, `standard`, `visual_only`), and intended output (`cnc_milling`, `3d_printing`, `rendering`, `drawing_permit`, `animation`) to recommend the optimal toolchain and parameters.

### Workspace Directory Governance

Every CAD project managed by CAD Engine organizes its assets into a standardized 5-folder hierarchy:
```text
project-root/
├── cad/         # Native source files (design.FCStd, design.dwg, design.blend)
├── meshes/      # Tessellated surface geometry (preview.stl, preview.glb)
├── exports/     # Manufacturing packages (model.step, layout.dxf, model.obj)
├── renders/     # Presentation imagery (thumbnail.png, render.png)
├── references/  # Input blueprints and vision sketches (sketch.png, spec.pdf)
└── project.json # Atomic manifest tracking inventory, hashes, and verification
```

- `audit_project_structure`: Non-disruptive, read-only MCP tool that scans project structure, checks file checksums, identifies unorganized root files, and generates a relocation plan without modifying disk.
- `reorganize_project_structure`: Executes structural reorganization under strict user authorization (`confirmed: true`), enforcing boundary containment (blocking directory traversal `..`) and updating `project.json` atomically.

### Deep File Integrity & Anti-Corruption

All geometry files are audited prior to agent upload, web ingestion, and client download:
- **Binary STL**: Enforces exact byte formula $\text{FileSize} = 84 + (50 \times N)$, rejects ASCII `"solid "` headers, validates finite IEEE 754 float coordinates (rejecting `NaN`, $\pm\infty$), and checks for non-degenerate geometry within $[-100000, 100000]\text{ mm}$.
- **Magic Byte Validation**: AutoCAD DWG (`AC10xx`), FreeCAD FCStd (`PK\x03\x04` with `Document.xml`), and Blender (`BLENDER`).
- Any corrupted payload or truncated download is intercepted and rejected with a fail-fast status.

### AutoCAD (opt-in, experimental)

AutoCAD execution is off by default. A detected full AutoCAD installation with `accoreconsole.exe` on Windows is only ever reported executable, and only ever dispatched a job, when you start the agent with `--enable-autocad`:

```bash
cadengine --server https://your-cadgpt.example --enable-autocad
```

**You are responsible for your own Autodesk license terms.** This flag drives AutoCAD Core Console (`accoreconsole.exe`) unattended, from a script CAD Engine renders and controls; CAD Engine does not interpret, warrant, or provide any Autodesk license, and does not claim this mode of use is permitted under every AutoCAD/AutoCAD LT license. Confirm your own EULA allows unattended, scripted invocation before enabling this flag. See `SECURITY.md` for the trust boundary this adapter operates under.

## Run from source

Prerequisites: Node.js **24**, npm, Python **3.11+**, and Docker Compose for the local identity provider. Source development needs Python; downloaded agents do not.

```bash
git clone https://github.com/dmarmijosa/CADGPT.git
cd CADGPT
npm ci
cp .env.example .env
# Set a unique local administrator password; do not commit it.
export KC_BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-unique-local-password'
docker compose -f deploy/compose.yaml up -d
npm run build
npm start
```

Open `http://localhost:3000`. Register through Keycloak's **Register** link. The development identity provider is at `http://localhost:8080`; ports bind only to loopback. On Windows PowerShell use `Copy-Item .env.example .env` and `$env:KC_BOOTSTRAP_ADMIN_PASSWORD="your-unique-password"`.

In a second terminal:
```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e ./agent
cadgpt-agent --server http://localhost:3000
```
Windows activation: `.venv\Scripts\Activate.ps1`; use `python` instead of `python3`.

For frontend development, run `npm run dev:api` and `npm run dev:web`. Angular serves on port 4200 and proxies the API; pairing links still open the configured `PUBLIC_ORIGIN`.

Checks:
```bash
npm run build
npm test
python -m unittest discover -s agent/tests -v
```

Stop development Keycloak with `docker compose -f deploy/compose.yaml down`. Do not delete its volume unless intentionally resetting all development accounts.

## Remote access and ChatGPT / Claude

```text
ChatGPT / Claude -- OAuth + MCP HTTPS --> NestJS API
Angular dashboard -- OIDC/PKCE -------->      |
                                            | outgoing HTTPS polling
                                            v
                                      CAD Engine agent --> FreeCADCmd / accoreconsole.exe
```

Registration alone does not connect ChatGPT. A public HTTPS backend, identity-provider deployment and separately registered OAuth client are required. **ChatGPT/Claude end-to-end connection is not yet certified.** See [deployment and MCP setup](docs/deployment.md).

### After pairing: connect Claude or ChatGPT

Once a device finishes pairing, the dashboard's **Connect** step (`/connect`) shows this
deployment's MCP resource URL with a copy-to-clipboard control, plus separate instructions for
Claude (Settings → Connectors → Add custom connector → paste the URL → sign in) and ChatGPT
(Settings → Connectors → Developer mode → Add → paste the URL). It also shows whether the linked
computer is online. That page only walks through the client-side half of connecting; the backend
still needs the public HTTPS deployment and registered OAuth client(s) described in
[Connect an MCP client](docs/deployment.md#connect-an-mcp-client) before a connector actually
authenticates. Try `list_devices` first to confirm the connection before running a mutating
operation. As with every other surface, only the device's UUID and the public MCP URL ever appear
on that page — never a device secret or credential. AutoCAD 2026 Core Console supports full
13-operation headless execution on Windows when started with `--enable-autocad`; AutoCAD LT
remains strictly detection-only (see [Compatibility](#compatibility)).

For the automated VPS deployment via GitHub Actions, see [Production on the VPS via GitHub Actions](docs/deployment.md#production-on-the-vps-via-github-actions).

## Security and limitations

- Validated OIDC JWT signature, issuer, audience, expiry and scopes determine user identity. A request cannot choose its owner.
- One-use device pairing expires in 10 minutes. Device secrets never enter browser URLs.
- Agent credentials are hashed server-side and stored in the OS keyring locally.
- Devices initiate outbound HTTPS requests; no open incoming port, SSH or Tailscale is required.
- Revocation blocks new agent requests and cancels queued jobs. **It cannot undo an operation already running locally.**
- Jobs expire, are claimed once, have dimension limits and a 120-second worker timeout. Lost results become unknown rather than silently replaying operations.
- **Exception: the STL preview mesh leaves the machine.** Native CAD files (`.FCStd`, `.dwg`) stay on the agent's computer; the agent uploads only the rendered STL preview so the dashboard can show a 3D viewer. Uploads are capped at 25 MiB per file with a 500 MiB per-device quota; only the newest 5 previews per design are kept.
- The SQLite store supports **one backend instance**. Back up it and identity data; do not horizontally scale this alpha.
- Limits are per backend IP. Shared NAT users may hit them. Put production abuse controls at the reverse proxy.
- Pairing/account audit history, credential rotation, signed updates, remote file transfer, rich CAD commands, active-document integration and administrative recovery are future work.

See [security notes](SECURITY.md) before any Internet deployment.

## Uninstall

First revoke the device in the dashboard. Windows: uninstall **CAD Engine** from installed apps. macOS: quit the process and remove `CAD Engine.app`. Linux: stop the process (`systemctl --user stop cadengine`) and delete its directory.

Credentials and job files are retained intentionally to avoid deleting drawings. Remove the CADGPT keyring entry and, after backing up your jobs, its user-data directory: Windows `%LOCALAPPDATA%\CADGPT`, macOS `~/Library/Application Support/CADGPT`, Linux `~/.local/share/CADGPT`. Paths can vary with OS configuration.

## Build release assets

`packaging/build.py` builds the agent on its native platform using PyInstaller. Windows adds WiX Toolset (.msi) and Inno Setup (.exe), macOS adds a DMG, Linux adds a tar archive. GitHub Actions builds and tests all targets on version tags, uploads checksums, and publishes a **prerelease** (`prerelease: true`, `draft: false`) so agent installations can discover updates automatically.

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE). See `LICENSE` for the full text, including explicit patent grants and contributor protections. Dependency licenses remain their respective owners'.

