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
import { createExecutionServiceHost } from '../src/runtime/serviceHost.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

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

describe('runtime service host', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
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
        reason: 'active-lease',
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
      strandedRunIds: ['run_stranded'],
      idleRunIds: ['run_idle'],
    });
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
});
