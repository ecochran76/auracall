import { describe, expect, it } from 'vitest';
import type {
  ExecutionRun,
  ExecutionRunAffinityRecord,
  ExecutionRunnerRecord,
  ExecutionRunEvent,
  ExecutionRunLease,
  ExecutionRunSharedState,
  ExecutionRunStep,
} from '../src/runtime/types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('runtime execution types', () => {
  it('supports one stable execution-record vocabulary', () => {
    const run: ExecutionRun = {
      id: 'run_1',
      sourceKind: 'team-run',
      sourceId: 'team-run_1',
      taskRunSpecId: 'task_spec_1',
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

    const affinity: ExecutionRunAffinityRecord = {
      service: 'chatgpt',
      serviceAccountId: 'acct_chatgpt_default',
      browserRequired: true,
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      hostRequirement: 'same-host',
      requiredHostId: 'host:wsl-dev-1',
      eligibilityNote: 'requires the signed-in WSL ChatGPT browser-bearing account',
    };

    const runner: ExecutionRunnerRecord = {
      id: 'runner:wsl-local-1',
      hostId: 'host:wsl-dev-1',
      status: 'active',
      startedAt: '2026-04-07T00:00:00.000Z',
      lastHeartbeatAt: '2026-04-07T00:00:20.000Z',
      expiresAt: '2026-04-07T00:01:20.000Z',
      lastActivityAt: null,
      lastClaimedRunId: null,
      serviceIds: ['chatgpt', 'gemini'],
      runtimeProfileIds: ['default'],
      browserProfileIds: ['wsl-chrome-2'],
      serviceAccountIds: ['acct_chatgpt_default'],
      browserCapable: true,
      eligibilityNote: 'WSL Chrome runner with the default ChatGPT account',
    };

    expect(run.policy).toBe(DEFAULT_TEAM_RUN_EXECUTION_POLICY);
    expect(run.taskRunSpecId).toBe('task_spec_1');
    expect(step.status).toBe('runnable');
    expect(event.type).toBe('run-created');
    expect(lease.status).toBe('active');
    expect(sharedState.history[0]?.id).toBe(event.id);
    expect(affinity.hostRequirement).toBe('same-host');
    expect(affinity.browserRequired).toBe(true);
    expect(runner.status).toBe('active');
    expect(runner.browserCapable).toBe(true);
  });

  it('supports handoff-consumed as a first-class execution history event type', () => {
    const event: ExecutionRunEvent = {
      id: 'run_1:event:handoff_1:consumed',
      runId: 'run_1',
      type: 'handoff-consumed',
      createdAt: '2026-04-07T00:01:00.000Z',
      stepId: 'run_1:step:2',
      leaseId: null,
      note: 'handoff consumed from run_1:step:1 by run_1:step:2',
      payload: {
        handoffId: 'handoff_1',
        fromStepId: 'run_1:step:1',
      },
    };

    expect(event.type).toBe('handoff-consumed');
    expect(event.stepId).toBe('run_1:step:2');
  });
});
