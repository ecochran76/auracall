import { createExecutionRunDispatchPlan, type ExecutionRunDispatchPlan } from './dispatcher.js';
import {
  acquireExecutionRunLease,
  expireExecutionRunLeases,
  heartbeatExecutionRunLease,
  releaseExecutionRunLease,
} from './lease.js';
import {
  createExecutionRunRecordStore,
  type ExecutionRunRecordStore,
  type ExecutionRunStoredRecord,
} from './store.js';
import type { ExecutionRunLease, ExecutionRunRecordBundle } from './types.js';

export interface ExecutionRunInspection {
  record: ExecutionRunStoredRecord;
  dispatchPlan: ExecutionRunDispatchPlan;
}

export interface AcquireStoredExecutionRunLeaseInput {
  runId: string;
  leaseId: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt?: string;
}

export interface HeartbeatStoredExecutionRunLeaseInput {
  runId: string;
  leaseId: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface ReleaseStoredExecutionRunLeaseInput {
  runId: string;
  leaseId: string;
  releasedAt: string;
  releaseReason?: string | null;
}

export interface ExpireStoredExecutionRunLeasesInput {
  runId: string;
  now: string;
}

export interface ExecutionRuntimeControl {
  createRun(bundle: ExecutionRunRecordBundle): Promise<ExecutionRunStoredRecord>;
  readRun(runId: string): Promise<ExecutionRunStoredRecord | null>;
  inspectRun(runId: string): Promise<ExecutionRunInspection | null>;
  acquireLease(input: AcquireStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  heartbeatLease(input: HeartbeatStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  releaseLease(input: ReleaseStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  expireLeases(input: ExpireStoredExecutionRunLeasesInput): Promise<ExecutionRunStoredRecord | null>;
}

export function createExecutionRuntimeControl(store: ExecutionRunRecordStore = createExecutionRunRecordStore()): ExecutionRuntimeControl {
  return {
    async createRun(bundle) {
      await store.ensureStorage();
      return store.writeRecord(bundle, { expectedRevision: 0 });
    },

    async readRun(runId) {
      return store.readRecord(runId);
    },

    async inspectRun(runId) {
      const record = await store.readRecord(runId);
      if (!record) return null;
      return {
        record,
        dispatchPlan: createExecutionRunDispatchPlan(record.bundle),
      };
    },

    async acquireLease(input) {
      const record = await requireStoredRecord(store, input.runId);
      const result = acquireExecutionRunLease({
        bundle: record.bundle,
        leaseId: input.leaseId,
        ownerId: input.ownerId,
        acquiredAt: input.acquiredAt,
        heartbeatAt: input.heartbeatAt,
        expiresAt: input.expiresAt,
      });
      return store.writeRecord(result.bundle, { expectedRevision: record.revision });
    },

    async heartbeatLease(input) {
      const record = await requireStoredRecord(store, input.runId);
      const result = heartbeatExecutionRunLease({
        bundle: record.bundle,
        leaseId: input.leaseId,
        heartbeatAt: input.heartbeatAt,
        expiresAt: input.expiresAt,
      });
      return store.writeRecord(result.bundle, { expectedRevision: record.revision });
    },

    async releaseLease(input) {
      const record = await requireStoredRecord(store, input.runId);
      const result = releaseExecutionRunLease({
        bundle: record.bundle,
        leaseId: input.leaseId,
        releasedAt: input.releasedAt,
        releaseReason: input.releaseReason,
      });
      return store.writeRecord(result.bundle, { expectedRevision: record.revision });
    },

    async expireLeases(input) {
      const record = await store.readRecord(input.runId);
      if (!record) return null;
      const result = expireExecutionRunLeases({
        bundle: record.bundle,
        now: input.now,
      });
      if (result.expiredLeaseIds.length === 0) return record;
      return store.writeRecord(result.bundle, { expectedRevision: record.revision });
    },
  };
}

async function requireStoredRecord(store: ExecutionRunRecordStore, runId: string): Promise<ExecutionRunStoredRecord> {
  const record = await store.readRecord(runId);
  if (!record) {
    throw new Error(`Execution run ${runId} was not found`);
  }
  return record;
}

export function getActiveExecutionRunLease(record: ExecutionRunStoredRecord): ExecutionRunLease | null {
  return record.bundle.leases.find((lease) => lease.status === 'active') ?? null;
}
