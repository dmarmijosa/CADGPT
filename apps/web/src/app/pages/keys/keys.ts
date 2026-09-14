import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { ApiClient } from '../../core/api/api-client';
import type { ApiKeyCreated, ApiKeyScope } from '../../core/api/models';
import { WorkspaceStore } from '../../core/state/workspace.store';

/**
 * Guarded API key management page. Lists every key this owner has minted
 * (`WorkspaceStore.apiKeys` — redacted, never the hash or full secret),
 * lets them mint a new one, and reveals the full secret exactly once right
 * after creation (never persisted client-side, e.g. no `localStorage`).
 * Revoking asks for inline confirmation (no `window.confirm`/`alert`),
 * mirroring `DevicesPage`.
 *
 * `mcpUrl` intentionally uses `location.origin + '/mcp'`, matching
 * `ConnectPage`'s own resource-URL computation, rather than
 * `environment.apiBaseUrl + '/mcp'`: `apiBaseUrl` is `''` in both
 * environment files (by design — the built app stays relative so it works
 * behind any host), so that concatenation would render a bare `/mcp`,
 * useless once pasted into an external client on another origin.
 */
@Component({
  selector: 'app-keys-page',
  imports: [FormField, DatePipe],
  templateUrl: './keys.html',
})
export class KeysPage {
  readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(ApiClient);

  readonly mcpUrl = location.origin + '/mcp';

  readonly busy = signal(false);
  readonly error = signal('');
  readonly model = signal({ name: '' });
  readonly fields = form(this.model, (p) => {
    required(p.name);
    maxLength(p.name, 60);
  });
  readonly scope = signal<'read' | 'read_write'>('read_write');

  readonly createdKey = signal<ApiKeyCreated | null>(null);
  readonly copied = signal(false);

  readonly confirmingRevoke = signal<string | null>(null);
  readonly revoking = signal(false);
  readonly revokeError = signal('');

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not connect. Try again.';
  }

  scopeLabel(scopes: ApiKeyScope[]): string {
    return scopes.includes('cad:write') ? 'Read + write' : 'Read only';
  }

  setScope(value: string): void {
    this.scope.set(value === 'read' ? 'read' : 'read_write');
  }

  async createKey(): Promise<void> {
    const name = this.model().name.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const scopes: ApiKeyScope[] =
        this.scope() === 'read' ? ['cad:read'] : ['cad:read', 'cad:write'];
      const created = await this.api.createApiKey(name, scopes);
      this.createdKey.set(created);
      this.model.set({ name: '' });
      this.scope.set('read_write');
    } catch (e) {
      this.error.set(this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async copyKey(): Promise<void> {
    const created = this.createdKey();
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. an insecure context) — the key is
      // still visible and selectable on the page.
    }
  }

  /** Clears the one-time panel, then reloads the list — the newly created
   * (redacted) key only appears in the table from this point on. */
  dismissCreatedKey(): void {
    this.createdKey.set(null);
    this.workspace.apiKeys.reload();
  }

  askRevoke(id: string): void {
    this.revokeError.set('');
    this.confirmingRevoke.set(id);
  }

  cancelRevoke(): void {
    this.confirmingRevoke.set(null);
  }

  async confirmRevoke(id: string): Promise<void> {
    this.revoking.set(true);
    this.revokeError.set('');
    try {
      await this.api.revokeApiKey(id);
      this.confirmingRevoke.set(null);
      this.workspace.apiKeys.reload();
    } catch (e) {
      this.revokeError.set(this.errorMessage(e));
    } finally {
      this.revoking.set(false);
    }
  }
}
