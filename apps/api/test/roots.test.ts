import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { Store, DomainError } from '../src/store.js';
import { rootsRouter, isValidPathShape } from '../src/roots.js';
import { authenticator } from '../src/auth.js';

const cad = {
  id: 'cad',
  name: 'FreeCAD' as const,
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};

function pairDevice(store: Store, owner: string, name = 'Workstation') {
  const pair = store.begin(name, [cad]);
  store.approve(owner, pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, [cad]);
  return { deviceId: device.deviceId!, credential: device.credential! };
}

function stubAuth(map: Record<string, string>) {
  return async (header?: string, _scope?: string) => {
    if (!header?.startsWith('Bearer ')) throw new DomainError(401, 'Authorization required.');
    const token = header.slice(7);
    const owner = map[token];
    if (!owner) throw new DomainError(401, 'Invalid token.');
    return owner;
  };
}

function buildApp(store: Store, auth: (h?: string, scope?: string) => Promise<string>) {
  const app = express();
  app.use(express.json());
  app.use(rootsRouter(store, { auth }));
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      e instanceof DomainError
        ? e.status
        : typeof e === 'object' && e !== null && 'issues' in e
          ? 400
          : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'error' });
  });
  return app;
}

async function testServer(
  store: Store,
  authMap: Record<string, string> = { 'alice-token': 'alice', 'bob-token': 'bob' },
) {
  const app = buildApp(store, stubAuth(authMap));
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  };
}

// --- P1.1.1 (RED) Tests: Owner invariant & OIDC-only enforcement ---

test('owner invariant: body-supplied owner field is rejected or ignored (never overrides session sub)', async () => {
  const store = new Store(':memory:');
  const { deviceId } = pairDevice(store, 'alice', 'AliceWS');
  const { base, close } = await testServer(store);
  try {
    // Attempt to pass `owner: 'bob'` in the request body while authenticated as Alice
    const res = await fetch(`${base}/api/devices/${deviceId}/roots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer alice-token',
      },
      body: JSON.stringify({ path: '/home/alice/projects', owner: 'bob' }),
    });

    if (res.status === 201) {
      // If the endpoint ignored the field, the stored row's owner MUST be alice
      const body = (await res.json()) as { id: string; owner: string; path: string };
      assert.equal(body.owner, 'alice');
      const roots = store.listRoots('alice', deviceId);
      assert.equal(roots.length, 1);
      assert.equal(roots[0].owner, 'alice');
      // Bob must not see it
      assert.throws(() => store.listRoots('bob', deviceId));
    } else {
      // Strict schema rejection (400) is also compliant per spec
      assert.equal(res.status, 400);
      const roots = store.listRoots('alice', deviceId);
      assert.equal(roots.length, 0);
    }
  } finally {
    await close();
  }
});

test('device credential or API key cannot manage allowlist (returns 401/403)', async () => {
  const store = new Store(':memory:');
  const { deviceId, credential } = pairDevice(store, 'alice', 'AliceWS');
  const apiKey = store.createApiKey('alice', 'test-key', []);
  const { base, close } = await testServer(store);
  try {
    // 1. Device credential on POST /api/devices/:deviceId/roots
    const devPost = await fetch(`${base}/api/devices/${deviceId}/roots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({ path: '/home/alice/cad' }),
    });
    assert.ok(devPost.status === 401 || devPost.status === 403);

    // 2. API key on POST /api/devices/:deviceId/roots
    const keyPost = await fetch(`${base}/api/devices/${deviceId}/roots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey.key}`,
      },
      body: JSON.stringify({ path: '/home/alice/cad' }),
    });
    assert.ok(keyPost.status === 401 || keyPost.status === 403);

    // 3. Device credential on GET /api/devices/:deviceId/roots
    const devGet = await fetch(`${base}/api/devices/${deviceId}/roots`, {
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.ok(devGet.status === 401 || devGet.status === 403);

    // 4. API key on GET /api/devices/:deviceId/roots
    const keyGet = await fetch(`${base}/api/devices/${deviceId}/roots`, {
      headers: { authorization: `Bearer ${apiKey.key}` },
    });
    assert.ok(keyGet.status === 401 || keyGet.status === 403);

    // 5. Authenticator unit test: presenting cad_ key to OIDC auth fails with 401
    const auth = authenticator(
      'https://issuer.example',
      'cadgpt-api',
      'https://issuer.example/jwks',
    );
    await assert.rejects(
      auth(`Bearer ${apiKey.key}`, 'cad:write'),
      (e: unknown) => (e as { status?: number }).status === 401,
    );
  } finally {
    await close();
  }
});

// --- P1.1.5 Tests: Storage, Scoping, Session-derived owner, Path Validation ---

test('root stored per owner and device', async () => {
  const store = new Store(':memory:');
  const d1 = pairDevice(store, 'alice', 'WS1');
  const d2 = pairDevice(store, 'alice', 'WS2');
  const { base, close } = await testServer(store);
  try {
    const postRes = await fetch(`${base}/api/devices/${d1.deviceId}/roots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer alice-token',
      },
      body: JSON.stringify({ path: '/home/alice/ws1-cad' }),
    });
    assert.equal(postRes.status, 201);

    const getRes1 = await fetch(`${base}/api/devices/${d1.deviceId}/roots`, {
      headers: { authorization: 'Bearer alice-token' },
    });
    assert.equal(getRes1.status, 200);
    const roots1 = (await getRes1.json()) as { path: string; deviceId: string }[];
    assert.equal(roots1.length, 1);
    assert.equal(roots1[0].path, '/home/alice/ws1-cad');
    assert.equal(roots1[0].deviceId, d1.deviceId);

    // d2 has no roots
    const getRes2 = await fetch(`${base}/api/devices/${d2.deviceId}/roots`, {
      headers: { authorization: 'Bearer alice-token' },
    });
    assert.equal(getRes2.status, 200);
    const roots2 = (await getRes2.json()) as unknown[];
    assert.equal(roots2.length, 0);
  } finally {
    await close();
  }
});

test('root invisible to other owners (no existence leak)', async () => {
  const store = new Store(':memory:');
  const d1 = pairDevice(store, 'alice', 'AliceWS');
  store.addRoot('alice', d1.deviceId, '/home/alice/designs');

  const { base, close } = await testServer(store);
  try {
    // Bob attempts to list roots for Alice's device
    const bobGet = await fetch(`${base}/api/devices/${d1.deviceId}/roots`, {
      headers: { authorization: 'Bearer bob-token' },
    });
    assert.equal(bobGet.status, 404);

    // Bob attempts to delete Alice's root
    const aliceRoots = store.listRoots('alice', d1.deviceId);
    assert.equal(aliceRoots.length, 1);
    const bobDelete = await fetch(`${base}/api/roots/${aliceRoots[0].id}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer bob-token' },
    });
    assert.equal(bobDelete.status, 404);
    assert.equal(store.listRoots('alice', d1.deviceId).length, 1);
  } finally {
    await close();
  }
});

test('add derives owner from session and DELETE removes root', async () => {
  const store = new Store(':memory:');
  const d1 = pairDevice(store, 'alice', 'AliceWS');
  const { base, close } = await testServer(store);
  try {
    const postRes = await fetch(`${base}/api/devices/${d1.deviceId}/roots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer alice-token',
      },
      body: JSON.stringify({ path: '/home/alice/models' }),
    });
    assert.equal(postRes.status, 201);
    const created = (await postRes.json()) as { id: string; owner: string; path: string };
    assert.equal(created.owner, 'alice');
    assert.equal(created.path, '/home/alice/models');

    // DELETE by owner succeeds
    const delRes = await fetch(`${base}/api/roots/${created.id}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer alice-token' },
    });
    assert.equal(delRes.status, 200);
    assert.equal(store.listRoots('alice', d1.deviceId).length, 0);
  } finally {
    await close();
  }
});

test('server-side path shape validation accepts POSIX, Windows, UNC and rejects relative, .., NUL', () => {
  // Valid paths
  assert.equal(isValidPathShape('/home/alice/cad'), true);
  assert.equal(isValidPathShape('/'), true);
  assert.equal(isValidPathShape('C:\\Users\\alice\\cad'), true);
  assert.equal(isValidPathShape('C:/Users/alice/cad'), true);
  assert.equal(isValidPathShape('d:\\projects'), true);
  assert.equal(isValidPathShape('\\\\server\\share\\cad'), true);
  assert.equal(isValidPathShape('//server/share/cad'), true);

  // Invalid paths
  assert.equal(isValidPathShape('relative/path'), false);
  assert.equal(isValidPathShape('./relative'), false);
  assert.equal(isValidPathShape('../relative'), false);
  assert.equal(isValidPathShape('C:relative'), false);
  assert.equal(isValidPathShape('/path/../escape'), false);
  assert.equal(isValidPathShape('C:\\path\\..\\escape'), false);
  assert.equal(isValidPathShape('\\\\server\\share\\..\\escape'), false);
  assert.equal(isValidPathShape('/path/\0/evil'), false);
  assert.equal(isValidPathShape(''), false);
});

test('store triad methods enforce device ownership and foreign isolation', () => {
  const store = new Store(':memory:');
  const d1 = pairDevice(store, 'alice', 'AliceWS');

  // addRoot validates device ownership
  assert.throws(
    () => store.addRoot('bob', d1.deviceId, '/opt/cad'),
    (e: unknown) => e instanceof DomainError && e.status === 404,
  );

  // addRoot validates path shape
  assert.throws(
    () => store.addRoot('alice', d1.deviceId, 'relative/path'),
    (e: unknown) => e instanceof DomainError && e.status === 400,
  );

  // Happy addRoot
  const r1 = store.addRoot('alice', d1.deviceId, '/home/alice/cad');
  assert.equal(r1.owner, 'alice');
  assert.equal(r1.path, '/home/alice/cad');
  assert.equal(r1.deviceId, d1.deviceId);

  // Duplicate rejected with 409
  assert.throws(
    () => store.addRoot('alice', d1.deviceId, '/home/alice/cad'),
    (e: unknown) => e instanceof DomainError && e.status === 409,
  );

  // listRoots requires device ownership
  assert.throws(
    () => store.listRoots('bob', d1.deviceId),
    (e: unknown) => e instanceof DomainError && e.status === 404,
  );

  // removeRoot requires owner match
  assert.throws(
    () => store.removeRoot('bob', r1.id),
    (e: unknown) => e instanceof DomainError && e.status === 404,
  );
  assert.deepEqual(store.removeRoot('alice', r1.id), { removed: true });
  assert.equal(store.listRoots('alice', d1.deviceId).length, 0);
});

// --- P1.2.1: Heartbeat delivery of allowlist ---

test('heartbeat carries allowlist snapshot for the polling device', () => {
  const store = new Store(':memory:');
  const d = pairDevice(store, 'alice', 'AliceWS');

  // Device D has 2 allowed roots
  store.addRoot('alice', d.deviceId, '/home/alice/projects');
  store.addRoot('alice', d.deviceId, '/home/alice/models');

  const res = store.heartbeat(d.credential, [cad]);
  assert.equal(res.job, null);
  assert.ok(Array.isArray(res.allowedRoots));
  assert.equal(res.allowedRoots.length, 2);
  assert.ok(res.allowedRoots.includes('/home/alice/projects'));
  assert.ok(res.allowedRoots.includes('/home/alice/models'));
});

test('revocation reflected on subsequent heartbeat poll', () => {
  const store = new Store(':memory:');
  const d = pairDevice(store, 'alice', 'AliceWS');

  const r1 = store.addRoot('alice', d.deviceId, '/home/alice/projects');
  const r2 = store.addRoot('alice', d.deviceId, '/home/alice/models');

  const initial = store.heartbeat(d.credential, [cad]);
  assert.equal(initial.allowedRoots.length, 2);

  // Revoke r1
  store.removeRoot('alice', r1.id);

  // Next heartbeat poll reflects the removal
  const next = store.heartbeat(d.credential, [cad]);
  assert.equal(next.allowedRoots.length, 1);
  assert.deepEqual(next.allowedRoots, ['/home/alice/models']);
});
