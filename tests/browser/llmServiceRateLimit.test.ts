import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { resolveChatgptRateLimitGuardPath } from '../../src/browser/chatgptRateLimitGuard.js';
import type { ResolvedUserConfig } from '../../src/config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../src/browser/providers/types.js';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../../src/browser/llmService/types.js';

class RateLimitTestLlmService extends LlmService {
  constructor(
    userConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(userConfig, provider, {} as never, options);
  }

  protected override getProviderGuardSettings() {
    return {
      cooldownMs: 120,
      autoWaitMaxMs: 10,
      mutationWindowMs: 120,
      mutationMaxWeight: 2,
      mutationBudgetAutoWaitMaxMs: 120,
      postCommitAutoWaitMaxMs: 120,
      postCommitQuietScale: 0.003,
      postCommitJitterMaxMs: 0,
    };
  }

  getGuardStatePath(): string | null {
    return resolveChatgptRateLimitGuardPath({ profileName: 'default' });
  }

  async runGuarded<T>(action: string, fn: () => Promise<T>): Promise<T> {
    return this.withRetry(fn, { action, retries: 0 });
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity(_options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
    return null;
  }
}

describe('llmService ChatGPT rate-limit guard', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('persists cooldown after a ChatGPT rate-limit error and blocks later live calls', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-chatgpt-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
    } satisfies LlmServiceAdapter;
    const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
    const service = new RateLimitTestLlmService(userConfig, provider);

    try {
      await expect(
        service.runGuarded('renameConversation', async () => {
          throw new Error('Too many requests. You’re making requests too quickly.');
        }),
      ).rejects.toThrow(/cooling down until/i);

      const guardStatePath = service.getGuardStatePath();
      expect(guardStatePath).toBeTruthy();
      const persisted = JSON.parse(await readFile(guardStatePath as string, 'utf8')) as {
        cooldownUntil?: number;
        cooldownAction?: string;
      };
      expect(typeof persisted.cooldownUntil).toBe('number');
      expect(persisted.cooldownAction).toBe('renameConversation');

      const nextProcess = new RateLimitTestLlmService(userConfig, provider);
      await expect(
        nextProcess.runGuarded('listConversations', async () => []),
      ).rejects.toThrow(/cooldown active until/i);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('spaces ChatGPT mutating operations across separate service instances', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-chatgpt-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
    } satisfies LlmServiceAdapter;
    const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
    const first = new RateLimitTestLlmService(userConfig, provider);
    const second = new RateLimitTestLlmService(userConfig, provider);

    try {
      await expect(first.runGuarded('renameConversation', async () => undefined)).resolves.toBeUndefined();
      const startedAt = Date.now();
      await expect(second.runGuarded('updateProjectInstructions', async () => undefined)).resolves.toBeUndefined();
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('enforces a rolling write budget across separate service instances', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-chatgpt-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
    } satisfies LlmServiceAdapter;
    const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
    const first = new RateLimitTestLlmService(userConfig, provider);
    const second = new RateLimitTestLlmService(userConfig, provider);
    const third = new RateLimitTestLlmService(userConfig, provider);

    try {
      await expect(first.runGuarded('renameConversation', async () => undefined)).resolves.toBeUndefined();
      await expect(second.runGuarded('updateProjectInstructions', async () => undefined)).resolves.toBeUndefined();
      const startedAt = Date.now();
      await expect(third.runGuarded('deleteConversation', async () => undefined)).resolves.toBeUndefined();
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
