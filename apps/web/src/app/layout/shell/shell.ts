import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService, TranslatePipe } from '../../core/i18n';

/** App shell: header, persistent left rail nav, `<router-outlet>`, footer. */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  readonly currentUrl = signal(this.router.url);
  readonly isHome = computed(() => {
    const url = this.currentUrl();
    return url === '/' || url === '' || url.startsWith('/?');
  });

  readonly consentAccepted = signal(false);
  readonly isDismissed = signal(false);
  readonly isReviewingConsent = signal(false);

  readonly isConsentRequired = computed(() => {
    if (this.isDismissed()) return false;
    const user = this.auth.user();
    if (!user) return false;
    return !this.auth.hasConsent();
  });

  readonly showConsentSheet = computed(() => this.isConsentRequired() || this.isReviewingConsent());
  readonly isConsentVisible = this.showConsentSheet;

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  signIn(): void {
    this.auth.login(this.router.url);
  }

  signOut(): void {
    void this.auth.logout();
  }

  openConsentReview(): void {
    this.isReviewingConsent.set(true);
  }

  closeConsentReview(): void {
    this.isReviewingConsent.set(false);
  }

  onBackdropClick(): void {
    if (this.isReviewingConsent()) {
      this.closeConsentReview();
    }
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
    this.isReviewingConsent.set(false);
  }
}
