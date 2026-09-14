import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';

export interface Job {
  id: string;
  status: string;
  result: string;
}

/** Guarded recent-jobs list (ported from phase 1); document links land in slice 11. */
@Component({
  selector: 'app-jobs-page',
  templateUrl: './jobs.html',
})
export class JobsPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly jobs = signal<Job[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.jobs.set(await this.api.request<Job[]>('/api/jobs'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
