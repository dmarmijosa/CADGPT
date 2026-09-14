import { Injectable, computed, signal } from '@angular/core';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { environment } from '../../../environments/environment';

const RETURN_URL_KEY = 'cadgpt:returnUrl';

/**
 * Wraps `UserManager` (oidc-client-ts) with signals for the current user and
 * bearer token, plus an async `ready()` gate the auth guard awaits before
 * checking a session. OIDC settings always come from the runtime
 * `/api/config` endpoint — never from a compiled environment file.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly token = computed(() => this.user()?.access_token ?? '');

  private manager?: UserManager;
  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
  }

  /** Resolves once `/api/config` loaded and, outside `/callback`, an existing session was checked. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Stores the requested URL, then hands off to the identity provider. */
  login(returnUrl: string): void {
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
    void this.manager?.signinRedirect();
  }

  /** Completes the OIDC redirect callback and returns the URL to resume. */
  async completeSignIn(): Promise<string> {
    await this.readyPromise;
    const user = await this.manager!.signinRedirectCallback();
    this.user.set(user);
    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY) ?? '/';
    sessionStorage.removeItem(RETURN_URL_KEY);
    return returnUrl;
  }

  async logout(): Promise<void> {
    await this.manager?.signoutRedirect();
  }

  private async init(): Promise<void> {
    const response = await fetch(environment.apiBaseUrl + '/api/config');
    const config = (await response.json()) as { issuer: string; clientId: string; scopes: string };
    this.manager = new UserManager({
      authority: config.issuer,
      client_id: config.clientId,
      redirect_uri: location.origin + '/callback',
      post_logout_redirect_uri: location.origin,
      response_type: 'code',
      scope: config.scopes,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: false,
      loadUserInfo: false,
    });
    if (location.pathname !== '/callback') {
      const user = await this.manager.getUser();
      if (user && !user.expired) this.user.set(user);
    }
  }
}
