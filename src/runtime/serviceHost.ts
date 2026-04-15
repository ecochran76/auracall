import { getActiveExecutionRunLease, type ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import {
  DEFAULT_LOCAL_ACTION_EXECUTION_POLICY,
  executeBuiltInLocalActionRequest,
  type LocalActionExecutionPolicy,
} from './localActions.js';
import {
  cancelExecutionRun,
  executeStoredExecutionRunOnce,
  formatLocalActionOutcomeNote,
  recoverStrandedRunningExecutionRun,
  summarizeLocalActionRequestsForSharedState,
  type RecoveredExecutionRun,
  type ExecuteLocalActionRequestContext,
  type ExecuteLocalActionRequestResult,
  type ExecuteStoredRunStepResult,
} from './runner.js';
import { createExecutionRunEvent } from './model.js';
import {
  evaluateStoredExecutionRunRepairClassification,
  repairStoredExecutionRunLease,
  type ExecutionRunRepairPosture,
} from './repair.js';
import { selectStoredExecutionRunLocalClaim, type ExecutionRunLocalClaimResult } from './claims.js';
import { createExecutionRunnerControl, type ExecutionRunnerControlContract } from './runnersControl.js';
import {
  createTaskRunSpecRecordStore,
  type TaskRunSpecInspectionSummary,
  type TaskRunSpecRecordStore,
  summarizeTaskRunSpecStoredRecord,
} from '../teams/store.js';
import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecuteStoredRunStepContext } from './runner.js';
import type { ExecutionRunSourceKind } from './types.js';

async function readStoredTaskRunSpecSummary(
  store: TaskRunSpecRecordStore,
  taskRunSpecId: string | null,
): Promise<TaskRunSpecInspectionSummary | null> {
  if (!taskRunSpecId) return null;
  const record = await store.readRecord(taskRunSpecId);
  return record ? summarizeTaskRunSpecStoredRecord(record) : null;
}

function shouldRequireOperatorApprovalForLocalAction(context: ExecuteLocalActionRequestContext): boolean {
  const policy = context.step.input.structuredData.localActionPolicy;
  return Boolean(
    policy &&
      typeof policy === 'object' &&
      !Array.isArray(policy) &&
      (policy as { mode?: unknown }).mode === 'approval-required',
  );
}

export interface DrainStoredExecutionRunsOnceOptions {
  runId?: string;
  sourceKind?: ExecutionRunSourceKind;
  maxRuns?: number;
}

export interface DrainedStoredExecutionRunResult {
  runId: string;
  result: 'executed' | 'skipped';
  reason?:
    | 'not-found'
    | 'active-lease'
    | 'stale-heartbeat'
    | 'claim-owner-unavailable'
    | 'no-runnable-step'
    | 'stranded-running-no-lease'
    | 'limit-reached';
  detailReason?: string | null;
  record?: ExecutionRunStoredRecord;
}

export type ExecutionServiceHostLocalClaimSummary = {
  sourceKind: ExecutionRunSourceKind | 'all';
  runnerId: string;
  selectedRunIds: string[];
  blockedRunIds: string[];
  notReadyRunIds: string[];
  unavailableRunIds: string[];
  reasonsByRunId: Record<string, string>;
  metrics: {
    selectedCount: number;
    blockedCount: number;
    notReadyCount: number;
    unavailableCount: number;
  };
} | null;
export interface ExecutionServiceHostActiveLeaseHealth {
  status: 'fresh' | 'stale-heartbeat' | 'suspiciously-idle';
  reason: string;
  leaseHeartbeatAt: string | null;
  leaseExpiresAt: string | null;
  runnerLastHeartbeatAt: string | null;
  runnerLastActivityAt: string | null;
}

export interface ExecutionServiceHostRecoverySummary {
  totalRuns: number;
  reclaimableRunIds: string[];
  activeLeaseRunIds: string[];
  recoverableStrandedRunIds: string[];
  strandedRunIds: string[];
  cancelledRunIds: string[];
  idleRunIds: string[];
  localClaim: ExecutionServiceHostLocalClaimSummary;
  activeLeaseHealth: {
    freshRunIds: string[];
    staleHeartbeatRunIds: string[];
    suspiciousIdleRunIds: string[];
    reasonsByRunId: Record<string, string>;
    metrics: {
      freshCount: number;
      staleHeartbeatCount: number;
      suspiciousIdleCount: number;
    };
  };
  leaseRepair: {
    locallyReclaimableRunIds: string[];
    inspectOnlyRunIds: string[];
    notReclaimableRunIds: string[];
    repairedRunIds: string[];
    reasonsByRunId: Record<string, string>;
    metrics: {
      locallyReclaimableCount: number;
      inspectOnlyCount: number;
      notReclaimableCount: number;
      repairedCount: number;
    };
  };
  attention: {
    staleHeartbeatInspectOnlyRunIds: string[];
    reasonsByRunId: Record<string, string>;
    metrics: {
      staleHeartbeatInspectOnlyCount: number;
    };
  };
  cancellation: {
    reasonsByRunId: Record<string, string>;
    metrics: {
      cancelledCount: number;
    };
  };
  metrics: {
    reclaimableCount: number;
    activeLeaseCount: number;
    recoverableStrandedCount: number;
    strandedCount: number;
    cancelledCount: number;
    idleCount: number;
    actionableCount: number;
    nonExecutableCount: number;
  };
}

export interface ExecutionServiceHostRecoveryDetail {
  runId: string;
  sourceKind: ExecutionRunSourceKind;
  taskRunSpecId: string | null;
  taskRunSpecSummary: TaskRunSpecInspectionSummary | null;
  orchestrationTimelineSummary: {
    total: number;
    items: Array<{
      type: 'step-started' | 'step-succeeded' | 'step-failed' | 'handoff-consumed' | 'note-added' | null;
      createdAt: string | null;
      stepId: string | null;
      note: string | null;
      handoffId: string | null;
    }>;
  } | null;
  handoffTransferSummary: {
    total: number;
    items: Array<{
      handoffId: string | null;
      fromStepId: string | null;
      fromAgentId: string | null;
      title: string | null;
      objective: string | null;
      requestedOutputCount: number;
      inputArtifactCount: number;
    }>;
  } | null;
  hostState: 'runnable' | 'recoverable-stranded' | 'active-lease' | 'stranded' | 'cancelled' | 'idle';
  createdAt: string;
  updatedAt: string;
  activeLease: {
    leaseId: string;
    ownerId: string;
    expiresAt: string;
  } | null;
  dispatch: {
    nextRunnableStepId: string | null;
    runningStepIds: string[];
  };
  repair: {
    posture: ExecutionRunRepairPosture;
    reason: string;
    reconciliationStatus: 'no-active-lease' | 'active-runner' | 'stale-runner' | 'missing-runner';
    reconciliationReason: string | null;
    leaseOwnerId: string | null;
    leaseExpiresAt: string | null;
  } | null;
  leaseHealth: ExecutionServiceHostActiveLeaseHealth | null;
  attention: {
    needed: boolean;
    kind: 'stale-heartbeat-inspect-only' | null;
    reason: string | null;
  } | null;
  cancellation: {
    cancelledAt: string;
    source: 'operator' | 'service-host' | null;
    reason: string | null;
  } | null;
  localClaim: {
    runnerId: string;
    hostId: string | null;
    status: ExecutionRunLocalClaimResult['status'];
    selected: boolean;
    reason: string | null;
    queueState: ExecutionRunLocalClaimResult['queueState'];
    claimState: ExecutionRunLocalClaimResult['claimState'];
    affinityStatus: ExecutionRunLocalClaimResult['affinityStatus'];
    affinityReason: string | null;
  } | null;
}

export interface ExecutionServiceHostStaleHeartbeatActionResult {
  action: 'repair-stale-heartbeat';
  runId: string;
  status: 'repaired' | 'not-stale-heartbeat' | 'not-reclaimable' | 'not-found';
  repaired: boolean;
  reason: string;
  leaseHealthStatus: ExecutionServiceHostActiveLeaseHealth['status'] | null;
  repairPosture: ExecutionRunRepairPosture | null;
  reconciliationReason: string | null;
}

export interface ExecutionServiceHostCancelActionResult {
  action: 'cancel-run';
  runId: string;
  status: 'cancelled' | 'not-found' | 'not-active' | 'not-owned';
  cancelled: boolean;
  reason: string;
}

export interface ExecutionServiceHostResumeHumanEscalationResult {
  action: 'resume-human-escalation';
  runId: string;
  status: 'resumed' | 'not-found' | 'not-paused';
  resumed: boolean;
  reason: string;
}

export interface ExecutionServiceHostDrainActionResult {
  action: 'drain-run';
  runId: string;
  status: 'executed' | 'skipped' | 'not-found';
  drained: boolean;
  reason: string;
  skipReason: DrainedStoredExecutionRunResult['reason'] | null;
}

export interface ExecutionServiceHostLocalActionResolveResult {
  action: 'resolve-local-action-request';
  runId: string;
  requestId: string;
  resolution: 'approved' | 'rejected' | 'cancelled';
  status: 'resolved' | 'not-found' | 'not-pending';
  resolved: boolean;
  reason: string;
}

interface EvaluatedStaleHeartbeatRepair {
  action: ExecutionServiceHostStaleHeartbeatActionResult;
  repair: Awaited<ReturnType<typeof evaluateStoredExecutionRunRepairClassification>> | null;
}

export interface DrainStoredExecutionRunsOnceResult {
  ownerId: string;
  expiredLeaseRunIds: string[];
  executedRunIds: string[];
  drained: DrainedStoredExecutionRunResult[];
}

export interface DrainStoredExecutionRunsUntilIdleOptions extends DrainStoredExecutionRunsOnceOptions {
  maxPasses?: number;
}

export interface DrainStoredExecutionRunsUntilIdleResult extends DrainStoredExecutionRunsOnceResult {
  iterations: number;
}

export interface ExecutionServiceHostDeps {
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
  now?: () => string;
  ownerId?: string;
  runnerId?: string | null;
  localActionExecutionPolicy?: Partial<LocalActionExecutionPolicy>;
  executeStoredRunStep?: (context: ExecuteStoredRunStepContext) => Promise<ExecuteStoredRunStepResult | void>;
  leaseHeartbeatIntervalMs?: number;
  leaseHeartbeatTtlMs?: number;
  executeLocalActionRequest?: (
    context: ExecuteLocalActionRequestContext,
  ) => Promise<ExecuteLocalActionRequestResult | void>;
}

type HostDrainCandidateKind =
  | 'runnable'
  | 'recoverable-stranded'
  | 'active-lease'
  | 'stranded'
  | 'idle'
  | 'missing';

interface HostDrainCandidateInspection {
  runId: string;
  inspection: Awaited<ReturnType<ExecutionRuntimeControlContract['inspectRun']>>;
  kind: HostDrainCandidateKind;
  createdAt: string;
}

export interface ExecutionServiceHost {
  drainRunsOnce(options?: DrainStoredExecutionRunsOnceOptions): Promise<DrainStoredExecutionRunsOnceResult>;
  drainRunsUntilIdle(
    options?: DrainStoredExecutionRunsUntilIdleOptions,
  ): Promise<DrainStoredExecutionRunsUntilIdleResult>;
  summarizeRecoveryState(options?: Omit<DrainStoredExecutionRunsOnceOptions, 'maxRuns'>): Promise<ExecutionServiceHostRecoverySummary>;
  summarizeLocalClaimState(options?: Omit<DrainStoredExecutionRunsOnceOptions, 'maxRuns'>): Promise<ExecutionServiceHostLocalClaimSummary>;
  readRecoveryDetail(runId: string): Promise<ExecutionServiceHostRecoveryDetail | null>;
  repairStaleHeartbeatLease(runId: string): Promise<ExecutionServiceHostStaleHeartbeatActionResult>;
  cancelOwnedRun(runId: string, note?: string | null): Promise<ExecutionServiceHostCancelActionResult>;
  resumeHumanEscalation(
    runId: string,
    options?: {
      note?: string | null;
      guidance?: Record<string, unknown> | null;
      override?: {
        promptAppend?: string | null;
        structuredContext?: Record<string, unknown> | null;
      } | null;
    },
  ): Promise<ExecutionServiceHostResumeHumanEscalationResult>;
  drainRun(runId: string): Promise<ExecutionServiceHostDrainActionResult>;
  resolveLocalActionRequest(
    runId: string,
    requestId: string,
    resolution: 'approved' | 'rejected' | 'cancelled',
    note?: string | null,
  ): Promise<ExecutionServiceHostLocalActionResolveResult>;
}

export function createExecutionServiceHost(deps: ExecutionServiceHostDeps = {}): ExecutionServiceHost {
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();
  const taskRunSpecStore = deps.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const now = deps.now ?? (() => new Date().toISOString());
  const ownerId = deps.ownerId ?? 'host:local-service';
  const runnerId = deps.runnerId ?? null;
  const localActionExecutionPolicy: LocalActionExecutionPolicy = {
    ...DEFAULT_LOCAL_ACTION_EXECUTION_POLICY,
    ...deps.localActionExecutionPolicy,
  };
  const executeLocalActionRequest =
    deps.executeLocalActionRequest ??
    ((context: ExecuteLocalActionRequestContext) =>
      shouldRequireOperatorApprovalForLocalAction(context)
        ? Promise.resolve(undefined)
        : executeBuiltInLocalActionRequest(context, localActionExecutionPolicy));
  let leaseSequence = 0;

  return {
    async summarizeRecoveryState(options: Omit<DrainStoredExecutionRunsOnceOptions, 'maxRuns'> = {}) {
      const summary: ExecutionServiceHostRecoverySummary = {
        totalRuns: 0,
        reclaimableRunIds: [],
        activeLeaseRunIds: [],
        recoverableStrandedRunIds: [],
        strandedRunIds: [],
        cancelledRunIds: [],
        idleRunIds: [],
        localClaim: runnerId
          ? {
              sourceKind: options.sourceKind ?? 'direct',
              runnerId,
              selectedRunIds: [],
              blockedRunIds: [],
              notReadyRunIds: [],
              unavailableRunIds: [],
              reasonsByRunId: {},
              metrics: {
                selectedCount: 0,
                blockedCount: 0,
                notReadyCount: 0,
                unavailableCount: 0,
              },
            }
          : null,
        activeLeaseHealth: {
          freshRunIds: [],
          staleHeartbeatRunIds: [],
          suspiciousIdleRunIds: [],
          reasonsByRunId: {},
          metrics: {
            freshCount: 0,
            staleHeartbeatCount: 0,
            suspiciousIdleCount: 0,
          },
        },
        leaseRepair: {
          locallyReclaimableRunIds: [],
          inspectOnlyRunIds: [],
          notReclaimableRunIds: [],
          repairedRunIds: [],
          reasonsByRunId: {},
          metrics: {
            locallyReclaimableCount: 0,
            inspectOnlyCount: 0,
            notReclaimableCount: 0,
            repairedCount: 0,
          },
        },
        attention: {
          staleHeartbeatInspectOnlyRunIds: [],
          reasonsByRunId: {},
          metrics: {
            staleHeartbeatInspectOnlyCount: 0,
          },
        },
        cancellation: {
          reasonsByRunId: {},
          metrics: {
            cancelledCount: 0,
          },
        },
        metrics: {
          reclaimableCount: 0,
          activeLeaseCount: 0,
          recoverableStrandedCount: 0,
          strandedCount: 0,
          cancelledCount: 0,
          idleCount: 0,
          actionableCount: 0,
          nonExecutableCount: 0,
        },
      };

      const livenessSweepAt = now();
      await runnersControl.expireRunners({
        now: livenessSweepAt,
        eligibilityNote: 'service host recovery summary liveness sweep',
      });

      for (const candidate of await listCandidateRuns(control, options)) {
        summary.totalRuns += 1;
        let currentRecord = candidate;
        const activeLease = getActiveExecutionRunLease(currentRecord);
        let repair: Awaited<ReturnType<typeof evaluateStoredExecutionRunRepairClassification>> | null = null;
        let repairedByHost = false;
        if (activeLease) {
          const staleHeartbeatRepair = await evaluateAndRepairStaleHeartbeatLease({
            control,
            runnersControl,
            runId: currentRecord.runId,
            repairAt: livenessSweepAt,
          });
          repair = staleHeartbeatRepair.repair;
          repairedByHost = staleHeartbeatRepair.action.repaired;
          if (repair) {
            summary.leaseRepair.reasonsByRunId[currentRecord.runId] = repair.reason;
            switch (repair.posture) {
              case 'locally-reclaimable':
                summary.leaseRepair.locallyReclaimableRunIds.push(currentRecord.runId);
                if (repairedByHost) {
                  summary.leaseRepair.repairedRunIds.push(currentRecord.runId);
                }
                break;
              case 'inspect-only':
                summary.leaseRepair.inspectOnlyRunIds.push(currentRecord.runId);
                break;
              case 'not-reclaimable':
                summary.leaseRepair.notReclaimableRunIds.push(currentRecord.runId);
                break;
            }
          }
          if (
            repair?.posture === 'inspect-only' &&
            staleHeartbeatRepair.action.leaseHealthStatus === 'stale-heartbeat'
          ) {
            summary.attention.staleHeartbeatInspectOnlyRunIds.push(currentRecord.runId);
            summary.attention.reasonsByRunId[currentRecord.runId] = repair.reason;
          }
          if (repairedByHost) {
            const repairedRecord = await control.readRun(currentRecord.runId);
            if (!repairedRecord) continue;
            currentRecord = repairedRecord;
          }
        }

        const inspection = await control.inspectRun(currentRecord.runId);
        if (!inspection) continue;

        if (summary.localClaim) {
          const localClaim = await selectStoredExecutionRunLocalClaim(
            {
              runId: currentRecord.runId,
              runnerId: summary.localClaim.runnerId,
              now: livenessSweepAt,
            },
            {
              control,
              runnersControl,
            },
          );
          if (localClaim) {
            if (localClaim.reason) {
              summary.localClaim.reasonsByRunId[currentRecord.runId] = localClaim.reason;
            }
            if (localClaim.selected) {
              summary.localClaim.selectedRunIds.push(currentRecord.runId);
            } else if (localClaim.status === 'blocked-affinity') {
              summary.localClaim.blockedRunIds.push(currentRecord.runId);
            } else if (localClaim.status === 'not-ready') {
              summary.localClaim.notReadyRunIds.push(currentRecord.runId);
            } else {
              summary.localClaim.unavailableRunIds.push(currentRecord.runId);
            }
          }
        }

        const activeLeaseHealth = classifyActiveLeaseHealth({
          record: inspection.record,
          repair,
          now: livenessSweepAt,
        });
        if (activeLeaseHealth) {
          summary.activeLeaseHealth.reasonsByRunId[currentRecord.runId] = activeLeaseHealth.reason;
          if (activeLeaseHealth.status === 'fresh') {
            summary.activeLeaseHealth.freshRunIds.push(currentRecord.runId);
          } else if (activeLeaseHealth.status === 'stale-heartbeat') {
            summary.activeLeaseHealth.staleHeartbeatRunIds.push(currentRecord.runId);
          } else {
            summary.activeLeaseHealth.suspiciousIdleRunIds.push(currentRecord.runId);
          }
        }

        if (getActiveExecutionRunLease(inspection.record)) {
          summary.activeLeaseRunIds.push(currentRecord.runId);
          continue;
        }

        const cancellation = readExecutionRunCancellation(inspection.record);
        if (inspection.record.bundle.run.status === 'cancelled' && cancellation) {
          summary.cancelledRunIds.push(currentRecord.runId);
          if (cancellation.reason) {
            summary.cancellation.reasonsByRunId[currentRecord.runId] = cancellation.reason;
          }
          continue;
        }

        if (inspection.dispatchPlan.runningStepIds.length > 0) {
          if (canRecoverStrandedRun(inspection.record, now)) {
            summary.recoverableStrandedRunIds.push(currentRecord.runId);
          } else {
            summary.strandedRunIds.push(currentRecord.runId);
          }
          continue;
        }

        if (inspection.dispatchPlan.nextRunnableStepId) {
          summary.reclaimableRunIds.push(currentRecord.runId);
          continue;
        }

        summary.idleRunIds.push(currentRecord.runId);
      }

      if (summary.localClaim) {
        summary.localClaim.metrics = {
          selectedCount: summary.localClaim.selectedRunIds.length,
          blockedCount: summary.localClaim.blockedRunIds.length,
          notReadyCount: summary.localClaim.notReadyRunIds.length,
          unavailableCount: summary.localClaim.unavailableRunIds.length,
        };
      }

      summary.activeLeaseHealth.metrics = {
        freshCount: summary.activeLeaseHealth.freshRunIds.length,
        staleHeartbeatCount: summary.activeLeaseHealth.staleHeartbeatRunIds.length,
        suspiciousIdleCount: summary.activeLeaseHealth.suspiciousIdleRunIds.length,
      };

      summary.leaseRepair.metrics = {
        locallyReclaimableCount: summary.leaseRepair.locallyReclaimableRunIds.length,
        inspectOnlyCount: summary.leaseRepair.inspectOnlyRunIds.length,
        notReclaimableCount: summary.leaseRepair.notReclaimableRunIds.length,
        repairedCount: summary.leaseRepair.repairedRunIds.length,
      };

      summary.attention.metrics = {
        staleHeartbeatInspectOnlyCount: summary.attention.staleHeartbeatInspectOnlyRunIds.length,
      };

      summary.cancellation.metrics = {
        cancelledCount: summary.cancelledRunIds.length,
      };

      summary.metrics = {
        reclaimableCount: summary.reclaimableRunIds.length,
        activeLeaseCount: summary.activeLeaseRunIds.length,
        recoverableStrandedCount: summary.recoverableStrandedRunIds.length,
        strandedCount: summary.strandedRunIds.length,
        cancelledCount: summary.cancelledRunIds.length,
        idleCount: summary.idleRunIds.length,
        actionableCount: summary.reclaimableRunIds.length + summary.recoverableStrandedRunIds.length,
        nonExecutableCount:
          summary.activeLeaseRunIds.length +
          summary.strandedRunIds.length +
          summary.cancelledRunIds.length +
          summary.idleRunIds.length,
      };

      return summary;
    },

    async summarizeLocalClaimState(options: Omit<DrainStoredExecutionRunsOnceOptions, 'maxRuns'> = {}) {
      if (!runnerId) return null;

      const summary: NonNullable<ExecutionServiceHostLocalClaimSummary> = {
        sourceKind: options.sourceKind ?? 'direct',
        runnerId,
        selectedRunIds: [],
        blockedRunIds: [],
        notReadyRunIds: [],
        unavailableRunIds: [],
        reasonsByRunId: {},
        metrics: {
          selectedCount: 0,
          blockedCount: 0,
          notReadyCount: 0,
          unavailableCount: 0,
        },
      };

      const livenessSweepAt = now();
      await runnersControl.expireRunners({
        now: livenessSweepAt,
        eligibilityNote: 'service host local claim summary liveness sweep',
      });

      for (const candidate of await listCandidateRuns(control, options)) {
        const inspection = await control.inspectRun(candidate.runId);
        if (!inspection) continue;

        const localClaim = await selectStoredExecutionRunLocalClaim(
          {
            runId: candidate.runId,
            runnerId,
            now: livenessSweepAt,
          },
          {
            control,
            runnersControl,
          },
        );
        if (!localClaim) continue;

        if (localClaim.reason) {
          summary.reasonsByRunId[candidate.runId] = localClaim.reason;
        }
        if (localClaim.selected) {
          summary.selectedRunIds.push(candidate.runId);
        } else if (localClaim.status === 'blocked-affinity') {
          summary.blockedRunIds.push(candidate.runId);
        } else if (localClaim.status === 'not-ready') {
          summary.notReadyRunIds.push(candidate.runId);
        } else {
          summary.unavailableRunIds.push(candidate.runId);
        }
      }

      summary.metrics = {
        selectedCount: summary.selectedRunIds.length,
        blockedCount: summary.blockedRunIds.length,
        notReadyCount: summary.notReadyRunIds.length,
        unavailableCount: summary.unavailableRunIds.length,
      };

      return summary;
    },

    async readRecoveryDetail(runId: string) {
      const detailAt = now();
      await runnersControl.expireRunners({
        now: detailAt,
        eligibilityNote: 'service host recovery detail liveness sweep',
      });

      const inspection = await control.inspectRun(runId);
      if (!inspection) return null;

      const activeLease = getActiveExecutionRunLease(inspection.record);
      const repair = activeLease
        ? await evaluateStoredExecutionRunRepairClassification(
            {
              runId,
              now: detailAt,
            },
            {
              control,
              runnersControl,
            },
          )
        : null;
      const localClaim = runnerId
        ? await selectStoredExecutionRunLocalClaim(
            {
              runId,
              runnerId,
              now: detailAt,
            },
            {
              control,
              runnersControl,
            },
          )
        : null;
      const leaseHealth = classifyActiveLeaseHealth({
        record: inspection.record,
        repair,
        now: detailAt,
      });
      const cancellation = readExecutionRunCancellation(inspection.record);
      const taskRunSpecSummary = await readStoredTaskRunSpecSummary(
        taskRunSpecStore,
        inspection.record.bundle.run.taskRunSpecId ?? null,
      );

      return {
        runId,
        sourceKind: inspection.record.bundle.run.sourceKind,
        taskRunSpecId: inspection.record.bundle.run.taskRunSpecId ?? null,
        taskRunSpecSummary,
        orchestrationTimelineSummary: readExecutionRunOrchestrationTimelineSummaryForRecoveryDetail(
          inspection.record,
        ),
        handoffTransferSummary: readExecutionRunHandoffTransferSummaryForRecoveryDetail(inspection.record),
        hostState:
          inspection.record.bundle.run.status === 'cancelled'
            ? 'cancelled'
            : (classifyHostDrainCandidate(
                inspection.record,
                inspection.dispatchPlan,
                now,
              ) as ExecutionServiceHostRecoveryDetail['hostState']),
        createdAt: inspection.record.bundle.run.createdAt,
        updatedAt: inspection.record.bundle.run.updatedAt,
        activeLease: activeLease
          ? {
              leaseId: activeLease.id,
              ownerId: activeLease.ownerId,
              expiresAt: activeLease.expiresAt,
            }
          : null,
        dispatch: {
          nextRunnableStepId: inspection.dispatchPlan.nextRunnableStepId,
          runningStepIds: [...inspection.dispatchPlan.runningStepIds],
        },
        repair: repair
          ? {
              posture: repair.posture,
              reason: repair.reason,
              reconciliationStatus: repair.reconciliation.status,
              reconciliationReason: repair.reconciliation.reason,
              leaseOwnerId: repair.reconciliation.leaseOwnerId,
              leaseExpiresAt: repair.reconciliation.leaseExpiresAt,
            }
          : null,
        leaseHealth,
        attention:
          repair?.posture === 'inspect-only' && leaseHealth?.status === 'stale-heartbeat'
            ? {
                needed: true,
                kind: 'stale-heartbeat-inspect-only',
                reason: repair.reason,
              }
            : null,
        cancellation: cancellation
          ? {
              cancelledAt: cancellation.cancelledAt,
              source: cancellation.source,
              reason: cancellation.reason,
            }
          : null,
        localClaim: localClaim
          ? {
              runnerId: localClaim.runnerId,
              hostId: localClaim.hostId,
              status: localClaim.status,
              selected: localClaim.selected,
              reason: localClaim.reason,
              queueState: localClaim.queueState,
              claimState: localClaim.claimState,
              affinityStatus: localClaim.affinityStatus,
              affinityReason: localClaim.affinityReason,
            }
          : null,
      };
    },

    async repairStaleHeartbeatLease(runId: string) {
      const repairAt = now();
      await runnersControl.expireRunners({
        now: repairAt,
        eligibilityNote: 'service host stale-heartbeat repair liveness sweep',
      });
      return (
        await evaluateAndRepairStaleHeartbeatLease({
          control,
          runnersControl,
          runId,
          repairAt,
        })
      ).action;
    },

    async cancelOwnedRun(runId: string, note: string | null = null) {
      const cancelledAt = now();
      const record = await control.readRun(runId);
      if (!record) {
        return {
          action: 'cancel-run',
          runId,
          status: 'not-found',
          cancelled: false,
          reason: `run ${runId} was not found`,
        };
      }

      const activeLease = getActiveExecutionRunLease(record);
      if (!activeLease) {
        return {
          action: 'cancel-run',
          runId,
          status: 'not-active',
          cancelled: false,
          reason: 'run has no active lease to cancel',
        };
      }

      const expectedOwnerId = runnerId ?? ownerId;
      if (activeLease.ownerId !== expectedOwnerId) {
        return {
          action: 'cancel-run',
          runId,
          status: 'not-owned',
          cancelled: false,
          reason: `active lease is owned by ${activeLease.ownerId}, not ${expectedOwnerId}`,
        };
      }

      const cancelledBundle = cancelExecutionRun({
        bundle: record.bundle,
        cancelledAt,
        note: note ?? 'run cancelled by service host operator control',
        source: 'operator',
      });
      const cancelledRecord = await control.persistRun({
        runId,
        bundle: cancelledBundle,
        expectedRevision: record.revision,
      });
      await control.releaseLease({
        runId,
        leaseId: activeLease.id,
        releasedAt: cancelledAt,
        releaseReason: 'cancelled',
      });
      return {
        action: 'cancel-run',
        runId,
        status: 'cancelled',
        cancelled: true,
        reason: note ?? 'run cancelled by service host operator control',
      };
    },

    async resumeHumanEscalation(runId: string, options = {}) {
      const resumedAt = now();
      const record = await control.readRun(runId);
      if (!record) {
        return {
          action: 'resume-human-escalation',
          runId,
          status: 'not-found',
          resumed: false,
          reason: `run ${runId} was not found`,
        };
      }

      const pausedStep = record.bundle.steps.find(
        (step) =>
          step.status === 'cancelled' &&
          isRecord(step.output?.structuredData) &&
          isRecord(step.output?.structuredData.humanEscalation),
      );
      if (!pausedStep) {
        return {
          action: 'resume-human-escalation',
          runId,
          status: 'not-paused',
          resumed: false,
          reason: `run ${runId} has no cancelled human-escalation step to resume`,
        };
      }

      await control.resumeHumanEscalation({
        runId,
        resumedAt,
        note: options.note ?? null,
        guidance: options.guidance ?? null,
        override: options.override ?? null,
      });

      return {
        action: 'resume-human-escalation',
        runId,
        status: 'resumed',
        resumed: true,
        reason: options.note ?? 'run resumed after human escalation',
      };
    },

    async drainRun(runId: string) {
      const record = await control.readRun(runId);
      if (!record) {
        return {
          action: 'drain-run',
          runId,
          status: 'not-found',
          drained: false,
          reason: `run ${runId} was not found`,
          skipReason: null,
        };
      }

      const result = await this.drainRunsOnce({
        runId,
        sourceKind: record.bundle.run.sourceKind,
        maxRuns: 1,
      });
      const entry = result.drained[0];
      if (!entry) {
        return {
          action: 'drain-run',
          runId,
          status: 'not-found',
          drained: false,
          reason: `run ${runId} was not found`,
          skipReason: null,
        };
      }
      if (entry.result === 'executed') {
        await persistOperatorDrainEvent(control, runId, now(), 'executed', 'run executed through targeted host drain', null);
        return {
          action: 'drain-run',
          runId,
          status: 'executed',
          drained: true,
          reason: 'run executed through targeted host drain',
          skipReason: null,
        };
      }
      await persistOperatorDrainEvent(
        control,
        runId,
        now(),
        'skipped',
        entry.detailReason ?? entry.reason ?? 'run was skipped by targeted host drain',
        entry.reason ?? null,
      );
      return {
        action: 'drain-run',
        runId,
        status: 'skipped',
        drained: false,
        reason: entry.detailReason ?? entry.reason ?? 'run was skipped by targeted host drain',
        skipReason: entry.reason ?? null,
      };
    },

    async resolveLocalActionRequest(
      runId: string,
      requestId: string,
      resolution: 'approved' | 'rejected' | 'cancelled',
      note: string | null = null,
    ) {
      const resolvedAt = now();
      const record = await control.readRun(runId);
      if (!record) {
        return {
          action: 'resolve-local-action-request',
          runId,
          requestId,
          resolution,
          status: 'not-found',
          resolved: false,
          reason: `run ${runId} was not found`,
        };
      }

      const existingRequest = record.bundle.localActionRequests.find((candidate) => candidate.id === requestId);
      if (!existingRequest) {
        return {
          action: 'resolve-local-action-request',
          runId,
          requestId,
          resolution,
          status: 'not-found',
          resolved: false,
          reason: `local action request ${requestId} was not found`,
        };
      }

      if (existingRequest.status !== 'requested') {
        return {
          action: 'resolve-local-action-request',
          runId,
          requestId,
          resolution,
          status: 'not-pending',
          resolved: false,
          reason: `local action request ${requestId} is already ${existingRequest.status}`,
        };
      }

      const resolvedRequest = {
        ...existingRequest,
        status: resolution,
        approvedAt: resolution === 'approved' ? resolvedAt : existingRequest.approvedAt ?? null,
        completedAt: resolution === 'approved' ? existingRequest.completedAt ?? null : resolvedAt,
        resultSummary: note ?? defaultLocalActionResolutionReason(resolution),
        resultPayload: {
          source: 'operator',
        },
      };
      const updatedRequests = record.bundle.localActionRequests.map((candidate) =>
        candidate.id === requestId ? resolvedRequest : candidate,
      );
      const ownerStep = record.bundle.steps.find((step) => step.id === existingRequest.ownerStepId) ?? null;
      const ownerStepRequests = updatedRequests.filter((candidate) => candidate.ownerStepId === existingRequest.ownerStepId);
      const outcomeSummary =
        ownerStep !== null
          ? summarizeLocalActionRequestsForSharedState({
              step: ownerStep,
              requests: ownerStepRequests,
              generatedAt: resolvedAt,
            })
          : null;
      const outcomeNote =
        ownerStep !== null
          ? formatLocalActionOutcomeNote({
              step: ownerStep,
              requests: ownerStepRequests,
            })
          : null;
      const outcomeSummaryKey =
        ownerStep !== null
          ? `step.localActionOutcomes.${ownerStep.id}`
          : `step.localActionOutcomes.${existingRequest.ownerStepId}`;
      const resolutionEvent = createExecutionRunEvent({
        id: `${runId}:event:${requestId}:${resolution}:operator:${resolvedAt}`,
        runId,
        stepId: existingRequest.ownerStepId,
        type: 'note-added',
        createdAt: resolvedAt,
        note: note ?? defaultLocalActionResolutionReason(resolution),
        payload: {
          requestId,
          requestStatus: resolution,
          source: 'operator',
        },
      });

      await control.persistRun({
        runId,
        expectedRevision: record.revision,
        bundle: {
          ...record.bundle,
          run: {
            ...record.bundle.run,
            updatedAt: resolvedAt,
          },
          localActionRequests: updatedRequests,
          events: [...record.bundle.events, resolutionEvent],
          sharedState: {
            ...record.bundle.sharedState,
            structuredOutputs: [
              ...record.bundle.sharedState.structuredOutputs.filter((entry) => entry.key !== outcomeSummaryKey),
              ...(outcomeSummary ? [outcomeSummary] : []),
            ],
            notes: [...record.bundle.sharedState.notes, ...(outcomeNote ? [outcomeNote] : [])],
            history: [...record.bundle.sharedState.history, resolutionEvent],
            lastUpdatedAt: resolvedAt,
          },
        },
      });

      return {
        action: 'resolve-local-action-request',
        runId,
        requestId,
        resolution,
        status: 'resolved',
        resolved: true,
        reason: note ?? defaultLocalActionResolutionReason(resolution),
      };
    },

    async drainRunsOnce(options: DrainStoredExecutionRunsOnceOptions = {}) {
      const maxRuns = Math.max(0, options.maxRuns ?? 1);
      const drained: DrainedStoredExecutionRunResult[] = [];
      const expiredLeaseRunIds: string[] = [];
      const executedRunIds: string[] = [];
      let executedCount = 0;
      const executionOwnerId = runnerId ?? ownerId;

      const candidates = await inspectHostDrainCandidates(control, runnersControl, options, now, expiredLeaseRunIds);
      const actionableExecutionPlan = createActionableExecutionPlan(candidates, maxRuns);

      for (const candidate of candidates) {
        if (!candidate.inspection) {
          drained.push({
            runId: candidate.runId,
            result: 'skipped',
            reason: 'not-found',
          });
          continue;
        }

        let inspection = candidate.inspection;
        const currentRecord = inspection.record;

        if (getActiveExecutionRunLease(inspection.record)) {
          const repair = await evaluateStoredExecutionRunRepairClassification(
            {
              runId: currentRecord.runId,
              now: now(),
            },
            {
              control,
              runnersControl,
            },
          );
          const leaseHealth = classifyActiveLeaseHealth({
            record: inspection.record,
            repair,
            now: now(),
          });
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: leaseHealth?.status === 'stale-heartbeat' ? 'stale-heartbeat' : 'active-lease',
            record: inspection.record,
          });
          continue;
        }

        if (executedCount >= maxRuns) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason:
              inspection.dispatchPlan.nextRunnableStepId || candidate.kind === 'recoverable-stranded'
                ? 'limit-reached'
                : inspection.dispatchPlan.runningStepIds.length > 0
                  ? 'stranded-running-no-lease'
                  : 'no-runnable-step',
            record: inspection.record,
          });
          continue;
        }

        if (
          (candidate.kind === 'runnable' || candidate.kind === 'recoverable-stranded') &&
          !actionableExecutionPlan.has(candidate.runId)
        ) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'limit-reached',
            record: inspection.record,
          });
          continue;
        }

        if (runnerId) {
          const localClaim = await selectStoredExecutionRunLocalClaim(
            {
              runId: currentRecord.runId,
              runnerId,
              now: now(),
            },
            {
              control,
              runnersControl,
            },
          );
          if (!localClaim?.selected) {
            drained.push({
              runId: currentRecord.runId,
              result: 'skipped',
              reason: 'claim-owner-unavailable',
              detailReason: localClaim?.reason ?? 'claim-owner-unavailable',
              record: inspection.record,
            });
            continue;
          }
        }

        if (inspection.dispatchPlan.runningStepIds.length > 0) {
          const recovered = await tryRecoverStrandedRun(inspection.record, control, now);
          if (recovered) {
            const repaired = await control.inspectRun(currentRecord.runId);
            if (repaired) {
              inspection = repaired;
            }
          } else {
            drained.push({
              runId: currentRecord.runId,
              result: 'skipped',
              reason: 'stranded-running-no-lease',
              record: inspection.record,
            });
            continue;
          }
        }

        if (inspection.dispatchPlan.runningStepIds.length > 0) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'stranded-running-no-lease',
            record: inspection.record,
          });
          continue;
        }

        if (!inspection.dispatchPlan.nextRunnableStepId) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'no-runnable-step',
            record: inspection.record,
          });
          continue;
        }

        const executed = await executeStoredExecutionRunOnce({
          runId: currentRecord.runId,
          ownerId: runnerId ?? ownerId,
          leaseId: `${currentRecord.runId}:lease:${executionOwnerId.replace(/[^a-z0-9:_-]+/gi, '-')}:${++leaseSequence}`,
          now,
          leaseHeartbeatIntervalMs: deps.leaseHeartbeatIntervalMs,
          leaseHeartbeatTtlMs: deps.leaseHeartbeatTtlMs,
          control,
          executeStep: deps.executeStoredRunStep,
          executeLocalActionRequest,
        });
        if (runnerId) {
          await runnersControl.recordRunnerActivity({
            runnerId,
            runId: executed.runId,
            activityAt: executed.bundle.run.updatedAt,
            eligibilityNote: 'service host executed local run',
          });
        }
        executedCount += 1;
        executedRunIds.push(executed.runId);
        drained.push({
          runId: executed.runId,
          result: 'executed',
          record: executed,
        });
      }

      return {
        ownerId: runnerId ?? ownerId,
        expiredLeaseRunIds,
        executedRunIds,
        drained,
      };
    },

    async drainRunsUntilIdle(options: DrainStoredExecutionRunsUntilIdleOptions = {}) {
      const maxRuns = options.maxRuns ?? 100;
      const maxPasses = Math.max(1, options.maxPasses ?? 8);
      let remainingRuns = maxRuns;
      let iterations = 0;
      const drained: Array<DrainedStoredExecutionRunResult | null> = [];
      const latestSkippedIndexByRunId = new Map<string, number>();
      const executedRunIdsSeen = new Set<string>();
      const expiredLeaseRunIds: string[] = [];
      const executedRunIds: string[] = [];

      while (iterations < maxPasses && remainingRuns > 0) {
        const result = await this.drainRunsOnce({
          runId: options.runId,
          sourceKind: options.sourceKind,
          maxRuns: remainingRuns,
        });
        iterations += 1;
        expiredLeaseRunIds.push(...result.expiredLeaseRunIds);
        executedRunIds.push(...result.executedRunIds);
        for (const entry of result.drained) {
          if (entry.result === 'skipped') {
            if (executedRunIdsSeen.has(entry.runId)) {
              continue;
            }
            const existingIndex = latestSkippedIndexByRunId.get(entry.runId);
            if (existingIndex !== undefined) {
              drained[existingIndex] = entry;
            } else {
              latestSkippedIndexByRunId.set(entry.runId, drained.length);
              drained.push(entry);
            }
            continue;
          }

          const existingSkippedIndex = latestSkippedIndexByRunId.get(entry.runId);
          if (existingSkippedIndex !== undefined) {
            drained[existingSkippedIndex] = null;
            latestSkippedIndexByRunId.delete(entry.runId);
          }
          executedRunIdsSeen.add(entry.runId);
          drained.push(entry);
        }
        remainingRuns = Math.max(0, remainingRuns - result.executedRunIds.length);
        if (options.runId) {
          const currentRecord = await control.readRun(options.runId);
          const status = currentRecord?.bundle.run.status;
          if (status === 'succeeded' || status === 'failed' || status === 'cancelled' || currentRecord === null) {
            break;
          }
        }
        if (result.executedRunIds.length === 0) {
          break;
        }
      }

      return {
        ownerId: runnerId ?? ownerId,
        expiredLeaseRunIds,
        executedRunIds,
        drained: drained.filter((entry): entry is DrainedStoredExecutionRunResult => entry !== null),
        iterations,
      };
    },
  };
}

async function inspectHostDrainCandidates(
  control: ExecutionRuntimeControlContract,
  runnersControl: ExecutionRunnerControlContract,
  options: DrainStoredExecutionRunsOnceOptions,
  now: () => string,
  expiredLeaseRunIds: string[],
): Promise<HostDrainCandidateInspection[]> {
  const inspected: HostDrainCandidateInspection[] = [];
  const livenessSweepAt = now();

  await runnersControl.expireRunners({
    now: livenessSweepAt,
    eligibilityNote: 'service host drain liveness sweep',
  });

  for (const candidate of await listCandidateRuns(control, options)) {
    const currentRecord = await repairLocallyReclaimableLease({
      control,
      runnersControl,
      runId: candidate.runId,
      repairNow: livenessSweepAt,
      expiredLeaseRunIds,
    });
    if (!currentRecord) {
      inspected.push({
        runId: candidate.runId,
        inspection: null,
        kind: 'missing',
        createdAt: candidate.bundle.run.createdAt,
      });
      continue;
    }

    const inspection = await control.inspectRun(currentRecord.runId);
    if (!inspection) {
      inspected.push({
        runId: currentRecord.runId,
        inspection: null,
        kind: 'missing',
        createdAt: currentRecord.bundle.run.createdAt,
      });
      continue;
    }

    inspected.push({
      runId: currentRecord.runId,
      inspection,
      kind: classifyHostDrainCandidate(inspection.record, inspection.dispatchPlan, now),
      createdAt: inspection.record.bundle.run.createdAt,
    });
  }

  return inspected.sort((left, right) => {
    const byPriority = compareHostDrainCandidatePriority(left.kind, right.kind);
    return byPriority !== 0 ? byPriority : left.createdAt.localeCompare(right.createdAt);
  });
}

async function repairLocallyReclaimableLease(input: {
  control: ExecutionRuntimeControlContract;
  runnersControl: ExecutionRunnerControlContract;
  runId: string;
  repairNow: string;
  expiredLeaseRunIds?: string[];
  precomputedRepair?: EvaluatedStaleHeartbeatRepair | null;
}): Promise<ExecutionRunStoredRecord | null> {
  const currentRecord = await input.control.readRun(input.runId);
  if (!currentRecord || !getActiveExecutionRunLease(currentRecord)) {
    return currentRecord;
  }

  const repaired =
    input.precomputedRepair ??
    (await evaluateAndRepairStaleHeartbeatLease({
      control: input.control,
      runnersControl: input.runnersControl,
      runId: input.runId,
      repairAt: input.repairNow,
    }));

  if (!repaired.action.repaired) {
    return currentRecord;
  }

  input.expiredLeaseRunIds?.push(input.runId);
  return (await input.control.readRun(input.runId)) ?? currentRecord;
}

async function evaluateAndRepairStaleHeartbeatLease(input: {
  control: ExecutionRuntimeControlContract;
  runnersControl: ExecutionRunnerControlContract;
  runId: string;
  repairAt: string;
}): Promise<EvaluatedStaleHeartbeatRepair> {
  const inspection = await input.control.inspectRun(input.runId);
  if (!inspection) {
    return {
      action: {
        action: 'repair-stale-heartbeat',
        runId: input.runId,
        status: 'not-found',
        repaired: false,
        reason: `run ${input.runId} was not found`,
        leaseHealthStatus: null,
        repairPosture: null,
        reconciliationReason: null,
      },
      repair: null,
    };
  }

  const activeLease = getActiveExecutionRunLease(inspection.record);
  if (!activeLease) {
    return {
      action: {
        action: 'repair-stale-heartbeat',
        runId: input.runId,
        status: 'not-stale-heartbeat',
        repaired: false,
        reason: 'run has no active lease',
        leaseHealthStatus: null,
        repairPosture: null,
        reconciliationReason: null,
      },
      repair: null,
    };
  }

  const repair = await evaluateStoredExecutionRunRepairClassification(
    {
      runId: input.runId,
      now: input.repairAt,
    },
    {
      control: input.control,
      runnersControl: input.runnersControl,
    },
  );
  const leaseHealth = classifyActiveLeaseHealth({
    record: inspection.record,
    repair,
    now: input.repairAt,
  });

  if (!leaseHealth || leaseHealth.status !== 'stale-heartbeat') {
    return {
      action: {
        action: 'repair-stale-heartbeat',
        runId: input.runId,
        status: 'not-stale-heartbeat',
        repaired: false,
        reason: leaseHealth?.reason ?? 'active lease is not classified as stale-heartbeat',
        leaseHealthStatus: leaseHealth?.status ?? null,
        repairPosture: repair?.posture ?? null,
        reconciliationReason: repair?.reconciliation.reason ?? leaseHealth?.reason ?? null,
      },
      repair,
    };
  }

  if (!repair || repair.posture !== 'locally-reclaimable') {
    return {
      action: {
        action: 'repair-stale-heartbeat',
        runId: input.runId,
        status: 'not-reclaimable',
        repaired: false,
        reason: repair?.reason ?? 'stale-heartbeat lease does not have a reclaimable repair posture',
        leaseHealthStatus: leaseHealth.status,
        repairPosture: repair?.posture ?? null,
        reconciliationReason: repair?.reconciliation.reason ?? leaseHealth.reason ?? null,
      },
      repair,
    };
  }

  const repaired = await repairStoredExecutionRunLease(
    {
      runId: input.runId,
      now: input.repairAt,
    },
    {
      control: input.control,
      runnersControl: input.runnersControl,
    },
  );

  return {
    action: {
      action: 'repair-stale-heartbeat',
      runId: input.runId,
      status: repaired?.repaired ? 'repaired' : 'not-reclaimable',
      repaired: repaired?.repaired ?? false,
      reason: repaired?.reason ?? repair.reason,
      leaseHealthStatus: leaseHealth.status,
      repairPosture: repaired?.posture ?? repair.posture,
      reconciliationReason: repaired?.reconciliation.reason ?? repair.reconciliation.reason ?? null,
    },
    repair,
  };
}

const ACTIVE_LEASE_IDLE_ACTIVITY_THRESHOLD_MS = 60_000;

function classifyActiveLeaseHealth(input: {
  record: ExecutionRunStoredRecord;
  repair: Awaited<ReturnType<typeof evaluateStoredExecutionRunRepairClassification>> | null;
  now: string;
}): ExecutionServiceHostActiveLeaseHealth | null {
  const lease = getActiveExecutionRunLease(input.record);
  if (!lease) {
    return null;
  }

  if (!input.repair) {
    return {
      status: 'stale-heartbeat',
      reason: 'active lease has no repair classification context',
      leaseHeartbeatAt: lease.heartbeatAt,
      leaseExpiresAt: lease.expiresAt,
      runnerLastHeartbeatAt: null,
      runnerLastActivityAt: null,
    };
  }

  const runner = input.repair.reconciliation.runner;
  if (input.repair.reconciliation.status !== 'active-runner') {
    return {
      status: 'stale-heartbeat',
      reason: input.repair.reconciliation.reason ?? 'lease owner heartbeat is unavailable',
      leaseHeartbeatAt: lease.heartbeatAt,
      leaseExpiresAt: lease.expiresAt,
      runnerLastHeartbeatAt: runner?.lastHeartbeatAt ?? null,
      runnerLastActivityAt: runner?.lastActivityAt ?? null,
    };
  }

  if (lease.expiresAt <= input.now) {
    return {
      status: 'stale-heartbeat',
      reason: 'lease heartbeat expired at ' + lease.expiresAt,
      leaseHeartbeatAt: lease.heartbeatAt,
      leaseExpiresAt: lease.expiresAt,
      runnerLastHeartbeatAt: runner?.lastHeartbeatAt ?? null,
      runnerLastActivityAt: runner?.lastActivityAt ?? null,
    };
  }

  const acquiredAtMs = safeParseTimestamp(lease.acquiredAt);
  const nowMs = safeParseTimestamp(input.now);
  const lastActivityMs = safeParseTimestamp(runner?.lastActivityAt ?? null);
  if (
    acquiredAtMs !== null &&
    nowMs !== null &&
    nowMs - acquiredAtMs >= ACTIVE_LEASE_IDLE_ACTIVITY_THRESHOLD_MS &&
    (lastActivityMs === null || lastActivityMs < acquiredAtMs)
  ) {
    return {
      status: 'suspiciously-idle',
      reason: 'active lease has no observed runner activity since it was acquired',
      leaseHeartbeatAt: lease.heartbeatAt,
      leaseExpiresAt: lease.expiresAt,
      runnerLastHeartbeatAt: runner?.lastHeartbeatAt ?? null,
      runnerLastActivityAt: runner?.lastActivityAt ?? null,
    };
  }

  return {
    status: 'fresh',
    reason:
      lastActivityMs !== null && acquiredAtMs !== null && lastActivityMs >= acquiredAtMs
        ? 'runner activity has been observed during the active lease'
        : 'lease and runner heartbeats are fresh',
    leaseHeartbeatAt: lease.heartbeatAt,
    leaseExpiresAt: lease.expiresAt,
    runnerLastHeartbeatAt: runner?.lastHeartbeatAt ?? null,
    runnerLastActivityAt: runner?.lastActivityAt ?? null,
  };
}

function safeParseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function readExecutionRunCancellation(record: ExecutionRunStoredRecord): {
  cancelledAt: string;
  source: 'operator' | 'service-host' | null;
  reason: string | null;
} | null {
  if (record.bundle.run.status !== 'cancelled') {
    return null;
  }

  for (let index = record.bundle.events.length - 1; index >= 0; index -= 1) {
    const event = record.bundle.events[index];
    if (!event || event.type !== 'note-added' || !isRecord(event.payload)) {
      continue;
    }
    if (event.payload.status !== 'cancelled') {
      continue;
    }
    const source =
      event.payload.source === 'operator' || event.payload.source === 'service-host'
        ? event.payload.source
        : null;
    return {
      cancelledAt: event.createdAt,
      source,
      reason: event.note ?? null,
    };
  }

  return {
    cancelledAt: record.bundle.run.updatedAt,
    source: null,
    reason: null,
  };
}

function defaultLocalActionResolutionReason(resolution: 'approved' | 'rejected' | 'cancelled'): string {
  switch (resolution) {
    case 'approved':
      return 'local action approved by service host operator control';
    case 'rejected':
      return 'local action rejected by service host operator control';
    case 'cancelled':
      return 'local action cancelled by service host operator control';
  }
}

async function persistOperatorDrainEvent(
  control: ExecutionRuntimeControlContract,
  runId: string,
  eventAt: string,
  status: 'executed' | 'skipped',
  reason: string,
  skipReason: DrainedStoredExecutionRunResult['reason'] | null,
): Promise<void> {
  const record = await control.readRun(runId);
  if (!record) {
    return;
  }
  const event = createExecutionRunEvent({
    id: `${runId}:event:drain-run:${status}:${eventAt}`,
    runId,
    type: 'note-added',
    createdAt: eventAt,
    note: reason,
    payload: {
      source: 'operator',
      action: 'drain-run',
      status,
      skipReason,
    },
  });
  await control.persistRun({
    runId,
    expectedRevision: record.revision,
    bundle: {
      ...record.bundle,
      run: {
        ...record.bundle.run,
        updatedAt: eventAt,
      },
      events: [...record.bundle.events, event],
      sharedState: {
        ...record.bundle.sharedState,
        notes: [...record.bundle.sharedState.notes, reason],
        history: [...record.bundle.sharedState.history, event],
        lastUpdatedAt: eventAt,
      },
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readExecutionRunOrchestrationTimelineSummaryForRecoveryDetail(
  record: ExecutionRunStoredRecord,
): ExecutionServiceHostRecoveryDetail['orchestrationTimelineSummary'] {
  const relevantEvents = record.bundle.sharedState.history.filter((event) => {
    if (
      event.type === 'step-started' ||
      event.type === 'step-succeeded' ||
      event.type === 'step-failed' ||
      event.type === 'handoff-consumed'
    ) {
      return true;
    }
    if (event.type !== 'note-added') {
      return false;
    }
    return isRecord(event.payload) && (typeof event.payload.source === 'string' || typeof event.payload.action === 'string');
  });

  if (relevantEvents.length === 0) {
    return null;
  }

  return {
    total: relevantEvents.length,
    items: relevantEvents.slice(-10).map((event) => ({
      type: narrowOrchestrationTimelineEventTypeForRecoveryDetail(event.type),
      createdAt: event.createdAt ?? null,
      stepId: event.stepId ?? null,
      note: event.note ?? null,
      handoffId: isRecord(event.payload) && typeof event.payload.handoffId === 'string' ? event.payload.handoffId : null,
    })),
  };
}

function narrowOrchestrationTimelineEventTypeForRecoveryDetail(
  type: ExecutionRunStoredRecord['bundle']['sharedState']['history'][number]['type'],
): 'step-started' | 'step-succeeded' | 'step-failed' | 'handoff-consumed' | 'note-added' | null {
  switch (type) {
    case 'step-started':
    case 'step-succeeded':
    case 'step-failed':
    case 'handoff-consumed':
    case 'note-added':
      return type;
    default:
      return null;
  }
}

function readExecutionRunHandoffTransferSummaryForRecoveryDetail(
  record: ExecutionRunStoredRecord,
): ExecutionServiceHostRecoveryDetail['handoffTransferSummary'] {
  const selectedStep =
    record.bundle.steps
      .slice()
      .reverse()
      .find((step) => step.dependsOnStepIds.length > 0) ?? null;

  if (!selectedStep) {
    return null;
  }

  const storedSummary = readStoredConsumedTaskTransferSummaryForRecoveryDetail(record, selectedStep.id);
  if (storedSummary) {
    return storedSummary;
  }

  const items = record.bundle.handoffs
    .filter((handoff) => handoff.toStepId === selectedStep.id && isRecord(handoff.structuredData.taskTransfer))
    .map((handoff) => {
      const taskTransfer = handoff.structuredData.taskTransfer as Record<string, unknown>;
      return {
        handoffId: handoff.id ?? null,
        fromStepId: handoff.fromStepId ?? null,
        fromAgentId: handoff.fromAgentId ?? null,
        title: typeof taskTransfer.title === 'string' ? taskTransfer.title : null,
        objective: typeof taskTransfer.objective === 'string' ? taskTransfer.objective : null,
        requestedOutputCount: Array.isArray(taskTransfer.requestedOutputs) ? taskTransfer.requestedOutputs.length : 0,
        inputArtifactCount: Array.isArray(taskTransfer.inputArtifacts) ? taskTransfer.inputArtifacts.length : 0,
      };
    });

  if (items.length === 0) {
    return null;
  }

  return {
    total: items.length,
    items,
  };
}

function readStoredConsumedTaskTransferSummaryForRecoveryDetail(
  record: ExecutionRunStoredRecord,
  stepId: string,
): ExecutionServiceHostRecoveryDetail['handoffTransferSummary'] {
  const entry = record.bundle.sharedState.structuredOutputs.find(
    (structuredOutput) => structuredOutput.key === `step.consumedTaskTransfers.${stepId}`,
  );
  if (!entry || !isRecord(entry.value) || !Array.isArray(entry.value.items)) {
    return null;
  }

  const items = entry.value.items
    .filter(isRecord)
    .map((item) => ({
      handoffId: typeof item.handoffId === 'string' ? item.handoffId : null,
      fromStepId: typeof item.fromStepId === 'string' ? item.fromStepId : null,
      fromAgentId: typeof item.fromAgentId === 'string' ? item.fromAgentId : null,
      title: typeof item.title === 'string' ? item.title : null,
      objective: typeof item.objective === 'string' ? item.objective : null,
      requestedOutputCount:
        typeof item.requestedOutputCount === 'number' && Number.isFinite(item.requestedOutputCount)
          ? Math.max(0, Math.trunc(item.requestedOutputCount))
          : 0,
      inputArtifactCount:
        typeof item.inputArtifactCount === 'number' && Number.isFinite(item.inputArtifactCount)
          ? Math.max(0, Math.trunc(item.inputArtifactCount))
          : 0,
    }));

  if (items.length === 0) {
    return null;
  }

  return {
    total: items.length,
    items,
  };
}

function classifyHostDrainCandidate(
  record: ExecutionRunStoredRecord,
  dispatchPlan: NonNullable<Awaited<ReturnType<ExecutionRuntimeControlContract['inspectRun']>>>['dispatchPlan'],
  now: () => string,
): HostDrainCandidateKind {
  if (getActiveExecutionRunLease(record)) {
    return 'active-lease';
  }
  if (dispatchPlan.nextRunnableStepId) {
    return 'runnable';
  }
  if (dispatchPlan.runningStepIds.length > 0) {
    return canRecoverStrandedRun(record, now) ? 'recoverable-stranded' : 'stranded';
  }
  return 'idle';
}

function compareHostDrainCandidatePriority(left: HostDrainCandidateKind, right: HostDrainCandidateKind): number {
  return hostDrainCandidatePriority(left) - hostDrainCandidatePriority(right);
}

function hostDrainCandidatePriority(kind: HostDrainCandidateKind): number {
  // Keep the mixed-batch host policy intentionally simple:
  // 1. actionable runnable work
  // 2. actionable recoverable-stranded work
  // 3. non-executable classes
  // Within each class, preserve oldest-first createdAt ordering.
  switch (kind) {
    case 'runnable':
      return 0;
    case 'recoverable-stranded':
      return 1;
    case 'active-lease':
      return 2;
    case 'stranded':
      return 3;
    case 'idle':
      return 4;
    case 'missing':
      return 5;
  }
}

function createActionableExecutionPlan(candidates: HostDrainCandidateInspection[], maxRuns: number): Set<string> {
  const planned = new Set<string>();
  if (maxRuns <= 0) {
    return planned;
  }

  const runnable = candidates.filter((candidate) => candidate.kind === 'runnable');
  const recoverableStranded = candidates.filter((candidate) => candidate.kind === 'recoverable-stranded');

  if (runnable.length > 0 && recoverableStranded.length > 0 && maxRuns > 1) {
    const runnableBudget = Math.max(0, maxRuns - 1);
    for (const candidate of runnable.slice(0, runnableBudget)) {
      planned.add(candidate.runId);
    }
    planned.add(recoverableStranded[0]!.runId);
    return planned;
  }

  for (const candidate of candidates) {
    if (candidate.kind !== 'runnable' && candidate.kind !== 'recoverable-stranded') {
      continue;
    }
    planned.add(candidate.runId);
    if (planned.size >= maxRuns) {
      break;
    }
  }

  return planned;
}

function tryRecoverStrandedRun(
  record: ExecutionRunStoredRecord,
  control: ExecutionRuntimeControlContract,
  now: () => string,
): Promise<boolean> {
  return recoverAndPersistStrandedRun(control, record, now, 2);
}

function canRecoverStrandedRun(record: ExecutionRunStoredRecord, now: () => string): boolean {
  const recovered = recoverStrandedRunningExecutionRun({
    record,
    now,
  });
  return Boolean(recovered && recovered.recoveredStepIds.length > 0);
}

async function recoverAndPersistStrandedRun(
  control: ExecutionRuntimeControlContract,
  record: ExecutionRunStoredRecord,
  now: () => string,
  attemptsRemaining: number,
): Promise<boolean> {
  const recovered = recoverStrandedRunningExecutionRun({
    record,
    now,
  });
  if (!recovered || recovered.recoveredStepIds.length === 0) {
    return false;
  }

  try {
    await control.persistRun({
      runId: record.runId,
      bundle: recovered.bundle,
      expectedRevision: record.revision,
    });
    return true;
  } catch {
    if (attemptsRemaining <= 1) {
      return false;
    }
    const reread = await control.readRun(record.runId);
    if (!reread) {
      return false;
    }
    if (getActiveExecutionRunLease(reread)) {
      return false;
    }
    return recoverAndPersistStrandedRun(control, reread, now, attemptsRemaining - 1);
  }
}

async function listCandidateRuns(
  control: ExecutionRuntimeControlContract,
  options: DrainStoredExecutionRunsOnceOptions,
): Promise<ExecutionRunStoredRecord[]> {
  if (options.runId) {
    const record = await control.readRun(options.runId);
    return record ? [record] : [];
  }

  const records = await control.listRuns({
    sourceKind: options.sourceKind,
  });
  return records.sort((left, right) => left.bundle.run.createdAt.localeCompare(right.bundle.run.createdAt));
}
