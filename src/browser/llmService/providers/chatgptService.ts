import type { ResolvedUserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt, PromptInput, PromptResult } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../providers/types.js';
import type { Conversation, Project } from '../../providers/domain.js';
import { runBrowserMode } from '../../index.js';

export class ChatgptService extends LlmService {
  private constructor(
    private readonly serviceUserConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    browserService: BrowserService,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(serviceUserConfig, provider, browserService, options);
  }

  static create(
    userConfig: ResolvedUserConfig,
    options?: { identityPrompt?: IdentityPrompt; browserService?: BrowserService },
  ): ChatgptService {
    const provider = getProvider('chatgpt') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig, 'chatgpt');
    return new ChatgptService(userConfig, provider, browserService, options);
  }

  async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
    if (!this.provider.listProjects) {
      return [];
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return (await this.withRetry(
      () => this.provider.listProjects?.(listOptions) as Promise<Project[]>,
      { action: 'listProjects' },
    )) as Project[];
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<Conversation[]> {
    if (!this.provider.listConversations) {
      return [];
    }
    const listOptions = this.scopeConversationListOptions(
      await this.buildListOptions(options, { ensurePort: true }),
      projectId,
    );
    return (await this.withRetry(
      () => this.provider.listConversations?.(projectId, listOptions) as Promise<Conversation[]>,
      { action: 'listConversations' },
    )) as Conversation[];
  }

  async runPrompt(input: PromptInput, options?: BrowserProviderListOptions): Promise<PromptResult> {
    if (input.completionMode !== 'prompt_submitted') {
      throw new Error('ChatGPT llmService prompt execution currently supports completionMode=prompt_submitted only.');
    }
    const configuredUrl =
      input.configuredUrl ??
      input.listOptions?.configuredUrl ??
      options?.configuredUrl ??
      this.getConfiguredUrl();
    const browserConfig = this.serviceUserConfig.browser ?? {};
    const result = await runBrowserMode({
      prompt: input.prompt,
      completionMode: 'prompt_submitted',
      skipBrowserExecutionOperation: true,
      config: {
        ...browserConfig,
        target: 'chatgpt',
        url: configuredUrl ?? browserConfig.chatgptUrl ?? browserConfig.url,
        chatgptUrl: configuredUrl ?? browserConfig.chatgptUrl ?? browserConfig.url ?? null,
        projectId: input.projectId ?? options?.projectId ?? null,
        conversationId: input.conversationId ?? null,
        timeoutMs: input.timeoutMs ?? browserConfig.timeoutMs,
        keepBrowser: true,
        auracallProfileName: this.serviceUserConfig.auracallProfile ?? null,
        composerTool: input.capabilityId === 'chatgpt.media.create_image'
          ? 'create image'
          : (browserConfig.composerTool ?? null),
      },
      log: this.createProgressLogger(input.onProgress),
    });
    return {
      text: result.answerMarkdown || result.answerText || '',
      conversationId: result.conversationId ?? null,
      url: result.tabUrl ?? null,
      tabTargetId: result.chromeTargetId ?? null,
      devtoolsHost: result.chromeHost ?? null,
      devtoolsPort: result.chromePort ?? null,
    };
  }

  private createProgressLogger(
    onProgress?: PromptInput['onProgress'],
  ): ((message: string) => void) | undefined {
    if (!onProgress) {
      return undefined;
    }
    return (message: string): void => {
      void onProgress({
        phase: 'submit_path_observed',
        details: { provider: 'chatgpt', message },
      });
    };
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
    await this.withRetry(
      () => this.provider.renameConversation?.(conversationId, newTitle, projectId, listOptions) as Promise<void>,
      { action: 'renameConversation' },
    );
  }

  async deleteConversation(
    conversationId: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void> {
    if (!this.provider.deleteConversation) {
      throw new Error(`Delete is not supported for ${this.providerId}.`);
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    await this.withRetry(
      () => this.provider.deleteConversation?.(conversationId, projectId, listOptions) as Promise<void>,
      { action: 'deleteConversation' },
    );
  }

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderUserIdentity | null> {
    if (!this.provider.getUserIdentity) {
      return null;
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return this.provider.getUserIdentity(listOptions);
  }
}
