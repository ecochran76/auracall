import { describe, expect, it } from 'vitest';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunRecordBundleFromTeamRun,
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
    expect(step.status).toBe('planned');
    expect(sharedState.history).toEqual([]);
    expect(bundle.leases).toEqual([]);
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
    expect(bundle.events.map((event) => event.type)).toEqual(['run-created', 'step-runnable', 'step-planned']);
    expect(bundle.sharedState.history.map((event) => event.type)).toEqual(['run-created', 'step-runnable', 'step-planned']);
    expect(bundle.leases).toEqual([]);
  });
});
