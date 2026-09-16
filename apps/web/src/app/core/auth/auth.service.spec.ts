import { TestBed } from '@angular/core/testing';
import { User } from 'oidc-client-ts';
import { AuthService } from './auth.service';

describe('AuthService (Consent Governance)', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            issuer: 'http://localhost:8080/auth/realms/cadgpt',
            clientId: 'cadgpt-web',
            scopes: 'openid profile email cad:read cad:write',
          }),
      } as unknown as Response),
    );

    TestBed.configureTestingModule({
      providers: [AuthService],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('checks consent and returns false when user has not consented (spec: consent check)', () => {
    // Unauthenticated user
    service.user.set(null);
    expect(service.hasConsent()).toBe(false);

    // Authenticated user without stored consent
    service.user.set({
      profile: { sub: 'user-unconsented' },
    } as unknown as User);
    expect(service.hasConsent()).toBe(false);
  });

  it('records consent with ISO timestamp in localStorage under cadgpt:consent:v1:<sub_or_version> (spec: recording timestamp)', () => {
    service.user.set({
      profile: { sub: 'user-consent-test' },
    } as unknown as User);

    expect(service.hasConsent()).toBe(false);

    const before = Date.now();
    service.recordConsent();
    const after = Date.now();

    expect(service.hasConsent()).toBe(true);

    const stored = localStorage.getItem('cadgpt:consent:v1:user-consent-test');
    expect(stored).toBeTruthy();

    const timestamp = new Date(stored!).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(new Date(stored!).toISOString()).toBe(stored);
  });

  it('bypasses consent for returning users who previously accepted (spec: returning user bypass)', () => {
    const returningSub = 'returning-engineer-sub';
    const priorTimestamp = '2026-08-15T10:30:00.000Z';
    localStorage.setItem(`cadgpt:consent:v1:${returningSub}`, priorTimestamp);

    service.user.set({
      profile: { sub: returningSub },
    } as unknown as User);

    expect(service.hasConsent()).toBe(true);
    expect(localStorage.getItem(`cadgpt:consent:v1:${returningSub}`)).toBe(priorTimestamp);
  });

  it('enforces isolation between different user accounts (spec: isolation between accounts)', () => {
    const userA = 'user-account-a';
    const userB = 'user-account-b';

    // User A logs in and records consent
    service.user.set({
      profile: { sub: userA },
    } as unknown as User);
    service.recordConsent();
    expect(service.hasConsent()).toBe(true);

    // Switch to User B - User B should NOT have consent
    service.user.set({
      profile: { sub: userB },
    } as unknown as User);
    expect(service.hasConsent()).toBe(false);

    // Consent for User A remains intact in storage
    expect(localStorage.getItem(`cadgpt:consent:v1:${userA}`)).toBeTruthy();
    expect(localStorage.getItem(`cadgpt:consent:v1:${userB}`)).toBeNull();

    // User B records consent
    service.recordConsent();
    expect(service.hasConsent()).toBe(true);
    expect(localStorage.getItem(`cadgpt:consent:v1:${userB}`)).toBeTruthy();

    // Explicit sub checks
    expect(service.hasConsentFor(userA)).toBe(true);
    expect(service.hasConsentFor(userB)).toBe(true);
    expect(service.hasConsentFor('user-account-c')).toBe(false);

    // Clear consent for User A only
    service.clearConsent(userA);
    expect(service.hasConsentFor(userA)).toBe(false);
    expect(service.hasConsentFor(userB)).toBe(true);
  });

  it('supports clearing consent for GDPR/Right to Erasure compliance', () => {
    service.user.set({
      profile: { sub: 'user-to-clear' },
    } as unknown as User);
    service.recordConsent();
    expect(service.hasConsent()).toBe(true);

    service.clearConsent();
    expect(service.hasConsent()).toBe(false);
    expect(localStorage.getItem('cadgpt:consent:v1:user-to-clear')).toBeNull();
  });

  it('rejects initialization when auth config endpoint returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response),
    );

    const failingService = new AuthService();
    await expect(failingService.ready()).rejects.toThrow('Failed to load auth config: HTTP 500');
  });

  it('rejects initialization when auth config schema is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ issuer: 123 }),
      } as unknown as Response),
    );

    const failingService = new AuthService();
    await expect(failingService.ready()).rejects.toThrow();
  });
});
