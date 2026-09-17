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

    // API Key Guide in Spanish
    const apiKeyGuideEs = root.querySelector('[data-testid="api-key-guide"]');
    expect(apiKeyGuideEs).toBeTruthy();
    expect(apiKeyGuideEs?.querySelector('.status')?.textContent?.trim()).toBe(
      'Paso 0 — Autenticación',
    );
    expect(apiKeyGuideEs?.querySelector('h2')?.textContent?.trim()).toBe(
      'Configuración de Clave de API y Requisitos de Ámbitos',
    );
    expect(apiKeyGuideEs?.querySelector('a[routerLink="/api-keys"]')?.textContent?.trim()).toBe(
      'Gestión de Claves de API',
    );

    // Google Gemini in Spanish
    const geminiBlockEs = root.querySelector('[data-testid="gemini-steps"]');
    expect(geminiBlockEs).toBeTruthy();
    expect(geminiBlockEs?.querySelector('.status')?.textContent?.trim()).toBe('Google Gemini');
    expect(geminiBlockEs?.querySelector('h2')?.textContent?.trim()).toBe(
      'Conectar Google Gemini (API y Llamadas a Funciones)',
    );
    expect(
      geminiBlockEs?.querySelector(
        'button[aria-label="Copiar fragmento de integración Python para Google Gemini"]',
      ),
    ).toBeTruthy();

    // Generic MCP Client in Spanish
    const genericMcpBlockEs = root.querySelector('[data-testid="generic-mcp-steps"]');
    expect(genericMcpBlockEs).toBeTruthy();
    expect(genericMcpBlockEs?.querySelector('.status')?.textContent?.trim()).toBe('MCP Universal');
    expect(genericMcpBlockEs?.querySelector('h2')?.textContent?.trim()).toBe(
      'Configuración de Cliente MCP Genérico',
    );
    expect(
      genericMcpBlockEs?.querySelector(
        'button[aria-label="Copiar fragmento de configuración MCP genérico"]',
      ),
    ).toBeTruthy();
    const mcpTableEs = genericMcpBlockEs?.querySelector('.mcp-paths-table');
    expect(mcpTableEs?.querySelector('th:first-child')?.textContent?.trim()).toBe('Cliente / IDE');
    expect(mcpTableEs?.querySelector('th:nth-child(2)')?.textContent?.trim()).toBe(
      'Ruta del Archivo de Configuración',
    );

    // Engines section in Spanish
    const enginesSecEs = root.querySelector('[data-testid="cad-engines-section"]');
    expect(enginesSecEs).toBeTruthy();
    expect(enginesSecEs?.querySelector('h2')?.textContent?.trim()).toBe(
      'Motores CAD y Modelado 3D',
    );
    const freecadCardEs = root.querySelector('[data-testid="engine-freecad"]');
    expect(freecadCardEs?.querySelector('.status')?.textContent?.trim()).toBe('CAD Paramétrico');
    expect(freecadCardEs?.querySelector('h3')?.textContent?.trim()).toBe(
      'FreeCAD (Paramétrico y B-Rep Mecánico)',
    );
    expect(
      freecadCardEs?.querySelector('[data-testid="freecad-install-link"]')?.textContent?.trim(),
    ).toBe('Instalar FreeCAD (Descarga Oficial ↗)');
    const blenderCardEs = root.querySelector('[data-testid="engine-blender"]');
    expect(blenderCardEs?.querySelector('.status')?.textContent?.trim()).toBe(
      'Modelado 3D y Mallas',
    );
    expect(blenderCardEs?.querySelector('h3')?.textContent?.trim()).toBe(
      'Blender 4.x (Poligonal y 3D Orgánico)',
    );
    expect(
      blenderCardEs?.querySelector('[data-testid="blender-install-link"]')?.textContent?.trim(),
    ).toBe('Instalar Blender (Descarga Oficial ↗)');

    // Quick commands section in Spanish
    const quickCmdsEs = root.querySelector('[data-testid="quick-commands-section"]');
    expect(quickCmdsEs).toBeTruthy();
    expect(quickCmdsEs?.querySelector('h2')?.textContent?.trim()).toBe(
      'Comandos Rápidos de CAD Engine',
    );
    expect(quickCmdsEs?.textContent).toContain(
      'Iniciar asistente de configuración y controlador en bandeja',
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

  it('renders API Key Setup Guide with internal router link and scope guidance', () => {
    const { root } = setup([onlineDevice]);

    const apiKeyPanel = root.querySelector('[data-testid="api-key-guide"]');
    expect(apiKeyPanel).toBeTruthy();
    expect(apiKeyPanel?.querySelector('.status')?.textContent?.trim()).toBe(
      'Step 0 — Authentication',
    );
    expect(apiKeyPanel?.querySelector('h2')?.textContent?.trim()).toBe(
      'API Key Setup & Scope Requirements',
    );

    const routerLink = apiKeyPanel?.querySelector('a[routerLink="/api-keys"]');
    expect(routerLink).toBeTruthy();
    expect(routerLink?.textContent?.trim()).toBe('API Key Management');

    const panelText = apiKeyPanel?.textContent ?? '';
    expect(panelText).toContain('cad:read');
    expect(panelText).toContain('cad:write');
    expect(panelText).toContain('Authorization: Bearer <your_api_key>');

    const copyBtn = apiKeyPanel?.querySelector('button[aria-label="Copy snippet"]');
    expect(copyBtn).toBeTruthy();
  });

  it('renders Google Gemini guide with copyable Python GenAI SDK snippet', () => {
    const { root, fixture } = setup([onlineDevice]);

    const geminiSection = root.querySelector('[data-testid="gemini-steps"]');
    expect(geminiSection).toBeTruthy();
    expect(geminiSection?.querySelector('.status')?.textContent?.trim()).toBe('Google Gemini');
    expect(geminiSection?.querySelector('h2')?.textContent?.trim()).toBe(
      'Connect Google Gemini (API & Function Calling)',
    );

    const snippet = geminiSection?.querySelector('pre code')?.textContent ?? '';
    expect(snippet).toContain('from google import genai');
    expect(snippet).toContain('CADENGINE_API_KEY');
    expect(snippet).toContain('gemini-2.5-flash');
    expect(snippet).toContain(fixture.componentInstance.resourceUrl);

    const copyBtn = geminiSection?.querySelector(
      'button[aria-label="Copy Google Gemini Python integration snippet"]',
    );
    expect(copyBtn).toBeTruthy();
  });

  it('renders Generic MCP client guide with mcpServers JSON snippet and client path matrix table', () => {
    const { root, fixture } = setup([onlineDevice]);

    const genericMcpSection = root.querySelector('[data-testid="generic-mcp-steps"]');
    expect(genericMcpSection).toBeTruthy();
    expect(genericMcpSection?.querySelector('.status')?.textContent?.trim()).toBe('Universal MCP');
    expect(genericMcpSection?.querySelector('h2')?.textContent?.trim()).toBe(
      'Generic MCP Client Configuration',
    );

    const snippet = genericMcpSection?.querySelector('pre code')?.textContent ?? '';
    expect(snippet).toContain('"mcpServers"');
    expect(snippet).toContain('"cadengine"');
    expect(snippet).toContain(fixture.componentInstance.resourceUrl);
    expect(snippet).toContain('"Authorization": "Bearer YOUR_API_KEY"');

    // Parse snippet as valid JSON
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.cadengine.url).toBe(fixture.componentInstance.resourceUrl);

    const copyBtn = genericMcpSection?.querySelector(
      'button[aria-label="Copy generic MCP configuration snippet"]',
    );
    expect(copyBtn).toBeTruthy();

    // Table matrix
    const table = genericMcpSection?.querySelector('.mcp-paths-table');
    expect(table).toBeTruthy();
    const tableText = table?.textContent ?? '';
    expect(tableText).toContain('Cursor');
    expect(tableText).toContain('.cursor/mcp.json');
    expect(tableText).toContain('Windsurf');
    expect(tableText).toContain('~/.codeium/windsurf/mcp_config.json');
    expect(tableText).toContain('Claude Desktop');
    expect(tableText).toContain('claude_desktop_config.json');
    expect(tableText).toContain('Antigravity / Gemini CLI');
    expect(tableText).toContain('~/.gemini/antigravity-cli/mcp/');
  });

  it('copies API Key header, Gemini, and Generic MCP snippets via copySnippet handler', async () => {
    const { fixture } = setup([onlineDevice]);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    await fixture.componentInstance.copySnippet(
      'Authorization: Bearer <your_api_key>',
      'api-key-header',
    );
    expect(writeTextMock).toHaveBeenCalledWith('Authorization: Bearer <your_api_key>');
    expect(fixture.componentInstance.copiedSnippet()).toBe('api-key-header');

    await fixture.componentInstance.copySnippet(
      fixture.componentInstance.geminiPythonSnippet(),
      'gemini',
    );
    expect(writeTextMock).toHaveBeenCalledWith(fixture.componentInstance.geminiPythonSnippet());
    expect(fixture.componentInstance.copiedSnippet()).toBe('gemini');

    await fixture.componentInstance.copySnippet(
      fixture.componentInstance.genericMcpSnippet(),
      'generic-mcp',
    );
    expect(writeTextMock).toHaveBeenCalledWith(fixture.componentInstance.genericMcpSnippet());
    expect(fixture.componentInstance.copiedSnippet()).toBe('generic-mcp');

    // Engine package snippets
    await fixture.componentInstance.copySnippet(
      fixture.componentInstance.freecadWinget,
      'freecad-winget',
    );
    expect(writeTextMock).toHaveBeenCalledWith('winget install FreeCAD.FreeCAD');
    expect(fixture.componentInstance.copiedSnippet()).toBe('freecad-winget');

    await fixture.componentInstance.copySnippet(
      fixture.componentInstance.blenderWinget,
      'blender-winget',
    );
    expect(writeTextMock).toHaveBeenCalledWith('winget install BlenderFoundation.Blender');
    expect(fixture.componentInstance.copiedSnippet()).toBe('blender-winget');

    // Quick command snippet
    await fixture.componentInstance.copySnippet(fixture.componentInstance.quickCmdGui, 'cmd-gui');
    expect(writeTextMock).toHaveBeenCalledWith('cadengine gui');
    expect(fixture.componentInstance.copiedSnippet()).toBe('cmd-gui');
  });

  it('renders CAD & 3D Modeling Engines section with official download links and package manager snippets', () => {
    const { root, fixture } = setup([onlineDevice]);

    const enginesSection = root.querySelector('[data-testid="cad-engines-section"]');
    expect(enginesSection).toBeTruthy();
    expect(enginesSection?.querySelector('h2')?.textContent?.trim()).toBe(
      'CAD & 3D Modeling Engines',
    );

    // FreeCAD Card
    const freecadCard = root.querySelector('[data-testid="engine-freecad"]');
    expect(freecadCard).toBeTruthy();
    expect(freecadCard?.querySelector('.status')?.textContent?.trim()).toBe('Parametric CAD');
    expect(freecadCard?.querySelector('h3')?.textContent?.trim()).toBe(
      'FreeCAD (Parametric & Mechanical B-Rep)',
    );
    const freecadLink = freecadCard?.querySelector(
      '[data-testid="freecad-install-link"]',
    ) as HTMLAnchorElement;
    expect(freecadLink).toBeTruthy();
    expect(freecadLink.href).toBe('https://www.freecad.org/downloads.php');
    expect(freecadLink.target).toBe('_blank');
    expect(freecadLink.textContent?.trim()).toBe('Install FreeCAD (Official Download ↗)');

    const freecadText = freecadCard?.textContent ?? '';
    expect(freecadText).toContain('winget install FreeCAD.FreeCAD');
    expect(freecadText).toContain('brew install --cask freecad');
    expect(freecadText).toContain('sudo apt install freecad');

    // Blender Card
    const blenderCard = root.querySelector('[data-testid="engine-blender"]');
    expect(blenderCard).toBeTruthy();
    expect(blenderCard?.querySelector('.status')?.textContent?.trim()).toBe('3D Modeling & Mesh');
    expect(blenderCard?.querySelector('h3')?.textContent?.trim()).toBe(
      'Blender 4.x (Polygonal & Organic 3D)',
    );
    const blenderLink = blenderCard?.querySelector(
      '[data-testid="blender-install-link"]',
    ) as HTMLAnchorElement;
    expect(blenderLink).toBeTruthy();
    expect(blenderLink.href).toBe('https://www.blender.org/download/');
    expect(blenderLink.target).toBe('_blank');
    expect(blenderLink.textContent?.trim()).toBe('Install Blender (Official Download ↗)');

    const blenderText = blenderCard?.textContent ?? '';
    expect(blenderText).toContain('winget install BlenderFoundation.Blender');
    expect(blenderText).toContain('brew install --cask blender');
    expect(blenderText).toContain('sudo apt install blender');
  });

  it('renders CAD Engine Quick Commands section with copyable CLI boxes', () => {
    const { root, fixture } = setup([onlineDevice]);

    const quickCommandsSection = root.querySelector('[data-testid="quick-commands-section"]');
    expect(quickCommandsSection).toBeTruthy();
    expect(quickCommandsSection?.querySelector('h2')?.textContent?.trim()).toBe(
      'CAD Engine Quick Commands',
    );

    const guiCard = root.querySelector('[data-testid="quick-cmd-gui"]');
    expect(guiCard).toBeTruthy();
    expect(guiCard?.querySelector('strong')?.textContent?.trim()).toBe('cadengine gui');
    expect(guiCard?.querySelector('pre code')?.textContent?.trim()).toBe('cadengine gui');

    const pairCard = root.querySelector('[data-testid="quick-cmd-pair"]');
    expect(pairCard).toBeTruthy();
    expect(pairCard?.querySelector('strong')?.textContent?.trim()).toBe('cadengine pair');
    expect(pairCard?.querySelector('pre code')?.textContent?.trim()).toBe('cadengine pair');

    const statusCard = root.querySelector('[data-testid="quick-cmd-status"]');
    expect(statusCard).toBeTruthy();
    expect(statusCard?.querySelector('strong')?.textContent?.trim()).toBe('cadengine status');
    expect(statusCard?.querySelector('pre code')?.textContent?.trim()).toBe('cadengine status');

    const doctorCard = root.querySelector('[data-testid="quick-cmd-doctor"]');
    expect(doctorCard).toBeTruthy();
    expect(doctorCard?.querySelector('strong')?.textContent?.trim()).toBe('cadengine doctor');
    expect(doctorCard?.querySelector('pre code')?.textContent?.trim()).toBe('cadengine doctor');
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

  it('rejects malformed device IDs via Zod schema and does not poll', () => {
    const { fixture, workspace } = setup([offlineDevice], '<script>alert(1)</script>');
    vi.advanceTimersByTime(30_000);
    expect(fixture.componentInstance.validatedDeviceId()).toBeUndefined();
    expect(fixture.componentInstance.boundDevice()).toBeUndefined();
    expect(workspace.devices.reload).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
