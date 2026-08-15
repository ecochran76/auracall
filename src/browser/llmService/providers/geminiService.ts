import type { ResolvedUserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../types.js';
import {
  BrowserService,
  type BrowserProcessOwnerAttribution,
} from '../../service/browserService.js';
import { LlmService } from '../llmService.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../providers/types.js';
import type { Conversation, Project } from '../../providers/domain.js';

export class GeminiService extends LlmService {
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
    options?: {
      identityPrompt?: IdentityPrompt;
      browserProcessOwner?: BrowserProcessOwnerAttribution;
      browserService?: BrowserService;
    },
  ): GeminiService {
    const provider = getProvider('gemini') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig, 'gemini', {
      browserProcessOwner: options?.browserProcessOwner,
    });
    return new GeminiService(userConfig, provider, browserService, options);
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

  async listConversations(projectId?: string, options?: BrowserProviderListOptions): Promise<Conversation[]> {
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
    await this.ensureValidConversationUrl(conversationId, { projectId, listOptions });
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
    await this.ensureValidConversationUrl(conversationId, { projectId, listOptions });
    await this.withRetry(
      () => this.provider.deleteConversation?.(conversationId, projectId, listOptions) as Promise<void>,
      { action: 'deleteConversation' },
    );
  }

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderUserIdentity | null> {
    return (await this.getProviderSessionProof(options)).observation;
  }
}
