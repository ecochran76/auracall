import { describe, expect, it, vi } from 'vitest';
import {
  createResponseBatchCreateToolHandler,
  createResponseBatchStatusToolHandler,
} from '../src/mcp/tools/responseBatch.js';
import type { ResponseBatchStatus } from '../src/runtime/responseBatchService.js';

const runningBatch = {
  id: 'batch_mcp_1',
  object: 'response_batch_status',
  status: 'running',
  createdAt: '2026-05-12T14:00:00.000Z',
  updatedAt: '2026-05-12T14:00:00.000Z',
  metadata: { course: 'ChE 4470' },
  limits: { maxConcurrentRuns: 2, maxBrowserInteractionsPerMinute: 8 },
  counts: {
    total: 2,
    in_progress: 2,
    completed: 0,
    failed: 0,
    cancelled: 0,
    missing: 0,
  },
  jobs: [
    {
      index: 0,
      responseId: 'resp_student_1',
      model: 'agent:pro-extended-chatgpt-soylei',
      agent: 'pro-extended-chatgpt-soylei',
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      createdAt: '2026-05-12T14:00:00.000Z',
      status: 'in_progress',
      completedAt: null,
      failure: null,
    },
    {
      index: 1,
      responseId: 'resp_student_2',
      model: 'agent:pro-extended-chatgpt-soylei',
      agent: 'pro-extended-chatgpt-soylei',
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      createdAt: '2026-05-12T14:00:00.000Z',
      status: 'in_progress',
      completedAt: null,
      failure: null,
    },
  ],
} satisfies ResponseBatchStatus;

describe('mcp response batch tools', () => {
  it('creates a response batch and returns pollable child response ids', async () => {
    const createBatch = vi.fn(async () => runningBatch);
    const handler = createResponseBatchCreateToolHandler({
      createBatch,
      readBatchStatus: vi.fn(),
    });

    const result = await handler({
      metadata: { course: 'ChE 4470' },
      limits: { maxConcurrentRuns: 2, maxBrowserInteractionsPerMinute: 8 },
      requests: [
        {
          model: 'agent:pro-extended-chatgpt-soylei',
          input: 'Grade student 1.',
          auracall: {
            agent: 'pro-extended-chatgpt-soylei',
            service: 'chatgpt',
            runtimeProfile: 'wsl-chrome-3',
          },
        },
        {
          model: 'agent:pro-extended-chatgpt-soylei',
          input: 'Grade student 2.',
          auracall: {
            agent: 'pro-extended-chatgpt-soylei',
            service: 'chatgpt',
            runtimeProfile: 'wsl-chrome-3',
          },
        },
      ],
    });

    expect(createBatch).toHaveBeenCalledWith({
      metadata: { course: 'ChE 4470' },
      limits: { maxConcurrentRuns: 2, maxBrowserInteractionsPerMinute: 8 },
      requests: expect.any(Array),
    });
    expect(result).toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'Response batch batch_mcp_1 is running: 2 jobs.' }],
      structuredContent: {
        id: 'batch_mcp_1',
        status: 'running',
        jobs: [{ responseId: 'resp_student_1' }, { responseId: 'resp_student_2' }],
      },
    });
  });

  it('reads response batch status without resubmitting prompts', async () => {
    const readBatchStatus = vi.fn(async () => ({
      ...runningBatch,
      status: 'completed' as const,
      counts: { ...runningBatch.counts, in_progress: 0, completed: 2 },
      jobs: runningBatch.jobs.map((job) => ({ ...job, status: 'completed' as const })),
    }));
    const handler = createResponseBatchStatusToolHandler({
      createBatch: vi.fn(),
      readBatchStatus,
    });

    const result = await handler({ id: 'batch_mcp_1' });

    expect(readBatchStatus).toHaveBeenCalledWith('batch_mcp_1');
    expect(result).toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'Response batch batch_mcp_1 is completed: 2/2 completed.' }],
      structuredContent: {
        id: 'batch_mcp_1',
        status: 'completed',
      },
    });
  });
});
