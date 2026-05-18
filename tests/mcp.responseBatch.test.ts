import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createResponseBatchCreateToolHandler,
  createResponseBatchStatusToolHandler,
  registerResponseBatchTools,
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
  dispatch: null,
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

  it('declares finalizing runtime state in MCP output schemas', () => {
    const registeredTools = new Map<string, { outputSchema?: z.ZodRawShape }>();
    const server = {
      registerTool: vi.fn((name: string, config: { outputSchema?: z.ZodRawShape }) => {
        registeredTools.set(name, config);
      }),
    };
    registerResponseBatchTools(server as unknown as Parameters<typeof registerResponseBatchTools>[0], {
      service: {
        createBatch: vi.fn(),
        readBatchStatus: vi.fn(),
      },
    });
    const tool = registeredTools.get('response_batch_status');
    if (!tool?.outputSchema) {
      throw new Error('expected response_batch_status output schema');
    }
    const [job] = runningBatch.jobs;
    if (!job) {
      throw new Error('expected response batch job fixture');
    }
    const schema = z.object(tool.outputSchema);
    const finalizingBatch = {
      ...runningBatch,
      counts: {
        total: 1,
        in_progress: 1,
        completed: 0,
        failed: 0,
        cancelled: 0,
        missing: 0,
      },
      jobs: [
        {
          ...job,
          runtimeState: 'finalizing',
          diagnostics: {
            runtimeState: 'finalizing',
            leaseState: 'expired',
            browserTaskState: 'response-complete',
            lastProviderEvidence: {
              observedAt: '2026-05-12T14:04:30.000Z',
              state: 'response-complete',
              source: 'browser-service',
              evidenceRef: 'chatgpt-response-finished',
              confidence: 'high',
              details: {
                service: 'chatgpt',
                runtimeProfileId: 'wsl-chrome-3',
              },
            },
            terminalTransitionSource: null,
          },
        },
      ],
    };

    expect(schema.safeParse(finalizingBatch).success).toBe(true);
    expect(
      schema.safeParse({
        ...finalizingBatch,
        jobs: [
          {
            ...finalizingBatch.jobs[0],
            runtimeState: 'done-ish',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...finalizingBatch,
        jobs: [
          {
            ...finalizingBatch.jobs[0],
            diagnostics: {
              ...finalizingBatch.jobs[0].diagnostics,
              runtimeState: 'done-ish',
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
