import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Store, DomainError } from '../src/store.js';
import { meshRouter } from '../src/mesh.js';

const cad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};

/** A minimal valid binary STL: 80-byte header + 4-byte facet count + facets*50 bytes. */
function stl(facets: number, fill = 0xab): Buffer {
  const header = Buffer.alloc(80, fill);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(facets, 0);
  return Buffer.concat([header, count, Buffer.alloc(facets * 50, fill)]);
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function pairDevice(store: Store, owner: string, name: string) {
  const pair = store.begin(name, [cad]);
  store.approve(owner, pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, [cad]);
  return device as { deviceId: string; credential: string };
}

/** Enqueue `create_box` for `documentId` and let the device claim it into `running`. */
function runningJob(
  store: Store,
  owner: string,
  device: { deviceId: string; credential: string },
  documentId: string,
): string {
  store.enqueue(
    owner,
    { deviceId: device.deviceId, cadId: 'cad', confirmed: true },
    'create_box',
    documentId,
  );
  const picked = store.heartbeat(device.credential, [cad]);
  assert.ok(picked.job);
  return (picked.job as { id: string }).id;
}

function stubAuth(map: Record<string, string>) {
  return async (header?: string) => {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const owner = token ? map[token] : undefined;
    if (!owner) throw new DomainError(401, 'Invalid token.');
    return owner;
  };
}

function buildApp(store: Store, dataDir: string, auth: (h?: string) => Promise<string>) {
  const app = express();
  app.use(meshRouter(store, { dataDir, auth }));
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = e instanceof DomainError ? e.status : e instanceof z.ZodError ? 400 : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'error' });
  });
  return app;
}

function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cadgpt-mesh-'));
  mkdirSync(join(dir, 'meshes'), { recursive: true, mode: 0o700 });
  return dir;
}

function meshFile(dataDir: string, jobId: string): string {
  return join(dataDir, 'meshes', jobId + '.stl');
}

/** One store + one owned device + one document + a listening app, ready for a test body. */
async function scenario(auth: Record<string, string> = {}) {
  const dataDir = tempDataDir();
  const store = new Store(':memory:');
  const device = pairDevice(store, 'alice', 'WS');
  const doc = store.createDocument('alice', device.deviceId, 'FreeCAD', 'Bracket');
  const server = createServer(buildApp(store, dataDir, stubAuth(auth)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    store,
    dataDir,
    device,
    doc,
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  };
}

function postMesh(
  base: string,
  jobId: string,
  credential: string,
  body: Buffer,
  opts: { sha?: string; query?: string; headers?: Record<string, string> } = {},
) {
  return fetch(base + '/api/agent/jobs/' + jobId + '/mesh' + (opts.query ?? ''), {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + credential,
      'content-type': 'application/octet-stream',
      'x-mesh-sha256': opts.sha ?? sha256(body),
      ...opts.headers,
    },
    body,
  });
}

test('5.1 (RED->GREEN) oversized upload is rejected and stores nothing', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario();
  try {
    const jobId = runningJob(store, 'alice', device, doc.id);
    const big = Buffer.alloc(25 * 1024 * 1024 + 1);
    const res = await postMesh(base, jobId, device.credential, big);
    assert.equal(res.status, 413);
    assert.equal(existsSync(meshFile(dataDir, jobId)), false);
    assert.equal(existsSync(meshFile(dataDir, jobId) + '.part'), false);
    assert.equal(store.meshesForDocument(doc.id).length, 0);
  } finally {
    await close();
  }
});

test('5.1 chunked uploads without Content-Length are refused before any byte is stored', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario();
  try {
    const jobId = runningJob(store, 'alice', device, doc.id);
    const url = new URL(base + '/api/agent/jobs/' + jobId + '/mesh');
    // Without Content-Length only the streamed byte counter could bound the
    // body, so the route demands a declared length up front (411). Node's HTTP
    // parser then caps the body at that length, and the streamed counter stays
    // as defence in depth.
    const status = await new Promise<number | undefined>((resolve) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + device.credential,
            'content-type': 'application/octet-stream',
            'x-mesh-sha256': '0'.repeat(64),
            'transfer-encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', () => resolve(undefined));
      req.write(Buffer.alloc(4096));
      req.end();
    });
    assert.equal(status, 411);
    assert.equal(existsSync(meshFile(dataDir, jobId)), false);
    assert.equal(existsSync(meshFile(dataDir, jobId) + '.part'), false);
    assert.equal(store.meshesForDocument(doc.id).length, 0);
  } finally {
    await close();
  }
});

test('5.1 mismatched X-Mesh-Sha256 is rejected and stores nothing', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario();
  try {
    const jobId = runningJob(store, 'alice', device, doc.id);
    const res = await postMesh(base, jobId, device.credential, stl(2), { sha: '0'.repeat(64) });
    assert.equal(res.status, 400);
    assert.equal(existsSync(meshFile(dataDir, jobId)), false);
    assert.equal(store.meshesForDocument(doc.id).length, 0);
  } finally {
    await close();
  }
});

test('5.1 non-binary ASCII STL is rejected', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario();
  try {
    const jobId = runningJob(store, 'alice', device, doc.id);
    const body = Buffer.from('solid cube\n' + 'facet normal 0 0 0\n'.repeat(5) + 'endsolid cube\n');
    const res = await postMesh(base, jobId, device.credential, body);
    assert.equal(res.status, 400);
    assert.equal(existsSync(meshFile(dataDir, jobId)), false);
  } finally {
    await close();
  }
});

test('5.1 upload to a non-running job is rejected', async () => {
  const { store, doc, device, base, close } = await scenario();
  try {
    // stays 'queued' — heartbeat is never called again to claim it
    const job = store.enqueue(
      'alice',
      { deviceId: device.deviceId, cadId: 'cad', confirmed: true },
      'create_box',
      doc.id,
    );
    const res = await postMesh(base, job.id, device.credential, stl(1));
    assert.equal(res.status, 404);
    assert.equal(store.meshesForDocument(doc.id).length, 0);
  } finally {
    await close();
  }
});

test("5.1 a foreign device cannot upload to another device's job", async () => {
  const { store, doc, device, base, close } = await scenario();
  try {
    const foreign = pairDevice(store, 'alice', 'Foreign-WS');
    const jobId = runningJob(store, 'alice', device, doc.id);
    const res = await postMesh(base, jobId, foreign.credential, stl(1));
    assert.equal(res.status, 404);
    assert.equal(store.meshesForDocument(doc.id).length, 0);
  } finally {
    await close();
  }
});

test('5.1 quota-exceeded upload is rejected', async () => {
  const { store, doc, device, base, close } = await scenario();
  try {
    // Seed the device's quota at its 500 MiB cap without allocating real bytes.
    store.recordMesh({
      jobId: 'seed-at-quota',
      documentId: doc.id,
      deviceId: device.deviceId,
      size: 500 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    });
    const jobId = runningJob(store, 'alice', device, doc.id);
    const res = await postMesh(base, jobId, device.credential, stl(1));
    assert.equal(res.status, 413);
    assert.equal(store.meshesForDocument(doc.id).length, 1); // only the seed row
  } finally {
    await close();
  }
});

test('5.5/5.7 happy path stores the mesh under a job-bound name and serves it only to the owner', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario({
    'alice-token': 'alice',
    'bob-token': 'bob',
  });
  try {
    const jobId = runningJob(store, 'alice', device, doc.id);
    const body = stl(3);
    // Client-supplied name (query + header) must be ignored (spec "Client-supplied name ignored").
    const upload = await postMesh(base, jobId, device.credential, body, {
      query: '?filename=evil.stl',
      headers: { 'x-filename': 'evil.stl' },
    });
    assert.equal(upload.status, 201);
    const uploaded = (await upload.json()) as { jobId: string; documentId: string };
    assert.equal(uploaded.jobId, jobId);
    assert.equal(uploaded.documentId, doc.id);
    assert.equal(existsSync(meshFile(dataDir, jobId)), true);
    assert.equal(existsSync(join(dataDir, 'meshes', 'evil.stl')), false);

    const asOwner = await fetch(base + '/api/designs/' + doc.id + '/mesh', {
      headers: { authorization: 'Bearer alice-token' },
    });
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.headers.get('content-type'), 'model/stl');
    assert.equal(asOwner.headers.get('cache-control'), 'private, no-store');
    assert.equal(asOwner.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await asOwner.arrayBuffer()), body);

    // Non-owner cannot fetch mesh (spec: not-found, not forbidden).
    const asStranger = await fetch(base + '/api/designs/' + doc.id + '/mesh', {
      headers: { authorization: 'Bearer bob-token' },
    });
    assert.equal(asStranger.status, 404);

    const list = (await (
      await fetch(base + '/api/designs', { headers: { authorization: 'Bearer alice-token' } })
    ).json()) as { id: string; hasMesh: boolean }[];
    assert.equal(list.find((d) => d.id === doc.id)?.hasMesh, true);
    const detail = (await (
      await fetch(base + '/api/designs/' + doc.id, {
        headers: { authorization: 'Bearer alice-token' },
      })
    ).json()) as { hasMesh: boolean };
    assert.equal(detail.hasMesh, true);
  } finally {
    await close();
  }
});

test('5.3 retention keeps only the newest 5 meshes per document', async () => {
  const { store, dataDir, device, doc, base, close } = await scenario();
  const jobIds: string[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const jobId = runningJob(store, 'alice', device, doc.id);
      jobIds.push(jobId);
      const res = await postMesh(base, jobId, device.credential, stl(1 + i));
      assert.equal(res.status, 201);
      store.complete(device.credential, jobId, 'ok', true); // free the D17 lock for the next job
    }
    const remaining = store.meshesForDocument(doc.id);
    assert.equal(remaining.length, 5);
    assert.equal(existsSync(meshFile(dataDir, jobIds[0])), false); // oldest evicted
    assert.equal(existsSync(meshFile(dataDir, jobIds[5])), true);
    assert.equal(store.latestMeshForDocument(doc.id)?.jobId, jobIds[5]);
  } finally {
    await close();
  }
});
