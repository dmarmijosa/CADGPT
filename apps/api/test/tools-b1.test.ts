import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import { registerTools, batchB1Schemas } from '../src/tools.js';

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

function toolText(res: { content: unknown }) {
  return JSON.parse((res.content as { type: string; text: string }[])[0].text);
}

test('4a.1 (RED): a base/tool object id shaped like an argv/path escape fails validation before enqueue', async () => {
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
  const documentId = toolText(first).documentId;
  for (const badName of ['..', 'a;b', "a'b", 'a"b', 'a/b', '../../etc']) {
    const res = await client.callTool({
      name: 'boolean_union',
      arguments: {
        deviceId: device.deviceId!,
        cadId: 'cad',
        documentId,
        base: badName,
        tool: 'Box',
        confirmed: true,
      },
    });
    assert.equal(res.isError, true, `expected rejection for base=${badName}`);
  }
  assert.equal(store.jobs('alice').length, 1, 'only the create_box job from setup was enqueued');
});

test('boolean_cut/union/intersect and extrude_rect schemas reject owner/username and code-shaped extras', () => {
  for (const [name, schema] of Object.entries(batchB1Schemas)) {
    const keys = Object.keys(schema.shape);
    assert.equal(keys.includes('owner'), false, `${name} must not accept owner`);
    assert.equal(keys.includes('username'), false, `${name} must not accept username`);
    const parsed = schema.safeParse({ ...validArgsFor(name), code: 'os.system("rm -rf /")' });
    assert.equal(parsed.success, false, `${name} must reject a code-shaped extra field`);
  }
});

function validArgsFor(name: string): Record<string, unknown> {
  if (name === 'extrude_rect') {
    return { width: 10, height: 10, depth: 10, plane: 'XY', confirmed: true };
  }
  return {
    documentId: '00000000-0000-0000-0000-000000000000',
    base: 'Box',
    tool: 'Cyl',
    confirmed: true,
  };
}

test('extrude_rect rejects a plane outside the XY/XZ/YZ enum', () => {
  const parsed = batchB1Schemas.extrude_rect.safeParse({
    width: 10,
    height: 10,
    depth: 10,
    plane: 'XYZ',
    confirmed: true,
  });
  assert.equal(parsed.success, false);
});

test('boolean_union enqueue-wiring: rejects a foreign document (3a.5 ownership gate)', async () => {
  const store = new Store(':memory:');
  const owner = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const stranger = pairAndApprove(store, 'bob', 'Other', [freecad]);
  const ownerClient = await connectClient(store, 'alice');
  const strangerClient = await connectClient(store, 'bob');
  const created = await ownerClient.callTool({
    name: 'create_box',
    arguments: {
      deviceId: owner.deviceId!,
      cadId: 'cad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  const documentId = toolText(created).documentId;
  const res = await strangerClient.callTool({
    name: 'boolean_union',
    arguments: {
      deviceId: stranger.deviceId!,
      cadId: 'cad',
      documentId,
      base: 'Box',
      tool: 'Box',
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
});

test('happy path: boolean_cut enqueues the exact worker-shaped payload ({ base, tool })', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const created = await client.callTool({
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
  const documentId = toolText(created).documentId;
  // Drain and complete the create_box job so the D17 lock allows the next one.
  const drained = store.heartbeat(device.credential!, [freecad]);
  store.complete(device.credential!, drained.job!.id, '{}', true);
  const res = await client.callTool({
    name: 'boolean_cut',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      base: 'Box',
      tool: 'Cylinder',
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  assert.equal(body.documentId, documentId);
  const picked = store.heartbeat(device.credential!, [freecad]);
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'boolean_cut');
  assert.equal(picked.job?.documentId, documentId);
  assert.equal(picked.job?.base, 'Box');
  assert.equal(picked.job?.tool, 'Cylinder');
});

test('happy path: extrude_rect enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'extrude_rect',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      width: 10,
      height: 20,
      depth: 30,
      plane: 'XZ',
      position: { x: 1, y: 2, z: 3 },
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  const picked = store.heartbeat(device.credential!, [freecad]);
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'extrude_rect');
  assert.equal(picked.job?.width, 10);
  assert.equal(picked.job?.height, 20);
  assert.equal(picked.job?.depth, 30);
  assert.equal(picked.job?.plane, 'XZ');
  assert.deepEqual(picked.job?.position, { x: 1, y: 2, z: 3 });
});
