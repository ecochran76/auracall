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
import { executeStoredExecutionRunOnce } from '../src/runtime/runner.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

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
});
