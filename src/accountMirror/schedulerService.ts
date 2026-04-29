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

export interface AccountMirrorSchedulerPassRequest {
  dryRun?: boolean | null;
}

export interface AccountMirrorSchedulerSelectedTarget {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  status: AccountMirrorStatusEntry['status'];
  reason: AccountMirrorStatusEntry['reason'];
  eligibleAt: string | null;
}

export interface AccountMirrorSchedulerPassResult {
  object: 'account_mirror_scheduler_pass';
  mode: 'dry-run' | 'execute';
  action: 'skipped' | 'dry-run' | 'refresh-completed' | 'refresh-blocked';
  startedAt: string;
  completedAt: string;
  selectedTarget: AccountMirrorSchedulerSelectedTarget | null;
  metrics: {
    totalTargets: number;
    eligibleTargets: number;
    defaultChatgptEligibleTargets: number;
  };
  refresh: AccountMirrorRefreshResult | null;
  error: {
    code: string;
    statusCode: number;
    message: string;
    details: Record<string, unknown>;
  } | null;
}

export interface AccountMirrorSchedulerPassService {
  runOnce(request?: AccountMirrorSchedulerPassRequest): Promise<AccountMirrorSchedulerPassResult>;
}

export function createAccountMirrorSchedulerPassService(input: {
  registry: AccountMirrorStatusRegistry;
  refreshService: AccountMirrorRefreshService;
  now?: () => Date;
}): AccountMirrorSchedulerPassService {
  const now = input.now ?? (() => new Date());
  return {
    async runOnce(request = {}) {
      const dryRun = request.dryRun ?? true;
      const startedAt = now();
      await input.registry.refreshPersistentState?.();
      const status = input.registry.readStatus({
        explicitRefresh: false,
      });
      const eligibleTargets = status.entries.filter((entry) => entry.status === 'eligible');
      const selected = eligibleTargets.find(
        (entry) => entry.provider === 'chatgpt' && entry.runtimeProfileId === 'default',
      ) ?? null;
      const metrics = {
        totalTargets: status.metrics.total,
        eligibleTargets: eligibleTargets.length,
        defaultChatgptEligibleTargets: selected ? 1 : 0,
      };
      if (!selected) {
        return {
          object: 'account_mirror_scheduler_pass',
          mode: dryRun ? 'dry-run' : 'execute',
          action: 'skipped',
          startedAt: startedAt.toISOString(),
          completedAt: now().toISOString(),
          selectedTarget: null,
          metrics,
          refresh: null,
          error: null,
        };
      }
      const selectedTarget = summarizeTarget(selected);
      if (dryRun) {
        return {
          object: 'account_mirror_scheduler_pass',
          mode: 'dry-run',
          action: 'dry-run',
          startedAt: startedAt.toISOString(),
          completedAt: now().toISOString(),
          selectedTarget,
          metrics,
          refresh: null,
          error: null,
        };
      }
      try {
        const refresh = await input.refreshService.requestRefresh({
          provider: selected.provider,
          runtimeProfileId: selected.runtimeProfileId,
          explicitRefresh: false,
        });
        return {
          object: 'account_mirror_scheduler_pass',
          mode: 'execute',
          action: 'refresh-completed',
          startedAt: startedAt.toISOString(),
          completedAt: now().toISOString(),
          selectedTarget,
          metrics,
          refresh,
          error: null,
        };
      } catch (error) {
        if (error instanceof AccountMirrorRefreshError) {
          return {
            object: 'account_mirror_scheduler_pass',
            mode: 'execute',
            action: 'refresh-blocked',
            startedAt: startedAt.toISOString(),
            completedAt: now().toISOString(),
            selectedTarget,
            metrics,
            refresh: null,
            error: {
              code: error.code,
              statusCode: error.statusCode,
              message: error.message,
              details: error.details,
            },
          };
        }
        throw error;
      }
    },
  };
}

function summarizeTarget(entry: AccountMirrorStatusEntry): AccountMirrorSchedulerSelectedTarget {
  return {
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    browserProfileId: entry.browserProfileId,
    status: entry.status,
    reason: entry.reason,
    eligibleAt: entry.eligibleAt,
  };
}
