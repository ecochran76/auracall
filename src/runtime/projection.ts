import { getActiveExecutionRunLease, type ExecutionRunInspection } from './contract.js';
import { recoverStrandedRunningExecutionRun } from './runner.js';
import type { ExecutionRunAffinityRecord, ExecutionRunnerRecord, ExecutionRunServiceId } from './types.js';

export type ExecutionRunQueueState =
  | 'runnable'
  | 'waiting'
  | 'active-lease'
  | 'recoverable-stranded'
  | 'stranded'
  | 'idle';

export type ExecutionRunClaimState =
  | 'claimable'
  | 'held-by-lease'
  | 'blocked-affinity'
  | 'not-ready'
  | 'idle';

export type ExecutionRunAffinityStatus = 'not-evaluated' | 'eligible' | 'blocked-mismatch';

export interface ExecutionRunAffinityProjection {
  status: ExecutionRunAffinityStatus;
  reason: string | null;
  requiredService: ExecutionRunServiceId;
  requiredServiceAccountId: string | null;
  browserRequired: boolean;
  requiredRuntimeProfileId: string | null;
  requiredBrowserProfileId: string | null;
  hostRequirement: ExecutionRunAffinityRecord['hostRequirement'];
  requiredHostId: string | null;
  eligibilityNote: string | null;
}

export interface ExecutionRunQueueProjection {
  runId: string;
  sourceKind: ExecutionRunInspection['record']['bundle']['run']['sourceKind'];
  runStatus: ExecutionRunInspection['record']['bundle']['run']['status'];
  createdAt: string;
  updatedAt: string;
  queueState: ExecutionRunQueueState;
  claimState: ExecutionRunClaimState;
  nextRunnableStepId: string | null;
  runningStepIds: string[];
  waitingStepIds: string[];
  deferredStepIds: string[];
  blockedStepIds: string[];
  blockedByFailureStepIds: string[];
  terminalStepIds: string[];
  missingDependencyStepIds: string[];
  activeLeaseId: string | null;
  activeLeaseOwnerId: string | null;
  affinity: ExecutionRunAffinityProjection;
}

export interface CreateExecutionRunQueueProjectionOptions {
  affinity?: ExecutionRunAffinityRecord | null;
  runner?: ExecutionRunnerRecord | null;
  evaluateAffinity?: (input: ExecutionRunInspection) => Partial<ExecutionRunAffinityProjection> | null | undefined;
}

export function createExecutionRunQueueProjection(
  input: ExecutionRunInspection,
  options: CreateExecutionRunQueueProjectionOptions = {},
): ExecutionRunQueueProjection {
  const activeLease = getActiveExecutionRunLease(input.record);
  const affinity = createExecutionRunAffinityProjection(input, options);
  const queueState = classifyExecutionRunQueueState(input);
  const claimState = classifyExecutionRunClaimState({
    queueState,
    affinity,
  });

  return {
    runId: input.record.runId,
    sourceKind: input.record.bundle.run.sourceKind,
    runStatus: input.record.bundle.run.status,
    createdAt: input.record.bundle.run.createdAt,
    updatedAt: input.record.bundle.run.updatedAt,
    queueState,
    claimState,
    nextRunnableStepId: input.dispatchPlan.nextRunnableStepId,
    runningStepIds: input.dispatchPlan.runningStepIds.slice(),
    waitingStepIds: input.dispatchPlan.waitingStepIds.slice(),
    deferredStepIds: input.dispatchPlan.deferredStepIds.slice(),
    blockedStepIds: input.dispatchPlan.blockedStepIds.slice(),
    blockedByFailureStepIds: input.dispatchPlan.blockedByFailureStepIds.slice(),
    terminalStepIds: input.dispatchPlan.terminalStepIds.slice(),
    missingDependencyStepIds: input.dispatchPlan.missingDependencyStepIds.slice(),
    activeLeaseId: activeLease?.id ?? null,
    activeLeaseOwnerId: activeLease?.ownerId ?? null,
    affinity,
  };
}

function createExecutionRunAffinityProjection(
  input: ExecutionRunInspection,
  options: CreateExecutionRunQueueProjectionOptions,
): ExecutionRunAffinityProjection {
  const firstActiveStep =
    input.dispatchPlan.steps.find((step) => step.id === input.dispatchPlan.nextRunnableStepId) ??
    input.dispatchPlan.steps.find((step) => input.dispatchPlan.runningStepIds.includes(step.id)) ??
    null;
  const affinityRecord = options.affinity ?? null;

  const base: ExecutionRunAffinityProjection = {
    status: 'not-evaluated',
    reason: null,
    requiredService: affinityRecord?.service ?? firstActiveStep?.service ?? null,
    requiredServiceAccountId: affinityRecord?.serviceAccountId ?? null,
    browserRequired: affinityRecord?.browserRequired ?? Boolean(firstActiveStep?.browserProfileId),
    requiredRuntimeProfileId: affinityRecord?.runtimeProfileId ?? firstActiveStep?.runtimeProfileId ?? null,
    requiredBrowserProfileId: affinityRecord?.browserProfileId ?? firstActiveStep?.browserProfileId ?? null,
    hostRequirement: affinityRecord?.hostRequirement ?? 'any',
    requiredHostId: affinityRecord?.requiredHostId ?? null,
    eligibilityNote: affinityRecord?.eligibilityNote ?? null,
  };

  const runnerEvaluated = evaluateRunnerAffinity(base, options.runner);
  const merged = runnerEvaluated ? { ...base, ...runnerEvaluated } : base;
  if (!runnerEvaluated && !options.evaluateAffinity) {
    return merged;
  }
  if (!options.evaluateAffinity) return merged;
  const callbackEvaluated = options.evaluateAffinity(input);
  if (!callbackEvaluated) {
    return merged;
  }

  return {
    ...merged,
    ...callbackEvaluated,
    status: callbackEvaluated.status ?? merged.status,
    reason: callbackEvaluated.reason ?? merged.reason,
  };
}

function evaluateRunnerAffinity(
  affinity: ExecutionRunAffinityProjection,
  runner: ExecutionRunnerRecord | null | undefined,
): Partial<ExecutionRunAffinityProjection> | null {
  if (!runner) return null;

  if (runner.status !== 'active') {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} heartbeat is not active`,
    };
  }

  if (affinity.requiredHostId && runner.hostId !== affinity.requiredHostId) {
    return {
      status: 'blocked-mismatch',
      reason: `runner host ${runner.hostId} does not match required host ${affinity.requiredHostId}`,
    };
  }

  if (affinity.requiredService && !runner.serviceIds.includes(affinity.requiredService)) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} does not support service ${affinity.requiredService}`,
    };
  }

  if (affinity.requiredRuntimeProfileId && !runner.runtimeProfileIds.includes(affinity.requiredRuntimeProfileId)) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} does not expose runtime profile ${affinity.requiredRuntimeProfileId}`,
    };
  }

  if (affinity.browserRequired && !runner.browserCapable) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} is not browser-capable`,
    };
  }

  if (affinity.requiredBrowserProfileId && !runner.browserProfileIds.includes(affinity.requiredBrowserProfileId)) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} does not expose browser profile ${affinity.requiredBrowserProfileId}`,
    };
  }

  if (affinity.requiredServiceAccountId && !runner.serviceAccountIds.includes(affinity.requiredServiceAccountId)) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} does not expose service account ${affinity.requiredServiceAccountId}`,
    };
  }

  if (affinity.hostRequirement === 'same-host' && affinity.requiredHostId && runner.hostId !== affinity.requiredHostId) {
    return {
      status: 'blocked-mismatch',
      reason: `runner ${runner.id} is not on the required host`,
    };
  }

  return {
    status: 'eligible',
    reason: null,
  };
}

function classifyExecutionRunQueueState(input: ExecutionRunInspection): ExecutionRunQueueState {
  if (getActiveExecutionRunLease(input.record)) {
    return 'active-lease';
  }
  if (input.dispatchPlan.nextRunnableStepId) {
    return 'runnable';
  }
  if (input.dispatchPlan.runningStepIds.length > 0) {
    return canRecoverStrandedExecutionRun(input) ? 'recoverable-stranded' : 'stranded';
  }
  if (
    input.dispatchPlan.waitingStepIds.length > 0 ||
    input.dispatchPlan.blockedStepIds.length > 0 ||
    input.dispatchPlan.blockedByFailureStepIds.length > 0 ||
    input.dispatchPlan.deferredStepIds.length > 0
  ) {
    return 'waiting';
  }
  return 'idle';
}

function classifyExecutionRunClaimState(input: {
  queueState: ExecutionRunQueueState;
  affinity: ExecutionRunAffinityProjection;
}): ExecutionRunClaimState {
  if (input.queueState === 'active-lease') {
    return 'held-by-lease';
  }
  if (
    (input.queueState === 'runnable' || input.queueState === 'recoverable-stranded') &&
    input.affinity.status === 'blocked-mismatch'
  ) {
    return 'blocked-affinity';
  }
  if (input.queueState === 'runnable' || input.queueState === 'recoverable-stranded') {
    return 'claimable';
  }
  if (input.queueState === 'idle') {
    return 'idle';
  }
  return 'not-ready';
}

function canRecoverStrandedExecutionRun(input: ExecutionRunInspection): boolean {
  const recovered = recoverStrandedRunningExecutionRun({
    record: input.record,
  });
  return Boolean(recovered && recovered.recoveredStepIds.length > 0);
}
