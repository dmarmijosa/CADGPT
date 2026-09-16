import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Store, DomainError } from './store.js';

// mesh-preview-upload "Size Cap and Per-Device Quota"; design.md "Mesh Upload / Serve".
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB per file
const DEVICE_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MiB per device, summed over meshes.size
const RETAIN_PER_DOCUMENT = 5; // keep the newest 5 meshes per document, unlink the rest
const STL_HEADER_BYTES = 84; // 80-byte header + 4-byte little-endian facet count
const STL_FACET_BYTES = 50;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

export interface MeshRouterOptions {
  dataDir: string;
  /** Injected so tests never need a real JWKS server — main.ts passes the real `auth`. */
  auth: (header: string | undefined, scope?: string) => Promise<string>;
}

import { wrap } from './http.js';

/** Same device-credential bearer scheme as `/api/agent/poll` and `/api/agent/results/:id`. */
function deviceToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new DomainError(401, 'Device credential required.');
  return header.slice(7);
}

// Job-bound naming only: the stored path never derives from a client header
// or query — always `<dataDir>/meshes/<jobId>.stl(.part)` from the validated
// job id (mesh-preview-upload "Client-supplied name ignored").
function meshPath(dataDir: string, jobId: string, suffix: '.stl' | '.stl.part'): string {
  return resolve(dataDir, 'meshes', jobId + suffix);
}

/**
 * Binary STL sanity (design D8/D9): reject anything that isn't
 * `84 + 50*facets` bytes with a plausible binary header, including an ASCII
 * STL that opens with the `solid ` keyword instead of a binary header.
 */
function isBinaryStl(size: number, header: Buffer): boolean {
  if (header.length < STL_HEADER_BYTES) return false;
  if (header.subarray(0, 6).toString('ascii') === 'solid ') return false;
  const facets = header.readUInt32LE(80);
  return size === STL_HEADER_BYTES + STL_FACET_BYTES * facets;
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/** Keep the newest `RETAIN_PER_DOCUMENT` meshes for a document, unlink the rest. */
async function enforceRetention(store: Store, dataDir: string, documentId: string): Promise<void> {
  const meshes = store.meshesForDocument(documentId);
  for (const stale of meshes.slice(RETAIN_PER_DOCUMENT)) {
    await unlinkIfExists(meshPath(dataDir, stale.jobId, '.stl'));
    store.deleteMesh(stale.jobId);
  }
}

async function uploadMesh(req: Request, res: Response, store: Store, dataDir: string) {
  const jobId = z.uuid().parse(req.params.id);
  const token = deviceToken(req);
  const { deviceId, documentId } = store.jobForMeshUpload(token, jobId);
  if (req.headers['content-type'] !== 'application/octet-stream')
    throw new DomainError(415, 'Content-Type must be application/octet-stream.');
  const declaredLength = Number(req.headers['content-length']);
  if (!Number.isFinite(declaredLength) || declaredLength <= 0)
    throw new DomainError(411, 'Content-Length is required.');
  if (declaredLength > MAX_UPLOAD_BYTES)
    throw new DomainError(413, 'Mesh exceeds the 25 MiB upload cap.');
  const expectedSha = z.string().regex(SHA256_HEX).parse(req.header('x-mesh-sha256')).toLowerCase();
  if (store.meshBytesForDevice(deviceId) + declaredLength > DEVICE_QUOTA_BYTES)
    throw new DomainError(413, 'Device mesh storage quota exceeded.');

  const partPath = meshPath(dataDir, jobId, '.stl.part');
  const finalPath = meshPath(dataDir, jobId, '.stl');
  const hash = createHash('sha256');
  const file = createWriteStream(partPath, { mode: 0o600 });
  let size = 0;
  let header = Buffer.alloc(0);
  try {
    await new Promise<void>((settle, fail) => {
      let done = false;
      const abort = (err: unknown) => {
        if (done) return;
        done = true;
        req.destroy();
        file.destroy();
        fail(err instanceof Error ? err : new DomainError(400, 'Upload failed.'));
      };
      req.on('data', (chunk: Buffer) => {
        if (done) return;
        size += chunk.length;
        // Streamed byte-count cap, independent of a possibly-lying
        // Content-Length: destroy the socket the instant we cross it.
        if (size > MAX_UPLOAD_BYTES) {
          abort(new DomainError(413, 'Mesh exceeds the 25 MiB upload cap.'));
          return;
        }
        if (header.length < STL_HEADER_BYTES)
          header = Buffer.concat([header, chunk.subarray(0, STL_HEADER_BYTES - header.length)]);
        hash.update(chunk);
        file.write(chunk);
      });
      req.on('end', () => {
        if (done) return;
        done = true;
        file.end(() => settle());
      });
      req.on('error', abort);
      file.on('error', abort);
    });
    if (hash.digest('hex') !== expectedSha) throw new DomainError(400, 'Mesh sha256 mismatch.');
    if (!isBinaryStl(size, header))
      throw new DomainError(400, 'Mesh is not a valid binary STL file.');
    await rename(partPath, finalPath);
  } catch (e) {
    await unlinkIfExists(partPath);
    throw e;
  }
  store.recordMesh({ jobId, documentId, deviceId, size, sha256: expectedSha });
  await enforceRetention(store, dataDir, documentId);
  res.status(201).json({ jobId, documentId, size, sha256: expectedSha });
}

/**
 * Mesh upload/serve routes (design "Mesh Upload / Serve"; spec
 * mesh-preview-upload, document-registry). Mounted before or after
 * `express.json()` is irrelevant: the JSON parser ignores octet-stream
 * bodies and leaves the raw request stream untouched for `uploadMesh`.
 */
export function meshRouter(store: Store, opts: MeshRouterOptions): Router {
  const router = Router();
  router.post(
    '/api/agent/jobs/:id/mesh',
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
    wrap((req, res) => uploadMesh(req, res, store, opts.dataDir)),
  );
  router.get(
    '/api/designs',
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization);
      res.json(
        store.listDocuments(owner).map((d) => ({
          ...d,
          hasMesh: store.latestMeshForDocument(d.id as string) !== undefined,
        })),
      );
    }),
  );
  router.get(
    '/api/designs/:id',
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization);
      const doc = store.getDocument(z.uuid().parse(req.params.id), owner);
      res.json({ ...doc, hasMesh: store.latestMeshForDocument(doc.id) !== undefined });
    }),
  );
  router.get(
    '/api/designs/:id/mesh',
    wrap(async (req, res) => {
      const owner = await opts.auth(req.headers.authorization);
      // `getDocument` already returns 404 (not 403) for a foreign owner —
      // spec "Non-owner cannot fetch mesh" avoids an existence leak.
      const doc = store.getDocument(z.uuid().parse(req.params.id), owner);
      const mesh = store.latestMeshForDocument(doc.id);
      if (!mesh) throw new DomainError(404, 'No mesh available for this design yet.');
      res.set({
        'Content-Type': 'model/stl',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.sendFile(meshPath(opts.dataDir, mesh.jobId, '.stl'));
    }),
  );
  return router;
}
