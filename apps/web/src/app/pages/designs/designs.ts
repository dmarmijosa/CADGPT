import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { TranslatePipe } from '../../core/i18n';

/**
 * Guarded designs list (`GET /api/designs`, owner-scoped by the server —
 * spec document-registry "List scoped to owner"). This page renders
 * `WorkspaceStore.designs` as-is: it never filters rows client-side and
 * never calls anything but that one owner-scoped endpoint.
 *
 * Keeps a "create a test box" form, collapsed by default, for the README's
 * "Try the first operation" walkthrough — the MCP tool flow documents the
 * same operation for a connected assistant.
 */
@Component({
  selector: 'app-designs-page',
  imports: [FormField, RouterLink, DatePipe, TranslatePipe],
  templateUrl: './designs.html',
})
export class DesignsPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(ApiClient);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly model = signal({
    deviceId: '',
    cadId: '',
    length: 10,
    width: 10,
    height: 10,
    confirmed: false,
  });
  readonly fields = form(this.model, (p) => {
    for (const dimension of [p.length, p.width, p.height]) {
      min(dimension, 0.01);
      max(dimension, 10000);
    }
  });
  readonly freecadOptions = computed(() =>
    this.workspace
      .onlineDevices()
      .flatMap((d) =>
        d.cads
          .filter((c) => c.name === 'FreeCAD' && c.executable)
          .map((c) => ({ deviceId: d.id, cadId: c.id, label: d.name + ' — ' + c.name })),
      ),
  );

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not connect. Try again.';
  }

  selectOption(value: string): void {
    const [deviceId, cadId] = value.split('|');
    this.model.update((m) => ({ ...m, deviceId, cadId }));
  }

  async createBox(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.createBoxJob(this.model());
      this.notice.set('Job queued for that device. Check Jobs for the result.');
      this.model.update((m) => ({ ...m, confirmed: false }));
      this.workspace.refreshAll();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
