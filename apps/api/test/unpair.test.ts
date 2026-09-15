import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { Store, DomainError } from '../src/store.js';

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

const token = (r: Request) => {
  const h = r.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new DomainError(401, 'Device credential required.');
  return h.slice(7);
};

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);

function buildApp(store: Store) {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/agent/unpair',
    wrap((q, r) => r.json(store.unpair(token(q)))),
  );
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = e instanceof DomainError ? e.status : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'error' });
  });
  return app;
}

async function startServer(store: Store) {
  const app = buildApp(store);
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function postUnpair(origin: string, bearer?: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer) {
      headers['Authorization'] = `Bearer ${bearer}`;
    }
    const req = httpRequest(`${origin}/api/agent/unpair`, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 500, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify({}));
  });
}

test('store.unpair revokes device, cancels queued jobs, and prevents further heartbeats', () => {
  const store = new Store(':memory:');
  const d1 = pairDevice(store, 'alice', 'Workstation 1');
  const d2 = pairDevice(store, 'alice', 'Workstation 2');

  const j1 = store.enqueue('alice', {
    deviceId: d1.deviceId,
    cadId: 'cad',
    length: 10,
    width: 20,
    height: 30,
    confirmed: true,
  });
  const j2 = store.enqueue('alice', {
    deviceId: d2.deviceId,
    cadId: 'cad',
    length: 10,
    width: 20,
    height: 30,
    confirmed: true,
  });

  const result = store.unpair(d1.credential);
  assert.deepEqual(result, { unpaired: true, deviceId: d1.deviceId });

  // d1 is revoked: heartbeat throws 401
  assert.throws(
    () => store.heartbeat(d1.credential, [cad]),
    (e: any) => e.status === 401,
  );

  // Calling unpair again throws 401
  assert.throws(
    () => store.unpair(d1.credential),
    (e: any) => e.status === 401,
  );

  // j1 was queued and is now cancelled
  const aliceJobs = store.jobs('alice');
  const job1 = aliceJobs.find((j: any) => j.id === j1.id);
  assert.equal(job1.status, 'cancelled');

  // d2 is unaffected
  const job2 = aliceJobs.find((j: any) => j.id === j2.id);
  assert.equal(job2.status, 'queued');
  const hb = store.heartbeat(d2.credential, [cad]);
  assert.equal(hb.job?.id, j2.id);
});

test('HTTP POST /api/agent/unpair requires valid Bearer token and revokes device', async () => {
  const store = new Store(':memory:');
  const server = await startServer(store);

  try {
    const dev = pairDevice(store, 'bob', 'BobStation');

    // 1. Missing Authorization header -> 401
    const noAuth = await postUnpair(server.origin);
    assert.equal(noAuth.status, 401);

    // 2. Invalid Bearer token -> 401
    const badAuth = await postUnpair(server.origin, 'invalid-token-12345');
    assert.equal(badAuth.status, 401);

    // 3. Valid Bearer token -> 200 { unpaired: true, deviceId }
    const success = await postUnpair(server.origin, dev.credential);
    assert.equal(success.status, 200);
    assert.equal(success.body.unpaired, true);
    assert.equal(success.body.deviceId, dev.deviceId);

    // 4. Repeated unpair with same token -> 401 (already revoked)
    const repeat = await postUnpair(server.origin, dev.credential);
    assert.equal(repeat.status, 401);
  } finally {
    await server.close();
  }
});
