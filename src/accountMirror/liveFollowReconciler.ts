import type {
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
} from './completionService.js';
import type {
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
} from './statusRegistry.js';

export interface AccountMirrorLiveFollowReconcileResult {
  object: 'account_mirror_live_follow_reconcile';
  started: AccountMirrorCompletionOperation[];
  existing: AccountMirrorCompletionOperation[];
  skipped: Array<{
    provider: AccountMirrorStatusEntry['provider'];
    runtimeProfileId: string;
    reason: string;
  }>;
  metrics: {
    enabledTargets: number;
    started: number;
    existing: number;
    skipped: number;
  };
}

export async function reconcileConfiguredAccountMirrorLiveFollow(input: {
  registry: AccountMirrorStatusRegistry;
  completionService: AccountMirrorCompletionService;
}): Promise<AccountMirrorLiveFollowReconcileResult> {
  await input.registry.refreshPersistentState?.();
  const entries = input.registry.readStatus({ explicitRefresh: false }).entries;
  const enabledEntries = entries.filter(
    (entry) => entry.liveFollow.state === 'enabled' && entry.status !== 'blocked',
  );
  const started: AccountMirrorCompletionOperation[] = [];
  const existing: AccountMirrorCompletionOperation[] = [];
  const skipped: AccountMirrorLiveFollowReconcileResult['skipped'] = [];

  for (const entry of entries) {
    if (entry.liveFollow.state !== 'enabled') {
      skipped.push({
        provider: entry.provider,
        runtimeProfileId: entry.runtimeProfileId,
        reason: entry.liveFollow.reason,
      });
      continue;
    }
    if (entry.status === 'blocked') {
      skipped.push({
        provider: entry.provider,
        runtimeProfileId: entry.runtimeProfileId,
        reason: entry.reason,
      });
      continue;
    }
    const active = input.completionService.list({
      provider: entry.provider,
      runtimeProfileId: entry.runtimeProfileId,
      status: 'active',
      limit: null,
    }).find((operation) => operation.mode === 'live_follow');
    if (active) {
      existing.push(active);
      continue;
    }
    started.push(input.completionService.start({
      provider: entry.provider,
      runtimeProfileId: entry.runtimeProfileId,
      maxPasses: null,
    }));
  }

  return {
    object: 'account_mirror_live_follow_reconcile',
    started,
    existing,
    skipped,
    metrics: {
      enabledTargets: enabledEntries.length,
      started: started.length,
      existing: existing.length,
      skipped: skipped.length,
    },
  };
}
