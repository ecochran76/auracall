import { describe, expect, it, vi } from 'vitest';
import type { AccountMirrorCatalogResult, AccountMirrorCatalogService } from '../src/accountMirror/catalogService.js';
import type {
  ArchiveMaterializationJob,
  ArchiveMaterializationJobListResult,
  ArchiveMaterializationJobService,
} from '../src/runtime/archiveMaterializationJobService.js';
import type { RunArchiveItem, RunArchiveListResult, RunArchiveService } from '../src/runtime/archiveService.js';
import { createSearchProjectionService } from '../src/runtime/searchProjectionService.js';

const completeMirror = {
  state: 'complete' as const,
  summary: 'complete',
  remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
  signals: {
    projectsTruncated: false,
    conversationsTruncated: false,
    attachmentInventoryTruncated: false,
    attachmentCursorPresent: false,
  },
};

describe('search projection service', () => {
  it('merges account mirror conversations with archive rows and returns facets', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async (): Promise<AccountMirrorCatalogResult> => ({
        object: 'account_mirror_catalog' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        entries: [
          {
            provider: 'chatgpt',
            tenantKey: 'service-account:chatgpt:eric.cochran@soylei.com',
            bindingKey: 'binding:chatgpt:wsl-chrome-3:wsl-chrome-3',
            runtimeProfileId: 'wsl-chrome-3',
            browserProfileId: 'wsl-chrome-3',
            boundIdentityKey: 'eric.cochran@soylei.com',
            status: 'eligible',
            reason: 'eligible',
            mirrorCompleteness: completeMirror,
            manifests: {
              projects: [],
              conversations: [
                {
                  id: '6a0b1ecf-b4a0-83ea-9e93-a244355584c7',
                  title: 'TTP Proposal Review Guide',
                  provider: 'chatgpt',
                  url: 'https://chatgpt.com/c/6a0b1ecf-b4a0-83ea-9e93-a244355584c7',
                  messageCount: 8,
                  cachedFileCount: 2,
                  conversationFreshness: {
                    object: 'account_mirror_conversation_freshness',
                    state: 'missing_assets',
                    reasons: ['missing_local_assets'],
                    indexObservedAt: '2026-05-18T12:00:00.000Z',
                    indexSource: 'left-rail',
                    indexRank: 0,
                    detailObservedAt: '2026-05-18T11:59:00.000Z',
                    manifestObservedAt: '2026-05-18T11:59:00.000Z',
                    materializedAt: null,
                    routeabilityObservedAt: null,
                    routeabilityState: 'unknown',
                    conversationFingerprint: 'sha256:test',
                    detailCompleteness: 'complete',
                    assetCompleteness: 'partial',
                    assetCounts: {
                      known: 2,
                      local: 1,
                      missingLocal: 1,
                    },
                  },
                },
              ],
              artifacts: [],
              files: [],
              media: [],
            },
            counts: { projects: 0, conversations: 1, artifacts: 0, files: 0, media: 0 },
          },
        ],
        metrics: { targets: 1, projects: 0, conversations: 1, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async (): Promise<RunArchiveListResult> => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        items: [
          {
            id: 'generated_artifact:resp_1:legacy_readout.json',
            object: 'run_archive_item' as const,
            kind: 'generated_artifact' as const,
            source: 'runtime' as const,
            createdAt: '2026-05-18T15:00:00.000Z',
            updatedAt: '2026-05-18T15:00:00.000Z',
            title: 'legacy_readout.json',
            status: 'succeeded',
            provider: 'chatgpt',
            runtimeProfile: 'wsl-chrome-3',
            browserProfile: 'wsl-chrome-3',
            projectId: 'Transcripts',
            boundIdentityKey: 'eric.cochran@soylei.com',
            agentId: 'agent:pro-extended-chatgpt-soylei',
            teamId: null,
            responseId: 'resp_1',
            batchId: 'batch_1',
            batchIndex: 0,
            mediaGenerationId: null,
            providerConversationId: '6a0b1ecf-b4a0-83ea-9e93-a244355584c7',
            providerConversationUrl: 'https://chatgpt.com/c/6a0b1ecf-b4a0-83ea-9e93-a244355584c7',
            artifactId: 'legacy_readout.json',
            fileName: 'legacy_readout.json',
            mimeType: 'application/json',
            localPath: '/tmp/legacy_readout.json',
            uri: null,
            cacheKey: 'sha256:abc',
            checksumSha256: 'abc',
            fileAvailable: true,
            metadata: { rubric: 'legacy' },
            links: { asset: '/v1/archive/items/b64/abc/asset' },
          },
        ],
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
      readItem: vi.fn(async () => null),
      readAsset: vi.fn(async () => null),
      lookupAsset: vi.fn(async () => {
        throw new Error('not used');
      }),
      attachEvidence: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertResponseItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertBatchItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      backfillIndex: vi.fn(async () => {
        throw new Error('not used');
      }),
    } satisfies RunArchiveService;
    const archiveMaterializationJobService = {
      listJobs: vi.fn(async (): Promise<ArchiveMaterializationJobListResult> => ({
        object: 'run_archive_materialization_jobs' as const,
        generatedAt: '2026-05-18T15:05:00.000Z',
        status: null,
        archiveItemId: null,
        limit: 500,
        jobs: [
          {
            object: 'run_archive_materialization_job' as const,
            id: 'ramj_search_1',
            archiveItemId: 'generated_artifact:resp_1:legacy_readout.json',
            status: 'succeeded' as const,
            createdAt: '2026-05-18T15:01:00.000Z',
            updatedAt: '2026-05-18T15:03:00.000Z',
            startedAt: '2026-05-18T15:02:00.000Z',
            completedAt: '2026-05-18T15:03:00.000Z',
            attemptCount: 1,
            result: null,
            error: null,
            message: 'Archive item materialized and indexed.',
          },
        ],
        metrics: {
          total: 1,
          byStatus: { succeeded: 1 },
          active: 0,
          terminal: 1,
        },
      })),
    } as unknown as ArchiveMaterializationJobService;

    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
      archiveMaterializationJobService,
      now: () => new Date('2026-05-18T14:00:00.000Z'),
    });

    const result = await service.search({ limit: 10 });

    expect(result.object).toBe('search_results');
    expect(result.rows.map((row) => row.kind)).toEqual(['artifact', 'conversation']);
    expect(result.rows[0]).toMatchObject({
      source: 'run_archive',
      title: 'legacy_readout.json',
      provider: 'chatgpt',
      tenant: 'eric.cochran@soylei.com',
    });
    expect(result.facets.providers).toEqual([{ value: 'chatgpt', count: 2 }]);
    expect(result.facets.kinds).toEqual([
      { value: 'artifact', count: 1 },
      { value: 'conversation', count: 1 },
    ]);
    expect(result.facets.materialization).toEqual([{ value: 'succeeded', count: 1 }]);
    const conversationRow = result.rows.find((row) => row.sourceKind === 'conversations');
    expect(conversationRow).toMatchObject({
      source: 'account_mirror',
      metadata: {
        freshnessState: 'missing_assets',
        routeabilityState: 'unknown',
        conversationFreshness: {
          state: 'missing_assets',
          assetCounts: {
            missingLocal: 1,
          },
        },
      },
    });

    const availableArtifacts = await service.search({ kind: 'artifact', assetAvailability: 'available', limit: 10 });

    expect(availableArtifacts.rows).toHaveLength(1);
    expect(availableArtifacts.rows[0]).toMatchObject({
      source: 'run_archive',
      title: 'legacy_readout.json',
      metadata: {
        fileAvailable: true,
        materializationStatus: 'succeeded',
        assetFreshness: {
          availability: 'available',
          materializationJobId: 'ramj_search_1',
          materializedAt: '2026-05-18T15:03:00.000Z',
          evidenceUpdatedAt: '2026-05-18T15:03:00.000Z',
          source: 'materialization_job',
        },
        materializationJob: {
          id: 'ramj_search_1',
          status: 'succeeded',
        },
      },
    });
    expect(runArchiveService.listItems).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'generated_artifact',
      assetAvailability: 'available',
    }));

    const materializedArtifacts = await service.search({ kind: 'artifact', materialization: 'succeeded', limit: 10 });
    expect(materializedArtifacts.rows.map((row) => row.itemId)).toEqual(['generated_artifact:resp_1:legacy_readout.json']);
  });

  it('refreshes available asset facets after an archive materialization job completes', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async (): Promise<AccountMirrorCatalogResult> => ({
        object: 'account_mirror_catalog' as const,
        generatedAt: '2026-05-22T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    let archiveItem: RunArchiveItem = {
      id: 'generated_artifact:resp_asset_refresh:artifact_1',
      object: 'run_archive_item',
      kind: 'generated_artifact',
      source: 'runtime',
      createdAt: '2026-05-22T12:00:00.000Z',
      updatedAt: '2026-05-22T12:00:00.000Z',
      title: 'artifact_1.json',
      status: 'succeeded',
      runtimeState: 'terminal',
      provider: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      browserProfile: 'wsl-chrome-3',
      projectId: 'Transcripts',
      boundIdentityKey: 'ecochran76@gmail.com',
      agentId: 'agent:pro-extended-chatgpt-soylei',
      teamId: null,
      responseId: 'resp_asset_refresh',
      batchId: 'batch_asset_refresh',
      batchIndex: 0,
      mediaGenerationId: null,
      providerConversationId: 'conv_asset_refresh',
      providerConversationUrl: 'https://chatgpt.com/c/conv_asset_refresh',
      artifactId: 'artifact_1',
      fileName: null,
      mimeType: null,
      localPath: null,
      uri: null,
      cacheKey: null,
      checksumSha256: null,
      fileAvailable: false,
      metadata: {},
      links: {},
    };
    let jobs: ArchiveMaterializationJob[] = [];
    const runArchiveService = {
      listItems: vi.fn(async (request = {}): Promise<RunArchiveListResult> => {
        const availability = archiveItem.fileAvailable === true ? 'available' : archiveItem.fileAvailable === false ? 'unavailable' : 'pending';
        const items = [
          archiveItem,
        ].filter((item) => !request.kind || request.kind === 'all' || request.kind === item.kind)
          .filter((item) => typeof request.fileAvailable !== 'boolean' || item.fileAvailable === request.fileAvailable)
          .filter(() => !request.assetAvailability || request.assetAvailability === availability);
        return {
          object: 'run_archive' as const,
          generatedAt: '2026-05-22T12:00:00.000Z',
          kind: request.kind ?? 'all',
          limit: request.limit ?? 500,
          items,
          metrics: {
            total: items.length,
            byKind: {
              response: 0,
              response_batch: 0,
              team_run: 0,
              media_generation: 0,
              upload: 0,
              generated_artifact: items.length,
              provider_conversation: 0,
              evidence: 0,
            },
          },
        };
      }),
      readItem: vi.fn(async () => null),
      readAsset: vi.fn(async () => null),
      lookupAsset: vi.fn(async () => {
        throw new Error('not used');
      }),
      attachEvidence: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertResponseItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertBatchItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      backfillIndex: vi.fn(async () => {
        throw new Error('not used');
      }),
    } satisfies RunArchiveService;
    const archiveMaterializationJobService = {
      listJobs: vi.fn(async (): Promise<ArchiveMaterializationJobListResult> => ({
        object: 'run_archive_materialization_jobs' as const,
        generatedAt: '2026-05-22T12:00:00.000Z',
        status: null,
        archiveItemId: null,
        limit: 500,
        jobs,
        metrics: {
          total: jobs.length,
          byStatus: jobs.reduce<Record<string, number>>((counts, job) => {
            counts[job.status] = (counts[job.status] ?? 0) + 1;
            return counts;
          }, {}),
          active: jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
          terminal: jobs.filter((job) => job.status !== 'queued' && job.status !== 'running').length,
        },
      })),
    } as unknown as ArchiveMaterializationJobService;

    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
      archiveMaterializationJobService,
      now: () => new Date('2026-05-22T12:00:00.000Z'),
    });

    const before = await service.search({ kind: 'artifact', limit: 10 });
    expect(before.facets.assetAvailability).toEqual([{ value: 'unavailable', count: 1 }]);
    expect((await service.search({ kind: 'artifact', assetAvailability: 'available', limit: 10 })).rows).toHaveLength(0);

    archiveItem = {
      ...archiveItem,
      updatedAt: '2026-05-22T12:01:00.000Z',
      fileName: 'artifact_1.json',
      mimeType: 'application/json',
      localPath: '/tmp/artifact_1.json',
      cacheKey: 'sha256:artifact_1',
      checksumSha256: 'artifact_1',
      fileAvailable: true,
      metadata: { materialization: { status: 'succeeded' } },
      links: { asset: '/v1/archive/items/b64/artifact_1/asset' },
    };
    jobs = [
      {
        object: 'run_archive_materialization_job',
        id: 'ramj_asset_refresh',
        archiveItemId: archiveItem.id,
        status: 'succeeded',
        createdAt: '2026-05-22T12:00:30.000Z',
        updatedAt: '2026-05-22T12:01:00.000Z',
        startedAt: '2026-05-22T12:00:45.000Z',
        completedAt: '2026-05-22T12:01:00.000Z',
        attemptCount: 1,
        result: null,
        error: null,
        message: 'Archive item materialized and indexed.',
      },
    ];

    const after = await service.search({ kind: 'artifact', limit: 10 });
    expect(after.facets.assetAvailability).toEqual([{ value: 'available', count: 1 }]);
    expect(after.facets.materialization).toEqual([{ value: 'succeeded', count: 1 }]);

    const available = await service.search({ kind: 'artifact', assetAvailability: 'available', limit: 10 });
    expect(available.rows.map((row) => row.itemId)).toEqual(['generated_artifact:resp_asset_refresh:artifact_1']);
    expect(available.rows[0]).toMatchObject({
      metadata: {
        fileAvailable: true,
        materializationStatus: 'succeeded',
        assetFreshness: {
          availability: 'available',
          materializationJobId: 'ramj_asset_refresh',
          materializedAt: '2026-05-22T12:01:00.000Z',
          evidenceUpdatedAt: '2026-05-22T12:01:00.000Z',
          source: 'materialization_job',
        },
        materializationJob: {
          id: 'ramj_asset_refresh',
          status: 'succeeded',
        },
      },
    });
  });

  it('projects history-materialized account mirror archive rows into materialization facets', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async (): Promise<AccountMirrorCatalogResult> => ({
        object: 'account_mirror_catalog' as const,
        generatedAt: '2026-05-23T03:30:00.000Z',
        kind: 'all' as const,
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async (): Promise<RunArchiveListResult> => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-23T03:30:00.000Z',
        kind: 'all' as const,
        limit: 500,
        items: [
          {
            id: 'history-generated-artifact:chatgpt:wsl-chrome-3:conv_1:artifact_1',
            object: 'run_archive_item' as const,
            kind: 'generated_artifact' as const,
            source: 'account_mirror' as const,
            createdAt: '2026-05-23T03:29:00.000Z',
            updatedAt: '2026-05-23T03:29:59.000Z',
            title: 'legacy_readout.json',
            status: 'materialized',
            runtimeState: null,
            provider: 'chatgpt',
            runtimeProfile: 'wsl-chrome-3',
            browserProfile: 'default',
            projectId: 'project_1',
            boundIdentityKey: 'user@example.com',
            agentId: null,
            teamId: null,
            responseId: null,
            batchId: null,
            batchIndex: null,
            mediaGenerationId: null,
            providerConversationId: 'conv_1',
            providerConversationUrl: 'https://chatgpt.com/c/conv_1',
            artifactId: 'artifact_1',
            fileName: 'legacy_readout.json',
            mimeType: 'application/json',
            localPath: '/tmp/legacy_readout.json',
            uri: null,
            cacheKey: null,
            checksumSha256: 'sha256-history',
            fileAvailable: true,
            metadata: {
              historyMaterializationJobId: 'hmj_history_1',
              materialization: {
                status: 'materialized',
                source: 'history-materialization',
                method: 'captured-anchor-fetch',
              },
            },
            links: {
              asset: '/v1/archive/items/b64/history/asset',
            },
          },
        ],
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
      readItem: vi.fn(async () => null),
      readAsset: vi.fn(async () => null),
      lookupAsset: vi.fn(async () => {
        throw new Error('not used');
      }),
      attachEvidence: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertResponseItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertBatchItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      backfillIndex: vi.fn(async () => {
        throw new Error('not used');
      }),
    } satisfies RunArchiveService;
    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
      now: () => new Date('2026-05-23T03:31:00.000Z'),
    });

    const result = await service.search({ kind: 'artifact', materialization: 'succeeded', limit: 10 });

    expect(result.rows.map((row) => row.itemId)).toEqual([
      'history-generated-artifact:chatgpt:wsl-chrome-3:conv_1:artifact_1',
    ]);
    expect(result.facets.materialization).toEqual([{ value: 'succeeded', count: 1 }]);
    expect(result.rows[0]).toMatchObject({
      metadata: {
        fileAvailable: true,
        materializationStatus: 'succeeded',
        assetFreshness: {
          availability: 'available',
          materializationJobId: 'hmj_history_1',
          materializedAt: '2026-05-23T03:29:59.000Z',
          evidenceUpdatedAt: '2026-05-23T03:29:59.000Z',
          source: 'history_materialization',
        },
      },
    });
  });

  it('pages rows with opaque cursors', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async (): Promise<AccountMirrorCatalogResult> => ({
        object: 'account_mirror_catalog' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async (): Promise<RunArchiveListResult> => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        items: ['1', '2'].map((id) => ({
          id: `response:resp_${id}`,
          object: 'run_archive_item' as const,
          kind: 'response' as const,
          source: 'runtime' as const,
          createdAt: `2026-05-18T12:0${id}:00.000Z`,
          updatedAt: `2026-05-18T12:0${id}:00.000Z`,
          title: `Response ${id}`,
          status: 'succeeded',
          provider: 'chatgpt',
          runtimeProfile: 'default',
          browserProfile: 'default',
          projectId: null,
          boundIdentityKey: 'ecochran76@gmail.com',
          agentId: null,
          teamId: null,
          responseId: `resp_${id}`,
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
        })),
        metrics: {
          total: 2,
          byKind: {
            response: 2,
            response_batch: 0,
            team_run: 0,
            media_generation: 0,
            upload: 0,
            generated_artifact: 0,
            provider_conversation: 0,
            evidence: 0,
          },
        },
      })),
      readItem: vi.fn(async () => null),
      readAsset: vi.fn(async () => null),
      lookupAsset: vi.fn(async () => {
        throw new Error('not used');
      }),
      attachEvidence: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertResponseItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertBatchItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      backfillIndex: vi.fn(async () => {
        throw new Error('not used');
      }),
    } satisfies RunArchiveService;

    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
      now: () => new Date('2026-05-18T14:00:00.000Z'),
    });

    const first = await service.search({ limit: 1 });
    const second = await service.search({ limit: 1, cursor: first.nextCursor });

    expect(first.rows).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]?.id).not.toBe(first.rows[0]?.id);
    expect(second.nextCursor).toBeNull();
  });

  it('uses transient runtime state as archive row display status', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async (): Promise<AccountMirrorCatalogResult> => ({
        object: 'account_mirror_catalog' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async (): Promise<RunArchiveListResult> => ({
        object: 'run_archive' as const,
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all' as const,
        limit: 500,
        items: [
          {
            id: 'response:resp_finalizing_search',
            object: 'run_archive_item' as const,
            kind: 'response' as const,
            source: 'runtime' as const,
            createdAt: '2026-05-18T12:00:00.000Z',
            updatedAt: '2026-05-18T12:01:00.000Z',
            title: 'Finalizing transcript readout',
            status: 'running',
            runtimeState: 'finalizing' as const,
            provider: 'chatgpt',
            runtimeProfile: 'wsl-chrome-3',
            browserProfile: 'wsl-chrome-3',
            projectId: 'Transcripts',
            boundIdentityKey: 'ecochran76@gmail.com',
            agentId: 'pro-extended-chatgpt-soylei-transcripts',
            teamId: null,
            responseId: 'resp_finalizing_search',
            batchId: 'batch_finalizing_search',
            batchIndex: 0,
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
          },
        ],
        metrics: {
          total: 1,
          byKind: {
            response: 1,
            response_batch: 0,
            team_run: 0,
            media_generation: 0,
            upload: 0,
            generated_artifact: 0,
            provider_conversation: 0,
            evidence: 0,
          },
        },
      })),
      readItem: vi.fn(async () => null),
      readAsset: vi.fn(async () => null),
      lookupAsset: vi.fn(async () => {
        throw new Error('not used');
      }),
      attachEvidence: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertResponseItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertBatchItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      upsertMediaGenerationItems: vi.fn(async () => {
        throw new Error('not used');
      }),
      backfillIndex: vi.fn(async () => {
        throw new Error('not used');
      }),
    } satisfies RunArchiveService;

    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
      now: () => new Date('2026-05-18T14:00:00.000Z'),
    });

    const result = await service.search({ status: 'finalizing', limit: 10 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'archive:response:resp_finalizing_search',
      status: 'finalizing',
      runtimeState: 'finalizing',
      metadata: {
        rawStatus: 'running',
        runtimeState: 'finalizing',
      },
    });
    expect(result.facets.statuses).toEqual([{ value: 'finalizing', count: 1 }]);
  });
});
