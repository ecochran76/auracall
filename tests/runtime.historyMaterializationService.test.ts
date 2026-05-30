import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  createHistoryMaterializationService,
  formatHistoryMaterializationFailureReason,
  resolveHistoryMaterializationProviderListOptions,
  type HistoryMaterializationJob,
  type HistoryMaterializationJobStore,
  type HistoryMediaGenerationMaterializeInput,
  type HistoryMaterializationResult,
  type HistoryMaterializationSnapshotRefresh,
} from '../src/runtime/historyMaterializationService.js';
import type { RunArchiveItem, RunArchiveService } from '../src/runtime/archiveService.js';
import { createCacheStore } from '../src/browser/llmService/cache/store.js';
import type { ProviderCacheContext } from '../src/browser/providers/cache.js';

describe('history materialization service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('classifies Gemini bare app fallback as a non-routeable conversation id', () => {
    const reason = formatHistoryMaterializationFailureReason({
      target: {
        provider: 'gemini',
        runtimeProfile: 'auracall-gemini-pro',
        browserProfile: null,
        boundIdentityKey: 'ecochran76@gmail.com',
        conversationId: 'deleted_conv',
        providerConversationUrl: 'https://gemini.google.com/app/deleted_conv',
        projectId: null,
      },
      error: new Error(
        'Gemini conversation content not found for deleted_conv. ' +
          'activeState={"href":"https://gemini.google.com/app","title":"Google Gemini","pathname":"/app","conversationId":null,"bodyTextLength":395}',
      ),
    });

    expect(reason).toContain('conversation-not-found-or-unavailable');
    expect(reason).toContain('conversation=deleted_conv');
    expect(reason).toContain('runtimeProfile=auracall-gemini-pro');
    expect(reason).toContain('identity=ecochran76@gmail.com');
    expect(reason).toContain('deleted/non-existent in the tenant');
    expect(reason).toContain('activeState=');
  });

  it('keeps non-root Gemini content failures as raw provider errors', () => {
    const message =
      'Gemini conversation content not found for slow_conv. ' +
      'activeState={"href":"https://gemini.google.com/app/slow_conv","title":"Google Gemini","pathname":"/app/slow_conv","conversationId":"slow_conv","bodyTextLength":12}';
    const reason = formatHistoryMaterializationFailureReason({
      target: {
        provider: 'gemini',
        runtimeProfile: 'auracall-gemini-pro',
        browserProfile: null,
        boundIdentityKey: null,
        conversationId: 'slow_conv',
        providerConversationUrl: 'https://gemini.google.com/app/slow_conv',
        projectId: null,
      },
      error: new Error(message),
    });

    expect(reason).toBe(message);
  });

  it('uses the Gemini rail surface for history materialization browser targeting', () => {
    expect(resolveHistoryMaterializationProviderListOptions({
      provider: 'gemini',
      runtimeProfile: 'default',
      browserProfile: 'default',
      boundIdentityKey: 'user@example.com',
      conversationId: '10b7e2a15e2dd77c',
      providerConversationUrl: 'https://gemini.google.com/app/10b7e2a15e2dd77c',
      projectId: null,
    })).toEqual({
      configuredUrl: 'https://gemini.google.com/app',
      tabUrl: 'https://gemini.google.com/app/10b7e2a15e2dd77c',
      projectId: undefined,
      allowNavigation: true,
      expectedUserIdentity: { email: 'user@example.com' },
    });

    expect(resolveHistoryMaterializationProviderListOptions({
      provider: 'gemini',
      runtimeProfile: 'default',
      browserProfile: 'default',
      boundIdentityKey: 'user@example.com',
      conversationId: 'project_conv',
      providerConversationUrl: 'https://gemini.google.com/app/project_conv',
      projectId: 'project-one',
    })).toEqual({
      configuredUrl: 'https://gemini.google.com/gem/project-one',
      tabUrl: 'https://gemini.google.com/app/project_conv',
      projectId: 'project-one',
      allowNavigation: true,
      expectedUserIdentity: { email: 'user@example.com' },
    });

    expect(resolveHistoryMaterializationProviderListOptions({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'default',
      boundIdentityKey: 'user@example.com',
      conversationId: 'conv_direct_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_direct_1',
      projectId: null,
    }).configuredUrl).toBe('https://chatgpt.com/c/conv_direct_1');
  });

  it('persists and runs a direct conversation materialization job', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-job-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const materializeConversation = vi.fn(async (target, _request, jobId): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:01:00.000Z',
      status: 'materialized',
      target,
      source: { type: 'conversation', provider: 'chatgpt', conversationId: 'conv_1' },
      manifestPaths: ['/tmp/artifact-fetch-manifest.json'],
      entries: [
        {
          kind: 'artifact',
          providerId: 'artifact_1',
          title: 'readout.json',
          status: 'materialized',
          localPath: '/tmp/readout.json',
          remoteUrl: null,
          cacheKey: null,
          checksumSha256: null,
          mimeType: 'application/json',
          size: 12,
          materializationMethod: 'download-button',
          reason: null,
          archiveItemId: 'history-generated-artifact:chatgpt:default:conv_1:artifact_1',
          assetRoute: '/v1/archive/items/b64/a/asset',
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: `History materialization job ${jobId} materialized one asset.`,
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_test_1',
      now: sequenceNow([
        '2026-05-22T18:00:00.000Z',
        '2026-05-22T18:00:01.000Z',
        '2026-05-22T18:00:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    const created = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_1',
      assetKinds: ['artifacts'],
    });
    const duplicate = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_1',
      assetKinds: ['artifacts'],
    });

    expect(created).toMatchObject({
      object: 'history_materialization_job_create_result',
      reused: false,
      job: {
        id: 'hmj_test_1',
        status: 'queued',
        source: {
          type: 'conversation',
          provider: 'chatgpt',
          conversationId: 'conv_1',
        },
      },
    });
    expect(duplicate.reused).toBe(true);
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    const completed = await service.readJob('hmj_test_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      attemptCount: 1,
      result: {
        status: 'materialized',
        metrics: {
          materialized: 1,
        },
      },
    });
    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'chatgpt',
        runtimeProfile: 'default',
        conversationId: 'conv_1',
      }),
      expect.objectContaining({
        assetKinds: ['artifacts'],
      }),
      'hmj_test_1',
    );
  });

  it('refreshes a provider conversation snapshot before direct materialization when requested', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-refresh-snapshot-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const snapshotRefresh: HistoryMaterializationSnapshotRefresh = {
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-22T18:02:00.000Z',
      status: 'refreshed',
      target: {
        provider: 'chatgpt',
        runtimeProfile: 'default',
        browserProfile: null,
        boundIdentityKey: null,
        conversationId: 'conv_refresh_1',
        providerConversationUrl: 'https://chatgpt.com/c/conv_refresh_1',
        projectId: null,
      },
      routeabilityState: 'routeable',
      messageCount: 4,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    };
    const refreshConversationSnapshot = vi.fn(async () => snapshotRefresh);
    const recordConversationEvidence = vi.fn(async () => undefined);
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:02:01.000Z',
      status: 'materialized',
      target,
      source: { type: 'conversation', provider: 'chatgpt', conversationId: 'conv_refresh_1' },
      manifestPaths: ['/tmp/conv_refresh_1/artifact-fetch-manifest.json'],
      entries: [
        {
          kind: 'artifact',
          providerId: 'artifact_refresh_1',
          title: 'fresh-export.json',
          status: 'materialized',
          localPath: '/tmp/fresh-export.json',
          remoteUrl: null,
          cacheKey: null,
          checksumSha256: null,
          mimeType: 'application/json',
          size: 22,
          materializationMethod: 'download-button',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Downloaded one fresh asset.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_refresh_snapshot_1',
      now: sequenceNow([
        '2026-05-22T18:02:00.000Z',
        '2026-05-22T18:02:01.000Z',
        '2026-05-22T18:02:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      recordConversationEvidence,
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_refresh_1',
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(refreshConversationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv_refresh_1' }),
      expect.objectContaining({ refreshSnapshot: true }),
      'hmj_refresh_snapshot_1',
    );
    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv_refresh_1' }),
      expect.objectContaining({ refreshSnapshot: true }),
      'hmj_refresh_snapshot_1',
    );
    expect(refreshConversationSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      materializeConversation.mock.invocationCallOrder[0],
    );
    expect(recordConversationEvidence).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ conversationId: 'conv_refresh_1' }),
      expect.objectContaining({
        detailObservedAt: '2026-05-22T18:02:00.000Z',
        manifestObservedAt: '2026-05-22T18:02:00.000Z',
        routeabilityObservedAt: '2026-05-22T18:02:00.000Z',
        routeabilityState: 'routeable',
        artifactCount: 1,
      }),
    );
    expect(recordConversationEvidence).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ conversationId: 'conv_refresh_1' }),
      expect.objectContaining({
        manifestObservedAt: '2026-05-22T18:02:01.000Z',
        materializedAt: '2026-05-22T18:02:01.000Z',
        assetCompleteness: 'complete',
      }),
    );
    const completed = await service.readJob('hmj_refresh_snapshot_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      result: {
        phases: {
          snapshotRefresh: {
            status: 'refreshed',
            routeabilityState: 'routeable',
            artifactCount: 1,
          },
          materialization: {
            status: 'materialized',
            entries: 1,
          },
        },
        snapshotRefreshes: [
          {
            status: 'refreshed',
            messageCount: 4,
          },
        ],
      },
    });
  });

  it('records terminal snapshot refresh evidence without running materialization', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-refresh-terminal-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const refreshConversationSnapshot = vi.fn(async () => {
      throw new Error(
        'Gemini conversation content not found for deleted_conv. ' +
          'activeState={"href":"https://gemini.google.com/app","title":"Google Gemini","pathname":"/app","conversationId":null,"bodyTextLength":395}',
      );
    });
    const recordConversationEvidence = vi.fn(async () => undefined);
    const materializeConversation = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_refresh_snapshot_terminal_1',
      now: sequenceNow([
        '2026-05-22T18:03:00.000Z',
        '2026-05-22T18:03:01.000Z',
        '2026-05-22T18:03:02.000Z',
        '2026-05-22T18:03:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      recordConversationEvidence,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      boundIdentityKey: 'ecochran76@gmail.com',
      conversationId: 'deleted_conv',
      refreshSnapshot: true,
      assetKinds: ['media'],
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation).not.toHaveBeenCalled();
    expect(recordConversationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'deleted_conv' }),
      expect.objectContaining({
        routeabilityObservedAt: '2026-05-22T18:03:02.000Z',
        routeabilityState: 'not_found_or_unavailable',
        routeabilityReason: expect.stringContaining('conversation-not-found-or-unavailable'),
      }),
    );
    const completed = await service.readJob('hmj_refresh_snapshot_terminal_1');
    expect(completed).toMatchObject({
      status: 'skipped',
      result: {
        status: 'skipped',
        phases: {
          snapshotRefresh: {
            status: 'failed',
            routeabilityState: 'not_found_or_unavailable',
          },
          materialization: null,
        },
        entries: [
          {
            kind: 'media',
            status: 'failed',
            reason: expect.stringContaining('conversation-not-found-or-unavailable'),
          },
        ],
        metrics: {
          materialized: 0,
          failed: 1,
        },
      },
    });
  });

  it('upserts direct provider conversation evidence when the mirror row is missing', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-direct-upsert-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-23T17:00:00.000Z',
      status: 'refreshed',
      target,
      routeabilityState: 'routeable',
      messageCount: 3,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-23T17:00:01.000Z',
      status: 'skipped',
      target,
      source: { type: 'conversation', provider: 'chatgpt', conversationId: 'conv_direct_1' },
      manifestPaths: [],
      entries: [],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
      message: 'No downloadable assets.',
    }));
    const service = createHistoryMaterializationService({
      config: {
        browser: {
          cache: {
            store: 'dual',
          },
        },
      },
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_direct_upsert_1',
      now: sequenceNow([
        '2026-05-23T17:00:00.000Z',
        '2026-05-23T17:00:01.000Z',
        '2026-05-23T17:00:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      boundIdentityKey: 'user@example.com',
      conversationId: 'conv_direct_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_direct_1',
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    const context: ProviderCacheContext = {
      provider: 'chatgpt',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'user@example.com',
    };
    await expect(createCacheStore('dual').readConversations(context)).resolves.toMatchObject({
      items: [
        {
          id: 'conv_direct_1',
          title: 'conv_direct_1',
          provider: 'chatgpt',
          url: 'https://chatgpt.com/c/conv_direct_1',
          metadata: {
            detailObservedAt: '2026-05-23T17:00:00.000Z',
            manifestObservedAt: '2026-05-23T17:00:01.000Z',
            routeabilityObservedAt: '2026-05-23T17:00:00.000Z',
            routeabilityState: 'routeable',
            messageCount: 3,
            artifactCount: 1,
          },
        },
      ],
    });
  });

  it('classifies provider human-verification guards as retry-clearance failures', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-provider-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const refreshConversationSnapshot = vi.fn(async () => {
      throw new Error('Gemini provider human-verification challenge requires manual clearance.');
    });
    const materializeConversation = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_provider_guard_1',
      now: sequenceNow([
        '2026-05-23T17:10:00.000Z',
        '2026-05-23T17:10:01.000Z',
        '2026-05-23T17:10:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      boundIdentityKey: 'user@example.com',
      conversationId: 'conv_guarded',
      refreshSnapshot: true,
      assetKinds: ['media'],
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation).not.toHaveBeenCalled();
    const completed = await service.readJob('hmj_provider_guard_1');
    expect(completed).toMatchObject({
      status: 'failed',
      result: null,
      error: {
        type: 'provider_guard_required',
        statusCode: 409,
        message: expect.stringContaining('human-verification'),
      },
    });
  });

  it('does not reuse active jobs across different browser profiles or conversation URLs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-dedupe-selectors-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: sequenceId([
        'hmj_selector_1',
        'hmj_selector_2',
        'hmj_selector_3',
      ]),
      now: sequenceNow([
        '2026-05-22T18:01:00.000Z',
        '2026-05-22T18:01:01.000Z',
        '2026-05-22T18:01:02.000Z',
        '2026-05-22T18:01:03.000Z',
      ]),
      schedule: () => undefined,
      materializeConversation: vi.fn(),
    });

    const base = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-1',
      conversationId: 'conv_selector_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_selector_1',
      assetKinds: ['artifacts'],
    });
    const sameSelector = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-1',
      conversationId: 'conv_selector_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_selector_1',
      assetKinds: ['artifacts'],
    });
    const differentBrowserProfile = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-2',
      conversationId: 'conv_selector_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_selector_1',
      assetKinds: ['artifacts'],
    });
    const differentConversationUrl = await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-1',
      conversationId: 'conv_selector_1',
      providerConversationUrl: 'https://chatgpt.com/g/g-project/c/conv_selector_1',
      assetKinds: ['artifacts'],
    });

    expect(base.reused).toBe(false);
    expect(sameSelector).toMatchObject({
      reused: true,
      job: {
        id: 'hmj_selector_1',
      },
    });
    expect(differentBrowserProfile).toMatchObject({
      reused: false,
      job: {
        id: 'hmj_selector_2',
        request: {
          browserProfile: 'wsl-chrome-2',
        },
      },
    });
    expect(differentConversationUrl).toMatchObject({
      reused: false,
      job: {
        id: 'hmj_selector_3',
        request: {
          providerConversationUrl: 'https://chatgpt.com/g/g-project/c/conv_selector_1',
        },
      },
    });
    const active = await service.listJobs({ status: 'active' });
    expect(active.metrics.total).toBe(3);
  });

  it('cancels queued jobs before provider work starts', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-cancel-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const materializeConversation = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_cancel_1',
      now: sequenceNow([
        '2026-05-22T18:02:00.000Z',
        '2026-05-22T18:02:01.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_cancel_1',
      assetKinds: ['artifacts'],
    });
    const cancelled = await service.cancelJob('hmj_cancel_1');
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();
    const rerun = await service.runJob('hmj_cancel_1');
    const listed = await service.listJobs({ status: 'cancelled' });

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      startedAt: null,
      completedAt: '2026-05-22T18:02:01.000Z',
      attemptCount: 0,
      message: 'History materialization job cancelled before provider work started.',
    });
    expect(rerun.status).toBe('cancelled');
    expect(materializeConversation).not.toHaveBeenCalled();
    expect(listed).toMatchObject({
      status: 'cancelled',
      metrics: {
        total: 1,
        byStatus: {
          cancelled: 1,
        },
        active: 0,
        terminal: 1,
      },
    });
  });

  it('rejects cancellation after provider work starts', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-cancel-running-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let releaseMaterializer: (() => void) | undefined;
    const materializerStarted = new Promise<void>((resolveStarted) => {
      releaseMaterializer = resolveStarted;
    });
    let finishMaterializer: (() => void) | undefined;
    const materializerFinished = new Promise<void>((resolveFinished) => {
      finishMaterializer = resolveFinished;
    });
    const materializeConversation = vi.fn(async (target, _request, jobId): Promise<HistoryMaterializationResult> => {
      releaseMaterializer?.();
      await materializerFinished;
      return {
        object: 'history_materialization_result',
        generatedAt: '2026-05-22T18:04:03.000Z',
        status: 'materialized',
        target,
        source: { type: 'conversation', provider: 'chatgpt', conversationId: 'conv_running_1' },
        manifestPaths: [],
        entries: [],
        archiveItems: [],
        metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 0 },
        message: `History materialization job ${jobId} materialized zero assets.`,
      };
    });
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_running_1',
      now: sequenceNow([
        '2026-05-22T18:04:00.000Z',
        '2026-05-22T18:04:01.000Z',
        '2026-05-22T18:04:02.000Z',
        '2026-05-22T18:04:03.000Z',
      ]),
      schedule: () => undefined,
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_running_1',
      assetKinds: ['artifacts'],
    });
    const run = service.runJob('hmj_running_1');
    await materializerStarted;

    await expect(service.cancelJob('hmj_running_1')).rejects.toThrow(
      'only queued jobs can be cancelled before provider work starts',
    );
    finishMaterializer?.();
    const completed = await run;

    expect(completed).toMatchObject({
      status: 'succeeded',
      attemptCount: 1,
    });
    expect(materializeConversation).toHaveBeenCalledTimes(1);
  });

  it('keeps provider work running until it resolves instead of timing out into zombie materialization', async () => {
    const store = createInMemoryHistoryMaterializationJobStore([
      buildHistoryMaterializationJob({ id: 'hmj_no_zombie_1', status: 'queued' }),
    ]);
    let finishMaterializer: (() => void) | undefined;
    const materializerFinished = new Promise<void>((resolveFinished) => {
      finishMaterializer = resolveFinished;
    });
    const materializeConversation = vi.fn(async (target, _request, jobId): Promise<HistoryMaterializationResult> => {
      await materializerFinished;
      return {
        object: 'history_materialization_result',
        generatedAt: '2026-05-22T18:05:02.000Z',
        status: 'materialized',
        target,
        source: { type: 'conversation', provider: 'chatgpt', conversationId: 'conv_no_zombie_1' },
        manifestPaths: ['/tmp/no-zombie-manifest.json'],
        entries: [
          {
            kind: 'artifact',
            providerId: 'artifact_no_zombie_1',
            title: 'no-zombie.md',
            status: 'materialized',
            localPath: '/tmp/no-zombie.md',
            remoteUrl: null,
            cacheKey: null,
            checksumSha256: 'abc123',
            mimeType: 'text/markdown',
            size: 12,
            materializationMethod: 'download-button',
            reason: null,
            archiveItemId: 'history-generated-artifact:chatgpt:default:conv_no_zombie_1:artifact_no_zombie_1',
            assetRoute: '/v1/archive/items/b64/no-zombie/asset',
          },
        ],
        archiveItems: [],
        metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
        message: `History materialization job ${jobId} completed after provider work settled.`,
      };
    });
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      store,
      now: sequenceNow([
        '2026-05-22T18:05:00.000Z',
        '2026-05-22T18:05:01.000Z',
        '2026-05-22T18:05:02.000Z',
      ]),
      schedule: () => undefined,
      materializeConversation,
    });

    const run = service.runJob('hmj_no_zombie_1');
    await Promise.resolve();
    await Promise.resolve();
    expect(materializeConversation).toHaveBeenCalledTimes(1);
    await expect(service.readJob('hmj_no_zombie_1')).resolves.toMatchObject({
      status: 'running',
      result: null,
      error: null,
    });

    finishMaterializer?.();
    const completed = await run;

    expect(completed).toMatchObject({
      status: 'succeeded',
      completedAt: '2026-05-22T18:05:01.000Z',
      result: {
        metrics: {
          conversations: 1,
          materialized: 1,
        },
      },
      error: null,
    });
  });

  it('marks interrupted active jobs failed during startup recovery', async () => {
    const store = createInMemoryHistoryMaterializationJobStore([
      buildHistoryMaterializationJob({ id: 'hmj_recover_queued', status: 'queued' }),
      buildHistoryMaterializationJob({ id: 'hmj_recover_running', status: 'running' }),
      buildHistoryMaterializationJob({ id: 'hmj_recover_succeeded', status: 'succeeded' }),
      buildHistoryMaterializationJob({ id: 'hmj_recover_cancelled', status: 'cancelled' }),
    ]);
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem: vi.fn(),
      },
      store,
      now: sequenceNow([
        '2026-05-22T18:06:00.000Z',
        '2026-05-22T18:06:01.000Z',
      ]),
      schedule: () => undefined,
      materializeConversation: vi.fn(),
    });

    const recovered = await service.recoverInterruptedJobs();
    const queued = await service.readJob('hmj_recover_queued');
    const running = await service.readJob('hmj_recover_running');
    const succeeded = await service.readJob('hmj_recover_succeeded');
    const cancelled = await service.readJob('hmj_recover_cancelled');
    const active = await service.listJobs({ status: 'active' });
    const terminal = await service.listJobs({ status: 'terminal' });

    expect(recovered).toBe(2);
    expect(queued).toMatchObject({
      status: 'failed',
      completedAt: '2026-05-22T18:06:00.000Z',
      error: {
        message: 'History materialization job was interrupted before this AuraCall API process started.',
        type: 'internal_error',
        statusCode: 500,
      },
    });
    expect(running).toMatchObject({
      status: 'failed',
      completedAt: '2026-05-22T18:06:01.000Z',
      error: {
        message: 'History materialization job was interrupted before this AuraCall API process started.',
        type: 'internal_error',
        statusCode: 500,
      },
    });
    expect(succeeded?.status).toBe('succeeded');
    expect(cancelled?.status).toBe('cancelled');
    expect(active.metrics.total).toBe(0);
    expect(terminal.metrics).toMatchObject({
      total: 4,
      byStatus: {
        failed: 2,
        succeeded: 1,
        cancelled: 1,
      },
      active: 0,
      terminal: 4,
    });
  });

  it('resolves account mirror catalog items without mutating catalog reads', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-catalog-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readItem = vi.fn(async () => ({
      object: 'account_mirror_catalog_item' as const,
      generatedAt: '2026-05-22T18:10:00.000Z',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      boundIdentityKey: 'user@example.com',
      status: 'eligible' as const,
      reason: 'eligible' as const,
      kind: 'conversations' as const,
      itemId: 'conv_catalog_1',
      item: {
        id: 'conv_catalog_1',
        projectId: 'project_1',
        url: 'https://chatgpt.com/c/conv_catalog_1',
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:11:00.000Z',
      status: 'skipped',
      target,
      source: { type: 'catalog_item', catalogItemId: 'conv_catalog_1', catalogKind: 'conversations' },
      manifestPaths: [],
      entries: [],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
      message: 'No downloadable assets.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem,
      },
      generateId: () => 'hmj_catalog_1',
      now: sequenceNow([
        '2026-05-22T18:10:00.000Z',
        '2026-05-22T18:10:01.000Z',
        '2026-05-22T18:10:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      catalogItemId: 'conv_catalog_1',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogKind: 'conversations',
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readItem).toHaveBeenCalledWith({
      itemId: 'conv_catalog_1',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      kind: 'conversations',
      limit: 500,
    });
    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'chatgpt',
        runtimeProfile: 'default',
        browserProfile: 'default',
        boundIdentityKey: 'user@example.com',
        conversationId: 'conv_catalog_1',
        projectId: 'project_1',
      }),
      expect.objectContaining({
        assetKinds: ['artifacts', 'files'],
      }),
      'hmj_catalog_1',
    );
  });

  it('resolves account mirror artifact catalog items from nested conversation metadata', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-artifact-item-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readItem = vi.fn(async () => ({
      object: 'account_mirror_catalog_item' as const,
      generatedAt: '2026-05-22T18:15:00.000Z',
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      boundIdentityKey: 'user@example.com',
      status: 'eligible' as const,
      reason: 'eligible' as const,
      kind: 'artifacts' as const,
      itemId: 'artifact_catalog_1',
      item: {
        id: 'artifact_catalog_1',
        title: 'Legacy readout',
        kind: 'download',
        metadata: {
          conversationId: 'conv_from_artifact',
          projectId: 'project_from_artifact',
          providerConversationUrl: 'https://chatgpt.com/c/conv_from_artifact',
        },
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:16:00.000Z',
      status: 'skipped',
      target,
      source: { type: 'catalog_item', catalogItemId: 'artifact_catalog_1', catalogKind: 'artifacts' },
      manifestPaths: [],
      entries: [],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
      message: 'No downloadable assets.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog: vi.fn(),
        readItem,
      },
      generateId: () => 'hmj_artifact_item_1',
      now: sequenceNow([
        '2026-05-22T18:15:00.000Z',
        '2026-05-22T18:15:01.000Z',
        '2026-05-22T18:15:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      catalogItemId: 'artifact_catalog_1',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogKind: 'artifacts',
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'chatgpt',
        conversationId: 'conv_from_artifact',
        providerConversationUrl: 'https://chatgpt.com/c/conv_from_artifact',
        projectId: 'project_from_artifact',
      }),
      expect.objectContaining({
        assetKinds: ['artifacts'],
      }),
      'hmj_artifact_item_1',
    );
  });

  it('runs bounded reconciliation from materializable account mirror conversation rows', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-reconcile-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:20:00.000Z',
      kind: 'conversations' as const,
      limit: 10,
      entries: [
        {
          provider: 'chatgpt' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 3,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'conv_reconcile_1',
                title: 'Has artifact',
                provider: 'chatgpt' as const,
                cachedArtifactCount: 1,
                cachedFileCount: 0,
              },
              {
                id: 'conv_reconcile_2',
                title: 'No cached assets',
                provider: 'chatgpt' as const,
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
              {
                id: 'conv_reconcile_3',
                title: 'Has file',
                provider: 'chatgpt' as const,
                projectId: 'project_1',
                cachedArtifactCount: 0,
                cachedFileCount: 1,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 3,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:21:00.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'chatgpt' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: `artifact_${target.conversationId}`,
          title: 'Recovered export',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/export.json`,
          remoteUrl: null,
          cacheKey: null,
          checksumSha256: null,
          mimeType: 'application/json',
          size: 12,
          materializationMethod: 'download-button',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one asset.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_reconcile_1',
      now: sequenceNow([
        '2026-05-22T18:20:00.000Z',
        '2026-05-22T18:20:01.000Z',
        '2026-05-22T18:20:02.000Z',
        '2026-05-22T18:20:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      reconcile: true,
      maxItems: 2,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      kind: 'conversations',
      limit: 10,
    });
    expect(materializeConversation).toHaveBeenCalledTimes(2);
    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'conv_reconcile_1',
      'conv_reconcile_3',
    ]);
    const completed = await service.readJob('hmj_reconcile_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'reconciliation', provider: 'chatgpt' },
      result: {
        status: 'materialized',
        metrics: {
          conversations: 2,
          materialized: 2,
        },
      },
    });
  });

  it('runs selected conversation id batches even when cached rows have no asset counts', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-selected-batch-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:22:00.000Z',
      kind: 'conversations' as const,
      limit: 10,
      entries: [
        {
          provider: 'chatgpt' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'conv_selected_1',
                title: 'Selected cached row with stale counts',
                provider: 'chatgpt' as const,
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
              {
                id: 'conv_other',
                title: 'Unselected cached row',
                provider: 'chatgpt' as const,
                cachedArtifactCount: 1,
                cachedFileCount: 0,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-22T18:22:01.000Z',
      status: 'refreshed',
      target,
      routeabilityState: 'routeable',
      messageCount: 2,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-22T18:22:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'chatgpt' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: `artifact_${target.conversationId}`,
          title: 'Recovered export',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/export.json`,
          remoteUrl: null,
          cacheKey: null,
          checksumSha256: null,
          mimeType: 'application/json',
          size: 12,
          materializationMethod: 'download-button',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one asset.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_selected_batch_1',
      now: sequenceNow([
        '2026-05-22T18:22:00.000Z',
        '2026-05-22T18:22:01.000Z',
        '2026-05-22T18:22:02.000Z',
        '2026-05-22T18:22:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationIds: ['conv_selected_1', 'conv_selected_2'],
      refreshSnapshot: true,
      maxItems: 2,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      kind: 'conversations',
      limit: 10,
    });
    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'conv_selected_1',
      'conv_selected_2',
    ]);
    expect(materializeConversation.mock.calls[1]?.[0]).toMatchObject({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: 'conv_selected_2',
      providerConversationUrl: 'https://chatgpt.com/c/conv_selected_2',
    });
    const completed = await service.readJob('hmj_selected_batch_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'reconciliation', provider: 'chatgpt' },
      result: {
        snapshotRefreshes: [
          { target: { conversationId: 'conv_selected_1' } },
          { target: { conversationId: 'conv_selected_2' } },
        ],
        metrics: {
          conversations: 2,
          materialized: 2,
        },
      },
    });
  });

  it('honors selected conversation id order so terminal misses do not hide behind cached matches', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-selected-order-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const routeMissReason =
      'conversation-not-found-or-unavailable: Gemini routeability check for conversation=gemini_deleted ' +
      'landed on bare /app; treat the cached conversation id as deleted/non-existent in the tenant.';
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-24T02:40:00.000Z',
      kind: 'all' as const,
      limit: 50,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'gemini-stealthcdp',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 1,
            artifacts: 1,
            files: 0,
            media: 1,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_routeable',
                title: 'Routeable image conversation',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/gemini_routeable',
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                cachedMediaCount: 1,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 1,
        artifacts: 1,
        files: 0,
        media: 1,
      },
    }));
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => {
      if (target.conversationId === 'gemini_deleted') {
        return {
          object: 'history_materialization_snapshot_refresh',
          generatedAt: '2026-05-24T02:40:01.000Z',
          status: 'failed',
          target,
          routeabilityState: 'not_found_or_unavailable',
          messageCount: null,
          fileCount: null,
          sourceCount: null,
          artifactCount: null,
          error: routeMissReason,
          message: `Conversation snapshot refresh failed for gemini conversation gemini_deleted: ${routeMissReason}`,
        };
      }
      return {
        object: 'history_materialization_snapshot_refresh',
        generatedAt: '2026-05-24T02:40:02.000Z',
        status: 'refreshed',
        target,
        routeabilityState: 'routeable',
        messageCount: 1,
        fileCount: 0,
        sourceCount: 0,
        artifactCount: 1,
        error: null,
        message: 'Conversation snapshot refreshed.',
      };
    });
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-24T02:40:03.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: `artifact_${target.conversationId}`,
          title: 'Generated image 1',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/image.png`,
          remoteUrl: null,
          cacheKey: null,
          checksumSha256: 'selected-order',
          mimeType: 'image/png',
          size: 12,
          materializationMethod: 'provider-download',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one asset.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_selected_order_1',
      now: sequenceNow([
        '2026-05-24T02:40:00.000Z',
        '2026-05-24T02:40:01.000Z',
        '2026-05-24T02:40:02.000Z',
        '2026-05-24T02:40:03.000Z',
        '2026-05-24T02:40:04.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      boundIdentityKey: 'user@example.com',
      conversationIds: ['gemini_deleted', 'gemini_routeable'],
      refreshSnapshot: true,
      assetKinds: ['media'],
      maxItems: 1,
      force: true,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(refreshConversationSnapshot.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_deleted',
      'gemini_routeable',
    ]);
    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_routeable',
    ]);
    await expect(service.readJob('hmj_selected_order_1')).resolves.toMatchObject({
      status: 'succeeded',
      result: {
        snapshotRefreshes: [
          {
            target: { conversationId: 'gemini_deleted' },
            status: 'failed',
            routeabilityState: 'not_found_or_unavailable',
          },
          {
            target: { conversationId: 'gemini_routeable' },
            status: 'refreshed',
            routeabilityState: 'routeable',
          },
        ],
        metrics: {
          conversations: 2,
          materialized: 1,
          failed: 1,
        },
      },
    });
  });

  it('selects reconciliation targets from manifest asset evidence when row counts are stale', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-manifest-candidates-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-23T20:30:00.000Z',
      kind: 'conversations' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          boundIdentityKey: 'ecochran76@gmail.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'in_progress' as const,
            summary: 'Progressive backfill.',
            remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: true,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 1,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_manifest_candidate',
                title: 'Recently moved conversation',
                provider: 'gemini' as const,
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
              {
                id: 'gemini_without_assets',
                title: 'No manifest assets',
                provider: 'gemini' as const,
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
            ],
            artifacts: [
              {
                id: 'gemini_image_1',
                title: 'Generated image',
                kind: 'image' as const,
                uri: 'https://gemini.googleusercontent.com/image.png',
                metadata: {
                  conversationId: 'gemini_manifest_candidate',
                },
              },
            ],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 1,
        files: 0,
        media: 0,
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-23T20:30:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: 'gemini_image_1',
          title: 'Generated image',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/image.png`,
          remoteUrl: null,
          cacheKey: `gemini:${target.conversationId}:gemini_image_1`,
          checksumSha256: 'abc123',
          mimeType: 'image/png',
          size: 12,
          materializationMethod: 'provider-download',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one Gemini image.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_manifest_candidate_1',
      now: sequenceNow([
        '2026-05-23T20:30:00.000Z',
        '2026-05-23T20:30:01.000Z',
        '2026-05-23T20:30:02.000Z',
        '2026-05-23T20:30:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      reconcile: true,
      assetKinds: ['artifacts'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_manifest_candidate',
    ]);
    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        runtimeProfile: 'auracall-gemini-pro',
        boundIdentityKey: 'ecochran76@gmail.com',
        conversationId: 'gemini_manifest_candidate',
        providerConversationUrl: 'https://gemini.google.com/app/gemini_manifest_candidate',
      }),
      expect.objectContaining({
        reconcile: true,
        assetKinds: ['artifacts'],
      }),
      'hmj_manifest_candidate_1',
    );
    await expect(service.readJob('hmj_manifest_candidate_1')).resolves.toMatchObject({
      status: 'succeeded',
      result: {
        metrics: {
          conversations: 1,
          materialized: 1,
        },
      },
    });
  });

  it('uses freshness evidence to skip complete rows and refresh changed rows without asset counts', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-freshness-candidates-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-24T02:20:00.000Z',
      kind: 'conversations' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          boundIdentityKey: 'ecochran76@gmail.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'in_progress' as const,
            summary: 'Progressive backfill.',
            remainingDetailSurfaces: { projects: 0, conversations: 2, total: 2 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: true,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 3,
            artifacts: 1,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_fresh_complete',
                title: 'Already materialized image',
                provider: 'gemini' as const,
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'fresh',
                  assetCompleteness: 'complete',
                  assetCounts: { known: 1, local: 1, missingLocal: 0 },
                },
              },
              {
                id: 'gemini_changed_without_counts',
                title: 'Changed conversation without cached asset counts',
                provider: 'gemini' as const,
                cachedArtifactCount: 0,
                cachedFileCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'stale',
                  reasons: ['index_newer_than_detail'],
                  assetCompleteness: 'none',
                  assetCounts: { known: 0, local: 0, missingLocal: 0 },
                },
              },
              {
                id: 'gemini_missing_assets',
                title: 'Missing local asset',
                provider: 'gemini' as const,
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'missing_assets',
                  assetCompleteness: 'partial',
                  assetCounts: { known: 1, local: 0, missingLocal: 1 },
                },
              },
            ],
            artifacts: [
              {
                id: 'fresh_image',
                title: 'Already local',
                kind: 'image' as const,
                metadata: {
                  conversationId: 'gemini_fresh_complete',
                },
              },
            ],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 3,
        artifacts: 1,
        files: 0,
        media: 0,
      },
    }));
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-24T02:20:01.000Z',
      status: 'refreshed',
      target,
      routeabilityState: 'routeable',
      messageCount: 3,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-24T02:20:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: `artifact_${target.conversationId}`,
          title: 'Generated image 1',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/image.png`,
          remoteUrl: null,
          cacheKey: `gemini:${target.conversationId}`,
          checksumSha256: 'freshness123',
          mimeType: 'image/png',
          size: 12,
          materializationMethod: 'provider-download',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one Gemini image.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_freshness_candidate_1',
      now: sequenceNow([
        '2026-05-24T02:20:00.000Z',
        '2026-05-24T02:20:01.000Z',
        '2026-05-24T02:20:02.000Z',
        '2026-05-24T02:20:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      reconcile: true,
      refreshSnapshot: true,
      assetKinds: ['all'],
      maxItems: 2,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_missing_assets',
      'gemini_changed_without_counts',
    ]);
    expect(refreshConversationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'gemini_changed_without_counts' }),
      expect.objectContaining({ refreshSnapshot: true }),
      'hmj_freshness_candidate_1',
    );
    await expect(service.readJob('hmj_freshness_candidate_1')).resolves.toMatchObject({
      status: 'succeeded',
      result: {
        snapshotRefreshes: [
          {
            target: { conversationId: 'gemini_missing_assets' },
            status: 'refreshed',
          },
          {
            target: { conversationId: 'gemini_changed_without_counts' },
            status: 'refreshed',
          },
        ],
        metrics: {
          conversations: 2,
          materialized: 2,
        },
      },
    });
  });

  it('prioritizes Gemini rows with missing assets over refresh-only app routes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-candidate-priority-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-24T14:00:00.000Z',
      kind: 'conversations' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'in_progress' as const,
            summary: 'Progressive backfill.',
            remainingDetailSurfaces: { projects: 0, conversations: 2, total: 2 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: true,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 1,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'download',
                title: 'Gemini App Opens in a new window',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/download',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
                cachedMediaCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'partial',
                  assetCompleteness: 'unknown',
                  assetCounts: { known: 0, local: 0, missingLocal: 0 },
                },
              },
              {
                id: 'gemini_missing_assets',
                title: 'Generated image needing local materialization',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/gemini_missing_assets',
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                cachedMediaCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'missing_assets',
                  assetCompleteness: 'partial',
                  assetCounts: { known: 1, local: 0, missingLocal: 1 },
                },
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 1,
        files: 0,
        media: 0,
      },
    }));
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-24T14:00:01.000Z',
      status: 'refreshed',
      target,
      routeabilityState: 'routeable',
      messageCount: 2,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-24T14:00:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [
        {
          kind: 'artifact',
          providerId: `artifact_${target.conversationId}`,
          title: 'Generated image',
          status: 'materialized',
          localPath: `/tmp/${target.conversationId}/image.png`,
          remoteUrl: null,
          cacheKey: `gemini:${target.conversationId}`,
          checksumSha256: 'missing-assets-first',
          mimeType: 'image/png',
          size: 12,
          materializationMethod: 'provider-download',
          reason: null,
          archiveItemId: null,
          assetRoute: null,
        },
      ],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one Gemini image.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_gemini_priority_1',
      now: sequenceNow([
        '2026-05-24T14:00:00.000Z',
        '2026-05-24T14:00:01.000Z',
        '2026-05-24T14:00:02.000Z',
        '2026-05-24T14:00:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_missing_assets',
    ]);
    expect(refreshConversationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'gemini_missing_assets',
        providerConversationUrl: 'https://gemini.google.com/app/gemini_missing_assets',
      }),
      expect.objectContaining({ refreshSnapshot: true }),
      'hmj_gemini_priority_1',
    );
  });

  it('canonicalizes Gemini redirect URLs before reconciliation route checks', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-redirect-url-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-25T16:40:00.000Z',
      kind: 'conversations' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: true,
            },
          },
          counts: {
            projects: 0,
            conversations: 1,
            artifacts: 1,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: '23340d1698de29b8&followup=https:',
                title: 'Redirect-polluted Gemini row',
                provider: 'gemini' as const,
                url: 'https://accounts.google.com/ServiceLogin?passive=1209600&continue=https://gemini.google.com/app/23340d1698de29b8&followup=https://gemini.google.com/app/23340d1698de29b8&ec=GAZAkgU',
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                cachedMediaCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'missing_assets',
                  assetCompleteness: 'partial',
                  assetCounts: { known: 1, local: 0, missingLocal: 1 },
                },
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 1,
        artifacts: 1,
        files: 0,
        media: 0,
      },
    }));
    const refreshConversationSnapshot = vi.fn(async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
      object: 'history_materialization_snapshot_refresh',
      generatedAt: '2026-05-25T16:40:01.000Z',
      status: 'refreshed',
      target,
      routeabilityState: 'routeable',
      messageCount: 2,
      fileCount: 0,
      sourceCount: 0,
      artifactCount: 1,
      error: null,
      message: 'Conversation snapshot refreshed.',
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-25T16:40:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
      entries: [],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
      message: 'Recovered one Gemini image.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_gemini_redirect_1',
      now: sequenceNow([
        '2026-05-25T16:40:00.000Z',
        '2026-05-25T16:40:01.000Z',
        '2026-05-25T16:40:02.000Z',
        '2026-05-25T16:40:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      refreshConversationSnapshot,
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(refreshConversationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '23340d1698de29b8',
        providerConversationUrl: 'https://gemini.google.com/app/23340d1698de29b8',
      }),
      expect.objectContaining({ refreshSnapshot: true }),
      'hmj_gemini_redirect_1',
    );
    expect(materializeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '23340d1698de29b8',
        providerConversationUrl: 'https://gemini.google.com/app/23340d1698de29b8',
      }),
      expect.any(Object),
      'hmj_gemini_redirect_1',
    );
  });

  it('does not spend reconciliation budget on Gemini static app routes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-static-route-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-24T14:10:00.000Z',
      kind: 'conversations' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 1,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'download',
                title: 'Gemini App Opens in a new window',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/download',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
                cachedMediaCount: 0,
                conversationFreshness: {
                  object: 'account_mirror_conversation_freshness',
                  state: 'partial',
                  assetCompleteness: 'unknown',
                  assetCounts: { known: 0, local: 0, missingLocal: 0 },
                },
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 1,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => ({
      object: 'history_materialization_result',
      generatedAt: '2026-05-24T14:10:02.000Z',
      status: 'materialized',
      target,
      source: { type: 'reconciliation', provider: 'gemini' },
      manifestPaths: [],
      entries: [],
      archiveItems: [],
      metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 0 },
      message: 'Unexpected materialization.',
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_gemini_static_route_1',
      now: sequenceNow([
        '2026-05-24T14:10:00.000Z',
        '2026-05-24T14:10:01.000Z',
        '2026-05-24T14:10:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      refreshSnapshot: true,
      assetKinds: ['all'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeConversation).not.toHaveBeenCalled();
    await expect(service.readJob('hmj_gemini_static_route_1')).resolves.toMatchObject({
      status: 'skipped',
      result: {
        metrics: {
          conversations: 0,
          materialized: 0,
        },
      },
    });
  });

  it('records terminal Gemini route misses without spending the next reconciliation target', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-route-miss-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const routeMissReason =
      'conversation-not-found-or-unavailable: Gemini routeability check for conversation=gemini_deleted ' +
      'landed on bare /app; treat the cached conversation id as deleted/non-existent in the tenant.';
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-23T16:00:00.000Z',
      kind: 'all' as const,
      limit: 50,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 2,
            files: 0,
            media: 2,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_deleted',
                title: 'Deleted image conversation',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/gemini_deleted',
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                cachedMediaCount: 1,
              },
              {
                id: 'gemini_routeable',
                title: 'Rail discovered image conversation',
                provider: 'gemini' as const,
                url: 'https://gemini.google.com/app/gemini_routeable',
                cachedArtifactCount: 1,
                cachedFileCount: 0,
                cachedMediaCount: 1,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 2,
        files: 0,
        media: 2,
      },
    }));
    const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => {
      if (target.conversationId === 'gemini_deleted') {
        return {
          object: 'history_materialization_result',
          generatedAt: '2026-05-23T16:01:00.000Z',
          status: 'skipped',
          target,
          source: { type: 'reconciliation', provider: 'gemini' },
          manifestPaths: [],
          entries: [
            {
              kind: 'media',
              providerId: null,
              title: null,
              status: 'failed',
              localPath: null,
              remoteUrl: null,
              cacheKey: null,
              checksumSha256: null,
              mimeType: null,
              size: null,
              materializationMethod: null,
              reason: routeMissReason,
              archiveItemId: null,
              assetRoute: null,
            },
          ],
          archiveItems: [],
          metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 1 },
          message: routeMissReason,
        };
      }
      return {
        object: 'history_materialization_result',
        generatedAt: '2026-05-23T16:02:00.000Z',
        status: 'materialized',
        target,
        source: { type: 'reconciliation', provider: 'gemini' },
        manifestPaths: ['/tmp/gemini_routeable/artifact-fetch-manifest.json'],
        entries: [
          {
            kind: 'media',
            providerId: 'gemini-artifact:gemini_routeable:1:0',
            title: 'Generated image 1.png',
            status: 'materialized',
            localPath: '/tmp/gemini_routeable/Generated image 1.png',
            remoteUrl: null,
            cacheKey: 'sha256:routeable',
            checksumSha256: 'routeable',
            mimeType: 'image/png',
            size: 123,
            materializationMethod: 'download-button',
            reason: null,
            archiveItemId: null,
            assetRoute: null,
          },
        ],
        archiveItems: [],
        metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
        message: 'Recovered one Gemini image.',
      };
    });
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      generateId: () => 'hmj_gemini_route_miss_1',
      now: sequenceNow([
        '2026-05-23T16:00:00.000Z',
        '2026-05-23T16:00:01.000Z',
        '2026-05-23T16:00:02.000Z',
        '2026-05-23T16:00:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeConversation,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      kind: 'all',
      limit: 50,
    });
    expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
      'gemini_deleted',
      'gemini_routeable',
    ]);
    const completed = await service.readJob('hmj_gemini_route_miss_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'reconciliation', provider: 'gemini' },
      result: {
        status: 'materialized',
        metrics: {
          conversations: 2,
          materialized: 1,
          failed: 1,
        },
        entries: [
          {
            kind: 'media',
            status: 'failed',
            reason: expect.stringContaining('conversation-not-found-or-unavailable'),
          },
          {
            kind: 'media',
            status: 'materialized',
            providerId: 'gemini-artifact:gemini_routeable:1:0',
          },
        ],
      },
    });
  });

  it('reconciles unavailable Gemini media-generation rows through matched account-mirror conversations', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-media-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const mediaPath = path.join(homeDir, 'gemini.png');
    await fs.writeFile(mediaPath, 'png');
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_1:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_1',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_1',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_1',
      metadata: {
        mediaType: 'image',
      },
    });
    const materializedArchiveItem = {
      ...generatedArchiveItem,
      localPath: mediaPath,
      uri: `file://${mediaPath}`,
      fileAvailable: true,
      links: {
        asset: '/v1/archive/items/b64/gemini/asset',
      },
    };
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:30:00.000Z',
      kind: 'all' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_stale_conv',
                title: prompt,
                provider: 'gemini' as const,
                updatedAt: '2026-05-22T18:00:00.000Z',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
              {
                id: 'gemini_conv_1',
                title: prompt,
                provider: 'gemini' as const,
                updatedAt: '2026-05-17T22:09:47.000Z',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:30:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: {
            response: 0,
            response_batch: 0,
            team_run: 0,
            media_generation: 0,
            upload: 0,
            generated_artifact: 1,
            provider_conversation: 0,
            evidence: 0,
          },
        },
      })),
      readItem: vi.fn(async (id: string) => {
        if (id === 'media-generation:medgen_1') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:30:02.000Z',
            item: baseArchiveItem,
          };
        }
        if (id === 'generated-artifact:medgen_1:artifact_followup_1') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:30:03.000Z',
            item: materializedArchiveItem,
          };
        }
        return null;
      }),
      upsertMediaGenerationItems: vi.fn(async () => ({
        object: 'run_archive_backfill' as const,
        generatedAt: '2026-05-22T18:30:04.000Z',
        index: {
          updatedAt: '2026-05-22T18:30:04.000Z',
          itemCount: 2,
        },
        metrics: {
          byKind: {
            response: 0,
            response_batch: 0,
            team_run: 0,
            media_generation: 1,
            upload: 0,
            generated_artifact: 1,
            provider_conversation: 0,
            evidence: 0,
          },
        },
      })),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn(async (_request: HistoryMediaGenerationMaterializeInput) => ({
      id: 'medgen_1',
      object: 'media_generation' as const,
      status: 'succeeded' as const,
      provider: 'gemini' as const,
      mediaType: 'image' as const,
      prompt,
      createdAt: '2026-05-17T22:09:45.957Z',
      updatedAt: '2026-05-22T18:31:00.000Z',
      completedAt: '2026-05-22T18:31:00.000Z',
      artifacts: [
        {
          id: 'artifact_followup_1',
          type: 'image' as const,
          mimeType: 'image/png',
          fileName: 'gemini.png',
          path: mediaPath,
          uri: `file://${mediaPath}`,
          metadata: {
            materialization: 'download-button-anchor-fetch',
            size: 3,
          },
        },
      ],
      metadata: {
        conversationId: 'gemini_conv_1',
      },
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_media_1',
      now: sequenceNow([
        '2026-05-22T18:30:00.000Z',
        '2026-05-22T18:30:01.000Z',
        '2026-05-22T18:30:02.000Z',
        '2026-05-22T18:30:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'default',
      kind: 'all',
      limit: 50,
    });
    expect(runArchiveService.listItems).toHaveBeenCalledWith({
      kind: 'generated_artifact',
      provider: 'gemini',
      runtimeProfile: null,
      assetAvailability: 'unavailable',
      limit: 10,
    });
    expect(materializeMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      mediaGenerationId: 'medgen_1',
      provider: 'gemini',
      mediaType: 'image',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-2',
      boundIdentityKey: 'user@example.com',
      conversationId: 'gemini_conv_1',
      providerConversationUrl: 'https://gemini.google.com/app/gemini_conv_1',
      jobId: 'hmj_gemini_media_1',
      matchBasis: 'exact-title-nearest-time',
      count: 1,
    }));
    expect(runArchiveService.upsertMediaGenerationItems).toHaveBeenCalledWith('medgen_1');
    const completed = await service.readJob('hmj_gemini_media_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'reconciliation', provider: 'gemini' },
      result: {
        status: 'materialized',
        metrics: {
          conversations: 1,
          materialized: 1,
        },
        entries: [
          {
            kind: 'media',
            providerId: 'artifact_followup_1',
            status: 'materialized',
            localPath: mediaPath,
            mimeType: 'image/png',
            materializationMethod: 'download-button-anchor-fetch',
            archiveItemId: 'generated-artifact:medgen_1:artifact_followup_1',
            assetRoute: '/v1/archive/items/b64/gemini/asset',
          },
        ],
      },
    });
  });

  it('uses cached Gemini media evidence to disambiguate duplicate title matches', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-cached-media-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const mediaPath = path.join(homeDir, 'gemini-cached-media.png');
    await fs.writeFile(mediaPath, 'png');
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_cached_media:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_cached_media',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_cached_media',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_cached_media',
      metadata: {
        mediaType: 'image',
      },
    });
    const materializedArchiveItem = {
      ...generatedArchiveItem,
      localPath: mediaPath,
      uri: `file://${mediaPath}`,
      fileAvailable: true,
      links: {
        asset: '/v1/archive/items/b64/gemini-cached-media/asset',
      },
    };
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:32:00.000Z',
      kind: 'all' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 1,
          },
          manifests: {
            projects: [],
            conversations: [
              { id: 'gemini_duplicate_1', title: prompt, provider: 'gemini' as const },
              { id: 'gemini_duplicate_2', title: prompt, provider: 'gemini' as const },
            ],
            artifacts: [],
            files: [],
            media: [
              {
                id: 'gemini-conversation-artifact:gemini_duplicate_2:artifact_followup_1',
                title: prompt,
                provider: 'gemini' as const,
                mediaType: 'image' as const,
                conversationId: 'gemini_duplicate_2',
              },
            ],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 1,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:32:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => {
        if (id === 'media-generation:medgen_cached_media') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:32:02.000Z',
            item: baseArchiveItem,
          };
        }
        if (id === 'generated-artifact:medgen_cached_media:artifact_followup_1') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:32:03.000Z',
            item: materializedArchiveItem,
          };
        }
        return null;
      }),
      upsertMediaGenerationItems: vi.fn(async () => ({
        object: 'run_archive_backfill' as const,
        generatedAt: '2026-05-22T18:32:04.000Z',
        index: {
          updatedAt: '2026-05-22T18:32:04.000Z',
          itemCount: 2,
        },
        metrics: {
          byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
        },
      })),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn(async (_request: HistoryMediaGenerationMaterializeInput) => ({
      id: 'medgen_cached_media',
      object: 'media_generation' as const,
      status: 'succeeded' as const,
      provider: 'gemini' as const,
      mediaType: 'image' as const,
      prompt,
      createdAt: '2026-05-17T22:09:45.957Z',
      updatedAt: '2026-05-22T18:33:00.000Z',
      completedAt: '2026-05-22T18:33:00.000Z',
      artifacts: [
        {
          id: 'artifact_followup_1',
          type: 'image' as const,
          mimeType: 'image/png',
          fileName: 'gemini-cached-media.png',
          path: mediaPath,
          uri: `file://${mediaPath}`,
          metadata: {
            materialization: 'download-button-anchor-fetch',
            size: 3,
          },
        },
      ],
      metadata: {
        conversationId: 'gemini_duplicate_2',
      },
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_cached_media_1',
      now: sequenceNow([
        '2026-05-22T18:32:00.000Z',
        '2026-05-22T18:32:01.000Z',
        '2026-05-22T18:32:02.000Z',
        '2026-05-22T18:32:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      mediaGenerationId: 'medgen_cached_media',
      provider: 'gemini',
      mediaType: 'image',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-2',
      boundIdentityKey: 'user@example.com',
      conversationId: 'gemini_duplicate_2',
      providerConversationUrl: 'https://gemini.google.com/app/gemini_duplicate_2',
      jobId: 'hmj_gemini_cached_media_1',
      matchBasis: 'exact-title-cached-media',
      count: 1,
    }));
    expect(runArchiveService.upsertMediaGenerationItems).toHaveBeenCalledWith('medgen_cached_media');
    const completed = await service.readJob('hmj_gemini_cached_media_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'reconciliation', provider: 'gemini' },
      result: {
        status: 'materialized',
        metrics: {
          conversations: 1,
          materialized: 1,
        },
        entries: [
          {
            kind: 'media',
            providerId: 'artifact_followup_1',
            status: 'materialized',
            localPath: mediaPath,
            mimeType: 'image/png',
            materializationMethod: 'download-button-anchor-fetch',
            archiveItemId: 'generated-artifact:medgen_cached_media:artifact_followup_1',
            assetRoute: '/v1/archive/items/b64/gemini-cached-media/asset',
          },
        ],
      },
    });
  });

  it('uses direct media provider-conversation evidence without requiring a catalog match', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-direct-media-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const mediaPath = path.join(homeDir, 'gemini-direct.png');
    await fs.writeFile(mediaPath, 'png');
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_direct:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_direct',
      providerConversationId: 'gemini_direct_conv',
      providerConversationUrl: 'https://gemini.google.com/app/gemini_direct_conv',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_direct',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_direct',
      metadata: {
        mediaType: 'image',
      },
    });
    const materializedArchiveItem = {
      ...generatedArchiveItem,
      localPath: mediaPath,
      uri: `file://${mediaPath}`,
      fileAvailable: true,
      links: {
        asset: '/v1/archive/items/b64/gemini-direct/asset',
      },
    };
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:35:00.000Z',
      kind: 'all' as const,
      limit: 50,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 0,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 0,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:35:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => {
        if (id === 'media-generation:medgen_direct') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:35:02.000Z',
            item: baseArchiveItem,
          };
        }
        if (id === 'generated-artifact:medgen_direct:artifact_followup_1') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:35:03.000Z',
            item: materializedArchiveItem,
          };
        }
        return null;
      }),
      upsertMediaGenerationItems: vi.fn(async () => ({
        object: 'run_archive_backfill' as const,
        generatedAt: '2026-05-22T18:35:04.000Z',
        index: {
          updatedAt: '2026-05-22T18:35:04.000Z',
          itemCount: 2,
        },
        metrics: {
          byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
        },
      })),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn(async (_request: HistoryMediaGenerationMaterializeInput) => ({
      id: 'medgen_direct',
      object: 'media_generation' as const,
      status: 'succeeded' as const,
      provider: 'gemini' as const,
      mediaType: 'image' as const,
      prompt,
      createdAt: '2026-05-17T22:09:45.957Z',
      updatedAt: '2026-05-22T18:36:00.000Z',
      completedAt: '2026-05-22T18:36:00.000Z',
      artifacts: [
        {
          id: 'artifact_followup_1',
          type: 'image' as const,
          mimeType: 'image/png',
          fileName: 'gemini-direct.png',
          path: mediaPath,
          uri: `file://${mediaPath}`,
          metadata: {
            materialization: 'download-button-anchor-fetch',
          },
        },
      ],
      metadata: {
        conversationId: 'gemini_direct_conv',
      },
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_direct_media_1',
      now: sequenceNow([
        '2026-05-22T18:35:00.000Z',
        '2026-05-22T18:35:01.000Z',
        '2026-05-22T18:35:02.000Z',
        '2026-05-22T18:35:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-2',
      boundIdentityKey: 'user@example.com',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'default',
      kind: 'all',
      limit: 50,
    });
    expect(materializeMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      mediaGenerationId: 'medgen_direct',
      provider: 'gemini',
      runtimeProfile: 'default',
      browserProfile: 'wsl-chrome-2',
      boundIdentityKey: 'user@example.com',
      conversationId: 'gemini_direct_conv',
      providerConversationUrl: 'https://gemini.google.com/app/gemini_direct_conv',
      matchBasis: 'provider-conversation-id',
      jobId: 'hmj_gemini_direct_media_1',
    }));
    const completed = await service.readJob('hmj_gemini_direct_media_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      result: {
        status: 'materialized',
        entries: [
          {
            kind: 'media',
            status: 'materialized',
            localPath: mediaPath,
            archiveItemId: 'generated-artifact:medgen_direct:artifact_followup_1',
            assetRoute: '/v1/archive/items/b64/gemini-direct/asset',
          },
        ],
      },
    });
  });

  it('resolves a generated-artifact archive item through Gemini media history matching', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-archive-media-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const mediaPath = path.join(homeDir, 'gemini-archive.png');
    await fs.writeFile(mediaPath, 'png');
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_archive:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_archive',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_archive',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_archive',
      metadata: {
        mediaType: 'image',
      },
    });
    const materializedArchiveItem = {
      ...generatedArchiveItem,
      localPath: mediaPath,
      uri: `file://${mediaPath}`,
      fileAvailable: true,
      links: {
        asset: '/v1/archive/items/b64/gemini-archive/asset',
      },
    };
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T19:00:00.000Z',
      kind: 'all' as const,
      limit: 50,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 1,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_archive_conv',
                title: prompt,
                provider: 'gemini' as const,
                updatedAt: '2026-05-17T22:09:46.000Z',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 1,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    let archiveRefreshed = false;
    const runArchiveService = {
      listItems: vi.fn(),
      readItem: vi.fn(async (id: string) => {
        if (id === 'generated-artifact:medgen_archive:artifact_followup_1') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T19:00:01.000Z',
            item: archiveRefreshed ? materializedArchiveItem : generatedArchiveItem,
          };
        }
        if (id === 'media-generation:medgen_archive') {
          return {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T19:00:02.000Z',
            item: baseArchiveItem,
          };
        }
        return null;
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        archiveRefreshed = true;
        return {
          object: 'run_archive_backfill' as const,
          generatedAt: '2026-05-22T19:00:03.000Z',
          index: {
            updatedAt: '2026-05-22T19:00:03.000Z',
            itemCount: 2,
          },
          metrics: {
            byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
          },
        };
      }),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn(async (_request: HistoryMediaGenerationMaterializeInput) => ({
      id: 'medgen_archive',
      object: 'media_generation' as const,
      status: 'succeeded' as const,
      provider: 'gemini' as const,
      mediaType: 'image' as const,
      prompt,
      createdAt: '2026-05-17T22:09:45.957Z',
      updatedAt: '2026-05-22T19:01:00.000Z',
      completedAt: '2026-05-22T19:01:00.000Z',
      artifacts: [
        {
          id: 'artifact_followup_1',
          type: 'image' as const,
          mimeType: 'image/png',
          fileName: 'gemini-archive.png',
          path: mediaPath,
          uri: `file://${mediaPath}`,
          metadata: {
            materialization: 'download-button-anchor-fetch',
            size: 3,
          },
        },
      ],
      metadata: {
        conversationId: 'gemini_archive_conv',
      },
    }));
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_archive_media_1',
      now: sequenceNow([
        '2026-05-22T19:00:00.000Z',
        '2026-05-22T19:00:01.000Z',
        '2026-05-22T19:00:02.000Z',
        '2026-05-22T19:00:03.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      runtimeProfile: 'default',
      archiveItemId: 'generated-artifact:medgen_archive:artifact_followup_1',
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'default',
      kind: 'all',
      limit: 50,
    });
    expect(runArchiveService.listItems).not.toHaveBeenCalled();
    expect(materializeMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      mediaGenerationId: 'medgen_archive',
      conversationId: 'gemini_archive_conv',
      matchBasis: 'exact-title',
      jobId: 'hmj_gemini_archive_media_1',
    }));
    const completed = await service.readJob('hmj_gemini_archive_media_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      source: { type: 'archive_item', archiveItemId: 'generated-artifact:medgen_archive:artifact_followup_1' },
      result: {
        status: 'materialized',
        entries: [
          {
            kind: 'media',
            status: 'materialized',
            localPath: mediaPath,
            archiveItemId: 'generated-artifact:medgen_archive:artifact_followup_1',
            assetRoute: '/v1/archive/items/b64/gemini-archive/asset',
          },
        ],
      },
    });
  });

  it('skips ambiguous Gemini media title matches instead of opening an arbitrary conversation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-ambiguous-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_ambiguous:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_ambiguous',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_ambiguous',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_ambiguous',
      metadata: {
        mediaType: 'image',
      },
    });
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:40:00.000Z',
      kind: 'all' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              { id: 'gemini_duplicate_1', title: prompt, provider: 'gemini' as const },
              { id: 'gemini_duplicate_2', title: prompt, provider: 'gemini' as const },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:40:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => id === 'media-generation:medgen_ambiguous'
        ? {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:40:02.000Z',
            item: baseArchiveItem,
          }
        : null),
      upsertMediaGenerationItems: vi.fn(),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_ambiguous_1',
      now: sequenceNow([
        '2026-05-22T18:40:00.000Z',
        '2026-05-22T18:40:01.000Z',
        '2026-05-22T18:40:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeMediaGeneration).not.toHaveBeenCalled();
    const completed = await service.readJob('hmj_gemini_ambiguous_1');
    if (!completed) throw new Error('Expected completed Gemini ambiguity job.');
    expect(completed).toMatchObject({
      status: 'skipped',
      result: {
        entries: [
          {
            kind: 'media',
            status: 'skipped',
            reason: expect.stringContaining('Ambiguous account-mirror conversations for media generation medgen_ambiguous'),
          },
        ],
        metrics: {
          materialized: 0,
          skipped: 1,
        },
      },
    });
    expect(completed.result?.entries[0]?.reason).toContain(
      'no unique media recovery evidence is available (0 with cached media, 0 with usable timestamps, 0 with cached artifacts/files)',
    );
  });

  it('keeps Gemini media title matches ambiguous when multiple cached media matches exist', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-multi-media-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_multi_media:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_multi_media',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_multi_media',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_multi_media',
      metadata: {
        mediaType: 'image',
      },
    });
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:44:00.000Z',
      kind: 'all' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 2,
          },
          manifests: {
            projects: [],
            conversations: [
              { id: 'gemini_duplicate_media_1', title: prompt, provider: 'gemini' as const },
              { id: 'gemini_duplicate_media_2', title: prompt, provider: 'gemini' as const },
            ],
            artifacts: [],
            files: [],
            media: [
              {
                id: 'gemini-conversation-artifact:gemini_duplicate_media_1:artifact_followup_1',
                title: prompt,
                provider: 'gemini' as const,
                mediaType: 'image' as const,
                conversationId: 'gemini_duplicate_media_1',
              },
              {
                id: 'gemini-conversation-artifact:gemini_duplicate_media_2:artifact_followup_1',
                title: prompt,
                provider: 'gemini' as const,
                mediaType: 'image' as const,
                conversationId: 'gemini_duplicate_media_2',
              },
            ],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 2,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:44:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => id === 'media-generation:medgen_multi_media'
        ? {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:44:02.000Z',
            item: baseArchiveItem,
          }
        : null),
      upsertMediaGenerationItems: vi.fn(),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_multi_media_1',
      now: sequenceNow([
        '2026-05-22T18:44:00.000Z',
        '2026-05-22T18:44:01.000Z',
        '2026-05-22T18:44:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeMediaGeneration).not.toHaveBeenCalled();
    expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
    const completed = await service.readJob('hmj_gemini_multi_media_1');
    if (!completed) throw new Error('Expected completed Gemini ambiguity job.');
    expect(completed).toMatchObject({
      status: 'skipped',
      result: {
        entries: [
          {
            kind: 'media',
            status: 'skipped',
            reason: expect.stringContaining('Ambiguous account-mirror conversations for media generation medgen_multi_media'),
          },
        ],
        metrics: {
          materialized: 0,
          skipped: 1,
        },
      },
    });
    expect(completed.result?.entries[0]?.reason).toContain(
      'no unique media recovery evidence is available (2 with cached media, 0 with usable timestamps, 0 with cached artifacts/files)',
    );
  });

  it('keeps Gemini media title matches ambiguous when nearest timestamp evidence ties', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-gemini-time-tie-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of an asphalt secret agent';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_time_tie:artifact_followup_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'artifact_followup_1',
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_time_tie',
      artifactId: 'artifact_followup_1',
      fileName: 'artifact_followup_1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_time_tie',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'gemini',
      runtimeProfile: null,
      mediaGenerationId: 'medgen_time_tie',
      metadata: {
        mediaType: 'image',
      },
    });
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:46:00.000Z',
      kind: 'all' as const,
      limit: 5,
      entries: [
        {
          provider: 'gemini' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              {
                id: 'gemini_duplicate_time_1',
                title: prompt,
                provider: 'gemini' as const,
                updatedAt: '2026-05-17T22:09:44.957Z',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
              {
                id: 'gemini_duplicate_time_2',
                title: prompt,
                provider: 'gemini' as const,
                updatedAt: '2026-05-17T22:09:46.957Z',
                cachedArtifactCount: 0,
                cachedFileCount: 0,
              },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:46:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => id === 'media-generation:medgen_time_tie'
        ? {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:46:02.000Z',
            item: baseArchiveItem,
          }
        : null),
      upsertMediaGenerationItems: vi.fn(),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_gemini_time_tie_1',
      now: sequenceNow([
        '2026-05-22T18:46:00.000Z',
        '2026-05-22T18:46:01.000Z',
        '2026-05-22T18:46:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'gemini',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeMediaGeneration).not.toHaveBeenCalled();
    expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
    const completed = await service.readJob('hmj_gemini_time_tie_1');
    if (!completed) throw new Error('Expected completed Gemini timestamp-tie job.');
    expect(completed).toMatchObject({
      status: 'skipped',
      result: {
        entries: [
          {
            kind: 'media',
            status: 'skipped',
            reason: expect.stringContaining('Ambiguous account-mirror conversations for media generation medgen_time_tie'),
          },
        ],
        metrics: {
          materialized: 0,
          skipped: 1,
        },
      },
    });
    expect(completed.result?.entries[0]?.reason).toContain(
      'no unique media recovery evidence is available (0 with cached media, 2 with usable timestamps, 0 with cached artifacts/files)',
    );
  });

  it('skips Grok media reconciliation before active-surface materialization', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-materialize-grok-unsupported-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | undefined;
    const prompt = 'Generate an image of a chrome robot in a neon control room';
    const generatedArchiveItem = buildArchiveItem({
      id: 'generated-artifact:medgen_grok_unsupported:grok_imagine_visible_1',
      kind: 'generated_artifact',
      source: 'media_generation',
      title: 'grok-imagine-visible-1.png',
      provider: 'grok',
      runtimeProfile: 'default',
      mediaGenerationId: 'medgen_grok_unsupported',
      artifactId: 'grok_imagine_visible_1',
      fileName: 'grok-imagine-visible-1.png',
      mimeType: 'image/png',
      fileAvailable: false,
      metadata: {
        mediaType: 'image',
      },
    });
    const baseArchiveItem = buildArchiveItem({
      id: 'media-generation:medgen_grok_unsupported',
      kind: 'media_generation',
      source: 'media_generation',
      title: prompt,
      provider: 'grok',
      runtimeProfile: 'default',
      mediaGenerationId: 'medgen_grok_unsupported',
      metadata: {
        mediaType: 'image',
      },
    });
    const readCatalog = vi.fn(async () => ({
      object: 'account_mirror_catalog' as const,
      generatedAt: '2026-05-22T18:50:00.000Z',
      kind: 'all' as const,
      limit: 50,
      entries: [
        {
          provider: 'grok' as const,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          boundIdentityKey: 'user@example.com',
          status: 'eligible' as const,
          reason: 'eligible' as const,
          mirrorCompleteness: {
            state: 'complete' as const,
            summary: 'Complete.',
            remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
            signals: {
              projectsTruncated: false,
              conversationsTruncated: false,
              attachmentInventoryTruncated: false,
              attachmentCursorPresent: false,
            },
          },
          counts: {
            projects: 0,
            conversations: 1,
            artifacts: 0,
            files: 0,
            media: 0,
          },
          manifests: {
            projects: [],
            conversations: [
              { id: 'grok_conv_1', title: prompt, provider: 'grok' as const },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 1,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    }));
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-22T18:50:01.000Z',
        kind: 'generated_artifact' as const,
        limit: 10,
        items: [generatedArchiveItem],
        metrics: {
          total: 1,
          byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
        },
      })),
      readItem: vi.fn(async (id: string) => id === 'media-generation:medgen_grok_unsupported'
        ? {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-22T18:50:02.000Z',
            item: baseArchiveItem,
          }
        : null),
      upsertMediaGenerationItems: vi.fn(),
    } as unknown as RunArchiveService;
    const materializeMediaGeneration = vi.fn();
    const service = createHistoryMaterializationService({
      config: {},
      catalogService: {
        readCatalog,
        readItem: vi.fn(),
      },
      runArchiveService,
      generateId: () => 'hmj_grok_unsupported_1',
      now: sequenceNow([
        '2026-05-22T18:50:00.000Z',
        '2026-05-22T18:50:01.000Z',
        '2026-05-22T18:50:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
      materializeMediaGeneration,
    });

    await service.createJob({
      provider: 'grok',
      runtimeProfile: 'default',
      reconcile: true,
      assetKinds: ['media'],
      maxItems: 1,
    });
    if (!scheduled) throw new Error('Expected job to be scheduled.');
    await scheduled();

    expect(materializeMediaGeneration).not.toHaveBeenCalled();
    expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
    const completed = await service.readJob('hmj_grok_unsupported_1');
    expect(completed).toMatchObject({
      status: 'skipped',
      source: { type: 'reconciliation', provider: 'grok' },
      result: {
        entries: [
          {
            kind: 'media',
            status: 'skipped',
            reason: expect.stringContaining('Grok history media materialization is not supported'),
          },
        ],
        metrics: {
          materialized: 0,
          skipped: 1,
        },
      },
    });
  });
});

function sequenceNow(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString());
}

function sequenceId(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? 'hmj_sequence_fallback';
}

function createInMemoryHistoryMaterializationJobStore(
  initialJobs: HistoryMaterializationJob[],
): HistoryMaterializationJobStore {
  let jobs = [...initialJobs];
  return {
    async listJobs() {
      return [...jobs];
    },
    async readJob(id: string) {
      return jobs.find((job) => job.id === id) ?? null;
    },
    async upsertJob(job: HistoryMaterializationJob) {
      jobs = [
        job,
        ...jobs.filter((candidate) => candidate.id !== job.id),
      ];
    },
  };
}

function buildHistoryMaterializationJob(
  overrides: Partial<HistoryMaterializationJob> & { id: string; status: HistoryMaterializationJob['status'] },
): HistoryMaterializationJob {
  const { id, status, ...rest } = overrides;
  const active = status === 'queued' || status === 'running';
  const started = status === 'running' || (!active && status !== 'cancelled');
  return {
    object: 'history_materialization_job',
    id,
    source: {
      type: 'conversation',
      provider: 'chatgpt',
      conversationId: `${id}_conversation`,
    },
    request: {
      provider: 'chatgpt',
      runtimeProfile: 'default',
      conversationId: `${id}_conversation`,
      assetKinds: ['artifacts'],
    },
    sourceKey: id,
    status,
    createdAt: '2026-05-22T18:05:00.000Z',
    updatedAt: '2026-05-22T18:05:00.000Z',
    startedAt: started ? '2026-05-22T18:05:01.000Z' : null,
    completedAt: active ? null : '2026-05-22T18:05:02.000Z',
    attemptCount: status === 'queued' ? 0 : 1,
    result: null,
    error: null,
    message: 'History materialization job fixture.',
    ...rest,
  };
}

function buildArchiveItem(overrides: Partial<RunArchiveItem>): RunArchiveItem {
  return {
    id: 'archive-item',
    object: 'run_archive_item',
    kind: 'generated_artifact',
    source: 'media_generation',
    createdAt: '2026-05-17T22:09:45.957Z',
    updatedAt: '2026-05-17T22:09:45.957Z',
    title: null,
    status: 'succeeded',
    runtimeState: null,
    provider: null,
    runtimeProfile: null,
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: null,
    batchId: null,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: null,
    providerConversationUrl: null,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {},
    links: {},
    ...overrides,
  };
}

function emptyArchiveKindCounts(overrides: Partial<Record<RunArchiveItem['kind'], number>> = {}): Record<RunArchiveItem['kind'], number> {
  return {
    response: 0,
    response_batch: 0,
    team_run: 0,
    media_generation: 0,
    upload: 0,
    generated_artifact: 0,
    provider_conversation: 0,
    evidence: 0,
    ...overrides,
  };
}
