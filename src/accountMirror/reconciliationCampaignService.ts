import { randomUUID } from 'node:crypto';
import type {
  AccountMirrorCompletionMaterializationAssetKind,
  AccountMirrorCompletionMaterializationPolicy,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionSweepMode,
} from './completionService.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
} from './statusRegistry.js';
import type { AccountMirrorReconciliationCampaignStore } from './reconciliationCampaignStore.js';
import {
  createAccountMirrorTenantKey,
  normalizeAccountMirrorProviderIdentityKey,
} from './tenantBinding.js';

export type AccountMirrorReconciliationCampaignStatus =
  | 'planned'
  | 'queued'
  | 'running'
  | 'idle_waiting'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'completed_with_skips'
  | 'cancelled'
  | 'failed';

export type AccountMirrorReconciliationTargetState =
  | 'eligible'
  | 'disabled'
  | 'unconfigured'
  | 'unsupported_provider'
  | 'missing_identity'
  | 'identity_mismatch'
  | 'provider_guard'
  | 'cooldown_wait'
  | 'foreground_backpressure'
  | 'already_active';

export type AccountMirrorReconciliationTargetExecutionStatus =
  | 'not_started'
  | 'attached'
  | 'deferred'
  | 'queued'
  | 'running'
  | 'idle_waiting'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export interface AccountMirrorReconciliationCreateRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  identity?: string | null;
  includeDisabled?: boolean | null;
  maxTargets?: number | null;
  maxActiveTargets?: number | null;
  materializationPolicy?: AccountMirrorCompletionMaterializationPolicy | null;
  materializationAssetKinds?: AccountMirrorCompletionMaterializationAssetKind[] | null;
  materializationMaxItems?: number | null;
  dryRun?: boolean | null;
}

export interface AccountMirrorReconciliationListRequest {
  status?: AccountMirrorReconciliationCampaignStatus | 'active' | null;
  limit?: number | null;
}

export interface AccountMirrorReconciliationControlRequest {
  id: string;
  action: 'pause' | 'resume' | 'cancel' | 'run_next_pass';
}

export interface AccountMirrorReconciliationTarget {
  object: 'account_mirror_reconciliation_target';
  key: string;
  tenantKey: string | null;
  bindingKey: string;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  detectedIdentityKey: string | null;
  accountLevel: string | null;
  liveFollowState: AccountMirrorStatusEntry['liveFollow'];
  state: AccountMirrorReconciliationTargetState;
  selected: boolean;
  reason: string;
  nextEligibleAt: string | null;
  activeCompletionId: string | null;
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'];
  metadataCounts: AccountMirrorStatusEntry['metadataCounts'];
  policy: {
    sweepMode: AccountMirrorCompletionSweepMode;
    materializationPolicy: AccountMirrorCompletionMaterializationPolicy;
    materializationAssetKinds: AccountMirrorCompletionMaterializationAssetKind[];
    materializationMaxItems: number | null;
  };
  childOperations: {
    completionId: string | null;
    materializationJobId: string | null;
  };
  execution: {
    status: AccountMirrorReconciliationTargetExecutionStatus;
    reason: string;
    updatedAt: string | null;
    completionStatus: AccountMirrorCompletionOperation['status'] | null;
    passCount: number | null;
    materializationJobStatus: string | null;
    materializationMetrics: AccountMirrorReconciliationMaterializationMetrics | null;
    materializedAssets: AccountMirrorReconciliationMaterializedAssetEvidence[];
    terminalRouteability: AccountMirrorReconciliationTerminalRouteabilityMetrics | null;
    remainingDetailSurfaces: AccountMirrorStatusEntry['mirrorCompleteness']['remainingDetailSurfaces'];
    nextEligibleAt: string | null;
  };
}

export interface AccountMirrorReconciliationMaterializationMetrics {
  conversations: number;
  materialized: number;
  skipped: number;
  failed: number;
  archiveItems: number;
  checksummedAssets: number;
}

export interface AccountMirrorReconciliationTerminalRouteabilityMetrics {
  notFoundOrUnavailable: number;
  guarded: number;
  identityMismatch: number;
  authConflict: number;
  failed: number;
}

export interface AccountMirrorReconciliationMaterializedAssetEvidence {
  kind: string | null;
  providerConversationId: string | null;
  boundIdentityKey: string | null;
  providerId: string | null;
  title: string | null;
  checksumSha256: string | null;
  cacheKey: string | null;
  archiveItemId: string | null;
  assetRoute: string | null;
  status: string | null;
}

export interface AccountMirrorReconciliationCampaign {
  object: 'account_mirror_reconciliation_campaign';
  id: string;
  dryRun: boolean;
  status: AccountMirrorReconciliationCampaignStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  filters: {
    provider: AccountMirrorProvider | null;
    runtimeProfileId: string | null;
    identity: string | null;
    includeDisabled: boolean;
    maxTargets: number | null;
    maxActiveTargets: number | null;
  };
  policy: {
    sweepMode: AccountMirrorCompletionSweepMode;
    materializationPolicy: AccountMirrorCompletionMaterializationPolicy;
    materializationAssetKinds: AccountMirrorCompletionMaterializationAssetKind[];
    materializationMaxItems: number | null;
  };
  metrics: {
    totalTargets: number;
    selectedTargets: number;
    targetStates: Record<AccountMirrorReconciliationTargetState, number>;
    byProvider: Record<AccountMirrorProvider, {
      totalTargets: number;
      selectedTargets: number;
      targetStates: Record<AccountMirrorReconciliationTargetState, number>;
    }>;
    materialization: {
      jobs: number;
      activeJobs: number;
      terminalJobs: number;
      conversations: number;
      materialized: number;
      skipped: number;
      failed: number;
      archiveItems: number;
      checksummedAssets: number;
      terminalUnavailableConversations: number;
      guardedConversations: number;
      identityMismatchConversations: number;
    };
  };
  targets: AccountMirrorReconciliationTarget[];
  events: Array<{
    at: string;
    type: string;
    message: string;
  }>;
}

export interface AccountMirrorReconciliationCampaignService {
  create(request?: AccountMirrorReconciliationCreateRequest): Promise<AccountMirrorReconciliationCampaign>;
  read(id: string): Promise<AccountMirrorReconciliationCampaign | null>;
  list(request?: AccountMirrorReconciliationListRequest): Promise<AccountMirrorReconciliationCampaign[]>;
  control(request: AccountMirrorReconciliationControlRequest): Promise<AccountMirrorReconciliationCampaign | null>;
  recoverActiveCampaigns?(): Promise<AccountMirrorReconciliationCampaign[]>;
}

interface AccountMirrorReconciliationMaterializationJobReader {
  readJob(id: string): Promise<unknown | null>;
}

const TARGET_STATES: AccountMirrorReconciliationTargetState[] = [
  'eligible',
  'disabled',
  'unconfigured',
  'unsupported_provider',
  'missing_identity',
  'identity_mismatch',
  'provider_guard',
  'cooldown_wait',
  'foreground_backpressure',
  'already_active',
];

export function createAccountMirrorReconciliationCampaignService(input: {
  registry: AccountMirrorStatusRegistry;
  completionService: AccountMirrorCompletionService;
  materializationJobReader?: AccountMirrorReconciliationMaterializationJobReader | null;
  store?: AccountMirrorReconciliationCampaignStore | null;
  now?: () => Date;
  generateId?: () => string;
}): AccountMirrorReconciliationCampaignService {
  const now = input.now ?? (() => new Date());
  const generateId = input.generateId ?? (() => `acctmirror_reconciliation_${randomUUID()}`);

  return {
    async create(request = {}) {
      const dryRun = request.dryRun !== false;
      await input.registry.refreshPersistentState?.();
      const createdAt = now().toISOString();
      const policy = normalizePolicy(request);
      const filters = {
        provider: request.provider ?? null,
        runtimeProfileId: normalizeOptionalString(request.runtimeProfileId),
        identity: normalizeOptionalIdentity(request.identity),
        includeDisabled: request.includeDisabled === true,
        maxTargets: normalizePositiveInteger(request.maxTargets, 500),
        maxActiveTargets: normalizePositiveInteger(request.maxActiveTargets, 100),
      };
      const activeCompletions = input.completionService.list({
        provider: filters.provider,
        runtimeProfileId: filters.runtimeProfileId,
        status: 'active',
        limit: null,
      });
      const activeByTarget = new Map(
        activeCompletions.map((operation) => [createTargetKey(operation), operation]),
      );
      const status = input.registry.readStatus({
        provider: filters.provider,
        runtimeProfileId: filters.runtimeProfileId,
        explicitRefresh: true,
        ignoreMinimumInterval: true,
      });
      const candidateTargets = status.entries
        .filter((entry) => matchesIdentityFilter(entry, filters.identity))
        .map((entry) => createTargetPlan(entry, activeByTarget.get(createTargetKey(entry)) ?? null, policy));
      const orderedTargets = candidateTargets.sort(compareTargetsForPlanning);
      const selectedLimit = resolveTargetSelectionLimit(filters);
      let selectedCount = 0;
      let targets: AccountMirrorReconciliationTarget[] = orderedTargets.map((target) => {
        if (!dryRun && target.state === 'already_active' && selectedCount < selectedLimit) {
          selectedCount += 1;
          return attachOrUpgradeActiveTarget(
            {
              ...target,
              selected: true,
              reason: 'Attached to existing active completion for this target.',
            },
            activeByTarget.get(createTargetKey(target)) ?? null,
            policy,
            createdAt,
            'create',
          );
        }
        if (target.state !== 'eligible') {
          return dryRun ? target : withTargetExecution(target, {
            status: 'skipped',
            reason: target.reason,
            updatedAt: createdAt,
          });
        }
        if (selectedCount >= selectedLimit) {
          return withTargetExecution(
            {
              ...target,
              selected: false,
              reason: 'Eligible but outside the requested campaign target budget.',
            },
            {
              status: dryRun ? 'not_started' : 'skipped',
              reason: 'Eligible but outside the requested campaign target budget.',
              updatedAt: dryRun ? null : createdAt,
            },
          );
        }
        selectedCount += 1;
        return {
          ...target,
          selected: true,
          reason: dryRun
            ? 'Eligible for dry-run full-sweep reconciliation planning.'
            : 'Eligible for full-sweep reconciliation execution.',
        };
      });
      if (!dryRun) {
        targets = startSelectedEligibleTargets(targets, policy, filters, createdAt);
        targets = await refreshTargetsFromChildren(targets, createdAt);
      }
      const campaignStatus = dryRun ? 'planned' : deriveCampaignStatus(targets);
      const completedAt = dryRun || isActiveCampaignStatus(campaignStatus) ? null : createdAt;
      const campaign: AccountMirrorReconciliationCampaign = {
        object: 'account_mirror_reconciliation_campaign',
        id: generateId(),
        dryRun,
        status: campaignStatus,
        createdAt,
        updatedAt: createdAt,
        completedAt,
        filters,
        policy,
        metrics: buildMetrics(targets),
        targets,
        events: [{
          at: createdAt,
          type: dryRun ? 'planned' : 'started',
          message: dryRun
            ? 'Planned account-mirror reconciliation campaign without starting browser work.'
            : 'Started account-mirror reconciliation campaign for selected targets.',
        }],
      };
      await input.store?.writeCampaign(campaign, { persistedAt: createdAt });
      return campaign;
    },
    async read(id) {
      const campaign = await input.store?.readCampaign(id);
      if (!campaign) return null;
      return refreshAndPersistCampaign(campaign, { advance: true });
    },
    async list(request = {}) {
      const campaigns = await input.store?.listCampaigns({
        status: request.status,
        limit: request.limit,
      }) ?? [];
      const refreshed = await Promise.all(campaigns.map((campaign) => refreshAndPersistCampaign(campaign, { advance: true })));
      return refreshed.filter((campaign): campaign is AccountMirrorReconciliationCampaign => campaign !== null);
    },
    async control(request) {
      const current = await refreshAndPersistCampaign(await input.store?.readCampaign(request.id) ?? null, { advance: false });
      if (!current) return null;
      if (request.action === 'run_next_pass') {
        const advanced = await advanceAndPersistCampaign(current, {
          type: 'operator_run_next_pass',
          message: 'Advanced the account-mirror reconciliation campaign to the next eligible target pass.',
        });
        return advanced;
      }
      if (request.action === 'cancel' && !isTerminalCampaignStatus(current.status)) {
        controlChildCompletions(current, 'cancel');
        const updated = withCampaignEvent(current, {
          status: 'cancelled',
          completedAt: now().toISOString(),
          type: 'operator_cancelled',
          message: 'Cancelled account-mirror reconciliation campaign by operator request.',
        });
        await input.store?.writeCampaign(updated, { persistedAt: updated.updatedAt });
        return updated;
      }
      if (request.action === 'pause' && isActiveCampaignStatus(current.status)) {
        controlChildCompletions(current, 'pause');
        const updated = withCampaignEvent(current, {
          status: 'paused',
          completedAt: null,
          type: 'operator_paused',
          message: 'Paused account-mirror reconciliation campaign by operator request.',
        });
        await input.store?.writeCampaign(updated, { persistedAt: updated.updatedAt });
        return updated;
      }
      if (request.action === 'resume' && current.status === 'paused') {
        controlChildCompletions(current, 'resume');
        const updated = withCampaignEvent(current, {
          status: 'queued',
          completedAt: null,
          type: 'operator_resumed',
          message: 'Resumed account-mirror reconciliation campaign by operator request.',
        });
        await input.store?.writeCampaign(updated, { persistedAt: updated.updatedAt });
        return updated;
      }
      return current;
    },
    async recoverActiveCampaigns() {
      const campaigns = await input.store?.listCampaigns({
        status: 'active',
        limit: null,
      }) ?? [];
      const recovered = await Promise.all(campaigns.map((campaign) => refreshAndPersistCampaign(campaign, { advance: true })));
      return recovered.filter((campaign): campaign is AccountMirrorReconciliationCampaign => campaign !== null);
    },
  };

  function startSelectedEligibleTargets(
    targets: AccountMirrorReconciliationTarget[],
    policy: AccountMirrorReconciliationCampaign['policy'],
    filters: AccountMirrorReconciliationCampaign['filters'],
    at: string,
  ): AccountMirrorReconciliationTarget[] {
    return advanceSelectedTargets(targets, policy, filters, at);
  }

  function advanceSelectedTargets(
    targets: AccountMirrorReconciliationTarget[],
    policy: AccountMirrorReconciliationCampaign['policy'],
    filters: AccountMirrorReconciliationCampaign['filters'],
    at: string,
  ): AccountMirrorReconciliationTarget[] {
    const activeBrowserProfiles = new Set<string>();
    const activeProviderCounts = new Map<AccountMirrorProvider, number>();
    let activeTargetCount = 0;
    const maxActiveTargets = filters.maxActiveTargets ?? Number.POSITIVE_INFINITY;
    const activeCompletions = input.completionService.list({
      provider: filters.provider,
      runtimeProfileId: filters.runtimeProfileId,
      status: 'active',
      limit: null,
    });
    const activeByTarget = new Map(
      activeCompletions.map((operation) => [createTargetKey(operation), operation]),
    );
    const attached = targets.map((target) => {
      if (!target.selected) return target;
      if (target.childOperations.completionId && !isTerminalTargetExecution(target.execution.status)) {
        const operation = activeByTarget.get(createTargetKey(target));
        if (
          !operation ||
          operation.id !== target.childOperations.completionId ||
          completionSatisfiesCampaignPolicy(operation, policy) ||
          !input.completionService.upgradePolicy
        ) {
          return target;
        }
        return attachOrUpgradeActiveTarget(target, operation, policy, at, 'advancement');
      }
      const operation = activeByTarget.get(createTargetKey(target));
      if (!operation || operation.id === target.childOperations.completionId) return target;
      return attachOrUpgradeActiveTarget(target, operation, policy, at, 'advancement');
    });
    for (const target of attached) {
      if (!target.selected || !isActiveTargetExecution(target.execution.status)) continue;
      if (target.browserProfileId) activeBrowserProfiles.add(target.browserProfileId);
      activeProviderCounts.set(target.provider, (activeProviderCounts.get(target.provider) ?? 0) + 1);
      activeTargetCount += 1;
    }
    return attached.map((target) => {
      if (!target.selected || target.state !== 'eligible' || target.childOperations.completionId) return target;
      if (activeTargetCount >= maxActiveTargets) {
        return withTargetExecution(target, {
          status: 'deferred',
          reason: 'Deferred by campaign active-target budget.',
          updatedAt: at,
        });
      }
      if (target.browserProfileId && activeBrowserProfiles.has(target.browserProfileId)) {
        return withTargetExecution(
          {
            ...target,
            reason: 'Eligible but deferred because another selected target owns this browser profile budget.',
          },
          {
            status: 'deferred',
            reason: 'Deferred by browser profile concurrency budget.',
            updatedAt: at,
          },
        );
      }
      const providerActiveCount = activeProviderCounts.get(target.provider) ?? 0;
      if (providerActiveCount >= 1) {
        return withTargetExecution(
          {
            ...target,
            reason: 'Eligible but deferred because another selected target owns this provider concurrency budget.',
          },
          {
            status: 'deferred',
            reason: 'Deferred by provider concurrency budget.',
            updatedAt: at,
          },
        );
      }
      const operation = input.completionService.start({
        provider: target.provider,
        runtimeProfileId: target.runtimeProfileId,
        maxPasses: 1,
        sweepMode: policy.sweepMode,
        materializationPolicy: policy.materializationPolicy,
        materializationAssetKinds: policy.materializationAssetKinds,
        materializationMaxItems: policy.materializationMaxItems,
        materializationRefreshSnapshot: true,
      });
      if (target.browserProfileId) activeBrowserProfiles.add(target.browserProfileId);
      activeProviderCounts.set(target.provider, providerActiveCount + 1);
      activeTargetCount += 1;
      return withTargetExecution(
        {
          ...target,
          activeCompletionId: operation.id,
          childOperations: {
            completionId: operation.id,
            materializationJobId: operation.materializationCursor?.jobId ?? null,
          },
        },
        {
          status: mapCompletionStatusToTargetExecutionStatus(operation.status),
          reason: 'Started bounded full-sweep account-mirror completion for this target.',
          updatedAt: at,
          operation,
        },
      );
    });
  }

  async function refreshTargetsFromChildren(
    targets: AccountMirrorReconciliationTarget[],
    at: string,
  ): Promise<AccountMirrorReconciliationTarget[]> {
    return Promise.all(targets.map(async (target) => {
      const completionId = target.childOperations.completionId;
      if (!completionId) return target;
      const operation = input.completionService.read(completionId);
      if (!operation) {
        return withTargetExecution(target, {
          status: target.execution.status === 'attached' || target.execution.status === 'queued' || target.execution.status === 'running'
            ? 'failed'
            : target.execution.status,
          reason: `Child completion ${completionId} is no longer available.`,
          updatedAt: at,
        });
      }
      return refreshMaterializationEvidence(withTargetExecution(
        {
          ...target,
          activeCompletionId: isActiveCompletion(operation) ? operation.id : target.activeCompletionId,
          childOperations: {
            completionId: operation.id,
            materializationJobId: operation.materializationCursor?.jobId ?? target.childOperations.materializationJobId,
          },
          mirrorCompleteness: operation.mirrorCompleteness ?? target.mirrorCompleteness,
        },
        {
          status: mapCompletionStatusToTargetExecutionStatus(operation.status),
          reason: describeCompletionExecution(operation),
          updatedAt: at,
          operation,
        },
      ));
    }));
  }

  async function refreshMaterializationEvidence(
    target: AccountMirrorReconciliationTarget,
  ): Promise<AccountMirrorReconciliationTarget> {
    const jobId = target.childOperations.materializationJobId;
    if (!jobId || !input.materializationJobReader) return target;
    const job = await input.materializationJobReader.readJob(jobId).catch(() => null);
    if (!job) return target;
    const summary = summarizeMaterializationJob(job, target);
    return {
      ...target,
      execution: {
        ...target.execution,
        materializationJobStatus: summary.status ?? target.execution.materializationJobStatus,
        materializationMetrics: summary.metrics,
        materializedAssets: summary.assets,
        terminalRouteability: summary.terminalRouteability,
      },
    };
  }

  function attachOrUpgradeActiveTarget(
    target: AccountMirrorReconciliationTarget,
    operation: AccountMirrorCompletionOperation | null,
    policy: AccountMirrorReconciliationCampaign['policy'],
    at: string,
    source: 'create' | 'advancement',
  ): AccountMirrorReconciliationTarget {
    if (!operation) {
      return withTargetExecution(target, {
        status: 'attached',
        reason: 'Target was marked already active but the active completion record is no longer available.',
        updatedAt: at,
      });
    }
    let attachedOperation = operation;
    let reason = source === 'create'
      ? 'Target already had an active completion; campaign attached without duplicating it.'
      : 'Attached to existing active completion for this target during campaign advancement.';
    if (!completionSatisfiesCampaignPolicy(operation, policy) && input.completionService.upgradePolicy) {
      attachedOperation = input.completionService.upgradePolicy({
        id: operation.id,
        maxPasses: 1,
        sweepMode: policy.sweepMode,
        materializationPolicy: policy.materializationPolicy,
        materializationAssetKinds: policy.materializationAssetKinds,
        materializationMaxItems: policy.materializationMaxItems,
        materializationRefreshSnapshot: true,
      }) ?? operation;
      reason = 'Claimed existing active completion for campaign full-sweep materialization policy.';
    }
    return withTargetExecution(
      resetMaterializationEvidenceWhenChildChanges({
        ...target,
        activeCompletionId: attachedOperation.id,
        childOperations: {
          completionId: attachedOperation.id,
          materializationJobId: attachedOperation.materializationCursor?.jobId ?? null,
        },
      }, target, attachedOperation),
      {
        status: mapCompletionStatusToTargetExecutionStatus(attachedOperation.status),
        reason,
        updatedAt: at,
        operation: attachedOperation,
      },
    );
  }

  async function refreshAndPersistCampaign(
    campaign: AccountMirrorReconciliationCampaign | null,
    options: { advance?: boolean } = {},
  ): Promise<AccountMirrorReconciliationCampaign | null> {
    if (!campaign || campaign.dryRun || !input.store) return campaign;
    const refreshedAt = now().toISOString();
    let targets = await refreshTargetsFromChildren(campaign.targets, refreshedAt);
    if (options.advance === true && canAdvanceCampaign(campaign)) {
      targets = advanceSelectedTargets(targets, campaign.policy, campaign.filters, refreshedAt);
      targets = await refreshTargetsFromChildren(targets, refreshedAt);
    }
    const status = deriveCampaignStatus(targets);
    const completedAt = isActiveCampaignStatus(status) ? null : (campaign.completedAt ?? refreshedAt);
    const changed = status !== campaign.status ||
      completedAt !== campaign.completedAt ||
      targetsChanged(campaign.targets, targets);
    if (!changed) return campaign;
    const next: AccountMirrorReconciliationCampaign = {
      ...campaign,
      status,
      completedAt,
      updatedAt: refreshedAt,
      metrics: buildMetrics(targets),
      targets,
      events: campaign.events,
    };
    await input.store.writeCampaign(next, { persistedAt: refreshedAt });
    return next;
  }

  async function advanceAndPersistCampaign(
    campaign: AccountMirrorReconciliationCampaign,
    event: {
      type: string;
      message: string;
    },
  ): Promise<AccountMirrorReconciliationCampaign> {
    const at = now().toISOString();
    let targets = advanceSelectedTargets(campaign.targets, campaign.policy, campaign.filters, at);
    targets = await refreshTargetsFromChildren(targets, at);
    const status = deriveCampaignStatus(targets);
    const completedAt = isActiveCampaignStatus(status) ? null : (campaign.completedAt ?? at);
    const next: AccountMirrorReconciliationCampaign = {
      ...campaign,
      status,
      completedAt,
      updatedAt: at,
      metrics: buildMetrics(targets),
      targets,
      events: [...campaign.events, { at, type: event.type, message: event.message }].slice(-20),
    };
    await input.store?.writeCampaign(next, { persistedAt: at });
    return next;
  }

  function controlChildCompletions(
    campaign: AccountMirrorReconciliationCampaign,
    action: 'pause' | 'resume' | 'cancel',
  ): void {
    for (const target of campaign.targets) {
      const completionId = target.childOperations.completionId;
      if (!completionId) continue;
      input.completionService.control({ id: completionId, action });
    }
  }

  function withCampaignEvent(
    campaign: AccountMirrorReconciliationCampaign,
    event: {
      status: AccountMirrorReconciliationCampaignStatus;
      completedAt: string | null;
      type: string;
      message: string;
    },
  ): AccountMirrorReconciliationCampaign {
    const at = now().toISOString();
    return {
      ...campaign,
      status: event.status,
      updatedAt: at,
      completedAt: event.completedAt,
      events: [...campaign.events, { at, type: event.type, message: event.message }].slice(-20),
    };
  }
}

function resetMaterializationEvidenceWhenChildChanges(
  nextTarget: AccountMirrorReconciliationTarget,
  previousTarget: AccountMirrorReconciliationTarget,
  operation: AccountMirrorCompletionOperation,
): AccountMirrorReconciliationTarget {
  const nextJobId = operation.materializationCursor?.jobId ?? null;
  if (
    previousTarget.childOperations.completionId === operation.id &&
    previousTarget.childOperations.materializationJobId === nextJobId
  ) {
    return nextTarget;
  }
  return {
    ...nextTarget,
    execution: {
      ...nextTarget.execution,
      materializationJobStatus: operation.materializationCursor?.jobStatus ?? null,
      materializationMetrics: null,
      materializedAssets: [],
      terminalRouteability: null,
    },
  };
}

export class AccountMirrorReconciliationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AccountMirrorReconciliationError';
  }
}

function createTargetPlan(
  entry: AccountMirrorStatusEntry,
  activeCompletion: AccountMirrorCompletionOperation | null,
  policy: AccountMirrorReconciliationCampaign['policy'],
): AccountMirrorReconciliationTarget {
  const state = classifyTarget(entry, activeCompletion);
  return {
    object: 'account_mirror_reconciliation_target',
    key: createTargetKey(entry),
    tenantKey: entry.tenantKey,
    bindingKey: entry.bindingKey,
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    browserProfileId: entry.browserProfileId,
    expectedIdentityKey: entry.expectedIdentityKey,
    detectedIdentityKey: entry.detectedIdentityKey,
    accountLevel: entry.accountLevel,
    liveFollowState: entry.liveFollow,
    state,
    selected: false,
    reason: describeTargetState(entry, state, activeCompletion),
    nextEligibleAt: entry.eligibleAt,
    activeCompletionId: activeCompletion?.id ?? null,
    mirrorCompleteness: entry.mirrorCompleteness,
    metadataCounts: entry.metadataCounts,
    policy: {
      sweepMode: policy.sweepMode,
      materializationPolicy: policy.materializationPolicy,
      materializationAssetKinds: policy.materializationAssetKinds,
      materializationMaxItems: policy.materializationMaxItems,
    },
    childOperations: {
      completionId: activeCompletion?.id ?? null,
      materializationJobId: activeCompletion?.materializationCursor?.jobId ?? null,
    },
    execution: {
      status: activeCompletion ? 'attached' : 'not_started',
      reason: activeCompletion
        ? 'Target has an existing active completion.'
        : 'Target has not been started by this campaign.',
      updatedAt: null,
      completionStatus: activeCompletion?.status ?? null,
      passCount: activeCompletion?.passCount ?? null,
      materializationJobStatus: activeCompletion?.materializationCursor?.jobStatus ?? null,
      materializationMetrics: null,
      materializedAssets: [],
      terminalRouteability: null,
      remainingDetailSurfaces: activeCompletion?.mirrorCompleteness?.remainingDetailSurfaces ?? entry.mirrorCompleteness.remainingDetailSurfaces,
      nextEligibleAt: activeCompletion?.nextAttemptAt ?? entry.eligibleAt,
    },
  };
}

function classifyTarget(
  entry: AccountMirrorStatusEntry,
  activeCompletion: AccountMirrorCompletionOperation | null,
): AccountMirrorReconciliationTargetState {
  if (entry.liveFollow.state === 'disabled') return 'disabled';
  if (entry.liveFollow.state === 'unconfigured') return 'unconfigured';
  if (entry.liveFollow.state === 'unsupported') return 'unsupported_provider';
  if (entry.liveFollow.state === 'missing_identity') return 'missing_identity';
  if (entry.reason === 'identity-mismatch') return 'identity_mismatch';
  if (entry.providerGuard.state === 'manual_clear_required') return 'provider_guard';
  if (activeCompletion) return 'already_active';
  if (entry.providerGuard.state === 'cooldown' || entry.status === 'delayed') return 'cooldown_wait';
  if (entry.mirrorState.running || entry.mirrorState.queued) return 'foreground_backpressure';
  return entry.status === 'eligible' ? 'eligible' : 'cooldown_wait';
}

function describeTargetState(
  entry: AccountMirrorStatusEntry,
  state: AccountMirrorReconciliationTargetState,
  activeCompletion: AccountMirrorCompletionOperation | null,
): string {
  if (state === 'eligible') return 'Eligible under current account-mirror status and provider guard state.';
  if (state === 'disabled') return entry.liveFollow.reason;
  if (state === 'unconfigured') return entry.liveFollow.reason;
  if (state === 'unsupported_provider') return entry.liveFollow.reason;
  if (state === 'missing_identity') return entry.liveFollow.reason;
  if (state === 'identity_mismatch') return 'Detected provider identity does not match the configured bound identity.';
  if (state === 'provider_guard') return entry.providerGuard.summary ?? 'Provider guard requires operator clearance.';
  if (state === 'already_active') return `Target already has an active completion${activeCompletion?.id ? ` (${activeCompletion.id})` : ''}.`;
  if (state === 'foreground_backpressure') return 'Target has queued or running mirror state and will not be duplicated.';
  return entry.eligibleAt
    ? `Target is waiting for provider/account politeness until ${entry.eligibleAt}.`
    : `Target is not eligible now: ${entry.reason}.`;
}

function withTargetExecution(
  target: AccountMirrorReconciliationTarget,
  patch: {
    status: AccountMirrorReconciliationTargetExecutionStatus;
    reason: string;
    updatedAt: string | null;
    operation?: AccountMirrorCompletionOperation | null;
  },
): AccountMirrorReconciliationTarget {
  const operation = patch.operation ?? null;
  return {
    ...target,
    execution: {
      ...target.execution,
      status: patch.status,
      reason: patch.reason,
      updatedAt: patch.updatedAt,
      completionStatus: operation?.status ?? target.execution.completionStatus,
      passCount: operation?.passCount ?? target.execution.passCount,
      materializationJobStatus: operation?.materializationCursor?.jobStatus ?? target.execution.materializationJobStatus,
      remainingDetailSurfaces: operation?.mirrorCompleteness?.remainingDetailSurfaces ?? target.execution.remainingDetailSurfaces,
      nextEligibleAt: operation?.nextAttemptAt ?? target.nextEligibleAt,
    },
  };
}

function mapCompletionStatusToTargetExecutionStatus(
  status: AccountMirrorCompletionOperation['status'],
): AccountMirrorReconciliationTargetExecutionStatus {
  if (status === 'queued') return 'queued';
  if (status === 'running') return 'running';
  if (status === 'idle_waiting') return 'idle_waiting';
  if (status === 'paused') return 'paused';
  if (status === 'completed') return 'completed';
  if (status === 'blocked') return 'blocked';
  if (status === 'failed') return 'failed';
  return 'cancelled';
}

function describeCompletionExecution(operation: AccountMirrorCompletionOperation): string {
  if (operation.status === 'queued') return 'Child completion is queued.';
  if (operation.status === 'running') return 'Child completion is running.';
  if (operation.status === 'idle_waiting') return 'Child completion is waiting for the next eligible attempt.';
  if (operation.status === 'paused') return 'Child completion is paused by operator control.';
  if (operation.status === 'completed') return 'Child completion completed.';
  if (operation.status === 'blocked') return operation.error?.message ?? 'Child completion is blocked.';
  if (operation.status === 'failed') return operation.error?.message ?? 'Child completion failed.';
  return 'Child completion was cancelled.';
}

function completionSatisfiesCampaignPolicy(
  operation: AccountMirrorCompletionOperation,
  policy: AccountMirrorReconciliationCampaign['policy'],
): boolean {
  if (operation.mode !== 'bounded' || operation.maxPasses === null) return false;
  if ((operation.sweepMode ?? 'steady_follow') !== policy.sweepMode) return false;
  if (readOperationMaterializationPolicy(operation) !== policy.materializationPolicy) return false;
  if (!materializationAssetKindsEqual(operation.materializationAssetKinds ?? ['all'], policy.materializationAssetKinds)) return false;
  if ((operation.materializationMaxItems ?? null) !== policy.materializationMaxItems) return false;
  if (policy.materializationPolicy !== 'metadata_only' && operation.materializationRefreshSnapshot !== true) return false;
  return true;
}

function readOperationMaterializationPolicy(
  operation: AccountMirrorCompletionOperation,
): AccountMirrorCompletionMaterializationPolicy {
  if (
    operation.materializationPolicy === 'metadata_only' ||
    operation.materializationPolicy === 'recent_missing_assets' ||
    operation.materializationPolicy === 'full_missing_assets'
  ) {
    return operation.materializationPolicy;
  }
  return operation.sweepMode === 'full_sweep' ? 'full_missing_assets' : 'metadata_only';
}

function materializationAssetKindsEqual(
  left: AccountMirrorCompletionMaterializationAssetKind[],
  right: AccountMirrorCompletionMaterializationAssetKind[],
): boolean {
  const normalizedLeft = normalizeMaterializationAssetKinds(left);
  const normalizedRight = normalizeMaterializationAssetKinds(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
}

function deriveCampaignStatus(
  targets: AccountMirrorReconciliationTarget[],
): AccountMirrorReconciliationCampaignStatus {
  const selected = targets.filter((target) => target.selected);
  if (selected.length === 0) return 'completed_with_skips';
  const statuses = selected.map((target) => target.execution.status);
  if (selected.some((target) => isActiveMaterializationJobStatus(target.execution.materializationJobStatus))) return 'running';
  if (statuses.some((status) => status === 'running' || status === 'attached' || status === 'queued')) return 'running';
  if (statuses.some((status) => status === 'idle_waiting')) return 'idle_waiting';
  if (statuses.some((status) => status === 'paused')) return 'paused';
  if (statuses.some((status) => status === 'deferred' || status === 'not_started')) return 'queued';
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled';
  if (statuses.some((status) => status === 'failed')) return statuses.some((status) => status === 'completed') ? 'completed_with_skips' : 'failed';
  if (statuses.some((status) => status === 'blocked' || status === 'skipped')) return 'completed_with_skips';
  return 'completed';
}

function isActiveCompletion(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running' || operation.status === 'idle_waiting' || operation.status === 'paused';
}

function isActiveTargetExecution(status: AccountMirrorReconciliationTargetExecutionStatus): boolean {
  return status === 'attached' || status === 'queued' || status === 'running' || status === 'idle_waiting' || status === 'paused';
}

function isTerminalTargetExecution(status: AccountMirrorReconciliationTargetExecutionStatus): boolean {
  return status === 'completed' || status === 'blocked' || status === 'failed' || status === 'cancelled' || status === 'skipped';
}

function canAdvanceCampaign(
  campaign: AccountMirrorReconciliationCampaign,
): boolean {
  if (campaign.status === 'paused' || isTerminalCampaignStatus(campaign.status)) return false;
  return true;
}

function targetsChanged(
  left: AccountMirrorReconciliationTarget[],
  right: AccountMirrorReconciliationTarget[],
): boolean {
  if (left.length !== right.length) return true;
  return left.some((target, index) => {
    const next = right[index];
    if (!next) return true;
    return target.activeCompletionId !== next.activeCompletionId ||
      target.selected !== next.selected ||
      target.reason !== next.reason ||
      target.childOperations.completionId !== next.childOperations.completionId ||
      target.childOperations.materializationJobId !== next.childOperations.materializationJobId ||
      target.execution.status !== next.execution.status ||
      target.execution.completionStatus !== next.execution.completionStatus ||
      target.execution.passCount !== next.execution.passCount ||
      target.execution.materializationJobStatus !== next.execution.materializationJobStatus ||
      JSON.stringify(target.execution.materializationMetrics) !== JSON.stringify(next.execution.materializationMetrics) ||
      JSON.stringify(target.execution.materializedAssets) !== JSON.stringify(next.execution.materializedAssets) ||
      JSON.stringify(target.execution.terminalRouteability) !== JSON.stringify(next.execution.terminalRouteability) ||
      target.execution.reason !== next.execution.reason ||
      target.execution.nextEligibleAt !== next.execution.nextEligibleAt;
  });
}

function compareTargetsForPlanning(
  left: AccountMirrorReconciliationTarget,
  right: AccountMirrorReconciliationTarget,
): number {
  return targetPlanningRank(left) - targetPlanningRank(right)
    || mirrorCompletenessRank(left) - mirrorCompletenessRank(right)
    || lastWorkRank(left.nextEligibleAt) - lastWorkRank(right.nextEligibleAt)
    || left.provider.localeCompare(right.provider)
    || left.runtimeProfileId.localeCompare(right.runtimeProfileId)
    || left.key.localeCompare(right.key);
}

function targetPlanningRank(target: AccountMirrorReconciliationTarget): number {
  if (target.state === 'eligible') return 0;
  if (target.state === 'already_active') return 1;
  if (target.state === 'cooldown_wait') return 2;
  if (target.state === 'provider_guard') return 3;
  if (target.state === 'identity_mismatch') return 4;
  if (target.state === 'missing_identity') return 5;
  if (target.state === 'unsupported_provider') return 6;
  if (target.state === 'disabled') return 7;
  if (target.state === 'unconfigured') return 8;
  return 9;
}

function mirrorCompletenessRank(target: AccountMirrorReconciliationTarget): number {
  if (target.mirrorCompleteness.state === 'none') return 0;
  if (target.mirrorCompleteness.state === 'in_progress') return 1;
  if (target.mirrorCompleteness.state === 'unknown') return 2;
  return 3;
}

function lastWorkRank(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildMetrics(targets: AccountMirrorReconciliationTarget[]): AccountMirrorReconciliationCampaign['metrics'] {
  const targetStates = emptyTargetStateCounts();
  const byProvider = {
    chatgpt: emptyProviderMetrics(),
    gemini: emptyProviderMetrics(),
    grok: emptyProviderMetrics(),
  };
  const materialization = emptyMaterializationMetrics();
  let selectedTargets = 0;
  for (const target of targets) {
    targetStates[target.state] += 1;
    byProvider[target.provider].totalTargets += 1;
    byProvider[target.provider].targetStates[target.state] += 1;
    if (target.selected) {
      selectedTargets += 1;
      byProvider[target.provider].selectedTargets += 1;
    }
    if (target.childOperations.materializationJobId) {
      materialization.jobs += 1;
      if (isActiveMaterializationJobStatus(target.execution.materializationJobStatus)) {
        materialization.activeJobs += 1;
      } else if (target.execution.materializationJobStatus) {
        materialization.terminalJobs += 1;
      }
    }
    if (target.execution.materializationMetrics) {
      materialization.conversations += target.execution.materializationMetrics.conversations;
      materialization.materialized += target.execution.materializationMetrics.materialized;
      materialization.skipped += target.execution.materializationMetrics.skipped;
      materialization.failed += target.execution.materializationMetrics.failed;
      materialization.archiveItems += target.execution.materializationMetrics.archiveItems;
      materialization.checksummedAssets += target.execution.materializationMetrics.checksummedAssets;
    }
    if (target.execution.terminalRouteability) {
      materialization.terminalUnavailableConversations += target.execution.terminalRouteability.notFoundOrUnavailable;
      materialization.guardedConversations += target.execution.terminalRouteability.guarded;
      materialization.identityMismatchConversations += target.execution.terminalRouteability.identityMismatch;
    }
  }
  return {
    totalTargets: targets.length,
    selectedTargets,
    targetStates,
    byProvider,
    materialization,
  };
}

function emptyProviderMetrics(): AccountMirrorReconciliationCampaign['metrics']['byProvider'][AccountMirrorProvider] {
  return {
    totalTargets: 0,
    selectedTargets: 0,
    targetStates: emptyTargetStateCounts(),
  };
}

function emptyTargetStateCounts(): Record<AccountMirrorReconciliationTargetState, number> {
  return Object.fromEntries(TARGET_STATES.map((state) => [state, 0])) as Record<AccountMirrorReconciliationTargetState, number>;
}

function emptyMaterializationMetrics(): AccountMirrorReconciliationCampaign['metrics']['materialization'] {
  return {
    jobs: 0,
    activeJobs: 0,
    terminalJobs: 0,
    conversations: 0,
    materialized: 0,
    skipped: 0,
    failed: 0,
    archiveItems: 0,
    checksummedAssets: 0,
    terminalUnavailableConversations: 0,
    guardedConversations: 0,
    identityMismatchConversations: 0,
  };
}

function summarizeMaterializationJob(
  job: unknown,
  fallbackTarget: AccountMirrorReconciliationTarget,
): {
  status: string | null;
  metrics: AccountMirrorReconciliationMaterializationMetrics;
  assets: AccountMirrorReconciliationMaterializedAssetEvidence[];
  terminalRouteability: AccountMirrorReconciliationTerminalRouteabilityMetrics;
} {
  const record = isRecord(job) ? job : {};
  const result = isRecord(record.result) ? record.result : {};
  const hasResultTarget = isRecord(result.target);
  const target: Record<string, unknown> = hasResultTarget ? result.target as Record<string, unknown> : {};
  const entries = readArray(result.entries).filter(isRecord);
  const archiveItems = readArray(result.archiveItems).filter(isRecord);
  const assets = materializedAssetEvidenceFromJobResult({
    entries,
    archiveItems,
    resultTarget: target,
    fallbackTarget,
  });
  const metrics = isRecord(result.metrics) ? result.metrics : {};
  const materializationMetrics: AccountMirrorReconciliationMaterializationMetrics = {
    conversations: readNumber(metrics.conversations) ?? (hasResultTarget ? 1 : 0),
    materialized: readNumber(metrics.materialized) ?? entries.filter((entry) => readString(entry.status) === 'materialized').length,
    skipped: readNumber(metrics.skipped) ?? entries.filter((entry) => readString(entry.status) === 'skipped').length,
    failed: readNumber(metrics.failed) ?? entries.filter((entry) => readString(entry.status) === 'failed').length,
    archiveItems: archiveItems.length,
    checksummedAssets: assets.filter((asset) => Boolean(asset.checksumSha256)).length,
  };
  return {
    status: readString(record.status),
    metrics: materializationMetrics,
    assets,
    terminalRouteability: summarizeTerminalRouteability(result),
  };
}

function materializedAssetEvidenceFromJobResult(input: {
  entries: Record<string, unknown>[];
  archiveItems: Record<string, unknown>[];
  resultTarget: Record<string, unknown>;
  fallbackTarget: AccountMirrorReconciliationTarget;
}): AccountMirrorReconciliationMaterializedAssetEvidence[] {
  const assets: AccountMirrorReconciliationMaterializedAssetEvidence[] = [];
  const seen = new Set<string>();
  const archiveItemById = new Map(
    input.archiveItems
      .map((item) => [readString(item.id), item] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])),
  );
  const addAsset = (asset: AccountMirrorReconciliationMaterializedAssetEvidence) => {
    const key = asset.archiveItemId
      ?? asset.checksumSha256
      ?? asset.cacheKey
      ?? asset.providerId
      ?? `${asset.kind ?? 'unknown'}:${asset.title ?? assets.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push(asset);
  };
  for (const entry of input.entries) {
    const archiveItem = archiveItemById.get(readString(entry.archiveItemId) ?? '') ?? null;
    addAsset({
      kind: readString(entry.kind),
      providerConversationId: readString(archiveItem?.providerConversationId) ?? fallbackProviderConversationId(input.resultTarget, input.fallbackTarget),
      boundIdentityKey: readString(archiveItem?.boundIdentityKey) ?? fallbackBoundIdentityKey(input.resultTarget, input.fallbackTarget),
      providerId: readString(entry.providerId),
      title: readString(entry.title),
      checksumSha256: readString(entry.checksumSha256),
      cacheKey: readString(entry.cacheKey),
      archiveItemId: readString(entry.archiveItemId),
      assetRoute: readString(entry.assetRoute),
      status: readString(entry.status),
    });
  }
  for (const item of input.archiveItems) {
    const links = isRecord(item.links) ? item.links : {};
    addAsset({
      kind: readString(item.kind),
      providerConversationId: readString(item.providerConversationId) ?? fallbackProviderConversationId(input.resultTarget, input.fallbackTarget),
      boundIdentityKey: readString(item.boundIdentityKey) ?? fallbackBoundIdentityKey(input.resultTarget, input.fallbackTarget),
      providerId: readString(item.artifactId),
      title: readString(item.title),
      checksumSha256: readString(item.checksumSha256),
      cacheKey: readString(item.cacheKey),
      archiveItemId: readString(item.id),
      assetRoute: readString(links.asset) ?? readString(links.self),
      status: readString(item.status),
    });
  }
  return assets.slice(0, 50);
}

function summarizeTerminalRouteability(
  result: Record<string, unknown>,
): AccountMirrorReconciliationTerminalRouteabilityMetrics {
  const metrics: AccountMirrorReconciliationTerminalRouteabilityMetrics = {
    notFoundOrUnavailable: 0,
    guarded: 0,
    identityMismatch: 0,
    authConflict: 0,
    failed: 0,
  };
  const refreshes = [
    ...readArray(result.snapshotRefreshes).filter(isRecord),
  ];
  const phases = isRecord(result.phases) ? result.phases : {};
  const phaseRefresh = isRecord(phases.snapshotRefresh) ? phases.snapshotRefresh : null;
  if (phaseRefresh) refreshes.push(phaseRefresh);
  const seenRefreshes = new Set<string>();
  for (const refresh of refreshes) {
    const refreshKey = [
      readString(refresh.generatedAt),
      readString(refresh.status),
      readString(refresh.routeabilityState),
      readString(isRecord(refresh.target) ? refresh.target.conversationId : null),
      readString(refresh.error) ?? readString(refresh.message),
    ].join('|');
    if (seenRefreshes.has(refreshKey)) continue;
    seenRefreshes.add(refreshKey);
    const routeabilityState = readString(refresh.routeabilityState);
    if (routeabilityState === 'not_found_or_unavailable') metrics.notFoundOrUnavailable += 1;
    if (routeabilityState === 'guarded') metrics.guarded += 1;
    if (routeabilityState === 'identity_mismatch') metrics.identityMismatch += 1;
    if (routeabilityState === 'auth_conflict') metrics.authConflict += 1;
    if (readString(refresh.status) === 'failed' || routeabilityState === 'unknown') metrics.failed += 1;
  }
  return metrics;
}

function fallbackProviderConversationId(
  resultTarget: Record<string, unknown>,
  _fallbackTarget: AccountMirrorReconciliationTarget,
): string | null {
  return readString(resultTarget.conversationId);
}

function fallbackBoundIdentityKey(
  resultTarget: Record<string, unknown>,
  fallbackTarget: AccountMirrorReconciliationTarget,
): string | null {
  return readString(resultTarget.boundIdentityKey) ?? fallbackTarget.expectedIdentityKey ?? fallbackTarget.detectedIdentityKey;
}

function isActiveMaterializationJobStatus(value: string | null): boolean {
  return value === 'queued' || value === 'running';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePolicy(
  request: AccountMirrorReconciliationCreateRequest,
): AccountMirrorReconciliationCampaign['policy'] {
  return {
    sweepMode: 'full_sweep',
    materializationPolicy: normalizeMaterializationPolicy(request.materializationPolicy),
    materializationAssetKinds: normalizeMaterializationAssetKinds(request.materializationAssetKinds),
    materializationMaxItems: normalizePositiveInteger(request.materializationMaxItems, 500),
  };
}

function normalizeMaterializationPolicy(
  value: AccountMirrorCompletionMaterializationPolicy | null | undefined,
): AccountMirrorCompletionMaterializationPolicy {
  if (
    value === 'metadata_only' ||
    value === 'recent_missing_assets' ||
    value === 'full_missing_assets'
  ) {
    return value;
  }
  return 'full_missing_assets';
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

function normalizePositiveInteger(value: number | null | undefined, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalIdentity(value: string | null | undefined): string | null {
  return normalizeOptionalString(value)?.toLowerCase() ?? null;
}

function matchesIdentityFilter(entry: AccountMirrorStatusEntry, identity: string | null): boolean {
  if (!identity) return true;
  const expectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(entry.provider, entry.expectedIdentityKey);
  const detectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(entry.provider, entry.detectedIdentityKey);
  const requestedTenantKey = createAccountMirrorTenantKey({
    provider: entry.provider,
    boundIdentityKey: identity,
  });
  return expectedIdentityKey === identity || detectedIdentityKey === identity || entry.tenantKey === requestedTenantKey;
}

function resolveTargetSelectionLimit(filters: AccountMirrorReconciliationCampaign['filters']): number {
  return filters.maxTargets ?? Number.POSITIVE_INFINITY;
}

function createTargetKey(input: {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
}): string {
  return `${input.provider}:${input.runtimeProfileId}`;
}

function isActiveCampaignStatus(status: AccountMirrorReconciliationCampaignStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'idle_waiting' || status === 'paused';
}

function isTerminalCampaignStatus(status: AccountMirrorReconciliationCampaignStatus): boolean {
  return status === 'completed' ||
    status === 'completed_with_skips' ||
    status === 'cancelled' ||
    status === 'failed';
}
