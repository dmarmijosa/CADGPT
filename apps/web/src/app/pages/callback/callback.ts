import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

type CallbackState = 'pending' | 'error';

/**
 * Public OIDC redirect target. Completes the sign-in and resumes the URL
 * `authGuard` stored before redirecting (design "Web Architecture").
 *
 * `completeSignIn()` can reject — the authorization code was already
 * consumed by an earlier render, the visitor double-backed here, the state
 * cookie expired — and this page must never hang on "Signing you in…" when
 * that happens. On a rejection it re-checks for a live session directly
 * against the OIDC store (not `user()`, which `AuthService.init()` never
 * populates while on `/callback`): if one exists, the sign-in already
 * succeeded in every way that matters, so it resumes the stored return URL
 * instead of reporting an error the visitor did nothing to cause. Only a
 * genuine failure — no session either way — renders the error state.
 */
@Component({
  selector: 'app-callback-page',
  imports: [RouterLink],
  templateUrl: './callback.html',
})
export class CallbackPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Drives the template; exposed as a signal so the states are testable. */
  readonly state = signal<CallbackState>('pending');

  /** Exposed so tests can await the full resolve sequence. */
  readonly done: Promise<void>;

  constructor() {
    this.done = this.resolve();
  }

  /** "Try again" from the error state: re-run the OIDC redirect from scratch. */
  retry(): void {
    this.auth.login('/designs');
  }

  private async resolve(): Promise<void> {
    try {
      const returnUrl = await this.auth.completeSignIn();
      await this.router.navigateByUrl(returnUrl);
    } catch {
      const existingUser = await this.auth.currentUser();
      if (existingUser) {
        await this.router.navigateByUrl(this.auth.consumeReturnUrl('/designs'));
        return;
      }
      this.state.set('error');
    }
  }
}
