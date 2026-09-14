import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import type { Design } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { DesignsPage } from './designs';

function fakeResource<T>(value: T) {
  return {
    value: () => value,
    hasValue: () => value !== undefined,
    isLoading: () => false,
    error: () => undefined,
    reload: vi.fn(),
  };
}

const designs: Design[] = [
  {
    id: 'doc-1',
    name: 'Bracket',
    cadKind: 'FreeCAD',
    deviceId: 'dev-1',
    created: 1,
    updated: 2,
    latestJobId: 'job-1',
    hasMesh: true,
  },
  {
    id: 'doc-2',
    name: 'Enclosure',
    cadKind: 'FreeCAD',
    deviceId: 'dev-1',
    created: 3,
    updated: 4,
    latestJobId: null,
    hasMesh: false,
  },
];

describe('DesignsPage (spec document-registry: List scoped to owner)', () => {
  it('renders exactly the owner-scoped rows the API returned, with no client-side filtering, and links each to /designs/:id', () => {
    const workspace = { designs: fakeResource(designs), onlineDevices: () => [] };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: workspace },
        { provide: ApiClient, useValue: { createBoxJob: vi.fn() } },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DesignsPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    // The page's only data source is `WorkspaceStore.designs` (the fake
    // above, standing in for the owner-scoped `GET /api/designs`); it never
    // re-filters that array and never reaches for another endpoint, so the
    // rendered rows are exactly what the store returned.
    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(designs.length);

    const links = Array.from(root.querySelectorAll('a[href^="/designs/"]')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      designs.map((d) => '/designs/' + d.id),
    );
    expect(root.textContent).toContain('Bracket');
    expect(root.textContent).toContain('Enclosure');
    expect(root.textContent).toContain('Preview ready');
    expect(root.textContent).toContain('No preview yet');

    fixture.destroy();
  });

  it('shows the empty state and the collapsed create-box panel when there are no designs', () => {
    const workspace = { designs: fakeResource<Design[]>([]), onlineDevices: () => [] };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: workspace },
        { provide: ApiClient, useValue: { createBoxJob: vi.fn() } },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DesignsPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('No designs yet');
    const details = root.querySelector('details.panel') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);

    fixture.destroy();
  });
});

describe('DesignsPage create-box panel', () => {
  it('submits the documented payload and refreshes the workspace on success', async () => {
    const createBoxJob = vi.fn().mockResolvedValue({ id: 'job-9' });
    const refreshAll = vi.fn();
    const workspace = { designs: fakeResource(designs), onlineDevices: () => [], refreshAll };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: workspace },
        { provide: ApiClient, useValue: { createBoxJob } },
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(DesignsPage);
    fixture.detectChanges();

    fixture.componentInstance.model.set({
      deviceId: 'dev-1',
      cadId: 'cad',
      length: 40,
      width: 25,
      height: 10,
      confirmed: true,
    });
    await fixture.componentInstance.createBox();

    expect(createBoxJob).toHaveBeenCalledTimes(1);
    expect(createBoxJob).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      cadId: 'cad',
      length: 40,
      width: 25,
      height: 10,
      confirmed: true,
    });
    expect(refreshAll).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.model().confirmed).toBe(false);
    expect(fixture.componentInstance.notice()).toContain('queued');
  });

  it('surfaces the API error and does not refresh when the job is rejected', async () => {
    const createBoxJob = vi.fn().mockRejectedValue(new Error('No online FreeCAD on that device.'));
    const refreshAll = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStore,
          useValue: { designs: fakeResource(designs), onlineDevices: () => [], refreshAll },
        },
        { provide: ApiClient, useValue: { createBoxJob } },
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(DesignsPage);
    fixture.detectChanges();
    await fixture.componentInstance.createBox();

    expect(fixture.componentInstance.error()).toBe('No online FreeCAD on that device.');
    expect(refreshAll).not.toHaveBeenCalled();
  });
});
