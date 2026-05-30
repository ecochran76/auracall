import { randomUUID } from 'node:crypto';
import type { AccountMirrorProvider } from './politePolicy.js';
import {
  AccountMirrorRefreshError,
  type AccountMirrorRefreshResult,
  type AccountMirrorRefreshService,
} from './refreshService.js';
import type {
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
} from './statusRegistry.js';
import type { AccountMirrorCompletionStore } from './completionStore.js';

export interface AccountMirrorCompletionStartRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  maxPasses?: number | null;
  sweepMode?: AccountMirrorCompletionSweepMode | null;
  materializationPolicy?: AccountMirrorCompletionMaterializationPolicy | null;
  materializationAssetKinds?: AccountMirrorCompletionMaterializationAssetKind[] | null;
  materializationMaxItems?: number | null;
  materializationRefreshSnapshot?: boolean | null;
  materializationForce?: boolean | null;
}

export interface AccountMirrorCompletionListRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  status?: AccountMirrorCompletionOperation['status'] | 'active' | null;
  activeOnly?: boolean | null;
  limit?: number | null;
}

export interface AccountMirrorCompletionControlRequest {
  id: string;
  action: 'pause' | 'resume' | 'cancel';
}

export interface AccountMirrorCompletionPolicyUpgradeRequest extends AccountMirrorCompletionStartRequest {
  id: string;
}

export interface AccountMirrorCompletionLifecycleEvent {
  at: string;
  type:
    | 'started'
    | 'parked_for_shutdown'
    | 'resumed_after_restart'
    | 'operator_paused'
    | 'operator_resumed'
    | 'operator_cancelled'
    | 'campaign_policy_upgraded'
    | 'live_follow_policy_upgraded';
  status: AccountMirrorCompletionOperation['status'];
  previousStatus: AccountMirrorCompletionOperation['status'] | null;
  processPid: number;
  message: string;
}

export type AccountMirrorCompletionSweepMode = 'steady_follow' | 'full_sweep';
export type AccountMirrorCompletionMaterializationPolicy =
  | 'metadata_only'
  | 'recent_missing_assets'
  | 'full_missing_assets';
export type AccountMirrorCompletionMaterializationAssetKind = 'artifacts' | 'files' | 'media' | 'all';

export interface AccountMirrorCompletionMaterializationCursor {
  jobId: string;
  jobStatus: string;
  reused: boolean;
  requestedAt: string;
  passCount: number;
  request: {
    provider: AccountMirrorProvider;
    runtimeProfile: string;
    reconcile: true;
    refreshSnapshot: boolean;
    assetKinds: AccountMirrorCompletionMaterializationAssetKind[];
    maxItems: number | null;
    force: boolean;
  };
}

export interface AccountMirrorCompletionMaterializationOutcome {
  jobId: string;
  jobStatus: string;
  completedAt: string | null;
  conversationsAttempted: number;
  materialized: number;
  skipped: number;
  failed: number;
  checksumCount: number;
  manifestPaths: string[];
  terminalRouteabilityCounts: Record<string, number>;
  message: string | null;
}

export interface AccountMirrorCompletionOperation {
  object: 'account_mirror_completion';
  id: string;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  mode: 'live_follow' | 'bounded';
  sweepMode?: AccountMirrorCompletionSweepMode;
  phase: 'backfill_history' | 'steady_follow';
  status: 'queued' | 'running' | 'idle_waiting' | 'paused' | 'completed' | 'blocked' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  nextAttemptAt: string | null;
  maxPasses: number | null;
  passCount: number;
  lastRefresh: AccountMirrorRefreshResult | null;
  materializationPolicy?: AccountMirrorCompletionMaterializationPolicy;
  materializationAssetKinds?: AccountMirrorCompletionMaterializationAssetKind[];
  materializationMaxItems?: number | null;
  materializationRefreshSnapshot?: boolean;
  materializationForce?: boolean;
  materializationCursor?: AccountMirrorCompletionMaterializationCursor | null;
  materializationOutcome?: AccountMirrorCompletionMaterializationOutcome | null;
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'] | null;
  error: {
    message: string;
    code: string | null;
  } | null;
  lifecycleEvents?: AccountMirrorCompletionLifecycleEvent[];
}

export interface AccountMirrorCompletionService {
  start(request?: AccountMirrorCompletionStartRequest): AccountMirrorCompletionOperation;
  read(id: string): AccountMirrorCompletionOperation | null;
  list(request?: AccountMirrorCompletionListRequest): AccountMirrorCompletionOperation[];
  refreshMaterializationStatus?(id: string): Promise<AccountMirrorCompletionOperation | null>;
  refreshMaterializationStatuses?(
    operations: AccountMirrorCompletionOperation[],
  ): Promise<AccountMirrorCompletionOperation[]>;
  control(request: AccountMirrorCompletionControlRequest): AccountMirrorCompletionOperation | null;
  upgradePolicy?(request: AccountMirrorCompletionPolicyUpgradeRequest): AccountMirrorCompletionOperation | null;
  prepareForShutdown?(): AccountMirrorCompletionOperation[];
}

interface AccountMirrorHistoryMaterializationJobCreateResult {
  generatedAt?: string;
  reused?: boolean;
  job: {
    id: string;
    status: string;
  };
}

interface AccountMirrorHistoryMaterializationService {
  createJob(request: {
    provider: AccountMirrorProvider;
    runtimeProfile: string;
    reconcile: true;
    refreshSnapshot: boolean;
    assetKinds: AccountMirrorCompletionMaterializationAssetKind[];
    maxItems: number | null;
    force: boolean;
  }): Promise<AccountMirrorHistoryMaterializationJobCreateResult>;
  readJob?(id: string): Promise<AccountMirrorHistoryMaterializationJobReadResult | null>;
}

interface AccountMirrorHistoryMaterializationJobReadResult {
  id: string;
  status: string;
  completedAt?: string | null;
  result?: {
    metrics?: {
      conversations?: number | null;
      materialized?: number | null;
      skipped?: number | null;
      failed?: number | null;
    } | null;
    manifestPaths?: unknown;
    entries?: unknown;
    snapshotRefreshes?: unknown;
    message?: string | null;
  } | null;
}

export function createAccountMirrorCompletionService(input: {
  registry: AccountMirrorStatusRegistry;
  refreshService: AccountMirrorRefreshService;
  store?: AccountMirrorCompletionStore | null;
  initialOperations?: AccountMirrorCompletionOperation[] | null;
  resumeActiveOperations?: boolean;
  now?: () => Date;
  generateId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  historyMaterializationService?: AccountMirrorHistoryMaterializationService | null;
  onPersistError?: (error: unknown, operation: AccountMirrorCompletionOperation) => void;
}): AccountMirrorCompletionService {
  const now = input.now ?? (() => new Date());
  const generateId = input.generateId ?? (() => `acctmirror_completion_${randomUUID()}`);
  const sleepImpl = input.sleep ?? sleep;
  const operations = new Map<string, AccountMirrorCompletionOperation>();
  const persistQueues = new Map<string, Promise<void>>();
  const activeRuns = new Set<string>();
  const sleepWakeups = new Set<() => void>();
  const waitForShutdownWake = () => new Promise<void>((resolve) => {
    const wake = () => {
      sleepWakeups.delete(wake);
      resolve();
    };
    sleepWakeups.add(wake);
  });
  const wakeSleepers = () => {
    for (const wake of Array.from(sleepWakeups)) {
      wake();
    }
  };
  const sleepUntilAttempt = async (id: string, attemptAt: string): Promise<boolean> => {
    let fallbackAttemptAt: string | null = attemptAt;
    while (shouldContinue(id)) {
      const current = operations.get(id);
      const currentAttemptAt: string | null = current ? current.nextAttemptAt : fallbackAttemptAt;
      if (!currentAttemptAt) return true;
      fallbackAttemptAt = currentAttemptAt;
      const delayMs = resolveDelayMs(currentAttemptAt, now());
      if (delayMs <= 0) return true;
      await Promise.race([
        sleepImpl(Math.min(delayMs, 60_000)),
        waitForShutdownWake(),
      ]);
    }
    return false;
  };

  for (const operation of input.initialOperations ?? []) {
    operations.set(operation.id, normalizeLifecycleEvents(operation));
  }

  const update = (id: string, patch: Partial<AccountMirrorCompletionOperation>) => {
    const current = operations.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    operations.set(id, next);
    persist(next);
    return next;
  };

  const shouldContinue = (id: string): boolean => {
    const status = operations.get(id)?.status;
    return status === 'running' || status === 'idle_waiting';
  };

  const launch = (id: string) => {
    if (activeRuns.has(id)) return;
    activeRuns.add(id);
    void run(id).finally(() => {
      activeRuns.delete(id);
    });
  };

  const run = async (id: string) => {
    update(id, { status: 'running', completedAt: null });
    try {
      const initialOperation = operations.get(id);
      if (!initialOperation) return;
      if (initialOperation.nextAttemptAt) {
        if (initialOperation.mode === 'bounded') {
          update(id, { nextAttemptAt: null });
        } else {
          update(id, { status: 'idle_waiting' });
          if (!(await sleepUntilAttempt(id, initialOperation.nextAttemptAt))) return;
          update(id, { status: 'running', nextAttemptAt: null });
        }
      }
      for (;;) {
        const operation = operations.get(id);
        if (!operation) return;
        let pass = operation.passCount;
        if (!(operation.maxPasses === null || pass < operation.maxPasses)) break;
        if (!shouldContinue(id)) return;
        if (pass > 0) {
          await input.registry.refreshPersistentState?.();
          if (!shouldContinue(id)) return;
          const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
          if (entry?.mirrorCompleteness.state === 'complete') {
            if (operation.maxPasses !== null && operation.sweepMode !== 'full_sweep') {
              update(id, {
                status: 'completed',
                completedAt: now().toISOString(),
                mirrorCompleteness: entry.mirrorCompleteness,
                phase: 'steady_follow',
              });
              return;
            }
            update(id, {
              phase: 'steady_follow',
              mirrorCompleteness: entry.mirrorCompleteness,
            });
          }
        }
        const refreshOperation = operations.get(id);
        if (!refreshOperation) return;
        let refresh: AccountMirrorRefreshResult;
        try {
          if (!shouldContinue(id)) return;
          const collectorTimeoutMs = resolveCompletionCollectorTimeoutMs(refreshOperation);
          refresh = await input.refreshService.requestRefresh({
            provider: refreshOperation.provider,
            runtimeProfileId: refreshOperation.runtimeProfileId,
            sweepMode: refreshOperation.sweepMode ?? 'steady_follow',
            explicitRefresh: true,
            ignoreMinimumInterval: refreshOperation.mode === 'bounded',
            queueTimeoutMs: 0,
            ...(collectorTimeoutMs ? { collectorTimeoutMs } : {}),
          });
        } catch (error) {
          const eligibleAt = readEligibleAt(error);
          if (eligibleAt) {
            await input.registry.refreshPersistentState?.();
            const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
            update(id, {
              status: 'idle_waiting',
              nextAttemptAt: eligibleAt,
              mirrorCompleteness: entry?.mirrorCompleteness ?? operations.get(id)?.mirrorCompleteness ?? null,
              error: null,
            });
            if (!(await sleepUntilAttempt(id, eligibleAt))) return;
            update(id, { status: 'running', nextAttemptAt: null });
            continue;
          }
          throw error;
        }
        const nextPassCount = pass + 1;
        pass = nextPassCount;
        const refreshed = update(id, {
          passCount: nextPassCount,
          lastRefresh: refresh,
          mirrorCompleteness: refresh.mirrorCompleteness,
          phase: refresh.mirrorCompleteness.state === 'complete' ? 'steady_follow' : 'backfill_history',
          nextAttemptAt: null,
          error: null,
        });
        if (refreshed && shouldQueueMaterialization(refreshed)) {
          await queueCompletionMaterialization(refreshed);
        }
        if (!shouldContinue(id)) return;
        if (refresh.mirrorCompleteness.state === 'complete') {
          const latest = operations.get(id);
          if (
            latest?.maxPasses !== null &&
            latest?.maxPasses !== undefined &&
            ((latest.sweepMode ?? 'steady_follow') !== 'full_sweep' || nextPassCount >= latest.maxPasses)
          ) {
            update(id, {
              status: 'completed',
              completedAt: now().toISOString(),
            });
            return;
          }
        }
      }
      const latest = operations.get(id);
      update(id, {
        status: latest?.lastRefresh?.status === 'blocked' || latest?.lastRefresh?.status === 'busy' ? 'blocked' : 'completed',
        completedAt: now().toISOString(),
      });
    } catch (error) {
      if (!shouldContinue(id)) return;
      if (error instanceof AccountMirrorRefreshError) {
        update(id, {
          status: 'blocked',
          completedAt: now().toISOString(),
          error: {
            message: error.message,
            code: error.code,
          },
        });
        return;
      }
      update(id, {
        status: 'failed',
        completedAt: now().toISOString(),
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: readErrorCode(error),
        },
      });
    }
  };

  if (input.resumeActiveOperations) {
    for (const operation of operations.values()) {
      if (isRunnableOperation(operation)) {
        appendLifecycleEvent(operation.id, {
          type: 'resumed_after_restart',
          status: 'running',
          previousStatus: operation.status,
          message: 'Resumed persisted account-mirror completion after API startup.',
        });
        launch(operation.id);
      }
    }
  }

  const service: AccountMirrorCompletionService = {
    start(request = {}) {
      const id = generateId();
      const sweepMode = normalizeSweepMode(request.sweepMode);
      const operation: AccountMirrorCompletionOperation = {
        object: 'account_mirror_completion',
        id,
        provider: request.provider ?? 'chatgpt',
        runtimeProfileId: normalizeRuntimeProfile(request.runtimeProfileId),
        mode: request.maxPasses == null ? 'live_follow' : 'bounded',
        sweepMode,
        phase: 'backfill_history',
        status: 'queued',
        startedAt: now().toISOString(),
        completedAt: null,
        nextAttemptAt: null,
        maxPasses: normalizeMaxPasses(request.maxPasses),
        passCount: 0,
        lastRefresh: null,
        materializationPolicy: normalizeMaterializationPolicy(request.materializationPolicy, sweepMode),
        materializationAssetKinds: normalizeMaterializationAssetKinds(request.materializationAssetKinds),
        materializationMaxItems: normalizeMaterializationMaxItems(request.materializationMaxItems),
        materializationRefreshSnapshot: normalizeMaterializationRefreshSnapshot(request.materializationRefreshSnapshot, sweepMode),
        materializationForce: normalizeMaterializationForce(request.materializationForce),
        materializationCursor: null,
        materializationOutcome: null,
        mirrorCompleteness: null,
        error: null,
        lifecycleEvents: [],
      };
      operation.lifecycleEvents = appendLifecycleEventToList(operation.lifecycleEvents ?? [], {
        at: operation.startedAt,
        type: 'started',
        status: operation.status,
        previousStatus: null,
        processPid: process.pid,
        message: 'Started account-mirror completion.',
      });
      operations.set(id, operation);
      persist(operation);
      launch(id);
      return operation;
    },
    read(id: string) {
      return operations.get(id) ?? null;
    },
    list(request = {}) {
      const limit = normalizeListLimit(request.limit);
      const runtimeProfileId = request.runtimeProfileId ? normalizeRuntimeProfile(request.runtimeProfileId) : null;
      const activeOnly = request.activeOnly === true || request.status === 'active';
      const status = readCompletionStatus(request.status);
      const results = Array.from(operations.values())
        .filter((operation) => !request.provider || operation.provider === request.provider)
        .filter((operation) => !runtimeProfileId || operation.runtimeProfileId === runtimeProfileId)
        .filter((operation) => !activeOnly || isActiveOperation(operation))
        .filter((operation) => !status || operation.status === status)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      return limit === null ? results : results.slice(0, limit);
    },
    async refreshMaterializationStatus(id: string) {
      const operation = operations.get(id);
      if (!operation) return null;
      return await hydrateMaterializationStatus(operation);
    },
    async refreshMaterializationStatuses(inputOperations: AccountMirrorCompletionOperation[]) {
      const results: AccountMirrorCompletionOperation[] = [];
      for (const operation of inputOperations) {
        results.push(await hydrateMaterializationStatus(operation));
      }
      return results;
    },
    control(request) {
      const operation = operations.get(request.id);
      if (!operation) return null;
      if (request.action === 'pause') {
        if (!isActiveOperation(operation)) return operation;
        const updated = update(operation.id, {
          status: 'paused',
          error: null,
        });
        return appendLifecycleEvent(operation.id, {
          type: 'operator_paused',
          status: 'paused',
          previousStatus: operation.status,
          message: 'Paused account-mirror completion by operator request.',
        }) ?? updated;
      }
      if (request.action === 'resume') {
        if (operation.status !== 'paused') return operation;
        const resumed = update(operation.id, {
          status: 'queued',
          completedAt: null,
          error: null,
        });
        const evented = appendLifecycleEvent(operation.id, {
          type: 'operator_resumed',
          status: 'queued',
          previousStatus: operation.status,
          message: 'Resumed account-mirror completion by operator request.',
        });
        launch(operation.id);
        return evented ?? resumed;
      }
      if (request.action === 'cancel') {
        if (isTerminalOperation(operation)) return operation;
        const updated = update(operation.id, {
          status: 'cancelled',
          completedAt: now().toISOString(),
          nextAttemptAt: null,
          error: null,
        });
        return appendLifecycleEvent(operation.id, {
          type: 'operator_cancelled',
          status: 'cancelled',
          previousStatus: operation.status,
          message: 'Cancelled account-mirror completion by operator request.',
        }) ?? updated;
      }
      return operation;
    },
    upgradePolicy(request) {
      const operation = operations.get(request.id);
      if (!operation) return null;
      if (isTerminalOperation(operation)) return operation;
      const sweepMode = normalizeSweepMode(request.sweepMode);
      const previousStatus = operation.status;
      const nextStatus = operation.status === 'paused'
        ? 'paused'
        : (operation.status === 'queued' ? 'queued' : 'running');
      const liveFollowUpgrade = request.maxPasses === null;
      const updated = update(operation.id, {
        mode: liveFollowUpgrade ? 'live_follow' : 'bounded',
        sweepMode,
        phase: 'backfill_history',
        status: nextStatus,
        completedAt: null,
        nextAttemptAt: operation.status === 'paused' ? operation.nextAttemptAt : null,
        maxPasses: liveFollowUpgrade ? null : resolveUpgradeMaxPasses(operation, request.maxPasses),
        materializationPolicy: normalizeMaterializationPolicy(request.materializationPolicy, sweepMode),
        materializationAssetKinds: normalizeMaterializationAssetKinds(request.materializationAssetKinds),
        materializationMaxItems: normalizeMaterializationMaxItems(request.materializationMaxItems),
        materializationRefreshSnapshot: normalizeMaterializationRefreshSnapshot(request.materializationRefreshSnapshot, sweepMode),
        materializationForce: normalizeMaterializationForce(request.materializationForce),
        error: null,
      });
      const evented = appendLifecycleEvent(operation.id, {
        type: liveFollowUpgrade ? 'live_follow_policy_upgraded' : 'campaign_policy_upgraded',
        status: updated?.status ?? nextStatus,
        previousStatus,
        message: liveFollowUpgrade
          ? 'Upgraded account-mirror completion policy from configured live-follow full artifact retrieval.'
          : 'Upgraded account-mirror completion policy for a reconciliation campaign.',
      }) ?? updated;
      wakeSleepers();
      if (evented && evented.status !== 'paused') {
        launch(operation.id);
      }
      return evented;
    },
    prepareForShutdown() {
      const parked: AccountMirrorCompletionOperation[] = [];
      for (const id of Array.from(activeRuns)) {
        const operation = operations.get(id);
        if (!operation) continue;
        if (!isRunnableOperation(operation)) continue;
        const next = update(operation.id, {
          status: 'queued',
          completedAt: null,
          error: null,
        });
        const evented = appendLifecycleEvent(operation.id, {
          type: 'parked_for_shutdown',
          status: 'queued',
          previousStatus: operation.status,
          message: 'Parked account-mirror completion for API shutdown and restart resume.',
        });
        const parkedOperation = evented ?? next;
        if (parkedOperation) parked.push(parkedOperation);
      }
      wakeSleepers();
      return parked;
    },
  };
  return service;

  function persist(operation: AccountMirrorCompletionOperation): void {
    if (!input.store) return;
    const previous = persistQueues.get(operation.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => input.store?.writeOperation(operation).then(() => undefined))
      .catch((error) => input.onPersistError?.(error, operation));
    persistQueues.set(operation.id, next);
  }

  function appendLifecycleEvent(id: string, inputEvent: Omit<AccountMirrorCompletionLifecycleEvent, 'at' | 'processPid'>): AccountMirrorCompletionOperation | null {
    const current = operations.get(id);
    if (!current) return null;
    return update(id, {
      lifecycleEvents: appendLifecycleEventToList(current.lifecycleEvents ?? [], {
        ...inputEvent,
        at: now().toISOString(),
        processPid: process.pid,
      }),
    });
  }

  async function queueCompletionMaterialization(operation: AccountMirrorCompletionOperation): Promise<void> {
    if (!input.historyMaterializationService) {
      throw new Error('Account mirror full-sweep materialization is not configured.');
    }
    const request = {
      provider: operation.provider,
      runtimeProfile: operation.runtimeProfileId,
      reconcile: true,
      refreshSnapshot: operation.materializationRefreshSnapshot === true,
      assetKinds: operation.materializationAssetKinds ?? ['all'],
      maxItems: operation.materializationMaxItems ?? null,
      force: operation.materializationForce === true,
    } satisfies AccountMirrorCompletionMaterializationCursor['request'];
    const result = await input.historyMaterializationService.createJob(request);
    update(operation.id, {
      materializationCursor: {
        jobId: result.job.id,
        jobStatus: result.job.status,
        reused: result.reused === true,
        requestedAt: result.generatedAt ?? now().toISOString(),
        passCount: operation.passCount,
        request,
      },
      materializationOutcome: null,
    });
  }

  async function hydrateMaterializationStatus(
    operation: AccountMirrorCompletionOperation,
  ): Promise<AccountMirrorCompletionOperation> {
    const cursor = operation.materializationCursor;
    if (!cursor || !input.historyMaterializationService?.readJob) return operation;
    const job = await input.historyMaterializationService.readJob(cursor.jobId).catch(() => null);
    if (!job) return operation;
    const outcome = isTerminalMaterializationStatus(job.status)
      ? summarizeMaterializationOutcome(job)
      : null;
    return update(operation.id, {
      materializationCursor: {
        ...cursor,
        jobStatus: job.status || cursor.jobStatus,
      },
      materializationOutcome: outcome,
    }) ?? operation;
  }
}

function isTerminalMaterializationStatus(status: string): boolean {
  return status === 'succeeded' ||
    status === 'skipped' ||
    status === 'failed' ||
    status === 'cancelled';
}

function summarizeMaterializationOutcome(
  job: AccountMirrorHistoryMaterializationJobReadResult,
): AccountMirrorCompletionMaterializationOutcome {
  const result = job.result ?? null;
  const metrics = result?.metrics ?? {};
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  const snapshotRefreshes = Array.isArray(result?.snapshotRefreshes) ? result.snapshotRefreshes : [];
  return {
    jobId: job.id,
    jobStatus: job.status,
    completedAt: typeof job.completedAt === 'string' && job.completedAt.trim() ? job.completedAt.trim() : null,
    conversationsAttempted: normalizeOutcomeCount(metrics.conversations),
    materialized: normalizeOutcomeCount(metrics.materialized),
    skipped: normalizeOutcomeCount(metrics.skipped),
    failed: normalizeOutcomeCount(metrics.failed),
    checksumCount: entries.filter((entry) => readNestedString(entry, ['checksumSha256'])).length,
    manifestPaths: Array.isArray(result?.manifestPaths)
      ? result.manifestPaths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    terminalRouteabilityCounts: countRouteabilityStates(snapshotRefreshes),
    message: typeof result?.message === 'string' && result.message.trim() ? result.message.trim() : null,
  };
}

function normalizeOutcomeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function countRouteabilityStates(entries: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const state = readNestedString(entry, ['routeabilityState']) ?? 'unknown';
    counts[state] = (counts[state] ?? 0) + 1;
  }
  return counts;
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim().length > 0 ? current.trim() : null;
}

function shouldQueueMaterialization(operation: AccountMirrorCompletionOperation): boolean {
  if (operation.lastRefresh?.status !== 'completed') return false;
  if (operation.materializationPolicy === 'metadata_only') return false;
  if (!operation.materializationPolicy && operation.sweepMode !== 'full_sweep') return false;
  if (operation.materializationCursor?.passCount === operation.passCount) return false;
  return true;
}

function normalizeLifecycleEvents(operation: AccountMirrorCompletionOperation): AccountMirrorCompletionOperation {
  return {
    ...operation,
    lifecycleEvents: Array.isArray(operation.lifecycleEvents) ? operation.lifecycleEvents.slice(-20) : [],
  };
}

function appendLifecycleEventToList(
  events: AccountMirrorCompletionLifecycleEvent[],
  event: AccountMirrorCompletionLifecycleEvent,
): AccountMirrorCompletionLifecycleEvent[] {
  return [...events, event].slice(-20);
}

function isActiveOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running' || operation.status === 'idle_waiting' || operation.status === 'paused';
}

function isRunnableOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running' || operation.status === 'idle_waiting';
}

function isTerminalOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'completed' || operation.status === 'blocked' || operation.status === 'failed' || operation.status === 'cancelled';
}

function findTargetEntry(
  registry: AccountMirrorStatusRegistry,
  provider: AccountMirrorProvider,
  runtimeProfileId: string,
): AccountMirrorStatusEntry | null {
  return registry.readStatus({
    provider,
    runtimeProfileId,
    explicitRefresh: true,
  }).entries[0] ?? null;
}

function normalizeRuntimeProfile(value: string | null | undefined): string {
  const trimmed = String(value ?? 'default').trim();
  return trimmed.length > 0 ? trimmed : 'default';
}

function normalizeSweepMode(value: AccountMirrorCompletionSweepMode | null | undefined): AccountMirrorCompletionSweepMode {
  return value === 'full_sweep' ? 'full_sweep' : 'steady_follow';
}

function normalizeMaterializationPolicy(
  value: AccountMirrorCompletionMaterializationPolicy | null | undefined,
  sweepMode: AccountMirrorCompletionSweepMode,
): AccountMirrorCompletionMaterializationPolicy {
  if (
    value === 'metadata_only' ||
    value === 'recent_missing_assets' ||
    value === 'full_missing_assets'
  ) {
    return value;
  }
  return sweepMode === 'full_sweep' ? 'full_missing_assets' : 'metadata_only';
}

function normalizeMaterializationAssetKinds(
  value: AccountMirrorCompletionMaterializationAssetKind[] | null | undefined,
): AccountMirrorCompletionMaterializationAssetKind[] {
  if (!Array.isArray(value) || value.length === 0) return ['all'];
  const normalized = value.filter((entry) =>
    entry === 'artifacts' ||
    entry === 'files' ||
    entry === 'media' ||
    entry === 'all'
  );
  if (normalized.includes('all')) return ['all'];
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['all'];
}

function normalizeMaterializationMaxItems(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function normalizeMaterializationRefreshSnapshot(
  value: boolean | null | undefined,
  sweepMode: AccountMirrorCompletionSweepMode,
): boolean {
  return value ?? (sweepMode === 'full_sweep');
}

function normalizeMaterializationForce(value: boolean | null | undefined): boolean {
  return value === true;
}

function normalizeMaxPasses(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function resolveUpgradeMaxPasses(
  operation: AccountMirrorCompletionOperation,
  value: number | null | undefined,
): number {
  const additionalPasses = normalizeMaxPasses(value) ?? 1;
  const inFlightBuffer = operation.status === 'running' ? 1 : 0;
  const requested = operation.passCount + additionalPasses + inFlightBuffer;
  if (operation.mode === 'bounded' && operation.maxPasses !== null) {
    return Math.max(operation.maxPasses, requested);
  }
  return requested;
}

function normalizeListLimit(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function readCompletionStatus(value: AccountMirrorCompletionListRequest['status']): AccountMirrorCompletionOperation['status'] | null {
  if (
    value === 'queued'
    || value === 'running'
    || value === 'idle_waiting'
    || value === 'paused'
    || value === 'completed'
    || value === 'blocked'
    || value === 'failed'
    || value === 'cancelled'
  ) {
    return value;
  }
  return null;
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function readEligibleAt(error: unknown): string | null {
  if (!(error instanceof AccountMirrorRefreshError)) return null;
  if (error.code !== 'account_mirror_not_eligible') return null;
  const eligibleAt = error.details.eligibleAt;
  return typeof eligibleAt === 'string' && !Number.isNaN(Date.parse(eligibleAt)) ? eligibleAt : null;
}

function resolveDelayMs(eligibleAt: string, now: Date): number {
  return Math.max(0, Date.parse(eligibleAt) - now.getTime());
}

function resolveCompletionCollectorTimeoutMs(operation: AccountMirrorCompletionOperation): number | undefined {
  if (operation.provider === 'gemini') {
    return operation.sweepMode === 'full_sweep' ? 900_000 : 300_000;
  }
  if (operation.sweepMode === 'full_sweep') return 300_000;
  return undefined;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
