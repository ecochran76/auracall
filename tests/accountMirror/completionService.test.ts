import { describe, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountMirrorCompletionService } from '../../src/accountMirror/completionService.js';
import {
  AccountMirrorRefreshError,
  type AccountMirrorRefreshResult,
} from '../../src/accountMirror/refreshService.js';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';
import { createAccountMirrorCompletionStore } from '../../src/accountMirror/completionStore.js';

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
  test('persists operation state for restart readback', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-completion-store-'));
    try {
      const store = createAccountMirrorCompletionStore({
        config: {
          browser: {
            cache: {
              rootDir: tmp,
            },
          },
        },
      });
      const requestRefresh = vi.fn(async () => createRefreshResult());
      const service = createAccountMirrorCompletionService({
        registry: createAccountMirrorStatusRegistry({
          config,
          now: () => new Date('2026-04-30T12:00:00.000Z'),
        }),
        refreshService: {
          requestRefresh,
        },
        store,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
        generateId: () => 'acctmirror_persisted',
      });

      service.start({ maxPasses: 3 });

      await waitFor(async () => (await store.readOperation('acctmirror_persisted'))?.status === 'completed');

      expect(await store.readOperation('acctmirror_persisted')).toMatchObject({
        id: 'acctmirror_persisted',
        status: 'completed',
        mode: 'bounded',
        passCount: 1,
      });
      expect(await store.listOperations({ activeOnly: false, limit: null })).toHaveLength(1);
      expect(await store.listOperations({ activeOnly: true, limit: null })).toHaveLength(0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test('hydrates active cooldown operations without refreshing before eligible time', async () => {
    const initial = {
      object: 'account_mirror_completion' as const,
      id: 'acctmirror_hydrated',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      mode: 'live_follow' as const,
      phase: 'steady_follow' as const,
      status: 'running' as const,
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: createRefreshResult(),
      mirrorCompleteness: completeMirror,
      error: null,
    };
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const sleep = vi.fn(() => new Promise<void>(() => {}));

    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      initialOperations: [initial],
      resumeActiveOperations: true,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      sleep,
    });

    await waitFor(() => sleep.mock.calls.length > 0);

    expect(service.read('acctmirror_hydrated')).toMatchObject({
      status: 'running',
      phase: 'steady_follow',
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      passCount: 1,
    });
    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(requestRefresh).not.toHaveBeenCalled();
  });

  test('lists persisted and active operations with filters', async () => {
    const active = {
      object: 'account_mirror_completion' as const,
      id: 'acctmirror_active',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      mode: 'live_follow' as const,
      phase: 'steady_follow' as const,
      status: 'running' as const,
      startedAt: '2026-04-30T12:10:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:20:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: createRefreshResult(),
      mirrorCompleteness: completeMirror,
      error: null,
    };
    const completed = {
      ...active,
      id: 'acctmirror_completed',
      status: 'completed' as const,
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: '2026-04-30T12:01:00.000Z',
      nextAttemptAt: null,
      maxPasses: 3,
      mode: 'bounded' as const,
    };
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh: vi.fn(async () => createRefreshResult()),
      },
      initialOperations: [completed, active],
      resumeActiveOperations: false,
      sleep,
    });

    expect(service.list().map((operation) => operation.id)).toEqual([
      'acctmirror_active',
      'acctmirror_completed',
    ]);
    expect(service.list({ status: 'active' }).map((operation) => operation.id)).toEqual([
      'acctmirror_active',
    ]);
    expect(service.list({ status: 'completed' }).map((operation) => operation.id)).toEqual([
      'acctmirror_completed',
    ]);
    expect(service.list({ provider: 'gemini' })).toEqual([]);
    expect(service.list({ limit: 1 })).toHaveLength(1);
  });

  test('pauses, resumes, and cancels live-follow operations', async () => {
    let resolveRefresh: (value: AccountMirrorRefreshResult) => void = () => undefined;
    const requestRefresh = vi.fn(() => new Promise<AccountMirrorRefreshResult>((resolve) => {
      resolveRefresh = resolve;
    }));
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      generateId: () => 'acctmirror_control',
    });

    service.start();
    await waitFor(() => service.read('acctmirror_control')?.status === 'running');

    expect(service.control({ id: 'acctmirror_control', action: 'pause' })).toMatchObject({
      id: 'acctmirror_control',
      status: 'paused',
    });
    expect(service.list({ status: 'active' }).map((operation) => operation.id)).toEqual([
      'acctmirror_control',
    ]);

    resolveRefresh(createRefreshResult());
    await waitFor(() => service.read('acctmirror_control')?.status === 'paused');
    expect(service.read('acctmirror_control')).toMatchObject({
      status: 'paused',
      passCount: 1,
      phase: 'steady_follow',
      mirrorCompleteness: completeMirror,
      lastRefresh: {
        requestId: 'acctmirror_refresh_1',
        status: 'completed',
      },
    });

    expect(service.control({ id: 'acctmirror_control', action: 'resume' })).toMatchObject({
      status: 'queued',
    });
    await waitFor(() => service.read('acctmirror_control')?.status === 'running');
    expect(requestRefresh).toHaveBeenCalledTimes(2);

    expect(service.control({ id: 'acctmirror_control', action: 'cancel' })).toMatchObject({
      status: 'cancelled',
      completedAt: '2026-04-30T12:00:00.000Z',
    });
    expect(service.control({ id: 'missing', action: 'pause' })).toBeNull();
  });

  test('defaults to live follow and keeps running after a complete refresh', async () => {
    const requestRefresh = vi.fn()
      .mockResolvedValueOnce(createRefreshResult())
      .mockRejectedValue(new AccountMirrorRefreshError(
        409,
        'account_mirror_not_eligible',
        'Account mirror chatgpt/default is delayed: minimum-interval.',
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          reason: 'minimum-interval',
          eligibleAt: '2026-04-30T12:10:00.000Z',
        },
      ));
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      generateId: () => 'acctmirror_live_follow',
      sleep,
    });

    const started = service.start();

    expect(started).toMatchObject({
      mode: 'live_follow',
      phase: 'backfill_history',
      maxPasses: null,
    });

    await waitFor(() => service.read('acctmirror_live_follow')?.nextAttemptAt === '2026-04-30T12:10:00.000Z');

    expect(requestRefresh).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(service.read('acctmirror_live_follow')).toMatchObject({
      status: 'running',
      mode: 'live_follow',
      phase: 'steady_follow',
      passCount: 1,
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
    });
  });

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
    let nowMs = Date.parse('2026-04-30T12:00:00.000Z');
    const sleep = vi.fn((ms: number) => {
      if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
      nowMs += ms;
      return Promise.resolve();
    });
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date(nowMs),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date(nowMs),
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

  test('live follow wakes from cooldown and continues without operator resume', async () => {
    const firstEligibleAt = '2026-04-30T12:01:00.000Z';
    const secondEligibleAt = '2026-04-30T12:11:00.000Z';
    let sleepCount = 0;
    let nowMs = Date.parse('2026-04-30T12:00:00.000Z');
    const requestRefresh = vi.fn()
      .mockRejectedValueOnce(new AccountMirrorRefreshError(
        409,
        'account_mirror_not_eligible',
        'Account mirror chatgpt/default is delayed: minimum-interval.',
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          reason: 'minimum-interval',
          eligibleAt: firstEligibleAt,
        },
      ))
      .mockResolvedValueOnce(createRefreshResult())
      .mockRejectedValueOnce(new AccountMirrorRefreshError(
        409,
        'account_mirror_not_eligible',
        'Account mirror chatgpt/default is delayed: minimum-interval.',
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          reason: 'minimum-interval',
          eligibleAt: secondEligibleAt,
        },
      ));
    const sleep = vi.fn((ms: number) => {
      sleepCount += 1;
      nowMs += ms;
      return sleepCount === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date(nowMs),
      }),
      refreshService: {
        requestRefresh,
      },
      now: () => new Date(nowMs),
      generateId: () => 'acctmirror_live_follow_cadence',
      sleep,
    });

    service.start();

    await waitFor(() => service.read('acctmirror_live_follow_cadence')?.passCount === 1);
    await waitFor(() => service.read('acctmirror_live_follow_cadence')?.nextAttemptAt === secondEligibleAt);

    expect(requestRefresh).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 60_000);
    expect(service.read('acctmirror_live_follow_cadence')).toMatchObject({
      status: 'running',
      mode: 'live_follow',
      passCount: 1,
      lastRefresh: {
        requestId: 'acctmirror_refresh_1',
      },
      nextAttemptAt: secondEligibleAt,
    });
  });

  test('rechecks persisted cooldowns in bounded slices after restart', async () => {
    let nowMs = Date.parse('2026-04-30T12:00:00.000Z');
    const initial = {
      object: 'account_mirror_completion' as const,
      id: 'acctmirror_restart_slice',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      mode: 'live_follow' as const,
      phase: 'backfill_history' as const,
      status: 'running' as const,
      startedAt: '2026-04-30T11:55:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:03:00.000Z',
      maxPasses: null,
      passCount: 4,
      lastRefresh: createRefreshResult(),
      mirrorCompleteness: {
        ...completeMirror,
        state: 'in_progress' as const,
        remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
      },
      error: null,
    };
    const requestRefresh = vi.fn()
      .mockResolvedValueOnce(createRefreshResult())
      .mockRejectedValue(new AccountMirrorRefreshError(
        409,
        'account_mirror_not_eligible',
        'Account mirror chatgpt/default is delayed: minimum-interval.',
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          reason: 'minimum-interval',
          eligibleAt: '2026-04-30T12:13:00.000Z',
        },
      ));
    const sleep = vi.fn((ms: number) => {
      if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
      nowMs += ms;
      return Promise.resolve();
    });
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date(nowMs),
      }),
      refreshService: {
        requestRefresh,
      },
      initialOperations: [initial],
      resumeActiveOperations: true,
      now: () => new Date(nowMs),
      sleep,
    });

    await waitFor(() => service.read('acctmirror_restart_slice')?.passCount === 5);

    expect(sleep.mock.calls.slice(0, 3).map(([ms]) => ms)).toEqual([60_000, 60_000, 60_000]);
    await waitFor(() => service.read('acctmirror_restart_slice')?.nextAttemptAt === '2026-04-30T12:13:00.000Z');
    expect(requestRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(service.read('acctmirror_restart_slice')).toMatchObject({
      status: 'running',
      nextAttemptAt: '2026-04-30T12:13:00.000Z',
      passCount: 5,
      phase: 'steady_follow',
    });
  });

  test('parks runnable operations for restart instead of cancelling them', async () => {
    const running = {
      object: 'account_mirror_completion' as const,
      id: 'acctmirror_shutdown_running',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      mode: 'live_follow' as const,
      phase: 'steady_follow' as const,
      status: 'running' as const,
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: createRefreshResult(),
      mirrorCompleteness: completeMirror,
      error: null,
    };
    const paused = {
      ...running,
      id: 'acctmirror_shutdown_paused',
      status: 'paused' as const,
      startedAt: '2026-04-30T11:59:00.000Z',
    };
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh: vi.fn(async () => createRefreshResult()),
      },
      initialOperations: [running, paused],
      resumeActiveOperations: false,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
    });

    expect(service.prepareForShutdown?.().map((operation) => operation.id)).toEqual([
      'acctmirror_shutdown_running',
    ]);

    expect(service.read('acctmirror_shutdown_running')).toMatchObject({
      status: 'queued',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
    });
    expect(service.read('acctmirror_shutdown_paused')).toMatchObject({
      status: 'paused',
    });
  });

  test('wakes cooldown sleeps during shutdown parking', async () => {
    const initial = {
      object: 'account_mirror_completion' as const,
      id: 'acctmirror_shutdown_sleep',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      mode: 'live_follow' as const,
      phase: 'steady_follow' as const,
      status: 'running' as const,
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: createRefreshResult(),
      mirrorCompleteness: completeMirror,
      error: null,
    };
    let sleepStarted = false;
    let sleepSettled = false;
    const sleep = vi.fn(async () => {
      sleepStarted = true;
      await new Promise<void>(() => {});
      sleepSettled = true;
    });
    const requestRefresh = vi.fn(async () => createRefreshResult());
    const service = createAccountMirrorCompletionService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      }),
      refreshService: {
        requestRefresh,
      },
      initialOperations: [initial],
      resumeActiveOperations: true,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      sleep,
    });

    await waitFor(() => sleepStarted);
    service.prepareForShutdown?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.read('acctmirror_shutdown_sleep')).toMatchObject({
      status: 'queued',
    });
    expect(sleepSettled).toBe(false);
    expect(requestRefresh).not.toHaveBeenCalled();
  });

  test('persists parked shutdown operations for restart resume', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-completion-shutdown-'));
    try {
      const store = createAccountMirrorCompletionStore({
        config: {
          browser: {
            cache: {
              rootDir: tmp,
            },
          },
        },
      });
      const running = {
        object: 'account_mirror_completion' as const,
        id: 'acctmirror_shutdown_persisted',
        provider: 'chatgpt' as const,
        runtimeProfileId: 'default',
        mode: 'live_follow' as const,
        phase: 'steady_follow' as const,
        status: 'running' as const,
        startedAt: '2026-04-30T12:00:00.000Z',
        completedAt: null,
        nextAttemptAt: '2026-04-30T12:10:00.000Z',
        maxPasses: null,
        passCount: 1,
        lastRefresh: createRefreshResult(),
        mirrorCompleteness: completeMirror,
        error: null,
      };
      const service = createAccountMirrorCompletionService({
        registry: createAccountMirrorStatusRegistry({
          config,
          now: () => new Date('2026-04-30T12:00:00.000Z'),
        }),
        refreshService: {
          requestRefresh: vi.fn(async () => createRefreshResult()),
        },
        store,
        initialOperations: [running],
        resumeActiveOperations: false,
        now: () => new Date('2026-04-30T12:00:00.000Z'),
      });

      service.prepareForShutdown?.();

      await waitFor(async () => (await store.readOperation('acctmirror_shutdown_persisted'))?.status === 'queued');
      expect(await store.readOperation('acctmirror_shutdown_persisted')).toMatchObject({
        status: 'queued',
        completedAt: null,
        nextAttemptAt: '2026-04-30T12:10:00.000Z',
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
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
      mode: 'bounded',
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

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for predicate');
}
