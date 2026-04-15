import { describe, expect, it } from 'vitest';
import {
  createTeamRunServicePlan,
  createTeamRunServicePlanFromConfig,
  createTeamRunServicePlanFromConfigTaskRunSpec,
  createTeamRunServicePlanFromResolvedTeam,
  createTeamRunServicePlanFromResolvedTeamTaskRunSpec,
} from '../src/teams/service.js';
import { createTaskRunSpec } from '../src/teams/model.js';

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
    expect(plan.handoffs.map((handoff) => ({ from: handoff.fromStepId, to: handoff.toStepId }))).toEqual([
      { from: 'run_1:step:1', to: 'run_1:step:2' },
      { from: 'run_1:step:2', to: 'run_1:step:3' },
    ]);
    expect(plan.localActionRequests).toEqual([]);
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
    expect(plan.localActionRequestsById).toEqual({});
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
    expect(plan.localActionRequests).toEqual([]);
  });

  it('creates a service-ready plan from resolved team plus task-run-spec input', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_proposal_1',
      teamId: 'proposal-writer',
      title: 'Draft proposal package',
      objective: 'Prepare a draft proposal package for the selected opportunity.',
      createdAt: '2026-04-09T00:00:00.000Z',
      requestedOutputs: [
        {
          kind: 'structured-report',
          label: 'proposal narrative',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
    });

    const plan = createTeamRunServicePlanFromResolvedTeamTaskRunSpec({
      runId: 'run_4',
      createdAt: '2026-04-09T00:00:00.000Z',
      taskRunSpec,
      team: {
        teamId: 'proposal-writer',
        agentIds: ['orchestrator', 'writer', 'red-team'],
        members: [
          {
            agentId: 'orchestrator',
            exists: true,
            agent: {
              agentId: 'orchestrator',
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
            agentId: 'writer',
            exists: true,
            agent: {
              agentId: 'writer',
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
            agentId: 'red-team',
            exists: true,
            agent: {
              agentId: 'red-team',
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
        ],
        exists: true,
      },
    });

    expect(plan.teamRun.taskRunSpecId).toBe('task_proposal_1');
    expect(plan.runnableStepIds).toEqual(['run_4:step:1']);
    expect(plan.waitingStepIds).toEqual(['run_4:step:2', 'run_4:step:3']);
    expect(plan.steps.map((step) => step.kind)).toEqual(['analysis', 'review', 'synthesis']);
    expect(plan.handoffs.map((handoff) => ({ from: handoff.fromAgentId, to: handoff.toAgentId }))).toEqual([
      { from: 'orchestrator', to: 'writer' },
      { from: 'writer', to: 'red-team' },
    ]);
    expect(plan.stepsById['run_4:step:3']?.input.structuredData).toMatchObject({
      taskRunSpecId: 'task_proposal_1',
      taskTitle: 'Draft proposal package',
    });
  });

  it('uses team role metadata and exposes planned handoffs in config-driven task-aware planning', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_3',
      teamId: 'vibe-code',
      title: 'Continue coding loop',
      objective: 'Steer and execute the next unattended coding turn.',
      createdAt: '2026-04-09T00:00:00.000Z',
    });

    const plan = createTeamRunServicePlanFromConfigTaskRunSpec({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          orchestrator: { runtimeProfile: 'default' },
          engineer: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator', 'engineer'],
            instructions: 'Operate with deterministic structured outputs.',
            roles: {
              orchestrator: {
                agent: 'orchestrator',
                order: 1,
                instructions: 'Review progress and steer.',
                stepKind: 'analysis',
                handoffToRole: 'engineer',
              },
              engineer: {
                agent: 'engineer',
                order: 2,
                instructions: 'Execute the requested work and return status.',
                stepKind: 'synthesis',
              },
            },
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_5',
      createdAt: '2026-04-09T00:00:00.000Z',
      taskRunSpec,
    });

    expect(plan.steps.map((step) => step.agentId)).toEqual(['orchestrator', 'engineer']);
    expect(plan.steps.map((step) => step.kind)).toEqual(['analysis', 'synthesis']);
    expect(plan.handoffs).toHaveLength(1);
    expect(plan.handoffs[0]).toMatchObject({
      fromAgentId: 'orchestrator',
      toAgentId: 'engineer',
      status: 'prepared',
    });
    expect(plan.steps[0]?.input.prompt).toContain(
      'Role instructions: Review progress and steer.',
    );
  });

  it('treats task-aware agent filters and service constraints as service-plan behavior', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_5',
      teamId: 'vibe-code',
      title: 'Run a filtered team pass',
      objective: 'Keep only the allowed task-aware members and services.',
      createdAt: '2026-04-11T00:00:00.000Z',
      constraints: {
        blockedServices: ['grok'],
      },
      overrides: {
        agentIds: ['engineer', 'reviewer'],
        promptAppend: 'Stay within the bounded task scope.',
      },
    });

    const plan = createTeamRunServicePlanFromConfigTaskRunSpec({
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
          orchestrator: { runtimeProfile: 'default' },
          engineer: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'work' },
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator', 'engineer', 'reviewer'],
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_6',
      createdAt: '2026-04-11T00:00:00.000Z',
      taskRunSpec,
    });

    expect(plan.steps.map((step) => step.agentId)).toEqual(['engineer', 'reviewer']);
    expect(plan.runnableStepIds).toEqual(['run_6:step:1']);
    expect(plan.blockedStepIds).toEqual(['run_6:step:2']);
    expect(plan.waitingStepIds).toEqual([]);
    expect(plan.stepsById['run_6:step:1']?.input.prompt).toContain(
      'Task override: Stay within the bounded task scope.',
    );
    expect(plan.stepsById['run_6:step:2']?.input.notes).toEqual([
      'blocked because taskRunSpec blockedServices excludes the selected service (grok)',
    ]);
  });

  it('applies task-aware runtime-profile overrides on config-driven service plans', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_8',
      teamId: 'vibe-code',
      title: 'Select alternate runtime',
      objective: 'Use the task-selected runtime profile for the service plan.',
      createdAt: '2026-04-11T00:00:00.000Z',
      overrides: {
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
      },
    });

    const plan = createTeamRunServicePlanFromConfigTaskRunSpec({
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
          engineer: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['engineer'],
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_7',
      createdAt: '2026-04-11T00:00:00.000Z',
      taskRunSpec,
    });

    expect(plan.runnableStepIds).toEqual(['run_7:step:1']);
    expect(plan.stepsById['run_7:step:1']).toMatchObject({
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
      status: 'planned',
    });
  });
});
