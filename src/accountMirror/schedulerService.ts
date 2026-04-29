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
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'];
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
    inProgressEligibleTargets: number;
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
      const defaultChatgptEligibleTargets = eligibleTargets.filter(
        (entry) => entry.provider === 'chatgpt' && entry.runtimeProfileId === 'default',
      );
      const selected = chooseSchedulerTarget(defaultChatgptEligibleTargets);
      const metrics = {
        totalTargets: status.metrics.total,
        eligibleTargets: eligibleTargets.length,
        defaultChatgptEligibleTargets: defaultChatgptEligibleTargets.length,
        inProgressEligibleTargets: eligibleTargets.filter(
          (entry) => entry.mirrorCompleteness.state === 'in_progress',
        ).length,
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
          queueTimeoutMs: 0,
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

function chooseSchedulerTarget(entries: AccountMirrorStatusEntry[]): AccountMirrorStatusEntry | null {
  return [...entries].sort(compareSchedulerTargets)[0] ?? null;
}

function compareSchedulerTargets(a: AccountMirrorStatusEntry, b: AccountMirrorStatusEntry): number {
  const priorityDelta = completenessPriority(a) - completenessPriority(b);
  if (priorityDelta !== 0) return priorityDelta;
  const remainingDelta = remainingDetailSurfaces(b) - remainingDetailSurfaces(a);
  if (remainingDelta !== 0) return remainingDelta;
  return a.runtimeProfileId.localeCompare(b.runtimeProfileId);
}

function completenessPriority(entry: AccountMirrorStatusEntry): number {
  switch (entry.mirrorCompleteness.state) {
    case 'in_progress':
      return 0;
    case 'unknown':
      return 1;
    case 'none':
      return 2;
    case 'complete':
      return 3;
  }
}

function remainingDetailSurfaces(entry: AccountMirrorStatusEntry): number {
  return entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? 0;
}

function summarizeTarget(entry: AccountMirrorStatusEntry): AccountMirrorSchedulerSelectedTarget {
  return {
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    browserProfileId: entry.browserProfileId,
    status: entry.status,
    reason: entry.reason,
    eligibleAt: entry.eligibleAt,
    mirrorCompleteness: entry.mirrorCompleteness,
  };
}
