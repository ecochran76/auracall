import type { UserConfig } from '../../config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../providers/types.js';
import type { Conversation, Project, ProviderId } from '../providers/domain.js';
import {
  matchConversationByTitle,
  matchProjectByName,
  readConversationCache,
  readProjectCache,
  resolveProviderCacheKey,
  writeConversationCache,
  writeProjectCache,
  PROVIDER_CACHE_TTL_MS,
} from '../providers/cache.js';
import { getProvider } from '../providers/index.js';
import { BrowserService } from '../service/browserService.js';
import type {
  CacheContext,
  CacheIdentity,
  CacheSettings,
  ConversationListResult,
  IdentityPrompt,
  LlmCapabilities,
  LlmServiceAdapter,
  ProjectListResult,
} from './types.js';

const DEFAULT_HISTORY_LIMIT = 200;

export class LlmService {
  readonly provider: LlmServiceAdapter;
  readonly providerId: ProviderId;
  private readonly browserService: BrowserService;
  private readonly identityPrompt?: IdentityPrompt;

  private constructor(
    private readonly userConfig: UserConfig,
    provider: LlmServiceAdapter,
    browserService: BrowserService,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    this.provider = provider;
    this.providerId = provider.id;
    this.browserService = browserService;
    this.identityPrompt = options?.identityPrompt;
  }

  static fromConfig(
    userConfig: UserConfig,
    providerId: ProviderId,
    options?: { identityPrompt?: IdentityPrompt; browserService?: BrowserService },
  ): LlmService {
    const provider = getProvider(providerId);
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig);
    return new LlmService(userConfig, provider as LlmServiceAdapter, browserService, options);
  }

  getCapabilities(): LlmCapabilities {
    return {
      projects: this.provider.capabilities?.projects ?? false,
      conversations: this.provider.capabilities?.conversations ?? false,
      rename: Boolean(this.provider.renameConversation),
      contexts: Boolean(this.provider.readConversationContext),
      files: Boolean(this.provider.listConversationFiles || this.provider.listProjectFiles),
      models: true,
    };
  }

  getConfiguredUrl(): string | null {
    return this.providerId === 'grok'
      ? this.userConfig.browser?.grokUrl ?? null
      : this.userConfig.browser?.chatgptUrl ?? this.userConfig.browser?.url ?? null;
  }

  async buildListOptions(
    overrides: BrowserProviderListOptions = {},
    options: { ensurePort?: boolean } = {},
  ): Promise<BrowserProviderListOptions> {
    const configuredUrl = Object.prototype.hasOwnProperty.call(overrides, 'configuredUrl')
      ? overrides.configuredUrl ?? null
      : this.getConfiguredUrl();
    const launchUrl =
      configuredUrl ?? (this.providerId === 'grok' ? 'https://grok.com/' : 'https://chatgpt.com/');
    const target = await this.browserService.resolveDevToolsTarget({
      host: overrides.host,
      port: overrides.port,
      ensurePort: options.ensurePort,
      launchUrl,
    });
    return {
      ...overrides,
      port: target.port ?? overrides.port,
      host: target.host ?? overrides.host,
      configuredUrl,
      browserService: this.browserService,
    };
  }

  async listProjects(options?: BrowserProviderListOptions): Promise<ProjectListResult> {
    if (!this.provider.listProjects) {
      return [];
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return (await this.provider.listProjects(listOptions)) as ProjectListResult;
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<ConversationListResult> {
    if (!this.provider.listConversations) {
      return [];
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return (await this.withRetry(
      () => this.provider.listConversations?.(projectId, listOptions) as Promise<ConversationListResult>,
      { action: 'listConversations' },
    )) as ConversationListResult;
  }

  async renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void> {
    if (!this.provider.renameConversation) {
      throw new Error(`Rename is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    await this.provider.renameConversation(conversationId, newTitle, projectId, listOptions);
  }

  async resolveProjectIdByName(
    projectName: string,
    options?: {
      forceRefresh?: boolean;
      allowAutoRefresh?: boolean;
      allowFallback?: boolean;
      listOptions?: BrowserProviderListOptions;
    },
  ): Promise<string> {
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const cacheContext = await this.resolveCacheContext(listOptions);
    let cached = await readProjectCache(cacheContext);
    const allowAutoRefresh = options?.allowAutoRefresh ?? true;
    let didRefresh = false;
    const canList = Boolean(this.provider.listProjects);
    if ((options?.forceRefresh || (allowAutoRefresh && cached.stale)) && canList) {
      const items = await this.listProjects(listOptions);
      await writeProjectCache(cacheContext, items);
      cached = { items, fetchedAt: Date.now(), stale: false };
      didRefresh = true;
    }
    const { match, candidates } = matchProjectByName(cached.items, projectName);
    if (match) {
      return match.id;
    }
    if (!didRefresh && allowAutoRefresh && canList) {
      const items = await this.listProjects(listOptions);
      await writeProjectCache(cacheContext, items);
      const retry = matchProjectByName(items, projectName);
      if (retry.match) {
        return retry.match.id;
      }
    }
    if (candidates.length > 1) {
      const names = candidates.map((item) => item.name || item.id).join(', ');
      throw new Error(`Project name "${projectName}" is ambiguous. Matches: ${names}`);
    }
    if (options?.allowFallback && this.providerId === 'grok') {
      return projectName.trim();
    }
    throw new Error(`No cached project named "${projectName}". Run "oracle projects" to refresh.`);
  }

  async resolveConversationIdByName(
    conversationName: string,
    options?: {
      projectId?: string;
      forceRefresh?: boolean;
      listOptions?: BrowserProviderListOptions;
    },
  ): Promise<string> {
    const match = await this.resolveConversationByName(conversationName, options);
    return match.id;
  }

  async resolveConversationByName(
    conversationName: string,
    options?: {
      projectId?: string;
      forceRefresh?: boolean;
      allowAutoRefresh?: boolean;
      listOptions?: BrowserProviderListOptions;
    },
  ): Promise<Conversation> {
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const cacheContext = await this.resolveCacheContext(listOptions);
    let cached = await readConversationCache(cacheContext);
    const allowAutoRefresh = options?.allowAutoRefresh ?? true;
    let didRefresh = false;
    const canList = Boolean(this.provider.listConversations);
    if ((options?.forceRefresh || (allowAutoRefresh && cached.stale)) && canList) {
      const items = await this.listConversations(options?.projectId, {
        ...listOptions,
        includeHistory: true,
        historyLimit: DEFAULT_HISTORY_LIMIT,
      });
      await writeConversationCache(cacheContext, items);
      cached = { items, fetchedAt: Date.now(), stale: false };
      didRefresh = true;
    }
    const { match, candidates } = matchConversationByTitle(cached.items, conversationName);
    if (match) {
      return match;
    }
    if (!didRefresh && allowAutoRefresh && canList) {
      const items = await this.listConversations(options?.projectId, {
        ...listOptions,
        includeHistory: true,
        historyLimit: DEFAULT_HISTORY_LIMIT,
      });
      await writeConversationCache(cacheContext, items);
      const retry = matchConversationByTitle(items, conversationName);
      if (retry.match) {
        return retry.match;
      }
    }
    if (candidates.length > 1) {
      const names = candidates.map((item) => item.title || item.id).join(', ');
      throw new Error(`Conversation name "${conversationName}" is ambiguous. Matches: ${names}`);
    }
    throw new Error(`No cached conversation named "${conversationName}". Run "oracle conversations" to refresh.`);
  }

  async resolveCacheContext(
    listOptions: BrowserProviderListOptions,
    options: { prompt?: boolean } = {},
  ): Promise<CacheContext> {
    const settings = this.getCacheSettings();
    const identity = await this.resolveCacheIdentity(listOptions, options);
    return {
      provider: this.providerId,
      userConfig: this.userConfig,
      listOptions,
      ...settings,
      ...identity,
    };
  }

  getCacheSettings(): CacheSettings {
    const cacheConfig = this.userConfig.browser?.cache;
    const refreshHours = cacheConfig?.refreshHours;
    const ttlMs =
      typeof refreshHours === 'number' && Number.isFinite(refreshHours) && refreshHours > 0
        ? refreshHours * 60 * 60 * 1000
        : null;
    return {
      cacheRoot: cacheConfig?.rootDir ?? null,
      ttlMs: ttlMs ?? PROVIDER_CACHE_TTL_MS,
    };
  }

  async resolveCacheIdentity(
    listOptions: BrowserProviderListOptions,
    options: { prompt?: boolean } = {},
  ): Promise<CacheIdentity> {
    const normalizeIdentityKey = (value: string | null | undefined): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed.toLowerCase() : null;
    };
    const profileIdentity = this.resolveProfileServiceIdentity(this.providerId);
    let userIdentity: ProviderUserIdentity | null = profileIdentity;
    const cacheConfig = this.userConfig.browser?.cache;
    const useDetectedIdentity = Boolean(cacheConfig?.useDetectedIdentity);
    if (!userIdentity && useDetectedIdentity && this.provider.getUserIdentity) {
      try {
        userIdentity = await this.provider.getUserIdentity(listOptions);
      } catch {
        userIdentity = null;
      }
    }

    const identityKeyHint =
      typeof cacheConfig?.identityKey === 'string' && cacheConfig.identityKey.trim().length > 0
        ? normalizeIdentityKey(cacheConfig.identityKey)
        : null;
    const identityHint = cacheConfig?.identity ?? null;

    let identityKey: string | null = identityKeyHint;
    if (!identityKey && profileIdentity) {
      identityKey =
        normalizeIdentityKey(profileIdentity.email) ||
        normalizeIdentityKey(profileIdentity.handle) ||
        normalizeIdentityKey(profileIdentity.name) ||
        null;
    }
    if (!identityKey && identityHint) {
      identityKey =
        normalizeIdentityKey(identityHint.email) ||
        normalizeIdentityKey(identityHint.handle) ||
        normalizeIdentityKey(identityHint.name) ||
        null;
      if (identityKey) {
        userIdentity = userIdentity ?? {
          name: identityHint.name,
          handle: identityHint.handle,
          email: identityHint.email,
          source: 'config',
        };
      }
    }

    if (!identityKey && !userIdentity && this.identityPrompt && options.prompt !== false) {
      const prompted = await this.identityPrompt(this.providerId);
      if (prompted) {
        userIdentity = prompted;
        identityKey =
          normalizeIdentityKey(prompted.email) ||
          normalizeIdentityKey(prompted.handle) ||
          normalizeIdentityKey(prompted.name) ||
          null;
      }
    }

    if (!identityKey && userIdentity) {
      identityKey =
        normalizeIdentityKey(userIdentity.email) ||
        normalizeIdentityKey(userIdentity.handle) ||
        normalizeIdentityKey(userIdentity.name) ||
        null;
    }

    return { userIdentity, identityKey };
  }

  private resolveProfileServiceIdentity(provider: ProviderId): ProviderUserIdentity | null {
    const profileName = this.resolveActiveProfileName();
    const globalIdentity = this.userConfig.services?.[provider]?.identity;
    if (!profileName) {
      if (!globalIdentity) return null;
      return {
        name: globalIdentity.name,
        handle: globalIdentity.handle,
        email: globalIdentity.email,
        source: 'config',
      };
    }
    const profile = this.userConfig.oracleProfiles?.[profileName];
    const profileIdentity = profile?.services?.[provider]?.identity;
    const identity = profileIdentity ?? globalIdentity;
    if (!identity) return null;
    return {
      name: identity.name,
      handle: identity.handle,
      email: identity.email,
      source: profileIdentity ? 'profile' : 'config',
    };
  }

  private resolveActiveProfileName(): string | null {
    const profiles = this.userConfig.oracleProfiles;
    if (!profiles) return null;
    const explicit = typeof this.userConfig.oracleProfile === 'string' ? this.userConfig.oracleProfile.trim() : '';
    if (explicit && profiles[explicit]) return explicit;
    if (profiles.default) return 'default';
    const keys = Object.keys(profiles);
    return keys.length ? keys[0] : null;
  }

  resolveProviderCacheKey(cacheContext: CacheContext): string {
    return resolveProviderCacheKey(cacheContext);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    options: { action: string; retries?: number } = { action: 'operation' },
  ): Promise<T> {
    const retries = typeof options.retries === 'number' ? options.retries : 1;
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= retries || !this.isRetryableError(error)) {
          throw error;
        }
        attempt += 1;
        await this.delay(500);
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('WebSocket connection closed') || message.includes('ECONNRESET');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
