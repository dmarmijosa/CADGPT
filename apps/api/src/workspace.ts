import { createHash, randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { DomainError, isPathContained, isValidPathShape } from './store.js';
import { validateBinaryStlBuffer, validateBlend, validateDwg, validateFcstd } from './integrity.js';

export type StandardCategory = 'cad' | 'meshes' | 'exports' | 'renders' | 'references';

export const STANDARD_DIRECTORIES: readonly StandardCategory[] = [
  'cad',
  'meshes',
  'exports',
  'renders',
  'references',
] as const;

export const VALID_ENGINES = ['FreeCAD', 'AutoCAD', 'Blender'] as const;
export type ValidEngine = (typeof VALID_ENGINES)[number];

const CAD_EXTENSIONS = new Set(['.fcstd', '.blend', '.dwg']);
const MESH_EXTENSIONS = new Set(['.stl', '.glb', '.gltf']);
const EXPORT_EXTENSIONS = new Set(['.step', '.stp', '.iges', '.igs', '.dxf', '.obj']);
const DOC_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.doc', '.docx']);
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.svg',
]);

const RENDER_KEYWORDS = [
  'render',
  'rendering',
  'thumbnail',
  'thumb',
  'camera',
  'screenshot',
  'cycles',
  'eevee',
  'viewport',
];

const REFERENCE_KEYWORDS = [
  'blueprint',
  'sketch',
  'concept',
  'spec',
  'reference',
  'ref',
  'inspiration',
  'input',
  'drawing',
];

export interface ProjectAsset {
  relativePath: string;
  category: StandardCategory;
  size: number;
  sha256: string;
  lastModified: number;
  magicVerified: boolean;
  integrityVerified: boolean;
  facetCount?: number;
}

export interface ProjectManifest {
  projectId: string;
  name: string;
  primaryEngine: ValidEngine;
  createdAt: string;
  updatedAt: string;
  version: string;
  inventory: ProjectAsset[];
}

export interface ReorganizationPlanItem {
  source: string;
  destination: string;
  category: StandardCategory;
  reason: string;
}

export interface UnorganizedFileItem {
  path: string;
  suggestedCategory: StandardCategory;
  suggestedPath: string;
  reason: string;
}

export interface AuditResult {
  compliant: boolean;
  projectId?: string;
  directories: Record<StandardCategory, boolean>;
  missingDirectories: string[];
  discrepancies: {
    missingFiles: string[];
    untrackedFiles: string[];
    modifiedFiles: Array<{
      relativePath: string;
      expectedSize?: number;
      actualSize: number;
      expectedSha256?: string;
      actualSha256: string;
    }>;
  };
  reorganizationPlan: ReorganizationPlanItem[];
  unorganizedFiles: UnorganizedFileItem[];
  manifestRecovered: boolean;
}

export interface ReorganizeResult {
  success: boolean;
  moved: Array<{
    source: string;
    destination: string;
    category: StandardCategory;
  }>;
  manifestUpdated: boolean;
}

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function categorizeFile(relPath: string): StandardCategory {
  const norm = toPosix(relPath);
  const parts = norm.split('/').filter(Boolean);
  const fileName = parts.length > 0 ? parts[parts.length - 1] : norm;
  const ext = extname(fileName).toLowerCase();
  const stem = basename(fileName, ext).toLowerCase();
  const topFolder = parts.length > 1 ? parts[0].toLowerCase() : '';

  if (ext === '.fcstd' || ext === '.blend') {
    return 'cad';
  }
  if (ext === '.dwg') {
    if (REFERENCE_KEYWORDS.some((k) => stem.includes(k))) {
      return 'references';
    }
    return 'cad';
  }
  if (MESH_EXTENSIONS.has(ext)) {
    return 'meshes';
  }
  if (EXPORT_EXTENSIONS.has(ext)) {
    return 'exports';
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return 'references';
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    if (RENDER_KEYWORDS.some((k) => stem.includes(k)) || topFolder === 'renders') {
      return 'renders';
    }
    if (REFERENCE_KEYWORDS.some((k) => stem.includes(k)) || topFolder === 'references') {
      return 'references';
    }
    // Root unorganized images default to references (e.g. sketch.png -> references)
    return 'references';
  }

  if (STANDARD_DIRECTORIES.includes(topFolder as StandardCategory)) {
    return topFolder as StandardCategory;
  }
  return 'references';
}

export function getRelocationReason(category: StandardCategory): string {
  switch (category) {
    case 'references':
      return 'misplaced_reference';
    case 'renders':
      return 'misplaced_render';
    case 'cad':
      return 'misplaced_cad';
    case 'meshes':
      return 'misplaced_mesh';
    case 'exports':
      return 'misplaced_export';
    default:
      return 'misplaced_asset';
  }
}

export async function computeSha256(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex').toLowerCase();
}

export async function indexAsset(projectDir: string, relPath: string): Promise<ProjectAsset> {
  const normRel = toPosix(relPath);
  const absPath = resolve(projectDir, normRel);
  const s = await stat(absPath);
  const buf = await readFile(absPath);
  const sha = createHash('sha256').update(buf).digest('hex').toLowerCase();
  const category = categorizeFile(normRel);

  let magicVerified = true;
  let integrityVerified = true;
  let facetCount: number | undefined = undefined;

  const ext = extname(absPath).toLowerCase().replace(/^\./, '');
  if (ext === 'stl') {
    try {
      const res = validateBinaryStlBuffer(buf);
      facetCount = res.facetCount;
      magicVerified = true;
      integrityVerified = true;
    } catch {
      magicVerified = false;
      integrityVerified = false;
    }
  } else if (ext === 'dwg') {
    try {
      validateDwg(buf);
      magicVerified = true;
      integrityVerified = true;
    } catch {
      magicVerified = false;
      integrityVerified = false;
    }
  } else if (ext === 'fcstd') {
    try {
      validateFcstd(buf);
      magicVerified = true;
      integrityVerified = true;
    } catch {
      magicVerified = false;
      integrityVerified = false;
    }
  } else if (ext === 'blend') {
    try {
      validateBlend(buf);
      magicVerified = true;
      integrityVerified = true;
    } catch {
      magicVerified = false;
      integrityVerified = false;
    }
  }

  const asset: ProjectAsset = {
    relativePath: normRel,
    category,
    size: s.size,
    sha256: sha,
    lastModified: Math.floor(s.mtimeMs),
    magicVerified,
    integrityVerified,
  };
  if (facetCount !== undefined) {
    asset.facetCount = facetCount;
  }
  return asset;
}

export async function loadProjectManifest(projectDir: string): Promise<ProjectManifest> {
  const manifestPath = resolve(projectDir, 'project.json');
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      throw new DomainError(404, 'Manifest project.json not found.');
    }
    throw e;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainError(400, 'Corrupt project.json manifest.');
  }

  const required = [
    'projectId',
    'name',
    'primaryEngine',
    'createdAt',
    'updatedAt',
    'version',
    'inventory',
  ];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new DomainError(400, `Invalid manifest: missing required field '${field}'.`);
    }
  }
  if (!VALID_ENGINES.includes(parsed.primaryEngine)) {
    throw new DomainError(400, `Invalid primaryEngine: ${parsed.primaryEngine}`);
  }
  if (!Array.isArray(parsed.inventory)) {
    throw new DomainError(400, 'Invalid manifest: inventory must be an array.');
  }
  return parsed as ProjectManifest;
}

export async function saveProjectManifest(
  projectDir: string,
  manifest: ProjectManifest,
): Promise<void> {
  const target = resolve(projectDir, 'project.json');
  const tempPath = resolve(projectDir, `.project.json.${randomUUID()}.tmp`);
  const content = JSON.stringify(manifest, null, 2) + '\n';
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, target);
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // ignore if already renamed
    }
  }
}

export async function initProject(
  projectDir: string,
  projectId?: string,
  name?: string,
  primaryEngine: ValidEngine = 'FreeCAD',
): Promise<ProjectManifest> {
  const resolved = resolve(projectDir);
  await mkdir(resolved, { recursive: true });

  for (const dir of STANDARD_DIRECTORIES) {
    await mkdir(resolve(resolved, dir), { recursive: true });
  }

  const manifestPath = resolve(resolved, 'project.json');
  if (existsSync(manifestPath)) {
    try {
      return await loadProjectManifest(resolved);
    } catch {
      // proceed to re-init
    }
  }

  const nowIso = new Date().toISOString();
  const manifest: ProjectManifest = {
    projectId: projectId ?? randomUUID(),
    name: name ?? basename(resolved) ?? 'Untitled Project',
    primaryEngine,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: '1.0.0',
    inventory: [],
  };
  await saveProjectManifest(resolved, manifest);
  return manifest;
}

export async function reconstituteManifest(
  projectDir: string,
  projectId?: string,
  name?: string,
  primaryEngine: ValidEngine = 'FreeCAD',
): Promise<ProjectManifest> {
  const resolved = resolve(projectDir);
  const nowIso = new Date().toISOString();
  const inventory: ProjectAsset[] = [];

  for (const folder of STANDARD_DIRECTORIES) {
    const fDir = resolve(resolved, folder);
    if (!existsSync(fDir)) continue;

    const files = await readdir(fDir, { recursive: true });
    for (const f of files) {
      const fileName = String(f);
      const full = resolve(fDir, fileName);
      if (!statSync(full).isFile() || basename(fileName).startsWith('.')) continue;

      const rel = toPosix(relative(resolved, full));
      try {
        const entry = await indexAsset(resolved, rel);
        inventory.push(entry);
      } catch {
        // Skip un-indexable
      }
    }
  }

  const manifest: ProjectManifest = {
    projectId: projectId ?? randomUUID(),
    name: name ?? basename(resolved) ?? 'Untitled Project',
    primaryEngine,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: '1.0.0',
    inventory,
  };
  await saveProjectManifest(resolved, manifest);
  return manifest;
}

export async function auditProjectStructure(projectDir: string): Promise<AuditResult> {
  const resolved = resolve(projectDir);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new DomainError(404, `Project directory does not exist: ${resolved}`);
  }

  const directories: Record<StandardCategory, boolean> = {
    cad: existsSync(resolve(resolved, 'cad')),
    meshes: existsSync(resolve(resolved, 'meshes')),
    exports: existsSync(resolve(resolved, 'exports')),
    renders: existsSync(resolve(resolved, 'renders')),
    references: existsSync(resolve(resolved, 'references')),
  };
  const missingDirectories = STANDARD_DIRECTORIES.filter((d) => !directories[d]);

  let manifest: ProjectManifest;
  let manifestRecovered = false;
  try {
    manifest = await loadProjectManifest(resolved);
  } catch {
    manifest = await reconstituteManifest(resolved);
    manifestRecovered = true;
  }

  const reorganizationPlan: ReorganizationPlanItem[] = [];
  const unorganizedFiles: UnorganizedFileItem[] = [];
  const foundOnDiskInStandards = new Set<string>();

  const allFiles = await readdir(resolved, { recursive: true });
  for (const raw of allFiles) {
    const fileName = String(raw);
    const absPath = resolve(resolved, fileName);
    if (!existsSync(absPath) || !statSync(absPath).isFile()) continue;

    const bName = basename(fileName);
    if (bName.startsWith('.') || bName === 'project.json') continue;

    const rel = toPosix(relative(resolved, absPath));
    const parts = rel.split('/').filter(Boolean);

    if (parts.length === 1) {
      // Root file
      const category = categorizeFile(rel);
      const dest = `${category}/${bName}`;
      const reason = getRelocationReason(category);
      reorganizationPlan.push({ source: rel, destination: dest, category, reason });
      unorganizedFiles.push({
        path: rel,
        suggestedCategory: category,
        suggestedPath: dest,
        reason,
      });
    } else {
      const topDir = parts[0];
      if (!STANDARD_DIRECTORIES.includes(topDir as StandardCategory)) {
        // Outside standard folders
        const category = categorizeFile(rel);
        const dest = `${category}/${bName}`;
        const reason = getRelocationReason(category);
        reorganizationPlan.push({ source: rel, destination: dest, category, reason });
        unorganizedFiles.push({
          path: rel,
          suggestedCategory: category,
          suggestedPath: dest,
          reason,
        });
      } else {
        // Inside standard folder: check if category matches
        const expectedCat = categorizeFile(bName);
        if (expectedCat !== topDir) {
          const dest = `${expectedCat}/${bName}`;
          const reason = getRelocationReason(expectedCat);
          reorganizationPlan.push({
            source: rel,
            destination: dest,
            category: expectedCat,
            reason,
          });
          unorganizedFiles.push({
            path: rel,
            suggestedCategory: expectedCat,
            suggestedPath: dest,
            reason,
          });
        } else {
          foundOnDiskInStandards.add(rel);
        }
      }
    }
  }

  const manifestByRel = new Map<string, ProjectAsset>();
  for (const entry of manifest.inventory) {
    manifestByRel.set(toPosix(entry.relativePath), entry);
  }

  const missingFiles: string[] = [];
  const modifiedFiles: AuditResult['discrepancies']['modifiedFiles'] = [];
  const untrackedFiles: string[] = [];

  for (const [rel, entry] of manifestByRel.entries()) {
    const diskPath = resolve(resolved, rel);
    if (!existsSync(diskPath)) {
      missingFiles.push(rel);
    } else {
      const st = statSync(diskPath);
      const sha = await computeSha256(diskPath);
      if (st.size !== entry.size || sha !== entry.sha256) {
        modifiedFiles.push({
          relativePath: rel,
          expectedSize: entry.size,
          actualSize: st.size,
          expectedSha256: entry.sha256,
          actualSha256: sha,
        });
      }
    }
  }

  for (const rel of Array.from(foundOnDiskInStandards).sort()) {
    if (!manifestByRel.has(rel)) {
      untrackedFiles.push(rel);
    }
  }

  const compliant =
    missingDirectories.length === 0 &&
    reorganizationPlan.length === 0 &&
    missingFiles.length === 0 &&
    modifiedFiles.length === 0 &&
    untrackedFiles.length === 0 &&
    !manifestRecovered;

  return {
    compliant,
    projectId: manifest.projectId,
    directories,
    missingDirectories,
    discrepancies: {
      missingFiles,
      untrackedFiles,
      modifiedFiles,
    },
    reorganizationPlan,
    unorganizedFiles,
    manifestRecovered,
  };
}

export async function reorganizeProjectStructure(
  projectDir: string,
  confirmed: boolean,
  customPlan?: ReorganizationPlanItem[],
): Promise<ReorganizeResult> {
  if (confirmed !== true) {
    throw new DomainError(400, 'Reorganization requires confirmed: true');
  }

  const resolved = resolve(projectDir);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new DomainError(404, `Project directory does not exist: ${resolved}`);
  }

  for (const dir of STANDARD_DIRECTORIES) {
    await mkdir(resolve(resolved, dir), { recursive: true });
  }

  let plan = customPlan;
  if (!plan) {
    const audit = await auditProjectStructure(resolved);
    plan = audit.reorganizationPlan;
  }

  for (const item of plan) {
    const srcRaw = item.source;
    const dstRaw = item.destination;
    if (
      srcRaw.includes('..') ||
      dstRaw.includes('..') ||
      srcRaw.includes('\0') ||
      dstRaw.includes('\0') ||
      (!isValidPathShape(srcRaw) && !isValidPathShape(resolve(resolved, srcRaw)))
    ) {
      throw new DomainError(400, 'Path traversal detected outside project root.');
    }

    const srcPath = resolve(resolved, srcRaw);
    const dstPath = resolve(resolved, dstRaw);

    if (!isPathContained(srcPath, resolved) || !isPathContained(dstPath, resolved)) {
      throw new DomainError(400, 'Forbidden boundary violation: path outside project root.');
    }
  }

  const moved: ReorganizeResult['moved'] = [];

  for (const item of plan) {
    const srcPath = resolve(resolved, item.source);
    const dstPath = resolve(resolved, item.destination);

    if (!existsSync(srcPath) || !statSync(srcPath).isFile()) continue;

    await mkdir(dirname(dstPath), { recursive: true });
    const s = await stat(srcPath);

    await rename(srcPath, dstPath);
    await utimes(dstPath, s.atime, s.mtime);

    moved.push({
      source: toPosix(item.source),
      destination: toPosix(item.destination),
      category: item.category ?? categorizeFile(item.destination),
    });
  }

  let manifest: ProjectManifest;
  try {
    manifest = await loadProjectManifest(resolved);
  } catch {
    manifest = await reconstituteManifest(resolved);
  }

  const movedSources = new Set(moved.map((m) => toPosix(m.source)));
  let updatedInventory = manifest.inventory.filter(
    (entry) => !movedSources.has(toPosix(entry.relativePath)),
  );

  for (const m of moved) {
    const newRel = toPosix(m.destination);
    updatedInventory = updatedInventory.filter((e) => toPosix(e.relativePath) !== newRel);
    try {
      const entry = await indexAsset(resolved, newRel);
      updatedInventory.push(entry);
    } catch {
      // Ignore if failed indexing
    }
  }

  manifest.inventory = updatedInventory;
  manifest.updatedAt = new Date().toISOString();
  await saveProjectManifest(resolved, manifest);

  return {
    success: true,
    moved,
    manifestUpdated: true,
  };
}
