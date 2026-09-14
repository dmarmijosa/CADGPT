import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';

export interface Cad {
  id: string;
  name: string;
  path: string;
  version: string;
  executable: boolean;
}
export interface Device {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  cads: Cad[];
}

/** Guarded devices list: status, detected CADs, revoke (ported from phase 1). */
@Component({
  selector: 'app-devices-page',
  templateUrl: './devices.html',
})
export class DevicesPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly devices = signal<Device[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.devices.set(await this.api.request<Device[]>('/api/devices'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    if (
      !window.confirm(
        'Revoke this device? Queued jobs will be cancelled. A job already executing may finish locally.',
      )
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.request('/api/devices/' + id, 'DELETE');
      await this.refresh();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
