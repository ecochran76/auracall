import type { ResolvedUserConfig } from '../../config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../providers/types.js';
import type { Conversation, Project, ProviderId } from '../providers/domain.js';
import {
  matchConversationByTitle,
  matchProjectByName,
  resolveProviderCacheKey,
  PROVIDER_CACHE_TTL_MS,
} from '../providers/cache.js';
import type { BrowserService } from '../service/browserService.js';
import type {
  CacheContext,
  CacheIdentity,
  CacheSettings,
  ConversationListResult,
  IdentityPrompt,
  LlmCapabilities,
  LlmServiceAdapter,
  PromptPlan,
  ProjectListResult,
} from './types.js';
import type { CacheStore } from './cache/store.js';
import { createCacheStore } from './cache/store.js';

const DEFAULT_HISTORY_LIMIT = 200;

export abstract class LlmService {
  readonly provider: LlmServiceAdapter;
  readonly providerId: ProviderId;
  private readonly browserService: BrowserService;
  private readonly cacheStore: CacheStore;
  private readonly identityPrompt?: IdentityPrompt;

  protected constructor(
    private readonly userConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    browserService: BrowserService,
    options?: { identityPrompt?: IdentityPrompt; cacheStore?: CacheStore },
  ) {
    this.provider = provider;
    this.providerId = provider.id;
    this.browserService = browserService;
    this.identityPrompt = options?.identityPrompt;
    this.cacheStore = options?.cacheStore ?? createCacheStore();
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

  resolveLaunchUrl(options: {
    configuredUrl?: string | null;
    projectId?: string | null;
    conversationId?: string | null;
  } = {}): string | null {
    const configuredUrl = options.configuredUrl ?? this.getConfiguredUrl();
    const conversationId = options.conversationId ?? null;
    const projectId = options.projectId ?? null;
    if (conversationId && this.provider.resolveConversationUrl) {
      return this.provider.resolveConversationUrl(conversationId, projectId ?? undefined) ?? configuredUrl ?? null;
    }
    if (projectId && this.provider.resolveProjectUrl) {
      return this.provider.resolveProjectUrl(projectId) ?? configuredUrl ?? null;
    }
    return configuredUrl ?? null;
  }

  async planPrompt(options: {
    configuredUrl?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    conversationId?: string | null;
    conversationName?: string | null;
    noProject?: boolean;
    allowAutoRefresh?: boolean;
    forceProjectRefresh?: boolean;
    forceConversationRefresh?: boolean;
    listOptions?: BrowserProviderListOptions;
  }): Promise<PromptPlan> {
    const configuredUrl = options.configuredUrl ?? this.getConfiguredUrl();
    const noProject = options.noProject === true;
    const projectName = noProject ? null : options.projectName?.trim() || null;
    const conversationName = options.conversationName?.trim() || null;
    let projectId = noProject ? null : options.projectId ?? null;
    let conversationId = options.conversationId ?? null;
    const allowAutoRefresh = options.allowAutoRefresh ?? true;

    if (!projectId && projectName) {
      projectId = await this.resolveProjectIdByName(projectName, {
        forceRefresh: options.forceProjectRefresh,
        allowAutoRefresh,
        allowFallback: this.providerId === 'grok',
        listOptions: options.listOptions,
      });
    }

    if (!conversationId && conversationName) {
      const match = await this.resolveConversationSelector(conversationName, {
        projectId: projectId ?? undefined,
        forceRefresh: options.forceConversationRefresh,
        allowAutoRefresh,
        listOptions: options.listOptions,
        noProject,
      });
      conversationId = match.id;
    }

    const targetUrl = this.resolveLaunchUrl({
      configuredUrl,
      projectId,
      conversationId,
    });
    const reusePolicy = conversationId ? 'reuse' : 'new';
    return {
      targetUrl,
      projectId,
      conversationId,
      reusePolicy,
      promptMode: reusePolicy === 'reuse' ? 'reuse' : 'new',
    };
  }

  deriveProjectsFromConfig(options: { configuredUrl?: string | null; projectId?: string | null } = {}): Project[] {
    const configuredUrl = options.configuredUrl ?? null;
    const resolvedId = options.projectId ?? this.extractProjectId(configuredUrl);
    if (!resolvedId) return [];
    return [
      {
        id: resolvedId,
        name: resolvedId,
        provider: this.providerId,
        url: configuredUrl ?? this.provider.resolveProjectUrl?.(resolvedId) ?? undefined,
      },
    ];
  }

  deriveConversationsFromConfig(options: {
    configuredUrl?: string | null;
    projectId?: string | null;
    conversationId?: string | null;
  } = {}): Conversation[] {
    const configuredUrl = options.configuredUrl ?? null;
    const resolvedId = options.conversationId ?? this.extractConversationId(configuredUrl);
    if (!resolvedId) return [];
    return [
      {
        id: resolvedId,
        title: resolvedId,
        provider: this.providerId,
        projectId: options.projectId ?? undefined,
        url: this.provider.resolveConversationUrl?.(resolvedId, options.projectId ?? undefined) ?? undefined,
      },
    ];
  }

  async buildListOptions(
    overrides: BrowserProviderListOptions = {},
    options: { ensurePort?: boolean } = {},
  ): Promise<BrowserProviderListOptions> {
    const configuredUrl = Object.hasOwn(overrides, 'configuredUrl')
      ? overrides.configuredUrl ?? null
      : this.getConfiguredUrl();
    const launchUrl =
      configuredUrl ?? (this.providerId === 'grok' ? 'https://grok.com/' : 'https://chatgpt.com/');
    const target = await this.browserService.resolveServiceTarget({
      serviceId: this.providerId,
      configuredUrl,
      ensurePort: options.ensurePort,
    });
    return {
      ...overrides,
      port: target.port ?? overrides.port,
      host: target.host ?? overrides.host,
      configuredUrl,
      tabTargetId: target.tab?.targetId,
      tabUrl: target.tab?.url ?? undefined,
      browserService: this.browserService,
    };
  }

  abstract listProjects(options?: BrowserProviderListOptions): Promise<ProjectListResult>;

  abstract listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<ConversationListResult>;

  abstract renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void>;

  abstract getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderUserIdentity | null>;

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
    let cached = await this.cacheStore.readProjects(cacheContext);
    const allowAutoRefresh = options?.allowAutoRefresh ?? true;
    let didRefresh = false;
    const canList = Boolean(this.provider.listProjects);
    if ((options?.forceRefresh || (allowAutoRefresh && cached.stale)) && canList) {
      const items = await this.listProjects(listOptions);
      await this.cacheStore.writeProjects(cacheContext, items);
      cached = { items, fetchedAt: Date.now(), stale: false };
      didRefresh = true;
    }
    const { match, candidates } = matchProjectByName(cached.items, projectName);
    if (match) {
      return match.id;
    }
    if (!didRefresh && allowAutoRefresh && canList) {
      const items = await this.listProjects(listOptions);
      await this.cacheStore.writeProjects(cacheContext, items);
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
    let cached = await this.cacheStore.readConversations(cacheContext);
    const allowAutoRefresh = options?.allowAutoRefresh ?? true;
    let didRefresh = false;
    const canList = Boolean(this.provider.listConversations);
    if ((options?.forceRefresh || (allowAutoRefresh && cached.stale)) && canList) {
      const items = await this.listConversations(options?.projectId, {
        ...listOptions,
        includeHistory: true,
        historyLimit: DEFAULT_HISTORY_LIMIT,
      });
      await this.cacheStore.writeConversations(cacheContext, items);
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
      await this.cacheStore.writeConversations(cacheContext, items);
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

  async resolveConversationSelector(
    selector: string,
    options?: {
      projectId?: string;
      forceRefresh?: boolean;
      allowAutoRefresh?: boolean;
      listOptions?: BrowserProviderListOptions;
      noProject?: boolean;
    },
  ): Promise<Conversation> {
    const normalized = selector.trim();
    const latestOffset = parseLatestSelector(normalized);
    if (latestOffset !== null) {
      return this.resolveLatestConversation(latestOffset, {
        projectId: options?.noProject ? undefined : options?.projectId,
        listOptions: options?.listOptions,
        noProject: options?.noProject,
      });
    }
    return this.resolveConversationByName(normalized, {
      projectId: options?.projectId,
      forceRefresh: options?.forceRefresh,
      allowAutoRefresh: options?.allowAutoRefresh,
      listOptions: options?.listOptions,
    });
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
    if (!userIdentity && useDetectedIdentity) {
      try {
        userIdentity = await this.getUserIdentity(listOptions);
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

  private extractProjectId(configuredUrl: string | null): string | null {
    if (!configuredUrl) return null;
    try {
      const parsed = new URL(configuredUrl);
      if (this.providerId === 'grok') {
        const match = parsed.pathname.match(/\/project\/([^/]+)/);
        return match?.[1] ?? null;
      }
      if (this.providerId === 'chatgpt') {
        const match = parsed.pathname.match(/\/g\/([^/]+)\/project/);
        return match?.[1] ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private extractConversationId(configuredUrl: string | null): string | null {
    if (!configuredUrl) return null;
    try {
      const parsed = new URL(configuredUrl);
      if (this.providerId === 'grok') {
        return parsed.searchParams.get('chat');
      }
      if (this.providerId === 'chatgpt') {
        const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
        return match?.[1] ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async resolveLatestConversation(
    offset: number,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions; noProject?: boolean },
  ): Promise<Conversation> {
    if (!this.provider.listConversations) {
      throw new Error(`${this.providerId} does not support conversation listing yet.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const items = await this.listConversations(options?.projectId, {
      ...listOptions,
      includeHistory: true,
      historyLimit: DEFAULT_HISTORY_LIMIT,
    });
    const filtered = filterConversationsForScope(items, {
      providerId: this.providerId,
      noProject: options?.noProject ?? false,
    });
    if (!filtered.length) {
      throw new Error(`No conversations available to resolve latest for ${this.providerId}.`);
    }
    const sorted = sortConversationsByRecency(filtered);
    const clamped = Math.max(0, Math.min(offset, sorted.length - 1));
    return sorted[clamped];
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    options: { action: string; retries?: number } = { action: 'operation' },
  ): Promise<T> {
    const retries = typeof options.retries === 'number' ? options.retries : 1;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= retries || !this.isRetryableError(error)) {
          throw error;
        }
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

function parseLatestSelector(value: string): number | null {
  const match = value.trim().match(/^latest(?:-(\d+))?$/i);
  if (!match) return null;
  const offset = match[1] ? Number.parseInt(match[1], 10) : 0;
  if (!Number.isFinite(offset) || offset < 0) return null;
  return offset;
}

function sortConversationsByRecency(items: Conversation[]): Conversation[] {
  return items
    .map((item, index) => {
      const timestamp = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
      return { item, index, timestamp };
    })
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestamp);
      const bValid = Number.isFinite(b.timestamp);
      if (aValid && bValid) return b.timestamp - a.timestamp;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function filterConversationsForScope(
  items: Conversation[],
  options: { providerId: ProviderId; noProject: boolean },
): Conversation[] {
  if (!options.noProject) return items;
  if (options.providerId === 'chatgpt') {
    return items.filter((item) => !item.projectId);
  }
  return items;
}
