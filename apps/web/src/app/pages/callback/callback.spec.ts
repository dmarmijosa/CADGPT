import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CallbackPage } from './callback';

describe('CallbackPage', () => {
  it('completes sign-in and navigates to the stored return URL', async () => {
    const completeSignIn = vi.fn().mockResolvedValue('/devices');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { completeSignIn } },
        provideRouter([{ path: 'devices', children: [] }]),
      ],
    });

    const fixture = TestBed.createComponent(CallbackPage);
    fixture.detectChanges();
    await fixture.componentInstance.done;

    expect(completeSignIn).toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/devices');
  });

  it('renders a clear error state with a way out when sign-in fails and no session exists', async () => {
    const completeSignIn = vi.fn().mockRejectedValue(new Error('code already redeemed'));
    const currentUser = vi.fn().mockResolvedValue(null);
    const login = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { completeSignIn, currentUser, login, user: () => null },
        },
        provideRouter([{ path: '', children: [] }]),
      ],
    });

    const fixture = TestBed.createComponent(CallbackPage);
    fixture.detectChanges();
    await fixture.componentInstance.done;
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role="status"]')).toBeNull();
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("We couldn't finish signing you in.");

    const retryButton = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Try again',
    );
    const backLink = Array.from(root.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Back to home',
    );
    expect(retryButton).toBeTruthy();
    expect(backLink).toBeTruthy();

    retryButton!.click();
    expect(login).toHaveBeenCalledWith('/designs');
  });

  it('navigates instead of erroring when completeSignIn fails but a live session already exists', async () => {
    const completeSignIn = vi.fn().mockRejectedValue(new Error('code already redeemed'));
    const currentUser = vi.fn().mockResolvedValue({ profile: {}, expired: false });
    const consumeReturnUrl = vi.fn().mockReturnValue('/designs');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { completeSignIn, currentUser, consumeReturnUrl, user: () => null },
        },
        provideRouter([{ path: 'designs', children: [] }]),
      ],
    });

    const fixture = TestBed.createComponent(CallbackPage);
    fixture.detectChanges();
    await fixture.componentInstance.done;

    expect(currentUser).toHaveBeenCalled();
    expect(consumeReturnUrl).toHaveBeenCalledWith('/designs');
    expect(TestBed.inject(Router).url).toBe('/designs');

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });
});
