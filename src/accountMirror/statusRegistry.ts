import {
  getCurrentRuntimeProfiles,
  getRuntimeProfileBrowserProfileId,
} from '../config/model.js';
import type {
  AccountMirrorPolitenessDecision,
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
  metadataCounts: AccountMirrorMetadataCounts;
  metadataEvidence: AccountMirrorMetadataEvidence | null;
  mirrorCompleteness: AccountMirrorCompleteness;
  limits: AccountMirrorPolitenessDecision['limits'];
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
        queued: state.queued,
        running: state.running,
        explicitRefresh: input.explicitRefresh,
        nowMs: input.now.getTime(),
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

function discoverConfiguredAccountMirrorTargets(
  config: Record<string, unknown> | null | undefined,
): Array<{
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  accountLevel: string | null;
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
    metadataCounts,
    metadataEvidence,
    mirrorCompleteness: deriveMirrorCompleteness(metadataCounts, metadataEvidence),
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
