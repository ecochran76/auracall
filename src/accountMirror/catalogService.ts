import {
  createAccountMirrorPersistence,
  type AccountMirrorPersistence,
} from './cachePersistence.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import {
  createAccountMirrorStatusRegistry,
  type AccountMirrorStatusEntry,
  type AccountMirrorStatusRegistry,
} from './statusRegistry.js';
import { deriveAccountMirrorConversationFreshness } from './conversationFreshness.js';

export type AccountMirrorCatalogKind =
  | 'all'
  | 'projects'
  | 'conversations'
  | 'artifacts'
  | 'files'
  | 'media';

export interface AccountMirrorCatalogRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  kind?: AccountMirrorCatalogKind | null;
  limit?: number | null;
}

export interface AccountMirrorCatalogItemRequest extends AccountMirrorCatalogRequest {
  itemId: string;
}

export interface AccountMirrorCatalogEntry {
  provider: AccountMirrorProvider;
  tenantKey?: string | null;
  bindingKey?: string;
  runtimeProfileId: string;
  browserProfileId: string | null;
  boundIdentityKey: string | null;
  status: AccountMirrorStatusEntry['status'];
  reason: AccountMirrorStatusEntry['reason'];
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'];
  manifests: {
    projects: unknown[];
    conversations: unknown[];
    artifacts: unknown[];
    files: unknown[];
    media: unknown[];
  };
  counts: {
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  };
}

export interface AccountMirrorCatalogResult {
  object: 'account_mirror_catalog';
  generatedAt: string;
  kind: AccountMirrorCatalogKind;
  limit: number;
  entries: AccountMirrorCatalogEntry[];
  metrics: {
    targets: number;
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  };
}

export interface AccountMirrorCatalogItemResult {
  object: 'account_mirror_catalog_item';
  generatedAt: string;
  provider: AccountMirrorProvider;
  tenantKey?: string | null;
  bindingKey?: string;
  runtimeProfileId: string;
  browserProfileId: string | null;
  boundIdentityKey: string | null;
  status: AccountMirrorStatusEntry['status'];
  reason: AccountMirrorStatusEntry['reason'];
  kind: Exclude<AccountMirrorCatalogKind, 'all'>;
  itemId: string;
  item: unknown;
}

export interface AccountMirrorCatalogService {
  readCatalog(request?: AccountMirrorCatalogRequest): Promise<AccountMirrorCatalogResult>;
  readItem(request: AccountMirrorCatalogItemRequest): Promise<AccountMirrorCatalogItemResult | null>;
}

export function createAccountMirrorCatalogService(input: {
  config: Record<string, unknown> | null | undefined;
  registry?: AccountMirrorStatusRegistry;
  persistence?: AccountMirrorPersistence;
  now?: () => Date;
}): AccountMirrorCatalogService {
  const now = input.now ?? (() => new Date());
  const persistence = input.persistence ?? createAccountMirrorPersistence({
    config: input.config,
  });
  const registry = input.registry ?? createAccountMirrorStatusRegistry({
    config: input.config,
    now,
    readPersistentState: persistence.readState,
  });
  return {
    async readCatalog(request = {}) {
      await registry.refreshPersistentState?.();
      const kind = request.kind ?? 'all';
      const limit = normalizeLimit(request.limit);
      const status = registry.readStatus({
        provider: request.provider ?? null,
        runtimeProfileId: request.runtimeProfileId ?? null,
      });
      const entries: AccountMirrorCatalogEntry[] = [];
      for (const target of status.entries) {
        const catalog = await persistence.readCatalog({
          provider: target.provider,
          boundIdentityKey: target.expectedIdentityKey,
          limit,
        });
        const rawCatalog = catalog ?? {
          projects: [],
          conversations: [],
          artifacts: [],
          files: [],
          media: [],
        };
        const hydratedManifests = await hydrateCatalogManifestsWithConversationSummaries(
          persistence,
          target,
          filterCatalogKind(rawCatalog, kind),
          rawCatalog,
        );
        const manifests = annotateMaterializationEligibility(target.provider, hydratedManifests);
        entries.push({
          provider: target.provider,
          tenantKey: target.tenantKey,
          bindingKey: target.bindingKey,
          runtimeProfileId: target.runtimeProfileId,
          browserProfileId: target.browserProfileId,
          boundIdentityKey: target.expectedIdentityKey,
          status: target.status,
          reason: target.reason,
          mirrorCompleteness: target.mirrorCompleteness,
          manifests,
          counts: {
            projects: manifests.projects.length,
            conversations: manifests.conversations.length,
            artifacts: manifests.artifacts.length,
            files: manifests.files.length,
            media: manifests.media.length,
          },
        });
      }
      const metrics = entries.reduce<AccountMirrorCatalogResult['metrics']>(
        (acc, entry) => {
          acc.targets += 1;
          acc.projects += entry.counts.projects;
          acc.conversations += entry.counts.conversations;
          acc.artifacts += entry.counts.artifacts;
          acc.files += entry.counts.files;
          acc.media += entry.counts.media;
          return acc;
        },
        { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      );
      return {
        object: 'account_mirror_catalog',
        generatedAt: now().toISOString(),
        kind,
        limit,
        entries,
        metrics,
      };
    },
    async readItem(request) {
      const catalog = await this.readCatalog({
        provider: request.provider ?? null,
        runtimeProfileId: request.runtimeProfileId ?? null,
        kind: request.kind ?? 'all',
        limit: request.limit ?? 500,
      });
      const requestedId = request.itemId.trim();
      for (const entry of catalog.entries) {
        for (const kind of catalogKindsForItemLookup(request.kind ?? 'all')) {
          const items = entry.manifests[kind];
          for (const item of items) {
            const itemId = readCatalogItemId(item);
            if (itemId === requestedId) {
              const hydratedItem = kind === 'conversations'
                ? await hydrateConversationCatalogItem(persistence, entry, itemId, item)
                : item;
              return {
                object: 'account_mirror_catalog_item',
                generatedAt: now().toISOString(),
                provider: entry.provider,
                tenantKey: entry.tenantKey,
                bindingKey: entry.bindingKey,
                runtimeProfileId: entry.runtimeProfileId,
                browserProfileId: entry.browserProfileId,
                boundIdentityKey: entry.boundIdentityKey,
                status: entry.status,
                reason: entry.reason,
                kind,
                itemId,
                item: hydratedItem,
              };
            }
          }
        }
      }
      return null;
    },
  };
}

function annotateMaterializationEligibility(
  provider: AccountMirrorProvider,
  manifests: AccountMirrorCatalogEntry['manifests'],
): AccountMirrorCatalogEntry['manifests'] {
  if (provider !== 'chatgpt') return manifests;
  return {
    ...manifests,
    artifacts: manifests.artifacts.map((item) =>
      annotateCatalogItemMaterializationEligibility(item, classifyChatgptArtifactMaterializationEligibility(item)),
    ),
    files: manifests.files.map((item) =>
      annotateCatalogItemMaterializationEligibility(item, classifyChatgptFileMaterializationEligibility(item)),
    ),
  };
}

function annotateCatalogItemMaterializationEligibility(
  item: unknown,
  eligibility: { state: string; reason: string | null } | null,
): unknown {
  if (!eligibility || !isRecord(item)) return item;
  const metadata = readCatalogRecordField(item, 'metadata') ?? {};
  return {
    ...item,
    metadata: {
      ...metadata,
      materializationEligibility: eligibility,
    },
  };
}

function classifyChatgptArtifactMaterializationEligibility(item: unknown): { state: string; reason: string | null } | null {
  if (isUnsupportedChatgptAccountLibraryCatalogItem(item)) {
    return {
      state: 'unsupported_account_library_asset',
      reason: 'ChatGPT account-library artifact rows are metadata-only in the current history-materialization lane and need a separate account-library retrieval path.',
    };
  }
  if (!isChatgptStaticImageFalsePositiveCatalogItem(item)) return null;
  return {
    state: 'static_image_false_positive',
    reason: 'ChatGPT DOM image probe resolved to static chrome such as a favicon, not a generated-image binary.',
  };
}

function classifyChatgptFileMaterializationEligibility(item: unknown): { state: string; reason: string | null } | null {
  if (isUnsupportedChatgptAccountLibraryCatalogItem(item)) {
    return {
      state: 'unsupported_account_library_asset',
      reason: 'ChatGPT account-library file rows are metadata-only in the current history-materialization lane and need a separate account-library retrieval path.',
    };
  }
  if (!isUnsupportedChatgptConversationFileCatalogItem(item)) return null;
  return {
    state: 'unsupported_conversation_file',
    reason: 'ChatGPT conversation-file rows are visible in metadata but do not currently expose a retrievable provider URL or file id.',
  };
}

function isUnsupportedChatgptAccountLibraryCatalogItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const metadata = readCatalogRecordField(item, 'metadata');
  const source = readCatalogStringField(metadata, ['source']) ?? readCatalogStringField(item, ['source']);
  if (source !== 'chatgpt-library') return false;
  if (readMaterializableChatgptAccountLibraryLocation(item, metadata)) return false;
  return !(
    readCatalogStringField(item, ['conversationId']) ??
    readCatalogStringField(metadata, ['conversationId'])
  );
}

function readMaterializableChatgptAccountLibraryLocation(
  item: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
): string | null {
  const providerFileId =
    readCatalogStringField(metadata, ['providerFileId', 'fileId']) ??
    readCatalogStringField(item, ['providerFileId', 'fileId']);
  if (providerFileId?.startsWith('file_')) return providerFileId;
  const location = readMaterializableAssetLocation(item, metadata);
  if (location?.startsWith('chatgpt://file/')) return location;
  const surface = readCatalogStringField(metadata, ['materializationSurface']);
  return surface === 'chatgpt-library-file-row-click' && providerFileId ? providerFileId : null;
}

function isUnsupportedChatgptConversationFileCatalogItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const metadata = readCatalogRecordField(item, 'metadata');
  const source = readCatalogStringField(metadata, ['source', 'fileSource']);
  if (source === 'chatgpt-library') return false;
  if (readMaterializableAssetLocation(item, metadata)) return false;
  return Boolean(
    readCatalogStringField(item, ['conversationId']) ??
    readCatalogStringField(metadata, ['conversationId']),
  );
}

function isChatgptStaticImageFalsePositiveCatalogItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const metadata = readCatalogRecordField(item, 'metadata');
  const id = readCatalogStringField(item, ['id', 'providerId', 'artifactId']) ?? '';
  const extraction = readCatalogStringField(metadata, ['extraction']);
  if (!id.startsWith('image-dom:') && extraction !== 'dom-imagegen-image') return false;
  const location = readMaterializableAssetLocation(item, metadata);
  if (!location) return true;
  return isStaticChromeImageUrl(location);
}

function readMaterializableAssetLocation(item: unknown, metadata: Record<string, unknown> | null): string | null {
  return readCatalogStringField(item, [
    'uri',
    'remoteUrl',
    'url',
    'href',
    'downloadUrl',
    'sourceUrl',
    'cacheKey',
    'fileId',
    'providerFileId',
  ]) ?? readCatalogStringField(metadata, [
    'uri',
    'remoteUrl',
    'url',
    'href',
    'downloadUrl',
    'sourceUrl',
    'cacheKey',
    'fileId',
    'providerFileId',
  ]);
}

function isStaticChromeImageUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith('blob:')) return false;
  if (normalized.startsWith('chatgpt://')) return false;
  if (normalized.startsWith('sandbox:')) return false;
  if (normalized.startsWith('sediment://')) return false;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'www.google.com' && parsed.pathname === '/s2/favicons') return true;
    if (parsed.pathname.includes('/favicon')) return true;
    if (parsed.pathname.endsWith('/favicon.ico')) return true;
    return false;
  } catch {
    return false;
  }
}

async function hydrateCatalogManifestsWithConversationSummaries(
  persistence: AccountMirrorPersistence,
  target: AccountMirrorStatusEntry,
  manifests: AccountMirrorCatalogEntry['manifests'],
  rawManifests: AccountMirrorCatalogEntry['manifests'],
): Promise<AccountMirrorCatalogEntry['manifests']> {
  if (!manifests.conversations.length) return manifests;
  return {
    ...manifests,
    conversations: await Promise.all(
      manifests.conversations.map(async (item, index) => {
        const conversationId = readCatalogItemId(item);
        if (!conversationId || conversationId === 'unknown') return item;
        const contextEntry = await readConversationContextEntry(persistence, {
          provider: target.provider,
          boundIdentityKey: target.expectedIdentityKey,
          conversationId,
        });
        const base = isRecord(item) ? item : {};
        const context = contextEntry?.context ?? null;
        const detail = context
          ? {
              exists: true,
              observedAt: contextEntry?.fetchedAt ?? null,
              messageCount: context.messages.length,
              fileCount: context.files?.length ?? 0,
              artifactCount: context.artifacts?.length ?? 0,
              sourceCount: context.sources?.length ?? 0,
            }
          : {
              exists: false,
              observedAt: null,
              messageCount: null,
              fileCount: null,
              artifactCount: null,
              sourceCount: null,
            };
        const conversationFreshness = deriveAccountMirrorConversationFreshness({
          conversationId,
          item: base,
          indexRank: index,
          target: {
            lastCompletedAt: target.lastCompletedAt,
            lastSuccessAt: target.lastSuccessAt,
            reason: target.reason,
            providerGuard: target.providerGuard,
            mirrorCompleteness: target.mirrorCompleteness,
          },
          detail,
          assets: collectConversationAssets(conversationId, rawManifests, context),
        });
        const manifestCounts = countConversationManifestAssets(conversationId, rawManifests);
        if (!context) {
          return {
            ...base,
            cachedFileCount: manifestCounts.files,
            cachedArtifactCount: manifestCounts.artifacts,
            cachedMediaCount: manifestCounts.media,
            conversationFreshness,
            freshnessState: conversationFreshness.state,
            routeabilityState: conversationFreshness.routeabilityState,
          };
        }
        return {
          ...base,
          hasCachedTranscript: context.messages.length > 0,
          messageCount: context.messages.length,
          cachedFileCount: Math.max(context.files?.length ?? 0, manifestCounts.files),
          cachedSourceCount: context.sources?.length ?? 0,
          cachedArtifactCount: Math.max(context.artifacts?.length ?? 0, manifestCounts.artifacts),
          cachedMediaCount: manifestCounts.media,
          conversationFreshness,
          freshnessState: conversationFreshness.state,
          routeabilityState: conversationFreshness.routeabilityState,
        };
      }),
    ),
  };
}

async function hydrateConversationCatalogItem(
  persistence: AccountMirrorPersistence,
  entry: AccountMirrorCatalogEntry,
  conversationId: string,
  item: unknown,
): Promise<unknown> {
  const context = await persistence.readConversationContext({
    provider: entry.provider,
    boundIdentityKey: entry.boundIdentityKey,
    conversationId,
  });
  if (!context) return item;
  const base = isRecord(item) ? item : {};
  return {
    ...base,
    messages: context.messages,
    files: context.files ?? [],
    sources: context.sources ?? [],
    artifacts: context.artifacts ?? [],
  };
}

async function readConversationContextEntry(
  persistence: AccountMirrorPersistence,
  input: {
    provider: AccountMirrorProvider;
    boundIdentityKey: string | null;
    conversationId: string;
  },
): Promise<{
  context: NonNullable<Awaited<ReturnType<AccountMirrorPersistence['readConversationContext']>>>;
  fetchedAt: string | null;
  stale: boolean;
} | null> {
  if (persistence.readConversationContextEntry) {
    return persistence.readConversationContextEntry(input);
  }
  const context = await persistence.readConversationContext(input);
  return context ? { context, fetchedAt: null, stale: false } : null;
}

function collectConversationAssets(
  conversationId: string,
  manifests: AccountMirrorCatalogEntry['manifests'],
  context: Awaited<ReturnType<AccountMirrorPersistence['readConversationContext']>> | null,
): unknown[] {
  return [
    ...(context?.artifacts ?? []),
    ...(context?.files ?? []),
    ...manifests.artifacts.filter((item) => itemBelongsToConversation(item, conversationId)),
    ...manifests.files.filter((item) => itemBelongsToConversation(item, conversationId)),
    ...manifests.media.filter((item) => itemBelongsToConversation(item, conversationId)),
  ];
}

function countConversationManifestAssets(
  conversationId: string,
  manifests: AccountMirrorCatalogEntry['manifests'],
): { artifacts: number; files: number; media: number } {
  return {
    artifacts: manifests.artifacts.filter((item) => itemBelongsToConversation(item, conversationId)).length,
    files: manifests.files.filter((item) => itemBelongsToConversation(item, conversationId)).length,
    media: manifests.media.filter((item) => itemBelongsToConversation(item, conversationId)).length,
  };
}

function itemBelongsToConversation(item: unknown, conversationId: string): boolean {
  return readCatalogStringField(item, ['conversationId']) === conversationId ||
    readCatalogStringField(readCatalogRecordField(item, 'metadata'), ['conversationId']) === conversationId;
}

function readCatalogRecordField(item: unknown, field: string): Record<string, unknown> | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const value = (item as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isRecord(item: unknown): item is Record<string, unknown> {
  return Boolean(item && typeof item === 'object' && !Array.isArray(item));
}

function catalogKindsForItemLookup(kind: AccountMirrorCatalogKind): Array<Exclude<AccountMirrorCatalogKind, 'all'>> {
  if (kind === 'all') return ['projects', 'conversations', 'artifacts', 'files', 'media'];
  return [kind];
}

function readCatalogItemId(item: unknown): string {
  return readCatalogStringField(item, ['id', 'conversationId', 'projectId', 'artifactId', 'fileId', 'mediaId', 'url', 'href'])
    ?? 'unknown';
}

function readCatalogStringField(item: unknown, fields: string[]): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function filterCatalogKind(
  manifests: AccountMirrorCatalogEntry['manifests'],
  kind: AccountMirrorCatalogKind,
): AccountMirrorCatalogEntry['manifests'] {
  if (kind === 'all') return manifests;
  return {
    projects: kind === 'projects' ? manifests.projects : [],
    conversations: kind === 'conversations' ? manifests.conversations : [],
    artifacts: kind === 'artifacts' ? manifests.artifacts : [],
    files: kind === 'files' ? manifests.files : [],
    media: kind === 'media' ? manifests.media : [],
  };
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(500, Math.floor(value)));
}
