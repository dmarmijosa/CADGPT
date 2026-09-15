# CAD Agent Designer Bridge

**One Angular dashboard for your CAD computers, a NestJS API, and a self-contained Python agent.** Link your own computer to your account, discover CAD installations, and submit controlled FreeCAD jobs remotely.

> **Experimental alpha — not a hosted service.** Deploy the backend before linking an agent. Installers are unsigned; macOS builds are not notarized. AutoCAD is detected only. No claim of compatibility with every CAD version.

## Download

Latest prerelease: **[v0.1.0-alpha.2 →](https://github.com/dmarmijosa/CADGPT/releases/tag/v0.1.0-alpha.2)** (unsigned alpha). [All releases](https://github.com/dmarmijosa/CADGPT/releases).

| Computer | Download | Format |
|---|---|---|
| Windows x64 | [`CADGPT-Setup-windows-x64.exe`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/CADGPT-Setup-windows-x64.exe) | Machine-wide installer (requires administrator), Python included |
| MacBook / Mac with Apple Silicon | [`CADGPT-macos-arm64.dmg`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/CADGPT-macos-arm64.dmg) | Disk image containing the app, Python included |
| MacBook / Mac with Intel | [`CADGPT-macos-x64.dmg`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/CADGPT-macos-x64.dmg) | Disk image containing the app, Python included |
| Linux x64 | [`CADGPT-linux-x64.tar.gz`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/CADGPT-linux-x64.tar.gz) | Portable application archive, Python included |
| All | [`SHA256SUMS.txt`](https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/SHA256SUMS.txt) | Integrity checksums |

Verify a download against `SHA256SUMS.txt` before running it (the builds are unsigned). Newer releases, when published, appear at the releases page above. CAD Agent Designer does **not** install AutoCAD or FreeCAD and does not modify your existing Python installation.

## Install and link your computer

Have a compatible CAD installation and your administrator's **CAD Agent Designer HTTPS server URL** ready.

### Windows

1. Download the Windows installer from Releases and compare its SHA-256 with `SHA256SUMS.txt`: `Get-FileHash .\CADGPT-Setup-windows-x64.exe -Algorithm SHA256`.
2. Run the installer. It requires administrator privileges (an elevation prompt appears) and installs to Program Files for all users on this computer.
3. Leave **Connect this computer to CAD Agent Designer** checked at the end.
4. Enter the server URL. The agent opens the registration/sign-in page.
5. Register or sign in, then enter the pairing code printed in the agent window. Confirm only a code from your own computer.
6. Keep the agent window open. Refresh the dashboard to see the online device. To run it unattended (start on boot, restart on crash), see [Keep the agent running](#keep-the-agent-running-survive-logout-and-reboot).

Unsigned alpha builds may trigger Windows security warnings. Do not disable system-wide protection. If your organization blocks unsigned applications, wait for a signed release or have your administrator review the source.

### macOS

1. Choose **arm64** for Apple Silicon or **x64** for Intel. Check the checksum with `shasum -a 256 CADGPT-macos-arm64.dmg` (adjust filename).
2. Open the disk image and copy `CADGPT.app` to Applications.
3. Open CADGPT and enter your server URL. A browser page and a pairing-code dialog appear.
4. Complete registration/sign-in and confirm the code in the dashboard, then dismiss the dialog.
5. Keep CADGPT running. To stop this alpha's background agent, use Activity Monitor; no menu-bar control or login service is installed. To start it automatically at login, see [Keep the agent running](#keep-the-agent-running-survive-logout-and-reboot).

This alpha is **not notarized**. If Gatekeeper blocks it, use the source workflow or an administrator-reviewed build; do not disable Gatekeeper or remove quarantine globally.

### Linux

1. Verify `sha256sum CADGPT-linux-x64.tar.gz` against the release checksum file.
2. Extract and start the portable agent:
   ```bash
   tar -xzf CADGPT-linux-x64.tar.gz
   ./CADGPT/CADGPT --server https://your-cadgpt.example
   ```
3. Sign in/register in the browser and confirm the pairing code.
4. Keep the process running. Press Ctrl+C to disconnect. For an always-on server, install it as a systemd service instead — see [Keep the agent running](#keep-the-agent-running-survive-logout-and-reboot).

For a headless computer add `--headless` and open the printed URL on another device. An OS keyring is preferred. If none is available, a trusted single-user Linux host can explicitly opt into `--allow-file-credentials`; this stores a private owner-readable credential file. This fallback is never automatic and is disabled on Windows.

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
wget https://github.com/dmarmijosa/CADGPT/releases/download/v0.1.0-alpha.2/CADGPT-linux-x64.tar.gz
# Verify against the release SHA256SUMS.txt (replace the hash with the published one):
echo "<sha256>  CADGPT-linux-x64.tar.gz" | sha256sum -c -
sudo mkdir -p /opt/cadgpt-agent
sudo tar -xzf CADGPT-linux-x64.tar.gz -C /opt/cadgpt-agent --strip-components=1
sudo ln -sf /opt/cadgpt-agent/CADGPT /usr/local/bin/cadgpt-agent
```

Pair once interactively so the credential is stored for your user:

```bash
cadgpt-agent --server https://your-cadgpt.example --headless --allow-file-credentials
```

Then create the service (replace `youruser` with the user that just paired):

```bash
sudo tee /etc/systemd/system/cadgpt-agent.service >/dev/null <<'EOF'
[Unit]
Description=CAD Agent Designer bridge
After=network-online.target
Wants=network-online.target

[Service]
User=youruser
ExecStart=/usr/local/bin/cadgpt-agent --server https://your-cadgpt.example --allow-file-credentials
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cadgpt-agent
sudo systemctl status cadgpt-agent --no-pager   # expect: active (running)
journalctl -u cadgpt-agent -f                    # follow logs; expect "Connected."
```

`Restart=always` recovers from crashes; `enable` starts it on every boot. `User=`
**must** match the pairing user or the service will not find the stored credential
and will try to pair again. Add `--enable-autocad` to the `ExecStart` line only on a
Windows host with AutoCAD (not applicable to Linux). To stop or update:
`sudo systemctl restart cadgpt-agent` / `sudo systemctl disable --now cadgpt-agent`.

### macOS — launchd (LaunchAgent)

A LaunchAgent runs in your user session (so it can reach the login keychain) and
starts again each time you log in. After copying `CADGPT.app` to Applications and
pairing once, create `~/Library/LaunchAgents/com.cadgpt.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cadgpt.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/CADGPT.app/Contents/MacOS/CADGPT</string>
    <string>--server</string>
    <string>https://your-cadgpt.example</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/cadgpt-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/cadgpt-agent.log</string>
</dict>
</plist>
```

Load it (starts immediately and on every login):

```bash
launchctl load ~/Library/LaunchAgents/com.cadgpt.agent.plist
launchctl list | grep cadgpt      # expect a PID in the first column
```

`KeepAlive` restarts it on crash. To stop:
`launchctl unload ~/Library/LaunchAgents/com.cadgpt.agent.plist`. A LaunchAgent
starts at **login**, not at pre-login boot; for an unattended Mac, enable automatic
login for that user, or wait for a future signed build with a proper login item.

### Windows — Task Scheduler

Run the installed agent at log on and keep it alive. In an **administrator**
PowerShell (replace `YOURUSER` with the account that paired):

```powershell
$exe = "C:\Program Files\CAD Agent Designer\CADGPT.exe"
$action  = New-ScheduledTaskAction -Execute $exe -Argument "--server https://your-cadgpt.example"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "YOURUSER"
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "CAD Agent Designer" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -User "YOURUSER"
Start-ScheduledTask -TaskName "CAD Agent Designer"
```

Run it at **log on of the paired user** (not as SYSTEM): the pairing credential is
stored in that user's Windows Credential Manager, which SYSTEM cannot read. The task
restarts the agent if it exits and starts it after each login. To remove:
`Unregister-ScheduledTask -TaskName "CAD Agent Designer" -Confirm:$false`. Add
`--enable-autocad` to `-Argument` if this host also drives AutoCAD.

## Try the first operation

1. In the dashboard, select a detected FreeCAD command-line installation on an online computer.
2. Enter box dimensions in millimeters and explicitly confirm.
3. Click **Create new FreeCAD box**. Refresh to see the result.
4. Find `design.FCStd` and `preview.stl` in the job directory reported in the result; `box.step` is no longer produced. An `export.*` file (STEP, STL or DXF) appears only after an explicit export operation.

Native CAD files (`design.FCStd`) remain on that computer. Only the STL preview mesh — never the native file — is uploaded to the dashboard for a 3D preview; see [Security and limitations](#security-and-limitations). The agent creates a fresh directory for every job and never modifies an open drawing.

## Compatibility

| CAD / platform | Alpha behavior |
|---|---|
| FreeCAD with working `FreeCADCmd` / `freecadcmd`, Windows/macOS/Linux | Headless create/modify/export operations on named designs; an STL preview mesh uploads for the dashboard viewer; installation-specific testing required |
| FreeCAD GUI-only installation, AppImage, Flatpak or Snap | May need manual path or a separate command-line installation; no wrapper support promised |
| Full AutoCAD with `accoreconsole.exe`, Windows | Opt-in only (`--enable-autocad`); create-only primitives (box/cylinder/sphere/cone/extrude) via an allowlisted `.lsp`/`.scr` script; produces a DWG, no preview yet |
| AutoCAD LT, or full AutoCAD without `accoreconsole.exe` | Installation discovery only; LT has no Core Console, so no execution adapter is offered regardless of the flag |
| AutoCAD on Linux | Not a supported target |

The agent's private Python runs networking and discovery. **FreeCAD uses its own Python and libraries**, avoiding a dependency on the user's system Python. No arbitrary Python or shell execution tool is exposed; the opt-in AutoCAD adapter loads only its own bundled, allowlisted `.lsp` file (never caller-supplied AutoLISP) through AutoCAD Core Console.

### AutoCAD (opt-in, experimental)

AutoCAD execution is off by default. A detected full AutoCAD installation with `accoreconsole.exe` is only ever reported executable, and only ever dispatched a job, when you start the agent with `--enable-autocad`:

```bash
cadgpt-agent --server https://your-cadgpt.example --enable-autocad
```

**You are responsible for your own Autodesk license terms.** This flag drives AutoCAD Core Console (`accoreconsole.exe`) unattended, from a script CAD Agent Designer renders and controls; CAD Agent Designer does not interpret, warrant, or provide any Autodesk license, and does not claim this mode of use is permitted under every AutoCAD/AutoCAD LT license. Confirm your own EULA allows unattended, scripted invocation before enabling this flag. See `SECURITY.md` for the trust boundary this adapter operates under.

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
                                      CAD Agent Designer agent --> FreeCADCmd
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
on that page — never a device secret or credential. AutoCAD remains detection-only today (see
[Compatibility](#compatibility)); only FreeCAD operations run through a connected client until an
execution adapter ships.

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

First revoke the device in the dashboard. Windows: uninstall **CAD Agent Designer Bridge** from installed apps. macOS: quit the process and remove `CADGPT.app`. Linux: stop the process and delete its extracted directory.

Credentials and job files are retained intentionally to avoid deleting drawings. Remove the CADGPT keyring entry and, after backing up your jobs, its user-data directory: Windows `%LOCALAPPDATA%\CADGPT`, macOS `~/Library/Application Support/CADGPT`, Linux `~/.local/share/CADGPT`. Paths can vary with OS configuration.

## Build release assets

`packaging/build.py` builds the agent on its native platform using PyInstaller. Windows adds Inno Setup, macOS adds a DMG, Linux adds a tar archive. GitHub Actions builds and tests all targets on version tags, uploads checksums, then creates a **draft prerelease** for human inspection. It never silently publishes production-ready installers.

No project license has been selected yet. Dependency licenses remain their owners'.
