import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

describe('app routes (spec dashboard-routing: Lazy route loads on navigation)', () => {
  it('loads the designs feature module only on navigation, not at bootstrap', async () => {
    const designsRoute = routes.find((r) => r.path === 'designs');
    const originalLoader = designsRoute!.loadComponent!;
    const loaderSpy = vi.fn(originalLoader);
    designsRoute!.loadComponent = loaderSpy;

    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: {} }),
      login: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth }, provideRouter(routes)],
    });

    // Importing the route table above must not itself trigger the loader.
    expect(loaderSpy).not.toHaveBeenCalled();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designs');

    expect(loaderSpy).toHaveBeenCalledTimes(1);

    designsRoute!.loadComponent = originalLoader;
  });
});
