import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunAffinityRecord, createExecutionRunnerRecord } from '../src/runtime/model.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { evaluateStoredExecutionRunSchedulerAuthority } from '../src/runtime/schedulerAuthority.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createRunnableBundle(runId: string) {
  return createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId,
      teamId: 'ops',
      createdAt: '2026-04-21T15:00:00.000Z',
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
            prompt: 'Evaluate scheduler authority.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    }),
  );
}

function createChatgptAffinity() {
  return createExecutionRunAffinityRecord({
    service: 'chatgpt',
    serviceAccountId: 'acct_chatgpt_default',
    browserRequired: true,
    runtimeProfileId: 'default',
    browserProfileId: 'wsl-chrome-2',
    hostRequirement: 'same-host',
    requiredHostId: 'host:wsl-dev-1',
  });
}

function createEligibleRunner(id: string, lastHeartbeatAt = '2026-04-21T15:00:30.000Z') {
  return createExecutionRunnerRecord({
    id,
    hostId: 'host:wsl-dev-1',
    startedAt: '2026-04-21T14:59:00.000Z',
    lastHeartbeatAt,
    expiresAt: '2026-04-21T15:01:00.000Z',
    serviceIds: ['chatgpt'],
    runtimeProfileIds: ['default'],
    browserProfileIds: ['wsl-chrome-2'],
    serviceAccountIds: ['acct_chatgpt_default'],
    browserCapable: true,
  });
}

describe('runtime scheduler authority evaluator', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('allows only local-claim authority when the configured local runner is eligible', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-scheduler-authority-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_scheduler_local'));
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:local'),
    });
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:alternate', '2026-04-21T15:00:40.000Z'),
    });

    const evaluation = await evaluateStoredExecutionRunSchedulerAuthority(
      {
        runId: 'team_run_scheduler_local',
        now: '2026-04-21T15:00:45.000Z',
        localRunnerId: 'runner:local',
        affinity: createChatgptAffinity(),
      },
      { control, runnersControl },
    );

    expect(evaluation).toMatchObject({
      runId: 'team_run_scheduler_local',
      decision: 'claimable-by-local-runner',
      mutationAllowed: false,
      selectedRunnerId: 'runner:local',
      localRunnerId: 'runner:local',
      futureMutation: 'local-claim',
      activeLease: null,
    });
    expect(evaluation?.candidates.map((candidate) => candidate.runnerId)).toEqual([
      'runner:alternate',
      'runner:local',
    ]);
  });

  it('reports another eligible runner without assigning it when local runner is not eligible', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-scheduler-authority-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_scheduler_other'));
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:alternate'),
    });

    const evaluation = await evaluateStoredExecutionRunSchedulerAuthority(
      {
        runId: 'team_run_scheduler_other',
        now: '2026-04-21T15:00:45.000Z',
        localRunnerId: 'runner:missing-local',
        affinity: createChatgptAffinity(),
      },
      { control, runnersControl },
    );

    expect(evaluation).toMatchObject({
      decision: 'claimable-by-other-runner',
      mutationAllowed: false,
      selectedRunnerId: 'runner:alternate',
      localRunnerId: 'runner:missing-local',
      futureMutation: 'scheduler-claim',
      reason: 'runner runner:alternate is eligible, but this evaluator has no scheduler authority to assign it',
    });
  });

  it('blocks reassignment when a fresh active runner owns a fresh active lease', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-scheduler-authority-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_scheduler_fresh_lease'));
    await control.acquireLease({
      runId: 'team_run_scheduler_fresh_lease',
      leaseId: 'lease:fresh',
      ownerId: 'runner:lease-owner',
      acquiredAt: '2026-04-21T15:00:00.000Z',
      heartbeatAt: '2026-04-21T15:00:00.000Z',
      expiresAt: '2026-04-21T15:01:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:lease-owner'),
    });
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:alternate'),
    });

    const evaluation = await evaluateStoredExecutionRunSchedulerAuthority(
      {
        runId: 'team_run_scheduler_fresh_lease',
        now: '2026-04-21T15:00:30.000Z',
        localRunnerId: 'runner:alternate',
        affinity: createChatgptAffinity(),
      },
      { control, runnersControl },
    );

    expect(evaluation).toMatchObject({
      decision: 'blocked-active-lease',
      mutationAllowed: false,
      selectedRunnerId: 'runner:lease-owner',
      futureMutation: 'none',
      activeLease: {
        leaseId: 'lease:fresh',
        ownerId: 'runner:lease-owner',
        ownerStatus: 'active',
        ownerFreshness: 'fresh',
      },
    });
  });

  it('classifies expired stale lease ownership as potentially reassignable without mutating the run', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-scheduler-authority-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_scheduler_expired_stale'));
    await control.acquireLease({
      runId: 'team_run_scheduler_expired_stale',
      leaseId: 'lease:expired-stale',
      ownerId: 'runner:stale-owner',
      acquiredAt: '2026-04-21T15:00:00.000Z',
      heartbeatAt: '2026-04-21T15:00:00.000Z',
      expiresAt: '2026-04-21T15:00:10.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        ...createEligibleRunner('runner:stale-owner'),
        status: 'stale',
        expiresAt: '2026-04-21T15:00:10.000Z',
      }),
    });
    await runnersControl.registerRunner({
      runner: createEligibleRunner('runner:alternate'),
    });
    const before = await control.readRun('team_run_scheduler_expired_stale');

    const evaluation = await evaluateStoredExecutionRunSchedulerAuthority(
      {
        runId: 'team_run_scheduler_expired_stale',
        now: '2026-04-21T15:00:45.000Z',
        localRunnerId: 'runner:alternate',
        affinity: createChatgptAffinity(),
      },
      { control, runnersControl },
    );
    const after = await control.readRun('team_run_scheduler_expired_stale');

    expect(evaluation).toMatchObject({
      decision: 'reassignable-after-expired-lease',
      mutationAllowed: false,
      selectedRunnerId: 'runner:alternate',
      futureMutation: 'scheduler-reassign-expired-lease',
      activeLease: {
        leaseId: 'lease:expired-stale',
        ownerId: 'runner:stale-owner',
        ownerStatus: 'stale',
        ownerFreshness: 'stale',
      },
    });
    expect(after?.revision).toBe(before?.revision);
    expect(after?.bundle.leases[0]).toMatchObject({
      id: 'lease:expired-stale',
      status: 'active',
    });
  });

  it('reports missing browser capability as blocked missing capability', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-scheduler-authority-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_scheduler_missing_capability'));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:no-browser',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-21T14:59:00.000Z',
        lastHeartbeatAt: '2026-04-21T15:00:30.000Z',
        expiresAt: '2026-04-21T15:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: [],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: false,
      }),
    });

    const evaluation = await evaluateStoredExecutionRunSchedulerAuthority(
      {
        runId: 'team_run_scheduler_missing_capability',
        now: '2026-04-21T15:00:45.000Z',
        localRunnerId: 'runner:no-browser',
        affinity: createChatgptAffinity(),
      },
      { control, runnersControl },
    );

    expect(evaluation).toMatchObject({
      decision: 'blocked-missing-capability',
      mutationAllowed: false,
      selectedRunnerId: null,
      futureMutation: 'none',
      reason: 'runner runner:no-browser is not browser-capable',
    });
  });
});
