import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY_SCHEMA,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY_SCHEMA,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY_SCHEMA,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
  TaskRunSpecSchema,
  TeamRunBundleSchema,
  TeamRunHandoffSchema,
  TeamRunLocalActionRequestSchema,
  TeamRunSchema,
  TeamRunSharedStateSchema,
  TeamRunStepSchema,
} from '../src/teams/schema.js';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
} from '../src/teams/types.js';

describe('team run schemas', () => {
  it('parses the conservative default execution policy', () => {
    expect(DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA).toEqual(DEFAULT_TEAM_RUN_EXECUTION_POLICY);
  });

  it('parses the conservative default task-run-spec policies', () => {
    expect(DEFAULT_TASK_RUN_SPEC_TURN_POLICY_SCHEMA).toEqual(DEFAULT_TASK_RUN_SPEC_TURN_POLICY);
    expect(DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY_SCHEMA).toEqual(
      DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
    );
    expect(DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY_SCHEMA).toEqual(
      DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
    );
  });

  it('parses one stable team-run entity bundle', () => {
    const taskRunSpec = TaskRunSpecSchema.parse({
      id: 'task_1',
      teamId: 'research-team',
      title: 'Artifact regression review',
      objective: 'Investigate the artifact regression and return a recommendation.',
      successCriteria: ['recommendation emitted'],
      requestedOutputs: [
        {
          kind: 'structured-report',
          label: 'recommendation',
          format: 'markdown',
          required: true,
          schemaHint: null,
          destination: 'response-body',
        },
      ],
      inputArtifacts: [
        {
          id: 'artifact_1',
          kind: 'bundle',
          title: 'source bundle',
          path: '/tmp/bundle.zip',
          uri: null,
          mediaType: 'application/zip',
          notes: [],
          required: true,
        },
      ],
      context: {
        repository: 'oracle',
      },
      constraints: {
        allowedServices: ['chatgpt'],
        blockedServices: null,
        maxRuntimeMinutes: null,
        maxTurns: null,
        providerBudget: null,
      },
      overrides: {
        runtimeProfileId: null,
        browserProfileId: null,
        agentIds: null,
        promptAppend: null,
        structuredContext: null,
      },
      turnPolicy: DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
      humanInteractionPolicy: DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
      localActionPolicy: DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
      requestedBy: {
        kind: 'service',
        id: 'scheduler',
        label: 'scheduler',
      },
      trigger: 'service',
      createdAt: '2026-04-09T00:00:00.000Z',
    });

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

    const localActionRequest = TeamRunLocalActionRequestSchema.parse({
      id: 'action_1',
      teamRunId: teamRun.id,
      ownerStepId: step.id,
      kind: 'shell',
      summary: 'Run a bounded local verification command.',
      command: 'pnpm',
      args: ['vitest', 'run'],
      structuredPayload: {
        cwd: '/repo',
      },
      notes: ['requires approval in stricter modes'],
      status: 'requested',
      createdAt: '2026-04-03T00:02:00.000Z',
    });

    const bundle = TeamRunBundleSchema.parse({
      teamRun,
      steps: [step],
      handoffs: [handoff],
      localActionRequests: [localActionRequest],
      sharedState,
    });

    expect(taskRunSpec.localActionPolicy.mode).toBe('forbidden');
    expect(teamRun.policy.executionMode).toBe('sequential');
    expect(step.service).toBe('chatgpt');
    expect(handoff.status).toBe('prepared');
    expect(localActionRequest.status).toBe('requested');
    expect(bundle.handoffs[0]?.toAgentId).toBe('reviewer');
    expect(sharedState.history[0]?.type).toBe('step-planned');
  });
});
