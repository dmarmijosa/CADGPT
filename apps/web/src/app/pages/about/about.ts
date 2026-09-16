import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client';

const README_URL = 'https://github.com/dmarmijosa/CADGPT#readme';
const SECURITY_URL = 'https://github.com/dmarmijosa/CADGPT/blob/main/SECURITY.md';

/** Public informational page (spec dashboard-routing: public route). */
@Component({
  selector: 'app-about-page',
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class AboutPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);
  readonly readmeUrl = README_URL;
  readonly securityUrl = SECURITY_URL;

  readonly isDialogOpen = signal(false);
  readonly deleteConfirmationInput = signal('');
  readonly isDeleting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canDelete = computed(
    () => this.deleteConfirmationInput() === 'ELIMINAR' && !this.isDeleting(),
  );

  openDeleteDialog(): void {
    this.deleteConfirmationInput.set('');
    this.errorMessage.set(null);
    this.isDialogOpen.set(true);
  }

  closeDeleteDialog(): void {
    if (this.isDeleting()) return;
    this.deleteConfirmationInput.set('');
    this.errorMessage.set(null);
    this.isDialogOpen.set(false);
  }

  onConfirmationInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.deleteConfirmationInput.set(target.value ?? '');
  }

  async confirmDelete(): Promise<void> {
    if (!this.canDelete()) return;
    this.isDeleting.set(true);
    this.errorMessage.set(null);
    try {
      const user = this.auth.user();
      const sub = user?.profile?.sub;
      await this.api.deleteAccount();
      if (sub) {
        this.auth.clearConsent(sub);
      }
      localStorage.clear();
      sessionStorage.clear();
      await this.auth.logout();
      window.location.href = '/';
    } catch (e) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Error al eliminar la cuenta.');
      this.isDeleting.set(false);
    }
  }
}
