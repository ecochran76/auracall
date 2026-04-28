import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { cancelExecutionRun, executeStoredExecutionRunOnce } from '../src/runtime/runner.js';
import type { ExecuteLocalActionRequestResult, ExecuteStoredRunStepResult } from '../src/runtime/runner.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';
import { BrowserAutomationError } from '../src/oracle/errors.js';

function createDirectBundle(runId: string) {
  const createdAt = '2026-04-08T13:00:00.000Z';
  const stepId = `${runId}:step:1`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status: 'planned',
      createdAt,
      updatedAt: createdAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'Run once.',
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
          prompt: 'Run once.',
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
      structuredOutputs: [],
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
  });
}

describe('runtime runner', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('executes one stored direct run to completion through the bounded local runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_success'));

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_success',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:01:00.000Z',
      control,
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(executed.bundle.sharedState.status).toBe('succeeded');
    expect(executed.bundle.steps[0]?.status).toBe('succeeded');
    expect(executed.bundle.steps[0]?.output?.summary).toBe('bounded local runner pass completed');
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'lease-acquired',
      'step-started',
      'step-succeeded',
      'lease-released',
    ]);
    expect(executed.bundle.leases[0]?.status).toBe('released');
  });

  it('records a failed run when the local runner step throws', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_failure'));

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_failure',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:02:00.000Z',
      control,
      executeStep: async () => {
        throw new Error('step exploded');
      },
    });

    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[0]?.status).toBe('failed');
    expect(executed.bundle.steps[0]?.failure?.message).toBe('step exploded');
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'lease-acquired',
      'step-started',
      'step-failed',
      'lease-released',
    ]);
    expect(executed.bundle.leases[0]?.releaseReason).toBe('failed');
  });

  it('preserves browser automation failure details for operator recovery', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_browser_failure_details'));

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_browser_failure_details',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:02:10.000Z',
      control,
      executeStep: async () => {
        throw new BrowserAutomationError('ChatGPT session not detected. Login button detected on page.', {
          stage: 'chatgpt-login-required',
          providerState: 'login-required',
          authRecoveryCommand: 'auracall --profile wsl-chrome-2 login --target chatgpt',
          managedProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
        });
      },
    });

    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.steps[0]?.failure).toMatchObject({
      code: 'runner_execution_failed',
      message: 'ChatGPT session not detected. Login button detected on page.',
      details: {
        providerState: 'login-required',
        authRecoveryCommand: 'auracall --profile wsl-chrome-2 login --target chatgpt',
        managedProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      },
    });
  });

  it('fails before executing a step that exceeds the task turn limit', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:02:30.000Z';
    const runId = 'run_turn_limit';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run with a bounded turn budget.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                turnPolicy: {
                  maxTurns: 1,
                },
              },
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
            failure: null,
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                turnPolicy: {
                  maxTurns: 1,
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    let executedStep = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:03:00.000Z',
      control,
      executeStep: async () => {
        executedStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executedStep).toBe(false);
    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[1]?.status).toBe('failed');
    expect(executed.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_turn_limit_exceeded',
      message: 'step order 2 exceeds task turn limit 1',
      ownerStepId: stepTwoId,
      details: {
        maxTurns: 1,
        stepOrder: 2,
      },
    });
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'step-failed',
    ]);
  });

  it('fails before executing a step when elapsed runtime exceeds task maxRuntimeMinutes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:04:00.000Z';
    const runId = 'run_runtime_budget';
    const stepId = `${runId}:step:1`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Respect task runtime budget.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Only step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                constraints: {
                  maxRuntimeMinutes: 5,
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    let executedStep = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:10:00.000Z',
      control,
      executeStep: async () => {
        executedStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executedStep).toBe(false);
    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[0]?.status).toBe('failed');
    expect(executed.bundle.steps[0]?.failure).toMatchObject({
      code: 'task_runtime_limit_exceeded',
      message: 'elapsed runtime 6 minutes exceeds task runtime limit 5',
      ownerStepId: stepId,
      details: {
        maxRuntimeMinutes: 5,
        elapsedRuntimeMinutes: 6,
      },
    });
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'step-failed',
    ]);
  });

  it('fails before executing a step that exceeds task providerBudget.maxRequests', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:03:30.000Z';
    const runId = 'run_provider_request_limit';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run with a bounded provider request budget.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                constraints: {
                  providerBudget: {
                    maxRequests: 1,
                  },
                },
              },
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
            failure: null,
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                constraints: {
                  providerBudget: {
                    maxRequests: 1,
                  },
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    let executedStep = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:04:00.000Z',
      control,
      executeStep: async () => {
        executedStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executedStep).toBe(false);
    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[1]?.status).toBe('failed');
    expect(executed.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_provider_request_limit_exceeded',
      message: 'step order 2 exceeds task provider request limit 1',
      ownerStepId: stepTwoId,
      details: {
        maxRequests: 1,
        stepOrder: 2,
      },
    });
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'step-failed',
    ]);
  });

  it('fails before executing a step when stored provider usage exceeds task providerBudget.maxTokens', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:03:45.000Z';
    const runId = 'run_provider_token_limit';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run with a bounded provider token budget.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                constraints: {
                  providerBudget: {
                    maxTokens: 100,
                  },
                },
              },
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
            failure: null,
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                constraints: {
                  providerBudget: {
                    maxTokens: 100,
                  },
                },
              },
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
              key: `step.providerUsage.${stepOneId}`,
              value: {
                ownerStepId: stepOneId,
                generatedAt: createdAt,
                inputTokens: 90,
                outputTokens: 25,
                reasoningTokens: 5,
                totalTokens: 120,
              },
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

    let executedStep = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:04:00.000Z',
      control,
      executeStep: async () => {
        executedStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executedStep).toBe(false);
    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[1]?.status).toBe('failed');
    expect(executed.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_provider_token_limit_exceeded',
      message: 'stored provider token usage 120 exceeds task provider token limit 100',
      ownerStepId: stepTwoId,
      details: {
        maxTokens: 100,
        consumedTokens: 120,
      },
    });
    expect(executed.bundle.events.map((event) => event.type)).toEqual([
      'run-created',
      'step-failed',
    ]);
  });

  it('persists provider usage from the stored runner callback into shared state', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_provider_usage'));

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_provider_usage',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:20:00.000Z',
      control,
      executeStep: async () => ({
        usage: {
          inputTokens: 120,
          outputTokens: 30,
          reasoningTokens: 10,
          totalTokens: 160,
        },
        output: {
          summary: 'usage recorded',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.providerUsage.run_provider_usage:step:1',
      value: {
        ownerStepId: 'run_provider_usage:step:1',
        generatedAt: '2026-04-08T13:20:00.000Z',
        inputTokens: 120,
        outputTokens: 30,
        reasoningTokens: 10,
        totalTokens: 160,
      },
    });
    expect(executed.bundle.sharedState.notes).toContain('provider usage i/o/r/t: 120/30/10/160');
  });

  it('fails stored runtime state when required requested outputs are still missing after step execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'run_requested_outputs_missing';
    const stepId = `${runId}:step:1`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T13:04:00.000Z',
          updatedAt: '2026-04-08T13:04:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Produce the requested outputs.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
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
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:04:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T13:04:00.000Z',
          }),
        ],
      }),
    );

    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:05:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'Here is the final answer.',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[0]?.status).toBe('failed');
    expect(executed.bundle.steps[0]?.output?.summary).toBe('Here is the final answer.');
    expect(executed.bundle.steps[0]?.failure).toMatchObject({
      code: 'requested_output_required_missing',
      message: 'missing required requested outputs: work bundle',
      ownerStepId: stepId,
      details: {
        missingRequiredLabels: ['work bundle'],
      },
    });
  });

  it('injects task structured context into runtime step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'run_task_structured_context',
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T13:04:30.000Z',
          updatedAt: '2026-04-08T13:04:30.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Use task structured context.',
          initialInputs: {},
          sharedStateId: 'run_task_structured_context:state',
          stepIds: ['run_task_structured_context:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'run_task_structured_context:step:1',
            runId: 'run_task_structured_context',
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Base prompt.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                taskOverrideStructuredContext: {
                  approvedPath: '/repo/approved',
                  requestedMode: 'bounded',
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'run_task_structured_context:state',
          runId: 'run_task_structured_context',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:04:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: 'run_task_structured_context:event:run-created',
            runId: 'run_task_structured_context',
            type: 'run-created',
            createdAt: '2026-04-08T13:04:30.000Z',
          }),
        ],
      }),
    );

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_task_structured_context',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:05:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'used task structured context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task structured context:');
    expect(observedPrompt).toContain(
      '{"approvedPath":"/repo/approved","requestedMode":"bounded"}',
    );
    expect(observedContext).toMatchObject({
      taskStructuredContext: {
        approvedPath: '/repo/approved',
        requestedMode: 'bounded',
      },
      taskStructuredContextPromptContext:
        'Task structured context:\n- {"approvedPath":"/repo/approved","requestedMode":"bounded"}',
    });
  });

  it('injects task input artifacts into runtime step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'run_task_input_artifacts',
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T13:04:30.000Z',
          updatedAt: '2026-04-08T13:04:30.000Z',
          trigger: 'service',
          requestedBy: null,
          entryPrompt: 'Use task input artifacts.',
          initialInputs: {},
          sharedStateId: 'run_task_input_artifacts:state',
          stepIds: ['run_task_input_artifacts:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'run_task_input_artifacts:step:1',
            runId: 'run_task_input_artifacts',
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Base prompt.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-readme',
                  kind: 'repo-file',
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
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'run_task_input_artifacts:state',
          runId: 'run_task_input_artifacts',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:04:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: 'run_task_input_artifacts:event:run-created',
            runId: 'run_task_input_artifacts',
            type: 'run-created',
            createdAt: '2026-04-08T13:04:30.000Z',
          }),
        ],
      }),
    );

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_task_input_artifacts',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:05:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'used task input artifacts',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task input artifacts:');
    expect(observedPrompt).toContain('- repo-file:README');
    expect(observedPrompt).toContain('- url:Spec');
    expect(observedContext).toMatchObject({
      taskInputArtifacts: [
        {
          id: 'artifact-readme',
          kind: 'repo-file',
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
      taskInputArtifactsPromptContext: 'Task input artifacts:\n- repo-file:README\n- url:Spec',
    });
  });

  it('injects task context into runtime step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'run_task_context',
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T13:04:30.000Z',
          updatedAt: '2026-04-08T13:04:30.000Z',
          trigger: 'service',
          requestedBy: null,
          entryPrompt: 'Use task context.',
          initialInputs: {},
          sharedStateId: 'run_task_context:state',
          stepIds: ['run_task_context:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'run_task_context:step:1',
            runId: 'run_task_context',
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Base prompt.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                taskContext: {
                  repoRoot: '/repo',
                  ticketId: 'AURA-101',
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'run_task_context:state',
          runId: 'run_task_context',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:04:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: 'run_task_context:event:run-created',
            runId: 'run_task_context',
            type: 'run-created',
            createdAt: '2026-04-08T13:04:30.000Z',
          }),
        ],
      }),
    );

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_task_context',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:05:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'used task context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task context:');
    expect(observedPrompt).toContain('{"repoRoot":"/repo","ticketId":"AURA-101"}');
    expect(observedContext).toMatchObject({
      taskContext: {
        repoRoot: '/repo',
        ticketId: 'AURA-101',
      },
      taskContextPromptContext: 'Task context:\n- {"repoRoot":"/repo","ticketId":"AURA-101"}',
    });
  });

  it('keeps an externally cancelled run cancelled when step work completes later', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_cancelled_externally'));

    let releaseStepWork!: () => void;
    const stepGate = new Promise<void>((resolve) => {
      releaseStepWork = resolve;
    });

    const executionPromise = executeStoredExecutionRunOnce({
      runId: 'run_cancelled_externally',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:04:00.000Z',
      control,
      executeStep: async () => {
        await stepGate;
        return {
          output: {
            summary: 'late step completion',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    let runningRecord = await control.readRun('run_cancelled_externally');
    while (!runningRecord?.bundle.steps[0] || runningRecord.bundle.steps[0].status !== 'running') {
      await new Promise((resolve) => setTimeout(resolve, 10));
      runningRecord = await control.readRun('run_cancelled_externally');
    }

    const cancelledBundle = cancelExecutionRun({
      bundle: runningRecord.bundle,
      cancelledAt: '2026-04-08T13:04:00.000Z',
      note: 'cancelled by host control',
      source: 'operator',
    });
    const cancelledRecord = await control.persistRun({
      runId: 'run_cancelled_externally',
      bundle: cancelledBundle,
      expectedRevision: runningRecord.revision,
    });
    await control.releaseLease({
      runId: 'run_cancelled_externally',
      leaseId: cancelledRecord.bundle.leases[0]?.id,
      releasedAt: '2026-04-08T13:04:00.000Z',
      releaseReason: 'cancelled',
    });

    releaseStepWork();
    const executed = await executionPromise;

    expect(executed.bundle.run.status).toBe('cancelled');
    expect(executed.bundle.sharedState.status).toBe('cancelled');
    expect(executed.bundle.steps[0]?.status).toBe('cancelled');
    expect(executed.bundle.leases[0]?.status).toBe('released');
    expect(executed.bundle.leases[0]?.releaseReason).toBe('cancelled');
  });

  it('persists and resolves local action requests emitted from step output', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_local_action');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]?.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            allowedActionKinds: ['shell'],
          },
        },
      },
    };
    await control.createRun(bundle);

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_local_action',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:03:00.000Z',
      control,
      executeStep: async () => ({
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
        sharedState: {
          notes: ['local action completed successfully'],
        },
      }),
    });

    expect(executed.bundle.localActionRequests).toHaveLength(1);
    expect(executed.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'executed',
      resultSummary: 'executed shell',
      resultPayload: { exitCode: 0 },
    });
    expect(executed.bundle.sharedState.notes).toContain('local action completed successfully');
    expect(executed.bundle.sharedState.notes).toContain(
      'local action outcomes for run_local_action:step:1: executed=1',
    );
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.run_local_action:step:1',
      value: {
        ownerStepId: 'run_local_action:step:1',
        generatedAt: '2026-04-08T13:03:00.000Z',
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
            requestId: 'run_local_action:action:run_local_action:step:1:1',
            kind: 'shell',
            status: 'executed',
            summary: 'Run the focused verification command.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            resultSummary: 'executed shell',
          },
        ],
      },
    });
    expect(executed.bundle.events.map((event) => event.note)).toContain('local action requested: shell');
    expect(executed.bundle.events.map((event) => event.note)).toContain('executed shell');
  });

  it('normalizes actionType-style local action requests before policy evaluation and persistence', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_local_action_alias');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]?.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            allowedActionKinds: ['shell'],
          },
        },
      },
    };
    await control.createRun(bundle);

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_local_action_alias',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:03:30.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one shell action through actionType aliasing',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                actionType: 'shell',
                command: 'pnpm',
                args: ['vitest', 'run'],
                payload: {
                  cwd: process.cwd(),
                },
              },
            ],
          },
          notes: [],
        },
      }),
      executeLocalActionRequest: async ({ request }) => ({
        status: 'executed',
        summary: `executed ${request.kind}`,
        payload: { exitCode: 0, cwd: request.structuredPayload.cwd ?? null },
      }),
    });

    expect(executed.bundle.localActionRequests).toHaveLength(1);
    expect(executed.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      summary: 'Run bounded shell action: pnpm',
      command: 'pnpm',
      args: ['vitest', 'run'],
      structuredPayload: {
        cwd: process.cwd(),
      },
      status: 'executed',
      resultSummary: 'executed shell',
      resultPayload: {
        exitCode: 0,
        cwd: process.cwd(),
      },
    });
  });

  it('normalizes provider and local-action artifact refs before persistence', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_artifact_ref_normalization');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]?.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            allowedActionKinds: ['shell'],
          },
        },
      },
    };
    await control.createRun(bundle);

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_artifact_ref_normalization',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:03:45.000Z',
      control,
      executeStep: async () =>
        ({
          output: {
            summary: 'request one shell action and emit artifact refs',
            artifacts: [
              123,
              {
                id: 'provider-artifact',
                kind: 'file',
                title: 'Provider artifact',
                path: '/tmp/provider.txt',
                uri: 42,
              },
              {
                id: 'missing-kind',
                title: 'invalid artifact',
              },
            ],
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
          sharedState: {
            artifacts: [
              {
                id: 'provider-shared-artifact',
                kind: 'bundle',
                title: 'Provider shared artifact',
                path: '/tmp/provider.zip',
                uri: null,
              },
              {
                kind: 'missing-id',
                title: 'invalid shared artifact',
              },
            ],
            structuredOutputs: [
              {
                key: 'response.output',
                value: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Normalized response output.' }],
                  },
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'bad_content', text: 'drop malformed item' }],
                  },
                ],
              },
            ],
          },
        }) as unknown as ExecuteStoredRunStepResult,
      executeLocalActionRequest: async () =>
        ({
          status: 'executed',
          summary: 'executed shell',
          payload: { exitCode: 0 },
          sharedState: {
            artifacts: [
              {
                id: 'host-artifact',
                kind: 'file',
                title: 'Host artifact',
                path: '/tmp/host.txt',
                uri: null,
              },
              'invalid-host-artifact',
            ],
          },
        }) as unknown as ExecuteLocalActionRequestResult,
    });

    expect(executed.bundle.steps[0]?.output?.artifacts).toEqual([
      {
        id: 'provider-artifact',
        kind: 'file',
        title: 'Provider artifact',
        path: '/tmp/provider.txt',
        uri: null,
      },
    ]);
    expect(executed.bundle.sharedState.artifacts).toEqual([
      {
        id: 'provider-shared-artifact',
        kind: 'bundle',
        title: 'Provider shared artifact',
        path: '/tmp/provider.zip',
        uri: null,
      },
      {
        id: 'host-artifact',
        kind: 'file',
        title: 'Host artifact',
        path: '/tmp/host.txt',
        uri: null,
      },
    ]);
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'response.output',
      value: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Normalized response output.' }],
        },
      ],
    });
  });

  it('rejects local action requests when step policy forbids host actions', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_local_action_forbidden');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]?.input,
        structuredData: {
          localActionPolicy: {
            mode: 'forbidden',
            allowedActionKinds: [],
          },
        },
      },
    };
    await control.createRun(bundle);

    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_local_action_forbidden',
      ownerId: 'runner:local-test',
      now: () => '2026-04-08T13:04:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one forbidden shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Attempt a forbidden shell action.',
              },
            ],
          },
          notes: [],
        },
      }),
    });

    expect(executed.bundle.localActionRequests).toHaveLength(1);
    expect(executed.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'rejected',
      resultSummary: 'local action rejected because step policy forbids host actions',
    });
    expect(executed.bundle.sharedState.notes).toContain(
      'local action outcomes for run_local_action_forbidden:step:1: rejected=1',
    );
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.run_local_action_forbidden:step:1',
      value: {
        ownerStepId: 'run_local_action_forbidden:step:1',
        generatedAt: '2026-04-08T13:04:00.000Z',
        total: 1,
        counts: {
          requested: 0,
          approved: 0,
          rejected: 1,
          executed: 0,
          failed: 0,
          cancelled: 0,
        },
        items: [
          {
            requestId: 'run_local_action_forbidden:action:run_local_action_forbidden:step:1:1',
            kind: 'shell',
            status: 'rejected',
            summary: 'Attempt a forbidden shell action.',
            command: null,
            args: [],
            resultSummary: 'local action rejected because step policy forbids host actions',
          },
        ],
      },
    });
  });


  it('refreshes lease heartbeat while a delayed step is still executing', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_lease_heartbeat'));

    let tick = 0;
    const executed = await executeStoredExecutionRunOnce({
      runId: 'run_lease_heartbeat',
      ownerId: 'runner:local-test',
      control,
      now: () => new Date(Date.UTC(2026, 3, 8, 13, 10, tick++)).toISOString(),
      leaseHeartbeatIntervalMs: 5,
      leaseHeartbeatTtlMs: 30_000,
      executeStep: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          output: {
            summary: 'delayed completion',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.run.status).toBe('succeeded');
    expect(executed.bundle.leases[0]?.status).toBe('released');
    expect(executed.bundle.leases[0]?.expiresAt).not.toBe(executed.bundle.leases[0]?.acquiredAt);
    expect(executed.bundle.leases[0]?.heartbeatAt).not.toBe(executed.bundle.leases[0]?.acquiredAt);
    expect(executed.bundle.events.some((event) => event.note?.includes('lease heartbeat from runner:local-test'))).toBe(true);
  });

  it('injects dependency-scoped local action outcome summaries into later step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:05:00.000Z';
    const runId = 'run_local_action_context';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'allowed',
                  allowedActionKinds: ['shell'],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                humanInteractionPolicy: {
                  allowHumanEscalation: true,
                  defaultBehavior: 'continue',
                  requiredOn: [],
                  allowClarificationRequests: true,
                  allowApprovalRequests: true,
                },
              },
              notes: [],
            },
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'step-one',
            toAgentId: 'step-two',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: null,
              toRoleId: null,
              taskTransfer: {
                title: 'Carry dependency task context',
                objective: 'Pass bounded requested-output and artifact refs to the next step.',
                successCriteria: ['handoff consumed', 42],
                requestedOutputs: [
                  'ignore malformed output',
                  {
                    label: 'handoff-summary',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  123,
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
            createdAt,
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:05:00.000Z',
      control,
      executeStep: async ({ step }) => {
        if (step.id !== stepOneId) {
          throw new Error(`unexpected step on first pass: ${step.id}`);
        }
        return {
          output: {
            summary: 'request one shell action',
            artifacts: [],
            structuredData: {
              localActionRequests: [
                {
                  kind: 'shell',
                  summary: 'Run a dependency-scoped shell action.',
                  command: 'pnpm',
                  args: ['vitest', 'run'],
                },
              ],
            },
            notes: [],
          },
        };
      },
      executeLocalActionRequest: async () => ({
        status: 'executed',
        summary: 'executed shell',
        payload: { exitCode: 0 },
      }),
    });

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:06:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consume dependency context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.steps[1]?.status).toBe('succeeded');
    expect(executed.bundle.handoffs).toContainEqual({
      id: `${runId}:handoff:${stepTwoId}:1`,
      teamRunId: runId,
      fromStepId: stepOneId,
      toStepId: stepTwoId,
      fromAgentId: 'step-one',
      toAgentId: 'step-two',
      summary: `Planned handoff for ${runId}`,
      artifacts: [],
      structuredData: {
        taskRunSpecId: null,
        toRoleId: null,
        taskTransfer: {
          title: 'Carry dependency task context',
          objective: 'Pass bounded requested-output and artifact refs to the next step.',
          successCriteria: ['handoff consumed', 42],
          requestedOutputs: [
            'ignore malformed output',
            {
              label: 'handoff-summary',
              kind: 'structured-report',
              destination: 'handoff',
              required: true,
            },
          ],
          inputArtifacts: [
            123,
            {
              id: 'artifact-spec',
              kind: 'file',
              title: 'Spec',
              path: '/repo/spec.md',
              uri: null,
            },
          ],
        },
        localActionOutcomeSummaryKey: `step.localActionOutcomes.${stepOneId}`,
        localActionOutcomeContext: {
          ownerStepId: stepOneId,
          generatedAt: '2026-04-08T13:05:00.000Z',
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
              summary: 'Run a dependency-scoped shell action.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: 'executed shell',
            },
          ],
        },
        localActionDecisionGuidance: {
          action: 'continue',
          rationale: 'dependency host actions completed successfully',
          counts: {
            requested: 0,
            approved: 0,
            rejected: 0,
            executed: 1,
            failed: 0,
            cancelled: 0,
          },
        },
      },
      notes: [
        'planned handoff derived from team step dependencies',
        'handoff payload updated with dependency-scoped local action outcome context',
        `handoff consumed by ${stepTwoId}`,
      ],
      status: 'consumed',
      createdAt,
    });
    expect(observedPrompt).toContain('Second step.');
    expect(observedPrompt).toContain('Dependency task transfers:');
    expect(observedPrompt).toContain(`- ${stepOneId} (step-one): Carry dependency task context`);
    expect(observedPrompt).toContain(
      'objective: Pass bounded requested-output and artifact refs to the next step.',
    );
    expect(observedPrompt).toContain('Dependency local action outcomes:');
    expect(observedPrompt).toContain(
      'Dependency local action decision guidance: CONTINUE - dependency host actions completed successfully',
    );
    expect(observedPrompt).toContain(`${stepOneId}: executed=1; latest=executed shell`);
    expect(observedContext).toMatchObject({
      dependencyStepIds: [stepOneId],
      dependencyTaskTransfers: [
        {
          handoffId: `${runId}:handoff:${stepTwoId}:1`,
          fromStepId: stepOneId,
          fromAgentId: 'step-one',
          summary: `Planned handoff for ${runId}`,
          taskTransfer: {
            title: 'Carry dependency task context',
            objective: 'Pass bounded requested-output and artifact refs to the next step.',
            successCriteria: ['handoff consumed'],
            requestedOutputs: [
              {
                label: 'handoff-summary',
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
      ],
      dependencyTaskTransferPromptContext:
        'Dependency task transfers:\n' +
        `- ${stepOneId} (step-one): Carry dependency task context\n` +
        '  objective: Pass bounded requested-output and artifact refs to the next step.\n' +
        '  requestedOutputs: [{"label":"handoff-summary","kind":"structured-report","destination":"handoff","required":true}]\n' +
        '  inputArtifacts: [{"id":"artifact-spec","kind":"file","title":"Spec","path":"/repo/spec.md","uri":null}]',
      dependencyLocalActionOutcomes: [
        {
          key: `step.localActionOutcomes.${stepOneId}`,
          value: {
            ownerStepId: stepOneId,
            generatedAt: '2026-04-08T13:05:00.000Z',
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
                summary: 'Run a dependency-scoped shell action.',
                command: 'pnpm',
                args: ['vitest', 'run'],
                resultSummary: 'executed shell',
              },
            ],
          },
        },
      ],
      dependencyLocalActionDecisionGuidance: {
        action: 'continue',
        rationale: 'dependency host actions completed successfully',
        counts: {
          requested: 0,
          approved: 0,
          rejected: 0,
          executed: 1,
          failed: 0,
          cancelled: 0,
        },
      },
      dependencyLocalActionOutcomePromptContext:
        `Dependency local action outcomes:\n- ${stepOneId}: executed=1; latest=executed shell`,
      dependencyLocalActionDecisionPromptContext:
        'Dependency local action decision guidance: CONTINUE - dependency host actions completed successfully',
      humanEscalationResume: null,
      humanEscalationResumePromptContext: null,
      upstreamLocalActionOutcomes: [
        {
          key: `step.localActionOutcomes.${stepOneId}`,
          value: {
            ownerStepId: stepOneId,
            generatedAt: '2026-04-08T13:05:00.000Z',
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
                summary: 'Run a dependency-scoped shell action.',
                command: 'pnpm',
                args: ['vitest', 'run'],
                resultSummary: 'executed shell',
              },
            ],
          },
        },
      ],
    });
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: `step.consumedTaskTransfers.${stepTwoId}`,
      value: {
        ownerStepId: stepTwoId,
        generatedAt: '2026-04-08T13:06:00.000Z',
        total: 1,
        items: [
          {
            handoffId: `${runId}:handoff:${stepTwoId}:1`,
            fromStepId: stepOneId,
            fromAgentId: 'step-one',
            title: 'Carry dependency task context',
            objective: 'Pass bounded requested-output and artifact refs to the next step.',
            requestedOutputCount: 1,
            inputArtifactCount: 1,
          },
        ],
      },
    });
    expect(executed.bundle.sharedState.notes).toContain(
      `consumed task transfers for ${stepTwoId}: total=1`,
    );
    expect(executed.bundle.sharedState.history).toContainEqual({
      id: `${runId}:event:${runId}:handoff:${stepTwoId}:1:consumed:2026-04-08T13:06:00.000Z`,
      runId,
      stepId: stepTwoId,
      type: 'handoff-consumed',
      createdAt: '2026-04-08T13:06:00.000Z',
      leaseId: null,
      note: `handoff consumed from ${stepOneId} by ${stepTwoId}`,
      payload: {
        handoffId: `${runId}:handoff:${stepTwoId}:1`,
        fromStepId: stepOneId,
        fromAgentId: 'step-one',
      },
    });
  });

  it('escalates decision guidance when dependency host actions are rejected', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:07:00.000Z';
    const runId = 'run_local_action_escalate';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'forbidden',
                  allowedActionKinds: [],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                humanInteractionPolicy: {
                  allowHumanEscalation: true,
                  defaultBehavior: 'continue',
                  requiredOn: [],
                  allowClarificationRequests: true,
                  allowApprovalRequests: true,
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:07:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one forbidden shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Attempt a forbidden shell action.',
              },
            ],
          },
          notes: [],
        },
      }),
    });

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:08:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consume escalated dependency context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.steps[1]?.status).toBe('succeeded');
    expect(observedPrompt).toContain(
      'Dependency local action decision guidance: ESCALATE - dependency host actions include rejected or failed outcomes',
    );
    expect(observedContext).toMatchObject({
      dependencyLocalActionDecisionGuidance: {
        action: 'escalate',
        rationale: 'dependency host actions include rejected or failed outcomes',
        counts: {
          rejected: 1,
          failed: 0,
          executed: 0,
        },
      },
      dependencyLocalActionDecisionPromptContext:
        'Dependency local action decision guidance: ESCALATE - dependency host actions include rejected or failed outcomes',
    });
  });

  it('steers decision guidance when dependency host actions are approved but not executed', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:09:00.000Z';
    const runId = 'run_local_action_steer';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'allowed',
                  allowedActionKinds: ['shell'],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'step-one',
            toAgentId: 'step-two',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: null,
              toRoleId: null,
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt,
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:09:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Queue one shell action for later execution.',
                command: 'pnpm',
                args: ['vitest', 'run'],
              },
            ],
          },
          notes: [],
        },
      }),
      executeLocalActionRequest: async () => ({
        status: 'approved',
        summary: 'approved shell for later execution',
        payload: { queued: true },
      }),
    });

    let observedContext: unknown = null;
    let observedPrompt: string | null = null;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:10:00.000Z',
      control,
      executeStep: async ({ step }) => {
        observedContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consume steer dependency context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(executed.bundle.steps[1]?.status).toBe('succeeded');
    expect(observedPrompt).toContain(
      'Dependency local action decision guidance: STEER - dependency host actions are approved but not yet executed',
    );
    expect(observedPrompt).toContain('Dependency local action steer contract:');
    expect(observedPrompt).toContain('continue-with-caution');
    expect(observedContext).toMatchObject({
      dependencyLocalActionDecisionGuidance: {
        action: 'steer',
        rationale: 'dependency host actions are approved but not yet executed',
        counts: {
          requested: 0,
          approved: 1,
          rejected: 0,
          executed: 0,
          failed: 0,
          cancelled: 0,
        },
        contract: {
          kind: 'host-action-steer',
          recommendedAction: 'continue-with-caution',
          promptAppend:
            'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
          structuredContext: {
            pendingHostActions: 1,
            approvedCount: 1,
            requestedCount: 0,
            cancelledCount: 0,
          },
        },
      },
      dependencyLocalActionSteerContract: {
        kind: 'host-action-steer',
        recommendedAction: 'continue-with-caution',
        promptAppend:
          'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
        structuredContext: {
          pendingHostActions: 1,
          approvedCount: 1,
          requestedCount: 0,
          cancelledCount: 0,
        },
      },
      dependencyLocalActionDecisionPromptContext:
        'Dependency local action decision guidance: STEER - dependency host actions are approved but not yet executed',
      dependencyLocalActionSteerPromptContext:
        'Dependency local action steer contract:\n- recommendedAction: continue-with-caution\n- promptAppend: Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.\n- structuredContext: {"pendingHostActions":1,"approvedCount":1,"requestedCount":0,"cancelledCount":0}',
    });
    expect(executed.bundle.handoffs).toContainEqual({
      id: `${runId}:handoff:${stepTwoId}:1`,
      teamRunId: runId,
      fromStepId: stepOneId,
      toStepId: stepTwoId,
      fromAgentId: 'step-one',
      toAgentId: 'step-two',
      summary: `Planned handoff for ${runId}`,
      artifacts: [],
      structuredData: {
        taskRunSpecId: null,
        toRoleId: null,
        localActionOutcomeSummaryKey: `step.localActionOutcomes.${stepOneId}`,
        localActionOutcomeContext: {
          ownerStepId: stepOneId,
          generatedAt: '2026-04-08T13:09:00.000Z',
          total: 1,
          counts: {
            requested: 0,
            approved: 1,
            rejected: 0,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
          items: [
            {
              requestId: `${runId}:action:${stepOneId}:1`,
              kind: 'shell',
              status: 'approved',
              summary: 'Queue one shell action for later execution.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: 'approved shell for later execution',
            },
          ],
        },
        localActionDecisionGuidance: {
          action: 'steer',
          rationale: 'dependency host actions are approved but not yet executed',
          counts: {
            requested: 0,
            approved: 1,
            rejected: 0,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
          contract: {
            kind: 'host-action-steer',
            recommendedAction: 'continue-with-caution',
            promptAppend:
              'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
            structuredContext: {
              pendingHostActions: 1,
              approvedCount: 1,
              requestedCount: 0,
              cancelledCount: 0,
            },
          },
        },
      },
      notes: [
        'planned handoff derived from team step dependencies',
        'handoff payload updated with dependency-scoped local action outcome context',
      ],
      status: 'prepared',
      createdAt,
    });
  });

  it('pauses for human escalation when dependency guidance escalates and default behavior is pause', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:11:00.000Z';
    const runId = 'run_local_action_pause';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'forbidden',
                  allowedActionKinds: [],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
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
          structuredOutputs: [],
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

    await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:11:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one forbidden shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Attempt a forbidden shell action.',
              },
            ],
          },
          notes: [],
        },
      }),
    });

    let secondStepExecuted = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:12:00.000Z',
      control,
      executeStep: async () => {
        secondStepExecuted = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(secondStepExecuted).toBe(false);
    expect(executed.bundle.run.status).toBe('cancelled');
    expect(executed.bundle.sharedState.status).toBe('cancelled');
    expect(executed.bundle.steps[1]).toMatchObject({
      status: 'cancelled',
      output: {
        summary: 'paused for human escalation',
      },
    });
    expect(executed.bundle.sharedState.notes).toContain('run paused for human escalation');
    expect(executed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: `human.escalation.${stepTwoId}`,
      value: {
        stepId: stepTwoId,
        requestedAt: '2026-04-08T13:12:00.000Z',
        reason: 'dependency-local-action-escalate',
        guidance: {
          action: 'escalate',
          rationale: 'dependency host actions include rejected or failed outcomes',
          counts: {
            requested: 0,
            approved: 0,
            rejected: 1,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
      },
    });
  });

  it('pauses for human escalation when dependency host actions remain requested under approval-required policy', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:12:30.000Z';
    const runId = 'run_local_action_requested_pause';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'approval-required',
                  allowedActionKinds: ['shell'],
                  allowedCommands: ['node'],
                  allowedCwdRoots: [process.cwd()],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
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
          structuredOutputs: [],
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

    const firstPass = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:13:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one approval-gated shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Queue one bounded shell action for operator approval.',
                command: 'node',
                args: ['-e', 'process.stdout.write("pending")'],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
            ],
          },
          notes: [],
        },
      }),
    });

    expect(firstPass.bundle.run.status).toBe('running');
    expect(firstPass.bundle.steps[0]).toMatchObject({
      status: 'succeeded',
      output: {
        summary: 'request one approval-gated shell action',
      },
    });
    expect(firstPass.bundle.localActionRequests).toContainEqual(
      expect.objectContaining({
        kind: 'shell',
        status: 'requested',
        command: 'node',
        resultSummary: null,
      }),
    );
    expect(firstPass.bundle.sharedState.structuredOutputs).toContainEqual({
      key: `step.localActionOutcomes.${stepOneId}`,
      value: {
        ownerStepId: stepOneId,
        generatedAt: '2026-04-08T13:13:00.000Z',
        total: 1,
        counts: {
          requested: 1,
          approved: 0,
          rejected: 0,
          executed: 0,
          failed: 0,
          cancelled: 0,
        },
        items: [
          expect.objectContaining({
            kind: 'shell',
            status: 'requested',
            command: 'node',
            resultSummary: null,
          }),
        ],
      },
    });

    let secondStepExecuted = false;
    const secondPass = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:14:00.000Z',
      control,
      executeStep: async () => {
        secondStepExecuted = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(secondStepExecuted).toBe(false);
    expect(secondPass.bundle.run.status).toBe('cancelled');
    expect(secondPass.bundle.sharedState.status).toBe('cancelled');
    expect(secondPass.bundle.steps[1]).toMatchObject({
      status: 'cancelled',
      output: {
        summary: 'paused for human escalation',
      },
    });
    expect(secondPass.bundle.sharedState.notes).toContain('run paused for human escalation');
    expect(secondPass.bundle.sharedState.structuredOutputs).toContainEqual({
      key: `human.escalation.${stepTwoId}`,
      value: {
        stepId: stepTwoId,
        requestedAt: '2026-04-08T13:14:00.000Z',
        reason: 'dependency-local-action-escalate',
        guidance: {
          action: 'escalate',
          rationale: 'dependency host actions remain pending or inconclusive',
          counts: {
            requested: 1,
            approved: 0,
            rejected: 0,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
      },
    });
  });

  it('fails when dependency guidance escalates and human policy defaultBehavior is fail', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:13:00.000Z';
    const runId = 'run_local_action_fail_behavior';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run twice.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'step-one',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                localActionPolicy: {
                  mode: 'forbidden',
                  allowedActionKinds: [],
                },
              },
              notes: [],
            },
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'step-two',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'planned',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                humanInteractionPolicy: {
                  allowHumanEscalation: true,
                  defaultBehavior: 'fail',
                  requiredOn: [],
                  allowClarificationRequests: true,
                  allowApprovalRequests: true,
                },
              },
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
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

    await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:first-pass`,
      now: () => '2026-04-08T13:13:00.000Z',
      control,
      executeStep: async () => ({
        output: {
          summary: 'request one forbidden shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Attempt a forbidden shell action.',
              },
            ],
          },
          notes: [],
        },
      }),
    });

    let secondStepExecuted = false;
    const executed = await executeStoredExecutionRunOnce({
      runId,
      ownerId: 'runner:local-test',
      leaseId: `${runId}:lease:second-pass`,
      now: () => '2026-04-08T13:14:00.000Z',
      control,
      executeStep: async () => {
        secondStepExecuted = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    expect(secondStepExecuted).toBe(false);
    expect(executed.bundle.run.status).toBe('failed');
    expect(executed.bundle.sharedState.status).toBe('failed');
    expect(executed.bundle.steps[1]?.status).toBe('failed');
    expect(executed.bundle.steps[1]?.failure).toMatchObject({
      code: 'human_escalation_required',
      message: 'dependency host-action guidance escalated and human escalation is not permitted',
    });
  });
});
