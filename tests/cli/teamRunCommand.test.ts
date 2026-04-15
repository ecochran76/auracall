import { describe, expect, it } from 'vitest';
import {
  buildCliTaskRunSpec,
  buildTeamRunCliExecutionPayload,
  executeConfiguredTeamRun,
  formatTeamRunCliExecutionPayload,
  formatTeamRunCliInspectionPayload,
  inspectConfiguredTeamRun,
} from '../../src/cli/teamRunCommand.js';
import type { ExecutionRuntimeControlContract } from '../../src/runtime/contract.js';
import type { TaskRunSpecRecordStore } from '../../src/teams/store.js';
import type { TeamRuntimeBridge } from '../../src/teams/runtimeBridge.js';

describe('team run CLI helpers', () => {
  it('builds a bounded CLI task-run-spec with final-response defaults', () => {
    const taskRunSpec = buildCliTaskRunSpec({
      nowIso: '2026-04-12T20:00:00.000Z',
      taskRunSpecId: 'taskrun_1',
      teamId: 'auracall-solo',
      objective: 'Produce a concise execution plan.',
      title: 'AuraCall solo smoke',
      promptAppend: 'Keep the answer short.',
      structuredContext: { lane: 'smoke' },
      responseFormat: 'markdown',
      maxTurns: 3,
    });

    expect(taskRunSpec).toMatchObject({
      id: 'taskrun_1',
      teamId: 'auracall-solo',
      title: 'AuraCall solo smoke',
      objective: 'Produce a concise execution plan.',
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final-response',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      overrides: {
        promptAppend: 'Keep the answer short.',
        structuredContext: { lane: 'smoke' },
      },
      turnPolicy: {
        maxTurns: 3,
      },
      requestedBy: {
        kind: 'cli',
        label: 'auracall teams run',
      },
      trigger: 'cli',
    });
  });

  it('builds an allowed local-shell policy when bounded local commands are requested', () => {
    const taskRunSpec = buildCliTaskRunSpec({
      nowIso: '2026-04-12T20:00:00.000Z',
      taskRunSpecId: 'taskrun_tool_1',
      teamId: 'auracall-tooling',
      objective: 'Run one bounded local shell action.',
      localActionPolicy: {
        allowedShellCommands: ['node'],
        allowedCwdRoots: ['/repo'],
      },
    });

    expect(taskRunSpec.localActionPolicy).toEqual({
      mode: 'allowed',
      complexityStage: 'bounded-command',
      allowedActionKinds: ['shell'],
      allowedCommands: ['node'],
      allowedCwdRoots: ['/repo'],
      resultReportingMode: 'summary-only',
    });
  });

  it('builds an approval-required local-shell policy when operator approval is requested', () => {
    const taskRunSpec = buildCliTaskRunSpec({
      nowIso: '2026-04-12T20:00:00.000Z',
      taskRunSpecId: 'taskrun_tool_approval_1',
      teamId: 'auracall-tooling',
      objective: 'Queue one bounded local shell action for operator review.',
      localActionPolicy: {
        mode: 'approval-required',
        allowedShellCommands: ['node'],
        allowedCwdRoots: ['/repo'],
      },
    });

    expect(taskRunSpec.localActionPolicy).toEqual({
      mode: 'approval-required',
      complexityStage: 'bounded-command',
      allowedActionKinds: ['shell'],
      allowedCommands: ['node'],
      allowedCwdRoots: ['/repo'],
      resultReportingMode: 'summary-only',
    });
  });

  it('executes a configured team run through the injected bridge and returns inspectable payload', async () => {
    const bridge: TeamRuntimeBridge = {
      async executeFromConfigTaskRunSpec(input) {
        return {
          teamPlan: {
            teamRun: {
              id: input.runId,
              teamId: input.teamId,
              taskRunSpecId: input.taskRunSpec.id,
            },
          } as never,
          createdRuntimeRecord: {} as never,
          finalRuntimeRecord: {
            bundle: {
              run: {
                id: `${input.runId}:runtime`,
                status: 'succeeded',
              },
              steps: [
                {
                  id: `${input.runId}:runtime:step:1`,
                  order: 1,
                  output: { summary: 'bounded local runner pass completed' },
                },
              ],
              sharedState: {
                status: 'succeeded',
                notes: ['run completed'],
              },
            },
          } as never,
          executionSummary: {
            teamRunId: input.runId,
            taskRunSpecId: input.taskRunSpec.id,
            runtimeRunId: `${input.runId}:runtime`,
            runtimeSourceKind: 'team-run',
            runtimeRunStatus: 'succeeded',
            runtimeUpdatedAt: input.createdAt,
            terminalStepCount: 1,
            stepSummaries: [
              {
                teamStepId: `${input.runId}:step:1`,
                teamStepOrder: 1,
                teamStepStatus: 'succeeded',
                runtimeStepId: `${input.runId}:runtime:step:1`,
                runtimeStepStatus: 'succeeded',
                runtimeStepFailure: null,
                runtimeProfileId: 'auracall-grok-auto',
                browserProfileId: 'default',
                service: 'grok',
              },
            ],
          },
          hostDrainResults: [],
        } as never;
      },
      async executeFromConfig() {
        throw new Error('not used');
      },
      async executeFromResolvedTeam() {
        throw new Error('not used');
      },
      async executeFromResolvedTeamTaskRunSpec() {
        throw new Error('not used');
      },
    };

    const result = await executeConfiguredTeamRun({
      config: {},
      teamId: 'auracall-solo',
      objective: 'Reply with a plan.',
      bridge,
      now: () => '2026-04-12T20:00:00.000Z',
      randomId: () => 'abc123',
    });

    expect(result.taskRunSpec.id).toBe('taskrun_auracall-solo_abc123');
    expect(result.bridgeResult.executionSummary.runtimeRunId).toBe('teamrun_auracall-solo_abc123:runtime');
    expect(result.payload).toMatchObject({
      teamId: 'auracall-solo',
      taskRunSpecId: 'taskrun_auracall-solo_abc123',
      teamRunId: 'teamrun_auracall-solo_abc123',
      runtimeRunId: 'teamrun_auracall-solo_abc123:runtime',
      runtimeRunStatus: 'succeeded',
      finalOutputSummary: 'bounded local runner pass completed',
      sharedStateStatus: 'succeeded',
      sharedStateNotes: ['run completed'],
    });
  });

  it('inspects persisted linkage by task run spec id', async () => {
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun() {
        throw new Error('not used');
      },
      async inspectRun(runId) {
        if (runId !== 'teamrun_1') {
          return null;
        }
        return {
          record: {
            runId: 'teamrun_1',
            revision: 2,
            persistedAt: '2026-04-14T16:05:00.000Z',
            bundle: {
              run: {
                id: 'teamrun_1',
                sourceKind: 'team-run',
                sourceId: 'teamrun_1',
                taskRunSpecId: 'task_spec_1',
                status: 'running',
                createdAt: '2026-04-14T16:00:00.000Z',
                updatedAt: '2026-04-14T16:05:00.000Z',
                trigger: 'cli',
                requestedBy: 'auracall teams run',
                entryPrompt: null,
                initialInputs: {},
                sharedStateId: 'shared_1',
                stepIds: ['step_1', 'step_2'],
                policy: { failPolicy: 'fail-fast' },
              },
              steps: [],
              handoffs: [{ id: 'handoff_1' }],
              localActionRequests: [{ id: 'request_1' }],
              sharedState: {
                id: 'shared_1',
                runId: 'teamrun_1',
                status: 'active',
                artifacts: [],
                structuredOutputs: [],
                notes: [],
                history: [],
                lastUpdatedAt: '2026-04-14T16:05:00.000Z',
              },
              events: [],
              leases: [
                {
                  id: 'lease_1',
                  runId: 'teamrun_1',
                  ownerId: 'host:inspect',
                  status: 'active',
                  acquiredAt: '2026-04-14T16:01:00.000Z',
                  heartbeatAt: '2026-04-14T16:05:00.000Z',
                  expiresAt: '2026-04-14T16:10:00.000Z',
                },
              ],
            },
          },
          dispatchPlan: {
            run: {} as never,
            sharedState: {} as never,
            steps: [],
            stepsById: {},
            nextRunnableStepId: 'step_2',
            runnableStepIds: ['step_2'],
            deferredStepIds: [],
            waitingStepIds: ['step_3'],
            blockedStepIds: [],
            blockedByFailureStepIds: [],
            terminalStepIds: ['step_1'],
            runningStepIds: ['step_0'],
            missingDependencyStepIds: [],
          },
        } as never;
      },
      async listRuns() {
        return [
          {
            runId: 'teamrun_1',
            revision: 2,
            persistedAt: '2026-04-14T16:05:00.000Z',
            bundle: {
              run: {
                id: 'teamrun_1',
                sourceKind: 'team-run',
                sourceId: 'teamrun_1',
                taskRunSpecId: 'task_spec_1',
                status: 'running',
                createdAt: '2026-04-14T16:00:00.000Z',
                updatedAt: '2026-04-14T16:05:00.000Z',
                trigger: 'cli',
                requestedBy: 'auracall teams run',
                entryPrompt: null,
                initialInputs: {},
                sharedStateId: 'shared_1',
                stepIds: [],
                policy: { failPolicy: 'fail-fast' },
              },
              steps: [],
              handoffs: [],
              localActionRequests: [],
              sharedState: {
                id: 'shared_1',
                runId: 'teamrun_1',
                status: 'active',
                artifacts: [],
                structuredOutputs: [],
                notes: [],
                history: [],
                lastUpdatedAt: '2026-04-14T16:05:00.000Z',
              },
              events: [],
              leases: [],
            },
          },
        ] as never;
      },
      async acquireLease() {
        throw new Error('not used');
      },
      async heartbeatLease() {
        throw new Error('not used');
      },
      async releaseLease() {
        throw new Error('not used');
      },
      async expireLeases() {
        throw new Error('not used');
      },
      async persistRun() {
        throw new Error('not used');
      },
      async resumeHumanEscalation() {
        throw new Error('not used');
      },
    };
    const taskRunSpecStore: TaskRunSpecRecordStore = {
      async ensureStorage() {
        throw new Error('not used');
      },
      async writeSpec() {
        throw new Error('not used');
      },
      async readSpec() {
        throw new Error('not used');
      },
      async readRecord(taskRunSpecId) {
        if (taskRunSpecId !== 'task_spec_1') {
          return null;
        }
        return {
          taskRunSpecId: 'task_spec_1',
          revision: 1,
          persistedAt: '2026-04-14T16:00:00.000Z',
          spec: {
            id: 'task_spec_1',
            teamId: 'auracall-solo',
            title: 'Runtime smoke',
            objective: 'Reply exactly with OK.',
            createdAt: '2026-04-14T16:00:00.000Z',
            successCriteria: ['reply with ok'],
            requestedOutputs: [{ label: 'final-response', kind: 'final-response', destination: 'response-body' }],
            inputArtifacts: [],
            context: {},
            overrides: {},
            requestedBy: { kind: 'cli', label: 'auracall teams run' },
            trigger: 'cli',
          } as never,
        };
      },
      async writeRecord() {
        throw new Error('not used');
      },
    };

    const result = await inspectConfiguredTeamRun({
      taskRunSpecId: 'task_spec_1',
      control,
      taskRunSpecStore,
    });

    expect(result).toMatchObject({
      resolvedBy: 'task-run-spec-id',
      queryId: 'task_spec_1',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['teamrun_1'],
      taskRunSpecSummary: {
        id: 'task_spec_1',
        teamId: 'auracall-solo',
        title: 'Runtime smoke',
        objective: 'Reply exactly with OK.',
      },
      runtime: {
        runtimeRunId: 'teamrun_1',
        teamRunId: 'teamrun_1',
        taskRunSpecId: 'task_spec_1',
        runtimeRunStatus: 'running',
        nextRunnableStepId: 'step_2',
        activeLeaseOwnerId: 'host:inspect',
      },
    });
  });

  it('inspects persisted linkage by runtime run id', async () => {
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun() {
        throw new Error('not used');
      },
      async inspectRun(runId) {
        if (runId !== 'teamrun_2') {
          return null;
        }
        return {
          record: {
            runId: 'teamrun_2',
            revision: 1,
            persistedAt: '2026-04-14T16:06:00.000Z',
            bundle: {
              run: {
                id: 'teamrun_2',
                sourceKind: 'team-run',
                sourceId: 'teamrun_2',
                taskRunSpecId: 'task_spec_2',
                status: 'succeeded',
                createdAt: '2026-04-14T16:00:00.000Z',
                updatedAt: '2026-04-14T16:06:00.000Z',
                trigger: 'cli',
                requestedBy: 'auracall teams run',
                entryPrompt: null,
                initialInputs: {},
                sharedStateId: 'shared_2',
                stepIds: [],
                policy: { failPolicy: 'fail-fast' },
              },
              steps: [],
              handoffs: [],
              localActionRequests: [],
              sharedState: {
                id: 'shared_2',
                runId: 'teamrun_2',
                status: 'succeeded',
                artifacts: [],
                structuredOutputs: [],
                notes: [],
                history: [],
                lastUpdatedAt: '2026-04-14T16:06:00.000Z',
              },
              events: [],
              leases: [],
            },
          },
          dispatchPlan: {
            run: {} as never,
            sharedState: {} as never,
            steps: [],
            stepsById: {},
            nextRunnableStepId: null,
            runnableStepIds: [],
            deferredStepIds: [],
            waitingStepIds: [],
            blockedStepIds: [],
            blockedByFailureStepIds: [],
            terminalStepIds: ['step_1'],
            runningStepIds: [],
            missingDependencyStepIds: [],
          },
        } as never;
      },
      async listRuns() {
        throw new Error('not used');
      },
      async acquireLease() {
        throw new Error('not used');
      },
      async heartbeatLease() {
        throw new Error('not used');
      },
      async releaseLease() {
        throw new Error('not used');
      },
      async expireLeases() {
        throw new Error('not used');
      },
      async persistRun() {
        throw new Error('not used');
      },
      async resumeHumanEscalation() {
        throw new Error('not used');
      },
    };
    const taskRunSpecStore: TaskRunSpecRecordStore = {
      async ensureStorage() {
        throw new Error('not used');
      },
      async writeSpec() {
        throw new Error('not used');
      },
      async readSpec() {
        throw new Error('not used');
      },
      async readRecord(taskRunSpecId) {
        if (taskRunSpecId !== 'task_spec_2') {
          return null;
        }
        return {
          taskRunSpecId: 'task_spec_2',
          revision: 1,
          persistedAt: '2026-04-14T16:00:00.000Z',
          spec: {
            id: 'task_spec_2',
            teamId: 'auracall-two-step',
            title: 'Two step smoke',
            objective: 'Finish both steps.',
            createdAt: '2026-04-14T16:00:00.000Z',
            successCriteria: ['finish'],
            requestedOutputs: [{ label: 'final-response', kind: 'final-response', destination: 'response-body' }],
            inputArtifacts: [],
            context: {},
            overrides: {},
            requestedBy: { kind: 'cli', label: 'auracall teams run' },
            trigger: 'cli',
          } as never,
        };
      },
      async writeRecord() {
        throw new Error('not used');
      },
    };

    const result = await inspectConfiguredTeamRun({
      runtimeRunId: 'teamrun_2',
      control,
      taskRunSpecStore,
    });

    expect(result).toMatchObject({
      resolvedBy: 'runtime-run-id',
      queryId: 'teamrun_2',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['teamrun_2'],
      taskRunSpecSummary: {
        id: 'task_spec_2',
        teamId: 'auracall-two-step',
      },
      runtime: {
        runtimeRunId: 'teamrun_2',
        runtimeRunStatus: 'succeeded',
        sharedStateStatus: 'succeeded',
      },
    });
  });

  it('formats a readable inspection summary', () => {
    const text = formatTeamRunCliInspectionPayload({
      resolvedBy: 'task-run-spec-id',
      queryId: 'task_spec_1',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['teamrun_1'],
      taskRunSpecSummary: {
        id: 'task_spec_1',
        teamId: 'auracall-solo',
        title: 'Runtime smoke',
        objective: 'Reply exactly with OK.',
        createdAt: '2026-04-14T16:00:00.000Z',
        persistedAt: '2026-04-14T16:00:01.000Z',
        requestedOutputCount: 1,
        inputArtifactCount: 0,
      },
      runtime: {
        runtimeRunId: 'teamrun_1',
        teamRunId: 'teamrun_1',
        taskRunSpecId: 'task_spec_1',
        runtimeSourceKind: 'team-run',
        runtimeRunStatus: 'running',
        runtimeUpdatedAt: '2026-04-14T16:05:00.000Z',
        sharedStateStatus: 'active',
        stepCount: 2,
        handoffCount: 1,
        localActionRequestCount: 0,
        nextRunnableStepId: 'step_2',
        runnableStepIds: ['step_2'],
        deferredStepIds: [],
        waitingStepIds: [],
        blockedStepIds: [],
        blockedByFailureStepIds: [],
        runningStepIds: ['step_1'],
        terminalStepIds: [],
        missingDependencyStepIds: [],
        activeLeaseOwnerId: 'host:inspect',
      },
    });

    expect(text).toContain('Resolved by: task-run-spec-id');
    expect(text).toContain('TaskRunSpec: task_spec_1');
    expect(text).toContain('Runtime run: teamrun_1');
    expect(text).toContain('Next runnable step: step_2');
    expect(text).toContain('Active lease owner: host:inspect');
  });

  it('formats a readable execution summary', () => {
    const text = formatTeamRunCliExecutionPayload(
      buildTeamRunCliExecutionPayload({
        teamId: 'auracall-solo',
        taskRunSpec: {
          id: 'taskrun_1',
        } as never,
        bridgeResult: {
          finalRuntimeRecord: {
            bundle: {
              steps: [{ order: 1, output: { summary: 'final answer ready' } }],
              sharedState: {
                status: 'succeeded',
                notes: ['run completed'],
              },
            },
          },
          executionSummary: {
            teamRunId: 'teamrun_1',
            runtimeRunId: 'runtime_1',
            runtimeSourceKind: 'team-run',
            runtimeRunStatus: 'succeeded',
            runtimeUpdatedAt: '2026-04-12T20:00:00.000Z',
            terminalStepCount: 1,
            stepSummaries: [
              {
                teamStepId: 'teamrun_1:step:1',
                teamStepOrder: 1,
                teamStepStatus: 'succeeded',
                runtimeStepId: 'runtime_1:step:1',
                runtimeStepStatus: 'succeeded',
                runtimeStepFailure: null,
                runtimeProfileId: 'auracall-grok-auto',
                browserProfileId: 'default',
                service: 'grok',
              },
            ],
          },
        } as never,
      }),
    );

    expect(text).toContain('Team: auracall-solo');
    expect(text).toContain('Runtime status: succeeded');
    expect(text).toContain('Final output summary: final answer ready');
    expect(text).toContain('Shared state notes:');
  });
});
