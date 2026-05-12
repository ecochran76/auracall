import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import type { ExecutionRequest, ExecutionResponse } from '../src/runtime/apiTypes.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunEvent } from '../src/runtime/model.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import {
  createResponseBatchExecutionGate,
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
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

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
      {
        batchId: 'batch_runtime_1',
        batchIndex: 0,
        batchLimits: {
          maxConcurrentRuns: 2,
          maxBrowserInteractionsPerMinute: 8,
        },
      },
      {
        batchId: 'batch_runtime_1',
        batchIndex: 1,
        batchLimits: {
          maxConcurrentRuns: 2,
          maxBrowserInteractionsPerMinute: 8,
        },
      },
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

  it('builds an execution gate from persisted batch limits', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-response-batch-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: (() => {
        const ids = ['resp_batch_gate_1', 'resp_batch_gate_2', 'resp_batch_gate_3', 'resp_batch_gate_4'];
        return () => ids.shift() ?? 'resp_batch_gate_extra';
      })(),
      now: () => new Date('2026-05-12T15:00:00.000Z'),
    });
    const service = createResponseBatchService({
      responsesService,
      generateBatchId: (() => {
        const ids = ['batch_concurrency_gate', 'batch_rate_gate'];
        return () => ids.shift() ?? 'batch_extra';
      })(),
      now: () => new Date('2026-05-12T15:00:00.000Z'),
    });

    await service.createBatch({
      limits: { maxConcurrentRuns: 1 },
      requests: [
        { model: 'agent:pro-extended-chatgpt-soylei', input: 'Grade student 1.' },
        { model: 'agent:pro-extended-chatgpt-soylei', input: 'Grade student 2.' },
      ],
    });
    await control.acquireLease({
      runId: 'resp_batch_gate_1',
      leaseId: 'resp_batch_gate_1:lease:test',
      ownerId: 'runner:test',
      acquiredAt: '2026-05-12T15:00:05.000Z',
      heartbeatAt: '2026-05-12T15:00:05.000Z',
      expiresAt: '2026-05-12T15:01:05.000Z',
    });
    const gate = createResponseBatchExecutionGate({
      control,
      now: () => new Date('2026-05-12T15:00:10.000Z'),
    });
    const secondConcurrencyRecord = await control.readRun('resp_batch_gate_2');
    if (!secondConcurrencyRecord) throw new Error('expected second concurrency batch run');
    await expect(gate(secondConcurrencyRecord)).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining('concurrency limit reached: 1/1'),
    });

    await service.createBatch({
      limits: { maxBrowserInteractionsPerMinute: 1 },
      requests: [
        { model: 'agent:pro-extended-chatgpt-soylei', input: 'Grade student 3.' },
        { model: 'agent:pro-extended-chatgpt-soylei', input: 'Grade student 4.' },
      ],
    });
    const firstRateRecord = await control.readRun('resp_batch_gate_3');
    if (!firstRateRecord) throw new Error('expected first rate-limit batch run');
    await control.persistRun({
      runId: firstRateRecord.runId,
      expectedRevision: firstRateRecord.revision,
      bundle: {
        ...firstRateRecord.bundle,
        events: [
          ...firstRateRecord.bundle.events,
          createExecutionRunEvent({
            id: 'resp_batch_gate_3:event:step-started',
            runId: firstRateRecord.runId,
            type: 'step-started',
            createdAt: '2026-05-12T15:00:05.000Z',
            stepId: 'resp_batch_gate_3:step:1',
          }),
        ],
      },
    });
    const secondRateRecord = await control.readRun('resp_batch_gate_4');
    if (!secondRateRecord) throw new Error('expected second rate-limit batch run');
    await expect(gate(secondRateRecord)).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining('browser interaction rate limit reached: 1/1 per minute'),
    });
  });
});
