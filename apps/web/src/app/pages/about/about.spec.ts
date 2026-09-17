import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AboutPage } from './about';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client';
import { TranslationService } from '../../core/i18n';

describe('AboutPage (spec user-account-lifecycle, dashboard-routing, & web-i18n-author-attribution)', () => {
  let fakeUser: any;
  let fakeAuth: any;
  let fakeApi: any;

  beforeEach(() => {
    fakeUser = {
      profile: { sub: 'usr-123', email: 'alice@example.com' },
      access_token: 'mock-jwt-token',
    };
    fakeAuth = {
      user: signal<any>(fakeUser),
      token: computed(() => fakeUser?.access_token ?? ''),
      clearConsent: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    fakeApi = {
      deleteAccount: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders compatibility and security content without an active session', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, token: () => '' } },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')?.textContent).toContain('About');
    expect(root.querySelector('table.data')).toBeTruthy();
    expect(root.textContent).toContain('experimental alpha');
    expect(root.querySelector('.panel-governance')).toBeTruthy();
    expect(root.querySelector('.btn-destructive')).toBeTruthy();
  });

  it('renders AutoCAD 2026 and Blender 4.x in compatibility table', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, token: () => '' } },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const tableText = root.querySelector('table.data')?.textContent ?? '';
    // AutoCAD
    expect(tableText).toContain('AutoCAD 2026 Core Console');
    expect(tableText).toContain('Full 13-operation headless execution');
    expect(tableText).toContain('MASSPROP');
    expect(tableText).toContain('binary STL preview via headless STLOUT');
    expect(tableText).toContain('AutoCAD LT');
    expect(tableText).toContain('Installation detection only; execution disabled');

    // Blender 4.x
    expect(tableText).toContain('Blender 4.x');
    expect(tableText).toContain('subdivision surfaces');
    expect(tableText).toContain('--enable-blender');
  });

  it('renders Tri-Engine Architecture section documenting FreeCAD, AutoCAD, and Blender 4.x', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, token: () => '' } },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const archSection = root.querySelector('[data-testid="tri-engine-architecture"]');
    expect(archSection).toBeTruthy();

    const cards = archSection!.querySelectorAll('.tri-engine-card');
    expect(cards.length).toBe(3);

    const archText = archSection!.textContent ?? '';
    expect(archText).toContain('FreeCAD');
    expect(archText).toContain('CSG');
    expect(archText).toContain('AutoCAD');
    expect(archText).toContain('Core Console');
    expect(archText).toContain('Blender 4.x');
    expect(archText).toContain('Subsurf');
  });

  it('renders Author profile card for Danny Armijos with secure external links', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, token: () => '' } },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const authorCard = root.querySelector('[data-testid="author-profile-card"]');
    expect(authorCard).toBeTruthy();
    expect(authorCard?.textContent).toContain('Danny Armijos');
    expect(authorCard?.textContent).toContain('Software Architect & CAD Systems Engineer');

    // LinkedIn link security & accessibility
    const linkedinBtn = authorCard!.querySelector(
      'a[href="https://www.linkedin.com/in/dmarmijosa/"]',
    ) as HTMLAnchorElement;
    expect(linkedinBtn).toBeTruthy();
    expect(linkedinBtn.getAttribute('target')).toBe('_blank');
    expect(linkedinBtn.getAttribute('rel')).toBe('noopener noreferrer');
    expect(linkedinBtn.getAttribute('aria-label')).toBeTruthy();

    // Personal website link security & accessibility
    const websiteBtn = authorCard!.querySelector(
      'a[href="https://www.danny-armijos.com/"]',
    ) as HTMLAnchorElement;
    expect(websiteBtn).toBeTruthy();
    expect(websiteBtn.getAttribute('target')).toBe('_blank');
    expect(websiteBtn.getAttribute('rel')).toBe('noopener noreferrer');
    expect(websiteBtn.getAttribute('aria-label')).toBeTruthy();
  });

  it('reactively updates all About page literals when switching language to Spanish', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null, token: () => '' } },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    const i18n = TestBed.inject(TranslationService);
    fixture.detectChanges();

    i18n.switchLanguage('es');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')?.textContent).toContain('Acerca de CAD Engine');
    expect(root.textContent).toContain('Arquitectura de Triple Motor');
    expect(root.textContent).toContain('Compatibilidad');
    expect(root.textContent).toContain('Seguridad y limitaciones');
    expect(root.textContent).toContain('Autor y Responsable de Ingeniería');
    expect(root.textContent).toContain('Gobernanza de Cuenta / Derecho al Olvido');
    expect(root.textContent).toContain('Perfil de LinkedIn ↗');
    expect(root.textContent).toContain('Sitio Web Personal ↗');

    i18n.switchLanguage('en');
    fixture.detectChanges();
    expect(root.querySelector('h1')?.textContent).toContain('About CAD Engine');
  });

  it('opens confirmation dialog warning about CAD documents, meshes, and devices', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.modal-dialog')).toBeNull();

    const deleteBtn = root.querySelector<HTMLButtonElement>('.btn-destructive')!;
    deleteBtn.click();
    fixture.detectChanges();

    const dialog = root.querySelector('.modal-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toMatch(/PELIGRO \/ IRREVERSIBLE|DANGER \/ IRREVERSIBLE/);
    expect(dialog?.textContent).toMatch(/archivos y documentos CAD|CAD files and documents/);
    expect(dialog?.textContent).toMatch(/mallas de previsualización 3D|preview meshes/);
    expect(dialog?.textContent).toMatch(
      /máquinas y dispositivos vinculados|linked machines and devices/,
    );
  });

  it('gates the confirm button until ELIMINAR is typed exactly', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn-destructive')!.click();
    fixture.detectChanges();

    const confirmBtn = root.querySelector<HTMLButtonElement>('.btn-confirm-delete')!;
    const input = root.querySelector<HTMLInputElement>('.delete-confirm-input')!;

    // Initially disabled
    expect(confirmBtn.disabled).toBe(true);

    // Lowercase 'eliminar' does not enable
    input.value = 'eliminar';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(true);

    // Partial 'ELIM' does not enable
    input.value = 'ELIM';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(true);

    // Exact 'ELIMINAR' enables the confirm button
    input.value = 'ELIMINAR';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(false);
  });

  it('calls DELETE /api/account, clears local consent and storage, and terminates session', async () => {
    const localStorageClearSpy = vi.spyOn(Storage.prototype, 'clear');

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    // Open dialog
    fixture.componentInstance.openDeleteDialog();
    fixture.detectChanges();

    // Type ELIMINAR
    const input = fixture.nativeElement.querySelector('.delete-confirm-input') as HTMLInputElement;
    input.value = 'ELIMINAR';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Click confirm
    const confirmBtn = fixture.nativeElement.querySelector(
      '.btn-confirm-delete',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();

    expect(fakeApi.deleteAccount).toHaveBeenCalled();
    expect(fakeAuth.clearConsent).toHaveBeenCalledWith('usr-123');
    expect(localStorageClearSpy).toHaveBeenCalled();
    expect(fakeAuth.logout).toHaveBeenCalled();

    localStorageClearSpy.mockRestore();
  });

  it('displays error message when DELETE /api/account fails', async () => {
    fakeApi.deleteAccount.mockRejectedValue(new Error('Keycloak user deletion failed: HTTP 502'));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiClient, useValue: fakeApi },
      ],
    });

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    fixture.componentInstance.openDeleteDialog();
    fixture.detectChanges();

    fixture.componentInstance.deleteConfirmationInput.set('ELIMINAR');
    fixture.detectChanges();

    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();

    expect(fixture.componentInstance.errorMessage()).toContain('502');
    const errorEl = fixture.nativeElement.querySelector('.modal-error-message');
    expect(errorEl?.textContent).toContain('502');
    expect(fakeAuth.logout).not.toHaveBeenCalled();
  });
});
