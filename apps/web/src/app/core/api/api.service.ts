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
}
