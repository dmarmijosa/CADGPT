import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

interface RealmClient {
  clientId: string;
  enabled?: boolean;
  publicClient?: boolean;
  standardFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  implicitFlowEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  consentRequired?: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  attributes?: Record<string, string>;
  defaultClientScopes?: string[];
  protocolMappers?: Array<{
    protocolMapper: string;
    config?: Record<string, string>;
  }>;
}

interface RealmExport {
  clients: RealmClient[];
  clientScopes?: Array<{
    name: string;
    protocolMappers?: RealmClient['protocolMappers'];
  }>;
}

test('production realm defines a least-privilege ChatGPT OAuth client', async () => {
  const path = new URL('../../../deploy/prod/cadgpt-realm.prod.json', import.meta.url);
  const realm = JSON.parse(await readFile(path, 'utf8')) as RealmExport;
  const client = realm.clients.find(({ clientId }) => clientId === 'cadgpt-chatgpt');

  assert.ok(client, 'cadgpt-chatgpt client is required');
  assert.equal(client.enabled, true);
  assert.equal(client.publicClient, true);
  assert.equal(client.standardFlowEnabled, true);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.implicitFlowEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  assert.equal(client.consentRequired, true);
  assert.deepEqual(client.redirectUris, ['https://chatgpt.com/connector_platform_oauth_redirect']);
  assert.deepEqual(client.webOrigins, []);
  assert.equal(client.attributes?.['pkce.code.challenge.method'], 'S256');
  assert.deepEqual(
    [...(client.defaultClientScopes ?? [])].sort(),
    ['cad:read', 'cad:write', 'email'].sort(),
  );

  const audienceMapper = client.protocolMappers?.find(
    ({ protocolMapper }) => protocolMapper === 'oidc-audience-mapper',
  );
  assert.equal(audienceMapper?.config?.['included.custom.audience'], 'cadgpt-api');
  assert.equal(audienceMapper?.config?.['access.token.claim'], 'true');

  const emailScope = realm.clientScopes?.find(({ name }) => name === 'email');
  assert.ok(emailScope, 'email client scope is required');
  const emailMapper = emailScope.protocolMappers?.find(
    ({ protocolMapper }) => protocolMapper === 'oidc-usermodel-property-mapper',
  );
  assert.equal(emailMapper?.config?.['claim.name'], 'email');
  assert.equal(emailMapper?.config?.['userinfo.token.claim'], 'true');
});
