import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import type { ApiKey, ApiKeyCreated } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { KeysPage } from './keys';

/** Minimal stand-in for a `resource()` — only the members the template reads. */
function fakeResource<T>(value: T, error?: unknown) {
  return {
    value: () => value,
    hasValue: () => value !== undefined,
    isLoading: () => false,
    error: () => error,
    reload: vi.fn(),
  };
}

const key: ApiKey = {
  id: 'key-1',
  name: 'Claude desktop',
  prefix: 'abcdef123456',
  scopes: ['cad:read', 'cad:write'],
  created: Date.now() - 60_000,
  lastUsed: null,
  revoked: false,
};

function setup(
  apiKeys: ApiKey[],
  overrides: {
    createApiKey?: ReturnType<typeof vi.fn>;
    revokeApiKey?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const apiKeysResource = fakeResource<ApiKey[]>(apiKeys);
  const api = {
    createApiKey: overrides.createApiKey ?? vi.fn(),
    revokeApiKey: overrides.revokeApiKey ?? vi.fn().mockResolvedValue({ revoked: true }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkspaceStore, useValue: { apiKeys: apiKeysResource } },
      { provide: ApiClient, useValue: api },
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(KeysPage);
  fixture.detectChanges();
  return { fixture, apiKeysResource, api, root: fixture.nativeElement as HTMLElement };
}

describe('KeysPage', () => {
  it('renders the redacted key list: name, masked prefix, scopes, created, and last used', () => {
    const { root } = setup([key]);

    expect(root.textContent).toContain('Claude desktop');
    expect(root.textContent).toContain('cad_abcdef123456_');
    expect(root.textContent).toContain('Read + write');
    expect(root.textContent).toContain('Never');
  });

  it('shows a Revoke action for a non-revoked key and a struck-through Revoked state otherwise', () => {
    const revoked: ApiKey = { ...key, id: 'key-2', name: 'Old script', revoked: true };
    const { root } = setup([key, revoked]);

    expect(
      Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Revoke'),
    ).toBe(true);
    expect(root.textContent).toContain('Revoked');
    const revokedRow = Array.from(root.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Old script'),
    );
    expect(revokedRow?.classList.contains('revoked')).toBe(true);
  });

  it('shows the empty state when there are no keys yet', () => {
    const { root } = setup([]);
    expect(root.textContent).toContain('No API keys yet');
  });

  it('surfaces a load error from the keys resource', () => {
    const apiKeysResource = fakeResource<ApiKey[]>([], new Error('Could not connect. Try again.'));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStore, useValue: { apiKeys: apiKeysResource } },
        { provide: ApiClient, useValue: { createApiKey: vi.fn(), revokeApiKey: vi.fn() } },
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(KeysPage);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('Could not connect. Try again.');
  });

  it('reveals the full key exactly once after creation, then hides it and refreshes the list on dismiss', async () => {
    const created: ApiKeyCreated = {
      id: 'key-2',
      name: 'CI runner',
      prefix: 'fedcba654321',
      scopes: ['cad:read', 'cad:write'],
      key: 'cad_fedcba654321_supersecretvalue',
      created: Date.now(),
    };
    const createApiKey = vi.fn().mockResolvedValue(created);
    const { fixture, apiKeysResource, root } = setup([key], { createApiKey });

    fixture.componentInstance.model.set({ name: 'CI runner' });
    await fixture.componentInstance.createKey();
    fixture.detectChanges();

    expect(createApiKey).toHaveBeenCalledWith('CI runner', ['cad:read', 'cad:write']);
    expect(root.textContent).toContain(created.key);
    expect(root.textContent).toContain('Save this key now');
    expect(apiKeysResource.reload).not.toHaveBeenCalled();

    fixture.componentInstance.dismissCreatedKey();
    fixture.detectChanges();

    expect(root.textContent).not.toContain(created.key);
    expect(apiKeysResource.reload).toHaveBeenCalledTimes(1);
  });

  it('sends only the read scope when "Read only" is selected', async () => {
    const createApiKey = vi.fn().mockResolvedValue({
      id: 'key-3',
      name: 'Reporting bot',
      prefix: 'aaaaaaaaaaaa',
      scopes: ['cad:read'],
      key: 'cad_aaaaaaaaaaaa_secret',
      created: Date.now(),
    });
    const { fixture } = setup([key], { createApiKey });

    fixture.componentInstance.model.set({ name: 'Reporting bot' });
    fixture.componentInstance.setScope('read');
    await fixture.componentInstance.createKey();

    expect(createApiKey).toHaveBeenCalledWith('Reporting bot', ['cad:read']);
  });

  it('surfaces the API error when creation fails and keeps the create form open', async () => {
    const createApiKey = vi.fn().mockRejectedValue(new Error('Name is required.'));
    const { fixture, root } = setup([key], { createApiKey });

    fixture.componentInstance.model.set({ name: 'Broken' });
    await fixture.componentInstance.createKey();
    fixture.detectChanges();

    expect(root.textContent).toContain('Name is required.');
    expect(fixture.componentInstance.createdKey()).toBeNull();
  });

  it('revokes a key only after inline confirmation, then reloads the keys resource', async () => {
    const revokeApiKey = vi.fn().mockResolvedValue({ revoked: true });
    const { fixture, apiKeysResource, root } = setup([key], { revokeApiKey });

    const revokeButton = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revoke',
    )!;
    revokeButton.click();
    fixture.detectChanges();

    // No native confirm dialog: the row now shows an inline confirmation,
    // and revoke has not been called yet.
    expect(revokeApiKey).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Revoke this key?');

    const confirmButton = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm revoke'),
    )!;
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeApiKey).toHaveBeenCalledWith('key-1');
    expect(apiKeysResource.reload).toHaveBeenCalled();

    fixture.destroy();
  });
});
