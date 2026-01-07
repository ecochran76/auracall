import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getOracleHomeDir } from '../../oracleHome.js';
import type { BrowserProviderListOptions } from './types.js';
import type { Conversation, Project, ProviderId } from './domain.js';
import type { UserConfig } from '../../config.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface ProviderCache<T> {
  fetchedAt: string;
  items: T[];
  sourceUrl?: string | null;
}

export interface CacheReadResult<T> {
  items: T[];
  fetchedAt: number | null;
  stale: boolean;
}

export interface ProviderCacheContext {
  provider: ProviderId;
  userConfig: UserConfig;
  listOptions: BrowserProviderListOptions;
}

export interface CacheNameMatch<T> {
  match: T | null;
  candidates: T[];
}

export function resolveProviderCacheKey(context: ProviderCacheContext): string {
  const browser = context.userConfig.browser ?? {};
  const signature = {
    provider: context.provider,
    chromePath: browser.chromePath ?? null,
    chromeProfile: browser.chromeProfile ?? null,
    chromeCookiePath: browser.chromeCookiePath ?? null,
    manualLoginProfileDir: browser.manualLoginProfileDir ?? null,
    configuredUrl: context.listOptions.configuredUrl ?? null,
    grokUrl: browser.grokUrl ?? null,
    chatgptUrl: browser.chatgptUrl ?? null,
    geminiUrl: browser.geminiUrl ?? null,
  };
  const payload = JSON.stringify(signature);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

export async function readProjectCache(
  context: ProviderCacheContext,
): Promise<CacheReadResult<Project>> {
  return readProviderCache<Project>(context, 'projects.json');
}

export async function readConversationCache(
  context: ProviderCacheContext,
): Promise<CacheReadResult<Conversation>> {
  return readProviderCache<Conversation>(context, 'conversations.json');
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

export function matchProjectByName(projects: Project[], name: string): CacheNameMatch<Project> {
  return matchByName(projects, name, (project) => project.name || project.id);
}

export function matchConversationByTitle(
  conversations: Conversation[],
  title: string,
): CacheNameMatch<Conversation> {
  return matchByName(conversations, title, (conversation) => conversation.title || conversation.id);
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

async function readProviderCache<T>(
  context: ProviderCacheContext,
  fileName: string,
): Promise<CacheReadResult<T>> {
  const { cacheFile, configuredUrl } = resolveCachePath(context, fileName);
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as ProviderCache<T>;
    const fetchedAt = parsed?.fetchedAt ? Date.parse(parsed.fetchedAt) : NaN;
    const now = Date.now();
    const tooOld = Number.isFinite(fetchedAt) ? now - fetchedAt > CACHE_TTL_MS : true;
    const urlMismatch =
      typeof configuredUrl === 'string' &&
      configuredUrl.length > 0 &&
      typeof parsed?.sourceUrl === 'string' &&
      parsed.sourceUrl.length > 0 &&
      configuredUrl !== parsed.sourceUrl;
    return {
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
      stale: tooOld || urlMismatch,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return { items: [], fetchedAt: null, stale: true };
    }
    throw error;
  }
}

async function writeProviderCache<T>(
  context: ProviderCacheContext,
  fileName: string,
  items: T[],
): Promise<void> {
  const { cacheDir, cacheFile, configuredUrl } = resolveCachePath(context, fileName);
  await fs.mkdir(cacheDir, { recursive: true });
  const payload: ProviderCache<T> = {
    fetchedAt: new Date().toISOString(),
    items,
    sourceUrl: configuredUrl ?? null,
  };
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
}

function resolveCachePath(context: ProviderCacheContext, fileName: string): {
  cacheDir: string;
  cacheFile: string;
  configuredUrl: string | null;
} {
  const cacheRoot = path.join(getOracleHomeDir(), 'cache', 'providers');
  const key = resolveProviderCacheKey(context);
  const cacheDir = path.join(cacheRoot, context.provider, key);
  const cacheFile = path.join(cacheDir, fileName);
  return {
    cacheDir,
    cacheFile,
    configuredUrl: context.listOptions.configuredUrl ?? null,
  };
}
