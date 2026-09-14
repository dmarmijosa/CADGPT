import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Store, DomainError, cadSchema, boxSchema } from './store.js';
import { registerTools } from './tools.js';
import { registerGuidance, SERVER_INSTRUCTIONS } from './guidance.js';
import { authenticator } from './auth.js';
import { browserSecurityPolicy } from './security.js';
import { envs } from './config/envs.js';

@Module({})
class AppModule {}

const origin = envs.publicOrigin;
const issuer = envs.oidcIssuer;
for (const address of [origin, issuer]) {
  const u = new URL(address);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
    throw new Error('Non-loopback URLs require HTTPS.');
}
const auth = authenticator(
  issuer,
  envs.oidcAudience,
  envs.oidcJwksUrl ?? issuer + '/protocol/openid-connect/certs',
);
const data = envs.dataDir ?? resolve('../../data');
mkdirSync(data, { recursive: true, mode: 0o700 });
const store = new Store(resolve(data, 'cadgpt.db'));
const app = await NestFactory.create(AppModule, { bodyParser: false });
const http = app.getHttpAdapter().getInstance();
http.disable('x-powered-by');
http.use(helmet({ contentSecurityPolicy: browserSecurityPolicy(issuer) }));
http.use(express.json({ limit: '32kb' }));
http.use(
  rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }),
);
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
const token = (r: Request) => {
  const h = r.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new DomainError(401, 'Device credential required.');
  return h.slice(7);
};
http.get('/api/config', (_: Request, r: Response) =>
  r.json({
    issuer,
    clientId: 'cadgpt-web',
    scopes: 'openid profile cad:read cad:write',
    publicOrigin: origin,
  }),
);
http.get('/api/health', (_: Request, r: Response) =>
  r.json({ status: 'ok', version: '0.1.0-alpha' }),
);
http.post(
  '/api/pairings',
  rateLimit({ windowMs: 60000, limit: 5 }),
  wrap((q, r) => {
    const b = z
      .object({ name: z.string().min(1).max(80), cads: z.array(cadSchema).max(30) })
      .strict()
      .parse(q.body);
    r.json({ ...store.begin(b.name, b.cads), verificationUri: origin + '/pair' });
  }),
);
http.post(
  '/api/pairings/poll',
  wrap((q, r) => r.json(store.poll(z.string().min(40).max(100).parse(q.body.deviceSecret)))),
);
http.post(
  '/api/pairings/approve',
  rateLimit({ windowMs: 60000, limit: 10 }),
  wrap(async (q, r) =>
    r.json(
      store.approve(
        await auth(q.headers.authorization, 'cad:write'),
        z
          .string()
          .regex(/^[A-Fa-f0-9]{12}$/)
          .parse(q.body.userCode),
      ),
    ),
  ),
);
http.get(
  '/api/devices',
  wrap(async (q, r) => r.json(store.devices(await auth(q.headers.authorization)))),
);
http.delete(
  '/api/devices/:id',
  wrap(async (q, r) =>
    r.json(
      store.revoke(await auth(q.headers.authorization, 'cad:write'), z.uuid().parse(q.params.id)),
    ),
  ),
);
http.get(
  '/api/jobs',
  wrap(async (q, r) => r.json(store.jobs(await auth(q.headers.authorization)))),
);
http.post(
  '/api/jobs',
  wrap(async (q, r) =>
    r
      .status(201)
      .json(
        store.enqueue(await auth(q.headers.authorization, 'cad:write'), boxSchema.parse(q.body)),
      ),
  ),
);
http.post(
  '/api/agent/poll',
  wrap((q, r) => r.json(store.heartbeat(token(q), z.array(cadSchema).max(30).parse(q.body.cads)))),
);
http.post(
  '/api/agent/results/:id',
  wrap((q, r) => {
    // 16000 accommodates the JSON-wrapped `{ message, scene }` contract
    // (scene capped at ~12 kB) while staying inside the 32 kb JSON body cap.
    const b = z
      .object({ ok: z.boolean(), result: z.string().max(16000) })
      .strict()
      .parse(q.body);
    r.json(store.complete(token(q), z.uuid().parse(q.params.id), b.result, b.ok));
  }),
);
const metadata = {
  resource: origin + '/mcp',
  authorization_servers: [issuer],
  scopes_supported: ['cad:read', 'cad:write'],
  bearer_methods_supported: ['header'],
};
http.get(
  ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (_: Request, r: Response) => r.json(metadata),
);
http.post(
  '/mcp',
  wrap(async (q, r) => {
    const owner = await auth(q.headers.authorization);
    const server = new McpServer(
      { name: 'cadgpt', version: '0.1.0' },
      { instructions: SERVER_INSTRUCTIONS },
    );
    registerTools(server, store, owner, () => auth(q.headers.authorization, 'cad:write'));
    registerGuidance(server);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    r.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(q, r, q.body);
  }),
);
http.all('/mcp', (_: Request, r: Response) =>
  r.status(405).json({ error: 'Use POST for stateless MCP.' }),
);
http.use('/api', (_: Request, r: Response) => r.status(404).json({ error: 'Not found' }));
const web = resolve('../web/dist/web/browser');
http.use(express.static(web));
http.get('/{*path}', (_: Request, r: Response) => r.sendFile(resolve(web, 'index.html')));
http.use((e: unknown, _q: Request, r: Response, _n: NextFunction) => {
  const status = e instanceof DomainError ? e.status : e instanceof z.ZodError ? 400 : 500;
  if (status === 401)
    r.setHeader(
      'WWW-Authenticate',
      'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource/mcp"',
    );
  r.status(status).json({
    error:
      status === 500
        ? 'Internal server error.'
        : e instanceof Error
          ? e.message
          : 'Invalid request.',
  });
});
await app.listen(envs.port, envs.host);
