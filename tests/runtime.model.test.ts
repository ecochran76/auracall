import { describe, expect, it } from 'vitest';
import {
  createExecutionRun,
  createExecutionRunAffinityRecord,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunRecordBundleFromTeamRun,
  createExecutionRunnerRecord,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';
import { createTeamRunBundle } from '../src/teams/model.js';

describe('runtime execution model helpers', () => {
  it('creates direct execution entities with conservative defaults', () => {
    const run = createExecutionRun({
      id: 'run_1',
      createdAt: '2026-04-07T00:00:00.000Z',
      taskRunSpecId: 'task_spec_1',
      trigger: 'service',
      sharedStateId: 'run_1:state',
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    });

    const step = createExecutionRunStep({
      id: 'run_1:step:1',
      runId: run.id,
      agentId: 'analyst',
      kind: 'analysis',
      order: 1,
      input: {
        prompt: 'Investigate the likely fault domain.',
        handoffIds: [],
        artifacts: [],
        structuredData: {},
        notes: [],
      },
    });

    const event = createExecutionRunEvent({
      id: 'run_1:event:run-created',
      runId: run.id,
      type: 'run-created',
      createdAt: run.createdAt,
    });

    const affinity = createExecutionRunAffinityRecord({
      service: 'chatgpt',
      serviceAccountId: 'acct_chatgpt_default',
      browserRequired: true,
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      hostRequirement: 'same-host',
      requiredHostId: 'host:wsl-dev-1',
      eligibilityNote: 'requires the signed-in WSL ChatGPT browser-bearing account',
    });

    const runner = createExecutionRunnerRecord({
      id: 'runner:wsl-local-1',
      hostId: 'host:wsl-dev-1',
      startedAt: run.createdAt,
      expiresAt: '2026-04-07T00:01:20.000Z',
      serviceIds: ['chatgpt', 'gemini'],
      runtimeProfileIds: ['default'],
      browserProfileIds: ['wsl-chrome-2'],
      serviceAccountIds: ['acct_chatgpt_default'],
      browserCapable: true,
      eligibilityNote: 'WSL Chrome runner with the default ChatGPT account',
    });

    const sharedState = createExecutionRunSharedState({
      id: run.sharedStateId,
      runId: run.id,
      lastUpdatedAt: run.createdAt,
    });

    const bundle = createExecutionRunRecordBundle({
      run,
      steps: [step],
      sharedState,
      events: [event],
    });

    expect(run.sourceKind).toBe('direct');
    expect(run.taskRunSpecId).toBe('task_spec_1');
    expect(step.status).toBe('planned');
    expect(sharedState.history).toEqual([]);
    expect(bundle.handoffs).toEqual([]);
    expect(bundle.localActionRequests).toEqual([]);
    expect(bundle.leases).toEqual([]);
    expect(affinity.serviceAccountId).toBe('acct_chatgpt_default');
    expect(affinity.hostRequirement).toBe('same-host');
    expect(runner.lastHeartbeatAt).toBe(run.createdAt);
    expect(runner.lastActivityAt).toBeNull();
    expect(runner.lastClaimedRunId).toBeNull();
    expect(runner.serviceIds).toContain('chatgpt');
  });

  it('projects a team-run bundle into one execution-record bundle', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_1',
      teamId: 'research-team',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      entryPrompt: 'Investigate the regression and report the fault domain.',
      initialInputs: {
        repository: 'oracle',
      },
      steps: [
        {
          id: 'team_run_1:step:2',
          agentId: 'reviewer',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'review',
          status: 'blocked',
          order: 2,
          dependsOnStepIds: ['team_run_1:step:1'],
          input: {
            prompt: null,
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: ['waiting for prior analysis'],
          },
        },
        {
          id: 'team_run_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Read the failing artifact flow and summarize the likely issue.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const bundle = createExecutionRunRecordBundleFromTeamRun(teamBundle);

    expect(bundle.run).toMatchObject({
      id: 'team_run_1',
      sourceKind: 'team-run',
      sourceId: 'team_run_1',
      sharedStateId: 'team_run_1:state',
      stepIds: ['team_run_1:step:1', 'team_run_1:step:2'],
    });
    expect(bundle.steps.map((step) => ({ id: step.id, status: step.status }))).toEqual([
      {
        id: 'team_run_1:step:1',
        status: 'runnable',
      },
      {
        id: 'team_run_1:step:2',
        status: 'blocked',
      },
    ]);
    expect(bundle.handoffs.map((handoff) => ({ from: handoff.fromStepId, to: handoff.toStepId }))).toEqual([
      {
        from: 'team_run_1:step:1',
        to: 'team_run_1:step:2',
      },
    ]);
    expect(bundle.localActionRequests).toEqual([]);
    expect(bundle.events.map((event) => event.type)).toEqual(['run-created', 'step-runnable', 'step-planned']);
    expect(bundle.sharedState.history.map((event) => event.type)).toEqual(['run-created', 'step-runnable', 'step-planned']);
    expect(bundle.leases).toEqual([]);
  });

  it('preserves task-run-spec linkage when projecting a team-run bundle', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_2',
      teamId: 'vibe-code',
      taskRunSpecId: 'task_vibe_1',
      createdAt: '2026-04-09T00:00:00.000Z',
      trigger: 'service',
      entryPrompt: 'Review the bundle and produce the next work-product zip.',
      steps: [
        {
          id: 'team_run_2:step:1',
          agentId: 'orchestrator',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Analyze the assignment.',
            handoffIds: [],
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_vibe_1',
            },
            notes: [],
          },
        },
      ],
    });

    const bundle = createExecutionRunRecordBundleFromTeamRun(teamBundle);

    expect(bundle.run.sourceId).toBe('team_run_2');
    expect(bundle.run.taskRunSpecId).toBe('task_vibe_1');
    expect(teamBundle.teamRun.taskRunSpecId).toBe('task_vibe_1');
    expect(bundle.handoffs).toEqual([]);
    expect(bundle.localActionRequests).toEqual([]);
    expect(bundle.steps[0]?.input.structuredData).toMatchObject({
      taskRunSpecId: 'task_vibe_1',
    });
  });
});
