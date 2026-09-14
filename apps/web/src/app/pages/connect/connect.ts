import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';

const POLL_INTERVAL_MS = 10_000;

/**
 * Post-pairing "connect your MCP client" step (design "Onboarding"; spec
 * mcp-client-onboarding). `device` binds from the `?device=` query param via
 * `withComponentInputBinding()` — the pairing approval response does not
 * currently return a device id, so this page also works with no `device` at
 * all (shows every linked computer's status instead of one).
 *
 * The MCP resource URL is derived from `location.origin`, matching
 * `AuthService`'s own use of `location.origin` for redirect URIs elsewhere in
 * this app. Only the device UUID and the public MCP URL ever render here —
 * never a device secret or credential.
 */
@Component({
  selector: 'app-connect-page',
  imports: [RouterLink],
  templateUrl: './connect.html',
})
export class ConnectPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly device = input<string>('');
  readonly resourceUrl = location.origin + '/mcp';
  readonly copied = signal(false);

  /** The device this page was linked to, once `WorkspaceStore.devices` loads. */
  readonly boundDevice = computed(() => {
    const id = this.device();
    if (!id || !this.workspace.devices.hasValue()) return undefined;
    return this.workspace.devices.value().find((d) => d.id === id);
  });

  private readonly boundDeviceOnline = computed(() => this.boundDevice()?.online ?? false);

  constructor() {
    // Poll only while a specific bound device is known and still offline;
    // stop the moment it comes online (or there is nothing to wait for).
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
      // Clipboard API unavailable (e.g. an insecure context) — the URL
      // itself is still visible and selectable on the page.
    }
  }
}
