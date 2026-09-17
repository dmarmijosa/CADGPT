import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { TranslatePipe } from '../../core/i18n';

const RELEASES_URL = 'https://github.com/dmarmijosa/CADGPT/releases';

/** Renders a device's last heartbeat as relative time ("2 min ago", "just now"). */
export function relativeTime(msAgo: number): string {
  if (msAgo < 30_000) return 'just now';
  const minutes = Math.round(msAgo / 60_000);
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/**
 * Guarded devices list: status, last seen, detected CADs, and revoke — all
 * backed by `WorkspaceStore.devices`. Revoking asks for confirmation inline
 * (no `window.confirm`) before calling `ApiClient.revokeDevice`.
 * Also manages allowed folders (file-permissions allowlist) per linked device.
 */
@Component({
  selector: 'app-devices-page',
  imports: [DatePipe, RouterLink, TranslatePipe],
  templateUrl: './devices.html',
})
export class DevicesPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(ApiClient);

  readonly releasesUrl = RELEASES_URL;
  readonly confirmingRevoke = signal<string | null>(null);
  readonly revoking = signal(false);
  readonly revokeError = signal('');

  readonly selectedDeviceId = signal<string | null>(null);

  readonly activeDevice = computed(() => {
    if (!this.workspace.devices.hasValue()) return null;
    const devs = this.workspace.devices.value();
    const sel = this.selectedDeviceId();
    if (sel) {
      const found = devs.find((d) => d.id === sel);
      if (found) return found;
    }
    return devs.find((d) => !d.revoked) ?? null;
  });

  readonly newPath = signal('');
  readonly addingRoot = signal(false);
  readonly addRootError = signal('');
  readonly removingRootId = signal<string | null>(null);
  readonly removeRootError = signal('');

  get roots() {
    return this.workspace.roots;
  }

  constructor() {
    effect(() => {
      const dev = this.activeDevice();
      if (dev && this.workspace.selectedDeviceId) {
        this.workspace.selectedDeviceId.set(dev.id);
      }
    });
  }

  relativeLastSeen(lastSeen: number): string {
    return relativeTime(Date.now() - lastSeen);
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not connect. Try again.';
  }

  selectDevice(id: string): void {
    this.selectedDeviceId.set(id);
    this.workspace.selectedDeviceId?.set(id);
  }

  askRevoke(id: string): void {
    this.revokeError.set('');
    this.confirmingRevoke.set(id);
  }

  cancelRevoke(): void {
    this.confirmingRevoke.set(null);
  }

  async confirmRevoke(id: string): Promise<void> {
    this.revoking.set(true);
    this.revokeError.set('');
    try {
      await this.api.revokeDevice(id);
      this.confirmingRevoke.set(null);
      this.workspace.devices.reload();
    } catch (e) {
      this.revokeError.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.revoking.set(false);
    }
  }

  async addRoot(): Promise<void> {
    const dev = this.activeDevice();
    const path = this.newPath().trim();
    if (!dev || !path) return;
    this.addingRoot.set(true);
    this.addRootError.set('');
    try {
      await this.api.addRoot(dev.id, path);
      this.newPath.set('');
      this.workspace.roots?.reload();
    } catch (e) {
      this.addRootError.set(this.errorMessage(e));
    } finally {
      this.addingRoot.set(false);
    }
  }

  async removeRoot(rootId: string): Promise<void> {
    this.removingRootId.set(rootId);
    this.removeRootError.set('');
    try {
      await this.api.removeRoot(rootId);
      this.workspace.roots?.reload();
    } catch (e) {
      this.removeRootError.set(this.errorMessage(e));
    } finally {
      this.removingRootId.set(null);
    }
  }
}
