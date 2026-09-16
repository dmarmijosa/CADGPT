#!/usr/bin/env node

const origin = (process.argv[2] ?? process.env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '');
if (!origin) {
  console.error('Usage: npm run verify:chatgpt-oauth -w api -- https://your-cadgpt-host');
  process.exit(2);
}

const failures = [];
const pass = (message) => console.log(`PASS ${message}`);
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL ${message}`);
};

async function readJson(url, init) {
  const response = await fetch(url, { redirect: 'error', ...init });
  const body = await response.json().catch(() => undefined);
  return { response, body };
}

try {
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource/mcp`;
  const resource = await readJson(resourceMetadataUrl);
  if (resource.response.ok) pass('protected-resource metadata is reachable');
  else fail(`protected-resource metadata returned HTTP ${resource.response.status}`);

  const expectedResource = `${origin}/mcp`;
  if (resource.body?.resource === expectedResource) pass('resource identifier matches /mcp');
  else fail(`resource identifier must be ${expectedResource}`);

  const issuer = resource.body?.authorization_servers?.[0];
  if (typeof issuer === 'string') pass('authorization server is declared');
  else fail('authorization_servers[0] is missing');

  for (const scope of ['cad:read', 'cad:write']) {
    if (resource.body?.scopes_supported?.includes(scope)) pass(`${scope} is advertised`);
    else fail(`${scope} is not advertised`);
  }

  if (typeof issuer === 'string') {
    const discovery = await readJson(`${issuer}/.well-known/openid-configuration`);
    if (discovery.response.ok) pass('OIDC discovery is reachable');
    else fail(`OIDC discovery returned HTTP ${discovery.response.status}`);

    for (const endpoint of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint']) {
      if (typeof discovery.body?.[endpoint] === 'string') pass(`${endpoint} is advertised`);
      else fail(`${endpoint} is missing from OIDC discovery`);
    }
    if (discovery.body?.code_challenge_methods_supported?.includes('S256'))
      pass('authorization server advertises PKCE S256');
    else fail('authorization server does not advertise PKCE S256');

    for (const scope of ['openid', 'email', 'cad:read', 'cad:write']) {
      if (discovery.body?.scopes_supported?.includes(scope)) pass(`${scope} is discoverable`);
      else fail(`${scope} is missing from OIDC scopes_supported`);
    }
  }

  const unauthorized = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    redirect: 'error',
  });
  const challenge = unauthorized.headers.get('www-authenticate') ?? '';
  if (unauthorized.status === 401) pass('unauthenticated MCP request is rejected with 401');
  else fail(`unauthenticated MCP request returned HTTP ${unauthorized.status}, expected 401`);
  if (challenge.includes(`resource_metadata="${resourceMetadataUrl}"`))
    pass('WWW-Authenticate points to protected-resource metadata');
  else fail('WWW-Authenticate does not identify protected-resource metadata');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (failures.length) {
  console.error(`\nOAuth readiness verification failed (${failures.length} check(s)).`);
  process.exit(1);
}

console.log('\nOAuth discovery and MCP challenge checks passed.');
console.log(
  'A browser sign-in is still required to verify consent, token claims, UserInfo, and tools/list.',
);
