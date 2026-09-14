import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Device } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { ConnectPage } from './connect';

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

const onlineDevice: Device = {
  id: 'dev-1',
  name: 'Workshop PC',
  online: true,
  revoked: false,
  lastSeen: Date.now(),
  cads: [],
};

function setup(devices: Device[] = [], deviceInput = '') {
  const workspace = { devices: fakeResource<Device[]>(devices) };
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceStore, useValue: workspace }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(ConnectPage);
  fixture.componentRef.setInput('device', deviceInput);
  fixture.detectChanges();
  TestBed.tick(); // flushes the constructor `effect()` synchronously for the test
  return { fixture, workspace, root: fixture.nativeElement as HTMLElement };
}

describe('ConnectPage (spec mcp-client-onboarding)', () => {
  it('renders Claude and ChatGPT instruction sets that are distinct from each other', () => {
    const { root } = setup([onlineDevice]);

    const claude = root.querySelector('[data-testid="claude-steps"]')?.textContent ?? '';
    const chatgpt = root.querySelector('[data-testid="chatgpt-steps"]')?.textContent ?? '';

    expect(claude).not.toBe('');
    expect(chatgpt).not.toBe('');
    expect(claude).not.toEqual(chatgpt);
    expect(claude).toContain('Add custom connector');
    expect(chatgpt).toContain('Developer mode');
  });

  it('shows a resource URL ending in /mcp and never renders a device secret', () => {
    const { root } = setup([onlineDevice]);

    expect(root.textContent).toMatch(/\/mcp\b/);
    expect(root.textContent).not.toContain('deviceSecret');
    expect(root.textContent).not.toContain('credential');
  });

  it('shows a "Try list_devices" callout', () => {
    const { root } = setup([onlineDevice]);
    expect(root.textContent).toContain('list_devices');
  });
});

describe('ConnectPage device-status polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const offlineDevice: Device = { ...onlineDevice, id: 'dev-2', online: false };

  it('polls every 10s while the bound device is offline', () => {
    const { fixture, workspace } = setup([offlineDevice], 'dev-2');
    vi.advanceTimersByTime(30_000);
    expect(workspace.devices.reload).toHaveBeenCalledTimes(3);
    fixture.destroy();
  });

  it('never polls once the bound device is online', () => {
    const { fixture, workspace } = setup([onlineDevice], 'dev-1');
    vi.advanceTimersByTime(30_000);
    expect(workspace.devices.reload).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('never polls when no device is bound', () => {
    const { fixture, workspace } = setup([offlineDevice], '');
    vi.advanceTimersByTime(30_000);
    expect(workspace.devices.reload).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('clears the timer on destroy', () => {
    const { fixture, workspace } = setup([offlineDevice], 'dev-2');
    fixture.destroy();
    vi.advanceTimersByTime(30_000);
    expect(workspace.devices.reload).not.toHaveBeenCalled();
  });
});
