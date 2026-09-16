import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeycloakAdminService } from '../src/keycloak.js';
import { DomainError } from '../src/store.js';

test('KeycloakAdminService: mock mode resolves immediately without fetch', async () => {
  let fetchCalled = false;
  const mockFetch: typeof fetch = async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  };
  const service = new KeycloakAdminService({ mock: true, fetchFn: mockFetch });
  const token = await service.getAdminToken();
  assert.equal(token, 'mock-admin-token');
  await assert.doesNotReject(() => service.deleteUser('user-123'));
  assert.equal(fetchCalled, false);
});

test('KeycloakAdminService: getAdminToken uses client_credentials when secret is provided', async () => {
  let capturedUrl = '';
  let capturedBody = '';
  const mockFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ access_token: 'secret-token-xyz' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const service = new KeycloakAdminService({
    baseUrl: 'https://auth.example.com',
    realm: 'cadgpt',
    adminRealm: 'master',
    clientId: 'test-admin',
    clientSecret: 'super-secret',
    fetchFn: mockFetch,
  });

  const token = await service.getAdminToken();
  assert.equal(token, 'secret-token-xyz');
  assert.equal(capturedUrl, 'https://auth.example.com/realms/master/protocol/openid-connect/token');
  assert.ok(capturedBody.includes('grant_type=client_credentials'));
  assert.ok(capturedBody.includes('client_id=test-admin'));
  assert.ok(capturedBody.includes('client_secret=super-secret'));
});

test('KeycloakAdminService: getAdminToken uses password credentials when user/pass are provided', async () => {
  let capturedBody = '';
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ access_token: 'password-token-abc' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const service = new KeycloakAdminService({
    baseUrl: 'https://auth.example.com',
    username: 'admin',
    password: 'password123',
    fetchFn: mockFetch,
  });

  const token = await service.getAdminToken();
  assert.equal(token, 'password-token-abc');
  assert.ok(capturedBody.includes('grant_type=password'));
  assert.ok(capturedBody.includes('username=admin'));
  assert.ok(capturedBody.includes('password=password123'));
});

test('KeycloakAdminService: getAdminToken throws DomainError(502) on token endpoint HTTP error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 });
  };
  const service = new KeycloakAdminService({
    username: 'admin',
    password: 'bad-password',
    fetchFn: mockFetch,
  });

  await assert.rejects(
    () => service.getAdminToken(),
    (err: unknown) => err instanceof DomainError && err.status === 502,
  );
});

test('KeycloakAdminService: deleteUser sends DELETE with Bearer auth and treats 204 and 404 as success', async () => {
  const calls: { url: string; method: string; auth: string | null }[] = [];
  const mockFetch: typeof fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/protocol/openid-connect/token')) {
      return new Response(JSON.stringify({ access_token: 'valid-bearer-token' }), { status: 200 });
    }
    const headers = new Headers(init?.headers);
    calls.push({
      url: urlStr,
      method: init?.method ?? 'GET',
      auth: headers.get('Authorization'),
    });
    // Return 204 for user-1 and 404 for user-2
    if (urlStr.includes('user-1')) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  };

  const service = new KeycloakAdminService({
    baseUrl: 'https://auth.example.com',
    realm: 'cadgpt',
    username: 'admin',
    password: 'pass',
    fetchFn: mockFetch,
  });

  // 204 status
  await assert.doesNotReject(() => service.deleteUser('user-1'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://auth.example.com/admin/realms/cadgpt/users/user-1');
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].auth, 'Bearer valid-bearer-token');

  // 404 status (idempotent success)
  await assert.doesNotReject(() => service.deleteUser('user-2'));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://auth.example.com/admin/realms/cadgpt/users/user-2');
});

test('KeycloakAdminService: deleteUser throws DomainError(502) on 5xx error or network failure', async () => {
  const mockFetch: typeof fetch = async (url) => {
    if (String(url).includes('/protocol/openid-connect/token')) {
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    }
    return new Response(null, { status: 500 });
  };
  const service = new KeycloakAdminService({
    username: 'admin',
    password: 'pass',
    fetchFn: mockFetch,
  });

  await assert.rejects(
    () => service.deleteUser('user-fail'),
    (err: unknown) => err instanceof DomainError && err.status === 502,
  );

  // Network rejection
  const networkErrorFetch: typeof fetch = async () => {
    throw new Error('Connection refused');
  };
  const netService = new KeycloakAdminService({
    username: 'admin',
    password: 'pass',
    fetchFn: networkErrorFetch,
  });

  await assert.rejects(
    () => netService.deleteUser('user-fail'),
    (err: unknown) => err instanceof DomainError && err.status === 502,
  );
});
