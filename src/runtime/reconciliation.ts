import { getActiveExecutionRunLease, type ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import { createExecutionRunnerControl, type ExecutionRunnerControlContract } from './runnersControl.js';
import type { ExecutionRunnerRecord } from './types.js';

export type ExecutionRunLeaseRunnerReconciliationStatus =
  | 'no-active-lease'
  | 'active-runner'
  | 'stale-runner'
  | 'missing-runner';

export interface ExecutionRunLeaseRunnerReconciliation {
  runId: string;
  leaseId: string | null;
  leaseOwnerId: string | null;
  leaseExpiresAt: string | null;
  status: ExecutionRunLeaseRunnerReconciliationStatus;
  reason: string | null;
  runner: ExecutionRunnerRecord | null;
}

export interface EvaluateStoredExecutionRunLeaseRunnerReconciliationDeps {
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
}

export function reconcileExecutionRunLeaseRunner(input: {
  runId: string;
  leaseId?: string | null;
  leaseOwnerId?: string | null;
  leaseExpiresAt?: string | null;
  runner?: ExecutionRunnerRecord | null;
}): ExecutionRunLeaseRunnerReconciliation {
  if (!input.leaseId || !input.leaseOwnerId) {
    return {
      runId: input.runId,
      leaseId: null,
      leaseOwnerId: null,
      leaseExpiresAt: null,
      status: 'no-active-lease',
      reason: 'run has no active lease',
      runner: null,
    };
  }

  if (!input.runner) {
    return {
      runId: input.runId,
      leaseId: input.leaseId,
      leaseOwnerId: input.leaseOwnerId,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      status: 'missing-runner',
      reason: `lease owner ${input.leaseOwnerId} has no persisted runner record`,
      runner: null,
    };
  }

  if (input.runner.status !== 'active') {
    return {
      runId: input.runId,
      leaseId: input.leaseId,
      leaseOwnerId: input.leaseOwnerId,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      status: 'stale-runner',
      reason: `lease owner ${input.leaseOwnerId} is stale`,
      runner: input.runner,
    };
  }

  return {
    runId: input.runId,
    leaseId: input.leaseId,
    leaseOwnerId: input.leaseOwnerId,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
    status: 'active-runner',
    reason: null,
    runner: input.runner,
  };
}

export async function evaluateStoredExecutionRunLeaseRunnerReconciliation(
  runId: string,
  deps: EvaluateStoredExecutionRunLeaseRunnerReconciliationDeps = {},
): Promise<ExecutionRunLeaseRunnerReconciliation | null> {
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();

  const record = await control.readRun(runId);
  if (!record) return null;

  const lease = getActiveExecutionRunLease(record);
  if (!lease) {
    return reconcileExecutionRunLeaseRunner({
      runId,
    });
  }

  const runnerRecord = await runnersControl.readRunner(lease.ownerId);

  return reconcileExecutionRunLeaseRunner({
    runId,
    leaseId: lease.id,
    leaseOwnerId: lease.ownerId,
    leaseExpiresAt: lease.expiresAt,
    runner: runnerRecord?.runner ?? null,
  });
}
