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
      resolvedBy: 'run-id',
      queryId: runId,
      queryRunId: runId,
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: [runId],
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
      resolvedBy: 'team-run-id',
      queryId: teamRunId,
      queryRunId: runId,
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: [runId],
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
      resolvedBy: 'runtime-run-id',
      queryId: runId,
      queryRunId: runId,
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: [runId],
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
      resolvedBy: 'task-run-spec-id',
      queryId: taskRunSpecId,
      queryRunId: runId,
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: [runId],
      runtime: {
        runId,
        taskRunSpecId,
      },
    });
  });

  it('reports bounded candidate matches for alias-based runtime inspection', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-matches-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const teamRunId = 'teamrun_cli_alias_matches';
    const taskRunSpecId = 'task_spec_cli_alias_matches';

    await seedRuntimeRun(control, {
      runId: 'runtime_cli_alias_old',
      sourceKind: 'team-run',
      sourceId: teamRunId,
      taskRunSpecId,
      createdAt: '2026-04-15T12:01:00.000Z',
      trigger: 'cli',
    });
    await seedRuntimeRun(control, {
      runId: 'runtime_cli_alias_new',
      sourceKind: 'team-run',
      sourceId: teamRunId,
      taskRunSpecId,
      createdAt: '2026-04-15T12:02:00.000Z',
      trigger: 'cli',
    });

    const payload = await inspectConfiguredRuntimeRun({
      teamRunId,
      control,
    });

    expect(payload).toMatchObject({
      resolvedBy: 'team-run-id',
      queryId: teamRunId,
      queryRunId: 'runtime_cli_alias_new',
      matchingRuntimeRunCount: 2,
      matchingRuntimeRunIds: ['runtime_cli_alias_new', 'runtime_cli_alias_old'],
      runtime: {
        runId: 'runtime_cli_alias_new',
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
      resolvedBy: 'team-run-id',
      queryId: 'teamrun_cli_inspect_2',
      queryRunId: 'runtime_cli_inspect_2',
      matchingRuntimeRunCount: 2,
      matchingRuntimeRunIds: ['runtime_cli_inspect_2', 'runtime_cli_inspect_1'],
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
    expect(rendered).toContain('Resolved by: team-run-id');
    expect(rendered).toContain('Query: teamrun_cli_inspect_2');
    expect(rendered).toContain('Matching runtime runs: 2');
    expect(rendered).toContain('Matching runtime run ids: runtime_cli_inspect_2, runtime_cli_inspect_1');
    expect(rendered).toContain('Queue state: active-lease');
    expect(rendered).toContain('Active lease id: lease_1');
    expect(rendered).toContain('Active lease owner: runner:cli');
    expect(rendered).toContain('Affinity status: not-evaluated');
    expect(rendered).toContain('Required service: chatgpt');
    expect(rendered).toContain('Required runtime profile: default');
    expect(rendered).toContain('Required browser profile: (none)');
    expect(rendered).toContain('Required host: (none)');
    expect(rendered).toContain('Host requirement: any');
    expect(rendered).toContain('Required service account: (none)');
    expect(rendered).toContain('Browser required: no');
    expect(rendered).toContain('Eligibility note: (none)');
  });

  it('formats opt-in service-state probe output for operators', () => {
    const rendered = formatRuntimeRunInspectionPayload({
      resolvedBy: 'run-id',
      queryId: 'runtime_cli_probe_1',
      queryRunId: 'runtime_cli_probe_1',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['runtime_cli_probe_1'],
      taskRunSpecSummary: null,
      runtime: {
        runId: 'runtime_cli_probe_1',
        teamRunId: null,
        taskRunSpecId: null,
        sourceKind: 'direct',
        runStatus: 'running',
        updatedAt: '2026-04-16T18:10:00.000Z',
        queueProjection: {
          runId: 'runtime_cli_probe_1',
          sourceKind: 'direct',
          runStatus: 'running',
          createdAt: '2026-04-16T18:00:00.000Z',
          updatedAt: '2026-04-16T18:10:00.000Z',
          queueState: 'active-lease',
          claimState: 'held-by-lease',
          nextRunnableStepId: null,
          runningStepIds: ['runtime_cli_probe_1:step:1'],
          waitingStepIds: [],
          deferredStepIds: [],
          blockedStepIds: [],
          blockedByFailureStepIds: [],
          terminalStepIds: [],
          missingDependencyStepIds: [],
          activeLeaseId: 'runtime_cli_probe_1:lease:1',
          activeLeaseOwnerId: 'runner:probe',
          affinity: {
            status: 'not-evaluated',
            reason: null,
            requiredService: 'chatgpt',
            requiredServiceAccountId: null,
            browserRequired: true,
            requiredRuntimeProfileId: 'default',
            requiredBrowserProfileId: 'default',
            hostRequirement: 'any',
            requiredHostId: null,
            eligibilityNote: null,
          },
        },
      },
      runner: null,
      serviceState: {
        probeStatus: 'observed',
        service: 'chatgpt',
        ownerStepId: 'runtime_cli_probe_1:step:1',
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-16T18:10:03.000Z',
        evidenceRef: 'chatgpt-streaming-visible',
        confidence: 'medium',
        reason: null,
      },
    });

    expect(rendered).toContain('Service-state probe:');
    expect(rendered).toContain('Probe status: observed');
    expect(rendered).toContain('State: response-incoming');
    expect(rendered).toContain('Evidence ref: chatgpt-streaming-visible');
  });
});
