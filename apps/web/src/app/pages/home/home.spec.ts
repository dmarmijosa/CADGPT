import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HomePage } from './home';

describe('HomePage (spec dashboard-routing: public route)', () => {
  it('renders for an unauthenticated visitor with a sign-in CTA and a download link', () => {
    const fakeAuth = { user: () => null, login: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth }, provideRouter([])],
    });

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')).toBeTruthy();

    const signInButton = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Sign in',
    );
    expect(signInButton).toBeTruthy();
    signInButton!.click();
    expect(fakeAuth.login).toHaveBeenCalledWith('/designs');

    const download = Array.from(root.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.includes('github.com/dmarmijosa/CADGPT/releases'),
    );
    expect(download).toBeTruthy();
  });
});
