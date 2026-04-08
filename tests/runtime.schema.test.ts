import { describe, expect, it } from 'vitest';
import {
  ExecutionRunEventSchema,
  ExecutionRunLeaseSchema,
  ExecutionRunRecordBundleSchema,
  ExecutionRunSchema,
  ExecutionRunSharedStateSchema,
  ExecutionRunStepSchema,
} from '../src/runtime/schema.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('runtime execution schemas', () => {
  it('parses one stable execution-record bundle', () => {
    const run = ExecutionRunSchema.parse({
      id: 'run_1',
      sourceKind: 'team-run',
      sourceId: 'team-run_1',
      status: 'planned',
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      requestedBy: 'scheduler',
      entryPrompt: 'Investigate the regression and report the fault domain.',
      initialInputs: {
        repository: 'oracle',
      },
      sharedStateId: 'run_1:state',
      stepIds: ['run_1:step:1'],
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    });

    const step = ExecutionRunStepSchema.parse({
      id: 'run_1:step:1',
      runId: run.id,
      sourceStepId: 'team-step_1',
      agentId: 'analyst',
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      service: 'chatgpt',
      kind: 'analysis',
      status: 'runnable',
      order: 1,
      dependsOnStepIds: [],
      input: {
        prompt: 'Read the failing artifact flow and summarize the likely issue.',
        handoffIds: [],
        artifacts: [],
        structuredData: {},
        notes: [],
      },
      output: null,
      startedAt: null,
      completedAt: null,
      failure: null,
    });

    const event = ExecutionRunEventSchema.parse({
      id: 'run_1:event:run-created',
      runId: run.id,
      type: 'run-created',
      createdAt: '2026-04-07T00:00:00.000Z',
      stepId: null,
      leaseId: null,
      note: 'runtime execution record created',
      payload: {
        sourceKind: run.sourceKind,
      },
    });

    const lease = ExecutionRunLeaseSchema.parse({
      id: 'lease_1',
      runId: run.id,
      ownerId: 'runner:local-1',
      status: 'active',
      acquiredAt: '2026-04-07T00:00:10.000Z',
      heartbeatAt: '2026-04-07T00:00:20.000Z',
      expiresAt: '2026-04-07T00:01:20.000Z',
      releasedAt: null,
      releaseReason: null,
    });

    const sharedState = ExecutionRunSharedStateSchema.parse({
      id: run.sharedStateId,
      runId: run.id,
      status: 'active',
      artifacts: [],
      structuredOutputs: [],
      notes: ['run created'],
      history: [event],
      lastUpdatedAt: '2026-04-07T00:00:20.000Z',
    });

    const bundle = ExecutionRunRecordBundleSchema.parse({
      run,
      steps: [step],
      sharedState,
      events: [event],
      leases: [lease],
    });

    expect(bundle.run.sourceKind).toBe('team-run');
    expect(bundle.steps[0]?.status).toBe('runnable');
    expect(bundle.events[0]?.type).toBe('run-created');
    expect(bundle.leases[0]?.status).toBe('active');
  });
});
