import { describe, expect, it, vi } from 'vitest';
import {
  createRunArchiveAttachEvidenceToolHandler,
  createRunArchiveBackfillToolHandler,
  createRunArchiveItemToolHandler,
  createRunArchiveSearchToolHandler,
} from '../src/mcp/tools/runArchive.js';

describe('mcp run archive tools', () => {
  it('searches the run archive through the shared archive service', async () => {
    const listItems = vi.fn(async () => ({
      object: 'run_archive' as const,
      generatedAt: '2026-05-16T16:30:00.000Z',
      kind: 'upload' as const,
      limit: 5,
      items: [
        {
          id: 'upload:resp_1:step_1:file_1',
          object: 'run_archive_item' as const,
          kind: 'upload' as const,
          source: 'runtime' as const,
          createdAt: '2026-05-16T16:00:00.000Z',
          updatedAt: '2026-05-16T16:00:00.000Z',
          title: 'file.pdf',
          status: 'succeeded',
          provider: 'chatgpt',
          runtimeProfile: 'default',
          browserProfile: 'default',
          boundIdentityKey: null,
          agentId: 'instant-chatgpt-ecochran76',
          teamId: null,
          responseId: 'resp_1',
          batchId: 'batch_1',
          batchIndex: 0,
          mediaGenerationId: null,
          providerConversationId: null,
          providerConversationUrl: null,
          artifactId: 'file_1',
          fileName: 'file.pdf',
          mimeType: null,
          localPath: '/tmp/file.pdf',
          uri: 'file:///tmp/file.pdf',
          cacheKey: 'path:/tmp/file.pdf',
          checksumSha256: null,
          fileAvailable: false,
          metadata: {},
          links: {},
        },
      ],
      metrics: {
        total: 1,
        byKind: {
          response: 0,
          response_batch: 0,
          team_run: 0,
          media_generation: 0,
          upload: 1,
          generated_artifact: 0,
          provider_conversation: 0,
          evidence: 0,
        },
      },
    }));
    const handler = createRunArchiveSearchToolHandler({
      service: {
        listItems,
        readItem: vi.fn(async () => null),
        readAsset: vi.fn(async () => null),
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
      },
    });

    const result = await handler({
      kind: 'upload',
      batchId: 'batch_1',
      limit: 5,
    });

    expect(listItems).toHaveBeenCalledWith({
      kind: 'upload',
      batchId: 'batch_1',
      limit: 5,
    });
    expect(result).toMatchObject({
      structuredContent: {
        object: 'run_archive',
        metrics: {
          total: 1,
        },
        items: [
          {
            id: 'upload:resp_1:step_1:file_1',
            kind: 'upload',
            localPath: '/tmp/file.pdf',
          },
        ],
      },
    });
  });

  it('reads one archive item and reports missing ids as tool errors', async () => {
    const readItem = vi.fn(async (id: string) =>
      id === 'response:resp_1'
        ? {
            object: 'run_archive_item_detail' as const,
            generatedAt: '2026-05-16T16:30:00.000Z',
            item: {
              id: 'response:resp_1',
              object: 'run_archive_item' as const,
              kind: 'response' as const,
              source: 'runtime' as const,
              createdAt: '2026-05-16T16:00:00.000Z',
              updatedAt: '2026-05-16T16:00:00.000Z',
              title: 'Prompt',
              status: 'succeeded',
              provider: 'chatgpt',
              runtimeProfile: 'default',
              browserProfile: null,
              boundIdentityKey: null,
              agentId: 'instant-chatgpt-ecochran76',
              teamId: null,
              responseId: 'resp_1',
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
            },
          }
        : null,
    );
    const handler = createRunArchiveItemToolHandler({
      service: {
        listItems: vi.fn(async () => {
          throw new Error('not used');
        }),
        readItem,
        readAsset: vi.fn(async () => null),
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
      },
    });

    await expect(handler({ id: 'response:resp_1' })).resolves.toMatchObject({
      structuredContent: {
        object: 'run_archive_item_detail',
        item: {
          id: 'response:resp_1',
        },
      },
    });
    await expect(handler({ id: 'missing' })).resolves.toMatchObject({
      isError: true,
    });
  });

  it('backfills the run archive index through the shared archive service', async () => {
    const backfillIndex = vi.fn(async () => ({
      object: 'run_archive_backfill' as const,
      generatedAt: '2026-05-16T16:30:00.000Z',
      index: {
        updatedAt: '2026-05-16T16:30:00.000Z',
        itemCount: 3,
      },
      metrics: {
        byKind: {
          response: 1,
          response_batch: 0,
          team_run: 0,
          media_generation: 0,
          upload: 1,
          generated_artifact: 1,
          provider_conversation: 0,
          evidence: 0,
        },
      },
    }));
    const handler = createRunArchiveBackfillToolHandler({
      service: {
        listItems: vi.fn(async () => {
          throw new Error('not used');
        }),
        readItem: vi.fn(async () => null),
        readAsset: vi.fn(async () => null),
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
        backfillIndex,
      },
    });

    await expect(handler()).resolves.toMatchObject({
      structuredContent: {
        object: 'run_archive_backfill',
        index: {
          itemCount: 3,
        },
      },
    });
    expect(backfillIndex).toHaveBeenCalledOnce();
  });

  it('attaches caller-owned evidence through the shared archive service', async () => {
    const attachEvidence = vi.fn(async () => ({
      object: 'run_archive_evidence_result' as const,
      generatedAt: '2026-05-16T16:30:00.000Z',
      evidence: {
        id: 'evidence_test',
        object: 'run_archive_evidence' as const,
        createdAt: '2026-05-16T16:30:00.000Z',
        updatedAt: '2026-05-16T16:30:00.000Z',
        producer: 'course-agent',
        schema: 'grading-review.v1',
        status: 'pass' as const,
        title: 'Score review',
        summary: 'All checks passed.',
        responseId: 'resp_1',
        batchId: 'batch_1',
        archiveItemId: 'generated-artifact:resp_1:feedback_json',
        providerConversationId: null,
        data: { validRows: 22 },
        metadata: {},
      },
      item: {
        id: 'evidence:evidence_test',
        object: 'run_archive_item' as const,
        kind: 'evidence' as const,
        source: 'evidence' as const,
        createdAt: '2026-05-16T16:30:00.000Z',
        updatedAt: '2026-05-16T16:30:00.000Z',
        title: 'Score review',
        status: 'pass',
        provider: null,
        runtimeProfile: null,
        browserProfile: null,
        boundIdentityKey: null,
        agentId: null,
        teamId: null,
        responseId: 'resp_1',
        batchId: 'batch_1',
        batchIndex: null,
        mediaGenerationId: null,
        providerConversationId: null,
        providerConversationUrl: null,
        artifactId: 'generated-artifact:resp_1:feedback_json',
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
    }));
    const handler = createRunArchiveAttachEvidenceToolHandler({
      service: {
        listItems: vi.fn(async () => {
          throw new Error('not used');
        }),
        readItem: vi.fn(async () => null),
        readAsset: vi.fn(async () => null),
        attachEvidence,
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
      },
    });

    await expect(handler({
      producer: 'course-agent',
      schema: 'grading-review.v1',
      status: 'pass',
      responseId: 'resp_1',
      data: { validRows: 22 },
    })).resolves.toMatchObject({
      structuredContent: {
        object: 'run_archive_evidence_result',
        item: {
          id: 'evidence:evidence_test',
          kind: 'evidence',
        },
      },
    });
    expect(attachEvidence).toHaveBeenCalledWith({
      producer: 'course-agent',
      schema: 'grading-review.v1',
      status: 'pass',
      responseId: 'resp_1',
      data: { validRows: 22 },
    });
  });
});
