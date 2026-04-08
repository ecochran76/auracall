import type { ExecutionRunDispatchPlan } from './dispatcher.js';
import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecutionRunLease, ExecutionRunRecordBundle, ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

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

export interface ListStoredExecutionRunsInput {
  limit?: number;
  status?: ExecutionRunStatus;
  sourceKind?: ExecutionRunSourceKind;
}

export interface ExecutionRuntimeControlContract {
  createRun(bundle: ExecutionRunRecordBundle): Promise<ExecutionRunStoredRecord>;
  readRun(runId: string): Promise<ExecutionRunStoredRecord | null>;
  inspectRun(runId: string): Promise<ExecutionRunInspection | null>;
  listRuns(input?: ListStoredExecutionRunsInput): Promise<ExecutionRunStoredRecord[]>;
  acquireLease(input: AcquireStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  heartbeatLease(input: HeartbeatStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  releaseLease(input: ReleaseStoredExecutionRunLeaseInput): Promise<ExecutionRunStoredRecord>;
  expireLeases(input: ExpireStoredExecutionRunLeasesInput): Promise<ExecutionRunStoredRecord | null>;
}

export function getActiveExecutionRunLease(record: ExecutionRunStoredRecord): ExecutionRunLease | null {
  return record.bundle.leases.find((lease) => lease.status === 'active') ?? null;
}
