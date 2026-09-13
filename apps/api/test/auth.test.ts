import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authenticator } from '../src/auth.js';
test('JWT signature, audience, expiry and scopes are mandatory', async () => {
  const keys = await generateKeyPair('RS256');
  const jwk = await exportJWK(keys.publicKey);
  const server = createServer((_q, r) => {
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const verify = authenticator(
      'https://issuer.example',
      'cadgpt-api',
      'http://127.0.0.1:' + address.port,
    );
    const sign = (aud: string, exp: number, scope: string) =>
      new SignJWT({ scope })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('alice')
        .setIssuer('https://issuer.example')
        .setAudience(aud)
        .setExpirationTime(exp)
        .sign(keys.privateKey);
    const future = Math.floor(Date.now() / 1000) + 60;
    assert.equal(await verify('Bearer ' + (await sign('cadgpt-api', future, 'cad:read'))), 'alice');
    await assert.rejects(verify(undefined));
    await assert.rejects(verify('Bearer nope'));
    await assert.rejects(verify('Bearer ' + (await sign('other', future, 'cad:read'))));
    await assert.rejects(verify('Bearer ' + (await sign('cadgpt-api', 1, 'cad:read'))));
    await assert.rejects(verify('Bearer ' + (await sign('cadgpt-api', future, 'openid'))));
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});
