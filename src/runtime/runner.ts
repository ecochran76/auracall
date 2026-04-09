import { createExecutionRunDispatchPlan } from './dispatcher.js';
import { createExecutionRuntimeControl } from './control.js';
import { createExecutionRunEvent } from './model.js';
import { createExecutionRunRecordStore, type ExecutionRunRecordStore, type ExecutionRunStoredRecord } from './store.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import type { ExecutionRunEvent, ExecutionRunRecordBundle, ExecutionRunSharedState, ExecutionRunStep } from './types.js';

export interface ExecuteStoredRunStepResult {
  output?: ExecutionRunStep['output'];
  sharedState?: Partial<Pick<ExecutionRunSharedState, 'artifacts' | 'structuredOutputs' | 'notes'>>;
}

export interface ExecuteStoredRunStepContext {
  record: ExecutionRunStoredRecord;
  step: ExecutionRunStep;
}

export interface ExecuteStoredRunOnceOptions {
  runId: string;
  ownerId: string;
  leaseId?: string;
  now?: () => string;
  control?: ExecutionRuntimeControlContract;
  store?: ExecutionRunRecordStore;
  executeStep?: (context: ExecuteStoredRunStepContext) => Promise<ExecuteStoredRunStepResult | void>;
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
  const inspection = await control.inspectRun(options.runId);
  if (!inspection) {
    throw new Error(`Execution run ${options.runId} was not found`);
  }
  const stepId = inspection.dispatchPlan.nextRunnableStepId;
  if (!stepId) {
    return inspection.record;
  }

  const leaseId = options.leaseId ?? `${options.runId}:lease:local-runner`;
  const acquiredAt = now();
  const acquired = await control.acquireLease({
    runId: options.runId,
    leaseId,
    ownerId: options.ownerId,
    acquiredAt,
    heartbeatAt: acquiredAt,
    expiresAt: acquiredAt,
  });

  let currentRecord = acquired;
  let releaseReason: string | null = 'completed';
  let finalRecord: ExecutionRunStoredRecord | null = null;

  try {
    const startedAt = now();
    const startedBundle = startExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      startedAt,
    });
    currentRecord = await store.writeRecord(startedBundle, { expectedRevision: currentRecord.revision });

    const runningStep = requireStep(currentRecord.bundle, stepId);
    const result =
      (await options.executeStep?.({
        record: currentRecord,
        step: runningStep,
      })) ?? {
        output: {
          summary: 'bounded local runner pass completed',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      };

    const completedAt = now();
    const succeededBundle = succeedExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      completedAt,
      output: result.output,
      sharedState: result.sharedState,
    });
    currentRecord = await store.writeRecord(succeededBundle, { expectedRevision: currentRecord.revision });
    finalRecord = currentRecord;
  } catch (error) {
    releaseReason = 'failed';
    const failedAt = now();
    const failedBundle = failExecutionRunStep({
      bundle: currentRecord.bundle,
      stepId,
      failedAt,
      failure: {
        code: 'runner_execution_failed',
        message: error instanceof Error ? error.message : String(error),
        ownerStepId: stepId,
        details: null,
      },
    });
    currentRecord = await store.writeRecord(failedBundle, { expectedRevision: currentRecord.revision });
    finalRecord = currentRecord;
  } finally {
    finalRecord = await control.releaseLease({
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
      artifacts: [...sharedState.artifacts, ...(input.sharedState?.artifacts ?? [])],
      structuredOutputs: [...sharedState.structuredOutputs, ...(input.sharedState?.structuredOutputs ?? [])],
      notes: [...sharedState.notes, ...(input.sharedState?.notes ?? [])],
    }),
  });

  const dispatchPlan = createExecutionRunDispatchPlan(provisional);
  const allSucceeded = provisional.steps.every((candidate) => candidate.status === 'succeeded');
  return {
    ...provisional,
    run: {
      ...provisional.run,
      status: allSucceeded ? 'succeeded' : dispatchPlan.runningStepIds.length > 0 ? 'running' : provisional.run.status,
    },
    sharedState: {
      ...provisional.sharedState,
      status: allSucceeded ? 'succeeded' : provisional.sharedState.status,
    },
  };
}

export function failExecutionRunStep(input: {
  bundle: ExecutionRunRecordBundle;
  stepId: string;
  failedAt: string;
  failure: ExecutionRunStep['failure'];
}): ExecutionRunRecordBundle {
  const step = requireStep(input.bundle, input.stepId);
  if (step.status !== 'running' && step.status !== 'runnable' && step.status !== 'planned') {
    throw new Error(`Execution step ${input.stepId} cannot fail from status ${step.status}`);
  }

  return applyBundleMutation({
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
            failure: input.failure,
          }
        : candidate,
  });
}

function requireStep(bundle: ExecutionRunRecordBundle, stepId: string): ExecutionRunStep {
  const step = bundle.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Execution step ${stepId} was not found in run ${bundle.run.id}`);
  }
  return step;
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
