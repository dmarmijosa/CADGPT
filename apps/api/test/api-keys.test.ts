import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';

test('createApiKey returns a cad_-prefixed key once; the full key is never stored', () => {
  const store = new Store(':memory:');
  const created = store.createApiKey('alice', 'CI key', []);
  assert.match(created.key, /^cad_[0-9a-f]{12}_.+$/);
  assert.equal(created.name, 'CI key');
  assert.deepEqual(created.scopes.sort(), ['cad:read', 'cad:write']);
  assert.ok(created.id);
  assert.ok(created.created);
  // The raw row never carries `key`, only its hash.
  const row = store.db.prepare('SELECT * FROM api_keys WHERE id=?').get(created.id) as {
    key_hash: string;
  };
  assert.notEqual(row.key_hash, created.key);
  assert.equal(row.key_hash.length, 64); // sha256 hex digest
});

test('createApiKey validates scopes: unknown scope rejected, explicit subset kept, empty defaults to full access', () => {
  const store = new Store(':memory:');
  assert.throws(
    () => store.createApiKey('alice', 'bad', ['cad:read', 'sudo']),
    (e: unknown) => e instanceof Error && /Unknown scope/.test(e.message),
  );
  const readOnly = store.createApiKey('alice', 'read only', ['cad:read']);
  assert.deepEqual(readOnly.scopes, ['cad:read']);
  const full = store.createApiKey('alice', 'full', []);
  assert.deepEqual(full.scopes.sort(), ['cad:read', 'cad:write']);
});

test('listApiKeys is redacted and owner-scoped, newest first', () => {
  const store = new Store(':memory:');
  const a1 = store.createApiKey('alice', 'first', []);
  const a2 = store.createApiKey('alice', 'second', []);
  store.createApiKey('bob', 'bobs key', []);
  const aliceKeys = store.listApiKeys('alice');
  assert.equal(aliceKeys.length, 2);
  assert.deepEqual(
    aliceKeys.map((k) => k.id),
    [a2.id, a1.id],
  );
  for (const k of aliceKeys) {
    assert.equal('key' in k, false);
    assert.equal('key_hash' in k, false);
    assert.equal('keyHash' in k, false);
  }
  assert.equal(store.listApiKeys('bob').length, 1);
});

test('revokeApiKey is owner-scoped: a foreign owner cannot revoke and sees not-found', () => {
  const store = new Store(':memory:');
  const key = store.createApiKey('alice', 'to revoke', []);
  assert.throws(
    () => store.revokeApiKey('bob', key.id),
    (e: unknown) => e instanceof Error && /not found/i.test(e.message),
  );
  assert.equal(store.listApiKeys('alice')[0].revoked, false);
  const result = store.revokeApiKey('alice', key.id);
  assert.equal(result.revoked, true);
  assert.equal(store.listApiKeys('alice')[0].revoked, true);
});

test('verifyApiKey returns the owner for a valid key and updates last_used', () => {
  let now = 1000;
  const store = new Store(':memory:', () => now);
  const key = store.createApiKey('alice', 'ci', ['cad:read', 'cad:write']);
  assert.equal(store.listApiKeys('alice')[0].lastUsed, null);
  now = 2000;
  const owner = store.verifyApiKey(key.key, 'cad:read');
  assert.equal(owner, 'alice');
  assert.equal(store.listApiKeys('alice')[0].lastUsed, 2000);
});

test('verifyApiKey rejects an unknown key, a garbage string, and a revoked key with 401', () => {
  const store = new Store(':memory:');
  const key = store.createApiKey('alice', 'ci', []);
  assert.throws(
    () => store.verifyApiKey('cad_' + '0'.repeat(12) + '_nope', 'cad:read'),
    (e: unknown) => e instanceof Error && (e as { status?: number }).status === 401,
  );
  assert.throws(
    () => store.verifyApiKey('not-even-shaped-like-a-key', 'cad:read'),
    (e: unknown) => (e as { status?: number }).status === 401,
  );
  store.revokeApiKey('alice', key.id);
  assert.throws(
    () => store.verifyApiKey(key.key, 'cad:read'),
    (e: unknown) => (e as { status?: number }).status === 401,
  );
});

test('verifyApiKey rejects a tampered secret of the same length (timing-safe path) with 401', () => {
  const store = new Store(':memory:');
  const key = store.createApiKey('alice', 'ci', []);
  // The key is `cad_<12-hex-prefix>_<secret>`; the base64url secret can itself
  // contain `_`, so anchor on the fixed-width prefix instead of split('_').
  const match = key.key.match(/^(cad_[0-9a-f]{12}_)(.+)$/)!;
  const [, head, secretPart] = match;
  // Flip one character in the secret, keeping the exact same length.
  const flipped = (secretPart[0] === 'a' ? 'b' : 'a') + secretPart.slice(1);
  const tampered = `${head}${flipped}`;
  assert.equal(tampered.length, key.key.length);
  assert.throws(
    () => store.verifyApiKey(tampered, 'cad:read'),
    (e: unknown) => (e as { status?: number }).status === 401,
  );
  // The genuine key still works.
  assert.equal(store.verifyApiKey(key.key, 'cad:read'), 'alice');
});

test('verifyApiKey enforces scope: a cad:read-only key is rejected with 403 for cad:write', () => {
  const store = new Store(':memory:');
  const key = store.createApiKey('alice', 'read only', ['cad:read']);
  assert.equal(store.verifyApiKey(key.key, 'cad:read'), 'alice');
  assert.throws(
    () => store.verifyApiKey(key.key, 'cad:write'),
    (e: unknown) => (e as { status?: number }).status === 403,
  );
});

test('a key maps to exactly one owner: it can never resolve to a different owner', () => {
  const store = new Store(':memory:');
  const aliceKey = store.createApiKey('alice', 'ci', []);
  const bobKey = store.createApiKey('bob', 'ci', []);
  assert.equal(store.verifyApiKey(aliceKey.key, 'cad:read'), 'alice');
  assert.equal(store.verifyApiKey(bobKey.key, 'cad:read'), 'bob');
  assert.notEqual(store.verifyApiKey(aliceKey.key, 'cad:read'), 'bob');
});
