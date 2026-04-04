import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
  TeamRunHandoffSchema,
  TeamRunSchema,
  TeamRunSharedStateSchema,
  TeamRunStepSchema,
} from '../src/teams/schema.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('team run schemas', () => {
  it('parses the conservative default execution policy', () => {
    expect(DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA).toEqual(DEFAULT_TEAM_RUN_EXECUTION_POLICY);
  });

  it('parses one stable team-run entity bundle', () => {
    const teamRun = TeamRunSchema.parse({
      id: 'run_1',
      teamId: 'research-team',
      status: 'planned',
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z',
      trigger: 'service',
      requestedBy: 'scheduler',
      entryPrompt: 'Investigate the regression and return a recommendation.',
      initialInputs: {
        repository: 'oracle',
      },
      sharedStateId: 'state_1',
      stepIds: ['step_1', 'step_2'],
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    });

    const step = TeamRunStepSchema.parse({
      id: 'step_1',
      teamRunId: teamRun.id,
      agentId: 'analyst',
      runtimeProfileId: 'default',
      browserProfileId: 'wsl-chrome-2',
      service: 'chatgpt',
      kind: 'analysis',
      status: 'ready',
      order: 1,
      dependsOnStepIds: [],
      input: {
        prompt: 'Read the failing artifact flow and summarize the fault domain.',
        handoffIds: [],
        artifacts: [],
        structuredData: {
          branch: 'main',
        },
        notes: ['initial analysis'],
      },
      output: null,
      startedAt: null,
      completedAt: null,
      failure: null,
    });

    const handoff = TeamRunHandoffSchema.parse({
      id: 'handoff_1',
      teamRunId: teamRun.id,
      fromStepId: step.id,
      toStepId: 'step_2',
      fromAgentId: 'analyst',
      toAgentId: 'reviewer',
      summary: 'The likely fault is in the artifact-read retry boundary.',
      artifacts: [],
      structuredData: {
        suspectedModule: 'chatgptAdapter.ts',
      },
      notes: ['review this against the live smoke evidence'],
      status: 'prepared',
      createdAt: '2026-04-03T00:01:00.000Z',
    });

    const sharedState = TeamRunSharedStateSchema.parse({
      id: teamRun.sharedStateId,
      teamRunId: teamRun.id,
      status: 'active',
      artifacts: [],
      structuredOutputs: [
        {
          key: 'suspectedModule',
          value: 'chatgptAdapter.ts',
        },
      ],
      notes: ['team run created'],
      history: [
        {
          id: 'event_1',
          teamRunId: teamRun.id,
          type: 'step-planned',
          createdAt: '2026-04-03T00:00:30.000Z',
          stepId: step.id,
          handoffId: null,
          artifactId: null,
          note: 'first analysis step planned',
          payload: {
            order: step.order,
          },
        },
      ],
      lastUpdatedAt: '2026-04-03T00:00:30.000Z',
    });

    expect(teamRun.policy.executionMode).toBe('sequential');
    expect(step.service).toBe('chatgpt');
    expect(handoff.status).toBe('prepared');
    expect(sharedState.history[0]?.type).toBe('step-planned');
  });
});
