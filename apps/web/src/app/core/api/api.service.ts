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
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'Session expired. Sign out and sign in again.'
          : ((data as { error?: string }).error ?? 'Request failed.'),
      );
    return data as T;
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
      if (response.status === 401) throw new Error('Session expired. Sign out and sign in again.');
      const data = await response.json().catch(() => undefined);
      throw new Error((data as { error?: string } | undefined)?.error ?? 'Request failed.');
    }
    return response.arrayBuffer();
  }
}
