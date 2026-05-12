import { describe, expect, it, vi } from 'vitest';
import type { ExecutionRequest, ExecutionResponse } from '../src/runtime/apiTypes.js';
import {
  createResponseBatchService,
  type ResponseBatchRecord,
} from '../src/runtime/responseBatchService.js';

function createResponse(id: string, status: ExecutionResponse['status']): ExecutionResponse {
  return {
    id,
    object: 'response',
    status,
    model: 'agent:pro-extended-chatgpt-soylei',
    output: [],
    metadata: {
      runId: id,
      executionSummary: {
        completedAt: status === 'in_progress' ? null : '2026-05-12T14:05:00.000Z',
        failureSummary:
          status === 'failed'
            ? {
                code: 'runner_execution_failed',
                message: 'failed once',
              }
            : null,
      },
    },
  };
}

describe('response batch service', () => {
  it('creates normal response runs with batch metadata and summarizes status', async () => {
    const createdRequests: ExecutionRequest[] = [];
    const responses = new Map<string, ExecutionResponse>();
    const stored = new Map<string, ResponseBatchRecord>();
    const service = createResponseBatchService({
      now: () => new Date('2026-05-12T14:00:00.000Z'),
      generateBatchId: () => 'batch_runtime_1',
      store: {
        readBatch: vi.fn(async (id) => stored.get(id) ?? null),
        writeBatch: vi.fn(async (record) => {
          stored.set(record.id, record);
          return record;
        }),
      },
      responsesService: {
        createResponse: vi.fn(async (request) => {
          const id = `resp_runtime_${createdRequests.length + 1}`;
          createdRequests.push(request);
          const response = createResponse(id, 'in_progress');
          responses.set(id, response);
          return response;
        }),
        readResponse: vi.fn(async (id) => responses.get(id) ?? null),
      },
    });

    const status = await service.createBatch({
      metadata: { course: 'ChE 4470' },
      limits: { maxConcurrentRuns: 2, maxBrowserInteractionsPerMinute: 8 },
      requests: [
        {
          model: 'agent:pro-extended-chatgpt-soylei',
          input: 'Grade student 1.',
          auracall: { agent: 'pro-extended-chatgpt-soylei', service: 'chatgpt', runtimeProfile: 'wsl-chrome-3' },
        },
        {
          model: 'agent:pro-extended-chatgpt-soylei',
          input: 'Grade student 2.',
          auracall: { agent: 'pro-extended-chatgpt-soylei', service: 'chatgpt', runtimeProfile: 'wsl-chrome-3' },
        },
      ],
    });

    expect(createdRequests.map((request) => request.metadata)).toEqual([
      { batchId: 'batch_runtime_1', batchIndex: 0 },
      { batchId: 'batch_runtime_1', batchIndex: 1 },
    ]);
    expect(status).toMatchObject({
      id: 'batch_runtime_1',
      object: 'response_batch_status',
      status: 'running',
      counts: {
        total: 2,
        in_progress: 2,
      },
      limits: {
        maxConcurrentRuns: 2,
        maxBrowserInteractionsPerMinute: 8,
      },
      jobs: [
        { index: 0, responseId: 'resp_runtime_1', status: 'in_progress' },
        { index: 1, responseId: 'resp_runtime_2', status: 'in_progress' },
      ],
    });

    responses.set('resp_runtime_1', createResponse('resp_runtime_1', 'completed'));
    responses.set('resp_runtime_2', createResponse('resp_runtime_2', 'failed'));
    await expect(service.readBatchStatus('batch_runtime_1')).resolves.toMatchObject({
      id: 'batch_runtime_1',
      status: 'failed',
      counts: {
        total: 2,
        completed: 1,
        failed: 1,
      },
      jobs: [
        { responseId: 'resp_runtime_1', status: 'completed', completedAt: '2026-05-12T14:05:00.000Z' },
        { responseId: 'resp_runtime_2', status: 'failed', failure: { code: 'runner_execution_failed' } },
      ],
    });
  });
});
