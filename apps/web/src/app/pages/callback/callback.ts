import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Public OIDC redirect target. Completes the sign-in and resumes the URL
 * `authGuard` stored before redirecting (design "Web Architecture").
 */
@Component({
  selector: 'app-callback-page',
  template: `<p role="status">Signing you in…</p>`,
})
export class CallbackPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Exposed so tests can await the sign-in + navigation sequence. */
  readonly done: Promise<boolean>;

  constructor() {
    this.done = this.auth
      .completeSignIn()
      .then((returnUrl) => this.router.navigateByUrl(returnUrl));
  }
}
