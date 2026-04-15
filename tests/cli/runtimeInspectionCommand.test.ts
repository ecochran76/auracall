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

  it('inspects one runtime run with bounded queue projection and runner evaluation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-runtime-inspect-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_cli_inspect_1';
    const createdAt = '2026-04-15T12:00:00.000Z';
    const runnerId = 'runner:cli-inspect';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'teamrun_cli_inspect_1',
          taskRunSpecId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect runtime run.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: 'teamrun_cli_inspect_1:step:1',
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
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
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
