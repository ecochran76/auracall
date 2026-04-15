import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  evaluateStoredExecutionRunLeaseRunnerReconciliation,
  reconcileExecutionRunLeaseRunner,
} from '../src/runtime/reconciliation.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunnerRecord, createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createLeaseBundle(runId: string, ownerId?: string) {
  const bundle = createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId,
      teamId: 'ops',
      createdAt: '2026-04-11T11:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: `${runId}:step:1`,
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Lease reconciliation',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    }),
  );

  if (ownerId) {
    bundle.leases.push({
      id: `${runId}:lease:1`,
      runId,
      ownerId,
      status: 'active',
      acquiredAt: '2026-04-11T11:00:00.000Z',
      heartbeatAt: '2026-04-11T11:00:00.000Z',
      expiresAt: '2026-04-11T11:01:00.000Z',
      releasedAt: null,
      releaseReason: null,
    });
  }

  return bundle;
}

describe('runtime lease/runner reconciliation', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('classifies no-active-lease locally', () => {
    const result = reconcileExecutionRunLeaseRunner({
      runId: 'team_run_no_lease',
    });

    expect(result).toMatchObject({
      runId: 'team_run_no_lease',
      status: 'no-active-lease',
      reason: 'run has no active lease',
      runner: null,
    });
  });

  it('reconciles active, stale, and missing persisted lease owners', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-reconciliation-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();

    await control.createRun(createLeaseBundle('team_run_active_runner', 'runner:active'));
    await control.createRun(createLeaseBundle('team_run_stale_runner', 'runner:stale'));
    await control.createRun(createLeaseBundle('team_run_missing_runner', 'runner:missing'));

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:active',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:59:00.000Z',
        expiresAt: '2026-04-11T11:02:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale',
        hostId: 'host:wsl-dev-1',
        status: 'stale',
        startedAt: '2026-04-11T10:59:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:59:30.000Z',
        expiresAt: '2026-04-11T11:00:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const active = await evaluateStoredExecutionRunLeaseRunnerReconciliation('team_run_active_runner', {
      control,
      runnersControl,
    });
    const stale = await evaluateStoredExecutionRunLeaseRunnerReconciliation('team_run_stale_runner', {
      control,
      runnersControl,
    });
    const missing = await evaluateStoredExecutionRunLeaseRunnerReconciliation('team_run_missing_runner', {
      control,
      runnersControl,
    });

    expect(active).toMatchObject({
      runId: 'team_run_active_runner',
      status: 'active-runner',
      leaseOwnerId: 'runner:active',
    });
    expect(stale).toMatchObject({
      runId: 'team_run_stale_runner',
      status: 'stale-runner',
      leaseOwnerId: 'runner:stale',
      reason: 'lease owner runner:stale is stale',
    });
    expect(missing).toMatchObject({
      runId: 'team_run_missing_runner',
      status: 'missing-runner',
      leaseOwnerId: 'runner:missing',
      reason: 'lease owner runner:missing has no persisted runner record',
    });
  });
});
