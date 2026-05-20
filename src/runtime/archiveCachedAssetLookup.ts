import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { FileRef, ProviderId } from '../browser/providers/domain.js';
import type { RunArchiveItem } from './archiveService.js';

interface ArtifactFetchManifest {
  provider?: unknown;
  conversationId?: unknown;
  projectId?: unknown;
  entries?: unknown;
}

export interface CachedConversationAttachmentUnavailableEvidence {
  sourceArtifactFetchManifest: true;
  sourceArtifactFetchStatus: string;
  sourceArtifactFetchReason: string;
  sourceArtifactId: string | null;
  sourceFileId: string | null;
  sourceManifestPath: string;
  sourceManifestConversationId: string | null;
  sourceManifestProjectId: string | null;
}

export interface CachedConversationAttachmentEvidence {
  file: FileRef | null;
  unavailable: CachedConversationAttachmentUnavailableEvidence | null;
}

export async function findCachedConversationAttachmentAsset(item: RunArchiveItem): Promise<FileRef | null> {
  return (await findCachedConversationAttachmentEvidence(item)).file;
}

export async function findCachedConversationAttachmentEvidence(
  item: RunArchiveItem,
): Promise<CachedConversationAttachmentEvidence> {
  if (item.kind !== 'generated_artifact') return emptyEvidence();
  const provider = normalizeProviderId(item.provider);
  if (!provider || !item.providerConversationId) return emptyEvidence();
  const cacheRoot = path.join(getAuracallHomeDir(), 'cache', 'providers', provider);
  const identityDirs = await fs.readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  for (const identityDir of identityDirs) {
    if (!identityDir.isDirectory()) continue;
    const manifestPath = path.join(
      cacheRoot,
      identityDir.name,
      'conversation-attachments',
      item.providerConversationId,
      'artifact-fetch-manifest.json',
    );
    const manifest = await readArtifactFetchManifest(manifestPath);
    if (!manifest || !manifestMatchesItem(manifest, item, provider)) continue;
    const match = await findMatchingManifestEntry(manifest, manifestPath, item);
    if (match.file || match.unavailable) return match;
  }
  return emptyEvidence();
}

async function findMatchingManifestEntry(
  manifest: ArtifactFetchManifest,
  manifestPath: string,
  item: RunArchiveItem,
): Promise<CachedConversationAttachmentEvidence> {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const entry of entries) {
    if (!isRecord(entry) || !manifestEntryMatchesItem(entry, item)) continue;
    const status = readString(entry.status) ?? 'unknown';
    const localPath = readString(entry.localPath);
    const unavailable = (reason: string): CachedConversationAttachmentEvidence => ({
      file: null,
      unavailable: {
        sourceArtifactFetchManifest: true,
        sourceArtifactFetchStatus: status,
        sourceArtifactFetchReason: reason,
        sourceArtifactId: readString(entry.artifactId),
        sourceFileId: readString(entry.fileId),
        sourceManifestPath: manifestPath,
        sourceManifestConversationId: readString(manifest.conversationId),
        sourceManifestProjectId: readString(manifest.projectId),
      },
    });
    if (status !== 'materialized') return unavailable('artifact-fetch-entry-not-materialized');
    if (!localPath) return unavailable('artifact-fetch-entry-missing-local-path');
    if (!await fileExists(localPath)) return unavailable('artifact-fetch-local-file-missing');
    const stat = await fs.stat(localPath).catch(() => null);
    const provider = normalizeProviderId(item.provider);
    if (!stat?.isFile() || !provider) return unavailable('artifact-fetch-local-file-missing');
    const fileName = readString(entry.fileName) ?? path.basename(localPath);
    return {
      file: {
        id: readString(entry.fileId) ?? readString(entry.artifactId) ?? item.artifactId ?? item.id,
        name: fileName,
        provider,
        source: 'conversation',
        localPath,
        remoteUrl: readString(entry.remoteUrl) ?? item.uri ?? undefined,
        mimeType: readString(entry.mimeType) ?? item.mimeType ?? inferMimeTypeFromName(fileName) ?? undefined,
        size: readNumber(entry.size) ?? stat.size,
        metadata: {
          materialization: 'cached-conversation-attachment',
          sourceArtifactFetchManifest: true,
          sourceArtifactFetchStatus: status,
          sourceArtifactId: readString(entry.artifactId),
          sourceFileId: readString(entry.fileId),
        },
      },
      unavailable: null,
    };
  }
  return emptyEvidence();
}

function manifestMatchesItem(
  manifest: ArtifactFetchManifest,
  item: RunArchiveItem,
  provider: ProviderId,
): boolean {
  if (readString(manifest.provider) !== provider) return false;
  if (readString(manifest.conversationId) !== item.providerConversationId) return false;
  const manifestProjectId = readString(manifest.projectId);
  return !manifestProjectId || !item.projectId || manifestProjectId === item.projectId;
}

function manifestEntryMatchesItem(entry: Record<string, unknown>, item: RunArchiveItem): boolean {
  const entryArtifactId = normalizeComparableString(readString(entry.artifactId));
  const itemArtifactId = normalizeComparableString(item.artifactId);
  if (entryArtifactId && itemArtifactId && entryArtifactId === itemArtifactId) return true;
  const entryUri = normalizeComparableString(readString(entry.uri));
  const itemUri = normalizeComparableString(item.uri);
  if (entryUri && itemUri && entryUri === itemUri) return true;
  const entryFileName = normalizeComparableString(readString(entry.fileName) ?? readString(entry.title));
  const itemFileName = normalizeComparableString(item.fileName ?? item.title);
  return Boolean(entryFileName && itemFileName && entryFileName === itemFileName);
}

async function readArtifactFetchManifest(manifestPath: string): Promise<ArtifactFetchManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fileExists(localPath: string): Promise<boolean> {
  const stat = await fs.stat(localPath).catch(() => null);
  return stat?.isFile() === true;
}

function normalizeProviderId(value: string | null): ProviderId | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
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

function normalizeComparableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function emptyEvidence(): CachedConversationAttachmentEvidence {
  return {
    file: null,
    unavailable: null,
  };
}
