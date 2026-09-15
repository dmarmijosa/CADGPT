import { TestBed } from '@angular/core/testing';
import { ApiClient } from '../api/api-client';
import type { Design, Device, Job } from '../api/models';
import { WorkspaceStore } from './workspace.store';

const device: Device = {
  id: 'dev-1',
  name: 'Workshop PC',
  online: true,
  revoked: false,
  lastSeen: 1000,
  cads: [
    { id: 'cad-1', name: 'FreeCAD', path: '/usr/bin/freecadcmd', version: '1.0', executable: true },
  ],
};
const job: Job = {
  id: 'job-1',
  deviceId: 'dev-1',
  status: 'succeeded',
  created: 1000,
  result: 'ok',
  type: 'create_box',
  documentId: null,
};
const design: Design = {
  id: 'doc-1',
  name: 'Bracket',
  cadKind: 'FreeCAD',
  deviceId: 'dev-1',
  created: 1000,
  updated: 2000,
  latestJobId: 'job-1',
  hasMesh: true,
};

describe('WorkspaceStore', () => {
  it('loads devices, jobs, and designs into resolved resources with derived signals', async () => {
    const api = {
      devices: vi.fn().mockResolvedValue([device]),
      jobs: vi.fn().mockResolvedValue([job]),
      designs: vi.fn().mockResolvedValue([design]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const store = TestBed.inject(WorkspaceStore);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(store.devices.hasValue()).toBe(true);
      expect(store.jobs.hasValue()).toBe(true);
      expect(store.designs.hasValue()).toBe(true);
    });

    expect(store.devices.value()).toEqual([device]);
    expect(store.jobs.value()).toEqual([job]);
    expect(store.designs.value()).toEqual([design]);
    expect(store.onlineDevices()).toEqual([device]);
    expect(store.designsWithPreview()).toEqual([design]);
  });

  it('surfaces a loader error as its own resource signal, independent from the others', async () => {
    const loadError = new Error('Could not connect. Try again.');
    const api = {
      devices: vi.fn().mockRejectedValue(loadError),
      jobs: vi.fn().mockResolvedValue([job]),
      designs: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const store = TestBed.inject(WorkspaceStore);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(store.devices.error()).toBeTruthy();
      expect(store.jobs.hasValue()).toBe(true);
    });

    expect((store.devices.error() as Error).message).toBe('Could not connect. Try again.');
    expect(store.jobs.value()).toEqual([job]);
    expect(store.onlineDevices()).toEqual([]);
  });

  it('reload() re-invokes only its own loader, and refreshAll() reloads every resource', async () => {
    const api = {
      devices: vi.fn().mockResolvedValue([device]),
      jobs: vi.fn().mockResolvedValue([job]),
      designs: vi.fn().mockResolvedValue([design]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const store = TestBed.inject(WorkspaceStore);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(store.designs.hasValue()).toBe(true);
    });

    store.devices.reload();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(api.devices).toHaveBeenCalledTimes(2);
    });
    expect(api.jobs).toHaveBeenCalledTimes(1);
    expect(api.designs).toHaveBeenCalledTimes(1);

    store.refreshAll();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(api.jobs).toHaveBeenCalledTimes(2);
      expect(api.designs).toHaveBeenCalledTimes(2);
    });
  });

  it('loads roots for the selected device', async () => {
    const rootItem = {
      id: 'root-1',
      owner: 'alice',
      deviceId: 'dev-1',
      path: '/home/alice/cad',
      created: 1000,
    };
    const api = {
      devices: vi.fn().mockResolvedValue([device]),
      jobs: vi.fn().mockResolvedValue([]),
      designs: vi.fn().mockResolvedValue([]),
      listRoots: vi.fn().mockResolvedValue([rootItem]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const store = TestBed.inject(WorkspaceStore);

    store.selectedDeviceId.set('dev-1');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(store.roots.hasValue()).toBe(true);
    });

    expect(store.roots.value()).toEqual([rootItem]);
    expect(api.listRoots).toHaveBeenCalledWith('dev-1');
  });
});
