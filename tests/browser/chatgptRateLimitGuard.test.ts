import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  appendChatgptMutationTimestamp,
  extractChatgptRateLimitSummary,
  getChatgptMutationBudgetWaitMs,
  getChatgptPostCommitQuietWaitMs,
  isChatgptRateLimitMessage,
  pruneChatgptMutationHistory,
  readChatgptRateLimitGuardState,
  resolveChatgptRateLimitGuardPath,
  resolveChatgptRateLimitProfileName,
  writeChatgptRateLimitGuardState,
} from '../../src/browser/chatgptRateLimitGuard.js';

describe('chatgptRateLimitGuard', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('derives profile name from managed profile directory layout', () => {
    expect(
      resolveChatgptRateLimitProfileName({
        managedProfileRoot: '/tmp/auracall/browser-profiles',
        managedProfileDir: '/tmp/auracall/browser-profiles/windows-chrome-test/chatgpt',
      }),
    ).toBe('windows-chrome-test');
  });

  test('detects and summarizes live ChatGPT rate-limit messages', () => {
    const message = 'Too many requests. You’re making requests too quickly. Please try again later.';
    expect(isChatgptRateLimitMessage(message)).toBe(true);
    expect(extractChatgptRateLimitSummary(message)).toBe('Too many requests.');
  });

  test('writes and reads persisted guard state', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-chatgpt-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);

    try {
      const state = {
        provider: 'chatgpt' as const,
        profile: 'default',
        updatedAt: Date.now(),
        lastMutationAt: Date.now() - 1000,
        recentMutationAts: [Date.now() - 4000, Date.now() - 2000],
        cooldownUntil: Date.now() + 5000,
        cooldownDetectedAt: Date.now() - 100,
        cooldownReason: 'Too many requests.',
        cooldownAction: 'browserRun',
      };
      await writeChatgptRateLimitGuardState(state, { profileName: 'default' });
      const persisted = await readChatgptRateLimitGuardState({ profileName: 'default' });
      expect(persisted).toEqual(state);
      expect(resolveChatgptRateLimitGuardPath({ profileName: 'default' })).toBe(
        path.join(homeDir, 'cache', 'providers', 'chatgpt', '__runtime__', 'rate-limit-default.json'),
      );
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('prunes old mutation timestamps and appends new ones in order', () => {
    expect(
      appendChatgptMutationTimestamp([1_000, 4_000, 12_000], 20_000, 10_000),
    ).toEqual([12_000, 20_000]);
    expect(pruneChatgptMutationHistory([1_000, 4_000, 12_000], 20_000, 10_000)).toEqual([12_000]);
  });

  test('calculates a rolling write-budget delay when the mutation window is full', () => {
    expect(
      getChatgptMutationBudgetWaitMs(
        {
          recentMutationAts: [10_000, 30_000, 50_000, 70_000],
        },
        80_000,
        { windowMs: 120_000, maxWeight: 3 },
      ),
    ).toBe(50_000);
  });

  test('calculates a longer post-commit quiet period as recent activity grows', () => {
    expect(
      getChatgptPostCommitQuietWaitMs(
        {
          recentMutations: [
            { at: 80_000, action: 'renameConversation', weight: 1, quietMs: 12_000 },
            { at: 95_000, action: 'deleteConversation', weight: 1.5, quietMs: 15_000 },
          ],
        },
        100_000,
        { windowMs: 120_000, jitterMaxMs: 0 },
      ),
    ).toBe(14_000);
  });
});
