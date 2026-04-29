import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createAccountMirrorSchedulerPassLedger } from '../../src/accountMirror/schedulerLedger.js';
import type { AccountMirrorSchedulerPassResult } from '../../src/accountMirror/schedulerService.js';

const completeMirror = {
  state: 'complete' as const,
  summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
  remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
  signals: {
    projectsTruncated: false,
    conversationsTruncated: false,
    attachmentInventoryTruncated: false,
    attachmentCursorPresent: false,
  },
};

function createPass(input: {
  startedAt: string;
  completedAt: string;
  action?: AccountMirrorSchedulerPassResult['action'];
}): AccountMirrorSchedulerPassResult {
  return {
    object: 'account_mirror_scheduler_pass',
    mode: 'dry-run',
    action: input.action ?? 'dry-run',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    selectedTarget: {
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      status: 'eligible',
      reason: 'eligible',
      eligibleAt: input.startedAt,
      mirrorCompleteness: completeMirror,
    },
    metrics: {
      totalTargets: 1,
      eligibleTargets: 1,
      defaultChatgptEligibleTargets: 1,
      inProgressEligibleTargets: 0,
    },
    refresh: null,
    error: null,
  };
}

describe('account mirror scheduler pass ledger', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('persists bounded pass history under the AuraCall cache root', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-scheduler-ledger-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    try {
      const ledger = createAccountMirrorSchedulerPassLedger({
        config: null,
        maxEntries: 2,
      });

      await ledger.appendPass(createPass({
        startedAt: '2026-04-29T12:00:00.000Z',
        completedAt: '2026-04-29T12:00:01.000Z',
      }));
      await ledger.appendPass(createPass({
        startedAt: '2026-04-29T12:01:00.000Z',
        completedAt: '2026-04-29T12:01:01.000Z',
      }));
      await ledger.appendPass(createPass({
        startedAt: '2026-04-29T12:02:00.000Z',
        completedAt: '2026-04-29T12:02:01.000Z',
        action: 'skipped',
      }));

      const reloaded = createAccountMirrorSchedulerPassLedger({
        config: null,
        maxEntries: 2,
      });
      await expect(reloaded.readHistory()).resolves.toMatchObject({
        object: 'account_mirror_scheduler_pass_history',
        version: 1,
        updatedAt: '2026-04-29T12:02:01.000Z',
        limit: 2,
        entries: [
          {
            object: 'account_mirror_scheduler_pass',
            action: 'skipped',
            completedAt: '2026-04-29T12:02:01.000Z',
          },
          {
            object: 'account_mirror_scheduler_pass',
            action: 'dry-run',
            completedAt: '2026-04-29T12:01:01.000Z',
          },
        ],
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
