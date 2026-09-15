import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
const cad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};
function setup() {
  let time = Date.now();
  const store = new Store(':memory:', () => time);
  const pair = store.begin('Workstation', [cad]);
  store.approve('alice', pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, [cad]);
  return { store, device };
}
test('migrate is idempotent on a phase-1 jobs table', () => {
  const store = new Store(':memory:');
  // Simulate a phase-1 `jobs` table that predates the `type`/`document_id` columns.
  store.db.exec(`
    CREATE TABLE jobs_legacy (
      id TEXT PRIMARY KEY, device_id TEXT, owner TEXT, payload TEXT, status TEXT,
      expires INTEGER, created INTEGER, result TEXT);
    DROP TABLE jobs;
    ALTER TABLE jobs_legacy RENAME TO jobs;
  `);
  const before = (store.db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  assert.equal(before.includes('type'), false);
  assert.equal(before.includes('document_id'), false);
  store.migrate();
  store.migrate(); // second call must not throw or duplicate columns
  const after = (store.db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  assert.equal(after.filter((c) => c === 'type').length, 1);
  assert.equal(after.filter((c) => c === 'document_id').length, 1);
});
test('document creation is scoped to the owner', () => {
  const { store, device } = setup();
  const doc = store.createDocument('alice', device.deviceId!, 'FreeCAD', 'Bracket');
  const got = store.getDocument(doc.id, 'alice');
  assert.equal(got.owner, 'alice');
  assert.equal(got.name, 'Bracket');
  assert.equal(got.cadKind, 'FreeCAD');
  assert.equal(got.latestJobId, null);
});
test('cross-owner access is denied', () => {
  const { store, device } = setup();
  const doc = store.createDocument('alice', device.deviceId!, 'FreeCAD', 'Bracket');
  assert.throws(() => store.getDocument(doc.id, 'bob'));
});
test('list_documents is scoped to the caller', () => {
  const { store, device } = setup();
  store.createDocument('alice', device.deviceId!, 'FreeCAD', 'One');
  store.createDocument('alice', device.deviceId!, 'FreeCAD', 'Two');
  store.createDocument('bob', device.deviceId!, 'FreeCAD', 'Three');
  assert.equal(store.listDocuments('alice').length, 2);
  assert.equal(store.listDocuments('bob').length, 1);
});
test('D17 lock rejects a second active job on the same document', () => {
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
  assert.throws(
    () => store.enqueue('alice', input, 'modify', doc.id),
    (e: unknown) => e instanceof Error && /active job/.test(e.message),
  );
});
test('enqueue stamps confirmed:true into the agent-facing payload even when the caller omits it', () => {
  // Regression: MCP tool handlers destructure their params without `confirmed`,
  // so the flag never reached the persisted payload and the agent rejected
  // every job with "Explicit confirmation required". enqueue now stamps it at
  // the single choke point, so the caller's input need not carry it.
  const { store, device } = setup();
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    radius: 30,
    // deliberately no `confirmed` here — mirrors the MCP handler's params
  };
  const job = store.enqueue('alice', input, 'create_sphere');
  const picked = store.heartbeat(device.credential!, [cad]);
  assert.equal(picked.job?.id, job.id);
  assert.equal(picked.job?.type, 'create_sphere');
  assert.equal(picked.job?.confirmed, true);
});
test('complete() bumps documents.updated/latest_job_id on success', () => {
  const { store, device } = setup();
  store.addRoot('alice', device.deviceId!, '/documents');
  const doc = store.createDocument('alice', device.deviceId!, 'FreeCAD', 'Bracket');
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true as const,
  };
  const job = store.enqueue('alice', input, 'modify', doc.id);
  const picked = store.heartbeat(device.credential!, [cad]);
  assert.equal(picked.job?.id, job.id);
  assert.equal(picked.job?.type, 'modify');
  assert.equal(picked.job?.documentId, doc.id);
  store.complete(device.credential!, job.id, 'ok', true, '/documents/' + doc.id + '/design.FCStd');
  const after = store.getDocument(doc.id, 'alice');
  assert.equal(after.latestJobId, job.id);
  assert.equal(after.nativePath, '/documents/' + doc.id + '/design.FCStd');
});
test('phase-1 rows map type=null to create_box', () => {
  const { store, device } = setup();
  const input = {
    deviceId: device.deviceId!,
    cadId: 'cad',
    length: 1,
    width: 2,
    height: 3,
    confirmed: true as const,
  };
  store.enqueue('alice', input); // no type/documentId passed — matches phase-1 callers
  const picked = store.heartbeat(device.credential!, [cad]);
  assert.equal(picked.job?.type, 'create_box');
  assert.equal(picked.job?.documentId, null);
});
