import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import {
  registerTools,
  batchASchemas,
  createText3dSchema,
  extrudePolygonSchema,
  phase5CadSchemas,
  analyzeImageToCadSchema,
  analyzeImageToCadBaseSchema,
} from '../src/tools.js';

const freecad = {
  id: 'cad',
  name: 'FreeCAD',
  path: '/opt/FreeCADCmd',
  version: 'test',
  executable: true,
};

// 13b: create-only AutoCAD capability set, matching `discovery.AUTOCAD_OPS`.
const autocad = {
  id: 'autocad',
  name: 'AutoCAD',
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

test('13b.1/13b.5 (RED->GREEN): a create op in AutoCAD capabilities.ops enqueues against an AutoCAD document', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [autocad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = JSON.parse((res.content as { type: string; text: string }[])[0].text);
  assert.equal(body.status, 'queued');
  const picked = store.heartbeat(device.credential!, [autocad]);
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'create_box');
});

test('13b.1/13b.5: an op outside AutoCAD capabilities.ops is rejected before enqueue', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [autocad]);
  const client = await connectClient(store, 'alice');
  const created = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  const documentId = JSON.parse(
    (created.content as { type: string; text: string }[])[0].text,
  ).documentId;
  // boolean_cut is not in AutoCAD's advertised capabilities.ops (create-only, 13b re-scope).
  const rejected = await client.callTool({
    name: 'boolean_cut',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      documentId,
      base: 'Box',
      tool: 'Box',
      confirmed: true,
    },
  });
  assert.equal(rejected.isError, true);
  // Only the one create_box job from setup was enqueued; the rejected op never reached enqueue.
  assert.equal(store.jobs('alice').length, 1);
});

test('P2.4.2: an AutoCAD device advertising proven ops enqueues boolean, transform, read_scene, export_design', async () => {
  const autocadFull = {
    ...autocad,
    capabilities: {
      ...autocad.capabilities,
      ops: [
        'create_box',
        'create_cylinder',
        'create_sphere',
        'create_cone',
        'extrude_rect',
        'boolean_cut',
        'boolean_union',
        'boolean_intersect',
        'translate_object',
        'rotate_object',
        'scale_object',
        'read_scene',
        'export_design',
      ],
    },
  };
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [autocadFull]);
  const client = await connectClient(store, 'alice');
  const created = await client.callTool({
    name: 'create_box',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      length: 10,
      width: 10,
      height: 10,
      confirmed: true,
    },
  });
  function drainAndComplete() {
    const picked = store.heartbeat(device.credential!, [autocadFull]);
    if (picked.job) {
      store.complete(device.credential!, picked.job.id, 'ok', true);
    }
  }

  const createdBody = JSON.parse((created.content as { type: string; text: string }[])[0].text);
  const documentId = createdBody.documentId;
  drainAndComplete();

  // boolean_cut enqueues successfully
  const booleanRes = await client.callTool({
    name: 'boolean_cut',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      documentId,
      base: '2A',
      tool: '2B',
      confirmed: true,
    },
  });
  assert.equal(booleanRes.isError, undefined);
  drainAndComplete();

  // translate_object enqueues successfully
  const translateRes = await client.callTool({
    name: 'translate_object',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      documentId,
      object: '2A',
      dx: 5,
      dy: 0,
      dz: 0,
      confirmed: true,
    },
  });
  assert.equal(translateRes.isError, undefined);
  drainAndComplete();

  // read_scene enqueues successfully
  const readRes = await client.callTool({
    name: 'read_scene',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      documentId,
    },
  });
  assert.equal(readRes.isError, undefined);
  drainAndComplete();

  // export_design enqueues successfully
  const exportRes = await client.callTool({
    name: 'export_design',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'autocad',
      documentId,
      format: 'dxf',
      confirmed: true,
    },
  });
  assert.equal(exportRes.isError, undefined);
  drainAndComplete();
  assert.equal(store.jobs('alice').length, 5);
});

test('13b.5: FreeCAD enqueue path (no capabilities field) is unaffected by the AutoCAD gate', async () => {
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
  const createdBody = JSON.parse((created.content as { type: string; text: string }[])[0].text);
  const documentId = createdBody.documentId;
  // D17 only allows one active job per document — clear it before targeting the same document again.
  store.heartbeat(device.credential!, [freecad]);
  store.complete(device.credential!, createdBody.jobId, 'ok', true);
  // FreeCAD falls back to FREECAD_OPS (no `capabilities` field), which still covers boolean_cut.
  const res = await client.callTool({
    name: 'boolean_cut',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      base: 'Box',
      tool: 'Box',
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined, JSON.stringify(res));
  assert.equal(store.jobs('alice').length, 2);
});

// --- P1 Phase 4: Open-by-Path MCP Tool + native_path write ---

test('open_external_design schema has no owner or username field', async () => {
  const store = new Store(':memory:');
  const client = await connectClient(store, 'alice');
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === 'open_external_design');
  assert.ok(tool, 'open_external_design tool must be registered');
  const schema = tool.inputSchema as { properties?: Record<string, unknown> };
  assert.equal(schema.properties?.owner, undefined);
  assert.equal(schema.properties?.username, undefined);
});

test('out-of-allowlist path rejected at validation: enqueues no job and binds no document', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  store.addRoot('alice', device.deviceId!, '/home/alice/allowed');
  const client = await connectClient(store, 'alice');

  // Attempt to open a path outside allowed root
  const res = await client.callTool({
    name: 'open_external_design',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      path: '/home/alice/forbidden/secret.FCStd',
      confirmed: true,
    },
  });

  assert.equal(res.isError, true);
  // No job enqueued
  assert.equal(store.jobs('alice').length, 0);
  // No document bound
  assert.equal(store.listDocuments('alice').length, 0);
});

test('open-by-path binds native_path + owner from sub and enqueues job', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  store.addRoot('alice', device.deviceId!, '/home/alice/allowed');
  const client = await connectClient(store, 'alice');

  const validPath = '/home/alice/allowed/model.FCStd';
  const res = await client.callTool({
    name: 'open_external_design',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      path: validPath,
      name: 'MyModel',
      confirmed: true,
    },
  });

  assert.equal(res.isError, undefined, JSON.stringify(res));
  const body = JSON.parse((res.content as { type: string; text: string }[])[0].text);
  assert.ok(body.documentId);
  assert.ok(body.jobId);

  // Document row created with native_path set and owner alice
  const doc = store.getDocument(body.documentId, 'alice');
  assert.equal(doc.owner, 'alice');
  assert.equal(doc.nativePath, validPath);
  assert.equal(doc.name, 'MyModel');

  // Job enqueued with native_path payload
  const jobs = store.jobs('alice');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, body.jobId);
});

test('modify job against path-bound document pins native_path and rejects alternate path', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  store.addRoot('alice', device.deviceId!, '/home/alice/allowed');
  const client = await connectClient(store, 'alice');

  const validPath = '/home/alice/allowed/model.FCStd';
  const openRes = await client.callTool({
    name: 'open_external_design',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      path: validPath,
      confirmed: true,
    },
  });
  const { documentId, jobId } = JSON.parse(
    (openRes.content as { type: string; text: string }[])[0].text,
  );
  store.heartbeat(device.credential!, [freecad]);
  store.complete(device.credential!, jobId, 'ok', true);

  // Modify job referencing alternate path is rejected
  const alterRes = await client.callTool({
    name: 'translate_object',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      object: 'Box',
      dx: 1,
      dy: 0,
      dz: 0,
      path: '/home/alice/allowed/alternate.FCStd',
      confirmed: true,
    },
  });
  assert.equal(alterRes.isError, true);

  // Drifted root: if the root is revoked, modify job is rejected
  const roots = store.listRoots('alice', device.deviceId!);
  store.removeRoot('alice', roots[0].id);

  const driftedRes = await client.callTool({
    name: 'translate_object',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      documentId,
      object: 'Box',
      dx: 1,
      dy: 0,
      dz: 0,
      confirmed: true,
    },
  });
  assert.equal(driftedRes.isError, true);
});

test('results endpoint persists valid nativePath and rejects out-of-allowlist nativePath', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  store.addRoot('alice', device.deviceId!, '/home/alice/allowed');

  const doc = store.createDocument('alice', device.deviceId!, 'FreeCAD', 'TestDoc');
  const job = store.enqueue(
    'alice',
    { deviceId: device.deviceId!, cadId: 'cad' },
    'create_box',
    doc.id,
  );

  store.heartbeat(device.credential!, [freecad]);

  // Out-of-allowlist nativePath is rejected
  assert.throws(
    () => store.complete(device.credential!, job.id, 'ok', true, '/etc/passwd'),
    (e: unknown) => e instanceof Error && /Out-of-allowlist/i.test(e.message),
  );

  // Valid nativePath inside allowed root is persisted
  store.complete(device.credential!, job.id, 'ok', true, '/home/alice/allowed/result.FCStd');
  const updatedDoc = store.getDocument(doc.id, 'alice');
  assert.equal(updatedDoc.nativePath, '/home/alice/allowed/result.FCStd');
});

test('createText3dSchema rejects code-shaped fields and owner/username', () => {
  const keys = Object.keys(createText3dSchema.shape);
  assert.equal(keys.includes('owner'), false, 'create_text_3d must not accept owner');
  assert.equal(keys.includes('username'), false, 'create_text_3d must not accept username');

  const validArgs = {
    text: 'CAD-01',
    size: 12,
    thickness: 2.5,
    mode: 'flat' as const,
    confirmed: true as const,
  };
  const parsedExtra = createText3dSchema.safeParse({
    ...validArgs,
    script: 'os.system("rm -rf /")',
  });
  assert.equal(parsedExtra.success, false, 'create_text_3d must reject script extra field');

  const parsedCode = createText3dSchema.safeParse({ ...validArgs, code: 'import os' });
  assert.equal(parsedCode.success, false, 'create_text_3d must reject code extra field');
});

test('createText3dSchema validation bounds and conditional target_object', () => {
  // Empty text rejected
  assert.equal(
    createText3dSchema.safeParse({ text: '', size: 10, thickness: 2, confirmed: true }).success,
    false,
  );
  // Negative size rejected
  assert.equal(
    createText3dSchema.safeParse({ text: 'CAD', size: -1, thickness: 2, confirmed: true }).success,
    false,
  );
  // Emboss requires target_object
  assert.equal(
    createText3dSchema.safeParse({
      text: 'CAD',
      size: 10,
      thickness: 2,
      mode: 'emboss',
      confirmed: true,
    }).success,
    false,
  );
  // Emboss with target_object succeeds
  assert.equal(
    createText3dSchema.safeParse({
      text: 'CAD',
      size: 10,
      thickness: 2,
      mode: 'emboss',
      target_object: 'Box',
      confirmed: true,
    }).success,
    true,
  );
  // Engrave requires target_object
  assert.equal(
    createText3dSchema.safeParse({
      text: 'CAD',
      size: 10,
      thickness: 2,
      mode: 'engrave',
      confirmed: true,
    }).success,
    false,
  );
  // Engrave with target_object succeeds
  assert.equal(
    createText3dSchema.safeParse({
      text: 'CAD',
      size: 10,
      thickness: 2,
      mode: 'engrave',
      target_object: 'Panel',
      confirmed: true,
    }).success,
    true,
  );
});

test('extrudePolygonSchema validates nested holes array and limits', () => {
  const validOuter: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const validHole: [number, number][] = [
    [20, 20],
    [40, 20],
    [40, 40],
  ];

  // Valid holes succeeds
  assert.equal(
    extrudePolygonSchema.safeParse({
      points: validOuter,
      holes: [validHole],
      depth: 10,
      plane: 'XY',
      confirmed: true,
    }).success,
    true,
  );

  // Hole loop with fewer than 3 points rejected
  assert.equal(
    extrudePolygonSchema.safeParse({
      points: validOuter,
      holes: [
        [
          [20, 20],
          [40, 20],
        ],
      ],
      depth: 10,
      plane: 'XY',
      confirmed: true,
    }).success,
    false,
  );

  // More than 20 hole loops rejected
  const twentyOneHoles = Array.from({ length: 21 }, () => validHole);
  assert.equal(
    extrudePolygonSchema.safeParse({
      points: validOuter,
      holes: twentyOneHoles,
      depth: 10,
      plane: 'XY',
      confirmed: true,
    }).success,
    false,
  );
});

test('happy path: create_text_3d enqueues a job with the exact worker-shaped payload', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_text_3d',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      text: 'CAD-01',
      size: 15,
      thickness: 3,
      mode: 'flat',
      plane: 'XY',
      tracking: 1.2,
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.status, 'queued');
  const picked = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'create_text_3d');
  assert.equal(picked.job?.text, 'CAD-01');
  assert.equal(picked.job?.size, 15);
  assert.equal(picked.job?.thickness, 3);
  assert.equal(picked.job?.mode, 'flat');
  assert.equal(picked.job?.plane, 'XY');
  assert.equal(picked.job?.tracking, 1.2);
});

test('create_text_3d emboss mode without target_object fails validation and enqueues no job', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_text_3d',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      text: 'FAIL',
      size: 10,
      thickness: 2,
      mode: 'emboss',
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('happy path: extrude_polygon with holes enqueues a job with nested hole arrays', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'extrude_polygon',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      holes: [
        [
          [20, 20],
          [40, 20],
          [40, 40],
          [20, 40],
        ],
      ],
      depth: 10,
      plane: 'XY',
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.status, 'queued');
  const picked = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'extrude_polygon');
  assert.deepEqual(picked.job?.points, [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]);
  assert.deepEqual(picked.job?.holes, [
    [
      [20, 20],
      [40, 20],
      [40, 40],
      [20, 40],
    ],
  ]);
  assert.equal(picked.job?.depth, 10);
  assert.equal(picked.job?.plane, 'XY');
});

test('analyzeImageToCadSchema rejects code-shaped fields and owner/username', () => {
  const valid = {
    image_base64:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    create_solid: false,
  };
  assert.equal(analyzeImageToCadSchema.safeParse({ ...valid, code: 'rm -rf /' }).success, false);
  assert.equal(
    analyzeImageToCadSchema.safeParse({ ...valid, script: 'system.exec()' }).success,
    false,
  );

  const keys = Object.keys(analyzeImageToCadBaseSchema.shape);
  assert.equal(keys.includes('owner'), false, 'analyze_image_to_cad must not accept owner');
  assert.equal(keys.includes('username'), false, 'analyze_image_to_cad must not accept username');

  for (const [name, schema] of Object.entries(phase5CadSchemas)) {
    assert.ok(name in phase5CadSchemas);
    assert.ok(schema);
  }
});

test('analyzeImageToCadSchema validation bounds and conditionals', () => {
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  // Valid inspection payload
  const validInspection = { image_base64: b64, create_solid: false };
  assert.equal(analyzeImageToCadSchema.safeParse(validInspection).success, true);

  // Rejects too-short image_base64
  assert.equal(
    analyzeImageToCadSchema.safeParse({ image_base64: 'short', create_solid: false }).success,
    false,
  );

  // Rejects invalid threshold_mode
  assert.equal(
    analyzeImageToCadSchema.safeParse({ ...validInspection, threshold_mode: 'magic' }).success,
    false,
  );

  // Tolerance bounds [0.0001, 0.1]
  assert.equal(
    analyzeImageToCadSchema.safeParse({ ...validInspection, tolerance: 0.0025 }).success,
    true,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({ ...validInspection, tolerance: 0.00005 }).success,
    false,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({ ...validInspection, tolerance: 0.2 }).success,
    false,
  );

  // Solid mode requires depth and confirmed: true
  assert.equal(
    analyzeImageToCadSchema.safeParse({ image_base64: b64, create_solid: true, confirmed: true })
      .success,
    false,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({ image_base64: b64, create_solid: true, depth: 10 }).success,
    false,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      image_base64: b64,
      create_solid: true,
      depth: 10,
      confirmed: true,
    }).success,
    true,
  );

  // Points reference dimension requires points array
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      ...validInspection,
      reference_dimension: { type: 'points', value_mm: 50 },
    }).success,
    false,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      ...validInspection,
      reference_dimension: {
        type: 'points',
        value_mm: 50,
        points: [
          [0, 0],
          [10, 10],
        ],
      },
    }).success,
    true,
  );
});

test('happy path: analyze_image_to_cad inspection mode enqueues a job with exact parameters', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const res = await client.callTool({
    name: 'analyze_image_to_cad',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      image_base64: b64,
      threshold_mode: 'adaptive',
      invert: true,
      tolerance: 0.005,
      create_solid: false,
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.status, 'queued');

  const picked = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'analyze_image_to_cad');
  assert.equal(picked.job?.image_base64, b64);
  assert.equal(picked.job?.threshold_mode, 'adaptive');
  assert.equal(picked.job?.invert, true);
  assert.equal(picked.job?.tolerance, 0.005);
  assert.equal(picked.job?.create_solid, false);
});

test('happy path: analyze_image_to_cad solid generation mode enqueues a job with depth and confirmed', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const res = await client.callTool({
    name: 'analyze_image_to_cad',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      image_base64: b64,
      create_solid: true,
      depth: 25.0,
      plane: 'XZ',
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.status, 'queued');

  const picked = store.heartbeat(device.credential!, [freecad]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.id, body.jobId);
  assert.equal(picked.job?.type, 'analyze_image_to_cad');
  assert.equal(picked.job?.create_solid, true);
  assert.equal(picked.job?.depth, 25.0);
  assert.equal(picked.job?.plane, 'XZ');
  assert.equal(picked.job?.confirmed, true);
});

test('analyze_image_to_cad solid mode rejects when depth is omitted and enqueues no job', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice');
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const res = await client.callTool({
    name: 'analyze_image_to_cad',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'cad',
      image_base64: b64,
      create_solid: true,
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('analyze_image_to_cad requires write permission', async () => {
  const store = new Store(':memory:');
  pairAndApprove(store, 'alice', 'Workstation', [freecad]);
  const client = await connectClient(store, 'alice', async () => {
    throw new Error('Forbidden: insufficient scope.');
  });
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const res = await client.callTool({
    name: 'analyze_image_to_cad',
    arguments: {
      image_base64: b64,
      create_solid: false,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('analyzeImageToCadSchema rejects invalid format and oversized payloads', () => {
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      image_base64: 'data:text/html;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAA==',
      create_solid: false,
    }).success,
    false,
  );
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      image_base64: 'not valid base64 with special characters ???$$$###@@@',
      create_solid: false,
    }).success,
    false,
  );
  // Oversized payload (> 5 MB)
  const hugePayload = 'A'.repeat(5_000_001);
  assert.equal(
    analyzeImageToCadSchema.safeParse({
      image_base64: hugePayload,
      create_solid: false,
    }).success,
    false,
  );
});
