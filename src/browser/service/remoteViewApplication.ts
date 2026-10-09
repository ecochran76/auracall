import { isIP } from 'node:net';
import { z } from 'zod';

const identity = z.string().min(1);
const generation = z.number().int().positive();
const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  registration: z.object({ consumerKey: identity, registrationId: identity }),
  pools: z.array(z.object({ poolId: identity, registrationId: identity, name: identity, desktopMembers: z.array(identity) })),
  assignments: z.array(z.object({ assignmentId: identity, desktopId: identity, generation,
    poolId: identity, registrationId: identity, state: z.string() })),
  desktops: z.array(z.object({ desktopId: identity,
    lifecycle: z.object({ generation, state: z.string(), readinessScope: z.string(), allocated: z.boolean() }).optional(),
    viewing: z.object({ lifecycleGeneration: generation, generation, desktopId: identity, publicRoute: identity }).optional(),
  })),
});

export interface RemoteViewAssignment {
  assignmentId: string;
  desktopId: string;
  generation: number;
  viewingGeneration: number;
}

/** The native provider owns desktop presentation; this client owns no pixel/input protocol. */
export class RemoteViewApplication {
  private readonly endpoint: URL;
  private readonly application: string;

  constructor(config: { origin: string; application: string }) {
    let origin: URL;
    try { origin = new URL(config.origin); } catch { throw new Error('Remote View requires a loopback HTTP origin.'); }
    const host = origin.hostname.replace(/^\[|\]$/g, '');
    const loopback = (isIP(host) === 4 && host.split('.')[0] === '127') || host === '::1';
    if (origin.protocol !== 'http:' || !loopback || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.port === '0') {
      throw new Error('Remote View requires a loopback HTTP origin.');
    }
    this.endpoint = new URL('/v1/consumer', origin);
    this.application = identity.parse(config.application);
  }

  async listReadyAssignments(poolName: string): Promise<RemoteViewAssignment[]> {
    const response = await fetch(this.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: this.application, request: { operation: 'inventory' } }),
    });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/json') {
      throw new Error('Remote View application inventory unavailable.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Remote View application inventory unavailable.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4 * 1024 * 1024) throw new Error('Remote View inventory exceeds response limit.');
        chunks.push(part.value);
      }
    } catch (error) { await reader.cancel(); throw error; }
    const parsed = inventorySchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) throw new Error('Remote View application inventory has an invalid contract.');
    const inventory = parsed.data;
    if (inventory.registration.consumerKey !== this.application) throw new Error('Remote View application identity mismatch.');
    const registrationId = inventory.registration.registrationId;
    const pools = inventory.pools.filter(pool => pool.name === poolName && pool.registrationId === registrationId);
    if (pools.length !== 1 || !pools[0]) throw new Error('Remote View configured pool is missing or ambiguous.');
    const pool = pools[0];
    const result: RemoteViewAssignment[] = [];
    for (const assignment of inventory.assignments) {
      if (assignment.state !== 'active' || assignment.registrationId !== registrationId ||
        assignment.poolId !== pool.poolId || !pool.desktopMembers.includes(assignment.desktopId)) continue;
      const desktops = inventory.desktops.filter(desktop => desktop.desktopId === assignment.desktopId);
      if (desktops.length !== 1 || !desktops[0]) throw new Error('Remote View desktop identity is missing or ambiguous.');
      const { lifecycle, viewing } = desktops[0];
      if (!lifecycle || !viewing || lifecycle.state !== 'ready' || !lifecycle.allocated ||
        lifecycle.readinessScope !== 'live_resource' || lifecycle.generation !== assignment.generation ||
        viewing.lifecycleGeneration !== assignment.generation) continue;
      if (result.some(item => item.desktopId === assignment.desktopId || item.assignmentId === assignment.assignmentId)) {
        throw new Error('Remote View assignment identity is ambiguous.');
      }
      result.push({ assignmentId: assignment.assignmentId, desktopId: assignment.desktopId,
        generation: assignment.generation, viewingGeneration: viewing.generation });
    }
    return result;
  }
}
