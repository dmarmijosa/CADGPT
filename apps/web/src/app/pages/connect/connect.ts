import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { TranslatePipe } from '../../core/i18n';

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

  /** The device this page was linked to, once `WorkspaceStore.devices` loads. */
  readonly boundDevice = computed(() => {
    const id = this.device();
    if (!id || !this.workspace.devices.hasValue()) return undefined;
    return this.workspace.devices.value().find((d) => d.id === id);
  });

  private readonly boundDeviceOnline = computed(() => this.boundDevice()?.online ?? false);

  constructor() {
    effect(() => {
      if (this.device() && !this.boundDeviceOnline()) {
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
