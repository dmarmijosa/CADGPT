import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

/** Small bearer-token JSON client shared by the dashboard pages. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);

  async request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(environment.apiBaseUrl + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.auth.token() ? { Authorization: 'Bearer ' + this.auth.token() } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      if (response.status === 401) {
        void this.auth.logout();
        throw new Error('Session expired. Signing out...');
      }
      const errData = await response.json().catch(() => undefined);
      throw new Error(
        (errData as { error?: string } | undefined)?.error ??
          `Request failed: HTTP ${response.status}`,
      );
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }
    const data = await response.json();
    return data as T;
  }

  async requestVoid(url: string, method = 'DELETE', body?: unknown): Promise<void> {
    await this.request<void>(url, method, body);
  }

  /** Bearer-authenticated binary fetch (used for `GET /api/designs/:id/mesh`,
   * which requires an owner token that a plain `<img>`/loader URL can never
   * attach). Errors are surfaced the same way as `request()`. */
  async requestArrayBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(environment.apiBaseUrl + url, {
      headers: {
        ...(this.auth.token() ? { Authorization: 'Bearer ' + this.auth.token() } : {}),
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        void this.auth.logout();
        throw new Error('Session expired. Signing out...');
      }
      const data = await response.json().catch(() => undefined);
      throw new Error((data as { error?: string } | undefined)?.error ?? 'Request failed.');
    }
    return response.arrayBuffer();
  }
}
