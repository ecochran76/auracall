import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedUserConfig } from '../config.js';
import { createLlmService } from '../browser/llmService/providers/index.js';
import type { ConversationArtifact, FileRef, ProviderId } from '../browser/providers/domain.js';
import {
  createRunArchiveIndexStore,
  getRunArchiveDir,
  type RunArchiveIndexStore,
} from './archiveIndexStore.js';
import {
  createRunArchiveService,
  type RunArchiveItem,
  type RunArchiveService,
} from './archiveService.js';
import { findCachedConversationAttachmentAsset } from './archiveCachedAssetLookup.js';

export interface ArchiveItemMaterializationRequest {
  archiveItemId: string;
  force?: boolean | null;
}

export interface ArchiveItemMaterializationResult {
  object: 'run_archive_item_materialization';
  generatedAt: string;
  status: 'already_materialized' | 'materialized' | 'skipped';
  item: RunArchiveItem;
  file: {
    id: string;
    name: string;
    localPath: string | null;
    remoteUrl: string | null;
    mimeType: string | null;
    size: number | null;
  } | null;
  message: string;
}

export interface ArchiveMaterializationService {
  materializeItem(request: ArchiveItemMaterializationRequest): Promise<ArchiveItemMaterializationResult>;
}

export class ArchiveMaterializationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'ArchiveMaterializationError';
  }
}

export interface ArchiveMaterializationServiceDeps {
  config: ResolvedUserConfig | Record<string, unknown>;
  runArchiveService?: RunArchiveService;
  indexStore?: RunArchiveIndexStore;
  now?: () => Date;
  materializeConversationArtifact?: (
    input: {
      provider: ProviderId;
      config: ResolvedUserConfig | Record<string, unknown>;
      conversationId: string;
      artifact: ConversationArtifact;
      destDir: string;
      projectId: string | null;
      providerConversationUrl: string | null;
    },
  ) => Promise<FileRef | null>;
}

export function createArchiveMaterializationService(
  deps: ArchiveMaterializationServiceDeps,
): ArchiveMaterializationService {
  const runArchiveService = deps.runArchiveService ?? createRunArchiveService();
  const indexStore = deps.indexStore ?? createRunArchiveIndexStore();
  const now = deps.now ?? (() => new Date());

  return {
    async materializeItem(request) {
      const archiveItemId = request.archiveItemId.trim();
      if (!archiveItemId) {
        throw new ArchiveMaterializationError('Archive item id is required.');
      }
      const force = request.force === true;
      const detail = await runArchiveService.readItem(archiveItemId);
      if (!detail) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} was not found.`, 404);
      }
      const item = detail.item;
      if (!force && item.fileAvailable === true && item.localPath) {
        return {
          object: 'run_archive_item_materialization',
          generatedAt: now().toISOString(),
          status: 'already_materialized',
          item,
          file: {
            id: item.artifactId ?? item.id,
            name: item.fileName ?? item.title ?? item.id,
            localPath: item.localPath,
            remoteUrl: item.uri,
            mimeType: item.mimeType,
            size: readNumber(item.metadata.fileSizeBytes),
          },
          message: 'Archive item already has a readable local asset.',
        };
      }
      if (item.kind !== 'generated_artifact') {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} is ${item.kind}; only generated_artifact materialization is supported.`);
      }
      const existingMaterializedAsset = force ? null : await findExistingMaterializedItemAsset(item);
      if (existingMaterializedAsset) {
        const materializedAt = now().toISOString();
        const updatedItem = await materializedArchiveItem(item, existingMaterializedAsset, materializedAt);
        await indexStore.upsertItems([updatedItem], {
          updatedAt: materializedAt,
          removeExisting: (candidate) => candidate.id === updatedItem.id,
        });
        return {
          object: 'run_archive_item_materialization',
          generatedAt: materializedAt,
          status: 'materialized',
          item: updatedItem,
          file: fileToResult(existingMaterializedAsset),
          message: 'Archive item linked to an existing materialized file in its archive directory.',
        };
      }
      const cachedConversationAsset = force ? null : await findCachedConversationAttachmentAsset(item);
      if (cachedConversationAsset) {
        const materializedAt = now().toISOString();
        const updatedItem = await materializedArchiveItem(item, cachedConversationAsset, materializedAt);
        await indexStore.upsertItems([updatedItem], {
          updatedAt: materializedAt,
          removeExisting: (candidate) => candidate.id === updatedItem.id,
        });
        return {
          object: 'run_archive_item_materialization',
          generatedAt: materializedAt,
          status: 'materialized',
          item: updatedItem,
          file: fileToResult(cachedConversationAsset),
          message: 'Archive item linked to an existing provider conversation attachment cache file.',
        };
      }
      const reusable = force ? null : await findReusableArchiveAsset(runArchiveService, item);
      if (reusable) {
        const materializedAt = now().toISOString();
        const updatedItem = await materializedArchiveItem(item, reusable, materializedAt);
        await indexStore.upsertItems([updatedItem], {
          updatedAt: materializedAt,
          removeExisting: (candidate) => candidate.id === updatedItem.id,
        });
        return {
          object: 'run_archive_item_materialization',
          generatedAt: materializedAt,
          status: 'materialized',
          item: updatedItem,
          file: fileToResult(reusable),
          message: 'Archive item linked to an existing materialized asset with matching provider artifact evidence.',
        };
      }
      const provider = normalizeProviderId(item.provider);
      if (!provider) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} does not have a supported provider.`);
      }
      if (!item.providerConversationId) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} does not have a provider conversation id.`);
      }

      const artifact = archiveItemToConversationArtifact(item);
      const destDir = path.join(getRunArchiveDir(), 'materialized', sanitizePathSegment(archiveItemId));
      await fs.mkdir(destDir, { recursive: true });
      const config = withRuntimeProfileSelection(deps.config, item.runtimeProfile);
      const file = deps.materializeConversationArtifact
        ? await deps.materializeConversationArtifact({
            provider,
            config,
            conversationId: item.providerConversationId,
            artifact,
            destDir,
            projectId: item.projectId,
            providerConversationUrl: item.providerConversationUrl,
          })
        : await materializeProviderConversationArtifact({
            provider,
            config,
            conversationId: item.providerConversationId,
            artifact,
            destDir,
            projectId: item.projectId,
            providerConversationUrl: item.providerConversationUrl,
          });
      if (!file?.localPath) {
        return {
          object: 'run_archive_item_materialization',
          generatedAt: now().toISOString(),
          status: 'skipped',
          item,
          file: file ? fileToResult(file) : null,
          message: 'Provider artifact materializer did not produce a local file.',
        };
      }
      const materializedAt = now().toISOString();
      const updatedItem = await materializedArchiveItem(item, file, materializedAt);
      await indexStore.upsertItems([updatedItem], {
        updatedAt: materializedAt,
        removeExisting: (candidate) => candidate.id === updatedItem.id,
      });
      return {
        object: 'run_archive_item_materialization',
        generatedAt: materializedAt,
        status: 'materialized',
        item: updatedItem,
        file: fileToResult(file),
        message: 'Archive item materialized and indexed.',
      };
    },
  };
}

async function findExistingMaterializedItemAsset(item: RunArchiveItem): Promise<FileRef | null> {
  const provider = normalizeProviderId(item.provider);
  if (!provider) return null;
  const dir = path.join(getRunArchiveDir(), 'materialized', sanitizePathSegment(item.id));
  const files = await listRegularFiles(dir);
  if (files.length === 0) return null;
  const expectedFileName = normalizeComparableString(item.fileName ?? item.title);
  const match = expectedFileName
    ? files.find((file) => normalizeComparableString(path.basename(file)) === expectedFileName)
    : null;
  const localPath = match ?? (files.length === 1 ? files[0] : null);
  if (!localPath) return null;
  const stat = await fs.stat(localPath).catch(() => null);
  if (!stat?.isFile()) return null;
  const name = path.basename(localPath);
  return {
    id: item.artifactId ?? item.id,
    name,
    provider,
    source: 'conversation',
    localPath,
    remoteUrl: item.uri ?? undefined,
    mimeType: item.mimeType ?? inferMimeTypeFromName(name) ?? undefined,
    size: stat.size,
    metadata: {
      materialization: 'existing-materialized-directory',
      sourceArchiveItemId: item.id,
    },
  };
}

async function listRegularFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      files.push(entryPath);
    } else if (entry.isDirectory()) {
      files.push(...await listRegularFiles(entryPath));
    }
  }
  return files.sort();
}

async function findReusableArchiveAsset(
  service: RunArchiveService,
  item: RunArchiveItem,
): Promise<FileRef | null> {
  const query = item.uri ?? item.fileName ?? item.artifactId ?? null;
  if (!query) return null;
  const archive = await service.listItems({
    kind: 'generated_artifact',
    query,
    limit: 1000,
  }).catch(() => null);
  const match = archive?.items.find((candidate) =>
    candidate.id !== item.id &&
    candidate.kind === 'generated_artifact' &&
    candidate.fileAvailable === true &&
    Boolean(candidate.localPath) &&
    archiveItemsShareProviderArtifact(item, candidate)
  );
  if (!match?.localPath) return null;
  const provider = normalizeProviderId(match.provider) ?? normalizeProviderId(item.provider);
  if (!provider) return null;
  return {
    id: item.artifactId ?? item.id,
    name: match.fileName ?? item.fileName ?? item.title ?? match.title ?? item.id,
    provider,
    source: 'conversation',
    localPath: match.localPath,
    remoteUrl: match.uri ?? item.uri ?? undefined,
    mimeType: match.mimeType ?? item.mimeType ?? undefined,
    size: readNumber(match.metadata.fileSizeBytes) ?? undefined,
    checksumSha256: match.checksumSha256 ?? undefined,
    metadata: {
      materialization: 'existing-archive-asset',
      sourceArchiveItemId: match.id,
      sourceResponseId: match.responseId,
      sourceProviderConversationId: match.providerConversationId,
      sourceCacheKey: match.cacheKey,
    },
  };
}

function archiveItemsShareProviderArtifact(left: RunArchiveItem, right: RunArchiveItem): boolean {
  const leftUri = normalizeComparableString(left.uri);
  const rightUri = normalizeComparableString(right.uri);
  if (leftUri && rightUri && leftUri === rightUri) {
    return sameNullable(left.provider, right.provider) &&
      sameNullable(left.providerConversationId, right.providerConversationId);
  }
  const leftFile = normalizeComparableString(left.fileName ?? left.title);
  const rightFile = normalizeComparableString(right.fileName ?? right.title);
  return Boolean(leftFile && rightFile && leftFile === rightFile) &&
    sameNullable(left.provider, right.provider) &&
    sameNullable(left.providerConversationId, right.providerConversationId);
}

function normalizeComparableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function sameNullable(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left === right);
}

async function materializeProviderConversationArtifact(input: {
  provider: ProviderId;
  config: ResolvedUserConfig | Record<string, unknown>;
  conversationId: string;
  artifact: ConversationArtifact;
  destDir: string;
  projectId: string | null;
  providerConversationUrl: string | null;
}): Promise<FileRef | null> {
  const llmService = createLlmService(input.provider, input.config as ResolvedUserConfig);
  return llmService.materializeConversationArtifact(
    input.conversationId,
    input.artifact,
    input.destDir,
    {
      projectId: input.projectId ?? undefined,
      listOptions: {
        configuredUrl: input.providerConversationUrl,
        projectId: input.projectId,
        tabUrl: input.providerConversationUrl,
      },
    },
  );
}

function archiveItemToConversationArtifact(item: RunArchiveItem): ConversationArtifact {
  const metadata = item.metadata ?? {};
  const parsedDownload = parseDownloadArtifactIdentity(item);
  const providerArtifactId =
    readString(metadata.providerArtifactId) ??
    readString(metadata.fileId) ??
    readString(metadata.remoteId) ??
    parsedDownload?.uri ??
    (isSandboxArtifactUri(item.uri) ? item.uri : null) ??
    item.artifactId ??
    item.id;
  const title = item.fileName ?? item.title ?? item.artifactId ?? providerArtifactId;
  return {
    id: providerArtifactId,
    title,
    kind: normalizeArtifactKind(
      readString(metadata.providerArtifactKind) ?? readString(metadata.artifactKind),
      item.uri ?? parsedDownload?.uri ?? null,
    ),
    uri: item.uri ?? parsedDownload?.uri ?? readString(metadata.remoteUrl) ?? undefined,
    ...(parsedDownload?.messageId ? { messageId: parsedDownload.messageId } : {}),
    metadata: {
      ...metadata,
      providerArtifactId,
      originalArchiveArtifactId: item.artifactId,
      archiveItemId: item.id,
      responseId: item.responseId,
      batchId: item.batchId,
      fileName: item.fileName,
      ...(parsedDownload?.messageId ? { messageId: parsedDownload.messageId } : {}),
    },
  };
}

function parseDownloadArtifactIdentity(item: RunArchiveItem): { messageId: string | null; uri: string } | null {
  for (const candidate of [item.artifactId, item.id]) {
    if (typeof candidate !== 'string') continue;
    const marker = ':download:';
    const markerIndex = candidate.indexOf(marker);
    if (markerIndex < 0) continue;
    const uri = candidate.slice(markerIndex + marker.length).trim();
    if (!isSandboxArtifactUri(uri)) continue;
    const prefix = candidate.slice(0, markerIndex).split(':').pop()?.trim() ?? '';
    return {
      messageId: prefix.length > 0 ? prefix : null,
      uri,
    };
  }
  return null;
}

function isSandboxArtifactUri(value: unknown): value is string {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('sandbox:');
}

async function materializedArchiveItem(
  item: RunArchiveItem,
  file: FileRef,
  materializedAt: string,
): Promise<RunArchiveItem> {
  const localPath = file.localPath ?? null;
  const checksumSha256 = file.checksumSha256 ?? await calculateFileSha256(localPath);
  const fileSizeBytes = readNumber(file.size) ?? await readFileSize(localPath);
  const fileAvailable = localPath ? await fileExists(localPath) : false;
  return {
    ...item,
    updatedAt: materializedAt,
    fileName: file.name ?? item.fileName,
    mimeType: file.mimeType ?? item.mimeType,
    localPath,
    uri: file.remoteUrl ?? item.uri,
    cacheKey: checksumSha256 ? `sha256:${checksumSha256}` : localPath ? `path:${localPath}` : item.cacheKey,
    checksumSha256,
    fileAvailable,
    links: {
      ...item.links,
      ...(fileAvailable ? { asset: `/v1/archive/items/b64/${Buffer.from(item.id, 'utf8').toString('base64url')}/asset` } : {}),
    },
    metadata: {
      ...item.metadata,
      ...(file.metadata ?? {}),
      localPath,
      path: localPath,
      remoteUrl: file.remoteUrl ?? item.uri ?? null,
      fileName: file.name ?? item.fileName,
      mimeType: file.mimeType ?? item.mimeType,
      ...(checksumSha256 ? { checksumSha256 } : {}),
      ...(fileSizeBytes !== null ? { fileSizeBytes } : {}),
      fileAvailable,
      materialization: {
        status: fileAvailable ? 'materialized' : 'missing-local-file',
        materializedAt,
        source: 'archive-item-materialization',
        method: readString(file.metadata?.materialization),
      },
    },
  };
}

function fileToResult(file: FileRef): ArchiveItemMaterializationResult['file'] {
  return {
    id: file.id,
    name: file.name,
    localPath: file.localPath ?? null,
    remoteUrl: file.remoteUrl ?? null,
    mimeType: file.mimeType ?? null,
    size: readNumber(file.size),
  };
}

function normalizeProviderId(value: string | null): ProviderId | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function normalizeArtifactKind(value: string | null, uri: string | null): ConversationArtifact['kind'] {
  if (value === 'document' || value === 'download' || value === 'canvas' || value === 'generated' || value === 'image' || value === 'spreadsheet') {
    return value;
  }
  if (uri?.trim().toLowerCase().startsWith('sandbox:')) return 'download';
  return 'generated';
}

function withRuntimeProfileSelection(config: ResolvedUserConfig | Record<string, unknown>, runtimeProfile: string | null): Record<string, unknown> {
  if (!runtimeProfile) return config;
  return {
    ...config,
    defaultRuntimeProfile: runtimeProfile,
    auracallProfile: runtimeProfile,
  };
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'archive-item';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function inferMimeTypeFromName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith('.json')) return 'application/json';
  if (normalized.endsWith('.txt')) return 'text/plain';
  if (normalized.endsWith('.md')) return 'text/markdown';
  if (normalized.endsWith('.csv')) return 'text/csv';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (normalized.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

async function calculateFileSha256(localPath: string | null): Promise<string | null> {
  if (!localPath) return null;
  try {
    const buffer = await fs.readFile(localPath);
    return createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

async function readFileSize(localPath: string | null): Promise<number | null> {
  if (!localPath) return null;
  const stat = await fs.stat(localPath).catch(() => null);
  return stat?.isFile() ? stat.size : null;
}

async function fileExists(localPath: string | null): Promise<boolean> {
  if (!localPath) return false;
  const stat = await fs.stat(localPath).catch(() => null);
  return stat?.isFile() === true;
}
