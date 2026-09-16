import { Router, type Request, type Response, type NextFunction } from 'express';
import { Store } from './store.js';

export interface AccountRouterOptions {
  dataDir: string;
  /** Injected authenticator enforcing Bearer JWT validation and scope */
  auth: (header: string | undefined, scope?: string) => Promise<string>;
  /** Keycloak admin client or stub for user identity deletion */
  keycloak: { deleteUser(userId: string): Promise<void> };
}

import { wrap } from './http.js';

export function accountRouter(store: Store, opts: AccountRouterOptions): Router {
  const router = Router();

  const handleDelete = wrap(async (req: Request, res: Response) => {
    // 1. Enforce Bearer JWT with 'cad:write' scope; derive owner strictly from token sub
    const owner = await opts.auth(req.headers.authorization, 'cad:write');

    // Anti-IDOR invariant: any caller-supplied identifier in query or body is ignored.

    // 2. Fail-fast Keycloak deletion first (throws DomainError(502) on failure)
    await opts.keycloak.deleteUser(owner);

    // 3. Filesystem mesh unlinking and transactional SQLite cascade purge across all 7 tables
    store.deleteAccount(owner, opts.dataDir);

    // 4. Respond with HTTP 204 No Content
    res.status(204).end();
  });

  router.delete('/api/account', handleDelete);
  router.delete('/api/users/me', handleDelete);

  return router;
}
