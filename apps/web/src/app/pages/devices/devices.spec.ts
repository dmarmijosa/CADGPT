import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import type { Device } from '../../core/api/models';
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
});
