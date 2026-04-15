import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
  type TaskRunSpec,
  type TeamRunBundle,
  type TeamRun,
  type TeamRunHandoff,
  type TeamRunLocalActionRequest,
  type TeamRunSharedState,
  type TeamRunStep,
} from '../src/teams/types.js';

describe('team run types', () => {
  it('exposes conservative default execution policy values', () => {
    expect(DEFAULT_TEAM_RUN_EXECUTION_POLICY).toEqual({
      executionMode: 'sequential',
      failPolicy: 'fail-fast',
      parallelismMode: 'disabled',
      handoffRequirement: 'explicit',
    });
  });

  it('exposes conservative default task-run-spec policy values', () => {
    expect(DEFAULT_TASK_RUN_SPEC_TURN_POLICY).toEqual({
      maxTurns: null,
      stopOnStatus: [],
      allowTeamInitiatedStop: true,
      allowHumanEscalation: true,
    });
    expect(DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY).toEqual({
      requiredOn: [],
      allowClarificationRequests: true,
      allowApprovalRequests: true,
      defaultBehavior: 'pause',
    });
    expect(DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY).toEqual({
      mode: 'forbidden',
      complexityStage: 'bounded-command',
      allowedActionKinds: [],
      allowedCommands: [],
      allowedCwdRoots: [],
      resultReportingMode: 'summary-only',
    });
  });

  it('supports one stable team-run entity vocabulary', () => {
    const taskRunSpec: TaskRunSpec = {
      id: 'task_1',
      teamId: 'research-team',
      title: 'Artifact regression review',
      objective: 'Investigate the artifact regression and propose a fix path.',
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
    };

    const teamRun: TeamRun = {
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
    };

    const step: TeamRunStep = {
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
    };

    const handoff: TeamRunHandoff = {
      id: 'handoff_1',
      teamRunId: teamRun.id,
      fromStepId: 'step_1',
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
    };

    const sharedState: TeamRunSharedState = {
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
    };

    const localActionRequest: TeamRunLocalActionRequest = {
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
    };

    const bundle: TeamRunBundle = {
      teamRun,
      steps: [step],
      handoffs: [handoff],
      localActionRequests: [localActionRequest],
      sharedState,
    };

    expect(taskRunSpec.turnPolicy.allowHumanEscalation).toBe(true);
    expect(teamRun.policy).toBe(DEFAULT_TEAM_RUN_EXECUTION_POLICY);
    expect(step.agentId).toBe('analyst');
    expect(handoff.toAgentId).toBe('reviewer');
    expect(localActionRequest.status).toBe('requested');
    expect(bundle.localActionRequests[0]?.kind).toBe('shell');
    expect(sharedState.history[0]?.type).toBe('step-planned');
  });
});
