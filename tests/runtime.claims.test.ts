import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  evaluateStoredExecutionRunClaimCandidates,
  selectStoredExecutionRunLocalClaim,
} from '../src/runtime/claims.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunAffinityRecord, createExecutionRunnerRecord } from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createRunnableBundle(runId = 'team_run_claims') {
  return createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId,
      teamId: 'ops',
      createdAt: '2026-04-11T10:30:00.000Z',
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
            prompt: 'Claim candidate evaluation',
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

describe('runtime claim candidates', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('evaluates persisted runners against one persisted runnable run', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-claims-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_claims_match'));

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:eligible',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:29:00.000Z',
        expiresAt: '2026-04-11T10:31:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:blocked',
        hostId: 'host:linux-2',
        startedAt: '2026-04-11T10:29:00.000Z',
        expiresAt: '2026-04-11T10:31:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['linux-chrome'],
        serviceAccountIds: ['acct_other'],
        browserCapable: true,
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale',
        hostId: 'host:wsl-dev-1',
        status: 'stale',
        startedAt: '2026-04-11T10:29:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:29:30.000Z',
        expiresAt: '2026-04-11T10:29:45.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
      }),
    });

    const result = await evaluateStoredExecutionRunClaimCandidates(
      {
        runId: 'team_run_claims_match',
        affinity: createExecutionRunAffinityRecord({
          service: 'chatgpt',
          serviceAccountId: 'acct_chatgpt_default',
          browserRequired: true,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          hostRequirement: 'same-host',
          requiredHostId: 'host:wsl-dev-1',
        }),
      },
      { control, runnersControl },
    );

    expect(result?.queue.claimState).toBe('claimable');
    expect(result?.candidates.map((entry) => ({ runnerId: entry.runnerId, status: entry.status }))).toEqual([
      { runnerId: 'runner:eligible', status: 'eligible' },
      { runnerId: 'runner:blocked', status: 'blocked-affinity' },
      { runnerId: 'runner:stale', status: 'stale-runner' },
    ]);
  });

  it('returns not-ready candidates when the run itself is not claimable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-claims-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const bundle = createRunnableBundle('team_run_claims_leased');
    bundle.leases.push({
      id: 'team_run_claims_leased:lease:1',
      runId: 'team_run_claims_leased',
      ownerId: 'host:busy',
      status: 'active',
      acquiredAt: '2026-04-11T10:30:00.000Z',
      heartbeatAt: '2026-04-11T10:30:00.000Z',
      expiresAt: '2026-04-11T10:31:00.000Z',
      releasedAt: null,
      releaseReason: null,
    });
    await control.createRun(bundle);
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:eligible',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:29:00.000Z',
        expiresAt: '2026-04-11T10:31:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const result = await evaluateStoredExecutionRunClaimCandidates(
      { runId: 'team_run_claims_leased' },
      { control, runnersControl },
    );

    expect(result?.queue.claimState).toBe('held-by-lease');
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]).toMatchObject({
      runnerId: 'runner:eligible',
      status: 'not-ready',
      reason: 'run is held-by-lease',
    });
  });


  it('selects the configured eligible local runner for a runnable run', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-claims-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_claims_local_select'));

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:local-eligible',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:29:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:30:00.000Z',
        expiresAt: '2026-04-11T10:31:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
      }),
    });

    const result = await selectStoredExecutionRunLocalClaim(
      {
        runId: 'team_run_claims_local_select',
        runnerId: 'runner:local-eligible',
        now: '2026-04-11T10:30:30.000Z',
        affinity: createExecutionRunAffinityRecord({
          service: 'chatgpt',
          serviceAccountId: 'acct_chatgpt_default',
          browserRequired: true,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          hostRequirement: 'same-host',
          requiredHostId: 'host:wsl-dev-1',
        }),
      },
      { control, runnersControl },
    );

    expect(result).toMatchObject({
      runId: 'team_run_claims_local_select',
      runnerId: 'runner:local-eligible',
      hostId: 'host:wsl-dev-1',
      status: 'eligible',
      selected: true,
      reason: null,
      queueState: 'runnable',
      claimState: 'claimable',
      affinityStatus: 'eligible',
      affinityReason: null,
    });
  });

  it('does not select a configured local runner when the run is not claimable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-claims-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const bundle = createRunnableBundle('team_run_claims_local_blocked');
    bundle.leases.push({
      id: 'team_run_claims_local_blocked:lease:1',
      runId: 'team_run_claims_local_blocked',
      ownerId: 'host:busy',
      status: 'active',
      acquiredAt: '2026-04-11T10:30:00.000Z',
      heartbeatAt: '2026-04-11T10:30:00.000Z',
      expiresAt: '2026-04-11T10:31:00.000Z',
      releasedAt: null,
      releaseReason: null,
    });
    await control.createRun(bundle);
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:local-busy',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:29:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:30:00.000Z',
        expiresAt: '2026-04-11T10:31:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const result = await selectStoredExecutionRunLocalClaim(
      {
        runId: 'team_run_claims_local_blocked',
        runnerId: 'runner:local-busy',
        now: '2026-04-11T10:30:30.000Z',
      },
      { control, runnersControl },
    );

    expect(result).toMatchObject({
      runId: 'team_run_claims_local_blocked',
      runnerId: 'runner:local-busy',
      status: 'not-ready',
      selected: false,
      reason: 'run is held-by-lease',
      queueState: 'active-lease',
      claimState: 'held-by-lease',
    });
  });

  it('reflects runner expiry sweep in later claim-candidate evaluation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-claims-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await control.createRun(createRunnableBundle('team_run_claims_expiry'));

    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:will-expire',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:29:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:29:30.000Z',
        expiresAt: '2026-04-11T10:29:45.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
      }),
    });

    await runnersControl.expireRunners({
      now: '2026-04-11T10:30:30.000Z',
      eligibilityNote: 'expired by bounded runner sweep',
    });

    const result = await evaluateStoredExecutionRunClaimCandidates(
      {
        runId: 'team_run_claims_expiry',
        affinity: createExecutionRunAffinityRecord({
          service: 'chatgpt',
          serviceAccountId: 'acct_chatgpt_default',
          browserRequired: true,
          runtimeProfileId: 'default',
          browserProfileId: 'wsl-chrome-2',
          hostRequirement: 'same-host',
          requiredHostId: 'host:wsl-dev-1',
        }),
      },
      { control, runnersControl },
    );

    expect(result?.queue.claimState).toBe('claimable');
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]).toMatchObject({
      runnerId: 'runner:will-expire',
      status: 'stale-runner',
      reason: 'runner runner:will-expire heartbeat is not active',
    });
  });
});
