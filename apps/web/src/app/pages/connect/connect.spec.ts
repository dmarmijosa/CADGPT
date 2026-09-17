import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Device } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { TranslationService } from '../../core/i18n';
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
  const i18n = TestBed.inject(TranslationService);
  return { fixture, workspace, root: fixture.nativeElement as HTMLElement, i18n };
}

describe('ConnectPage (spec mcp-client-onboarding)', () => {
  afterEach(() => {
    localStorage.clear();
  });

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

  it('shows a "Try list_devices" callout with mechanical and parametric CAD expectations', () => {
    const { root } = setup([onlineDevice]);
    expect(root.textContent).toContain('list_devices');
    expect(root.textContent).toContain('Mechanical & Parametric CAD');
    expect(root.textContent).toContain('primitives, transforms, booleans, and extrusions');
  });

  it('renders distinct copy-pasteable keep-alive snippets for Linux, macOS, and Windows', () => {
    const { root } = setup([onlineDevice]);

    const linuxBlock = root.querySelector('[data-testid="keep-alive-linux"]');
    const macosBlock = root.querySelector('[data-testid="keep-alive-macos"]');
    const windowsBlock = root.querySelector('[data-testid="keep-alive-windows"]');

    expect(linuxBlock).toBeTruthy();
    expect(macosBlock).toBeTruthy();
    expect(windowsBlock).toBeTruthy();

    const linuxSnippet = linuxBlock?.querySelector('pre code')?.textContent ?? '';
    const macosSnippet = macosBlock?.querySelector('pre code')?.textContent ?? '';
    const windowsSnippet = windowsBlock?.querySelector('pre code')?.textContent ?? '';

    expect(linuxSnippet).not.toBe('');
    expect(macosSnippet).not.toBe('');
    expect(windowsSnippet).not.toBe('');

    // All three snippets are distinct
    expect(linuxSnippet).not.toEqual(macosSnippet);
    expect(linuxSnippet).not.toEqual(windowsSnippet);
    expect(macosSnippet).not.toEqual(windowsSnippet);

    // Specific OS commands and markers
    expect(linuxSnippet).toContain('cadengine.service');
    expect(linuxSnippet).toContain('systemctl enable --now cadengine');

    expect(macosSnippet).toContain('com.cadengine.agent');
    expect(macosSnippet).toContain('KeepAlive');

    expect(windowsSnippet).toContain('Register-ScheduledTask');
    expect(windowsSnippet).toContain('CAD Engine');
    expect(windowsSnippet).toContain('New-ScheduledTaskAction');

    // Copy buttons exist for each OS
    expect(
      linuxBlock?.querySelector('button[aria-label="Copy Linux systemd snippet"]'),
    ).toBeTruthy();
    expect(
      macosBlock?.querySelector('button[aria-label="Copy macOS launchd snippet"]'),
    ).toBeTruthy();
    expect(
      windowsBlock?.querySelector('button[aria-label="Copy Windows PowerShell snippet"]'),
    ).toBeTruthy();
  });

  it('reactively updates all text literals and button aria-labels when language is switched to Spanish', () => {
    const { fixture, root, i18n } = setup([onlineDevice]);

    i18n.switchLanguage('es');
    fixture.detectChanges();

    // Eyebrow and titles in Spanish
    expect(root.querySelector('.eyebrow')?.textContent).toBe('CONECTE SU CLIENTE MCP');
    expect(root.querySelector('h1')?.textContent).toBe('Casi listo.');

    // Claude and ChatGPT steps in Spanish
    const claude = root.querySelector('[data-testid="claude-steps"]')?.textContent ?? '';
    const chatgpt = root.querySelector('[data-testid="chatgpt-steps"]')?.textContent ?? '';
    expect(claude).toContain('Configuración → Conectores');
    expect(claude).toContain('Añadir conector personalizado');
    expect(chatgpt).toContain('Modo desarrollador');

    // Status label
    expect(root.textContent).toContain('En línea');

    // Keep-alive aria-labels in Spanish
    const linuxBlock = root.querySelector('[data-testid="keep-alive-linux"]');
    const macosBlock = root.querySelector('[data-testid="keep-alive-macos"]');
    const windowsBlock = root.querySelector('[data-testid="keep-alive-windows"]');

    expect(
      linuxBlock?.querySelector('button[aria-label="Copiar fragmento de systemd para Linux"]'),
    ).toBeTruthy();
    expect(
      macosBlock?.querySelector('button[aria-label="Copiar fragmento de launchd para macOS"]'),
    ).toBeTruthy();
    expect(
      windowsBlock?.querySelector(
        'button[aria-label="Copiar fragmento de PowerShell para Windows"]',
      ),
    ).toBeTruthy();

    // Snippets remain intact and identical (shell commands not localized)
    const linuxSnippet = linuxBlock?.querySelector('pre code')?.textContent ?? '';
    expect(linuxSnippet).toContain('cadengine.service');
    expect(linuxSnippet).toContain('systemctl enable --now cadengine');
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
