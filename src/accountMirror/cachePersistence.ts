import type { ResolvedUserConfig } from '../config.js';
import type { ProviderCacheContext } from '../browser/providers/cache.js';
import type {
  Conversation,
  ConversationArtifact,
  FileRef,
  Project,
} from '../browser/providers/domain.js';
import {
  createCacheStore,
  type AccountMirrorCacheSnapshot,
  type AccountMirrorMediaManifestEntry,
  type CacheStore,
  type CacheStoreKind,
} from '../browser/llmService/cache/store.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  AccountMirrorMetadataCounts,
  AccountMirrorMetadataEvidence,
  AccountMirrorStatusState,
} from './statusRegistry.js';

export interface AccountMirrorPersistenceRecord {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  boundIdentityKey: string;
  detectedIdentityKey: string | null;
  detectedAccountLevel: string | null;
  requestId: string;
  startedAt: string;
  completedAt: string;
  dispatcherKey: string | null;
  dispatcherOperationId: string | null;
  metadataCounts: AccountMirrorMetadataCounts;
  metadataEvidence: AccountMirrorMetadataEvidence | null;
  manifests: {
    projects: Project[];
    conversations: Conversation[];
    artifacts: ConversationArtifact[];
    files: FileRef[];
    media: AccountMirrorMediaManifestEntry[];
  };
}

export interface AccountMirrorPersistence {
  writeSnapshot(record: AccountMirrorPersistenceRecord): Promise<void>;
  readCatalog(input: {
    provider: AccountMirrorProvider;
    boundIdentityKey: string | null;
    limit?: number | null;
  }): Promise<{
    projects: Project[];
    conversations: Conversation[];
    artifacts: ConversationArtifact[];
    files: FileRef[];
    media: AccountMirrorMediaManifestEntry[];
  } | null>;
  readState(input: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
    browserProfileId: string | null;
    boundIdentityKey: string | null;
  }): Promise<AccountMirrorStatusState | null>;
}

export function createAccountMirrorPersistence(input: {
  config: Record<string, unknown> | null | undefined;
  cacheStore?: CacheStore;
}): AccountMirrorPersistence {
  const options = input;
  const cacheStore = options.cacheStore ?? createCacheStore(resolveCacheStoreKind(options.config));
  return {
    async writeSnapshot(record) {
      const context = createMirrorCacheContext({
        config: options.config,
        provider: record.provider,
        boundIdentityKey: record.boundIdentityKey,
      });
      const snapshot: AccountMirrorCacheSnapshot = {
        object: 'account_mirror_snapshot',
        version: 1,
        provider: record.provider,
        boundIdentityKey: record.boundIdentityKey,
        detectedIdentityKey: record.detectedIdentityKey,
        detectedAccountLevel: record.detectedAccountLevel,
        collectedAt: record.completedAt,
        metadataCounts: record.metadataCounts,
        metadataEvidence: record.metadataEvidence,
        refresh: {
          requestId: record.requestId,
          runtimeProfileId: record.runtimeProfileId,
          browserProfileId: record.browserProfileId,
          startedAt: record.startedAt,
          completedAt: record.completedAt,
          dispatcherKey: record.dispatcherKey,
          dispatcherOperationId: record.dispatcherOperationId,
        },
      };
      await cacheStore.writeAccountMirrorSnapshot(context, snapshot);
      await cacheStore.writeProjects(context, record.manifests.projects);
      await cacheStore.writeConversations(context, record.manifests.conversations);
      await cacheStore.writeAccountMirrorArtifacts(context, record.manifests.artifacts);
      await cacheStore.writeAccountMirrorFiles(context, record.manifests.files);
      await cacheStore.writeAccountMirrorMedia(context, record.manifests.media);
    },
    async readCatalog(request) {
      if (!request.boundIdentityKey) {
        return null;
      }
      const context = createMirrorCacheContext({
        config: options.config,
        provider: request.provider,
        boundIdentityKey: request.boundIdentityKey,
      });
      const limit = normalizeLimit(request.limit);
      const [
        projects,
        conversations,
        artifacts,
        files,
        media,
      ] = await Promise.all([
        cacheStore.readProjects(context),
        cacheStore.readConversations(context),
        cacheStore.readAccountMirrorArtifacts(context),
        cacheStore.readAccountMirrorFiles(context),
        cacheStore.readAccountMirrorMedia(context),
      ]);
      return {
        projects: projects.items.slice(0, limit),
        conversations: conversations.items.slice(0, limit),
        artifacts: artifacts.items.slice(0, limit),
        files: files.items.slice(0, limit),
        media: media.items.slice(0, limit),
      };
    },
    async readState(request) {
      if (!request.boundIdentityKey) {
        return null;
      }
      const context = createMirrorCacheContext({
        config: options.config,
        provider: request.provider,
        boundIdentityKey: request.boundIdentityKey,
      });
      const result = await cacheStore.readAccountMirrorSnapshot(context);
      const snapshot = result.items;
      if (!snapshot || snapshot.object !== 'account_mirror_snapshot') {
        return null;
      }
      if (
        snapshot.provider !== request.provider ||
        normalizeIdentityKey(snapshot.boundIdentityKey) !== normalizeIdentityKey(request.boundIdentityKey)
      ) {
        return null;
      }
      if (
        snapshot.refresh.runtimeProfileId !== request.runtimeProfileId ||
        snapshot.refresh.browserProfileId !== request.browserProfileId
      ) {
        return {
          detectedIdentityKey: snapshot.detectedIdentityKey,
          lastSuccessAtMs: Date.parse(snapshot.collectedAt),
          lastCompletedAtMs: Date.parse(snapshot.collectedAt),
          metadataCounts: snapshot.metadataCounts,
          metadataEvidence: snapshot.metadataEvidence,
        };
      }
      return {
        detectedIdentityKey: snapshot.detectedIdentityKey,
        lastSuccessAtMs: Date.parse(snapshot.refresh.completedAt),
        lastCompletedAtMs: Date.parse(snapshot.refresh.completedAt),
        lastRefreshRequestId: snapshot.refresh.requestId,
        lastStartedAtMs: Date.parse(snapshot.refresh.startedAt),
        lastDispatcherKey: snapshot.refresh.dispatcherKey,
        lastDispatcherOperationId: snapshot.refresh.dispatcherOperationId,
        metadataCounts: snapshot.metadataCounts,
        metadataEvidence: snapshot.metadataEvidence,
      };
    },
  };
}

function createMirrorCacheContext(input: {
  config: Record<string, unknown> | null | undefined;
  provider: AccountMirrorProvider;
  boundIdentityKey: string;
}): ProviderCacheContext {
  return {
    provider: input.provider,
    userConfig: (input.config ?? {}) as ResolvedUserConfig,
    listOptions: {},
    identityKey: normalizeIdentityKey(input.boundIdentityKey),
    cacheRoot: readCacheRoot(input.config),
  };
}

function resolveCacheStoreKind(
  config: Record<string, unknown> | null | undefined,
): CacheStoreKind {
  const configured = readNestedString(config, ['browser', 'cache', 'store']);
  if (configured === 'json' || configured === 'sqlite' || configured === 'dual') {
    return configured;
  }
  return 'dual';
}

function readCacheRoot(config: Record<string, unknown> | null | undefined): string | null {
  return readNestedString(config, ['browser', 'cache', 'rootDir']);
}

function readNestedString(
  value: Record<string, unknown> | null | undefined,
  path: string[],
): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  const trimmed = typeof current === 'string' ? current.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIdentityKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(500, Math.floor(value)));
}
