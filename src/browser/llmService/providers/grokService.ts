import type { ResolvedUserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../providers/types.js';
import type { Conversation, Project } from '../../providers/domain.js';

export class GrokService extends LlmService {
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
  ): GrokService {
    const provider = getProvider('grok') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig);
    return new GrokService(userConfig, provider, browserService, options);
  }

  async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
    if (!this.provider.listProjects) {
      return [];
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return (await this.provider.listProjects(listOptions)) as Project[];
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<Conversation[]> {
    if (!this.provider.listConversations) {
      return [];
    }
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return (await this.withRetry(
      () => this.provider.listConversations?.(projectId, listOptions) as Promise<Conversation[]>,
      { action: 'listConversations' },
    )) as Conversation[];
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
