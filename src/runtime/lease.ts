import { ExecutionRunRecordBundleSchema } from './schema.js';
import { createExecutionRunEvent } from './model.js';
import type { ExecutionRunEvent, ExecutionRunLease, ExecutionRunRecordBundle } from './types.js';

export interface AcquireExecutionRunLeaseInput {
  bundle: ExecutionRunRecordBundle;
  leaseId: string;
  ownerId: string;
  acquiredAt: string;
  heartbeatAt?: string;
  expiresAt: string;
}

export interface HeartbeatExecutionRunLeaseInput {
  bundle: ExecutionRunRecordBundle;
  leaseId: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface ReleaseExecutionRunLeaseInput {
  bundle: ExecutionRunRecordBundle;
  leaseId: string;
  releasedAt: string;
  releaseReason?: string | null;
}

export interface ExpireExecutionRunLeaseInput {
  bundle: ExecutionRunRecordBundle;
  now: string;
}

export interface ExecutionRunLeaseMutationResult {
  bundle: ExecutionRunRecordBundle;
  lease: ExecutionRunLease;
  event: ExecutionRunEvent;
}

export interface ExpireExecutionRunLeasesResult {
  bundle: ExecutionRunRecordBundle;
  expiredLeaseIds: string[];
  events: ExecutionRunEvent[];
}

export function acquireExecutionRunLease(input: AcquireExecutionRunLeaseInput): ExecutionRunLeaseMutationResult {
  const bundle = ExecutionRunRecordBundleSchema.parse(input.bundle);
  const conflicting = bundle.leases.find((lease) => lease.status === 'active');
  if (conflicting) {
    throw new Error(`Execution run ${bundle.run.id} already has active lease ${conflicting.id}`);
  }

  const lease: ExecutionRunLease = {
    id: input.leaseId,
    runId: bundle.run.id,
    ownerId: input.ownerId,
    status: 'active',
    acquiredAt: input.acquiredAt,
    heartbeatAt: input.heartbeatAt ?? input.acquiredAt,
    expiresAt: input.expiresAt,
    releasedAt: null,
    releaseReason: null,
  };

  const event = createExecutionRunEvent({
    id: `${bundle.run.id}:event:${lease.id}:lease-acquired`,
    runId: bundle.run.id,
    type: 'lease-acquired',
    createdAt: input.acquiredAt,
    leaseId: lease.id,
    note: `lease acquired by ${lease.ownerId}`,
    payload: {
      ownerId: lease.ownerId,
      expiresAt: lease.expiresAt,
    },
  });

  return {
    lease,
    event,
    bundle: appendLeaseMutation(bundle, lease, event, input.acquiredAt),
  };
}

export function heartbeatExecutionRunLease(input: HeartbeatExecutionRunLeaseInput): ExecutionRunLeaseMutationResult {
  const bundle = ExecutionRunRecordBundleSchema.parse(input.bundle);
  const existing = requireLease(bundle, input.leaseId);
  if (existing.status !== 'active') {
    throw new Error(`Execution lease ${existing.id} is not active`);
  }

  const lease: ExecutionRunLease = {
    ...existing,
    heartbeatAt: input.heartbeatAt,
    expiresAt: input.expiresAt,
  };

  const event = createExecutionRunEvent({
    id: `${bundle.run.id}:event:${lease.id}:lease-heartbeat:${input.heartbeatAt}`,
    runId: bundle.run.id,
    type: 'note-added',
    createdAt: input.heartbeatAt,
    leaseId: lease.id,
    note: `lease heartbeat from ${lease.ownerId}`,
    payload: {
      ownerId: lease.ownerId,
      expiresAt: lease.expiresAt,
    },
  });

  return {
    lease,
    event,
    bundle: replaceLeaseMutation(bundle, lease, event, input.heartbeatAt),
  };
}

export function releaseExecutionRunLease(input: ReleaseExecutionRunLeaseInput): ExecutionRunLeaseMutationResult {
  const bundle = ExecutionRunRecordBundleSchema.parse(input.bundle);
  const existing = requireLease(bundle, input.leaseId);
  if (existing.status !== 'active') {
    throw new Error(`Execution lease ${existing.id} is not active`);
  }

  const lease: ExecutionRunLease = {
    ...existing,
    status: 'released',
    releasedAt: input.releasedAt,
    releaseReason: input.releaseReason ?? null,
  };

  const event = createExecutionRunEvent({
    id: `${bundle.run.id}:event:${lease.id}:lease-released`,
    runId: bundle.run.id,
    type: 'lease-released',
    createdAt: input.releasedAt,
    leaseId: lease.id,
    note: lease.releaseReason ? `lease released: ${lease.releaseReason}` : 'lease released',
    payload: {
      ownerId: lease.ownerId,
      releaseReason: lease.releaseReason,
    },
  });

  return {
    lease,
    event,
    bundle: replaceLeaseMutation(bundle, lease, event, input.releasedAt),
  };
}

export function expireExecutionRunLeases(input: ExpireExecutionRunLeaseInput): ExpireExecutionRunLeasesResult {
  const bundle = ExecutionRunRecordBundleSchema.parse(input.bundle);
  const expiredLeaseIds: string[] = [];
  const events: ExecutionRunEvent[] = [];
  const leases = bundle.leases.map((lease) => {
    if (lease.status !== 'active') return lease;
    if (lease.expiresAt > input.now) return lease;
    expiredLeaseIds.push(lease.id);
    const nextLease: ExecutionRunLease = {
      ...lease,
      status: 'expired',
      releasedAt: input.now,
      releaseReason: 'lease expired',
    };
    events.push(
      createExecutionRunEvent({
        id: `${bundle.run.id}:event:${lease.id}:lease-expired`,
        runId: bundle.run.id,
        type: 'lease-released',
        createdAt: input.now,
        leaseId: lease.id,
        note: 'lease expired',
        payload: {
          ownerId: lease.ownerId,
          previousExpiresAt: lease.expiresAt,
        },
      }),
    );
    return nextLease;
  });

  if (events.length === 0) {
    return {
      bundle,
      expiredLeaseIds,
      events,
    };
  }

  return {
    expiredLeaseIds,
    events,
    bundle: ExecutionRunRecordBundleSchema.parse({
      ...bundle,
      run: {
        ...bundle.run,
        updatedAt: input.now,
      },
      leases,
      events: [...bundle.events, ...events],
      sharedState: {
        ...bundle.sharedState,
        history: [...bundle.sharedState.history, ...events],
        lastUpdatedAt: input.now,
      },
    }),
  };
}

function requireLease(bundle: ExecutionRunRecordBundle, leaseId: string): ExecutionRunLease {
  const lease = bundle.leases.find((entry) => entry.id === leaseId);
  if (!lease) {
    throw new Error(`Execution lease ${leaseId} was not found in run ${bundle.run.id}`);
  }
  return lease;
}

function appendLeaseMutation(
  bundle: ExecutionRunRecordBundle,
  lease: ExecutionRunLease,
  event: ExecutionRunEvent,
  updatedAt: string,
): ExecutionRunRecordBundle {
  return ExecutionRunRecordBundleSchema.parse({
    ...bundle,
    run: {
      ...bundle.run,
      updatedAt,
    },
    leases: [...bundle.leases, lease],
    events: [...bundle.events, event],
    sharedState: {
      ...bundle.sharedState,
      history: [...bundle.sharedState.history, event],
      lastUpdatedAt: updatedAt,
    },
  });
}

function replaceLeaseMutation(
  bundle: ExecutionRunRecordBundle,
  lease: ExecutionRunLease,
  event: ExecutionRunEvent,
  updatedAt: string,
): ExecutionRunRecordBundle {
  return ExecutionRunRecordBundleSchema.parse({
    ...bundle,
    run: {
      ...bundle.run,
      updatedAt,
    },
    leases: bundle.leases.map((entry) => (entry.id === lease.id ? lease : entry)),
    events: [...bundle.events, event],
    sharedState: {
      ...bundle.sharedState,
      history: [...bundle.sharedState.history, event],
      lastUpdatedAt: updatedAt,
    },
  });
}
