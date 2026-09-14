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
});
