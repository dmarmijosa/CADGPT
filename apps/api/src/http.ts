import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler to forward unhandled rejections to `next(err)`.
 */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };
