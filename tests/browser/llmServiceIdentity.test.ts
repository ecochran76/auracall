import { describe, expect, test, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../src/browser/providers/types.js';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../../src/browser/llmService/types.js';

class IdentityTestLlmService extends LlmService {
  constructor(
    userConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(userConfig, provider, {} as never, options);
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
    return this.provider.getUserIdentity ? this.provider.getUserIdentity(options) : null;
  }
}

describe('llmService cache identity resolution', () => {
  test('auto-detects browser identity before prompting by default', async () => {
    const getUserIdentity = vi.fn(async () => ({
      email: 'ecochran76@gmail.com',
      name: 'Eric Cochra',
      source: 'auth-session',
    }));
    const identityPrompt = vi.fn(async () => ({
      email: 'prompted@example.com',
      source: 'prompt',
    }));
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getUserIdentity,
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService({ browser: { cache: {} } } as ResolvedUserConfig, provider, {
      identityPrompt,
    });

    await expect(service.resolveCacheIdentity({})).resolves.toEqual({
      userIdentity: {
        email: 'ecochran76@gmail.com',
        name: 'Eric Cochra',
        source: 'auth-session',
      },
      identityKey: 'ecochran76@gmail.com',
    });
    expect(getUserIdentity).toHaveBeenCalledTimes(1);
    expect(identityPrompt).not.toHaveBeenCalled();
  });

  test('respects explicit cache.useDetectedIdentity = false', async () => {
    const getUserIdentity = vi.fn(async () => ({
      email: 'ecochran76@gmail.com',
      name: 'Eric Cochra',
      source: 'auth-session',
    }));
    const identityPrompt = vi.fn(async () => ({
      email: 'prompted@example.com',
      source: 'prompt',
    }));
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getUserIdentity,
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService(
      { browser: { cache: { useDetectedIdentity: false } } } as ResolvedUserConfig,
      provider,
      { identityPrompt },
    );

    await expect(service.resolveCacheIdentity({})).resolves.toEqual({
      userIdentity: {
        email: 'prompted@example.com',
        source: 'prompt',
      },
      identityKey: 'prompted@example.com',
    });
    expect(getUserIdentity).not.toHaveBeenCalled();
    expect(identityPrompt).toHaveBeenCalledTimes(1);
  });
});
