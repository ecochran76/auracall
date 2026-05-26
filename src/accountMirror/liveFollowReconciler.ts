import type {
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionStartRequest,
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
    })[0] ?? null;
    if (active) {
      existing.push(active);
      continue;
    }
    started.push(input.completionService.start({
      provider: entry.provider,
      runtimeProfileId: entry.runtimeProfileId,
      maxPasses: null,
      ...buildLiveFollowCompletionPolicy(entry),
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

function buildLiveFollowCompletionPolicy(
  entry: AccountMirrorStatusEntry,
): Pick<
  AccountMirrorCompletionStartRequest,
  | 'sweepMode'
  | 'materializationPolicy'
  | 'materializationAssetKinds'
  | 'materializationMaxItems'
  | 'materializationRefreshSnapshot'
  | 'materializationForce'
> {
  const request: Pick<
    AccountMirrorCompletionStartRequest,
    | 'sweepMode'
    | 'materializationPolicy'
    | 'materializationAssetKinds'
    | 'materializationMaxItems'
    | 'materializationRefreshSnapshot'
    | 'materializationForce'
  > = {};
  if (entry.liveFollow.sweepMode) request.sweepMode = entry.liveFollow.sweepMode;
  if (entry.liveFollow.materializationPolicy) request.materializationPolicy = entry.liveFollow.materializationPolicy;
  if (entry.liveFollow.materializationAssetKinds) request.materializationAssetKinds = entry.liveFollow.materializationAssetKinds;
  if (entry.liveFollow.materializationMaxItems !== null) request.materializationMaxItems = entry.liveFollow.materializationMaxItems;
  if (entry.liveFollow.materializationRefreshSnapshot !== null) request.materializationRefreshSnapshot = entry.liveFollow.materializationRefreshSnapshot;
  if (entry.liveFollow.materializationForce !== null) request.materializationForce = entry.liveFollow.materializationForce;
  return request;
}
