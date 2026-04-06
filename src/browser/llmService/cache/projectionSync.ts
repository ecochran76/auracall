import type {
  ConversationArtifact,
  ConversationSource,
  FileRef,
} from '../../providers/domain.js';
import type { ProviderCacheContext } from '../../providers/cache.js';

export type ProjectionSyncDatabase = {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
  };
};

export interface StagedLocalFileAsset {
  absolutePath: string | null;
  storageRelpath: string | null;
  sourceLocalPath: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  mimeType: string | null;
  status: 'local_cached' | 'external_path' | 'missing_local';
}

export interface FileBindingSyncInput {
  dataset: string;
  entityId: string;
  conversationId: string | null;
  projectId: string | null;
  files: FileRef[];
}

export interface FileBindingSyncHelpers {
  cacheDir: string;
  hashId(parts: string[]): string;
  stageLocalFileAsset(
    cacheDir: string,
    file: FileRef,
    fallbackName: string,
  ): Promise<StagedLocalFileAsset>;
}

export async function syncSourceLinks(
  db: ProjectionSyncDatabase,
  context: ProviderCacheContext,
  conversationId: string,
  sources: ConversationSource[],
  hashId: (parts: string[]) => string,
): Promise<void> {
  db.prepare('DELETE FROM source_links WHERE conversation_id = ?').run(conversationId);
  if (!sources.length) return;
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO source_links (
      source_id, conversation_id, message_index, url, domain, title, source_group, provider, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, message_index, url) DO UPDATE SET
      domain = excluded.domain,
      title = excluded.title,
      source_group = excluded.source_group,
      provider = excluded.provider,
      updated_at = excluded.updated_at`,
  );
  for (const source of sources) {
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (!url) continue;
    const messageIndex =
      typeof source.messageIndex === 'number' && Number.isFinite(source.messageIndex)
        ? source.messageIndex
        : null;
    const sourceId = hashId(['source', conversationId, String(messageIndex), url]);
    stmt.run(
      sourceId,
      conversationId,
      messageIndex,
      url,
      typeof source.domain === 'string' ? source.domain : null,
      typeof source.title === 'string' ? source.title : null,
      typeof source.sourceGroup === 'string' ? source.sourceGroup.trim() : null,
      context.provider,
      nowIso,
      nowIso,
    );
  }
}

export async function syncArtifactBindings(
  db: ProjectionSyncDatabase,
  context: ProviderCacheContext,
  conversationId: string,
  artifacts: ConversationArtifact[],
  hashId: (parts: string[]) => string,
): Promise<void> {
  db.prepare('DELETE FROM artifact_bindings WHERE conversation_id = ?').run(conversationId);
  if (!artifacts.length) return;
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO artifact_bindings (
      artifact_id, conversation_id, message_index, message_id, title, kind, uri, provider, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, message_index, title, kind, uri) DO UPDATE SET
      message_id = excluded.message_id,
      provider = excluded.provider,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`,
  );
  for (const artifact of artifacts) {
    const title = typeof artifact.title === 'string' ? artifact.title.trim() : '';
    if (!title) continue;
    const messageIndex =
      typeof artifact.messageIndex === 'number' && Number.isFinite(artifact.messageIndex)
        ? artifact.messageIndex
        : null;
    const kind = typeof artifact.kind === 'string' && artifact.kind.trim().length > 0 ? artifact.kind.trim() : null;
    const uri = typeof artifact.uri === 'string' && artifact.uri.trim().length > 0 ? artifact.uri.trim() : null;
    const messageId =
      typeof artifact.messageId === 'string' && artifact.messageId.trim().length > 0
        ? artifact.messageId.trim()
        : null;
    const artifactId =
      typeof artifact.id === 'string' && artifact.id.trim().length > 0
        ? artifact.id.trim()
        : hashId([
            'artifact',
            conversationId,
            String(messageIndex),
            title,
            kind ?? '',
            uri ?? '',
            messageId ?? '',
          ]);
    stmt.run(
      artifactId,
      conversationId,
      messageIndex,
      messageId,
      title,
      kind,
      uri,
      context.provider,
      artifact.metadata && typeof artifact.metadata === 'object'
        ? JSON.stringify(artifact.metadata)
        : null,
      nowIso,
      nowIso,
    );
  }
}

export async function syncFileBindings(
  db: ProjectionSyncDatabase,
  context: ProviderCacheContext,
  input: FileBindingSyncInput,
  helpers: FileBindingSyncHelpers,
): Promise<void> {
  db.prepare('DELETE FROM file_bindings WHERE dataset = ? AND entity_id = ?').run(
    input.dataset,
    input.entityId,
  );
  if (!input.files.length) return;
  const nowIso = new Date().toISOString();
  const assetStmt = db.prepare(
    `INSERT INTO file_assets (
      asset_id, provider, identity_key, size_bytes, mime_type, storage_relpath, status, checksum_sha256, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      size_bytes = excluded.size_bytes,
      mime_type = excluded.mime_type,
      storage_relpath = excluded.storage_relpath,
      status = excluded.status,
      checksum_sha256 = excluded.checksum_sha256,
      updated_at = excluded.updated_at`,
  );
  const stmt = db.prepare(
    `INSERT INTO file_bindings (
      binding_id, dataset, entity_id, conversation_id, project_id, message_index, role,
      provider_file_id, display_name, provider, source, size_bytes, remote_url, asset_id, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dataset, entity_id, provider_file_id, display_name) DO UPDATE SET
      conversation_id = excluded.conversation_id,
      project_id = excluded.project_id,
      message_index = excluded.message_index,
      role = excluded.role,
      provider = excluded.provider,
      source = excluded.source,
      size_bytes = excluded.size_bytes,
      remote_url = excluded.remote_url,
      asset_id = excluded.asset_id,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`,
  );
  for (const file of input.files) {
    const fileId = typeof file.id === 'string' ? file.id.trim() : '';
    const fileName = typeof file.name === 'string' ? file.name.trim() : '';
    if (!fileId && !fileName) continue;
    const stagedLocal = await helpers.stageLocalFileAsset(helpers.cacheDir, file, fileName || fileId);
    const remoteUrl =
      typeof file.remoteUrl === 'string' && file.remoteUrl.trim().length > 0
        ? file.remoteUrl.trim()
        : null;
    const mimeType =
      stagedLocal.mimeType ??
      (typeof file.mimeType === 'string' && file.mimeType.trim().length > 0
        ? file.mimeType.trim()
        : null);
    const checksum =
      stagedLocal.checksumSha256 ??
      (typeof file.checksumSha256 === 'string' && file.checksumSha256.trim().length > 0
        ? file.checksumSha256.trim()
        : null);
    const sizeBytes =
      stagedLocal.sizeBytes ??
      (typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null);
    const assetId = stagedLocal.absolutePath
      ? helpers.hashId(['asset', context.provider, context.identityKey ?? '', stagedLocal.absolutePath])
      : null;
    if (assetId) {
      assetStmt.run(
        assetId,
        context.provider,
        context.identityKey ?? null,
        sizeBytes,
        mimeType,
        stagedLocal.storageRelpath,
        stagedLocal.status,
        checksum,
        nowIso,
        nowIso,
      );
    }
    const metadata: Record<string, unknown> = {};
    if (remoteUrl) metadata.remoteUrl = remoteUrl;
    if (mimeType) metadata.mimeType = mimeType;
    if (checksum) metadata.checksumSha256 = checksum;
    if (stagedLocal.absolutePath) {
      metadata.localPath = stagedLocal.absolutePath;
    }
    if (stagedLocal.storageRelpath) {
      metadata.storageRelpath = stagedLocal.storageRelpath;
    }
    if (stagedLocal.sourceLocalPath && stagedLocal.sourceLocalPath !== stagedLocal.absolutePath) {
      metadata.sourceLocalPath = stagedLocal.sourceLocalPath;
    }
    if (file.metadata && typeof file.metadata === 'object') {
      Object.assign(metadata, file.metadata);
    }
    const bindingId = helpers.hashId([
      'binding',
      input.dataset,
      input.entityId,
      fileId || fileName,
    ]);
    stmt.run(
      bindingId,
      input.dataset,
      input.entityId,
      input.conversationId,
      input.projectId,
      null,
      null,
      fileId || null,
      fileName || fileId,
      context.provider,
      file.source,
      sizeBytes,
      remoteUrl,
      assetId,
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      nowIso,
      nowIso,
    );
  }
}
