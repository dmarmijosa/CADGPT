import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n';
import { PLUG_SCENE_FACTORY } from '../../features/exploded/exploded-scene';
import { HomePage } from './home';

describe('HomePage (spec dashboard-routing: public route)', () => {
  afterEach(() => {
    localStorage.clear();
  });
  it('renders for an unauthenticated visitor with a sign-in CTA and a download link', async () => {
    const fakeAuth = { user: () => null, login: vi.fn() };
    // The hero's exploded-view scene is not this page's concern — it's
    // covered by exploded-plug.spec.ts — so it's stubbed here to keep this
    // test deterministic and free of real `three`/network activity.
    const sceneFactory = vi.fn().mockResolvedValue({ setProgress: vi.fn(), dispose: vi.fn() });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: PLUG_SCENE_FACTORY, useValue: sceneFactory },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')).toBeTruthy();

    const signInButton = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Sign in',
    );
    expect(signInButton).toBeTruthy();
    signInButton!.click();
    expect(fakeAuth.login).toHaveBeenCalledWith('/designs');

    const download = Array.from(root.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.includes('github.com/dmarmijosa/CADGPT/releases'),
    );
    expect(download).toBeTruthy();
  });

  it('shows a dashboard link instead of a sign-in trigger for a visitor who already has a session', async () => {
    const fakeAuth = { user: () => ({ profile: { preferred_username: 'ada' } }), login: vi.fn() };
    const sceneFactory = vi.fn().mockResolvedValue({ setProgress: vi.fn(), dispose: vi.fn() });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: PLUG_SCENE_FACTORY, useValue: sceneFactory },
        provideRouter([{ path: 'designs', children: [] }]),
      ],
    });

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;

    const signInButton = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Sign in',
    );
    expect(signInButton).toBeFalsy();

    const dashboardLink = Array.from(root.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Open your dashboard',
    );
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink!.getAttribute('href')).toBe('/designs');

    dashboardLink!.click();
    await fixture.whenStable();
    expect(fakeAuth.login).not.toHaveBeenCalled();

    const download = Array.from(root.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.includes('github.com/dmarmijosa/CADGPT/releases'),
    );
    expect(download).toBeTruthy();
  });

  it('renders AutoCAD 2026 Core Console 13-op parity and LT detection-only capabilities', async () => {
    const fakeAuth = { user: () => null, login: vi.fn() };
    const sceneFactory = vi.fn().mockResolvedValue({ setProgress: vi.fn(), dispose: vi.fn() });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: PLUG_SCENE_FACTORY, useValue: sceneFactory },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    const autocadPanel = root.querySelector('.capability-panel--autocad');
    expect(autocadPanel).toBeTruthy();
    expect(autocadPanel?.textContent).toContain(
      'Full 13-operation headless execution with AutoCAD 2026 Core Console',
    );
    expect(autocadPanel?.textContent).toContain('3D booleans');
    expect(autocadPanel?.textContent).toContain('binary STL preview via STLOUT');
    expect(autocadPanel?.textContent).toContain('MASSPROP');
    expect(autocadPanel?.textContent).toContain('AutoCAD LT — detected only; execution disabled');
  });

  it('reactively updates all Home page literals when switching language to Spanish', async () => {
    const fakeAuth = { user: () => null, login: vi.fn() };
    const sceneFactory = vi.fn().mockResolvedValue({ setProgress: vi.fn(), dispose: vi.fn() });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: PLUG_SCENE_FACTORY, useValue: sceneFactory },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(HomePage);
    const i18n = TestBed.inject(TranslationService);
    fixture.detectChanges();
    await fixture.whenStable();

    i18n.switchLanguage('es');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    // Flow section
    expect(root.querySelector('#flow-heading')?.textContent).toContain(
      'Desde una instalación limpia hasta un asistente conectado',
    );
    expect(root.textContent).toContain('Instale el conector');
    expect(root.textContent).toContain('Vincule el equipo');
    expect(root.textContent).toContain('Conecte Claude o ChatGPT');

    // Capability sheet
    expect(root.querySelector('#capability-heading')?.textContent).toContain('Qué se ejecuta hoy');
    expect(root.textContent).toContain('se ejecuta ahora');
    expect(root.textContent).toContain('se ejecuta en algunas instalaciones');
    expect(root.textContent).toContain('detectado, no ejecutado');
    expect(root.textContent).toContain('Ejecución completa en cualquier host');
    expect(root.textContent).toContain(
      'Ejecución desatendida completa de 13 operaciones con AutoCAD 2026 Core Console',
    );

    // Trust section
    expect(root.querySelector('#trust-heading')?.textContent).toContain(
      'Lo que permanece bajo su control',
    );
    expect(root.textContent).toContain(
      'Cada operación se ejecuta desde una lista permitida cerrada',
    );
    expect(root.textContent).toContain('Los archivos nativos (');
    expect(root.textContent).toContain(') nunca salen de la computadora que los posee.');
    expect(root.textContent).toContain('Historial de trabajos y equipos');
    expect(root.textContent).toContain('Malla de vista previa STL');
    expect(root.textContent).toContain('Renderizado del panel');

    // Closing section
    expect(root.querySelector('.closing h2')?.textContent).toContain(
      'Conecte una vez. Mantenga todo local.',
    );
    const closingSignIn = Array.from(root.querySelectorAll('.closing button')).find(
      (b) => b.textContent?.trim() === 'Iniciar sesión',
    );
    expect(closingSignIn).toBeTruthy();

    // Reset back to English
    i18n.switchLanguage('en');
    fixture.detectChanges();
    expect(root.querySelector('#flow-heading')?.textContent).toContain(
      'From a bare install to a connected assistant',
    );
  });
});
