import { describe, expect, it } from 'vitest';
import type { ExecutionRun, ExecutionRunEvent, ExecutionRunLease, ExecutionRunSharedState, ExecutionRunStep } from '../src/runtime/types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('runtime execution types', () => {
  it('supports one stable execution-record vocabulary', () => {
    const run: ExecutionRun = {
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
    };

    const step: ExecutionRunStep = {
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
    };

    const event: ExecutionRunEvent = {
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
    };

    const lease: ExecutionRunLease = {
      id: 'lease_1',
      runId: run.id,
      ownerId: 'runner:local-1',
      status: 'active',
      acquiredAt: '2026-04-07T00:00:10.000Z',
      heartbeatAt: '2026-04-07T00:00:20.000Z',
      expiresAt: '2026-04-07T00:01:20.000Z',
      releasedAt: null,
      releaseReason: null,
    };

    const sharedState: ExecutionRunSharedState = {
      id: run.sharedStateId,
      runId: run.id,
      status: 'active',
      artifacts: [],
      structuredOutputs: [],
      notes: ['run created'],
      history: [event],
      lastUpdatedAt: '2026-04-07T00:00:20.000Z',
    };

    expect(run.policy).toBe(DEFAULT_TEAM_RUN_EXECUTION_POLICY);
    expect(step.status).toBe('runnable');
    expect(event.type).toBe('run-created');
    expect(lease.status).toBe('active');
    expect(sharedState.history[0]?.id).toBe(event.id);
  });
});
