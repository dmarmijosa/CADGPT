import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { relativeTime } from '../devices/devices';
import { TranslatePipe } from '../../core/i18n';

const POLL_INTERVAL_MS = 10_000;
const RESULT_PREVIEW_LENGTH = 140;

/** Human label for a job's `type` discriminator, e.g. `boolean_cut` -> "Boolean cut". */
export function jobTypeLabel(type: string): string {
  const words = type.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The agent posts `result` as a JSON string `{ message, scene? }` when a
 * scene exists (`apps/api/src/tools.ts`'s `parseJobResult` does the same
 * parse for the MCP `get_job` response). Parsed the same defensive way here:
 * invalid JSON, or JSON without a string `message`, falls back to the raw
 * text. `scene` is never rendered here — this page only shows a short human
 * summary, truncated for the table cell with the full text kept for `title`.
 */
export interface JobResultSummary {
  text: string;
  full: string;
}

export function jobResultSummary(raw: string | null | undefined): JobResultSummary {
  if (!raw) return { text: '', full: '' };
  let text = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string') text = message;
    }
  } catch {
    // Not JSON — render the raw text as-is.
  }
  return text.length > RESULT_PREVIEW_LENGTH
    ? { text: text.slice(0, RESULT_PREVIEW_LENGTH) + '…', full: text }
    : { text, full: text };
}

/**
 * Guarded jobs history (design D16, spec dashboard-routing / job-lifecycle).
 * Renders `WorkspaceStore.jobs` as-is: each row shows its type, status,
 * owning device, linked document (when any), and a short result summary.
 * Polls `jobs.reload()` every 10s only while at least one job is still
 * `queued`/`running` — a page with only finished jobs never keeps a timer
 * alive, and the timer is always cleared on destroy.
 */
@Component({
  selector: 'app-jobs-page',
  imports: [RouterLink, DatePipe, TranslatePipe],
  templateUrl: './jobs.html',
})
export class JobsPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly typeLabel = jobTypeLabel;
  readonly resultSummary = jobResultSummary;

  readonly hasActiveJobs = computed(
    () =>
      this.workspace.jobs.hasValue() &&
      this.workspace.jobs.value().some((j) => j.status === 'queued' || j.status === 'running'),
  );

  constructor() {
    effect(() => {
      if (this.hasActiveJobs()) {
        this.timer ??= setInterval(() => this.workspace.jobs.reload(), POLL_INTERVAL_MS);
      } else if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.timer) clearInterval(this.timer);
    });
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not connect. Try again.';
  }

  relativeCreated(created: number): string {
    return relativeTime(Date.now() - created);
  }

  deviceName(deviceId: string): string {
    const devices = this.workspace.devices;
    const match = devices.hasValue() ? devices.value().find((d) => d.id === deviceId) : undefined;
    return match?.name ?? deviceId.slice(0, 8);
  }

  designLabel(documentId: string): string {
    const designs = this.workspace.designs;
    const match = designs.hasValue() ? designs.value().find((d) => d.id === documentId) : undefined;
    return match?.name ?? documentId.slice(0, 8);
  }
}
