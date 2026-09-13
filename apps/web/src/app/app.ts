import { Component, OnInit, signal, computed } from '@angular/core';
import { form, FormField, min, max, maxLength } from '@angular/forms/signals';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

interface Cad { id: string; name: string; path: string; version: string; executable: boolean; }
interface Device { id: string; name: string; online: boolean; revoked: boolean; cads: Cad[]; }
interface Job { id: string; status: string; result: string; }
@Component({ selector: 'app-root', imports: [FormField], templateUrl: './app.html', styleUrl: './app.css' })
export class App implements OnInit {
  readonly user = signal('');
  readonly devices = signal<Device[]>([]);
  readonly jobs = signal<Job[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly ready = signal(false);
  readonly model = signal({ code: '', deviceId: '', cadId: '', length: 10, width: 10, height: 10, confirmed: false });
  readonly fields = form(this.model, p => {
    maxLength(p.code, 12);
    for (const dimension of [p.length, p.width, p.height]) { min(dimension, 0.01); max(dimension, 10000); }
  });
  readonly selected = computed(() => this.devices().find(d => d.id === this.model().deviceId));
  private manager?: UserManager;
  private accessToken = '';

  async ngOnInit() {
    await this.run(async () => {
      const config = await this.request<{ issuer: string; clientId: string; scopes: string }>('/api/config');
      this.manager = new UserManager({
        authority: config.issuer, client_id: config.clientId,
        redirect_uri: location.origin + '/callback', post_logout_redirect_uri: location.origin,
        response_type: 'code', scope: config.scopes,
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
        automaticSilentRenew: false, loadUserInfo: false,
      });
      if (location.pathname === '/callback') {
        await this.manager.signinRedirectCallback();
        history.replaceState({}, '', '/');
      }
      const user = await this.manager.getUser();
      if (user && !user.expired) {
        this.accessToken = user.access_token;
        this.user.set(user.profile.preferred_username ?? 'Your account');
        await this.refreshData();
      }
      this.ready.set(true);
    });
  }
  async login() { await this.run(async () => { await this.manager?.signinRedirect(); }); }
  async logout() { await this.run(async () => { await this.manager?.signoutRedirect(); }); }
  async refresh() { await this.run(() => this.refreshData()); }
  private async refreshData() {
    this.devices.set(await this.request<Device[]>('/api/devices'));
    this.jobs.set(await this.request<Job[]>('/api/jobs'));
  }
  async pair() {
    await this.run(async () => {
      await this.request('/api/pairings/approve', 'POST', { userCode: this.model().code.trim() });
      this.notice.set('Pairing approved. Keep the agent open; then refresh to see your device.');
      this.model.update(m => ({ ...m, code: '' }));
      await this.refreshData();
    });
  }
  async revoke(id: string) {
    if (!window.confirm('Revoke this device? Queued jobs will be cancelled. A job already executing may finish locally.')) return;
    await this.run(async () => { await this.request('/api/devices/' + id, 'DELETE'); await this.refreshData(); });
  }
  select(device: Device, cad: Cad) {
    this.model.update(m => ({ ...m, deviceId: device.id, cadId: cad.id, confirmed: false }));
    document.getElementById('job-panel')?.scrollIntoView({ behavior: 'smooth' });
  }
  async createBox() {
    await this.run(async () => {
      const { code: _code, ...payload } = this.model();
      await this.request('/api/jobs', 'POST', payload);
      this.notice.set('Job queued for this device. Refresh to check the result.');
      this.model.update(m => ({ ...m, confirmed: false }));
      await this.refreshData();
    });
  }
  private async request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', ...(this.accessToken ? { Authorization: 'Bearer ' + this.accessToken } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Sign out and sign in again.' : data.error ?? 'Request failed.');
    return data as T;
  }
  private async run(action: () => Promise<void>) {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await action(); } catch (e) { this.error.set(e instanceof Error ? e.message : 'Could not connect. Try again.'); }
    finally { this.busy.set(false); }
  }
}
