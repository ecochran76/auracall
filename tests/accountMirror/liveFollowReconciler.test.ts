import { describe, expect, test, vi } from 'vitest';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';
import { reconcileConfiguredAccountMirrorLiveFollow } from '../../src/accountMirror/liveFollowReconciler.js';
import type { AccountMirrorCompletionOperation } from '../../src/accountMirror/completionService.js';

const baseOperation: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_completion_existing',
  provider: 'chatgpt',
  runtimeProfileId: 'default',
  mode: 'live_follow',
  phase: 'backfill_history',
  status: 'running',
  startedAt: '2026-05-02T12:00:00.000Z',
  completedAt: null,
  nextAttemptAt: null,
  maxPasses: null,
  passCount: 0,
  lastRefresh: null,
  mirrorCompleteness: null,
  error: null,
};

describe('account mirror live-follow reconciler', () => {
  test('starts one live-follow completion for each enabled configured ChatGPT account', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: { enabled: true },
              },
            },
          },
          consult: {
            browserProfile: 'wsl-chrome-2',
            services: {
              chatgpt: {
                identity: { email: 'consult@example.com' },
                liveFollow: { enabled: true },
              },
              gemini: {
                identity: { email: 'consult@example.com' },
                liveFollow: { enabled: true },
              },
            },
          },
        },
      },
      now: () => new Date('2026-05-02T12:00:00.000Z'),
    });
    const start = vi.fn((request) => ({
      ...baseOperation,
      id: `completion_${request.runtimeProfileId}`,
      runtimeProfileId: request.runtimeProfileId ?? 'default',
    }));
    const list = vi.fn(() => []);

    const result = await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list,
        read: vi.fn(),
        control: vi.fn(),
      },
    });

    expect(result.metrics).toMatchObject({
      enabledTargets: 2,
      started: 2,
      existing: 0,
      skipped: 1,
    });
    expect(start).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      maxPasses: null,
    });
    expect(start).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'consult',
      maxPasses: null,
    });
  });

  test('does not duplicate an active live-follow completion', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: { enabled: true },
              },
            },
          },
        },
      },
    });
    const start = vi.fn();

    const result = await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list: vi.fn(() => [baseOperation]),
        read: vi.fn(),
        control: vi.fn(),
      },
    });

    expect(result.metrics).toMatchObject({
      enabledTargets: 1,
      started: 0,
      existing: 1,
    });
    expect(start).not.toHaveBeenCalled();
  });

  test('does not start enabled live follow when the account status is blocked', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          unbound: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                liveFollow: { enabled: true },
              },
            },
          },
        },
      },
    });
    const start = vi.fn();

    const result = await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list: vi.fn(() => []),
        read: vi.fn(),
        control: vi.fn(),
      },
    });

    expect(result.metrics).toMatchObject({
      enabledTargets: 0,
      started: 0,
      skipped: 1,
    });
    expect(result.skipped[0]).toMatchObject({
      provider: 'chatgpt',
      runtimeProfileId: 'unbound',
      reason: 'liveFollow.enabled is true but the service has no bound identity',
    });
    expect(start).not.toHaveBeenCalled();
  });
});
