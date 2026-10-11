import { TestBed } from '@angular/core/testing';
import { User, UserManager } from 'oidc-client-ts';
import { AuthService } from './auth.service';
import { notifyParentIfSilentCallback } from './silent-callback';

const liveUser = () =>
  ({ expired: false, access_token: 'token', profile: { sub: 'ada' } }) as unknown as User;

function stubConfig() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          issuer: 'http://localhost:8080/auth/realms/cadgpt',
          clientId: 'cadgpt-web',
          scopes: 'openid cad:read cad:write',
        }),
    } as unknown as Response),
  );
}

async function createService() {
  TestBed.configureTestingModule({ providers: [AuthService] });
  const service = TestBed.inject(AuthService);
  await service.ready();
  return service;
}

describe('AuthService session sharing across tabs', () => {
  beforeEach(() => {
    sessionStorage.clear();
    stubConfig();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps tokens in per-tab sessionStorage and renews them automatically', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(liveUser());
    const service = await createService();
    const settings = (service as unknown as { manager: UserManager }).manager.settings;
    expect(settings.automaticSilentRenew).toBe(true);
    expect(settings.silent_redirect_uri).toBe(location.origin + '/callback');
    expect(settings.silentRequestTimeoutInSeconds).toBe(5);
    expect((settings.userStore as unknown as { _store: Storage })._store).toBe(
      window.sessionStorage,
    );
  });

  it('a new tab without tokens reuses the SSO session through a silent sign-in', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(null);
    const silent = vi.spyOn(UserManager.prototype, 'signinSilent').mockResolvedValue(liveUser());
    const service = await createService();
    expect(silent).toHaveBeenCalledTimes(1);
    expect(service.user()?.profile.sub).toBe('ada');
    expect(service.token()).toBe('token');
  });

  it('stays anonymous when there is no SSO session', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(null);
    vi.spyOn(UserManager.prototype, 'signinSilent').mockRejectedValue(new Error('login_required'));
    const service = await createService();
    expect(service.user()).toBeNull();
  });

  it('does not run a silent sign-in when the tab already has a live session', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(liveUser());
    const silent = vi.spyOn(UserManager.prototype, 'signinSilent');
    const service = await createService();
    expect(silent).not.toHaveBeenCalled();
    expect(service.user()).not.toBeNull();
  });

  it('replaces stale tokens with a silent sign-in instead of redirecting', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue({
      ...liveUser(),
      expired: true,
    } as unknown as User);
    const remove = vi.spyOn(UserManager.prototype, 'removeUser').mockResolvedValue();
    const redirect = vi.spyOn(UserManager.prototype, 'signoutRedirect').mockResolvedValue();
    vi.spyOn(UserManager.prototype, 'signinSilent').mockResolvedValue(liveUser());
    const service = await createService();
    expect(remove).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(service.user()?.expired).toBe(false);
  });

  it('skips the silent sign-in after this tab signed out', async () => {
    sessionStorage.setItem('cadgpt:signedOut', '1');
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(null);
    const silent = vi.spyOn(UserManager.prototype, 'signinSilent');
    await createService();
    expect(silent).not.toHaveBeenCalled();
  });

  it('logout tells the other tabs, and a logout from another tab clears this one', async () => {
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(liveUser());
    vi.spyOn(UserManager.prototype, 'signoutRedirect').mockResolvedValue();
    const remove = vi.spyOn(UserManager.prototype, 'removeUser').mockResolvedValue();
    const service = await createService();

    const otherTab = new BroadcastChannel('cadgpt:auth');
    const received = new Promise<unknown>((resolve) => {
      otherTab.onmessage = (event) => resolve(event.data);
    });
    await service.logout();
    expect(await received).toBe('logout');
    expect(sessionStorage.getItem('cadgpt:signedOut')).toBe('1');

    // Now simulate the reverse: this tab is signed in and another tab logs out.
    sessionStorage.clear();
    service.user.set(liveUser());
    otherTab.postMessage('logout');
    await vi.waitFor(() => expect(service.user()).toBeNull());
    expect(remove).toHaveBeenCalled();
    expect(sessionStorage.getItem('cadgpt:signedOut')).toBe('1');
    otherTab.close();
  });

  it('a sign-in in another tab triggers a silent sign-in here', async () => {
    sessionStorage.setItem('cadgpt:signedOut', '1');
    vi.spyOn(UserManager.prototype, 'getUser').mockResolvedValue(null);
    const silent = vi.spyOn(UserManager.prototype, 'signinSilent').mockResolvedValue(liveUser());
    const service = await createService();
    expect(silent).not.toHaveBeenCalled();

    const otherTab = new BroadcastChannel('cadgpt:auth');
    otherTab.postMessage('login');
    await vi.waitFor(() => expect(service.user()).not.toBeNull());
    expect(sessionStorage.getItem('cadgpt:signedOut')).toBeNull();
    otherTab.close();
  });
});

describe('notifyParentIfSilentCallback', () => {
  const fakeWindow = (pathname: string, framed: boolean) => {
    const parent = { postMessage: vi.fn() };
    const win = {
      location: {
        pathname,
        href: `https://cad.example${pathname}?code=abc&state=xyz`,
        origin: 'https://cad.example',
      },
    } as unknown as Window & { parent: typeof parent };
    (win as unknown as { parent: unknown }).parent = framed ? parent : win;
    return { win, parent };
  };

  it('posts the oidc-client message to its own origin from the hidden iframe', () => {
    const { win, parent } = fakeWindow('/callback', true);
    expect(notifyParentIfSilentCallback(win)).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        source: 'oidc-client',
        url: 'https://cad.example/callback?code=abc&state=xyz',
        keepOpen: false,
      },
      'https://cad.example',
    );
  });

  it('lets the app boot normally for a top-level callback or any other framed page', () => {
    expect(notifyParentIfSilentCallback(fakeWindow('/callback', false).win)).toBe(false);
    const other = fakeWindow('/designs', true);
    expect(notifyParentIfSilentCallback(other.win)).toBe(false);
    expect(other.parent.postMessage).not.toHaveBeenCalled();
  });
});
