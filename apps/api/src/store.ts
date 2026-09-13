import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const cadSchema = z.object({
  id: z.string().min(1).max(64), name: z.enum(['FreeCAD', 'AutoCAD']),
  path: z.string().min(1).max(1024), version: z.string().max(120),
  executable: z.boolean(),
});
export const boxSchema = z.object({
  deviceId: z.uuid(), cadId: z.string().min(1).max(64),
  length: z.number().finite().positive().max(10000),
  width: z.number().finite().positive().max(10000),
  height: z.number().finite().positive().max(10000),
  confirmed: z.literal(true),
}).strict();
export type Box = z.infer<typeof boxSchema>;
type Row = Record<string, any>;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export class DomainError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class Store {
  db: DatabaseSync;
  constructor(path: string, private now = () => Date.now()) {
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
    `);
  }
  begin(name: string, cads: unknown) {
    this.db.prepare('DELETE FROM pairings WHERE expires < ?').run(this.now() - 60000);
    const token = secret();
    const code = randomBytes(6).toString('hex').toUpperCase();
    this.db.prepare('INSERT INTO pairings(secret_hash,code,name,cads,expires) VALUES(?,?,?,?,?)')
      .run(hash(token), code, name, JSON.stringify(cads), this.now() + 600000);
    return { deviceSecret: token, userCode: code, expiresIn: 600, interval: 5 };
  }
  approve(owner: string, code: string) {
    const changed = this.db.prepare('UPDATE pairings SET owner=? WHERE code=? AND owner IS NULL AND expires>? AND consumed=0')
      .run(owner, code.toUpperCase(), this.now()).changes;
    if (!changed) throw new DomainError(409, 'Code expired, already used, or unavailable.');
    return { approved: true };
  }
  poll(token: string) {
    const row = this.db.prepare('SELECT * FROM pairings WHERE secret_hash=?').get(hash(token)) as Row | undefined;
    if (!row || row.expires <= this.now() || row.consumed || row.polls >= 125)
      throw new DomainError(410, 'Pairing expired or consumed. Start pairing again.');
    this.db.prepare('UPDATE pairings SET polls=polls+1 WHERE secret_hash=?').run(hash(token));
    if (!row.owner) return { pending: true };
    const id = randomUUID(), credential = secret();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE pairings SET consumed=1 WHERE secret_hash=?').run(hash(token));
      this.db.prepare('INSERT INTO devices VALUES(?,?,?,?,?,?,0)')
        .run(id, row.owner, row.name, hash(credential), row.cads, 0);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { pending: false, deviceId: id, credential };
  }
  device(token: string): Row {
    const row = this.db.prepare('SELECT * FROM devices WHERE token_hash=? AND revoked=0').get(hash(token)) as Row | undefined;
    if (!row) throw new DomainError(401, 'Device credential invalid or revoked.');
    return row;
  }
  devices(owner: string) {
    return (this.db.prepare('SELECT id,name,cads,last_seen,revoked FROM devices WHERE owner=?').all(owner) as Row[])
      .map(d => ({ id: d.id, name: d.name, cads: JSON.parse(d.cads), lastSeen: d.last_seen, revoked: !!d.revoked, online: !d.revoked && this.now() - d.last_seen < 30000 }));
  }
  revoke(owner: string, id: string) {
    if (!this.db.prepare('UPDATE devices SET revoked=1 WHERE owner=? AND id=?').run(owner, id).changes)
      throw new DomainError(404, 'Device not found.');
    this.db.prepare("UPDATE jobs SET status='cancelled' WHERE device_id=? AND status='queued'").run(id);
    return { revoked: true };
  }
  enqueue(owner: string, input: Box) {
    const p = boxSchema.parse(input);
    const device = this.devices(owner).find(d => d.id === p.deviceId && !d.revoked);
    if (!device) throw new DomainError(404, 'Device not found.');
    if (!device.online) throw new DomainError(409, 'Device is offline. No job was queued.');
    if (!device.cads.some((c: Row) => c.id === p.cadId && c.name === 'FreeCAD' && c.executable))
      throw new DomainError(400, 'Select a detected FreeCAD command-line installation.');
    const active = this.db.prepare("SELECT count(*) AS n FROM jobs WHERE device_id=? AND status IN ('queued','running')").get(p.deviceId) as Row;
    if (active.n >= 5) throw new DomainError(429, 'Device job limit reached.');
    const id = randomUUID();
    this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,NULL)')
      .run(id, p.deviceId, owner, JSON.stringify(p), 'queued', this.now() + 60000, this.now());
    return { id };
  }
  jobs(owner: string) {
    this.expire();
    return this.db.prepare('SELECT id,device_id AS deviceId,status,created,result FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 100').all(owner);
  }
  private expire() {
    this.db.prepare("UPDATE jobs SET status='expired' WHERE status='queued' AND expires<=?").run(this.now());
    // Never requeue a claimed job: a lost result has an unknown outcome.
    this.db.prepare("UPDATE jobs SET status='unknown' WHERE status='running' AND expires+180000<=?").run(this.now());
  }
  heartbeat(token: string, cads: unknown) {
    const d = this.device(token);
    this.db.prepare('UPDATE devices SET last_seen=?,cads=? WHERE id=?').run(this.now(), JSON.stringify(cads), d.id);
    this.expire();
    const row = this.db.prepare("UPDATE jobs SET status='running' WHERE id=(SELECT id FROM jobs WHERE device_id=? AND status='queued' AND expires>? ORDER BY created LIMIT 1) RETURNING *")
      .get(d.id, this.now()) as Row | undefined;
    return row ? { job: { id: row.id, expires: row.expires, ...JSON.parse(row.payload) } } : { job: null };
  }
  complete(token: string, id: string, result: string, ok: boolean) {
    const d = this.device(token);
    if (!this.db.prepare("UPDATE jobs SET status=?,result=? WHERE id=? AND device_id=? AND status='running'")
      .run(ok ? 'succeeded' : 'failed', result, id, d.id).changes)
      throw new DomainError(409, 'Job is not running on this device.');
    return { accepted: true };
  }
}
