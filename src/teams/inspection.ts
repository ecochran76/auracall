import { createExecutionRuntimeControl } from '../runtime/control.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import {
  createTaskRunSpecRecordStore,
  summarizeTaskRunSpecStoredRecord,
  type TaskRunSpecInspectionSummary,
  type TaskRunSpecRecordStore,
} from './store.js';

export interface InspectTeamRunLinkageInput {
  taskRunSpecId?: string | null;
  runtimeRunId?: string | null;
  control?: ExecutionRuntimeControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
}

export interface TeamRunInspectionRuntimeSummary {
  runtimeRunId: string;
  teamRunId: string | null;
  taskRunSpecId: string | null;
  runtimeSourceKind: 'team-run' | 'direct';
  runtimeRunStatus: 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  runtimeUpdatedAt: string;
  sharedStateStatus: 'active' | 'succeeded' | 'failed' | 'cancelled';
  stepCount: number;
  handoffCount: number;
  localActionRequestCount: number;
  nextRunnableStepId: string | null;
  runnableStepIds: string[];
  deferredStepIds: string[];
  waitingStepIds: string[];
  blockedStepIds: string[];
  blockedByFailureStepIds: string[];
  runningStepIds: string[];
  terminalStepIds: string[];
  missingDependencyStepIds: string[];
  activeLeaseOwnerId: string | null;
}

export interface TeamRunInspectionPayload {
  resolvedBy: 'task-run-spec-id' | 'runtime-run-id';
  queryId: string;
  taskRunSpecSummary: TaskRunSpecInspectionSummary | null;
  matchingRuntimeRunCount: number;
  matchingRuntimeRunIds: string[];
  runtime: TeamRunInspectionRuntimeSummary | null;
}

export class TeamRunInspectionError extends Error {
  readonly status: 'invalid-request' | 'not-found';

  constructor(status: 'invalid-request' | 'not-found', message: string) {
    super(message);
    this.name = 'TeamRunInspectionError';
    this.status = status;
  }
}

export async function inspectTeamRunLinkage(
  input: InspectTeamRunLinkageInput,
): Promise<TeamRunInspectionPayload> {
  const control = input.control ?? createExecutionRuntimeControl();
  const taskRunSpecStore = input.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const taskRunSpecId = normalizeOptionalId(input.taskRunSpecId);
  const runtimeRunId = normalizeOptionalId(input.runtimeRunId);

  if (!taskRunSpecId && !runtimeRunId) {
    throw new TeamRunInspectionError('invalid-request', 'Provide --task-run-spec-id or --runtime-run-id.');
  }

  if (taskRunSpecId && runtimeRunId) {
    throw new TeamRunInspectionError(
      'invalid-request',
      'Choose exactly one lookup key: --task-run-spec-id or --runtime-run-id.',
    );
  }

  if (runtimeRunId) {
    const runtimeInspection = await control.inspectRun(runtimeRunId);
    if (!runtimeInspection) {
      throw new TeamRunInspectionError('not-found', `Runtime run ${runtimeRunId} was not found.`);
    }
    const taskRunSpecSummary = runtimeInspection.record.bundle.run.taskRunSpecId
      ? await readStoredTaskRunSpecSummary(taskRunSpecStore, runtimeInspection.record.bundle.run.taskRunSpecId)
      : null;
    return buildTeamRunInspectionPayload({
      resolvedBy: 'runtime-run-id',
      queryId: runtimeRunId,
      taskRunSpecSummary,
      matchingRuntimeRunIds: [runtimeRunId],
      runtimeInspection,
    });
  }

  const resolvedTaskRunSpecId = taskRunSpecId;
  if (!resolvedTaskRunSpecId) {
    throw new TeamRunInspectionError('invalid-request', 'Provide --task-run-spec-id or --runtime-run-id.');
  }
  const taskRunSpecSummary = await readStoredTaskRunSpecSummary(taskRunSpecStore, resolvedTaskRunSpecId);
  if (!taskRunSpecSummary) {
    throw new TeamRunInspectionError('not-found', `Task run spec ${resolvedTaskRunSpecId} was not found.`);
  }

  const matchingRuntimeRecords = (await control.listRuns({ sourceKind: 'team-run' }))
    .filter((record) => record.bundle.run.taskRunSpecId === resolvedTaskRunSpecId)
    .sort((left, right) => right.bundle.run.updatedAt.localeCompare(left.bundle.run.updatedAt));
  const runtimeInspection = matchingRuntimeRecords[0]
    ? await control.inspectRun(matchingRuntimeRecords[0].runId)
    : null;

  return buildTeamRunInspectionPayload({
    resolvedBy: 'task-run-spec-id',
    queryId: resolvedTaskRunSpecId,
    taskRunSpecSummary,
    matchingRuntimeRunIds: matchingRuntimeRecords.slice(0, 10).map((record) => record.runId),
    runtimeInspection,
  });
}

function buildTeamRunInspectionPayload(input: {
  resolvedBy: 'task-run-spec-id' | 'runtime-run-id';
  queryId: string;
  taskRunSpecSummary: TaskRunSpecInspectionSummary | null;
  matchingRuntimeRunIds: string[];
  runtimeInspection: Awaited<ReturnType<ExecutionRuntimeControlContract['inspectRun']>>;
}): TeamRunInspectionPayload {
  const runtime = input.runtimeInspection
    ? {
        runtimeRunId: input.runtimeInspection.record.runId,
        teamRunId:
          input.runtimeInspection.record.bundle.run.sourceKind === 'team-run'
            ? input.runtimeInspection.record.bundle.run.sourceId ?? input.runtimeInspection.record.runId
            : input.runtimeInspection.record.bundle.run.sourceId,
        taskRunSpecId: input.runtimeInspection.record.bundle.run.taskRunSpecId ?? null,
        runtimeSourceKind: input.runtimeInspection.record.bundle.run.sourceKind,
        runtimeRunStatus: input.runtimeInspection.record.bundle.run.status,
        runtimeUpdatedAt: input.runtimeInspection.record.bundle.run.updatedAt,
        sharedStateStatus: input.runtimeInspection.record.bundle.sharedState.status,
        stepCount: input.runtimeInspection.record.bundle.steps.length,
        handoffCount: input.runtimeInspection.record.bundle.handoffs.length,
        localActionRequestCount: input.runtimeInspection.record.bundle.localActionRequests.length,
        nextRunnableStepId: input.runtimeInspection.dispatchPlan.nextRunnableStepId,
        runnableStepIds: input.runtimeInspection.dispatchPlan.runnableStepIds,
        deferredStepIds: input.runtimeInspection.dispatchPlan.deferredStepIds,
        waitingStepIds: input.runtimeInspection.dispatchPlan.waitingStepIds,
        blockedStepIds: input.runtimeInspection.dispatchPlan.blockedStepIds,
        blockedByFailureStepIds: input.runtimeInspection.dispatchPlan.blockedByFailureStepIds,
        runningStepIds: input.runtimeInspection.dispatchPlan.runningStepIds,
        terminalStepIds: input.runtimeInspection.dispatchPlan.terminalStepIds,
        missingDependencyStepIds: input.runtimeInspection.dispatchPlan.missingDependencyStepIds,
        activeLeaseOwnerId:
          input.runtimeInspection.record.bundle.leases.find((lease) => lease.status === 'active')?.ownerId ?? null,
      }
    : null;

  return {
    resolvedBy: input.resolvedBy,
    queryId: input.queryId,
    taskRunSpecSummary: input.taskRunSpecSummary,
    matchingRuntimeRunCount: input.matchingRuntimeRunIds.length,
    matchingRuntimeRunIds: input.matchingRuntimeRunIds,
    runtime,
  };
}

async function readStoredTaskRunSpecSummary(
  store: TaskRunSpecRecordStore,
  taskRunSpecId: string,
): Promise<TaskRunSpecInspectionSummary | null> {
  const record = await store.readRecord(taskRunSpecId);
  return record ? summarizeTaskRunSpecStoredRecord(record) : null;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
