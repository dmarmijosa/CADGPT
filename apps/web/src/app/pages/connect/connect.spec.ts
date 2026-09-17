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
    expect(root.textContent).not.toContain('device_secret');
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

    // Automated service card in Spanish
    const autoServiceCard = root.querySelector('[data-testid="auto-service-card"]');
    expect(autoServiceCard?.querySelector('.status')?.textContent?.trim()).toBe('Recomendado');
    expect(autoServiceCard?.querySelector('h3')?.textContent?.trim()).toBe(
      'Configuración Automática en un Solo Paso',
    );
    expect(
      autoServiceCard?.querySelector(
        'button[aria-label="Copiar comando de instalación automática del servicio"]',
      ),
    ).toBeTruthy();
    expect(root.textContent).toContain('Configuración Manual del Demonio (Avanzado / Servidores)');

    // CLI reference in Spanish
    const cliRef = root.querySelector('[data-testid="cli-reference"]');
    expect(cliRef?.querySelector('h2')?.textContent?.trim()).toBe(
      'Referencia de Comandos CLI de CAD Engine',
    );
    expect(cliRef?.querySelector('p')?.textContent?.trim()).toBe(
      'Comandos integrados para vinculación, diagnóstico, pruebas y gestión del demonio:',
    );
    const cliTable = cliRef?.querySelector('.cli-table');
    expect(cliTable?.querySelector('th:first-child')?.textContent?.trim()).toBe('Comando');
    expect(cliTable?.querySelector('th:nth-child(2)')?.textContent?.trim()).toBe('Descripción');
    const tableTextEs = cliTable?.textContent ?? '';
    expect(tableTextEs).toContain(
      'Vincula la estación de trabajo con su cuenta mediante un código de un solo uso de 12 caracteres.',
    );
    expect(tableTextEs).toContain(
      'Ejecuta validación integral del entorno con remediación automática (--fix) para FreeCAD headless.',
    );

    // Snippets remain intact and identical (shell commands not localized)
    const linuxSnippet = linuxBlock?.querySelector('pre code')?.textContent ?? '';
    expect(linuxSnippet).toContain('cadengine.service');
    expect(linuxSnippet).toContain('systemctl enable --now cadengine');
  });

  it('renders automated one-step service installation card and CLI command reference in English', () => {
    const { root, fixture } = setup([onlineDevice]);

    expect(fixture.componentInstance.serviceInstallCommand).toBe('cadengine service install');

    const autoServiceCard = root.querySelector('[data-testid="auto-service-card"]');
    expect(autoServiceCard).toBeTruthy();
    expect(autoServiceCard?.querySelector('.status')?.textContent?.trim()).toBe('Recommended');
    expect(autoServiceCard?.querySelector('h3')?.textContent?.trim()).toBe(
      'Automated One-Step Setup',
    );
    expect(autoServiceCard?.querySelector('pre code')?.textContent?.trim()).toBe(
      'cadengine service install',
    );
    expect(
      autoServiceCard?.querySelector('button[aria-label="Copy automated service install command"]'),
    ).toBeTruthy();

    expect(root.textContent).toContain('Manual Daemon Configuration (Advanced / Headless)');

    const cliRef = root.querySelector('[data-testid="cli-reference"]');
    expect(cliRef).toBeTruthy();
    expect(cliRef?.querySelector('h2')?.textContent?.trim()).toBe(
      'CAD Engine CLI Command Reference',
    );
    expect(cliRef?.querySelector('p')?.textContent?.trim()).toBe(
      'Built-in commands for pairing, diagnostics, testing, and daemon management:',
    );

    const cliTable = cliRef?.querySelector('.cli-table');
    expect(cliTable?.querySelector('th:first-child')?.textContent?.trim()).toBe('Command');
    expect(cliTable?.querySelector('th:nth-child(2)')?.textContent?.trim()).toBe('Description');

    const tableText = cliTable?.textContent ?? '';
    expect(tableText).toContain('cadengine pair');
    expect(tableText).toContain('cadengine service [action]');
    expect(tableText).toContain('cadengine status [--json]');
    expect(tableText).toContain('cadengine doctor [--fix]');
    expect(tableText).toContain('cadengine test [--cad ...]');
    expect(tableText).toContain('cadengine gui [--tray-only]');
    expect(tableText).toContain('cadengine logs [-f]');
    expect(tableText).toContain('cadengine unpair [--force]');
    expect(tableText).toContain('cadengine version [--check]');

    expect(tableText).toContain(
      'Pair workstation with your CAD Engine account using a 12-character one-time code.',
    );
    expect(tableText).toContain(
      'Run end-to-end environment validation with optional auto-remediation (--fix) for headless FreeCAD.',
    );
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
