import path from 'node:path';
import type { ProviderCacheContext } from '../../providers/cache.js';
import { readCacheIndex, type CacheIndexEntry } from './index.js';

export type CacheExportFormat = 'json' | 'md' | 'html' | 'csv' | 'zip';
export type CacheExportScope = 'projects' | 'conversations' | 'conversation';

export interface CacheExportOptions {
  format: CacheExportFormat;
  scope: CacheExportScope;
  projectId?: string;
  conversationId?: string;
  outputDir: string;
}

export interface CacheExportPlan {
  outputDir: string;
  entries: CacheIndexEntry[];
  format: CacheExportFormat;
  scope: CacheExportScope;
}

export async function buildCacheExportPlan(
  context: ProviderCacheContext,
  options: CacheExportOptions,
): Promise<CacheExportPlan> {
  const index = await readCacheIndex(context);
  const scope = options.scope;
  let entries = index.entries;
  if (scope === 'projects' && options.projectId) {
    entries = entries.filter((entry) => entry.projectId === options.projectId);
  }
  if (scope === 'conversation' && options.conversationId) {
    entries = entries.filter((entry) => entry.conversationId === options.conversationId);
  }
  return {
    outputDir: path.resolve(options.outputDir),
    entries,
    format: options.format,
    scope,
  };
}
