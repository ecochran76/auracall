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

export interface ArchiveItemMaterializationRequest {
  archiveItemId: string;
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
      const detail = await runArchiveService.readItem(archiveItemId);
      if (!detail) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} was not found.`, 404);
      }
      const item = detail.item;
      if (item.fileAvailable === true && item.localPath) {
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
      const provider = normalizeProviderId(item.provider);
      if (!provider) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} does not have a supported provider.`);
      }
      if (!item.providerConversationId) {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} does not have a provider conversation id.`);
      }
      if (item.kind !== 'generated_artifact') {
        throw new ArchiveMaterializationError(`Run archive item ${archiveItemId} is ${item.kind}; only generated_artifact materialization is supported.`);
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
  const providerArtifactId =
    readString(metadata.providerArtifactId) ??
    readString(metadata.fileId) ??
    readString(metadata.remoteId) ??
    item.artifactId ??
    item.id;
  const title = item.fileName ?? item.title ?? item.artifactId ?? providerArtifactId;
  return {
    id: providerArtifactId,
    title,
    kind: normalizeArtifactKind(readString(metadata.providerArtifactKind) ?? readString(metadata.artifactKind), item.uri),
    uri: item.uri ?? readString(metadata.remoteUrl) ?? undefined,
    metadata: {
      ...metadata,
      providerArtifactId,
      archiveItemId: item.id,
      responseId: item.responseId,
      batchId: item.batchId,
      fileName: item.fileName,
    },
  };
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
