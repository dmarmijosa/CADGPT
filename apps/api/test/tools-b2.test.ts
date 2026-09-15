import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import {
  registerTools,
  batchASchemas,
  batchB1Schemas,
  batchB2Schemas,
  advancedCadSchemas,
  FREECAD_OPS,
} from '../src/tools.js';

const freecad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};
const uuidZero = '00000000-0000-0000-0000-000000000000';

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

// Creates a design (draining/completing the create_box job so the D17 lock
// releases) and returns its documentId, ready for a B2 tool call.
async function existingDocument(
  store: Store,
  owner: string,
  device: { deviceId?: string; credential?: string },
) {
  const client = await connectClient(store, owner);
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
  const documentId = toolText(created).documentId as string;
  const drained = store.heartbeat(device.credential!, [freecad]);
  store.complete(device.credential!, drained.job!.id, '{}', true);
  return documentId;
}

// Asserts the common `{jobId, documentId, status:'queued'}` shape and that
// the drained job carries every expected worker-payload field.
function assertQueuedJob(
  res: { isError?: boolean; content: unknown },
  store: Store,
  device: { credential?: string },
  documentId: string,
  expected: Record<string, unknown>,
) {
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  assert.equal(body.documentId, documentId);
  const picked = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.id, body.jobId);
  for (const [key, value] of Object.entries(expected)) assert.equal(picked.job?.[key], value);
  return body;
}

function validArgsFor(name: string): Record<string, unknown> {
  if (name === 'read_scene') return { documentId: uuidZero };
  if (name === 'export_design') return { documentId: uuidZero, format: 'stl', confirmed: true };
  if (name === 'create_wedge')
    return { length: 50, width: 20, height: 30, top_length: 10, confirmed: true };
  if (name === 'extrude_polygon')
    return {
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      depth: 5,
      plane: 'XY',
      confirmed: true,
    };
  if (name === 'fillet') return { documentId: uuidZero, object: 'Box', radius: 2, confirmed: true };
  if (name === 'chamfer')
    return { documentId: uuidZero, object: 'Box', distance: 1.5, confirmed: true };
  if (name === 'loft')
    return {
      sections: [
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
        ],
        [
          [0, 0, 10],
          [5, 0, 10],
          [5, 5, 10],
        ],
      ],
      solid: true,
      ruled: false,
      confirmed: true,
    };
  const base = { documentId: uuidZero, object: 'Box', confirmed: true };
  if (name === 'translate_object') return { ...base, dx: 1, dy: 1, dz: 1 };
  if (name === 'rotate_object') return { ...base, axis: 'X', degrees: 90 };
  return { ...base, factor: 2 }; // scale_object
}

test('4b.4/4b.5: FREECAD_OPS equals, and the batch A/B1/B2/B3 op catalog is a subset of, ops-allowlist.json', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../ops-allowlist.json'), 'utf8'),
  );
  const fixtureOps = new Set<string>(fixture.ops);
  assert.deepEqual([...FREECAD_OPS].sort(), [...fixtureOps].sort());
  const jobToolNames = [
    ...Object.keys(batchASchemas).filter((name) => name !== 'get_job'),
    ...Object.keys(batchB1Schemas),
    ...Object.keys(batchB2Schemas),
    ...Object.keys(advancedCadSchemas),
  ];
  for (const name of jobToolNames)
    assert.ok(fixtureOps.has(name), `${name} missing from ops-allowlist.json`);
});

test('batch B2 schemas reject owner/username and a code-shaped extra field', () => {
  for (const [name, schema] of Object.entries(batchB2Schemas)) {
    const keys = Object.keys(schema.shape);
    assert.equal(keys.includes('owner'), false, `${name} must not accept owner`);
    assert.equal(keys.includes('username'), false, `${name} must not accept username`);
    const parsed = schema.safeParse({ ...validArgsFor(name), code: 'os.system("rm -rf /")' });
    assert.equal(parsed.success, false, `${name} must reject a code-shaped extra field`);
  }
});

test('4b.6: transform-bounds and export-format-enum rejection', () => {
  const rotate = validArgsFor('rotate_object');
  const scale = validArgsFor('scale_object');
  const exportDesign = validArgsFor('export_design');
  assert.equal(batchB2Schemas.rotate_object.safeParse({ ...rotate, degrees: 361 }).success, false);
  assert.equal(batchB2Schemas.scale_object.safeParse({ ...scale, factor: 0.0001 }).success, false);
  assert.equal(batchB2Schemas.scale_object.safeParse({ ...scale, factor: 1001 }).success, false);
  assert.equal(
    batchB2Schemas.export_design.safeParse({ ...exportDesign, format: 'obj' }).success,
    false,
  );
});

test('happy path: rotate_object enqueues the exact worker-shaped payload ({ object, axis, degrees })', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const documentId = await existingDocument(store, 'alice', device);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'rotate_object',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      object: 'Box',
      axis: 'Z',
      degrees: 45,
      confirmed: true,
    },
  });
  assertQueuedJob(res, store, device, documentId, {
    type: 'rotate_object',
    object: 'Box',
    axis: 'Z',
    degrees: 45,
  });
});

test('happy path: export_design enqueues the exact worker-shaped payload ({ format })', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const documentId = await existingDocument(store, 'alice', device);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'export_design',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      format: 'stl',
      confirmed: true,
    },
  });
  assertQueuedJob(res, store, device, documentId, { type: 'export_design', format: 'stl' });
});

test('read_scene enqueues a job (pointing at get_job); get_job parses the JSON-wrapped scene as data and enforces the 12 kB cap', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const documentId = await existingDocument(store, 'alice', device);
  const client = await connectClient(store, 'alice');
  const enqueued = await client.callTool({
    name: 'read_scene',
    arguments: { deviceId: device.deviceId!, cadId: 'cad', documentId },
  });
  const body = assertQueuedJob(enqueued, store, device, documentId, { type: 'read_scene' });
  assert.match(body.next, /get_job/);
  // An oversized scene, fed directly through store.complete() to prove the
  // server re-enforces the cap independently of whatever the agent posts.
  const oversized = Array.from({ length: 500 }, (_, i) => ({
    name: `Obj${i}`,
    label: `Obj${i}`,
    type: 'Part::Feature',
    bbox: [0, 0, 0, 10, 10, 10],
    volume: 1000,
  }));
  store.complete(
    device.credential!,
    body.jobId,
    JSON.stringify({ message: 'Read scene.', scene: oversized }),
    true,
  );
  const res = await client.callTool({ name: 'get_job', arguments: { jobId: body.jobId } });
  const result = toolText(res).result;
  assert.equal(result.message, 'Read scene.');
  assert.ok(Array.isArray(result.scene));
  assert.equal(result.truncated, true);
  assert.ok(result.scene.length < oversized.length);
  assert.ok(Buffer.byteLength(JSON.stringify(result.scene), 'utf8') <= 12100);
});

test('advanced CAD (batch B3) schemas reject owner/username and code-shaped extra fields', () => {
  for (const [name, schema] of Object.entries(advancedCadSchemas)) {
    const keys = Object.keys(schema.shape);
    assert.equal(keys.includes('owner'), false, `${name} must not accept owner`);
    assert.equal(keys.includes('username'), false, `${name} must not accept username`);
    const parsed = schema.safeParse({ ...validArgsFor(name), code: 'os.system("rm -rf /")' });
    assert.equal(parsed.success, false, `${name} must reject a code-shaped extra field`);
    const scriptParsed = schema.safeParse({ ...validArgsFor(name), script: 'Part.show(...)' });
    assert.equal(scriptParsed.success, false, `${name} must reject script extra field`);
  }
});

test('advanced CAD schema bounds and validation rejection', () => {
  // extrude_polygon bounds
  assert.equal(
    advancedCadSchemas.extrude_polygon.safeParse({
      points: [
        [0, 0],
        [10, 0],
        [200000, 10], // exceeds 100000 max bound
      ],
      depth: 10,
      plane: 'XY',
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.extrude_polygon.safeParse({
      points: [
        [0, 0],
        [10, 10], // fewer than 3 vertices
      ],
      depth: 10,
      plane: 'XY',
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.extrude_polygon.safeParse({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      depth: -5, // non-positive depth
      plane: 'XY',
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.extrude_polygon.safeParse({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      depth: 5,
      plane: 'ABC', // invalid plane
      confirmed: true,
    }).success,
    false,
  );

  // fillet bounds
  assert.equal(
    advancedCadSchemas.fillet.safeParse({
      object: 'Box',
      radius: 2,
      confirmed: true, // missing documentId
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.fillet.safeParse({
      documentId: uuidZero,
      object: 'Box',
      radius: -1, // negative radius
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.fillet.safeParse({
      documentId: uuidZero,
      object: 'Box',
      radius: 2,
      edge_indices: [0], // 0 is not positive (1-based)
      confirmed: true,
    }).success,
    false,
  );

  // chamfer bounds
  assert.equal(
    advancedCadSchemas.chamfer.safeParse({
      documentId: uuidZero,
      object: 'Box',
      distance: 0, // must be positive
      confirmed: true,
    }).success,
    false,
  );

  // loft bounds
  assert.equal(
    advancedCadSchemas.loft.safeParse({
      sections: [
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
        ], // only 1 section profile (min is 2)
      ],
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.loft.safeParse({
      sections: [
        [
          [0, 0, 0],
          [10, 0, 0],
        ], // only 2 points (min is 3)
        [
          [0, 0, 10],
          [10, 0, 10],
        ],
      ],
      confirmed: true,
    }).success,
    false,
  );

  // create_wedge bounds
  assert.equal(
    advancedCadSchemas.create_wedge.safeParse({
      length: -1,
      width: 10,
      height: 10,
      confirmed: true,
    }).success,
    false,
  );
  assert.equal(
    advancedCadSchemas.create_wedge.safeParse({
      length: 10,
      width: 10,
      height: 10,
      top_length: -5, // non-negative required
      confirmed: true,
    }).success,
    false,
  );
});

test('happy path: create_wedge enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_wedge',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      length: 50,
      width: 20,
      height: 30,
      top_length: 15,
      confirmed: true,
    },
  });
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  const drained = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(drained.job?.type, 'create_wedge');
  assert.equal(drained.job?.length, 50);
  assert.equal(drained.job?.width, 20);
  assert.equal(drained.job?.height, 30);
  assert.equal(drained.job?.top_length, 15);
});

test('happy path: extrude_polygon enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const points = [
    [0, 0],
    [40, 0],
    [50, 20],
    [10, 20],
  ];
  const res = await client.callTool({
    name: 'extrude_polygon',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      points,
      depth: 12,
      plane: 'XY',
      confirmed: true,
    },
  });
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  const drained = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(drained.job?.type, 'extrude_polygon');
  assert.deepEqual(drained.job?.points, points);
  assert.equal(drained.job?.depth, 12);
  assert.equal(drained.job?.plane, 'XY');
});

test('happy path: fillet enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const documentId = await existingDocument(store, 'alice', device);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'fillet',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      object: 'Box',
      radius: 2,
      edge_indices: [1, 3],
      confirmed: true,
    },
  });
  assertQueuedJob(res, store, device, documentId, {
    type: 'fillet',
    object: 'Box',
    radius: 2,
  });
});

test('happy path: chamfer enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const documentId = await existingDocument(store, 'alice', device);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'chamfer',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      object: 'Box',
      distance: 1.5,
      confirmed: true,
    },
  });
  assertQueuedJob(res, store, device, documentId, {
    type: 'chamfer',
    object: 'Box',
    distance: 1.5,
  });
});

test('happy path: loft enqueues the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const sections = [
    [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ],
    [
      [0, 0, 50],
      [15, 0, 50],
      [15, 15, 50],
    ],
  ];
  const res = await client.callTool({
    name: 'loft',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      sections,
      solid: true,
      ruled: false,
      confirmed: true,
    },
  });
  const body = toolText(res);
  assert.equal(body.status, 'queued');
  const drained = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(drained.job?.type, 'loft');
  assert.deepEqual(drained.job?.sections, sections);
  assert.equal(drained.job?.solid, true);
  assert.equal(drained.job?.ruled, false);
});
