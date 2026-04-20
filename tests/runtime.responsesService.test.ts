import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import type { ExecutionRequest } from '../src/runtime/apiTypes.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { writeTaskRunSpecStoredRecord } from '../src/teams/store.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import { cancelExecutionRun } from '../src/runtime/runner.js';
import { createExecutionServiceHost } from '../src/runtime/serviceHost.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('runtime responses service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('creates and reads a completed direct response through the runtime service seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:00:00.000Z'),
      generateResponseId: () => 'resp_service_1',
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Run once.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    expect(created).toMatchObject({
      id: 'resp_service_1',
      object: 'response',
      status: 'completed',
      model: 'gpt-5.2',
      metadata: {
        runId: 'resp_service_1',
        runtimeProfile: 'default',
        service: 'chatgpt',
        executionSummary: {
          terminalStepId: 'resp_service_1:step:1',
          completedAt: '2026-04-08T14:00:00.000Z',
          lastUpdatedAt: '2026-04-08T14:00:00.000Z',
          failureSummary: null,
        },
      },
    });

    const reread = await service.readResponse('resp_service_1');
    expect(reread).toMatchObject({
      id: 'resp_service_1',
      status: 'completed',
    });
  });

  it('returns failed response state when the bounded runner callback throws', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:05:00.000Z'),
      generateResponseId: () => 'resp_service_fail_1',
      executeStoredRunStep: async () => {
        throw new Error('service seam failed');
      },
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Fail once.',
    });

    expect(created).toMatchObject({
      id: 'resp_service_fail_1',
      status: 'failed',
      model: 'gpt-5.2',
      metadata: {
        executionSummary: {
          terminalStepId: 'resp_service_fail_1:step:1',
          completedAt: '2026-04-08T14:05:00.000Z',
          lastUpdatedAt: '2026-04-08T14:05:00.000Z',
          failureSummary: {
            code: 'runner_execution_failed',
            message: 'service seam failed',
          },
        },
      },
    });
  });

  it('reconstructs the execution request and step context when executing stored direct runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let capturedRequest: ExecutionRequest | null = null;
    let capturedStepId: string | null = null;

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:10:00.000Z'),
      generateResponseId: () => 'resp_service_ctx_1',
      executeStoredRunStep: async (request, context) => {
        capturedRequest = request;
        capturedStepId = context.step.id;
      },
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Run once.',
      instructions: 'Use structured output.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        agent: 'planner',
      },
    });

    expect(created).toMatchObject({
      id: 'resp_service_ctx_1',
      status: 'completed',
      metadata: {
        runId: 'resp_service_ctx_1',
        executionSummary: {
          terminalStepId: 'resp_service_ctx_1:step:1',
        },
      },
    });
    expect(capturedRequest).toEqual({
      model: 'gpt-5.2',
      input: 'Run once.',
      metadata: {},
      instructions: 'Use structured output.',
      tools: [],
      attachments: [],
      auracall: {
        runtimeProfile: 'default',
        agent: 'planner',
        service: 'chatgpt',
      },
    });
    expect(capturedStepId).toBe('resp_service_ctx_1:step:1');
  });

  it('returns bounded provider usage summary on response readback when stored execution reports usage', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:12:00.000Z'),
      generateResponseId: () => 'resp_service_usage_1',
      executeStoredRunStep: async () => ({
        usage: {
          inputTokens: 90,
          outputTokens: 25,
          reasoningTokens: 5,
          totalTokens: 120,
        },
        output: {
          summary: 'usage recorded',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Run once.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    expect(created).toMatchObject({
      id: 'resp_service_usage_1',
      status: 'completed',
      metadata: {
        executionSummary: {
          providerUsageSummary: {
            ownerStepId: 'resp_service_usage_1:step:1',
            generatedAt: '2026-04-08T14:12:00.000Z',
            inputTokens: 90,
            outputTokens: 25,
            reasoningTokens: 5,
            totalTokens: 120,
          },
        },
      },
    });
  });

  it('prefers the terminal step provider-usage summary over older step summaries on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_usage_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-08T14:13:00.000Z',
          updatedAt: '2026-04-08T14:14:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the terminal step usage summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older usage step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:13:05.000Z',
            completedAt: '2026-04-08T14:13:20.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal usage step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:13:30.000Z',
            completedAt: '2026-04-08T14:14:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.providerUsage.${stepOneId}`,
              value: {
                ownerStepId: stepOneId,
                generatedAt: '2026-04-08T14:13:20.000Z',
                inputTokens: 40,
                outputTokens: 10,
                reasoningTokens: 2,
                totalTokens: 52,
              },
            },
            {
              key: `step.providerUsage.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-08T14:14:00.000Z',
                inputTokens: 90,
                outputTokens: 25,
                reasoningTokens: 5,
                totalTokens: 120,
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T14:14:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:13:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:14:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: stepTwoId,
          providerUsageSummary: {
            ownerStepId: stepTwoId,
            generatedAt: '2026-04-08T14:14:00.000Z',
            inputTokens: 90,
            outputTokens: 25,
            reasoningTokens: 5,
            totalTokens: 120,
          },
        },
      },
    });
  });

  it('can persist a direct response without draining when host ownership is external', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:15:00.000Z'),
      generateResponseId: () => 'resp_service_pending_1',
      drainAfterCreate: false,
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Persist only.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    expect(created).toMatchObject({
      id: 'resp_service_pending_1',
      object: 'response',
      status: 'in_progress',
      model: 'gpt-5.2',
      metadata: {
        runId: 'resp_service_pending_1',
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    const reread = await service.readResponse('resp_service_pending_1');
    expect(reread).toMatchObject({
      id: 'resp_service_pending_1',
      status: 'in_progress',
    });
  });

  it('returns cancelled response state with bounded cancellation summary', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:20:00.000Z'),
      generateResponseId: () => 'resp_service_cancelled_1',
      drainAfterCreate: false,
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Cancel me.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });
    expect(created.status).toBe('in_progress');

    const record = await control.readRun('resp_service_cancelled_1');
    await control.persistRun({
      runId: 'resp_service_cancelled_1',
      expectedRevision: record!.revision,
      bundle: cancelExecutionRun({
        bundle: {
          ...record!.bundle,
          run: {
            ...record!.bundle.run,
            status: 'running',
            updatedAt: '2026-04-08T14:20:00.000Z',
          },
          steps: record!.bundle.steps.map((step) =>
            step.id === 'resp_service_cancelled_1:step:1'
              ? {
                  ...step,
                  status: 'running',
                  startedAt: '2026-04-08T14:20:00.000Z',
                }
              : step,
          ),
        },
        cancelledAt: '2026-04-08T14:21:00.000Z',
        note: 'cancelled in runtime service test',
        source: 'operator',
      }),
    });

    const reread = await service.readResponse('resp_service_cancelled_1');
    expect(reread).toMatchObject({
      id: 'resp_service_cancelled_1',
      status: 'cancelled',
      metadata: {
        executionSummary: {
          terminalStepId: 'resp_service_cancelled_1:step:1',
          completedAt: '2026-04-08T14:21:00.000Z',
          lastUpdatedAt: '2026-04-08T14:21:00.000Z',
          cancellationSummary: {
            cancelledAt: '2026-04-08T14:21:00.000Z',
            source: 'operator',
            reason: 'cancelled in runtime service test',
          },
          failureSummary: null,
        },
      },
    });
  });

  it('falls back to run timestamps when cancelled response readback has no cancellation note event', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'resp_service_cancelled_fallback_1',
          sourceKind: 'direct',
          sourceId: null,
          status: 'cancelled',
          createdAt: '2026-04-08T14:22:00.000Z',
          updatedAt: '2026-04-08T14:23:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Cancelled without note event.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: 'resp_service_cancelled_fallback_1:state',
          stepIds: ['resp_service_cancelled_fallback_1:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'resp_service_cancelled_fallback_1:step:1',
            runId: 'resp_service_cancelled_fallback_1',
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'cancelled',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Cancelled without note event.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:22:30.000Z',
            completedAt: '2026-04-08T14:23:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'resp_service_cancelled_fallback_1:state',
          runId: 'resp_service_cancelled_fallback_1',
          status: 'cancelled',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T14:23:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: 'resp_service_cancelled_fallback_1:event:run-created',
            runId: 'resp_service_cancelled_fallback_1',
            type: 'run-created',
            createdAt: '2026-04-08T14:22:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:23:30.000Z'),
    });

    const reread = await service.readResponse('resp_service_cancelled_fallback_1');
    expect(reread).toMatchObject({
      id: 'resp_service_cancelled_fallback_1',
      status: 'cancelled',
      metadata: {
        executionSummary: {
          cancellationSummary: {
            cancelledAt: '2026-04-08T14:23:00.000Z',
            source: null,
            reason: null,
          },
        },
      },
    });
  });

  it('returns bounded local-action outcome summary on terminal response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const executionHost = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T14:25:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request one shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run the focused verification command.',
                command: 'pnpm',
                args: ['vitest', 'run'],
              },
            ],
          },
          notes: [],
        },
      }),
      executeLocalActionRequest: async ({ request }) => ({
        status: 'executed',
        summary: `executed ${request.kind}`,
        payload: { exitCode: 0 },
      }),
    });

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:25:00.000Z'),
      generateResponseId: () => 'resp_service_local_action_1',
      executionHost,
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Run one local action.',
    });

    expect(created).toMatchObject({
      id: 'resp_service_local_action_1',
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: 'resp_service_local_action_1:step:1',
          localActionSummary: {
            ownerStepId: 'resp_service_local_action_1:step:1',
            generatedAt: '2026-04-08T14:25:00.000Z',
            total: 1,
            counts: {
              requested: 0,
              approved: 0,
              rejected: 0,
              executed: 1,
              failed: 0,
              cancelled: 0,
            },
            items: [
              {
                requestId: 'resp_service_local_action_1:action:resp_service_local_action_1:step:1:1',
                kind: 'shell',
                status: 'executed',
                summary: 'Run the focused verification command.',
                command: 'pnpm',
                args: ['vitest', 'run'],
                resultSummary: 'executed shell',
              },
            ],
          },
        },
      },
    });
  });

  it('prefers the terminal step local-action summary over older step summaries on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_local_action_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-08T14:26:00.000Z',
          updatedAt: '2026-04-08T14:27:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the terminal step local action summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older local action step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:26:05.000Z',
            completedAt: '2026-04-08T14:26:20.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal local action step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:26:25.000Z',
            completedAt: '2026-04-08T14:27:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.localActionOutcomes.${stepOneId}`,
              value: {
                ownerStepId: stepOneId,
                generatedAt: '2026-04-08T14:26:20.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepOneId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Older shell action.',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                    resultSummary: 'older shell executed',
                  },
                ],
              },
            },
            {
              key: `step.localActionOutcomes.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-08T14:27:00.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepTwoId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Terminal shell action.',
                    command: 'node',
                    args: ['-e', "process.stdout.write('ok')"],
                    resultSummary: 'terminal shell executed',
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T14:27:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:26:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:27:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: stepTwoId,
          localActionSummary: {
            ownerStepId: stepTwoId,
            generatedAt: '2026-04-08T14:27:00.000Z',
            total: 1,
            counts: {
              requested: 0,
              approved: 0,
              rejected: 0,
              executed: 1,
              failed: 0,
              cancelled: 0,
            },
            items: [
              {
                requestId: `${runId}:action:${stepTwoId}:1`,
                kind: 'shell',
                status: 'executed',
                summary: 'Terminal shell action.',
                command: 'node',
                args: ['-e', "process.stdout.write('ok')"],
                resultSummary: 'terminal shell executed',
              },
            ],
          },
        },
      },
    });
  });

  it('returns bounded operator control summary on terminal response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_operator_control_1';
    const stepId = `${runId}:step:1`;
    const completedAt = '2026-04-08T14:31:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'succeeded',
          createdAt: '2026-04-08T14:30:00.000Z',
          updatedAt: completedAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Resume and drain once.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Resume and drain once.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'resumed step completed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:30:30.000Z',
            completedAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.resume.${stepId}`,
              value: {
                stepId,
                resumedAt: '2026-04-08T14:30:45.000Z',
                note: 'human approved resume',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
          ],
          notes: ['run resumed and drained by operator control'],
          history: [],
          lastUpdatedAt: completedAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:30:00.000Z',
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:executed:${completedAt}`,
            runId,
            stepId,
            type: 'note-added',
            createdAt: completedAt,
            note: 'run executed through targeted host drain',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'executed',
              skipReason: null,
            },
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date(completedAt),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              resumedAt: '2026-04-08T14:30:45.000Z',
              note: 'human approved resume',
            },
            targetedDrain: {
              requestedAt: completedAt,
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });
  });

  it('returns bounded skipped targeted-drain summary on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_operator_summary_skipped_1';
    const stepId = `${runId}:step:1`;
    const skippedAt = '2026-04-08T14:35:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T14:34:00.000Z',
          updatedAt: skippedAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Read back skipped operator control.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Read back skipped operator control.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.resume.${stepId}`,
              value: {
                stepId,
                resumedAt: '2026-04-08T14:34:45.000Z',
                note: 'human approved retry',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
          ],
          notes: ['run resumed but targeted drain could not claim it'],
          history: [],
          lastUpdatedAt: skippedAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:34:00.000Z',
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:skipped:${skippedAt}`,
            runId,
            type: 'note-added',
            createdAt: skippedAt,
            note: 'runner runner:missing-service-readback has no persisted runner record',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'skipped',
              skipReason: 'claim-owner-unavailable',
            },
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date(skippedAt),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'in_progress',
      metadata: {
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              resumedAt: '2026-04-08T14:34:45.000Z',
              note: 'human approved retry',
            },
            targetedDrain: {
              requestedAt: skippedAt,
              status: 'skipped',
              reason: 'runner runner:missing-service-readback has no persisted runner record',
              skipReason: 'claim-owner-unavailable',
            },
          },
        },
      },
    });
  });

  it('prefers the latest operator-control summaries over older resume and drain entries on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_operator_summary_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-08T14:40:00.000Z',
          updatedAt: '2026-04-08T14:45:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the latest operator control summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older paused step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:40:05.000Z',
            completedAt: '2026-04-08T14:41:00.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Later resumed step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'later step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:44:10.000Z',
            completedAt: '2026-04-08T14:45:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.resume.${stepOneId}`,
              value: {
                stepId: stepOneId,
                resumedAt: '2026-04-08T14:41:05.000Z',
                note: 'older resume note',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
            {
              key: `human.resume.${stepTwoId}`,
              value: {
                stepId: stepTwoId,
                resumedAt: '2026-04-08T14:44:00.000Z',
                note: 'latest resume note',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
          ],
          notes: ['multiple operator interventions'],
          history: [],
          lastUpdatedAt: '2026-04-08T14:45:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:40:00.000Z',
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:skipped:2026-04-08T14:41:10.000Z`,
            runId,
            type: 'note-added',
            createdAt: '2026-04-08T14:41:10.000Z',
            note: 'runner runner:missing-service-precedence has no persisted runner record',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'skipped',
              skipReason: 'claim-owner-unavailable',
            },
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:executed:2026-04-08T14:45:00.000Z`,
            runId,
            type: 'note-added',
            createdAt: '2026-04-08T14:45:00.000Z',
            note: 'run executed through targeted host drain',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'executed',
              skipReason: null,
            },
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-08T14:45:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              resumedAt: '2026-04-08T14:44:00.000Z',
              note: 'latest resume note',
            },
            targetedDrain: {
              requestedAt: '2026-04-08T14:45:00.000Z',
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });
  });

  it('surfaces taskRunSpecId on response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_team_task_1';
    const stepId = `${runId}:step:1`;

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_runtime_1',
      teamId: 'team_template_runtime_1',
      title: 'Inspect persisted runtime task spec',
      objective: 'Verify response readback can surface persisted task spec linkage.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-11T17:59:00.000Z',
    });

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_task_1',
          taskRunSpecId: 'task_spec_runtime_1',
          status: 'succeeded',
          createdAt: '2026-04-11T18:00:00.000Z',
          updatedAt: '2026-04-11T18:01:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the requested artifact bundle.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_task_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested artifact bundle.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T18:00:10.000Z',
            completedAt: '2026-04-11T18:01:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T18:01:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T18:00:00.000Z',
            note: 'projected from task-aware team-run bundle',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-11T18:02:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        runId,
        taskRunSpecId: 'task_spec_runtime_1',
        taskRunSpecSummary: {
          id: 'task_spec_runtime_1',
          teamId: 'team_template_runtime_1',
          title: 'Inspect persisted runtime task spec',
          objective: 'Verify response readback can surface persisted task spec linkage.',
          createdAt: '2026-04-11T17:59:00.000Z',
          persistedAt: '2026-04-11T17:59:00.000Z',
          requestedOutputCount: 0,
          inputArtifactCount: 0,
        },
        runtimeProfile: 'default',
        service: 'chatgpt',
        executionSummary: {
          stepSummaries: [
            {
              stepId,
              order: 1,
              agentId: 'orchestrator',
              status: 'succeeded',
              runtimeProfileId: 'default',
              browserProfileId: null,
              service: 'chatgpt',
            },
          ],
        },
      },
    });
  });

  it('suppresses task-run-spec identity on response readback for direct runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_direct_task_hidden_1';
    const stepId = `${runId}:step:1`;

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_runtime_direct_hidden_1',
      teamId: 'team_template_runtime_direct_hidden_1',
      title: 'Do not expose direct response assignment identity',
      objective: 'Response readback should keep assignment identity team-run scoped.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-19T22:50:00.000Z',
    });

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId: 'task_spec_runtime_direct_hidden_1',
          status: 'succeeded',
          createdAt: '2026-04-19T22:51:00.000Z',
          updatedAt: '2026-04-19T22:52:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Return a direct-run response.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Return a direct-run response.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-19T22:51:10.000Z',
            completedAt: '2026-04-19T22:52:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-19T22:52:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-19T22:51:00.000Z',
            note: 'direct runtime record carries a stale task-run-spec id',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-19T22:53:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        runId,
        taskRunSpecId: null,
        taskRunSpecSummary: null,
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });
  });

  it('surfaces bounded per-step routing summary on response readback for mixed-provider team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_step_summary_1';
    const plannerStepId = `${runId}:step:1`;
    const finisherStepId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_step_summary_1',
          taskRunSpecId: 'task_spec_step_summary_1',
          status: 'succeeded',
          createdAt: '2026-04-13T20:10:00.000Z',
          updatedAt: '2026-04-13T20:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Route planner to finisher.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'wsl-chrome-2',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [plannerStepId, finisherStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: plannerStepId,
            runId,
            sourceStepId: 'team_run_step_summary_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'wsl-chrome-2',
            browserProfileId: 'wsl-chrome-2',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Plan.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'planned',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-13T20:10:05.000Z',
            completedAt: '2026-04-13T20:10:20.000Z',
          }),
          createExecutionRunStep({
            id: finisherStepId,
            runId,
            sourceStepId: 'team_run_step_summary_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [plannerStepId],
            input: {
              prompt: 'Finish.',
              handoffIds: ['handoff:1'],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'finished',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-13T20:10:25.000Z',
            completedAt: '2026-04-13T20:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-13T20:11:00.000Z',
        }),
        events: [],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-13T20:11:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        runId,
        taskRunSpecId: 'task_spec_step_summary_1',
        runtimeProfile: 'wsl-chrome-2',
        service: 'chatgpt',
        executionSummary: {
          stepSummaries: [
            {
              stepId: plannerStepId,
              order: 1,
              agentId: 'planner',
              status: 'succeeded',
              runtimeProfileId: 'wsl-chrome-2',
              browserProfileId: 'wsl-chrome-2',
              service: 'chatgpt',
            },
            {
              stepId: finisherStepId,
              order: 2,
              agentId: 'finisher',
              status: 'succeeded',
              runtimeProfileId: 'auracall-grok-auto',
              browserProfileId: 'default',
              service: 'grok',
            },
          ],
        },
      },
    });
    expect(reread?.metadata?.service).toBe('chatgpt');
    expect(reread?.metadata?.runtimeProfile).toBe('wsl-chrome-2');
    expect(reread?.metadata?.service).not.toBe('grok');
    expect(reread?.metadata?.runtimeProfile).not.toBe('auracall-grok-auto');
    expect(reread?.metadata?.executionSummary?.stepSummaries).toEqual([
      {
        stepId: plannerStepId,
        order: 1,
        agentId: 'planner',
        status: 'succeeded',
        runtimeProfileId: 'wsl-chrome-2',
        browserProfileId: 'wsl-chrome-2',
        service: 'chatgpt',
      },
      {
        stepId: finisherStepId,
        order: 2,
        agentId: 'finisher',
        status: 'succeeded',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
      },
    ]);
    expect(reread?.metadata?.executionSummary).not.toHaveProperty('activeLease');
    expect(reread?.metadata?.executionSummary).not.toHaveProperty('dispatch');
    expect(reread?.metadata?.executionSummary).not.toHaveProperty('repair');
    expect(reread?.metadata?.executionSummary).not.toHaveProperty('leaseHealth');
    expect(reread?.metadata?.executionSummary).not.toHaveProperty('localClaim');
  });

  it('preserves structured mixed output without leaking execution summaries into response.output', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-13T21:40:00.000Z';
    const runId = 'resp_service_seeded_output_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'succeeded',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Seeded output',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            input: {
              prompt: 'Seeded output',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
            completedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'I created a plan and a canvas.' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'not_output_text', text: 'drop malformed content part' }],
                },
                'drop malformed output item',
                {
                  type: 'artifact',
                  id: 'art_seeded_1',
                  artifact_type: 'canvas',
                  title: 'Seeded Canvas',
                  mime_type: 'text/plain',
                  uri: 'gemini://canvas/seeded',
                  disposition: 'inline',
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt,
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({ control });
    const reread = await service.readResponse(runId);

    expect(reread).toMatchObject({
      id: runId,
      object: 'response',
      status: 'completed',
      model: 'gpt-5.2',
      metadata: {
        runId,
        runtimeProfile: 'default',
        service: 'chatgpt',
        executionSummary: {
          terminalStepId: stepId,
        },
      },
    });
    expect(reread?.output).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'I created a plan and a canvas.' }],
      },
      {
        type: 'artifact',
        id: 'art_seeded_1',
        artifact_type: 'canvas',
        title: 'Seeded Canvas',
        mime_type: 'text/plain',
        uri: 'gemini://canvas/seeded',
        disposition: 'inline',
      },
    ]);
    expect(reread).not.toHaveProperty('output.0.executionSummary');
    expect(reread).not.toHaveProperty('output.0.runtimeProfile');
    expect(reread).not.toHaveProperty('output.0.service');
    expect(reread).not.toHaveProperty('output.1.executionSummary');
    expect(reread).not.toHaveProperty('output.1.taskRunSpecId');
  });

  it('prefers a failed step as the terminal readback step over later succeeded steps', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_terminal_failure_precedence_1';
    const failedStepId = `${runId}:step:1`;
    const laterSucceededStepId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_terminal_failure_precedence_1',
          taskRunSpecId: 'task_spec_terminal_failure_precedence_1',
          status: 'failed',
          createdAt: '2026-04-14T07:50:00.000Z',
          updatedAt: '2026-04-14T07:51:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the failed step as terminal readback state.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [failedStepId, laterSucceededStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: failedStepId,
            runId,
            sourceStepId: 'team_run_terminal_failure_precedence_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'failed',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'This step failed.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'planner failed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            failure: {
              code: 'planner_failed',
              message: 'planner failed first',
            },
            startedAt: '2026-04-14T07:50:05.000Z',
            completedAt: '2026-04-14T07:50:20.000Z',
          }),
          createExecutionRunStep({
            id: laterSucceededStepId,
            runId,
            sourceStepId: 'team_run_terminal_failure_precedence_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [failedStepId],
            input: {
              prompt: 'This step finished later.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'finisher succeeded later',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T07:50:30.000Z',
            completedAt: '2026-04-14T07:51:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'failed',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T07:51:00.000Z',
        }),
        events: [],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-14T07:51:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'failed',
      metadata: {
        executionSummary: {
          terminalStepId: failedStepId,
          completedAt: '2026-04-14T07:50:20.000Z',
          failureSummary: {
            code: 'planner_failed',
            message: 'planner failed first',
          },
        },
      },
    });
  });

  it('surfaces bounded input-artifact summary on response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_input_artifacts_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_input_artifacts_1',
          taskRunSpecId: 'task_spec_input_artifacts_1',
          status: 'succeeded',
          createdAt: '2026-04-12T15:00:00.000Z',
          updatedAt: '2026-04-12T15:01:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the supplied assignment artifacts.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_input_artifacts_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Use the supplied assignment artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-readme',
                  kind: 'file',
                  path: '/repo/README.md',
                  title: 'README',
                },
                {
                  id: 'artifact-spec',
                  kind: 'url',
                  uri: 'https://example.test/spec',
                  title: 'Spec',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:00:10.000Z',
            completedAt: '2026-04-12T15:01:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T15:01:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T15:00:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T15:01:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          inputArtifactSummary: {
            total: 2,
            items: [
              {
                id: 'artifact-readme',
                kind: 'file',
                title: 'README',
                path: '/repo/README.md',
                uri: null,
              },
              {
                id: 'artifact-spec',
                kind: 'url',
                title: 'Spec',
                path: null,
                uri: 'https://example.test/spec',
              },
            ],
          },
        },
      },
    });
  });

  it('prefers the terminal step input-artifact summary over older step artifacts on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_input_artifacts_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_input_artifacts_terminal_precedence_1',
          taskRunSpecId: 'task_spec_input_artifacts_terminal_precedence_1',
          status: 'succeeded',
          createdAt: '2026-04-12T15:20:00.000Z',
          updatedAt: '2026-04-12T15:21:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the terminal step artifacts.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_input_artifacts_terminal_precedence_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older step artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-older',
                  kind: 'file',
                  path: '/repo/older.md',
                  title: 'Older Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:20:10.000Z',
            completedAt: '2026-04-12T15:20:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_input_artifacts_terminal_precedence_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-terminal',
                  kind: 'url',
                  uri: 'https://example.test/terminal',
                  title: 'Terminal Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:20:30.000Z',
            completedAt: '2026-04-12T15:21:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T15:21:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T15:20:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T15:21:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: stepTwoId,
          inputArtifactSummary: {
            total: 1,
            items: [
              {
                id: 'artifact-terminal',
                kind: 'url',
                title: 'Terminal Artifact',
                path: null,
                uri: 'https://example.test/terminal',
              },
            ],
          },
        },
      },
    });
  });

  it('falls back to the latest earlier step with input artifacts when the terminal step has none', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_input_artifacts_fallback_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_input_artifacts_fallback_1',
          taskRunSpecId: 'task_spec_input_artifacts_fallback_1',
          status: 'succeeded',
          createdAt: '2026-04-14T08:10:00.000Z',
          updatedAt: '2026-04-14T08:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Fall back to earlier input artifacts when terminal step has none.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_input_artifacts_fallback_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Earlier step with artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-fallback',
                  kind: 'file',
                  path: '/repo/fallback.md',
                  title: 'Fallback Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'earlier step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T08:10:10.000Z',
            completedAt: '2026-04-14T08:10:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_input_artifacts_fallback_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step with no artifacts.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T08:10:30.000Z',
            completedAt: '2026-04-14T08:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T08:11:00.000Z',
        }),
        events: [],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-14T08:11:30.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: stepTwoId,
          inputArtifactSummary: {
            total: 1,
            items: [
              {
                id: 'artifact-fallback',
                kind: 'file',
                title: 'Fallback Artifact',
                path: '/repo/fallback.md',
                uri: null,
              },
            ],
          },
        },
      },
    });
  });

  it('surfaces bounded handoff-transfer summary on response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_handoff_transfer_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_handoff_transfer_1',
          taskRunSpecId: 'task_spec_handoff_transfer_1',
          status: 'succeeded',
          createdAt: '2026-04-12T16:00:00.000Z',
          updatedAt: '2026-04-12T16:01:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Consume the incoming handoff transfer.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_handoff_transfer_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Prepare the transfer.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'prepared',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:00:10.000Z',
            completedAt: '2026-04-12T16:00:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_handoff_transfer_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the incoming handoff transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'consumed handoff transfer',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:00:40.000Z',
            completedAt: '2026-04-12T16:01:00.000Z',
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'orchestrator',
            toAgentId: 'engineer',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_handoff_transfer_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Drive dependency handoff transfer',
                objective: 'Ensure the next step gets bounded transfer context.',
                successCriteria: ['transfer consumed'],
                requestedOutputs: [
                  {
                    label: 'handoff brief',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  {
                    id: 'artifact-spec',
                    kind: 'file',
                    title: 'Spec',
                    path: '/repo/spec.md',
                    uri: null,
                  },
                ],
              },
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt: '2026-04-12T16:00:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.consumedTaskTransfers.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-12T16:01:00.000Z',
                total: 1,
                items: [
                  {
                    handoffId: `${runId}:handoff:${stepTwoId}:1`,
                    fromStepId: stepOneId,
                    fromAgentId: 'orchestrator',
                    title: 'Stored response-service transfer title',
                    objective: 'Stored consumed state should drive response-service readback.',
                    requestedOutputCount: 4,
                    inputArtifactCount: 2,
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T16:01:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T16:00:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T16:01:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          handoffTransferSummary: {
            total: 1,
            items: [
              {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
                fromStepId: stepOneId,
                fromAgentId: 'orchestrator',
                title: 'Stored response-service transfer title',
                objective: 'Stored consumed state should drive response-service readback.',
                requestedOutputCount: 4,
                inputArtifactCount: 2,
              },
            ],
          },
        },
      },
    });
  });

  it('prefers stored consumed handoff-transfer summaries over planned handoff fallback on response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_handoff_transfer_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_handoff_transfer_precedence_1',
          taskRunSpecId: 'task_spec_handoff_transfer_precedence_1',
          status: 'succeeded',
          createdAt: '2026-04-12T16:05:00.000Z',
          updatedAt: '2026-04-12T16:06:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Return the stored transfer summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_handoff_transfer_precedence_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Prepare the transfer.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'prepared',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:05:10.000Z',
            completedAt: '2026-04-12T16:05:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_handoff_transfer_precedence_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'consumed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:05:40.000Z',
            completedAt: '2026-04-12T16:06:00.000Z',
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'orchestrator',
            toAgentId: 'engineer',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_handoff_transfer_precedence_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Planned fallback transfer title',
                objective: 'Planned fallback transfer objective.',
                successCriteria: ['fallback'],
                requestedOutputs: [
                  {
                    label: 'planned handoff brief',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  {
                    id: 'artifact-planned',
                    kind: 'file',
                    title: 'Planned Spec',
                    path: '/repo/planned-spec.md',
                    uri: null,
                  },
                ],
              },
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt: '2026-04-12T16:05:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.consumedTaskTransfers.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-12T16:06:00.000Z',
                total: 1,
                items: [
                  {
                    handoffId: `${runId}:handoff:${stepTwoId}:1`,
                    fromStepId: stepOneId,
                    fromAgentId: 'orchestrator',
                    title: 'Stored precedence transfer title',
                    objective: 'Stored consumed transfer should win over planned fallback.',
                    requestedOutputCount: 4,
                    inputArtifactCount: 2,
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T16:06:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T16:05:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T16:06:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          handoffTransferSummary: {
            total: 1,
            items: [
              {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
                fromStepId: stepOneId,
                fromAgentId: 'orchestrator',
                title: 'Stored precedence transfer title',
                objective: 'Stored consumed transfer should win over planned fallback.',
                requestedOutputCount: 4,
                inputArtifactCount: 2,
              },
            ],
          },
        },
      },
    });
  });

  it('surfaces bounded orchestration timeline summary on response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_timeline_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_timeline_1',
          taskRunSpecId: 'task_spec_timeline_1',
          status: 'succeeded',
          createdAt: '2026-04-12T16:20:00.000Z',
          updatedAt: '2026-04-12T16:21:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Return the timeline summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_timeline_1:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Run once.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:20:10.000Z',
            completedAt: '2026-04-12T16:21:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:step-started`,
              runId,
              stepId,
              type: 'step-started',
              createdAt: '2026-04-12T16:20:10.000Z',
              note: 'step started by local runner',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:step-succeeded`,
              runId,
              stepId,
              type: 'step-succeeded',
              createdAt: '2026-04-12T16:21:00.000Z',
              note: 'step completed by local runner',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:operator-note`,
              runId,
              type: 'note-added',
              createdAt: '2026-04-12T16:21:05.000Z',
              note: 'targeted drain executed',
              payload: {
                source: 'operator',
                action: 'drain-run',
              },
            }),
          ],
          lastUpdatedAt: '2026-04-12T16:21:05.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T16:20:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T16:21:05.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          orchestrationTimelineSummary: {
            total: 3,
            items: [
              {
                type: 'step-started',
                createdAt: '2026-04-12T16:20:10.000Z',
                stepId,
                note: 'step started by local runner',
                handoffId: null,
              },
              {
                type: 'step-succeeded',
                createdAt: '2026-04-12T16:21:00.000Z',
                stepId,
                note: 'step completed by local runner',
                handoffId: null,
              },
              {
                type: 'note-added',
                createdAt: '2026-04-12T16:21:05.000Z',
                stepId: null,
                note: 'targeted drain executed',
                handoffId: null,
              },
            ],
          },
        },
      },
    });
  });

  it('keeps orchestration timeline totals while limiting response readback items to the newest ten events', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_timeline_window_1';
    const stepId = `${runId}:step:1`;

    const history = Array.from({ length: 12 }, (_, index) =>
      createExecutionRunEvent({
        id: `${runId}:event:${index + 1}`,
        runId,
        stepId,
        type: index % 2 === 0 ? 'step-started' : 'note-added',
        createdAt: `2026-04-12T16:${String(index).padStart(2, '0')}:00.000Z`,
        note: `timeline event ${index + 1}`,
        payload:
          index % 2 === 0
            ? undefined
            : {
                source: 'operator',
                action: 'drain-run',
              },
      }),
    );

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_timeline_window_1',
          taskRunSpecId: 'task_spec_timeline_window_1',
          status: 'succeeded',
          createdAt: '2026-04-12T16:00:00.000Z',
          updatedAt: '2026-04-12T16:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Return the bounded timeline window.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_timeline_window_1:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Run once.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:00:00.000Z',
            completedAt: '2026-04-12T16:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history,
          lastUpdatedAt: '2026-04-12T16:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T16:00:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T16:11:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    const timeline = reread?.metadata?.executionSummary?.orchestrationTimelineSummary;
    expect(timeline?.total).toBe(12);
    expect(timeline?.items).toHaveLength(10);
    expect(timeline?.items?.[0]).toMatchObject({
      createdAt: '2026-04-12T16:02:00.000Z',
      note: 'timeline event 3',
    });
    expect(timeline?.items?.[9]).toMatchObject({
      createdAt: '2026-04-12T16:11:00.000Z',
      note: 'timeline event 12',
    });
  });

  it('returns bounded requested-output fulfillment summary on terminal response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_requested_outputs_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_1',
          taskRunSpecId: 'task_spec_requested_outputs_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:10:00.000Z',
          updatedAt: '2026-04-11T23:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the requested outputs.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_requested_outputs_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'final answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:10:10.000Z',
            completedAt: '2026-04-11T23:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [
            {
              id: 'artifact_bundle_1',
              kind: 'bundle',
              title: 'work bundle',
              path: '/tmp/work.zip',
              uri: null,
            },
          ],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the final answer.',
                    },
                  ],
                },
                {
                  type: 'artifact',
                  id: 'artifact_bundle_1',
                  artifact_type: 'file',
                  title: 'work bundle',
                  mime_type: 'application/zip',
                  uri: 'file:///tmp/work.zip',
                  disposition: 'attachment',
                  metadata: null,
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:10:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-11T23:11:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          requestedOutputSummary: {
            total: 2,
            fulfilledCount: 2,
            missingRequiredCount: 0,
            items: [
              {
                label: 'final answer',
                kind: 'final-response',
                format: 'markdown',
                destination: 'response-body',
                required: true,
                fulfilled: true,
                evidence: 'message',
              },
              {
                label: 'work bundle',
                kind: 'artifact-bundle',
                format: 'bundle',
                destination: 'artifact-store',
                required: true,
                fulfilled: true,
                evidence: 'artifact',
              },
            ],
          },
          requestedOutputPolicy: {
            status: 'satisfied',
            message: 'all required requested outputs were fulfilled',
            missingRequiredLabels: [],
          },
        },
      },
    });
  });

  it('returns failed response state when required requested outputs are missing at terminal readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_requested_outputs_missing_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_missing_1',
          taskRunSpecId: 'task_spec_requested_outputs_missing_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:20:00.000Z',
          updatedAt: '2026-04-11T23:21:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the requested outputs.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_requested_outputs_missing_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'final answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:20:10.000Z',
            completedAt: '2026-04-11T23:21:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the final answer.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:21:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:20:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-11T23:21:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'failed',
      metadata: {
        executionSummary: {
          requestedOutputPolicy: {
            status: 'missing-required',
            message: 'missing required requested outputs: work bundle',
            missingRequiredLabels: ['work bundle'],
          },
          failureSummary: {
            code: 'requested_output_required_missing',
            message: 'missing required requested outputs: work bundle',
          },
        },
      },
    });
  });

  it('prefers terminal step failure over requested-output fallback on terminal readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_failure_precedence_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_failure_precedence_1',
          taskRunSpecId: 'task_spec_failure_precedence_1',
          status: 'failed',
          createdAt: '2026-04-12T00:40:00.000Z',
          updatedAt: '2026-04-12T00:41:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the explicit terminal failure.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_failure_precedence_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'failed',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'failed before producing outputs',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            failure: {
              code: 'terminal_step_failed',
              message: 'terminal step failed before fulfilling outputs',
            },
            startedAt: '2026-04-12T00:40:10.000Z',
            completedAt: '2026-04-12T00:41:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'failed',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Partial assistant output.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T00:41:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T00:40:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T00:41:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'failed',
      metadata: {
        executionSummary: {
          requestedOutputPolicy: {
            status: 'missing-required',
            message: 'missing required requested outputs: work bundle',
            missingRequiredLabels: ['work bundle'],
          },
          failureSummary: {
            code: 'terminal_step_failed',
            message: 'terminal step failed before fulfilling outputs',
          },
        },
      },
    });
  });

  it('prefers the terminal step requested-output contract over older step requests at terminal readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_requested_outputs_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_terminal_precedence_1',
          taskRunSpecId: 'task_spec_requested_outputs_terminal_precedence_1',
          status: 'succeeded',
          createdAt: '2026-04-12T00:10:00.000Z',
          updatedAt: '2026-04-12T00:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the terminal step request contract.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_requested_outputs_terminal_precedence_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older step requested an artifact bundle.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'artifact-bundle',
                    label: 'older work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T00:10:10.000Z',
            completedAt: '2026-04-12T00:10:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_requested_outputs_terminal_precedence_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step requested only the final response.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'terminal answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T00:10:30.000Z',
            completedAt: '2026-04-12T00:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the terminal answer.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T00:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T00:10:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-12T00:11:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'completed',
      metadata: {
        executionSummary: {
          terminalStepId: stepTwoId,
          requestedOutputSummary: {
            total: 1,
            fulfilledCount: 1,
            missingRequiredCount: 0,
            items: [
              {
                label: 'terminal answer',
                kind: 'final-response',
                format: 'markdown',
                destination: 'response-body',
                required: true,
                fulfilled: true,
                evidence: 'message',
              },
            ],
          },
          requestedOutputPolicy: {
            status: 'satisfied',
            message: 'all required requested outputs were fulfilled',
            missingRequiredLabels: [],
          },
          failureSummary: null,
        },
      },
    });
  });

  it('does not treat internal structured outputs as fulfilling a required structured-report request', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_service_requested_outputs_internal_only_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_internal_only_1',
          taskRunSpecId: 'task_spec_requested_outputs_internal_only_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:30:00.000Z',
          updatedAt: '2026-04-11T23:31:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the structured report.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_requested_outputs_internal_only_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the structured report.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'structured-report',
                    label: 'report payload',
                    format: 'json',
                    required: true,
                    destination: 'response-metadata',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:30:10.000Z',
            completedAt: '2026-04-11T23:31:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'artifact',
                  id: 'artifact_only_output',
                  artifact_type: 'file',
                  title: 'internal-only artifact',
                  mime_type: 'application/octet-stream',
                  uri: 'file:///tmp/internal-only.bin',
                  disposition: 'attachment',
                  metadata: null,
                },
              ],
            },
            {
              key: `human.resume.${stepId}`,
              value: {
                stepId,
                resumedAt: '2026-04-11T23:30:30.000Z',
                note: 'internal operator resume record',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
            {
              key: `step.localActionOutcomes.${stepId}`,
              value: {
                ownerStepId: stepId,
                generatedAt: '2026-04-11T23:30:45.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Internal local-action record.',
                    command: 'node',
                    args: ['-e', "process.stdout.write('ok')"],
                    resultSummary: 'internal shell executed',
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:31:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:30:00.000Z',
          }),
        ],
      }),
    );

    const service = createExecutionResponsesService({
      control,
      now: () => new Date('2026-04-11T23:31:00.000Z'),
    });

    const reread = await service.readResponse(runId);
    expect(reread).toMatchObject({
      id: runId,
      status: 'failed',
      metadata: {
        executionSummary: {
          requestedOutputSummary: {
            total: 1,
            fulfilledCount: 0,
            missingRequiredCount: 1,
            items: [
              {
                label: 'report payload',
                kind: 'structured-report',
                format: 'json',
                destination: 'response-metadata',
                required: true,
                fulfilled: false,
                evidence: null,
              },
            ],
          },
          requestedOutputPolicy: {
            status: 'missing-required',
            message: 'missing required requested outputs: report payload',
            missingRequiredLabels: ['report payload'],
          },
          failureSummary: {
            code: 'requested_output_required_missing',
            message: 'missing required requested outputs: report payload',
          },
        },
      },
    });
  });
});
