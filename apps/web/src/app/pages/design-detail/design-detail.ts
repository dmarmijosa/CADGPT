import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { StlViewer } from '../../features/viewer/stl-viewer';

export interface DesignDetail {
  id: string;
  name: string;
  cadKind: string;
  created: number;
  updated: number;
  latestJobId: string | null;
  hasMesh: boolean;
}

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 24; // ~2 minutes at 5 s intervals

/**
 * Guarded single-design view (`GET /api/designs/:id`, `GET
 * /api/designs/:id/mesh`). Renders the STL viewer once a mesh exists (spec
 * mesh-viewer "Preview renders after job completion"); otherwise shows a
 * pending state and polls the design endpoint every 5 s (spec mesh-viewer
 * "Pending State Without Mesh") — the mesh binary is never requested while
 * `hasMesh` is false.
 */
@Component({
  selector: 'app-design-detail-page',
  imports: [RouterLink, StlViewer, DatePipe],
  templateUrl: './design-detail.html',
})
export class DesignDetailPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly id = input<string>('');

  readonly design = signal<DesignDetail | null>(null);
  readonly mesh = signal<ArrayBuffer | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly stillPending = signal(false);

  private pollHandle: ReturnType<typeof setTimeout> | undefined;
  private pollAttempts = 0;

  /** Exposed so tests can await the initial load (mirrors CallbackPage's `done`). */
  ready: Promise<void> = Promise.resolve();

  ngOnInit(): void {
    this.ready = this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const design = await this.api.request<DesignDetail>('/api/designs/' + this.id());
      this.design.set(design);
      if (design.hasMesh) {
        this.stopPolling();
        this.mesh.set(await this.api.requestArrayBuffer('/api/designs/' + this.id() + '/mesh'));
      } else {
        this.schedulePoll();
      }
    } catch (e) {
      this.error.set(
        e instanceof Error
          ? e.message
          : 'Could not load this design. It may not exist, or it is not yours.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private schedulePoll(): void {
    if (this.pollAttempts >= POLL_MAX_ATTEMPTS) {
      this.stillPending.set(true);
      return;
    }
    this.pollHandle = setTimeout(() => {
      this.pollAttempts++;
      void this.load();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollHandle !== undefined) clearTimeout(this.pollHandle);
    this.pollHandle = undefined;
  }
}
