import { createExecutionRunDispatchPlan } from './dispatcher.js';
import { createExecutionRuntimeControl } from './control.js';
import { createExecutionRunEvent } from './model.js';
import { ExecutionRunRecordBundleSchema } from './schema.js';
import { createExecutionRunRecordStore, type ExecutionRunRecordStore, type ExecutionRunStoredRecord } from './store.js';
import { getActiveExecutionRunLease } from './contract.js';
import { normalizeTeamRunArtifactRefs } from './artifactRef.js';
import { normalizeRuntimeStructuredOutputs } from './responseOutput.js';
import { normalizeTaskTransfer, type NormalizedTaskTransfer } from './taskTransfer.js';
import type { TeamRunStructuredOutput } from '../teams/types.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import type { ExecutionRunEvent, ExecutionRunRecordBundle, ExecutionRunSharedState, ExecutionRunStep } from './types.js';
import { createTeamRunLocalActionRequest } from '../teams/model.js';
import type { TeamRunLocalActionRequest, TeamRunLocalActionRequestStatus } from '../teams/types.js';
import { asOracleUserError } from '../oracle/errors.js';

export interface ExecuteStoredRunStepResult {
  output?: ExecutionRunStep['output'];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  } | null;
  sharedState?: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
}

export interface ExecuteStoredRunStepContext {
  record: ExecutionRunStoredRecord;
  step: ExecutionRunStep;
}

export interface ExecuteLocalActionRequestResult {
  status?: Extract<TeamRunLocalActionRequestStatus, 'requested' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled'>;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  notes?: string[];
  sharedState?: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
}

export interface ExecuteLocalActionRequestContext {
  record: ExecutionRunStoredRecord;
  step: ExecutionRunStep;
  request: TeamRunLocalActionRequest;
}

export interface ExecuteStoredRunOnceOptions {
  runId: string;
  ownerId: string;
  leaseId?: string;
  existingLeaseId?: string | null;
  now?: () => string;
  leaseHeartbeatIntervalMs?: number;
  leaseHeartbeatTtlMs?: number;
  control?: ExecutionRuntimeControlContract;
  store?: ExecutionRunRecordStore;
  executeStep?: (context: ExecuteStoredRunStepContext) => Promise<ExecuteStoredRunStepResult | void>;
  executeLocalActionRequest?: (
    context: ExecuteLocalActionRequestContext,
  ) => Promise<ExecuteLocalActionRequestResult | void>;
}

export interface RecoveredExecutionRun {
  bundle: ExecutionRunRecordBundle;
  recoveredStepIds: string[];
}

export async function executeStoredExecutionRunOnce(
  options: ExecuteStoredRunOnceOptions,
): Promise<ExecutionRunStoredRecord> {
  const now = options.now ?? (() => new Date().toISOString());
  const control = options.control ?? createExecutionRuntimeControl(options.store);
  const store = options.store ?? createExecutionRunRecordStore();
  const leaseHeartbeatIntervalMs = Math.max(0, options.leaseHeartbeatIntervalMs ?? 5_000);
  const leaseHeartbeatTtlMs = Math.max(1, options.leaseHeartbeatTtlMs ?? 15_000);
  const inspection = await control.inspectRun(options.runId);
  if (!inspection) {
    throw new Error(`Execution run ${options.runId} was not found`);
  }
  const stepId = inspection.dispatchPlan.nextRunnableStepId;
  if (!stepId) {
    return inspection.record;
  }

  const inspectedStep = requireStep(inspection.record.bundle, stepId);
  const providerBudgetMaxTokens = resolveStepProviderBudgetMaxTokens(inspectedStep);
  if (providerBudgetMaxTokens !== null) {
    const consumedProviderTokens = readStoredProviderUsageTotalTokens(inspection.record.bundle);
    if (consumedProviderTokens > providerBudgetMaxTokens) {
      const failedAt = now();
      const failedBundle = failExecutionRunStep({
        bundle: inspection.record.bundle,
        stepId,
        failedAt,
        failure: {
          code: 'task_provider_token_limit_exceeded',
          message: `stored provider token usage ${consumedProviderTokens} exceeds task provider token limit ${providerBudgetMaxTokens}`,
          ownerStepId: stepId,
          details: {
            maxTokens: providerBudgetMaxTokens,
            consumedTokens: consumedProviderTokens,
          },
        },
      });
      return store.writeRecord(failedBundle, { expectedRevision: inspection.record.revision });
    }
  }
  const providerBudgetMaxRequests = resolveStepProviderBudgetMaxRequests(inspectedStep);
  if (providerBudgetMaxRequests !== null && inspectedStep.order > providerBudgetMaxRequests) {
    const failedAt = now();
    const failedBundle = failExecutionRunStep({
      bundle: inspection.record.bundle,
      stepId,
      failedAt,
      failure: {
        code: 'task_provider_request_limit_exceeded',
        message: `step order ${inspectedStep.order} exceeds task provider request limit ${providerBudgetMaxRequests}`,
        ownerStepId: stepId,
        details: {
          maxRequests: providerBudgetMaxRequests,
          stepOrder: inspectedStep.order,
        },
      },
    });
    return store.writeRecord(failedBundle, { expectedRevision: inspection.record.revision });
  }
  const maxRuntimeMinutes = resolveStepMaxRuntimeMinutes(inspectedStep);
  if (maxRuntimeMinutes !== null) {
    const elapsedRuntimeMinutes = calculateElapsedRuntimeMinutes({
      startedAt: inspection.record.bundle.run.createdAt,
      now: now(),
    });
    if (elapsedRuntimeMinutes !== null && elapsedRuntimeMinutes > maxRuntimeMinutes) {
      const failedAt = now();
      const failedBundle = failExecutionRunStep({
        bundle: inspection.record.bundle,
        stepId,
        failedAt,
        failure: {
          code: 'task_runtime_limit_exceeded',
          message: `elapsed runtime ${elapsedRuntimeMinutes} minutes exceeds task runtime limit ${maxRuntimeMinutes}`,
          ownerStepId: stepId,
          details: {
            maxRuntimeMinutes,
            elapsedRuntimeMinutes,
          },
        },
      });
      return store.writeRecord(failedBundle, { expectedRevision: inspection.record.revision });
    }
  }
  const turnPolicyMaxTurns = resolveStepTurnPolicyMaxTurns(inspectedStep);
  if (turnPolicyMaxTurns !== null && inspectedStep.order > turnPolicyMaxTurns) {
    const failedAt = now();
    const failedBundle = failExecutionRunStep({
      bundle: inspection.record.bundle,
      stepId,
      failedAt,
      failure: {
        code: 'task_turn_limit_exceeded',
        message: `step order ${inspectedStep.order} exceeds task turn limit ${turnPolicyMaxTurns}`,
        ownerStepId: stepId,
        details: {
          maxTurns: turnPolicyMaxTurns,
          stepOrder: inspectedStep.order,
        },
      },
    });
    return store.writeRecord(failedBundle, { expectedRevision: inspection.record.revision });
  }

  const existingLeaseId = options.existingLeaseId ?? null;
  const leaseId = existingLeaseId ?? options.leaseId ?? `${options.runId}:lease:local-runner`;
  let currentRecord: ExecutionRunStoredRecord;

  if (existingLeaseId) {
    const activeLease = getActiveExecutionRunLease(inspection.record);
    if (!activeLease || activeLease.id !== existingLeaseId) {
      throw new Error(`Execution run ${options.runId} does not have active lease ${existingLeaseId}`);
    }
    if (activeLease.ownerId !== options.ownerId) {
      throw new Error(`Execution run ${options.runId} active lease ${existingLeaseId} is owned by ${activeLease.ownerId}`);
    }
    const heartbeatAt = now();
    currentRecord = await control.heartbeatLease({
      runId: options.runId,
      leaseId: existingLeaseId,
      heartbeatAt,
      expiresAt: addMillisecondsToIsoTimestamp(heartbeatAt, leaseHeartbeatTtlMs),
    });
  } else {
    const acquiredAt = now();
    currentRecord = await control.acquireLease({
      runId: options.runId,
      leaseId,
      ownerId: options.ownerId,
      acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt: addMillisecondsToIsoTimestamp(acquiredAt, leaseHeartbeatTtlMs),
    });
  }

  let releaseReason: string | null = 'completed';
  let finalRecord: ExecutionRunStoredRecord | null = null;
  const leaseHeartbeat = startExecutionLeaseHeartbeatLoop({
    enabled: leaseHeartbeatIntervalMs > 0,
    intervalMs: leaseHeartbeatIntervalMs,
    ttlMs: leaseHeartbeatTtlMs,
    runId: options.runId,
    leaseId,
    control,
    now,
  });

  try {
    const startedAt = now();
    const startedBundle = startExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      startedAt,
    });
    currentRecord = await store.writeRecord(startedBundle, { expectedRevision: currentRecord.revision });

    const runningStep = requireStep(currentRecord.bundle, stepId);
    const executionContextStep = buildExecutionContextStep({
      bundle: currentRecord.bundle,
      step: runningStep,
    });
    const escalationBehavior = resolveEscalationControlBehavior(executionContextStep);
    if (escalationBehavior?.action === 'pause') {
      const cancelledAt = now();
      const cancelledBundle = cancelExecutionRunStepForHumanEscalation({
        bundle: currentRecord.bundle,
        stepId,
        cancelledAt,
        guidance: escalationBehavior.guidance,
      });
      currentRecord = await store.writeRecord(cancelledBundle, { expectedRevision: currentRecord.revision });
      releaseReason = 'cancelled';
      finalRecord = currentRecord;
      return finalRecord;
    }
    if (escalationBehavior?.action === 'fail') {
      releaseReason = 'failed';
      const failedAt = now();
      const failedBundle = failExecutionRunStep({
        bundle: currentRecord.bundle,
        stepId,
        failedAt,
        failure: {
          code: 'human_escalation_required',
          message: escalationBehavior.message,
          ownerStepId: stepId,
          details: {
            guidance: escalationBehavior.guidance,
          },
        },
      });
      currentRecord = await store.writeRecord(failedBundle, { expectedRevision: currentRecord.revision });
      finalRecord = currentRecord;
      return finalRecord;
    }
    const result =
      (await options.executeStep?.({
        record: currentRecord,
        step: executionContextStep,
      })) ?? {
        output: {
          summary: 'bounded local runner pass completed',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      };
    const output = normalizeExecutionRunStepOutput(result.output ?? {
      summary: 'bounded local runner pass completed',
      artifacts: [],
      structuredData: {},
      notes: [],
    });

    await leaseHeartbeat.stop();
    currentRecord = (await control.readRun(options.runId)) ?? currentRecord;
    if (currentRecord.bundle.run.status === 'cancelled' || requireStep(currentRecord.bundle, stepId).status === 'cancelled') {
      releaseReason = 'cancelled';
      finalRecord = currentRecord;
      return finalRecord;
    }

    const resolvedLocalActionOutcome = await resolveLocalActionRequests({
      record: currentRecord,
      step: runningStep,
      completedAt: now(),
      output,
      executeLocalActionRequest: options.executeLocalActionRequest,
    });

    const completedAt = now();
    const sharedStatePatch =
      mergeSharedStatePatch(
        mergeSharedStatePatch(
          mergeSharedStatePatch(
            result.sharedState,
            buildProviderUsageSharedStatePatch({
              stepId,
              generatedAt: completedAt,
              usage: result.usage ?? null,
            }),
          ),
          buildConsumedTaskTransfersSharedStatePatch({
            step: executionContextStep,
            generatedAt: completedAt,
          }),
        ),
        resolvedLocalActionOutcome.sharedState,
      ) ?? {};
    const requestedOutputEnforcement = evaluateRequiredRequestedOutputsForStoredRuntime({
      step: runningStep,
      output,
      sharedState: {
        artifacts: [...currentRecord.bundle.sharedState.artifacts, ...(sharedStatePatch.artifacts ?? [])],
        structuredOutputs: [
          ...currentRecord.bundle.sharedState.structuredOutputs,
          ...(sharedStatePatch.structuredOutputs ?? []),
        ],
      },
    });
    if (requestedOutputEnforcement.status === 'missing-required') {
      releaseReason = 'failed';
      const failedBundle = failExecutionRunStep({
        bundle: currentRecord.bundle,
        stepId,
        failedAt: completedAt,
        output,
        sharedState: sharedStatePatch,
        localActionRequests: resolvedLocalActionOutcome.requests,
        localActionEvents: resolvedLocalActionOutcome.events,
        failure: {
          code: 'requested_output_required_missing',
          message: requestedOutputEnforcement.message,
          ownerStepId: stepId,
          details: {
            missingRequiredLabels: requestedOutputEnforcement.missingRequiredLabels,
          },
        },
      });
      currentRecord = await store.writeRecord(failedBundle, { expectedRevision: currentRecord.revision });
      finalRecord = currentRecord;
      return finalRecord;
    }
    const succeededBundle = succeedExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      completedAt,
      output,
      sharedState: sharedStatePatch,
      localActionRequests: resolvedLocalActionOutcome.requests,
      localActionEvents: resolvedLocalActionOutcome.events,
      resolvedLocalActionRequestsForStep: resolvedLocalActionOutcome.resolvedRequests,
    });
    currentRecord = await store.writeRecord(succeededBundle, { expectedRevision: currentRecord.revision });
    finalRecord = currentRecord;
  } catch (error) {
    await leaseHeartbeat.stop();
    currentRecord = (await control.readRun(options.runId)) ?? currentRecord;
    if (currentRecord.bundle.run.status === 'cancelled' || requireStep(currentRecord.bundle, stepId).status === 'cancelled') {
      releaseReason = 'cancelled';
      finalRecord = currentRecord;
      return finalRecord;
    }
    releaseReason = 'failed';
    const failedAt = now();
    const userError = asOracleUserError(error);
    const failedBundle = failExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      failedAt,
      failure: {
        code: 'runner_execution_failed',
        message: error instanceof Error ? error.message : String(error),
        ownerStepId: stepId,
        details: userError?.details ?? null,
      },
    });
    currentRecord = await store.writeRecord(failedBundle, { expectedRevision: currentRecord.revision });
    finalRecord = currentRecord;
  } finally {
    await leaseHeartbeat.stop();
    finalRecord = await releaseExecutionRunLeaseIfStillActive({
      control,
      currentRecord: finalRecord ?? currentRecord,
      runId: options.runId,
      leaseId,
      releasedAt: now(),
      releaseReason,
    });
  }

  if (!finalRecord) {
    throw new Error(`Execution run ${options.runId} did not produce a final stored record`);
  }
  return finalRecord;
}

async function releaseExecutionRunLeaseIfStillActive(input: {
  control: ExecutionRuntimeControlContract;
  currentRecord: ExecutionRunStoredRecord;
  runId: string;
  leaseId: string;
  releasedAt: string;
  releaseReason: string | null;
}): Promise<ExecutionRunStoredRecord> {
  const latestRecord = (await input.control.readRun(input.runId)) ?? input.currentRecord;
  const activeLease = getActiveExecutionRunLease(latestRecord);
  if (!activeLease || activeLease.id !== input.leaseId) {
    return latestRecord;
  }
  return input.control.releaseLease({
    runId: input.runId,
    leaseId: input.leaseId,
    releasedAt: input.releasedAt,
    releaseReason: input.releaseReason,
  });
}

function startExecutionLeaseHeartbeatLoop(input: {
  enabled: boolean;
  intervalMs: number;
  ttlMs: number;
  runId: string;
  leaseId: string;
  control: ExecutionRuntimeControlContract;
  now: () => string;
}): { stop(): Promise<void> } {
  if (!input.enabled) {
    return {
      async stop() {
        return;
      },
    };
  }

  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    const heartbeatAt = input.now();
    const expiresAt = addMillisecondsToIsoTimestamp(heartbeatAt, input.ttlMs);
    inFlight = inFlight
      .catch(() => undefined)
      .then(async () => {
        if (stopped) return;
        await input.control.heartbeatLease({
          runId: input.runId,
          leaseId: input.leaseId,
          heartbeatAt,
          expiresAt,
        });
      })
      .catch(() => undefined);
  }, input.intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await inFlight.catch(() => undefined);
    },
  };
}

function addMillisecondsToIsoTimestamp(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed + milliseconds).toISOString();
}

export function recoverStrandedRunningExecutionRun(input: {
  record: ExecutionRunStoredRecord;
  now?: () => string;
}): RecoveredExecutionRun | null {
  const record = input.record;
  const now = input.now ?? (() => new Date().toISOString());
  const dispatchPlan = createExecutionRunDispatchPlan(record.bundle);
  if (dispatchPlan.runningStepIds.length === 0) {
    return null;
  }

  const recoveredStepIds: string[] = [];
  let currentBundle = record.bundle;

  for (const stepId of dispatchPlan.runningStepIds) {
    let wasRecovered = false;
    const recoveryTimestamp = now();
    const recoveredBundle = applyBundleMutation({
      bundle: currentBundle,
      updatedAt: recoveryTimestamp,
      event: createExecutionRunEvent({
        id: `${record.runId}:event:${stepId}:recovered-no-lease:${recoveryTimestamp}`,
        runId: record.runId,
        type: 'note-added',
        createdAt: recoveryTimestamp,
        stepId,
        note: 'recovered stranded running step for host replay',
        payload: {
          stepId,
          fromStatus: 'running',
          toStatus: 'runnable',
          source: 'service-host',
        },
      }),
      runStatus: 'running',
      sharedStateStatus: 'active',
      stepUpdater: (candidate) => {
        if (candidate.id !== stepId || candidate.status !== 'running') {
          return candidate;
        }
        wasRecovered = true;
        return {
          ...candidate,
          status: 'runnable',
          startedAt: null,
          completedAt: null,
          failure: null,
        };
      },
    });

    if (wasRecovered) {
      recoveredStepIds.push(stepId);
      currentBundle = recoveredBundle;
    }
  }

  if (recoveredStepIds.length === 0) {
    return null;
  }

  return {
    bundle: currentBundle,
    recoveredStepIds,
  };
}

export function startExecutionRunStep(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  startedAt: string;
}): ExecutionRunRecordBundle {
  const step = requireStep(input.bundle, input.stepId);
  if (step.status !== 'planned' && step.status !== 'runnable') {
    throw new Error(`Execution step ${input.stepId} is not runnable`);
  }

  const event = createExecutionRunEvent({
    id: `${input.bundle.run.id}:event:${input.stepId}:started:${input.startedAt}`,
    runId: input.bundle.run.id,
    stepId: input.stepId,
    type: 'step-started',
    createdAt: input.startedAt,
    note: 'step started by local runner',
  });

  return applyBundleMutation({
    bundle: input.bundle,
    updatedAt: input.startedAt,
    event,
    runStatus: 'running',
    sharedStateStatus: 'active',
    stepUpdater: (candidate) =>
      candidate.id === input.stepId
        ? {
            ...candidate,
            status: 'running',
            startedAt: input.startedAt,
            completedAt: null,
            failure: null,
          }
        : candidate,
  });
}

export function succeedExecutionRunStep(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  completedAt: string;
  output?: ExecutionRunStep['output'];
  sharedState?: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
  localActionRequests?: TeamRunLocalActionRequest[];
  localActionEvents?: ExecutionRunEvent[];
  resolvedLocalActionRequestsForStep?: TeamRunLocalActionRequest[];
}): ExecutionRunRecordBundle {
  const step = requireStep(input.bundle, input.stepId);
  if (step.status !== 'running') {
    throw new Error(`Execution step ${input.stepId} is not running`);
  }

  const provisional = applyBundleMutation({
    bundle: input.bundle,
    updatedAt: input.completedAt,
    event: createExecutionRunEvent({
      id: `${input.bundle.run.id}:event:${input.stepId}:succeeded:${input.completedAt}`,
      runId: input.bundle.run.id,
      stepId: input.stepId,
      type: 'step-succeeded',
      createdAt: input.completedAt,
      note: 'step completed by local runner',
    }),
    runStatus: 'running',
    sharedStateStatus: 'active',
    stepUpdater: (candidate) =>
      candidate.id === input.stepId
        ? {
            ...candidate,
            status: 'succeeded',
            completedAt: input.completedAt,
            output: input.output ?? {
              summary: 'bounded local runner pass completed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            failure: null,
          }
        : candidate,
    sharedStateAppender: (sharedState) => ({
      ...sharedState,
      artifacts: [...sharedState.artifacts, ...normalizeTeamRunArtifactRefs(input.sharedState?.artifacts)],
      structuredOutputs: [
        ...sharedState.structuredOutputs,
        ...normalizeRuntimeStructuredOutputs(input.sharedState?.structuredOutputs),
      ],
      notes: [...sharedState.notes, ...(input.sharedState?.notes ?? [])],
    }),
  });

  const dispatchPlan = createExecutionRunDispatchPlan(provisional);
  const allSucceeded = provisional.steps.every((candidate) => candidate.status === 'succeeded');
  const consumedTaskTransferLifecycle = applyConsumedTaskTransferLifecycle({
    bundle: provisional,
    stepId: input.stepId,
    completedAt: input.completedAt,
  });
  const handoffs = applyResolvedLocalActionOutcomeContextToHandoffs({
    handoffs: consumedTaskTransferLifecycle.handoffs,
    stepId: input.stepId,
    completedAt: input.completedAt,
    resolvedLocalActionRequestsForStep: input.resolvedLocalActionRequestsForStep ?? [],
  });
  const appendedEvents = [...(input.localActionEvents ?? []), ...consumedTaskTransferLifecycle.events];
  return ExecutionRunRecordBundleSchema.parse({
    ...provisional,
    handoffs,
    localActionRequests: input.localActionRequests ?? provisional.localActionRequests,
    events: [...provisional.events, ...appendedEvents],
    run: {
      ...provisional.run,
      status: allSucceeded ? 'succeeded' : dispatchPlan.runningStepIds.length > 0 ? 'running' : provisional.run.status,
    },
    sharedState: {
      ...provisional.sharedState,
      status: allSucceeded ? 'succeeded' : provisional.sharedState.status,
      history: [...provisional.sharedState.history, ...appendedEvents],
    },
  });
}

export function failExecutionRunStep(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  failedAt: string;
  output?: ExecutionRunStep['output'];
  sharedState?: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
  localActionRequests?: TeamRunLocalActionRequest[];
  localActionEvents?: ExecutionRunEvent[];
  failure: ExecutionRunStep['failure'];
}): ExecutionRunRecordBundle {
  const step = requireStep(input.bundle, input.stepId);
  if (step.status !== 'running' && step.status !== 'runnable' && step.status !== 'planned') {
    throw new Error(`Execution step ${input.stepId} cannot fail from status ${step.status}`);
  }

  const provisional = applyBundleMutation({
    bundle: input.bundle,
    updatedAt: input.failedAt,
    event: createExecutionRunEvent({
      id: `${input.bundle.run.id}:event:${input.stepId}:failed:${input.failedAt}`,
      runId: input.bundle.run.id,
      stepId: input.stepId,
      type: 'step-failed',
      createdAt: input.failedAt,
      note: input.failure?.message ?? 'step failed',
      payload: {
        code: input.failure?.code ?? 'runner_execution_failed',
      },
    }),
    runStatus: 'failed',
    sharedStateStatus: 'failed',
    stepUpdater: (candidate) =>
      candidate.id === input.stepId
        ? {
            ...candidate,
            status: 'failed',
            completedAt: input.failedAt,
            output: input.output ?? candidate.output,
            failure: input.failure,
          }
        : candidate,
    sharedStateAppender: (sharedState) => ({
      ...sharedState,
      artifacts: [...sharedState.artifacts, ...normalizeTeamRunArtifactRefs(input.sharedState?.artifacts)],
      structuredOutputs: [
        ...sharedState.structuredOutputs,
        ...normalizeRuntimeStructuredOutputs(input.sharedState?.structuredOutputs),
      ],
      notes: [...sharedState.notes, ...(input.sharedState?.notes ?? [])],
    }),
  });
  return ExecutionRunRecordBundleSchema.parse({
    ...provisional,
    localActionRequests: input.localActionRequests ?? provisional.localActionRequests,
    events: [...provisional.events, ...(input.localActionEvents ?? [])],
    sharedState: {
      ...provisional.sharedState,
      history: [...provisional.sharedState.history, ...(input.localActionEvents ?? [])],
    },
  });
}

export function cancelExecutionRunStepForHumanEscalation(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  cancelledAt: string;
  guidance: Record<string, unknown>;
}): ExecutionRunRecordBundle {
  const step = requireStep(input.bundle, input.stepId);
  if (step.status !== 'running') {
    throw new Error(`Execution step ${input.stepId} is not running`);
  }

  const escalationOutput = {
    key: `human.escalation.${input.stepId}`,
    value: {
      stepId: input.stepId,
      requestedAt: input.cancelledAt,
      reason: 'dependency-local-action-escalate',
      guidance: input.guidance,
    },
  } satisfies TeamRunStructuredOutput;

  return applyBundleMutation({
    bundle: input.bundle,
    updatedAt: input.cancelledAt,
    event: createExecutionRunEvent({
      id: `${input.bundle.run.id}:event:${input.stepId}:human-escalation:${input.cancelledAt}`,
      runId: input.bundle.run.id,
      stepId: input.stepId,
      type: 'note-added',
      createdAt: input.cancelledAt,
      note: 'step paused for human escalation after dependency host-action guidance escalated',
      payload: {
        guidance: input.guidance,
      },
    }),
    runStatus: 'cancelled',
    sharedStateStatus: 'cancelled',
    stepUpdater: (candidate) =>
      candidate.id === input.stepId
        ? {
            ...candidate,
            status: 'cancelled',
            completedAt: input.cancelledAt,
            output: {
              summary: 'paused for human escalation',
              artifacts: [],
              structuredData: {
                humanEscalation: {
                  requestedAt: input.cancelledAt,
                  guidance: input.guidance,
                },
              },
              notes: ['dependency host-action guidance escalated; runner paused for human input'],
            },
            failure: null,
          }
        : candidate,
    sharedStateAppender: (sharedState) => ({
      ...sharedState,
      structuredOutputs: [...sharedState.structuredOutputs, escalationOutput],
      notes: [...sharedState.notes, 'run paused for human escalation'],
    }),
  });
}

export function cancelExecutionRun(input: {
  bundle: ExecutionRunRecordBundle;
  cancelledAt: string;
  note?: string | null;
  source?: 'operator' | 'service-host';
}): ExecutionRunRecordBundle {
  const mutableStatuses = new Set<ExecutionRunStep['status']>(['planned', 'runnable', 'running', 'blocked']);
  const hasMutableStep = input.bundle.steps.some((step) => mutableStatuses.has(step.status));
  if (!hasMutableStep) {
    throw new Error(`Execution run ${input.bundle.run.id} has no active or pending steps to cancel`);
  }

  const note = input.note ?? 'run cancelled by local operator control';
  const source = input.source ?? 'operator';

  return applyBundleMutation({
    bundle: input.bundle,
    updatedAt: input.cancelledAt,
    event: createExecutionRunEvent({
      id: `${input.bundle.run.id}:event:run-cancelled:${input.cancelledAt}`,
      runId: input.bundle.run.id,
      type: 'note-added',
      createdAt: input.cancelledAt,
      note,
      payload: {
        source,
        status: 'cancelled',
      },
    }),
    runStatus: 'cancelled',
    sharedStateStatus: 'cancelled',
    stepUpdater: (candidate) =>
      mutableStatuses.has(candidate.status)
        ? {
            ...candidate,
            status: 'cancelled',
            completedAt: candidate.completedAt ?? input.cancelledAt,
            failure: null,
            output:
              candidate.output ??
              {
                summary: note,
                artifacts: [],
                structuredData: {
                  cancellation: {
                    cancelledAt: input.cancelledAt,
                    source,
                  },
                },
                notes: [note],
              },
          }
        : candidate,
    sharedStateAppender: (sharedState) => ({
      ...sharedState,
      notes: [...sharedState.notes, note],
    }),
  });
}

export function resumeExecutionRunAfterHumanEscalation(input: {
  bundle: ExecutionRunRecordBundle;
  resumedAt: string;
  note?: string | null;
  guidance?: Record<string, unknown> | null;
  override?: {
    promptAppend?: string | null;
    structuredContext?: Record<string, unknown> | null;
  } | null;
}): ExecutionRunRecordBundle {
  const cancelledStep = input.bundle.steps.find(
    (step) =>
      step.status === 'cancelled' &&
      isRecord(step.output?.structuredData) &&
      isRecord(step.output?.structuredData.humanEscalation),
  );
  if (!cancelledStep) {
    throw new Error(`Execution run ${input.bundle.run.id} has no cancelled human-escalation step to resume`);
  }

  const resumeOutput = {
    key: `human.resume.${cancelledStep.id}`,
    value: {
      stepId: cancelledStep.id,
      resumedAt: input.resumedAt,
      note: input.note ?? null,
      guidance: input.guidance ?? null,
      override: input.override ?? null,
    },
  } satisfies TeamRunStructuredOutput;
  const resumeEvent = createExecutionRunEvent({
    id: `${input.bundle.run.id}:event:${cancelledStep.id}:human-resume:${input.resumedAt}`,
    runId: input.bundle.run.id,
    stepId: cancelledStep.id,
    type: 'note-added',
    createdAt: input.resumedAt,
    note: input.note ?? 'run resumed after human escalation',
    payload: {
      resumedStepId: cancelledStep.id,
      source: 'human-escalation-resume',
    },
  });

  return ExecutionRunRecordBundleSchema.parse({
    ...input.bundle,
    run: {
      ...input.bundle.run,
      status: 'running',
      updatedAt: input.resumedAt,
    },
    steps: input.bundle.steps.map((step) =>
      step.id === cancelledStep.id
        ? {
            ...step,
            status: 'runnable',
            completedAt: null,
            output: null,
            failure: null,
            input: {
              ...step.input,
              structuredData: {
                ...step.input.structuredData,
                humanEscalationResume: {
                  resumedAt: input.resumedAt,
                  note: input.note ?? null,
                  guidance: input.guidance ?? null,
                  override: input.override ?? null,
                },
              },
            },
          }
        : step,
    ),
    events: [...input.bundle.events, resumeEvent],
    sharedState: {
      ...input.bundle.sharedState,
      status: 'active',
      structuredOutputs: [...input.bundle.sharedState.structuredOutputs, resumeOutput],
      notes: [...input.bundle.sharedState.notes, input.note ?? 'run resumed after human escalation'],
      history: [...input.bundle.sharedState.history, resumeEvent],
      lastUpdatedAt: input.resumedAt,
    },
  });
}

function requireStep(bundle: ExecutionRunRecordBundle, stepId: string): ExecutionRunStep {
  const step = bundle.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Execution step ${stepId} was not found in run ${bundle.run.id}`);
  }
  return step;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeSharedStatePatch(
  left: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> | undefined,
  right: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> | undefined,
): Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> | undefined {
  if (!left && !right) return undefined;
  return {
    artifacts: [
      ...normalizeTeamRunArtifactRefs(left?.artifacts),
      ...normalizeTeamRunArtifactRefs(right?.artifacts),
    ],
    structuredOutputs: [
      ...normalizeRuntimeStructuredOutputs(left?.structuredOutputs),
      ...normalizeRuntimeStructuredOutputs(right?.structuredOutputs),
    ],
    notes: [...(left?.notes ?? []), ...(right?.notes ?? [])],
  };
}

function normalizeExecutionRunStepOutput(
  output: NonNullable<ExecutionRunStep['output']>,
): NonNullable<ExecutionRunStep['output']> {
  return {
    ...output,
    artifacts: normalizeTeamRunArtifactRefs(output.artifacts),
  };
}

function buildProviderUsageSharedStatePatch(input: {
  stepId: string;
  generatedAt: string;
  usage:
    | {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
        totalTokens: number;
      }
    | null;
}): Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> | undefined {
  if (!input.usage) {
    return undefined;
  }
  return {
    structuredOutputs: [
      {
        key: `step.providerUsage.${input.stepId}`,
        value: {
          ownerStepId: input.stepId,
          generatedAt: input.generatedAt,
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          reasoningTokens: input.usage.reasoningTokens,
          totalTokens: input.usage.totalTokens,
        },
      },
    ],
    notes: [
      `provider usage i/o/r/t: ${input.usage.inputTokens}/${input.usage.outputTokens}/${input.usage.reasoningTokens}/${input.usage.totalTokens}`,
    ],
  };
}

function buildConsumedTaskTransfersSharedStatePatch(input: {
  step: ExecutionRunStep;
  generatedAt: string;
}): Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> | undefined {
  const sharedStateContext = isRecord(input.step.input.structuredData.sharedStateContext)
    ? input.step.input.structuredData.sharedStateContext
    : null;
  const dependencyTaskTransfers = sharedStateContext && Array.isArray(sharedStateContext.dependencyTaskTransfers)
    ? sharedStateContext.dependencyTaskTransfers.filter(isRecord)
    : [];
  if (dependencyTaskTransfers.length === 0) {
    return undefined;
  }

  return {
    structuredOutputs: [
      {
        key: `step.consumedTaskTransfers.${input.step.id}`,
        value: {
          ownerStepId: input.step.id,
          generatedAt: input.generatedAt,
          total: dependencyTaskTransfers.length,
          items: dependencyTaskTransfers.map((transfer) => {
            const taskTransfer = normalizeTaskTransfer(transfer.taskTransfer);
            return {
              handoffId: typeof transfer.handoffId === 'string' ? transfer.handoffId : null,
              fromStepId: typeof transfer.fromStepId === 'string' ? transfer.fromStepId : null,
              fromAgentId: typeof transfer.fromAgentId === 'string' ? transfer.fromAgentId : null,
              title: taskTransfer?.title ?? null,
              objective: taskTransfer?.objective ?? null,
              requestedOutputCount: taskTransfer?.requestedOutputs.length ?? 0,
              inputArtifactCount: taskTransfer?.inputArtifacts.length ?? 0,
            };
          }),
        },
      },
    ],
    notes: [formatConsumedTaskTransferNote(input.step.id, dependencyTaskTransfers.length)],
  };
}

function applyConsumedTaskTransferLifecycle(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  completedAt: string;
}): {
  handoffs: ExecutionRunRecordBundle['handoffs'];
  events: ExecutionRunEvent[];
} {
  const step = requireStep(input.bundle, input.stepId);
  const consumedTransfers = extractDependencyTaskTransfers({
    handoffs: input.bundle.handoffs,
    step,
  });
  if (consumedTransfers.length === 0) {
    return {
      handoffs: input.bundle.handoffs,
      events: [],
    };
  }

  const consumedHandoffIds = new Set(consumedTransfers.map((transfer) => transfer.handoffId));
  const handoffs = input.bundle.handoffs.map((handoff) =>
    consumedHandoffIds.has(handoff.id)
      ? {
          ...handoff,
          status: 'consumed' as const,
          notes: [...handoff.notes, `handoff consumed by ${input.stepId}`],
        }
      : handoff,
  );
  const events = consumedTransfers.map((transfer) =>
    createExecutionRunEvent({
      id: `${input.bundle.run.id}:event:${transfer.handoffId}:consumed:${input.completedAt}`,
      runId: input.bundle.run.id,
      stepId: input.stepId,
      type: 'handoff-consumed',
      createdAt: input.completedAt,
      note: `handoff consumed from ${transfer.fromStepId} by ${input.stepId}`,
      payload: {
        handoffId: transfer.handoffId,
        fromStepId: transfer.fromStepId,
        fromAgentId: transfer.fromAgentId,
      },
    }),
  );

  return {
    handoffs,
    events,
  };
}

function buildExecutionContextStep(input: {
  bundle: ExecutionRunRecordBundle;
  step: ExecutionRunStep;
}): ExecutionRunStep {
  const dependencyTaskTransfers = extractDependencyTaskTransfers({
    handoffs: input.bundle.handoffs,
    step: input.step,
  });
  const dependencyTaskTransferPromptContext = formatDependencyTaskTransferPromptContext(
    dependencyTaskTransfers,
  );
  const dependencyLocalActionOutcomes = input.bundle.sharedState.structuredOutputs
    .filter((entry) => input.step.dependsOnStepIds.includes(normalizeStepIdFromLocalActionOutcomeKey(entry.key)))
    .map((entry) => ({
      key: entry.key,
      value: entry.value,
    }));

  const upstreamLocalActionOutcomes = input.bundle.sharedState.structuredOutputs
    .filter((entry) => entry.key.startsWith('step.localActionOutcomes.'))
    .map((entry) => ({
      key: entry.key,
      value: entry.value,
    }));
  const dependencyLocalActionDecisionGuidance = buildDependencyLocalActionDecisionGuidance(
    dependencyLocalActionOutcomes,
  );
  const dependencyLocalActionOutcomePromptContext = formatDependencyLocalActionOutcomePromptContext(
    dependencyLocalActionOutcomes,
  );
  const dependencyLocalActionDecisionPromptContext = formatDependencyLocalActionDecisionPromptContext(
    dependencyLocalActionDecisionGuidance,
  );
  const dependencyLocalActionSteerContract = extractDependencyLocalActionSteerContract(
    dependencyLocalActionDecisionGuidance,
  );
  const dependencyLocalActionSteerPromptContext = formatDependencyLocalActionSteerPromptContext(
    dependencyLocalActionSteerContract,
  );
  const humanEscalationResume = isRecord(input.step.input.structuredData.humanEscalationResume)
    ? input.step.input.structuredData.humanEscalationResume
    : null;
  const humanEscalationResumePromptContext = formatHumanEscalationResumePromptContext(humanEscalationResume);
  const humanEscalationResumeOverride = extractHumanEscalationResumeOverride(humanEscalationResume);
  const humanEscalationResumeOverridePromptContext = formatHumanEscalationResumeOverridePromptContext(
    humanEscalationResumeOverride,
  );
  const humanEscalationResumeOverrideStructuredContext =
    extractHumanEscalationResumeOverrideStructuredContext(humanEscalationResumeOverride);
  const humanEscalationResumeOverrideStructuredContextPromptContext =
    formatHumanEscalationResumeOverrideStructuredContextPromptContext(
      humanEscalationResumeOverrideStructuredContext,
    );
  const taskContext = isRecord(input.step.input.structuredData.taskContext)
    ? input.step.input.structuredData.taskContext
    : null;
  const taskContextPromptContext = formatTaskContextPromptContext(taskContext);
  const taskInputArtifacts = input.step.input.artifacts;
  const taskInputArtifactsPromptContext = formatTaskInputArtifactsPromptContext(taskInputArtifacts);
  const taskStructuredContext = isRecord(input.step.input.structuredData.taskOverrideStructuredContext)
    ? input.step.input.structuredData.taskOverrideStructuredContext
    : null;
  const taskStructuredContextPromptContext = formatTaskStructuredContextPromptContext(taskStructuredContext);

  return {
    ...input.step,
    input: {
      ...input.step.input,
      prompt: appendPromptContext(
        appendPromptContext(
          appendPromptContext(
            appendPromptContext(
              appendPromptContext(input.step.input.prompt ?? null, dependencyTaskTransferPromptContext),
              dependencyLocalActionOutcomePromptContext,
            ),
            appendPromptContext(
              dependencyLocalActionDecisionPromptContext,
              dependencyLocalActionSteerPromptContext,
            ),
          ),
          appendPromptContext(
            appendPromptContext(humanEscalationResumePromptContext, humanEscalationResumeOverridePromptContext),
            humanEscalationResumeOverrideStructuredContextPromptContext,
          ),
        ),
        appendPromptContext(
          appendPromptContext(taskContextPromptContext, taskInputArtifactsPromptContext),
          taskStructuredContextPromptContext,
        ),
      ),
      structuredData: {
        ...input.step.input.structuredData,
        sharedStateContext: {
          dependencyStepIds: input.step.dependsOnStepIds,
          dependencyTaskTransfers,
          dependencyTaskTransferPromptContext,
          dependencyLocalActionOutcomes,
          upstreamLocalActionOutcomes,
          dependencyLocalActionDecisionGuidance,
          dependencyLocalActionOutcomePromptContext,
          dependencyLocalActionDecisionPromptContext,
          dependencyLocalActionSteerContract,
          dependencyLocalActionSteerPromptContext,
          humanEscalationResume,
          humanEscalationResumePromptContext,
          humanEscalationResumeOverride,
          humanEscalationResumeOverridePromptContext,
          humanEscalationResumeOverrideStructuredContext,
          humanEscalationResumeOverrideStructuredContextPromptContext,
          taskContext,
          taskContextPromptContext,
          taskInputArtifacts,
          taskInputArtifactsPromptContext,
          taskStructuredContext,
          taskStructuredContextPromptContext,
        },
      },
    },
  };
}

function resolveEscalationControlBehavior(step: ExecutionRunStep): {
  action: 'pause' | 'fail';
  message: string;
  guidance: Record<string, unknown>;
} | null {
  const sharedStateContext = isRecord(step.input.structuredData.sharedStateContext)
    ? step.input.structuredData.sharedStateContext
    : null;
  const guidance = sharedStateContext && isRecord(sharedStateContext.dependencyLocalActionDecisionGuidance)
    ? sharedStateContext.dependencyLocalActionDecisionGuidance
    : null;
  if (!guidance || guidance.action !== 'escalate') {
    return null;
  }

  const humanInteractionPolicy = isRecord(step.input.structuredData.humanInteractionPolicy)
    ? step.input.structuredData.humanInteractionPolicy
    : null;
  const humanEscalationResume = isRecord(step.input.structuredData.humanEscalationResume)
    ? step.input.structuredData.humanEscalationResume
    : null;
  if (humanEscalationResume && typeof humanEscalationResume.resumedAt === 'string') {
    return null;
  }
  const defaultBehavior =
    humanInteractionPolicy && typeof humanInteractionPolicy.defaultBehavior === 'string'
      ? humanInteractionPolicy.defaultBehavior
      : 'pause';
  const allowHumanEscalation =
    humanInteractionPolicy && typeof humanInteractionPolicy.allowHumanEscalation === 'boolean'
      ? humanInteractionPolicy.allowHumanEscalation
      : true;

  if (defaultBehavior === 'continue') {
    return null;
  }
  if (defaultBehavior === 'pause' && allowHumanEscalation) {
    return {
      action: 'pause',
      message: 'dependency host-action guidance escalated and requires human input',
      guidance,
    };
  }
  return {
    action: 'fail',
    message: 'dependency host-action guidance escalated and human escalation is not permitted',
    guidance,
  };
}

function normalizeStepIdFromLocalActionOutcomeKey(key: string): string {
  return key.startsWith('step.localActionOutcomes.') ? key.slice('step.localActionOutcomes.'.length) : '';
}

function resolveStepTurnPolicyMaxTurns(step: ExecutionRunStep): number | null {
  const turnPolicy = isRecord(step.input.structuredData.turnPolicy) ? step.input.structuredData.turnPolicy : null;
  const maxTurns = turnPolicy?.maxTurns;
  return typeof maxTurns === 'number' && Number.isInteger(maxTurns) && maxTurns > 0 ? maxTurns : null;
}

function resolveStepMaxRuntimeMinutes(step: ExecutionRunStep): number | null {
  const constraints = isRecord(step.input.structuredData.constraints) ? step.input.structuredData.constraints : null;
  const maxRuntimeMinutes = constraints?.maxRuntimeMinutes;
  return typeof maxRuntimeMinutes === 'number' && Number.isFinite(maxRuntimeMinutes) && maxRuntimeMinutes > 0
    ? maxRuntimeMinutes
    : null;
}

function resolveStepProviderBudgetMaxRequests(step: ExecutionRunStep): number | null {
  const constraints = isRecord(step.input.structuredData.constraints) ? step.input.structuredData.constraints : null;
  const providerBudget = isRecord(constraints?.providerBudget) ? constraints.providerBudget : null;
  const maxRequests = providerBudget?.maxRequests;
  return typeof maxRequests === 'number' && Number.isInteger(maxRequests) && maxRequests > 0 ? maxRequests : null;
}

function resolveStepProviderBudgetMaxTokens(step: ExecutionRunStep): number | null {
  const constraints = isRecord(step.input.structuredData.constraints) ? step.input.structuredData.constraints : null;
  const providerBudget = isRecord(constraints?.providerBudget) ? constraints.providerBudget : null;
  const maxTokens = providerBudget?.maxTokens;
  return typeof maxTokens === 'number' && Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : null;
}

function readStoredProviderUsageTotalTokens(bundle: ExecutionRunRecordBundle): number {
  return bundle.sharedState.structuredOutputs
    .filter((entry) => entry.key.startsWith('step.providerUsage.'))
    .reduce((sum, entry) => {
      const value = isRecord(entry.value) ? entry.value : null;
      return sum + readNonNegativeRunnerInt(value?.totalTokens);
    }, 0);
}

function readNonNegativeRunnerInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function calculateElapsedRuntimeMinutes(input: {
  startedAt: string;
  now: string;
}): number | null {
  const startedAtMs = Date.parse(input.startedAt);
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(startedAtMs) || Number.isNaN(nowMs) || nowMs < startedAtMs) {
    return null;
  }
  return Math.floor((nowMs - startedAtMs) / 60_000);
}

function evaluateRequiredRequestedOutputsForStoredRuntime(input: {
  step: ExecutionRunStep;
  output: NonNullable<ExecutionRunStep['output']>;
  sharedState: Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs'>;
}):
  | {
      status: 'satisfied';
      missingRequiredLabels: [];
      message: 'all required requested outputs were fulfilled';
    }
  | {
      status: 'missing-required';
      missingRequiredLabels: string[];
      message: string;
    } {
  const requestedOutputs = Array.isArray(input.step.input.structuredData.requestedOutputs)
    ? input.step.input.structuredData.requestedOutputs
    : [];
  if (requestedOutputs.length === 0) {
    return {
      status: 'satisfied',
      missingRequiredLabels: [],
      message: 'all required requested outputs were fulfilled',
    };
  }

  const hasMessageOutput =
    typeof input.output.summary === 'string' && input.output.summary.trim().length > 0;
  const hasArtifactOutput =
    input.output.artifacts.length > 0 || input.sharedState.artifacts.length > 0;
  const hasStructuredOutput =
    input.output.structuredData &&
      Object.keys(input.output.structuredData).length > 0
      ? true
      : input.sharedState.structuredOutputs.some((entry) => !isInternalStructuredOutputKey(entry.key));

  const missingRequiredLabels = requestedOutputs
    .filter((requestedOutput) => isRequiredRequestedOutputMissing({
      requestedOutput,
      hasMessageOutput,
      hasArtifactOutput,
      hasStructuredOutput,
    }))
    .map((requestedOutput) => {
      const candidate = isRecord(requestedOutput) ? requestedOutput : {};
      return typeof candidate.label === 'string'
        ? candidate.label
        : typeof candidate.kind === 'string'
          ? candidate.kind
          : 'unnamed-output';
    });

  if (missingRequiredLabels.length === 0) {
    return {
      status: 'satisfied',
      missingRequiredLabels: [],
      message: 'all required requested outputs were fulfilled',
    };
  }

  return {
    status: 'missing-required',
    missingRequiredLabels,
    message: `missing required requested outputs: ${missingRequiredLabels.join(', ')}`,
  };
}

function isRequiredRequestedOutputMissing(input: {
  requestedOutput: unknown;
  hasMessageOutput: boolean;
  hasArtifactOutput: boolean;
  hasStructuredOutput: boolean;
}): boolean {
  const candidate = isRecord(input.requestedOutput) ? input.requestedOutput : {};
  if (candidate.required !== true) {
    return false;
  }
  const kind = typeof candidate.kind === 'string' ? candidate.kind : null;
  const format = typeof candidate.format === 'string' ? candidate.format : null;
  const destination = typeof candidate.destination === 'string' ? candidate.destination : null;

  if (kind === 'artifact-bundle' || destination === 'artifact-store' || format === 'bundle') {
    return !input.hasArtifactOutput;
  }
  if (kind === 'structured-report' || format === 'json') {
    return !input.hasStructuredOutput && !input.hasMessageOutput;
  }
  return !input.hasMessageOutput && !input.hasArtifactOutput && !input.hasStructuredOutput;
}

function isInternalStructuredOutputKey(key: string): boolean {
  return (
    key === 'response.output' ||
    key.startsWith('step.localActionOutcomes.') ||
    key.startsWith('step.consumedTaskTransfers.') ||
    key.startsWith('human.resume.')
  );
}

function formatTaskStructuredContextPromptContext(
  taskStructuredContext: Record<string, unknown> | null,
): string | null {
  if (!taskStructuredContext) {
    return null;
  }
  return `Task structured context:\n- ${JSON.stringify(taskStructuredContext)}`;
}

function formatTaskContextPromptContext(taskContext: Record<string, unknown> | null): string | null {
  if (!taskContext) {
    return null;
  }
  return `Task context:\n- ${JSON.stringify(taskContext)}`;
}

function formatTaskInputArtifactsPromptContext(taskInputArtifacts: ExecutionRunStep['input']['artifacts']): string | null {
  if (taskInputArtifacts.length === 0) {
    return null;
  }

  const lines = ['Task input artifacts:'];
  for (const artifact of taskInputArtifacts.slice(0, 5)) {
    const identity = artifact.title ?? artifact.path ?? artifact.uri ?? artifact.id;
    lines.push(`- ${artifact.kind}:${identity}`);
  }
  if (taskInputArtifacts.length > 5) {
    lines.push(`- ... +${taskInputArtifacts.length - 5} more`);
  }
  return lines.join('\n');
}

function extractDependencyTaskTransfers(input: {
  handoffs: ExecutionRunRecordBundle['handoffs'];
  step: ExecutionRunStep;
}): Array<{
  handoffId: string;
  fromStepId: string;
  fromAgentId: string | null;
  summary: string | null;
  taskTransfer: NormalizedTaskTransfer;
}> {
  return input.handoffs
    .flatMap((handoff) => {
      if (handoff.toStepId !== input.step.id || !input.step.dependsOnStepIds.includes(handoff.fromStepId)) {
        return [];
      }
      const taskTransfer = normalizeTaskTransfer(handoff.structuredData.taskTransfer);
      if (!taskTransfer) {
        return [];
      }
      return [
        {
          handoffId: handoff.id,
          fromStepId: handoff.fromStepId,
          fromAgentId: handoff.fromAgentId,
          summary: handoff.summary,
          taskTransfer,
        },
      ];
    });
}

function formatDependencyTaskTransferPromptContext(
  dependencyTaskTransfers: Array<{
    handoffId: string;
    fromStepId: string;
    fromAgentId: string | null;
    summary: string | null;
    taskTransfer: NormalizedTaskTransfer;
  }>,
): string | null {
  if (dependencyTaskTransfers.length === 0) {
    return null;
  }

  const lines = ['Dependency task transfers:'];
  for (const transfer of dependencyTaskTransfers) {
    lines.push(
      `- ${transfer.fromStepId}${transfer.fromAgentId ? ` (${transfer.fromAgentId})` : ''}: ${transfer.taskTransfer.title ?? transfer.summary ?? 'task transfer'}`,
    );
    if (transfer.taskTransfer.objective) {
      lines.push(`  objective: ${transfer.taskTransfer.objective}`);
    }
    if (transfer.taskTransfer.requestedOutputs.length > 0) {
      lines.push(`  requestedOutputs: ${JSON.stringify(transfer.taskTransfer.requestedOutputs)}`);
    }
    if (transfer.taskTransfer.inputArtifacts.length > 0) {
      lines.push(`  inputArtifacts: ${JSON.stringify(transfer.taskTransfer.inputArtifacts)}`);
    }
  }
  return lines.join('\n');
}

function formatConsumedTaskTransferNote(stepId: string, total: number): string {
  return `consumed task transfers for ${stepId}: total=${total}`;
}

function appendPromptContext(prompt: string | null, promptContext: string | null): string | null {
  if (!prompt) {
    return promptContext;
  }
  if (!promptContext) {
    return prompt;
  }
  return `${prompt}\n\n${promptContext}`;
}

function formatDependencyLocalActionOutcomePromptContext(
  dependencyLocalActionOutcomes: Array<{ key: string; value: unknown }>,
): string | null {
  if (dependencyLocalActionOutcomes.length === 0) {
    return null;
  }

  const lines = ['Dependency local action outcomes:'];
  for (const entry of dependencyLocalActionOutcomes) {
    if (!isRecord(entry.value)) {
      continue;
    }
    const ownerStepId =
      typeof entry.value.ownerStepId === 'string'
        ? entry.value.ownerStepId
        : normalizeStepIdFromLocalActionOutcomeKey(entry.key) || 'unknown-step';
    const counts = isRecord(entry.value.counts) ? entry.value.counts : {};
    const items = Array.isArray(entry.value.items) ? entry.value.items : [];
    const countSummary = ['requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled']
      .filter((status) => typeof counts[status] === 'number' && (counts[status] as number) > 0)
      .map((status) => `${status}=${counts[status]}`)
      .join(', ');
    const latestItem = items.at(-1);
    const latestSummary =
      isRecord(latestItem) && typeof latestItem.resultSummary === 'string'
        ? latestItem.resultSummary
        : isRecord(latestItem) && typeof latestItem.summary === 'string'
          ? latestItem.summary
          : null;
    lines.push(
      latestSummary
        ? `- ${ownerStepId}: ${countSummary || 'no terminal outcomes recorded'}; latest=${latestSummary}`
        : `- ${ownerStepId}: ${countSummary || 'no terminal outcomes recorded'}`,
    );
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function buildDependencyLocalActionDecisionGuidance(
  dependencyLocalActionOutcomes: Array<{ key: string; value: unknown }>,
): Record<string, unknown> | null {
  if (dependencyLocalActionOutcomes.length === 0) {
    return null;
  }

  const counts = {
    requested: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const entry of dependencyLocalActionOutcomes) {
    if (!isRecord(entry.value)) {
      continue;
    }
    const entryCounts = isRecord(entry.value.counts) ? entry.value.counts : {};
    for (const status of ['requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled'] as const) {
      if (typeof entryCounts[status] === 'number') {
        counts[status] += entryCounts[status] as number;
      }
    }
  }

  let action: 'continue' | 'steer' | 'escalate' = 'continue';
  let rationale = 'dependency host actions completed successfully';
  if (counts.rejected > 0 || counts.failed > 0) {
    action = 'escalate';
    rationale = 'dependency host actions include rejected or failed outcomes';
  } else if (counts.requested > 0 || counts.cancelled > 0) {
    action = 'escalate';
    rationale = 'dependency host actions remain pending or inconclusive';
  } else if (counts.approved > 0) {
    action = 'steer';
    rationale = 'dependency host actions are approved but not yet executed';
  }

  const guidance: Record<string, unknown> = {
    action,
    rationale,
    counts,
  };
  if (action === 'steer') {
    guidance.contract = {
      kind: 'host-action-steer',
      recommendedAction: 'continue-with-caution',
      promptAppend: 'Dependency host actions are not yet complete. Account for pending or approved-only host work before proceeding.',
      structuredContext: {
        pendingHostActions: counts.requested + counts.approved + counts.cancelled,
        approvedCount: counts.approved,
        requestedCount: counts.requested,
        cancelledCount: counts.cancelled,
      },
    };
  }
  return guidance;
}

function formatDependencyLocalActionDecisionPromptContext(
  decisionGuidance: Record<string, unknown> | null,
): string | null {
  if (!decisionGuidance) {
    return null;
  }
  const action = typeof decisionGuidance.action === 'string' ? decisionGuidance.action : null;
  const rationale = typeof decisionGuidance.rationale === 'string' ? decisionGuidance.rationale : null;
  if (!action || !rationale) {
    return null;
  }
  return `Dependency local action decision guidance: ${action.toUpperCase()} - ${rationale}`;
}

function extractDependencyLocalActionSteerContract(
  decisionGuidance: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!decisionGuidance || decisionGuidance.action !== 'steer') {
    return null;
  }
  return isRecord(decisionGuidance.contract) ? decisionGuidance.contract : null;
}

function formatDependencyLocalActionSteerPromptContext(
  steerContract: Record<string, unknown> | null,
): string | null {
  if (!steerContract) {
    return null;
  }

  const recommendedAction =
    typeof steerContract.recommendedAction === 'string' ? steerContract.recommendedAction : null;
  const promptAppend = typeof steerContract.promptAppend === 'string' ? steerContract.promptAppend : null;
  const structuredContext = isRecord(steerContract.structuredContext) ? steerContract.structuredContext : null;

  const lines = ['Dependency local action steer contract:'];
  if (recommendedAction) {
    lines.push(`- recommendedAction: ${recommendedAction}`);
  }
  if (promptAppend) {
    lines.push(`- promptAppend: ${promptAppend}`);
  }
  if (structuredContext) {
    lines.push(`- structuredContext: ${JSON.stringify(structuredContext)}`);
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

function formatHumanEscalationResumePromptContext(humanEscalationResume: Record<string, unknown> | null): string | null {
  if (!humanEscalationResume) {
    return null;
  }

  const resumedAt =
    typeof humanEscalationResume.resumedAt === 'string' ? humanEscalationResume.resumedAt : null;
  const note = typeof humanEscalationResume.note === 'string' ? humanEscalationResume.note : null;
  const guidance = isRecord(humanEscalationResume.guidance) ? humanEscalationResume.guidance : null;

  const lines = ['Human resume guidance:'];
  if (resumedAt) {
    lines.push(`- resumedAt: ${resumedAt}`);
  }
  if (note) {
    lines.push(`- note: ${note}`);
  }
  if (guidance) {
    lines.push(`- guidance: ${JSON.stringify(guidance)}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function extractHumanEscalationResumeOverride(
  humanEscalationResume: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!humanEscalationResume) {
    return null;
  }
  return isRecord(humanEscalationResume.override) ? humanEscalationResume.override : null;
}

function formatHumanEscalationResumeOverridePromptContext(
  humanEscalationResumeOverride: Record<string, unknown> | null,
): string | null {
  if (!humanEscalationResumeOverride) {
    return null;
  }

  const promptAppend =
    typeof humanEscalationResumeOverride.promptAppend === 'string'
      ? humanEscalationResumeOverride.promptAppend
      : null;
  if (!promptAppend) {
    return null;
  }

  return `Human resume override:\n- promptAppend: ${promptAppend}`;
}

function extractHumanEscalationResumeOverrideStructuredContext(
  humanEscalationResumeOverride: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!humanEscalationResumeOverride) {
    return null;
  }
  return isRecord(humanEscalationResumeOverride.structuredContext)
    ? humanEscalationResumeOverride.structuredContext
    : null;
}

function formatHumanEscalationResumeOverrideStructuredContextPromptContext(
  humanEscalationResumeOverrideStructuredContext: Record<string, unknown> | null,
): string | null {
  if (!humanEscalationResumeOverrideStructuredContext) {
    return null;
  }
  return `Human resume structured context:\n- ${JSON.stringify(humanEscalationResumeOverrideStructuredContext)}`;
}

function applyResolvedLocalActionOutcomeContextToHandoffs(input: {
  handoffs: ExecutionRunRecordBundle['handoffs'];
  stepId: string;
  completedAt: string;
  resolvedLocalActionRequestsForStep: TeamRunLocalActionRequest[];
}): ExecutionRunRecordBundle['handoffs'] {
  if (input.resolvedLocalActionRequestsForStep.length === 0) {
    return input.handoffs;
  }

  const localActionOutcomeStructuredOutput = summarizeLocalActionRequestsForSharedState({
    step: {
      id: input.stepId,
      runId: '',
      sourceStepId: null,
      agentId: '',
      runtimeProfileId: null,
      browserProfileId: null,
      service: null,
      kind: 'handoff',
      status: 'succeeded',
      order: 0,
      dependsOnStepIds: [],
      input: {
        prompt: null,
        handoffIds: [],
        artifacts: [],
        structuredData: {},
        notes: [],
      },
      output: null,
      startedAt: null,
      completedAt: input.completedAt,
      failure: null,
    },
    requests: input.resolvedLocalActionRequestsForStep,
    generatedAt: input.completedAt,
  });
  const localActionOutcomeContext = localActionOutcomeStructuredOutput?.value ?? null;
  if (!localActionOutcomeContext) {
    return input.handoffs;
  }
  const localActionDecisionGuidance = buildDependencyLocalActionDecisionGuidance([
    {
      key: `step.localActionOutcomes.${input.stepId}`,
      value: localActionOutcomeContext,
    },
  ]);

  return input.handoffs.map((handoff) =>
    handoff.fromStepId === input.stepId
      ? {
          ...handoff,
          structuredData: {
            ...handoff.structuredData,
            localActionOutcomeContext,
            localActionOutcomeSummaryKey: `step.localActionOutcomes.${input.stepId}`,
            localActionDecisionGuidance,
          },
          notes: [...handoff.notes, 'handoff payload updated with dependency-scoped local action outcome context'],
        }
      : handoff,
  );
}

export function summarizeLocalActionRequestsForSharedState(input: {
  step: ExecutionRunStep;
  requests: TeamRunLocalActionRequest[];
  generatedAt: string;
}): TeamRunStructuredOutput | null {
  if (input.requests.length === 0) {
    return null;
  }

  const counts = {
    requested: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
    cancelled: 0,
  } satisfies Record<TeamRunLocalActionRequestStatus, number>;
  for (const request of input.requests) {
    counts[request.status] += 1;
  }

  return {
    key: `step.localActionOutcomes.${input.step.id}`,
    value: {
      ownerStepId: input.step.id,
      generatedAt: input.generatedAt,
      total: input.requests.length,
      counts,
      items: input.requests.map((request) => ({
        requestId: request.id,
        kind: request.kind,
        status: request.status,
        summary: request.summary,
        command: request.command ?? null,
        args: request.args,
        resultSummary: request.resultSummary ?? null,
      })),
    },
  };
}

export function formatLocalActionOutcomeNote(input: {
  step: ExecutionRunStep;
  requests: TeamRunLocalActionRequest[];
}): string | null {
  if (input.requests.length === 0) {
    return null;
  }

  const counts = new Map<TeamRunLocalActionRequestStatus, number>();
  for (const request of input.requests) {
    counts.set(request.status, (counts.get(request.status) ?? 0) + 1);
  }

  const orderedStatuses: TeamRunLocalActionRequestStatus[] = [
    'requested',
    'approved',
    'rejected',
    'executed',
    'failed',
    'cancelled',
  ];
  const parts = orderedStatuses
    .filter((status) => (counts.get(status) ?? 0) > 0)
    .map((status) => `${status}=${counts.get(status)}`);
  return `local action outcomes for ${input.step.id}: ${parts.join(', ')}`;
}

async function resolveLocalActionRequests(input: {
  record: ExecutionRunStoredRecord;
  step: ExecutionRunStep;
  completedAt: string;
  output: ExecutionRunStep['output'];
  executeLocalActionRequest?: (
    context: ExecuteLocalActionRequestContext,
  ) => Promise<ExecuteLocalActionRequestResult | void>;
}): Promise<{
  requests: TeamRunLocalActionRequest[];
  resolvedRequests: TeamRunLocalActionRequest[];
  events: ExecutionRunEvent[];
  sharedState: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
}> {
  const requests = deriveLocalActionRequestsFromStepOutput({
    bundle: input.record.bundle,
    step: input.step,
    completedAt: input.completedAt,
    output: input.output,
  });
  if (requests.length === 0) {
    return {
      requests: input.record.bundle.localActionRequests,
      resolvedRequests: [],
      events: [],
      sharedState: { notes: [] },
    };
  }

  const events: ExecutionRunEvent[] = [];
  const sharedState: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>> = {
    artifacts: [],
    structuredOutputs: [],
    notes: [],
  };
  const resolvedRequests: TeamRunLocalActionRequest[] = [];

  for (const request of requests) {
    const creationEvent = createExecutionRunEvent({
      id: `${input.record.runId}:event:${request.id}:requested`,
      runId: input.record.runId,
      stepId: input.step.id,
      type: 'note-added',
      createdAt: request.createdAt,
      note: `local action requested: ${request.kind}`,
      payload: {
        requestId: request.id,
        requestStatus: request.status,
      },
    });
    events.push(creationEvent);

    if (request.status !== 'requested') {
      resolvedRequests.push(request);
      continue;
    }

    if (!input.executeLocalActionRequest) {
      resolvedRequests.push(request);
      continue;
    }

    const callbackResult = await input.executeLocalActionRequest({
      record: input.record,
      step: input.step,
      request,
    });
    if (!callbackResult || callbackResult.status === 'requested') {
      resolvedRequests.push(request);
      continue;
    }
    const resolvedAt = input.completedAt;
    const resolvedRequest: TeamRunLocalActionRequest = {
      ...request,
      status: callbackResult.status ?? 'executed',
      approvedAt:
        callbackResult.status === 'approved' || callbackResult.status === 'executed' ? resolvedAt : request.approvedAt ?? null,
      completedAt:
        callbackResult.status === 'executed' ||
        callbackResult.status === 'failed' ||
        callbackResult.status === 'rejected' ||
        callbackResult.status === 'cancelled'
          ? resolvedAt
          : request.completedAt ?? null,
      resultSummary: callbackResult.summary ?? null,
      resultPayload: callbackResult.payload ?? null,
      notes: [...request.notes, ...(callbackResult.notes ?? [])],
    };
    resolvedRequests.push(resolvedRequest);
    sharedState.artifacts?.push(...normalizeTeamRunArtifactRefs(callbackResult.sharedState?.artifacts));
    sharedState.structuredOutputs?.push(
      ...normalizeRuntimeStructuredOutputs(callbackResult.sharedState?.structuredOutputs),
    );
    sharedState.notes?.push(...(callbackResult.sharedState?.notes ?? []));
    const resolutionEvent = createExecutionRunEvent({
      id: `${input.record.runId}:event:${request.id}:${resolvedRequest.status}`,
      runId: input.record.runId,
      stepId: input.step.id,
      type: 'note-added',
      createdAt: resolvedAt,
      note: resolvedRequest.resultSummary ?? `local action ${resolvedRequest.status}`,
      payload: {
        requestId: request.id,
        requestStatus: resolvedRequest.status,
      },
    });
    events.push(resolutionEvent);
  }

  const sharedStateSummary = summarizeLocalActionRequestsForSharedState({
    step: input.step,
    requests: resolvedRequests,
    generatedAt: input.completedAt,
  });
  if (sharedStateSummary) {
    sharedState.structuredOutputs?.push(sharedStateSummary);
  }
  const sharedStateNote = formatLocalActionOutcomeNote({
    step: input.step,
    requests: resolvedRequests,
  });
  if (sharedStateNote) {
    sharedState.notes?.push(sharedStateNote);
  }

  return {
    requests: [...input.record.bundle.localActionRequests, ...resolvedRequests],
    resolvedRequests,
    events,
    sharedState,
  };
}

function deriveLocalActionRequestsFromStepOutput(input: {
  bundle: ExecutionRunRecordBundle;
  step: ExecutionRunStep;
  completedAt: string;
  output: ExecutionRunStep['output'];
}): TeamRunLocalActionRequest[] {
  const structuredData = input.output?.structuredData;
  const localActionRequests = structuredData?.localActionRequests;
  if (!Array.isArray(localActionRequests) || localActionRequests.length === 0) {
    return [];
  }

  const policy = isRecord(input.step.input.structuredData.localActionPolicy)
    ? input.step.input.structuredData.localActionPolicy
    : null;
  const policyMode = typeof policy?.mode === 'string' ? policy.mode : null;
  const allowedKinds =
    Array.isArray(policy?.allowedActionKinds) && policy.allowedActionKinds.every((value) => typeof value === 'string')
      ? new Set(policy.allowedActionKinds as string[])
      : null;

  return localActionRequests.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      return [];
    }

    const kind =
      candidate.kind === 'shell'
        ? 'shell'
        : candidate.actionType === 'shell'
          ? 'shell'
          : candidate.type === 'shell'
            ? 'shell'
            : null;
    if (kind !== 'shell') {
      return [];
    }

    const request = createTeamRunLocalActionRequest({
      id: `${input.bundle.run.id}:action:${input.step.id}:${index + 1}`,
      teamRunId: input.bundle.run.id,
      ownerStepId: input.step.id,
      kind,
      summary:
        typeof candidate.summary === 'string' && candidate.summary.trim().length > 0
          ? candidate.summary
          : typeof candidate.command === 'string'
            ? `Run bounded shell action: ${candidate.command}`
            : 'Run bounded shell action.',
      command: typeof candidate.command === 'string' ? candidate.command : null,
      args:
        Array.isArray(candidate.args) && candidate.args.every((value) => typeof value === 'string')
          ? (candidate.args as string[])
          : [],
      structuredPayload:
        isRecord(candidate.structuredPayload)
          ? candidate.structuredPayload
          : isRecord(candidate.payload)
            ? candidate.payload
            : {},
      notes: Array.isArray(candidate.notes) ? candidate.notes.filter((value): value is string => typeof value === 'string') : [],
      createdAt: input.completedAt,
    });

    if (policyMode === 'forbidden') {
      return [
        {
          ...request,
          status: 'rejected',
          completedAt: input.completedAt,
          resultSummary: 'local action rejected because step policy forbids host actions',
        },
      ];
    }

    if (allowedKinds && allowedKinds.size > 0 && !allowedKinds.has(request.kind)) {
      return [
        {
          ...request,
          status: 'rejected',
          completedAt: input.completedAt,
          resultSummary: `local action rejected because kind ${request.kind} is not allowed by step policy`,
        },
      ];
    }

    return [request];
  });
}

function applyBundleMutation(input: {
  bundle: ExecutionRunRecordBundle;
  updatedAt: string;
  event: ExecutionRunEvent;
  runStatus: ExecutionRunRecordBundle['run']['status'];
  sharedStateStatus: ExecutionRunSharedState['status'];
  stepUpdater: (step: ExecutionRunStep) => ExecutionRunStep;
  sharedStateAppender?: (sharedState: ExecutionRunSharedState) => ExecutionRunSharedState;
}): ExecutionRunRecordBundle {
  const sharedState = input.sharedStateAppender ? input.sharedStateAppender(input.bundle.sharedState) : input.bundle.sharedState;
  return {
    ...input.bundle,
    run: {
      ...input.bundle.run,
      status: input.runStatus,
      updatedAt: input.updatedAt,
    },
    steps: input.bundle.steps.map(input.stepUpdater),
    events: [...input.bundle.events, input.event],
    sharedState: {
      ...sharedState,
      status: input.sharedStateStatus,
      history: [...sharedState.history, input.event],
      lastUpdatedAt: input.updatedAt,
    },
  };
}
