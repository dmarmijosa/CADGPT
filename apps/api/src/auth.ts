import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DomainError } from './store.js';

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
