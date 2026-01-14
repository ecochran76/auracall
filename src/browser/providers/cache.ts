import fs from 'node:fs/promises';
import path from 'node:path';
import { getOracleHomeDir } from '../../oracleHome.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { Conversation, Project, ProviderId, ConversationContext, FileRef } from './domain.js';
import type { ResolvedUserConfig } from '../../config.js';

export const PROVIDER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface ProviderCache<T> {
  fetchedAt: string;
  items: T;
  sourceUrl?: string | null;
  userIdentity?: ProviderUserIdentity | null;
  identityKey?: string | null;
}

export interface CacheReadResult<T> {
  items: T;
  fetchedAt: number | null;
  stale: boolean;
}

export interface ProviderCacheContext {
  provider: ProviderId;
  userConfig: ResolvedUserConfig;
  listOptions: BrowserProviderListOptions;
  userIdentity?: ProviderUserIdentity | null;
  identityKey?: string | null;
  cacheRoot?: string | null;
  ttlMs?: number | null;
}

export interface CacheNameMatch<T> {
  match: T | null;
  candidates: T[];
}

export function resolveProviderCacheKey(context: ProviderCacheContext): string {
  const identityKey = resolveIdentityKey(context);
  const sanitized = identityKey.replace(/[\\/]/g, '_');
  if (process.env.ORACLE_DEBUG_CACHE === '1') {
    const payload = JSON.stringify({ provider: context.provider, identityKey });
    console.error(`[cache] key=${sanitized} payload=${payload}`);
  }
  return sanitized;
}

export async function readProjectCache(
  context: ProviderCacheContext,
): Promise<CacheReadResult<Project[]>> {
  return readProviderCache<Project[]>(context, 'projects.json', []);
}

export async function readConversationCache(
  context: ProviderCacheContext,
): Promise<CacheReadResult<Conversation[]>> {
  return readProviderCache<Conversation[]>(context, 'conversations.json', []);
}

export async function writeProjectCache(
  context: ProviderCacheContext,
  items: Project[],
): Promise<void> {
  await writeProviderCache(context, 'projects.json', items);
}

export async function writeConversationCache(
  context: ProviderCacheContext,
  items: Conversation[],
): Promise<void> {
  await writeProviderCache(context, 'conversations.json', items);
}

export async function readConversationContextCache(
  context: ProviderCacheContext,
  conversationId: string,
): Promise<CacheReadResult<ConversationContext>> {
  return readProviderCache<ConversationContext>(context, `contexts/${conversationId}.json`, {
    provider: context.provider,
    conversationId,
    messages: [],
  });
}

export async function writeConversationContextCache(
  context: ProviderCacheContext,
  conversationId: string,
  payload: ConversationContext,
): Promise<void> {
  await writeProviderCache(context, `contexts/${conversationId}.json`, payload);
}

export async function readConversationFilesCache(
  context: ProviderCacheContext,
  conversationId: string,
): Promise<CacheReadResult<FileRef[]>> {
  return readProviderCache<FileRef[]>(context, `conversation-files/${conversationId}.json`, []);
}

export async function writeConversationFilesCache(
  context: ProviderCacheContext,
  conversationId: string,
  files: FileRef[],
): Promise<void> {
  await writeProviderCache(context, `conversation-files/${conversationId}.json`, files);
}

export async function readConversationAttachmentsCache(
  context: ProviderCacheContext,
  conversationId: string,
): Promise<CacheReadResult<FileRef[]>> {
  return readProviderCache<FileRef[]>(
    context,
    `conversation-attachments/${conversationId}/manifest.json`,
    [],
  );
}

export async function writeConversationAttachmentsCache(
  context: ProviderCacheContext,
  conversationId: string,
  files: FileRef[],
): Promise<void> {
  await writeProviderCache(context, `conversation-attachments/${conversationId}/manifest.json`, files);
}

export async function readProjectKnowledgeCache(
  context: ProviderCacheContext,
  projectId: string,
): Promise<CacheReadResult<FileRef[]>> {
  return readProviderCache<FileRef[]>(
    context,
    `project-knowledge/${projectId}/manifest.json`,
    [],
  );
}

export async function writeProjectKnowledgeCache(
  context: ProviderCacheContext,
  projectId: string,
  files: FileRef[],
): Promise<void> {
  await writeProviderCache(context, `project-knowledge/${projectId}/manifest.json`, files);
}

export async function readProjectInstructionsCache(
  context: ProviderCacheContext,
  projectId: string,
): Promise<CacheReadResult<{ content: string; format: 'md' }>> {
  return readProviderCache<{ content: string; format: 'md' }>(
    context,
    `project-instructions/${projectId}.json`,
    { content: '', format: 'md' },
  );
}

export async function writeProjectInstructionsCache(
  context: ProviderCacheContext,
  projectId: string,
  content: string,
): Promise<void> {
  await writeProviderCache(context, `project-instructions/${projectId}.json`, {
    content,
    format: 'md',
  });
  const { cacheDir } = resolveProviderCachePath(context, `project-instructions/${projectId}.json`);
  const mdPath = path.join(cacheDir, 'project-instructions', `${projectId}.md`);
  await fs.mkdir(path.dirname(mdPath), { recursive: true });
  await fs.writeFile(mdPath, `${content.trim()}\n`, 'utf8');
}

export function matchProjectByName(projects: Project[], name: string): CacheNameMatch<Project> {
  return matchByName(projects, name, (project) => project.name || project.id);
}

export function matchConversationByTitle(
  conversations: Conversation[],
  title: string,
): CacheNameMatch<Conversation> {
  const result = matchByName(conversations, title, (conversation) => conversation.title || conversation.id);
  if (!result.match && result.candidates.length > 1) {
    // Resolve ambiguity by picking the most recent one
    const sorted = [...result.candidates].sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return tb - ta;
    });
    return { match: sorted[0], candidates: sorted };
  }
  return result;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchByName<T>(
  items: T[],
  rawName: string,
  getName: (item: T) => string,
): CacheNameMatch<T> {
  const name = normalize(rawName);
  if (!name) {
    return { match: null, candidates: [] };
  }
  const candidates = items.filter((item) => normalize(getName(item)) === name);
  if (candidates.length === 1) {
    return { match: candidates[0], candidates: [] };
  }
  if (candidates.length > 1) {
    return { match: null, candidates };
  }
  const tokens = name.split(' ').filter((token) => token.length >= 3);
  if (tokens.length === 0) {
    return { match: null, candidates: [] };
  }
  const fuzzy = items.filter((item) => {
    const haystack = normalize(getName(item));
    return tokens.every((token) => haystack.includes(token));
  });
  if (fuzzy.length === 1) {
    return { match: fuzzy[0], candidates: [] };
  }
  return { match: null, candidates: fuzzy };
}

export function resolveProviderCachePath(
  context: ProviderCacheContext,
  fileName: string,
): {
  cacheDir: string;
  cacheFile: string;
  configuredUrl: string | null;
} {
  const cacheRoot = context.cacheRoot ?? path.join(getOracleHomeDir(), 'cache', 'providers');
  const key = resolveProviderCacheKey(context);
  const cacheDir = path.join(cacheRoot, context.provider, key);
  const cacheFile = path.join(cacheDir, fileName);
  return {
    cacheDir,
    cacheFile,
    configuredUrl: context.listOptions.configuredUrl ?? null,
  };
}

async function readProviderCache<T>(
  context: ProviderCacheContext,
  fileName: string,
  fallback: T,
): Promise<CacheReadResult<T>> {
  const { cacheFile, configuredUrl } = resolveProviderCachePath(context, fileName);
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as ProviderCache<T>;
    const fetchedAt = parsed?.fetchedAt ? Date.parse(parsed.fetchedAt) : NaN;
    const now = Date.now();
    const ttlMs = resolveCacheTtl(context);
    const tooOld = Number.isFinite(fetchedAt) ? now - fetchedAt > ttlMs : true;
    const urlMismatch =
      typeof configuredUrl === 'string' &&
      configuredUrl.length > 0 &&
      typeof parsed?.sourceUrl === 'string' &&
      parsed.sourceUrl.length > 0 &&
      configuredUrl !== parsed.sourceUrl;
    const identityMismatch = hasIdentityMismatch(context, parsed);
    return {
      items: resolveCacheItems(parsed?.items, fallback),
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
      stale: tooOld || urlMismatch || identityMismatch,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return { items: fallback, fetchedAt: null, stale: true };
    }
    throw error;
  }
}

function resolveCacheItems<T>(items: T | undefined, fallback: T): T {
  if (items === undefined || items === null) {
    return fallback;
  }
  if (Array.isArray(fallback) && !Array.isArray(items)) {
    return fallback;
  }
  return items;
}

async function writeProviderCache<T>(
  context: ProviderCacheContext,
  fileName: string,
  items: T,
): Promise<void> {
  const { cacheDir, cacheFile, configuredUrl } = resolveProviderCachePath(context, fileName);
  await fs.mkdir(cacheDir, { recursive: true });
  const identity = sanitizeUserIdentity(context.userIdentity ?? null);
  const payload: ProviderCache<T> = {
    fetchedAt: new Date().toISOString(),
    items,
    sourceUrl: configuredUrl ?? null,
    userIdentity: identity,
    identityKey: resolveIdentityKey(context),
  };
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
}

function resolveIdentityKey(context: ProviderCacheContext): string {
  if (context.identityKey && context.identityKey.trim().length > 0) {
    return context.identityKey.trim();
  }
  const derived = deriveIdentityKey(context.userIdentity ?? null);
  if (!derived) {
    throw new Error('Cache identity is required (no user identity available).');
  }
  return derived;
}

function deriveIdentityKey(identity: ProviderUserIdentity | null): string | null {
  if (!identity) return null;
  const candidate = identity.email || identity.handle || identity.name;
  if (!candidate) return null;
  return candidate.toLowerCase().trim();
}

function hasIdentityMismatch(
  context: ProviderCacheContext,
  cached: ProviderCache<unknown>,
): boolean {
  const currentKey = (context.identityKey ?? deriveIdentityKey(context.userIdentity ?? null) ?? '').trim();
  const cachedKey = (cached.identityKey ?? deriveIdentityKey(cached.userIdentity ?? null) ?? '').trim();
  if (!currentKey || !cachedKey) return false;
  return currentKey !== cachedKey;
}

function sanitizeUserIdentity(identity: ProviderUserIdentity | null): ProviderUserIdentity | null {
  if (!identity) return null;
  const cleaned = {
    name: identity.name,
    handle: identity.handle,
    email: identity.email,
    source: identity.source,
  };
  const hasValue = Boolean(cleaned.name || cleaned.handle || cleaned.email);
  return hasValue ? cleaned : null;
}

function resolveCacheTtl(context: ProviderCacheContext): number {
  if (context.ttlMs && Number.isFinite(context.ttlMs) && context.ttlMs > 0) {
    return context.ttlMs;
  }
  return PROVIDER_CACHE_TTL_MS;
}
