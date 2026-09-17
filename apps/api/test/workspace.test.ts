import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store, DomainError } from '../src/store.js';
import {
  registerTools,
  auditProjectStructureSchema,
  auditProjectStructureBaseSchema,
  reorganizeProjectStructureSchema,
  reorganizeProjectStructureBaseSchema,
  workspaceSchemas,
} from '../src/tools.js';
import {
  initProject,
  loadProjectManifest,
  saveProjectManifest,
  auditProjectStructure,
  reorganizeProjectStructure,
} from '../src/workspace.js';

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

test('workspace schema definitions and boundary validation', () => {
  assert.ok(workspaceSchemas.audit_project_structure);
  assert.ok(workspaceSchemas.reorganize_project_structure);

  const testUuid1 = '11111111-2222-4333-8444-555555555555';
  const testUuid2 = '22222222-3333-4444-8555-666666666666';

  // audit schema accepts projectId
  const parsedAuditProjectId = auditProjectStructureSchema.safeParse({
    projectId: testUuid1,
  });
  assert.equal(parsedAuditProjectId.success, true);

  // audit schema accepts documentId
  const parsedAuditDocId = auditProjectStructureSchema.safeParse({
    documentId: testUuid2,
  });
  assert.equal(parsedAuditDocId.success, true);

  // audit schema accepts project_dir
  const parsedAuditDir = auditProjectStructureSchema.safeParse({
    project_dir: '/home/alice/projects/robot',
  });
  assert.equal(parsedAuditDir.success, true);

  // audit schema rejects empty target
  const parsedAuditEmpty = auditProjectStructureSchema.safeParse({});
  assert.equal(parsedAuditEmpty.success, false);

  // audit schema rejects code-shaped input
  const parsedAuditCode = auditProjectStructureSchema.safeParse({
    projectId: testUuid1,
    code: 'system("rm -rf /")',
  });
  assert.equal(parsedAuditCode.success, false);

  // reorganize schema requires confirmed: true
  const parsedReorgValid = reorganizeProjectStructureSchema.safeParse({
    projectId: testUuid1,
    confirmed: true,
  });
  assert.equal(parsedReorgValid.success, true);

  // reorganize schema rejects missing confirmed
  const parsedReorgNoConfirm = reorganizeProjectStructureSchema.safeParse({
    projectId: testUuid1,
  });
  assert.equal(parsedReorgNoConfirm.success, false);

  // reorganize schema rejects confirmed: false
  const parsedReorgFalseConfirm = reorganizeProjectStructureSchema.safeParse({
    projectId: testUuid1,
    confirmed: false,
  });
  assert.equal(parsedReorgFalseConfirm.success, false);

  // reorganize schema rejects code-shaped input
  const parsedReorgCode = reorganizeProjectStructureSchema.safeParse({
    projectId: testUuid1,
    confirmed: true,
    eval: 'process.exit(1)',
  });
  assert.equal(parsedReorgCode.success, false);
});

test('audit_project_structure MCP tool runs as read-only and reports non-disruptive plan', async () => {
  const store = new Store(':memory:');
  const tempDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-ws-'));
  try {
    const projectDir = resolve(tempDir, 'project-a');
    await initProject(projectDir, undefined, 'Project A');

    // Create an unorganized image in project root
    const sketchPath = resolve(projectDir, 'sketch.png');
    await writeFile(sketchPath, 'fake-png-data');

    const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
    store.addRoot('alice', device.deviceId!, tempDir);

    const client = await connectClient(store, 'alice');
    const res = await client.callTool({
      name: 'audit_project_structure',
      arguments: {
        project_dir: projectDir,
      },
    });

    assert.equal(res.isError, undefined);
    const content = (res.content as { type: string; text: string }[])[0].text;
    const report = JSON.parse(content);

    assert.equal(report.compliant, false);
    assert.equal(report.reorganizationPlan.length, 1);
    const plan = report.reorganizationPlan[0];
    assert.equal(plan.source, 'sketch.png');
    assert.equal(plan.destination, 'references/sketch.png');
    assert.equal(plan.category, 'references');
    assert.equal(plan.reason, 'misplaced_reference');

    // Disk invariant: sketch.png MUST NOT be moved or deleted during read-only audit
    assert.equal(existsSync(sketchPath), true);
    assert.equal(existsSync(resolve(projectDir, 'references', 'sketch.png')), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('reorganize_project_structure MCP tool rejects unconfirmed call (400)', async () => {
  const store = new Store(':memory:');
  const tempDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-ws-'));
  try {
    const projectDir = resolve(tempDir, 'project-b');
    await initProject(projectDir);

    const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
    store.addRoot('alice', device.deviceId!, tempDir);

    const client = await connectClient(store, 'alice');
    // Call without confirmed: true
    const res = await client.callTool({
      name: 'reorganize_project_structure',
      arguments: {
        project_dir: projectDir,
      },
    });
    // Schema validation fails at MCP level
    assert.equal(res.isError, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('audit and reorganize reject paths outside allowedRoots (400)', async () => {
  const store = new Store(':memory:');
  const tempDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-ws-'));
  const unauthorizedDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-outside-'));
  try {
    const projectDir = resolve(unauthorizedDir, 'secret-project');
    await initProject(projectDir);

    const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
    // Only register tempDir, NOT unauthorizedDir
    store.addRoot('alice', device.deviceId!, tempDir);

    const client = await connectClient(store, 'alice');
    const resAudit = await client.callTool({
      name: 'audit_project_structure',
      arguments: {
        project_dir: projectDir,
      },
    });
    assert.equal(resAudit.isError, true);

    const resReorg = await client.callTool({
      name: 'reorganize_project_structure',
      arguments: {
        project_dir: projectDir,
        confirmed: true,
      },
    });
    assert.equal(resReorg.isError, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(unauthorizedDir, { recursive: true, force: true });
  }
});

test('reorganize rejects traversal attempts outside project root', async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-ws-'));
  try {
    const projectDir = resolve(tempDir, 'project-c');
    await initProject(projectDir);

    const maliciousPlan = [
      {
        source: 'sketch.png',
        destination: '../../etc/shadow',
        category: 'references' as const,
        reason: 'malicious',
      },
    ];

    await assert.rejects(
      async () => {
        await reorganizeProjectStructure(projectDir, true, maliciousPlan);
      },
      (err: any) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.status, 400);
        return true;
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('successful confirmed reorganization moves file, preserves mtime, and updates project.json', async () => {
  const store = new Store(':memory:');
  const tempDir = await mkdtemp(resolve(tmpdir(), 'cadgpt-ws-'));
  try {
    const projectDir = resolve(tempDir, 'project-d');
    await initProject(projectDir, undefined, 'Project D');

    const sketchPath = resolve(projectDir, 'sketch.png');
    await writeFile(sketchPath, 'blueprint image data');

    // Set a known past mtime
    const pastTime = Math.floor(Date.now() / 1000) - 7200;
    await utimes(sketchPath, pastTime, pastTime);
    const initialStat = await stat(sketchPath);

    const device = pairAndApprove(store, 'alice', 'Workstation', [freecad]);
    store.addRoot('alice', device.deviceId!, tempDir);

    const client = await connectClient(store, 'alice');
    const res = await client.callTool({
      name: 'reorganize_project_structure',
      arguments: {
        project_dir: projectDir,
        confirmed: true,
      },
    });

    assert.equal(res.isError, undefined);
    const content = (res.content as { type: string; text: string }[])[0].text;
    const body = JSON.parse(content);
    assert.equal(body.success, true);
    assert.equal(body.manifestUpdated, true);
    assert.equal(body.moved.length, 1);
    assert.equal(body.moved[0].source, 'sketch.png');
    assert.equal(body.moved[0].destination, 'references/sketch.png');

    // Verify source removed and target exists
    assert.equal(existsSync(sketchPath), false);
    const destPath = resolve(projectDir, 'references', 'sketch.png');
    assert.equal(existsSync(destPath), true);

    // Verify mtime preserved
    const finalStat = await stat(destPath);
    assert.ok(Math.abs(finalStat.mtimeMs - initialStat.mtimeMs) < 10);

    // Verify project.json manifest updated
    const manifest = await loadProjectManifest(projectDir);
    const asset = manifest.inventory.find((i) => i.relativePath === 'references/sketch.png');
    assert.ok(asset);
    assert.equal(asset.category, 'references');
    assert.equal(asset.size, initialStat.size);

    // Re-auditing should now be compliant
    const auditRes = await client.callTool({
      name: 'audit_project_structure',
      arguments: {
        project_dir: projectDir,
      },
    });
    const auditReport = JSON.parse((auditRes.content as { type: string; text: string }[])[0].text);
    assert.equal(auditReport.compliant, true);
    assert.equal(auditReport.reorganizationPlan.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
