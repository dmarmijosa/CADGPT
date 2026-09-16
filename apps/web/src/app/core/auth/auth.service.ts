import { Injectable, computed, signal } from '@angular/core';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { z } from 'zod';
import { environment } from '../../../environments/environment';

const RETURN_URL_KEY = 'cadgpt:returnUrl';
const CONSENT_KEY_PREFIX = 'cadgpt:consent:v1:';

const authConfigSchema = z.object({
  issuer: z.string().min(1),
  clientId: z.string().min(1),
  scopes: z.string(),
});

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

  private readonly consentRevision = signal(0);

  /** Reactive signal indicating whether the currently authenticated user has accepted data treatment consent. */
  readonly hasConsent = computed<boolean>(() => {
    this.consentRevision();
    const sub = this.subOf(this.user());
    if (!sub) return false;
    return localStorage.getItem(`${CONSENT_KEY_PREFIX}${sub}`) !== null;
  });

  /** Checks consent for a specific OIDC sub without requiring it to be active in `user()`. */
  hasConsentFor(sub: string): boolean {
    this.consentRevision();
    return localStorage.getItem(`${CONSENT_KEY_PREFIX}${sub}`) !== null;
  }

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

  /**
   * Records GDPR/ISO data treatment consent for the active user (or explicit sub)
   * with an ISO 8601 timestamp under 'cadgpt:consent:v1:<sub_or_version>'.
   */
  recordConsent(explicitSub?: string): void {
    const sub = explicitSub ?? this.subOf(this.user());
    if (!sub) return;
    localStorage.setItem(`${CONSENT_KEY_PREFIX}${sub}`, new Date().toISOString());
    this.consentRevision.update((v) => v + 1);
  }

  /**
   * Clears GDPR/ISO data treatment consent for the active user (or explicit sub).
   */
  clearConsent(explicitSub?: string): void {
    const sub = explicitSub ?? this.subOf(this.user());
    if (!sub) return;
    localStorage.removeItem(`${CONSENT_KEY_PREFIX}${sub}`);
    this.consentRevision.update((v) => v + 1);
  }

  private subOf(user: User | null): string | undefined {
    return user?.profile.sub;
  }

  private async init(): Promise<void> {
    const response = await fetch(environment.apiBaseUrl + '/api/config');
    if (!response.ok) {
      throw new Error(`Failed to load auth config: HTTP ${response.status}`);
    }
    const raw: unknown = await response.json();
    const config = authConfigSchema.parse(raw);
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
      if (user) {
        if (user.expired) {
          void this.logout();
        } else {
          this.user.set(user);
        }
      }
    }
  }
}
