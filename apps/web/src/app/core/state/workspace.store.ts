import { Injectable, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../api/api-client';

/**
 * Central read model for the dashboard (design D16): one independently
 * reloadable `resource()` per collection, each surfacing its own `error()`
 * signal. No polling here — pages that need freshness call `reload()` on a
 * single resource or `refreshAll()` after a mutation.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly api = inject(ApiClient);

  readonly devices = resource({ loader: () => this.api.devices() });
  readonly jobs = resource({ loader: () => this.api.jobs() });
  readonly designs = resource({ loader: () => this.api.designs() });

  // `.value()` throws while a resource is in its error state (no prior
  // successful load) — always gate it behind `hasValue()` rather than `??`.
  readonly onlineDevices = computed(() =>
    this.devices.hasValue() ? this.devices.value().filter((d) => d.online) : [],
  );
  readonly designsWithPreview = computed(() =>
    this.designs.hasValue() ? this.designs.value().filter((d) => d.hasMesh) : [],
  );

  /** Reloads every resource — used after a mutation whose effects span more than one collection. */
  refreshAll(): void {
    this.devices.reload();
    this.jobs.reload();
    this.designs.reload();
  }
}
