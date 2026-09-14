import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Design, Device, Job } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { JobResultSummary, JobsPage, jobResultSummary, jobTypeLabel } from './jobs';

function fakeResource<T>(value: T, opts: { isLoading?: boolean; error?: unknown } = {}) {
  return {
    value: () => value,
    hasValue: () => value !== undefined,
    isLoading: () => opts.isLoading ?? false,
    error: () => opts.error,
    reload: vi.fn(),
  };
}

const devices: Device[] = [
  { id: 'dev-1', name: 'Workstation', online: true, revoked: false, lastSeen: 1, cads: [] },
];

const designs: Design[] = [
  {
    id: 'doc-1',
    name: 'Bracket',
    cadKind: 'FreeCAD',
    deviceId: 'dev-1',
    created: 1,
    updated: 2,
    latestJobId: 'job-1',
    hasMesh: false,
  },
];

const jobs: Job[] = [
  {
    id: 'job-1',
    deviceId: 'dev-1',
    status: 'queued',
    created: Date.now(),
    result: '',
    type: 'create_box',
    documentId: null,
  },
  {
    id: 'job-2',
    deviceId: 'dev-1',
    status: 'running',
    created: Date.now(),
    result: '',
    type: 'boolean_cut',
    documentId: 'doc-1',
  },
  {
    id: 'job-3',
    deviceId: 'dev-1',
    status: 'succeeded',
    created: Date.now(),
    result: JSON.stringify({ message: 'Created box.', scene: [{ name: 'Box' }] }),
    type: 'create_box',
    documentId: 'doc-1',
  },
  {
    id: 'job-4',
    deviceId: 'dev-1',
    status: 'failed',
    created: Date.now(),
    result: 'Worker crashed.',
    type: 'translate_object',
    documentId: null,
  },
];

function setup(jobsValue: Job[], opts: { isLoading?: boolean; error?: unknown } = {}) {
  const workspace = {
    jobs: fakeResource(jobsValue, opts),
    devices: fakeResource(devices),
    designs: fakeResource(designs),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceStore, useValue: workspace }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(JobsPage);
  fixture.detectChanges();
  TestBed.tick(); // flushes the constructor `effect()` synchronously for the test
  return { fixture, workspace, root: fixture.nativeElement as HTMLElement };
}

describe('jobTypeLabel', () => {
  it('turns a snake_case op into a capitalized human label', () => {
    expect(jobTypeLabel('boolean_cut')).toBe('Boolean cut');
    expect(jobTypeLabel('create_box')).toBe('Create box');
  });
});

describe('jobResultSummary', () => {
  it('extracts only message from a JSON {message, scene} payload, never the scene', () => {
    const summary: JobResultSummary = jobResultSummary(
      JSON.stringify({ message: 'Created box.', scene: [{ name: 'Box' }] }),
    );
    expect(summary.text).toBe('Created box.');
    expect(summary.full).toBe('Created box.');
    expect(summary.text).not.toContain('scene');
    expect(summary.text).not.toContain('Box"');
  });

  it('renders plain text as-is when the result is not JSON', () => {
    expect(jobResultSummary('Worker crashed.')).toEqual({
      text: 'Worker crashed.',
      full: 'Worker crashed.',
    });
  });

  it('truncates a long message for the cell but keeps the full text', () => {
    const long = 'x'.repeat(200);
    const summary = jobResultSummary(long);
    expect(summary.text.length).toBeLessThan(long.length);
    expect(summary.full).toBe(long);
  });

  it('returns empty strings for a missing result', () => {
    expect(jobResultSummary('')).toEqual({ text: '', full: '' });
  });
});

describe('JobsPage (spec dashboard-routing / job-lifecycle)', () => {
  it('renders one row per job with a status class, type label, and document link only when documentId is present', () => {
    const { root } = setup(jobs);

    expect(root.querySelectorAll('tbody tr').length).toBe(jobs.length);
    for (const job of jobs) {
      expect(root.querySelector('.status.' + job.status)).toBeTruthy();
    }
    expect(root.textContent).toContain('Boolean cut');
    expect(root.textContent).toContain('Create box');

    const links = Array.from(root.querySelectorAll('a[href^="/designs/"]')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/designs/doc-1', '/designs/doc-1']);
  });

  it('shows only the message from a JSON {message, scene} result, never the scene', () => {
    const { root } = setup(jobs);
    expect(root.textContent).toContain('Created box.');
    expect(root.textContent).not.toContain('"scene"');
  });

  it('shows the loading state before any value has loaded', () => {
    const { root } = setup(undefined as unknown as Job[], { isLoading: true });
    expect(root.textContent).toContain('Loading jobs');
  });

  it('shows the empty state when there are no jobs', () => {
    const { root } = setup([]);
    expect(root.textContent).toContain('No jobs yet');
  });

  it('surfaces a resource error', () => {
    const { root } = setup([], { error: new Error('Could not connect. Try again.') });
    expect(root.querySelector('.message.error')?.textContent).toContain('Could not connect');
  });
});

describe('JobsPage auto-refresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls every 10s only while a job is queued or running', () => {
    const { fixture, workspace } = setup([jobs[0]]);
    vi.advanceTimersByTime(30_000);
    expect(workspace.jobs.reload).toHaveBeenCalledTimes(3);
    fixture.destroy();
  });

  it('never starts a timer when no job is active', () => {
    const { fixture, workspace } = setup([jobs[2], jobs[3]]);
    vi.advanceTimersByTime(30_000);
    expect(workspace.jobs.reload).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('clears the timer on destroy', () => {
    const { fixture, workspace } = setup([jobs[0]]);
    fixture.destroy();
    vi.advanceTimersByTime(30_000);
    expect(workspace.jobs.reload).not.toHaveBeenCalled();
  });
});
