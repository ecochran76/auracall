import { describe, expect, it } from 'vitest';
import {
  createTeamRunServicePlan,
  createTeamRunServicePlanFromConfig,
  createTeamRunServicePlanFromResolvedTeam,
} from '../src/teams/service.js';

describe('team run service helpers', () => {
  it('classifies planned team-run steps for future service dispatch', () => {
    const plan = createTeamRunServicePlanFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
          consulting: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
          work: { browserProfile: 'consulting', defaultService: 'grok' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'work' },
        },
        teams: {
          ops: { agents: ['analyst', 'missing-agent', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'run_1',
      createdAt: '2026-04-03T00:00:00.000Z',
    });

    expect(plan.teamRun.teamId).toBe('ops');
    expect(plan.steps.map((step) => step.id)).toEqual(['run_1:step:1', 'run_1:step:2', 'run_1:step:3']);
    expect(plan.runnableStepIds).toEqual(['run_1:step:1']);
    expect(plan.blockedStepIds).toEqual(['run_1:step:2']);
    expect(plan.waitingStepIds).toEqual(['run_1:step:3']);
    expect(plan.terminalStepIds).toEqual([]);
    expect(plan.missingDependencyStepIds).toEqual([]);
    expect(plan.stepsById['run_1:step:3']?.browserProfileId).toBe('consulting');
  });

  it('promotes later steps to runnable when dependencies are already satisfied', () => {
    const plan = createTeamRunServicePlan({
      teamRun: {
        id: 'run_2',
        teamId: 'ops',
        status: 'running',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:10.000Z',
        trigger: 'service',
        requestedBy: null,
        entryPrompt: null,
        initialInputs: {},
        sharedStateId: 'run_2:state',
        stepIds: ['run_2:step:1', 'run_2:step:2', 'run_2:step:3'],
        policy: {
          executionMode: 'sequential',
          failPolicy: 'fail-fast',
          parallelismMode: 'disabled',
          handoffRequirement: 'explicit',
        },
      },
      steps: [
        {
          id: 'run_2:step:1',
          teamRunId: 'run_2',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: { prompt: null, handoffIds: [], artifacts: [], structuredData: {}, notes: [] },
          output: null,
          startedAt: null,
          completedAt: null,
          failure: null,
        },
        {
          id: 'run_2:step:2',
          teamRunId: 'run_2',
          agentId: 'reviewer',
          runtimeProfileId: 'work',
          browserProfileId: 'consulting',
          service: 'grok',
          kind: 'review',
          status: 'ready',
          order: 2,
          dependsOnStepIds: ['run_2:step:1'],
          input: { prompt: null, handoffIds: [], artifacts: [], structuredData: {}, notes: [] },
          output: null,
          startedAt: null,
          completedAt: null,
          failure: null,
        },
        {
          id: 'run_2:step:3',
          teamRunId: 'run_2',
          agentId: 'publisher',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'synthesis',
          status: 'planned',
          order: 3,
          dependsOnStepIds: ['missing-step'],
          input: { prompt: null, handoffIds: [], artifacts: [], structuredData: {}, notes: [] },
          output: null,
          startedAt: null,
          completedAt: null,
          failure: null,
        },
      ],
      sharedState: {
        id: 'run_2:state',
        teamRunId: 'run_2',
        status: 'active',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-03T00:00:10.000Z',
      },
    });

    expect(plan.runnableStepIds).toEqual(['run_2:step:2']);
    expect(plan.waitingStepIds).toEqual(['run_2:step:3']);
    expect(plan.blockedStepIds).toEqual([]);
    expect(plan.terminalStepIds).toEqual(['run_2:step:1']);
    expect(plan.missingDependencyStepIds).toEqual(['missing-step']);
  });

  it('preserves blocked unresolved members when creating a service-ready plan from resolved teams', () => {
    const plan = createTeamRunServicePlanFromResolvedTeam({
      runId: 'run_3',
      createdAt: '2026-04-03T00:00:00.000Z',
      team: {
        teamId: 'ops',
        agentIds: ['analyst', 'missing-agent'],
        members: [
          {
            agentId: 'analyst',
            exists: true,
            agent: {
              agentId: 'analyst',
              runtimeProfileId: 'default',
              browserProfileId: 'default',
              defaultService: 'chatgpt',
              exists: true,
            },
            runtimeProfileId: 'default',
            runtimeProfile: { browserProfile: 'default', defaultService: 'chatgpt' },
            browserProfileId: 'default',
            browserProfile: {},
            defaultService: 'chatgpt',
          },
          {
            agentId: 'missing-agent',
            exists: false,
            agent: {
              agentId: 'missing-agent',
              runtimeProfileId: null,
              browserProfileId: null,
              defaultService: null,
              exists: false,
            },
            runtimeProfileId: null,
            runtimeProfile: null,
            browserProfileId: null,
            browserProfile: null,
            defaultService: null,
          },
        ],
        exists: true,
      },
    });

    expect(plan.runnableStepIds).toEqual(['run_3:step:1']);
    expect(plan.blockedStepIds).toEqual(['run_3:step:2']);
    expect(plan.stepsById['run_3:step:2']?.status).toBe('blocked');
  });
});
