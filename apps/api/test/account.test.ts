import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, DomainError } from '../src/store.js';
import { accountRouter } from '../src/account.js';

const cad = {
  id: 'cad',
  name: 'FreeCAD',
  version: '0.21',
  path: '/usr/bin/freecadcmd',
  executable: true,
};

test('account router: unauthenticated request is rejected with 401', async () => {
  const store = new Store(':memory:');
  const app = express();
  const authMock = async (header: string | undefined) => {
    if (!header?.startsWith('Bearer ')) throw new DomainError(401, 'Unauthorized');
    return 'alice';
  };
  const keycloakMock = { deleteUser: async () => {} };
  app.use(accountRouter(store, { dataDir: tmpdir(), auth: authMock, keycloak: keycloakMock }));
  app.use((err: unknown, _req: any, res: any, _next: any) => {
    const status = err instanceof DomainError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/account`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('account router: missing cad:write scope is rejected with 403', async () => {
  const store = new Store(':memory:');
  const app = express();
  const authMock = async (_header: string | undefined, scope?: string) => {
    if (scope === 'cad:write') throw new DomainError(403, 'Forbidden');
    return 'alice';
  };
  const keycloakMock = { deleteUser: async () => {} };
  app.use(accountRouter(store, { dataDir: tmpdir(), auth: authMock, keycloak: keycloakMock }));
  app.use((err: unknown, _req: any, res: any, _next: any) => {
    const status = err instanceof DomainError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer read-only-token' },
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('account router: Keycloak failure aborts and returns 502 without modifying database', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cadgpt-test-kc-fail-'));
  const meshesDir = join(tempDir, 'meshes');
  mkdirSync(meshesDir, { recursive: true });

  const store = new Store(':memory:');
  const pair = store.begin('Alice-WS', [cad]);
  store.approve('alice', pair.userCode);
  const dev = store.poll(pair.deviceSecret) as { deviceId: string; credential: string };
  store.createDocument('alice', dev.deviceId, 'FreeCAD', 'Doc1');

  const app = express();
  const authMock = async () => 'alice';
  const keycloakMock = {
    deleteUser: async () => {
      throw new DomainError(502, 'Keycloak user deletion failed.');
    },
  };
  app.use(accountRouter(store, { dataDir: tempDir, auth: authMock, keycloak: keycloakMock }));
  app.use((err: unknown, _req: any, res: any, _next: any) => {
    const status = err instanceof DomainError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.equal(res.status, 502);

    // Verify Alice's document is still in database
    const docs = store.listDocuments('alice');
    assert.equal(docs.length, 1);
  } finally {
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('account router: happy path purges user data, unlinks meshes, returns 204, and enforces anti-IDOR', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cadgpt-test-account-happy-'));
  const meshesDir = join(tempDir, 'meshes');
  mkdirSync(meshesDir, { recursive: true });

  const store = new Store(':memory:');
  // Alice setup
  const aPair = store.begin('Alice-WS', [cad]);
  store.approve('alice', aPair.userCode);
  const aDev = store.poll(aPair.deviceSecret) as { deviceId: string; credential: string };
  store.heartbeat(aDev.credential, [cad]);
  const aDoc = store.createDocument('alice', aDev.deviceId, 'FreeCAD', 'AliceDoc');
  const aJob = store.enqueue(
    'alice',
    { deviceId: aDev.deviceId, cadId: 'cad', confirmed: true },
    'create_box',
    aDoc.id,
  );
  store.recordMesh({
    jobId: aJob.id,
    documentId: aDoc.id,
    deviceId: aDev.deviceId,
    size: 100,
    sha256: 'a'.repeat(64),
  });
  const aStl = join(meshesDir, `${aJob.id}.stl`);
  writeFileSync(aStl, 'stl-bytes');

  // Bob setup (should remain untouched)
  const bPair = store.begin('Bob-WS', [cad]);
  store.approve('bob', bPair.userCode);
  const bDev = store.poll(bPair.deviceSecret) as { deviceId: string; credential: string };
  store.createDocument('bob', bDev.deviceId, 'FreeCAD', 'BobDoc');

  let keycloakDeletedUser: string | null = null;
  const keycloakMock = {
    deleteUser: async (userId: string) => {
      keycloakDeletedUser = userId;
    },
  };
  const authMock = async () => 'alice';

  const app = express();
  app.use(express.json());
  app.use(accountRouter(store, { dataDir: tempDir, auth: authMock, keycloak: keycloakMock }));

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // Attempt IDOR by supplying owner=bob in query string and body
    const res = await fetch(`http://127.0.0.1:${port}/api/account?owner=bob`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ owner: 'bob', userId: 'bob' }),
    });
    assert.equal(res.status, 204);
    assert.equal(
      keycloakDeletedUser,
      'alice',
      'Must delete alice in Keycloak, ignoring query/body params',
    );

    // Alice is purged
    assert.equal(store.listDocuments('alice').length, 0);
    assert.equal(existsSync(aStl), false);

    // Bob is untouched
    assert.equal(store.listDocuments('bob').length, 1);

    // Also test alias /api/users/me
    const resMe = await fetch(`http://127.0.0.1:${port}/api/users/me`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.equal(resMe.status, 204);
  } finally {
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
