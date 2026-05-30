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
  test('starts one live-follow completion for each enabled configured account', async () => {
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
      enabledTargets: 3,
      started: 3,
      existing: 0,
      skipped: 0,
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
    expect(start).toHaveBeenCalledWith({
      provider: 'gemini',
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

  test('upgrades an active metadata-only completion when configured live follow asks for full retrieval', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: {
                  enabled: true,
                  sweepMode: 'full_sweep',
                  materializationPolicy: 'full_missing_assets',
                  materializationAssetKinds: ['all'],
                  materializationMaxItems: 25,
                  materializationRefreshSnapshot: true,
                },
              },
            },
          },
        },
      },
    });
    const active = {
      ...baseOperation,
      sweepMode: 'steady_follow' as const,
      materializationPolicy: 'metadata_only' as const,
      materializationAssetKinds: ['all' as const],
      materializationMaxItems: null,
      materializationRefreshSnapshot: false,
    };
    const upgraded = {
      ...active,
      mode: 'live_follow' as const,
      status: 'running' as const,
      sweepMode: 'full_sweep' as const,
      materializationPolicy: 'full_missing_assets' as const,
      materializationMaxItems: 25,
      materializationRefreshSnapshot: true,
    };
    const start = vi.fn();
    const upgradePolicy = vi.fn(() => upgraded);

    const result = await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list: vi.fn(() => [active]),
        read: vi.fn(),
        control: vi.fn(),
        upgradePolicy,
      },
    });

    expect(start).not.toHaveBeenCalled();
    expect(upgradePolicy).toHaveBeenCalledWith({
      id: 'acctmirror_completion_existing',
      maxPasses: null,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['all'],
      materializationMaxItems: 25,
      materializationRefreshSnapshot: true,
    });
    expect(result.metrics).toMatchObject({
      enabledTargets: 1,
      started: 0,
      existing: 1,
      upgraded: 1,
    });
    expect(result.existing[0]).toMatchObject({
      id: 'acctmirror_completion_existing',
      mode: 'live_follow',
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
    });
  });

  test('does not duplicate an active bounded campaign completion for the same target', async () => {
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
    const boundedCampaignOperation = {
      ...baseOperation,
      id: 'acctmirror_completion_campaign_claim',
      mode: 'bounded' as const,
      sweepMode: 'full_sweep' as const,
      maxPasses: 2,
      materializationPolicy: 'full_missing_assets' as const,
      materializationAssetKinds: ['all' as const],
      materializationRefreshSnapshot: true,
    };

    const result = await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list: vi.fn(() => [boundedCampaignOperation]),
        read: vi.fn(),
        control: vi.fn(),
      },
    });

    expect(result.metrics).toMatchObject({
      enabledTargets: 1,
      started: 0,
      existing: 1,
    });
    expect(result.existing[0]).toMatchObject({
      id: 'acctmirror_completion_campaign_claim',
      mode: 'bounded',
    });
    expect(start).not.toHaveBeenCalled();
  });

  test('starts configured full-sweep live follow with materialization policy', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              gemini: {
                identity: { email: 'operator@example.com' },
                liveFollow: {
                  enabled: true,
                  sweepMode: 'full_sweep',
                  materializationPolicy: 'full_missing_assets',
                  materializationAssetKinds: ['media'],
                  materializationMaxItems: 10,
                  materializationRefreshSnapshot: true,
                  materializationForce: false,
                },
              },
            },
          },
        },
      },
    });
    const start = vi.fn((request) => ({
      ...baseOperation,
      id: 'completion_full_sweep',
      provider: request.provider ?? 'chatgpt',
      runtimeProfileId: request.runtimeProfileId ?? 'default',
    }));

    await reconcileConfiguredAccountMirrorLiveFollow({
      registry,
      completionService: {
        start,
        list: vi.fn(() => []),
        read: vi.fn(),
        control: vi.fn(),
      },
    });

    expect(start).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'default',
      maxPasses: null,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 10,
      materializationRefreshSnapshot: true,
      materializationForce: false,
    });
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
