/**
 * Typed DTOs for the dashboard (design D16). Each interface documents the
 * exact API route and server-side shape it mirrors, so a shape change in
 * `apps/api/src/**` is easy to reconcile here. Fields are camelCase because
 * every route below already returns camelCase JSON — the server does the
 * `snake_case` -> camelCase mapping in its own SQL aliases (`store.ts`).
 */

/** `cadSchema` in `apps/api/src/store.ts`, embedded in `Device.cads`. */
export interface Cad {
  id: string;
  name: 'FreeCAD' | 'AutoCAD';
  path: string;
  version: string;
  executable: boolean;
  /**
   * Not sent by the API yet — `cadSchema` gains `capabilities` in a later
   * slice (design D14/D16). Kept optional so this DTO stays forward
   * compatible without inventing data the server does not send today.
   */
  capabilities?: {
    execute: boolean;
    edition: 'full' | 'lt' | 'unknown' | null;
    console: string | null;
    ops: string[];
    mesh: boolean;
  };
}

/** `Store.devices()` response shape (`GET /api/devices`). */
export interface Device {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  lastSeen: number;
  cads: Cad[];
}

/**
 * `Store.jobs()` response shape (`GET /api/jobs`). `type` defaults to
 * `'create_box'` for a legacy row and `documentId` is `null` when the job
 * has none — the same mapping `heartbeat()` already applies (slice 11).
 */
export interface Job {
  id: string;
  deviceId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown';
  created: number;
  result: string;
  type: string;
  documentId: string | null;
}

/** `listDocuments()` + the `hasMesh` field `meshRouter` adds (`GET /api/designs`). */
export interface Design {
  id: string;
  name: string;
  cadKind: 'FreeCAD' | 'AutoCAD';
  deviceId: string;
  created: number;
  updated: number;
  latestJobId: string | null;
  hasMesh: boolean;
}

/** `getDocument()` + `hasMesh` (`GET /api/designs/:id`). */
export interface DesignDetail extends Design {
  owner: string;
  nativePath: string | null;
}

/** `boxSchema` in `apps/api/src/store.ts` (`POST /api/jobs`). */
export interface CreateBoxPayload {
  deviceId: string;
  cadId: string;
  length: number;
  width: number;
  height: number;
  confirmed: boolean;
}
