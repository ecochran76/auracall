import { describe, expect, it, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';

const runBrowserMode = vi.fn(async () => ({
  answerMarkdown: '',
  answerText: '',
  conversationId: 'chatgpt-conversation-1',
  tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
  chromeTargetId: 'chatgpt-tab-1',
  chromeHost: '127.0.0.1',
  chromePort: 45011,
}));

vi.mock('../../src/browser/index.js', () => ({
  runBrowserMode,
}));

describe('ChatGPT llm service', () => {
  it('skips model switching for ChatGPT image media runs before selecting Create image', async () => {
    const { ChatgptService } = await import('../../src/browser/llmService/providers/chatgptService.js');
    const service = ChatgptService.create({
      browser: {
        target: 'chatgpt',
        modelStrategy: 'select',
        composerTool: 'deep-research',
      },
    } as ResolvedUserConfig);

    await service.runPrompt({
      prompt: 'Generate an image of an asphalt secret agent',
      capabilityId: 'chatgpt.media.create_image',
      completionMode: 'prompt_submitted',
    });

    expect(runBrowserMode).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          modelStrategy: 'ignore',
          composerTool: 'create image',
        }),
      }),
    );
  });
});
