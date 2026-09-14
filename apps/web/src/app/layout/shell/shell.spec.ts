import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { Shell } from './shell';

describe('Shell (left rail nav on an authenticated route)', () => {
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
        // Wrap the real page routes in `Shell` for this test only — in the
        // shipped app, `Shell` is the static root (see `app.ts`), not a
        // routed component, so it is otherwise outside RouterTestingHarness's
        // own bare router-outlet host.
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
  });
});
