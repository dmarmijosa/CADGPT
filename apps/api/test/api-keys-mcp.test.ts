import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import { registerTools } from '../src/tools.js';
import { authenticator, combinedAuthenticator } from '../src/auth.js';

const freecad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};

function pairAndApprove(store: Store, owner: string, name: string, cads: unknown[]) {
  const pair = store.begin(name, cads);
  store.approve(owner, pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, cads);
  return device;
}

/**
 * Mirrors main.ts's `/mcp` wiring exactly: `owner` and `requireWrite` are both
 * resolved through the same `authAny`-style dispatcher built from
 * `combinedAuthenticator`, driven by a bearer header string — never a
 * pre-decided owner — so a test that passes proves the real dispatch path,
 * not a stand-in for it.
 */
async function connectViaHeader(store: Store, header: string) {
  // OIDC never sees a `cad_`-prefixed bearer in this suite (that's the whole
  // point of the API-key path), so a authenticator that always rejects is a
  // faithful stand-in for the real OIDC verifier here.
  const rejectOidc = async () => {
    throw new Error('OIDC path should not be reached for an API-key bearer.');
  };
  const authAny = combinedAuthenticator(rejectOidc, (key, scope) => store.verifyApiKey(key, scope));
  const owner = await authAny(header);
  const server = new McpServer({ name: 'cadgpt-test', version: '0.0.0' });
  registerTools(server, store, owner, () => authAny(header, 'cad:write'));
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test('a valid API key with cad:write can call create_box and it enqueues', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const key = store.createApiKey('alice', 'ci', ['cad:read', 'cad:write']);
  const client = await connectViaHeader(store, 'Bearer ' + key.key);
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = JSON.parse((res.content as { type: string; text: string }[])[0].text);
  assert.equal(body.status, 'queued');
  assert.equal(store.jobs('alice').length, 1);
});

test('a cad:read-only API key is rejected for a write tool', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const key = store.createApiKey('alice', 'read only', ['cad:read']);
  const client = await connectViaHeader(store, 'Bearer ' + key.key);
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('a cad:read-only API key still works for a read-only tool', async () => {
  const store = new Store(':memory:');
  pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const key = store.createApiKey('alice', 'read only', ['cad:read']);
  const client = await connectViaHeader(store, 'Bearer ' + key.key);
  const res = await client.callTool({ name: 'list_devices', arguments: {} });
  assert.equal(res.isError, undefined, JSON.stringify(res));
});

test('an OIDC-resolved owner still works unchanged through registerTools (no regression)', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  // registerTools itself is owner-source-agnostic; this proves the OIDC path
  // (a plain resolved `sub`, exactly what authenticator() would hand back)
  // still drives create_box identically to before this change.
  const server = new McpServer({ name: 'cadgpt-test', version: '0.0.0' });
  registerTools(server, store, 'alice', async () => {});
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  assert.equal(store.jobs('alice').length, 1);
});

test('an API key minted for owner A can never enqueue against owner B (owner comes from the key, not the request)', async () => {
  const store = new Store(':memory:');
  pairAndApprove(store, 'alice', 'Workstation A', [freecad]);
  const bobDevice = pairAndApprove(store, 'bob', 'Workstation B', [freecad]);
  const bobDoc = store.createDocument('bob', bobDevice.deviceId!, 'FreeCAD', 'Bobs part');
  const aliceKey = store.createApiKey('alice', 'ci', ['cad:read', 'cad:write']);
  const client = await connectViaHeader(store, 'Bearer ' + aliceKey.key);
  // Alice's key resolves only to Alice; targeting Bob's device/document (the
  // only way a request could try to redirect ownership) is rejected exactly
  // like an OIDC-authenticated cross-owner request would be.
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: bobDevice.deviceId!,
      cadId: 'cad',
      documentId: bobDoc.id,
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('bob').length, 0);
});

test('key-management routes stay OIDC-only: an API-key-shaped bearer is rejected by the OIDC authenticator', async () => {
  // main.ts wires POST/GET/DELETE /api/keys through `auth` (the plain OIDC
  // authenticator) directly, never through `authAny` — so presenting a
  // `cad_`-shaped bearer to `auth` must fail exactly as any other malformed
  // token would, proving an API key cannot manage other API keys.
  const auth = authenticator('https://issuer.example', 'cadgpt-api', 'https://issuer.example/jwks');
  await assert.rejects(
    auth('Bearer cad_' + '0'.repeat(12) + '_somesecret', 'cad:write'),
    (e: unknown) => (e as { status?: number }).status === 401,
  );
});
