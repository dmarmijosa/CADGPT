import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import { registerTools, batchASchemas } from '../src/tools.js';

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

async function connectClient(store: Store, owner: string, requireWrite = async () => {}) {
  const server = new McpServer({ name: 'cadgpt-test', version: '0.0.0' });
  registerTools(server, store, owner, requireWrite);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test('create_box rejects a code-shaped extra field and enqueues no job', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
      code: 'os.system("rm -rf /")',
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('ambiguous device without deviceId returns selection_required', async () => {
  const store = new Store(':memory:');
  pairAndApprove(store, 'alice', 'Workstation A', [freecad]);
  pairAndApprove(store, 'alice', 'Workstation B', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_box',
    arguments: { length: 10, width: 10, height: 10, confirmed: true },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.selection_required, true);
  assert.equal(body.candidates.length, 2);
  assert.equal(store.jobs('alice').length, 0);
});

test('owner/username is never a parameter on any batch-A schema', () => {
  for (const [name, schema] of Object.entries(batchASchemas)) {
    const keys = Object.keys(schema.shape);
    assert.equal(keys.includes('owner'), false, `${name} must not accept owner`);
    assert.equal(keys.includes('username'), false, `${name} must not accept username`);
  }
});

test('enqueue capacity cap rejects a 6th active job on the same device', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  for (let i = 0; i < 5; i++) {
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
  }
  const sixth = await client.callTool({
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
  assert.equal(sixth.isError, true);
});

test('D17 lock rejects a second active job on the same document via MCP tools', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const first = await client.callTool({
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
  const firstBody = JSON.parse((first.content as { type: string; text: string }[])[0].text);
  const second = await client.callTool({
    name: 'create_cylinder',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId: firstBody.documentId,
      radius: 5,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(second.isError, true);
});

test('happy path: create_box enqueues a job with the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 20,
      height: 30,
      position: { x: 1, y: 2, z: 3 },
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = JSON.parse((res.content as { type: string; text: string }[])[0].text);
  assert.equal(body.status, 'queued');
  assert.ok(body.jobId);
  assert.ok(body.documentId);
  const picked = store.heartbeat(device.credential!, [freecad]);
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'create_box');
  assert.equal(picked.job?.documentId, body.documentId);
  assert.equal(picked.job?.length, 10);
  assert.equal(picked.job?.width, 20);
  assert.equal(picked.job?.height, 30);
  assert.deepEqual(picked.job?.position, { x: 1, y: 2, z: 3 });
});

test('happy path: create_cone keeps radius1/radius2 as the worker expects', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_cone',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      radius1: 10,
      radius2: 0,
      height: 15,
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = JSON.parse((res.content as { type: string; text: string }[])[0].text);
  const picked = store.heartbeat(device.credential!, [freecad]);
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'create_cone');
  assert.equal(picked.job?.radius1, 10);
  assert.equal(picked.job?.radius2, 0);
  assert.equal(picked.job?.height, 15);
});
