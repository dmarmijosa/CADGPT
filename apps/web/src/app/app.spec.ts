import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';

describe('App', () => {
  it('renders the shell — header, primary nav, and router outlet', () => {
    const fakeAuth = {
      user: () => null,
      ready: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth }, provideRouter([])],
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('app-shell')).toBeTruthy();
    expect(root.querySelector('header')).toBeTruthy();
    expect(root.querySelector('nav[aria-label="Primary"]')).toBeTruthy();
  });
});
