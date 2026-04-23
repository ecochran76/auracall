import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { getPreferredRuntimeProfile, getPreferredRuntimeProfileName } from '../../config/model.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../providers/types.js';
import {
  appendChatgptMutationRecord,
  CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS,
  CHATGPT_MUTATION_MAX_WEIGHT,
  CHATGPT_MUTATION_WINDOW_MS,
  CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS,
  CHATGPT_POST_COMMIT_JITTER_MAX_MS,
  CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS,
  CHATGPT_RATE_LIMIT_COOLDOWN_MS,
  extractChatgptRateLimitSummary,
  getChatgptMutationBudgetWaitMs,
  getChatgptPostCommitQuietWaitMs,
  isChatgptRateLimitMessage,
  readChatgptRateLimitGuardState,
  type ChatgptRateLimitGuardState,
  writeChatgptRateLimitGuardState,
} from '../chatgptRateLimitGuard.js';
import {
  readSimpleProviderGuardState,
  type SimpleProviderGuardState,
  writeSimpleProviderGuardState,
} from '../simpleProviderGuard.js';
import type {
  ConversationArtifact,
  Conversation,
  ConversationContext,
  ConversationMessage,
  ConversationSource,
  FileRef,
  Project,
  ProjectMemoryMode,
  ProviderId,
} from '../providers/domain.js';
import {
  matchConversationByTitle,
  matchProjectByName,
  resolveProviderCacheKey,
  PROVIDER_CACHE_TTL_MS,
  resolveProviderCachePath,
} from '../providers/cache.js';
import type { BrowserService } from '../service/browserService.js';
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from '../constants.js';
import type {
  CacheContext,
  CacheIdentity,
  CacheSettings,
  ConversationListResult,
  IdentityPrompt,
  LlmCapabilities,
  LlmServiceAdapter,
  PromptInput,
  PromptPlan,
  PromptResult,
  ProjectListResult,
} from './types.js';
import type { CacheStore, CachedConversationContextEntry } from './cache/store.js';
import { createCacheStore, type CacheStoreKind } from './cache/store.js';

const DEFAULT_HISTORY_LIMIT = 2000;
const CHATGPT_RATE_LIMIT_RETRY_BASE_MS = 2_000;
const CHATGPT_RATE_LIMIT_RETRY_STEP_MS = 3_000;
const CHATGPT_RATE_LIMIT_RETRY_JITTER_MS = 1_500;
const CHATGPT_RATE_LIMIT_RETRY_MAX_MS = 15_000;
const CHATGPT_RETRY_BASE_MS = 500;
const CHATGPT_RETRY_STEP_MS = 500;
const CHATGPT_RETRY_MAX_MS = 2_500;
const CHATGPT_RETRY_JITTER_MS = 250;
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;
const GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS = 45_000;
const GEMINI_POST_COMMIT_QUIET_MS = 12_000;
const GEMINI_MUTATION_MIN_INTERVAL_MS = 25_000;
const GROK_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS = 30_000;
const GROK_POST_COMMIT_QUIET_MS = 8_000;
const GROK_MUTATION_MIN_INTERVAL_MS = 12_000;

type ProviderGuardSettings = {
  cooldownMs: number;
  autoWaitMaxMs: number;
  mutationWindowMs: number;
  mutationMaxWeight: number;
  mutationBudgetAutoWaitMaxMs: number;
  postCommitAutoWaitMaxMs: number;
  postCommitQuietScale: number;
  postCommitJitterMaxMs: number;
  simplePostCommitQuietMs?: number;
  simpleMutationMinIntervalMs?: number;
};

type ConversationArtifactFetchStatus = 'materialized' | 'skipped' | 'error';

type ConversationArtifactFetchManifestEntry = {
  artifactId: string;
  title: string;
  kind: ConversationArtifact['kind'];
  uri: string | null;
  status: ConversationArtifactFetchStatus;
  fileId?: string;
  fileName?: string;
  localPath?: string;
  remoteUrl?: string | null;
  mimeType?: string;
  size?: number;
  error?: string;
};

type ConversationArtifactFetchManifest = {
  provider: ProviderId;
  conversationId: string;
  projectId: string | null;
  generatedAt: string;
  artifactCount: number;
  materializedCount: number;
  entries: ConversationArtifactFetchManifestEntry[];
};

type ConversationFileFetchStatus = 'materialized' | 'error';

type ConversationFileFetchManifestEntry = {
  fileId: string;
  fileName: string;
  status: ConversationFileFetchStatus;
  localPath?: string;
  remoteUrl?: string | null;
  mimeType?: string;
  size?: number;
  error?: string;
};

type ConversationFileFetchManifest = {
  provider: ProviderId;
  conversationId: string;
  projectId: string | null;
  generatedAt: string;
  fileCount: number;
  materializedCount: number;
  entries: ConversationFileFetchManifestEntry[];
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeProjectInstructionsForPrefix(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function sanitizeArtifactPathSegment(value: string): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 120) : 'artifact';
}

function normalizeArtifactFetchError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? 'Unknown artifact materialization error');
}

function sanitizeConversationFileName(value: string, fallback: string = 'conversation-file'): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 180) : fallback;
}

export function stripProjectInstructionsPrefixFromConversationContext(
  context: ConversationContext,
  projectInstructions: string,
): ConversationContext {
  const normalizedInstructions = normalizeProjectInstructionsForPrefix(projectInstructions);
  if (!normalizedInstructions) {
    return context;
  }
  let stripped = false;
  const messages = context.messages.map((message) => {
    if (stripped || message.role !== 'assistant') {
      return message;
    }
    const normalizedText = message.text.replace(/\r\n/g, '\n');
    if (!normalizedText.startsWith(normalizedInstructions)) {
      return message;
    }
    const remainder = normalizedText.slice(normalizedInstructions.length).replace(/^\s+/, '');
    if (!remainder) {
      return message;
    }
    stripped = true;
    return {
      ...message,
      text: remainder,
    };
  });
  return stripped ? { ...context, messages } : context;
}

export abstract class LlmService {
  readonly provider: LlmServiceAdapter;
  readonly providerId: ProviderId;
  private readonly browserService: BrowserService;
  protected readonly cacheStore: CacheStore;
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
    const configuredStore = this.userConfig.browser?.cache?.store;
    this.cacheStore =
      options?.cacheStore ?? createCacheStore(resolveCacheStoreKind(configuredStore));
  }

  getCapabilities(): LlmCapabilities {
    return {
      projects: this.provider.capabilities?.projects ?? false,
      conversations: this.provider.capabilities?.conversations ?? false,
      rename: Boolean(this.provider.renameConversation),
      contexts: Boolean(this.provider.readConversationContext),
      files: Boolean(this.provider.listConversationFiles || this.provider.listProjectFiles || this.provider.listAccountFiles),
      models: true,
    };
  }

  getConfiguredUrl(): string | null {
    const browser = this.userConfig.browser;
    if (this.providerId === 'grok') {
      return browser?.grokUrl ?? browser?.url ?? null;
    }
    if (this.providerId === 'gemini') {
      return browser?.geminiUrl ?? browser?.url ?? null;
    }
    return browser?.chatgptUrl ?? browser?.url ?? null;
  }

  protected getDefaultLaunchUrl(): string {
    if (this.providerId === 'grok') {
      return GROK_URL;
    }
    if (this.providerId === 'gemini') {
      return GEMINI_URL;
    }
    return CHATGPT_URL;
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
    const launchUrl = configuredUrl ?? this.getDefaultLaunchUrl();
    const hasExplicitEndpoint = overrides.port !== undefined || overrides.host !== undefined;
    const target = overrides.tabTargetId || hasExplicitEndpoint
      ? null
      : await this.browserService.resolveServiceTarget({
          serviceId: this.providerId,
          configuredUrl,
          ensurePort: options.ensurePort,
        });
    const host = target?.host ?? overrides.host;
    const port = target?.port ?? overrides.port;
    return {
      ...overrides,
      port,
      host,
      configuredUrl,
      tabTargetId: overrides.tabTargetId ?? target?.tab?.targetId,
      tabUrl: overrides.tabUrl ?? target?.tab?.url ?? undefined,
      browserService: this.browserService,
    };
  }

  protected scopeConversationListOptions(
    listOptions: BrowserProviderListOptions,
    projectId?: string,
  ): BrowserProviderListOptions {
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    if (!normalizedProjectId) {
      if (!Object.hasOwn(listOptions, 'projectId')) return listOptions;
      const { projectId: _projectId, ...rest } = listOptions;
      return rest;
    }
    return {
      ...listOptions,
      projectId: normalizedProjectId,
    };
  }

  protected getResolvedUserConfig(): ResolvedUserConfig {
    return this.userConfig;
  }

  protected async overlayConversationListFromCache(
    items: Conversation[],
    listOptions: BrowserProviderListOptions,
    projectId?: string,
  ): Promise<Conversation[]> {
    if (projectId || items.length === 0) {
      return items;
    }
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeConversations(cacheContext, items);
    const cached = await this.cacheStore.readConversations(cacheContext);
    return cached.items;
  }

  private async resolveProjectCacheContext(
    listOptions: BrowserProviderListOptions,
  ): Promise<CacheContext> {
    const globalListOptions = Object.hasOwn(listOptions, 'projectId')
      ? { ...listOptions, projectId: undefined }
      : listOptions;
    return this.resolveCacheContext(globalListOptions);
  }

  private async upsertProjectCacheEntry(
    listOptions: BrowserProviderListOptions,
    project: Project,
  ): Promise<void> {
    const cacheContext = await this.resolveProjectCacheContext(listOptions);
    const cached = await this.cacheStore.readProjects(cacheContext);
    const merged = new Map(cached.items.map((entry) => [entry.id, entry] as const));
    const existing = merged.get(project.id);
    merged.set(project.id, {
      ...existing,
      ...project,
      name: project.name || existing?.name || project.id,
      provider: project.provider || existing?.provider || this.providerId,
      url: project.url ?? existing?.url,
      memoryMode: project.memoryMode ?? existing?.memoryMode,
    });
    await this.cacheStore.writeProjects(cacheContext, Array.from(merged.values()));
  }

  private async renameProjectCacheEntry(
    listOptions: BrowserProviderListOptions,
    projectId: string,
    newTitle: string,
  ): Promise<void> {
    const cacheContext = await this.resolveProjectCacheContext(listOptions);
    const cached = await this.cacheStore.readProjects(cacheContext);
    const items = cached.items.map((entry) =>
      entry.id === projectId
        ? {
            ...entry,
            name: newTitle,
          }
        : entry,
    );
    if (!items.some((entry) => entry.id === projectId)) {
      items.push({
        id: projectId,
        name: newTitle,
        provider: this.providerId,
        url: this.provider.resolveProjectUrl?.(projectId) ?? undefined,
      });
    }
    await this.cacheStore.writeProjects(cacheContext, items);
  }

  private async removeProjectCacheEntry(
    listOptions: BrowserProviderListOptions,
    projectId: string,
  ): Promise<void> {
    const cacheContext = await this.resolveProjectCacheContext(listOptions);
    const cached = await this.cacheStore.readProjects(cacheContext);
    await this.cacheStore.writeProjects(
      cacheContext,
      cached.items.filter((entry) => entry.id !== projectId),
    );
  }

  abstract listProjects(options?: BrowserProviderListOptions): Promise<ProjectListResult>;

  abstract listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<ConversationListResult>;

  abstract runPrompt(
    input: PromptInput,
    options?: BrowserProviderListOptions,
  ): Promise<PromptResult>;

  abstract renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void>;

  abstract deleteConversation(
    conversationId: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void>;

  abstract getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderUserIdentity | null>;

  async renameProject(
    projectId: string,
    newTitle: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.renameProject) {
      throw new Error(`Project rename is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.ensureValidProjectUrl(projectId, { listOptions });
    await this.withRetry(
      () => this.provider.renameProject?.(projectId, newTitle, listOptions) as Promise<void>,
      { action: 'renameProject' },
    );
    await this.renameProjectCacheEntry(listOptions, projectId, newTitle);
  }

  async cloneProject(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<Project | null> {
    if (!this.provider.cloneProject) {
      throw new Error(`Project clone is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.ensureValidProjectUrl(projectId, { listOptions });
    const created = await this.withRetry(
      () => this.provider.cloneProject?.(projectId, listOptions) as Promise<Project | null>,
      { action: 'cloneProject' },
    );
    if (created?.id) {
      await this.upsertProjectCacheEntry(listOptions, created);
    }
    return created ?? null;
  }

  async openProjectMenu(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.openProjectMenu) {
      throw new Error(`Project menu is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.openProjectMenu?.(projectId, listOptions) as Promise<void>,
      { action: 'openProjectMenu' },
    );
  }

  async selectRenameProjectItem(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.selectRenameProjectItem) {
      throw new Error(`Project rename menu item is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.selectRenameProjectItem?.(projectId, listOptions) as Promise<void>,
      { action: 'selectRenameProjectItem' },
    );
  }

  async selectCloneProjectItem(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.selectCloneProjectItem) {
      throw new Error(`Project clone menu item is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.selectCloneProjectItem?.(projectId, listOptions) as Promise<void>,
      { action: 'selectCloneProjectItem' },
    );
  }

  async selectRemoveProjectItem(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.selectRemoveProjectItem) {
      throw new Error(`Project remove menu item is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.ensureValidProjectUrl(projectId, { listOptions });
    await this.withRetry(
      () => this.provider.selectRemoveProjectItem?.(projectId, listOptions) as Promise<void>,
      { action: 'selectRemoveProjectItem' },
    );
  }

  async pushProjectRemoveConfirmation(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.pushProjectRemoveConfirmation) {
      throw new Error(`Project remove confirmation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.pushProjectRemoveConfirmation?.(projectId, listOptions) as Promise<void>,
      { action: 'pushProjectRemoveConfirmation' },
    );
    await this.removeProjectCacheEntry(listOptions, projectId);
  }

  async ensureValidProjectUrl(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.validateProjectUrl) return;
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.validateProjectUrl?.(projectId, listOptions) as Promise<void>,
      { action: 'validateProjectUrl' },
    );
  }

  async ensureValidConversationUrl(
    conversationId: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.validateConversationUrl) return;
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () =>
        this.provider.validateConversationUrl?.(
          conversationId,
          options?.projectId,
          listOptions,
        ) as Promise<void>,
      { action: 'validateConversationUrl' },
    );
  }

  async openCreateProjectModal(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.openCreateProjectModal) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.openCreateProjectModal?.(listOptions) as Promise<void>,
      { action: 'openCreateProjectModal' },
    );
  }

  async setCreateProjectFields(
    fields: { name?: string; instructions?: string; modelLabel?: string; memoryMode?: ProjectMemoryMode },
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.setCreateProjectFields) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.setCreateProjectFields?.(fields, listOptions) as Promise<void>,
      { action: 'setCreateProjectFields' },
    );
  }

  async clickCreateProjectNext(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickCreateProjectNext) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickCreateProjectNext?.(listOptions) as Promise<void>,
      { action: 'clickCreateProjectNext' },
    );
  }

  async clickCreateProjectAttach(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickCreateProjectAttach) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickCreateProjectAttach?.(listOptions) as Promise<void>,
      { action: 'clickCreateProjectAttach' },
    );
  }

  async clickCreateProjectUploadFile(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickCreateProjectUploadFile) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickCreateProjectUploadFile?.(listOptions) as Promise<void>,
      { action: 'clickCreateProjectUploadFile' },
    );
  }

  async uploadCreateProjectFiles(
    paths: string[],
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.uploadCreateProjectFiles) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.uploadCreateProjectFiles?.(paths, listOptions) as Promise<void>,
      { action: 'uploadCreateProjectFiles' },
    );
  }

  async uploadProjectFiles(
    projectId: string,
    paths: string[],
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.uploadProjectFiles) {
      throw new Error(`Project file upload is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.uploadProjectFiles?.(projectId, paths, listOptions) as Promise<void>,
      { action: 'uploadProjectFiles' },
    );
    await this.refreshProjectKnowledgeCache(projectId, listOptions);
  }

  async uploadAccountFiles(
    paths: string[],
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.uploadAccountFiles) {
      throw new Error(`Account file upload is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.uploadAccountFiles?.(paths, listOptions) as Promise<void>,
      { action: 'uploadAccountFiles' },
    );
    await this.refreshAccountFilesCache(listOptions);
  }

  async deleteProjectFile(
    projectId: string,
    fileName: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.deleteProjectFile) {
      throw new Error(`Project file deletion is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.deleteProjectFile?.(projectId, fileName, listOptions) as Promise<void>,
      { action: 'deleteProjectFile' },
    );
    await this.refreshProjectKnowledgeCache(projectId, listOptions);
  }

  async deleteAccountFile(
    fileId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.deleteAccountFile) {
      throw new Error(`Account file deletion is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.deleteAccountFile?.(fileId, listOptions) as Promise<void>,
      { action: 'deleteAccountFile' },
    );
    await this.refreshAccountFilesCache(listOptions);
  }

  async listProjectFiles(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef[]> {
    if (!this.provider.listProjectFiles) {
      throw new Error(`Project file listing is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    return this.refreshProjectKnowledgeCache(projectId, listOptions);
  }

  async listAccountFiles(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef[]> {
    if (!this.provider.listAccountFiles) {
      throw new Error(`Account file listing is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    return this.refreshAccountFilesCache(listOptions);
  }

  async listConversationFiles(
    conversationId: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef[]> {
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
    if (this.provider.listConversationFiles) {
      return this.refreshConversationFilesCache(conversationId, listOptions);
    }
    if (!this.provider.readConversationContext) {
      throw new Error(`Conversation file listing is not supported for ${this.providerId}.`);
    }
    const context = await this.getConversationContext(conversationId, {
      projectId: options?.projectId,
      listOptions,
    });
    const normalizedFiles = Array.isArray(context.files) ? context.files : [];
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeConversationFiles(cacheContext, conversationId, normalizedFiles);
    return normalizedFiles;
  }

  async materializeConversationArtifacts(
    conversationId: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions; refresh?: boolean },
  ): Promise<{ artifacts: ConversationArtifact[]; files: FileRef[]; manifestPath: string | null }> {
    if (!this.provider.materializeConversationArtifact) {
      throw new Error(`Conversation artifact fetch is not supported for ${this.providerId}.`);
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
    const context = await this.getConversationContext(conversationId, {
      projectId: options?.projectId,
      refresh: options?.refresh ?? true,
      listOptions,
    });
    const artifacts = Array.isArray(context.artifacts) ? context.artifacts : [];
    if (artifacts.length === 0) {
      return { artifacts: [], files: [], manifestPath: null };
    }
    const cacheContext = await this.resolveCacheContext(listOptions);
    const { cacheDir } = resolveProviderCachePath(
      cacheContext,
      `conversation-attachments/${conversationId}/manifest.json`,
    );
    const attachmentsDir = path.join(cacheDir, 'conversation-attachments', conversationId, 'files');
    const manifestPath = path.join(
      cacheDir,
      'conversation-attachments',
      conversationId,
      'artifact-fetch-manifest.json',
    );
    await fs.mkdir(attachmentsDir, { recursive: true });
    const existing = await this.cacheStore.readConversationAttachments(cacheContext, conversationId);
    const merged = new Map(existing.items.map((item) => [item.id, item]));
    const materialized: FileRef[] = [];
    const manifestEntries: ConversationArtifactFetchManifestEntry[] = [];
    for (const artifact of artifacts) {
      const artifactDir = path.join(
        attachmentsDir,
        sanitizeArtifactPathSegment(artifact.id || artifact.title || `artifact-${materialized.length + 1}`),
      );
      await fs.mkdir(artifactDir, { recursive: true });
      try {
        const file = await this.withRetry(
          () =>
            this.provider.materializeConversationArtifact?.(
              conversationId,
              artifact,
              artifactDir,
              options?.projectId,
              listOptions,
            ) as Promise<FileRef | null>,
          { action: 'materializeConversationArtifact' },
        );
        if (!file) {
          manifestEntries.push({
            artifactId: artifact.id,
            title: artifact.title,
            kind: artifact.kind,
            uri: artifact.uri ?? null,
            status: 'skipped',
          });
          continue;
        }
        materialized.push(file);
        merged.set(file.id, file);
        manifestEntries.push({
          artifactId: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          uri: artifact.uri ?? null,
          status: 'materialized',
          fileId: file.id,
          fileName: file.name,
          localPath: file.localPath,
          remoteUrl: file.remoteUrl ?? artifact.uri ?? null,
          mimeType: file.mimeType,
          size: file.size,
        });
      } catch (error) {
        manifestEntries.push({
          artifactId: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          uri: artifact.uri ?? null,
          status: 'error',
          error: normalizeArtifactFetchError(error),
        });
      }
    }
    if (materialized.length > 0) {
      await this.cacheStore.writeConversationAttachments(
        cacheContext,
        conversationId,
        Array.from(merged.values()),
      );
    }
    const manifest: ConversationArtifactFetchManifest = {
      provider: this.providerId,
      conversationId,
      projectId: options?.projectId ?? null,
      generatedAt: new Date().toISOString(),
      artifactCount: artifacts.length,
      materializedCount: materialized.length,
      entries: manifestEntries,
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { artifacts, files: materialized, manifestPath };
  }

  async materializeConversationArtifact(
    conversationId: string,
    artifact: ConversationArtifact,
    destDir: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef | null> {
    if (!this.provider.materializeConversationArtifact) {
      throw new Error(`Conversation artifact fetch is not supported for ${this.providerId}.`);
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
    return this.withRetry(
      () =>
        this.provider.materializeConversationArtifact?.(
          conversationId,
          artifact,
          destDir,
          options?.projectId,
          listOptions,
        ) as Promise<FileRef | null>,
      { action: 'materializeConversationArtifact' },
    );
  }

  async materializeConversationFiles(
    conversationId: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions; refresh?: boolean },
  ): Promise<{ conversationFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
    if (!this.provider.downloadConversationFile) {
      throw new Error(`Conversation file fetch is not supported for ${this.providerId}.`);
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
    const conversationFiles = await this.listConversationFiles(conversationId, {
      projectId: options?.projectId,
      listOptions,
    });
    if (conversationFiles.length === 0) {
      return { conversationFiles: [], files: [], manifestPath: null };
    }
    const cacheContext = await this.resolveCacheContext(listOptions);
    const { cacheDir } = resolveProviderCachePath(
      cacheContext,
      `conversation-attachments/${conversationId}/manifest.json`,
    );
    const attachmentsDir = path.join(cacheDir, 'conversation-attachments', conversationId, 'files');
    const manifestPath = path.join(
      cacheDir,
      'conversation-attachments',
      conversationId,
      'file-fetch-manifest.json',
    );
    await fs.mkdir(attachmentsDir, { recursive: true });
    const existing = await this.cacheStore.readConversationAttachments(cacheContext, conversationId);
    const merged = new Map(existing.items.map((item) => [item.id, item]));
    const materialized: FileRef[] = [];
    const manifestEntries: ConversationFileFetchManifestEntry[] = [];
    for (const file of conversationFiles) {
      const fileDir = path.join(
        attachmentsDir,
        sanitizeArtifactPathSegment(file.id || file.name || `file-${materialized.length + 1}`),
      );
      await fs.mkdir(fileDir, { recursive: true });
      const destPath = path.join(
        fileDir,
        sanitizeConversationFileName(file.name || file.id || `conversation-file-${materialized.length + 1}`),
      );
      try {
        await this.withRetry(
          () =>
            this.provider.downloadConversationFile?.(
              conversationId,
              file.id,
              destPath,
              listOptions,
            ) as Promise<void>,
          { action: 'downloadConversationFile' },
        );
        const stat = await fs.stat(destPath);
        const materializedFile: FileRef = {
          ...file,
          size: stat.size,
          localPath: destPath,
        };
        materialized.push(materializedFile);
        merged.set(materializedFile.id, materializedFile);
        manifestEntries.push({
          fileId: file.id,
          fileName: file.name,
          status: 'materialized',
          localPath: destPath,
          remoteUrl: file.remoteUrl ?? null,
          mimeType: materializedFile.mimeType,
          size: stat.size,
        });
      } catch (error) {
        manifestEntries.push({
          fileId: file.id,
          fileName: file.name,
          status: 'error',
          remoteUrl: file.remoteUrl ?? null,
          mimeType: file.mimeType,
          error: normalizeArtifactFetchError(error),
        });
      }
    }
    if (materialized.length > 0) {
      await this.cacheStore.writeConversationAttachments(
        cacheContext,
        conversationId,
        Array.from(merged.values()),
      );
    }
    const manifest: ConversationFileFetchManifest = {
      provider: this.providerId,
      conversationId,
      projectId: options?.projectId ?? null,
      generatedAt: new Date().toISOString(),
      fileCount: conversationFiles.length,
      materializedCount: materialized.length,
      entries: manifestEntries,
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { conversationFiles, files: materialized, manifestPath };
  }

  async clickCreateProjectConfirm(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickCreateProjectConfirm) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickCreateProjectConfirm?.(listOptions) as Promise<void>,
      { action: 'clickCreateProjectConfirm' },
    );
  }

  async createProject(
    input: {
      name: string;
      instructions?: string;
      modelLabel?: string;
      files?: string[];
      memoryMode?: ProjectMemoryMode;
    },
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<Project | null> {
    if (!this.provider.createProject) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    if (this.provider.listProjects) {
      const existing = await this.listProjects(listOptions);
      const matched = matchProjectByName(existing, input.name);
      if (matched.match) {
        throw new Error(
          `Project "${input.name}" already exists for ${this.providerId} (${matched.match.id}). ` +
          `Reuse that project instead of creating a duplicate.`,
        );
      }
      if (matched.candidates.length > 1) {
        const names = matched.candidates.map((item) => item.name || item.id).join(', ');
        throw new Error(`Project name "${input.name}" is ambiguous. Matches: ${names}`);
      }
    }
    const created = await this.withRetry(
      () => this.provider.createProject?.(input, listOptions) as Promise<Project | null>,
      { action: 'createProject' },
    );
    if (created?.id) {
      await this.upsertProjectCacheEntry(listOptions, created);
    }
    if (created?.id && typeof input.instructions === 'string' && input.instructions.trim().length > 0) {
      const cacheContext = await this.resolveCacheContext(listOptions);
      await this.cacheStore.writeProjectInstructions(cacheContext, created.id, input.instructions);
    }
    if (created?.id && Array.isArray(input.files) && input.files.length > 0 && this.provider.listProjectFiles) {
      await this.refreshProjectKnowledgeCache(created.id, listOptions);
    }
    return created ?? null;
  }

  async runPlannedPrompt(input: PromptInput): Promise<PromptResult> {
    if (!this.provider.runPrompt) {
      throw new Error(`Prompt execution is not supported for ${this.providerId}.`);
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(input.listOptions, { ensurePort: true }),
      input.projectId ?? undefined,
    );
    const plan = await this.planPrompt({
      configuredUrl: input.configuredUrl,
      projectId: input.projectId,
      projectName: input.projectName,
      conversationId: input.conversationId,
      conversationName: input.conversationName,
      noProject: input.noProject,
      allowAutoRefresh: input.allowAutoRefresh,
      forceProjectRefresh: input.forceProjectRefresh,
      forceConversationRefresh: input.forceConversationRefresh,
      listOptions,
    });
    return this.withRetry(
      () =>
        this.provider.runPrompt?.(
          {
            prompt: input.prompt,
            capabilityId: input.capabilityId,
            completionMode: input.completionMode,
            targetUrl: plan.targetUrl,
            projectId: plan.projectId,
            conversationId: plan.conversationId,
            timeoutMs: input.timeoutMs,
          },
          this.scopeConversationListOptions(listOptions, plan.projectId ?? undefined),
        ) as Promise<PromptResult>,
      { action: 'runPrompt' },
    );
  }

  async toggleProjectSidebar(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.toggleProjectSidebar) {
      throw new Error(`Project sidebar toggle is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.toggleProjectSidebar?.(listOptions) as Promise<void>,
      { action: 'toggleProjectSidebar' },
    );
  }

  async toggleMainSidebar(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.toggleMainSidebar) {
      throw new Error(`Main sidebar toggle is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.toggleMainSidebar?.(listOptions) as Promise<void>,
      { action: 'toggleMainSidebar' },
    );
  }

  async clickHistoryItem(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickHistoryItem) {
      throw new Error(`History item is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickHistoryItem?.(listOptions) as Promise<void>,
      { action: 'clickHistoryItem' },
    );
  }

  async clickHistorySeeAll(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickHistorySeeAll) {
      throw new Error(`History see-all is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickHistorySeeAll?.(listOptions) as Promise<void>,
      { action: 'clickHistorySeeAll' },
    );
  }

  async clickChatArea(
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<void> {
    if (!this.provider.clickChatArea) {
      throw new Error(`Chat area click is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () => this.provider.clickChatArea?.(listOptions) as Promise<void>,
      { action: 'clickChatArea' },
    );
  }

  async updateProjectInstructions(
    projectId: string,
    instructions: string,
    options?: { listOptions?: BrowserProviderListOptions; modelLabel?: string },
  ): Promise<void> {
    if (!this.provider.updateProjectInstructions) {
      throw new Error(`Project instructions update is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    await this.withRetry(
      () =>
        this.provider.updateProjectInstructions?.(
          projectId,
          instructions,
          listOptions,
          options?.modelLabel,
        ) as Promise<void>,
      { action: 'updateProjectInstructions' },
    );
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeProjectInstructions(cacheContext, projectId, instructions);
  }

  async getProjectInstructions(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<{ text: string; model?: string | null }> {
    if (!this.provider.getProjectInstructions) {
      throw new Error(`Project instructions read is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const result = await this.withRetry(
      () =>
        this.provider.getProjectInstructions?.(projectId, listOptions) as Promise<{
          text: string;
          model?: string | null;
        }>,
      { action: 'getProjectInstructions' },
    );
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeProjectInstructions(cacheContext, projectId, result.text);
    return result;
  }

  async getConversationContext(
    conversationId: string,
    options?: {
      projectId?: string;
      refresh?: boolean;
      cacheOnly?: boolean;
      listOptions?: BrowserProviderListOptions;
    },
  ): Promise<ConversationContext> {
    if (!this.provider.readConversationContext) {
      throw new Error(`Conversation context retrieval is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, {
      ensurePort: options?.cacheOnly ? false : true,
    });
    const cacheContext = await this.resolveCacheContext(listOptions);
    const refresh = options?.refresh !== false;
    if (!refresh) {
      const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
      if (cached.items.messages.length > 0) {
        return cached.items;
      }
      if (options?.cacheOnly) {
        throw new Error(
          `No cached conversation context for "${conversationId}". Run without --cache-only to fetch live context.`,
        );
      }
    }
    try {
      const context = await this.withRetry(
        () =>
          this.provider.readConversationContext?.(
            conversationId,
            options?.projectId,
            listOptions,
          ) as Promise<unknown>,
        { action: 'readConversationContext' },
      );
      let normalized = this.normalizeConversationContext(context, conversationId);
      if (typeof options?.projectId === 'string' && options.projectId.trim().length > 0) {
        const cachedInstructions = await this.cacheStore.readProjectInstructions(cacheContext, options.projectId.trim());
        const projectInstructions = cachedInstructions.items.content?.trim();
        if (projectInstructions) {
          normalized = stripProjectInstructionsPrefixFromConversationContext(normalized, projectInstructions);
        }
      }
      await this.cacheStore.writeConversationContext(cacheContext, conversationId, normalized);
      return normalized;
    } catch (error) {
      const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
      if (cached.items.messages.length > 0) {
        return cached.items;
      }
      throw error;
    }
  }

  async listCachedConversationContexts(options?: {
    listOptions?: BrowserProviderListOptions;
    cacheResolve?: { prompt?: boolean; detect?: boolean };
  }): Promise<CachedConversationContextEntry[]> {
    const listOptions = options?.listOptions ?? await this.buildListOptions(undefined, { ensurePort: false });
    const cacheContext = await this.resolveCacheContext(listOptions, options?.cacheResolve);
    return this.cacheStore.listConversationContexts(cacheContext);
  }

  async getCachedConversationContext(
    selector: string,
    options?: {
      listOptions?: BrowserProviderListOptions;
      cacheResolve?: { prompt?: boolean; detect?: boolean };
    },
  ): Promise<{
    conversationId: string;
    fetchedAt: string | null;
    stale: boolean;
    context: ConversationContext;
  }> {
    const listOptions = options?.listOptions ?? await this.buildListOptions(undefined, { ensurePort: false });
    const cacheContext = await this.resolveCacheContext(listOptions, options?.cacheResolve);
    const raw = selector.trim();
    if (!raw) {
      throw new Error('Conversation selector is required.');
    }
    const normalizedDirectId = this.provider.normalizeConversationId?.(raw) ?? null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
    let conversationId = normalizedDirectId ?? raw;
    const cachedConversations = await this.cacheStore.readConversations(cacheContext);
    const directMatch = cachedConversations.items.find((entry) => entry.id === conversationId) ?? null;
    if (!isUuid && !directMatch) {
      const match = matchConversationByTitle(cachedConversations.items ?? [], raw);
      if (!match.match) {
        throw new Error(
          `No cached conversation matched "${raw}". Run "oracle conversations --refresh" first.`,
        );
      }
      conversationId = match.match.id;
    }
    const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
    if (!cached.items.messages.length) {
      throw new Error(
        `No cached context found for "${conversationId}". Run "oracle conversations context get ${conversationId} --target ${this.providerId}" first.`,
      );
    }
    return {
      conversationId,
      fetchedAt: cached.fetchedAt ? new Date(cached.fetchedAt).toISOString() : null,
      stale: cached.stale,
      context: cached.items,
    };
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
    const directId = this.provider.normalizeProjectId?.(projectName);
    if (directId) {
      return directId;
    }
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
    throw new Error(`No cached project named "${projectName}". Run "auracall projects" to refresh.`);
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
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
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
    throw new Error(`No cached conversation named "${conversationName}". Run "auracall conversations" to refresh.`);
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
    const directId = this.provider.normalizeConversationId?.(normalized);
    if (directId) {
      return {
        id: directId,
        title: directId,
        provider: this.providerId,
        projectId: options?.projectId,
        url: this.provider.resolveConversationUrl?.(directId, options?.projectId),
      };
    }
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
    options: { prompt?: boolean; detect?: boolean } = {},
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
    options: { prompt?: boolean; detect?: boolean } = {},
  ): Promise<CacheIdentity> {
    const normalizeIdentityKey = (value: string | null | undefined): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed.toLowerCase() : null;
    };
    const deriveIdentityKey = (identity: ProviderUserIdentity | null | undefined): string | null => {
      if (!identity) return null;
      return (
        normalizeIdentityKey(identity.email) ||
        normalizeIdentityKey(identity.handle) ||
        normalizeIdentityKey(identity.name) ||
        null
      );
    };
    const profileIdentity = this.resolveProfileServiceIdentity(this.providerId);
    let userIdentity: ProviderUserIdentity | null = profileIdentity;
    const cacheConfig = this.userConfig.browser?.cache;

    const identityKeyHint =
      typeof cacheConfig?.identityKey === 'string' && cacheConfig.identityKey.trim().length > 0
        ? normalizeIdentityKey(cacheConfig.identityKey)
        : null;
    const identityHint = cacheConfig?.identity ?? null;

    const useDetectedIdentity = options.detect !== false && cacheConfig?.useDetectedIdentity !== false;
    let detectedIdentity: ProviderUserIdentity | null = null;
    if (useDetectedIdentity) {
      try {
        detectedIdentity = await this.getUserIdentity(listOptions);
      } catch {
        detectedIdentity = null;
      }
    }
    const detectedIdentityKey = deriveIdentityKey(detectedIdentity);

    let identityKey: string | null = detectedIdentityKey ?? identityKeyHint;
    if (detectedIdentity) {
      userIdentity = detectedIdentity;
    }
    if (!identityKey && profileIdentity) {
      identityKey = deriveIdentityKey(profileIdentity);
      userIdentity = userIdentity ?? profileIdentity;
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
        identityKey = deriveIdentityKey(prompted);
      }
    }

    if (!identityKey && userIdentity) {
      identityKey = deriveIdentityKey(userIdentity);
    }

    const configuredFeatures = this.resolveConfiguredServiceFeatures();
    let detectedFeatureSignature: string | null = null;
    if (this.provider.getFeatureSignature) {
      try {
        detectedFeatureSignature = await this.provider.getFeatureSignature(listOptions);
      } catch {
        detectedFeatureSignature = null;
      }
    }
    const configuredFeatureSignature =
      configuredFeatures && Object.keys(configuredFeatures).length > 0
        ? stableStringify(configuredFeatures)
        : null;
    const featureSignature =
      configuredFeatureSignature && detectedFeatureSignature
        ? stableStringify({
            configured: JSON.parse(configuredFeatureSignature),
            detected: JSON.parse(detectedFeatureSignature),
          })
        : detectedFeatureSignature ?? configuredFeatureSignature;

    return { userIdentity, identityKey, featureSignature };
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
    const profile = getPreferredRuntimeProfile(this.userConfig, { explicitProfileName: profileName });
    const profileServices =
      profile?.services && typeof profile.services === 'object'
        ? (profile.services as Record<string, unknown>)
        : null;
    const profileService =
      profileServices && provider in profileServices
        ? (profileServices[provider] as Record<string, unknown> | undefined)
        : undefined;
    const profileIdentity =
      profileService && 'identity' in profileService
        ? (profileService.identity as typeof globalIdentity | undefined)
        : undefined;
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
    return getPreferredRuntimeProfileName(this.userConfig);
  }

  private resolveConfiguredServiceFeatures(): Record<string, unknown> | null {
    const profileName = this.resolveActiveProfileName();
    const globalFeatures = this.userConfig.services?.[this.providerId]?.features;
    if (!profileName) {
      return isRecord(globalFeatures) ? globalFeatures : null;
    }
    const profile = getPreferredRuntimeProfile(this.userConfig, { explicitProfileName: profileName });
    const profileServices =
      profile?.services && typeof profile.services === 'object'
        ? (profile.services as Record<string, unknown>)
        : null;
    const profileService =
      profileServices && this.providerId in profileServices
        ? (profileServices[this.providerId] as Record<string, unknown> | undefined)
        : undefined;
    const profileFeatures =
      profileService && 'features' in profileService ? profileService.features : undefined;
    const merged: Record<string, unknown> = {};
    if (isRecord(globalFeatures)) {
      Object.assign(merged, globalFeatures);
    }
    if (isRecord(profileFeatures)) {
      Object.assign(merged, profileFeatures);
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }

  private async refreshProjectKnowledgeCache(
    projectId: string,
    listOptions: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    if (!this.provider.listProjectFiles) {
      return [];
    }
    const files = await this.withRetry(
      () => this.provider.listProjectFiles?.(projectId, listOptions) as Promise<FileRef[]>,
      { action: 'listProjectFiles' },
    );
    const normalizedFiles = Array.isArray(files) ? files : [];
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeProjectKnowledge(cacheContext, projectId, normalizedFiles);
    return normalizedFiles;
  }

  private async refreshAccountFilesCache(
    listOptions: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    if (!this.provider.listAccountFiles) {
      return [];
    }
    const files = await this.withRetry(
      () => this.provider.listAccountFiles?.(listOptions) as Promise<FileRef[]>,
      { action: 'listAccountFiles' },
    );
    const normalizedFiles = Array.isArray(files) ? files : [];
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeAccountFiles(cacheContext, normalizedFiles);
    return normalizedFiles;
  }

  private async refreshConversationFilesCache(
    conversationId: string,
    listOptions: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    if (!this.provider.listConversationFiles) {
      return [];
    }
    const files = await this.withRetry(
      () => this.provider.listConversationFiles?.(conversationId, listOptions) as Promise<FileRef[]>,
      { action: 'listConversationFiles' },
    );
    const normalizedFiles = Array.isArray(files) ? files : [];
    const cacheContext = await this.resolveCacheContext(listOptions);
    await this.cacheStore.writeConversationFiles(cacheContext, conversationId, normalizedFiles);
    return normalizedFiles;
  }

  resolveProviderCacheKey(cacheContext: CacheContext): string {
    return resolveProviderCacheKey(cacheContext);
  }

  private extractProjectId(configuredUrl: string | null): string | null {
    if (!configuredUrl) return null;
    const providerExtracted = this.provider.extractProjectIdFromUrl?.(configuredUrl);
    if (providerExtracted) {
      return this.provider.normalizeProjectId?.(providerExtracted) ?? providerExtracted;
    }
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

  private normalizeConversationContext(payload: unknown, conversationId: string): ConversationContext {
    const fallback: ConversationContext = {
      provider: this.providerId,
      conversationId,
      messages: [],
    };
    if (!payload || typeof payload !== 'object') {
      return fallback;
    }
    const raw = payload as Partial<ConversationContext> & { messages?: unknown[] };
    const normalizedMessages: ConversationMessage[] = [];
    if (Array.isArray(raw.messages)) {
      for (const entry of raw.messages) {
        if (!entry || typeof entry !== 'object') continue;
        const candidate = entry as Partial<ConversationMessage>;
        const role =
          candidate.role === 'assistant' || candidate.role === 'system' || candidate.role === 'user'
            ? candidate.role
            : null;
        const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
        if (!role || !text) continue;
        normalizedMessages.push({
          role,
          text,
          time: typeof candidate.time === 'string' ? candidate.time : undefined,
        });
      }
    }
    const normalizedSources: ConversationSource[] = [];
    const seenSources = new Set<string>();
    const rawSourcesCandidate = (raw as { sources?: unknown[] }).sources;
    const rawSources = Array.isArray(rawSourcesCandidate) ? rawSourcesCandidate : [];
    for (const entry of rawSources) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<ConversationSource>;
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
      const messageIndex =
        typeof candidate.messageIndex === 'number' && Number.isFinite(candidate.messageIndex)
          ? candidate.messageIndex
          : undefined;
      const sourceKey = `${messageIndex ?? 'n/a'}::${url}`;
      if (!url || seenSources.has(sourceKey)) continue;
      seenSources.add(sourceKey);
      normalizedSources.push({
        url,
        title: typeof candidate.title === 'string' ? candidate.title.trim() : undefined,
        domain: typeof candidate.domain === 'string' ? candidate.domain.trim() : undefined,
        messageIndex,
        sourceGroup:
          typeof candidate.sourceGroup === 'string' ? candidate.sourceGroup.trim() : undefined,
      });
    }

    const normalizedArtifacts: ConversationArtifact[] = [];
    const seenArtifacts = new Set<string>();
    const rawArtifactsCandidate = (raw as { artifacts?: unknown[] }).artifacts;
    const rawArtifacts = Array.isArray(rawArtifactsCandidate) ? rawArtifactsCandidate : [];
    for (const entry of rawArtifacts) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<ConversationArtifact>;
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
      const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
      if (!id || !title || seenArtifacts.has(id)) continue;
      seenArtifacts.add(id);
      normalizedArtifacts.push({
        id,
        title,
        kind:
          candidate.kind === 'document' ||
          candidate.kind === 'download' ||
          candidate.kind === 'canvas' ||
          candidate.kind === 'generated' ||
          candidate.kind === 'image' ||
          candidate.kind === 'spreadsheet'
            ? candidate.kind
            : undefined,
        uri: typeof candidate.uri === 'string' ? candidate.uri.trim() : undefined,
        messageIndex:
          typeof candidate.messageIndex === 'number' && Number.isFinite(candidate.messageIndex)
            ? candidate.messageIndex
            : undefined,
        messageId: typeof candidate.messageId === 'string' ? candidate.messageId.trim() : undefined,
        metadata:
          candidate.metadata && typeof candidate.metadata === 'object'
            ? (candidate.metadata as Record<string, unknown>)
            : undefined,
      });
    }

    return {
      provider: this.providerId,
      conversationId:
        typeof raw.conversationId === 'string' && raw.conversationId.trim().length > 0
          ? raw.conversationId.trim()
          : conversationId,
      messages: normalizedMessages,
      files: Array.isArray(raw.files) ? raw.files : undefined,
      sources: normalizedSources.length > 0 ? normalizedSources : undefined,
      artifacts: normalizedArtifacts.length > 0 ? normalizedArtifacts : undefined,
    };
  }

  private async resolveLatestConversation(
    offset: number,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions; noProject?: boolean },
  ): Promise<Conversation> {
    if (!this.provider.listConversations) {
      throw new Error(`${this.providerId} does not support conversation listing yet.`);
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options?.listOptions, { ensurePort: true }),
      options?.projectId,
    );
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
    await this.enforceProviderGuard(options.action);
    const retries = typeof options.retries === 'number' ? options.retries : 1;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await fn();
        await this.noteProviderGuardSuccess(options.action);
        return result;
      } catch (error) {
        const nextError = await this.handleProviderGuardFailure(options.action, error);
        if (attempt >= retries || !this.isRetryableError(nextError)) {
          throw nextError;
        }
        const delayMs = this.getRetryDelayMs(attempt, nextError);
        await this.delay(delayMs);
      }
    }
  }

  protected getProviderGuardSettings(): ProviderGuardSettings | null {
    if (this.providerId === 'chatgpt') {
      return {
        cooldownMs: CHATGPT_RATE_LIMIT_COOLDOWN_MS,
        autoWaitMaxMs: CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS,
        mutationWindowMs: CHATGPT_MUTATION_WINDOW_MS,
        mutationMaxWeight: CHATGPT_MUTATION_MAX_WEIGHT,
        mutationBudgetAutoWaitMaxMs: CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS,
        postCommitAutoWaitMaxMs: CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS,
        postCommitQuietScale: 1,
        postCommitJitterMaxMs: CHATGPT_POST_COMMIT_JITTER_MAX_MS,
      };
    }
    if (this.providerId === 'gemini') {
      return {
        cooldownMs: GEMINI_RATE_LIMIT_COOLDOWN_MS,
        autoWaitMaxMs: GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS,
        mutationWindowMs: 0,
        mutationMaxWeight: 0,
        mutationBudgetAutoWaitMaxMs: 0,
        postCommitAutoWaitMaxMs: GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS,
        postCommitQuietScale: 0,
        postCommitJitterMaxMs: 0,
        simplePostCommitQuietMs: GEMINI_POST_COMMIT_QUIET_MS,
        simpleMutationMinIntervalMs: GEMINI_MUTATION_MIN_INTERVAL_MS,
      };
    }
    if (this.providerId === 'grok') {
      return {
        cooldownMs: GROK_RATE_LIMIT_COOLDOWN_MS,
        autoWaitMaxMs: GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS,
        mutationWindowMs: 0,
        mutationMaxWeight: 0,
        mutationBudgetAutoWaitMaxMs: 0,
        postCommitAutoWaitMaxMs: GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS,
        postCommitQuietScale: 0,
        postCommitJitterMaxMs: 0,
        simplePostCommitQuietMs: GROK_POST_COMMIT_QUIET_MS,
        simpleMutationMinIntervalMs: GROK_MUTATION_MIN_INTERVAL_MS,
      };
    }
    return null;
  }

  private async enforceProviderGuard(action: string): Promise<void> {
    const settings = this.getProviderGuardSettings();
    if (!settings) {
      return;
    }
    if (this.providerId === 'gemini' || this.providerId === 'grok') {
      const state = await this.readProviderGuardState();
      if (!state) {
        return;
      }
      const now = Date.now();
      const cooldownUntil = typeof state.cooldownUntil === 'number' ? state.cooldownUntil : null;
      if (cooldownUntil && cooldownUntil > now) {
        const remainingMs = cooldownUntil - now;
        if (remainingMs <= settings.autoWaitMaxMs) {
          await this.delay(remainingMs);
        } else {
          const summary = state.cooldownReason ? ` ${state.cooldownReason}` : '';
          throw new Error(
            `${this.providerId === 'gemini' ? 'Gemini anti-bot' : 'Grok rate limit'} cooldown active until ${new Date(cooldownUntil).toISOString()} (${Math.ceil(
              remainingMs / 1000,
            )}s remaining).${summary}`.trim(),
          );
        }
      }
      const lastMutationAt = typeof state.lastMutationAt === 'number' ? state.lastMutationAt : null;
      if (!lastMutationAt) {
        return;
      }
      const quietMs = this.isMutatingProviderAction(action)
        ? settings.simpleMutationMinIntervalMs ?? 0
        : settings.simplePostCommitQuietMs ?? 0;
      if (quietMs <= 0) {
        return;
      }
      const remainingMs = lastMutationAt + quietMs - now;
      if (remainingMs <= 0) {
        return;
      }
      const label = this.isMutatingProviderAction(action)
        ? this.providerId === 'gemini'
          ? 'Gemini write spacing'
          : 'Grok write spacing'
        : this.providerId === 'gemini'
          ? 'Gemini post-write quiet period'
          : 'Grok post-write quiet period';
      const autoWaitMaxMs = this.isMutatingProviderAction(action)
        ? Math.max(settings.autoWaitMaxMs, settings.postCommitAutoWaitMaxMs)
        : settings.postCommitAutoWaitMaxMs;
      if (remainingMs <= autoWaitMaxMs) {
        await this.delay(remainingMs);
        return;
      }
      throw new Error(
        `${label} active until ${new Date(now + remainingMs).toISOString()} (${Math.ceil(
          remainingMs / 1000,
        )}s remaining).`,
      );
    }
    const state = await this.readProviderGuardState();
    if (!state) {
      return;
    }
    const chatgptState = state as ChatgptRateLimitGuardState;
    const now = Date.now();
    const cooldownUntil = typeof chatgptState.cooldownUntil === 'number' ? chatgptState.cooldownUntil : null;
    if (cooldownUntil && cooldownUntil > now) {
      const remainingMs = cooldownUntil - now;
      if (remainingMs <= settings.autoWaitMaxMs) {
        await this.delay(remainingMs);
      } else {
        const summary = chatgptState.cooldownReason ? ` ${chatgptState.cooldownReason}` : '';
        throw new Error(
          `ChatGPT rate limit cooldown active until ${new Date(cooldownUntil).toISOString()} (${Math.ceil(
            remainingMs / 1000,
          )}s remaining).${summary}`.trim(),
        );
      }
    }
    const postCommitWaitMs = getChatgptPostCommitQuietWaitMs(chatgptState, now, {
      windowMs: settings.mutationWindowMs,
      quietScale: settings.postCommitQuietScale,
      jitterMaxMs: settings.postCommitJitterMaxMs,
    });
    if (postCommitWaitMs > 0) {
      if (postCommitWaitMs <= settings.postCommitAutoWaitMaxMs) {
        await this.delay(postCommitWaitMs);
      } else {
        throw new Error(
          `ChatGPT post-write quiet period active until ${new Date(now + postCommitWaitMs).toISOString()} (${Math.ceil(
            postCommitWaitMs / 1000,
          )}s remaining).`,
        );
      }
    }
    if (!this.isMutatingProviderAction(action)) {
      return;
    }
    const budgetWaitMs = getChatgptMutationBudgetWaitMs(chatgptState, Date.now(), {
      windowMs: settings.mutationWindowMs,
      maxWeight: settings.mutationMaxWeight,
    });
    if (budgetWaitMs <= 0) {
      return;
    }
    if (budgetWaitMs <= settings.mutationBudgetAutoWaitMaxMs) {
      await this.delay(budgetWaitMs);
      return;
    }
    throw new Error(
      `ChatGPT write budget active until ${new Date(Date.now() + budgetWaitMs).toISOString()} (${Math.ceil(
        budgetWaitMs / 1000,
      )}s remaining).`,
    );
  }

  private async noteProviderGuardSuccess(action: string): Promise<void> {
    const settings = this.getProviderGuardSettings();
    if (!settings) {
      return;
    }
    const now = Date.now();
    const current = await this.readProviderGuardState();
    if (this.providerId === 'gemini' || this.providerId === 'grok') {
      const next: SimpleProviderGuardState = {
        provider: this.providerId,
        profile: this.resolveActiveProfileName() ?? 'default',
        updatedAt: now,
        lastMutationAt: this.isMutatingProviderAction(action)
          ? now
          : (current as SimpleProviderGuardState | null | undefined)?.lastMutationAt,
      };
      const cooldownUntil = (current as SimpleProviderGuardState | null | undefined)?.cooldownUntil;
      if (typeof cooldownUntil === 'number' && cooldownUntil > now) {
        next.cooldownUntil = cooldownUntil;
        next.cooldownDetectedAt = (current as SimpleProviderGuardState | null | undefined)?.cooldownDetectedAt;
        next.cooldownReason = (current as SimpleProviderGuardState | null | undefined)?.cooldownReason;
        next.cooldownAction = (current as SimpleProviderGuardState | null | undefined)?.cooldownAction;
      }
      await this.writeProviderGuardState(next);
      return;
    }
    const currentChatgpt = current as ChatgptRateLimitGuardState | null;
    const next: ChatgptRateLimitGuardState = {
      provider: 'chatgpt',
      profile: this.resolveActiveProfileName() ?? 'default',
      updatedAt: now,
      lastMutationAt: this.isMutatingProviderAction(action) ? now : currentChatgpt?.lastMutationAt,
      recentMutations: this.isMutatingProviderAction(action)
        ? appendChatgptMutationRecord(
            currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
            action,
            now,
            settings.mutationWindowMs,
          )
        : currentChatgpt?.recentMutations,
      recentMutationAts: this.isMutatingProviderAction(action)
        ? appendChatgptMutationRecord(
            currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
            action,
            now,
            settings.mutationWindowMs,
          ).map((entry) => entry.at)
        : currentChatgpt?.recentMutationAts,
    };
    const cooldownUntil = currentChatgpt?.cooldownUntil;
    if (typeof cooldownUntil === 'number' && cooldownUntil > now) {
      next.cooldownUntil = cooldownUntil;
      next.cooldownDetectedAt = currentChatgpt?.cooldownDetectedAt;
      next.cooldownReason = currentChatgpt?.cooldownReason;
      next.cooldownAction = currentChatgpt?.cooldownAction;
    }
    await this.writeProviderGuardState(next);
  }

  private async handleProviderGuardFailure(action: string, error: unknown): Promise<unknown> {
    const settings = this.getProviderGuardSettings();
    if (!settings || !this.isProviderRateLimitedError(error)) {
      return error;
    }
    const now = Date.now();
    const current = await this.readProviderGuardState();
    const cooldownUntil = now + (this.extractProviderRetryAfterMs(error) ?? settings.cooldownMs);
    const reason = this.extractProviderRateLimitSummary(error);
    if (this.providerId === 'gemini' || this.providerId === 'grok') {
      await this.writeProviderGuardState({
        provider: this.providerId,
        profile: this.resolveActiveProfileName() ?? 'default',
        updatedAt: now,
        cooldownDetectedAt: now,
        cooldownUntil,
        cooldownReason: reason ?? undefined,
        cooldownAction: action,
        lastMutationAt: this.isMutatingProviderAction(action) ? now : undefined,
      } satisfies SimpleProviderGuardState);
      const detail = reason ? ` ${reason}` : '';
      const message = `${
        this.providerId === 'gemini' ? 'Gemini anti-bot block' : 'Grok rate limit'
      } detected while ${action}; cooling down until ${new Date(cooldownUntil).toISOString()}.${detail}`.trim();
      if (error instanceof Error) {
        const wrapped = new Error(message, { cause: error }) as Error & {
          uiDiagnostics?: unknown;
          originalError?: unknown;
        };
        if ('uiDiagnostics' in error) {
          wrapped.uiDiagnostics = (error as Error & { uiDiagnostics?: unknown }).uiDiagnostics;
        }
        wrapped.originalError = error;
        return wrapped;
      }
      return new Error(message, { cause: error as never });
    }
    const currentChatgpt = current as ChatgptRateLimitGuardState | null;
    await this.writeProviderGuardState({
      provider: 'chatgpt',
      profile: this.resolveActiveProfileName() ?? 'default',
      updatedAt: now,
      cooldownDetectedAt: now,
      cooldownUntil,
      cooldownReason: reason ?? undefined,
      cooldownAction: action,
      lastMutationAt: this.isMutatingProviderAction(action) ? now : undefined,
      recentMutations: this.isMutatingProviderAction(action)
        ? appendChatgptMutationRecord(
            currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
            action,
            now,
            settings.mutationWindowMs,
          )
        : currentChatgpt?.recentMutations,
      recentMutationAts: this.isMutatingProviderAction(action)
        ? appendChatgptMutationRecord(
            currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
            action,
            now,
            settings.mutationWindowMs,
          ).map((entry) => entry.at)
        : currentChatgpt?.recentMutationAts,
    });
    const detail = reason ? ` ${reason}` : '';
    const message = `ChatGPT rate limit detected while ${action}; cooling down until ${new Date(
      cooldownUntil,
    ).toISOString()}.${detail}`.trim();
    if (error instanceof Error) {
      const wrapped = new Error(message, { cause: error }) as Error & {
        uiDiagnostics?: unknown;
        originalError?: unknown;
      };
      if ('uiDiagnostics' in error) {
        wrapped.uiDiagnostics = (error as Error & { uiDiagnostics?: unknown }).uiDiagnostics;
      }
      wrapped.originalError = error;
      return wrapped;
    }
    return new Error(message, { cause: error as never });
  }

  private isMutatingProviderAction(action: string): boolean {
    if (this.providerId !== 'chatgpt' && this.providerId !== 'gemini' && this.providerId !== 'grok') {
      return false;
    }
    switch (action) {
      case 'renameProject':
      case 'cloneProject':
      case 'pushProjectRemoveConfirmation':
      case 'clickCreateProjectConfirm':
      case 'uploadProjectFiles':
      case 'uploadAccountFiles':
      case 'deleteProjectFile':
      case 'deleteAccountFile':
      case 'createProject':
      case 'updateProjectInstructions':
      case 'renameConversation':
      case 'deleteConversation':
      case 'runPrompt':
        return true;
      default:
        return false;
    }
  }

  private isProviderRateLimitedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    if (this.providerId === 'chatgpt') {
      return isChatgptRateLimitMessage(message);
    }
    if (this.providerId === 'gemini') {
      return /google\.com\/sorry|unusual traffic|captcha|recaptcha|human verification|anti-bot/i.test(message);
    }
    if (this.providerId === 'grok') {
      return /too many requests|query limit|rate limit|try again later|try again in\s+\d+|slow down|request limit/i.test(message);
    }
    return false;
  }

  private extractProviderRateLimitSummary(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error);
    if (this.providerId === 'chatgpt') {
      return extractChatgptRateLimitSummary(message);
    }
    if (this.providerId === 'gemini') {
      const normalized = message.replace(/\s+/g, ' ').trim();
      const direct = normalized.match(/(google blocked gemini[^.]*\.?|unusual traffic[^.]*\.?|captcha[^.]*\.?)/i);
      return direct?.[1]?.trim() ?? null;
    }
    if (this.providerId === 'grok') {
      const normalized = message.replace(/\s+/g, ' ').trim();
      const direct = normalized.match(
        /(query limit[^.]*\.?(?:\s*try again in [^.]*\.?)?|too many requests[^.]*\.?|rate limit[^.]*\.?|slow down[^.]*\.?|try again later[^.]*\.?|try again in [^.]*\.?)/i,
      );
      return direct?.[1]?.trim() ?? null;
    }
    return null;
  }

  private extractProviderRetryAfterMs(error: unknown): number | null {
    const message = error instanceof Error ? error.message : String(error);
    if (this.providerId !== 'grok') {
      return null;
    }
    const match = message.match(/try again in\s+(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours)/i);
    if (!match) {
      return null;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    const unit = match[2].toLowerCase();
    if (unit.startsWith('sec')) {
      return amount * 1000;
    }
    if (unit.startsWith('hour')) {
      return amount * 60 * 60_000;
    }
    return amount * 60_000;
  }

  private async readProviderGuardState(): Promise<ChatgptRateLimitGuardState | SimpleProviderGuardState | null> {
    if (this.providerId === 'chatgpt') {
      return readChatgptRateLimitGuardState({
        profileName: this.resolveActiveProfileName() ?? 'default',
        cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
      });
    }
    if (this.providerId === 'gemini' || this.providerId === 'grok') {
      return readSimpleProviderGuardState({
        provider: this.providerId,
        profileName: this.resolveActiveProfileName() ?? 'default',
        cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
      });
    }
    return null;
  }

  private async writeProviderGuardState(state: ChatgptRateLimitGuardState | SimpleProviderGuardState): Promise<void> {
    if (this.providerId === 'chatgpt') {
      await writeChatgptRateLimitGuardState(state as ChatgptRateLimitGuardState, {
        profileName: this.resolveActiveProfileName() ?? 'default',
        cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
      });
      return;
    }
    if (this.providerId !== 'gemini' && this.providerId !== 'grok') {
      return;
    }
    await writeSimpleProviderGuardState(state as SimpleProviderGuardState, {
      provider: this.providerId,
      profileName: this.resolveActiveProfileName() ?? 'default',
      cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
    });
  }

  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    if (this.providerId === 'chatgpt' && isChatgptRateLimitMessage(message)) {
      return true;
    }
    if (
      this.providerId === 'chatgpt' &&
      /server connection failed|connection failed|connection lost|network error|failed to connect|unable to connect|something went wrong|an error occurred|message could not be generated|please try again|content not found|messages not found/i.test(
        message,
      )
    ) {
      return true;
    }
    return message.includes('WebSocket connection closed') || message.includes('ECONNRESET');
  }

  private getRetryDelayMs(attempt: number, error: unknown): number {
    if (this.providerId !== 'chatgpt') {
      return 500;
    }
    const isRateLimited = this.isProviderRateLimitedError(error);
    const base = isRateLimited
      ? CHATGPT_RATE_LIMIT_RETRY_BASE_MS + attempt * CHATGPT_RATE_LIMIT_RETRY_STEP_MS
      : CHATGPT_RETRY_BASE_MS + attempt * CHATGPT_RETRY_STEP_MS;
    const maxMs = isRateLimited ? CHATGPT_RATE_LIMIT_RETRY_MAX_MS : CHATGPT_RETRY_MAX_MS;
    const jitter = this.getDeterministicJitterMs(
      `${String(error)}|${String(attempt)}`,
      isRateLimited ? CHATGPT_RATE_LIMIT_RETRY_JITTER_MS : CHATGPT_RETRY_JITTER_MS,
    );
    return Math.min(base + jitter, maxMs);
  }

  private getDeterministicJitterMs(seed: string, maxMs: number): number {
    if (!Number.isFinite(maxMs) || maxMs <= 0) {
      return 0;
    }
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash % (Math.floor(maxMs) + 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseLatestSelector(value: string): number | null {
  const match = value.trim().match(/^latest(?:-(\d+))?$/i);
  if (!match) return null;
  const offset = match[1] ? Number.parseInt(match[1], 10) : 0;
  if (!Number.isFinite(offset) || offset < 0) return null;
  return offset;
}

function resolveCacheStoreKind(value: unknown): CacheStoreKind {
  if (value === 'json' || value === 'sqlite' || value === 'dual') {
    return value;
  }
  return 'dual';
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
