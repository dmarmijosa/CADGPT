import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserSecurityPolicy } from '../src/security.js';

test('CSP allows issuer discovery and token paths without allowing other origins', () => {
  const policy = browserSecurityPolicy('https://identity.example/realms/cadgpt');
  assert.deepEqual(policy.directives.connectSrc, ["'self'", 'https://identity.example']);
  assert.deepEqual(policy.directives.scriptSrc, ["'self'"]);
  assert.deepEqual(policy.directives.scriptSrcAttr, ["'none'"]);
  assert.throws(() => browserSecurityPolicy('http://identity.example/realms/cadgpt'));
  assert.throws(() => browserSecurityPolicy('https://user:password@identity.example'));
  assert.equal(
    browserSecurityPolicy('http://localhost:8080/realms/cadgpt').directives.connectSrc[1],
    'http://localhost:8080',
  );
});

test('Angular production CSS does not need CSP-blocked inline onload handlers', () => {
  const config = JSON.parse(
    readFileSync(new URL('../../web/angular.json', import.meta.url), 'utf8'),
  );
  const optimization = config.projects.web.architect.build.configurations.production.optimization;
  assert.equal(optimization.styles.inlineCritical, false);
  assert.equal(optimization.styles.minify, true);
  assert.equal(optimization.scripts, true);
});
