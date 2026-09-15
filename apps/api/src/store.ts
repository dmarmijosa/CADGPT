import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Complementary auth for the MCP endpoint (custom/programmatic clients, CI,
// end-to-end certification) alongside OIDC — never replaces it. A key is
// `cad_<prefix>_<secret>`: `prefix` is plaintext (12 hex chars) for O(1)
// lookup, `secret` is high-entropy and never stored — only `hash(fullKey)` is.
export const API_KEY_SCOPES = ['cad:read', 'cad:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// D11: additive capability object. Optional throughout so a phase-1/2a agent
// that never sends `capabilities` still validates (falls back to
// `FREECAD_OPS` in `tools.ts::enqueueOp`). Plain `z.object()` here (not
// `.strict()`) tolerates extra keys a newer agent may add later without
// breaking `heartbeat()`.
export const cadCapabilitiesSchema = z.object({
  execute: z.boolean().optional(),
  edition: z.string().nullable().optional(),
  console: z.string().nullable().optional(),
  ops: z.array(z.string()).optional(),
  mesh: z.boolean().optional(),
});
export const cadSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.enum(['FreeCAD', 'AutoCAD']),
  path: z.string().min(1).max(1024),
  version: z.string().max(120),
  executable: z.boolean(),
  capabilities: cadCapabilitiesSchema.optional(),
});
export const boxSchema = z
  .object({
    deviceId: z.uuid(),
    cadId: z.string().min(1).max(64),
    length: z.number().finite().positive().max(10000),
    width: z.number().finite().positive().max(10000),
    height: z.number().finite().positive().max(10000),
    confirmed: z.literal(true),
  })
  .strict();
export type Box = z.infer<typeof boxSchema>;
// Generic job payload: every enqueue caller (REST `/api/jobs`, MCP tools in
// `tools.ts`) validates its own per-op Zod schema before calling `enqueue()`,
// so this type only pins the two fields `enqueue()` itself reads.
export type EnqueueInput = { deviceId: string; cadId: string } & Record<string, unknown>;
type Row = Record<string, any>;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export function isValidPathShape(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('\0')) return false;
  if (p.includes('..')) return false;
  // Absolute POSIX: starts with /
  if (p.startsWith('/')) return true;
  // Windows drive absolute: e.g. C:\ or C:/
  if (/^[a-zA-Z]:[/\\]/.test(p)) return true;
  // UNC: \\server\share or //server/share
  if (p.startsWith('\\\\') || p.startsWith('//')) {
    const parts = p.slice(2).split(/[\\/]/);
    return parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0 && !parts[0].includes(' ') && !parts[1].includes(' ');
  }
  return false;
}
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Store {
  db: DatabaseSync;
  constructor(
    path: string,
    private now = () => Date.now(),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS pairings (
        secret_hash TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, cads TEXT,
        expires INTEGER, polls INTEGER DEFAULT 0, owner TEXT, consumed INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, owner TEXT, name TEXT, token_hash TEXT UNIQUE, cads TEXT,
        last_seen INTEGER, revoked INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, device_id TEXT, owner TEXT, payload TEXT, status TEXT,
        expires INTEGER, created INTEGER, result TEXT);
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL,
        cad_kind TEXT NOT NULL CHECK (cad_kind IN ('FreeCAD','AutoCAD')),
        name TEXT NOT NULL, native_path TEXT, created INTEGER NOT NULL,
        updated INTEGER NOT NULL, latest_job_id TEXT);
      CREATE INDEX IF NOT EXISTS documents_owner ON documents(owner, updated DESC);
      CREATE TABLE IF NOT EXISTS meshes (
        job_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, device_id TEXT NOT NULL,
        size INTEGER NOT NULL, sha256 TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, prefix TEXT UNIQUE NOT NULL,
        key_hash TEXT NOT NULL, scopes TEXT NOT NULL, created INTEGER NOT NULL, last_used INTEGER,
        revoked INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS api_keys_owner ON api_keys(owner, created DESC);
      CREATE TABLE IF NOT EXISTS allowed_roots (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL,
        path TEXT NOT NULL, created INTEGER NOT NULL,
        UNIQUE(owner, device_id, path));
      CREATE INDEX IF NOT EXISTS allowed_roots_owner ON allowed_roots(owner, created DESC);
    `);
    this.migrate();
  }
  // Additive, idempotent: adds `type`/`document_id` to a phase-1 `jobs` table.
  // Safe to call more than once — each ALTER only runs when the column is missing.
  migrate() {
    const columns = (this.db.prepare('PRAGMA table_info(jobs)').all() as Row[]).map((c) => c.name);
    if (!columns.includes('type')) this.db.exec('ALTER TABLE jobs ADD COLUMN type TEXT');
    if (!columns.includes('document_id'))
      this.db.exec('ALTER TABLE jobs ADD COLUMN document_id TEXT');
  }
  begin(name: string, cads: unknown) {
    this.db.prepare('DELETE FROM pairings WHERE expires < ?').run(this.now() - 60000);
    const token = secret();
    const code = randomBytes(6).toString('hex').toUpperCase();
    this.db
      .prepare('INSERT INTO pairings(secret_hash,code,name,cads,expires) VALUES(?,?,?,?,?)')
      .run(hash(token), code, name, JSON.stringify(cads), this.now() + 600000);
    return { deviceSecret: token, userCode: code, expiresIn: 600, interval: 5 };
  }
  approve(owner: string, code: string) {
    const changed = this.db
      .prepare(
        'UPDATE pairings SET owner=? WHERE code=? AND owner IS NULL AND expires>? AND consumed=0',
      )
      .run(owner, code.toUpperCase(), this.now()).changes;
    if (!changed) throw new DomainError(409, 'Code expired, already used, or unavailable.');
    return { approved: true };
  }
  poll(token: string) {
    const row = this.db.prepare('SELECT * FROM pairings WHERE secret_hash=?').get(hash(token)) as
      Row | undefined;
    if (!row || row.expires <= this.now() || row.consumed || row.polls >= 125)
      throw new DomainError(410, 'Pairing expired or consumed. Start pairing again.');
    this.db.prepare('UPDATE pairings SET polls=polls+1 WHERE secret_hash=?').run(hash(token));
    if (!row.owner) return { pending: true };
    const id = randomUUID(),
      credential = secret();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE pairings SET consumed=1 WHERE secret_hash=?').run(hash(token));
      this.db
        .prepare('INSERT INTO devices VALUES(?,?,?,?,?,?,0)')
        .run(id, row.owner, row.name, hash(credential), row.cads, 0);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { pending: false, deviceId: id, credential };
  }
  device(token: string): Row {
    const row = this.db
      .prepare('SELECT * FROM devices WHERE token_hash=? AND revoked=0')
      .get(hash(token)) as Row | undefined;
    if (!row) throw new DomainError(401, 'Device credential invalid or revoked.');
    return row;
  }
  devices(owner: string) {
    return (
      this.db
        .prepare('SELECT id,name,cads,last_seen,revoked FROM devices WHERE owner=?')
        .all(owner) as Row[]
    ).map((d) => ({
      id: d.id,
      name: d.name,
      cads: JSON.parse(d.cads),
      lastSeen: d.last_seen,
      revoked: !!d.revoked,
      online: !d.revoked && this.now() - d.last_seen < 30000,
    }));
  }
  revoke(owner: string, id: string) {
    if (
      !this.db.prepare('UPDATE devices SET revoked=1 WHERE owner=? AND id=?').run(owner, id).changes
    )
      throw new DomainError(404, 'Device not found.');
    this.db
      .prepare("UPDATE jobs SET status='cancelled' WHERE device_id=? AND status='queued'")
      .run(id);
    return { revoked: true };
  }
  // Mints a new API key for `owner`. `scopes` defaults to full access when
  // empty; anything outside API_KEY_SCOPES is rejected. The full key is
  // returned exactly once here — only its hash is ever persisted.
  createApiKey(owner: string, name: string, scopes: string[] = []) {
    const chosen = scopes.length ? [...new Set(scopes)] : [...API_KEY_SCOPES];
    for (const s of chosen)
      if (!(API_KEY_SCOPES as readonly string[]).includes(s))
        throw new DomainError(400, `Unknown scope: ${s}.`);
    const id = randomUUID();
    const prefix = randomBytes(6).toString('hex');
    const key = `cad_${prefix}_${secret()}`;
    const created = this.now();
    this.db
      .prepare(
        'INSERT INTO api_keys(id,owner,name,prefix,key_hash,scopes,created,last_used,revoked) VALUES(?,?,?,?,?,?,?,NULL,0)',
      )
      .run(id, owner, name, prefix, hash(key), chosen.join(' '), created);
    return { id, name, scopes: chosen as ApiKeyScope[], prefix, key, created };
  }
  // Redacted listing: never the hash, never the full key. Owner-scoped.
  listApiKeys(owner: string) {
    return (
      this.db
        .prepare(
          // `rowid DESC` breaks ties within the same millisecond by insertion order.
          'SELECT id,name,prefix,scopes,created,last_used AS lastUsed,revoked FROM api_keys WHERE owner=? ORDER BY created DESC, rowid DESC',
        )
        .all(owner) as Row[]
    ).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      prefix: r.prefix as string,
      scopes: String(r.scopes).split(' ') as ApiKeyScope[],
      created: r.created as number,
      lastUsed: (r.lastUsed as number | null) ?? null,
      revoked: !!r.revoked,
    }));
  }
  // Owner-scoped: a foreign owner's id updates zero rows, so it reads
  // identically to "not found" and never leaks whether the id exists.
  revokeApiKey(owner: string, id: string) {
    if (
      !this.db.prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND owner=?').run(id, owner)
        .changes
    )
      throw new DomainError(404, 'API key not found.');
    return { revoked: true };
  }
  // Allowed roots triad (mirroring api_keys).
  // Device-ownership is checked: only the owner of the device can add/list roots.
  addRoot(owner: string, deviceId: string, path: string) {
    const device = this.devices(owner).find((d) => d.id === deviceId && !d.revoked);
    if (!device) throw new DomainError(404, 'Device not found.');
    if (!isValidPathShape(path)) throw new DomainError(400, 'Invalid path shape.');
    const id = randomUUID();
    const created = this.now();
    try {
      this.db
        .prepare(
          'INSERT INTO allowed_roots(id,owner,device_id,path,created) VALUES(?,?,?,?,?)',
        )
        .run(id, owner, deviceId, path, created);
    } catch (e: any) {
      if (e?.code === 'ERR_SQLITE_ERROR' && String(e?.message).includes('UNIQUE')) {
        throw new DomainError(409, 'Root already added for this device.');
      }
      throw e;
    }
    return { id, owner, deviceId, path, created };
  }
  listRoots(owner: string, deviceId: string) {
    const device = this.devices(owner).find((d) => d.id === deviceId && !d.revoked);
    if (!device) throw new DomainError(404, 'Device not found.');
    return (
      this.db
        .prepare(
          'SELECT id,owner,device_id AS deviceId,path,created FROM allowed_roots WHERE owner=? AND device_id=? ORDER BY created DESC, rowid DESC',
        )
        .all(owner, deviceId) as Row[]
    ).map((r) => ({
      id: r.id as string,
      owner: r.owner as string,
      deviceId: r.deviceId as string,
      path: r.path as string,
      created: r.created as number,
    }));
  }
  // Owner-scoped: a foreign owner's id deletes zero rows, so it reads
  // identically to "not found" and never leaks whether the id exists.
  removeRoot(owner: string, id: string) {
    if (
      !this.db.prepare('DELETE FROM allowed_roots WHERE id=? AND owner=?').run(id, owner).changes
    )
      throw new DomainError(404, 'Root not found.');
    return { removed: true };
  }
  // Resolves a presented `cad_<prefix>_<secret>` key to its owner. A key maps
  // to exactly one owner — the caller never chooses it. `prefix` narrows the
  // lookup to one row; the full presented string is then hashed and compared
  // to `key_hash` with a timing-safe equality check (never a plain `===`).
  verifyApiKey(presented: string, requiredScope: string): string {
    const parsed = /^cad_([0-9a-f]{12})_/.exec(presented);
    if (!parsed) throw new DomainError(401, 'API key is invalid or revoked.');
    const row = this.db.prepare('SELECT * FROM api_keys WHERE prefix=?').get(parsed[1]) as
      Row | undefined;
    if (!row || row.revoked) throw new DomainError(401, 'API key is invalid or revoked.');
    const presentedHash = Buffer.from(hash(presented), 'hex');
    const storedHash = Buffer.from(row.key_hash as string, 'hex');
    const valid =
      presentedHash.length === storedHash.length && timingSafeEqual(presentedHash, storedHash);
    if (!valid) throw new DomainError(401, 'API key is invalid or revoked.');
    if (!String(row.scopes).split(' ').includes(requiredScope))
      throw new DomainError(403, 'Required scope missing.');
    this.db.prepare('UPDATE api_keys SET last_used=? WHERE id=?').run(this.now(), row.id);
    return row.owner as string;
  }
  // Callers validate their own per-op Zod schema before calling `enqueue()`;
  // this method only re-checks device ownership/online state, D17, and the cap.
  enqueue(
    owner: string,
    input: EnqueueInput,
    type = 'create_box',
    documentId: string | null = null,
  ) {
    // Stamp the agent's required `confirmed` flag here, at the single point
    // every job funnels through. Reaching enqueue means the job already
    // passed its authorization gate (MCP tools require a `confirmed: true`
    // literal in their Zod schema plus `requireWrite`; the REST path requires
    // an authenticated cad:write session), so the server attests the
    // confirmation the agent's executor checks. Doing it per-caller was the
    // original bug: MCP handlers destructured their params without `confirmed`
    // and the flag never reached the persisted payload, so every queued job
    // failed at the agent with "Explicit confirmation required".
    const p = { ...input, confirmed: true as const };
    const device = this.devices(owner).find((d) => d.id === p.deviceId && !d.revoked);
    if (!device) throw new DomainError(404, 'Device not found.');
    if (!device.online) throw new DomainError(409, 'Device is offline. No job was queued.');
    // D10/D11: any executable CAD kind (FreeCAD or AutoCAD) is acceptable here.
    // The per-op capability gate lives in `tools.ts::enqueueOp`; this is only
    // the device-ownership/online re-check plus a document/cad-kind match.
    const cad = device.cads.find((c: Row) => c.id === p.cadId && c.executable);
    if (!cad) throw new DomainError(400, 'Select a detected, executable CAD installation.');
    // D17: at most one queued|running job per document — reopen/mutate/save cannot overlap safely.
    if (documentId) {
      const doc = this.getDocument(documentId, owner);
      if (doc.cadKind !== cad.name)
        throw new DomainError(400, 'Document belongs to a different CAD kind.');
      const locked = this.db
        .prepare(
          "SELECT count(*) AS n FROM jobs WHERE document_id=? AND status IN ('queued','running')",
        )
        .get(documentId) as Row;
      if (locked.n > 0) throw new DomainError(409, 'Document already has an active job.');
    }
    const active = this.db
      .prepare(
        "SELECT count(*) AS n FROM jobs WHERE device_id=? AND status IN ('queued','running')",
      )
      .get(p.deviceId) as Row;
    if (active.n >= 5) throw new DomainError(429, 'Device job limit reached.');
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO jobs(id,device_id,owner,payload,status,expires,created,result,type,document_id) VALUES(?,?,?,?,?,?,?,NULL,?,?)',
      )
      .run(
        id,
        p.deviceId,
        owner,
        JSON.stringify(p),
        'queued',
        this.now() + 60000,
        this.now(),
        type,
        documentId,
      );
    return { id };
  }
  createDocument(owner: string, deviceId: string, cadKind: 'FreeCAD' | 'AutoCAD', name: string) {
    const id = randomUUID();
    const created = this.now();
    this.db
      .prepare(
        'INSERT INTO documents(id,owner,device_id,cad_kind,name,native_path,created,updated,latest_job_id) VALUES(?,?,?,?,?,NULL,?,?,NULL)',
      )
      .run(id, owner, deviceId, cadKind, name, created, created);
    return { id };
  }
  getDocument(id: string, owner: string) {
    const row = this.db.prepare('SELECT * FROM documents WHERE id=? AND owner=?').get(id, owner) as
      Row | undefined;
    if (!row) throw new DomainError(404, 'Document not found.');
    return {
      id: row.id,
      owner: row.owner,
      deviceId: row.device_id,
      cadKind: row.cad_kind,
      name: row.name,
      nativePath: row.native_path,
      created: row.created,
      updated: row.updated,
      latestJobId: row.latest_job_id,
    };
  }
  listDocuments(owner: string) {
    return this.db
      .prepare(
        'SELECT id,device_id AS deviceId,cad_kind AS cadKind,name,native_path AS nativePath,created,updated,latest_job_id AS latestJobId FROM documents WHERE owner=? ORDER BY updated DESC',
      )
      .all(owner) as Row[];
  }
  // `type`/`documentId` mirror `heartbeat()`'s phase-1 mapping: a legacy row
  // with no `type` reports the only op that existed before slice 1.
  jobs(owner: string) {
    this.expire();
    return this.db
      .prepare(
        "SELECT id,device_id AS deviceId,status,created,result,COALESCE(type,'create_box') AS type,document_id AS documentId FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 100",
      )
      .all(owner);
  }
  private expire() {
    this.db
      .prepare("UPDATE jobs SET status='expired' WHERE status='queued' AND expires<=?")
      .run(this.now());
    // Never requeue a claimed job: a lost result has an unknown outcome.
    this.db
      .prepare("UPDATE jobs SET status='unknown' WHERE status='running' AND expires+180000<=?")
      .run(this.now());
  }
  heartbeat(token: string, cads: unknown) {
    const d = this.device(token);
    this.db
      .prepare('UPDATE devices SET last_seen=?,cads=? WHERE id=?')
      .run(this.now(), JSON.stringify(cads), d.id);
    this.expire();
    const row = this.db
      .prepare(
        "UPDATE jobs SET status='running' WHERE id=(SELECT id FROM jobs WHERE device_id=? AND status='queued' AND expires>? ORDER BY created LIMIT 1) RETURNING *",
      )
      .get(d.id, this.now()) as Row | undefined;
    // Phase 1 rows predate `type`/`document_id`: map type=null to the only op that existed then.
    return row
      ? {
          job: {
            id: row.id,
            expires: row.expires,
            type: row.type ?? 'create_box',
            documentId: row.document_id ?? null,
            ...JSON.parse(row.payload),
          },
        }
      : { job: null };
  }
  // Sum of `meshes.size` for a device — the running total against the 500 MiB
  // per-device quota (mesh-preview-upload "Size Cap and Per-Device Quota").
  meshBytesForDevice(deviceId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(size),0) AS total FROM meshes WHERE device_id=?')
      .get(deviceId) as Row;
    return row.total as number;
  }
  // Device + job ownership/state check for the mesh upload route: the device
  // credential must own a `running` job that already has a document (every
  // job enqueued via `enqueueOp` does). Returns 404 for a foreign device or
  // a non-running job alike, matching the existing no-existence-leak pattern.
  jobForMeshUpload(token: string, jobId: string) {
    const d = this.device(token);
    const row = this.db
      .prepare(
        "SELECT document_id AS documentId FROM jobs WHERE id=? AND device_id=? AND status='running'",
      )
      .get(jobId, d.id) as Row | undefined;
    if (!row || !row.documentId)
      throw new DomainError(404, 'Job not found, not running on this device, or has no document.');
    return { deviceId: d.id as string, documentId: row.documentId as string };
  }
  // Job-bound file naming (mesh-preview-upload "Job-Bound File Naming"): the
  // row key is the job id, never a client-supplied name.
  recordMesh(input: {
    jobId: string;
    documentId: string;
    deviceId: string;
    size: number;
    sha256: string;
  }) {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO meshes(job_id,document_id,device_id,size,sha256,created) VALUES(?,?,?,?,?,?)',
      )
      .run(input.jobId, input.documentId, input.deviceId, input.size, input.sha256, this.now());
  }
  // Newest first, used both for retention (keep the newest 5) and for
  // `hasMesh`/detail listings.
  meshesForDocument(documentId: string) {
    return this.db
      .prepare(
        // `rowid DESC` breaks ties within the same millisecond by insertion order.
        'SELECT job_id AS jobId, size FROM meshes WHERE document_id=? ORDER BY created DESC, rowid DESC',
      )
      .all(documentId) as { jobId: string; size: number }[];
  }
  latestMeshForDocument(documentId: string) {
    return this.db
      .prepare(
        'SELECT job_id AS jobId FROM meshes WHERE document_id=? ORDER BY created DESC, rowid DESC LIMIT 1',
      )
      .get(documentId) as { jobId: string } | undefined;
  }
  deleteMesh(jobId: string) {
    this.db.prepare('DELETE FROM meshes WHERE job_id=?').run(jobId);
  }
  complete(token: string, id: string, result: string, ok: boolean, nativePath?: string) {
    const d = this.device(token);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const job = this.db
        .prepare(
          "SELECT document_id AS documentId FROM jobs WHERE id=? AND device_id=? AND status='running'",
        )
        .get(id, d.id) as Row | undefined;
      if (!job) throw new DomainError(409, 'Job is not running on this device.');
      this.db
        .prepare(
          "UPDATE jobs SET status=?,result=? WHERE id=? AND device_id=? AND status='running'",
        )
        .run(ok ? 'succeeded' : 'failed', result, id, d.id);
      if (ok && job.documentId)
        this.db
          .prepare(
            'UPDATE documents SET updated=?,latest_job_id=?,native_path=COALESCE(?,native_path) WHERE id=?',
          )
          .run(this.now(), id, nativePath ?? null, job.documentId);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { accepted: true };
  }
}
