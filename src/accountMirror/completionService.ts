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

export interface AccountMirrorCompletionStartRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  maxPasses?: number | null;
}

export interface AccountMirrorCompletionOperation {
  object: 'account_mirror_completion';
  id: string;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  status: 'queued' | 'running' | 'completed' | 'blocked' | 'failed';
  startedAt: string;
  completedAt: string | null;
  maxPasses: number;
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
}

export function createAccountMirrorCompletionService(input: {
  registry: AccountMirrorStatusRegistry;
  refreshService: AccountMirrorRefreshService;
  now?: () => Date;
  generateId?: () => string;
}): AccountMirrorCompletionService {
  const now = input.now ?? (() => new Date());
  const generateId = input.generateId ?? (() => `acctmirror_completion_${randomUUID()}`);
  const operations = new Map<string, AccountMirrorCompletionOperation>();

  const update = (id: string, patch: Partial<AccountMirrorCompletionOperation>) => {
    const current = operations.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    operations.set(id, next);
    return next;
  };

  const run = async (id: string) => {
    update(id, { status: 'running' });
    try {
      const operation = operations.get(id);
      if (!operation) return;
      for (let pass = 0; pass < operation.maxPasses; pass += 1) {
        await input.registry.refreshPersistentState?.();
        const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
        if (entry?.mirrorCompleteness.state === 'complete') {
          update(id, {
            status: 'completed',
            completedAt: now().toISOString(),
            mirrorCompleteness: entry.mirrorCompleteness,
          });
          return;
        }
        const refresh = await input.refreshService.requestRefresh({
          provider: operation.provider,
          runtimeProfileId: operation.runtimeProfileId,
          explicitRefresh: true,
          queueTimeoutMs: 0,
        });
        const nextPassCount = pass + 1;
        update(id, {
          passCount: nextPassCount,
          lastRefresh: refresh,
          mirrorCompleteness: refresh.mirrorCompleteness,
        });
        if (refresh.mirrorCompleteness.state === 'complete') {
          update(id, {
            status: 'completed',
            completedAt: now().toISOString(),
          });
          return;
        }
      }
      const latest = operations.get(id);
      update(id, {
        status: latest?.lastRefresh?.status === 'blocked' || latest?.lastRefresh?.status === 'busy' ? 'blocked' : 'completed',
        completedAt: now().toISOString(),
      });
    } catch (error) {
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

  return {
    start(request = {}) {
      const id = generateId();
      const operation: AccountMirrorCompletionOperation = {
        object: 'account_mirror_completion',
        id,
        provider: request.provider ?? 'chatgpt',
        runtimeProfileId: normalizeRuntimeProfile(request.runtimeProfileId),
        status: 'queued',
        startedAt: now().toISOString(),
        completedAt: null,
        maxPasses: normalizeMaxPasses(request.maxPasses),
        passCount: 0,
        lastRefresh: null,
        mirrorCompleteness: null,
        error: null,
      };
      operations.set(id, operation);
      void run(id);
      return operation;
    },
    read(id: string) {
      return operations.get(id) ?? null;
    },
  };
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

function normalizeMaxPasses(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}
