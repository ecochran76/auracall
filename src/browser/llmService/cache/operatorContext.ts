import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../../../auracallHome.js';
import type { ResolvedUserConfig } from '../../../config.js';
import type { ProviderId } from '../../providers/domain.js';
import type { BrowserProviderListOptions } from '../../providers/types.js';
import { LlmService } from '../llmService.js';
import { createLlmService } from '../providers/index.js';
import type { CacheContext, IdentityPrompt } from '../types.js';

export type CacheCliProvider = ProviderId;

export const CACHE_CLI_PROVIDER_VALUES = ['chatgpt', 'gemini', 'grok'] as const;

export function isCacheCliProvider(value: string): value is CacheCliProvider {
  return (CACHE_CLI_PROVIDER_VALUES as readonly string[]).includes(value);
}

export function resolveProviderConfiguredUrl(
  userConfig: ResolvedUserConfig,
  provider: CacheCliProvider,
): string | null {
  if (provider === 'grok') {
    return userConfig.browser?.grokUrl ?? null;
  }
  if (provider === 'gemini') {
    return userConfig.browser?.geminiUrl ?? userConfig.browser?.url ?? null;
  }
  return userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null;
}

export function assertCacheIdentity(
  identity: { identityKey?: string | null },
  provider: string,
): asserts identity is { identityKey: string } {
  if (!identity.identityKey) {
    throw new Error(
      `Cache identity for ${provider} is required. ` +
        'Set browser.cache.identityKey (or browser.cache.identity) in config, or sign in so Aura-Call can detect it.',
    );
  }
}

export async function resolveCacheOperatorContext(input: {
  provider: CacheCliProvider;
  userConfig: ResolvedUserConfig;
  identityPrompt?: IdentityPrompt;
  listOptions?: BrowserProviderListOptions;
  cacheResolve?: { prompt?: boolean; detect?: boolean };
}): Promise<{
  provider: CacheCliProvider;
  llmService: LlmService;
  listOptions: BrowserProviderListOptions;
  cacheContext: CacheContext & { identityKey: string };
}> {
  const llmService = createLlmService(input.provider, input.userConfig, {
    identityPrompt: input.identityPrompt,
  });
  const listOptions = await llmService.buildListOptions(
    input.listOptions ?? {
      configuredUrl: resolveProviderConfiguredUrl(input.userConfig, input.provider),
    },
  );
  const cacheContext = await llmService.resolveCacheContext(listOptions, {
    prompt: false,
    detect: false,
    ...(input.cacheResolve ?? {}),
  });
  assertCacheIdentity(cacheContext, input.provider);
  return {
    provider: input.provider,
    llmService,
    listOptions,
    cacheContext,
  };
}

export async function discoverCacheMaintenanceContexts(input: {
  userConfig: ResolvedUserConfig;
  providerFilter: string | null;
  identityFilter: string | null;
  identityPrompt?: IdentityPrompt;
}): Promise<
  Array<{
    provider: CacheCliProvider;
    identityKey: string;
    cacheDir: string;
    llmService: LlmService;
    listOptions: BrowserProviderListOptions;
    cacheContext: CacheContext & { identityKey: string };
  }>
> {
  const cacheRoot = path.join(getAuracallHomeDir(), 'cache', 'providers');
  let providerEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    providerEntries = await fs.readdir(cacheRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const output: Array<{
    provider: CacheCliProvider;
    identityKey: string;
    cacheDir: string;
    llmService: LlmService;
    listOptions: BrowserProviderListOptions;
    cacheContext: CacheContext & { identityKey: string };
  }> = [];

  for (const providerEntry of providerEntries) {
    if (!providerEntry.isDirectory()) continue;
    if (!isCacheCliProvider(providerEntry.name)) continue;
    if (input.providerFilter && providerEntry.name !== input.providerFilter) continue;
    const provider = providerEntry.name as CacheCliProvider;
    const resolved = await resolveCacheOperatorContext({
      provider,
      userConfig: input.userConfig,
      identityPrompt: input.identityPrompt,
    });
    const providerDir = path.join(cacheRoot, provider);
    let identityEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      identityEntries = await fs.readdir(providerDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const identityEntry of identityEntries) {
      if (!identityEntry.isDirectory()) continue;
      if (input.identityFilter && identityEntry.name !== input.identityFilter) continue;
      output.push({
        provider,
        identityKey: identityEntry.name,
        cacheDir: path.join(providerDir, identityEntry.name),
        llmService: resolved.llmService,
        listOptions: resolved.listOptions,
        cacheContext: {
          ...resolved.cacheContext,
          identityKey: identityEntry.name,
          userIdentity: null,
        },
      });
    }
  }

  return output;
}
