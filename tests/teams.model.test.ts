import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
  createTeamRunBundle,
  createTeamRunSharedState,
  createTeamRunStep,
} from '../src/teams/model.js';

describe('team run model helpers', () => {
  it('creates a planned team step with conservative defaults', () => {
    const step = createTeamRunStep('run_1', {
      id: 'step_1',
      agentId: 'analyst',
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      service: 'chatgpt',
      order: 2,
      input: {
        prompt: 'Review the artifact flow and summarize the failure mode.',
      },
    });

    expect(step).toEqual({
      id: 'step_1',
      teamRunId: 'run_1',
      agentId: 'analyst',
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      service: 'chatgpt',
      kind: 'prompt',
      status: 'planned',
      order: 2,
      dependsOnStepIds: [],
      input: {
        prompt: 'Review the artifact flow and summarize the failure mode.',
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
  });

  it('creates a default empty shared state record', () => {
    expect(
      createTeamRunSharedState({
        id: 'state_1',
        teamRunId: 'run_1',
        createdAt: '2026-04-03T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'state_1',
      teamRunId: 'run_1',
      status: 'active',
      artifacts: [],
      structuredOutputs: [],
      notes: [],
      history: [],
      lastUpdatedAt: '2026-04-03T00:00:00.000Z',
    });
  });

  it('creates a validated default team-run bundle from ordered steps', () => {
    const bundle = createTeamRunBundle({
      runId: 'run_1',
      teamId: 'research-team',
      createdAt: '2026-04-03T00:00:00.000Z',
      entryPrompt: 'Investigate the regression and return a recommendation.',
      initialInputs: {
        repository: 'oracle',
      },
      steps: [
        {
          id: 'step_2',
          agentId: 'reviewer',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'review',
          order: 2,
          dependsOnStepIds: ['step_1'],
        },
        {
          id: 'step_1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          kind: 'analysis',
          order: 1,
          input: {
            prompt: 'Read the failing artifact flow and summarize the fault domain.',
          },
        },
      ],
    });

    expect(bundle.teamRun).toEqual({
      id: 'run_1',
      teamId: 'research-team',
      status: 'planned',
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z',
      trigger: 'service',
      requestedBy: null,
      entryPrompt: 'Investigate the regression and return a recommendation.',
      initialInputs: {
        repository: 'oracle',
      },
      sharedStateId: 'run_1:state',
      stepIds: ['step_1', 'step_2'],
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    });
    expect(bundle.steps.map((step) => step.id)).toEqual(['step_1', 'step_2']);
    expect(bundle.steps[0]?.kind).toBe('analysis');
    expect(bundle.steps[1]?.dependsOnStepIds).toEqual(['step_1']);
    expect(bundle.sharedState.id).toBe('run_1:state');
  });
});
