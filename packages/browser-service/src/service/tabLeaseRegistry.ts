import crypto from 'node:crypto';

export type TabLeaseState = 'active' | 'idle' | 'retiring' | 'released' | 'lost';

export type TabLeaseWorkload =
  | { kind: 'new-conversation'; reservationId: string }
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'live-follow'; operationId: string }
  | { kind: 'ephemeral'; operationId: string };

export interface TabLeaseScope {
  runtimeProfileId: string;
  managedBrowserProfile: string;
  service: string;
  tenantKey: string;
}

export interface BrowserTabLease {
  leaseId: string;
  revision: number;
  scope: TabLeaseScope;
  targetId: string;
  workload: TabLeaseWorkload;
  state: TabLeaseState;
  ownerOperationId: string | null;
  acquiredAt: string;
  heartbeatAt: string;
  lastMeaningfulUseAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  targetFingerprint: string | null;
}

export interface TabLeaseClaim {
  leaseId: string;
  revision: number;
  operationId: string;
}

export type TabLeaseConflict =
  | { kind: 'target-owned'; lease: BrowserTabLease }
  | { kind: 'workload-owned'; lease: BrowserTabLease };

export type TabLeaseResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: TabLeaseConflict };

export interface ReserveTabLeaseInput {
  scope: TabLeaseScope;
  targetId: string;
  workload: TabLeaseWorkload;
  operationId: string;
  now: string;
  idleTtlMs: number;
  absoluteTtlMs: number;
  targetFingerprint?: string | null;
}

export interface BrowserTabLeaseRegistry {
  reserve(input: ReserveTabLeaseInput): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null>;
  list(input?: {
    scope?: Partial<TabLeaseScope>;
    states?: readonly TabLeaseState[];
  }): Promise<BrowserTabLease[]>;
}

export interface InMemoryBrowserTabLeaseRegistryOptions {
  createLeaseId?: () => string;
}

const OWNED_STATES = new Set<TabLeaseState>(['active', 'idle', 'retiring']);

export function createInMemoryBrowserTabLeaseRegistry(
  options: InMemoryBrowserTabLeaseRegistryOptions = {},
): BrowserTabLeaseRegistry {
  return new InMemoryBrowserTabLeaseRegistry(options);
}

class InMemoryBrowserTabLeaseRegistry implements BrowserTabLeaseRegistry {
  private readonly leases = new Map<string, BrowserTabLease>();
  private readonly createLeaseId: () => string;

  constructor(options: InMemoryBrowserTabLeaseRegistryOptions) {
    this.createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());
  }

  async reserve(input: ReserveTabLeaseInput): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const normalized = normalizeReserveInput(input);
    for (const existing of this.leases.values()) {
      if (!OWNED_STATES.has(existing.state) || !sameScope(existing.scope, normalized.scope)) continue;
      if (existing.targetId === normalized.targetId) {
        return { ok: false, conflict: { kind: 'target-owned', lease: cloneLease(existing) } };
      }
      if (sameWorkload(existing.workload, normalized.workload)) {
        return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(existing) } };
      }
    }

    const leaseId = requireNonEmpty(this.createLeaseId(), 'leaseId');
    if (this.leases.has(leaseId)) {
      throw new Error(`Tab lease ID already exists: ${leaseId}`);
    }
    const nowMs = parseTimestamp(normalized.now, 'now');
    const lease: BrowserTabLease = {
      leaseId,
      revision: 1,
      scope: normalized.scope,
      targetId: normalized.targetId,
      workload: normalized.workload,
      state: 'active',
      ownerOperationId: normalized.operationId,
      acquiredAt: normalized.now,
      heartbeatAt: normalized.now,
      lastMeaningfulUseAt: normalized.now,
      idleExpiresAt: new Date(nowMs + normalized.idleTtlMs).toISOString(),
      absoluteExpiresAt: new Date(nowMs + normalized.absoluteTtlMs).toISOString(),
      targetFingerprint: normalized.targetFingerprint ?? null,
    };
    this.leases.set(leaseId, lease);
    return {
      ok: true,
      value: {
        lease: cloneLease(lease),
        claim: { leaseId, revision: lease.revision, operationId: normalized.operationId },
      },
    };
  }

  async findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null> {
    const normalizedScope = normalizeScope(scope);
    const normalizedWorkload = normalizeWorkload(workload);
    for (const lease of this.leases.values()) {
      if (
        OWNED_STATES.has(lease.state) &&
        sameScope(lease.scope, normalizedScope) &&
        sameWorkload(lease.workload, normalizedWorkload)
      ) {
        return cloneLease(lease);
      }
    }
    return null;
  }

  async list(input: {
    scope?: Partial<TabLeaseScope>;
    states?: readonly TabLeaseState[];
  } = {}): Promise<BrowserTabLease[]> {
    return [...this.leases.values()]
      .filter((lease) => matchesPartialScope(lease.scope, input.scope))
      .filter((lease) => !input.states || input.states.includes(lease.state))
      .map(cloneLease);
  }
}

function normalizeReserveInput(input: ReserveTabLeaseInput): ReserveTabLeaseInput {
  const idleTtlMs = normalizeTtl(input.idleTtlMs, 'idleTtlMs');
  const absoluteTtlMs = normalizeTtl(input.absoluteTtlMs, 'absoluteTtlMs');
  if (idleTtlMs > absoluteTtlMs) {
    throw new Error('idleTtlMs cannot exceed absoluteTtlMs');
  }
  parseTimestamp(input.now, 'now');
  return {
    ...input,
    scope: normalizeScope(input.scope),
    targetId: requireNonEmpty(input.targetId, 'targetId'),
    workload: normalizeWorkload(input.workload),
    operationId: requireNonEmpty(input.operationId, 'operationId'),
    idleTtlMs,
    absoluteTtlMs,
    targetFingerprint: normalizeOptional(input.targetFingerprint),
  };
}

function normalizeScope(scope: TabLeaseScope): TabLeaseScope {
  return {
    runtimeProfileId: requireNonEmpty(scope.runtimeProfileId, 'scope.runtimeProfileId'),
    managedBrowserProfile: requireNonEmpty(scope.managedBrowserProfile, 'scope.managedBrowserProfile'),
    service: requireNonEmpty(scope.service, 'scope.service').toLowerCase(),
    tenantKey: requireNonEmpty(scope.tenantKey, 'scope.tenantKey'),
  };
}

function normalizeWorkload(workload: TabLeaseWorkload): TabLeaseWorkload {
  switch (workload.kind) {
    case 'new-conversation':
      return { kind: workload.kind, reservationId: requireNonEmpty(workload.reservationId, 'reservationId') };
    case 'conversation':
      return { kind: workload.kind, conversationId: requireNonEmpty(workload.conversationId, 'conversationId') };
    case 'live-follow':
    case 'ephemeral':
      return { kind: workload.kind, operationId: requireNonEmpty(workload.operationId, 'workload.operationId') };
  }
}

function sameScope(left: TabLeaseScope, right: TabLeaseScope): boolean {
  return left.runtimeProfileId === right.runtimeProfileId &&
    left.managedBrowserProfile === right.managedBrowserProfile &&
    left.service === right.service &&
    left.tenantKey === right.tenantKey;
}

function sameWorkload(left: TabLeaseWorkload, right: TabLeaseWorkload): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'new-conversation':
      return left.reservationId === (right as typeof left).reservationId;
    case 'conversation':
      return left.conversationId === (right as typeof left).conversationId;
    case 'live-follow':
    case 'ephemeral':
      return left.operationId === (right as typeof left).operationId;
  }
}

function matchesPartialScope(scope: TabLeaseScope, partial: Partial<TabLeaseScope> | undefined): boolean {
  if (!partial) return true;
  return Object.entries(partial).every(([key, value]) => value === undefined || scope[key as keyof TabLeaseScope] === value);
}

function cloneLease(lease: BrowserTabLease): BrowserTabLease {
  return {
    ...lease,
    scope: { ...lease.scope },
    workload: { ...lease.workload } as TabLeaseWorkload,
  };
}

function normalizeTtl(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return Math.floor(value);
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`);
  return parsed;
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return requireNonEmpty(value, 'targetFingerprint');
}
