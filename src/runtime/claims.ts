import type { ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import { createExecutionRunQueueProjection, type ExecutionRunQueueProjection } from './projection.js';
import { createExecutionRunnerControl, type ExecutionRunnerControlContract } from './runnersControl.js';
import type { ExecutionRunAffinityRecord, ExecutionRunnerRecord } from './types.js';

export type ExecutionRunClaimCandidateStatus = 'eligible' | 'blocked-affinity' | 'stale-runner' | 'not-ready';

export interface ExecutionRunClaimCandidate {
  runnerId: string;
  hostId: string;
  runnerLastHeartbeatAt: string;
  status: ExecutionRunClaimCandidateStatus;
  reason: string | null;
  queueState: ExecutionRunQueueProjection['queueState'];
  claimState: ExecutionRunQueueProjection['claimState'];
  affinityStatus: ExecutionRunQueueProjection['affinity']['status'];
  affinityReason: string | null;
  projection: ExecutionRunQueueProjection;
}

export interface ExecutionRunClaimCandidatesResult {
  runId: string;
  queue: ExecutionRunQueueProjection;
  candidates: ExecutionRunClaimCandidate[];
}

export interface CreateExecutionRunClaimCandidatesOptions {
  affinity?: ExecutionRunAffinityRecord | null;
  runners: ExecutionRunnerRecord[];
}

export interface EvaluateStoredExecutionRunClaimCandidatesInput {
  runId: string;
  affinity?: ExecutionRunAffinityRecord | null;
}

export interface EvaluateStoredExecutionRunLocalClaimInput {
  runId: string;
  runnerId: string;
  now?: string;
  affinity?: ExecutionRunAffinityRecord | null;
}

export type ExecutionRunLocalClaimStatus =
  | 'eligible'
  | 'blocked-affinity'
  | 'stale-runner'
  | 'claim-owner-unavailable'
  | 'not-ready';

export interface ExecutionRunLocalClaimResult {
  runId: string;
  runnerId: string;
  hostId: string | null;
  status: ExecutionRunLocalClaimStatus;
  selected: boolean;
  reason: string | null;
  queueState: ExecutionRunQueueProjection['queueState'];
  claimState: ExecutionRunQueueProjection['claimState'];
  affinityStatus: ExecutionRunQueueProjection['affinity']['status'];
  affinityReason: string | null;
  projection: ExecutionRunQueueProjection;
}

export interface SelectStoredExecutionRunLocalClaimInput extends EvaluateStoredExecutionRunLocalClaimInput {}

export interface EvaluateStoredExecutionRunClaimCandidatesDeps {
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
}

export function createExecutionRunClaimCandidates(
  queue: ExecutionRunQueueProjection,
  input: {
    inspection: Parameters<typeof createExecutionRunQueueProjection>[0];
    options: CreateExecutionRunClaimCandidatesOptions;
  },
): ExecutionRunClaimCandidate[] {
  return input.options.runners
    .map((runner) => {
      const projection = createExecutionRunQueueProjection(input.inspection, {
        affinity: input.options.affinity ?? null,
        runner,
      });

      return {
        runnerId: runner.id,
        hostId: runner.hostId,
        runnerLastHeartbeatAt: runner.lastHeartbeatAt,
        status: classifyExecutionRunClaimCandidateStatus(queue, runner, projection),
        reason: createExecutionRunClaimCandidateReason(queue, runner, projection),
        queueState: projection.queueState,
        claimState: projection.claimState,
        affinityStatus: projection.affinity.status,
        affinityReason: projection.affinity.reason,
        projection,
      };
    })
    .sort(compareExecutionRunClaimCandidates);
}

export async function evaluateStoredExecutionRunClaimCandidates(
  input: EvaluateStoredExecutionRunClaimCandidatesInput,
  deps: EvaluateStoredExecutionRunClaimCandidatesDeps = {},
): Promise<ExecutionRunClaimCandidatesResult | null> {
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();

  const inspection = await control.inspectRun(input.runId);
  if (!inspection) return null;

  const runners = await runnersControl.listRunners();
  const queue = createExecutionRunQueueProjection(inspection, {
    affinity: input.affinity ?? null,
  });

  return {
    runId: inspection.record.runId,
    queue,
    candidates: createExecutionRunClaimCandidates(queue, {
      inspection,
      options: {
        affinity: input.affinity ?? null,
        runners: runners.map((record) => record.runner),
      },
    }),
  };
}


export async function evaluateStoredExecutionRunLocalClaim(
  input: EvaluateStoredExecutionRunLocalClaimInput,
  deps: EvaluateStoredExecutionRunClaimCandidatesDeps = {},
): Promise<ExecutionRunLocalClaimResult | null> {
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();

  const inspection = await control.inspectRun(input.runId);
  if (!inspection) return null;

  const queue = createExecutionRunQueueProjection(inspection, {
    affinity: input.affinity ?? null,
  });
  const runnerRecord = await runnersControl.readRunner(input.runnerId);
  if (!runnerRecord) {
    return {
      runId: inspection.record.runId,
      runnerId: input.runnerId,
      hostId: null,
      status: 'claim-owner-unavailable',
      selected: false,
      reason: `runner ${input.runnerId} has no persisted runner record`,
      queueState: queue.queueState,
      claimState: queue.claimState,
      affinityStatus: queue.affinity.status,
      affinityReason: queue.affinity.reason,
      projection: queue,
    };
  }

  const projection = createExecutionRunQueueProjection(inspection, {
    affinity: input.affinity ?? null,
    runner: runnerRecord.runner,
  });

  return {
    runId: inspection.record.runId,
    runnerId: runnerRecord.runner.id,
    hostId: runnerRecord.runner.hostId,
    status: classifyExecutionRunLocalClaimStatus(queue, runnerRecord.runner, projection, input.now ?? null),
    selected: false,
    reason: createExecutionRunLocalClaimReason(queue, runnerRecord.runner, projection, input.now ?? null),
    queueState: projection.queueState,
    claimState: projection.claimState,
    affinityStatus: projection.affinity.status,
    affinityReason: projection.affinity.reason,
    projection,
  };
}

export async function selectStoredExecutionRunLocalClaim(
  input: SelectStoredExecutionRunLocalClaimInput,
  deps: EvaluateStoredExecutionRunClaimCandidatesDeps = {},
): Promise<ExecutionRunLocalClaimResult | null> {
  const evaluated = await evaluateStoredExecutionRunLocalClaim(input, deps);
  if (!evaluated) return null;
  return {
    ...evaluated,
    selected: evaluated.status === 'eligible',
  };
}

function classifyExecutionRunClaimCandidateStatus(
  queue: ExecutionRunQueueProjection,
  runner: ExecutionRunnerRecord,
  projection: ExecutionRunQueueProjection,
): ExecutionRunClaimCandidateStatus {
  if (queue.claimState !== 'claimable') {
    return 'not-ready';
  }
  if (runner.status !== 'active') {
    return 'stale-runner';
  }
  if (projection.claimState === 'claimable' && projection.affinity.status === 'eligible') {
    return 'eligible';
  }
  return 'blocked-affinity';
}

function createExecutionRunClaimCandidateReason(
  queue: ExecutionRunQueueProjection,
  runner: ExecutionRunnerRecord,
  projection: ExecutionRunQueueProjection,
): string | null {
  if (queue.claimState !== 'claimable') {
    return `run is ${queue.claimState}`;
  }
  if (runner.status !== 'active') {
    return `runner ${runner.id} heartbeat is not active`;
  }
  return projection.affinity.reason;
}

function compareExecutionRunClaimCandidates(
  left: ExecutionRunClaimCandidate,
  right: ExecutionRunClaimCandidate,
): number {
  const rankDifference = claimCandidateRank(left.status) - claimCandidateRank(right.status);
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const heartbeatDifference = right.runnerLastHeartbeatAt.localeCompare(left.runnerLastHeartbeatAt);
  if (heartbeatDifference !== 0) {
    return heartbeatDifference;
  }

  return left.runnerId.localeCompare(right.runnerId);
}

function claimCandidateRank(status: ExecutionRunClaimCandidateStatus): number {
  switch (status) {
    case 'eligible':
      return 0;
    case 'blocked-affinity':
      return 1;
    case 'stale-runner':
      return 2;
    case 'not-ready':
      return 3;
  }
}


function classifyExecutionRunLocalClaimStatus(
  queue: ExecutionRunQueueProjection,
  runner: ExecutionRunnerRecord,
  projection: ExecutionRunQueueProjection,
  now: string | null,
): ExecutionRunLocalClaimStatus {
  if (queue.claimState !== 'claimable') {
    return 'not-ready';
  }
  if (runner.status !== 'active' || (now !== null && runner.expiresAt <= now)) {
    return 'stale-runner';
  }
  if (projection.claimState === 'claimable' && projection.affinity.status === 'eligible') {
    return 'eligible';
  }
  return 'blocked-affinity';
}

function createExecutionRunLocalClaimReason(
  queue: ExecutionRunQueueProjection,
  runner: ExecutionRunnerRecord,
  projection: ExecutionRunQueueProjection,
  now: string | null,
): string | null {
  if (queue.claimState !== 'claimable') {
    return `run is ${queue.claimState}`;
  }
  if (runner.status !== 'active') {
    return `runner ${runner.id} heartbeat is not active`;
  }
  if (now !== null && runner.expiresAt <= now) {
    return `runner ${runner.id} heartbeat expired at ${runner.expiresAt}`;
  }
  return projection.affinity.reason;
}
