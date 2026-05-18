import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createEffectiveAgentCatalog } from '../src/config/agentRegistryCatalog.js';
import type { ExecutionRequest, ExecutionResponse } from '../src/runtime/apiTypes.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunEvent } from '../src/runtime/model.js';
import { resolveResponseBatchDispatchPool } from '../src/runtime/responseBatchDispatchPool.js';
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

  it('records dispatch-pool assignment metadata on child response runs', async () => {
    const createdRequests: ExecutionRequest[] = [];
    const responses = new Map<string, ExecutionResponse>();
    const stored = new Map<string, ResponseBatchRecord>();
    const service = createResponseBatchService({
      now: () => new Date('2026-05-12T14:00:00.000Z'),
      generateBatchId: () => 'batch_pool_1',
      store: {
        readBatch: vi.fn(async (id) => stored.get(id) ?? null),
        writeBatch: vi.fn(async (record) => {
          stored.set(record.id, record);
          return record;
        }),
      },
      resolveDispatchPool: vi.fn(async ({ requests }: { requests: ExecutionRequest[] }) => ({
        requests: requests.map((request: ExecutionRequest, index: number) => {
          const agentId = index === 0 ? 'tenant-a' : 'tenant-b';
          return {
            ...request,
            model: `agent:${agentId}`,
            auracall: {
              ...(request.auracall ?? {}),
              team: 'chatgpt-pool',
              agent: agentId,
              service: 'chatgpt',
              runtimeProfile: index === 0 ? 'wsl-chrome-1' : 'wsl-chrome-2',
            },
          };
        }),
        dispatch: {
          team: 'chatgpt-pool',
          mode: 'next_available' as const,
          projectSync: 'none' as const,
          memberCount: 2,
          projectName: 'Shared Project',
          warnings: ['projectSync=none'],
        },
        assignments: [
          { team: 'chatgpt-pool', mode: 'next_available' as const, memberAgent: 'tenant-a', memberIndex: 0 },
          { team: 'chatgpt-pool', mode: 'next_available' as const, memberAgent: 'tenant-b', memberIndex: 1 },
        ],
      })),
      responsesService: {
        createResponse: vi.fn(async (request) => {
          const id = `resp_pool_${createdRequests.length + 1}`;
          createdRequests.push(request);
          const response = createResponse(id, 'in_progress');
          responses.set(id, response);
          return response;
        }),
        readResponse: vi.fn(async (id) => responses.get(id) ?? null),
      },
    });

    const status = await service.createBatch({
      team: 'chatgpt-pool',
      requests: [
        { model: 'gpt-5.1', input: 'Grade student 1.' },
        { model: 'gpt-5.1', input: 'Grade student 2.' },
      ],
    });

    expect(createdRequests.map((request) => request.metadata)).toEqual([
      {
        batchId: 'batch_pool_1',
        batchIndex: 0,
        batchLimits: {
          maxConcurrentRuns: null,
          maxBrowserInteractionsPerMinute: null,
        },
        batchDispatch: {
          team: 'chatgpt-pool',
          mode: 'next_available',
          projectSync: 'none',
          memberAgent: 'tenant-a',
          memberIndex: 0,
        },
      },
      {
        batchId: 'batch_pool_1',
        batchIndex: 1,
        batchLimits: {
          maxConcurrentRuns: null,
          maxBrowserInteractionsPerMinute: null,
        },
        batchDispatch: {
          team: 'chatgpt-pool',
          mode: 'next_available',
          projectSync: 'none',
          memberAgent: 'tenant-b',
          memberIndex: 1,
        },
      },
    ]);
    expect(status).toMatchObject({
      id: 'batch_pool_1',
      dispatch: {
        team: 'chatgpt-pool',
        mode: 'next_available',
        projectSync: 'none',
        memberCount: 2,
        warnings: ['projectSync=none'],
      },
      jobs: [
        {
          model: 'agent:tenant-a',
          agent: 'tenant-a',
          service: 'chatgpt',
          runtimeProfile: 'wsl-chrome-1',
          dispatch: { memberAgent: 'tenant-a', memberIndex: 0 },
        },
        {
          model: 'agent:tenant-b',
          agent: 'tenant-b',
          service: 'chatgpt',
          runtimeProfile: 'wsl-chrome-2',
          dispatch: { memberAgent: 'tenant-b', memberIndex: 1 },
        },
      ],
    });
  });

  it('dispatches pool jobs using active runtime evidence before team order', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-response-batch-pool-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: () => 'resp_busy_tenant_a',
      now: () => new Date('2026-05-12T15:00:00.000Z'),
    });
    await responsesService.createResponse({
      model: 'agent:tenant-a',
      input: 'Existing active job.',
      auracall: { agent: 'tenant-a', service: 'chatgpt', runtimeProfile: 'wsl-chrome-1' },
    });
    await control.acquireLease({
      runId: 'resp_busy_tenant_a',
      leaseId: 'resp_busy_tenant_a:lease:test',
      ownerId: 'runner:test',
      acquiredAt: '2026-05-12T15:00:05.000Z',
      heartbeatAt: '2026-05-12T15:00:05.000Z',
      expiresAt: '2026-05-12T15:01:05.000Z',
    });

    const catalog = createEffectiveAgentCatalog({
      config: {
        browserProfiles: {
          'browser-a': {},
          'browser-b': {},
        },
        runtimeProfiles: {
          'wsl-chrome-1': { browserProfile: 'browser-a', defaultService: 'chatgpt' },
          'wsl-chrome-2': { browserProfile: 'browser-b', defaultService: 'chatgpt' },
        },
        agents: {
          'tenant-a': {
            runtimeProfile: 'wsl-chrome-1',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
          },
          'tenant-b': {
            runtimeProfile: 'wsl-chrome-2',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
          },
        },
        teams: {
          'chatgpt-pool': {
            type: 'dispatch-pool',
            agents: ['tenant-a', 'tenant-b'],
            project: { name: 'Shared Project', sync: 'none' },
          },
        },
      },
    });

    const resolution = await resolveResponseBatchDispatchPool({
      dispatch: { team: 'chatgpt-pool', mode: 'next_available', projectSync: 'none' },
      catalog,
      control,
      requests: [
        { model: 'gpt-5.1', input: 'New job 1.' },
        { model: 'gpt-5.1', input: 'New job 2.' },
      ],
    });

    expect(resolution.assignments.map((assignment) => assignment.memberAgent)).toEqual(['tenant-b', 'tenant-a']);
    expect(resolution.requests.map((request) => request.auracall?.runtimeProfile)).toEqual([
      'wsl-chrome-2',
      'wsl-chrome-1',
    ]);
    expect(resolution.dispatch.warnings).toContain(
      'Dispatch-pool team "chatgpt-pool" is project-bound to "Shared Project" with projectSync=none; AuraCall does not reconcile project instructions, files, or settings between tenants.',
    );
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
    const activeFirstRecord = await control.readRun('resp_batch_gate_1');
    if (!activeFirstRecord) throw new Error('expected first concurrency batch run');
    await control.persistRun({
      runId: activeFirstRecord.runId,
      expectedRevision: activeFirstRecord.revision,
      bundle: {
        ...activeFirstRecord.bundle,
        run: {
          ...activeFirstRecord.bundle.run,
          status: 'running',
        },
        steps: activeFirstRecord.bundle.steps.map((step) =>
          step.id === 'resp_batch_gate_1:step:1'
            ? { ...step, status: 'running', startedAt: '2026-05-12T15:00:05.000Z' }
            : step,
        ),
      },
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
    await control.expireLeases({
      runId: 'resp_batch_gate_1',
      now: '2026-05-12T15:01:10.000Z',
    });
    const strandedFirstRecord = await control.readRun('resp_batch_gate_1');
    if (!strandedFirstRecord) throw new Error('expected stranded first concurrency batch run');
    expect(strandedFirstRecord.bundle.steps.some((step) => step.status === 'running')).toBe(true);
    await expect(gate(secondConcurrencyRecord)).resolves.toEqual({ allowed: true });

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
