import type { ResolvedUserConfig } from '../config.js';
import type { MediaGenerationExecutor } from './types.js';
import { MediaGenerationExecutionError } from './service.js';
import { createGeminiApiMediaGenerationExecutor } from './geminiApiExecutor.js';
import { createGeminiBrowserMediaGenerationExecutor } from './geminiBrowserExecutor.js';
import { createGrokBrowserMediaGenerationExecutor } from './grokBrowserExecutor.js';

export function createBrowserMediaGenerationExecutor(userConfig: ResolvedUserConfig): MediaGenerationExecutor {
  const gemini = createGeminiBrowserMediaGenerationExecutor(userConfig);
  const geminiApi = createGeminiApiMediaGenerationExecutor({ env: process.env });
  const grok = createGrokBrowserMediaGenerationExecutor(userConfig);
  return async (input) => {
    if (input.request.provider === 'gemini' && input.request.transport === 'api') {
      return geminiApi(input);
    }
    if (input.request.provider === 'gemini') {
      return gemini(input);
    }
    if (input.request.provider === 'grok') {
      return grok(input);
    }
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      `Media generation provider ${input.request.provider} is not implemented by the browser executor.`,
      {
        provider: input.request.provider,
        transport: input.request.transport ?? null,
        mediaType: input.request.mediaType,
      },
    );
  };
}
