import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionServiceHost } from '../src/runtime/serviceHost.js';
import { createTaskRunSpec } from '../src/teams/model.js';
import { createTeamRuntimeBridge } from '../src/teams/runtimeBridge.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

describe('team runtime bridge', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('executes a resolved team through the current runtime substrate sequentially', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:00:00.000Z',
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_success',
      createdAt: '2026-04-09T12:00:00.000Z',
      trigger: 'service',
      entryPrompt: 'Investigate then review.',
    });

    expect(result.teamPlan.teamRun.teamId).toBe('ops');
    expect(result.createdRuntimeRecord.bundle.run.sourceKind).toBe('team-run');
    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([
      ['team_bridge_success', 'team_bridge_success'],
    ]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_success',
      taskRunSpecId: null,
      runtimeRunId: 'team_bridge_success',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'succeeded',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_success:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'succeeded',
          runtimeStepId: 'team_bridge_success:step:1',
          runtimeStepStatus: 'succeeded',
          runtimeStepFailure: null,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
        },
        {
          teamStepId: 'team_bridge_success:step:2',
          teamStepOrder: 2,
          teamStepStatus: 'succeeded',
          runtimeStepId: 'team_bridge_success:step:2',
          runtimeStepStatus: 'succeeded',
          runtimeStepFailure: null,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('succeeded');
  });

  it('can create a team runtime without draining it', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let executedStepCount = 0;
    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:02:00.000Z',
      drainAfterCreate: false,
      executeStoredRunStep: async () => {
        executedStepCount += 1;
        return {
          output: {
            summary: 'should not execute inline',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_no_drain',
      createdAt: '2026-04-09T12:02:00.000Z',
      trigger: 'service',
      entryPrompt: 'Create only.',
    });

    expect(executedStepCount).toBe(0);
    expect(result.hostDrainResults).toEqual([]);
    expect(result.createdRuntimeRecord.bundle.run.status).toBe('planned');
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('planned');
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_no_drain',
      runtimeRunId: 'team_bridge_no_drain',
      runtimeRunStatus: 'planned',
      terminalStepCount: 0,
      stepSummaries: [
        {
          teamStepId: 'team_bridge_no_drain:step:1',
          runtimeStepStatus: 'planned',
          teamStepStatus: 'planned',
        },
      ],
    });
  });

  it('preserves fail-fast behavior when the first projected team step fails', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:05:00.000Z',
      executeStoredRunStep: async () => {
        throw new Error('team step exploded');
      },
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_failure',
      createdAt: '2026-04-09T12:05:00.000Z',
      trigger: 'service',
    });

    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([['team_bridge_failure']]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_failure',
      taskRunSpecId: null,
      runtimeRunId: 'team_bridge_failure',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'failed',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_failure:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'failed',
          runtimeStepId: 'team_bridge_failure:step:1',
          runtimeStepStatus: 'failed',
          runtimeStepFailure: 'team step exploded',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
        },
        {
          teamStepId: 'team_bridge_failure:step:2',
          teamStepOrder: 2,
          teamStepStatus: 'planned',
          runtimeStepId: 'team_bridge_failure:step:2',
          runtimeStepStatus: 'planned',
          runtimeStepFailure: null,
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('planned');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.failure?.message).toBe('team step exploded');
  });

  it('keeps blocked unresolved team members from producing runnable runtime work', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:10:00.000Z',
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['missing-agent'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_blocked',
      createdAt: '2026-04-09T12:10:00.000Z',
      trigger: 'service',
    });

    expect(result.teamPlan.blockedStepIds).toEqual(['team_bridge_blocked:step:1']);
    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([[]]);
    expect(result.hostDrainResults[0]?.drained).toEqual([
      expect.objectContaining({
        runId: 'team_bridge_blocked',
        result: 'skipped',
        reason: 'no-runnable-step',
      }),
    ]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_blocked',
      taskRunSpecId: null,
      runtimeRunId: 'team_bridge_blocked',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'planned',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_blocked:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'blocked',
          runtimeStepId: 'team_bridge_blocked:step:1',
          runtimeStepStatus: 'blocked',
          runtimeStepFailure: null,
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('blocked');
  });

  it('applies config-owned host local-action policy during config-driven team execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-10T07:00:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request one disallowed local shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run one local shell command.',
                command: process.execPath,
                args: ['-e', 'process.stdout.write("bridge-ok")'],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
            ],
          },
          notes: [],
        },
      }),
    });

    const result = await bridge.executeFromConfig({
      config: {
        runtime: {
          localActions: {
            shell: {
              complexityStage: 'bounded-command',
              allowedCommands: ['pnpm'],
              allowedCwdRoots: [process.cwd()],
            },
          },
        },
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          engineer: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_local_action_policy',
      createdAt: '2026-04-10T07:00:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.localActionRequests).toHaveLength(1);
    expect(result.finalRuntimeRecord.bundle.localActionRequests[0]).toMatchObject({
      kind: 'shell',
      status: 'rejected',
      resultSummary: `shell local action command is not allowed: ${process.execPath}`,
    });
    expect(result.finalRuntimeRecord.bundle.sharedState.notes).toContain(
      'local action outcomes for team_bridge_local_action_policy:step:1: rejected=1',
    );
    expect(result.finalRuntimeRecord.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.localActionOutcomes.team_bridge_local_action_policy:step:1',
      value: {
        ownerStepId: 'team_bridge_local_action_policy:step:1',
        generatedAt: '2026-04-10T07:00:00.000Z',
        total: 1,
        counts: {
          requested: 0,
          approved: 0,
          rejected: 1,
          executed: 0,
          failed: 0,
          cancelled: 0,
        },
        items: [
          {
            requestId: 'team_bridge_local_action_policy:action:team_bridge_local_action_policy:step:1:1',
            kind: 'shell',
            status: 'rejected',
            summary: 'Run one local shell command.',
            command: process.execPath,
            args: ['-e', 'process.stdout.write("bridge-ok")'],
            resultSummary: `shell local action command is not allowed: ${process.execPath}`,
          },
        ],
      },
    });
  });

  it('carries taskRunSpecId through the team runtime bridge execution summary', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_1',
      teamId: 'vibe-code',
      title: 'Bridge the task-aware team run',
      objective: 'Drive the task-aware plan through the current runtime bridge.',
      createdAt: '2026-04-11T20:00:00.000Z',
      requestedOutputs: [
        {
          kind: 'structured-report',
          label: 'bridge status',
          format: 'json',
          required: true,
          destination: 'response-body',
        },
      ],
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T20:00:00.000Z',
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec',
      createdAt: '2026-04-11T20:00:00.000Z',
      trigger: 'service',
    });

    expect(result.persistedTaskRunSpecRecord).toMatchObject({
      taskRunSpecId: 'task_bridge_1',
      revision: 1,
      spec: {
        id: 'task_bridge_1',
        teamId: 'vibe-code',
        title: 'Bridge the task-aware team run',
      },
    });
    const persistedSpecRaw = JSON.parse(
      await fs.readFile(path.join(homeDir, 'teams', 'task-run-specs', 'task_bridge_1', 'spec.json'), 'utf8'),
    ) as { id: string; objective: string };
    expect(persistedSpecRaw).toMatchObject({
      id: 'task_bridge_1',
      objective: 'Drive the task-aware plan through the current runtime bridge.',
    });
    expect(result.teamPlan.teamRun.taskRunSpecId).toBe('task_bridge_1');
    expect(result.createdRuntimeRecord.bundle.run.taskRunSpecId).toBe('task_bridge_1');
    expect(result.finalRuntimeRecord.bundle.run.taskRunSpecId).toBe('task_bridge_1');
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_taskrunspec',
      taskRunSpecId: 'task_bridge_1',
      runtimeRunId: 'team_bridge_taskrunspec',
      runtimeSourceKind: 'team-run',
    });
    expect(result.teamPlan.handoffs[0]?.structuredData).toMatchObject({
      taskRunSpecId: 'task_bridge_1',
      toRoleId: null,
      taskTransfer: {
        title: 'Bridge the task-aware team run',
        objective: 'Drive the task-aware plan through the current runtime bridge.',
        successCriteria: [],
        requestedOutputs: [
          {
            label: 'bridge status',
            kind: 'structured-report',
            destination: 'response-body',
            required: true,
          },
        ],
        inputArtifacts: [],
      },
    });
    expect(result.createdRuntimeRecord.bundle.handoffs[0]?.structuredData).toMatchObject({
      taskRunSpecId: 'task_bridge_1',
      toRoleId: null,
      taskTransfer: {
        title: 'Bridge the task-aware team run',
        objective: 'Drive the task-aware plan through the current runtime bridge.',
      },
    });
    expect(result.finalRuntimeRecord.bundle.handoffs[0]?.structuredData).toMatchObject({
      taskRunSpecId: 'task_bridge_1',
      toRoleId: null,
      taskTransfer: {
        title: 'Bridge the task-aware team run',
        objective: 'Drive the task-aware plan through the current runtime bridge.',
      },
    });
  });

  it('reports task-selected runtime execution identities in the bridge execution summary', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_2',
      teamId: 'vibe-code',
      title: 'Bridge task-selected runtime identity',
      objective: 'Run the bridge with the task-selected runtime profile.',
      createdAt: '2026-04-11T21:00:00.000Z',
      overrides: {
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T21:00:00.000Z',
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_override',
      createdAt: '2026-04-11T21:00:00.000Z',
      trigger: 'service',
    });

    expect(result.teamPlan.steps[0]).toMatchObject({
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
    });
    expect(result.createdRuntimeRecord.bundle.steps[0]).toMatchObject({
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
    });
    expect(result.finalRuntimeRecord.bundle.steps[0]).toMatchObject({
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
    });
    expect(result.executionSummary.stepSummaries[0]).toMatchObject({
      teamStepId: 'team_bridge_taskrunspec_override:step:1',
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      service: 'grok',
    });
  });

  it('injects dependency task-transfer context into later bridge step execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepSharedStateContext: unknown = null;
    let secondStepPrompt: string | null = null;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_transfer_1',
      teamId: 'vibe-code',
      title: 'Drive dependency task transfer through the bridge',
      objective: 'Ensure later steps receive bounded task transfer context from incoming handoffs.',
      createdAt: '2026-04-11T21:30:00.000Z',
      successCriteria: ['transfer reaches later step'],
      requestedOutputs: [
        {
          kind: 'structured-report',
          label: 'bridge handoff summary',
          format: 'json',
          required: true,
          destination: 'handoff',
        },
      ],
      inputArtifacts: [
        {
          id: 'artifact-spec',
          kind: 'file',
          path: '/repo/spec.md',
          title: 'Spec',
          notes: [],
          required: true,
        },
      ],
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T21:30:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 2) {
          secondStepSharedStateContext = step.input.structuredData.sharedStateContext;
          secondStepPrompt = step.input.prompt ?? null;
        }
        return {
          output: {
            summary: `completed ${step.id}`,
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_tasktransfer',
      createdAt: '2026-04-11T21:30:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(secondStepPrompt).toContain('Dependency task transfers:');
    expect(secondStepPrompt).toContain(
      '- team_bridge_tasktransfer:step:1 (orchestrator): Drive dependency task transfer through the bridge',
    );
    expect(secondStepPrompt).toContain(
      'objective: Ensure later steps receive bounded task transfer context from incoming handoffs.',
    );
    expect(secondStepSharedStateContext).toMatchObject({
      dependencyTaskTransfers: [
        {
          handoffId: 'team_bridge_tasktransfer:handoff:team_bridge_tasktransfer:step:2:1',
          fromStepId: 'team_bridge_tasktransfer:step:1',
          fromAgentId: 'orchestrator',
          summary: 'Planned handoff for team_bridge_tasktransfer',
          taskTransfer: {
            title: 'Drive dependency task transfer through the bridge',
            objective: 'Ensure later steps receive bounded task transfer context from incoming handoffs.',
            successCriteria: ['transfer reaches later step'],
            requestedOutputs: [
              {
                label: 'bridge handoff summary',
                kind: 'structured-report',
                destination: 'handoff',
                required: true,
              },
            ],
            inputArtifacts: [
              {
                id: 'artifact-spec',
                kind: 'file',
                title: 'Spec',
                path: '/repo/spec.md',
                uri: null,
              },
            ],
          },
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.consumedTaskTransfers.team_bridge_tasktransfer:step:2',
      value: {
        ownerStepId: 'team_bridge_tasktransfer:step:2',
        generatedAt: '2026-04-11T21:30:00.000Z',
        total: 1,
        items: [
          {
            handoffId: 'team_bridge_tasktransfer:handoff:team_bridge_tasktransfer:step:2:1',
            fromStepId: 'team_bridge_tasktransfer:step:1',
            fromAgentId: 'orchestrator',
            title: 'Drive dependency task transfer through the bridge',
            objective: 'Ensure later steps receive bounded task transfer context from incoming handoffs.',
            requestedOutputCount: 1,
            inputArtifactCount: 1,
          },
        ],
      },
    });
    expect(result.finalRuntimeRecord.bundle.sharedState.notes).toContain(
      'consumed task transfers for team_bridge_tasktransfer:step:2: total=1',
    );
    expect(result.finalRuntimeRecord.bundle.handoffs[0]).toMatchObject({
      id: 'team_bridge_tasktransfer:handoff:team_bridge_tasktransfer:step:2:1',
      status: 'consumed',
      notes: [
        'planned handoff derived from team step dependencies',
        'handoff consumed by team_bridge_tasktransfer:step:2',
      ],
    });
    expect(result.finalRuntimeRecord.bundle.sharedState.history).toContainEqual({
      id: 'team_bridge_tasktransfer:event:team_bridge_tasktransfer:handoff:team_bridge_tasktransfer:step:2:1:consumed:2026-04-11T21:30:00.000Z',
      runId: 'team_bridge_tasktransfer',
      stepId: 'team_bridge_tasktransfer:step:2',
      type: 'handoff-consumed',
      createdAt: '2026-04-11T21:30:00.000Z',
      leaseId: null,
      note: 'handoff consumed from team_bridge_tasktransfer:step:1 by team_bridge_tasktransfer:step:2',
      payload: {
        handoffId: 'team_bridge_tasktransfer:handoff:team_bridge_tasktransfer:step:2:1',
        fromStepId: 'team_bridge_tasktransfer:step:1',
        fromAgentId: 'orchestrator',
      },
    });
  });

  it('fails the bridge before executing a step beyond task turnPolicy.maxTurns', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepExecuted = false;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_3',
      teamId: 'vibe-code',
      title: 'Respect the task turn budget',
      objective: 'Stop before executing beyond the bounded task turn limit.',
      createdAt: '2026-04-11T22:00:00.000Z',
      turnPolicy: {
        maxTurns: 1,
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:00:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 2) {
          secondStepExecuted = true;
        }
        return {
          output: {
            summary: `completed ${step.id}`,
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_turn_limit',
      createdAt: '2026-04-11T22:00:00.000Z',
      trigger: 'service',
    });

    expect(secondStepExecuted).toBe(false);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_turn_limit_exceeded',
      message: 'step order 2 exceeds task turn limit 1',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
    expect(result.executionSummary.stepSummaries[1]).toMatchObject({
      teamStepId: 'team_bridge_taskrunspec_turn_limit:step:2',
      runtimeStepStatus: 'failed',
      runtimeStepFailure: 'step order 2 exceeds task turn limit 1',
    });
  });

  it('fails stored bridge runtime state when required requested outputs are missing', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_required_outputs_missing',
      teamId: 'vibe-code',
      title: 'Require an artifact bundle',
      objective: 'Fail if the requested artifact bundle is not actually produced.',
      createdAt: '2026-04-11T23:30:00.000Z',
      requestedOutputs: [
        {
          kind: 'artifact-bundle',
          label: 'work bundle',
          format: 'bundle',
          required: true,
          destination: 'artifact-store',
        },
      ],
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T23:30:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'Here is a summary only.',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_required_outputs_missing',
      createdAt: '2026-04-11T23:30:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.failure).toMatchObject({
      code: 'requested_output_required_missing',
      message: 'missing required requested outputs: work bundle',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
  });

  it('fails the bridge before execution when elapsed runtime exceeds task maxRuntimeMinutes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let executedAnyStep = false;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_4',
      teamId: 'vibe-code',
      title: 'Respect task runtime budget',
      objective: 'Stop before running if the task runtime budget is already exceeded.',
      createdAt: '2026-04-11T22:30:00.000Z',
      constraints: {
        maxRuntimeMinutes: 5,
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:36:00.000Z',
      executeStoredRunStep: async () => {
        executedAnyStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_runtime_limit',
      createdAt: '2026-04-11T22:30:00.000Z',
      trigger: 'service',
    });

    expect(executedAnyStep).toBe(false);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.failure).toMatchObject({
      code: 'task_runtime_limit_exceeded',
      message: 'elapsed runtime 6 minutes exceeds task runtime limit 5',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
    expect(result.executionSummary.stepSummaries[0]).toMatchObject({
      teamStepId: 'team_bridge_taskrunspec_runtime_limit:step:1',
      runtimeStepStatus: 'failed',
      runtimeStepFailure: 'elapsed runtime 6 minutes exceeds task runtime limit 5',
    });
  });

  it('fails the bridge before executing a step beyond task providerBudget.maxRequests', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let executedAnyStep = false;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_4b',
      teamId: 'vibe-code',
      title: 'Respect task provider request budget',
      objective: 'Stop before running if the next step would exceed the task request budget.',
      createdAt: '2026-04-11T22:40:00.000Z',
      constraints: {
        providerBudget: {
          maxRequests: 1,
        },
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:40:00.000Z',
      executeStoredRunStep: async () => {
        executedAnyStep = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator', 'reviewer'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_provider_request_limit',
      createdAt: '2026-04-11T22:40:00.000Z',
      trigger: 'service',
    });

    expect(executedAnyStep).toBe(true);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_provider_request_limit_exceeded',
      message: 'step order 2 exceeds task provider request limit 1',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
    expect(result.executionSummary.stepSummaries[1]).toMatchObject({
      teamStepId: 'team_bridge_taskrunspec_provider_request_limit:step:2',
      runtimeStepStatus: 'failed',
      runtimeStepFailure: 'step order 2 exceeds task provider request limit 1',
    });
  });

  it('fails the bridge before executing a step when stored provider usage exceeds task providerBudget.maxTokens', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let executedCount = 0;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_4c',
      teamId: 'vibe-code',
      title: 'Respect task provider token budget',
      objective: 'Stop before running if stored provider usage already exceeds the task token budget.',
      createdAt: '2026-04-11T22:41:00.000Z',
      constraints: {
        providerBudget: {
          maxTokens: 100,
        },
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:41:00.000Z',
      executeStoredRunStep: async () => {
        executedCount += 1;
        if (executedCount === 1) {
          return {
            usage: {
              inputTokens: 80,
              outputTokens: 30,
              reasoningTokens: 10,
              totalTokens: 120,
            },
            output: {
              summary: 'first step consumed the budget',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          };
        }
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator', 'reviewer'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_provider_token_limit',
      createdAt: '2026-04-11T22:41:00.000Z',
      trigger: 'service',
    });

    expect(executedCount).toBe(1);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.failure).toMatchObject({
      code: 'task_provider_token_limit_exceeded',
      message: 'stored provider token usage 120 exceeds task provider token limit 100',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
    expect(result.executionSummary.stepSummaries[1]).toMatchObject({
      teamStepId: 'team_bridge_taskrunspec_provider_token_limit:step:2',
      runtimeStepStatus: 'failed',
      runtimeStepFailure: 'stored provider token usage 120 exceeds task provider token limit 100',
    });
  });

  it('injects task structured context into bridge step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let observedSharedStateContext: unknown = null;
    let observedPrompt: string | null = null;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_5',
      teamId: 'vibe-code',
      title: 'Pass task structured context into runtime execution',
      objective: 'Ensure task structured context reaches the bridge runtime callback.',
      createdAt: '2026-04-11T22:45:00.000Z',
      overrides: {
        structuredContext: {
          approvedPath: '/repo/approved',
          requestedMode: 'bounded',
        },
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:45:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        observedSharedStateContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consumed task structured context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_structured_context',
      createdAt: '2026-04-11T22:45:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task structured context:');
    expect(observedSharedStateContext).toMatchObject({
      taskStructuredContext: {
        approvedPath: '/repo/approved',
        requestedMode: 'bounded',
      },
      taskStructuredContextPromptContext:
        'Task structured context:\n- {"approvedPath":"/repo/approved","requestedMode":"bounded"}',
    });
  });

  it('injects task context into bridge step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let observedSharedStateContext: unknown = null;
    let observedPrompt: string | null = null;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_6',
      teamId: 'vibe-code',
      title: 'Pass task context into runtime execution',
      objective: 'Ensure task context reaches the bridge runtime callback.',
      createdAt: '2026-04-11T22:46:00.000Z',
      context: {
        repoRoot: '/repo',
        ticketId: 'AURA-101',
      },
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:46:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        observedSharedStateContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consumed task context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_context',
      createdAt: '2026-04-11T22:46:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task context:');
    expect(observedSharedStateContext).toMatchObject({
      taskContext: {
        repoRoot: '/repo',
        ticketId: 'AURA-101',
      },
      taskContextPromptContext: 'Task context:\n- {"repoRoot":"/repo","ticketId":"AURA-101"}',
    });
  });

  it('injects task input artifacts into bridge step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let observedSharedStateContext: unknown = null;
    let observedPrompt: string | null = null;
    const taskRunSpec = createTaskRunSpec({
      id: 'task_bridge_6a',
      teamId: 'vibe-code',
      title: 'Pass task input artifacts into runtime execution',
      objective: 'Ensure task input artifacts reach the bridge runtime callback.',
      createdAt: '2026-04-11T22:46:30.000Z',
      inputArtifacts: [
        {
          id: 'artifact-readme',
          kind: 'file',
          path: '/repo/README.md',
          title: 'README',
          notes: [],
          required: true,
        },
        {
          id: 'artifact-spec',
          kind: 'url',
          uri: 'https://example.test/spec',
          title: 'Spec',
          notes: [],
          required: false,
        },
      ],
    });

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T22:46:30.000Z',
      executeStoredRunStep: async ({ step }) => {
        observedSharedStateContext = step.input.structuredData.sharedStateContext;
        observedPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consumed task input artifacts',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfigTaskRunSpec({
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
        },
        teams: {
          'vibe-code': {
            agents: ['orchestrator'],
          },
        },
      },
      teamId: 'vibe-code',
      taskRunSpec,
      runId: 'team_bridge_taskrunspec_input_artifacts',
      createdAt: '2026-04-11T22:46:30.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(observedPrompt).toContain('Task input artifacts:');
    expect(observedPrompt).toContain('- file:README');
    expect(observedPrompt).toContain('- url:Spec');
    expect(observedSharedStateContext).toMatchObject({
      taskInputArtifacts: [
        {
          id: 'artifact-readme',
          kind: 'file',
          path: '/repo/README.md',
          title: 'README',
        },
        {
          id: 'artifact-spec',
          kind: 'url',
          uri: 'https://example.test/spec',
          title: 'Spec',
        },
      ],
      taskInputArtifactsPromptContext: 'Task input artifacts:\n- file:README\n- url:Spec',
    });
  });

  it('persists provider usage through the team-runtime bridge when execution reports usage', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-11T23:40:00.000Z',
      executeStoredRunStep: async () => ({
        usage: {
          inputTokens: 110,
          outputTokens: 40,
          reasoningTokens: 0,
          totalTokens: 150,
        },
        output: {
          summary: 'usage recorded',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_provider_usage',
      createdAt: '2026-04-11T23:40:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'step.providerUsage.team_bridge_provider_usage:step:1',
      value: {
        ownerStepId: 'team_bridge_provider_usage:step:1',
        generatedAt: '2026-04-11T23:40:00.000Z',
        inputTokens: 110,
        outputTokens: 40,
        reasoningTokens: 0,
        totalTokens: 150,
      },
    });
  });

  it('injects dependency-scoped local action outcome summaries into later team step execution context', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepSharedStateContext: unknown = null;
    let secondStepPrompt: string | null = null;
    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-10T08:10:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'request one local shell action',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Run one local shell command.',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                  },
                ],
              },
              notes: [],
            },
          };
        }

        secondStepSharedStateContext = step.input.structuredData.sharedStateContext;
        secondStepPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consume upstream local action outcome context',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
      executeLocalActionRequest: async () => ({
        status: 'executed',
        summary: 'executed shell',
        payload: { exitCode: 0 },
      }),
    });

    const result = await bridge.executeFromConfig({
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
          ops: { agents: ['orchestrator', 'engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_local_action_context',
      createdAt: '2026-04-10T08:10:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.handoffs).toContainEqual({
      id: 'team_bridge_local_action_context:handoff:team_bridge_local_action_context:step:2:1',
      teamRunId: 'team_bridge_local_action_context',
      fromStepId: 'team_bridge_local_action_context:step:1',
      toStepId: 'team_bridge_local_action_context:step:2',
      fromAgentId: 'orchestrator',
      toAgentId: 'engineer',
      summary: 'Planned handoff for team_bridge_local_action_context',
      artifacts: [],
      structuredData: {
        taskRunSpecId: null,
        toRoleId: null,
        localActionOutcomeSummaryKey: 'step.localActionOutcomes.team_bridge_local_action_context:step:1',
        localActionOutcomeContext: {
          ownerStepId: 'team_bridge_local_action_context:step:1',
          generatedAt: '2026-04-10T08:10:00.000Z',
          total: 1,
          counts: {
            requested: 0,
            approved: 0,
            rejected: 0,
            executed: 1,
            failed: 0,
            cancelled: 0,
          },
          items: [
            {
              requestId:
                'team_bridge_local_action_context:action:team_bridge_local_action_context:step:1:1',
              kind: 'shell',
              status: 'executed',
              summary: 'Run one local shell command.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: 'executed shell',
            },
          ],
        },
        localActionDecisionGuidance: {
          action: 'continue',
          rationale: 'dependency host actions completed successfully',
          counts: {
            requested: 0,
            approved: 0,
            rejected: 0,
            executed: 1,
            failed: 0,
            cancelled: 0,
          },
        },
      },
      notes: [
        'planned handoff derived from team step dependencies',
        'handoff payload updated with dependency-scoped local action outcome context',
      ],
      status: 'prepared',
      createdAt: '2026-04-10T08:10:00.000Z',
    });
    expect(secondStepPrompt).toContain('Dependency local action outcomes:');
    expect(secondStepPrompt).toContain(
      'Dependency local action decision guidance: CONTINUE - dependency host actions completed successfully',
    );
    expect(secondStepPrompt).toContain(
      'team_bridge_local_action_context:step:1: executed=1; latest=executed shell',
    );
    expect(secondStepSharedStateContext).toMatchObject({
      dependencyStepIds: ['team_bridge_local_action_context:step:1'],
      dependencyLocalActionOutcomes: [
        {
          key: 'step.localActionOutcomes.team_bridge_local_action_context:step:1',
          value: {
            ownerStepId: 'team_bridge_local_action_context:step:1',
            generatedAt: '2026-04-10T08:10:00.000Z',
            total: 1,
            counts: {
              requested: 0,
              approved: 0,
              rejected: 0,
              executed: 1,
              failed: 0,
              cancelled: 0,
            },
            items: [
              {
                requestId:
                  'team_bridge_local_action_context:action:team_bridge_local_action_context:step:1:1',
                kind: 'shell',
                status: 'executed',
                summary: 'Run one local shell command.',
                command: 'pnpm',
                args: ['vitest', 'run'],
                resultSummary: 'executed shell',
              },
            ],
          },
        },
      ],
      dependencyLocalActionDecisionGuidance: {
        action: 'continue',
        rationale: 'dependency host actions completed successfully',
        counts: {
          requested: 0,
          approved: 0,
          rejected: 0,
          executed: 1,
          failed: 0,
          cancelled: 0,
        },
      },
      dependencyLocalActionOutcomePromptContext:
        'Dependency local action outcomes:\n- team_bridge_local_action_context:step:1: executed=1; latest=executed shell',
      dependencyLocalActionDecisionPromptContext:
        'Dependency local action decision guidance: CONTINUE - dependency host actions completed successfully',
      upstreamLocalActionOutcomes: [
        {
          key: 'step.localActionOutcomes.team_bridge_local_action_context:step:1',
          value: {
            ownerStepId: 'team_bridge_local_action_context:step:1',
            generatedAt: '2026-04-10T08:10:00.000Z',
            total: 1,
            counts: {
              requested: 0,
              approved: 0,
              rejected: 0,
              executed: 1,
              failed: 0,
              cancelled: 0,
            },
            items: [
              {
                requestId:
                  'team_bridge_local_action_context:action:team_bridge_local_action_context:step:1:1',
                kind: 'shell',
                status: 'executed',
                summary: 'Run one local shell command.',
                command: 'pnpm',
                args: ['vitest', 'run'],
                resultSummary: 'executed shell',
              },
            ],
          },
        },
      ],
      humanEscalationResume: null,
      humanEscalationResumePromptContext: null,
    });
  });

  it('injects typed steer contract into later team step execution context when host actions are approved but not executed', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepSharedStateContext: unknown = null;
    let secondStepPrompt: string | null = null;
    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-10T08:15:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'queue one local shell action for later execution',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Queue one local shell command.',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                  },
                ],
              },
              notes: [],
            },
          };
        }

        secondStepSharedStateContext = step.input.structuredData.sharedStateContext;
        secondStepPrompt = step.input.prompt ?? null;
        return {
          output: {
            summary: 'consume upstream steer contract',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
      executeLocalActionRequest: async () => ({
        status: 'approved',
        summary: 'approved shell for later execution',
        payload: { queued: true },
      }),
    });

    const result = await bridge.executeFromConfig({
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
          ops: { agents: ['orchestrator', 'engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_local_action_steer',
      createdAt: '2026-04-10T08:15:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(secondStepPrompt).toContain(
      'Dependency local action decision guidance: STEER - dependency host actions are approved but not yet executed',
    );
    expect(secondStepPrompt).toContain('Dependency local action steer contract:');
    expect(secondStepPrompt).toContain('continue-with-caution');
    expect(secondStepSharedStateContext).toMatchObject({
      dependencyLocalActionDecisionGuidance: {
        action: 'steer',
        rationale: 'dependency host actions are approved but not yet executed',
        counts: {
          requested: 0,
          approved: 1,
          rejected: 0,
          executed: 0,
          failed: 0,
          cancelled: 0,
        },
        contract: {
          kind: 'host-action-steer',
          recommendedAction: 'continue-with-caution',
          promptAppend:
            'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
          structuredContext: {
            pendingHostActions: 1,
            approvedCount: 1,
            requestedCount: 0,
            cancelledCount: 0,
          },
        },
      },
      dependencyLocalActionSteerContract: {
        kind: 'host-action-steer',
        recommendedAction: 'continue-with-caution',
        promptAppend:
          'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
        structuredContext: {
          pendingHostActions: 1,
          approvedCount: 1,
          requestedCount: 0,
          cancelledCount: 0,
        },
      },
    });
    expect(result.finalRuntimeRecord.bundle.handoffs).toContainEqual({
      id: 'team_bridge_local_action_steer:handoff:team_bridge_local_action_steer:step:2:1',
      teamRunId: 'team_bridge_local_action_steer',
      fromStepId: 'team_bridge_local_action_steer:step:1',
      toStepId: 'team_bridge_local_action_steer:step:2',
      fromAgentId: 'orchestrator',
      toAgentId: 'engineer',
      summary: 'Planned handoff for team_bridge_local_action_steer',
      artifacts: [],
      structuredData: {
        taskRunSpecId: null,
        toRoleId: null,
        localActionOutcomeSummaryKey: 'step.localActionOutcomes.team_bridge_local_action_steer:step:1',
        localActionOutcomeContext: {
          ownerStepId: 'team_bridge_local_action_steer:step:1',
          generatedAt: '2026-04-10T08:15:00.000Z',
          total: 1,
          counts: {
            requested: 0,
            approved: 1,
            rejected: 0,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
          items: [
            {
              requestId: 'team_bridge_local_action_steer:action:team_bridge_local_action_steer:step:1:1',
              kind: 'shell',
              status: 'approved',
              summary: 'Queue one local shell command.',
              command: 'pnpm',
              args: ['vitest', 'run'],
              resultSummary: 'approved shell for later execution',
            },
          ],
        },
        localActionDecisionGuidance: {
          action: 'steer',
          rationale: 'dependency host actions are approved but not yet executed',
          counts: {
            requested: 0,
            approved: 1,
            rejected: 0,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
          contract: {
            kind: 'host-action-steer',
            recommendedAction: 'continue-with-caution',
            promptAppend:
              'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
            structuredContext: {
              pendingHostActions: 1,
              approvedCount: 1,
              requestedCount: 0,
              cancelledCount: 0,
            },
          },
        },
      },
      notes: [
        'planned handoff derived from team step dependencies',
        'handoff payload updated with dependency-scoped local action outcome context',
      ],
      status: 'prepared',
      createdAt: '2026-04-10T08:15:00.000Z',
    });
  });

  it('pauses for human escalation on the team-runtime bridge when dependency guidance escalates', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepExecuted = false;
    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-10T08:20:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'request one forbidden local shell action',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Attempt a forbidden shell action.',
                  },
                ],
              },
              notes: [],
            },
          };
        }

        secondStepExecuted = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfig({
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
          ops: { agents: ['orchestrator', 'engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_human_pause',
      createdAt: '2026-04-10T08:20:00.000Z',
      trigger: 'service',
    });

    expect(secondStepExecuted).toBe(false);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('cancelled');
    expect(result.finalRuntimeRecord.bundle.sharedState.status).toBe('cancelled');
    expect(result.finalRuntimeRecord.bundle.steps[1]).toMatchObject({
      status: 'cancelled',
      output: {
        summary: 'paused for human escalation',
      },
    });
    expect(result.finalRuntimeRecord.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'human.escalation.team_bridge_human_pause:step:2',
      value: {
        stepId: 'team_bridge_human_pause:step:2',
        requestedAt: '2026-04-10T08:20:00.000Z',
        reason: 'dependency-local-action-escalate',
        guidance: {
          action: 'escalate',
          rationale: 'dependency host actions include rejected or failed outcomes',
          counts: {
            requested: 0,
            approved: 0,
            rejected: 1,
            executed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
      },
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('cancelled');
  });

  it('fails on the team-runtime bridge when dependency guidance escalates and second-step policy defaults to fail', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const baseControl = createExecutionRuntimeControl();
    const control = {
      ...baseControl,
      async createRun(bundle: Awaited<ReturnType<typeof baseControl.createRun>>['bundle']) {
        const step = bundle.steps[1];
        if (step) {
          step.input = {
            ...step.input,
            structuredData: {
              ...step.input.structuredData,
              humanInteractionPolicy: {
                allowHumanEscalation: true,
                defaultBehavior: 'fail',
                requiredOn: [],
                allowClarificationRequests: true,
                allowApprovalRequests: true,
              },
            },
          };
        }
        return baseControl.createRun(bundle);
      },
    };

    let secondStepExecuted = false;
    const bridge = createTeamRuntimeBridge({
      control,
      now: () => '2026-04-10T08:30:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'request one forbidden local shell action',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Attempt a forbidden shell action.',
                  },
                ],
              },
              notes: [],
            },
          };
        }

        secondStepExecuted = true;
        return {
          output: {
            summary: 'should not execute',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfig({
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
          ops: { agents: ['orchestrator', 'engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_human_fail',
      createdAt: '2026-04-10T08:30:00.000Z',
      trigger: 'service',
    });

    expect(secondStepExecuted).toBe(false);
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.sharedState.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.failure).toMatchObject({
      code: 'human_escalation_required',
      message: 'dependency host-action guidance escalated and human escalation is not permitted',
    });
    expect(result.executionSummary.runtimeRunStatus).toBe('failed');
  });

  it('resumes a paused team-runtime bridge run after human escalation and drains it to completion', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const bridge = createTeamRuntimeBridge({
      control,
      now: () => '2026-04-10T08:40:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'request one forbidden local shell action',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Attempt a forbidden shell action.',
                  },
                ],
              },
              notes: [],
            },
          };
        }

        return {
          output: {
            summary: 'resumed after human escalation',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const result = await bridge.executeFromConfig({
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
          ops: { agents: ['orchestrator', 'engineer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_resume_after_pause',
      createdAt: '2026-04-10T08:40:00.000Z',
      trigger: 'service',
    });

    expect(result.finalRuntimeRecord.bundle.run.status).toBe('cancelled');

    let resumedStepPrompt: string | null | undefined = null;
    let resumedStepResumeContext: Record<string, unknown> | null = null;
    let resumedStepSharedStateContext: Record<string, unknown> | null = null;

    const resumed = await control.resumeHumanEscalation({
      runId: 'team_bridge_resume_after_pause',
      resumedAt: '2026-04-10T08:45:00.000Z',
      note: 'human approved resume',
      guidance: {
        action: 'retry-with-guidance',
        instruction: 'apply the approved fix path and continue',
      },
      override: {
        promptAppend: 'Retry the resumed step using the approved fix path only.',
        structuredContext: {
          approvedPath: '/repo/fix-path',
          reviewerDecision: 'continue',
        },
      },
    });
    expect(resumed.bundle.steps[1]?.status).toBe('runnable');

    const host = createExecutionServiceHost({
      control,
      now: () => '2026-04-10T08:45:00.000Z',
      ownerId: 'host:resume-test',
      executeStoredRunStep: async ({ step }) => {
        resumedStepPrompt = step.input.prompt ?? null;
        resumedStepResumeContext = isRecord(step.input.structuredData.humanEscalationResume)
          ? step.input.structuredData.humanEscalationResume
          : null;
        resumedStepSharedStateContext = isRecord(step.input.structuredData.sharedStateContext)
          ? step.input.structuredData.sharedStateContext
          : null;
        return {
          output: {
            summary: 'resumed after human escalation',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });
    const drained = await host.drainRunsUntilIdle({
      runId: 'team_bridge_resume_after_pause',
      maxRuns: 10,
    });
    const finalRecord = drained.drained.at(-1)?.record ?? resumed;

    expect(drained.executedRunIds).toContain('team_bridge_resume_after_pause');
    expect(finalRecord.bundle.run.status).toBe('succeeded');
    expect(finalRecord.bundle.steps[1]).toMatchObject({
      id: 'team_bridge_resume_after_pause:step:2',
      status: 'succeeded',
      output: {
        summary: 'resumed after human escalation',
      },
    });
    expect(finalRecord.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'human.resume.team_bridge_resume_after_pause:step:2',
      value: {
        stepId: 'team_bridge_resume_after_pause:step:2',
        resumedAt: '2026-04-10T08:45:00.000Z',
        note: 'human approved resume',
        guidance: {
          action: 'retry-with-guidance',
          instruction: 'apply the approved fix path and continue',
        },
        override: {
          promptAppend: 'Retry the resumed step using the approved fix path only.',
          structuredContext: {
            approvedPath: '/repo/fix-path',
            reviewerDecision: 'continue',
          },
        },
      },
    });
    expect(resumedStepResumeContext).toEqual({
      resumedAt: '2026-04-10T08:45:00.000Z',
      note: 'human approved resume',
      guidance: {
        action: 'retry-with-guidance',
        instruction: 'apply the approved fix path and continue',
      },
      override: {
        promptAppend: 'Retry the resumed step using the approved fix path only.',
        structuredContext: {
          approvedPath: '/repo/fix-path',
          reviewerDecision: 'continue',
        },
      },
    });
    expect(resumedStepSharedStateContext).toMatchObject({
      humanEscalationResume: {
        resumedAt: '2026-04-10T08:45:00.000Z',
        note: 'human approved resume',
        guidance: {
          action: 'retry-with-guidance',
          instruction: 'apply the approved fix path and continue',
        },
        override: {
          promptAppend: 'Retry the resumed step using the approved fix path only.',
        },
      },
      humanEscalationResumeOverride: {
        promptAppend: 'Retry the resumed step using the approved fix path only.',
        structuredContext: {
          approvedPath: '/repo/fix-path',
          reviewerDecision: 'continue',
        },
      },
      humanEscalationResumeOverrideStructuredContext: {
        approvedPath: '/repo/fix-path',
        reviewerDecision: 'continue',
      },
    });
    expect(resumedStepPrompt).toContain('Human resume guidance:');
    expect(resumedStepPrompt).toContain('Human resume override:');
    expect(resumedStepPrompt).toContain('Human resume structured context:');
    expect(resumedStepPrompt).toContain('human approved resume');
    expect(resumedStepPrompt).toContain('"action":"retry-with-guidance"');
    expect(resumedStepPrompt).toContain('Retry the resumed step using the approved fix path only.');
    expect(resumedStepPrompt).toContain('"approvedPath":"/repo/fix-path"');
  });
});
