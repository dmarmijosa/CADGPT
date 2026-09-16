import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Store, isValidPathShape } from './store.js';

export { isValidPathShape };

export interface RootsRouterOptions {
  /** Injected so tests never need a real JWKS server — main.ts passes the real `auth`. */
  auth: (header: string | undefined, scope?: string) => Promise<string>;
}

import { wrap } from './http.js';

export const rootPathSchema = z.string().min(1).max(1024).refine(isValidPathShape, {
  message: 'Path must be an absolute POSIX, Windows, or UNC path without .. or NUL bytes',
});

export function rootsRouter(store: Store, opts: RootsRouterOptions): Router {
  const router = Router();

  // POST /api/devices/:deviceId/roots - add an allowed root for device (OIDC-only)
  router.post(
    '/api/devices/:deviceId/roots',
    rateLimit({ windowMs: 60000, limit: 10 }),
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization, 'cad:write');
      const deviceId = z.uuid().parse(req.params.deviceId);
      const b = z
        .object({
          path: rootPathSchema,
        })
        .strict()
        .parse(req.body);
      res.status(201).json(store.addRoot(owner, deviceId, b.path));
    }),
  );

  // GET /api/devices/:deviceId/roots - list allowed roots for device (OIDC-only)
  router.get(
    '/api/devices/:deviceId/roots',
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization);
      const deviceId = z.uuid().parse(req.params.deviceId);
      res.json(store.listRoots(owner, deviceId));
    }),
  );

  // DELETE /api/roots/:id - remove an allowed root (OIDC-only)
  router.delete(
    '/api/roots/:id',
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization, 'cad:write');
      const id = z.uuid().parse(req.params.id);
      res.json(store.removeRoot(owner, id));
    }),
  );

  return router;
}
