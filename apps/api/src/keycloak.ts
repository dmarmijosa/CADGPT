import { z } from 'zod';
import { DomainError } from './store.js';

const tokenResponseSchema = z
  .object({
    access_token: z.string().optional(),
  })
  .passthrough();

export interface KeycloakAdminOptions {
  baseUrl?: string;
  realm?: string;
  adminRealm?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  fetchFn?: typeof fetch;
  /** Mock mode for local tests or environments where Keycloak admin is stubbed */
  mock?: boolean;
}

export class KeycloakAdminService {
  private baseUrl: string;
  private realm: string;
  private adminRealm: string;
  private clientId: string;
  private clientSecret?: string;
  private username?: string;
  private password?: string;
  private fetchFn: typeof fetch;
  private mock: boolean;

  constructor(options: KeycloakAdminOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:8080').replace(/\/+$/, '');
    this.realm = options.realm ?? 'cadgpt';
    this.adminRealm = options.adminRealm ?? 'master';
    this.clientId = options.clientId ?? 'admin-cli';
    this.clientSecret = options.clientSecret;
    this.username = options.username;
    this.password = options.password;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.mock = options.mock ?? false;
  }

  async getAdminToken(): Promise<string | null> {
    if (this.mock) return 'mock-admin-token';
    if (!this.username && !this.clientSecret) {
      return null;
    }
    try {
      const tokenUrl = `${this.baseUrl}/realms/${this.adminRealm}/protocol/openid-connect/token`;
      const body = new URLSearchParams();
      if (this.clientSecret) {
        body.append('grant_type', 'client_credentials');
        body.append('client_id', this.clientId);
        body.append('client_secret', this.clientSecret);
      } else if (this.username && this.password) {
        body.append('grant_type', 'password');
        body.append('client_id', this.clientId);
        body.append('username', this.username);
        body.append('password', this.password);
      }
      const res = await this.fetchFn(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        throw new DomainError(502, 'Keycloak admin authentication failed.');
      }
      const data = tokenResponseSchema.parse(await res.json());
      return data.access_token ?? null;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(502, 'Keycloak admin authentication failed.');
    }
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.mock) {
      return;
    }
    try {
      const headers: Record<string, string> = {};
      const token = await this.getAdminToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const userUrl = `${this.baseUrl}/admin/realms/${this.realm}/users/${encodeURIComponent(userId)}`;
      const res = await this.fetchFn(userUrl, {
        method: 'DELETE',
        headers,
      });
      if (res.status === 204 || res.status === 200 || res.status === 404) {
        return;
      }
      // On 5xx, or unexpected non-success HTTP status
      throw new DomainError(502, 'Keycloak user deletion failed.');
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(502, 'Keycloak user deletion failed.');
    }
  }
}
