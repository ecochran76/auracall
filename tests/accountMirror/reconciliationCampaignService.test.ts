import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  createAccountMirrorReconciliationCampaignService,
} from '../../src/accountMirror/reconciliationCampaignService.js';
import { createAccountMirrorReconciliationCampaignStore } from '../../src/accountMirror/reconciliationCampaignStore.js';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';
import type {
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
} from '../../src/accountMirror/completionService.js';

const config = {
  runtimeProfiles: {
    default: {
      browserProfile: 'default',
      services: {
        chatgpt: {
          identity: { email: 'operator@example.com', accountLevel: 'Business' },
          liveFollow: { enabled: true },
        },
        gemini: {
          identity: { email: 'operator@example.com' },
          liveFollow: { enabled: true },
        },
      },
    },
    active: {
      browserProfile: 'wsl-chrome-2',
      services: {
        chatgpt: {
          identity: { email: 'active@example.com' },
          liveFollow: { enabled: true },
        },
      },
    },
    disabled: {
      browserProfile: 'default',
      services: {
        grok: {
          identity: { email: 'disabled@example.com' },
          liveFollow: { enabled: false },
        },
      },
    },
    unbound: {
      browserProfile: 'default',
      services: {
        chatgpt: {
          liveFollow: { enabled: true },
        },
      },
    },
  },
};

describe('account mirror reconciliation campaign service', () => {
  test('dry-run classifies configured targets without starting browser work', async () => {
    const start = vi.fn(() => {
      throw new Error('dry-run must not start child completions');
    });
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      initialState: {
        'gemini:default': {
          detectedIdentityKey: 'operator@example.com',
          providerGuard: {
            state: 'manual_clear_required',
            kind: 'google-sorry',
            summary: 'Google unusual-traffic interstitial detected.',
            detectedAtMs: Date.parse('2026-05-24T11:55:00.000Z'),
          },
        },
      },
    });
    const completionService = {
      start,
      read: vi.fn(() => null),
      list: vi.fn(() => [activeCompletion()]),
      control: vi.fn(() => null),
    } satisfies AccountMirrorCompletionService;
    const readStatus = vi.spyOn(registry, 'readStatus');
    const service = createAccountMirrorReconciliationCampaignService({
      registry,
      completionService,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_test',
    });

    const campaign = await service.create({
      dryRun: true,
      maxTargets: 1,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['artifacts', 'media'],
      materializationMaxItems: 10,
    });

    expect(start).not.toHaveBeenCalled();
    expect(readStatus).toHaveBeenCalledWith(expect.objectContaining({
      explicitRefresh: true,
      ignoreMinimumInterval: true,
    }));
    expect(campaign).toMatchObject({
      object: 'account_mirror_reconciliation_campaign',
      id: 'acctmirror_reconciliation_test',
      dryRun: true,
      status: 'planned',
      metrics: {
        totalTargets: 5,
        selectedTargets: 1,
        targetStates: expect.objectContaining({
          eligible: 1,
          already_active: 1,
          provider_guard: 1,
          disabled: 1,
          missing_identity: 1,
        }),
      },
    });
    expect(campaign.targets.find((target) => target.key === 'chatgpt:default')).toMatchObject({
      tenantKey: 'service-account:chatgpt:operator@example.com',
      bindingKey: 'binding:chatgpt:default:default',
      state: 'eligible',
      selected: true,
      policy: {
        sweepMode: 'full_sweep',
        materializationPolicy: 'full_missing_assets',
        materializationAssetKinds: ['artifacts', 'media'],
        materializationMaxItems: 10,
      },
    });
    expect(campaign.targets.find((target) => target.key === 'chatgpt:active')).toMatchObject({
      tenantKey: 'service-account:chatgpt:active@example.com',
      bindingKey: 'binding:chatgpt:active:wsl-chrome-2',
      state: 'already_active',
      selected: false,
      activeCompletionId: 'acctmirror_completion_active',
    });
    expect(campaign.targets.find((target) => target.key === 'gemini:default')).toMatchObject({
      tenantKey: 'service-account:gemini:operator@example.com',
      bindingKey: 'binding:gemini:default:default',
      state: 'provider_guard',
      selected: false,
    });
    expect(campaign.targets.find((target) => target.key === 'grok:disabled')).toMatchObject({
      state: 'disabled',
      selected: false,
    });
    expect(campaign.targets.find((target) => target.key === 'chatgpt:unbound')).toMatchObject({
      state: 'missing_identity',
      selected: false,
    });
  });

  test('execution starts bounded full-sweep completions and attaches already-active targets', async () => {
    const started: AccountMirrorCompletionOperation[] = [];
    const start = vi.fn((request) => {
      const operation = {
        ...activeCompletion(),
        id: `acctmirror_completion_started_${request.provider}_${request.runtimeProfileId}`,
        provider: request.provider,
        runtimeProfileId: request.runtimeProfileId,
        status: 'queued',
        materializationPolicy: request.materializationPolicy,
        materializationAssetKinds: request.materializationAssetKinds,
        materializationMaxItems: request.materializationMaxItems,
        materializationRefreshSnapshot: request.materializationRefreshSnapshot,
      } satisfies AccountMirrorCompletionOperation;
      started.push(operation);
      return operation;
    });
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
    });
    const completionService = {
      start,
      read: vi.fn((id: string) => [...started, activeCompletion()].find((operation) => operation.id === id) ?? null),
      list: vi.fn(() => [activeCompletion()]),
      control: vi.fn(() => null),
    } satisfies AccountMirrorCompletionService;
    const service = createAccountMirrorReconciliationCampaignService({
      registry,
      completionService,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_execute',
    });

    const campaign = await service.create({
      dryRun: false,
      maxTargets: 3,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['all'],
      materializationMaxItems: 2,
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'default',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['all'],
      materializationMaxItems: 2,
      materializationRefreshSnapshot: true,
    });
    expect(campaign).toMatchObject({
      dryRun: false,
      status: 'running',
      metrics: {
        selectedTargets: 3,
      },
    });
    expect(campaign.targets.find((target) => target.key === 'chatgpt:active')).toMatchObject({
      state: 'already_active',
      selected: true,
      childOperations: {
        completionId: 'acctmirror_completion_active',
      },
      execution: {
        status: 'running',
      },
    });
    expect(campaign.targets.find((target) => target.key === 'gemini:default')).toMatchObject({
      state: 'eligible',
      selected: true,
      childOperations: {
        completionId: 'acctmirror_completion_started_gemini_default',
      },
      execution: {
        status: 'queued',
      },
    });
    expect(campaign.targets.find((target) => target.key === 'chatgpt:default')).toMatchObject({
      selected: true,
      execution: {
        status: 'deferred',
        reason: 'Deferred by provider concurrency budget.',
      },
    });
  });

  test('execution claims non-matching active live-follow completions for campaign policy', async () => {
    let operation: AccountMirrorCompletionOperation = {
      ...activeCompletion(),
      id: 'acctmirror_completion_metadata_live_follow',
      mode: 'live_follow',
      sweepMode: 'steady_follow',
      status: 'idle_waiting',
      nextAttemptAt: '2026-05-24T12:10:00.000Z',
      maxPasses: null,
      passCount: 4,
      materializationPolicy: 'metadata_only',
      materializationAssetKinds: ['all'],
      materializationMaxItems: null,
      materializationRefreshSnapshot: false,
      materializationCursor: null,
    };
    const upgradePolicy = vi.fn((request) => {
      operation = {
        ...operation,
        mode: 'bounded',
        sweepMode: request.sweepMode ?? 'steady_follow',
        status: 'running',
        nextAttemptAt: null,
        maxPasses: operation.passCount + (request.maxPasses ?? 1),
        materializationPolicy: request.materializationPolicy ?? 'metadata_only',
        materializationAssetKinds: request.materializationAssetKinds ?? ['all'],
        materializationMaxItems: request.materializationMaxItems ?? null,
        materializationRefreshSnapshot: request.materializationRefreshSnapshot === true,
      };
      return operation;
    });
    const completionService = {
      start: vi.fn(() => {
        throw new Error('campaign claim must not start a duplicate completion');
      }),
      read: vi.fn((id: string) => id === operation.id ? operation : null),
      list: vi.fn(() => [operation]),
      control: vi.fn(() => null),
      upgradePolicy,
    } satisfies AccountMirrorCompletionService;
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_claim',
    });

    const campaign = await service.create({
      dryRun: false,
      provider: 'chatgpt',
      runtimeProfileId: 'active',
      maxTargets: 1,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 2,
    });

    expect(completionService.start).not.toHaveBeenCalled();
    expect(upgradePolicy).toHaveBeenCalledWith({
      id: 'acctmirror_completion_metadata_live_follow',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 2,
      materializationRefreshSnapshot: true,
    });
    expect(campaign).toMatchObject({
      status: 'running',
      targets: expect.arrayContaining([
        expect.objectContaining({
          key: 'chatgpt:active',
          state: 'already_active',
          selected: true,
          childOperations: expect.objectContaining({
            completionId: 'acctmirror_completion_metadata_live_follow',
          }),
          execution: expect.objectContaining({
            status: 'running',
            completionStatus: 'running',
            passCount: 4,
          }),
        }),
      ]),
    });
  });

  test('run_next_pass starts deferred targets after active child capacity frees', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-next-pass-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    const twoTargetConfig = {
      runtimeProfiles: {
        chat: {
          browserProfile: 'profile-chat',
          services: {
            chatgpt: {
              identity: { email: 'chat@example.com' },
              liveFollow: { enabled: true },
            },
          },
        },
        gem: {
          browserProfile: 'profile-gem',
          services: {
            gemini: {
              identity: { email: 'gem@example.com' },
              liveFollow: { enabled: true },
            },
          },
        },
      },
    };
    const operations = new Map<string, AccountMirrorCompletionOperation>();
    const start = vi.fn((request) => {
      const provider = request.provider ?? 'chatgpt';
      const runtimeProfileId = request.runtimeProfileId ?? 'default';
      const operation = {
        ...activeCompletion(),
        id: `acctmirror_completion_${provider}_${runtimeProfileId}`,
        provider,
        runtimeProfileId,
        status: 'queued',
      } satisfies AccountMirrorCompletionOperation;
      operations.set(operation.id, operation);
      return operation;
    });
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config: twoTargetConfig,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService: {
        start,
        read: vi.fn((id: string) => operations.get(id) ?? null),
        list: vi.fn(() => Array.from(operations.values()).filter((operation) =>
          operation.status === 'queued' ||
          operation.status === 'running' ||
          operation.status === 'idle_waiting' ||
          operation.status === 'paused'
        )),
        control: vi.fn(() => null),
      } satisfies AccountMirrorCompletionService,
      store,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_next_pass',
    });

    const created = await service.create({
      dryRun: false,
      maxTargets: 2,
      maxActiveTargets: 1,
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(created.targets.filter((target) => target.execution.status === 'deferred')).toHaveLength(1);
    for (const [id, operation] of operations) {
      operations.set(id, {
        ...operation,
        status: 'completed',
        completedAt: '2026-05-24T12:01:00.000Z',
        passCount: 1,
      });
    }

    const advanced = await service.control({
      id: 'acctmirror_reconciliation_next_pass',
      action: 'run_next_pass',
    });

    expect(start).toHaveBeenCalledTimes(2);
    expect(advanced).toMatchObject({
      status: 'running',
      targets: expect.arrayContaining([
        expect.objectContaining({
          execution: expect.objectContaining({
            status: 'queued',
          }),
        }),
      ]),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'operator_run_next_pass',
        }),
      ]),
    });
  });

  test('keeps campaign running while selected materialization job is active', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-active-materialization-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    let operation: AccountMirrorCompletionOperation = {
      ...activeCompletion(),
      id: 'acctmirror_completion_active_materialization',
      provider: 'chatgpt',
      runtimeProfileId: 'active',
      status: 'running',
    };
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService: {
        start: vi.fn(() => {
          throw new Error('active materialization test must attach, not start');
        }),
        read: vi.fn((id: string) => id === operation.id ? operation : null),
        list: vi.fn(() => operation.status === 'running' ? [operation] : []),
        control: vi.fn(() => null),
      } satisfies AccountMirrorCompletionService,
      materializationJobReader: {
        readJob: vi.fn(async () => ({
          object: 'history_materialization_job',
          id: 'hmj_active_materialization',
          status: 'running',
          result: null,
        })),
      },
      store,
      now: () => new Date('2026-05-24T12:01:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_active_materialization',
    });

    await service.create({
      dryRun: false,
      provider: 'chatgpt',
      runtimeProfileId: 'active',
      maxTargets: 1,
    });
    operation = {
      ...operation,
      status: 'completed',
      completedAt: '2026-05-24T12:00:30.000Z',
      passCount: 1,
      materializationCursor: {
        jobId: 'hmj_active_materialization',
        jobStatus: 'running',
        reused: false,
        requestedAt: '2026-05-24T12:00:20.000Z',
        passCount: 1,
        request: {
          provider: 'chatgpt',
          runtimeProfile: 'active',
          reconcile: true,
          refreshSnapshot: true,
          assetKinds: ['all'],
          maxItems: null,
          force: false,
        },
      },
    };

    const refreshed = await service.read('acctmirror_reconciliation_active_materialization');

    expect(refreshed).toMatchObject({
      status: 'running',
      completedAt: null,
      metrics: {
        materialization: {
          jobs: 1,
          activeJobs: 1,
          terminalJobs: 0,
        },
      },
      targets: expect.arrayContaining([
        expect.objectContaining({
          selected: true,
          execution: expect.objectContaining({
            status: 'completed',
            materializationJobStatus: 'running',
          }),
        }),
      ]),
    });
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('status readback hydrates child completion state after service restart', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-hydrate-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    const queuedOperation = {
      ...activeCompletion(),
      id: 'acctmirror_completion_restart_child',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      status: 'queued',
    } satisfies AccountMirrorCompletionOperation;
    const createService = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService: {
        start: vi.fn(() => queuedOperation),
        read: vi.fn((id: string) => id === queuedOperation.id ? queuedOperation : null),
        list: vi.fn(() => []),
        control: vi.fn(() => null),
      } satisfies AccountMirrorCompletionService,
      store,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_hydrate',
    });
    const created = await createService.create({
      dryRun: false,
      provider: 'chatgpt',
      runtimeProfileId: 'default',
    });
    expect(created.status).toBe('running');

    const completedOperation = {
      ...queuedOperation,
      status: 'completed',
      completedAt: '2026-05-24T12:01:00.000Z',
      passCount: 1,
      materializationCursor: {
        jobId: 'hmj_restart_child',
        jobStatus: 'succeeded',
        reused: false,
        requestedAt: '2026-05-24T12:00:30.000Z',
        passCount: 1,
        request: {
          provider: 'chatgpt',
          runtimeProfile: 'default',
          reconcile: true,
          refreshSnapshot: true,
          assetKinds: ['all'],
          maxItems: null,
          force: false,
        },
      },
    } satisfies AccountMirrorCompletionOperation;
    const restartService = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:02:00.000Z'),
      }),
      completionService: {
        start: vi.fn(() => {
          throw new Error('hydration must not duplicate child completions');
        }),
        read: vi.fn((id: string) => id === completedOperation.id ? completedOperation : null),
        list: vi.fn(() => []),
        control: vi.fn(() => null),
      } satisfies AccountMirrorCompletionService,
      materializationJobReader: {
        readJob: vi.fn(async (id: string) => id === 'hmj_restart_child'
          ? {
              object: 'history_materialization_job',
              id: 'hmj_restart_child',
              status: 'succeeded',
              result: {
                target: null,
                metrics: {
                  conversations: 1,
                  materialized: 1,
                  skipped: 1,
                  failed: 0,
                },
                entries: [
                  {
                    kind: 'media',
                    providerId: 'media_restart_1',
                    title: 'Cached image',
                    status: 'materialized',
                    cacheKey: 'sha256:abc123',
                    checksumSha256: 'abc123',
                    archiveItemId: 'archive_asset_1',
                    assetRoute: '/v1/archive/items/archive_asset_1/asset',
                  },
                  {
                    kind: 'artifact',
                    providerId: 'artifact_restart_skipped',
                    title: 'Skipped artifact',
                    status: 'skipped',
                  },
                ],
                archiveItems: [
                  {
                    id: 'archive_asset_1',
                    kind: 'image',
                    title: 'Cached image',
                    status: 'materialized',
                    artifactId: 'media_restart_1',
                    providerConversationId: 'conv_restart_child',
                    boundIdentityKey: 'operator@example.com',
                    cacheKey: 'sha256:abc123',
                    checksumSha256: 'abc123',
                    links: {
                      asset: '/v1/archive/items/archive_asset_1/asset',
                    },
                  },
                  {
                    id: 'archive_asset_2',
                    kind: 'file',
                    title: 'Downloaded file',
                    status: 'materialized',
                    artifactId: 'file_restart_1',
                    providerConversationId: 'conv_restart_child',
                    boundIdentityKey: 'operator@example.com',
                    cacheKey: 'sha256:def456',
                    checksumSha256: 'def456',
                    links: {
                      asset: '/v1/archive/items/archive_asset_2/asset',
                    },
                  },
                ],
                snapshotRefreshes: [
                  {
                    generatedAt: '2026-05-24T12:01:30.000Z',
                    status: 'failed',
                    routeabilityState: 'not_found_or_unavailable',
                    target: {
                      conversationId: 'conv_restart_child',
                    },
                  },
                ],
                phases: {
                  snapshotRefresh: {
                    generatedAt: '2026-05-24T12:01:30.000Z',
                    status: 'failed',
                    routeabilityState: 'not_found_or_unavailable',
                    target: {
                      conversationId: 'conv_restart_child',
                    },
                  },
                },
              },
            }
          : null),
      },
      store,
      now: () => new Date('2026-05-24T12:02:00.000Z'),
    });

    const hydrated = await restartService.read('acctmirror_reconciliation_hydrate');

    expect(hydrated).toMatchObject({
      status: 'completed',
      completedAt: '2026-05-24T12:02:00.000Z',
      metrics: {
        materialization: {
          jobs: 1,
          terminalJobs: 1,
          conversations: 1,
          materialized: 1,
          skipped: 1,
          archiveItems: 2,
          checksummedAssets: 2,
          terminalUnavailableConversations: 1,
        },
      },
      targets: expect.arrayContaining([
        expect.objectContaining({
          key: 'chatgpt:default',
          execution: expect.objectContaining({
            status: 'completed',
            completionStatus: 'completed',
            passCount: 1,
            materializationJobStatus: 'succeeded',
            materializationMetrics: {
              conversations: 1,
              materialized: 1,
              skipped: 1,
              failed: 0,
              archiveItems: 2,
              checksummedAssets: 2,
            },
            materializedAssets: expect.arrayContaining([
              expect.objectContaining({
                providerConversationId: 'conv_restart_child',
                boundIdentityKey: 'operator@example.com',
                providerId: 'media_restart_1',
                checksumSha256: 'abc123',
                archiveItemId: 'archive_asset_1',
              }),
              expect.objectContaining({
                providerConversationId: 'conv_restart_child',
                boundIdentityKey: 'operator@example.com',
                providerId: 'file_restart_1',
                checksumSha256: 'def456',
                archiveItemId: 'archive_asset_2',
              }),
            ]),
            terminalRouteability: {
              notFoundOrUnavailable: 1,
              guarded: 0,
              identityMismatch: 0,
              authConflict: 0,
              failed: 1,
            },
          }),
          childOperations: {
            completionId: 'acctmirror_completion_restart_child',
            materializationJobId: 'hmj_restart_child',
          },
        }),
      ]),
    });
  });

  test('status readback reattaches replacement active completion after attached child fails', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-reattach-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    const original = {
      ...activeCompletion(),
      id: 'acctmirror_completion_original_child',
      provider: 'chatgpt',
      runtimeProfileId: 'active',
      status: 'running',
    } satisfies AccountMirrorCompletionOperation;
    const replacement = {
      ...activeCompletion(),
      id: 'acctmirror_completion_replacement_child',
      provider: 'chatgpt',
      runtimeProfileId: 'active',
      status: 'running',
    } satisfies AccountMirrorCompletionOperation;
    let replacementVisible = false;
    const completionService = {
      start: vi.fn(() => {
        throw new Error('reattach must not start a duplicate child completion');
      }),
      read: vi.fn((id: string) => {
        if (id === original.id) {
          return replacementVisible
            ? {
                ...original,
                status: 'failed',
                completedAt: '2026-05-24T12:01:00.000Z',
                error: {
                  code: 'collector_timeout',
                  message: 'Account mirror metadata collector timed out.',
                },
              } satisfies AccountMirrorCompletionOperation
            : original;
        }
        if (id === replacement.id) return replacement;
        return null;
      }),
      list: vi.fn(() => replacementVisible ? [replacement] : [original]),
      control: vi.fn(() => null),
    } satisfies AccountMirrorCompletionService;
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService,
      store,
      now: () => new Date(replacementVisible ? '2026-05-24T12:02:00.000Z' : '2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_reattach',
    });

    const created = await service.create({
      dryRun: false,
      provider: 'chatgpt',
      runtimeProfileId: 'active',
    });
    expect(created).toMatchObject({
      status: 'running',
      targets: expect.arrayContaining([
        expect.objectContaining({
          key: 'chatgpt:active',
          childOperations: {
            completionId: original.id,
            materializationJobId: null,
          },
          execution: expect.objectContaining({
            status: 'running',
          }),
        }),
      ]),
    });

    replacementVisible = true;
    const reattached = await service.read('acctmirror_reconciliation_reattach');

    expect(completionService.start).not.toHaveBeenCalled();
    expect(reattached).toMatchObject({
      status: 'running',
      targets: expect.arrayContaining([
        expect.objectContaining({
          key: 'chatgpt:active',
          activeCompletionId: replacement.id,
          childOperations: {
            completionId: replacement.id,
            materializationJobId: null,
          },
          execution: expect.objectContaining({
            status: 'running',
            completionStatus: 'running',
            reason: 'Child completion is running.',
          }),
        }),
      ]),
    });
  });

  test('cancel control propagates to active child completions', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-control-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    const child = {
      ...activeCompletion(),
      id: 'acctmirror_completion_control_child',
      runtimeProfileId: 'default',
    } satisfies AccountMirrorCompletionOperation;
    const control = vi.fn(() => ({
      ...child,
      status: 'cancelled',
      completedAt: '2026-05-24T12:01:00.000Z',
    } satisfies AccountMirrorCompletionOperation));
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService: {
        start: vi.fn(() => child),
        read: vi.fn((id: string) => id === child.id ? child : null),
        list: vi.fn(() => []),
        control,
      } satisfies AccountMirrorCompletionService,
      store,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_control',
    });
    await service.create({
      dryRun: false,
      provider: 'chatgpt',
      runtimeProfileId: 'default',
    });

    const cancelled = await service.control({
      id: 'acctmirror_reconciliation_control',
      action: 'cancel',
    });

    expect(control).toHaveBeenCalledWith({
      id: 'acctmirror_completion_control_child',
      action: 'cancel',
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      completedAt: '2026-05-24T12:00:00.000Z',
    });
  });

  test('persists dry-run campaign records for list and status readback', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-reconciliation-store-'));
    const store = createAccountMirrorReconciliationCampaignStore({
      config: {
        browser: {
          cache: {
            rootDir: tmp,
          },
        },
      },
    });
    const service = createAccountMirrorReconciliationCampaignService({
      registry: createAccountMirrorStatusRegistry({
        config,
        now: () => new Date('2026-05-24T12:00:00.000Z'),
      }),
      completionService: emptyCompletionService(),
      store,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      generateId: () => 'acctmirror_reconciliation_persisted',
    });

    const campaign = await service.create({ dryRun: true, provider: 'chatgpt' });
    const readback = await service.read(campaign.id);
    const list = await service.list({ limit: 10 });

    expect(readback).toMatchObject({
      id: 'acctmirror_reconciliation_persisted',
      filters: {
        provider: 'chatgpt',
      },
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('acctmirror_reconciliation_persisted');
  });
});

function emptyCompletionService(): AccountMirrorCompletionService {
  return {
    start: vi.fn(),
    read: vi.fn(() => null),
    list: vi.fn(() => []),
    control: vi.fn(() => null),
  } satisfies AccountMirrorCompletionService;
}

function activeCompletion(): AccountMirrorCompletionOperation {
  return {
    object: 'account_mirror_completion',
    id: 'acctmirror_completion_active',
    provider: 'chatgpt',
    runtimeProfileId: 'active',
    mode: 'bounded',
    sweepMode: 'full_sweep',
    phase: 'backfill_history',
    status: 'running',
    startedAt: '2026-05-24T11:59:00.000Z',
    completedAt: null,
    nextAttemptAt: null,
    maxPasses: 1,
    passCount: 0,
    lastRefresh: null,
    materializationPolicy: 'full_missing_assets',
    materializationAssetKinds: ['all'],
    materializationMaxItems: null,
    materializationRefreshSnapshot: true,
    materializationForce: false,
    materializationCursor: null,
    mirrorCompleteness: null,
    error: null,
    lifecycleEvents: [],
  };
}
