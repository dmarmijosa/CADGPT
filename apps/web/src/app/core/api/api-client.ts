import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { CreateBoxPayload, Design, DesignDetail, Device, Job } from './models';

/**
 * Typed methods over the low-level bearer client (`ApiService`). Pages and
 * `WorkspaceStore` depend on this, never on `ApiService` directly, so a
 * route or response-shape change only needs updating here and in
 * `models.ts` (design D16).
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly api = inject(ApiService);

  devices(): Promise<Device[]> {
    return this.api.request<Device[]>('/api/devices');
  }

  revokeDevice(id: string): Promise<{ revoked: boolean }> {
    return this.api.request<{ revoked: boolean }>('/api/devices/' + id, 'DELETE');
  }

  jobs(): Promise<Job[]> {
    return this.api.request<Job[]>('/api/jobs');
  }

  designs(): Promise<Design[]> {
    return this.api.request<Design[]>('/api/designs');
  }

  design(id: string): Promise<DesignDetail> {
    return this.api.request<DesignDetail>('/api/designs/' + id);
  }

  designMesh(id: string): Promise<ArrayBuffer> {
    return this.api.requestArrayBuffer('/api/designs/' + id + '/mesh');
  }

  createBoxJob(payload: CreateBoxPayload): Promise<{ id: string }> {
    return this.api.request<{ id: string }>('/api/jobs', 'POST', payload);
  }
}
