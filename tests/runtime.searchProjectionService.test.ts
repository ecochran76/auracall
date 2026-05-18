import { describe, expect, it, vi } from 'vitest';
import type { AccountMirrorCatalogService } from '../src/accountMirror/catalogService.js';
import type { RunArchiveService } from '../src/runtime/archiveService.js';
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
      readCatalog: vi.fn(async () => ({
        object: 'account_mirror_catalog',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
        limit: 500,
        entries: [
          {
            provider: 'chatgpt',
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
      listItems: vi.fn(async () => ({
        object: 'run_archive',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
        limit: 500,
        items: [
          {
            id: 'generated_artifact:resp_1:legacy_readout.json',
            object: 'run_archive_item',
            kind: 'generated_artifact',
            source: 'runtime',
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

    const service = createSearchProjectionService({
      accountMirrorCatalogService,
      runArchiveService,
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
  });

  it('pages rows with opaque cursors', async () => {
    const accountMirrorCatalogService: AccountMirrorCatalogService = {
      readCatalog: vi.fn(async () => ({
        object: 'account_mirror_catalog',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
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
      readCatalog: vi.fn(async () => ({
        object: 'account_mirror_catalog',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
        limit: 500,
        entries: [],
        metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      })),
      readItem: vi.fn(async () => null),
    };
    const runArchiveService = {
      listItems: vi.fn(async () => ({
        object: 'run_archive',
        generatedAt: '2026-05-18T12:00:00.000Z',
        kind: 'all',
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
