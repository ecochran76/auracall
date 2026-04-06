import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { stripProjectInstructionsPrefixFromConversationContext } from '../../src/browser/llmService/llmService.js';
import type { ConversationContext } from '../../src/browser/providers/domain.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { JsonCacheStore } from '../../src/browser/llmService/cache/store.js';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import type { CacheStore } from '../../src/browser/llmService/cache/store.js';
import type { LlmServiceAdapter, PromptInput, PromptResult } from '../../src/browser/llmService/types.js';
import type { BrowserProviderListOptions } from '../../src/browser/providers/types.js';
import type { ResolvedUserConfig } from '../../src/config.js';

class TestContextLlmService extends LlmService {
  constructor(
    provider: LlmServiceAdapter,
    cacheStore: CacheStore,
    private readonly fixedCacheContext: ProviderCacheContext,
  ) {
    super({ browser: { cache: {} } } as ResolvedUserConfig, provider, {} as never, { cacheStore });
  }

  override async buildListOptions(
    overrides: BrowserProviderListOptions = {},
  ): Promise<BrowserProviderListOptions> {
    return { ...overrides };
  }

  override async resolveCacheContext(): Promise<ProviderCacheContext> {
    return this.fixedCacheContext;
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async runPrompt(_input: PromptInput): Promise<PromptResult> {
    throw new Error('not implemented');
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity() {
    return null;
  }
}

describe('project-scoped conversation context normalization', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('strips a prefixed project instructions block from the first assistant message', () => {
    const context: ConversationContext = {
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'user', text: 'Reply exactly with: Context Probe Answer' },
        {
          role: 'assistant',
          text: 'Context probe instructions\nLine two\nContext Probe Answer',
        },
      ],
    };

    expect(
      stripProjectInstructionsPrefixFromConversationContext(
        context,
        'Context probe instructions\nLine two\n',
      ),
    ).toEqual({
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'user', text: 'Reply exactly with: Context Probe Answer' },
        { role: 'assistant', text: 'Context Probe Answer' },
      ],
    });
  });

  test('does not strip when the assistant message does not start with the project instructions', () => {
    const context: ConversationContext = {
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'assistant', text: 'Context Probe Answer\nContext probe instructions\nLine two' },
      ],
    };

    expect(
      stripProjectInstructionsPrefixFromConversationContext(
        context,
        'Context probe instructions\nLine two\n',
      ),
    ).toEqual(context);
  });

  test('getConversationContext writes Gemini-style context into cache on the shared contract', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-context-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'gemini',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const context: ConversationContext = {
      provider: 'gemini',
      conversationId: 'conversation-ctx',
      messages: [
        { role: 'user', text: 'Disposable Gemini context probe 2026-04-06: reply exactly ACK CONTEXT PROBE' },
        { role: 'assistant', text: 'ACK CONTEXT PROBE' },
      ],
    };
    const provider = {
      id: 'gemini',
      config: { id: 'gemini', selectors: {} as never },
      readConversationContext: vi.fn(async () => context),
    };
    const service = new TestContextLlmService(provider as never, store, cacheContext);

    try {
      const result = await service.getConversationContext('conversation-ctx', { listOptions: {} });
      expect(result).toEqual(context);
      expect(provider.readConversationContext).toHaveBeenCalledWith('conversation-ctx', undefined, {});
      const cached = await store.readConversationContext(cacheContext, 'conversation-ctx');
      expect(cached.items).toEqual(context);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
