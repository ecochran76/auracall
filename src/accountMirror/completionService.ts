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

export interface AccountMirrorCompletionOperation {
  object: 'account_mirror_completion';
  id: string;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  mode: 'live_follow' | 'bounded';
  phase: 'backfill_history' | 'steady_follow';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'blocked' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  nextAttemptAt: string | null;
  maxPasses: number | null;
  passCount: number;
  lastRefresh: AccountMirrorRefreshResult | null;
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'] | null;
  error: {
    message: string;
    code: string | null;
  } | null;
}

export interface AccountMirrorCompletionService {
  start(request?: AccountMirrorCompletionStartRequest): AccountMirrorCompletionOperation;
  read(id: string): AccountMirrorCompletionOperation | null;
  list(request?: AccountMirrorCompletionListRequest): AccountMirrorCompletionOperation[];
  control(request: AccountMirrorCompletionControlRequest): AccountMirrorCompletionOperation | null;
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
  onPersistError?: (error: unknown, operation: AccountMirrorCompletionOperation) => void;
}): AccountMirrorCompletionService {
  const now = input.now ?? (() => new Date());
  const generateId = input.generateId ?? (() => `acctmirror_completion_${randomUUID()}`);
  const sleepImpl = input.sleep ?? sleep;
  const operations = new Map<string, AccountMirrorCompletionOperation>();
  const persistQueues = new Map<string, Promise<void>>();
  const activeRuns = new Set<string>();

  for (const operation of input.initialOperations ?? []) {
    operations.set(operation.id, operation);
  }

  const update = (id: string, patch: Partial<AccountMirrorCompletionOperation>) => {
    const current = operations.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    operations.set(id, next);
    persist(next);
    return next;
  };

  const shouldContinue = (id: string): boolean => operations.get(id)?.status === 'running';

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
      const operation = operations.get(id);
      if (!operation) return;
      if (operation.nextAttemptAt) {
        await sleepImpl(resolveDelayMs(operation.nextAttemptAt, now()));
        if (!shouldContinue(id)) return;
        update(id, { nextAttemptAt: null });
      }
      let pass = operation.passCount;
      while (operation.maxPasses === null || pass < operation.maxPasses) {
        if (!shouldContinue(id)) return;
        if (pass > 0) {
          await input.registry.refreshPersistentState?.();
          if (!shouldContinue(id)) return;
          const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
          if (entry?.mirrorCompleteness.state === 'complete') {
            if (operation.maxPasses !== null) {
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
        let refresh: AccountMirrorRefreshResult;
        try {
          if (!shouldContinue(id)) return;
          refresh = await input.refreshService.requestRefresh({
            provider: operation.provider,
            runtimeProfileId: operation.runtimeProfileId,
            explicitRefresh: true,
            queueTimeoutMs: 0,
          });
        } catch (error) {
          const eligibleAt = readEligibleAt(error);
          if (eligibleAt) {
            await input.registry.refreshPersistentState?.();
            const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
            update(id, {
              status: 'running',
              nextAttemptAt: eligibleAt,
              mirrorCompleteness: entry?.mirrorCompleteness ?? operations.get(id)?.mirrorCompleteness ?? null,
              error: null,
            });
            await sleepImpl(resolveDelayMs(eligibleAt, now()));
            if (!shouldContinue(id)) return;
            continue;
          }
          throw error;
        }
        const nextPassCount = pass + 1;
        pass = nextPassCount;
        update(id, {
          passCount: nextPassCount,
          lastRefresh: refresh,
          mirrorCompleteness: refresh.mirrorCompleteness,
          phase: refresh.mirrorCompleteness.state === 'complete' ? 'steady_follow' : 'backfill_history',
          nextAttemptAt: null,
          error: null,
        });
        if (!shouldContinue(id)) return;
        if (refresh.mirrorCompleteness.state === 'complete') {
          if (operation.maxPasses !== null) {
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
        launch(operation.id);
      }
    }
  }

  const service: AccountMirrorCompletionService = {
    start(request = {}) {
      const id = generateId();
      const operation: AccountMirrorCompletionOperation = {
        object: 'account_mirror_completion',
        id,
        provider: request.provider ?? 'chatgpt',
        runtimeProfileId: normalizeRuntimeProfile(request.runtimeProfileId),
        mode: request.maxPasses == null ? 'live_follow' : 'bounded',
        phase: 'backfill_history',
        status: 'queued',
        startedAt: now().toISOString(),
        completedAt: null,
        nextAttemptAt: null,
        maxPasses: normalizeMaxPasses(request.maxPasses),
        passCount: 0,
        lastRefresh: null,
        mirrorCompleteness: null,
        error: null,
      };
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
    control(request) {
      const operation = operations.get(request.id);
      if (!operation) return null;
      if (request.action === 'pause') {
        if (!isActiveOperation(operation)) return operation;
        return update(operation.id, {
          status: 'paused',
          error: null,
        });
      }
      if (request.action === 'resume') {
        if (operation.status !== 'paused') return operation;
        const resumed = update(operation.id, {
          status: 'queued',
          completedAt: null,
          error: null,
        });
        launch(operation.id);
        return resumed;
      }
      if (request.action === 'cancel') {
        if (isTerminalOperation(operation)) return operation;
        return update(operation.id, {
          status: 'cancelled',
          completedAt: now().toISOString(),
          nextAttemptAt: null,
          error: null,
        });
      }
      return operation;
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
}

function isActiveOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running' || operation.status === 'paused';
}

function isRunnableOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running';
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

function normalizeMaxPasses(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(500, Math.floor(value)));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
