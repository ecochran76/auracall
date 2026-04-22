import { getActiveExecutionRunLease, type ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import {
  createExecutionRunClaimCandidates,
  type ExecutionRunClaimCandidate,
} from './claims.js';
import { createExecutionRunQueueProjection, type ExecutionRunQueueProjection } from './projection.js';
import { createExecutionRunnerControl, type ExecutionRunnerControlContract } from './runnersControl.js';
import type { ExecutionRunAffinityRecord, ExecutionRunnerRecord } from './types.js';

export type ExecutionRunSchedulerAuthorityDecision =
  | 'no-op'
  | 'claimable-by-local-runner'
  | 'claimable-by-other-runner'
  | 'reassignable-after-expired-lease'
  | 'blocked-active-lease'
  | 'blocked-affinity'
  | 'blocked-missing-capability'
  | 'blocked-human-state'
  | 'not-ready';

export interface ExecutionRunSchedulerAuthorityEvaluation {
  runId: string;
  decision: ExecutionRunSchedulerAuthorityDecision;
  reason: string;
  mutationAllowed: false;
  selectedRunnerId: string | null;
  localRunnerId: string | null;
  queue: ExecutionRunQueueProjection;
  activeLease: {
    leaseId: string;
    ownerId: string;
    expiresAt: string;
    ownerStatus: ExecutionRunnerRecord['status'] | 'missing';
    ownerFreshness: 'fresh' | 'expired' | 'stale' | 'missing';
  } | null;
  candidates: ExecutionRunClaimCandidate[];
  futureMutation:
    | 'none'
    | 'local-claim'
    | 'scheduler-claim'
    | 'scheduler-reassign-expired-lease';
}

export interface EvaluateStoredExecutionRunSchedulerAuthorityInput {
  runId: string;
  now: string;
  localRunnerId?: string | null;
  affinity?: ExecutionRunAffinityRecord | null;
}

export interface EvaluateStoredExecutionRunSchedulerAuthorityDeps {
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
}

export async function evaluateStoredExecutionRunSchedulerAuthority(
  input: EvaluateStoredExecutionRunSchedulerAuthorityInput,
  deps: EvaluateStoredExecutionRunSchedulerAuthorityDeps = {},
): Promise<ExecutionRunSchedulerAuthorityEvaluation | null> {
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();
  const inspection = await control.inspectRun(input.runId);
  if (!inspection) return null;

  const runnerRecords = await runnersControl.listRunners();
  const runners = runnerRecords.map((record) => record.runner);
  const queue = createExecutionRunQueueProjection(inspection, {
    affinity: input.affinity ?? null,
  });
  const candidates = createExecutionRunClaimCandidates(queue, {
    inspection,
    options: {
      affinity: input.affinity ?? null,
      runners,
    },
  });
  const activeLease = getActiveExecutionRunLease(inspection.record);

  if (activeLease) {
    const leaseOwner = runners.find((runner) => runner.id === activeLease.ownerId) ?? null;
    const leaseOwnerFreshness = classifyLeaseOwnerFreshness({
      leaseOwner,
      leaseExpiresAt: activeLease.expiresAt,
      now: input.now,
    });
    const projectedActiveLease: ExecutionRunSchedulerAuthorityEvaluation['activeLease'] = {
      leaseId: activeLease.id,
      ownerId: activeLease.ownerId,
      expiresAt: activeLease.expiresAt,
      ownerStatus: leaseOwner?.status ?? 'missing',
      ownerFreshness: leaseOwnerFreshness,
    };

    if (
      activeLease.expiresAt <= input.now &&
      (leaseOwnerFreshness === 'stale' || leaseOwnerFreshness === 'missing')
    ) {
      const reassignmentCandidates = createReassignmentClaimCandidates({
        inspection,
        activeLeaseId: activeLease.id,
        affinity: input.affinity ?? null,
        runners,
      });
      const selectedCandidate = reassignmentCandidates.find((candidate) => candidate.status === 'eligible') ?? null;
      return {
        runId: inspection.record.runId,
        decision: 'reassignable-after-expired-lease',
        reason: leaseOwner
          ? `active lease ${activeLease.id} is expired and owner ${activeLease.ownerId} is stale`
          : `active lease ${activeLease.id} is expired and owner ${activeLease.ownerId} is missing`,
        mutationAllowed: false,
        selectedRunnerId: selectedCandidate?.runnerId ?? null,
        localRunnerId: input.localRunnerId ?? null,
        queue,
        activeLease: projectedActiveLease,
        candidates,
        futureMutation: 'scheduler-reassign-expired-lease',
      };
    }

    return {
      runId: inspection.record.runId,
      decision: 'blocked-active-lease',
      reason: createActiveLeaseBlockedReason(activeLease.id, activeLease.ownerId, leaseOwnerFreshness),
      mutationAllowed: false,
      selectedRunnerId: activeLease.ownerId,
      localRunnerId: input.localRunnerId ?? null,
      queue,
      activeLease: projectedActiveLease,
      candidates,
      futureMutation: 'none',
    };
  }

  if (queue.claimState === 'idle') {
    return createNoMutationEvaluation({
      decision: 'no-op',
      reason: 'run is idle',
      selectedRunnerId: null,
      futureMutation: 'none',
      input,
      queue,
      candidates,
    });
  }

  if (queue.claimState !== 'claimable') {
    return createNoMutationEvaluation({
      decision: queue.claimState === 'blocked-affinity' ? 'blocked-affinity' : 'not-ready',
      reason: `run is ${queue.claimState}`,
      selectedRunnerId: null,
      futureMutation: 'none',
      input,
      queue,
      candidates,
    });
  }

  const localCandidate = input.localRunnerId
    ? candidates.find((candidate) => candidate.runnerId === input.localRunnerId) ?? null
    : null;
  if (localCandidate?.status === 'eligible') {
    return createNoMutationEvaluation({
      decision: 'claimable-by-local-runner',
      reason: `local runner ${localCandidate.runnerId} is eligible to claim the run`,
      selectedRunnerId: localCandidate.runnerId,
      futureMutation: 'local-claim',
      input,
      queue,
      candidates,
    });
  }

  const eligibleCandidate = candidates.find((candidate) => candidate.status === 'eligible') ?? null;
  if (eligibleCandidate) {
    return createNoMutationEvaluation({
      decision: 'claimable-by-other-runner',
      reason: `runner ${eligibleCandidate.runnerId} is eligible, but this evaluator has no scheduler authority to assign it`,
      selectedRunnerId: eligibleCandidate.runnerId,
      futureMutation: 'scheduler-claim',
      input,
      queue,
      candidates,
    });
  }

  const blockedCandidate = candidates.find((candidate) => candidate.status === 'blocked-affinity') ?? null;
  if (blockedCandidate) {
    const decision = isCapabilityReason(blockedCandidate.reason)
      ? 'blocked-missing-capability'
      : 'blocked-affinity';
    return createNoMutationEvaluation({
      decision,
      reason: blockedCandidate.reason ?? 'no eligible runner satisfies run affinity',
      selectedRunnerId: null,
      futureMutation: 'none',
      input,
      queue,
      candidates,
    });
  }

  if (candidates.some((candidate) => candidate.status === 'stale-runner')) {
    return createNoMutationEvaluation({
      decision: 'blocked-missing-capability',
      reason: 'no active eligible runner is available',
      selectedRunnerId: null,
      futureMutation: 'none',
      input,
      queue,
      candidates,
    });
  }

  return createNoMutationEvaluation({
    decision: 'blocked-missing-capability',
    reason: 'no runner candidates are available',
    selectedRunnerId: null,
    futureMutation: 'none',
    input,
    queue,
    candidates,
  });
}

function createReassignmentClaimCandidates(input: {
  inspection: Parameters<typeof createExecutionRunQueueProjection>[0];
  activeLeaseId: string;
  affinity: ExecutionRunAffinityRecord | null;
  runners: ExecutionRunnerRecord[];
}): ExecutionRunClaimCandidate[] {
  const inspectionWithoutActiveLease = {
    ...input.inspection,
    record: {
      ...input.inspection.record,
      bundle: {
        ...input.inspection.record.bundle,
        leases: input.inspection.record.bundle.leases.map((lease) =>
          lease.id === input.activeLeaseId
            ? {
                ...lease,
                status: 'expired' as const,
              }
            : lease,
        ),
      },
    },
  };
  const queue = createExecutionRunQueueProjection(inspectionWithoutActiveLease, {
    affinity: input.affinity,
  });
  return createExecutionRunClaimCandidates(queue, {
    inspection: inspectionWithoutActiveLease,
    options: {
      affinity: input.affinity,
      runners: input.runners,
    },
  });
}

function createNoMutationEvaluation(input: {
  decision: ExecutionRunSchedulerAuthorityDecision;
  reason: string;
  selectedRunnerId: string | null;
  futureMutation: ExecutionRunSchedulerAuthorityEvaluation['futureMutation'];
  input: EvaluateStoredExecutionRunSchedulerAuthorityInput;
  queue: ExecutionRunQueueProjection;
  candidates: ExecutionRunClaimCandidate[];
}): ExecutionRunSchedulerAuthorityEvaluation {
  return {
    runId: input.queue.runId,
    decision: input.decision,
    reason: input.reason,
    mutationAllowed: false,
    selectedRunnerId: input.selectedRunnerId,
    localRunnerId: input.input.localRunnerId ?? null,
    queue: input.queue,
    activeLease: null,
    candidates: input.candidates,
    futureMutation: input.futureMutation,
  };
}

function classifyLeaseOwnerFreshness(input: {
  leaseOwner: ExecutionRunnerRecord | null;
  leaseExpiresAt: string;
  now: string;
}): 'fresh' | 'expired' | 'stale' | 'missing' {
  if (!input.leaseOwner) return 'missing';
  if (input.leaseOwner.status !== 'active') return 'stale';
  return input.leaseExpiresAt <= input.now ? 'expired' : 'fresh';
}

function createActiveLeaseBlockedReason(
  leaseId: string,
  ownerId: string,
  ownerFreshness: 'fresh' | 'expired' | 'stale' | 'missing',
): string {
  if (ownerFreshness === 'fresh') {
    return `active lease ${leaseId} is owned by active runner ${ownerId}`;
  }
  if (ownerFreshness === 'expired') {
    return `active lease ${leaseId} is expired but owner ${ownerId} is still active`;
  }
  if (ownerFreshness === 'stale') {
    return `active lease ${leaseId} owner ${ownerId} is stale but the lease is not expired`;
  }
  return `active lease ${leaseId} owner ${ownerId} is missing but the lease is not expired`;
}

function isCapabilityReason(reason: string | null): boolean {
  if (!reason) return false;
  return (
    reason.includes('does not support service') ||
    reason.includes('does not expose runtime profile') ||
    reason.includes('does not expose browser profile') ||
    reason.includes('does not expose service account') ||
    reason.includes('is not browser-capable')
  );
}
