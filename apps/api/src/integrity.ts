import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { DomainError } from './store.js';

export const STL_HEADER_BYTES = 84;
export const STL_FACET_BYTES = 50;
export const MAX_COORDINATE = 100000.0;
export const MIN_COORDINATE = -100000.0;

export const DWG_SIGNATURES = new Set([
  'AC1015', // AutoCAD 2000
  'AC1018', // AutoCAD 2004
  'AC1021', // AutoCAD 2007
  'AC1024', // AutoCAD 2010
  'AC1027', // AutoCAD 2013
  'AC1032', // AutoCAD 2018-2026
]);

export const BLEND_MAGIC_REGEX = /^BLENDER[-_][vV][0-9]{3}$/;
export const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export class IntegrityError extends DomainError {
  constructor(message: string, status = 400) {
    super(status, message);
    this.name = 'IntegrityError';
  }
}

/**
 * Validates binary STL structure and coordinates in memory.
 *
 * Requirements:
 * 1. Size >= 84 bytes.
 * 2. Does NOT start with ASCII "solid ".
 * 3. Exact formula: FileSize == 84 + (50 * N).
 * 4. All 12 floats per facet are finite (no NaN, +Infinity, -Infinity).
 * 5. Vertex coordinates fall within [-100000.0, 100000.0] mm bounds.
 * 6. If N > 0, mesh must not contain solely (0, 0, 0) vertex coordinates.
 */
export function validateBinaryStlBuffer(buf: Buffer, maxBytes?: number): { facetCount: number } {
  if (maxBytes !== undefined && buf.length > maxBytes) {
    throw new IntegrityError(
      `Binary STL exceeds maximum allowable size (${buf.length} > ${maxBytes} bytes).`,
    );
  }

  if (buf.length < STL_HEADER_BYTES) {
    throw new IntegrityError(
      `Binary STL file is too small (${buf.length} bytes, minimum ${STL_HEADER_BYTES}).`,
    );
  }

  if (buf.subarray(0, 6).toString('ascii') === 'solid ') {
    throw new IntegrityError('Binary STL cannot start with ASCII "solid " keyword.');
  }

  const facetCount = buf.readUInt32LE(80);
  const expectedSize = STL_HEADER_BYTES + STL_FACET_BYTES * facetCount;

  if (buf.length !== expectedSize) {
    throw new IntegrityError(
      `Binary STL size mismatch: expected ${expectedSize} bytes for ${facetCount} facets, got ${buf.length} bytes.`,
    );
  }

  if (facetCount === 0) {
    return { facetCount: 0 };
  }

  let hasNonzeroCoord = false;

  for (let i = 0; i < facetCount; i++) {
    const offset = STL_HEADER_BYTES + i * STL_FACET_BYTES;

    // Check all 12 floats for IEEE 754 finite numbers
    for (let fIdx = 0; fIdx < 12; fIdx++) {
      const val = buf.readFloatLE(offset + fIdx * 4);
      if (!Number.isFinite(val)) {
        throw new IntegrityError(
          `Binary STL contains non-finite float coordinate (${val}) at facet ${i}.`,
        );
      }

      // Indices 3..11 are the 9 vertex coordinates (v1, v2, v3)
      if (fIdx >= 3) {
        if (val < MIN_COORDINATE || val > MAX_COORDINATE) {
          throw new IntegrityError(
            `Binary STL vertex coordinate ${val} out of bounds [${MIN_COORDINATE}, ${MAX_COORDINATE}] mm at facet ${i}.`,
          );
        }
        if (val !== 0) {
          hasNonzeroCoord = true;
        }
      }
    }
  }

  if (facetCount > 0 && !hasNonzeroCoord) {
    throw new IntegrityError('Binary STL contains degenerate all-zero geometry.');
  }

  return { facetCount };
}

/** Validates an on-disk binary STL file. */
export async function validateBinaryStlFile(
  filePath: string,
  maxBytes?: number,
): Promise<{ facetCount: number }> {
  const fileStat = await stat(filePath);
  if (maxBytes !== undefined && fileStat.size > maxBytes) {
    throw new IntegrityError(
      `Binary STL exceeds maximum allowable size (${fileStat.size} > ${maxBytes} bytes).`,
    );
  }
  const buf = await readFile(filePath);
  return validateBinaryStlBuffer(buf, maxBytes);
}

/** Unified binary STL validator accepting either Buffer or file path string. */
export async function validateBinaryStl(
  source: Buffer | string,
  maxBytes?: number,
): Promise<{ facetCount: number }> {
  if (typeof source === 'string') {
    return validateBinaryStlFile(source, maxBytes);
  }
  return validateBinaryStlBuffer(source, maxBytes);
}

/**
 * Validates AutoCAD DWG magic header bytes.
 * Must begin with AC1015, AC1018, AC1021, AC1024, AC1027, or AC1032.
 */
export function validateDwg(buf: Buffer): string {
  if (buf.length < 6) {
    throw new IntegrityError('DWG file is too small (minimum 6 bytes).');
  }
  const magic = buf.subarray(0, 6).toString('ascii');
  if (!DWG_SIGNATURES.has(magic)) {
    throw new IntegrityError(`Invalid DWG signature: ${JSON.stringify(magic)}.`);
  }
  return magic;
}

/**
 * Validates Blender blend magic header bytes.
 * First 12 bytes must match regex ^BLENDER[-_][vV][0-9]{3}$.
 */
export function validateBlend(buf: Buffer): string {
  if (buf.length < 12) {
    throw new IntegrityError('Blend file is too small (minimum 12 bytes).');
  }
  const magic = buf.subarray(0, 12).toString('ascii');
  if (!BLEND_MAGIC_REGEX.test(magic)) {
    throw new IntegrityError(`Invalid Blender blend header signature: ${JSON.stringify(magic)}.`);
  }
  return magic;
}

/**
 * Validates FreeCAD FCStd archive:
 * Bytes 0-3 must be PK\x03\x04 and the archive must contain Document.xml.
 */
export function validateFcstd(buf: Buffer): boolean {
  if (buf.length < 4 || !buf.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw new IntegrityError('Invalid FCStd file: missing ZIP magic bytes PK\\x03\\x04.');
  }

  const entries: string[] = [];

  // Parse central directory by finding End of Central Directory record (0x06054b50)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    let ptr = cdOffset;
    for (let i = 0; i < totalEntries && ptr + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
      const nameLen = buf.readUInt16LE(ptr + 28);
      const extraLen = buf.readUInt16LE(ptr + 30);
      const commentLen = buf.readUInt16LE(ptr + 32);
      if (ptr + 46 + nameLen <= buf.length) {
        const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
        entries.push(name);
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }

  // Fallback: scan local file headers
  if (!entries.includes('Document.xml')) {
    let ptr = 0;
    while (ptr + 30 <= buf.length) {
      if (buf.readUInt32LE(ptr) !== 0x04034b50) break;
      const nameLen = buf.readUInt16LE(ptr + 26);
      const extraLen = buf.readUInt16LE(ptr + 28);
      if (ptr + 30 + nameLen <= buf.length) {
        const name = buf.subarray(ptr + 30, ptr + 30 + nameLen).toString('utf8');
        entries.push(name);
      }
      // Note: we only scan until next or central directory
      ptr += 30 + nameLen + extraLen;
      // If we found it, short-circuit
      if (entries.includes('Document.xml')) break;
    }
  }

  if (!entries.includes('Document.xml')) {
    throw new IntegrityError('Invalid FCStd archive: missing Document.xml entry.');
  }

  return true;
}

/** Validates CAD buffer against format. */
export function validateCadFormat(
  buf: Buffer,
  format: string,
): { facetCount?: number; signature?: string; ok?: boolean } {
  const fmt = format.toLowerCase().replace(/^\./, '');
  if (fmt === 'stl') {
    return validateBinaryStlBuffer(buf);
  } else if (fmt === 'dwg') {
    return { signature: validateDwg(buf) };
  } else if (fmt === 'fcstd') {
    return { ok: validateFcstd(buf) };
  } else if (fmt === 'blend') {
    return { signature: validateBlend(buf) };
  } else {
    throw new IntegrityError(`Unsupported CAD format for integrity check: ${format}.`);
  }
}

/** Validates an on-disk CAD file using its file extension. */
export async function validateFileIntegrity(
  filePath: string,
): Promise<{ facetCount?: number; signature?: string; ok?: boolean }> {
  const buf = await readFile(filePath);
  const ext = extname(filePath);
  return validateCadFormat(buf, ext);
}
