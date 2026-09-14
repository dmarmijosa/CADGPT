import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

/** Pairing-code approval (guarded — requires a signed-in owner). */
@Component({
  selector: 'app-pair-page',
  imports: [FormField],
  templateUrl: './pair.html',
})
export class PairPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly model = signal({ code: '' });
  readonly fields = form(this.model, (p) => maxLength(p.code, 12));

  async approve(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      // `/api/pairings/approve` currently returns only `{ approved: true }`
      // (no device id), so this always navigates to plain `/connect` — if a
      // future response carries `deviceId`, pass it as `?device=<id>` here.
      await this.api.request('/api/pairings/approve', 'POST', {
        userCode: this.model().code.trim(),
      });
      await this.router.navigateByUrl('/connect');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
