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

  /**
   * Stores the requested URL, then hands off to the identity provider — but
   * only when there isn't already a live session. Every call site is now
   * auth-reactive (it only offers "Sign in" while `user()` is null), so this
   * guard is a backstop: `login()` itself never fires a pointless second
   * `signinRedirect` for an authenticated visitor.
   */
  login(returnUrl: string): void {
    const current = this.user();
    if (current && !current.expired) return;
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
    void this.manager?.signinRedirect();
  }

  /** Completes the OIDC redirect callback and returns the URL to resume. */
  async completeSignIn(): Promise<string> {
    await this.readyPromise;
    const user = await this.manager!.signinRedirectCallback();
    this.user.set(user);
    return this.consumeReturnUrl('/');
  }

  /**
   * Re-checks for a live session directly against the OIDC user store
   * (bypassing `user()`, which `init()` never populates while on
   * `/callback`) so a failed `completeSignIn()` — e.g. a redirect code
   * already consumed by an earlier render of the callback page — can tell an
   * already-signed-in visitor apart from one who genuinely has no session.
   */
  async currentUser(): Promise<User | null> {
    await this.readyPromise;
    const user = (await this.manager?.getUser()) ?? null;
    if (user && !user.expired) {
      this.user.set(user);
      return user;
    }
    return null;
  }

  /** Reads and clears the URL stashed by `login()`, defaulting when absent. */
  consumeReturnUrl(fallback: string): string {
    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY) ?? fallback;
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
