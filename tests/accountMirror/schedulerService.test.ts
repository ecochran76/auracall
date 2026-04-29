import { describe, expect, test, vi } from 'vitest';
import { createAccountMirrorSchedulerPassService } from '../../src/accountMirror/schedulerService.js';
import type { AccountMirrorRefreshResult } from '../../src/accountMirror/refreshService.js';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';

const config = {
  runtimeProfiles: {
    default: {
      browserProfile: 'default',
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          identity: {
            email: 'ecochran76@gmail.com',
            accountLevel: 'Business',
          },
        },
      },
    },
    blocked: {
      browserProfile: 'default',
      defaultService: 'grok',
      services: {
        grok: {},
      },
    },
  },
};

function createRefreshResult(): AccountMirrorRefreshResult {
  return {
    object: 'account_mirror_refresh',
    requestId: 'acctmirror_scheduler',
    status: 'completed',
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    startedAt: '2026-04-29T12:00:00.000Z',
    completedAt: '2026-04-29T12:00:01.000Z',
    dispatcher: {
      key: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
      operationId: 'op_scheduler',
      blockedBy: null,
    },
    metadataCounts: {
      projects: 1,
      conversations: 2,
      artifacts: 0,
      files: 0,
      media: 0,
    },
    metadataEvidence: null,
    detectedIdentityKey: 'ecochran76@gmail.com',
    detectedAccountLevel: 'Business',
    mirrorStatus: {
      object: 'account_mirror_status',
      generatedAt: '2026-04-29T12:00:01.000Z',
      entries: [],
      metrics: {
        total: 1,
        eligible: 0,
        delayed: 1,
        blocked: 0,
      },
    },
  };
}

describe('account mirror scheduler pass service', () => {
  test('dry-run pass selects the first eligible default ChatGPT target without refreshing', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorSchedulerPassService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    const result = await service.runOnce({ dryRun: true });

    expect(requestRefresh).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      object: 'account_mirror_scheduler_pass',
      mode: 'dry-run',
      action: 'dry-run',
      selectedTarget: {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        status: 'eligible',
        reason: 'eligible',
      },
      metrics: {
        totalTargets: 2,
        eligibleTargets: 1,
        defaultChatgptEligibleTargets: 1,
      },
    });
  });

  test('execute pass requests one routine refresh for the selected target', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorSchedulerPassService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    const result = await service.runOnce({ dryRun: false });

    expect(requestRefresh).toHaveBeenCalledTimes(1);
    expect(requestRefresh).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: false,
    });
    expect(result).toMatchObject({
      mode: 'execute',
      action: 'refresh-completed',
      refresh: {
        object: 'account_mirror_refresh',
        requestId: 'acctmirror_scheduler',
      },
    });
  });
});
