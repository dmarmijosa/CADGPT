import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/** App shell: header, persistent left rail nav, `<router-outlet>`, footer. */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly consentAccepted = signal(false);
  readonly isDismissed = signal(false);

  readonly isConsentRequired = computed(() => {
    if (this.isDismissed()) return false;
    const user = this.auth.user();
    if (!user) return false;
    return !this.auth.hasConsent();
  });

  signIn(): void {
    this.auth.login(this.router.url);
  }

  signOut(): void {
    void this.auth.logout();
  }

  onConsentCheckChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.consentAccepted.set(Boolean(target?.checked));
  }

  acceptConsent(): void {
    if (!this.consentAccepted()) return;
    this.auth.recordConsent();
    this.consentAccepted.set(false);
    this.isDismissed.set(true);
  }
}
