import type { ResolvedUserConfig } from '../../config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../providers/types.js';
import type {
  Conversation,
  ConversationContext,
  ConversationMessage,
  FileRef,
  Project,
  ProviderId,
} from '../providers/domain.js';
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
    const target = overrides.tabTargetId
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
    fields: { name?: string; instructions?: string; modelLabel?: string },
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
  }

  async listProjectFiles(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef[]> {
    if (!this.provider.listProjectFiles) {
      throw new Error(`Project file listing is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const files = await this.withRetry(
      () => this.provider.listProjectFiles?.(projectId, listOptions) as Promise<FileRef[]>,
      { action: 'listProjectFiles' },
    );
    return Array.isArray(files) ? files : [];
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
    },
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<Project | null> {
    if (!this.provider.createProject) {
      throw new Error(`Project creation is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    const created = await this.withRetry(
      () => this.provider.createProject?.(input, listOptions) as Promise<Project | null>,
      { action: 'createProject' },
    );
    return created ?? null;
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
  }

  async getProjectInstructions(
    projectId: string,
    options?: { listOptions?: BrowserProviderListOptions },
  ): Promise<{ text: string; model?: string | null }> {
    if (!this.provider.getProjectInstructions) {
      throw new Error(`Project instructions read is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
    return await this.withRetry(
      () =>
        this.provider.getProjectInstructions?.(projectId, listOptions) as Promise<{
          text: string;
          model?: string | null;
        }>,
      { action: 'getProjectInstructions' },
    );
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
      const normalized = this.normalizeConversationContext(context, conversationId);
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
    const profile = this.userConfig.auracallProfiles?.[profileName];
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
    const profiles = this.userConfig.auracallProfiles;
    if (!profiles) return null;
    const explicit = typeof this.userConfig.auracallProfile === 'string' ? this.userConfig.auracallProfile.trim() : '';
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
    return {
      provider: this.providerId,
      conversationId:
        typeof raw.conversationId === 'string' && raw.conversationId.trim().length > 0
          ? raw.conversationId.trim()
          : conversationId,
      messages: normalizedMessages,
      files: Array.isArray(raw.files) ? raw.files : undefined,
    };
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
