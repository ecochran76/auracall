import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isProcessAlive } from '../processCheck.js';

export type ProviderInteractionClass =
  | 'conversation-start'
  | 'prompt-continuation'
  | 'navigation'
  | 'reload'
  | 'conversation-read'
  | 'list-read'
  | 'artifact-read'
  | 'selection'
  | 'provider-mutation'
  | 'passive-observation';

export type ProviderInteractionMutability = 'read-only' | 'provider-mutating';
export type ProviderInteractionState = 'reserved' | 'started' | 'settled' | 'abandoned' | 'frozen';
export type ProviderInteractionEffectState = 'none' | 'in-flight' | 'settled' | 'outcome-unknown';
export type ProviderWarningClassification =
  | 'rate-limit'
  | 'captcha'
  | 'human-verification'
  | 'identity-conflict'
  | 'account-mismatch'
  | 'provider-warning';

export interface ProviderInteractionScope {
  provider: string;
  tenantKey: string;
  runtimeProfileId: string;
  managedBrowserProfile: string;
}

export interface ProviderInteractionPolicy {
  maxConcurrentChats: number | null;
  maxConversationStartsPerHour: number | null;
  maxConversationStartsPerDay: number | null;
}

export interface ProviderInteractionUsageSummary {
  activeChats: number;
  chatsLastHour: number;
  chatsLastDay: number;
}

export interface ProviderWarningRecord {
  provider: string;
  tenantKey: string;
  classification: ProviderWarningClassification;
  reason: string;
  observedAt: string;
  cooldownUntil: string | null;
}

export interface ProviderInteractionRecord {
  reservationId: string;
  scope: ProviderInteractionScope;
  workloadId: string;
  operationId: string;
  tabLeaseId: string | null;
  interactionClass: ProviderInteractionClass;
  mutability: ProviderInteractionMutability;
  startsNewConversation: boolean;
  state: ProviderInteractionState;
  effectState: ProviderInteractionEffectState;
  reservedAt: string;
  reservationExpiresAt: string;
  startedAt: string | null;
  settledAt: string | null;
  frozenAt: string | null;
  providerWarning: ProviderWarningClassification | null;
  stopReason: string | null;
  outcome: ProviderInteractionOutcome | null;
}

export type ProviderInteractionOutcome = 'succeeded' | 'failed' | 'cancelled';

export type ProviderInteractionEventType =
  | 'reservation-created'
  | 'interaction-started'
  | 'interaction-settled'
  | 'reservation-abandoned'
  | 'interaction-frozen'
  | 'provider-warning-observed'
  | 'passive-observed';

export interface ProviderInteractionEvent {
  eventId: string;
  reservationId: string | null;
  scope: ProviderInteractionScope;
  workloadId: string | null;
  operationId: string | null;
  tabLeaseId: string | null;
  interactionClass: ProviderInteractionClass | null;
  mutability: ProviderInteractionMutability | null;
  startsNewConversation: boolean;
  type: ProviderInteractionEventType;
  occurredAt: string;
  effectState: ProviderInteractionEffectState;
  outcome: ProviderInteractionOutcome | null;
  providerWarning: ProviderWarningClassification | null;
  reason: string | null;
}

export type ProviderInteractionTransitionResult =
  | { ok: true; record: ProviderInteractionRecord }
  | { ok: false; reason: 'not-found' | 'invalid-state' | 'reservation-expired' };

export interface ReserveProviderInteractionInput {
  scope: ProviderInteractionScope;
  workloadId: string;
  operationId: string;
  tabLeaseId?: string | null;
  interactionClass: ProviderInteractionClass;
  mutability: ProviderInteractionMutability;
  startsNewConversation: boolean;
  now: string;
  reservationTtlMs: number;
  policy: ProviderInteractionPolicy;
}

export type ProviderInteractionAdmission =
  | { allowed: true; reservation: ProviderInteractionRecord }
  | {
      allowed: false;
      reason: 'provider-warning' | 'concurrent-limit' | 'hourly-limit' | 'daily-limit';
      warning?: ProviderWarningRecord;
    };

export interface ProviderInteractionLedger {
  reserve(input: ReserveProviderInteractionInput): Promise<ProviderInteractionAdmission>;
  start(input: {
    reservationId: string;
    startedAt: string;
  }): Promise<ProviderInteractionTransitionResult>;
  settle(input: {
    reservationId: string;
    settledAt: string;
    effectState: 'none' | 'settled' | 'outcome-unknown';
    outcome: ProviderInteractionOutcome;
    stopReason?: string | null;
  }): Promise<ProviderInteractionTransitionResult>;
  observePassive(input: {
    scope: ProviderInteractionScope;
    workloadId: string;
    operationId: string;
    tabLeaseId?: string | null;
    observedAt: string;
  }): Promise<ProviderInteractionEvent>;
  recordProviderWarning(input: {
    scope: ProviderInteractionScope;
    classification: ProviderWarningClassification;
    reason: string;
    observedAt: string;
    cooldownUntil?: string | null;
  }): Promise<{ warning: ProviderWarningRecord; frozenReservationIds: string[] }>;
  list(scope?: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>>): Promise<ProviderInteractionRecord[]>;
  listEvents(scope?: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>>): Promise<ProviderInteractionEvent[]>;
  summarizeUsage(input: {
    provider: string;
    tenantKey: string;
    now: string;
  }): Promise<ProviderInteractionUsageSummary>;
}

export interface InMemoryProviderInteractionLedgerOptions {
  createReservationId?: () => string;
}

export interface FileBackedProviderInteractionLedgerOptions extends InMemoryProviderInteractionLedgerOptions {
  ledgerRoot: string;
  isOwnerAlive?: (pid: number) => boolean;
  lockTimeoutMs?: number;
  lockPollMs?: number;
}

export function createInMemoryProviderInteractionLedger(
  options: InMemoryProviderInteractionLedgerOptions = {},
): ProviderInteractionLedger {
  return new InMemoryProviderInteractionLedger(options);
}

export function createFileBackedProviderInteractionLedger(
  options: FileBackedProviderInteractionLedgerOptions,
): ProviderInteractionLedger {
  return new FileBackedProviderInteractionLedger(options);
}

interface ProviderInteractionLedgerSnapshot {
  records: ProviderInteractionRecord[];
  warnings: ProviderWarningRecord[];
  events: ProviderInteractionEvent[];
}

class InMemoryProviderInteractionLedger implements ProviderInteractionLedger {
  private readonly records = new Map<string, ProviderInteractionRecord>();
  private readonly warnings = new Map<string, ProviderWarningRecord>();
  private readonly events: ProviderInteractionEvent[] = [];
  private readonly createReservationId: () => string;

  constructor(
    options: InMemoryProviderInteractionLedgerOptions,
    snapshot: ProviderInteractionLedgerSnapshot = { records: [], warnings: [], events: [] },
  ) {
    this.createReservationId = options.createReservationId ?? (() => crypto.randomUUID());
    for (const record of snapshot.records) this.records.set(record.reservationId, cloneRecord(record));
    for (const warning of snapshot.warnings) {
      this.warnings.set(aggregateScopeKey(warning), cloneWarning(warning));
    }
    this.events.push(...snapshot.events.map(cloneEvent));
  }

  snapshot(): ProviderInteractionLedgerSnapshot {
    return {
      records: [...this.records.values()].map(cloneRecord),
      warnings: [...this.warnings.values()].map(cloneWarning),
      events: this.events.map(cloneEvent),
    };
  }

  async reserve(input: ReserveProviderInteractionInput): Promise<ProviderInteractionAdmission> {
    const scope = normalizeScope(input.scope);
    const nowMs = parseTimestamp(input.now, 'now');
    this.expireReservations(nowMs);
    const warning = this.warnings.get(aggregateScopeKey(scope));
    if (warning && isWarningActive(warning, nowMs)) {
      return { allowed: false, reason: 'provider-warning', warning: cloneWarning(warning) };
    }

    const activeCount = [...this.records.values()].filter((record) =>
      aggregateScopeKey(record.scope) === aggregateScopeKey(scope) &&
      (record.state === 'reserved' || record.state === 'started')).length;
    const maxConcurrent = normalizeLimit(input.policy.maxConcurrentChats, 'maxConcurrentChats');
    if (maxConcurrent !== null && activeCount >= maxConcurrent) {
      return { allowed: false, reason: 'concurrent-limit' };
    }

    if (input.startsNewConversation) {
      const hourlyLimit = normalizeLimit(
        input.policy.maxConversationStartsPerHour,
        'maxConversationStartsPerHour',
      );
      if (
        hourlyLimit !== null &&
        this.countConversationStarts(scope, nowMs - 60 * 60_000) >= hourlyLimit
      ) {
        return { allowed: false, reason: 'hourly-limit' };
      }
      const dailyLimit = normalizeLimit(
        input.policy.maxConversationStartsPerDay,
        'maxConversationStartsPerDay',
      );
      if (
        dailyLimit !== null &&
        this.countConversationStarts(scope, nowMs - 24 * 60 * 60_000) >= dailyLimit
      ) {
        return { allowed: false, reason: 'daily-limit' };
      }
    }

    const reservationTtlMs = normalizePositiveInteger(input.reservationTtlMs, 'reservationTtlMs');
    const reservationId = requireNonEmpty(this.createReservationId(), 'reservationId');
    if (this.records.has(reservationId)) throw new Error(`Interaction reservation ID already exists: ${reservationId}`);
    const now = new Date(nowMs).toISOString();
    const reservation: ProviderInteractionRecord = {
      reservationId,
      scope,
      workloadId: requireNonEmpty(input.workloadId, 'workloadId'),
      operationId: requireNonEmpty(input.operationId, 'operationId'),
      tabLeaseId: normalizeOptional(input.tabLeaseId),
      interactionClass: input.interactionClass,
      mutability: input.mutability,
      startsNewConversation: input.startsNewConversation,
      state: 'reserved',
      effectState: 'none',
      reservedAt: now,
      reservationExpiresAt: new Date(nowMs + reservationTtlMs).toISOString(),
      startedAt: null,
      settledAt: null,
      frozenAt: null,
      providerWarning: null,
      stopReason: null,
      outcome: null,
    };
    this.records.set(reservationId, reservation);
    this.appendEvent({
      reservationId,
      scope,
      workloadId: reservation.workloadId,
      operationId: reservation.operationId,
      tabLeaseId: reservation.tabLeaseId,
      interactionClass: reservation.interactionClass,
      mutability: reservation.mutability,
      startsNewConversation: reservation.startsNewConversation,
      type: 'reservation-created',
      occurredAt: now,
      effectState: 'none',
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return { allowed: true, reservation: cloneRecord(reservation) };
  }

  async start(input: {
    reservationId: string;
    startedAt: string;
  }): Promise<ProviderInteractionTransitionResult> {
    const record = this.records.get(input.reservationId);
    if (!record) return { ok: false, reason: 'not-found' };
    if (record.state !== 'reserved') return { ok: false, reason: 'invalid-state' };
    const startedAtMs = parseTimestamp(input.startedAt, 'startedAt');
    if (startedAtMs > Date.parse(record.reservationExpiresAt)) {
      this.records.set(record.reservationId, {
        ...record,
        state: 'abandoned',
        settledAt: new Date(startedAtMs).toISOString(),
        stopReason: 'reservation-expired',
      });
      return { ok: false, reason: 'reservation-expired' };
    }
    const started: ProviderInteractionRecord = {
      ...record,
      state: 'started',
      effectState: 'in-flight',
      startedAt: new Date(startedAtMs).toISOString(),
    };
    this.records.set(started.reservationId, started);
    this.appendEvent({
      reservationId: started.reservationId,
      scope: started.scope,
      workloadId: started.workloadId,
      operationId: started.operationId,
      tabLeaseId: started.tabLeaseId,
      interactionClass: started.interactionClass,
      mutability: started.mutability,
      startsNewConversation: started.startsNewConversation,
      type: 'interaction-started',
      occurredAt: started.startedAt ?? input.startedAt,
      effectState: started.effectState,
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return { ok: true, record: cloneRecord(started) };
  }

  async settle(input: {
    reservationId: string;
    settledAt: string;
    effectState: 'none' | 'settled' | 'outcome-unknown';
    outcome: ProviderInteractionOutcome;
    stopReason?: string | null;
  }): Promise<ProviderInteractionTransitionResult> {
    const record = this.records.get(input.reservationId);
    if (!record) return { ok: false, reason: 'not-found' };
    if (record.state !== 'started') return { ok: false, reason: 'invalid-state' };
    const settledAtMs = parseTimestamp(input.settledAt, 'settledAt');
    if (record.startedAt !== null && settledAtMs < Date.parse(record.startedAt)) {
      throw new Error('settledAt cannot be earlier than startedAt');
    }
    const settled: ProviderInteractionRecord = {
      ...record,
      state: 'settled',
      effectState: input.effectState,
      settledAt: new Date(settledAtMs).toISOString(),
      stopReason: normalizeOptionalReason(input.stopReason),
      outcome: input.outcome,
    };
    this.records.set(settled.reservationId, settled);
    this.appendEvent({
      reservationId: settled.reservationId,
      scope: settled.scope,
      workloadId: settled.workloadId,
      operationId: settled.operationId,
      tabLeaseId: settled.tabLeaseId,
      interactionClass: settled.interactionClass,
      mutability: settled.mutability,
      startsNewConversation: settled.startsNewConversation,
      type: 'interaction-settled',
      occurredAt: settled.settledAt ?? input.settledAt,
      effectState: settled.effectState,
      outcome: settled.outcome,
      providerWarning: null,
      reason: settled.stopReason,
    });
    return { ok: true, record: cloneRecord(settled) };
  }

  async observePassive(input: {
    scope: ProviderInteractionScope;
    workloadId: string;
    operationId: string;
    tabLeaseId?: string | null;
    observedAt: string;
  }): Promise<ProviderInteractionEvent> {
    const event = this.appendEvent({
      reservationId: null,
      scope: normalizeScope(input.scope),
      workloadId: requireNonEmpty(input.workloadId, 'workloadId'),
      operationId: requireNonEmpty(input.operationId, 'operationId'),
      tabLeaseId: normalizeOptional(input.tabLeaseId),
      interactionClass: 'passive-observation',
      mutability: 'read-only',
      startsNewConversation: false,
      type: 'passive-observed',
      occurredAt: new Date(parseTimestamp(input.observedAt, 'observedAt')).toISOString(),
      effectState: 'none',
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return cloneEvent(event);
  }

  async recordProviderWarning(input: {
    scope: ProviderInteractionScope;
    classification: ProviderWarningClassification;
    reason: string;
    observedAt: string;
    cooldownUntil?: string | null;
  }): Promise<{ warning: ProviderWarningRecord; frozenReservationIds: string[] }> {
    const scope = normalizeScope(input.scope);
    const observedAtMs = parseTimestamp(input.observedAt, 'observedAt');
    const cooldownUntil = input.cooldownUntil == null
      ? null
      : new Date(parseTimestamp(input.cooldownUntil, 'cooldownUntil')).toISOString();
    if (cooldownUntil !== null && Date.parse(cooldownUntil) <= observedAtMs) {
      throw new Error('cooldownUntil must be later than observedAt');
    }
    const warning: ProviderWarningRecord = {
      provider: scope.provider,
      tenantKey: scope.tenantKey,
      classification: input.classification,
      reason: requireNonEmpty(input.reason, 'reason'),
      observedAt: new Date(observedAtMs).toISOString(),
      cooldownUntil,
    };
    this.warnings.set(aggregateScopeKey(scope), warning);
    this.appendEvent({
      reservationId: null,
      scope,
      workloadId: null,
      operationId: null,
      tabLeaseId: null,
      interactionClass: null,
      mutability: null,
      startsNewConversation: false,
      type: 'provider-warning-observed',
      occurredAt: warning.observedAt,
      effectState: 'none',
      outcome: null,
      providerWarning: warning.classification,
      reason: warning.reason,
    });

    const frozenReservationIds: string[] = [];
    for (const [reservationId, record] of this.records) {
      if (
        aggregateScopeKey(record.scope) !== aggregateScopeKey(scope) ||
        (record.state !== 'reserved' && record.state !== 'started')
      ) continue;
      const frozen: ProviderInteractionRecord = {
        ...record,
        state: 'frozen',
        effectState: record.state === 'started' ? 'outcome-unknown' : record.effectState,
        frozenAt: warning.observedAt,
        providerWarning: warning.classification,
        stopReason: warning.reason,
      };
      this.records.set(reservationId, frozen);
      this.appendEvent({
        reservationId,
        scope: frozen.scope,
        workloadId: frozen.workloadId,
        operationId: frozen.operationId,
        tabLeaseId: frozen.tabLeaseId,
        interactionClass: frozen.interactionClass,
        mutability: frozen.mutability,
        startsNewConversation: frozen.startsNewConversation,
        type: 'interaction-frozen',
        occurredAt: warning.observedAt,
        effectState: frozen.effectState,
        outcome: null,
        providerWarning: warning.classification,
        reason: warning.reason,
      });
      frozenReservationIds.push(reservationId);
    }
    frozenReservationIds.sort();
    return { warning: cloneWarning(warning), frozenReservationIds };
  }

  async list(
    scope: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>> = {},
  ): Promise<ProviderInteractionRecord[]> {
    const provider = scope.provider === undefined ? null : normalizeKey(scope.provider, 'provider');
    const tenantKey = scope.tenantKey === undefined ? null : normalizeKey(scope.tenantKey, 'tenantKey');
    return [...this.records.values()]
      .filter((record) => provider === null || record.scope.provider === provider)
      .filter((record) => tenantKey === null || record.scope.tenantKey === tenantKey)
      .map(cloneRecord);
  }

  async listEvents(
    scope: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>> = {},
  ): Promise<ProviderInteractionEvent[]> {
    const provider = scope.provider === undefined ? null : normalizeKey(scope.provider, 'provider');
    const tenantKey = scope.tenantKey === undefined ? null : normalizeKey(scope.tenantKey, 'tenantKey');
    return this.events
      .filter((event) => provider === null || event.scope.provider === provider)
      .filter((event) => tenantKey === null || event.scope.tenantKey === tenantKey)
      .map(cloneEvent);
  }

  async summarizeUsage(input: {
    provider: string;
    tenantKey: string;
    now: string;
  }): Promise<ProviderInteractionUsageSummary> {
    const scope = {
      provider: normalizeKey(input.provider, 'provider'),
      tenantKey: normalizeKey(input.tenantKey, 'tenantKey'),
    };
    const nowMs = parseTimestamp(input.now, 'now');
    this.expireReservations(nowMs);
    const activeWorkloads = new Set<string>();
    for (const record of this.records.values()) {
      if (aggregateScopeKey(record.scope) !== aggregateScopeKey(scope)) continue;
      if (record.state === 'reserved' || record.state === 'started') {
        activeWorkloads.add(record.workloadId);
      }
    }
    return {
      activeChats: activeWorkloads.size,
      chatsLastHour: this.countConversationStarts(scope, nowMs - 60 * 60_000),
      chatsLastDay: this.countConversationStarts(scope, nowMs - 24 * 60 * 60_000),
    };
  }

  private expireReservations(nowMs: number): void {
    for (const [reservationId, record] of this.records) {
      if (record.state !== 'reserved' || Date.parse(record.reservationExpiresAt) > nowMs) continue;
      const abandoned: ProviderInteractionRecord = {
        ...record,
        state: 'abandoned',
        settledAt: new Date(nowMs).toISOString(),
        stopReason: 'reservation-expired',
      };
      this.records.set(reservationId, abandoned);
      this.appendEvent({
        reservationId,
        scope: abandoned.scope,
        workloadId: abandoned.workloadId,
        operationId: abandoned.operationId,
        tabLeaseId: abandoned.tabLeaseId,
        interactionClass: abandoned.interactionClass,
        mutability: abandoned.mutability,
        startsNewConversation: abandoned.startsNewConversation,
        type: 'reservation-abandoned',
        occurredAt: abandoned.settledAt ?? new Date(nowMs).toISOString(),
        effectState: abandoned.effectState,
        outcome: null,
        providerWarning: null,
        reason: abandoned.stopReason,
      });
    }
  }

  private countConversationStarts(
    scope: Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>,
    cutoffMs: number,
  ): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (!record.startsNewConversation || aggregateScopeKey(record.scope) !== aggregateScopeKey(scope)) continue;
      if (record.state === 'reserved' || record.state === 'started') {
        if (Date.parse(record.reservedAt) >= cutoffMs) count += 1;
        continue;
      }
      if (record.state === 'settled') {
        if (
          record.effectState !== 'none' &&
          record.settledAt !== null &&
          Date.parse(record.settledAt) >= cutoffMs
        ) count += 1;
        continue;
      }
      if (record.state === 'frozen' && record.effectState === 'outcome-unknown') {
        const evidenceAt = record.startedAt ?? record.reservedAt;
        if (Date.parse(evidenceAt) >= cutoffMs) count += 1;
      }
    }
    return count;
  }

  private appendEvent(event: Omit<ProviderInteractionEvent, 'eventId'>): ProviderInteractionEvent {
    const stored = { eventId: crypto.randomUUID(), ...event, scope: { ...event.scope } };
    this.events.push(stored);
    return stored;
  }
}

class FileBackedProviderInteractionLedger implements ProviderInteractionLedger {
  private readonly ledgerRoot: string;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly createReservationId?: () => string;
  private readonly isOwnerAlive: (pid: number) => boolean;
  private readonly lockTimeoutMs: number;
  private readonly lockPollMs: number;

  constructor(options: FileBackedProviderInteractionLedgerOptions) {
    this.ledgerRoot = path.resolve(options.ledgerRoot);
    this.statePath = path.join(this.ledgerRoot, 'provider-interactions.v1.json');
    this.lockPath = path.join(this.ledgerRoot, 'provider-interactions.lock');
    this.createReservationId = options.createReservationId;
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
    this.lockTimeoutMs = normalizePositiveInteger(options.lockTimeoutMs ?? 5_000, 'lockTimeoutMs');
    this.lockPollMs = normalizePositiveInteger(options.lockPollMs ?? 25, 'lockPollMs');
  }

  reserve(input: ReserveProviderInteractionInput) {
    return this.write((ledger) => ledger.reserve(input));
  }

  start(input: Parameters<ProviderInteractionLedger['start']>[0]) {
    return this.write((ledger) => ledger.start(input));
  }

  settle(input: Parameters<ProviderInteractionLedger['settle']>[0]) {
    return this.write((ledger) => ledger.settle(input));
  }

  observePassive(input: Parameters<ProviderInteractionLedger['observePassive']>[0]) {
    return this.write((ledger) => ledger.observePassive(input));
  }

  recordProviderWarning(input: Parameters<ProviderInteractionLedger['recordProviderWarning']>[0]) {
    return this.write((ledger) => ledger.recordProviderWarning(input));
  }

  list(scope?: Parameters<ProviderInteractionLedger['list']>[0]) {
    return this.read((ledger) => ledger.list(scope));
  }

  listEvents(scope?: Parameters<ProviderInteractionLedger['listEvents']>[0]) {
    return this.read((ledger) => ledger.listEvents(scope));
  }

  summarizeUsage(input: Parameters<ProviderInteractionLedger['summarizeUsage']>[0]) {
    return this.write((ledger) => ledger.summarizeUsage(input));
  }

  private async read<T>(operation: (ledger: InMemoryProviderInteractionLedger) => Promise<T>): Promise<T> {
    return this.withLock(async () => operation(await this.loadLedger()));
  }

  private async write<T>(operation: (ledger: InMemoryProviderInteractionLedger) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const ledger = await this.loadLedger();
      const result = await operation(ledger);
      await this.persist(ledger.snapshot());
      return result;
    });
  }

  private async loadLedger(): Promise<InMemoryProviderInteractionLedger> {
    let snapshot: ProviderInteractionLedgerSnapshot = { records: [], warnings: [], events: [] };
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, 'utf8')) as {
        schemaVersion?: unknown;
        records?: unknown;
        warnings?: unknown;
        events?: unknown;
      };
      if (
        parsed.schemaVersion !== 1 ||
        !Array.isArray(parsed.records) ||
        !Array.isArray(parsed.warnings) ||
        !Array.isArray(parsed.events)
      ) {
        throw new Error(`Unsupported provider interaction ledger snapshot: ${this.statePath}`);
      }
      snapshot = {
        records: parsed.records as ProviderInteractionRecord[],
        warnings: parsed.warnings as ProviderWarningRecord[],
        events: parsed.events as ProviderInteractionEvent[],
      };
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
    return new InMemoryProviderInteractionLedger(
      { createReservationId: this.createReservationId },
      snapshot,
    );
  }

  private async persist(snapshot: ProviderInteractionLedgerSnapshot): Promise<void> {
    const tempPath = `${this.statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const handle = await fs.open(tempPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, ...snapshot }, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tempPath, this.statePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.ledgerRoot, { recursive: true });
    const startedAt = Date.now();
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    while (!handle) {
      try {
        handle = await fs.open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ ownerPid: process.pid, acquiredAt: new Date().toISOString() }));
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) throw error;
        if (await this.removeStaleLock()) continue;
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(`Timed out waiting for provider interaction ledger lock: ${this.lockPath}`);
        }
        await delay(this.lockPollMs);
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.rm(this.lockPath, { force: true });
    }
  }

  private async removeStaleLock(): Promise<boolean> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.lockPath, 'utf8')) as { ownerPid?: unknown };
      if (typeof parsed.ownerPid === 'number' && this.isOwnerAlive(parsed.ownerPid)) return false;
      await fs.rm(this.lockPath, { force: true });
      return true;
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return true;
      return false;
    }
  }
}

function aggregateScopeKey(scope: Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>): string {
  return `${scope.provider}\0${scope.tenantKey}`;
}

function normalizeScope(scope: ProviderInteractionScope): ProviderInteractionScope {
  return {
    provider: normalizeKey(scope.provider, 'scope.provider'),
    tenantKey: normalizeKey(scope.tenantKey, 'scope.tenantKey'),
    runtimeProfileId: requireNonEmpty(scope.runtimeProfileId, 'scope.runtimeProfileId'),
    managedBrowserProfile: requireNonEmpty(scope.managedBrowserProfile, 'scope.managedBrowserProfile'),
  };
}

function isWarningActive(warning: ProviderWarningRecord, nowMs: number): boolean {
  return warning.cooldownUntil === null || Date.parse(warning.cooldownUntil) > nowMs;
}

function normalizeLimit(value: number | null, name: string): number | null {
  if (value === null) return null;
  return normalizePositiveInteger(value, name);
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return Math.floor(value);
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`);
  return parsed;
}

function normalizeKey(value: string, name: string): string {
  return requireNonEmpty(value, name).toLowerCase();
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  return requireNonEmpty(value, 'tabLeaseId');
}

function normalizeOptionalReason(value: string | null | undefined): string | null {
  if (value == null) return null;
  return requireNonEmpty(value, 'stopReason');
}

function cloneWarning(warning: ProviderWarningRecord): ProviderWarningRecord {
  return { ...warning };
}

function cloneRecord(record: ProviderInteractionRecord): ProviderInteractionRecord {
  return { ...record, scope: { ...record.scope } };
}

function cloneEvent(event: ProviderInteractionEvent): ProviderInteractionEvent {
  return { ...event, scope: { ...event.scope } };
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
