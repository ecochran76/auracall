import { describe, expect, test, vi } from 'vitest';
import { createAccountMirrorSchedulerPassService } from '../../src/accountMirror/schedulerService.js';
import {
  AccountMirrorRefreshError,
  type AccountMirrorRefreshResult,
} from '../../src/accountMirror/refreshService.js';
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
    mirrorCompleteness: completeMirror,
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
        delayedTargets: 0,
        blockedTargets: 1,
        defaultChatgptEligibleTargets: 1,
        defaultChatgptDelayedTargets: 0,
        inProgressEligibleTargets: 0,
      },
      backpressure: {
        reason: 'none',
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
      queueTimeoutMs: 0,
    });
    expect(result).toMatchObject({
      mode: 'execute',
      action: 'refresh-completed',
      backpressure: {
        reason: 'none',
      },
      refresh: {
        object: 'account_mirror_refresh',
        requestId: 'acctmirror_scheduler',
      },
    });
  });

  test('prioritizes in-progress default ChatGPT mirrors for lazy passes', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorSchedulerPassService({
      registry: createAccountMirrorStatusRegistry({
        config,
        initialState: {
          'chatgpt:default': {
            metadataCounts: {
              projects: 5,
              conversations: 69,
              artifacts: 3,
              files: 24,
              media: 0,
            },
            metadataEvidence: {
              identitySource: 'profile-menu',
              projectSampleIds: ['project_1'],
              conversationSampleIds: ['conv_1'],
              attachmentInventory: {
                nextProjectIndex: 5,
                nextConversationIndex: 1,
                detailReadLimit: 6,
                scannedProjects: 5,
                scannedConversations: 1,
              },
              truncated: {
                projects: false,
                conversations: false,
                artifacts: true,
              },
            },
          },
        },
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    const result = await service.runOnce({ dryRun: true });

    expect(result).toMatchObject({
      action: 'dry-run',
      selectedTarget: {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        mirrorCompleteness: {
          state: 'in_progress',
          remainingDetailSurfaces: {
            total: 68,
          },
        },
      },
      metrics: {
        inProgressEligibleTargets: 1,
      },
    });
  });

  test('reports routine-delayed backpressure when no default ChatGPT target is eligible', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorSchedulerPassService({
      registry: createAccountMirrorStatusRegistry({
        config,
        initialState: {
          'chatgpt:default': {
            lastSuccessAtMs: Date.parse('2026-04-29T11:59:00.000Z'),
            detectedIdentityKey: 'ecochran76@gmail.com',
          },
        },
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    const result = await service.runOnce({ dryRun: false });

    expect(requestRefresh).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'skipped',
      selectedTarget: null,
      backpressure: {
        reason: 'routine-delayed',
      },
      metrics: {
        defaultChatgptEligibleTargets: 0,
        defaultChatgptDelayedTargets: 1,
      },
    });
  });

  test('reports browser-work backpressure when routine refresh cannot acquire the dispatcher', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    requestRefresh.mockRejectedValueOnce(new AccountMirrorRefreshError(
      503,
      'account_mirror_browser_operation_busy',
      'Browser operation is busy.',
    ));
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

    expect(result).toMatchObject({
      action: 'refresh-blocked',
      backpressure: {
        reason: 'blocked-by-browser-work',
        message: 'Browser operation is busy.',
      },
    });
  });

  test('reports yielded backpressure when a refresh stops for queued browser work', async () => {
    const yieldedRefresh = createRefreshResult();
    yieldedRefresh.metadataEvidence = {
      identitySource: 'profile-menu',
      projectSampleIds: [],
      conversationSampleIds: [],
      attachmentInventory: {
        nextProjectIndex: 1,
        nextConversationIndex: 0,
        detailReadLimit: 6,
        scannedProjects: 1,
        scannedConversations: 0,
        yielded: true,
      },
      truncated: {
        projects: false,
        conversations: false,
        artifacts: true,
      },
    };
    const requestRefresh = vi.fn(async () => yieldedRefresh);
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

    expect(result).toMatchObject({
      action: 'refresh-completed',
      backpressure: {
        reason: 'yielded-to-queued-work',
      },
    });
  });
});
