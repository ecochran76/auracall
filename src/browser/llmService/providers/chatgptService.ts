import type { UserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';

export class ChatgptService extends LlmService {
  private constructor(
    userConfig: UserConfig,
    provider: LlmServiceAdapter,
    browserService: BrowserService,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(userConfig, provider, browserService, options);
  }

  static create(
    userConfig: UserConfig,
    options?: { identityPrompt?: IdentityPrompt; browserService?: BrowserService },
  ): ChatgptService {
    const provider = getProvider('chatgpt') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig);
    return new ChatgptService(userConfig, provider, browserService, options);
  }
}
