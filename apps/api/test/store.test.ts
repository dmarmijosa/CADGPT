import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, boxSchema, cadSchema } from '../src/store.js';
const cad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};
const autocad = {
  id: 'autocad',
  name: 'AutoCAD' as const,
  path: 'C:\\accoreconsole.exe',
  version: 'test',
  executable: true,
  capabilities: {
    execute: true,
    edition: 'full',
    console: 'C:\\accoreconsole.exe',
    ops: ['create_box', 'create_cylinder', 'create_sphere', 'create_cone', 'extrude_rect'],
    mesh: false,
  },
};
function setup() {
  let time = Date.now();
  const store = new Store(':memory:', () => time);
  const pair = store.begin('Workstation', [cad]);
  store.approve('alice', pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, [cad]);
  return {
    store,
    pair,
    device,
    advance: () => {
      time += 700000;
    },
  };
}
test('pairings are single-use and cannot be reassigned', () => {
  const { store, pair } = setup();
  assert.throws(() => store.approve('bob', pair.userCode));
  assert.throws(() => store.poll(pair.deviceSecret));
});
test('pairing expires', () => {
  let now = 1;
  const store = new Store(':memory:', () => now);
  const p = store.begin('test', []);
  now += 600001;
  assert.throws(() => store.approve('alice', p.userCode));
  assert.throws(() => store.poll(p.deviceSecret));
});
test('ownership, revocation and claim-once are enforced', () => {
  const { store, device } = setup();
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true as const,
  };
  assert.throws(() => store.enqueue('bob', input));
  assert.throws(() => store.revoke('bob', device.deviceId!));
  const job = store.enqueue('alice', input);
  assert.equal(store.heartbeat(device.credential!, [cad]).job?.id, job.id);
  assert.equal(store.heartbeat(device.credential!, [cad]).job, null);
  store.complete(device.credential!, job.id, 'ok', true);
  assert.throws(() => store.complete(device.credential!, job.id, 'again', true));
  assert.equal(store.jobs('bob').length, 0);
  store.revoke('alice', device.deviceId!);
  assert.throws(() => store.heartbeat(device.credential!, [cad]));
  assert.throws(() => store.enqueue('alice', input));
});
test('bounds reject NaN, infinity, negative, missing consent and extra code', () => {
  const p = {
    deviceId: crypto.randomUUID(),
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true,
  };
  for (const length of [NaN, Infinity, -1, 0, 10001])
    assert.equal(boxSchema.safeParse({ ...p, length }).success, false);
  assert.equal(boxSchema.safeParse({ ...p, confirmed: false }).success, false);
  assert.equal(boxSchema.safeParse({ ...p, code: 'run code' }).success, false);
});
test('jobs() reports type/documentId, defaulting a legacy NULL-type row to create_box/null', () => {
  const { store, device } = setup();
  const doc = store.createDocument('alice', device.deviceId!, 'FreeCAD', 'Bracket');
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true as const,
  };
  store.enqueue('alice', input, 'modify', doc.id);
  // Simulate a phase-1 row that predates the `type`/`document_id` columns
  // being populated by `enqueue()` (matches `heartbeat()`'s null mapping).
  store.db
    .prepare(
      'INSERT INTO jobs(id,device_id,owner,payload,status,expires,created,result,type,document_id) VALUES(?,?,?,?,?,?,?,NULL,NULL,NULL)',
    )
    .run('legacy-1', device.deviceId!, 'alice', '{}', 'succeeded', Date.now() + 60000, Date.now());
  const rows = store.jobs('alice') as { id: string; type: string; documentId: string | null }[];
  const withDoc = rows.find((r) => r.id !== 'legacy-1')!;
  const legacy = rows.find((r) => r.id === 'legacy-1')!;
  assert.equal(withDoc.type, 'modify');
  assert.equal(withDoc.documentId, doc.id);
  assert.equal(legacy.type, 'create_box');
  assert.equal(legacy.documentId, null);
});
test('cadSchema accepts an optional capabilities object and tolerates unknown extra keys', () => {
  assert.doesNotThrow(() => cadSchema.parse(autocad));
  assert.doesNotThrow(
    () => cadSchema.parse({ ...cad, capabilities: undefined }), // phase-1/2a agent, no capabilities at all
  );
  const withExtra = cadSchema.parse({
    ...autocad,
    capabilities: { ...autocad.capabilities, futureField: 'unused' },
  });
  assert.deepEqual(withExtra.capabilities?.ops, autocad.capabilities.ops);
});
test('13b.3: Store.enqueue() accepts an executable AutoCAD cad matching the document cadKind', () => {
  let time = Date.now();
  const store = new Store(':memory:', () => time);
  const pair = store.begin('Workstation', [cad, autocad]);
  store.approve('alice', pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, [cad, autocad]);
  const doc = store.createDocument('alice', device.deviceId!, 'AutoCAD', 'Bracket');
  const job = store.enqueue(
    'alice',
    {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
    'create_box',
    doc.id,
  );
  assert.ok(job.id);
  // A cad whose kind does not match the target document's cadKind is rejected before enqueue.
  assert.throws(
    () =>
      store.enqueue(
        'alice',
        {
          deviceId: device.deviceId!,
          cadId: 'cad',
          length: 1,
          width: 1,
          height: 1,
          confirmed: true,
        },
        'create_box',
        doc.id,
      ),
    (e: unknown) => e instanceof Error && /different CAD kind/.test(e.message),
  );
});
test('offline and expired jobs do not execute', () => {
  const { store, device, advance } = setup();
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true as const,
  };
  store.enqueue('alice', input);
  advance();
  assert.throws(() => store.enqueue('alice', input));
  assert.equal(store.heartbeat(device.credential!, [cad]).job, null);
});

test('deleteAccount purges all 7 tables, unlinks mesh files on disk, handles missing files, and preserves multi-tenant isolation', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cadgpt-test-delete-account-'));
  const meshesDir = join(tempDir, 'meshes');
  mkdirSync(meshesDir, { recursive: true });

  try {
    const store = new Store(':memory:');

    // 1. Setup Alice records across all 7 tables
    // Pairings & Devices
    const alicePair = store.begin('Alice-WS', [cad]);
    store.approve('alice', alicePair.userCode);
    const aliceDevice = store.poll(alicePair.deviceSecret) as {
      deviceId: string;
      credential: string;
    };
    store.heartbeat(aliceDevice.credential, [cad]);

    // An unconsumed pairing for Alice
    const alicePendingPair = store.begin('Alice-Phone', [cad]);
    store.db
      .prepare('UPDATE pairings SET owner=? WHERE code=?')
      .run('alice', alicePendingPair.userCode);

    // Document
    const aliceDoc = store.createDocument('alice', aliceDevice.deviceId, 'FreeCAD', 'AliceBracket');

    // Jobs
    const aliceJob = store.enqueue(
      'alice',
      { deviceId: aliceDevice.deviceId, cadId: 'cad', confirmed: true },
      'create_box',
      aliceDoc.id,
    );

    // Meshes (2 meshes: one with physical files, one missing)
    store.recordMesh({
      jobId: aliceJob.id,
      documentId: aliceDoc.id,
      deviceId: aliceDevice.deviceId,
      size: 1024,
      sha256: 'a'.repeat(64),
    });
    const missingMeshJobId = crypto.randomUUID();
    store.recordMesh({
      jobId: missingMeshJobId,
      documentId: aliceDoc.id,
      deviceId: aliceDevice.deviceId,
      size: 2048,
      sha256: 'b'.repeat(64),
    });

    // Allowed Roots
    store.addRoot('alice', aliceDevice.deviceId, '/alice/root/path');

    // API Keys
    store.createApiKey('alice', 'AliceKey', ['cad:read', 'cad:write']);

    // 2. Setup Bob records across all 7 tables
    const bobPair = store.begin('Bob-WS', [cad]);
    store.approve('bob', bobPair.userCode);
    const bobDevice = store.poll(bobPair.deviceSecret) as {
      deviceId: string;
      credential: string;
    };
    store.heartbeat(bobDevice.credential, [cad]);

    const bobDoc = store.createDocument('bob', bobDevice.deviceId, 'FreeCAD', 'BobBracket');
    const bobJob = store.enqueue(
      'bob',
      { deviceId: bobDevice.deviceId, cadId: 'cad', confirmed: true },
      'create_box',
      bobDoc.id,
    );
    store.recordMesh({
      jobId: bobJob.id,
      documentId: bobDoc.id,
      deviceId: bobDevice.deviceId,
      size: 4096,
      sha256: 'c'.repeat(64),
    });
    store.addRoot('bob', bobDevice.deviceId, '/bob/root/path');
    store.createApiKey('bob', 'BobKey', ['cad:read']);

    // 3. Write physical mesh files to disk
    const aliceStlPath = join(meshesDir, `${aliceJob.id}.stl`);
    const alicePartPath = join(meshesDir, `${aliceJob.id}.part`);
    const bobStlPath = join(meshesDir, `${bobJob.id}.stl`);

    writeFileSync(aliceStlPath, Buffer.from('alice-stl-content'));
    writeFileSync(alicePartPath, Buffer.from('alice-part-content'));
    writeFileSync(bobStlPath, Buffer.from('bob-stl-content'));
    // Note: missingMeshJobId file is deliberately NOT created on disk to test ENOENT handling

    assert.equal(existsSync(aliceStlPath), true);
    assert.equal(existsSync(alicePartPath), true);
    assert.equal(existsSync(bobStlPath), true);

    // Verify Alice has data in all 7 tables prior to deletion
    const count = (table: string, cond: string, param: string) => {
      const row = store.db
        .prepare(`SELECT count(*) as c FROM ${table} WHERE ${cond}`)
        .get(param) as {
        c: number;
      };
      return row.c;
    };
    assert.ok(
      count('meshes', 'document_id IN (SELECT id FROM documents WHERE owner=?)', 'alice') > 0,
    );
    assert.ok(count('documents', 'owner=?', 'alice') > 0);
    assert.ok(count('jobs', 'owner=?', 'alice') > 0);
    assert.ok(count('allowed_roots', 'owner=?', 'alice') > 0);
    assert.ok(count('devices', 'owner=?', 'alice') > 0);
    assert.ok(count('api_keys', 'owner=?', 'alice') > 0);
    assert.ok(count('pairings', 'owner=?', 'alice') > 0);

    // 4. Perform account deletion for Alice
    store.deleteAccount('alice', tempDir);

    // 5. Verify Alice's physical mesh files are unlinked, missing file was handled gracefully
    assert.equal(existsSync(aliceStlPath), false);
    assert.equal(existsSync(alicePartPath), false);

    // 6. Verify Bob's physical file is preserved
    assert.equal(existsSync(bobStlPath), true);

    // 7. Verify Alice is purged from all 7 tables
    assert.equal(
      count('meshes', 'document_id IN (SELECT id FROM documents WHERE owner=?)', 'alice'),
      0,
    );
    assert.equal(count('documents', 'owner=?', 'alice'), 0);
    assert.equal(count('jobs', 'owner=?', 'alice'), 0);
    assert.equal(count('allowed_roots', 'owner=?', 'alice'), 0);
    assert.equal(count('devices', 'owner=?', 'alice'), 0);
    assert.equal(count('api_keys', 'owner=?', 'alice'), 0);
    assert.equal(count('pairings', 'owner=?', 'alice'), 0);

    // 8. Verify Bob's data remains 100% intact across all tables (multi-tenant isolation)
    assert.equal(
      count('meshes', 'document_id IN (SELECT id FROM documents WHERE owner=?)', 'bob'),
      1,
    );
    assert.equal(count('documents', 'owner=?', 'bob'), 1);
    assert.equal(count('jobs', 'owner=?', 'bob'), 1);
    assert.equal(count('allowed_roots', 'owner=?', 'bob'), 1);
    assert.equal(count('devices', 'owner=?', 'bob'), 1);
    assert.equal(count('api_keys', 'owner=?', 'bob'), 1);
    assert.equal(count('pairings', 'owner=?', 'bob'), 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('deleteAccount is idempotent when owner has no records', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cadgpt-test-empty-delete-'));
  try {
    const store = new Store(':memory:');
    assert.doesNotThrow(() => store.deleteAccount('non-existent-user', tempDir));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
