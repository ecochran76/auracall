import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  Conversation,
  ConversationArtifact,
  ConversationContext,
  FileRef,
  Project,
} from '../../providers/domain.js';
import type { CacheReadResult, ProviderCacheContext } from '../../providers/cache.js';
import {
  PROVIDER_CACHE_TTL_MS,
  readProviderAccountMirrorArtifacts,
  readProviderAccountMirrorFiles,
  readProviderAccountMirrorMedia,
  readProviderAccountMirrorSnapshot,
  readProjectCache,
  readConversationCache,
  readConversationContextCache,
  readAccountFilesCache,
  readConversationFilesCache,
  readConversationAttachmentsCache,
  readProjectKnowledgeCache,
  readProjectInstructionsCache,
  writeProjectCache,
  writeConversationCache,
  writeConversationContextCache,
  writeAccountFilesCache,
  writeConversationFilesCache,
  writeConversationAttachmentsCache,
  writeProjectKnowledgeCache,
  writeProjectInstructionsCache,
  writeProviderAccountMirrorArtifacts,
  writeProviderAccountMirrorFiles,
  writeProviderAccountMirrorMedia,
  writeProviderAccountMirrorSnapshot,
  resolveProviderCachePath,
  resolveConversationCacheFileName,
  resolveConversationCacheScopeId,
} from '../../providers/cache.js';
import { resolveCacheEntryPath, upsertCacheIndexEntry } from './index.js';
import {
  syncArtifactBindings,
  syncFileBindings,
  syncSourceLinks,
  type StagedLocalFileAsset,
} from './projectionSync.js';
import { choosePreferredGrokConversation } from '../../providers/grokAdapter.js';

export interface CachedConversationContextEntry {
  conversationId: string;
  updatedAt: string | null;
  fetchedAt: string | null;
  path: string | null;
}

const ACCOUNT_FILES_ENTITY_ID = '__account__';
const ACCOUNT_MIRROR_ENTITY_ID = '__mirror__';
const ACCOUNT_MIRROR_ARTIFACTS_ENTITY_ID = '__mirror_artifacts__';
const ACCOUNT_MIRROR_FILES_ENTITY_ID = '__mirror_files__';
const ACCOUNT_MIRROR_MEDIA_ENTITY_ID = '__mirror_media__';

export interface AccountMirrorCacheSnapshot {
  object: 'account_mirror_snapshot';
  version: 1;
  provider: string;
  boundIdentityKey: string;
  detectedIdentityKey: string | null;
  detectedAccountLevel: string | null;
  collectedAt: string;
  metadataCounts: {
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  };
  metadataEvidence: {
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
  } | null;
  refresh: {
    requestId: string;
    runtimeProfileId: string;
    browserProfileId: string | null;
    startedAt: string;
    completedAt: string;
    dispatcherKey: string | null;
    dispatcherOperationId: string | null;
  };
}

export interface AccountMirrorMediaManifestEntry {
  id: string;
  title: string | null;
  mediaType: 'image' | 'video' | 'music' | 'audio' | 'unknown';
  uri?: string;
  conversationId?: string;
  projectId?: string;
  updatedAt?: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

function resolveConversationScopeEntityId(context: ProviderCacheContext): string {
  return resolveConversationCacheScopeId(context) ?? '';
}

function isGlobalConversationScope(context: ProviderCacheContext): boolean {
  return resolveConversationCacheScopeId(context) === null;
}

function normalizeConversationTitle(
  title: string | null | undefined,
  conversationId?: string | null | undefined,
): string {
  const normalized = String(title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedId = String(conversationId ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === normalizedId) {
    return '';
  }
  return normalized;
}

function genericConversationTitleQuality(
  title: string | null | undefined,
  conversationId?: string | null | undefined,
): number {
  const normalized = normalizeConversationTitle(title, conversationId);
  if (!normalized) return 0;
  let score = 1;
  if (/\s/.test(normalized)) score += 1;
  if (normalized.length >= 12) score += 1;
  return score;
}

function choosePreferredConversation(
  existing: Conversation | null | undefined,
  candidate: Conversation,
): Conversation {
  if (!existing) {
    return candidate;
  }
  if (existing.provider === 'grok' || candidate.provider === 'grok') {
    const preferred = choosePreferredGrokConversation(existing, candidate);
    const fallback = preferred === existing ? candidate : existing;
    return {
      ...fallback,
      ...preferred,
      projectId: preferred.projectId ?? fallback.projectId,
      url: preferred.url ?? fallback.url,
      updatedAt: preferred.updatedAt ?? fallback.updatedAt,
    };
  }
  const existingQuality = genericConversationTitleQuality(existing.title, existing.id);
  const candidateQuality = genericConversationTitleQuality(candidate.title, candidate.id);
  if (candidateQuality !== existingQuality) {
    const preferred = candidateQuality > existingQuality ? candidate : existing;
    const fallback = preferred === existing ? candidate : existing;
    return {
      ...fallback,
      ...preferred,
      projectId: preferred.projectId ?? fallback.projectId,
      url: preferred.url ?? fallback.url,
      updatedAt: preferred.updatedAt ?? fallback.updatedAt,
    };
  }
  const existingTimestamp = existing.updatedAt ? Date.parse(existing.updatedAt) : Number.NEGATIVE_INFINITY;
  const candidateTimestamp = candidate.updatedAt ? Date.parse(candidate.updatedAt) : Number.NEGATIVE_INFINITY;
  if (candidateTimestamp !== existingTimestamp) {
    const preferred = candidateTimestamp > existingTimestamp ? candidate : existing;
    const fallback = preferred === existing ? candidate : existing;
    return {
      ...fallback,
      ...preferred,
      projectId: preferred.projectId ?? fallback.projectId,
      url: preferred.url ?? fallback.url,
      updatedAt: preferred.updatedAt ?? fallback.updatedAt,
    };
  }
  return {
    ...existing,
    ...candidate,
    title: existing.title || candidate.title,
    projectId: existing.projectId ?? candidate.projectId,
    url: existing.url ?? candidate.url,
    updatedAt: existing.updatedAt ?? candidate.updatedAt,
  };
}

function mergeConversationLists(lists: Conversation[][]): Conversation[] {
  const merged = new Map<string, Conversation>();
  for (const list of lists) {
    for (const item of list) {
      if (!item?.id) continue;
      merged.set(item.id, choosePreferredConversation(merged.get(item.id), item));
    }
  }
  return Array.from(merged.values());
}

function combineConversationCacheResults(
  results: CacheReadResult<Conversation[]>[],
): CacheReadResult<Conversation[]> {
  const items = mergeConversationLists(results.map((result) => result.items));
  const fetchedAt = results.reduce<number | null>((max, result) => {
    if (result.fetchedAt === null) return max;
    if (max === null) return result.fetchedAt;
    return Math.max(max, result.fetchedAt);
  }, null);
  const stale = results.length === 0 ? true : results.every((result) => result.stale);
  return { items, fetchedAt, stale };
}

async function readSupplementalProjectConversationCaches(
  context: ProviderCacheContext,
): Promise<CacheReadResult<Conversation[]>[]> {
  if (!isGlobalConversationScope(context)) {
    return [];
  }
  const { cacheDir } = resolveProviderCachePath(context, 'conversations.json');
  const projectDir = path.join(cacheDir, 'project-conversations');
  try {
    const files = await fs.readdir(projectDir, { withFileTypes: true });
    const results: CacheReadResult<Conversation[]>[] = [];
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      const projectId = file.name.replace(/\.json$/i, '').trim();
      if (!projectId) continue;
      const scopedContext: ProviderCacheContext = {
        ...context,
        listOptions: {
          ...context.listOptions,
          projectId,
        },
      };
      results.push(await readConversationCache(scopedContext));
    }
    return results;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export interface CacheStore {
  readAccountMirrorSnapshot(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorCacheSnapshot | null>>;
  writeAccountMirrorSnapshot(
    context: ProviderCacheContext,
    snapshot: AccountMirrorCacheSnapshot,
  ): Promise<void>;
  readAccountMirrorArtifacts(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<ConversationArtifact[]>>;
  writeAccountMirrorArtifacts(
    context: ProviderCacheContext,
    artifacts: ConversationArtifact[],
  ): Promise<void>;
  readAccountMirrorMedia(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorMediaManifestEntry[]>>;
  writeAccountMirrorMedia(
    context: ProviderCacheContext,
    media: AccountMirrorMediaManifestEntry[],
  ): Promise<void>;
  readAccountMirrorFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeAccountMirrorFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void>;
  readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>>;
  writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void>;
  readConversations(context: ProviderCacheContext): Promise<CacheReadResult<Conversation[]>>;
  writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void>;
  readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>>;
  writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void>;
  readAccountFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeAccountFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void>;
  readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void>;
  readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void>;
  readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void>;
  readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>>;
  writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void>;
  listConversationContexts(
    context: ProviderCacheContext,
  ): Promise<CachedConversationContextEntry[]>;
}

export class JsonCacheStore implements CacheStore {
  async readAccountMirrorSnapshot(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorCacheSnapshot | null>> {
    return readProviderAccountMirrorSnapshot<AccountMirrorCacheSnapshot>(context);
  }

  async writeAccountMirrorSnapshot(
    context: ProviderCacheContext,
    snapshot: AccountMirrorCacheSnapshot,
  ): Promise<void> {
    await writeProviderAccountMirrorSnapshot(context, snapshot);
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror',
      path: resolveCacheEntryPath(context, 'account-mirror/snapshot.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorArtifacts(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<ConversationArtifact[]>> {
    return readProviderAccountMirrorArtifacts<ConversationArtifact>(context);
  }

  async writeAccountMirrorArtifacts(
    context: ProviderCacheContext,
    artifacts: ConversationArtifact[],
  ): Promise<void> {
    await writeProviderAccountMirrorArtifacts(context, artifacts);
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-artifacts',
      path: resolveCacheEntryPath(context, 'account-mirror/artifacts.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readProviderAccountMirrorFiles<FileRef>(context);
  }

  async writeAccountMirrorFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    await writeProviderAccountMirrorFiles(context, files);
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-files',
      path: resolveCacheEntryPath(context, 'account-mirror/files.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorMedia(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorMediaManifestEntry[]>> {
    return readProviderAccountMirrorMedia<AccountMirrorMediaManifestEntry>(context);
  }

  async writeAccountMirrorMedia(
    context: ProviderCacheContext,
    media: AccountMirrorMediaManifestEntry[],
  ): Promise<void> {
    await writeProviderAccountMirrorMedia(context, media);
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-media',
      path: resolveCacheEntryPath(context, 'account-mirror/media.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>> {
    return readProjectCache(context);
  }

  async writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void> {
    await writeProjectCache(context, items);
    await upsertCacheIndexEntry(context, {
      kind: 'projects',
      path: resolveCacheEntryPath(context, 'projects.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversations(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<Conversation[]>> {
    const primary = await readConversationCache(context);
    if (!isGlobalConversationScope(context)) {
      return primary;
    }
    const supplemental = await readSupplementalProjectConversationCaches(context);
    return combineConversationCacheResults([primary, ...supplemental]);
  }

  async writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void> {
    await writeConversationCache(context, items);
    await upsertCacheIndexEntry(context, {
      kind: 'conversations',
      path: resolveCacheEntryPath(context, resolveConversationCacheFileName(context)),
      projectId: resolveConversationCacheScopeId(context) ?? undefined,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>> {
    return readConversationContextCache(context, conversationId);
  }

  async writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void> {
    await writeConversationContextCache(context, conversationId, payload);
    await upsertCacheIndexEntry(context, {
      kind: 'context',
      path: resolveCacheEntryPath(context, `contexts/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readAccountFilesCache(context);
  }

  async writeAccountFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    await writeAccountFilesCache(context, files);
    await upsertCacheIndexEntry(context, {
      kind: 'account-files',
      path: resolveCacheEntryPath(context, 'account-files.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readConversationFilesCache(context, conversationId);
  }

  async writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeConversationFilesCache(context, conversationId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-files',
      path: resolveCacheEntryPath(context, `conversation-files/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readConversationAttachmentsCache(context, conversationId);
  }

  async writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeConversationAttachmentsCache(context, conversationId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-attachments',
      path: resolveCacheEntryPath(context, `conversation-attachments/${conversationId}/manifest.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readProjectKnowledgeCache(context, projectId);
  }

  async writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeProjectKnowledgeCache(context, projectId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'project-knowledge',
      path: resolveCacheEntryPath(context, `project-knowledge/${projectId}/manifest.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>> {
    return readProjectInstructionsCache(context, projectId);
  }

  async writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void> {
    await writeProjectInstructionsCache(context, projectId, content);
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.md`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async listConversationContexts(
    context: ProviderCacheContext,
  ): Promise<CachedConversationContextEntry[]> {
    const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
    const contextsDir = path.join(cacheDir, 'contexts');
    try {
      const files = await fs.readdir(contextsDir, { withFileTypes: true });
      const rows: CachedConversationContextEntry[] = [];
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue;
        const conversationId = file.name.replace(/\.json$/i, '');
        const fullPath = path.join(contextsDir, file.name);
        let fetchedAt: string | null = null;
        let updatedAt: string | null = null;
        try {
          const raw = await fs.readFile(fullPath, 'utf8');
          const parsed = JSON.parse(raw) as { fetchedAt?: string };
          fetchedAt =
            typeof parsed.fetchedAt === 'string' && parsed.fetchedAt.trim().length > 0
              ? parsed.fetchedAt
              : null;
          if (fetchedAt) {
            updatedAt = fetchedAt;
          } else {
            const stat = await fs.stat(fullPath);
            updatedAt = stat.mtime.toISOString();
          }
        } catch {
          const stat = await fs.stat(fullPath);
          updatedAt = stat.mtime.toISOString();
        }
        rows.push({
          conversationId,
          updatedAt,
          fetchedAt,
          path: `contexts/${file.name}`,
        });
      }
      rows.sort((a, b) => {
        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return tb - ta;
      });
      return rows;
    } catch {
      return [];
    }
  }
}

type SqliteLikeDatabase = {
  exec(sql: string): unknown;
  close(): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Array<Record<string, unknown>>;
  };
};

type SqliteModule = {
  // biome-ignore lint/style/useNamingConvention: node:sqlite exposes this constructor as DatabaseSync.
  DatabaseSync: new (filename: string) => SqliteLikeDatabase;
};

let sqliteModulePromise: Promise<SqliteModule> | null = null;

async function loadSqliteModule(): Promise<SqliteModule> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite') as unknown as Promise<SqliteModule>;
  }
  return sqliteModulePromise;
}

type SqlDataset =
  | 'account-mirror'
  | 'account-mirror-artifacts'
  | 'account-mirror-files'
  | 'account-mirror-media'
  | 'projects'
  | 'conversations'
  | 'conversation-context'
  | 'account-files'
  | 'conversation-files'
  | 'conversation-attachments'
  | 'project-knowledge'
  | 'project-instructions';

type SqlMeta = {
  fetchedAt: string | null;
  sourceUrl: string | null;
};

export class SqliteCacheStore implements CacheStore {
  private readonly initPromises = new Map<string, Promise<void>>();

  async readAccountMirrorSnapshot(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorCacheSnapshot | null>> {
    return this.readDataset<AccountMirrorCacheSnapshot | null>(
      context,
      'account-mirror',
      ACCOUNT_MIRROR_ENTITY_ID,
      null,
    );
  }

  async writeAccountMirrorSnapshot(
    context: ProviderCacheContext,
    snapshot: AccountMirrorCacheSnapshot,
  ): Promise<void> {
    await this.writeDataset(context, 'account-mirror', ACCOUNT_MIRROR_ENTITY_ID, snapshot);
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror',
      path: resolveCacheEntryPath(context, 'account-mirror/snapshot.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorArtifacts(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<ConversationArtifact[]>> {
    return this.readDataset<ConversationArtifact[]>(
      context,
      'account-mirror-artifacts',
      ACCOUNT_MIRROR_ARTIFACTS_ENTITY_ID,
      [],
    );
  }

  async writeAccountMirrorArtifacts(
    context: ProviderCacheContext,
    artifacts: ConversationArtifact[],
  ): Promise<void> {
    await this.writeDataset(
      context,
      'account-mirror-artifacts',
      ACCOUNT_MIRROR_ARTIFACTS_ENTITY_ID,
      artifacts,
    );
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-artifacts',
      path: resolveCacheEntryPath(context, 'account-mirror/artifacts.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readDataset<FileRef[]>(
      context,
      'account-mirror-files',
      ACCOUNT_MIRROR_FILES_ENTITY_ID,
      [],
    );
  }

  async writeAccountMirrorFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    await this.writeDataset(
      context,
      'account-mirror-files',
      ACCOUNT_MIRROR_FILES_ENTITY_ID,
      files,
    );
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-files',
      path: resolveCacheEntryPath(context, 'account-mirror/files.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountMirrorMedia(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorMediaManifestEntry[]>> {
    return this.readDataset<AccountMirrorMediaManifestEntry[]>(
      context,
      'account-mirror-media',
      ACCOUNT_MIRROR_MEDIA_ENTITY_ID,
      [],
    );
  }

  async writeAccountMirrorMedia(
    context: ProviderCacheContext,
    media: AccountMirrorMediaManifestEntry[],
  ): Promise<void> {
    await this.writeDataset(
      context,
      'account-mirror-media',
      ACCOUNT_MIRROR_MEDIA_ENTITY_ID,
      media,
    );
    await upsertCacheIndexEntry(context, {
      kind: 'account-mirror-media',
      path: resolveCacheEntryPath(context, 'account-mirror/media.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>> {
    return this.readDataset<Project[]>(context, 'projects', '', []);
  }

  async writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void> {
    await this.writeDataset(context, 'projects', '', items);
    await upsertCacheIndexEntry(context, {
      kind: 'projects',
      path: resolveCacheEntryPath(context, 'projects.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversations(context: ProviderCacheContext): Promise<CacheReadResult<Conversation[]>> {
    if (!isGlobalConversationScope(context)) {
      return this.readDataset<Conversation[]>(context, 'conversations', resolveConversationScopeEntityId(context), []);
    }
    const dbPath = await this.ensureDatabase(context);
    return this.withDatabase(dbPath, async (db) => {
      const rows = db
        .prepare(
          'SELECT entity_id, items_json, fetched_at, source_url FROM cache_entries WHERE dataset = ?',
        )
        .all('conversations');
      if (!rows.length) {
        return { items: [], fetchedAt: null, stale: true };
      }
      const ttlMs = context.ttlMs && Number.isFinite(context.ttlMs) && context.ttlMs > 0
        ? context.ttlMs
        : PROVIDER_CACHE_TTL_MS;
      const now = Date.now();
      const configuredUrl = context.listOptions.configuredUrl ?? null;
      const results: CacheReadResult<Conversation[]>[] = rows.map((row) => {
        let items: Conversation[] = [];
        try {
          const raw = typeof row.items_json === 'string' ? row.items_json : '';
          const parsed = JSON.parse(raw) as Conversation[];
          if (Array.isArray(parsed)) {
            items = parsed;
          }
        } catch {
          items = [];
        }
        const fetchedAt =
          typeof row.fetched_at === 'string' && row.fetched_at.trim().length > 0
            ? Date.parse(row.fetched_at)
            : NaN;
        const tooOld = Number.isFinite(fetchedAt) ? now - fetchedAt > ttlMs : true;
        const sourceUrl =
          typeof row.source_url === 'string' && row.source_url.trim().length > 0
            ? row.source_url.trim()
            : null;
        const urlMismatch =
          typeof configuredUrl === 'string' &&
          configuredUrl.length > 0 &&
          typeof sourceUrl === 'string' &&
          sourceUrl.length > 0 &&
          configuredUrl !== sourceUrl;
        return {
          items,
          fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
          stale: tooOld || urlMismatch,
        };
      });
      return combineConversationCacheResults(results);
    });
  }

  async writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void> {
    await this.writeDataset(context, 'conversations', resolveConversationScopeEntityId(context), items);
    await upsertCacheIndexEntry(context, {
      kind: 'conversations',
      path: resolveCacheEntryPath(context, resolveConversationCacheFileName(context)),
      projectId: resolveConversationCacheScopeId(context) ?? undefined,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>> {
    return this.readDataset<ConversationContext>(context, 'conversation-context', conversationId, {
      provider: context.provider,
      conversationId,
      messages: [],
    });
  }

  async writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, 'conversation-context', conversationId, payload);
    await this.syncConversationContextRelations(dbPath, context, conversationId, payload);
    await upsertCacheIndexEntry(context, {
      kind: 'context',
      path: resolveCacheEntryPath(context, `contexts/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readAccountFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readDataset<FileRef[]>(context, 'account-files', ACCOUNT_FILES_ENTITY_ID, []);
  }

  async writeAccountFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, 'account-files', ACCOUNT_FILES_ENTITY_ID, files);
    await this.syncFileBindings(dbPath, context, {
      dataset: 'account-files',
      entityId: ACCOUNT_FILES_ENTITY_ID,
      conversationId: null,
      projectId: null,
      files,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'account-files',
      path: resolveCacheEntryPath(context, 'account-files.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readDataset<FileRef[]>(context, 'conversation-files', conversationId, []);
  }

  async writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, 'conversation-files', conversationId, files);
    await this.syncFileBindings(dbPath, context, {
      dataset: 'conversation-files',
      entityId: conversationId,
      conversationId,
      projectId: null,
      files,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-files',
      path: resolveCacheEntryPath(context, `conversation-files/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readDataset<FileRef[]>(context, 'conversation-attachments', conversationId, []);
  }

  async writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, 'conversation-attachments', conversationId, files);
    await this.syncFileBindings(dbPath, context, {
      dataset: 'conversation-attachments',
      entityId: conversationId,
      conversationId,
      projectId: null,
      files,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-attachments',
      path: resolveCacheEntryPath(context, `conversation-attachments/${conversationId}/manifest.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readDataset<FileRef[]>(context, 'project-knowledge', projectId, []);
  }

  async writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, 'project-knowledge', projectId, files);
    await this.syncFileBindings(dbPath, context, {
      dataset: 'project-knowledge',
      entityId: projectId,
      conversationId: null,
      projectId,
      files,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'project-knowledge',
      path: resolveCacheEntryPath(context, `project-knowledge/${projectId}/manifest.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>> {
    return this.readDataset<{ content: string; format: 'md' }>(
      context,
      'project-instructions',
      projectId,
      { content: '', format: 'md' },
    );
  }

  async writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void> {
    const payload = { content, format: 'md' as const };
    await this.writeDataset(context, 'project-instructions', projectId, payload);
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.md`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
    const cacheDir = this.resolveCacheDir(context);
    const mdPath = path.join(cacheDir, 'project-instructions', `${projectId}.md`);
    await fs.mkdir(path.dirname(mdPath), { recursive: true });
    await fs.writeFile(mdPath, `${content.trim()}\n`, 'utf8');
  }

  async listConversationContexts(
    context: ProviderCacheContext,
  ): Promise<CachedConversationContextEntry[]> {
    const dbPath = await this.ensureDatabase(context);
    return this.withDatabase(dbPath, async (db) => {
      const rows = db
        .prepare(
          `SELECT entity_id, fetched_at, updated_at
             FROM cache_entries
            WHERE dataset = ?
            ORDER BY updated_at DESC`,
        )
        .all('conversation-context');
      return rows
        .map((row) => {
          const conversationId = typeof row.entity_id === 'string' ? row.entity_id : '';
          if (!conversationId) return null;
          const fetchedAt =
            typeof row.fetched_at === 'string' && row.fetched_at.trim().length > 0
              ? row.fetched_at
              : null;
          const updatedAt =
            typeof row.updated_at === 'string' && row.updated_at.trim().length > 0
              ? row.updated_at
              : fetchedAt;
          return {
            conversationId,
            updatedAt,
            fetchedAt,
            path: `contexts/${conversationId}.json`,
          } as CachedConversationContextEntry;
        })
        .filter((row): row is CachedConversationContextEntry => Boolean(row));
    });
  }

  private async readDataset<T>(
    context: ProviderCacheContext,
    dataset: SqlDataset,
    entityId: string,
    fallback: T,
  ): Promise<CacheReadResult<T>> {
    const dbPath = await this.ensureDatabase(context);
    return this.withDatabase(dbPath, async (db) => {
      const row = db
        .prepare(
          'SELECT items_json, fetched_at, source_url FROM cache_entries WHERE dataset = ? AND entity_id = ?',
        )
        .get(dataset, entityId);
      if (!row) {
        return { items: fallback, fetchedAt: null, stale: true };
      }
      let items = fallback;
      try {
        const raw = typeof row.items_json === 'string' ? row.items_json : '';
        const parsed = JSON.parse(raw) as T;
        if (parsed !== undefined && parsed !== null) {
          items = parsed;
        }
      } catch {
        items = fallback;
      }
      const fetchedAtRaw = typeof row.fetched_at === 'string' ? row.fetched_at : '';
      const fetchedAt = fetchedAtRaw ? Date.parse(fetchedAtRaw) : NaN;
      const stale = this.isStale(
        context,
        Number.isFinite(fetchedAt) ? fetchedAt : null,
        typeof row.source_url === 'string' ? row.source_url : null,
      );
      return {
        items,
        fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
        stale,
      };
    });
  }

  private async writeDataset<T>(
    context: ProviderCacheContext,
    dataset: SqlDataset,
    entityId: string,
    items: T,
    meta?: SqlMeta,
  ): Promise<void> {
    const dbPath = await this.ensureDatabase(context);
    await this.writeDatasetAtPath(dbPath, context, dataset, entityId, items, meta);
  }

  private async writeDatasetAtPath<T>(
    dbPath: string,
    context: ProviderCacheContext,
    dataset: SqlDataset,
    entityId: string,
    items: T,
    meta?: SqlMeta,
  ): Promise<void> {
    await this.withDatabase(dbPath, async (db) => {
      const nowIso = new Date().toISOString();
      db.prepare(
        `INSERT INTO cache_entries (
          dataset, entity_id, items_json, fetched_at, source_url, user_identity_json, identity_key, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dataset, entity_id) DO UPDATE SET
          items_json = excluded.items_json,
          fetched_at = excluded.fetched_at,
          source_url = excluded.source_url,
          user_identity_json = excluded.user_identity_json,
          identity_key = excluded.identity_key,
          updated_at = excluded.updated_at`,
      ).run(
        dataset,
        entityId,
        JSON.stringify(items),
        meta?.fetchedAt ?? nowIso,
        meta?.sourceUrl ?? context.listOptions.configuredUrl ?? null,
        JSON.stringify(context.userIdentity ?? null),
        context.identityKey ?? null,
        nowIso,
      );
    });
  }

  private resolveCacheDir(context: ProviderCacheContext): string {
    const { cacheDir } = resolveProviderCachePath(context, 'projects.json');
    return cacheDir;
  }

  private resolveDbPath(context: ProviderCacheContext): string {
    return path.join(this.resolveCacheDir(context), 'cache.sqlite');
  }

  private async ensureDatabase(context: ProviderCacheContext): Promise<string> {
    const dbPath = this.resolveDbPath(context);
    let init = this.initPromises.get(dbPath);
    if (!init) {
      init = this.initializeDatabase(context, dbPath);
      this.initPromises.set(dbPath, init);
    }
    await init;
    return dbPath;
  }

  private async initializeDatabase(context: ProviderCacheContext, dbPath: string): Promise<void> {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await this.withDatabase(dbPath, async (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cache_entries (
          dataset TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          items_json TEXT NOT NULL,
          fetched_at TEXT,
          source_url TEXT,
          user_identity_json TEXT,
          identity_key TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (dataset, entity_id)
        );
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_assets (
          asset_id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          identity_key TEXT,
          size_bytes INTEGER,
          mime_type TEXT,
          storage_relpath TEXT,
          status TEXT NOT NULL DEFAULT 'remote_only',
          checksum_sha256 TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_bindings (
          binding_id TEXT PRIMARY KEY,
          dataset TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          conversation_id TEXT,
          project_id TEXT,
          message_index INTEGER,
          role TEXT,
          provider_file_id TEXT,
          display_name TEXT NOT NULL,
          provider TEXT NOT NULL,
          source TEXT,
          size_bytes INTEGER,
          remote_url TEXT,
          asset_id TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(dataset, entity_id, provider_file_id, display_name)
        );
        CREATE TABLE IF NOT EXISTS source_links (
          source_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          message_index INTEGER,
          url TEXT NOT NULL,
          domain TEXT,
          title TEXT,
          source_group TEXT,
          provider TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(conversation_id, message_index, url)
        );
        CREATE TABLE IF NOT EXISTS artifact_bindings (
          artifact_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          message_index INTEGER,
          message_id TEXT,
          title TEXT NOT NULL,
          kind TEXT,
          uri TEXT,
          provider TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(conversation_id, message_index, title, kind, uri)
        );
        CREATE INDEX IF NOT EXISTS idx_file_bindings_conversation
          ON file_bindings(conversation_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_file_bindings_project
          ON file_bindings(project_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_source_links_conversation
          ON source_links(conversation_id, message_index, updated_at);
        CREATE INDEX IF NOT EXISTS idx_artifact_bindings_conversation
          ON artifact_bindings(conversation_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_artifact_bindings_kind
          ON artifact_bindings(kind, updated_at);
        CREATE INDEX IF NOT EXISTS idx_artifact_bindings_message
          ON artifact_bindings(message_id, updated_at);
      `);
      const nowIso = new Date().toISOString();
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(1, 'base cache schema', nowIso);
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(2, 'file catalog + source links', nowIso);
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(3, 'catalog backfill + file asset pointers', nowIso);
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(4, 'artifact bindings + projection sync seam', nowIso);
    });
    await this.backfillFromJsonIfNeeded(context, dbPath);
    await this.backfillCatalogFromEntriesIfNeeded(context, dbPath);
  }

  private async backfillFromJsonIfNeeded(context: ProviderCacheContext, dbPath: string): Promise<void> {
    const backfilled = await this.withDatabase(dbPath, async (db) => {
      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('backfill_v1');
      return row?.value === '1';
    });
    if (backfilled) return;

    const projects = await readProjectCache(context);
    if (projects.fetchedAt !== null) {
      await this.writeDatasetAtPath(dbPath, context, 'projects', '', projects.items, {
        fetchedAt: new Date(projects.fetchedAt).toISOString(),
        sourceUrl: null,
      });
    }
    const conversations = await readConversationCache(context);
    if (conversations.fetchedAt !== null) {
      await this.writeDatasetAtPath(dbPath, context, 'conversations', '', conversations.items, {
        fetchedAt: new Date(conversations.fetchedAt).toISOString(),
        sourceUrl: null,
      });
    }

    for (const id of await this.listJsonIds(path.join(this.resolveCacheDir(context), 'contexts'))) {
      const entry = await readConversationContextCache(context, id);
      if (entry.fetchedAt === null) continue;
      await this.writeDatasetAtPath(dbPath, context, 'conversation-context', id, entry.items, {
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
      await this.syncConversationContextRelations(dbPath, context, id, entry.items);
    }
    const accountFilesEntry = await readAccountFilesCache(context);
    if (accountFilesEntry.fetchedAt !== null) {
      await this.writeDatasetAtPath(dbPath, context, 'account-files', ACCOUNT_FILES_ENTITY_ID, accountFilesEntry.items, {
        fetchedAt: new Date(accountFilesEntry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
      await this.syncFileBindings(dbPath, context, {
        dataset: 'account-files',
        entityId: ACCOUNT_FILES_ENTITY_ID,
        conversationId: null,
        projectId: null,
        files: accountFilesEntry.items,
      });
    }
    for (const id of await this.listJsonIds(path.join(this.resolveCacheDir(context), 'conversation-files'))) {
      const entry = await readConversationFilesCache(context, id);
      if (entry.fetchedAt === null) continue;
      await this.writeDatasetAtPath(dbPath, context, 'conversation-files', id, entry.items, {
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
      await this.syncFileBindings(dbPath, context, {
        dataset: 'conversation-files',
        entityId: id,
        conversationId: id,
        projectId: null,
        files: entry.items,
      });
    }
    for (const id of await this.listManifestIds(path.join(this.resolveCacheDir(context), 'conversation-attachments'))) {
      const entry = await readConversationAttachmentsCache(context, id);
      if (entry.fetchedAt === null) continue;
      await this.writeDatasetAtPath(dbPath, context, 'conversation-attachments', id, entry.items, {
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
      await this.syncFileBindings(dbPath, context, {
        dataset: 'conversation-attachments',
        entityId: id,
        conversationId: id,
        projectId: null,
        files: entry.items,
      });
    }
    for (const id of await this.listManifestIds(path.join(this.resolveCacheDir(context), 'project-knowledge'))) {
      const entry = await readProjectKnowledgeCache(context, id);
      if (entry.fetchedAt === null) continue;
      await this.writeDatasetAtPath(dbPath, context, 'project-knowledge', id, entry.items, {
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
      await this.syncFileBindings(dbPath, context, {
        dataset: 'project-knowledge',
        entityId: id,
        conversationId: null,
        projectId: id,
        files: entry.items,
      });
    }
    for (const id of await this.listJsonIds(path.join(this.resolveCacheDir(context), 'project-instructions'))) {
      const entry = await readProjectInstructionsCache(context, id);
      if (entry.fetchedAt === null) continue;
      await this.writeDatasetAtPath(dbPath, context, 'project-instructions', id, entry.items, {
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        sourceUrl: null,
      });
    }

    await this.withDatabase(dbPath, async (db) => {
      db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run('backfill_v1', '1');
    });
  }

  private async backfillCatalogFromEntriesIfNeeded(
    context: ProviderCacheContext,
    dbPath: string,
  ): Promise<void> {
    const alreadyBackfilled = await this.withDatabase(dbPath, async (db) => {
      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('backfill_catalog_v2');
      return row?.value === '1';
    });
    if (alreadyBackfilled) return;

    type CatalogRow = {
      dataset: SqlDataset;
      entity_id: string;
      items_json: string;
    };
    const rows = await this.withDatabase(dbPath, async (db) =>
      db
        .prepare(
          `SELECT dataset, entity_id, items_json
             FROM cache_entries
            WHERE dataset IN (?, ?, ?, ?, ?)`,
        )
        .all(
          'account-files',
          'conversation-context',
          'conversation-files',
          'conversation-attachments',
          'project-knowledge',
        ) as CatalogRow[],
    );

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.items_json);
      } catch {
        continue;
      }
      if (row.dataset === 'conversation-context') {
        const contextPayload =
          parsed && typeof parsed === 'object'
            ? (parsed as ConversationContext)
            : null;
        if (contextPayload) {
          await this.syncConversationContextRelations(
            dbPath,
            context,
            row.entity_id,
            contextPayload,
          );
        }
        continue;
      }
      if (!Array.isArray(parsed)) {
        continue;
      }
      const files = parsed.filter((item) => item && typeof item === 'object') as FileRef[];
      await this.syncFileBindings(dbPath, context, {
        dataset: row.dataset,
        entityId: row.entity_id,
        conversationId:
          row.dataset === 'conversation-files' || row.dataset === 'conversation-attachments'
            ? row.entity_id
            : null,
        projectId: row.dataset === 'project-knowledge' ? row.entity_id : null,
        files,
      });
    }

    await this.withDatabase(dbPath, async (db) => {
      db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run('backfill_catalog_v2', '1');
    });
  }

  private async listJsonIds(dir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      return files
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name.replace(/\.json$/i, ''));
    } catch {
      return [];
    }
  }

  private async listManifestIds(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  private async syncConversationContextRelations(
    dbPath: string,
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void> {
    await this.withDatabase(dbPath, async (db) => {
      const hashId = this.hashId.bind(this);
      const sources = Array.isArray(payload.sources) ? payload.sources : [];
      await syncSourceLinks(db, context, conversationId, sources, hashId);
      const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
      await syncArtifactBindings(db, context, conversationId, artifacts, hashId);
      const files = Array.isArray(payload.files) ? payload.files : [];
      await syncFileBindings(
        db,
        context,
        {
          dataset: 'conversation-context',
          entityId: conversationId,
          conversationId,
          projectId: null,
          files,
        },
        {
          cacheDir: this.resolveCacheDir(context),
          hashId,
          stageLocalFileAsset: this.stageLocalFileAsset.bind(this),
        },
      );
    });
  }

  private async syncFileBindings(
    dbPath: string,
    context: ProviderCacheContext,
    input: {
      dataset: SqlDataset;
      entityId: string;
      conversationId: string | null;
      projectId: string | null;
      files: FileRef[];
    },
  ): Promise<void> {
    await this.withDatabase(dbPath, async (db) => {
      await syncFileBindings(
        db,
        context,
        input,
        {
          cacheDir: this.resolveCacheDir(context),
          hashId: this.hashId.bind(this),
          stageLocalFileAsset: this.stageLocalFileAsset.bind(this),
        },
      );
    });
  }

  private async stageLocalFileAsset(
    cacheDir: string,
    file: FileRef,
    fallbackName: string,
  ): Promise<StagedLocalFileAsset> {
    const localPathRaw = typeof file.localPath === 'string' ? file.localPath.trim() : '';
    const mimeType =
      typeof file.mimeType === 'string' && file.mimeType.trim().length > 0
        ? file.mimeType.trim()
        : null;
    const givenChecksum =
      typeof file.checksumSha256 === 'string' && file.checksumSha256.trim().length > 0
        ? file.checksumSha256.trim()
        : null;
    if (!localPathRaw) {
      return {
        absolutePath: null,
        storageRelpath: null,
        sourceLocalPath: null,
        sizeBytes: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null,
        checksumSha256: givenChecksum,
        mimeType,
        status: 'external_path',
      };
    }
    const sourcePointer = this.resolveStoragePointer(cacheDir, localPathRaw);
    const sourceAbsolute = sourcePointer.absolutePath;
    const exists = await this.pathExists(sourceAbsolute);
    if (!exists) {
      return {
        absolutePath: sourceAbsolute,
        storageRelpath: sourcePointer.storageRelpath,
        sourceLocalPath: sourceAbsolute,
        sizeBytes: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null,
        checksumSha256: givenChecksum,
        mimeType,
        status: 'missing_local',
      };
    }
    const stat = await fs.stat(sourceAbsolute);
    const checksumSha256 = givenChecksum ?? (await this.computeFileChecksum(sourceAbsolute));
    const safeName = this.sanitizeFileName(file.name || fallbackName || path.basename(sourceAbsolute));
    const blobRelpath = checksumSha256
      ? path.posix.join('blobs', checksumSha256, safeName || 'file.bin')
      : null;
    const blobAbsolute = blobRelpath ? path.join(cacheDir, blobRelpath) : sourceAbsolute;
    if (blobRelpath) {
      const targetExists = await this.pathExists(blobAbsolute);
      if (!targetExists) {
        await fs.mkdir(path.dirname(blobAbsolute), { recursive: true });
        await fs.copyFile(sourceAbsolute, blobAbsolute);
      }
    }
    return {
      absolutePath: blobAbsolute,
      storageRelpath: blobRelpath ?? sourcePointer.storageRelpath,
      sourceLocalPath: sourceAbsolute,
      sizeBytes: stat.size,
      checksumSha256,
      mimeType,
      status: blobRelpath || sourcePointer.storageRelpath ? 'local_cached' : 'external_path',
    };
  }

  private resolveStoragePointer(
    cacheDir: string,
    rawPath: string,
  ): { absolutePath: string; storageRelpath: string | null } {
    const absolutePath = path.isAbsolute(rawPath)
      ? path.normalize(rawPath)
      : path.resolve(process.cwd(), rawPath);
    const relativePath = path.relative(cacheDir, absolutePath);
    const isInsideCache =
      relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    return {
      absolutePath,
      storageRelpath: isInsideCache ? relativePath.replace(/\\/g, '/') : null,
    };
  }

  private hashId(parts: string[]): string {
    const digest = createHash('sha256')
      .update(parts.join('\u001f'))
      .digest('hex');
    return digest.slice(0, 40);
  }

  private sanitizeFileName(value: string): string {
    return value
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async computeFileChecksum(targetPath: string): Promise<string | null> {
    try {
      const buffer = await fs.readFile(targetPath);
      return createHash('sha256').update(buffer).digest('hex');
    } catch {
      return null;
    }
  }

  private isStale(
    context: ProviderCacheContext,
    fetchedAt: number | null,
    sourceUrl: string | null,
  ): boolean {
    const ttlMs = resolveCacheTtl(context);
    if (fetchedAt === null) return true;
    if (Date.now() - fetchedAt > ttlMs) return true;
    const configuredUrl = context.listOptions.configuredUrl ?? null;
    if (
      typeof configuredUrl === 'string' &&
      configuredUrl.length > 0 &&
      typeof sourceUrl === 'string' &&
      sourceUrl.length > 0 &&
      configuredUrl !== sourceUrl
    ) {
      return true;
    }
    return false;
  }

  private async withDatabase<T>(
    dbPath: string,
    callback: (db: SqliteLikeDatabase) => Promise<T>,
  ): Promise<T> {
    let sqlite: SqliteModule;
    try {
      sqlite = await loadSqliteModule();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SQLite cache backend is unavailable (node:sqlite). ${detail}`,
      );
    }
    const db = new sqlite.DatabaseSync(dbPath);
    try {
      return await callback(db);
    } finally {
      db.close();
    }
  }
}

class DualCacheStore implements CacheStore {
  constructor(
    private readonly primary: CacheStore,
    private readonly secondary: CacheStore,
  ) {}

  async readAccountMirrorSnapshot(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorCacheSnapshot | null>> {
    return this.readThrough(
      context,
      () => this.primary.readAccountMirrorSnapshot(context),
      () => this.secondary.readAccountMirrorSnapshot(context),
      (items) => items ? this.primary.writeAccountMirrorSnapshot(context, items) : Promise.resolve(),
    );
  }

  async writeAccountMirrorSnapshot(
    context: ProviderCacheContext,
    snapshot: AccountMirrorCacheSnapshot,
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeAccountMirrorSnapshot(context, snapshot),
      () => this.secondary.writeAccountMirrorSnapshot(context, snapshot),
      'writeAccountMirrorSnapshot',
    );
  }

  async readAccountMirrorArtifacts(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<ConversationArtifact[]>> {
    return this.readThrough(
      context,
      () => this.primary.readAccountMirrorArtifacts(context),
      () => this.secondary.readAccountMirrorArtifacts(context),
      (items) => this.primary.writeAccountMirrorArtifacts(context, items),
    );
  }

  async writeAccountMirrorArtifacts(
    context: ProviderCacheContext,
    artifacts: ConversationArtifact[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeAccountMirrorArtifacts(context, artifacts),
      () => this.secondary.writeAccountMirrorArtifacts(context, artifacts),
      'writeAccountMirrorArtifacts',
    );
  }

  async readAccountMirrorFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readThrough(
      context,
      () => this.primary.readAccountMirrorFiles(context),
      () => this.secondary.readAccountMirrorFiles(context),
      (items) => this.primary.writeAccountMirrorFiles(context, items),
    );
  }

  async writeAccountMirrorFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeAccountMirrorFiles(context, files),
      () => this.secondary.writeAccountMirrorFiles(context, files),
      'writeAccountMirrorFiles',
    );
  }

  async readAccountMirrorMedia(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<AccountMirrorMediaManifestEntry[]>> {
    return this.readThrough(
      context,
      () => this.primary.readAccountMirrorMedia(context),
      () => this.secondary.readAccountMirrorMedia(context),
      (items) => this.primary.writeAccountMirrorMedia(context, items),
    );
  }

  async writeAccountMirrorMedia(
    context: ProviderCacheContext,
    media: AccountMirrorMediaManifestEntry[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeAccountMirrorMedia(context, media),
      () => this.secondary.writeAccountMirrorMedia(context, media),
      'writeAccountMirrorMedia',
    );
  }

  async readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>> {
    return this.readThrough(context, () => this.primary.readProjects(context), () => this.secondary.readProjects(context), (items) => this.primary.writeProjects(context, items));
  }

  async writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeProjects(context, items),
      () => this.secondary.writeProjects(context, items),
      'writeProjects',
    );
  }

  async readConversations(context: ProviderCacheContext): Promise<CacheReadResult<Conversation[]>> {
    return this.readThrough(context, () => this.primary.readConversations(context), () => this.secondary.readConversations(context), (items) => this.primary.writeConversations(context, items));
  }

  async writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeConversations(context, items),
      () => this.secondary.writeConversations(context, items),
      'writeConversations',
    );
  }

  async readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>> {
    return this.readThrough(
      context,
      () => this.primary.readConversationContext(context, conversationId),
      () => this.secondary.readConversationContext(context, conversationId),
      (items) => this.primary.writeConversationContext(context, conversationId, items),
    );
  }

  async writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeConversationContext(context, conversationId, payload),
      () => this.secondary.writeConversationContext(context, conversationId, payload),
      'writeConversationContext',
    );
  }

  async readAccountFiles(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readThrough(
      context,
      () => this.primary.readAccountFiles(context),
      () => this.secondary.readAccountFiles(context),
      (items) => this.primary.writeAccountFiles(context, items),
    );
  }

  async writeAccountFiles(
    context: ProviderCacheContext,
    files: FileRef[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeAccountFiles(context, files),
      () => this.secondary.writeAccountFiles(context, files),
      'writeAccountFiles',
    );
  }

  async readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readThrough(
      context,
      () => this.primary.readConversationFiles(context, conversationId),
      () => this.secondary.readConversationFiles(context, conversationId),
      (items) => this.primary.writeConversationFiles(context, conversationId, items),
    );
  }

  async writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeConversationFiles(context, conversationId, files),
      () => this.secondary.writeConversationFiles(context, conversationId, files),
      'writeConversationFiles',
    );
  }

  async readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readThrough(
      context,
      () => this.primary.readConversationAttachments(context, conversationId),
      () => this.secondary.readConversationAttachments(context, conversationId),
      (items) => this.primary.writeConversationAttachments(context, conversationId, items),
    );
  }

  async writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeConversationAttachments(context, conversationId, files),
      () => this.secondary.writeConversationAttachments(context, conversationId, files),
      'writeConversationAttachments',
    );
  }

  async readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return this.readThrough(
      context,
      () => this.primary.readProjectKnowledge(context, projectId),
      () => this.secondary.readProjectKnowledge(context, projectId),
      (items) => this.primary.writeProjectKnowledge(context, projectId, items),
    );
  }

  async writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeProjectKnowledge(context, projectId, files),
      () => this.secondary.writeProjectKnowledge(context, projectId, files),
      'writeProjectKnowledge',
    );
  }

  async readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>> {
    return this.readThrough(
      context,
      () => this.primary.readProjectInstructions(context, projectId),
      () => this.secondary.readProjectInstructions(context, projectId),
      (items) => this.primary.writeProjectInstructions(context, projectId, items.content),
    );
  }

  async writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void> {
    await this.writeBoth(
      () => this.primary.writeProjectInstructions(context, projectId, content),
      () => this.secondary.writeProjectInstructions(context, projectId, content),
      'writeProjectInstructions',
    );
  }

  async listConversationContexts(
    context: ProviderCacheContext,
  ): Promise<CachedConversationContextEntry[]> {
    try {
      const primary = await this.primary.listConversationContexts(context);
      if (primary.length > 0) return primary;
    } catch (error) {
      this.logPrimaryFailure('listConversationContexts', error);
    }
    return this.secondary.listConversationContexts(context);
  }

  private async readThrough<T>(
    _context: ProviderCacheContext,
    readPrimary: () => Promise<CacheReadResult<T>>,
    readSecondary: () => Promise<CacheReadResult<T>>,
    seedPrimary: (items: T) => Promise<void>,
  ): Promise<CacheReadResult<T>> {
    let primaryResult: CacheReadResult<T> | null = null;
    try {
      primaryResult = await readPrimary();
      if (primaryResult.fetchedAt !== null) {
        return primaryResult;
      }
    } catch (error) {
      this.logPrimaryFailure('read', error);
    }

    const secondary = await readSecondary();
    if (secondary.fetchedAt !== null) {
      try {
        await seedPrimary(secondary.items);
      } catch (error) {
        this.logPrimaryFailure('seed', error);
      }
    }
    return secondary;
  }

  private async writeBoth(
    writePrimary: () => Promise<void>,
    writeSecondary: () => Promise<void>,
    label: string,
  ): Promise<void> {
    let primaryError: unknown = null;
    let secondaryError: unknown = null;
    try {
      await writePrimary();
    } catch (error) {
      primaryError = error;
      this.logPrimaryFailure(label, error);
    }
    try {
      await writeSecondary();
    } catch (error) {
      secondaryError = error;
    }
    if (primaryError && secondaryError) {
      const primaryMessage =
        primaryError instanceof Error ? primaryError.message : String(primaryError);
      const secondaryMessage =
        secondaryError instanceof Error ? secondaryError.message : String(secondaryError);
      throw new Error(
        `Both cache stores failed for ${label} (primary: ${primaryMessage}; secondary: ${secondaryMessage})`,
      );
    }
    if (!primaryError && secondaryError) {
      throw secondaryError instanceof Error
        ? secondaryError
        : new Error(String(secondaryError));
    }
  }

  private logPrimaryFailure(action: string, error: unknown): void {
    if (
      process.env.AURACALL_DEBUG_CACHE !== '1' &&
      process.env.ORACLE_DEBUG_CACHE !== '1'
    ) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`[cache:dual] primary store ${action} failed: ${message}`);
  }
}

export type CacheStoreKind = 'json' | 'sqlite' | 'dual';

export function createCacheStore(kind: CacheStoreKind = 'dual'): CacheStore {
  if (kind === 'json') {
    return new JsonCacheStore();
  }
  if (kind === 'sqlite') {
    return new SqliteCacheStore();
  }
  return new DualCacheStore(new SqliteCacheStore(), new JsonCacheStore());
}

function resolveCacheTtl(context: ProviderCacheContext): number {
  const ttlMs = context.ttlMs;
  if (typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0) {
    return ttlMs;
  }
  return PROVIDER_CACHE_TTL_MS;
}
