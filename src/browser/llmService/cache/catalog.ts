import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConversationArtifact, ConversationContext, FileRef } from '../../providers/domain.js';
import type { ProviderCacheContext } from '../../providers/cache.js';
import { resolveProviderCachePath } from '../../providers/cache.js';

type SqliteLikeDatabase = {
  close(): void;
  prepare(sql: string): {
    all(...args: unknown[]): Array<Record<string, unknown>>;
  };
};

type SqliteModule = {
  DatabaseSync: new (filename: string) => SqliteLikeDatabase;
};

let sqliteModulePromise: Promise<SqliteModule> | null = null;

async function loadSqliteModule(): Promise<SqliteModule> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite') as unknown as Promise<SqliteModule>;
  }
  return sqliteModulePromise;
}

export interface SourceCatalogOptions {
  conversationId?: string;
  domain?: string;
  sourceGroup?: string;
  query?: string;
  limit?: number;
}

export interface SourceCatalogRow {
  sourceId: string | null;
  conversationId: string;
  messageIndex: number | null;
  url: string;
  domain: string | null;
  title: string | null;
  sourceGroup: string | null;
  provider: string | null;
  updatedAt: string | null;
}

export interface FileCatalogOptions {
  conversationId?: string;
  projectId?: string;
  dataset?: string;
  query?: string;
  limit?: number;
  resolvePaths?: boolean;
}

export interface FileResolveOptions extends FileCatalogOptions {
  missingOnly?: boolean;
}

export interface FileCatalogRow {
  bindingId: string | null;
  dataset: string;
  entityId: string;
  conversationId: string | null;
  projectId: string | null;
  providerFileId: string | null;
  displayName: string;
  provider: string | null;
  source: string | null;
  sizeBytes: number | null;
  remoteUrl: string | null;
  updatedAt: string | null;
  assetId: string | null;
  assetStatus: string | null;
  assetStorageRelpath: string | null;
  localPath: string | null;
  mimeType: string | null;
  checksumSha256: string | null;
}

export type FilePathState =
  | 'local_exists'
  | 'missing_local'
  | 'external_path'
  | 'remote_only'
  | 'unknown';

export interface FileResolveRow extends FileCatalogRow {
  pathState: FilePathState;
  localPathChecked: boolean;
  localPathExists: boolean | null;
}

export interface ArtifactCatalogOptions {
  conversationId?: string;
  kind?: string;
  query?: string;
  limit?: number;
}

export interface ArtifactCatalogRow {
  artifactId: string | null;
  conversationId: string;
  messageIndex: number | null;
  messageId: string | null;
  title: string;
  kind: string | null;
  uri: string | null;
  provider: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ConversationInventoryOptions {
  conversationIds?: string[];
  limit?: number;
}

export interface ConversationInventoryRow {
  conversationId: string;
  provider: string | null;
  updatedAt: string | null;
  messageCount: number;
  sourceCount: number;
  fileCount: number;
  artifactCount: number;
}

export async function listCachedSources(
  context: ProviderCacheContext,
  options: SourceCatalogOptions = {},
): Promise<SourceCatalogRow[]> {
  const sqlRows = await listSourcesFromSqlite(context, options);
  if (sqlRows.length > 0) return sqlRows.slice(0, normalizeLimit(options.limit));
  const fallbackRows = await listSourcesFromJson(context, options);
  fallbackRows.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return fallbackRows.slice(0, normalizeLimit(options.limit));
}

export async function listCachedFiles(
  context: ProviderCacheContext,
  options: FileCatalogOptions = {},
): Promise<FileCatalogRow[]> {
  const sqlRows = await listFilesFromSqlite(context, options);
  if (sqlRows.length > 0) return sqlRows.slice(0, normalizeLimit(options.limit));
  const fallbackRows = await listFilesFromJson(context, options);
  fallbackRows.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return fallbackRows.slice(0, normalizeLimit(options.limit));
}

export async function resolveCachedFiles(
  context: ProviderCacheContext,
  options: FileResolveOptions = {},
): Promise<FileResolveRow[]> {
  const scanLimit = normalizeLimit(
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(options.limit, 200)
      : 500,
  );
  const rows = await listCachedFiles(context, {
    ...options,
    resolvePaths: true,
    limit: scanLimit,
  });
  const resolved: FileResolveRow[] = [];
  for (const row of rows) {
    const localPath = typeof row.localPath === 'string' && row.localPath.trim().length > 0 ? row.localPath : null;
    if (localPath) {
      const exists = await pathExists(localPath);
      const state: FilePathState = exists ? 'local_exists' : 'missing_local';
      if (options.missingOnly && exists) continue;
      resolved.push({
        ...row,
        pathState: state,
        localPathChecked: true,
        localPathExists: exists,
      });
      continue;
    }
    const state = inferFilePathState(row);
    if (options.missingOnly && state !== 'missing_local') {
      continue;
    }
    resolved.push({
      ...row,
      pathState: state,
      localPathChecked: false,
      localPathExists: null,
    });
  }
  resolved.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return resolved.slice(0, normalizeLimit(options.limit));
}

export async function listCachedArtifacts(
  context: ProviderCacheContext,
  options: ArtifactCatalogOptions = {},
): Promise<ArtifactCatalogRow[]> {
  const sqlRows = await listArtifactsFromSqlite(context, options);
  if (sqlRows.length > 0) return sqlRows.slice(0, normalizeLimit(options.limit));
  const fallbackRows = await listArtifactsFromJson(context, options);
  fallbackRows.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return fallbackRows.slice(0, normalizeLimit(options.limit));
}

export async function listCachedConversationInventory(
  context: ProviderCacheContext,
  options: ConversationInventoryOptions = {},
): Promise<ConversationInventoryRow[]> {
  const sqlRows = await listConversationInventoryFromSqlite(context, options);
  if (sqlRows.length > 0) return sqlRows.slice(0, normalizeLimit(options.limit));
  const fallbackRows = await listConversationInventoryFromJson(context, options);
  fallbackRows.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return fallbackRows.slice(0, normalizeLimit(options.limit));
}

async function listSourcesFromSqlite(
  context: ProviderCacheContext,
  options: SourceCatalogOptions,
): Promise<SourceCatalogRow[]> {
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  if (!sqlite) return [];
  try {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (options.conversationId?.trim()) {
      whereParts.push('conversation_id = ?');
      params.push(options.conversationId.trim());
    }
    if (options.domain?.trim()) {
      whereParts.push('domain = ?');
      params.push(options.domain.trim());
    }
    if (options.sourceGroup?.trim()) {
      whereParts.push('source_group = ?');
      params.push(options.sourceGroup.trim());
    }
    if (options.query?.trim()) {
      whereParts.push('(url LIKE ? OR title LIKE ? OR domain LIKE ?)');
      const like = `%${options.query.trim()}%`;
      params.push(like, like, like);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const sql = `
      SELECT
        source_id,
        conversation_id,
        message_index,
        url,
        domain,
        title,
        source_group,
        provider,
        updated_at
      FROM source_links
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ?
    `;
    params.push(normalizeLimit(options.limit));
    const rows = sqlite.prepare(sql).all(...params);
    return rows
      .map((row) => ({
        sourceId: asNullableString(row.source_id),
        conversationId: asString(row.conversation_id),
        messageIndex: asNullableNumber(row.message_index),
        url: asString(row.url),
        domain: asNullableString(row.domain),
        title: asNullableString(row.title),
        sourceGroup: asNullableString(row.source_group),
        provider: asNullableString(row.provider),
        updatedAt: asNullableString(row.updated_at),
      }))
      .filter((row) => row.conversationId.length > 0 && row.url.length > 0);
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

async function listFilesFromSqlite(
  context: ProviderCacheContext,
  options: FileCatalogOptions,
): Promise<FileCatalogRow[]> {
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  if (!sqlite) return [];
  try {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (options.conversationId?.trim()) {
      whereParts.push('b.conversation_id = ?');
      params.push(options.conversationId.trim());
    }
    if (options.projectId?.trim()) {
      whereParts.push('b.project_id = ?');
      params.push(options.projectId.trim());
    }
    if (options.dataset?.trim()) {
      whereParts.push('b.dataset = ?');
      params.push(options.dataset.trim());
    }
    if (options.query?.trim()) {
      whereParts.push(
        '(b.display_name LIKE ? OR b.provider_file_id LIKE ? OR b.remote_url LIKE ? OR b.metadata_json LIKE ?)',
      );
      const like = `%${options.query.trim()}%`;
      params.push(like, like, like, like);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const sql = `
      SELECT
        b.binding_id,
        b.dataset,
        b.entity_id,
        b.conversation_id,
        b.project_id,
        b.provider_file_id,
        b.display_name,
        b.provider,
        b.source,
        b.size_bytes,
        b.remote_url,
        b.updated_at,
        b.asset_id,
        b.metadata_json,
        a.status AS asset_status,
        a.storage_relpath,
        a.mime_type,
        a.checksum_sha256
      FROM file_bindings b
      LEFT JOIN file_assets a ON a.asset_id = b.asset_id
      ${whereClause}
      ORDER BY b.updated_at DESC
      LIMIT ?
    `;
    params.push(normalizeLimit(options.limit));
    const rows = sqlite.prepare(sql).all(...params);
    const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
    return rows
      .map((row) => {
        const metadata = parseJsonRecord(row.metadata_json);
        const storageRelpath = asNullableString(row.storage_relpath);
        const resolvedPath =
          options.resolvePaths && storageRelpath
            ? path.resolve(cacheDir, storageRelpath)
            : asRecordString(metadata, 'localPath');
        return {
          bindingId: asNullableString(row.binding_id),
          dataset: asString(row.dataset),
          entityId: asString(row.entity_id),
          conversationId: asNullableString(row.conversation_id),
          projectId: asNullableString(row.project_id),
          providerFileId: asNullableString(row.provider_file_id),
          displayName: asString(row.display_name),
          provider: asNullableString(row.provider),
          source: asNullableString(row.source),
          sizeBytes: asNullableNumber(row.size_bytes),
          remoteUrl: asNullableString(row.remote_url),
          updatedAt: asNullableString(row.updated_at),
          assetId: asNullableString(row.asset_id),
          assetStatus: asNullableString(row.asset_status),
          assetStorageRelpath: storageRelpath,
          localPath: resolvedPath ?? null,
          mimeType: asNullableString(row.mime_type) ?? asRecordString(metadata, 'mimeType'),
          checksumSha256:
            asNullableString(row.checksum_sha256) ?? asRecordString(metadata, 'checksumSha256'),
        } satisfies FileCatalogRow;
      })
      .filter((row) => row.dataset.length > 0 && row.entityId.length > 0 && row.displayName.length > 0);
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

async function listSourcesFromJson(
  context: ProviderCacheContext,
  options: SourceCatalogOptions,
): Promise<SourceCatalogRow[]> {
  const docs = await loadContextDocuments(context);
  const targetConversationId = options.conversationId?.trim();
  const targetDomain = options.domain?.trim().toLowerCase();
  const targetGroup = options.sourceGroup?.trim().toLowerCase();
  const query = options.query?.trim().toLowerCase();
  const rows: SourceCatalogRow[] = [];
  for (const doc of docs) {
    if (targetConversationId && doc.conversationId !== targetConversationId) continue;
    const sources = Array.isArray(doc.context.sources) ? doc.context.sources : [];
    for (const source of sources) {
      const url = typeof source.url === 'string' ? source.url.trim() : '';
      if (!url) continue;
      const domain = typeof source.domain === 'string' ? source.domain.trim() : '';
      const group = typeof source.sourceGroup === 'string' ? source.sourceGroup.trim() : '';
      const title = typeof source.title === 'string' ? source.title.trim() : '';
      if (targetDomain && domain.toLowerCase() !== targetDomain) continue;
      if (targetGroup && group.toLowerCase() !== targetGroup) continue;
      if (query) {
        const haystack = `${url} ${domain} ${group} ${title}`.toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      rows.push({
        sourceId: null,
        conversationId: doc.conversationId,
        messageIndex:
          typeof source.messageIndex === 'number' && Number.isFinite(source.messageIndex)
            ? source.messageIndex
            : null,
        url,
        domain: domain || null,
        title: title || null,
        sourceGroup: group || null,
        provider: context.provider,
        updatedAt: doc.updatedAt,
      });
    }
  }
  return rows;
}

async function listFilesFromJson(
  context: ProviderCacheContext,
  options: FileCatalogOptions,
): Promise<FileCatalogRow[]> {
  const query = options.query?.trim().toLowerCase();
  const targetConversationId = options.conversationId?.trim();
  const targetProjectId = options.projectId?.trim();
  const targetDataset = options.dataset?.trim();
  const rows: FileCatalogRow[] = [];

  const conversationContextDocs = await loadContextDocuments(context);
  for (const doc of conversationContextDocs) {
    if (targetConversationId && doc.conversationId !== targetConversationId) continue;
    if (targetDataset && targetDataset !== 'conversation-context') continue;
    const files = Array.isArray(doc.context.files) ? doc.context.files : [];
    for (const file of files) {
      const mapped = mapJsonFileToCatalogRow(context, file, {
        dataset: 'conversation-context',
        entityId: doc.conversationId,
        conversationId: doc.conversationId,
        projectId: null,
        updatedAt: doc.updatedAt,
        resolvePaths: options.resolvePaths,
      });
      if (!mapped) continue;
      if (query && !jsonFileRowMatches(mapped, query)) continue;
      rows.push(mapped);
    }
  }

  const filesByDataset = await loadManifestFileRows(context);
  for (const entry of filesByDataset) {
    if (targetDataset && entry.dataset !== targetDataset) continue;
    if (targetConversationId && entry.conversationId !== targetConversationId) continue;
    if (targetProjectId && entry.projectId !== targetProjectId) continue;
    for (const file of entry.files) {
      const mapped = mapJsonFileToCatalogRow(context, file, {
        dataset: entry.dataset,
        entityId: entry.entityId,
        conversationId: entry.conversationId,
        projectId: entry.projectId,
        updatedAt: entry.updatedAt,
        resolvePaths: options.resolvePaths,
      });
      if (!mapped) continue;
      if (query && !jsonFileRowMatches(mapped, query)) continue;
      rows.push(mapped);
    }
  }

  const seen = new Set<string>();
  const uniqueRows: FileCatalogRow[] = [];
  for (const row of rows) {
    const key = [
      row.dataset,
      row.entityId,
      row.providerFileId ?? '',
      row.displayName,
      row.remoteUrl ?? '',
      row.localPath ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  return uniqueRows;
}

async function listArtifactsFromSqlite(
  context: ProviderCacheContext,
  options: ArtifactCatalogOptions,
): Promise<ArtifactCatalogRow[]> {
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  if (!sqlite) return [];
  try {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (options.conversationId?.trim()) {
      whereParts.push('conversation_id = ?');
      params.push(options.conversationId.trim());
    }
    if (options.kind?.trim()) {
      whereParts.push('kind = ?');
      params.push(options.kind.trim());
    }
    if (options.query?.trim()) {
      whereParts.push('(title LIKE ? OR uri LIKE ? OR metadata_json LIKE ? OR message_id LIKE ?)');
      const like = `%${options.query.trim()}%`;
      params.push(like, like, like, like);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const sql = `
      SELECT
        artifact_id,
        conversation_id,
        message_index,
        message_id,
        title,
        kind,
        uri,
        provider,
        metadata_json,
        updated_at
      FROM artifact_bindings
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ?
    `;
    params.push(normalizeLimit(options.limit));
    const rows = sqlite.prepare(sql).all(...params);
    return rows
      .map((row) => ({
        artifactId: asNullableString(row.artifact_id),
        conversationId: asString(row.conversation_id),
        messageIndex: asNullableNumber(row.message_index),
        messageId: asNullableString(row.message_id),
        title: asString(row.title),
        kind: asNullableString(row.kind),
        uri: asNullableString(row.uri),
        provider: asNullableString(row.provider),
        updatedAt: asNullableString(row.updated_at),
        metadata: parseJsonRecord(row.metadata_json),
      }))
      .filter((row) => row.conversationId.length > 0 && row.title.length > 0);
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

async function listArtifactsFromJson(
  context: ProviderCacheContext,
  options: ArtifactCatalogOptions,
): Promise<ArtifactCatalogRow[]> {
  const docs = await loadContextDocuments(context);
  const targetConversationId = options.conversationId?.trim();
  const targetKind = options.kind?.trim().toLowerCase();
  const query = options.query?.trim().toLowerCase();
  const rows: ArtifactCatalogRow[] = [];
  for (const doc of docs) {
    if (targetConversationId && doc.conversationId !== targetConversationId) continue;
    const artifacts = Array.isArray(doc.context.artifacts) ? doc.context.artifacts : [];
    for (const artifact of artifacts) {
      const mapped = mapJsonArtifactToCatalogRow(context, doc.conversationId, artifact, doc.updatedAt);
      if (!mapped) continue;
      if (targetKind && (mapped.kind ?? '').toLowerCase() !== targetKind) continue;
      if (query && !jsonArtifactRowMatches(mapped, query)) continue;
      rows.push(mapped);
    }
  }
  return rows;
}

async function listConversationInventoryFromSqlite(
  context: ProviderCacheContext,
  options: ConversationInventoryOptions,
): Promise<ConversationInventoryRow[]> {
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  if (!sqlite) return [];
  try {
    const conversationIds = normalizeConversationIds(options.conversationIds);
    const idClause =
      conversationIds.length > 0 ? ` AND entity_id IN (${conversationIds.map(() => '?').join(', ')})` : '';
    const rows = sqlite
      .prepare(
        `SELECT entity_id, items_json, updated_at
           FROM cache_entries
          WHERE dataset = 'conversation-context'${idClause}
          ORDER BY updated_at DESC
          LIMIT ?`,
      )
      .all(...conversationIds, normalizeLimit(options.limit)) as Array<{
      entity_id?: unknown;
      items_json?: unknown;
      updated_at?: unknown;
    }>;
    if (rows.length === 0) return [];

    const rowIds = rows.map((row) => asString(row.entity_id)).filter((value) => value.length > 0);
    const sourceCounts = queryConversationCountMap(sqlite, 'source_links', rowIds);
    const artifactCounts = queryConversationCountMap(sqlite, 'artifact_bindings', rowIds);
    const fileCounts = queryConversationContextFileCountMap(sqlite, rowIds);

    const mapped: Array<ConversationInventoryRow | null> = rows.map((row) => {
        const conversationId = asString(row.entity_id);
        if (!conversationId) return null;
        const parsed = parseJsonRecord(row.items_json) as ConversationContext | null;
        const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
        const provider: string | null =
          parsed && typeof parsed.provider === 'string' && parsed.provider.trim().length > 0
            ? parsed.provider.trim()
            : context.provider;
        return {
          conversationId,
          provider,
          updatedAt: asNullableString(row.updated_at),
          messageCount: messages.length,
          sourceCount: sourceCounts.get(conversationId) ?? 0,
          fileCount: fileCounts.get(conversationId) ?? 0,
          artifactCount: artifactCounts.get(conversationId) ?? 0,
        } satisfies ConversationInventoryRow;
      });
    return mapped.filter((row): row is ConversationInventoryRow => row !== null);
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

async function listConversationInventoryFromJson(
  context: ProviderCacheContext,
  options: ConversationInventoryOptions,
): Promise<ConversationInventoryRow[]> {
  const docs = await loadContextDocuments(context);
  const wanted = new Set(normalizeConversationIds(options.conversationIds));
  return docs
    .filter((doc) => wanted.size === 0 || wanted.has(doc.conversationId))
    .map((doc) => ({
      conversationId: doc.conversationId,
      provider:
        typeof doc.context.provider === 'string' && doc.context.provider.trim().length > 0
          ? doc.context.provider.trim()
          : context.provider,
      updatedAt: doc.updatedAt,
      messageCount: Array.isArray(doc.context.messages) ? doc.context.messages.length : 0,
      sourceCount: Array.isArray(doc.context.sources) ? doc.context.sources.length : 0,
      fileCount: Array.isArray(doc.context.files) ? doc.context.files.length : 0,
      artifactCount: Array.isArray(doc.context.artifacts) ? doc.context.artifacts.length : 0,
    }))
    .sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
}

function mapJsonFileToCatalogRow(
  context: ProviderCacheContext,
  file: FileRef,
  scope: {
    dataset: string;
    entityId: string;
    conversationId: string | null;
    projectId: string | null;
    updatedAt: string | null;
    resolvePaths?: boolean;
  },
): FileCatalogRow | null {
  const providerFileId = typeof file.id === 'string' ? file.id.trim() : '';
  const displayName = typeof file.name === 'string' ? file.name.trim() : '';
  if (!providerFileId && !displayName) return null;
  const localPath = typeof file.localPath === 'string' ? file.localPath.trim() : '';
  const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
  const resolvedLocalPath =
    scope.resolvePaths && localPath
      ? localPath.startsWith('/')
        ? localPath
        : path.resolve(cacheDir, localPath)
      : localPath || null;
  return {
    bindingId: null,
    dataset: scope.dataset,
    entityId: scope.entityId,
    conversationId: scope.conversationId,
    projectId: scope.projectId,
    providerFileId: providerFileId || null,
    displayName: displayName || providerFileId,
    provider: file.provider ?? context.provider,
    source: file.source ?? null,
    sizeBytes: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null,
    remoteUrl: typeof file.remoteUrl === 'string' && file.remoteUrl.trim().length > 0 ? file.remoteUrl.trim() : null,
    updatedAt: scope.updatedAt,
    assetId: null,
    assetStatus: null,
    assetStorageRelpath: null,
    localPath: resolvedLocalPath,
    mimeType: typeof file.mimeType === 'string' && file.mimeType.trim().length > 0 ? file.mimeType.trim() : null,
    checksumSha256:
      typeof file.checksumSha256 === 'string' && file.checksumSha256.trim().length > 0
        ? file.checksumSha256.trim()
        : null,
  };
}

function mapJsonArtifactToCatalogRow(
  context: ProviderCacheContext,
  conversationId: string,
  artifact: ConversationArtifact,
  updatedAt: string | null,
): ArtifactCatalogRow | null {
  const title = typeof artifact.title === 'string' ? artifact.title.trim() : '';
  if (!title) return null;
  const artifactId =
    typeof artifact.id === 'string' && artifact.id.trim().length > 0 ? artifact.id.trim() : null;
  const kind = typeof artifact.kind === 'string' && artifact.kind.trim().length > 0 ? artifact.kind.trim() : null;
  const uri = typeof artifact.uri === 'string' && artifact.uri.trim().length > 0 ? artifact.uri.trim() : null;
  const messageId =
    typeof artifact.messageId === 'string' && artifact.messageId.trim().length > 0
      ? artifact.messageId.trim()
      : null;
  return {
    artifactId,
    conversationId,
    messageIndex:
      typeof artifact.messageIndex === 'number' && Number.isFinite(artifact.messageIndex)
        ? artifact.messageIndex
        : null,
    messageId,
    title,
    kind,
    uri,
    provider: context.provider,
    updatedAt,
    metadata: artifact.metadata && typeof artifact.metadata === 'object'
      ? (artifact.metadata as Record<string, unknown>)
      : null,
  };
}

function jsonFileRowMatches(row: FileCatalogRow, query: string): boolean {
  const haystack = [
    row.displayName,
    row.providerFileId ?? '',
    row.dataset,
    row.entityId,
    row.remoteUrl ?? '',
    row.localPath ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function jsonArtifactRowMatches(row: ArtifactCatalogRow, query: string): boolean {
  const haystack = [
    row.title,
    row.kind ?? '',
    row.uri ?? '',
    row.messageId ?? '',
    row.artifactId ?? '',
    row.metadata ? JSON.stringify(row.metadata) : '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

async function loadManifestFileRows(
  context: ProviderCacheContext,
): Promise<
  Array<{
    dataset: string;
    entityId: string;
    conversationId: string | null;
    projectId: string | null;
    files: FileRef[];
    updatedAt: string | null;
  }>
> {
  const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
  const rows: Array<{
    dataset: string;
    entityId: string;
    conversationId: string | null;
    projectId: string | null;
    files: FileRef[];
    updatedAt: string | null;
  }> = [];

  const accountFiles = await readFileArrayCache<FileRef>(path.join(cacheDir, 'account-files.json'));
  if (accountFiles) {
    rows.push({
      dataset: 'account-files',
      entityId: '__account__',
      conversationId: null,
      projectId: null,
      files: accountFiles.items,
      updatedAt: accountFiles.updatedAt,
    });
  }

  const folders: Array<{
    dataset: string;
    rootDir: string;
    isProject: boolean;
  }> = [
    { dataset: 'conversation-files', rootDir: path.join(cacheDir, 'conversation-files'), isProject: false },
    {
      dataset: 'conversation-attachments',
      rootDir: path.join(cacheDir, 'conversation-attachments'),
      isProject: false,
    },
    { dataset: 'project-knowledge', rootDir: path.join(cacheDir, 'project-knowledge'), isProject: true },
  ];

  for (const folder of folders) {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await fs.readdir(folder.rootDir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (folder.dataset === 'conversation-files') {
      for (const file of entries) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue;
        const entityId = file.name.replace(/\.json$/i, '');
        const payload = await readFileArrayCache<FileRef>(path.join(folder.rootDir, file.name));
        if (!payload) continue;
        rows.push({
          dataset: folder.dataset,
          entityId,
          conversationId: entityId,
          projectId: null,
          files: payload.items,
          updatedAt: payload.updatedAt,
        });
      }
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entityId = entry.name;
      const payload = await readFileArrayCache<FileRef>(
        path.join(folder.rootDir, entry.name, 'manifest.json'),
      );
      if (!payload) continue;
      rows.push({
        dataset: folder.dataset,
        entityId,
        conversationId: folder.isProject ? null : entityId,
        projectId: folder.isProject ? entityId : null,
        files: payload.items,
        updatedAt: payload.updatedAt,
      });
    }
  }
  return rows;
}

async function loadContextDocuments(
  context: ProviderCacheContext,
): Promise<Array<{ conversationId: string; context: ConversationContext; updatedAt: string | null }>> {
  const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
  const contextsDir = path.join(cacheDir, 'contexts');
  let files: Array<{ name: string; isFile: () => boolean }> = [];
  try {
    files = await fs.readdir(contextsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const docs: Array<{ conversationId: string; context: ConversationContext; updatedAt: string | null }> = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    const conversationId = file.name.replace(/\.json$/i, '');
    try {
      const raw = await fs.readFile(path.join(contextsDir, file.name), 'utf8');
      const parsed = JSON.parse(raw) as { fetchedAt?: string; items?: ConversationContext };
      if (!parsed || !parsed.items) continue;
      docs.push({
        conversationId,
        context: parsed.items,
        updatedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
      });
    } catch {
      continue;
    }
  }
  return docs;
}

async function readFileArrayCache<T>(
  filePath: string,
): Promise<{ items: T[]; updatedAt: string | null } | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { fetchedAt?: string; items?: T[] };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items,
      updatedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
    };
  } catch {
    return null;
  }
}

function resolveSqlitePath(context: ProviderCacheContext): string {
  return path.join(resolveProviderCachePath(context, 'projects.json').cacheDir, 'cache.sqlite');
}

async function tryOpenSqlite(dbPath: string): Promise<SqliteLikeDatabase | null> {
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  try {
    const sqlite = await loadSqliteModule();
    return new sqlite.DatabaseSync(dbPath);
  } catch {
    return null;
  }
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 50;
  return Math.min(500, Math.floor(value));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  const stringValue = asString(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeConversationIds(conversationIds: string[] | undefined): string[] {
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) return [];
  return Array.from(new Set(conversationIds.map((id) => id.trim()).filter((id) => id.length > 0)));
}

function queryConversationCountMap(
  sqlite: SqliteLikeDatabase,
  table: 'source_links' | 'artifact_bindings',
  conversationIds: string[],
): Map<string, number> {
  if (conversationIds.length === 0) return new Map();
  const placeholders = conversationIds.map(() => '?').join(', ');
  const rows = sqlite
    .prepare(
      `SELECT conversation_id, COUNT(*) AS c
         FROM ${table}
        WHERE conversation_id IN (${placeholders})
        GROUP BY conversation_id`,
    )
    .all(...conversationIds) as Array<{ conversation_id?: unknown; c?: unknown }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    const conversationId = asString(row.conversation_id);
    if (!conversationId) continue;
    map.set(conversationId, asNullableNumber(row.c) ?? 0);
  }
  return map;
}

function queryConversationContextFileCountMap(
  sqlite: SqliteLikeDatabase,
  conversationIds: string[],
): Map<string, number> {
  if (conversationIds.length === 0) return new Map();
  const placeholders = conversationIds.map(() => '?').join(', ');
  const rows = sqlite
    .prepare(
      `SELECT entity_id, COUNT(*) AS c
         FROM file_bindings
        WHERE dataset = 'conversation-context'
          AND entity_id IN (${placeholders})
        GROUP BY entity_id`,
    )
    .all(...conversationIds) as Array<{ entity_id?: unknown; c?: unknown }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    const conversationId = asString(row.entity_id);
    if (!conversationId) continue;
    map.set(conversationId, asNullableNumber(row.c) ?? 0);
  }
  return map;
}

function asRecordString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function compareTimestampDesc(a: string | null, b: string | null): number {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return tb - ta;
}

function inferFilePathState(row: FileCatalogRow): FilePathState {
  if (row.assetStatus === 'external_path') return 'external_path';
  if (row.assetStatus === 'local_cached') return 'missing_local';
  if (row.remoteUrl) return 'remote_only';
  return 'unknown';
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
