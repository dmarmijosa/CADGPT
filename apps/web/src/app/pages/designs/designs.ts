import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Device } from '../devices/devices';

export interface Design {
  id: string;
  name: string;
  cadKind: string;
  created: number;
  updated: number;
  hasMesh: boolean;
}

/**
 * Guarded designs list (`GET /api/designs`, owner-scoped by the server).
 * Keeps a minimal "create a box" form on this page — the README's
 * "Try the first operation" walkthrough still documents the phase-1
 * dashboard flow, so it stays available until the MCP tool flow replaces it
 * in the docs.
 */
@Component({
  selector: 'app-designs-page',
  imports: [FormField, RouterLink],
  templateUrl: './designs.html',
})
export class DesignsPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly designs = signal<Design[]>([]);
  readonly devices = signal<Device[]>([]);
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
    this.devices()
      .filter((d) => d.online)
      .flatMap((d) =>
        d.cads
          .filter((c) => c.name === 'FreeCAD' && c.executable)
          .map((c) => ({ deviceId: d.id, cadId: c.id, label: d.name + ' — ' + c.name })),
      ),
  );

  async ngOnInit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const [designs, devices] = await Promise.all([
        this.api.request<Design[]>('/api/designs'),
        this.api.request<Device[]>('/api/devices'),
      ]);
      this.designs.set(designs);
      this.devices.set(devices);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
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
      await this.api.request('/api/jobs', 'POST', this.model());
      this.notice.set('Job queued for that device. Check Jobs for the result.');
      this.model.update((m) => ({ ...m, confirmed: false }));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
