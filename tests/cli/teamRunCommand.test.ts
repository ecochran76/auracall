import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  buildCliTaskRunSpec,
  buildTeamRunCliExecutionPayload,
  executeConfiguredTeamRun,
  formatTeamRunCliExecutionPayload,
  formatTeamRunCliInspectionPayload,
  formatTeamRunCliReviewLedgerPayload,
  inspectConfiguredTeamRun,
  reviewConfiguredTeamRun,
} from '../../src/cli/teamRunCommand.js';
import type { ExecutionRuntimeControlContract } from '../../src/runtime/contract.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';
import {
  createExecutionRunnerRecord,
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../../src/runtime/model.js';
import { createExecutionRunnerControl } from '../../src/runtime/runnersControl.js';
import { createExecutionServiceHost } from '../../src/runtime/serviceHost.js';
import type { TaskRunSpecRecordStore } from '../../src/teams/store.js';
import type { TeamRuntimeBridge } from '../../src/teams/runtimeBridge.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../../src/teams/types.js';

describe('team run CLI helpers', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

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

  it('executes the default CLI path through a persisted local runner and releases runner-backed leases', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-run-cli-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const result = await executeConfiguredTeamRun({
      config: {
        defaultRuntimeProfile: 'default',
        services: {
          chatgpt: {
            identity: {
              email: 'operator@example.com',
            },
          },
        },
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
      objective: 'Reply with one bounded result.',
      now: () => '2026-04-18T15:00:00.000Z',
      randomId: () => 'runnerpass123',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'cli runner-backed bridge completed',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    });

    const runnersControl = createExecutionRunnerControl();
    const runtimeControl = createExecutionRuntimeControl();
    const runnerId = 'runner:teams-run:ops:runnerpass12';
    const storedRunner = await runnersControl.readRunner(runnerId);
    const storedRun = await runtimeControl.readRun(result.payload.runtimeRunId);

    expect(result.payload.runtimeRunId).toBe('teamrun_ops_runnerpass12');
    expect(storedRunner).toMatchObject({
      runnerId,
      runner: {
        id: runnerId,
        hostId: 'host:teams-run:ops:runnerpass12',
        status: 'stale',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
        browserCapable: true,
        lastClaimedRunId: 'teamrun_ops_runnerpass12',
      },
    });
    expect(storedRun?.bundle.leases).toEqual([
      expect.objectContaining({
        runId: 'teamrun_ops_runnerpass12',
        ownerId: runnerId,
        status: 'released',
      }),
    ]);
  });

  it('keeps the bounded CLI runner heartbeated across multi-step execution passes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-run-cli-heartbeat-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const timestamps = [
      '2026-04-19T15:00:00.000Z',
      '2026-04-19T15:00:00.000Z',
      '2026-04-19T15:00:00.000Z',
      '2026-04-19T15:00:00.000Z',
      '2026-04-19T15:00:20.000Z',
      '2026-04-19T15:00:20.000Z',
      '2026-04-19T15:00:20.000Z',
      '2026-04-19T15:00:40.000Z',
      '2026-04-19T15:00:40.000Z',
      '2026-04-19T15:00:40.000Z',
      '2026-04-19T15:00:50.000Z',
    ];
    let timestampIndex = 0;
    const now = () => {
      const current = timestamps[Math.min(timestampIndex, timestamps.length - 1)];
      timestampIndex += 1;
      return current ?? '2026-04-19T15:00:50.000Z';
    };
    let executionCount = 0;

    const result = await executeConfiguredTeamRun({
      config: {
        defaultRuntimeProfile: 'default',
        services: {
          chatgpt: {
            identity: {
              email: 'operator@example.com',
            },
          },
        },
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
      objective: 'Complete both ordered team steps.',
      now,
      randomId: () => 'heartbeats12',
      executeStoredRunStep: async () => {
        executionCount += 1;
        return {
          output: {
            summary: `step ${executionCount} complete`,
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const runnersControl = createExecutionRunnerControl();
    const storedRunner = await runnersControl.readRunner('runner:teams-run:ops:heartbeats12');

    expect(executionCount).toBe(2);
    expect(result.payload.runtimeRunStatus).toBe('succeeded');
    expect(result.payload.stepSummaries).toHaveLength(2);
    expect(result.payload.stepSummaries.map((step) => step.runtimeStepStatus)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    expect(storedRunner?.runner.lastHeartbeatAt).not.toBe('2026-04-19T15:00:00.000Z');
    expect(storedRunner?.runner.status).toBe('stale');
  });

  it('hands a CLI-generated paused team run off to a later active runner after approval and resume', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-run-cli-pause-handoff-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let secondStepExecuted = false;
    const result = await executeConfiguredTeamRun({
      config: {
        defaultRuntimeProfile: 'default',
        services: {
          chatgpt: {
            identity: {
              email: 'operator@example.com',
            },
          },
        },
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
          ops: { agents: ['orchestrator', 'reviewer'] },
        },
      },
      teamId: 'ops',
      objective: 'Pause for approval, then finish after operator follow-through.',
      now: () => '2026-04-19T16:00:00.000Z',
      randomId: () => 'pausehandoff',
      localActionPolicy: {
        mode: 'approval-required',
        allowedShellCommands: ['node'],
        allowedCwdRoots: [process.cwd()],
      },
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 1) {
          return {
            output: {
              summary: 'queue one approval-gated shell action',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Queue one bounded node command for operator approval.',
                    command: 'node',
                    args: ['-e', 'process.stdout.write("cli-pending")'],
                    structuredPayload: {
                      cwd: process.cwd(),
                    },
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
            summary: 'resumed after operator approval',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        };
      },
    });

    const runtimeControl = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = result.payload.runtimeRunId;
    const cliRunnerId = 'runner:teams-run:ops:pausehandoff';

    expect(result.payload.runtimeRunStatus).toBe('cancelled');
    expect(result.payload.finalOutputSummary).toBe('paused for human escalation');

    const pausedRecord = await runtimeControl.readRun(runId);
    const storedCliRunner = await runnersControl.readRunner(cliRunnerId);
    const requestId = pausedRecord?.bundle.localActionRequests[0]?.id;

    expect(requestId).toBeTruthy();
    expect(pausedRecord?.bundle.run.status).toBe('cancelled');
    expect(pausedRecord?.bundle.steps[1]?.status).toBe('cancelled');
    expect(pausedRecord?.bundle.leases.every((lease) => lease.status === 'released')).toBe(true);
    expect(storedCliRunner).toMatchObject({
      runnerId: cliRunnerId,
      runner: {
        id: cliRunnerId,
        status: 'stale',
        lastClaimedRunId: runId,
      },
    });

    const replacementRunnerId = 'runner:resume-host';
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: replacementRunnerId,
        hostId: 'host:resume-host',
        startedAt: '2026-04-19T16:05:00.000Z',
        lastHeartbeatAt: '2026-04-19T16:05:00.000Z',
        expiresAt: '2026-04-19T16:05:15.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
        browserCapable: true,
      }),
    });

    const replacementHost = createExecutionServiceHost({
      control: runtimeControl,
      runnersControl,
      ownerId: replacementRunnerId,
      runnerId: replacementRunnerId,
      now: () => '2026-04-19T16:05:00.000Z',
      executeStoredRunStep: async ({ step }) => {
        if (step.order === 2) {
          secondStepExecuted = true;
          return {
            output: {
              summary: 'resumed after operator approval',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          };
        }
        throw new Error(`unexpected resumed step order ${step.order}`);
      },
    });

    const resolved = await replacementHost.resolveLocalActionRequest(runId, requestId!, 'approved');
    expect(resolved).toMatchObject({
      action: 'resolve-local-action-request',
      runId,
      requestId,
      resolution: 'approved',
      status: 'resolved',
      resolved: true,
    });

    const resumed = await replacementHost.resumeHumanEscalation(runId, {
      note: 'resume after CLI approval handoff',
    });
    expect(resumed).toMatchObject({
      action: 'resume-human-escalation',
      runId,
      status: 'resumed',
      resumed: true,
      resumedStepId: `${runId}:step:2`,
    });

    const drained = await replacementHost.drainRun(runId);
    expect(drained).toMatchObject({
      action: 'drain-run',
      runId,
      status: 'executed',
      drained: true,
    });
    expect(secondStepExecuted).toBe(true);

    const finalRecord = await runtimeControl.readRun(runId);
    const replacementRunner = await runnersControl.readRunner(replacementRunnerId);

    expect(finalRecord?.bundle.run.status).toBe('succeeded');
    expect(finalRecord?.bundle.steps[1]).toMatchObject({
      status: 'succeeded',
      output: {
        summary: 'resumed after operator approval',
      },
    });
    expect(finalRecord?.bundle.leases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerId: replacementRunnerId,
          status: 'released',
        }),
      ]),
    );
    expect(replacementRunner).toMatchObject({
      runnerId: replacementRunnerId,
      runner: {
        id: replacementRunnerId,
        status: 'active',
        lastClaimedRunId: runId,
      },
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

  it('inspects persisted linkage by team run id', async () => {
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun() {
        throw new Error('not used');
      },
      async inspectRun(runId) {
        if (runId !== 'runtime_run_3') {
          return null;
        }
        return {
          record: {
            runId: 'runtime_run_3',
            revision: 1,
            persistedAt: '2026-04-14T16:06:00.000Z',
            bundle: {
              run: {
                id: 'runtime_run_3',
                sourceKind: 'team-run',
                sourceId: 'teamrun_3',
                taskRunSpecId: 'task_spec_3',
                status: 'running',
                createdAt: '2026-04-14T16:00:00.000Z',
                updatedAt: '2026-04-14T16:06:00.000Z',
                trigger: 'cli',
                requestedBy: 'auracall teams run',
                entryPrompt: null,
                initialInputs: {},
                sharedStateId: 'shared_3',
                stepIds: [],
                policy: { failPolicy: 'fail-fast' },
              },
              steps: [],
              handoffs: [],
              localActionRequests: [],
              sharedState: {
                id: 'shared_3',
                runId: 'runtime_run_3',
                status: 'active',
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
            terminalStepIds: [],
            runningStepIds: [],
            missingDependencyStepIds: [],
          },
        } as never;
      },
      async listRuns() {
        return [
          {
            runId: 'runtime_run_3',
            revision: 1,
            persistedAt: '2026-04-14T16:06:00.000Z',
            bundle: {
              run: {
                id: 'runtime_run_3',
                sourceKind: 'team-run',
                sourceId: 'teamrun_3',
                taskRunSpecId: 'task_spec_3',
                status: 'running',
                createdAt: '2026-04-14T16:00:00.000Z',
                updatedAt: '2026-04-14T16:06:00.000Z',
                trigger: 'cli',
                requestedBy: 'auracall teams run',
                entryPrompt: null,
                initialInputs: {},
                sharedStateId: 'shared_3',
                stepIds: [],
                policy: { failPolicy: 'fail-fast' },
              },
              steps: [],
              handoffs: [],
              localActionRequests: [],
              sharedState: {
                id: 'shared_3',
                runId: 'runtime_run_3',
                status: 'active',
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
        if (taskRunSpecId !== 'task_spec_3') {
          return null;
        }
        return {
          taskRunSpecId: 'task_spec_3',
          revision: 1,
          persistedAt: '2026-04-14T16:00:00.000Z',
          spec: {
            id: 'task_spec_3',
            teamId: 'auracall-solo',
            title: 'Team run lookup',
            objective: 'Inspect by team run id.',
            createdAt: '2026-04-14T16:00:00.000Z',
            successCriteria: ['inspect by team run id'],
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
      teamRunId: 'teamrun_3',
      control,
      taskRunSpecStore,
    });

    expect(result).toMatchObject({
      resolvedBy: 'team-run-id',
      queryId: 'teamrun_3',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['runtime_run_3'],
      taskRunSpecSummary: {
        id: 'task_spec_3',
        teamId: 'auracall-solo',
      },
      runtime: {
        runtimeRunId: 'runtime_run_3',
        teamRunId: 'teamrun_3',
        taskRunSpecId: 'task_spec_3',
        runtimeRunStatus: 'running',
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

  it('reviews a persisted team run ledger by runtime run id', async () => {
    const runId = 'team_review_cli_1';
    const stepId = `${runId}:step:1`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: 'teamrun_review_cli_1',
        taskRunSpecId: 'task_review_cli_1',
        status: 'succeeded',
        createdAt: '2026-04-15T19:00:00.000Z',
        updatedAt: '2026-04-15T19:03:00.000Z',
        trigger: 'cli',
        requestedBy: 'auracall teams run',
        entryPrompt: null,
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [stepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: stepId,
          runId,
          sourceStepId: stepId,
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Review the run.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'reviewed',
            artifacts: [],
            structuredData: {
              browserRun: {
                conversationId: 'conversation-1',
                tabUrl: 'https://chatgpt.com/c/conversation-1',
                service: 'chatgpt',
                runtimeProfileId: 'default',
                browserProfileId: 'default',
                agentId: 'analyst',
                projectId: 'g-p-cli-review',
                configuredUrl: 'https://chatgpt.com/g/g-p-cli-review',
                desiredModel: 'GPT-5.2',
                cachePath: null,
                cachePathStatus: 'unavailable',
                passiveObservations: [
                  {
                    state: 'thinking',
                    source: 'browser-service',
                    observedAt: '2026-04-15T19:01:00.000Z',
                    evidenceRef: 'Thinking about response',
                    confidence: 'medium',
                  },
                  {
                    state: 'response-incoming',
                    source: 'browser-service',
                    observedAt: '2026-04-15T19:01:03.000Z',
                    evidenceRef: 'chatgpt-assistant-snapshot',
                    confidence: 'high',
                  },
                  {
                    state: 'response-complete',
                    source: 'browser-service',
                    observedAt: '2026-04-15T19:02:00.000Z',
                    evidenceRef: 'chatgpt-response-finished',
                    confidence: 'high',
                  },
                ],
              },
            },
            notes: [],
          },
          completedAt: '2026-04-15T19:02:00.000Z',
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: `${runId}:state`,
        runId,
        status: 'succeeded',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-15T19:03:00.000Z',
      }),
      events: [],
    });
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun(candidateRunId) {
        return candidateRunId === runId ? { runId, revision: 1, persistedAt: bundle.run.updatedAt, bundle } : null;
      },
      async inspectRun() {
        throw new Error('not used');
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
        if (taskRunSpecId !== 'task_review_cli_1') {
          return null;
        }
        return {
          taskRunSpecId: 'task_review_cli_1',
          revision: 1,
          persistedAt: '2026-04-15T19:00:01.000Z',
          spec: {
            id: 'task_review_cli_1',
            teamId: 'auracall-solo',
            title: 'Review CLI smoke',
            objective: 'Review the run.',
            createdAt: '2026-04-15T19:00:00.000Z',
            successCriteria: [],
            requestedOutputs: [],
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

    const payload = await reviewConfiguredTeamRun({
      runtimeRunId: runId,
      control,
      taskRunSpecStore,
    });

    expect(payload).toMatchObject({
      resolvedBy: 'runtime-run-id',
      queryId: runId,
      matchingRuntimeRunIds: [runId],
      taskRunSpecSummary: {
        id: 'task_review_cli_1',
        teamId: 'auracall-solo',
      },
      ledger: {
        teamRunId: 'teamrun_review_cli_1',
        runtimeRunId: runId,
        sequence: [
          {
            stepId,
            providerConversationRef: {
              service: 'chatgpt',
              conversationId: 'conversation-1',
              url: 'https://chatgpt.com/c/conversation-1',
              configuredUrl: 'https://chatgpt.com/g/g-p-cli-review',
              projectId: 'g-p-cli-review',
              runtimeProfileId: 'default',
              browserProfileId: 'default',
              agentId: 'analyst',
              model: 'GPT-5.2',
              cachePathStatus: 'unavailable',
            },
          },
        ],
      },
    });

    const text = formatTeamRunCliReviewLedgerPayload(payload);
    expect(text).toContain('Resolved by: runtime-run-id');
    expect(text).toContain('Team run: teamrun_review_cli_1');
    expect(text).toContain('provider ref: service=chatgpt conversation=conversation-1 project=g-p-cli-review model=GPT-5.2');
    expect(text).toContain('cacheStatus=unavailable');
    expect(text).toContain('Observations: 3');
    expect(text).toContain('team_review_cli_1:step:1:stored-observation:1:thinking');
    expect(text).toContain('team_review_cli_1:step:1:stored-observation:3:response-complete');
  });

  it('formats hard-stop observations in team run review text', async () => {
    const runId = 'team_review_cli_hard_stop';
    const stepId = `${runId}:step:1`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: 'teamrun_review_cli_hard_stop',
        taskRunSpecId: null,
        status: 'failed',
        createdAt: '2026-04-15T19:10:00.000Z',
        updatedAt: '2026-04-15T19:11:00.000Z',
        trigger: 'cli',
        requestedBy: 'auracall teams run',
        entryPrompt: null,
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [stepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: stepId,
          runId,
          sourceStepId: stepId,
          agentId: 'reviewer',
          runtimeProfileId: 'gemini-runtime',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'review',
          status: 'failed',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Review through Gemini.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'captcha page',
            artifacts: [],
            structuredData: {
              browserRun: {
                service: 'gemini',
                tabUrl: 'https://google.com/sorry/index',
              },
            },
            notes: [],
          },
          completedAt: '2026-04-15T19:10:30.000Z',
          failure: {
            code: 'runner_execution_failed',
            message: 'Visible CAPTCHA page.',
            ownerStepId: stepId,
            details: {
              providerState: 'captcha-or-human-verification',
            },
          },
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: `${runId}:state`,
        runId,
        status: 'failed',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-15T19:11:00.000Z',
      }),
      events: [],
    });
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun(candidateRunId) {
        return candidateRunId === runId ? { runId, revision: 1, persistedAt: bundle.run.updatedAt, bundle } : null;
      },
      async inspectRun() {
        throw new Error('not used');
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

    const payload = await reviewConfiguredTeamRun({
      runtimeRunId: runId,
      control,
    });

    expect(payload.ledger.observations).toHaveLength(1);
    const text = formatTeamRunCliReviewLedgerPayload(payload);
    expect(text).toContain('Observations: 1');
    expect(text).toContain(`${stepId}:observation:captcha-or-human-verification`);
    expect(text).toContain('source=provider-adapter confidence=high');
    expect(text).toContain('evidence=https://google.com/sorry/index');
  });

  it('rejects ambiguous team run review lookups', async () => {
    await expect(
      reviewConfiguredTeamRun({
        taskRunSpecId: 'task_1',
        teamRunId: 'team_1',
      }),
    ).rejects.toThrow(
      'Choose exactly one review lookup key: --task-run-spec-id, --team-run-id, or --runtime-run-id.',
    );
  });
});
