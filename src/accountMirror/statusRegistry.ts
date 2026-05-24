import {
  getCurrentRuntimeProfiles,
  getRuntimeProfileBrowserProfileId,
} from '../config/model.js';
import type {
  AccountMirrorCompletionMaterializationAssetKind,
  AccountMirrorCompletionMaterializationPolicy,
  AccountMirrorCompletionSweepMode,
} from './completionService.js';
import type {
  AccountMirrorPolitenessDecision,
  AccountMirrorProviderPolitenessPolicy,
  AccountMirrorProviderGuardKind,
  AccountMirrorProviderGuardState,
  AccountMirrorProvider,
} from './politePolicy.js';
import { evaluateAccountMirrorPoliteness } from './politePolicy.js';

type MutableRecord = Record<string, unknown>;

export type AccountMirrorStatusState = {
  detectedIdentityKey?: string | null;
  lastAttemptAtMs?: number | null;
  lastSuccessAtMs?: number | null;
  lastFailureAtMs?: number | null;
  lastQueuedAtMs?: number | null;
  lastStartedAtMs?: number | null;
  lastCompletedAtMs?: number | null;
  consecutiveFailureCount?: number | null;
  providerCooldownUntilMs?: number | null;
  providerHardStopAtMs?: number | null;
  providerGuard?: AccountMirrorProviderGuardState | null;
  queued?: boolean;
  running?: boolean;
  lastRefreshRequestId?: string | null;
  lastDispatcherKey?: string | null;
  lastDispatcherOperationId?: string | null;
  lastDispatcherBlockedBy?: Record<string, unknown> | null;
  metadataCounts?: AccountMirrorMetadataCounts | null;
  metadataEvidence?: AccountMirrorMetadataEvidence | null;
};

export type AccountMirrorMetadataCounts = {
  projects: number;
  conversations: number;
  artifacts: number;
  files: number;
  media: number;
};

export type AccountMirrorMetadataEvidence = {
  identitySource: string | null;
  projectSampleIds: string[];
  conversationSampleIds: string[];
  attachmentInventory?: {
    nextProjectIndex: number;
    nextConversationIndex: number;
    detailReadLimit: number;
    scannedProjects: number;
    scannedConversations: number;
    yielded?: boolean;
    yieldCause?: {
      observedAt: string | null;
      ownerCommand: string | null;
      kind: string | null;
      operationClass: string | null;
    } | null;
  } | null;
  projectConversations?: {
    nextProjectIndex: number;
    readLimit: number;
    scannedProjects: number;
    yielded?: boolean;
  } | null;
  truncated: {
    projects: boolean;
    conversations: boolean;
    artifacts: boolean;
  };
};

export type AccountMirrorCompleteness = {
  state: 'none' | 'complete' | 'in_progress' | 'unknown';
  summary: string;
  remainingDetailSurfaces: {
    projects: number;
    conversations: number;
    total: number;
  } | null;
  signals: {
    projectsTruncated: boolean;
    conversationsTruncated: boolean;
    attachmentInventoryTruncated: boolean;
    attachmentCursorPresent: boolean;
  };
};

export type AccountMirrorStatusEntry = {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  detectedIdentityKey: string | null;
  accountLevel: string | null;
  status: 'eligible' | 'delayed' | 'blocked';
  reason: AccountMirrorPolitenessDecision['reason'];
  eligibleAt: string | null;
  delayMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastQueuedAt: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  consecutiveFailureCount: number;
  mirrorState: {
    queued: boolean;
    running: boolean;
    lastRefreshRequestId: string | null;
    lastDispatcherKey: string | null;
    lastDispatcherOperationId: string | null;
    lastDispatcherBlockedBy: Record<string, unknown> | null;
  };
  providerGuard: {
    state: 'clear' | 'manual_clear_required' | 'cooldown';
    kind: AccountMirrorProviderGuardKind | null;
    summary: string | null;
    detectedAt: string | null;
    clearedAt: string | null;
    cooldownUntil: string | null;
    url: string | null;
    action: string | null;
  };
  metadataCounts: AccountMirrorMetadataCounts;
  metadataEvidence: AccountMirrorMetadataEvidence | null;
  mirrorCompleteness: AccountMirrorCompleteness;
  liveFollow: AccountMirrorLiveFollowDesiredState;
  limits: AccountMirrorPolitenessDecision['limits'];
};

export type AccountMirrorLiveFollowDesiredState = {
  configured: boolean;
  enabled: boolean;
  state: 'enabled' | 'disabled' | 'unconfigured' | 'missing_identity' | 'unsupported';
  reason: string;
  mode: string | null;
  priority: string | null;
  sweepMode: AccountMirrorCompletionSweepMode | null;
  materializationPolicy: AccountMirrorCompletionMaterializationPolicy | null;
  materializationAssetKinds: AccountMirrorCompletionMaterializationAssetKind[] | null;
  materializationMaxItems: number | null;
  materializationRefreshSnapshot: boolean | null;
  materializationForce: boolean | null;
};

export type AccountMirrorStatusSummary = {
  object: 'account_mirror_status';
  generatedAt: string;
  entries: AccountMirrorStatusEntry[];
  metrics: {
    total: number;
    eligible: number;
    delayed: number;
    blocked: number;
  };
};

export type AccountMirrorStatusRegistrySnapshot = {
  entries: AccountMirrorStatusState[];
};

export interface AccountMirrorStatusRegistry {
  refreshPersistentState?(): Promise<void>;
  readStatus(input?: {
    provider?: AccountMirrorProvider | null;
    runtimeProfileId?: string | null;
    explicitRefresh?: boolean;
  }): AccountMirrorStatusSummary;
  updateState(
    key: {
      provider: AccountMirrorProvider;
      runtimeProfileId: string;
    },
    state: AccountMirrorStatusState,
  ): void;
  mergeState(
    key: {
      provider: AccountMirrorProvider;
      runtimeProfileId: string;
    },
    state: AccountMirrorStatusState,
  ): AccountMirrorStatusState;
}

export function createAccountMirrorStatusRegistry(input: {
  config: Record<string, unknown> | null | undefined;
  now?: () => Date;
  initialState?: Record<string, AccountMirrorStatusState>;
  readPersistentState?: (target: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
    browserProfileId: string | null;
    boundIdentityKey: string | null;
  }) => Promise<AccountMirrorStatusState | null>;
}): AccountMirrorStatusRegistry {
  const states = new Map<string, AccountMirrorStatusState>(
    Object.entries(input.initialState ?? {}),
  );
  const now = input.now ?? (() => new Date());
  const readStatus: AccountMirrorStatusRegistry['readStatus'] = (query = {}) =>
    createAccountMirrorStatusSummary({
      config: input.config,
      now: now(),
      states,
      provider: query.provider ?? null,
      runtimeProfileId: query.runtimeProfileId ?? null,
      explicitRefresh: query.explicitRefresh ?? false,
    });

  return {
    async refreshPersistentState() {
      if (!input.readPersistentState) return;
      const targets = discoverConfiguredAccountMirrorTargets(input.config);
      for (const target of targets) {
        const state = await input.readPersistentState({
          provider: target.provider,
          runtimeProfileId: target.runtimeProfileId,
          browserProfileId: target.browserProfileId,
          boundIdentityKey: target.expectedIdentityKey,
        });
        if (state) {
          const stateKey = createMirrorStateKey(target);
          states.set(stateKey, {
            ...state,
            ...(states.get(stateKey) ?? {}),
          });
        }
      }
    },
    readStatus,
    updateState(key, state) {
      states.set(createMirrorStateKey(key), { ...state });
    },
    mergeState(key, state) {
      const stateKey = createMirrorStateKey(key);
      const next = {
        ...(states.get(stateKey) ?? {}),
        ...state,
      };
      states.set(stateKey, next);
      return { ...next };
    },
  };
}

export function createAccountMirrorStatusSummary(input: {
  config: Record<string, unknown> | null | undefined;
  now: Date;
  states?: Map<string, AccountMirrorStatusState> | Record<string, AccountMirrorStatusState>;
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  explicitRefresh?: boolean;
}): AccountMirrorStatusSummary {
  const states = input.states instanceof Map
    ? input.states
    : new Map(Object.entries(input.states ?? {}));
  const entries = discoverConfiguredAccountMirrorTargets(input.config)
    .filter((entry) => !input.provider || entry.provider === input.provider)
    .filter((entry) => !input.runtimeProfileId || entry.runtimeProfileId === input.runtimeProfileId)
    .map((target) => {
      const state = states.get(createMirrorStateKey(target)) ?? {};
      const decision = evaluateAccountMirrorPoliteness({
        provider: target.provider,
        runtimeProfileId: target.runtimeProfileId,
        browserProfileId: target.browserProfileId,
        expectedIdentityKey: target.expectedIdentityKey,
        detectedIdentityKey: state.detectedIdentityKey,
        lastAttemptAtMs: state.lastAttemptAtMs,
        lastSuccessAtMs: state.lastSuccessAtMs,
        lastFailureAtMs: state.lastFailureAtMs,
        consecutiveFailureCount: state.consecutiveFailureCount,
        providerCooldownUntilMs: state.providerCooldownUntilMs,
        providerHardStopAtMs: state.providerHardStopAtMs,
        providerGuard: state.providerGuard,
        queued: state.queued,
        running: state.running,
        explicitRefresh: input.explicitRefresh,
        nowMs: input.now.getTime(),
        policy: target.policy ?? undefined,
      });
      return createStatusEntry(target, state, decision);
    });
  const metrics = entries.reduce<AccountMirrorStatusSummary['metrics']>(
    (acc, entry) => {
      acc.total += 1;
      acc[entry.status] += 1;
      return acc;
    },
    { total: 0, eligible: 0, delayed: 0, blocked: 0 },
  );
  return {
    object: 'account_mirror_status',
    generatedAt: input.now.toISOString(),
    entries,
    metrics,
  };
}

export function discoverConfiguredAccountMirrorTargets(
  config: Record<string, unknown> | null | undefined,
): Array<{
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  accountLevel: string | null;
  policy: Partial<AccountMirrorProviderPolitenessPolicy> | null;
  liveFollow: AccountMirrorLiveFollowDesiredState;
}> {
  if (!config) return [];
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  return Object.entries(runtimeProfiles).flatMap(([runtimeProfileId, runtimeProfile]) => {
    const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
    const services = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
    return (['chatgpt', 'gemini', 'grok'] as const).flatMap((provider) => {
      const service = isRecord(services[provider]) ? services[provider] : null;
      if (!service) return [];
      return [{
        provider,
        runtimeProfileId,
        browserProfileId,
        expectedIdentityKey: readIdentityKey(service),
        accountLevel: readAccountLevel(service),
        policy: readLiveFollowPolitenessPolicy(provider, service),
        liveFollow: readLiveFollowDesiredState(provider, service),
      }];
    });
  });
}

function createStatusEntry(
  target: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
    browserProfileId: string | null;
    expectedIdentityKey: string | null;
    accountLevel: string | null;
    policy: Partial<AccountMirrorProviderPolitenessPolicy> | null;
    liveFollow: AccountMirrorLiveFollowDesiredState;
  },
  state: AccountMirrorStatusState,
  decision: AccountMirrorPolitenessDecision,
): AccountMirrorStatusEntry {
  const metadataCounts = normalizeMetadataCounts(state.metadataCounts);
  const metadataEvidence = normalizeMetadataEvidence(state.metadataEvidence);
  return {
    provider: target.provider,
    runtimeProfileId: target.runtimeProfileId,
    browserProfileId: target.browserProfileId,
    expectedIdentityKey: target.expectedIdentityKey,
    detectedIdentityKey: decision.detectedIdentityKey,
    accountLevel: target.accountLevel,
    status: decision.posture === 'delay' ? 'delayed' : decision.posture,
    reason: decision.reason,
    eligibleAt: timestampToIso(decision.eligibleAtMs),
    delayMs: decision.delayMs,
    lastAttemptAt: timestampToIso(state.lastAttemptAtMs),
    lastSuccessAt: timestampToIso(state.lastSuccessAtMs),
    lastFailureAt: timestampToIso(state.lastFailureAtMs),
    lastQueuedAt: timestampToIso(state.lastQueuedAtMs),
    lastStartedAt: timestampToIso(state.lastStartedAtMs),
    lastCompletedAt: timestampToIso(state.lastCompletedAtMs),
    consecutiveFailureCount: Math.max(0, Math.floor(state.consecutiveFailureCount ?? 0)),
    mirrorState: {
      queued: state.queued === true,
      running: state.running === true,
      lastRefreshRequestId: readString(state.lastRefreshRequestId),
      lastDispatcherKey: readString(state.lastDispatcherKey),
      lastDispatcherOperationId: readString(state.lastDispatcherOperationId),
      lastDispatcherBlockedBy: isRecord(state.lastDispatcherBlockedBy) ? state.lastDispatcherBlockedBy : null,
    },
    providerGuard: normalizeProviderGuardForStatus(state.providerGuard),
    metadataCounts,
    metadataEvidence,
    mirrorCompleteness: deriveMirrorCompleteness(metadataCounts, metadataEvidence),
    liveFollow: {
      ...target.liveFollow,
      ...(target.liveFollow.state === 'enabled' && !target.expectedIdentityKey
        ? {
            enabled: false,
            state: 'missing_identity' as const,
            reason: 'liveFollow.enabled is true but the service has no bound identity',
          }
        : {}),
    },
    limits: decision.limits,
  };
}

function createMirrorStateKey(input: {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
}): string {
  return `${input.provider}:${input.runtimeProfileId}`;
}

function readIdentityKey(service: MutableRecord): string | null {
  const identity = isRecord(service.identity) ? service.identity : {};
  return (
    readString(identity.email) ??
    readString(identity.handle) ??
    readString(identity.accountId) ??
    readString(identity.name)
  );
}

function readAccountLevel(service: MutableRecord): string | null {
  const identity = isRecord(service.identity) ? service.identity : {};
  return (
    readString(identity.accountLevel) ??
    readString(identity.accountPlanType) ??
    readString(identity.capabilityProfile) ??
    readString(identity.proAccess)
  );
}

function readLiveFollowDesiredState(
  _provider: AccountMirrorProvider,
  service: MutableRecord,
): AccountMirrorLiveFollowDesiredState {
  const liveFollow = isRecord(service.liveFollow) ? service.liveFollow : null;
  const enabled = liveFollow?.enabled;
  const mode = liveFollow ? readString(liveFollow.mode) : null;
  const priority = liveFollow ? readString(liveFollow.priority) : null;
  const sweepMode = liveFollow ? readSweepMode(liveFollow.sweepMode) : null;
  const materializationPolicy = liveFollow ? readMaterializationPolicy(liveFollow.materializationPolicy) : null;
  const materializationAssetKinds = liveFollow ? readMaterializationAssetKinds(liveFollow.materializationAssetKinds) : null;
  const materializationMaxItems = liveFollow ? readPositiveInteger(liveFollow.materializationMaxItems) : null;
  const materializationRefreshSnapshot = liveFollow ? readBoolean(liveFollow.materializationRefreshSnapshot) : null;
  const materializationForce = liveFollow ? readBoolean(liveFollow.materializationForce) : null;
  const common = {
    mode,
    priority,
    sweepMode,
    materializationPolicy,
    materializationAssetKinds,
    materializationMaxItems,
    materializationRefreshSnapshot,
    materializationForce,
  };
  if (enabled === false) {
    return {
      configured: true,
      enabled: false,
      state: 'disabled',
      reason: 'liveFollow.enabled is false',
      ...common,
    };
  }
  if (enabled !== true) {
    return {
      configured: liveFollow !== null,
      enabled: false,
      state: 'unconfigured',
      reason: 'liveFollow.enabled is not configured',
      ...common,
    };
  }
  return {
    configured: true,
    enabled: true,
    state: 'enabled',
    reason: 'liveFollow.enabled is true',
    ...common,
  };
}

function readSweepMode(value: unknown): AccountMirrorCompletionSweepMode | null {
  return value === 'full_sweep' || value === 'steady_follow' ? value : null;
}

function readMaterializationPolicy(value: unknown): AccountMirrorCompletionMaterializationPolicy | null {
  if (
    value === 'metadata_only' ||
    value === 'recent_missing_assets' ||
    value === 'full_missing_assets'
  ) return value;
  return null;
}

function readMaterializationAssetKinds(value: unknown): AccountMirrorCompletionMaterializationAssetKind[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.filter((entry): entry is AccountMirrorCompletionMaterializationAssetKind =>
    entry === 'artifacts' ||
    entry === 'files' ||
    entry === 'media' ||
    entry === 'all'
  );
  if (normalized.length === 0) return null;
  if (normalized.includes('all')) return ['all'];
  return Array.from(new Set(normalized));
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readLiveFollowPolitenessPolicy(
  provider: AccountMirrorProvider,
  service: MutableRecord,
): Partial<AccountMirrorProviderPolitenessPolicy> | null {
  const liveFollow = isRecord(service.liveFollow) ? service.liveFollow : null;
  if (!liveFollow) return null;
  const policy: Partial<AccountMirrorProviderPolitenessPolicy> = { provider };
  copyNonNegativeInteger(liveFollow, policy, 'minIntervalMs');
  copyNonNegativeInteger(liveFollow, policy, 'explicitRefreshMinIntervalMs');
  copyNonNegativeInteger(liveFollow, policy, 'jitterMaxMs');
  copyNonNegativeInteger(liveFollow, policy, 'failureBaseCooldownMs');
  copyNonNegativeInteger(liveFollow, policy, 'failureMaxCooldownMs');
  copyNonNegativeInteger(liveFollow, policy, 'hardStopCooldownMs');
  copyPositiveInteger(liveFollow, policy, 'maxBrowserInteractionsPerMinute');
  copyNonNegativeInteger(liveFollow, policy, 'maxPageReadsPerCycle');
  copyNonNegativeInteger(liveFollow, policy, 'maxConversationRowsPerCycle');
  copyNonNegativeInteger(liveFollow, policy, 'maxArtifactRowsPerCycle');
  return Object.keys(policy).length > 1 ? policy : null;
}

function copyNonNegativeInteger<K extends keyof AccountMirrorProviderPolitenessPolicy>(
  source: MutableRecord,
  target: Partial<AccountMirrorProviderPolitenessPolicy>,
  key: K,
): void {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    target[key] = Math.trunc(value) as AccountMirrorProviderPolitenessPolicy[K];
  }
}

function copyPositiveInteger<K extends keyof AccountMirrorProviderPolitenessPolicy>(
  source: MutableRecord,
  target: Partial<AccountMirrorProviderPolitenessPolicy>,
  key: K,
): void {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    target[key] = Math.trunc(value) as AccountMirrorProviderPolitenessPolicy[K];
  }
}

function normalizeMetadataCounts(value: AccountMirrorMetadataCounts | null | undefined): AccountMirrorMetadataCounts {
  return {
    projects: normalizeCount(value?.projects),
    conversations: normalizeCount(value?.conversations),
    artifacts: normalizeCount(value?.artifacts),
    files: normalizeCount(value?.files),
    media: normalizeCount(value?.media),
  };
}

function normalizeMetadataEvidence(
  value: AccountMirrorMetadataEvidence | null | undefined,
): AccountMirrorMetadataEvidence | null {
  if (!value) return null;
  return {
    identitySource: readString(value.identitySource),
    projectSampleIds: normalizeStringArray(value.projectSampleIds),
    conversationSampleIds: normalizeStringArray(value.conversationSampleIds),
    attachmentInventory: normalizeAttachmentInventoryEvidence(value.attachmentInventory),
    projectConversations: normalizeProjectConversationEvidence(value.projectConversations),
    truncated: {
      projects: value.truncated?.projects === true,
      conversations: value.truncated?.conversations === true,
      artifacts: value.truncated?.artifacts === true,
    },
  };
}

function deriveMirrorCompleteness(
  counts: AccountMirrorMetadataCounts,
  evidence: AccountMirrorMetadataEvidence | null,
): AccountMirrorCompleteness {
  if (!evidence) {
    return {
      state: 'none',
      summary: 'No mirror snapshot has been collected.',
      remainingDetailSurfaces: null,
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: false,
        attachmentCursorPresent: false,
      },
    };
  }
  const projectsTruncated = evidence.truncated.projects === true;
  const conversationsTruncated = evidence.truncated.conversations === true;
  const attachmentInventoryTruncated = evidence.truncated.artifacts === true;
  const cursor = evidence.attachmentInventory ?? null;
  const attachmentCursorPresent = cursor !== null;
  const signals = {
    projectsTruncated,
    conversationsTruncated,
    attachmentInventoryTruncated,
    attachmentCursorPresent,
  };
  if (!projectsTruncated && !conversationsTruncated && !attachmentInventoryTruncated) {
    return {
      state: 'complete',
      summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
      remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
      signals,
    };
  }
  if (!cursor && attachmentInventoryTruncated) {
    return {
      state: 'unknown',
      summary: 'Attachment inventory is truncated and no continuation cursor is available yet.',
      remainingDetailSurfaces: null,
      signals,
    };
  }
  if (!cursor) {
    return {
      state: 'in_progress',
      summary: 'Mirror metadata is still truncated.',
      remainingDetailSurfaces: null,
      signals,
    };
  }
  const remainingProjects = Math.max(0, counts.projects - cursor.nextProjectIndex);
  const remainingConversations = Math.max(0, counts.conversations - cursor.nextConversationIndex);
  const remainingTotal = remainingProjects + remainingConversations;
  return {
    state: 'in_progress',
    summary: remainingTotal > 0
      ? `Attachment inventory has ${remainingTotal} detail surfaces remaining.`
      : 'Mirror metadata is still marked truncated; another refresh should verify completion.',
    remainingDetailSurfaces: {
      projects: remainingProjects,
      conversations: remainingConversations,
      total: remainingTotal,
    },
    signals,
  };
}

function normalizeProjectConversationEvidence(
  value: AccountMirrorMetadataEvidence['projectConversations'] | null | undefined,
): AccountMirrorMetadataEvidence['projectConversations'] | null {
  if (!value || !isRecord(value)) return null;
  return {
    nextProjectIndex: normalizeCount(value.nextProjectIndex),
    readLimit: normalizeCount(value.readLimit),
    scannedProjects: normalizeCount(value.scannedProjects),
    yielded: value.yielded === true,
  };
}

function normalizeAttachmentInventoryEvidence(
  value: AccountMirrorMetadataEvidence['attachmentInventory'] | null | undefined,
): AccountMirrorMetadataEvidence['attachmentInventory'] | null {
  if (!value || !isRecord(value)) return null;
  return {
    nextProjectIndex: normalizeCount(value.nextProjectIndex),
    nextConversationIndex: normalizeCount(value.nextConversationIndex),
    detailReadLimit: normalizeCount(value.detailReadLimit),
    scannedProjects: normalizeCount(value.scannedProjects),
    scannedConversations: normalizeCount(value.scannedConversations),
    yielded: value.yielded === true,
    yieldCause: normalizeAttachmentInventoryYieldCause(value.yieldCause),
  };
}

function normalizeProviderGuardForStatus(
  value: AccountMirrorProviderGuardState | null | undefined,
): AccountMirrorStatusEntry['providerGuard'] {
  if (!value) {
    return {
      state: 'clear',
      kind: null,
      summary: null,
      detectedAt: null,
      clearedAt: null,
      cooldownUntil: null,
      url: null,
      action: null,
    };
  }
  return {
    state: value.state === 'manual_clear_required' || value.state === 'cooldown' ? value.state : 'clear',
    kind: value.kind ?? 'unknown',
    summary: readString(value.summary) ?? 'Provider guard is active.',
    detectedAt: timestampToIso(value.detectedAtMs),
    clearedAt: timestampToIso(value.clearedAtMs),
    cooldownUntil: timestampToIso(value.cooldownUntilMs),
    url: readString(value.url),
    action: readString(value.action),
  };
}

function normalizeAttachmentInventoryYieldCause(
  value: NonNullable<AccountMirrorMetadataEvidence['attachmentInventory']>['yieldCause'] | undefined,
): NonNullable<AccountMirrorMetadataEvidence['attachmentInventory']>['yieldCause'] {
  if (!value || !isRecord(value)) return null;
  return {
    observedAt: readString(value.observedAt),
    ownerCommand: readString(value.ownerCommand),
    kind: readString(value.kind),
    operationClass: readString(value.operationClass),
  };
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readString(entry)).filter((entry): entry is string => entry !== null)
    : [];
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function timestampToIso(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
