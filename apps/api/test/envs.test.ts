import { test } from 'node:test';
import assert from 'node:assert/strict';

// `envs.ts` validates and exports a module-level `envs` constant at import time
// (matching the project's fail-fast config pattern), so the process environment
// must already satisfy the required variables before the module is first
// imported. Defaulting them here (only if unset) keeps this test file isolated
// from whatever the surrounding shell/CI environment does or does not export.
process.env.PUBLIC_ORIGIN ??= 'http://localhost:3000';
process.env.OIDC_ISSUER ??= 'http://localhost:8080/realms/cadgpt';
process.env.OIDC_AUDIENCE ??= 'cadgpt-api';

const { loadEnvs } = await import('../src/config/envs.js');

const validSource = {
  PUBLIC_ORIGIN: 'http://localhost:3000',
  OIDC_ISSUER: 'http://localhost:8080/realms/cadgpt',
  OIDC_AUDIENCE: 'cadgpt-api',
};

test('valid env parses with defaults', () => {
  const envs = loadEnvs(validSource);
  assert.equal(envs.port, 3000);
  assert.equal(envs.host, '127.0.0.1');
  assert.equal(envs.nodeEnv, 'development');
  assert.equal(envs.publicOrigin, validSource.PUBLIC_ORIGIN);
  assert.equal(envs.oidcIssuer, validSource.OIDC_ISSUER);
  assert.equal(envs.oidcAudience, validSource.OIDC_AUDIENCE);
  assert.equal(envs.oidcJwksUrl, undefined);
  assert.equal(envs.dataDir, undefined);
});

test('missing PUBLIC_ORIGIN throws Config validation error', () => {
  const { PUBLIC_ORIGIN: _publicOrigin, ...withoutOrigin } = validSource;
  assert.throws(() => loadEnvs(withoutOrigin), /Config validation error: /);
});

test('unknown keys are tolerated', () => {
  const envs = loadEnvs({ ...validSource, SOME_UNRELATED_VAR: 'anything' });
  assert.equal(envs.publicOrigin, validSource.PUBLIC_ORIGIN);
});
