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
import { resumeExecutionRunAfterHumanEscalation } from './runner.js';
import type { ExecutionRunRecordBundle } from './types.js';
import type {
  AcquireStoredExecutionRunLeaseInput,
  ExecutionRuntimeControlContract,
  PersistStoredExecutionRunRecordInput,
  ExpireStoredExecutionRunLeasesInput,
  HeartbeatStoredExecutionRunLeaseInput,
  ListStoredExecutionRunsInput,
  ReleaseStoredExecutionRunLeaseInput,
} from './contract.js';

export function createExecutionRuntimeControl(
  store: ExecutionRunRecordStore = createExecutionRunRecordStore(),
): ExecutionRuntimeControlContract {
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

    async listRuns(input: ListStoredExecutionRunsInput = {}) {
      const bundles = await store.listBundles(input);
      const records = await Promise.all(bundles.map(async (bundle) => store.readRecord(bundle.run.id)));
      return records.filter((record): record is ExecutionRunStoredRecord => record !== null);
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

    async persistRun(input: PersistStoredExecutionRunRecordInput) {
      if (input.bundle.run.id !== input.runId) {
        throw new Error(
          `Execution run ${input.bundle.run.id} does not match persisted bundle identity ${input.runId}`,
        );
      }
      return store.writeRecord(input.bundle, {
        expectedRevision: input.expectedRevision,
      });
    },

    async resumeHumanEscalation(input) {
      const record = await requireStoredRecord(store, input.runId);
      const resumedBundle = resumeExecutionRunAfterHumanEscalation({
        bundle: record.bundle,
        resumedAt: input.resumedAt,
        note: input.note ?? null,
        guidance: input.guidance ?? null,
        override: input.override ?? null,
      });
      return store.writeRecord(resumedBundle, {
        expectedRevision: record.revision,
      });
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
