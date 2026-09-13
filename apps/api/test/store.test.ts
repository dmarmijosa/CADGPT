import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, boxSchema } from '../src/store.js';
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
