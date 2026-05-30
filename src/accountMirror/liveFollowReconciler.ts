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
  upgraded: AccountMirrorCompletionOperation[];
  skipped: Array<{
    provider: AccountMirrorStatusEntry['provider'];
    runtimeProfileId: string;
    reason: string;
  }>;
  metrics: {
    enabledTargets: number;
    started: number;
    existing: number;
    upgraded: number;
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
  const upgraded: AccountMirrorCompletionOperation[] = [];
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
      const policy = buildLiveFollowCompletionPolicy(entry);
      const upgradedOperation = maybeUpgradeActiveCompletion(input.completionService, active, policy);
      if (upgradedOperation && upgradedOperation.id === active.id) {
        existing.push(upgradedOperation);
        upgraded.push(upgradedOperation);
      } else {
        existing.push(active);
      }
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
    upgraded,
    skipped,
    metrics: {
      enabledTargets: enabledEntries.length,
      started: started.length,
      existing: existing.length,
      upgraded: upgraded.length,
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

function maybeUpgradeActiveCompletion(
  completionService: AccountMirrorCompletionService,
  active: AccountMirrorCompletionOperation,
  policy: Pick<
    AccountMirrorCompletionStartRequest,
    | 'sweepMode'
    | 'materializationPolicy'
    | 'materializationAssetKinds'
    | 'materializationMaxItems'
    | 'materializationRefreshSnapshot'
    | 'materializationForce'
  >,
): AccountMirrorCompletionOperation | null {
  if (!completionService.upgradePolicy) return null;
  if (Object.keys(policy).length === 0) return null;
  if (activeCompletionMatchesPolicy(active, policy)) return null;
  return completionService.upgradePolicy({
    id: active.id,
    maxPasses: null,
    ...policy,
  });
}

function activeCompletionMatchesPolicy(
  active: AccountMirrorCompletionOperation,
  policy: Pick<
    AccountMirrorCompletionStartRequest,
    | 'sweepMode'
    | 'materializationPolicy'
    | 'materializationAssetKinds'
    | 'materializationMaxItems'
    | 'materializationRefreshSnapshot'
    | 'materializationForce'
  >,
): boolean {
  if (policy.sweepMode && active.sweepMode !== policy.sweepMode) return false;
  if (policy.materializationPolicy && active.materializationPolicy !== policy.materializationPolicy) return false;
  if (
    policy.materializationAssetKinds &&
    !assetKindsEqual(active.materializationAssetKinds ?? ['all'], policy.materializationAssetKinds)
  ) {
    return false;
  }
  if (
    typeof policy.materializationMaxItems === 'number' &&
    (active.materializationMaxItems ?? null) !== policy.materializationMaxItems
  ) {
    return false;
  }
  if (
    typeof policy.materializationRefreshSnapshot === 'boolean' &&
    active.materializationRefreshSnapshot !== policy.materializationRefreshSnapshot
  ) {
    return false;
  }
  if (typeof policy.materializationForce === 'boolean' && active.materializationForce !== policy.materializationForce) return false;
  return true;
}

function assetKindsEqual(
  left: NonNullable<AccountMirrorCompletionOperation['materializationAssetKinds']>,
  right: NonNullable<AccountMirrorCompletionStartRequest['materializationAssetKinds']>,
): boolean {
  const normalizedLeft = normalizeAssetKinds(left);
  const normalizedRight = normalizeAssetKinds(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
}

function normalizeAssetKinds(
  values: NonNullable<AccountMirrorCompletionStartRequest['materializationAssetKinds']>,
): string[] {
  const normalized = Array.from(new Set(values)).sort();
  return normalized.includes('all') ? ['all'] : normalized;
}
