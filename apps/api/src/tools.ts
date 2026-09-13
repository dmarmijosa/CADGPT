import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store, DomainError } from './store.js';

/**
 * Fallback op list for a CAD that predates the `capabilities` field (D11).
 * Every phase-1/2a agent reports FreeCAD without `capabilities`, so this
 * fixed list is the gate until discovery (slice 12) starts reporting `ops[]`.
 */
export const FREECAD_OPS = [
  'create_box',
  'create_cylinder',
  'create_sphere',
  'create_cone',
  'boolean_cut',
  'boolean_union',
  'boolean_intersect',
  'translate_object',
  'rotate_object',
  'scale_object',
  'read_scene',
] as const;

// Shared MCP tool param fragments (design "MCP Tool Catalog"). Every schema
// below is `.strict()` and passed to `registerTool` as a full Zod object (not
// a raw shape) so the MCP SDK preserves strictness at the transport boundary.
const deviceIdFrag = z.uuid().optional();
const cadIdFrag = z.string().min(1).max(64).optional();
const documentIdFrag = z.uuid().optional();
const mmFrag = z.number().finite().positive().max(10000);
const mmOrZeroFrag = z.number().finite().min(0).max(10000);
const coordFrag = z.number().finite().min(-100000).max(100000);
const positionFrag = z.object({ x: coordFrag, y: coordFrag, z: coordFrag }).strict().optional();
const confirmedFrag = z.literal(true);
// Display name only — never a path, never reaches the CAD worker.
const nameFrag = z
  .string()
  .regex(/^[A-Za-z0-9 _-]{1,60}$/)
  .optional();

export const createBoxSchema = z
  .object({
    deviceId: deviceIdFrag,
    cadId: cadIdFrag,
    documentId: documentIdFrag,
    name: nameFrag,
    length: mmFrag,
    width: mmFrag,
    height: mmFrag,
    position: positionFrag,
    confirmed: confirmedFrag,
  })
  .strict();

export const createCylinderSchema = z
  .object({
    deviceId: deviceIdFrag,
    cadId: cadIdFrag,
    documentId: documentIdFrag,
    radius: mmFrag,
    height: mmFrag,
    position: positionFrag,
    confirmed: confirmedFrag,
  })
  .strict();

export const createSphereSchema = z
  .object({
    deviceId: deviceIdFrag,
    cadId: cadIdFrag,
    documentId: documentIdFrag,
    radius: mmFrag,
    position: positionFrag,
    confirmed: confirmedFrag,
  })
  .strict();

export const createConeSchema = z
  .object({
    deviceId: deviceIdFrag,
    cadId: cadIdFrag,
    documentId: documentIdFrag,
    radius1: mmFrag,
    radius2: mmOrZeroFrag,
    height: mmFrag,
    position: positionFrag,
    confirmed: confirmedFrag,
  })
  .strict();

export const getJobSchema = z.object({ jobId: z.uuid() }).strict();

/** Every batch-A schema; asserted elsewhere to never carry `owner`/`username` (spec "Owner not a parameter"). */
export const batchASchemas = {
  create_box: createBoxSchema,
  create_cylinder: createCylinderSchema,
  create_sphere: createSphereSchema,
  create_cone: createConeSchema,
  get_job: getJobSchema,
} as const;

type ToolResult = { content: { type: 'text'; text: string }[] };
const result = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

interface Candidate {
  deviceId: string;
  deviceName: string;
  cadId: string;
  cadName: string;
  version: string;
}
interface CadEntry {
  id: string;
  name: string;
  version: string;
  executable: boolean;
  capabilities?: { ops?: string[] };
}

/**
 * D6: resolve exactly one online device with an executable CAD; otherwise ask
 * instead of guessing. Optional `wantDeviceId`/`wantCadId` narrow the search
 * when the caller already knows which device/CAD to target.
 */
function resolveCad(
  store: Store,
  owner: string,
  wantDeviceId?: string,
  wantCadId?: string,
): Candidate | { selection_required: true; candidates: Candidate[] } {
  const candidates: Candidate[] = [];
  for (const device of store.devices(owner)) {
    if (device.revoked || !device.online) continue;
    if (wantDeviceId && device.id !== wantDeviceId) continue;
    for (const cad of device.cads as CadEntry[]) {
      if (!cad.executable) continue;
      if (wantCadId && cad.id !== wantCadId) continue;
      candidates.push({
        deviceId: device.id,
        deviceName: device.name,
        cadId: cad.id,
        cadName: cad.name,
        version: cad.version,
      });
    }
  }
  if (candidates.length === 0)
    throw new DomainError(404, 'No online device with an executable CAD was found.');
  if (candidates.length > 1) return { selection_required: true, candidates };
  return candidates[0];
}

interface EnqueueSelection {
  deviceId?: string;
  cadId?: string;
  documentId?: string;
}

/**
 * The enqueue gate (design "MCP Tool Catalog" rules; spec job-lifecycle,
 * document-registry): device owned+online, CAD capability covers `op`
 * (fallback FreeCAD op list when `capabilities` is absent), document owned
 * and `cad_kind` matches, then delegates to `Store.enqueue` for the D17 lock
 * and the per-device job cap.
 */
function enqueueOp(
  store: Store,
  owner: string,
  op: string,
  params: Record<string, unknown>,
  selection: EnqueueSelection,
  defaultDocumentName: string,
) {
  const target = resolveCad(store, owner, selection.deviceId, selection.cadId);
  if ('selection_required' in target) return target;
  const device = store.devices(owner).find((d) => d.id === target.deviceId)!;
  const cad = (device.cads as CadEntry[]).find((c) => c.id === target.cadId)!;
  const ops: readonly string[] = cad.capabilities?.ops ?? FREECAD_OPS;
  if (!ops.includes(op)) throw new DomainError(400, `The selected CAD does not support ${op}.`);
  let documentId: string | null = selection.documentId ?? null;
  if (documentId) {
    const doc = store.getDocument(documentId, owner);
    if (doc.cadKind !== cad.name)
      throw new DomainError(400, 'Document belongs to a different CAD kind.');
  } else {
    documentId = store.createDocument(
      owner,
      device.id,
      cad.name as 'FreeCAD' | 'AutoCAD',
      defaultDocumentName,
    ).id;
  }
  const job = store.enqueue(
    owner,
    { deviceId: device.id, cadId: cad.id, ...params },
    op,
    documentId,
  );
  return { jobId: job.id, documentId, status: 'queued' as const };
}

export function registerTools(
  server: McpServer,
  store: Store,
  owner: string,
  requireWrite: () => Promise<unknown>,
) {
  server.registerTool(
    'list_devices',
    {
      description: 'List your CAD devices and detected capabilities.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(store.devices(owner)),
  );
  server.registerTool(
    'list_documents',
    {
      description: 'List your CAD designs (documents), most recently updated first.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(store.listDocuments(owner)),
  );
  server.registerTool(
    'get_job',
    {
      description: 'Check the status/result of a previously queued job.',
      inputSchema: getJobSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ jobId }) => {
      const job = store.jobs(owner).find((j) => (j as { id: string }).id === jobId);
      if (!job) throw new DomainError(404, 'Job not found.');
      return result(job);
    },
  );
  server.registerTool(
    'create_box',
    {
      description:
        'Create a box primitive in millimeters, either as a new design or appended to an existing one via documentId. Ask the user to confirm dimensions first.',
      inputSchema: createBoxSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (p) => {
      await requireWrite();
      const { deviceId, cadId, documentId, name, length, width, height, position } = p;
      return result(
        enqueueOp(
          store,
          owner,
          'create_box',
          { length, width, height, position },
          { deviceId, cadId, documentId },
          name ?? 'Box',
        ),
      );
    },
  );
  server.registerTool(
    'create_cylinder',
    {
      description:
        'Create a cylinder primitive in millimeters, either as a new design or appended to an existing one via documentId. Ask the user to confirm dimensions first.',
      inputSchema: createCylinderSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (p) => {
      await requireWrite();
      const { deviceId, cadId, documentId, radius, height, position } = p;
      return result(
        enqueueOp(
          store,
          owner,
          'create_cylinder',
          { radius, height, position },
          { deviceId, cadId, documentId },
          'Cylinder',
        ),
      );
    },
  );
  server.registerTool(
    'create_sphere',
    {
      description:
        'Create a sphere primitive in millimeters, either as a new design or appended to an existing one via documentId. Ask the user to confirm dimensions first.',
      inputSchema: createSphereSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (p) => {
      await requireWrite();
      const { deviceId, cadId, documentId, radius, position } = p;
      return result(
        enqueueOp(
          store,
          owner,
          'create_sphere',
          { radius, position },
          { deviceId, cadId, documentId },
          'Sphere',
        ),
      );
    },
  );
  server.registerTool(
    'create_cone',
    {
      description:
        'Create a cone primitive in millimeters (radius2 = 0 for a point), either as a new design or appended to an existing one via documentId. Ask the user to confirm dimensions first.',
      inputSchema: createConeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (p) => {
      await requireWrite();
      const { deviceId, cadId, documentId, radius1, radius2, height, position } = p;
      return result(
        enqueueOp(
          store,
          owner,
          'create_cone',
          { radius1, radius2, height, position },
          { deviceId, cadId, documentId },
          'Cone',
        ),
      );
    },
  );
}
