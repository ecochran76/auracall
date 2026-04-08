import { describe, expect, it } from 'vitest';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import {
  acquireExecutionRunLease,
  expireExecutionRunLeases,
  heartbeatExecutionRunLease,
  releaseExecutionRunLease,
} from '../src/runtime/lease.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createBundle() {
  return createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId: 'team_run_lease',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_lease:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Lease probe',
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

describe('runtime lease helpers', () => {
  it('acquires one active lease and records a lease event', () => {
    const result = acquireExecutionRunLease({
      bundle: createBundle(),
      leaseId: 'lease_1',
      ownerId: 'runner:local-1',
      acquiredAt: '2026-04-07T00:01:00.000Z',
      expiresAt: '2026-04-07T00:02:00.000Z',
    });

    expect(result.lease.status).toBe('active');
    expect(result.bundle.leases).toHaveLength(1);
    expect(result.bundle.events.at(-1)?.type).toBe('lease-acquired');
    expect(result.bundle.sharedState.history.at(-1)?.type).toBe('lease-acquired');
  });

  it('rejects a second active lease for the same run', () => {
    const acquired = acquireExecutionRunLease({
      bundle: createBundle(),
      leaseId: 'lease_1',
      ownerId: 'runner:local-1',
      acquiredAt: '2026-04-07T00:01:00.000Z',
      expiresAt: '2026-04-07T00:02:00.000Z',
    });

    expect(() =>
      acquireExecutionRunLease({
        bundle: acquired.bundle,
        leaseId: 'lease_2',
        ownerId: 'runner:local-2',
        acquiredAt: '2026-04-07T00:01:30.000Z',
        expiresAt: '2026-04-07T00:02:30.000Z',
      }),
    ).toThrow(/already has active lease/);
  });

  it('heartbeats and releases an active lease', () => {
    const acquired = acquireExecutionRunLease({
      bundle: createBundle(),
      leaseId: 'lease_1',
      ownerId: 'runner:local-1',
      acquiredAt: '2026-04-07T00:01:00.000Z',
      expiresAt: '2026-04-07T00:02:00.000Z',
    });

    const heartbeated = heartbeatExecutionRunLease({
      bundle: acquired.bundle,
      leaseId: 'lease_1',
      heartbeatAt: '2026-04-07T00:01:30.000Z',
      expiresAt: '2026-04-07T00:02:30.000Z',
    });

    expect(heartbeated.lease.heartbeatAt).toBe('2026-04-07T00:01:30.000Z');
    expect(heartbeated.lease.expiresAt).toBe('2026-04-07T00:02:30.000Z');
    expect(heartbeated.bundle.events.at(-1)?.type).toBe('note-added');

    const released = releaseExecutionRunLease({
      bundle: heartbeated.bundle,
      leaseId: 'lease_1',
      releasedAt: '2026-04-07T00:01:45.000Z',
      releaseReason: 'completed step',
    });

    expect(released.lease.status).toBe('released');
    expect(released.lease.releaseReason).toBe('completed step');
    expect(released.bundle.events.at(-1)?.type).toBe('lease-released');
  });

  it('expires overdue active leases without touching released ones', () => {
    const acquired = acquireExecutionRunLease({
      bundle: createBundle(),
      leaseId: 'lease_1',
      ownerId: 'runner:local-1',
      acquiredAt: '2026-04-07T00:01:00.000Z',
      expiresAt: '2026-04-07T00:02:00.000Z',
    });

    const expired = expireExecutionRunLeases({
      bundle: acquired.bundle,
      now: '2026-04-07T00:03:00.000Z',
    });

    expect(expired.expiredLeaseIds).toEqual(['lease_1']);
    expect(expired.bundle.leases[0]?.status).toBe('expired');
    expect(expired.events).toHaveLength(1);

    const noFurtherChange = expireExecutionRunLeases({
      bundle: expired.bundle,
      now: '2026-04-07T00:04:00.000Z',
    });

    expect(noFurtherChange.expiredLeaseIds).toEqual([]);
    expect(noFurtherChange.events).toEqual([]);
  });
});
