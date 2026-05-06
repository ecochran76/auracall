import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

export interface ExecutionRunListItem {
  runId: string;
  sourceKind: ExecutionRunSourceKind;
  teamRunId: string | null;
  taskRunSpecId: string | null;
  status: ExecutionRunStatus;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  runnableStepCount: number;
  runningStepCount: number;
  serviceIds: string[];
  runtimeProfileIds: string[];
}

export function summarizeExecutionRunListItem(record: ExecutionRunStoredRecord): ExecutionRunListItem {
  const run = record.bundle.run;
  const steps = record.bundle.steps;
  return {
    runId: run.id,
    sourceKind: run.sourceKind,
    teamRunId: run.sourceKind === 'team-run' ? run.sourceId : null,
    taskRunSpecId: run.taskRunSpecId ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    stepCount: steps.length,
    runnableStepCount: steps.filter((step) => step.status === 'runnable').length,
    runningStepCount: steps.filter((step) => step.status === 'running').length,
    serviceIds: uniqueStrings(steps.map((step) => step.service).filter(Boolean)),
    runtimeProfileIds: uniqueStrings(steps.map((step) => step.runtimeProfileId).filter(Boolean)),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
