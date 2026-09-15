import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { Shell } from './shell';

describe('Shell (header, left rail nav, and footer)', () => {
  it('renders the primary nav and marks the active link on /devices', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const rail = shellElement.querySelector('nav[aria-label="Primary"]');
    expect(rail).toBeTruthy();

    const active = rail!.querySelector('a[aria-current="page"]');
    expect(active?.textContent?.trim()).toBe('Devices');

    // Brand and version tag
    const brand = shellElement.querySelector('.brand');
    expect(brand?.textContent?.trim()).toContain('CAD Agent Designer');
    const versionTag = shellElement.querySelector('.version-tag');
    expect(versionTag?.textContent?.trim()).toBe('alpha');

    // Daemon status indicator
    const statusIndicator = shellElement.querySelector('.status-indicator');
    expect(statusIndicator?.textContent?.trim()).toContain('Daemon Online');

    // Authenticated user in header
    const userBadge = shellElement.querySelector('.user-name');
    expect(userBadge?.textContent?.trim()).toBe('ada');

    // Footer
    const footer = shellElement.querySelector('footer');
    expect(footer?.textContent).toContain('CAD Agent Designer');
    expect(footer?.textContent).toContain('AutoCAD Core Console parity');
  });

  it('renders sign in button when unauthenticated', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => null,
      token: () => null,
      login: vi.fn(),
      logout: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/about');

    const shellElement = harness.routeNativeElement!;
    const signInBtn = shellElement.querySelector('nav[aria-label="Account"] button');
    expect(signInBtn?.textContent?.trim()).toBe('Sign in');
  });
});
