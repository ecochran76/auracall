import { ExecutionRunRecordBundleSchema } from './schema.js';
import type { ExecutionRunRecordBundle, ExecutionRunStep } from './types.js';

export interface ExecutionRunDispatchPlan {
  run: ExecutionRunRecordBundle['run'];
  sharedState: ExecutionRunRecordBundle['sharedState'];
  steps: ExecutionRunStep[];
  stepsById: Record<string, ExecutionRunStep>;
  nextRunnableStepId: string | null;
  runnableStepIds: string[];
  deferredStepIds: string[];
  waitingStepIds: string[];
  blockedStepIds: string[];
  blockedByFailureStepIds: string[];
  terminalStepIds: string[];
  runningStepIds: string[];
  missingDependencyStepIds: string[];
}

function isTerminalStep(step: ExecutionRunStep): boolean {
  return (
    step.status === 'succeeded' ||
    step.status === 'failed' ||
    step.status === 'skipped' ||
    step.status === 'cancelled'
  );
}

function canDispatchStep(step: ExecutionRunStep): boolean {
  return step.status === 'planned' || step.status === 'runnable';
}

export function createExecutionRunDispatchPlan(bundleInput: ExecutionRunRecordBundle): ExecutionRunDispatchPlan {
  const bundle = ExecutionRunRecordBundleSchema.parse(bundleInput);
  const steps = bundle.steps.slice().sort((left, right) => left.order - right.order);
  const stepsById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<string, ExecutionRunStep>;
  const blockedStepIds: string[] = [];
  const blockedByFailureStepIds: string[] = [];
  const terminalStepIds: string[] = [];
  const runningStepIds: string[] = [];
  const waitingStepIds: string[] = [];
  const eligibleStepIds: string[] = [];
  const missingDependencyStepIds = new Set<string>();

  const hasTerminalFailure =
    bundle.run.policy.failPolicy === 'fail-fast' &&
    steps.some((step) => step.status === 'failed' || step.status === 'cancelled');

  for (const step of steps) {
    if (step.status === 'blocked') {
      blockedStepIds.push(step.id);
      continue;
    }
    if (step.status === 'running') {
      runningStepIds.push(step.id);
      continue;
    }
    if (isTerminalStep(step)) {
      terminalStepIds.push(step.id);
      continue;
    }

    if (hasTerminalFailure) {
      blockedByFailureStepIds.push(step.id);
      continue;
    }

    const dependencyStatuses = step.dependsOnStepIds.map((dependencyStepId) => {
      const dependencyStep = stepsById[dependencyStepId];
      if (!dependencyStep) {
        missingDependencyStepIds.add(dependencyStepId);
        return null;
      }
      return dependencyStep.status;
    });

    const dependenciesSatisfied =
      dependencyStatuses.length === 0 ||
      dependencyStatuses.every((status) => status === 'succeeded');

    if (canDispatchStep(step) && dependenciesSatisfied) {
      eligibleStepIds.push(step.id);
    } else {
      waitingStepIds.push(step.id);
    }
  }

  const nextRunnableStepId = runningStepIds.length > 0 ? null : (eligibleStepIds[0] ?? null);
  const runnableStepIds = nextRunnableStepId ? [nextRunnableStepId] : [];
  const deferredStepIds =
    runningStepIds.length > 0 ? eligibleStepIds : eligibleStepIds.filter((stepId) => stepId !== nextRunnableStepId);

  return {
    run: bundle.run,
    sharedState: bundle.sharedState,
    steps,
    stepsById,
    nextRunnableStepId,
    runnableStepIds,
    deferredStepIds,
    waitingStepIds,
    blockedStepIds,
    blockedByFailureStepIds,
    terminalStepIds,
    runningStepIds,
    missingDependencyStepIds: Array.from(missingDependencyStepIds).sort(),
  };
}
