import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { z } from 'zod';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { TranslatePipe } from '../../core/i18n';

const deviceQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

const POLL_INTERVAL_MS = 10_000;

/**
 * Post-pairing "connect your MCP client" step (design "Onboarding"; spec
 * mcp-client-onboarding). Includes keep-alive configuration for Linux (systemd),
 * macOS (launchd), and Windows (Task Scheduler).
 */
@Component({
  selector: 'app-connect-page',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './connect.html',
})
export class ConnectPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly device = input<string>('');
  readonly resourceUrl = location.origin + '/mcp';
  readonly serverOrigin = location.origin;
  readonly copied = signal(false);
  readonly copiedSnippet = signal<string | null>(null);
  readonly serviceInstallCommand = 'cadengine service install';

  readonly freecadWinget = 'winget install FreeCAD.FreeCAD';
  readonly freecadBrew = 'brew install --cask freecad';
  readonly freecadApt = 'sudo apt install freecad';

  readonly blenderWinget = 'winget install BlenderFoundation.Blender';
  readonly blenderBrew = 'brew install --cask blender';
  readonly blenderApt = 'sudo apt install blender';

  readonly quickCmdGui = 'cadengine gui';
  readonly quickCmdPair = 'cadengine pair';
  readonly quickCmdStatus = 'cadengine status';
  readonly quickCmdDoctor = 'cadengine doctor';

  readonly geminiPythonSnippet = computed(
    () => `# Google Gemini 2.5 / 1.5 with CAD Engine MCP Integration
import os
from google import genai
from google.genai import types

client = genai.Client()
CAD_API_KEY = os.environ.get("CADENGINE_API_KEY", "cad_sk_your_api_key_here")
CAD_ENDPOINT = "${this.resourceUrl}"

# Register CAD Engine operations as Gemini function declarations
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Model a mechanical mounting plate 100x50x10mm with 4 M5 corner holes in FreeCAD",
    config=types.GenerateContentConfig(
        tools=[...],  # Auto-mapped from CAD Engine tool schema
    ),
)
print(response.text)`,
  );

  readonly genericMcpSnippet = computed(
    () => `{
  "mcpServers": {
    "cadengine": {
      "url": "${this.resourceUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`,
  );

  readonly linuxSnippet = computed(
    () => `sudo tee /etc/systemd/system/cadengine.service >/dev/null <<'EOF'
[Unit]
Description=CAD Engine Background Agent
After=network-online.target
Wants=network-online.target

[Service]
User=youruser
ExecStart=/usr/local/bin/cadengine --server ${this.serverOrigin}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cadengine`,
  );

  readonly macosSnippet = computed(
    () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cadengine.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/CAD Engine.app/Contents/MacOS/cadengine</string>
    <string>--server</string>
    <string>${this.serverOrigin}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/cadengine.log</string>
  <key>StandardErrorPath</key><string>/tmp/cadengine.log</string>
</dict>
</plist>`,
  );

  readonly windowsSnippet = computed(
    () => `$exe = "C:\\Program Files\\CAD Engine\\cadengine.exe"
$action  = New-ScheduledTaskAction -Execute $exe -Argument "--server ${this.serverOrigin}"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "YOURUSER"
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "CAD Engine" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -User "YOURUSER"
Start-ScheduledTask -TaskName "CAD Engine"`,
  );

  readonly validatedDeviceId = computed(() => {
    const res = deviceQuerySchema.safeParse(this.device());
    return res.success ? res.data : undefined;
  });

  /** The device this page was linked to, once `WorkspaceStore.devices` loads. */
  readonly boundDevice = computed(() => {
    const id = this.validatedDeviceId();
    if (!id || !this.workspace.devices.hasValue()) return undefined;
    return this.workspace.devices.value().find((d) => d.id === id);
  });

  private readonly boundDeviceOnline = computed(() => this.boundDevice()?.online ?? false);

  constructor() {
    effect(() => {
      if (this.validatedDeviceId() && !this.boundDeviceOnline()) {
        this.timer ??= setInterval(() => this.workspace.devices.reload(), POLL_INTERVAL_MS);
      } else if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.timer) clearInterval(this.timer);
    });
  }

  async copyResourceUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.resourceUrl);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }

  async copySnippet(text: string, os: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedSnippet.set(os);
      setTimeout(() => {
        if (this.copiedSnippet() === os) this.copiedSnippet.set(null);
      }, 2000);
    } catch {
      // Clipboard API unavailable
    }
  }
}
