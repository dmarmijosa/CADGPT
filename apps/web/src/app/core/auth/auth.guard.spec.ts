import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Component({ selector: 'app-protected-stub', template: 'protected content' })
class ProtectedStub {}

describe('authGuard', () => {
  it('redirects to sign-in before rendering when no session is active (spec: Unauthenticated redirect)', async () => {
    const login = vi.fn();
    const fakeAuth = { ready: () => Promise.resolve(), user: () => null, login };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([
          { path: 'designs/:id', canActivate: [authGuard], component: ProtectedStub },
        ]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designs/abc-123');

    expect(login).toHaveBeenCalledWith('/designs/abc-123');
    expect(harness.routeNativeElement).toBeNull();
  });

  it('lets the navigation through when a session is active', async () => {
    const login = vi.fn();
    const fakeAuth = { ready: () => Promise.resolve(), user: () => ({ profile: {} }), login };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([
          { path: 'designs/:id', canActivate: [authGuard], component: ProtectedStub },
        ]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designs/abc-123');

    expect(login).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain('protected content');
  });
});
