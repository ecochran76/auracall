import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  classifyExecutionRunRepairPosture,
  evaluateStoredExecutionRunRepairClassification,
  repairStoredExecutionRunLease,
} from '../src/runtime/repair.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunnerRecord, createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createLeaseBundle(runId: string, ownerId?: string, expiresAt = '2026-04-11T11:01:00.000Z') {
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
            prompt: 'Repair classification',
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
      expiresAt,
      releasedAt: null,
      releaseReason: null,
    });
  }

  return bundle;
}

describe('runtime repair posture', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('classifies reconciliation outcomes conservatively', () => {
    expect(
      classifyExecutionRunRepairPosture({
        now: '2026-04-11T11:02:00.000Z',
        reconciliation: {
          runId: 'run_active',
          leaseId: 'lease_1',
          leaseOwnerId: 'runner:active',
          leaseExpiresAt: '2026-04-11T11:03:00.000Z',
          status: 'active-runner',
          reason: null,
          runner: null,
        },
      }),
    ).toMatchObject({
      posture: 'not-reclaimable',
      reason: 'active lease is still owned by an active runner',
    });

    expect(
      classifyExecutionRunRepairPosture({
        now: '2026-04-11T11:02:00.000Z',
        reconciliation: {
          runId: 'run_stale_not_expired',
          leaseId: 'lease_1',
          leaseOwnerId: 'runner:stale',
          leaseExpiresAt: '2026-04-11T11:03:00.000Z',
          status: 'stale-runner',
          reason: 'lease owner runner:stale is stale',
          runner: null,
        },
      }),
    ).toMatchObject({
      posture: 'inspect-only',
      reason: 'active lease owner is unavailable but the lease has not expired yet',
    });

    expect(
      classifyExecutionRunRepairPosture({
        now: '2026-04-11T11:04:00.000Z',
        reconciliation: {
          runId: 'run_missing_expired',
          leaseId: 'lease_1',
          leaseOwnerId: 'runner:missing',
          leaseExpiresAt: '2026-04-11T11:03:00.000Z',
          status: 'missing-runner',
          reason: 'lease owner runner:missing has no persisted runner record',
          runner: null,
        },
      }),
    ).toMatchObject({
      posture: 'locally-reclaimable',
      reason: 'active lease owner is unavailable and the lease is expired',
    });
  });

  it('evaluates stored repair posture from persisted leases and runners', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-repair-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();

    await control.createRun(createLeaseBundle('run_repair_stale_expired', 'runner:stale', '2026-04-11T11:01:00.000Z'));
    await control.createRun(createLeaseBundle('run_repair_missing_live', 'runner:missing', '2026-04-11T11:03:00.000Z'));
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

    const reclaimable = await evaluateStoredExecutionRunRepairClassification(
      { runId: 'run_repair_stale_expired', now: '2026-04-11T11:02:00.000Z' },
      { control, runnersControl },
    );
    const inspectOnly = await evaluateStoredExecutionRunRepairClassification(
      { runId: 'run_repair_missing_live', now: '2026-04-11T11:02:00.000Z' },
      { control, runnersControl },
    );

    expect(reclaimable).toMatchObject({
      runId: 'run_repair_stale_expired',
      posture: 'locally-reclaimable',
    });
    expect(inspectOnly).toMatchObject({
      runId: 'run_repair_missing_live',
      posture: 'inspect-only',
    });
  });

  it('repairs only locally reclaimable expired stale/missing-runner leases', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-repair-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();

    await control.createRun(createLeaseBundle('run_repair_action_stale', 'runner:stale', '2026-04-11T11:01:00.000Z'));
    await control.createRun(createLeaseBundle('run_repair_action_missing_live', 'runner:missing', '2026-04-11T11:03:00.000Z'));
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

    const repaired = await repairStoredExecutionRunLease(
      { runId: 'run_repair_action_stale', now: '2026-04-11T11:02:00.000Z' },
      { control, runnersControl },
    );
    const notRepaired = await repairStoredExecutionRunLease(
      { runId: 'run_repair_action_missing_live', now: '2026-04-11T11:02:00.000Z' },
      { control, runnersControl },
    );

    expect(repaired).toMatchObject({
      runId: 'run_repair_action_stale',
      posture: 'locally-reclaimable',
      repaired: true,
    });
    expect(notRepaired).toMatchObject({
      runId: 'run_repair_action_missing_live',
      posture: 'inspect-only',
      repaired: false,
    });

    const repairedRecord = await control.readRun('run_repair_action_stale');
    const inspectOnlyRecord = await control.readRun('run_repair_action_missing_live');
    expect(repairedRecord?.bundle.leases[0]?.status).toBe('expired');
    expect(repairedRecord?.bundle.leases[0]?.releaseReason).toBe('lease expired');
    expect(inspectOnlyRecord?.bundle.leases[0]?.status).toBe('active');
  });
});
