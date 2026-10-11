import { Injectable, computed, signal } from '@angular/core';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { z } from 'zod';
import { environment } from '../../../environments/environment';

const RETURN_URL_KEY = 'cadgpt:returnUrl';
const CONSENT_KEY_PREFIX = 'cadgpt:consent:v1:';
/** Cross-tab auth events. Carries only 'login' / 'logout' — never a token. */
const AUTH_CHANNEL = 'cadgpt:auth';
const SILENT_SIGNIN_TIMEOUT_SECONDS = 5;
/**
 * Per-tab marker set on sign-out. While present, page loads skip the silent
 * sign-in, so a tab reloading right after a logout cannot race Keycloak's
 * session teardown and silently sign back in. Cleared by an explicit login.
 */
const SIGNED_OUT_KEY = 'cadgpt:signedOut';
type AuthEvent = 'login' | 'logout';

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
 *
 * Tokens stay in per-tab `sessionStorage` on purpose: they are never written
 * to disk-backed `localStorage`, where any XSS could lift a long-lived
 * refresh token. Tabs share the sign-in through Keycloak's own SSO cookie
 * instead: a tab that starts without tokens runs a silent `prompt=none`
 * sign-in (hidden same-origin iframe), and a `BroadcastChannel` tells other
 * tabs when someone signs in or out. Access tokens are renewed automatically
 * with the refresh token, so a session survives Keycloak's short (5 min)
 * access-token lifetime.
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
  private channel?: BroadcastChannel;
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
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
    void this.manager?.signinRedirect();
  }

  /** Completes the OIDC redirect callback and returns the URL to resume. */
  async completeSignIn(): Promise<string> {
    await this.readyPromise;
    const user = await this.manager!.signinRedirectCallback();
    this.user.set(user);
    this.broadcast('login');
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
    this.user.set(null);
    sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    this.broadcast('logout');
    try {
      await this.manager?.signoutRedirect();
    } catch {
      await this.manager?.removeUser();
      window.location.href = '/';
    }
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

  /**
   * Reuses the Keycloak SSO session from another tab without a login screen.
   * Resolves to null (stay anonymous) when there is no session or the
   * identity provider does not answer in time.
   */
  private async trySilentSignIn(): Promise<User | null> {
    try {
      const user = await this.manager!.signinSilent();
      if (user && !user.expired) {
        this.user.set(user);
        return user;
      }
    } catch {
      // login_required, timeout or blocked iframe: the visitor stays signed out.
    }
    return null;
  }

  private broadcast(event: AuthEvent): void {
    this.channel?.postMessage(event);
  }

  private listenToOtherTabs(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(AUTH_CHANNEL);
    this.channel.onmessage = (message: MessageEvent<AuthEvent>) => {
      if (message.data === 'logout') {
        // Another tab ended the Keycloak session: drop this tab's tokens too.
        this.user.set(null);
        sessionStorage.setItem(SIGNED_OUT_KEY, '1');
        void this.manager?.removeUser();
        if (location.pathname !== '/') location.assign('/');
      } else if (message.data === 'login' && !this.user()) {
        sessionStorage.removeItem(SIGNED_OUT_KEY);
        void this.trySilentSignIn();
      }
    };
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
      // Same, already-registered URI; main.ts answers it inside the iframe.
      silent_redirect_uri: location.origin + '/callback',
      silentRequestTimeoutInSeconds: SILENT_SIGNIN_TIMEOUT_SECONDS,
      post_logout_redirect_uri: location.origin,
      response_type: 'code',
      scope: config.scopes,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
      loadUserInfo: false,
    });

    // Renewal keeps `user()` current; if it fails, or a token still expires,
    // the Keycloak session is gone and this tab signs out.
    this.manager.events.addUserLoaded((user) => this.user.set(user));
    this.manager.events.addAccessTokenExpired(() => {
      void this.logout();
    });
    this.manager.events.addSilentRenewError(() => {
      void this.logout();
    });
    this.listenToOtherTabs();

    if (location.pathname !== '/callback') {
      const user = await this.manager.getUser();
      if (user && !user.expired) {
        this.user.set(user);
      } else {
        if (user) await this.manager.removeUser();
        // New tab (or stale tokens): reuse the SSO session if one exists.
        if (!sessionStorage.getItem(SIGNED_OUT_KEY)) await this.trySilentSignIn();
      }
    }
  }
}
