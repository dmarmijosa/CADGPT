import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../src/store.js';
import {
  registerTools,
  drawPolylineSchema,
  drawCircleSchema,
  deleteObjectSchema,
  NATIVE_EXTENSIONS,
} from '../src/tools.js';

// Simulated agents: capability lists mirror `agent/cadgpt_agent/discovery.py`.
const AUTOCAD_3D = [
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
];
const AUTOCAD_2D = ['draw_polyline', 'draw_circle', 'delete_object'];

const cad = (id: string, name: string, ops: string[]) => ({
  id,
  name,
  path: `C:\\${id}.exe`,
  version: 'Not verified',
  executable: true,
  capabilities: { execute: true, ops, mesh: true },
});

const autocad = cad('autocad', 'AutoCAD', [...AUTOCAD_3D, ...AUTOCAD_2D]);
const civil3d = cad('civil3d', 'Civil3D', [...AUTOCAD_3D, ...AUTOCAD_2D, 'extrude_cross_section']);
const blender = cad('blender', 'Blender', ['create_blender_mesh', 'read_scene', 'export_design']);
const freecad = cad('freecad', 'FreeCAD', ['create_box', 'read_scene', 'export_design']);
const solidworks = cad('solidworks', 'SolidWorks', [
  'create_box',
  'create_cylinder',
  'extrude_rect',
  'export_design',
  'read_scene',
  'translate_object',
  'rotate_object',
  'boolean_cut',
  'boolean_union',
  'boolean_intersect',
]);
// An agent from the previous release: SOLIDWORKS without read_scene.
const legacySolidworks = cad('solidworks', 'SolidWorks', [
  'create_box',
  'create_cylinder',
  'extrude_rect',
  'export_design',
]);

const ROOT = 'C:\\Projects';

function setup(cads: unknown[]) {
  const store = new Store(':memory:');
  const pair = store.begin('Workstation', cads);
  store.approve('alice', pair.userCode);
  const device = store.poll(pair.deviceSecret);
  assert.ok('credential' in device);
  store.heartbeat(device.credential!, cads);
  store.addRoot('alice', device.deviceId!, ROOT);
  return { store, device };
}

async function connect(store: Store) {
  const server = new McpServer({ name: 'cadgpt-test', version: '0.0.0' });
  registerTools(server, store, 'alice', async () => {});
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const body = (res: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((res.content as { type: string; text: string }[])[0].text);
const errorText = (res: Awaited<ReturnType<Client['callTool']>>) =>
  (res.content as { type: string; text: string }[])[0].text;

const open = (client: Client, path: string, extra: Record<string, unknown> = {}) =>
  client.callTool({
    name: 'open_external_design',
    arguments: { path, confirmed: true, ...extra },
  });

test('every CAD kind declares the native extension it opens', () => {
  assert.deepEqual(NATIVE_EXTENSIONS.SolidWorks, ['.sldprt']);
  assert.deepEqual(NATIVE_EXTENSIONS.Civil3D, ['.dwg']);
  assert.deepEqual(NATIVE_EXTENSIONS.Blender, ['.blend']);
});

test('open_external_design opens an existing SOLIDWORKS part and queues read_scene', async () => {
  const { store, device } = setup([solidworks]);
  const client = await connect(store);
  const res = await open(client, 'C:\\Projects\\bracket.SLDPRT');
  assert.equal(res.isError, undefined, errorText(res));
  const queued = body(res);
  const doc = store.getDocument(queued.documentId, 'alice');
  assert.equal(doc.cadKind, 'SolidWorks');
  assert.equal(doc.nativePath, 'C:\\Projects\\bracket.SLDPRT');
  const picked = store.heartbeat(device.credential!, [solidworks]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.type, 'read_scene');
  assert.equal(picked.job?.native_path, 'C:\\Projects\\bracket.SLDPRT');
});

test('open_external_design rejects a file type the CAD cannot open and registers nothing', async () => {
  const { store } = setup([solidworks]);
  const client = await connect(store);
  const res = await open(client, 'C:\\Projects\\site.dwg');
  assert.equal(res.isError, true);
  assert.match(errorText(res), /cannot open \.dwg/);
  assert.equal(store.listDocuments('alice').length, 0);
  assert.equal(store.jobs('alice').length, 0);
});

test('open_external_design leaves no orphan document when the CAD lacks read_scene', async () => {
  const { store } = setup([legacySolidworks]);
  const client = await connect(store);
  const res = await open(client, 'C:\\Projects\\bracket.sldprt');
  assert.equal(res.isError, true);
  assert.match(errorText(res), /cannot open existing files/);
  assert.equal(store.listDocuments('alice').length, 0);
});

test('open_external_design picks the only CAD that opens the file type', async () => {
  const { store } = setup([autocad, blender, freecad]);
  const client = await connect(store);
  const res = await open(client, 'C:\\Projects\\creature.blend');
  assert.equal(res.isError, undefined, errorText(res));
  assert.equal(store.getDocument(body(res).documentId, 'alice').cadKind, 'Blender');
});

test('open_external_design asks when AutoCAD and Civil 3D can both open a .dwg', async () => {
  const { store } = setup([autocad, civil3d, blender]);
  const client = await connect(store);
  const res = await open(client, 'C:\\Projects\\road.dwg');
  const answer = body(res);
  assert.equal(answer.selection_required, true);
  assert.deepEqual(answer.candidates.map((c: { cadName: string }) => c.cadName).sort(), [
    'AutoCAD',
    'Civil3D',
  ]);
  assert.equal(store.listDocuments('alice').length, 0);

  const chosen = await open(client, 'C:\\Projects\\road.dwg', { cadId: 'civil3d' });
  assert.equal(store.getDocument(body(chosen).documentId, 'alice').cadKind, 'Civil3D');
});

test('open_external_design still refuses paths outside allowed roots', async () => {
  const { store } = setup([solidworks]);
  const client = await connect(store);
  const res = await open(client, 'D:\\Elsewhere\\bracket.SLDPRT');
  assert.equal(res.isError, true);
  assert.equal(store.listDocuments('alice').length, 0);
});

test('2D drafting schemas validate points, layers and handles', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  assert.equal(drawPolylineSchema.safeParse({ points: pts, confirmed: true }).success, true);
  assert.equal(
    drawPolylineSchema.safeParse({ points: pts, closed: true, confirmed: true }).success,
    false,
  );
  assert.equal(
    drawPolylineSchema.safeParse({ points: [{ x: 0, y: 0 }], confirmed: true }).success,
    false,
  );
  assert.equal(
    drawPolylineSchema.safeParse({
      points: Array.from({ length: 501 }, (_, i) => ({ x: i, y: 0 })),
      confirmed: true,
    }).success,
    false,
  );
  for (const layer of ['A"B', 'with space', '(command "_ERASE")', 'x'.repeat(32)]) {
    assert.equal(
      drawCircleSchema.safeParse({ radius: 5, layer, confirmed: true }).success,
      false,
      layer,
    );
  }
  assert.equal(
    drawCircleSchema.safeParse({ radius: 5, layer: 'Lot_Lines-01', confirmed: true }).success,
    true,
  );
  const documentId = '00000000-0000-4000-8000-000000000000';
  assert.equal(
    deleteObjectSchema.safeParse({ documentId, object: '2A3F', confirmed: true }).success,
    true,
  );
  assert.equal(
    deleteObjectSchema.safeParse({ documentId, object: '../x', confirmed: true }).success,
    false,
  );
});

test('draw_polyline and delete_object enqueue AutoCAD jobs on an existing drawing', async () => {
  const { store, device } = setup([autocad]);
  const client = await connect(store);
  const opened = body(await open(client, 'C:\\Projects\\plan.dwg'));
  store.heartbeat(device.credential!, [autocad]); // agent claims the read_scene job
  store.complete(device.credential!, opened.jobId, 'ok', true);

  const drawn = await client.callTool({
    name: 'draw_polyline',
    arguments: {
      documentId: opened.documentId,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
      closed: true,
      layer: 'Walls',
      confirmed: true,
    },
  });
  assert.equal(drawn.isError, undefined, errorText(drawn));
  const job = (store.heartbeat(device.credential!, [autocad]) as { job?: Record<string, unknown> })
    .job;
  assert.equal(job?.type, 'draw_polyline');
  assert.equal(job?.native_path, 'C:\\Projects\\plan.dwg');
  assert.equal(job?.layer, 'Walls');
  store.complete(device.credential!, job!.id as string, 'ok', true);

  const deleted = await client.callTool({
    name: 'delete_object',
    arguments: { documentId: opened.documentId, object: '2A3F', confirmed: true },
  });
  assert.equal(deleted.isError, undefined, errorText(deleted));
});

test('2D drafting is refused on CADs that do not advertise it', async () => {
  const { store } = setup([freecad]);
  const client = await connect(store);
  const res = await client.callTool({
    name: 'draw_circle',
    arguments: { radius: 5, confirmed: true },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});
