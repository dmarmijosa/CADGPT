import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AboutPage } from './about';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client';

describe('AboutPage (spec user-account-lifecycle & dashboard-routing)', () => {
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

  it('renders AutoCAD 2026 Core Console 13-op parity and LT detection-only disclaimer in compatibility table', () => {
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
    expect(tableText).toContain('AutoCAD 2026 Core Console');
    expect(tableText).toContain('Full 13-operation headless execution');
    expect(tableText).toContain('MASSPROP');
    expect(tableText).toContain('binary STL preview via headless STLOUT');
    expect(tableText).toContain('AutoCAD LT');
    expect(tableText).toContain('Installation detection only; execution disabled');
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
    expect(dialog?.textContent).toContain('PELIGRO / IRREVERSIBLE');
    expect(dialog?.textContent).toContain('archivos y documentos CAD');
    expect(dialog?.textContent).toContain('mallas de previsualización 3D');
    expect(dialog?.textContent).toContain('máquinas y dispositivos vinculados');
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
