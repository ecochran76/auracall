import crypto from 'node:crypto';

export type TabLeaseState = 'active' | 'idle' | 'retiring' | 'released' | 'lost';
export type TabLeaseEffectState = 'none' | 'in-flight' | 'settled' | 'outcome-unknown';

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
  effectState: TabLeaseEffectState;
  acquiredAt: string;
  heartbeatAt: string;
  lastMeaningfulUseAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  targetFingerprint: string | null;
  retirementReason: TabLeaseRetirementReason | null;
  finalDisposition: TabLeaseFinalDisposition | null;
  lossReason: TabLeaseLossReason | null;
}

export type TabLeaseRetirementReason = 'idle-expired' | 'absolute-expired' | 'cancelled' | 'operator';
export type TabLeaseFinalDisposition = 'closed' | 'already-missing' | 'preserved';
export type TabLeaseLossReason = 'target-missing' | 'restart-unverified' | 'identity-conflict';

export interface TabLeaseClaim {
  leaseId: string;
  revision: number;
  operationId: string;
}

export type TabLeaseConflict =
  | { kind: 'target-owned'; lease: BrowserTabLease }
  | { kind: 'workload-owned'; lease: BrowserTabLease }
  | { kind: 'not-found' }
  | { kind: 'stale-claim'; lease: BrowserTabLease }
  | { kind: 'invalid-transition'; lease: BrowserTabLease };

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
  bindConversation(input: {
    claim: TabLeaseClaim;
    conversationId: string;
    targetFingerprint: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  recordMeaningfulUse(input: {
    claim: TabLeaseClaim;
    now: string;
    idleTtlMs: number;
    targetFingerprint?: string | null;
    effectState?: TabLeaseEffectState;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  idle(input: {
    claim: TabLeaseClaim;
    now: string;
    effectState: Exclude<TabLeaseEffectState, 'in-flight'>;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  acquire(input: {
    scope: TabLeaseScope;
    workload: TabLeaseWorkload;
    operationId: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  beginRetirement(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseRetirementReason;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    retirementRevision: number;
  }>>;
  finishRetirement(input: {
    leaseId: string;
    retirementRevision: number;
    now: string;
    disposition: TabLeaseFinalDisposition;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  markLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseLossReason;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  listFencedTargetIds(scope: TabLeaseScope): Promise<string[]>;
  findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null>;
  list(input?: {
    scope?: Partial<TabLeaseScope>;
    states?: readonly TabLeaseState[];
  }): Promise<BrowserTabLease[]>;
}

export interface InMemoryBrowserTabLeaseRegistryOptions {
  createLeaseId?: () => string;
}

const FENCED_STATES = new Set<TabLeaseState>(['active', 'idle', 'retiring', 'lost']);

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
      if (!FENCED_STATES.has(existing.state) || !sameScope(existing.scope, normalized.scope)) continue;
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
      effectState: 'none',
      acquiredAt: normalized.now,
      heartbeatAt: normalized.now,
      lastMeaningfulUseAt: normalized.now,
      idleExpiresAt: new Date(nowMs + normalized.idleTtlMs).toISOString(),
      absoluteExpiresAt: new Date(nowMs + normalized.absoluteTtlMs).toISOString(),
      targetFingerprint: normalized.targetFingerprint ?? null,
      retirementReason: null,
      finalDisposition: null,
      lossReason: null,
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

  async bindConversation(input: {
    claim: TabLeaseClaim;
    conversationId: string;
    targetFingerprint: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active' || existing.workload.kind !== 'new-conversation') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }

    const now = new Date(parseTimestamp(input.now, 'now')).toISOString();
    const workload: TabLeaseWorkload = {
      kind: 'conversation',
      conversationId: requireNonEmpty(input.conversationId, 'conversationId'),
    };
    for (const other of this.leases.values()) {
      if (
        other.leaseId !== existing.leaseId &&
        FENCED_STATES.has(other.state) &&
        sameScope(other.scope, existing.scope) &&
        sameWorkload(other.workload, workload)
      ) {
        return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(other) } };
      }
    }

    const rebound: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      workload,
      heartbeatAt: now,
      lastMeaningfulUseAt: now,
      targetFingerprint: requireNonEmpty(input.targetFingerprint, 'targetFingerprint'),
    };
    this.leases.set(rebound.leaseId, rebound);
    return {
      ok: true,
      value: {
        lease: cloneLease(rebound),
        claim: {
          leaseId: rebound.leaseId,
          revision: rebound.revision,
          operationId: input.claim.operationId,
        },
      },
    };
  }

  async recordMeaningfulUse(input: {
    claim: TabLeaseClaim;
    now: string;
    idleTtlMs: number;
    targetFingerprint?: string | null;
    effectState?: TabLeaseEffectState;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }

    const nowMs = parseTimestamp(input.now, 'now');
    const absoluteExpiresAtMs = parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt');
    if (nowMs > absoluteExpiresAtMs) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const now = new Date(nowMs).toISOString();
    const updated: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      heartbeatAt: now,
      lastMeaningfulUseAt: now,
      idleExpiresAt: new Date(
        Math.min(nowMs + normalizeTtl(input.idleTtlMs, 'idleTtlMs'), absoluteExpiresAtMs),
      ).toISOString(),
      targetFingerprint: input.targetFingerprint === undefined
        ? existing.targetFingerprint
        : normalizeOptional(input.targetFingerprint) ?? null,
      effectState: input.effectState ?? existing.effectState,
    };
    this.leases.set(updated.leaseId, updated);
    return {
      ok: true,
      value: {
        lease: cloneLease(updated),
        claim: {
          leaseId: updated.leaseId,
          revision: updated.revision,
          operationId: input.claim.operationId,
        },
      },
    };
  }

  async idle(input: {
    claim: TabLeaseClaim;
    now: string;
    effectState: Exclude<TabLeaseEffectState, 'in-flight'>;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const now = new Date(parseTimestamp(input.now, 'now')).toISOString();
    const idled: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'idle',
      ownerOperationId: null,
      heartbeatAt: now,
      effectState: input.effectState,
    };
    this.leases.set(idled.leaseId, idled);
    return { ok: true, value: cloneLease(idled) };
  }

  async acquire(input: {
    scope: TabLeaseScope;
    workload: TabLeaseWorkload;
    operationId: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const scope = normalizeScope(input.scope);
    const workload = normalizeWorkload(input.workload);
    const operationId = requireNonEmpty(input.operationId, 'operationId');
    const nowMs = parseTimestamp(input.now, 'now');
    const existing = [...this.leases.values()].find((lease) =>
      FENCED_STATES.has(lease.state) &&
      sameScope(lease.scope, scope) &&
      sameWorkload(lease.workload, workload));
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.state === 'active') {
      return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(existing) } };
    }
    if (
      existing.state !== 'idle' ||
      nowMs > parseTimestamp(existing.idleExpiresAt, 'idleExpiresAt') ||
      nowMs > parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt')
    ) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const acquired: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'active',
      ownerOperationId: operationId,
      heartbeatAt: new Date(nowMs).toISOString(),
    };
    this.leases.set(acquired.leaseId, acquired);
    return {
      ok: true,
      value: {
        lease: cloneLease(acquired),
        claim: {
          leaseId: acquired.leaseId,
          revision: acquired.revision,
          operationId,
        },
      },
    };
  }

  async beginRetirement(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseRetirementReason;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    retirementRevision: number;
  }>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    const nowMs = parseTimestamp(input.now, 'now');
    const reasonIsEligible =
      (input.reason === 'idle-expired' && nowMs >= parseTimestamp(existing.idleExpiresAt, 'idleExpiresAt')) ||
      (input.reason === 'absolute-expired' && nowMs >= parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt')) ||
      input.reason === 'cancelled' ||
      input.reason === 'operator';
    if (
      existing.state !== 'idle' ||
      existing.ownerOperationId !== null ||
      existing.effectState === 'in-flight' ||
      existing.effectState === 'outcome-unknown' ||
      !reasonIsEligible
    ) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const retiring: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'retiring',
      heartbeatAt: new Date(nowMs).toISOString(),
      retirementReason: input.reason,
    };
    this.leases.set(retiring.leaseId, retiring);
    return {
      ok: true,
      value: { lease: cloneLease(retiring), retirementRevision: retiring.revision },
    };
  }

  async finishRetirement(input: {
    leaseId: string;
    retirementRevision: number;
    now: string;
    disposition: TabLeaseFinalDisposition;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.retirementRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'retiring') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const finished: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: input.disposition === 'preserved' ? 'lost' : 'released',
      heartbeatAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      finalDisposition: input.disposition,
    };
    this.leases.set(finished.leaseId, finished);
    return { ok: true, value: cloneLease(finished) };
  }

  async markLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseLossReason;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state === 'released' || existing.state === 'lost') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const lost: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'lost',
      ownerOperationId: null,
      heartbeatAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      lossReason: input.reason,
    };
    this.leases.set(lost.leaseId, lost);
    return { ok: true, value: cloneLease(lost) };
  }

  async listFencedTargetIds(scope: TabLeaseScope): Promise<string[]> {
    const normalizedScope = normalizeScope(scope);
    return [...this.leases.values()]
      .filter((lease) => FENCED_STATES.has(lease.state) && sameScope(lease.scope, normalizedScope))
      .map((lease) => lease.targetId)
      .sort();
  }

  async findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null> {
    const normalizedScope = normalizeScope(scope);
    const normalizedWorkload = normalizeWorkload(workload);
    for (const lease of this.leases.values()) {
      if (
        FENCED_STATES.has(lease.state) &&
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
