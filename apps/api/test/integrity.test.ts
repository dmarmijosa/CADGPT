import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Store, DomainError } from '../src/store.js';
import { meshRouter } from '../src/mesh.js';
import {
  validateBinaryStl,
  validateBinaryStlBuffer,
  validateBinaryStlFile,
  validateDwg,
  validateBlend,
  validateFcstd,
  validateCadFormat,
  validateFileIntegrity,
  IntegrityError,
  DWG_SIGNATURES,
  STL_HEADER_BYTES,
} from '../src/integrity.js';

function makeStlBuffer(
  facets = 1,
  headerPrefix = Buffer.alloc(6, 0),
  facetCoords?: Buffer,
  extraBytes = Buffer.alloc(0),
): Buffer {
  const header = Buffer.concat([headerPrefix, Buffer.alloc(74, 0)]).subarray(0, 80);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(facets, 0);

  const parts = [header, count];
  if (facetCoords) {
    parts.push(facetCoords);
  } else {
    for (let i = 0; i < facets; i++) {
      const facet = Buffer.alloc(50);
      // nx, ny, nz
      facet.writeFloatLE(0.0, 0);
      facet.writeFloatLE(0.0, 4);
      facet.writeFloatLE(1.0, 8);
      // v1
      facet.writeFloatLE(0.0, 12);
      facet.writeFloatLE(0.0, 16);
      facet.writeFloatLE(0.0, 20);
      // v2
      facet.writeFloatLE(10.0 + i, 24);
      facet.writeFloatLE(0.0, 28);
      facet.writeFloatLE(0.0, 32);
      // v3
      facet.writeFloatLE(0.0, 36);
      facet.writeFloatLE(10.0, 40);
      facet.writeFloatLE(0.0, 44);
      // attr uint16
      facet.writeUInt16LE(0, 48);
      parts.push(facet);
    }
  }
  if (extraBytes.length > 0) parts.push(extraBytes);
  return Buffer.concat(parts);
}

function makeFcstdBuffer(includeDocumentXml = true): Buffer {
  // Construct a minimal valid ZIP in memory
  const files: { name: string; content: string }[] = [];
  if (includeDocumentXml) {
    files.push({ name: 'Document.xml', content: '<AppGeoDocument/>' });
  }
  files.push({ name: 'GuiDocument.xml', content: '<GuiDocument/>' });

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const contentBuf = Buffer.from(f.content, 'utf8');

    // Local file header (30 bytes + name + content)
    const local = Buffer.alloc(30 + nameBuf.length + contentBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // compression: 0 (store)
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(0, 14); // crc32 (mock 0 for uncompressed test)
    local.writeUInt32LE(contentBuf.length, 18); // comp size
    local.writeUInt32LE(contentBuf.length, 22); // uncomp size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(local, 30);
    contentBuf.copy(local, 30 + nameBuf.length);
    localHeaders.push(local);

    // Central directory header (46 bytes + name)
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // comp method
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(0, 16); // crc32
    cd.writeUInt32LE(contentBuf.length, 20); // comp size
    cd.writeUInt32LE(contentBuf.length, 24); // uncomp size
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk num
    cd.writeUInt16LE(0, 36); // int attr
    cd.writeUInt32LE(0, 38); // ext attr
    cd.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(cd, 46);
    centralHeaders.push(cd);

    offset += local.length;
  }

  const cdTotalLen = centralHeaders.reduce((acc, h) => acc + h.length, 0);
  const cdOffset = offset;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(files.length, 8); // disk entries
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdTotalLen, 12); // cd size
  eocd.writeUInt32LE(cdOffset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

test('binary STL validator: valid single and multi facet STLs pass', () => {
  const buf1 = makeStlBuffer(1);
  const res1 = validateBinaryStlBuffer(buf1);
  assert.equal(res1.facetCount, 1);

  const buf50 = makeStlBuffer(50);
  const res50 = validateBinaryStlBuffer(buf50);
  assert.equal(res50.facetCount, 50);

  const buf0 = makeStlBuffer(0);
  const res0 = validateBinaryStlBuffer(buf0);
  assert.equal(res0.facetCount, 0);
});

test('binary STL validator: too small buffer rejected', () => {
  assert.throws(
    () => validateBinaryStlBuffer(Buffer.alloc(83)),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('too small'),
  );
});

test('binary STL validator: ASCII solid prefix rejected', () => {
  const buf = makeStlBuffer(1, Buffer.from('solid ', 'ascii'));
  assert.throws(
    () => validateBinaryStlBuffer(buf),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('solid '),
  );
});

test('binary STL validator: size mismatch (truncated or extra bytes) rejected', () => {
  // Truncated: claims 10 facets (584 bytes), only 84 + 50*2 = 184 bytes provided
  const truncated = makeStlBuffer(10).subarray(0, 84 + 100);
  assert.throws(
    () => validateBinaryStlBuffer(truncated),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('size mismatch'),
  );

  // Extra bytes
  const extra = makeStlBuffer(1, Buffer.alloc(6), undefined, Buffer.alloc(1, 0));
  assert.throws(
    () => validateBinaryStlBuffer(extra),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('size mismatch'),
  );
});

test('binary STL validator: non-finite coordinates (NaN/Infinity) rejected', () => {
  // NaN in vertex coordinate
  const facetNan = Buffer.alloc(50);
  facetNan.writeFloatLE(0, 0); // nx
  facetNan.writeFloatLE(0, 4); // ny
  facetNan.writeFloatLE(1, 8); // nz
  facetNan.writeFloatLE(NaN, 12); // v1.x = NaN
  facetNan.writeFloatLE(0, 16);
  facetNan.writeFloatLE(0, 20);
  facetNan.writeFloatLE(1, 24);
  facetNan.writeFloatLE(0, 28);
  facetNan.writeFloatLE(0, 32);
  facetNan.writeFloatLE(0, 36);
  facetNan.writeFloatLE(1, 40);
  facetNan.writeFloatLE(0, 44);

  const bufNan = makeStlBuffer(1, Buffer.alloc(6), facetNan);
  assert.throws(
    () => validateBinaryStlBuffer(bufNan),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('non-finite'),
  );

  // Infinity
  const facetInf = Buffer.alloc(50);
  facetInf.writeFloatLE(Infinity, 0);
  const bufInf = makeStlBuffer(1, Buffer.alloc(6), facetInf);
  assert.throws(
    () => validateBinaryStlBuffer(bufInf),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('non-finite'),
  );

  // -Infinity
  const facetNegInf = Buffer.alloc(50);
  facetNegInf.writeFloatLE(-Infinity, 24);
  const bufNegInf = makeStlBuffer(1, Buffer.alloc(6), facetNegInf);
  assert.throws(
    () => validateBinaryStlBuffer(bufNegInf),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('non-finite'),
  );
});

test('binary STL validator: degenerate all-zero coordinates rejected', () => {
  const allZeroFacet = Buffer.alloc(50); // all floats are 0.0
  const buf = makeStlBuffer(1, Buffer.alloc(6), allZeroFacet);
  assert.throws(
    () => validateBinaryStlBuffer(buf),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('degenerate all-zero'),
  );
});

test('binary STL validator: out of bounds coordinates rejected', () => {
  const facetOver = Buffer.alloc(50);
  facetOver.writeFloatLE(100000.5, 12); // v1.x exceeds bounds
  const bufOver = makeStlBuffer(1, Buffer.alloc(6), facetOver);
  assert.throws(
    () => validateBinaryStlBuffer(bufOver),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('out of bounds'),
  );

  const facetUnder = Buffer.alloc(50);
  facetUnder.writeFloatLE(-100001.0, 24); // v2.x exceeds bounds
  const bufUnder = makeStlBuffer(1, Buffer.alloc(6), facetUnder);
  assert.throws(
    () => validateBinaryStlBuffer(bufUnder),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('out of bounds'),
  );
});

test('binary STL validator: maxBytes cap enforced', () => {
  const buf = makeStlBuffer(1);
  assert.throws(
    () => validateBinaryStlBuffer(buf, buf.length - 1),
    (e: unknown) =>
      e instanceof IntegrityError && e.message.includes('exceeds maximum allowable size'),
  );
});

test('magic byte checks: DWG releases and rejections', () => {
  for (const sig of DWG_SIGNATURES) {
    const buf = Buffer.concat([Buffer.from(sig, 'ascii'), Buffer.alloc(10)]);
    assert.equal(validateDwg(buf), sig);
  }

  assert.throws(
    () => validateDwg(Buffer.from('AC1009_invalid')),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('Invalid DWG signature'),
  );

  assert.throws(
    () => validateDwg(Buffer.from('AC10')),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('too small'),
  );
});

test('magic byte checks: FCStd archive and Document.xml presence', () => {
  const valid = makeFcstdBuffer(true);
  assert.equal(validateFcstd(valid), true);

  const missingDoc = makeFcstdBuffer(false);
  assert.throws(
    () => validateFcstd(missingDoc),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('missing Document.xml'),
  );

  assert.throws(
    () => validateFcstd(Buffer.from('NOT_ZIP_DATA')),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('missing ZIP magic'),
  );
});

test('magic byte checks: Blender blend regex and rejections', () => {
  const validBlends = ['BLENDER-v400', 'BLENDER_v306', 'BLENDER-V293', 'BLENDER_V500'];
  for (const sig of validBlends) {
    const buf = Buffer.concat([Buffer.from(sig, 'ascii'), Buffer.alloc(10)]);
    assert.equal(validateBlend(buf), sig);
  }

  const invalidBlends = ['BLENDER-v40\0', 'BLENDER-abcd', 'NOTBLENDER40', 'BLENDER.v400'];
  for (const sig of invalidBlends) {
    const buf = Buffer.concat([Buffer.from(sig, 'ascii'), Buffer.alloc(10)]);
    assert.throws(
      () => validateBlend(buf),
      (e: unknown) =>
        e instanceof IntegrityError && e.message.includes('Invalid Blender blend header'),
    );
  }

  assert.throws(
    () => validateBlend(Buffer.from('BLENDER-v4')),
    (e: unknown) => e instanceof IntegrityError && e.message.includes('too small'),
  );
});

test('dispatcher & file integrity on disk', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cadgpt-integrity-'));
  const stlFile = join(tmp, 'box.stl');
  writeFileSync(stlFile, makeStlBuffer(2));
  const stlRes = await validateFileIntegrity(stlFile);
  assert.equal(stlRes.facetCount, 2);

  const dwgFile = join(tmp, 'arch.dwg');
  writeFileSync(dwgFile, Buffer.from('AC1032_sample_dwg_content'));
  const dwgRes = await validateFileIntegrity(dwgFile);
  assert.equal(dwgRes.signature, 'AC1032');

  const fcstdFile = join(tmp, 'gear.fcstd');
  writeFileSync(fcstdFile, makeFcstdBuffer(true));
  const fcstdRes = await validateFileIntegrity(fcstdFile);
  assert.equal(fcstdRes.ok, true);

  const blendFile = join(tmp, 'organic.blend');
  writeFileSync(blendFile, Buffer.from('BLENDER-v400_rest_of_file'));
  const blendRes = await validateFileIntegrity(blendFile);
  assert.equal(blendRes.signature, 'BLENDER-v400');
});

test('serve gate: corrupted mesh file on disk returns HTTP 500', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cadgpt-mesh-corrupt-'));
  mkdirSync(join(dataDir, 'meshes'), { recursive: true });
  const store = new Store(':memory:');

  const cad = {
    id: 'cad',
    name: 'FreeCAD' as const,
    path: '/opt/FreeCAD',
    version: 'test',
    executable: true,
  };
  const pair = store.begin('WS', [cad]);
  store.approve('alice', pair.userCode);
  const device = store.poll(pair.deviceSecret) as { deviceId: string; credential: string };
  store.heartbeat(device.credential, [cad]);

  const doc = store.createDocument('alice', device.deviceId, 'FreeCAD', 'CorruptDiskTest');
  store.enqueue(
    'alice',
    { deviceId: device.deviceId, cadId: 'cad', confirmed: true },
    'create_box',
    doc.id,
  );
  const claimed = store.heartbeat(device.credential, [cad]);
  const jobId = (claimed.job as { id: string }).id;

  // Record a mesh in the database
  const meshFile = join(dataDir, 'meshes', jobId + '.stl');
  // Write a corrupt file on disk (e.g. truncated header)
  writeFileSync(meshFile, Buffer.from('corrupt header content'));
  store.recordMesh({
    jobId,
    documentId: doc.id,
    deviceId: device.deviceId,
    size: 22,
    sha256: createHash('sha256').update(Buffer.from('corrupt header content')).digest('hex'),
  });

  const app = express();
  app.use(meshRouter(store, { dataDir, auth: async () => 'alice' }));
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = e instanceof DomainError ? e.status : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'error' });
  });

  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/designs/${doc.id}/mesh`);
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes('File integrity failure'));
  } finally {
    server.close();
  }
});
