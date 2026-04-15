import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';
import { createExecutionRunnerControl } from '../../src/runtime/runnersControl.js';
import {
  createExecutionRunnerRecord,
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../../src/runtime/model.js';
import { inspectConfiguredRuntimeRun, formatRuntimeRunInspectionPayload } from '../../src/cli/runtimeInspectionCommand.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../../src/teams/types.js';

describe('runtime inspection CLI helpers', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  const seedRuntimeRun = async (
    control: ReturnType<typeof createExecutionRuntimeControl>,
    input: {
      runId: string;
      sourceKind: 'direct' | 'team-run';
      sourceId?: string | null;
      taskRunSpecId?: string | null;
      createdAt: string;
      trigger?: 'cli' | 'api';
    },
  ) => {
    const stepId = `${input.runId}:step:1`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: input.runId,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId ?? (input.sourceKind === 'team-run' ? `${input.runId}:team` : null),
          taskRunSpecId: input.taskRunSpecId ?? null,
          status: 'planned',
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
          trigger: input.trigger ?? 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect runtime run.',
          initialInputs: {},
          sharedStateId: `${input.runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId: input.runId,
            sourceStepId: `${input.sourceId ?? 'teamrun_cli_inspect'}:step:1`,
            agentId: 'agent:1',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect runtime run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${input.runId}:state`,
          runId: input.runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: input.createdAt,
        }),
        events: [],
      }),
    );
  };

  it('inspects one runtime run with bounded queue projection and runner evaluation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_cli_inspect_1';
    const createdAt = '2026-04-15T12:00:00.000Z';
    const runnerId = 'runner:cli-inspect';

    await seedRuntimeRun(control, {
      runId,
      sourceKind: 'team-run',
      sourceId: 'teamrun_cli_inspect_1',
      createdAt,
      trigger: 'cli',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: runnerId,
        hostId: 'host:cli',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T12:01:00.000Z',
        expiresAt: '2026-04-15T12:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const payload = await inspectConfiguredRuntimeRun({
      runId,
      runnerId,
      control,
      runnersControl,
    });

    expect(payload).toMatchObject({
      queryRunId: runId,
      runtime: {
        runId,
        teamRunId: 'teamrun_cli_inspect_1',
        sourceKind: 'team-run',
        runStatus: 'planned',
        queueProjection: {
          queueState: 'runnable',
          claimState: 'claimable',
          nextRunnableStepId: `${runId}:step:1`,
          affinity: {
            status: 'eligible',
          },
        },
      },
      runner: {
        selectedBy: 'query-runner-id',
        runnerId,
        hostId: 'host:cli',
        status: 'active',
      },
    });
  });

  it('resolves runtime inspection by team run id alias', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-team-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_cli_team_alias_inspect';
    const teamRunId = 'teamrun_cli_alias_inspect';
    const createdAt = '2026-04-15T12:01:00.000Z';

    await seedRuntimeRun(control, {
      runId,
      sourceKind: 'team-run',
      sourceId: teamRunId,
      createdAt,
      trigger: 'cli',
    });

    const payload = await inspectConfiguredRuntimeRun({
      teamRunId,
      control,
    });

    expect(payload).toMatchObject({
      queryRunId: runId,
      runtime: {
        runId,
        teamRunId,
      },
    });
  });

  it('resolves runtime inspection by runtimeRunId alias', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-runtime-id-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_cli_runtime_id_alias';
    const createdAt = '2026-04-15T12:02:00.000Z';

    await seedRuntimeRun(control, {
      runId,
      sourceKind: 'direct',
      createdAt,
      trigger: 'api',
    });

    const payload = await inspectConfiguredRuntimeRun({
      runtimeRunId: runId,
      control,
    });

    expect(payload).toMatchObject({
      queryRunId: runId,
      runtime: {
        runId,
      },
    });
  });

  it('resolves runtime inspection by task run spec id alias', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-task-spec-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_cli_task_spec_alias';
    const taskRunSpecId = 'task_spec_cli_alias';
    const createdAt = '2026-04-15T12:03:00.000Z';

    await seedRuntimeRun(control, {
      runId,
      sourceKind: 'team-run',
      sourceId: 'teamrun_cli_task_alias',
      taskRunSpecId,
      createdAt,
      trigger: 'cli',
    });

    const payload = await inspectConfiguredRuntimeRun({
      taskRunSpecId,
      control,
    });

    expect(payload).toMatchObject({
      queryRunId: runId,
      runtime: {
        runId,
        taskRunSpecId,
      },
    });
  });

  it('errors when no runtime lookup key is provided', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-no-key-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await expect(
      inspectConfiguredRuntimeRun({
        control: createExecutionRuntimeControl(),
      }),
    ).rejects.toThrow('Provide --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.');
  });

  it('errors when multiple runtime lookup keys are provided', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-multi-key-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await expect(
      inspectConfiguredRuntimeRun({
        runId: 'runtime_cli_multi_1',
        teamRunId: 'teamrun_cli_multi_1',
        control: createExecutionRuntimeControl(),
      }),
    ).rejects.toThrow('Choose exactly one runtime lookup key: --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.');
  });

  it('formats bounded runtime inspection payload for operators', () => {
    const rendered = formatRuntimeRunInspectionPayload({
      queryRunId: 'runtime_cli_inspect_2',
      taskRunSpecSummary: null,
      runtime: {
        runId: 'runtime_cli_inspect_2',
        teamRunId: 'teamrun_cli_inspect_2',
        taskRunSpecId: null,
        sourceKind: 'team-run',
        runStatus: 'running',
        updatedAt: '2026-04-15T12:10:00.000Z',
        queueProjection: {
          runId: 'runtime_cli_inspect_2',
          sourceKind: 'team-run',
          runStatus: 'running',
          createdAt: '2026-04-15T12:00:00.000Z',
          updatedAt: '2026-04-15T12:10:00.000Z',
          queueState: 'active-lease',
          claimState: 'held-by-lease',
          nextRunnableStepId: 'runtime_cli_inspect_2:step:2',
          runningStepIds: ['runtime_cli_inspect_2:step:1'],
          waitingStepIds: [],
          deferredStepIds: [],
          blockedStepIds: [],
          blockedByFailureStepIds: [],
          terminalStepIds: [],
          missingDependencyStepIds: [],
          activeLeaseId: 'lease_1',
          activeLeaseOwnerId: 'runner:cli',
          affinity: {
            status: 'not-evaluated',
            reason: null,
            requiredService: 'chatgpt',
            requiredServiceAccountId: null,
            browserRequired: false,
            requiredRuntimeProfileId: 'default',
            requiredBrowserProfileId: null,
            hostRequirement: 'any',
            requiredHostId: null,
            eligibilityNote: null,
          },
        },
      },
      runner: null,
    });

    expect(rendered).toContain('AuraCall runtime inspection');
    expect(rendered).toContain('Queue state: active-lease');
    expect(rendered).toContain('Affinity status: not-evaluated');
  });
});
