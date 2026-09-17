import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGuidance, SERVER_INSTRUCTIONS } from '../src/guidance.js';

const RESOURCE_URIS = [
  'cadgpt://guidance/mechanical',
  'cadgpt://guidance/architectural',
  'cadgpt://guidance/units-tolerances',
  'cadgpt://guidance/modeling-engine-selection',
];

/**
 * spec expert-design-guidance "No Code/Path Hints in Guidance": guidance text
 * must reference only allowlisted tools/parameters and must never suggest
 * code, script, or path-based usage.
 */
function assertNoCodeOrPathHints(label: string, text: string) {
  assert.equal(text.includes('```'), false, `${label} must not contain a code fence`);
  assert.equal(text.includes('import '), false, `${label} must not contain an import statement`);
  assert.equal(text.includes('def '), false, `${label} must not contain a function definition`);
  assert.equal(text.includes('(load'), false, `${label} must not contain a load/require call`);
  assert.equal(text.includes('#!'), false, `${label} must not contain a shebang`);
  assert.equal(text.includes('/Users/'), false, `${label} must not contain an absolute unix path`);
  assert.equal(text.includes('C:\\'), false, `${label} must not contain an absolute windows path`);
  assert.equal(text.includes('/tmp/'), false, `${label} must not contain a temp path`);
  assert.equal(text.includes('../'), false, `${label} must not contain a relative path traversal`);
  const urlMatches = text.match(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s)]+/g) ?? [];
  for (const url of urlMatches) {
    assert.equal(
      url.startsWith('cadgpt://'),
      true,
      `${label} URL "${url}" must be a cadgpt:// URI`,
    );
  }
}

async function connectClient() {
  const server = new McpServer(
    { name: 'cadgpt-test', version: '0.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerGuidance(server);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test('instructions mention millimeters and selection_required with no code/path hints', () => {
  assertNoCodeOrPathHints('instructions', SERVER_INSTRUCTIONS);
  assert.match(SERVER_INSTRUCTIONS, /millimeters/i);
  assert.match(SERVER_INSTRUCTIONS, /selection_required/);
});

test('resource list is exactly the four guidance URIs and each is readable with no code/path hints', async () => {
  const client = await connectClient();
  const list = await client.listResources();
  const uris = list.resources.map((r) => r.uri).sort();
  assert.deepEqual(uris, [...RESOURCE_URIS].sort());
  assert.ok(list.resources.every((r) => r.mimeType === 'text/markdown'));

  for (const uri of RESOURCE_URIS) {
    const read = await client.readResource({ uri });
    assert.equal(read.contents.length, 1);
    const content = read.contents[0] as { text: string; mimeType?: string };
    assert.equal(content.mimeType, 'text/markdown');
    assert.ok(content.text.length > 0);
    assertNoCodeOrPathHints(uri, content.text);
  }
});

test('design_brief and design_review prompts are listed and mention read_scene plus the confirm-before-mutating rule', async () => {
  const client = await connectClient();
  const prompts = await client.listPrompts();
  const names = prompts.prompts.map((p) => p.name).sort();
  assert.deepEqual(names, ['design_brief', 'design_review']);

  const brief = await client.getPrompt({
    name: 'design_brief',
    arguments: { goal: 'A bracket that holds a bearing', domain: 'mechanical' },
  });
  const briefText = (brief.messages[0].content as { text: string }).text;
  assertNoCodeOrPathHints('design_brief', briefText);
  assert.match(briefText, /confirm/i);
  assert.match(briefText, /mutating/i);
  assert.ok(briefText.includes('read_scene'));

  const review = await client.getPrompt({
    name: 'design_review',
    arguments: { documentId: '11111111-1111-4111-8111-111111111111' },
  });
  const reviewText = (review.messages[0].content as { text: string }).text;
  assertNoCodeOrPathHints('design_review', reviewText);
  assert.match(reviewText, /confirm/i);
  assert.match(reviewText, /mutating/i);
  assert.ok(reviewText.includes('read_scene'));
});

test('select_modeling_engine tool routes organic figurine to Blender', async () => {
  const client = await connectClient();
  const res = await client.callTool({
    name: 'select_modeling_engine',
    arguments: {
      domain: 'organic',
      precision_required: 'visual_only',
      intended_output: 'rendering',
      description: 'An organic creature figurine',
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.recommended_engine, 'Blender');
  assert.ok(body.suggested_tools.includes('create_blender_mesh'));
  assert.ok(body.suggested_tools.includes('extrude_subdivide_mesh'));
  assert.ok(body.suggested_tools.includes('displace_sculpt_mesh'));
  assert.ok(typeof body.rationale === 'string' && body.rationale.length > 0);
});

test('select_modeling_engine tool routes precision bracket to FreeCAD', async () => {
  const client = await connectClient();
  const res = await client.callTool({
    name: 'select_modeling_engine',
    arguments: {
      domain: 'mechanical',
      precision_required: 'high_tolerance',
      intended_output: 'cnc_milling',
      description: 'Bearing mount bracket',
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.recommended_engine, 'FreeCAD');
  assert.ok(body.suggested_tools.includes('create_box'));
  assert.ok(body.suggested_tools.includes('create_cylinder'));
  assert.ok(body.suggested_tools.includes('boolean_cut'));
  assert.ok(typeof body.rationale === 'string' && body.rationale.length > 0);
});

test('select_modeling_engine tool routes architectural floor plan to AutoCAD', async () => {
  const client = await connectClient();
  const res = await client.callTool({
    name: 'select_modeling_engine',
    arguments: {
      domain: 'architectural',
      precision_required: 'standard',
      intended_output: 'drawing_permit',
      description: 'Single family home floor plan',
    },
  });
  assert.equal(res.isError, undefined);
  const text = (res.content as { type: string; text: string }[])[0].text;
  const body = JSON.parse(text);
  assert.equal(body.recommended_engine, 'AutoCAD');
  assert.ok(body.suggested_tools.includes('create_box'));
  assert.ok(body.suggested_tools.includes('extrude_rect'));
  assert.ok(body.suggested_tools.includes('boolean_cut'));
});

test('select_modeling_engine schema rejects invalid domain or extra code properties', async () => {
  const client = await connectClient();
  const resInvalidDomain = await client.callTool({
    name: 'select_modeling_engine',
    arguments: {
      domain: 'quantum_physics',
      precision_required: 'standard',
      intended_output: 'rendering',
    },
  });
  assert.equal(resInvalidDomain.isError, true);

  const resExtraCode = await client.callTool({
    name: 'select_modeling_engine',
    arguments: {
      domain: 'organic',
      precision_required: 'visual_only',
      intended_output: 'rendering',
      code: 'import bpy; bpy.ops.mesh.primitive_cube_add()',
    },
  });
  assert.equal(resExtraCode.isError, true);
});
