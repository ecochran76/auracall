import type { ResolvedUserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt, PromptInput, PromptResult } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../providers/types.js';
import type { Conversation, Project } from '../../providers/domain.js';

export class ChatgptService extends LlmService {
  private constructor(
    userConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    browserService: BrowserService,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(userConfig, provider, browserService, options);
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

  async runPrompt(_input: PromptInput, _options?: BrowserProviderListOptions): Promise<PromptResult> {
    throw new Error('Prompt execution is not supported for chatgpt in llmService yet.');
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
