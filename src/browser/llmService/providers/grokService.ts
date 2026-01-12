import type { UserConfig } from '../../../config.js';
import { getProvider } from '../../providers/index.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../types.js';
import { BrowserService } from '../../service/browserService.js';
import { LlmService } from '../llmService.js';

export class GrokService extends LlmService {
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
  ): GrokService {
    const provider = getProvider('grok') as LlmServiceAdapter;
    const browserService = options?.browserService ?? BrowserService.fromConfig(userConfig);
    return new GrokService(userConfig, provider, browserService, options);
  }
}
