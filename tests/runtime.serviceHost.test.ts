import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { createExecutionServiceHost } from '../src/runtime/serviceHost.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

function createDirectBundle(runId: string, createdAt: string, status: 'planned' | 'running' = 'planned') {
  const stepId = `${runId}:step:1`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status,
      createdAt,
      updatedAt: createdAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'Run once.',
      initialInputs: {
        model: 'gpt-5.2',
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
      sharedStateId: `${runId}:state`,
      stepIds: [stepId],
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    }),
    steps: [
      createExecutionRunStep({
        id: stepId,
        runId,
        agentId: 'api-responses',
        runtimeProfileId: 'default',
        browserProfileId: null,
        service: 'chatgpt',
        kind: 'prompt',
        status: 'runnable',
        order: 1,
        dependsOnStepIds: [],
        input: {
          prompt: 'Run once.',
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
    events: [
      createExecutionRunEvent({
        id: `${runId}:event:run-created`,
        runId,
        type: 'run-created',
        createdAt,
      }),
    ],
  });
}

describe('runtime service host', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('drains one targeted stored direct run through the host seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_host_1', '2026-04-08T15:00:00.000Z'));

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:01:00.000Z',
    });

    const result = await host.drainRunsOnce({
      runId: 'run_host_1',
    });

    expect(result.ownerId).toBe('host:test');
    expect(result.executedRunIds).toEqual(['run_host_1']);
    expect(result.drained[0]).toMatchObject({
      runId: 'run_host_1',
      result: 'executed',
    });
    expect(result.drained[0]?.record?.bundle.run.status).toBe('succeeded');
  });

  it('expires stale leases before reclaiming a runnable run and skips still-active leases', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-service-host-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createDirectBundle('run_stale', '2026-04-08T15:00:00.000Z'));
    await control.createRun(createDirectBundle('run_busy', '2026-04-08T15:02:00.000Z'));

    await control.acquireLease({
      runId: 'run_stale',
      leaseId: 'run_stale:lease:old',
      ownerId: 'host:old',
      acquiredAt: '2026-04-08T15:00:00.000Z',
      heartbeatAt: '2026-04-08T15:00:00.000Z',
      expiresAt: '2026-04-08T15:00:00.000Z',
    });
    await control.acquireLease({
      runId: 'run_busy',
      leaseId: 'run_busy:lease:busy',
      ownerId: 'host:busy',
      acquiredAt: '2026-04-08T15:02:00.000Z',
      heartbeatAt: '2026-04-08T15:02:00.000Z',
      expiresAt: '2026-04-08T15:05:00.000Z',
    });

    const host = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T15:03:00.000Z',
    });

    const result = await host.drainRunsOnce({
      sourceKind: 'direct',
      maxRuns: 2,
    });

    expect(result.expiredLeaseRunIds).toEqual(['run_stale']);
    expect(result.executedRunIds).toEqual(['run_stale']);
    expect(result.drained).toEqual([
      expect.objectContaining({
        runId: 'run_stale',
        result: 'executed',
      }),
      expect.objectContaining({
        runId: 'run_busy',
        result: 'skipped',
        reason: 'active-lease',
      }),
    ]);
  });
});
