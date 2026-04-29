import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { ResolvedUserConfig } from '../config.js';
import type {
  ConversationArtifact,
  FileRef,
} from '../browser/providers/domain.js';
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from '../browser/service/profileResolution.js';
import {
  createFileBackedBrowserOperationDispatcher,
  formatBrowserOperationBusyResult,
  type BrowserOperationAcquiredResult,
  type BrowserOperationDispatcher,
  type BrowserOperationRecord,
} from '../../packages/browser-service/src/service/operationDispatcher.js';
import { summarizeBrowserOperationQueueObservationsByKey } from '../browser/operationQueueObservations.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  AccountMirrorMetadataEvidence,
  AccountMirrorMetadataCounts,
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
  AccountMirrorStatusSummary,
} from './statusRegistry.js';
import { createAccountMirrorStatusRegistry } from './statusRegistry.js';
import {
  AccountMirrorIdentityMismatchError,
  createChatgptAccountMirrorMetadataCollector,
  type AccountMirrorMetadataCollector,
  type AccountMirrorMetadataCollectorResult,
} from './chatgptMetadataCollector.js';
import {
  createAccountMirrorPersistence,
  type AccountMirrorPersistence,
} from './cachePersistence.js';

export interface AccountMirrorRefreshRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  explicitRefresh?: boolean;
  queueTimeoutMs?: number;
  queuePollMs?: number;
}

export interface AccountMirrorRefreshResult {
  object: 'account_mirror_refresh';
  requestId: string;
  status: 'completed' | 'blocked' | 'busy';
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  startedAt: string;
  completedAt: string | null;
  dispatcher: {
    key: string | null;
    operationId: string | null;
    blockedBy: Record<string, unknown> | null;
  };
  metadataCounts: AccountMirrorMetadataCounts;
  metadataEvidence: AccountMirrorMetadataEvidence | null;
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'];
  detectedIdentityKey: string | null;
  detectedAccountLevel: string | null;
  mirrorStatus: AccountMirrorStatusSummary;
}

export class AccountMirrorRefreshError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 503,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AccountMirrorRefreshError';
  }
}

export interface AccountMirrorRefreshService {
  requestRefresh(request?: AccountMirrorRefreshRequest): Promise<AccountMirrorRefreshResult>;
}

export function createAccountMirrorRefreshService(input: {
  config: Record<string, unknown> | null | undefined;
  registry?: AccountMirrorStatusRegistry;
  dispatcher?: BrowserOperationDispatcher;
  metadataCollector?: AccountMirrorMetadataCollector;
  persistence?: AccountMirrorPersistence;
  now?: () => Date;
  generateRequestId?: () => string;
}): AccountMirrorRefreshService {
  const now = input.now ?? (() => new Date());
  const registry = input.registry ?? createAccountMirrorStatusRegistry({
    config: input.config,
    now,
  });
  const dispatcher = input.dispatcher ?? createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const metadataCollector =
    input.metadataCollector ??
    (isResolvedUserConfig(input.config)
      ? createChatgptAccountMirrorMetadataCollector(input.config)
      : createConfigBackedAccountMirrorMetadataCollector(input.config));
  const persistence = input.persistence ?? createAccountMirrorPersistence({
    config: input.config,
  });
  const generateRequestId = input.generateRequestId ?? (() => `acctmirror_${randomUUID()}`);

  return {
    async requestRefresh(request = {}) {
      const provider = request.provider ?? 'chatgpt';
      const runtimeProfileId = request.runtimeProfileId ?? 'default';
      const requestId = generateRequestId();
      if (provider !== 'chatgpt' || runtimeProfileId !== 'default') {
        throw new AccountMirrorRefreshError(
          400,
          'account_mirror_refresh_scope_unsupported',
          'The first account mirror refresh slice only supports the default ChatGPT mirror.',
          { provider, runtimeProfileId },
        );
      }

      await registry.refreshPersistentState?.();
      const target = readSingleMirrorTarget({
        registry,
        provider,
        runtimeProfileId,
        explicitRefresh: request.explicitRefresh ?? true,
      });
      if (!target) {
        throw new AccountMirrorRefreshError(
          404,
          'account_mirror_target_not_found',
          `No configured account mirror target exists for ${provider}/${runtimeProfileId}.`,
          { provider, runtimeProfileId },
        );
      }
      if (target.status !== 'eligible') {
        throw new AccountMirrorRefreshError(
          409,
          'account_mirror_not_eligible',
          `Account mirror ${provider}/${runtimeProfileId} is ${target.status}: ${target.reason}.`,
          {
            provider,
            runtimeProfileId,
            reason: target.reason,
            eligibleAt: target.eligibleAt,
          },
        );
      }

      const queuedAt = now();
      const managedProfileDir = resolveMirrorManagedProfileDir({
        config: input.config,
        provider,
        runtimeProfileId,
        browserProfileId: target.browserProfileId,
      });
      registry.mergeState({ provider, runtimeProfileId }, {
        queued: true,
        running: false,
        lastRefreshRequestId: requestId,
        lastQueuedAtMs: queuedAt.getTime(),
        lastAttemptAtMs: queuedAt.getTime(),
        detectedIdentityKey: target.expectedIdentityKey,
        lastDispatcherBlockedBy: null,
      });

      const acquired = await dispatcher.acquireQueued({
        managedProfileDir,
        serviceTarget: provider,
        kind: 'browser-execution',
        operationClass: 'exclusive-probe',
        ownerCommand: `account-mirror-refresh:${provider}:${runtimeProfileId}`,
      }, {
        timeoutMs: normalizeNonNegativeInteger(request.queueTimeoutMs, 30_000),
        pollMs: normalizePositiveInteger(request.queuePollMs, 1_000),
        onBlocked: (result) => {
          registry.mergeState({ provider, runtimeProfileId }, {
            queued: true,
            running: false,
            lastDispatcherKey: result.key,
            lastDispatcherBlockedBy: summarizeBrowserOperation(result.blockedBy),
          });
        },
      });

      if (!acquired.acquired) {
        const completedAt = now();
        registry.mergeState({ provider, runtimeProfileId }, {
          queued: false,
          running: false,
          lastFailureAtMs: completedAt.getTime(),
          consecutiveFailureCount: 1,
          lastDispatcherKey: acquired.key,
          lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
        });
        throw new AccountMirrorRefreshError(
          503,
          'account_mirror_browser_operation_busy',
          formatBrowserOperationBusyResult(acquired),
          {
            provider,
            runtimeProfileId,
            dispatcherKey: acquired.key,
            blockedBy: summarizeBrowserOperation(acquired.blockedBy),
          },
        );
      }

      const startedAt = now();
      registry.mergeState({ provider, runtimeProfileId }, {
        queued: false,
        running: true,
        lastStartedAtMs: startedAt.getTime(),
        lastDispatcherKey: acquired.operation.key,
        lastDispatcherOperationId: acquired.operation.id,
        lastDispatcherBlockedBy: null,
      });

      let collection: AccountMirrorMetadataCollectorResult;
      try {
        collection = await metadataCollector.collect({
          provider,
          runtimeProfileId,
          expectedIdentityKey: target.expectedIdentityKey ?? '',
          limits: {
            maxPageReadsPerCycle: target.limits.maxPageReadsPerCycle,
            maxConversationRowsPerCycle: target.limits.maxConversationRowsPerCycle,
            maxArtifactRowsPerCycle: target.limits.maxArtifactRowsPerCycle,
          },
          previousEvidence: target.metadataEvidence,
          shouldYield: () => shouldYieldAccountMirrorRefresh(acquired),
        });
        const collectionWithPriorManifests = await mergeCollectionWithPersistedCatalog({
          persistence,
          provider,
          boundIdentityKey: target.expectedIdentityKey ?? collection.detectedIdentityKey,
          collection,
        });
        const completedAt = now();
        registry.mergeState({ provider, runtimeProfileId }, {
          queued: false,
          running: false,
          detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
          lastSuccessAtMs: completedAt.getTime(),
          lastCompletedAtMs: completedAt.getTime(),
          consecutiveFailureCount: 0,
          metadataCounts: collectionWithPriorManifests.metadataCounts,
          metadataEvidence: collectionWithPriorManifests.evidence,
        });
        await persistence.writeSnapshot({
          provider,
          runtimeProfileId,
          browserProfileId: target.browserProfileId,
          boundIdentityKey: target.expectedIdentityKey ?? collectionWithPriorManifests.detectedIdentityKey ?? '',
          detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
          detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
          requestId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          dispatcherKey: acquired.operation.key,
          dispatcherOperationId: acquired.operation.id,
          metadataCounts: collectionWithPriorManifests.metadataCounts,
          metadataEvidence: collectionWithPriorManifests.evidence,
          manifests: collectionWithPriorManifests.manifests,
        });
        const mirrorStatus = registry.readStatus({ provider, runtimeProfileId, explicitRefresh: true });
        return {
          object: 'account_mirror_refresh',
          requestId,
          status: 'completed',
          provider,
          runtimeProfileId,
          browserProfileId: target.browserProfileId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          dispatcher: {
            key: acquired.operation.key,
            operationId: acquired.operation.id,
            blockedBy: null,
          },
          metadataCounts: collectionWithPriorManifests.metadataCounts,
          metadataEvidence: collectionWithPriorManifests.evidence,
          mirrorCompleteness: mirrorStatus.entries[0]?.mirrorCompleteness ?? {
            state: 'unknown',
            summary: 'Mirror completeness could not be derived from the refreshed status.',
            remainingDetailSurfaces: null,
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
          detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
          mirrorStatus,
        };
      } catch (error) {
        const completedAt = now();
        const isIdentityMismatch = error instanceof AccountMirrorIdentityMismatchError;
        registry.mergeState({ provider, runtimeProfileId }, {
          queued: false,
          running: false,
          detectedIdentityKey: isIdentityMismatch ? error.detectedIdentityKey : undefined,
          lastFailureAtMs: completedAt.getTime(),
          lastCompletedAtMs: completedAt.getTime(),
          consecutiveFailureCount: 1,
        });
        if (isIdentityMismatch) {
          throw new AccountMirrorRefreshError(
            409,
            'account_mirror_identity_mismatch',
            error.message,
            {
              provider,
              runtimeProfileId,
              expectedIdentityKey: error.expectedIdentityKey,
              detectedIdentityKey: error.detectedIdentityKey,
            },
          );
        }
        throw error;
      } finally {
        await acquired.release();
      }
    },
  };
}

function shouldYieldAccountMirrorRefresh(acquired: BrowserOperationAcquiredResult): boolean {
  const observations = summarizeBrowserOperationQueueObservationsByKey(acquired.operation.key, 10);
  return observations.items.some((observation) =>
    observation.event === 'queued' &&
    observation.blockedBy?.id === acquired.operation.id &&
    observation.operation === null &&
    observation.blockedBy.ownerCommand === acquired.operation.ownerCommand &&
    isHigherPriorityQueuedOperation(observation.at, acquired.operation.startedAt)
  );
}

function isHigherPriorityQueuedOperation(observationAt: string, operationStartedAt: string): boolean {
  const observationMs = Date.parse(observationAt);
  const operationStartedMs = Date.parse(operationStartedAt);
  return Number.isFinite(observationMs) &&
    Number.isFinite(operationStartedMs) &&
    observationMs >= operationStartedMs;
}

async function mergeCollectionWithPersistedCatalog(input: {
  persistence: AccountMirrorPersistence;
  provider: AccountMirrorProvider;
  boundIdentityKey: string | null;
  collection: AccountMirrorMetadataCollectorResult;
}): Promise<AccountMirrorMetadataCollectorResult> {
  const existing = await input.persistence.readCatalog({
    provider: input.provider,
    boundIdentityKey: input.boundIdentityKey,
    limit: 10_000,
  });
  if (!existing) {
    return input.collection;
  }
  const manifests = {
    projects: mergeById(existing.projects, input.collection.manifests.projects),
    conversations: mergeById(existing.conversations, input.collection.manifests.conversations),
    artifacts: mergeArtifacts(existing.artifacts, input.collection.manifests.artifacts),
    files: mergeFiles(existing.files, input.collection.manifests.files),
    media: mergeById(existing.media, input.collection.manifests.media),
  };
  return {
    ...input.collection,
    manifests,
    metadataCounts: {
      projects: manifests.projects.length,
      conversations: manifests.conversations.length,
      artifacts: manifests.artifacts.length,
      files: manifests.files.length,
      media: manifests.media.length,
    },
  };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of existing) {
    if (item?.id) merged.set(item.id, item);
  }
  for (const item of incoming) {
    if (item?.id) merged.set(item.id, { ...(merged.get(item.id) ?? {}), ...item });
  }
  return [...merged.values()];
}

function mergeArtifacts(
  existing: readonly ConversationArtifact[],
  incoming: readonly ConversationArtifact[],
): ConversationArtifact[] {
  return mergeByKey(existing, incoming, artifactKey);
}

function mergeFiles(existing: readonly FileRef[], incoming: readonly FileRef[]): FileRef[] {
  return mergeByKey(existing, incoming, fileKey);
}

function mergeByKey<T extends object>(
  existing: readonly T[],
  incoming: readonly T[],
  createKey: (item: T) => string | null,
): T[] {
  const merged = new Map<string, T>();
  for (const item of existing) {
    const key = createKey(item);
    if (key) merged.set(key, item);
  }
  for (const item of incoming) {
    const key = createKey(item);
    if (key) merged.set(key, { ...(merged.get(key) ?? {}), ...item });
  }
  return [...merged.values()];
}

function artifactKey(artifact: ConversationArtifact): string | null {
  if (!artifact?.id) return null;
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
  const conversationId = typeof metadata.conversationId === 'string' ? metadata.conversationId : '';
  return `${conversationId}:${artifact.id}`;
}

function fileKey(file: FileRef): string | null {
  if (!file?.id) return null;
  return `${file.provider ?? 'unknown'}:${file.source ?? 'unknown'}:${file.id}`;
}

function createConfigBackedAccountMirrorMetadataCollector(
  config: Record<string, unknown> | null | undefined,
): AccountMirrorMetadataCollector {
  return {
    async collect(input) {
      const metadataCounts = estimateMetadataCountsFromConfig(config, {
        provider: input.provider,
        runtimeProfileId: input.runtimeProfileId,
      });
      return {
        detectedIdentityKey: input.expectedIdentityKey,
        detectedAccountLevel: null,
        metadataCounts,
        manifests: {
          projects: readConfiguredArray(config, {
            provider: input.provider,
            runtimeProfileId: input.runtimeProfileId,
            key: 'projects',
          }),
          conversations: readConfiguredArray(config, {
            provider: input.provider,
            runtimeProfileId: input.runtimeProfileId,
            key: 'conversations',
          }),
          artifacts: readConfiguredArray(config, {
            provider: input.provider,
            runtimeProfileId: input.runtimeProfileId,
            key: 'artifacts',
          }),
          files: readConfiguredArray(config, {
            provider: input.provider,
            runtimeProfileId: input.runtimeProfileId,
            key: 'files',
          }),
          media: readConfiguredArray(config, {
            provider: input.provider,
            runtimeProfileId: input.runtimeProfileId,
            key: 'media',
          }),
        },
        evidence: {
          identitySource: 'configured',
          projectSampleIds: [],
          conversationSampleIds: [],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
      };
    },
  };
}

function readConfiguredArray<T = never>(
  config: Record<string, unknown> | null | undefined,
  input: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
    key: 'projects' | 'conversations' | 'artifacts' | 'files' | 'media';
  },
): T[] {
  const service = readServiceConfig(config, input);
  const rawItems = service?.[input.key];
  return Array.isArray(rawItems) ? rawItems as T[] : [];
}

function readServiceConfig(
  config: Record<string, unknown> | null | undefined,
  target: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
  },
): Record<string, unknown> | null {
  const runtimeProfile = readRuntimeProfile(config, target.runtimeProfileId);
  return isRecord(runtimeProfile?.services) && isRecord(runtimeProfile.services[target.provider])
    ? runtimeProfile.services[target.provider] as Record<string, unknown>
    : null;
}

function readSingleMirrorTarget(input: {
  registry: AccountMirrorStatusRegistry;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  explicitRefresh: boolean;
}): AccountMirrorStatusEntry | null {
  return input.registry.readStatus({
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
    explicitRefresh: input.explicitRefresh,
  }).entries[0] ?? null;
}

function resolveMirrorManagedProfileDir(input: {
  config: Record<string, unknown> | null | undefined;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
}): string {
  const config = isRecord(input.config) ? input.config : {};
  const browser = isRecord(config.browser) ? config.browser : {};
  const context = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: input.runtimeProfileId,
    browserProfileName: input.browserProfileId,
    browser: {
      ...browser,
      target: input.provider,
    },
    target: input.provider,
  });
  return context.managedProfileDir;
}

function estimateMetadataCountsFromConfig(
  config: Record<string, unknown> | null | undefined,
  target: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
  },
): AccountMirrorMetadataCounts {
  const service = readServiceConfig(config, target) ?? {};
  return {
    projects: countArrayLike(service.projects) + countOptionalString(service.projectId),
    conversations: countArrayLike(service.conversations) + countOptionalString(service.conversationId),
    artifacts: countArrayLike(service.artifacts),
    files: countArrayLike(service.files),
    media: countArrayLike(service.media) + countArrayLike(service.saved),
  };
}

function readRuntimeProfile(
  config: Record<string, unknown> | null | undefined,
  runtimeProfileId: string,
): Record<string, unknown> | null {
  if (!isRecord(config)) return null;
  const targetProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : {};
  const bridgeProfiles = isRecord(config.profiles) ? config.profiles : {};
  const runtimeProfile = isRecord(targetProfiles[runtimeProfileId])
    ? targetProfiles[runtimeProfileId]
    : isRecord(bridgeProfiles[runtimeProfileId])
      ? bridgeProfiles[runtimeProfileId]
      : null;
  return runtimeProfile;
}

function countArrayLike(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countOptionalString(value: unknown): number {
  return typeof value === 'string' && value.trim().length > 0 ? 1 : 0;
}

function summarizeBrowserOperation(operation: BrowserOperationRecord): Record<string, unknown> {
  return {
    id: operation.id,
    key: operation.key,
    kind: operation.kind,
    operationClass: operation.operationClass,
    ownerPid: operation.ownerPid,
    ownerCommand: operation.ownerCommand ?? null,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    managedProfileDir: operation.managedProfileDir ?? null,
    serviceTarget: operation.serviceTarget ?? null,
    rawDevTools: operation.rawDevTools ?? null,
    devTools: operation.devTools ?? null,
  };
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeNonNegativeInteger(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function isResolvedUserConfig(value: Record<string, unknown> | null | undefined): value is ResolvedUserConfig {
  return Boolean(
    value &&
    typeof value.auracallProfile === 'string' &&
    typeof value.model === 'string' &&
    isRecord(value.browser),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
