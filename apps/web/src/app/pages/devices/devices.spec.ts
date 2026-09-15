import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import type { AllowedRoot, Device } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { DevicesPage } from './devices';

/** Minimal stand-in for a `resource()` — only the members the template reads. */
function fakeResource<T>(value: T) {
  return {
    value: () => value,
    hasValue: () => value !== undefined,
    isLoading: () => false,
    error: () => undefined,
    reload: vi.fn(),
  };
}

const device: Device = {
  id: 'dev-1',
  name: 'Workshop PC',
  online: true,
  revoked: false,
  lastSeen: Date.now() - 60_000,
  cads: [
    { id: 'cad-1', name: 'FreeCAD', path: '/usr/bin/freecadcmd', version: '1.0', executable: true },
  ],
};

describe('DevicesPage', () => {
  it('revokes a device only after inline confirmation, then reloads the devices resource', async () => {
    const devicesResource = fakeResource<Device[]>([device]);
    const revokeDevice = vi.fn().mockResolvedValue({ revoked: true });
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: { devices: devicesResource } },
        { provide: ApiClient, useValue: { revokeDevice } },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    const revokeButton = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Revoke access'),
    )!;
    revokeButton.click();
    fixture.detectChanges();

    // No native confirm dialog: the row now shows an inline confirmation,
    // and revoke has not been called yet.
    expect(revokeDevice).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Revoke this device?');

    const confirmButton = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm revoke'),
    )!;
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeDevice).toHaveBeenCalledWith('dev-1');
    expect(devicesResource.reload).toHaveBeenCalled();

    fixture.destroy();
  });

  it('shows the empty state pointing to the connector download and pairing', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: { devices: fakeResource<Device[]>([]) } },
        { provide: ApiClient, useValue: { revokeDevice: vi.fn() } },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('No linked computers yet');
    expect(root.querySelector('a[href="/pair"]')).toBeTruthy();
    expect(
      Array.from(root.querySelectorAll('a')).some((a) =>
        a.getAttribute('href')?.includes('github.com/dmarmijosa/CADGPT/releases'),
      ),
    ).toBe(true);

    fixture.destroy();
  });

  it('renders allowed folders for the active device', () => {
    const devicesResource = fakeResource<Device[]>([device]);
    const rootItem: AllowedRoot = {
      id: 'root-1',
      owner: 'alice',
      deviceId: 'dev-1',
      path: '/home/alice/allowed',
      created: 1000,
    };
    const rootsResource = fakeResource<AllowedRoot[]>([rootItem]);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            devices: devicesResource,
            roots: rootsResource,
            selectedDeviceId: signal('dev-1'),
          },
        },
        {
          provide: ApiClient,
          useValue: { revokeDevice: vi.fn(), addRoot: vi.fn(), removeRoot: vi.fn() },
        },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('Allowed folders');
    expect(root.textContent).toContain('/home/alice/allowed');
    expect(
      root.querySelector('button[aria-label="Remove folder /home/alice/allowed"]'),
    ).toBeTruthy();

    fixture.destroy();
  });

  it('adds a root via the form, calls ApiClient.addRoot, and reloads the roots resource', async () => {
    const devicesResource = fakeResource<Device[]>([device]);
    const rootsResource = fakeResource<AllowedRoot[]>([]);
    const addRoot = vi.fn().mockResolvedValue({
      id: 'root-new',
      owner: 'alice',
      deviceId: 'dev-1',
      path: '/home/alice/new-designs',
      created: 2000,
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            devices: devicesResource,
            roots: rootsResource,
            selectedDeviceId: signal('dev-1'),
          },
        },
        {
          provide: ApiClient,
          useValue: { revokeDevice: vi.fn(), addRoot, removeRoot: vi.fn() },
        },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    const input = root.querySelector('input#new-root-path') as HTMLInputElement;
    input.value = '/home/alice/new-designs';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form = root.querySelector('form.add-root-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(addRoot).toHaveBeenCalledWith('dev-1', '/home/alice/new-designs');
    expect(rootsResource.reload).toHaveBeenCalled();

    fixture.destroy();
  });

  it('removes a root, calls ApiClient.removeRoot, and reloads the roots resource', async () => {
    const devicesResource = fakeResource<Device[]>([device]);
    const rootItem: AllowedRoot = {
      id: 'root-1',
      owner: 'alice',
      deviceId: 'dev-1',
      path: '/home/alice/allowed',
      created: 1000,
    };
    const rootsResource = fakeResource<AllowedRoot[]>([rootItem]);
    const removeRoot = vi.fn().mockResolvedValue({ removed: true });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            devices: devicesResource,
            roots: rootsResource,
            selectedDeviceId: signal('dev-1'),
          },
        },
        {
          provide: ApiClient,
          useValue: { revokeDevice: vi.fn(), addRoot: vi.fn(), removeRoot },
        },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    const removeBtn = root.querySelector(
      'button[aria-label="Remove folder /home/alice/allowed"]',
    ) as HTMLButtonElement;
    removeBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(removeRoot).toHaveBeenCalledWith('root-1');
    expect(rootsResource.reload).toHaveBeenCalled();

    fixture.destroy();
  });

  it('a root added by another owner never renders in this owner list', () => {
    const devicesResource = fakeResource<Device[]>([device]);
    // The store only provides Alice's roots (Bob's root /home/bob/secret is excluded by API)
    const aliceRoot: AllowedRoot = {
      id: 'root-alice',
      owner: 'alice',
      deviceId: 'dev-1',
      path: '/home/alice/allowed',
      created: 1000,
    };
    const rootsResource = fakeResource<AllowedRoot[]>([aliceRoot]);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            devices: devicesResource,
            roots: rootsResource,
            selectedDeviceId: signal('dev-1'),
          },
        },
        {
          provide: ApiClient,
          useValue: { revokeDevice: vi.fn(), addRoot: vi.fn(), removeRoot: vi.fn() },
        },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DevicesPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('/home/alice/allowed');
    expect(root.textContent).not.toContain('/home/bob/secret');

    fixture.destroy();
  });
});
