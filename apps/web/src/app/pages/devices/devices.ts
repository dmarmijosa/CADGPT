import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { WorkspaceStore } from '../../core/state/workspace.store';

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
 */
@Component({
  selector: 'app-devices-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './devices.html',
})
export class DevicesPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(ApiClient);

  readonly releasesUrl = RELEASES_URL;
  readonly confirmingRevoke = signal<string | null>(null);
  readonly revoking = signal(false);
  readonly revokeError = signal('');

  relativeLastSeen(lastSeen: number): string {
    return relativeTime(Date.now() - lastSeen);
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not connect. Try again.';
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
}
