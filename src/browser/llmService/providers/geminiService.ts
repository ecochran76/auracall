import type { ResolvedUserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../providers/types.js';
import type { Conversation, Project } from '../../providers/domain.js';
import {
  deriveProviderIdentityFromChromeGoogleAccount,
  inspectBrowserDoctorState,
} from '../../profileDoctor.js';

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
    options?: { identityPrompt?: IdentityPrompt; browserService?: BrowserService },
  ): GeminiService {
    const provider = getProvider('gemini') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig, 'gemini');
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

  async renameConversation(): Promise<void> {
    throw new Error('Conversation rename is not supported for gemini yet.');
  }

  async deleteConversation(): Promise<void> {
    throw new Error('Conversation delete is not supported for gemini yet.');
  }

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<ProviderUserIdentity | null> {
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    if (this.provider.getUserIdentity) {
      const detected = await this.provider.getUserIdentity(listOptions);
      if (detected) {
        return detected;
      }
    }
    const localReport = await inspectBrowserDoctorState(this.getResolvedUserConfig(), { target: 'gemini' });
    return deriveProviderIdentityFromChromeGoogleAccount(localReport.chromeGoogleAccount);
  }
}
