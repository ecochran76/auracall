import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../../../auracallHome.js';
import type { ProviderCacheContext } from '../../providers/cache.js';
import { resolveProviderCacheKey, resolveProviderCachePath } from '../../providers/cache.js';

export type CacheIndexKind =
  | 'projects'
  | 'conversations'
  | 'context'
  | 'account-mirror'
  | 'account-mirror-artifacts'
  | 'account-mirror-files'
  | 'account-mirror-media'
  | 'account-files'
  | 'conversation-files'
  | 'project-instructions'
  | 'project-knowledge'
  | 'conversation-attachments'
  | 'exports';

export interface CacheIndexEntry {
  kind: CacheIndexKind;
  path: string;
  updatedAt: string;
  fileId?: string;
  projectId?: string;
  conversationId?: string;
  sourceUrl?: string | null;
}

export interface CacheIndex {
  version: 1;
  updatedAt: string;
  entries: CacheIndexEntry[];
}

export async function readCacheIndex(context: ProviderCacheContext): Promise<CacheIndex> {
  const indexPath = resolveCacheIndexPath(context);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as CacheIndex;
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

export async function upsertCacheIndexEntry(
  context: ProviderCacheContext,
  entry: Omit<CacheIndexEntry, 'updatedAt'>,
): Promise<void> {
  const index = await readCacheIndex(context);
  const now = new Date().toISOString();
  const next: CacheIndexEntry = { ...entry, updatedAt: now };
  const existingIndex = index.entries.findIndex((candidate) =>
    candidate.kind === next.kind &&
    candidate.path === next.path &&
    candidate.projectId === next.projectId &&
    candidate.conversationId === next.conversationId,
  );
  if (existingIndex >= 0) {
    index.entries[existingIndex] = next;
  } else {
    index.entries.push(next);
  }
  index.updatedAt = now;
  await writeCacheIndex(context, index);
}

export function resolveCacheEntryPath(context: ProviderCacheContext, fileName: string): string {
  const { cacheDir, cacheFile } = resolveProviderCachePath(context, fileName);
  return path.relative(cacheDir, cacheFile);
}

function resolveCacheIndexPath(context: ProviderCacheContext): string {
  const cacheRoot = context.cacheRoot ?? path.join(getAuracallHomeDir(), 'cache', 'providers');
  const key = resolveProviderCacheKey(context);
  return path.join(cacheRoot, context.provider, key, 'cache-index.json');
}

async function writeCacheIndex(context: ProviderCacheContext, payload: CacheIndex): Promise<void> {
  const indexPath = resolveCacheIndexPath(context);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(payload, null, 2), 'utf8');
}
