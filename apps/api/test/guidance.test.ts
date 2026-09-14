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

test('resource list is exactly the three guidance URIs and each is readable with no code/path hints', async () => {
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
