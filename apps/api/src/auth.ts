import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DomainError } from './store.js';

/**
 * Combines OIDC with the complementary API-key path (custom/programmatic MCP
 * clients, CI, end-to-end certification): a `cad_`-prefixed bearer resolves
 * through `verifyApiKey`; anything else keeps going through `oidcAuth`
 * unchanged. Intended for `/mcp` only — REST routes, including key
 * management itself, stay on `oidcAuth` directly so an API key can never
 * manage other API keys.
 */
export function combinedAuthenticator(
  oidcAuth: (header: string | undefined, scope?: string) => Promise<string>,
  verifyApiKey: (presented: string, scope: string) => string,
) {
  return async (header: string | undefined, scope = 'cad:read') =>
    header?.startsWith('Bearer cad_')
      ? verifyApiKey(header.slice(7), scope)
      : oidcAuth(header, scope);
}

export function authenticator(issuer: string, audience: string, jwksUrl: string) {
  const keys = createRemoteJWKSet(new URL(jwksUrl));
  return async (header: string | undefined, scope = 'cad:read') => {
    if (!header?.startsWith('Bearer ')) throw new DomainError(401, 'Bearer token required.');
    try {
      const { payload } = await jwtVerify(header.slice(7), keys, {
        issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub'],
      });
      if (
        !payload.sub ||
        !String(payload.scope ?? '')
          .split(' ')
          .includes(scope)
      )
        throw new DomainError(403, 'Required scope missing.');
      return payload.sub;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(401, 'Access token is invalid or expired.');
    }
  };
}
