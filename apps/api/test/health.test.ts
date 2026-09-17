import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { APP_VERSION, SERVER_NAME } from '../src/version.js';

test('version.ts exports correct APP_VERSION and SERVER_NAME constants', () => {
  assert.equal(APP_VERSION, '0.2.0-alpha.1');
  assert.equal(SERVER_NAME, 'cad-engine');
});

test('GET /api/health responds with HTTP 200 and version 0.2.0-alpha.1', async () => {
  const app = express();
  app.get('/api/health', (_: Request, r: Response) =>
    r.json({ status: 'ok', version: APP_VERSION }),
  );

  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
    const body = (await res.json()) as { status: string; version: string };
    assert.deepEqual(body, { status: 'ok', version: '0.2.0-alpha.1' });
    assert.equal(body.version, APP_VERSION);
  } finally {
    server.close();
  }
});

test('MCP server initialize handshake advertises cad-engine name and 0.2.0-alpha.1 version', async () => {
  const server = new McpServer(
    { name: SERVER_NAME, version: APP_VERSION },
    { instructions: 'CAD Engine Test Server' },
  );

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const serverInfo = client.getServerVersion();
  assert.ok(serverInfo, 'Server info should be available after initialize handshake');
  assert.equal(serverInfo.name, 'cad-engine');
  assert.equal(serverInfo.version, '0.2.0-alpha.1');
  assert.equal(serverInfo.name, SERVER_NAME);
  assert.equal(serverInfo.version, APP_VERSION);

  await client.close();
  await server.close();
});

test('main.ts sources APP_VERSION and SERVER_NAME from version.js for health and MCP routes', async () => {
  const mainTsPath = new URL('../src/main.ts', import.meta.url);
  const mainContent = await readFile(mainTsPath, 'utf8');

  assert.match(
    mainContent,
    /import\s*\{[^}]*\bAPP_VERSION\b[^}]*\}\s*from\s*['"]\.\/version\.js['"]/,
    'main.ts must import APP_VERSION from ./version.js',
  );
  assert.match(
    mainContent,
    /import\s*\{[^}]*\bSERVER_NAME\b[^}]*\}\s*from\s*['"]\.\/version\.js['"]/,
    'main.ts must import SERVER_NAME from ./version.js',
  );
  assert.match(
    mainContent,
    /http\.get\(\s*['"]\/api\/health['"][\s\S]*?version:\s*APP_VERSION\s*\}/,
    'main.ts must serve APP_VERSION on GET /api/health',
  );
  assert.match(
    mainContent,
    /new\s+McpServer\(\s*\{\s*name:\s*SERVER_NAME,\s*version:\s*APP_VERSION\s*\}/,
    'main.ts must instantiate McpServer with SERVER_NAME and APP_VERSION',
  );
});
