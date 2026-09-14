import { test } from 'node:test';
import assert from 'node:assert/strict';
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
