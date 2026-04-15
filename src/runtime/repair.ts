import type { ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import {
  evaluateStoredExecutionRunLeaseRunnerReconciliation,
  type EvaluateStoredExecutionRunLeaseRunnerReconciliationDeps,
  type ExecutionRunLeaseRunnerReconciliation,
} from './reconciliation.js';

export type ExecutionRunRepairPosture = 'inspect-only' | 'locally-reclaimable' | 'not-reclaimable';

export interface ExecutionRunRepairClassification {
  runId: string;
  posture: ExecutionRunRepairPosture;
  reason: string;
  reconciliation: ExecutionRunLeaseRunnerReconciliation;
}

export interface EvaluateStoredExecutionRunRepairClassificationInput {
  runId: string;
  now: string;
}

export interface RepairStoredExecutionRunLeaseInput extends EvaluateStoredExecutionRunRepairClassificationInput {}

export interface RepairStoredExecutionRunLeaseResult extends ExecutionRunRepairClassification {
  repaired: boolean;
}

export function classifyExecutionRunRepairPosture(input: {
  reconciliation: ExecutionRunLeaseRunnerReconciliation;
  now: string;
}): ExecutionRunRepairClassification {
  const { reconciliation } = input;

  switch (reconciliation.status) {
    case 'no-active-lease':
      return {
        runId: reconciliation.runId,
        posture: 'not-reclaimable',
        reason: 'run has no active lease to reclaim',
        reconciliation,
      };
    case 'active-runner':
      return {
        runId: reconciliation.runId,
        posture: 'not-reclaimable',
        reason: 'active lease is still owned by an active runner',
        reconciliation,
      };
    case 'stale-runner':
    case 'missing-runner': {
      if (reconciliation.leaseExpiresAt && reconciliation.leaseExpiresAt <= input.now) {
        return {
          runId: reconciliation.runId,
          posture: 'locally-reclaimable',
          reason: 'active lease owner is unavailable and the lease is expired',
          reconciliation,
        };
      }
      return {
        runId: reconciliation.runId,
        posture: 'inspect-only',
        reason: 'active lease owner is unavailable but the lease has not expired yet',
        reconciliation,
      };
    }
  }
}

export async function evaluateStoredExecutionRunRepairClassification(
  input: EvaluateStoredExecutionRunRepairClassificationInput,
  deps: EvaluateStoredExecutionRunLeaseRunnerReconciliationDeps = {},
): Promise<ExecutionRunRepairClassification | null> {
  const reconciliation = await evaluateStoredExecutionRunLeaseRunnerReconciliation(input.runId, deps);
  if (!reconciliation) return null;
  return classifyExecutionRunRepairPosture({
    reconciliation,
    now: input.now,
  });
}

export async function repairStoredExecutionRunLease(
  input: RepairStoredExecutionRunLeaseInput,
  deps: EvaluateStoredExecutionRunLeaseRunnerReconciliationDeps & {
    control?: ExecutionRuntimeControlContract;
  } = {},
): Promise<RepairStoredExecutionRunLeaseResult | null> {
  const control = deps.control ?? createExecutionRuntimeControl();
  const classification = await evaluateStoredExecutionRunRepairClassification(input, deps);
  if (!classification) return null;

  if (classification.posture !== 'locally-reclaimable') {
    return {
      ...classification,
      repaired: false,
    };
  }

  await control.expireLeases({
    runId: input.runId,
    now: input.now,
  });

  return {
    ...classification,
    repaired: true,
  };
}
