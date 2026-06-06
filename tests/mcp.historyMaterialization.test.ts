import { describe, expect, it, vi } from 'vitest';
import {
  createHistoryMaterializationCancelToolHandler,
  createHistoryMaterializationCreateToolHandler,
  createHistoryMaterializationJobsToolHandler,
  createHistoryMaterializationJobToolHandler,
} from '../src/mcp/tools/historyMaterialization.js';
import {
  HistoryMaterializationJobControlError,
  type HistoryMaterializationJob,
} from '../src/runtime/historyMaterializationService.js';

describe('mcp history materialization tools', () => {
  it('queues history materialization jobs through the shared service', async () => {
    const createJob = vi.fn(async () => ({
      object: 'history_materialization_job_create_result' as const,
      generatedAt: '2026-05-22T20:30:00.000Z',
      reused: false,
      reuseReason: null,
      job: historyJob('queued'),
    }));
    const handler = createHistoryMaterializationCreateToolHandler({
      service: {
        createJob,
        listJobs: vi.fn(),
        readJob: vi.fn(),
        cancelJob: vi.fn(),
        runJob: vi.fn(),
        recoverInterruptedJobs: vi.fn(),
      },
    });

    const result = await handler({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations',
      conversationIds: ['conv_1', 'conv_2'],
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
      maxItems: 1,
    });

    expect(createJob).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations',
      conversationIds: ['conv_1', 'conv_2'],
      refreshSnapshot: true,
      assetKinds: ['artifacts'],
      maxItems: 1,
    });
    expect(result).toMatchObject({
      structuredContent: {
        object: 'history_materialization_job_create_result',
        job: {
          id: 'hmj_mcp_1',
          status: 'queued',
        },
      },
    });
  });

  it('lists, reads, and cancels history materialization jobs', async () => {
    const service = {
      createJob: vi.fn(),
      listJobs: vi.fn(async () => ({
        object: 'history_materialization_jobs' as const,
        generatedAt: '2026-05-22T20:31:00.000Z',
        status: 'terminal' as const,
        provider: 'chatgpt' as const,
        runtimeProfile: 'default',
        sourceType: 'catalog_item' as const,
        limit: 2,
        jobs: [historyJob('succeeded')],
        metrics: {
          total: 1,
          byStatus: { succeeded: 1 },
          active: 0,
          terminal: 1,
        },
      })),
      readJob: vi.fn(async () => historyJob('succeeded')),
      cancelJob: vi.fn(async () => historyJob('cancelled')),
      runJob: vi.fn(),
      recoverInterruptedJobs: vi.fn(),
    };

    const list = await createHistoryMaterializationJobsToolHandler({ service })({
      status: 'terminal',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      sourceType: 'catalog_item',
      limit: 2,
    });
    expect(service.listJobs).toHaveBeenCalledWith({
      status: 'terminal',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      sourceType: 'catalog_item',
      limit: 2,
    });
    expect(list.structuredContent).toMatchObject({
      object: 'history_materialization_jobs',
      metrics: { total: 1 },
    });

    const read = await createHistoryMaterializationJobToolHandler({ service })({ id: 'hmj_mcp_1' });
    expect(read.structuredContent).toMatchObject({ id: 'hmj_mcp_1', status: 'succeeded' });

    const cancelled = await createHistoryMaterializationCancelToolHandler({ service })({ id: 'hmj_mcp_1' });
    expect(cancelled.structuredContent).toMatchObject({ id: 'hmj_mcp_1', status: 'cancelled' });
  });

  it('reports history materialization cancel control errors as tool errors', async () => {
    const cancelJob = vi.fn(async () => {
      throw new HistoryMaterializationJobControlError(
        'History materialization job hmj_mcp_1 is running; only queued jobs can be cancelled before provider work starts.',
        409,
      );
    });
    const handler = createHistoryMaterializationCancelToolHandler({
      service: {
        createJob: vi.fn(),
        listJobs: vi.fn(),
        readJob: vi.fn(),
        cancelJob,
        runJob: vi.fn(),
        recoverInterruptedJobs: vi.fn(),
      },
    });

    await expect(handler({ id: 'hmj_mcp_1' })).resolves.toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text: 'History materialization job hmj_mcp_1 is running; only queued jobs can be cancelled before provider work starts.',
        },
      ],
    });
    expect(cancelJob).toHaveBeenCalledWith('hmj_mcp_1');
  });
});

function historyJob(status: 'queued' | 'succeeded' | 'cancelled'): HistoryMaterializationJob {
  return {
    object: 'history_materialization_job' as const,
    id: 'hmj_mcp_1',
    source: {
      type: 'catalog_item' as const,
      catalogItemId: 'conv_1',
      catalogKind: 'conversations' as const,
    },
    request: {
      provider: 'chatgpt' as const,
      runtimeProfile: 'default',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations' as const,
    },
    sourceKey: '{}',
    status,
    createdAt: '2026-05-22T20:30:00.000Z',
    updatedAt: '2026-05-22T20:31:00.000Z',
    startedAt: status === 'queued' ? null : '2026-05-22T20:30:01.000Z',
    completedAt: status === 'queued' ? null : '2026-05-22T20:31:00.000Z',
    attemptCount: status === 'queued' ? 0 : 1,
    result: null,
    error: null,
    message: 'History materialization job queued.',
  };
}
