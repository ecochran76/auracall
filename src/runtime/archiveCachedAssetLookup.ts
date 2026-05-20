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

export async function findCachedConversationAttachmentAsset(item: RunArchiveItem): Promise<FileRef | null> {
  if (item.kind !== 'generated_artifact') return null;
  const provider = normalizeProviderId(item.provider);
  if (!provider || !item.providerConversationId) return null;
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
    const match = await findMatchingManifestEntry(manifest, item);
    if (match) return match;
  }
  return null;
}

async function findMatchingManifestEntry(
  manifest: ArtifactFetchManifest,
  item: RunArchiveItem,
): Promise<FileRef | null> {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const entry of entries) {
    if (!isRecord(entry) || entry.status !== 'materialized') continue;
    const localPath = readString(entry.localPath);
    if (!localPath || !await fileExists(localPath)) continue;
    if (!manifestEntryMatchesItem(entry, item)) continue;
    const stat = await fs.stat(localPath).catch(() => null);
    const provider = normalizeProviderId(item.provider);
    if (!stat?.isFile() || !provider) continue;
    const fileName = readString(entry.fileName) ?? path.basename(localPath);
    return {
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
        sourceArtifactId: readString(entry.artifactId),
        sourceFileId: readString(entry.fileId),
      },
    };
  }
  return null;
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
