import type { ResolvedUserConfig } from '../../../config.js';
import type { IdentityPrompt } from '../types.js';
import type { BrowserService } from '../../service/browserService.js';
import { ChatgptService } from './chatgptService.js';
import { GrokService } from './grokService.js';
import type { ProviderId } from '../../providers/domain.js';
import type { LlmService } from '../llmService.js';

export function createLlmService(
  providerId: ProviderId,
  userConfig: ResolvedUserConfig,
  options?: { identityPrompt?: IdentityPrompt; browserService?: BrowserService },
): LlmService {
  if (providerId === 'grok') {
    return GrokService.create(userConfig, options);
  }
  return ChatgptService.create(userConfig, options);
}
