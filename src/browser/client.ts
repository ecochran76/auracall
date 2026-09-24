import {
  closeRemoteChromeTarget,
  listChromeTargets,
  openChromeTarget,
} from '../../packages/browser-service/src/chromeLifecycle.js';
import { BrowserAutomationClientCore } from '../../packages/browser-service/src/client.js';
import type { DevToolsConnectionOptions } from '../../packages/browser-service/src/types.js';
import type { ResolvedUserConfig } from '../config.js';
import { CRAWLER_SCRIPT } from '../inspector/crawler.js';
import { type DiagnosisReport, diagnoseProvider } from '../inspector/doctor.js';
import { runChatgptPromptWithConfiguredAffinity } from './chatgptAffinityRuntime.js';
import { createLlmService } from './llmService/index.js';
import type { LlmService } from './llmService/llmService.js';
import type { PromptInput, PromptResult } from './llmService/types.js';
import type { BrowserLoginOptions } from './login.js';
import { runBrowserLogin } from './login.js';
import type { ConversationArtifact, ConversationContext, FileRef } from './providers/domain.js';
import type { ProviderSessionProof } from './providers/providerSessionAuthority.js';
import type {
  BrowserProvider,
  BrowserProviderActiveMediaMaterializationInput,
  BrowserProviderListOptions,
  BrowserProviderPromptWorkbenchInput,
  BrowserProviderPromptWorkbenchResult,
} from './providers/types.js';
import {
  type BrowserProcessOwnerAttribution,
  BrowserService,
} from './service/browserService.js';
import {
  type BrowserTabConcurrencyRuntime,
  type BrowserTabConcurrencyStatus,
  createBrowserTabConcurrencyRuntime,
} from './tabConcurrencyRuntime.js';
import type { ChromeClient } from './types.js';

export class BrowserAutomationClient {
  readonly target: 'chatgpt' | 'gemini' | 'grok';
  readonly provider: BrowserProvider;
  private readonly browserService: BrowserService;
  private readonly llmService: LlmService;
  private readonly core: BrowserAutomationClientCore;
  private readonly tabConcurrencyRuntime: BrowserTabConcurrencyRuntime;

  private constructor(
    readonly userConfig: ResolvedUserConfig,
    target: 'chatgpt' | 'gemini' | 'grok',
    browserService: BrowserService,
  ) {
    this.target = target;
    this.browserService = browserService;
    this.llmService = createLlmService(target, userConfig, { browserService });
    this.provider = this.llmService.provider;
    this.core = new BrowserAutomationClientCore(this.provider, {
      connectDevTools: () => this.connectDevTools(),
      diagnoseProvider: (client, config, basePath, options) =>
        diagnoseProvider(client, config as typeof this.provider.config, basePath, options),
      crawlerScript: CRAWLER_SCRIPT,
    });
    this.tabConcurrencyRuntime = createBrowserTabConcurrencyRuntime(userConfig);
  }

  static async fromConfig(
    userConfig: ResolvedUserConfig,
    options?: {
      target?: 'chatgpt' | 'gemini' | 'grok';
      browserProcessOwner?: BrowserProcessOwnerAttribution;
    },
  ): Promise<BrowserAutomationClient> {
    const target = options?.target ?? userConfig.browser?.target ?? 'chatgpt';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const browserService = BrowserService.fromConfig(userConfig, target, {
      browserProcessOwner: options?.browserProcessOwner,
    });
    await browserService.pruneRegistry().catch(() => undefined);
    return new BrowserAutomationClient(userConfig, target, browserService);
  }

  async buildListOptions(
    overrides: BrowserProviderListOptions = {},
    options: { ensurePort?: boolean } = {},
  ): Promise<BrowserProviderListOptions> {
    return this.llmService.buildListOptions(overrides, options);
  }

  async getTabConcurrencyStatus(): Promise<BrowserTabConcurrencyStatus> {
    return this.tabConcurrencyRuntime.readStatus();
  }

  async runUtilityBrowserOperation<TResult>(input: {
    options?: BrowserProviderListOptions;
    mutability: 'read-only' | 'provider-mutating';
    run: (options: BrowserProviderListOptions) => Promise<TResult>;
  }): Promise<TResult> {
    return this.llmService.runUtilityBrowserOperation(input);
  }

  async listProjects(
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    return this.llmService.listProjects(options);
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    return this.llmService.listConversations(projectId, options);
  }

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<import('./providers/types.js').ProviderUserIdentity | null> {
    return this.llmService.getUserIdentity(options);
  }

  async getProviderSessionProof(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderSessionProof> {
    return this.llmService.getProviderSessionProof(options);
  }

  async getFeatureSignature(
    options?: BrowserProviderListOptions,
  ): Promise<string | null> {
    if (!this.provider.getFeatureSignature) {
      return null;
    }
    const listOptions = await this.llmService.buildListOptions(options, { ensurePort: true });
    return this.provider.getFeatureSignature(listOptions);
  }

  async renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void> {
    await this.llmService.renameConversation(conversationId, newTitle, projectId, options);
  }

  async runPrompt(
    input: PromptInput,
    options?: BrowserProviderListOptions,
  ): Promise<PromptResult> {
    if (this.target !== 'chatgpt') {
      return this.llmService.runPrompt(input, options);
    }
    return runChatgptPromptWithConfiguredAffinity({
      userConfig: this.userConfig,
      runtime: this.tabConcurrencyRuntime,
      input,
      options,
      runSerialized: (promptInput, promptOptions) =>
        this.llmService.runPrompt(promptInput, promptOptions),
      runExact: (promptInput, promptOptions) =>
        this.llmService.runPrompt(promptInput, promptOptions),
      resolveServiceTarget: (targetOptions) =>
        this.browserService.resolveServiceTarget(targetOptions),
      openTarget: async ({ host, port, url }) => {
        const target = await openChromeTarget(port, url, host);
        const targetId = typeof target === 'string' ? target : target.id;
        if (!targetId) throw new Error('ChatGPT target creation returned no target ID.');
        return { targetId, url };
      },
      inspectTarget: async (endpoint, targetId) => {
        const targets = await listChromeTargets(endpoint.port, endpoint.host);
        const target = targets.find((candidate) => {
          const record = candidate as { id?: string; targetId?: string };
          return (record.targetId ?? record.id) === targetId;
        }) as { url?: string } | undefined;
        return typeof target?.url === 'string' ? { url: target.url } : null;
      },
      closeTarget: ({ host, port, targetId }) =>
        closeRemoteChromeTarget(host, port, targetId, () => undefined),
    });
  }

  async preparePromptWorkbench(
    input: BrowserProviderPromptWorkbenchInput,
    options?: BrowserProviderListOptions,
  ): Promise<BrowserProviderPromptWorkbenchResult> {
    return this.llmService.preparePromptWorkbench(input, options);
  }

  async getConversationContext(
    conversationId: string,
    options?: {
      projectId?: string;
      refresh?: boolean;
      cacheOnly?: boolean;
      allowCacheFallback?: boolean;
      timeoutMs?: number;
      listOptions?: BrowserProviderListOptions;
    },
  ): Promise<ConversationContext> {
    return this.llmService.getConversationContext(conversationId, options);
  }

  async readActiveConversationArtifacts(
    conversationId: string,
    options?: BrowserProviderListOptions,
  ): Promise<ConversationArtifact[]> {
    if (!this.provider.readActiveConversationArtifacts) {
      throw new Error(`Active conversation artifact read is not supported for ${this.target}.`);
    }
    const listOptions = await this.llmService.buildListOptions(options, { ensurePort: true });
    return this.provider.readActiveConversationArtifacts(conversationId, listOptions);
  }

  async listProjectFiles(
    projectId: string,
    options?: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    return this.llmService.listProjectFiles(projectId, { listOptions: options });
  }

  async listAccountFiles(
    options?: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    return this.llmService.listAccountFiles({ listOptions: options });
  }

  async downloadAccountFile(
    fileId: string,
    destPath: string,
    options?: { listOptions?: BrowserProviderListOptions; file?: FileRef },
  ): Promise<void> {
    return this.llmService.downloadAccountFile(fileId, destPath, options);
  }

  async listConversationFiles(
    conversationId: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef[]> {
    return this.llmService.listConversationFiles(conversationId, options);
  }

  async materializeConversationArtifact(
    conversationId: string,
    artifact: ConversationArtifact,
    destDir: string,
    options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
  ): Promise<FileRef | null> {
    return this.llmService.materializeConversationArtifact(conversationId, artifact, destDir, options);
  }

  async materializeActiveMediaArtifacts(
    input: BrowserProviderActiveMediaMaterializationInput,
    destDir: string,
    options?: BrowserProviderListOptions,
  ): Promise<FileRef[]> {
    return this.llmService.materializeActiveMediaArtifacts(input, destDir, options);
  }

  async connectDevTools(
    options: DevToolsConnectionOptions = {},
  ): Promise<{ client: ChromeClient; port: number }> {
    return this.browserService.connectDevTools(options);
  }

  async connectChatgptPromptWorkbench(
    options: DevToolsConnectionOptions = {},
  ): Promise<{ client: ChromeClient; port: number }> {
    if (this.target !== 'chatgpt') {
      throw new Error('Prompt-workbench DevTools attachment is only available for ChatGPT.');
    }
    const exactOptions =
      options.host && options.port && options.tabTargetId
        ? {
            host: options.host,
            port: options.port,
            tabTargetId: options.tabTargetId,
          }
        : {};
    const providerOptions = await this.llmService.buildListOptions({
      abortSignal: options.abortSignal,
      configuredUrl: 'https://chatgpt.com/',
      preserveActiveTab: true,
      requirePromptWorkbenchTarget: true,
      tabLifecycle: 'retain-new',
      ...exactOptions,
    }, { ensurePort: true });
    const { connectToChatgptPromptWorkbenchForSkills } = await import(
      './providers/chatgptAdapter.js'
    );
    return connectToChatgptPromptWorkbenchForSkills(providerOptions);
  }

  async diagnose(options: { basePath?: string; saveSnapshot?: boolean; quiet?: boolean } = {}): Promise<{
    report: DiagnosisReport;
    port: number;
  }> {
    const { report, port } = await this.core.diagnose(options);
    return { report: report as DiagnosisReport, port };
  }

  async login(options: BrowserLoginOptions): Promise<void> {
    await runBrowserLogin(options);
  }
}
