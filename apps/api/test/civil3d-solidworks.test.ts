import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CAD_KINDS, Store, cadSchema } from '../src/store.js';
import { registerTools, extrudeCrossSectionSchema } from '../src/tools.js';
import { determineModelingEngine, registerGuidance } from '../src/guidance.js';
import { VALID_ENGINES } from '../src/workspace.js';

// Simulated agents: capability sets mirror `agent/cadgpt_agent/discovery.py`
// (`CIVIL3D_OPS`, `SOLIDWORKS_OPS`). No real CAD runs in these tests.
const civil3d = {
  id: 'civil3d',
  name: 'Civil3D',
  path: 'C:\\Program Files\\Autodesk\\AutoCAD 2026\\accoreconsole.exe',
  version: 'Not verified',
  executable: true,
  capabilities: {
    execute: true,
    edition: 'full',
    console: 'C:\\Program Files\\Autodesk\\AutoCAD 2026\\accoreconsole.exe',
    ops: ['create_box', 'extrude_rect', 'boolean_cut', 'export_design', 'extrude_cross_section'],
    mesh: true,
  },
};

const autocad = { ...civil3d, id: 'autocad', name: 'AutoCAD' };
autocad.capabilities = {
  ...civil3d.capabilities,
  ops: civil3d.capabilities.ops.filter((op) => op !== 'extrude_cross_section'),
};

const solidworks = {
  id: 'solidworks',
  name: 'SolidWorks',
  path: 'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe',
  version: 'Not verified',
  executable: true,
  capabilities: {
    execute: true,
    edition: null,
    console: null,
    ops: ['create_box', 'create_cylinder', 'extrude_rect', 'export_design'],
    mesh: true,
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

async function connectClient(store: Store, owner: string) {
  const server = new McpServer({ name: 'cadgpt-test', version: '0.0.0' });
  registerTools(server, store, owner, async () => {});
  registerGuidance(server);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const body = (res: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((res.content as { type: string; text: string }[])[0].text);

test('CAD kinds include Civil 3D and SOLIDWORKS everywhere the API validates them', () => {
  assert.deepEqual([...CAD_KINDS], ['FreeCAD', 'AutoCAD', 'Civil3D', 'Blender', 'SolidWorks']);
  assert.deepEqual([...VALID_ENGINES], [...CAD_KINDS]);
  assert.equal(cadSchema.safeParse(civil3d).success, true);
  assert.equal(cadSchema.safeParse(solidworks).success, true);
  assert.equal(cadSchema.safeParse({ ...solidworks, name: 'Inventor' }).success, false);
});

test('extrudeCrossSectionSchema enforces strict mm bounds', () => {
  const ok = { bottom_width: 12, top_width: 8, height: 2.5, length: 100, confirmed: true };
  assert.equal(extrudeCrossSectionSchema.safeParse(ok).success, true);
  for (const bad of [
    { ...ok, bottom_width: 0 },
    { ...ok, top_width: -1 },
    { ...ok, length: 10001 },
    { ...ok, height: Number.NaN },
    { ...ok, confirmed: false },
    { ...ok, script: '(command "_ERASE" "_ALL" "")' },
  ]) {
    assert.equal(extrudeCrossSectionSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('extrude_cross_section enqueues a Civil 3D job and creates a Civil3D document', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Civil Workstation', [civil3d]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'extrude_cross_section',
    arguments: {
      deviceId: device.deviceId!,
      cadId: 'civil3d',
      name: 'Embankment',
      bottom_width: 12,
      top_width: 8,
      height: 2.5,
      length: 100,
      position: { x: 0, y: 0, z: 0 },
      confirmed: true,
    },
  });
  assert.equal(res.isError, undefined);
  const queued = body(res);
  assert.equal(queued.status, 'queued');
  assert.equal(store.getDocument(queued.documentId, 'alice').cadKind, 'Civil3D');

  const picked = store.heartbeat(device.credential!, [civil3d]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.type, 'extrude_cross_section');
  assert.equal(picked.job?.bottom_width, 12);
  assert.equal(picked.job?.top_width, 8);
  assert.equal(picked.job?.length, 100);
  assert.equal(picked.job?.confirmed, true);
});

test('extrude_cross_section is refused on plain AutoCAD (capability gate)', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Drafting PC', [autocad]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'extrude_cross_section',
    arguments: {
      deviceId: device.deviceId!,
      bottom_width: 12,
      top_width: 8,
      height: 2,
      length: 50,
      confirmed: true,
    },
  });
  assert.equal(res.isError, true);
  assert.equal(store.jobs('alice').length, 0);
});

test('SOLIDWORKS runs generic create ops and creates a SolidWorks document', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Product Design PC', [solidworks]);
  const client = await connectClient(store, 'alice');
  const res = await client.callTool({
    name: 'create_cylinder',
    arguments: { deviceId: device.deviceId!, radius: 5, height: 30, confirmed: true },
  });
  assert.equal(res.isError, undefined);
  const queued = body(res);
  assert.equal(store.getDocument(queued.documentId, 'alice').cadKind, 'SolidWorks');
  const picked = store.heartbeat(device.credential!, [solidworks]) as {
    job?: Record<string, unknown>;
  };
  assert.equal(picked.job?.type, 'create_cylinder');
  assert.equal(picked.job?.radius, 5);
});

test('SOLIDWORKS refuses ops outside its capability list', async () => {
  const store = new Store(':memory:');
  const device = pairAndApprove(store, 'alice', 'Product Design PC', [solidworks]);
  const client = await connectClient(store, 'alice');
  for (const [name, args] of [
    ['create_sphere', { radius: 5 }],
    ['create_blender_mesh', { primitive_type: 'cube' }],
  ] as const) {
    const res = await client.callTool({
      name,
      arguments: { deviceId: device.deviceId!, ...args, confirmed: true },
    });
    assert.equal(res.isError, true, name);
  }
  assert.equal(store.jobs('alice').length, 0);
});

test('legacy documents table is migrated to accept Civil3D and SolidWorks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cadgpt-migrate-'));
  const path = join(dir, 'store.db');
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL,
        cad_kind TEXT NOT NULL CHECK (cad_kind IN ('FreeCAD','AutoCAD','Blender')),
        name TEXT NOT NULL, native_path TEXT, created INTEGER NOT NULL,
        updated INTEGER NOT NULL, latest_job_id TEXT);
      INSERT INTO documents VALUES ('d1','alice','dev','Blender','Old',NULL,1,1,NULL);
    `);
    legacy.close();

    const store = new Store(path);
    assert.equal(store.getDocument('d1', 'alice').cadKind, 'Blender');
    const civil = store.createDocument('alice', 'dev', 'Civil3D', 'Road');
    const part = store.createDocument('alice', 'dev', 'SolidWorks', 'Bracket');
    assert.equal(store.getDocument(civil.id, 'alice').cadKind, 'Civil3D');
    assert.equal(store.getDocument(part.id, 'alice').cadKind, 'SolidWorks');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('select_modeling_engine routes civil work to Civil 3D and product design to SOLIDWORKS', async () => {
  const store = new Store(':memory:');
  const client = await connectClient(store, 'alice');
  const civil = body(
    await client.callTool({
      name: 'select_modeling_engine',
      arguments: {
        domain: 'civil',
        precision_required: 'standard',
        intended_output: '3d_printing',
      },
    }),
  );
  assert.equal(civil.recommended_engine, 'Civil3D');
  assert.ok(civil.suggested_tools.includes('extrude_cross_section'));

  const product = determineModelingEngine({
    domain: 'product',
    precision_required: 'high_tolerance',
    intended_output: 'cnc_milling',
  });
  assert.equal(product.recommended_engine, 'SolidWorks');

  // A purely visual product render still goes to Blender.
  const render = determineModelingEngine({
    domain: 'product',
    precision_required: 'visual_only',
    intended_output: 'rendering',
  });
  assert.equal(render.recommended_engine, 'Blender');
});
