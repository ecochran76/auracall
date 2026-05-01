import { describe, expect, test, vi } from 'vitest';
import { createAccountMirrorCompletionService } from '../../src/accountMirror/completionService.js';
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
          },
        },
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
    requestId: 'acctmirror_refresh_1',
    status: 'completed',
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    startedAt: '2026-04-30T12:00:00.000Z',
    completedAt: '2026-04-30T12:00:01.000Z',
    dispatcher: {
      key: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
      operationId: 'op_1',
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
      generatedAt: '2026-04-30T12:00:01.000Z',
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

describe('account mirror completion service', () => {
  test('waits through polite cooldown instead of blocking the operation', async () => {
    const requestRefresh = vi.fn()
      .mockRejectedValueOnce(new AccountMirrorRefreshError(
        409,
        'account_mirror_not_eligible',
        'Account mirror chatgpt/default is delayed: minimum-interval.',
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          reason: 'minimum-interval',
          eligibleAt: '2026-04-30T12:01:00.000Z',
        },
      ))
      .mockResolvedValueOnce(createRefreshResult());
    const sleep = vi.fn(async () => {});
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      generateId: () => 'acctmirror_completion_delayed',
      sleep,
    });

    service.start({ maxPasses: 3 });

    await waitFor(() => service.read('acctmirror_completion_delayed')?.status === 'completed');

    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(requestRefresh).toHaveBeenCalledTimes(2);
    expect(service.read('acctmirror_completion_delayed')).toMatchObject({
      status: 'completed',
      passCount: 1,
      nextAttemptAt: null,
    });
  });

  test('forces a verification refresh even when persisted status already says complete', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
    });
    registry.mergeState(
      { provider: 'chatgpt', runtimeProfileId: 'default' },
      {
        detectedIdentityKey: 'ecochran76@gmail.com',
        metadataCounts: {
          projects: 1,
          conversations: 76,
          artifacts: 0,
          files: 0,
          media: 0,
        },
        metadataEvidence: {
          identitySource: 'profile-menu',
          projectSampleIds: [],
          conversationSampleIds: [],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
        lastSuccessAtMs: Date.parse('2026-04-30T11:00:00.000Z'),
        lastRefreshRequestId: 'acctmirror_previous',
      },
    );
    const service = createAccountMirrorCompletionService({
      registry,
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      generateId: () => 'acctmirror_completion_verification',
    });

    service.start({ maxPasses: 3 });

    await waitFor(() => service.read('acctmirror_completion_verification')?.status === 'completed');

    expect(requestRefresh).toHaveBeenCalledTimes(1);
    expect(service.read('acctmirror_completion_verification')).toMatchObject({
      status: 'completed',
      passCount: 1,
      lastRefresh: {
        requestId: 'acctmirror_refresh_1',
      },
    });
  });

  test('starts nonblocking and records completion after refresh finishes', async () => {
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      generateId: () => 'acctmirror_completion_test',
    });

    const started = service.start({ maxPasses: 3 });

    expect(started).toMatchObject({
      id: 'acctmirror_completion_test',
      status: 'queued',
      maxPasses: 3,
    });

    await waitFor(() => service.read('acctmirror_completion_test')?.status === 'completed');

    expect(requestRefresh).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
      queueTimeoutMs: 0,
    });
    expect(service.read('acctmirror_completion_test')).toMatchObject({
      status: 'completed',
      passCount: 1,
      mirrorCompleteness: {
        state: 'complete',
      },
    });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for predicate');
}
