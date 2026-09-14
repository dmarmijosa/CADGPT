import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

/** Pairing-code approval (guarded — requires a signed-in owner). */
@Component({
  selector: 'app-pair-page',
  imports: [FormField, RouterLink],
  templateUrl: './pair.html',
})
export class PairPage {
  private readonly api = inject(ApiService);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly model = signal({ code: '' });
  readonly fields = form(this.model, (p) => maxLength(p.code, 12));

  async approve(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.request('/api/pairings/approve', 'POST', {
        userCode: this.model().code.trim(),
      });
      this.notice.set('Pairing approved. Keep the agent open, then check Devices.');
      this.model.set({ code: '' });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
