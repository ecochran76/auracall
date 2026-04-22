import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { writeTaskRunSpecStoredRecord } from '../src/teams/store.js';
import {
  createExecutionRunnerRecord,
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { cancelExecutionRun } from '../src/runtime/runner.js';
import { createConfiguredExecutionRunAffinity } from '../src/runtime/configuredAffinity.js';
import {
  createExecutionServiceHost,
  type ExecutionServiceHostRunnerLifecycleOptions,
} from '../src/runtime/serviceHost.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

const CHATGPT_ACCOUNT_AFFINITY_CONFIG = {
  services: {
    chatgpt: {
      identity: {
        email: 'operator@example.com',
      },
    },
  },
};

function createDirectBundle(runId: string, createdAt: string, status: 'planned' | 'running' = 'planned') {
  const stepId = `${runId}:step:1`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status,
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

function createTwoStepBundle(runId: string, createdAt: string, status: 'planned' | 'running' = 'planned') {
  const bundle = createDirectBundle(runId, createdAt, status);
  const stepOne = bundle.steps[0];
  if (!stepOne) throw new Error(`Could not create first step for ${runId}`);

  const stepTwoId = `${runId}:step:2`;
  bundle.run.stepIds = [stepOne.id, stepTwoId];
  bundle.steps = [
    {
      ...stepOne,
      status: 'runnable',
      id: stepOne.id,
    },
    createExecutionRunStep({
      id: stepTwoId,
      runId,
      agentId: 'api-responses',
      runtimeProfileId: 'default',
      browserProfileId: null,
      service: 'chatgpt',
      kind: 'prompt',
      status: 'planned',
      order: 2,
      dependsOnStepIds: [stepOne.id],
      input: {
        prompt: 'Second step.',
        handoffIds: [],
        artifacts: [],
        structuredData: {},
        notes: [],
      },
    }),
  ];
  bundle.sharedState = {
    ...bundle.sharedState,
    history: [
      ...bundle.sharedState.history,
      createExecutionRunEvent({
        id: `${runId}:event:${stepTwoId}:runnable`,
        runId,
        stepId: stepTwoId,
        type: 'step-runnable',
        createdAt,
        note: 'second step is waiting on first step',
        payload: {
          order: 2,
        },
      }),
    ],
  };
  return bundle;
}

function createRunningWithoutLeaseBundle(runId: string, createdAt: string) {
  const stepId = `${runId}:step:1`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status: 'running',
      createdAt,
      updatedAt: createdAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'Recover me.',
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
        status: 'running',
        order: 1,
        dependsOnStepIds: [],
        input: {
          prompt: 'Recover me.',
          handoffIds: [],
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: createdAt,
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
      createExecutionRunEvent({
        id: `${runId}:event:${stepId}:started`,
        runId,
        stepId,
        type: 'step-started',
        createdAt,
      }),
    ],
  });
}

function createRequestedLocalActionBundle(
  runId: string,
  createdAt: string,
  sourceKind: 'direct' | 'team-run' = 'direct',
) {
  const bundle = createDirectBundle(runId, createdAt);
  bundle.run.sourceKind = sourceKind;
  bundle.run.sourceId = sourceKind === 'team-run' ? `${runId}:team` : null;
  const stepId = `${runId}:step:1`;
  bundle.run.status = 'succeeded';
  bundle.run.updatedAt = createdAt;
  bundle.steps = bundle.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status: 'succeeded',
          completedAt: createdAt,
          output: {
            summary: 'queued local action for operator review',
            artifacts: [],
            structuredData: {
              localActionRequests: [
                {
                  kind: 'shell',
                  summary: 'Run the bounded verification command later.',
                  command: 'pnpm',
                  args: ['vitest', 'run'],
                },
              ],
            },
            notes: [],
          },
        }
      : step,
  );
  bundle.localActionRequests = [
    {
      id: `${runId}:action:${stepId}:1`,
      teamRunId: runId,
      ownerStepId: stepId,
      kind: 'shell',
      summary: 'Run the bounded verification command later.',
      command: 'pnpm',
      args: ['vitest', 'run'],
      structuredPayload: {},
      notes: [],
      status: 'requested',
      createdAt,
      approvedAt: null,
      completedAt: null,
      resultSummary: null,
      resultPayload: null,
    },
  ];
  bundle.sharedState = {
    ...bundle.sharedState,
    status: 'succeeded',
    structuredOutputs: [
      {
        key: `step.localActionOutcomes.${stepId}`,
        value: {
          ownerStepId: stepId,
          generatedAt: createdAt,
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
            {
              requestId: `${runId}:action:${stepId}:1`,
              kind: 'shell',
              status: 'requested',
              summary: 'Run the bounded verification command later.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: null,
            },
          ],
        },
      },
    ],
    notes: ['local action outcomes for run step: requested=1'],
    lastUpdatedAt: createdAt,
  };
  bundle.events = [
    ...bundle.events,
    createExecutionRunEvent({
      id: `${runId}:event:${bundle.localActionRequests[0]!.id}:requested`,
      runId,
      stepId,
      type: 'note-added',
      createdAt,
      note: 'local action requested: shell',
      payload: {
        requestId: bundle.localActionRequests[0]!.id,
        requestStatus: 'requested',
      },
    }),
  ];
  return bundle;
}

function createPausedHumanEscalationBundle(
  runId: string,
  createdAt: string,
  pausedAt: string,
  sourceKind: 'direct' | 'team-run' = 'direct',
) {
  const stepOneId = `${runId}:step:1`;
  const stepTwoId = `${runId}:step:2`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind,
      sourceId: sourceKind === 'team-run' ? `${runId}:team` : null,
      status: 'cancelled',
      createdAt,
      updatedAt: pausedAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'Resume me.',
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
          structuredData: {},
          notes: [],
        },
        output: {
          summary: 'first step done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: createdAt,
        completedAt: createdAt,
      }),
      createExecutionRunStep({
        id: stepTwoId,
        runId,
        agentId: 'step-two',
        runtimeProfileId: 'default',
        browserProfileId: null,
        service: 'chatgpt',
        kind: 'prompt',
        status: 'cancelled',
        order: 2,
        dependsOnStepIds: [stepOneId],
        input: {
          prompt: 'Second step.',
          handoffIds: [],
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        output: {
          summary: 'paused for human escalation',
          artifacts: [],
          structuredData: {
            humanEscalation: {
              requestedAt: pausedAt,
              guidance: {
                action: 'escalate',
                rationale: 'dependency host actions include rejected outcomes',
              },
            },
          },
          notes: ['dependency host-action guidance escalated; runner paused for human input'],
        },
        startedAt: pausedAt,
        completedAt: pausedAt,
      }),
    ],
    sharedState: createExecutionRunSharedState({
      id: `${runId}:state`,
      runId,
      status: 'cancelled',
      artifacts: [],
      structuredOutputs: [
        {
          key: `human.escalation.${stepTwoId}`,
          value: {
            stepId: stepTwoId,
            requestedAt: pausedAt,
            reason: 'dependency-local-action-escalate',
            guidance: {
              action: 'escalate',
              rationale: 'dependency host actions include rejected outcomes',
            },
          },
        },
      ],
      notes: ['run paused for human escalation'],
      history: [],
      lastUpdatedAt: pausedAt,
    }),
    events: [
      createExecutionRunEvent({
        id: `${runId}:event:run-created`,
        runId,
        type: 'run-created',
        createdAt,
      }),
      createExecutionRunEvent({
        id: `${runId}:event:${stepTwoId}:human-escalation:${pausedAt}`,
        runId,
        stepId: stepTwoId,
        type: 'note-added',
        createdAt: pausedAt,
        note: 'step paused for human escalation after dependency host-action guidance escalated',
        payload: {
          guidance: {
            action: 'escalate',
          },
        },
      }),
    ],
  });
}

describe('runtime service host', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('owns local runner registration heartbeat and shutdown lifecycle', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const runnersControl = createExecutionRunnerControl();
    const ticks = [
      '2026-04-20T09:00:00.000Z',
      '2026-04-20T09:00:10.000Z',
      '2026-04-20T09:00:20.000Z',
    ];
    const host = createExecutionServiceHost({
      runnersControl,
      runnerId: 'runner:lifecycle-local',
      now: () => ticks.shift() ?? '2026-04-20T09:00:30.000Z',
    });
    const lifecycleOptions: ExecutionServiceHostRunnerLifecycleOptions = {
      hostId: 'host:lifecycle-local',
      heartbeatTtlMs: 15_000,
      capabilitySummary: {
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['browser-default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
        browserCapable: true,
      },
      baseLabel: 'test local runner',
      heartbeatLabel: 'test local runner heartbeat',
      shutdownLabel: 'test local runner shutdown',
    };

    const registered = await host.registerLocalRunner(lifecycleOptions);
    expect(registered).toMatchObject({
      id: 'runner:lifecycle-local',
      hostId: 'host:lifecycle-local',
      status: 'active',
      lastHeartbeatAt: '2026-04-20T09:00:00.000Z',
      expiresAt: '2026-04-20T09:00:15.000Z',
      lastActivityAt: null,
      lastClaimedRunId: null,
    });

    const heartbeated = await host.heartbeatLocalRunner(lifecycleOptions);
    expect(heartbeated).toMatchObject({
      id: 'runner:lifecycle-local',
      status: 'active',
      lastHeartbeatAt: '2026-04-20T09:00:10.000Z',
      expiresAt: '2026-04-20T09:00:25.000Z',
    });

    const stale = await host.markLocalRunnerStale(lifecycleOptions);
    expect(stale).toMatchObject({
      id: 'runner:lifecycle-local',
      status: 'stale',
      expiresAt: '2026-04-20T09:00:20.000Z',
    });

    const stored = await runnersControl.readRunner('runner:lifecycle-local');
    expect(stored?.runner).toMatchObject({
      id: 'runner:lifecycle-local',
      hostId: 'host:lifecycle-local',
      status: 'stale',
      serviceIds: ['chatgpt'],
      runtimeProfileIds: ['default'],
      browserProfileIds: ['browser-default'],
      serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      browserCapable: true,
      eligibilityNote: 'test local runner shutdown',
    });
  });

  it('re-registers an existing local runner through heartbeat instead of replacing the record', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const runnersControl = createExecutionRunnerControl();
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:lifecycle-existing',
        hostId: 'host:lifecycle-existing',
        startedAt: '2026-04-20T08:59:00.000Z',
        lastHeartbeatAt: '2026-04-20T08:59:00.000Z',
        expiresAt: '2026-04-20T08:59:15.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        eligibilityNote: 'old runner note',
      }),
    });

    const host = createExecutionServiceHost({
      runnersControl,
      runnerId: 'runner:lifecycle-existing',
      now: () => '2026-04-20T09:00:00.000Z',
    });
    const registered = await host.registerLocalRunner({
      hostId: 'host:lifecycle-existing',
      heartbeatTtlMs: 15_000,
      capabilitySummary: {
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: [],
        serviceAccountIds: [],
        browserCapable: false,
      },
      baseLabel: 'test local runner',
    });

    expect(registered).toMatchObject({
      id: 'runner:lifecycle-existing',
      status: 'active',
      lastHeartbeatAt: '2026-04-20T09:00:00.000Z',
      expiresAt: '2026-04-20T09:00:15.000Z',
    });
    const stored = await runnersControl.readRunner('runner:lifecycle-existing');
    expect(stored?.revision).toBe(2);
    expect(stored?.runner.startedAt).toBe('2026-04-20T08:59:00.000Z');
    expect(stored?.runner.eligibilityNote).toBe('test local runner');
  });

  it('projects runner topology readiness without mutating runner records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-topology-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const runnersControl = createExecutionRunnerControl();
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:local-owner',
        hostId: 'host:local-owner',
        startedAt: '2026-04-20T08:59:00.000Z',
        lastHeartbeatAt: '2026-04-20T09:00:00.000Z',
        expiresAt: '2026-04-20T09:00:30.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['browser-default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
        browserCapable: true,
        eligibilityNote: 'local owner ready',
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:expired-active',
        hostId: 'host:expired-active',
        startedAt: '2026-04-20T08:58:00.000Z',
        lastHeartbeatAt: '2026-04-20T08:59:00.000Z',
        expiresAt: '2026-04-20T08:59:30.000Z',
        serviceIds: ['gemini'],
        runtimeProfileIds: ['gemini-runtime'],
        browserProfileIds: ['browser-gemini'],
        browserCapable: true,
        eligibilityNote: 'expired but not mutated by topology projection',
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale',
        hostId: 'host:stale',
        status: 'stale',
        startedAt: '2026-04-20T08:57:00.000Z',
        lastHeartbeatAt: '2026-04-20T08:57:00.000Z',
        expiresAt: '2026-04-20T08:57:30.000Z',
        serviceIds: ['grok'],
        runtimeProfileIds: ['grok-runtime'],
        browserProfileIds: [],
        browserCapable: false,
      }),
    });

    const beforeExpired = await runnersControl.readRunner('runner:expired-active');
    const host = createExecutionServiceHost({
      runnersControl,
      runnerId: 'runner:local-owner',
      now: () => '2026-04-20T09:00:10.000Z',
    });

    const topology = await host.summarizeRunnerTopology();

    expect(topology).toMatchObject({
      localExecutionOwnerRunnerId: 'runner:local-owner',
      generatedAt: '2026-04-20T09:00:10.000Z',
      metrics: {
        totalRunnerCount: 3,
        activeRunnerCount: 2,
        staleRunnerCount: 1,
        freshRunnerCount: 1,
        expiredRunnerCount: 1,
        browserCapableRunnerCount: 2,
      },
    });
    expect(topology.runners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runnerId: 'runner:local-owner',
          freshness: 'fresh',
          selectedAsLocalExecutionOwner: true,
          serviceIds: ['chatgpt'],
          runtimeProfileIds: ['default'],
          browserProfileIds: ['browser-default'],
          serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
          browserCapable: true,
        }),
        expect.objectContaining({
          runnerId: 'runner:expired-active',
          status: 'active',
          freshness: 'expired',
          selectedAsLocalExecutionOwner: false,
        }),
        expect.objectContaining({
          runnerId: 'runner:stale',
          status: 'stale',
          freshness: 'stale',
        }),
      ]),
    );

    const afterExpired = await runnersControl.readRunner('runner:expired-active');
    expect(afterExpired?.revision).toBe(beforeExpired?.revision);
    expect(afterExpired?.runner.status).toBe('active');
  });

  it('serializes queued drain-until-idle calls through the service-host seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_host_queue_1', '2026-04-20T09:05:00.000Z'));
    await control.createRun(createDirectBundle('run_host_queue_2', '2026-04-20T09:05:01.000Z'));

    let inFlight = 0;
    let maxInFlight = 0;
    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test-queued-drain',
      now: () => '2026-04-20T09:06:00.000Z',
      executeStoredRunStep: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return {
          output: {
            summary: 'queued drain completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const [first, second] = await Promise.all([
      host.drainRunsUntilIdleQueued({ runId: 'run_host_queue_1', maxRuns: 1 }),
      host.drainRunsUntilIdleQueued({ runId: 'run_host_queue_2', maxRuns: 1 }),
    ]);

    expect(first.executedRunIds).toEqual(['run_host_queue_1']);
    expect(second.executedRunIds).toEqual(['run_host_queue_2']);
    expect(maxInFlight).toBe(1);
    expect(await host.waitForDrainQueue()).toMatchObject({
      executedRunIds: ['run_host_queue_2'],
    });
  });

  it('drains one targeted stored direct run through the host seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_host_1', '2026-04-08T15:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_1',
    });

    expect(result.ownerId).toBe('host:test');
    expect(result.executedRunIds).toEqual(['run_host_1']);
    expect(result.drained[0]).toMatchObject({
      runId: 'run_host_1',
      result: 'executed',
    });
    expect(result.drained[0]?.record?.bundle.run.status).toBe('succeeded');
  });

  it('uses the configured live runner id as the lease owner when claiming work', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_host_runner_owner', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:local-http',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:local-http',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_runner_owner',
    });

    expect(result.ownerId).toBe('runner:local-http');
    expect(result.executedRunIds).toEqual(['run_host_runner_owner']);
    expect(result.drained[0]?.record?.bundle.leases[0]).toMatchObject({
      ownerId: 'runner:local-http',
      status: 'released',
    });
    const storedRunner = await runnersControl.readRunner('runner:local-http');
    expect(storedRunner?.runner.lastActivityAt).toBe('2026-04-08T15:01:00.000Z');
    expect(storedRunner?.runner.lastClaimedRunId).toBe('run_host_runner_owner');
  });

  it('keeps host claiming scoped to the configured runner even when another eligible runner is fresher', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_host_runner_scoped_claim', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:configured-older',
        hostId: 'host:http-configured',
        startedAt: '2026-04-08T14:58:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:20.000Z',
        expiresAt: '2026-04-08T15:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:alternate-fresh',
        hostId: 'host:http-alternate',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:50.000Z',
        expiresAt: '2026-04-08T15:05:30.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:configured-older',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_runner_scoped_claim',
    });

    expect(result.ownerId).toBe('runner:configured-older');
    expect(result.executedRunIds).toEqual(['run_host_runner_scoped_claim']);
    expect(result.drained[0]?.record?.bundle.leases[0]).toMatchObject({
      ownerId: 'runner:configured-older',
      status: 'released',
      releaseReason: 'completed',
    });

    const configuredRunner = await runnersControl.readRunner('runner:configured-older');
    const alternateRunner = await runnersControl.readRunner('runner:alternate-fresh');
    expect(configuredRunner?.runner.lastClaimedRunId).toBe('run_host_runner_scoped_claim');
    expect(configuredRunner?.runner.lastActivityAt).toBe('2026-04-08T15:01:00.000Z');
    expect(alternateRunner?.runner.lastClaimedRunId).toBeNull();
    expect(alternateRunner?.runner.lastActivityAt).toBeNull();
  });


  it('refreshes runner-owned lease heartbeat during delayed host execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_host_runner_heartbeat', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:heartbeat-local',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    let tick = 0;
    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:heartbeat-local',
      now: () => new Date(Date.UTC(2026, 3, 8, 15, 1, tick++)).toISOString(),
      leaseHeartbeatIntervalMs: 5,
      leaseHeartbeatTtlMs: 30_000,
      executeStoredRunStep: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          output: {
            summary: 'delayed host completion',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await host.drainRunsOnce({ runId: 'run_host_runner_heartbeat' });

    expect(result.executedRunIds).toEqual(['run_host_runner_heartbeat']);
    expect(result.drained[0]?.record?.bundle.leases[0]?.heartbeatAt).not.toBe(
      result.drained[0]?.record?.bundle.leases[0]?.acquiredAt,
    );
    expect(
      result.drained[0]?.record?.bundle.events.some((event) =>
        event.note?.includes('lease heartbeat from runner:heartbeat-local'),
      ),
    ).toBe(true);
  });

  it('refuses to claim runnable work when the configured runner owner is unavailable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_host_runner_missing', '2026-04-08T15:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:missing-http',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_runner_missing',
    });

    expect(result.ownerId).toBe('runner:missing-http');
    expect(result.executedRunIds).toEqual([]);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_host_runner_missing',
        result: 'skipped',
        reason: 'claim-owner-unavailable',
        detailReason: 'runner runner:missing-http has no persisted runner record',
      }),
    ]);

    const reread = await control.readRun('run_host_runner_missing');
    expect(reread?.bundle.leases).toEqual([]);
    expect(reread?.bundle.run.status).toBe('planned');
  });

  it('passes local action execution through the host seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_host_action', '2026-04-08T15:01:00.000Z');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]!.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            allowedActionKinds: ['shell'],
            allowedCommands: [process.execPath],
            allowedCwdRoots: [process.cwd()],
          },
        },
      },
    };
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:02:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request a host action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run host verification',
              },
            ],
          },
          notes: [],
        },
      }),
      executeLocalActionRequest: async () => ({
        status: 'executed',
        summary: 'host action executed',
      }),
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_action',
    });

    expect(result.executedRunIds).toEqual(['run_host_action']);
    expect(result.drained[0]?.record?.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'executed',
      resultSummary: 'host action executed',
    });
  });

  it('uses the built-in shell executor when no local-action callback is injected', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_host_builtin_action', '2026-04-08T15:03:00.000Z');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]!.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            allowedActionKinds: ['shell'],
          },
        },
      },
    };
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:04:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request a built-in host shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run one bounded node command',
                command: process.execPath,
                args: ['-e', 'process.stdout.write("host-ok")'],
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

    const result = await host.drainRunsOnce({
      runId: 'run_host_builtin_action',
    });

    expect(result.executedRunIds).toEqual(['run_host_builtin_action']);
    expect(result.drained[0]?.record?.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'executed',
      resultSummary: `shell action executed: ${process.execPath}`,
    });
    expect(result.drained[0]?.record?.bundle.localActionRequests[0]?.resultPayload).toMatchObject({
      exitCode: 0,
      stdout: 'host-ok',
    });
  });

  it('preserves a requested local action when step policy requires approval and no callback is injected', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_host_approval_required_action', '2026-04-08T15:04:30.000Z');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]!.input,
        structuredData: {
          localActionPolicy: {
            mode: 'approval-required',
            allowedActionKinds: ['shell'],
            allowedCommands: [process.execPath],
            allowedCwdRoots: [process.cwd()],
          },
        },
      },
    };
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:04:45.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request one approval-gated host shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Queue one bounded node command for operator approval',
                command: process.execPath,
                args: ['-e', 'process.stdout.write("host-pending")'],
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

    const result = await host.drainRunsOnce({
      runId: 'run_host_approval_required_action',
    });

    expect(result.executedRunIds).toEqual(['run_host_approval_required_action']);
    expect(result.drained[0]?.record?.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'requested',
      approvedAt: null,
      completedAt: null,
      resultSummary: null,
    });
    expect(result.drained[0]?.record?.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.run_host_approval_required_action:step:1',
      value: {
        ownerStepId: 'run_host_approval_required_action:step:1',
        generatedAt: '2026-04-08T15:04:45.000Z',
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
          {
            requestId: 'run_host_approval_required_action:action:run_host_approval_required_action:step:1:1',
            kind: 'shell',
            status: 'requested',
            summary: 'Queue one bounded node command for operator approval',
            command: process.execPath,
            args: ['-e', 'process.stdout.write("host-pending")'],
            resultSummary: null,
          },
        ],
      },
    });
  });

  it('applies host-owned shell policy overrides to the built-in executor', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_host_policy_override', '2026-04-08T15:05:00.000Z');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      input: {
        ...bundle.steps[0]!.input,
        structuredData: {
          localActionPolicy: {
            mode: 'allowed',
            complexityStage: 'bounded-command',
            allowedActionKinds: ['shell'],
          },
        },
      },
    };
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:06:00.000Z',
      localActionExecutionPolicy: {
        allowedShellCommands: ['git'],
        allowedCwdRoots: [process.cwd()],
      },
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request a blocked shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run one bounded node command',
                command: process.execPath,
                args: ['-e', 'process.stdout.write("host-blocked")'],
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

    const result = await host.drainRunsOnce({
      runId: 'run_host_policy_override',
    });

    expect(result.executedRunIds).toEqual(['run_host_policy_override']);
    expect(result.drained[0]?.record?.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'rejected',
      resultSummary: `shell local action command is not allowed: ${process.execPath}`,
    });
  });

  it('resolves a requested local action through the host control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createRequestedLocalActionBundle('run_host_local_action_control', '2026-04-11T18:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T18:05:00.000Z',
    });

    const result = await host.controlOperatorAction({
      kind: 'local-action-control',
      action: 'resolve-request',
      runId: 'run_host_local_action_control',
      requestId: 'run_host_local_action_control:action:run_host_local_action_control:step:1:1',
      resolution: 'approved',
    });

    expect(result).toMatchObject({
      action: 'resolve-local-action-request',
      runId: 'run_host_local_action_control',
      requestId: 'run_host_local_action_control:action:run_host_local_action_control:step:1:1',
      resolution: 'approved',
      status: 'resolved',
      resolved: true,
      reason: 'local action approved by service host operator control',
      resolvedAt: '2026-04-11T18:05:00.000Z',
      ownerStepId: 'run_host_local_action_control:step:1',
    });

    const storedRecord = await control.readRun('run_host_local_action_control');
    expect(storedRecord?.bundle.localActionRequests[0]).toMatchObject({
      status: 'approved',
      approvedAt: '2026-04-11T18:05:00.000Z',
      completedAt: null,
      resultSummary: 'local action approved by service host operator control',
      resultPayload: {
        source: 'operator',
      },
    });
    expect(storedRecord?.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.run_host_local_action_control:step:1',
      value: {
        ownerStepId: 'run_host_local_action_control:step:1',
        generatedAt: '2026-04-11T18:05:00.000Z',
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
            requestId: 'run_host_local_action_control:action:run_host_local_action_control:step:1:1',
            kind: 'shell',
            status: 'approved',
            summary: 'Run the bounded verification command later.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            resultSummary: 'local action approved by service host operator control',
          },
        ],
      },
    });
  });

  it('resolves a requested team-run local action through the same host control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createRequestedLocalActionBundle('run_host_team_local_action_control', '2026-04-11T18:06:00.000Z', 'team-run'),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T18:07:00.000Z',
    });

    const result = await host.resolveLocalActionRequest(
      'run_host_team_local_action_control',
      'run_host_team_local_action_control:action:run_host_team_local_action_control:step:1:1',
      'rejected',
    );

    expect(result).toMatchObject({
      action: 'resolve-local-action-request',
      runId: 'run_host_team_local_action_control',
      requestId: 'run_host_team_local_action_control:action:run_host_team_local_action_control:step:1:1',
      resolution: 'rejected',
      status: 'resolved',
      resolved: true,
      reason: 'local action rejected by service host operator control',
      resolvedAt: '2026-04-11T18:07:00.000Z',
      ownerStepId: 'run_host_team_local_action_control:step:1',
    });

    const storedRecord = await control.readRun('run_host_team_local_action_control');
    expect(storedRecord?.bundle.run.sourceKind).toBe('team-run');
    expect(storedRecord?.bundle.localActionRequests[0]).toMatchObject({
      status: 'rejected',
      approvedAt: null,
      completedAt: '2026-04-11T18:07:00.000Z',
      resultSummary: 'local action rejected by service host operator control',
      resultPayload: {
        source: 'operator',
      },
    });
    expect(storedRecord?.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.run_host_team_local_action_control:step:1',
      value: {
        ownerStepId: 'run_host_team_local_action_control:step:1',
        generatedAt: '2026-04-11T18:07:00.000Z',
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
            requestId: 'run_host_team_local_action_control:action:run_host_team_local_action_control:step:1:1',
            kind: 'shell',
            status: 'rejected',
            summary: 'Run the bounded verification command later.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            resultSummary: 'local action rejected by service host operator control',
          },
        ],
      },
    });
  });

  it('rejects resolving a local action request that is already resolved', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createRequestedLocalActionBundle('run_host_local_action_resolved', '2026-04-11T18:10:00.000Z');
    bundle.localActionRequests[0] = {
      ...bundle.localActionRequests[0]!,
      status: 'approved',
      approvedAt: '2026-04-11T18:10:00.000Z',
      resultSummary: 'approved shell for later execution',
      resultPayload: { queued: true },
    };
    bundle.sharedState.structuredOutputs = [
      {
        key: 'step.localActionOutcomes.run_host_local_action_resolved:step:1',
        value: {
          ownerStepId: 'run_host_local_action_resolved:step:1',
          generatedAt: '2026-04-11T18:10:00.000Z',
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
              requestId: 'run_host_local_action_resolved:action:run_host_local_action_resolved:step:1:1',
              kind: 'shell',
              status: 'approved',
              summary: 'Run the bounded verification command later.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: 'approved shell for later execution',
            },
          ],
        },
      },
    ];
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T18:12:00.000Z',
    });

    const result = await host.resolveLocalActionRequest(
      'run_host_local_action_resolved',
      'run_host_local_action_resolved:action:run_host_local_action_resolved:step:1:1',
      'rejected',
    );

    expect(result).toMatchObject({
      action: 'resolve-local-action-request',
      runId: 'run_host_local_action_resolved',
      requestId: 'run_host_local_action_resolved:action:run_host_local_action_resolved:step:1:1',
      resolution: 'rejected',
      status: 'not-pending',
      resolved: false,
      reason:
        'local action request run_host_local_action_resolved:action:run_host_local_action_resolved:step:1:1 is already approved',
      resolvedAt: null,
      ownerStepId: 'run_host_local_action_resolved:step:1',
    });
  });

  it('resumes a paused human-escalation run through the host control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createPausedHumanEscalationBundle(
        'run_host_resume_human_escalation',
        '2026-04-11T19:00:00.000Z',
        '2026-04-11T19:05:00.000Z',
      ),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T19:10:00.000Z',
    });

    const result = await host.resumeHumanEscalation('run_host_resume_human_escalation', {
      note: 'human approved resume',
      guidance: {
        action: 'retry-with-guidance',
        instruction: 'continue with the approved fix path',
      },
      override: {
        promptAppend: 'Retry the same step with the approved fix path.',
        structuredContext: {
          approvedPath: '/repo/approved',
        },
      },
    });

    expect(result).toMatchObject({
      action: 'resume-human-escalation',
      runId: 'run_host_resume_human_escalation',
      status: 'resumed',
      resumed: true,
      reason: 'human approved resume',
      resumedAt: '2026-04-11T19:10:00.000Z',
      resumedStepId: 'run_host_resume_human_escalation:step:2',
    });

    const storedRecord = await control.readRun('run_host_resume_human_escalation');
    expect(storedRecord?.bundle.run.status).toBe('running');
    expect(storedRecord?.bundle.sharedState.status).toBe('active');
    expect(storedRecord?.bundle.steps[1]).toMatchObject({
      id: 'run_host_resume_human_escalation:step:2',
      status: 'runnable',
      completedAt: null,
      output: null,
      failure: null,
      input: {
        structuredData: {
          humanEscalationResume: {
            resumedAt: '2026-04-11T19:10:00.000Z',
            note: 'human approved resume',
            guidance: {
              action: 'retry-with-guidance',
              instruction: 'continue with the approved fix path',
            },
            override: {
              promptAppend: 'Retry the same step with the approved fix path.',
              structuredContext: {
                approvedPath: '/repo/approved',
              },
            },
          },
        },
      },
    });
  });

  it('rejects resuming a run without a paused human-escalation step', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_host_resume_not_paused', '2026-04-11T19:15:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T19:16:00.000Z',
    });

    const result = await host.resumeHumanEscalation('run_host_resume_not_paused');

    expect(result).toMatchObject({
      action: 'resume-human-escalation',
      runId: 'run_host_resume_not_paused',
      status: 'not-paused',
      resumed: false,
      reason: 'run run_host_resume_not_paused has no cancelled human-escalation step to resume',
      resumedAt: null,
      resumedStepId: null,
    });
  });

  it('routes resumed direct run controls through the service host dispatcher', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createPausedHumanEscalationBundle(
        'run_host_targeted_drain',
        '2026-04-11T19:40:00.000Z',
        '2026-04-11T19:45:00.000Z',
      ),
    );

    let executedStepCount = 0;
    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-11T19:50:00.000Z',
      executeStoredRunStep: async () => {
        executedStepCount += 1;
        return {
          output: {
            summary: 'resumed step completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const resumed = await host.controlRun({
      action: 'resume-human-escalation',
      runId: 'run_host_targeted_drain',
      note: 'human approved resume',
    });
    expect(resumed.status).toBe('resumed');

    const drained = await host.controlRun({
      action: 'drain-run',
      runId: 'run_host_targeted_drain',
    });
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_host_targeted_drain',
      status: 'executed',
      drained: true,
      reason: 'run executed through targeted host drain',
      skipReason: null,
    });
    expect(executedStepCount).toBe(1);

    const storedRecord = await control.readRun('run_host_targeted_drain');
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps[1]).toMatchObject({
      id: 'run_host_targeted_drain:step:2',
      status: 'succeeded',
      output: {
        summary: 'resumed step completed',
      },
    });
  });

  it('resumes and drains a paused team run through the same host control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(
      createPausedHumanEscalationBundle(
        'run_host_team_targeted_drain',
        '2026-04-12T22:10:00.000Z',
        '2026-04-12T22:15:00.000Z',
        'team-run',
      ),
    );

    let executedStepCount = 0;
    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-12T22:20:00.000Z',
      executeStoredRunStep: async () => {
        executedStepCount += 1;
        return {
          output: {
            summary: 'resumed team step completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const resumed = await host.resumeHumanEscalation('run_host_team_targeted_drain', {
      note: 'human approved team resume',
    });
    expect(resumed).toMatchObject({
      action: 'resume-human-escalation',
      runId: 'run_host_team_targeted_drain',
      status: 'resumed',
      resumed: true,
      reason: 'human approved team resume',
    });

    const drained = await host.drainRun('run_host_team_targeted_drain');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_host_team_targeted_drain',
      status: 'executed',
      drained: true,
      reason: 'run executed through targeted host drain',
      skipReason: null,
    });
    expect(executedStepCount).toBe(1);

    const storedRecord = await control.readRun('run_host_team_targeted_drain');
    expect(storedRecord?.bundle.run.sourceKind).toBe('team-run');
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps[1]).toMatchObject({
      id: 'run_host_team_targeted_drain:step:2',
      status: 'succeeded',
      output: {
        summary: 'resumed team step completed',
      },
    });
  });

  it('allows a resumed team run to be reclaimed by a different compatible active runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(
      createPausedHumanEscalationBundle(
        'run_host_team_resume_other_runner',
        '2026-04-19T10:00:00.000Z',
        '2026-04-19T10:05:00.000Z',
        'team-run',
      ),
    );

    await control.acquireLease({
      runId: 'run_host_team_resume_other_runner',
      leaseId: 'run_host_team_resume_other_runner:lease:origin',
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T10:04:00.000Z',
      heartbeatAt: '2026-04-19T10:05:00.000Z',
      expiresAt: '2026-04-19T10:06:00.000Z',
    });
    await control.releaseLease({
      runId: 'run_host_team_resume_other_runner',
      leaseId: 'run_host_team_resume_other_runner:lease:origin',
      releasedAt: '2026-04-19T10:05:00.000Z',
      releaseReason: 'cancelled',
    });

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T09:55:00.000Z',
        lastHeartbeatAt: '2026-04-19T10:05:00.000Z',
        expiresAt: '2026-04-19T10:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:replacement',
        hostId: 'host:replacement',
        startedAt: '2026-04-19T10:09:00.000Z',
        lastHeartbeatAt: '2026-04-19T10:10:00.000Z',
        expiresAt: '2026-04-19T10:20:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });

    let executedStepCount = 0;
    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:replacement',
      now: () => '2026-04-19T10:10:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
      executeStoredRunStep: async () => {
        executedStepCount += 1;
        return {
          output: {
            summary: 'replacement runner completed resumed team step',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const resumed = await host.resumeHumanEscalation('run_host_team_resume_other_runner', {
      note: 'replacement runner resumed team run',
    });
    expect(resumed.status).toBe('resumed');

    const drained = await host.drainRun('run_host_team_resume_other_runner');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_host_team_resume_other_runner',
      status: 'executed',
      drained: true,
      reason: 'run executed through targeted host drain',
      skipReason: null,
    });
    expect(executedStepCount).toBe(1);

    const storedRecord = await control.readRun('run_host_team_resume_other_runner');
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps[1]).toMatchObject({
      id: 'run_host_team_resume_other_runner:step:2',
      status: 'succeeded',
      output: {
        summary: 'replacement runner completed resumed team step',
      },
    });
    expect(storedRecord?.bundle.leases.map((lease) => ({ ownerId: lease.ownerId, releaseReason: lease.releaseReason }))).toEqual(
      expect.arrayContaining([
        { ownerId: 'runner:origin', releaseReason: 'cancelled' },
        { ownerId: 'runner:replacement', releaseReason: 'completed' },
      ]),
    );
  });

  it('keeps current eligible runner ownership after local-action resolution and human resume', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const bundle = createPausedHumanEscalationBundle(
      'run_host_team_local_action_resume_other_runner',
      '2026-04-19T11:00:00.000Z',
      '2026-04-19T11:05:00.000Z',
      'team-run',
    );
    bundle.localActionRequests = [
      {
        id: 'run_host_team_local_action_resume_other_runner:action:run_host_team_local_action_resume_other_runner:step:1:1',
        teamRunId: 'run_host_team_local_action_resume_other_runner',
        ownerStepId: 'run_host_team_local_action_resume_other_runner:step:1',
        kind: 'shell',
        summary: 'Run one bounded verification command before resuming.',
        command: 'pnpm',
        args: ['vitest', 'run'],
        structuredPayload: {},
        notes: [],
        status: 'requested',
        createdAt: '2026-04-19T11:04:00.000Z',
        approvedAt: null,
        completedAt: null,
        resultSummary: null,
        resultPayload: null,
      },
    ];
    await control.createRun(bundle);

    await control.acquireLease({
      runId: 'run_host_team_local_action_resume_other_runner',
      leaseId: 'run_host_team_local_action_resume_other_runner:lease:origin',
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T11:04:00.000Z',
      heartbeatAt: '2026-04-19T11:05:00.000Z',
      expiresAt: '2026-04-19T11:06:00.000Z',
    });
    await control.releaseLease({
      runId: 'run_host_team_local_action_resume_other_runner',
      leaseId: 'run_host_team_local_action_resume_other_runner:lease:origin',
      releasedAt: '2026-04-19T11:05:00.000Z',
      releaseReason: 'cancelled',
    });

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T10:55:00.000Z',
        lastHeartbeatAt: '2026-04-19T11:05:00.000Z',
        expiresAt: '2026-04-19T11:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:replacement',
        hostId: 'host:replacement',
        startedAt: '2026-04-19T11:09:00.000Z',
        lastHeartbeatAt: '2026-04-19T11:10:00.000Z',
        expiresAt: '2026-04-19T11:20:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });

    let executedStepCount = 0;
    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:replacement',
      now: () => '2026-04-19T11:10:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
      executeStoredRunStep: async () => {
        executedStepCount += 1;
        return {
          output: {
            summary: 'replacement runner completed post-resolution resumed team step',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const resolved = await host.resolveLocalActionRequest(
      'run_host_team_local_action_resume_other_runner',
      'run_host_team_local_action_resume_other_runner:action:run_host_team_local_action_resume_other_runner:step:1:1',
      'rejected',
    );
    expect(resolved).toMatchObject({
      action: 'resolve-local-action-request',
      runId: 'run_host_team_local_action_resume_other_runner',
      resolution: 'rejected',
      status: 'resolved',
      resolved: true,
      reason: 'local action rejected by service host operator control',
      ownerStepId: 'run_host_team_local_action_resume_other_runner:step:1',
    });

    const resumed = await host.resumeHumanEscalation('run_host_team_local_action_resume_other_runner', {
      note: 'replacement runner resumed after local-action rejection',
    });
    expect(resumed.status).toBe('resumed');

    const drained = await host.drainRun('run_host_team_local_action_resume_other_runner');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_host_team_local_action_resume_other_runner',
      status: 'executed',
      drained: true,
      reason: 'run executed through targeted host drain',
      skipReason: null,
    });
    expect(executedStepCount).toBe(1);

    const storedRecord = await control.readRun('run_host_team_local_action_resume_other_runner');
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.localActionRequests[0]).toMatchObject({
      status: 'rejected',
      resultSummary: 'local action rejected by service host operator control',
      resultPayload: {
        source: 'operator',
      },
    });
    expect(storedRecord?.bundle.steps[1]).toMatchObject({
      id: 'run_host_team_local_action_resume_other_runner:step:2',
      status: 'succeeded',
      output: {
        summary: 'replacement runner completed post-resolution resumed team step',
      },
    });
    expect(storedRecord?.bundle.leases.map((lease) => ({ ownerId: lease.ownerId, releaseReason: lease.releaseReason }))).toEqual(
      expect.arrayContaining([
        { ownerId: 'runner:origin', releaseReason: 'cancelled' },
        { ownerId: 'runner:replacement', releaseReason: 'completed' },
      ]),
    );
  });

  it('surfaces claim-owner-unavailable when targeted drain cannot safely claim a team run', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const bundle = createDirectBundle('run_host_team_targeted_drain_claim_blocked', '2026-04-12T22:25:00.000Z');
    bundle.run.sourceKind = 'team-run';
    bundle.run.sourceId = 'run_host_team_targeted_drain_claim_blocked:team';
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:missing-team-drain',
      now: () => '2026-04-12T22:30:00.000Z',
    });

    const drained = await host.drainRun('run_host_team_targeted_drain_claim_blocked');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_host_team_targeted_drain_claim_blocked',
      status: 'skipped',
      drained: false,
      reason: 'runner runner:missing-team-drain has no persisted runner record',
      skipReason: 'claim-owner-unavailable',
    });

    const storedRecord = await control.readRun('run_host_team_targeted_drain_claim_blocked');
    expect(storedRecord?.bundle.run.sourceKind).toBe('team-run');
    expect(storedRecord?.bundle.run.status).toBe('planned');
    expect(storedRecord?.bundle.leases).toEqual([]);
  });

  it('expires stale leases before reclaiming a runnable run and skips still-active leases', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_stale', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_busy', '2026-04-08T15:02:00.000Z'));

    await control.acquireLease({
      runId: 'run_stale',
      leaseId: 'run_stale:lease:old',
      ownerId: 'host:old',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:00.000Z',
      expiresAt: '2026-04-08T15:00:00.000Z',
    });
    await control.acquireLease({
      runId: 'run_busy',
      leaseId: 'run_busy:lease:busy',
      ownerId: 'host:busy',
      acquiredAt: '2026-04-08T15:02:00.000Z',
      heartbeatAt: '2026-04-08T15:02:00.000Z',
      expiresAt: '2026-04-08T15:05:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 2,
    });

    expect(result.expiredLeaseRunIds).toEqual(['run_stale']);
    expect(result.executedRunIds).toEqual(['run_stale']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_stale',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_busy',
        result: 'skipped',
        reason: 'stale-heartbeat',
      }),
    ]);
  });

  it('repairs locally reclaimable expired leases through runner reconciliation before reclaiming work', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_reclaim_stale_runner', '2026-04-08T15:00:00.000Z'));

    await control.acquireLease({
      runId: 'run_reclaim_stale_runner',
      leaseId: 'run_reclaim_stale_runner:lease:runner',
      ownerId: 'runner:stale',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:30.000Z',
      expiresAt: '2026-04-08T15:01:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale',
        hostId: 'host:wsl-dev-1',
        status: 'active',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_reclaim_stale_runner',
    });

    expect(result.expiredLeaseRunIds).toEqual(['run_reclaim_stale_runner']);
    expect(result.executedRunIds).toEqual(['run_reclaim_stale_runner']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_reclaim_stale_runner',
        result: 'executed',
      }),
    ]);
    const storedRunner = await runnersControl.readRunner('runner:stale');
    expect(storedRunner?.runner.status).toBe('stale');
  });

  it('does not reclaim an expired lease when the owning runner is still active', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_active_runner_lease', '2026-04-08T15:00:00.000Z'));

    await control.acquireLease({
      runId: 'run_active_runner_lease',
      leaseId: 'run_active_runner_lease:lease:runner',
      ownerId: 'runner:active',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:02:30.000Z',
      expiresAt: '2026-04-08T15:01:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:active',
        hostId: 'host:wsl-dev-1',
        status: 'active',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:02:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_active_runner_lease',
    });

    expect(result.expiredLeaseRunIds).toEqual([]);
    expect(result.executedRunIds).toEqual([]);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_active_runner_lease',
        result: 'skipped',
        reason: 'stale-heartbeat',
      }),
    ]);
    const storedRecord = await control.readRun('run_active_runner_lease');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
  });

  it('keeps real skip reasons for non-executable runs after maxRuns is reached', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_exec_1', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_exec_2', '2026-04-08T15:01:00.000Z'));

    const idle = createDirectBundle('run_idle_limit', '2026-04-08T15:02:00.000Z');
    idle.run.status = 'succeeded';
    idle.steps[0] = {
      ...idle.steps[0]!,
      status: 'succeeded',
      startedAt: '2026-04-08T15:02:00.000Z',
      completedAt: '2026-04-08T15:02:00.000Z',
      output: {
        summary: 'done',
        artifacts: [],
        structuredData: {},
        notes: [],
      },
    };
    idle.sharedState.status = 'succeeded';
    await control.createRun(idle);

    await control.createRun(createDirectBundle('run_busy_limit', '2026-04-08T15:03:00.000Z'));
    await control.acquireLease({
      runId: 'run_busy_limit',
      leaseId: 'run_busy_limit:lease:busy',
      ownerId: 'host:busy',
      acquiredAt: '2026-04-08T15:03:00.000Z',
      heartbeatAt: '2026-04-08T15:03:00.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 1,
    });

    expect(result.executedRunIds).toEqual(['run_exec_1']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_exec_1',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_exec_2',
        result: 'skipped',
        reason: 'limit-reached',
      }),
      expect.objectContaining({
        runId: 'run_busy_limit',
        result: 'skipped',
        reason: 'stale-heartbeat',
      }),
      expect.objectContaining({
        runId: 'run_idle_limit',
        result: 'skipped',
        reason: 'no-runnable-step',
      }),
    ]);
  });

  it('prioritizes runnable work ahead of older recoverable stranded work under a cap', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded_old', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_runnable_new', '2026-04-08T15:01:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 1,
    });

    expect(result.executedRunIds).toEqual(['run_runnable_new']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_runnable_new',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_stranded_old',
        result: 'skipped',
        reason: 'limit-reached',
      }),
    ]);
  });

  it('keeps oldest-first ordering within the runnable class', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_runnable_old', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_runnable_new', '2026-04-08T15:01:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 1,
    });

    expect(result.executedRunIds).toEqual(['run_runnable_old']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_runnable_old',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_runnable_new',
        result: 'skipped',
        reason: 'limit-reached',
      }),
    ]);
  });

  it('keeps oldest-first ordering within the recoverable-stranded class', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded_oldest', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded_newest', '2026-04-08T15:01:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 1,
    });

    expect(result.executedRunIds).toEqual(['run_stranded_oldest']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_stranded_oldest',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_stranded_newest',
        result: 'skipped',
        reason: 'limit-reached',
      }),
    ]);
  });

  it('reserves one slot for recoverable stranded work when both actionable classes are present', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_runnable_oldest', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_runnable_newest', '2026-04-08T15:01:00.000Z'));
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded_reserved', '2026-04-08T15:02:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 2,
    });

    expect(result.executedRunIds).toEqual(['run_runnable_oldest', 'run_stranded_reserved']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_runnable_oldest',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_runnable_newest',
        result: 'skipped',
        reason: 'limit-reached',
      }),
      expect.objectContaining({
        runId: 'run_stranded_reserved',
        result: 'executed',
      }),
    ]);
  });

  it('prioritizes runnable work ahead of recoverable stranded work under a cap', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createRunningWithoutLeaseBundle('run_recoverable_stranded_first', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_runnable_second', '2026-04-08T15:01:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 1,
    });

    expect(result.executedRunIds).toEqual(['run_runnable_second']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_runnable_second',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_recoverable_stranded_first',
        result: 'skipped',
        reason: 'limit-reached',
      }),
    ]);
  });

  it('recovers stranded running work without an active lease by rewinding to runnable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded', '2026-04-08T15:04:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_stranded',
    });

    expect(result.executedRunIds).toEqual(['run_stranded']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_stranded',
        result: 'executed',
      }),
    ]);

    const finalRecord = result.drained.at(-1)?.record;
    expect(finalRecord?.bundle.steps[0]?.status).toBe('succeeded');
    expect(finalRecord?.bundle.events.some((event) => event.type === 'step-succeeded')).toBe(true);
  });

  it('retries stranded recovery after one persist revision race', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const baseControl = createExecutionRuntimeControl();
    await baseControl.createRun(createRunningWithoutLeaseBundle('run_stranded_retry', '2026-04-08T15:04:00.000Z'));

    let persistAttempts = 0;
    const control = {
      ...baseControl,
      async persistRun(input: Parameters<typeof baseControl.persistRun>[0]) {
        persistAttempts += 1;
        if (persistAttempts === 1) {
          await baseControl.readRun(input.runId);
          throw new Error('simulated revision race');
        }
        return baseControl.persistRun(input);
      },
    };

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_stranded_retry',
    });

    expect(persistAttempts).toBe(2);
    expect(result.executedRunIds).toEqual(['run_stranded_retry']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_stranded_retry',
        result: 'executed',
      }),
    ]);
    const finalRecord = result.drained.at(-1)?.record;
    expect(finalRecord?.bundle.run.status).toBe('succeeded');
    expect(finalRecord?.bundle.steps[0]?.status).toBe('succeeded');
  });

  it('summarizes reclaimable, busy, stranded, and idle recovery states', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_reclaimable', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createRunningWithoutLeaseBundle('run_stranded', '2026-04-08T15:01:00.000Z'));

    const idle = createDirectBundle('run_idle', '2026-04-08T15:02:00.000Z');
    idle.run.status = 'succeeded';
    idle.steps[0] = {
      ...idle.steps[0]!,
      status: 'succeeded',
      startedAt: '2026-04-08T15:02:00.000Z',
      completedAt: '2026-04-08T15:02:00.000Z',
      output: {
        summary: 'done',
        artifacts: [],
        structuredData: {},
        notes: [],
      },
    };
    idle.sharedState.status = 'succeeded';
    await control.createRun(idle);

    await control.createRun(createDirectBundle('run_busy', '2026-04-08T15:03:00.000Z'));
    await control.acquireLease({
      runId: 'run_busy',
      leaseId: 'run_busy:lease:busy',
      ownerId: 'host:busy',
      acquiredAt: '2026-04-08T15:03:00.000Z',
      heartbeatAt: '2026-04-08T15:03:00.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const summary = await host.summarizeRecoveryState({
      sourceKind: 'direct',
    });

    expect(summary).toEqual({
      totalRuns: 4,
      reclaimableRunIds: ['run_reclaimable'],
      activeLeaseRunIds: ['run_busy'],
      recoverableStrandedRunIds: ['run_stranded'],
      strandedRunIds: [],
      cancelledRunIds: [],
      idleRunIds: ['run_idle'],
      localClaim: null,
      activeLeaseHealth: {
        freshRunIds: [],
        staleHeartbeatRunIds: ['run_busy'],
        suspiciousIdleRunIds: [],
        reasonsByRunId: {
          run_busy: 'lease owner host:busy has no persisted runner record',
        },
        metrics: {
          freshCount: 0,
          staleHeartbeatCount: 1,
          suspiciousIdleCount: 0,
        },
      },
      leaseRepair: {
        locallyReclaimableRunIds: [],
        inspectOnlyRunIds: ['run_busy'],
        notReclaimableRunIds: [],
        repairedRunIds: [],
        reasonsByRunId: {
          run_busy: 'active lease owner is unavailable but the lease has not expired yet',
        },
        metrics: {
          locallyReclaimableCount: 0,
          inspectOnlyCount: 1,
          notReclaimableCount: 0,
          repairedCount: 0,
        },
      },
      attention: {
        staleHeartbeatInspectOnlyRunIds: ['run_busy'],
        reasonsByRunId: {
          run_busy: 'active lease owner is unavailable but the lease has not expired yet',
        },
        metrics: {
          staleHeartbeatInspectOnlyCount: 1,
        },
      },
      cancellation: {
        reasonsByRunId: {},
        metrics: {
          cancelledCount: 0,
        },
      },
      metrics: {
        reclaimableCount: 1,
        activeLeaseCount: 1,
        recoverableStrandedCount: 1,
        strandedCount: 0,
        cancelledCount: 0,
        idleCount: 1,
        actionableCount: 2,
        nonExecutableCount: 2,
      },
    });
  });

  it('reads bounded recovery detail for one run without mutating lease state', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_detail_busy', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_detail_busy',
      leaseId: 'run_detail_busy:lease:busy',
      ownerId: 'runner:missing',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:00.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail('run_detail_busy');

    expect(detail).toEqual({
      runId: 'run_detail_busy',
      sourceKind: 'direct',
      taskRunSpecId: null,
      taskRunSpecSummary: null,
      orchestrationTimelineSummary: null,
      handoffTransferSummary: null,
      hostState: 'active-lease',
      createdAt: '2026-04-08T15:00:00.000Z',
      updatedAt: '2026-04-08T15:00:00.000Z',
      activeLease: {
        leaseId: 'run_detail_busy:lease:busy',
        ownerId: 'runner:missing',
        expiresAt: '2026-04-08T15:10:00.000Z',
      },
      dispatch: {
        nextRunnableStepId: 'run_detail_busy:step:1',
        runningStepIds: [],
      },
      repair: {
        posture: 'inspect-only',
        reason: 'active lease owner is unavailable but the lease has not expired yet',
        reconciliationStatus: 'missing-runner',
        reconciliationReason: 'lease owner runner:missing has no persisted runner record',
        leaseOwnerId: 'runner:missing',
        leaseExpiresAt: '2026-04-08T15:10:00.000Z',
      },
      leaseHealth: {
        status: 'stale-heartbeat',
        reason: 'lease owner runner:missing has no persisted runner record',
        leaseHeartbeatAt: '2026-04-08T15:00:00.000Z',
        leaseExpiresAt: '2026-04-08T15:10:00.000Z',
        runnerLastHeartbeatAt: null,
        runnerLastActivityAt: null,
      },
      attention: {
        needed: true,
        kind: 'stale-heartbeat-inspect-only',
        reason: 'active lease owner is unavailable but the lease has not expired yet',
      },
      cancellation: null,
      localClaim: null,
    });

    const storedRecord = await control.readRun('run_detail_busy');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
  });

  it('suppresses task-run-spec linkage on recovery detail for direct runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_direct_recovery_hidden_1',
      teamId: 'team_template_direct_recovery_hidden_1',
      title: 'Do not project direct recovery assignment identity',
      objective: 'Recovery detail should keep task spec identity team-run scoped.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 8,
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
      requestedBy: {
        kind: 'service',
        label: 'runtime service host test',
      },
      trigger: 'service',
      createdAt: '2026-04-12T18:59:00.000Z',
    });

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_detail_direct_task_spec_hidden', '2026-04-12T19:00:00.000Z');
    bundle.run.taskRunSpecId = 'task_spec_direct_recovery_hidden_1';
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-12T19:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail('run_detail_direct_task_spec_hidden');

    expect(detail).toMatchObject({
      runId: 'run_detail_direct_task_spec_hidden',
      sourceKind: 'direct',
      taskRunSpecId: null,
      taskRunSpecSummary: null,
      hostState: 'runnable',
    });
  });

  it('surfaces cancelled runs separately in recovery summary and detail', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_cancelled_detail', '2026-04-08T15:00:00.000Z', 'running');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      status: 'running',
      startedAt: '2026-04-08T15:01:00.000Z',
    };
    await control.createRun(
      cancelExecutionRun({
        bundle,
        cancelledAt: '2026-04-08T15:02:00.000Z',
        note: 'cancelled from test',
        source: 'operator',
      }),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const summary = await host.summarizeRecoveryState({
      sourceKind: 'direct',
    });
    expect(summary.cancelledRunIds).toEqual(['run_cancelled_detail']);
    expect(summary.idleRunIds).toEqual([]);
    expect(summary.cancellation).toEqual({
      reasonsByRunId: {
        run_cancelled_detail: 'cancelled from test',
      },
      metrics: {
        cancelledCount: 1,
      },
    });
    expect(summary.metrics.cancelledCount).toBe(1);

    const detail = await host.readRecoveryDetail('run_cancelled_detail');
    expect(detail).toMatchObject({
      runId: 'run_cancelled_detail',
      handoffTransferSummary: null,
      hostState: 'cancelled',
      activeLease: null,
      cancellation: {
        cancelledAt: '2026-04-08T15:02:00.000Z',
        source: 'operator',
        reason: 'cancelled from test',
      },
    });
  });

  it('falls back to run timestamps when cancelled recovery detail has no cancellation note event', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_cancelled_detail_fallback', '2026-04-08T15:00:00.000Z', 'running');
    bundle.run.status = 'cancelled';
    bundle.run.updatedAt = '2026-04-08T15:03:00.000Z';
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      status: 'cancelled',
      startedAt: '2026-04-08T15:01:00.000Z',
      completedAt: '2026-04-08T15:03:00.000Z',
    };
    bundle.sharedState.status = 'cancelled';
    bundle.sharedState.lastUpdatedAt = '2026-04-08T15:03:00.000Z';
    await control.createRun(bundle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail('run_cancelled_detail_fallback');
    expect(detail).toMatchObject({
      runId: 'run_cancelled_detail_fallback',
      hostState: 'cancelled',
      cancellation: {
        cancelledAt: '2026-04-08T15:03:00.000Z',
        source: null,
        reason: null,
      },
    });
  });


  it('reads bounded local claim posture for the configured live runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_detail_claimable', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:detail-local',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:detail-local',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail('run_detail_claimable');

    expect(detail?.localClaim).toEqual({
      runnerId: 'runner:detail-local',
      hostId: 'host:http-responses:127.0.0.1:8080',
      status: 'eligible',
      selected: true,
      reason: null,
      queueState: 'runnable',
      claimState: 'claimable',
      affinityStatus: 'eligible',
      affinityReason: null,
    });
  });

  it('preserves bounded local claim status map when the configured runner record is unavailable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_local_claim_missing_runner', '2026-04-08T15:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      runnerId: 'runner:missing-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const summary = await host.summarizeLocalClaimState({
      sourceKind: 'direct',
    });

    expect(summary).toEqual({
      sourceKind: 'direct',
      runnerId: 'runner:missing-local',
      selectedRunIds: [],
      blockedRunIds: [],
      notReadyRunIds: [],
      unavailableRunIds: ['run_local_claim_missing_runner'],
      statusByRunId: {
        run_local_claim_missing_runner: 'claim-owner-unavailable',
      },
      reasonsByRunId: {
        run_local_claim_missing_runner:
          'runner runner:missing-local has no persisted runner record',
      },
      metrics: {
        selectedCount: 0,
        blockedCount: 0,
        notReadyCount: 0,
        unavailableCount: 1,
      },
    });
  });

  it('blocks local claim when configured service account affinity is missing from the runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_local_claim_account_blocked', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:missing-account',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:missing-account',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });

    const summary = await host.summarizeLocalClaimState({
      sourceKind: 'direct',
    });

    expect(summary).toEqual({
      sourceKind: 'direct',
      runnerId: 'runner:missing-account',
      selectedRunIds: [],
      blockedRunIds: ['run_local_claim_account_blocked'],
      notReadyRunIds: [],
      unavailableRunIds: [],
      statusByRunId: {
        run_local_claim_account_blocked: 'blocked-affinity',
      },
      reasonsByRunId: {
        run_local_claim_account_blocked:
          'runner runner:missing-account does not expose service account service-account:chatgpt:operator@example.com',
      },
      metrics: {
        selectedCount: 0,
        blockedCount: 1,
        notReadyCount: 0,
        unavailableCount: 0,
      },
    });
  });

  it('selects local claim when configured service account affinity matches the runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_local_claim_account_selected', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:matching-account',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:matching-account',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });

    const summary = await host.summarizeLocalClaimState({
      sourceKind: 'direct',
    });

    expect(summary).toEqual({
      sourceKind: 'direct',
      runnerId: 'runner:matching-account',
      selectedRunIds: ['run_local_claim_account_selected'],
      blockedRunIds: [],
      notReadyRunIds: [],
      unavailableRunIds: [],
      statusByRunId: {
        run_local_claim_account_selected: 'eligible',
      },
      reasonsByRunId: {},
      metrics: {
        selectedCount: 1,
        blockedCount: 0,
        notReadyCount: 0,
        unavailableCount: 0,
      },
    });
  });

  it('claims a scheduler-authorized local runnable run without draining it', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_scheduler_local_claim', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      leaseHeartbeatTtlMs: 30_000,
    });

    const result = await host.controlOperatorAction({
      kind: 'scheduler-control',
      control: {
        action: 'claim-local-run',
        runId: 'run_scheduler_local_claim',
        schedulerId: 'operator:test',
      },
    });

    expect(result).toMatchObject({
      kind: 'scheduler-control',
      action: 'claim-local-run',
      runId: 'run_scheduler_local_claim',
      schedulerId: 'operator:test',
      status: 'claimed',
      claimed: true,
      mutationAllowed: true,
      decision: 'claimable-by-local-runner',
      selectedRunnerId: 'runner:scheduler-local',
      previousLeaseId: null,
      newLeaseOwnerId: 'runner:scheduler-local',
    });
    const stored = await control.readRun('run_scheduler_local_claim');
    const activeLease = stored?.bundle.leases.find((lease) => lease.status === 'active');
    expect(activeLease).toMatchObject({
      ownerId: 'runner:scheduler-local',
      expiresAt: '2026-04-08T15:05:30.000Z',
    });
    expect(stored?.bundle.steps[0]?.status).toBe('runnable');
    expect(stored?.bundle.events.at(-1)).toMatchObject({
      type: 'note-added',
      payload: {
        source: 'service-host',
        operatorControl: 'scheduler-control',
        action: 'claim-local-run',
        schedulerId: 'operator:test',
        decision: 'claimable-by-local-runner',
      },
    });
  });

  it('drains a scheduler-claimed run through the existing local-owned lease', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_scheduler_claim_then_drain', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      leaseHeartbeatTtlMs: 30_000,
      executeStoredRunStep: async () => ({
        output: {
          summary: 'scheduler-claimed run completed',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    const claimed = await host.claimLocalRunWithSchedulerAuthority({
      action: 'claim-local-run',
      runId: 'run_scheduler_claim_then_drain',
      schedulerId: 'operator:test',
    });
    expect(claimed).toMatchObject({
      status: 'claimed',
      claimed: true,
      newLeaseOwnerId: 'runner:scheduler-local',
    });

    const drained = await host.drainRun('run_scheduler_claim_then_drain');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_scheduler_claim_then_drain',
      status: 'executed',
      drained: true,
      reason: 'run executed through targeted host drain',
      skipReason: null,
    });

    const stored = await control.readRun('run_scheduler_claim_then_drain');
    expect(stored?.bundle.run.status).toBe('succeeded');
    expect(stored?.bundle.steps[0]).toMatchObject({
      status: 'succeeded',
      output: {
        summary: 'scheduler-claimed run completed',
      },
    });
    expect(stored?.bundle.leases).toEqual([
      expect.objectContaining({
        ownerId: 'runner:scheduler-local',
        status: 'released',
        releaseReason: 'completed',
      }),
    ]);
  });

  it('keeps targeted drain blocked by a foreign active lease', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_foreign_active_lease_drain', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_foreign_active_lease_drain',
      leaseId: 'lease:foreign-owner',
      ownerId: 'runner:foreign',
      acquiredAt: '2026-04-08T15:01:00.000Z',
      heartbeatAt: '2026-04-08T15:01:00.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:foreign',
        hostId: 'host:foreign',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:00.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const drained = await host.drainRun('run_foreign_active_lease_drain');
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId: 'run_foreign_active_lease_drain',
      status: 'skipped',
      drained: false,
      skipReason: 'active-lease',
    });

    const stored = await control.readRun('run_foreign_active_lease_drain');
    expect(stored?.bundle.run.status).toBe('planned');
    expect(stored?.bundle.leases).toEqual([
      expect.objectContaining({
        id: 'lease:foreign-owner',
        ownerId: 'runner:foreign',
        status: 'active',
      }),
    ]);
  });

  it('reassigns an expired stale-owner lease to the scheduler-selected local runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_scheduler_reassign_stale', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_scheduler_reassign_stale',
      leaseId: 'lease:stale-owner',
      ownerId: 'runner:stale-owner',
      acquiredAt: '2026-04-08T15:01:00.000Z',
      expiresAt: '2026-04-08T15:02:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale-owner',
        hostId: 'host:old',
        status: 'stale',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:00.000Z',
        expiresAt: '2026-04-08T15:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T15:03:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:00.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.claimLocalRunWithSchedulerAuthority({
      action: 'claim-local-run',
      runId: 'run_scheduler_reassign_stale',
      schedulerId: 'operator:test',
    });

    expect(result).toMatchObject({
      status: 'reassigned',
      claimed: true,
      decision: 'reassignable-after-expired-lease',
      previousLeaseId: 'lease:stale-owner',
      previousLeaseOwnerId: 'runner:stale-owner',
      newLeaseOwnerId: 'runner:scheduler-local',
    });
    const stored = await control.readRun('run_scheduler_reassign_stale');
    expect(stored?.bundle.leases.find((lease) => lease.id === 'lease:stale-owner')?.status).toBe('expired');
    expect(stored?.bundle.leases.find((lease) => lease.status === 'active')?.ownerId).toBe('runner:scheduler-local');
  });

  it('rejects scheduler claim when authority selects a non-local runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_scheduler_non_local', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:local-missing-account',
        hostId: 'host:test',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:other-matching-account',
        hostId: 'host:other',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:local-missing-account',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });

    const result = await host.claimLocalRunWithSchedulerAuthority({
      action: 'claim-local-run',
      runId: 'run_scheduler_non_local',
      schedulerId: 'operator:test',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      claimed: false,
      decision: 'claimable-by-other-runner',
      selectedRunnerId: 'runner:other-matching-account',
      newLeaseId: null,
    });
    expect(result.reason).toContain('v1 can only claim local runner runner:local-missing-account');
    expect((await control.readRun('run_scheduler_non_local'))?.bundle.leases).toHaveLength(0);
  });

  it('rejects scheduler claim when a fresh active lease exists', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_scheduler_fresh_lease', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_scheduler_fresh_lease',
      leaseId: 'lease:fresh',
      ownerId: 'runner:fresh-owner',
      acquiredAt: '2026-04-08T15:01:00.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:fresh-owner',
        hostId: 'host:fresh',
        startedAt: '2026-04-08T15:00:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:00.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T15:00:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:00.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.claimLocalRunWithSchedulerAuthority({
      action: 'claim-local-run',
      runId: 'run_scheduler_fresh_lease',
      schedulerId: 'operator:test',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      claimed: false,
      decision: 'blocked-active-lease',
      previousLeaseId: 'lease:fresh',
      newLeaseId: null,
    });
  });

  it('returns conflict when scheduler claim loses the persist revision check', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const baseControl = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await baseControl.createRun(createDirectBundle('run_scheduler_revision_conflict', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:scheduler-local',
        hostId: 'host:test',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const conflictControl: typeof baseControl = {
      ...baseControl,
      async persistRun(input) {
        if (input.runId === 'run_scheduler_revision_conflict') {
          throw new Error('simulated revision mismatch');
        }
        return baseControl.persistRun(input);
      },
    };
    const host = createExecutionServiceHost({
      control: conflictControl,
      runnersControl,
      runnerId: 'runner:scheduler-local',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.claimLocalRunWithSchedulerAuthority({
      action: 'claim-local-run',
      runId: 'run_scheduler_revision_conflict',
      schedulerId: 'operator:test',
    });

    expect(result).toMatchObject({
      status: 'conflict',
      claimed: false,
      decision: 'claimable-by-local-runner',
      newLeaseId: null,
    });
    expect(result.reason).toContain('simulated revision mismatch');
    expect((await baseControl.readRun('run_scheduler_revision_conflict'))?.bundle.leases).toHaveLength(0);
  });

  it('preserves configured service account mismatch details on targeted drain skip', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_targeted_drain_account_blocked', '2026-04-08T15:00:00.000Z'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:targeted-missing-account',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:30.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      runnerId: 'runner:targeted-missing-account',
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });

    const result = await host.drainRunsOnce({
      runId: 'run_targeted_drain_account_blocked',
    });

    expect(result.executedRunIds).toEqual([]);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_targeted_drain_account_blocked',
        result: 'skipped',
        reason: 'claim-owner-unavailable',
        detailReason:
          'runner runner:targeted-missing-account does not expose service account service-account:chatgpt:operator@example.com',
      }),
    ]);

    const reread = await control.readRun('run_targeted_drain_account_blocked');
    expect(reread?.bundle.leases).toEqual([]);
    expect(reread?.bundle.run.status).toBe('planned');
  });

  it('surfaces bounded handoff-transfer summary on recovery detail for stored team-run-backed runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'run_detail_handoff_transfer';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_handoff_1',
          taskRunSpecId: 'task_spec_recovery_handoff_1',
          status: 'planned',
          createdAt: '2026-04-12T17:00:00.000Z',
          updatedAt: '2026-04-12T17:00:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect handoff transfer recovery detail.',
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
            sourceStepId: 'team_run_recovery_handoff_1:step:1',
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
            startedAt: '2026-04-12T17:00:10.000Z',
            completedAt: '2026-04-12T17:00:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
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
              taskRunSpecId: 'task_spec_recovery_handoff_1',
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
            createdAt: '2026-04-12T17:00:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.consumedTaskTransfers.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-12T17:00:00.000Z',
                total: 1,
                items: [
                  {
                    handoffId: `${runId}:handoff:${stepTwoId}:1`,
                    fromStepId: stepOneId,
                    fromAgentId: 'orchestrator',
                    title: 'Stored recovery-detail transfer title',
                    objective: 'Stored consumed state should drive recovery-detail readback.',
                    requestedOutputCount: 5,
                    inputArtifactCount: 2,
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:started`,
              runId,
              stepId: stepOneId,
              type: 'step-started',
              createdAt: '2026-04-12T17:00:05.000Z',
              note: 'source step started',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:completed`,
              runId,
              stepId: stepOneId,
              type: 'step-succeeded',
              createdAt: '2026-04-12T17:00:30.000Z',
              note: 'source step completed',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:${stepTwoId}:handoff-consumed`,
              runId,
              stepId: stepTwoId,
              type: 'handoff-consumed',
              createdAt: '2026-04-12T17:00:45.000Z',
              note: 'handoff consumed by downstream step',
              payload: {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:operator-note`,
              runId,
              type: 'note-added',
              createdAt: '2026-04-12T17:01:00.000Z',
              note: 'operator targeted drain note',
              payload: {
                source: 'operator',
                action: 'drain-run',
              },
            }),
          ],
          lastUpdatedAt: '2026-04-12T17:00:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T17:00:00.000Z',
          }),
        ],
      }),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-12T17:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail(runId);

    expect(detail).toMatchObject({
      runId,
      sourceKind: 'team-run',
      taskRunSpecId: 'task_spec_recovery_handoff_1',
      orchestrationTimelineSummary: {
        total: 4,
        items: [
          {
            type: 'step-started',
            createdAt: '2026-04-12T17:00:05.000Z',
            stepId: stepOneId,
            note: 'source step started',
            handoffId: null,
          },
          {
            type: 'step-succeeded',
            createdAt: '2026-04-12T17:00:30.000Z',
            stepId: stepOneId,
            note: 'source step completed',
            handoffId: null,
          },
          {
            type: 'handoff-consumed',
            createdAt: '2026-04-12T17:00:45.000Z',
            stepId: stepTwoId,
            note: 'handoff consumed by downstream step',
            handoffId: `${runId}:handoff:${stepTwoId}:1`,
          },
          {
            type: 'note-added',
            createdAt: '2026-04-12T17:01:00.000Z',
            stepId: null,
            note: 'operator targeted drain note',
            handoffId: null,
          },
        ],
      },
      handoffTransferSummary: {
        total: 1,
        items: [
          {
            handoffId: `${runId}:handoff:${stepTwoId}:1`,
            fromStepId: stepOneId,
            fromAgentId: 'orchestrator',
            title: 'Stored recovery-detail transfer title',
            objective: 'Stored consumed state should drive recovery-detail readback.',
            requestedOutputCount: 5,
            inputArtifactCount: 2,
          },
        ],
      },
      hostState: 'runnable',
      dispatch: {
        nextRunnableStepId: stepTwoId,
        runningStepIds: [],
      },
    });
  });

  it('falls back to planned handoff transfer data on recovery detail when no stored consumed summary exists', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'run_detail_handoff_transfer_fallback';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_handoff_fallback_1',
          taskRunSpecId: 'task_spec_recovery_handoff_fallback_1',
          status: 'planned',
          createdAt: '2026-04-14T08:20:00.000Z',
          updatedAt: '2026-04-14T08:20:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect planned handoff fallback recovery detail.',
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
            sourceStepId: 'team_run_recovery_handoff_fallback_1:step:1',
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
            startedAt: '2026-04-14T08:20:10.000Z',
            completedAt: '2026-04-14T08:20:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_fallback_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the fallback transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
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
            summary: `Planned fallback handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_recovery_handoff_fallback_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Planned recovery fallback transfer title',
                objective: 'Use planned transfer data when no stored consumed summary exists.',
                successCriteria: ['fallback transfer available'],
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
            createdAt: '2026-04-14T08:20:30.000Z',
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
          lastUpdatedAt: '2026-04-14T08:20:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-14T08:20:00.000Z',
          }),
        ],
      }),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-14T08:25:00.000Z',
    });

    const detail = await host.readRecoveryDetail(runId);

    expect(detail).toMatchObject({
      runId,
      sourceKind: 'team-run',
      handoffTransferSummary: {
        total: 1,
        items: [
          {
            handoffId: `${runId}:handoff:${stepTwoId}:1`,
            fromStepId: stepOneId,
            fromAgentId: 'orchestrator',
            title: 'Planned recovery fallback transfer title',
            objective: 'Use planned transfer data when no stored consumed summary exists.',
            requestedOutputCount: 1,
            inputArtifactCount: 1,
          },
        ],
      },
    });
  });

  it('prefers stored consumed handoff-transfer summaries over planned handoff fallback on recovery detail', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'run_detail_handoff_transfer_precedence';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_handoff_precedence_1',
          taskRunSpecId: 'task_spec_recovery_handoff_precedence_1',
          status: 'planned',
          createdAt: '2026-04-12T17:20:00.000Z',
          updatedAt: '2026-04-12T17:20:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect stored handoff transfer precedence.',
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
            sourceStepId: 'team_run_recovery_handoff_precedence_1:step:1',
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
            startedAt: '2026-04-12T17:20:10.000Z',
            completedAt: '2026-04-12T17:20:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_precedence_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
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
              taskRunSpecId: 'task_spec_recovery_handoff_precedence_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Planned recovery fallback transfer title',
                objective: 'Planned recovery fallback transfer objective.',
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
            createdAt: '2026-04-12T17:20:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.consumedTaskTransfers.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-12T17:20:45.000Z',
                total: 1,
                items: [
                  {
                    handoffId: `${runId}:handoff:${stepTwoId}:1`,
                    fromStepId: stepOneId,
                    fromAgentId: 'orchestrator',
                    title: 'Stored recovery precedence transfer title',
                    objective: 'Stored consumed transfer should win over planned recovery fallback.',
                    requestedOutputCount: 5,
                    inputArtifactCount: 2,
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:started`,
              runId,
              stepId: stepOneId,
              type: 'step-started',
              createdAt: '2026-04-12T17:20:05.000Z',
              note: 'source step started',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:completed`,
              runId,
              stepId: stepOneId,
              type: 'step-succeeded',
              createdAt: '2026-04-12T17:20:30.000Z',
              note: 'source step completed',
            }),
          ],
          lastUpdatedAt: '2026-04-12T17:20:45.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T17:20:00.000Z',
          }),
        ],
      }),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-12T17:25:00.000Z',
    });

    const detail = await host.readRecoveryDetail(runId);

    expect(detail).toMatchObject({
      runId,
      sourceKind: 'team-run',
      handoffTransferSummary: {
        total: 1,
        items: [
          {
            handoffId: `${runId}:handoff:${stepTwoId}:1`,
            fromStepId: stepOneId,
            fromAgentId: 'orchestrator',
            title: 'Stored recovery precedence transfer title',
            objective: 'Stored consumed transfer should win over planned recovery fallback.',
            requestedOutputCount: 5,
            inputArtifactCount: 2,
          },
        ],
      },
    });
  });

  it('keeps recovery-detail orchestration timeline totals while limiting items to the newest ten events', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'run_detail_timeline_window';
    const stepId = `${runId}:step:1`;

    const history = Array.from({ length: 12 }, (_, index) =>
      createExecutionRunEvent({
        id: `${runId}:event:${index + 1}`,
        runId,
        stepId,
        type: index % 3 === 0 ? 'step-started' : index % 3 === 1 ? 'step-succeeded' : 'note-added',
        createdAt: `2026-04-12T17:${String(index).padStart(2, '0')}:00.000Z`,
        note: `recovery timeline event ${index + 1}`,
        payload:
          index % 3 === 2
            ? {
                source: 'operator',
                action: 'drain-run',
              }
            : undefined,
      }),
    );

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_timeline_window_1',
          taskRunSpecId: 'task_spec_recovery_timeline_window_1',
          status: 'planned',
          createdAt: '2026-04-12T17:00:00.000Z',
          updatedAt: '2026-04-12T17:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect the bounded recovery timeline window.',
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
            sourceStepId: 'team_run_recovery_timeline_window_1:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect the bounded recovery timeline window.',
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
          history,
          lastUpdatedAt: '2026-04-12T17:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T17:00:00.000Z',
          }),
        ],
      }),
    );

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-12T17:12:00.000Z',
    });

    const detail = await host.readRecoveryDetail(runId);
    expect(detail?.orchestrationTimelineSummary?.total).toBe(12);
    expect(detail?.orchestrationTimelineSummary?.items).toHaveLength(10);
    expect(detail?.orchestrationTimelineSummary?.items[0]).toMatchObject({
      createdAt: '2026-04-12T17:02:00.000Z',
      note: 'recovery timeline event 3',
    });
    expect(detail?.orchestrationTimelineSummary?.items[9]).toMatchObject({
      createdAt: '2026-04-12T17:11:00.000Z',
      note: 'recovery timeline event 12',
    });
  });

  it('classifies fresh active lease health for a live runner-owned execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_detail_fresh_lease', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_detail_fresh_lease',
      leaseId: 'run_detail_fresh_lease:lease:runner',
      ownerId: 'runner:fresh',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:20.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:fresh',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:20.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:00:30.000Z',
    });

    const detail = await host.readRecoveryDetail('run_detail_fresh_lease');

    expect(detail?.leaseHealth).toEqual({
      status: 'fresh',
      reason: 'lease and runner heartbeats are fresh',
      leaseHeartbeatAt: '2026-04-08T15:00:20.000Z',
      leaseExpiresAt: '2026-04-08T15:10:00.000Z',
      runnerLastHeartbeatAt: '2026-04-08T15:00:20.000Z',
      runnerLastActivityAt: null,
    });
  });

  it('classifies suspiciously idle active lease health when no runner activity follows lease acquisition', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_detail_idle_lease', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_detail_idle_lease',
      leaseId: 'run_detail_idle_lease:lease:runner',
      ownerId: 'runner:idle',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:04:55.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:idle',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:50:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:55.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        lastActivityAt: '2026-04-08T14:59:00.000Z',
        lastClaimedRunId: 'run_before_idle',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const detail = await host.readRecoveryDetail('run_detail_idle_lease');

    expect(detail?.leaseHealth).toEqual({
      status: 'suspiciously-idle',
      reason: 'active lease has no observed runner activity since it was acquired',
      leaseHeartbeatAt: '2026-04-08T15:04:55.000Z',
      leaseExpiresAt: '2026-04-08T15:10:00.000Z',
      runnerLastHeartbeatAt: '2026-04-08T15:04:55.000Z',
      runnerLastActivityAt: '2026-04-08T14:59:00.000Z',
    });
    expect(detail?.attention).toEqual({
      needed: true,
      kind: 'suspiciously-idle',
      reason: 'active lease has no observed runner activity since it was acquired',
    });
  });

  it('repairs only stale-heartbeat leases that are already locally reclaimable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_detail_repairable_stale', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_detail_repairable_stale',
      leaseId: 'run_detail_repairable_stale:lease:runner',
      ownerId: 'runner:stale-repairable',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:20.000Z',
      expiresAt: '2026-04-08T15:01:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale-repairable',
        hostId: 'host:http-responses:127.0.0.1:8080',
        status: 'stale',
        startedAt: '2026-04-08T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:00:20.000Z',
        expiresAt: '2026-04-08T15:00:30.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:02:00.000Z',
    });

    const result = await host.controlOperatorAction({
      kind: 'lease-repair',
      action: 'repair-stale-heartbeat',
      runId: 'run_detail_repairable_stale',
    });

    expect(result).toEqual({
      kind: 'lease-repair',
      action: 'repair-stale-heartbeat',
      runId: 'run_detail_repairable_stale',
      status: 'repaired',
      repaired: true,
      reason: 'active lease owner is unavailable and the lease is expired',
      leaseHealthStatus: 'stale-heartbeat',
      repairPosture: 'locally-reclaimable',
      reconciliationReason: 'lease owner runner:stale-repairable is stale',
    });

    const repairedRecord = await control.readRun('run_detail_repairable_stale');
    expect(repairedRecord?.bundle.leases[0]?.status).toBe('expired');
    expect(repairedRecord?.bundle.leases[0]?.releaseReason).toBe('lease expired');
  });

  it('keeps suspiciously idle leases read-only for operator repair', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createDirectBundle('run_detail_idle_repair', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_detail_idle_repair',
      leaseId: 'run_detail_idle_repair:lease:runner',
      ownerId: 'runner:idle-repair',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:04:55.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:idle-repair',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:50:00.000Z',
        lastHeartbeatAt: '2026-04-08T15:04:55.000Z',
        expiresAt: '2026-04-08T15:10:00.000Z',
        lastActivityAt: '2026-04-08T14:59:00.000Z',
        lastClaimedRunId: 'run_before_idle',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const host = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.repairStaleHeartbeatLease('run_detail_idle_repair');

    expect(result).toEqual({
      action: 'repair-stale-heartbeat',
      runId: 'run_detail_idle_repair',
      status: 'not-stale-heartbeat',
      repaired: false,
      reason: 'active lease has no observed runner activity since it was acquired',
      leaseHealthStatus: 'suspiciously-idle',
      repairPosture: 'not-reclaimable',
      reconciliationReason: 'active lease has no observed runner activity since it was acquired',
    });

    const storedRecord = await control.readRun('run_detail_idle_repair');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
  });

  it('cancels an active run owned by the configured local runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_cancel_owned', '2026-04-08T15:00:00.000Z', 'running');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      status: 'running',
      startedAt: '2026-04-08T15:00:00.000Z',
    };
    await control.createRun(bundle);
    await control.acquireLease({
      runId: 'run_cancel_owned',
      leaseId: 'run_cancel_owned:lease:runner',
      ownerId: 'runner:cancel-local',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:10.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      runnerId: 'runner:cancel-local',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.cancelOwnedRun('run_cancel_owned');

    expect(result).toEqual({
      action: 'cancel-run',
      runId: 'run_cancel_owned',
      status: 'cancelled',
      cancelled: true,
      reason: 'run cancelled by service host operator control',
    });

    const storedRecord = await control.readRun('run_cancel_owned');
    expect(storedRecord?.bundle.run.status).toBe('cancelled');
    expect(storedRecord?.bundle.sharedState.status).toBe('cancelled');
    expect(storedRecord?.bundle.steps[0]?.status).toBe('cancelled');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('released');
    expect(storedRecord?.bundle.leases[0]?.releaseReason).toBe('cancelled');
  });

  it('rejects cancelling an active run owned by a different runner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bundle = createDirectBundle('run_cancel_other_owner', '2026-04-08T15:00:00.000Z', 'running');
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      status: 'running',
      startedAt: '2026-04-08T15:00:00.000Z',
    };
    await control.createRun(bundle);
    await control.acquireLease({
      runId: 'run_cancel_other_owner',
      leaseId: 'run_cancel_other_owner:lease:runner',
      ownerId: 'runner:someone-else',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:10.000Z',
      expiresAt: '2026-04-08T15:10:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      runnerId: 'runner:cancel-local',
      now: () => '2026-04-08T15:05:00.000Z',
    });

    const result = await host.cancelOwnedRun('run_cancel_other_owner');

    expect(result).toEqual({
      action: 'cancel-run',
      runId: 'run_cancel_other_owner',
      status: 'not-owned',
      cancelled: false,
      reason: 'active lease is owned by runner:someone-else, not runner:cancel-local',
    });

    const storedRecord = await control.readRun('run_cancel_other_owner');
    expect(storedRecord?.bundle.run.status).toBe('running');
    expect(storedRecord?.bundle.steps[0]?.status).toBe('running');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
  });

  it('drains multiple runnable steps on one run across passes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createTwoStepBundle('run_multi', '2026-04-08T15:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsUntilIdle({
      runId: 'run_multi',
      sourceKind: 'direct',
      maxRuns: 5,
    });

    expect(result.iterations).toBe(2);
    expect(result.executedRunIds).toEqual(['run_multi', 'run_multi']);
    expect(result.drained[0]).toMatchObject({
      runId: 'run_multi',
      result: 'executed',
    });
    expect(result.drained[1]).toMatchObject({
      runId: 'run_multi',
      result: 'executed',
    });
    const final = result.drained.at(-1)?.record;
    expect(final?.bundle.run.status).toBe('succeeded');
    expect(final?.bundle.steps[0]?.status).toBe('succeeded');
    expect(final?.bundle.steps[1]?.status).toBe('succeeded');
  });

  it('collapses repeated skipped batch results across passes while preserving executions', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createTwoStepBundle('run_multi_batch', '2026-04-08T15:00:00.000Z'));

    const idle = createDirectBundle('run_idle_batch', '2026-04-08T15:02:00.000Z');
    idle.run.status = 'succeeded';
    idle.steps[0] = {
      ...idle.steps[0]!,
      status: 'succeeded',
      startedAt: '2026-04-08T15:02:00.000Z',
      completedAt: '2026-04-08T15:02:00.000Z',
      output: {
        summary: 'done',
        artifacts: [],
        structuredData: {},
        notes: [],
      },
    };
    idle.sharedState.status = 'succeeded';
    await control.createRun(idle);

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsUntilIdle({
      sourceKind: 'direct',
      maxRuns: 5,
    });

    expect(result.iterations).toBe(3);
    expect(result.executedRunIds).toEqual(['run_multi_batch', 'run_multi_batch']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_multi_batch',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_idle_batch',
        result: 'skipped',
        reason: 'no-runnable-step',
      }),
      expect.objectContaining({
        runId: 'run_multi_batch',
        result: 'executed',
      }),
    ]);
  });

  it('counts a reclaimed stale lease only once across repeated execution passes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createTwoStepBundle('run_multi_stale_reclaim', '2026-04-08T15:00:00.000Z'));
    await control.acquireLease({
      runId: 'run_multi_stale_reclaim',
      leaseId: 'run_multi_stale_reclaim:lease:stale',
      ownerId: 'host:stale-owner',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:00.000Z',
      expiresAt: '2026-04-08T15:01:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsUntilIdle({
      runId: 'run_multi_stale_reclaim',
      sourceKind: 'direct',
      maxRuns: 5,
    });

    expect(result.iterations).toBe(2);
    expect(result.expiredLeaseRunIds).toEqual(['run_multi_stale_reclaim']);
    expect(result.executedRunIds).toEqual(['run_multi_stale_reclaim', 'run_multi_stale_reclaim']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_multi_stale_reclaim',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_multi_stale_reclaim',
        result: 'executed',
      }),
    ]);

    const storedRecord = await control.readRun('run_multi_stale_reclaim');
    expect(storedRecord?.bundle.leases[0]?.status).toBe('expired');
    expect(storedRecord?.bundle.leases[0]?.releaseReason).toBe('lease expired');
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
  });
});
