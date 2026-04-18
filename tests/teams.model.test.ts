import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
  createPlannedTeamRunHandoffs,
  createTaskRunSpec,
  createTeamRunBundle,
  createTeamRunBundleFromConfigTaskRunSpec,
  createTeamRunBundleFromConfig,
  createTeamRunBundleFromResolvedTeam,
  createTeamRunBundleFromResolvedTeamTaskRunSpec,
  createTeamRunSharedState,
  createTeamRunLocalActionRequest,
  createTeamRunStep,
} from '../src/teams/model.js';

describe('team run model helpers', () => {
  it('creates a task-run-spec with conservative defaults', () => {
    const spec = createTaskRunSpec({
      id: 'task_1',
      teamId: 'vibe-code',
      title: 'Apply requested patch',
      objective: 'Review the bundle and produce the next work-product zip.',
      createdAt: '2026-04-09T00:00:00.000Z',
      requestedOutputs: [
        {
          kind: 'artifact-bundle',
          label: 'work-product',
          format: 'bundle',
          required: true,
          destination: 'artifact-store',
        },
      ],
      inputArtifacts: [
        {
          id: 'bundle_1',
          kind: 'bundle',
          title: '/tmp/work.zip',
          path: '/tmp/work.zip',
          notes: ['initial source bundle'],
          required: true,
        },
      ],
      turnPolicy: {
        maxTurns: 4,
        stopOnStatus: ['needs-human', 'succeeded'],
      },
      localActionPolicy: {
        mode: 'approval-required',
        complexityStage: 'bounded-command',
        allowedActionKinds: ['shell', 'patch'],
        allowedCommands: [],
        allowedCwdRoots: [],
      },
    });

    expect(spec).toEqual({
      id: 'task_1',
      teamId: 'vibe-code',
      title: 'Apply requested patch',
      objective: 'Review the bundle and produce the next work-product zip.',
      successCriteria: [],
      requestedOutputs: [
        {
          kind: 'artifact-bundle',
          label: 'work-product',
          format: 'bundle',
          required: true,
          schemaHint: null,
          destination: 'artifact-store',
        },
      ],
      inputArtifacts: [
        {
          id: 'bundle_1',
          kind: 'bundle',
          title: '/tmp/work.zip',
          path: '/tmp/work.zip',
          uri: null,
          mediaType: null,
          notes: ['initial source bundle'],
          required: true,
        },
      ],
      context: {},
      constraints: {
        allowedServices: null,
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
      turnPolicy: {
        ...DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
        maxTurns: 4,
        stopOnStatus: ['needs-human', 'succeeded'],
      },
      humanInteractionPolicy: DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
      localActionPolicy: {
        ...DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
        mode: 'approval-required',
        allowedActionKinds: ['shell', 'patch'],
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-09T00:00:00.000Z',
    });
  });

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

  it('creates a local action request with conservative defaults', () => {
    expect(
      createTeamRunLocalActionRequest({
        id: 'action_1',
        teamRunId: 'run_1',
        ownerStepId: 'step_1',
        kind: 'shell',
        summary: 'Run a bounded verification command.',
        createdAt: '2026-04-09T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'action_1',
      teamRunId: 'run_1',
      ownerStepId: 'step_1',
      kind: 'shell',
      summary: 'Run a bounded verification command.',
      command: null,
      args: [],
      structuredPayload: {},
      notes: [],
      status: 'requested',
      createdAt: '2026-04-09T00:00:00.000Z',
      approvedAt: null,
      completedAt: null,
      resultSummary: null,
      resultPayload: null,
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
      taskRunSpecId: null,
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
    expect(bundle.handoffs).toEqual([
      {
        id: 'run_1:handoff:step_2:1',
        teamRunId: 'run_1',
        fromStepId: 'step_1',
        toStepId: 'step_2',
        fromAgentId: 'analyst',
        toAgentId: 'reviewer',
        summary: 'Planned handoff for run_1',
        artifacts: [],
        structuredData: {
          taskRunSpecId: null,
          toRoleId: null,
        },
        notes: ['planned handoff derived from team step dependencies'],
        status: 'prepared',
        createdAt: '2026-04-03T00:00:00.000Z',
      },
    ]);
    expect(bundle.localActionRequests).toEqual([]);
    expect(bundle.sharedState.id).toBe('run_1:state');
  });

  it('creates a planned team-run bundle from resolved team runtime selections', () => {
    const bundle = createTeamRunBundleFromResolvedTeam({
      runId: 'run_2',
      createdAt: '2026-04-03T00:00:00.000Z',
      team: {
        teamId: 'ops',
        agentIds: ['analyst', 'missing-agent', 'reviewer'],
        members: [
          {
            agentId: 'analyst',
            exists: true,
            agent: {
              agentId: 'analyst',
              runtimeProfileId: 'default',
              browserProfileId: 'wsl-chrome-2',
              defaultService: 'chatgpt',
              exists: true,
            },
            runtimeProfileId: 'default',
            runtimeProfile: { browserProfile: 'wsl-chrome-2', defaultService: 'chatgpt' },
            browserProfileId: 'wsl-chrome-2',
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
          {
            agentId: 'reviewer',
            exists: true,
            agent: {
              agentId: 'reviewer',
              runtimeProfileId: 'work',
              browserProfileId: 'default',
              defaultService: 'grok',
              exists: true,
            },
            runtimeProfileId: 'work',
            runtimeProfile: { browserProfile: 'default', defaultService: 'grok' },
            browserProfileId: 'default',
            browserProfile: {},
            defaultService: 'grok',
          },
        ],
        exists: true,
      },
    });

    expect(bundle.teamRun.teamId).toBe('ops');
    expect(bundle.teamRun.initialInputs).toEqual({
      selectedTeamId: 'ops',
      teamExists: true,
    });
    expect(bundle.steps.map((step) => ({ id: step.id, status: step.status, dependsOn: step.dependsOnStepIds }))).toEqual([
      {
        id: 'run_2:step:1',
        status: 'planned',
        dependsOn: [],
      },
      {
        id: 'run_2:step:2',
        status: 'blocked',
        dependsOn: ['run_2:step:1'],
      },
      {
        id: 'run_2:step:3',
        status: 'planned',
        dependsOn: ['run_2:step:2'],
      },
    ]);
    expect(bundle.steps[1]?.input.notes).toEqual([
      'blocked because the member does not resolve to a runnable runtime profile',
    ]);
  });

  it('creates a planned team-run bundle directly from config team resolution', () => {
    const bundle = createTeamRunBundleFromConfig({
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
          ops: { agents: ['analyst', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'run_3',
      createdAt: '2026-04-03T00:00:00.000Z',
    });

    expect(bundle.teamRun.teamId).toBe('ops');
    expect(bundle.steps.map((step) => ({
      agentId: step.agentId,
      runtimeProfileId: step.runtimeProfileId,
      browserProfileId: step.browserProfileId,
      service: step.service,
      status: step.status,
    }))).toEqual([
      {
        agentId: 'analyst',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        service: 'chatgpt',
        status: 'planned',
      },
      {
        agentId: 'reviewer',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        service: 'grok',
        status: 'planned',
      },
    ]);
  });

  it('creates a planned team-run bundle from resolved team plus task-run-spec input', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_1',
      teamId: 'vibe-code',
      title: 'Apply requested patch',
      objective: 'Review the bundle and produce the next work-product zip.',
      createdAt: '2026-04-09T00:00:00.000Z',
      context: {
        repoRoot: '/repo',
        priority: 'high',
      },
      successCriteria: ['artifact zip produced', 'status reaches complete'],
      requestedOutputs: [
        {
          kind: 'artifact-bundle',
          label: 'work-product',
          format: 'bundle',
          required: true,
          destination: 'artifact-store',
        },
      ],
      inputArtifacts: [
        {
          id: 'bundle_1',
          kind: 'bundle',
          title: 'source bundle',
          path: '/tmp/work.zip',
          notes: [],
          required: true,
        },
      ],
      turnPolicy: {
        maxTurns: 4,
        stopOnStatus: ['needs-human', 'succeeded'],
      },
      localActionPolicy: {
        mode: 'approval-required',
        allowedActionKinds: ['shell', 'patch'],
        allowedCommands: [],
        allowedCwdRoots: [],
      },
    });

    const bundle = createTeamRunBundleFromResolvedTeamTaskRunSpec({
      runId: 'run_task_1',
      createdAt: '2026-04-09T00:00:00.000Z',
      team: {
        teamId: 'vibe-code',
        agentIds: ['orchestrator', 'engineer'],
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
            agentId: 'engineer',
            exists: true,
            agent: {
              agentId: 'engineer',
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
      taskRunSpec,
    });

    expect(bundle.teamRun.taskRunSpecId).toBe('task_vibe_1');
    expect(bundle.teamRun.entryPrompt).toBe('Review the bundle and produce the next work-product zip.');
    expect(bundle.teamRun.initialInputs).toEqual({
      selectedTeamId: 'vibe-code',
      teamExists: true,
      taskRunSpecTitle: 'Apply requested patch',
    });
    expect(bundle.steps.map((step) => ({ id: step.id, kind: step.kind, dependsOn: step.dependsOnStepIds }))).toEqual([
      {
        id: 'run_task_1:step:1',
        kind: 'analysis',
        dependsOn: [],
      },
      {
        id: 'run_task_1:step:2',
        kind: 'synthesis',
        dependsOn: ['run_task_1:step:1'],
      },
    ]);
    expect(bundle.steps[0]?.input.prompt).toContain('Objective: Review the bundle and produce the next work-product zip.');
    expect(bundle.steps[1]?.input.structuredData).toMatchObject({
      taskRunSpecId: 'task_vibe_1',
      taskTitle: 'Apply requested patch',
      taskContext: {
        repoRoot: '/repo',
        priority: 'high',
      },
      turnPolicy: {
        maxTurns: 4,
        stopOnStatus: ['needs-human', 'succeeded'],
      },
      localActionPolicy: {
        mode: 'approval-required',
        allowedActionKinds: ['shell', 'patch'],
        allowedCommands: [],
        allowedCwdRoots: [],
      },
    });
    expect(bundle.steps[0]?.input.artifacts).toEqual([
      {
        id: 'bundle_1',
        kind: 'bundle',
        title: 'source bundle',
        path: '/tmp/work.zip',
        uri: null,
      },
    ]);
    expect(bundle.handoffs.map((handoff) => ({ from: handoff.fromStepId, to: handoff.toStepId }))).toEqual([
      {
        from: 'run_task_1:step:1',
        to: 'run_task_1:step:2',
      },
    ]);
    expect(bundle.handoffs[0]?.structuredData).toMatchObject({
      taskRunSpecId: 'task_vibe_1',
      toRoleId: null,
      taskTransfer: {
        title: 'Apply requested patch',
        objective: 'Review the bundle and produce the next work-product zip.',
        successCriteria: ['artifact zip produced', 'status reaches complete'],
        requestedOutputs: [
          {
            label: 'work-product',
            kind: 'artifact-bundle',
            destination: 'artifact-store',
            required: true,
          },
        ],
        inputArtifacts: [
          {
            id: 'bundle_1',
            kind: 'bundle',
            title: 'source bundle',
            path: '/tmp/work.zip',
            uri: null,
          },
        ],
      },
    });
    expect(bundle.localActionRequests).toEqual([]);
  });

  it('uses optional team role metadata for task-aware planning from config', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_2',
      teamId: 'vibe-code',
      title: 'Continue unattended coding loop',
      objective: 'Review the bundle, steer work, and produce the next work-product zip.',
      createdAt: '2026-04-09T00:00:00.000Z',
      requestedOutputs: [
        {
          kind: 'artifact-bundle',
          label: 'work-product',
          format: 'bundle',
          required: true,
          destination: 'artifact-store',
        },
      ],
    });

    const bundle = createTeamRunBundleFromConfigTaskRunSpec({
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
            instructions: 'Operate as an unattended multi-turn coding team.',
            roles: {
              orchestrator: {
                agent: 'orchestrator',
                order: 1,
                instructions: 'Frame the work and steer the engineer.',
                stepKind: 'analysis',
                handoffToRole: 'engineer',
              },
              engineer: {
                agent: 'engineer',
                order: 2,
                instructions: 'Produce the work-product zip and return structured status.',
                responseShape: {
                  format: 'json',
                  artifact: 'zip',
                },
                stepKind: 'synthesis',
              },
            },
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_task_2',
      createdAt: '2026-04-09T00:00:00.000Z',
      taskRunSpec,
    });

    expect(bundle.steps.map((step) => ({ agentId: step.agentId, kind: step.kind }))).toEqual([
      { agentId: 'orchestrator', kind: 'analysis' },
      { agentId: 'engineer', kind: 'synthesis' },
    ]);
    expect(bundle.steps[0]?.input.prompt).toContain(
      'Team instructions: Operate as an unattended multi-turn coding team.',
    );
    expect(bundle.steps[0]?.input.prompt).toContain(
      'Role instructions: Frame the work and steer the engineer.',
    );
    expect(bundle.steps[1]?.input.prompt).toContain(
      'Response shape hint: {"format":"json","artifact":"zip"}',
    );
    expect(bundle.steps[1]?.input.structuredData).toMatchObject({
      roleId: 'engineer',
      responseShape: {
        format: 'json',
        artifact: 'zip',
      },
    });
  });

  it('treats handoffToRole as advisory metadata and keeps sequencing driven by explicit role order', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_topology_1',
      teamId: 'vibe-code',
      title: 'Lock current team role planning semantics',
      objective: 'Confirm role handoff metadata does not rewrite planned step order.',
      createdAt: '2026-04-18T00:00:00.000Z',
    });

    const bundle = createTeamRunBundleFromConfigTaskRunSpec({
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
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator', 'engineer', 'reviewer'],
            roles: {
              orchestrator: {
                agent: 'orchestrator',
                order: 1,
                handoffToRole: 'reviewer',
              },
              engineer: {
                agent: 'engineer',
                order: 2,
              },
              reviewer: {
                agent: 'reviewer',
                order: 3,
              },
            },
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_task_topology_1',
      createdAt: '2026-04-18T00:00:00.000Z',
      taskRunSpec,
    });

    expect(bundle.steps.map((step) => step.agentId)).toEqual(['orchestrator', 'engineer', 'reviewer']);
    expect(bundle.steps.map((step) => step.dependsOnStepIds)).toEqual([
      [],
      ['run_task_topology_1:step:1'],
      ['run_task_topology_1:step:2'],
    ]);
    expect(bundle.steps[0]?.input.structuredData).toMatchObject({
      roleId: 'orchestrator',
      handoffToRoleId: 'reviewer',
    });
  });

  it('keeps duplicate explicit role order deterministic through role-id tiebreaks', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_order_1',
      teamId: 'vibe-code',
      title: 'Lock duplicate role-order fallback',
      objective: 'Confirm duplicate explicit role order still uses role-id tiebreaks.',
      createdAt: '2026-04-18T00:00:00.000Z',
    });

    const bundle = createTeamRunBundleFromConfigTaskRunSpec({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          alphaAgent: { runtimeProfile: 'default' },
          betaAgent: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['alphaAgent', 'betaAgent'],
            roles: {
              beta: {
                agent: 'betaAgent',
                order: 1,
              },
              alpha: {
                agent: 'alphaAgent',
                order: 1,
              },
            },
          },
        },
      },
      teamId: 'vibe-code',
      runId: 'run_task_order_1',
      createdAt: '2026-04-18T00:00:00.000Z',
      taskRunSpec,
    });

    expect(bundle.steps.map((step) => step.agentId)).toEqual(['alphaAgent', 'betaAgent']);
    expect(bundle.steps.map((step) => step.input.structuredData.roleId)).toEqual(['alpha', 'beta']);
  });

  it('applies task-aware agent filters, prompt overrides, structured context, and service constraints during planning', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_4',
      teamId: 'vibe-code',
      title: 'Constrain the active coding turn',
      objective: 'Limit the plan to the requested task-aware execution posture.',
      createdAt: '2026-04-11T00:00:00.000Z',
      constraints: {
        allowedServices: ['chatgpt'],
      },
      overrides: {
        agentIds: ['engineer', 'reviewer'],
        promptAppend: 'Prefer a bounded patch plus terse justification.',
        structuredContext: {
          approvedPath: '/repo/approved',
          requestedMode: 'bounded',
        },
      },
    });

    const bundle = createTeamRunBundleFromConfigTaskRunSpec({
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
      runId: 'run_task_4',
      createdAt: '2026-04-11T00:00:00.000Z',
      taskRunSpec,
    });

    expect(bundle.steps.map((step) => step.agentId)).toEqual(['engineer', 'reviewer']);
    expect(bundle.steps[0]?.status).toBe('planned');
    expect(bundle.steps[0]?.input.prompt).toContain(
      'Task override: Prefer a bounded patch plus terse justification.',
    );
    expect(bundle.steps[0]?.input.structuredData).toMatchObject({
      taskOverrideStructuredContext: {
        approvedPath: '/repo/approved',
        requestedMode: 'bounded',
      },
    });
    expect(bundle.steps[1]?.status).toBe('blocked');
    expect(bundle.steps[1]?.input.prompt).toBeNull();
    expect(bundle.steps[1]?.input.notes).toEqual([
      'blocked because taskRunSpec allowedServices excludes the selected service (grok)',
    ]);
  });

  it('applies task-aware runtime-profile overrides on config-driven planning', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_6',
      teamId: 'vibe-code',
      title: 'Switch execution identity',
      objective: 'Use the task-selected runtime identity for this run.',
      createdAt: '2026-04-11T00:00:00.000Z',
      overrides: {
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
      },
    });

    const bundle = createTeamRunBundleFromConfigTaskRunSpec({
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
      runId: 'run_task_6',
      createdAt: '2026-04-11T00:00:00.000Z',
      taskRunSpec,
    });

    expect(bundle.steps).toHaveLength(1);
    expect(bundle.steps[0]).toMatchObject({
      agentId: 'engineer',
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
      status: 'planned',
    });
  });

  it('blocks resolved-team planning when runtime/browser overrides do not match the resolved selection', () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'task_vibe_7',
      teamId: 'vibe-code',
      title: 'Require a different execution identity',
      objective: 'Refuse to plan if the already-resolved selection is incompatible.',
      createdAt: '2026-04-11T00:00:00.000Z',
      overrides: {
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
      },
    });

    const bundle = createTeamRunBundleFromResolvedTeamTaskRunSpec({
      runId: 'run_task_7',
      createdAt: '2026-04-11T00:00:00.000Z',
      team: {
        teamId: 'vibe-code',
        agentIds: ['engineer'],
        members: [
          {
            agentId: 'engineer',
            exists: true,
            agent: {
              agentId: 'engineer',
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
      taskRunSpec,
    });

    expect(bundle.steps[0]).toMatchObject({
      agentId: 'engineer',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      service: 'chatgpt',
      status: 'blocked',
    });
    expect(bundle.steps[0]?.input.notes).toEqual([
      'blocked because resolved team selection does not match taskRunSpec runtimeProfileId (work)',
    ]);
  });

  it('creates planned handoff entities from team step dependencies', () => {
    const bundle = createTeamRunBundle({
      runId: 'run_handoff_1',
      teamId: 'proposal-writer',
      createdAt: '2026-04-09T00:00:00.000Z',
      steps: [
        {
          id: 'run_handoff_1:step:1',
          agentId: 'orchestrator',
          order: 1,
          input: { structuredData: { roleId: 'orchestrator' } },
        },
        {
          id: 'run_handoff_1:step:2',
          agentId: 'writer',
          order: 2,
          dependsOnStepIds: ['run_handoff_1:step:1'],
          input: { structuredData: { roleId: 'writer', handoffToRoleId: 'writer' } },
        },
      ],
    });

    const handoffs = createPlannedTeamRunHandoffs({
      teamRun: bundle.teamRun,
      steps: bundle.steps,
    });

    expect(handoffs).toEqual([
      {
        id: 'run_handoff_1:handoff:run_handoff_1:step:2:1',
        teamRunId: 'run_handoff_1',
        fromStepId: 'run_handoff_1:step:1',
        toStepId: 'run_handoff_1:step:2',
        fromAgentId: 'orchestrator',
        toAgentId: 'writer',
        summary: 'Planned handoff for run_handoff_1 -> writer',
        artifacts: [],
        structuredData: {
          taskRunSpecId: null,
          toRoleId: 'writer',
        },
        notes: ['planned handoff derived from team step dependencies'],
        status: 'prepared',
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    ]);
  });
});
