import { createTaskRunSpecRecordStore, summarizeTaskRunSpecStoredRecord, type TaskRunSpecInspectionSummary, type TaskRunSpecRecordStore } from '../teams/store.js';
import { createExecutionRuntimeControl } from './control.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import { getActiveExecutionRunLease } from './contract.js';
import { createExecutionRunQueueProjection, type ExecutionRunQueueProjection } from './projection.js';
import { createExecutionRunnerControl, type ExecutionRunnerControlContract } from './runnersControl.js';
import type { ExecutionRunSourceKind, ExecutionRunStatus, ExecutionRunnerStatus } from './types.js';
import type { ExecutionRunnerStoredRecord } from './runnersStore.js';
import type { ExecutionRunStoredRecord } from './store.js';

export interface InspectRuntimeRunInput {
  runId?: string | null;
  runtimeRunId?: string | null;
  teamRunId?: string | null;
  taskRunSpecId?: string | null;
  runnerId?: string | null;
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
}

export interface RuntimeRunInspectionRunnerSummary {
  selectedBy: 'query-runner-id' | 'active-lease-owner';
  runnerId: string;
  hostId: string;
  status: ExecutionRunnerStatus;
  lastHeartbeatAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  lastClaimedRunId: string | null;
  serviceIds: string[];
  runtimeProfileIds: string[];
  browserProfileIds: string[];
  serviceAccountIds: string[];
  browserCapable: boolean;
  eligibilityNote: string | null;
}

export interface RuntimeRunInspectionRuntimeSummary {
  runId: string;
  teamRunId: string | null;
  taskRunSpecId: string | null;
  sourceKind: ExecutionRunSourceKind;
  runStatus: ExecutionRunStatus;
  updatedAt: string;
  queueProjection: ExecutionRunQueueProjection;
}

export interface RuntimeRunInspectionPayload {
  queryRunId: string;
  taskRunSpecSummary: TaskRunSpecInspectionSummary | null;
  runtime: RuntimeRunInspectionRuntimeSummary;
  runner: RuntimeRunInspectionRunnerSummary | null;
}

export class RuntimeRunInspectionError extends Error {
  readonly status: 'invalid-request' | 'not-found';

  constructor(status: 'invalid-request' | 'not-found', message: string) {
    super(message);
    this.name = 'RuntimeRunInspectionError';
    this.status = status;
  }
}

export async function inspectRuntimeRun(input: InspectRuntimeRunInput): Promise<RuntimeRunInspectionPayload> {
  const control = input.control ?? createExecutionRuntimeControl();
  const runnersControl = input.runnersControl ?? createExecutionRunnerControl();
  const taskRunSpecStore = input.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const runId = normalizeOptionalId(input.runId);
  const runtimeRunId = normalizeOptionalId(input.runtimeRunId);
  const teamRunId = normalizeOptionalId(input.teamRunId);
  const taskRunSpecId = normalizeOptionalId(input.taskRunSpecId);
  const requestedRunnerId = normalizeOptionalId(input.runnerId);

  const providedLookupCount = [runId, runtimeRunId, teamRunId, taskRunSpecId].filter(Boolean).length;

  if (providedLookupCount === 0) {
    throw new RuntimeRunInspectionError(
      'invalid-request',
      'Provide --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.',
    );
  }

  if (providedLookupCount > 1) {
    throw new RuntimeRunInspectionError(
      'invalid-request',
      'Choose exactly one runtime lookup key: --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.',
    );
  }

  const resolvedRunId =
    runtimeRunId ??
    runId ??
    (await resolveRuntimeRunIdForTeamRun(control, teamRunId)) ??
    (await resolveRuntimeRunIdForTaskRunSpec(control, taskRunSpecId));

  if (resolvedRunId === null) {
    if (teamRunId) {
      throw new RuntimeRunInspectionError('not-found', `Team run ${teamRunId} was not found.`);
    }
    if (taskRunSpecId) {
      throw new RuntimeRunInspectionError(
        'not-found',
        `No runtime run was found for task run spec ${taskRunSpecId}.`,
      );
    }
    if (runtimeRunId || runId) {
      throw new RuntimeRunInspectionError(
        'not-found',
        `Runtime run ${runtimeRunId ?? runId} was not found.`,
      );
    }
    throw new RuntimeRunInspectionError('not-found', 'No matching runtime run was found.');
  }

  const runtimeInspection = await control.inspectRun(resolvedRunId);
  if (!runtimeInspection) {
    throw new RuntimeRunInspectionError('not-found', `Runtime run ${resolvedRunId} was not found.`);
  }

  const selectedRunner = await selectInspectionRunner(runtimeInspection.record, {
    requestedRunnerId,
    runnersControl,
  });
  const queueProjection = createExecutionRunQueueProjection(runtimeInspection, {
    runner: selectedRunner?.runner.runner ?? null,
  });
  const taskRunSpecSummary = runtimeInspection.record.bundle.run.taskRunSpecId
    ? await readStoredTaskRunSpecSummary(taskRunSpecStore, runtimeInspection.record.bundle.run.taskRunSpecId)
    : null;

  return {
    queryRunId: resolvedRunId,
    taskRunSpecSummary,
    runtime: {
      runId: runtimeInspection.record.runId,
      teamRunId:
        runtimeInspection.record.bundle.run.sourceKind === 'team-run'
          ? runtimeInspection.record.bundle.run.sourceId ?? runtimeInspection.record.runId
          : runtimeInspection.record.bundle.run.sourceId,
      taskRunSpecId: runtimeInspection.record.bundle.run.taskRunSpecId ?? null,
      sourceKind: runtimeInspection.record.bundle.run.sourceKind,
      runStatus: runtimeInspection.record.bundle.run.status,
      updatedAt: runtimeInspection.record.bundle.run.updatedAt,
      queueProjection,
    },
    runner: selectedRunner
      ? {
          selectedBy: selectedRunner.selectedBy,
          runnerId: selectedRunner.runner.runner.id,
          hostId: selectedRunner.runner.runner.hostId,
          status: selectedRunner.runner.runner.status,
          lastHeartbeatAt: selectedRunner.runner.runner.lastHeartbeatAt,
          expiresAt: selectedRunner.runner.runner.expiresAt,
          lastActivityAt: selectedRunner.runner.runner.lastActivityAt,
          lastClaimedRunId: selectedRunner.runner.runner.lastClaimedRunId,
          serviceIds: [...selectedRunner.runner.runner.serviceIds],
          runtimeProfileIds: [...selectedRunner.runner.runner.runtimeProfileIds],
          browserProfileIds: [...selectedRunner.runner.runner.browserProfileIds],
          serviceAccountIds: [...selectedRunner.runner.runner.serviceAccountIds],
          browserCapable: selectedRunner.runner.runner.browserCapable,
          eligibilityNote: selectedRunner.runner.runner.eligibilityNote,
        }
      : null,
  };
}

async function resolveRuntimeRunIdForTeamRun(
  control: ExecutionRuntimeControlContract,
  teamRunId: string | null,
): Promise<string | null> {
  if (!teamRunId) return null;
  const runtimeRecords = (await control.listRuns({ sourceKind: 'team-run' })).filter(
    (record) => record.bundle.run.sourceId === teamRunId,
  );
  const sorted = runtimeRecords.sort((left, right) => right.bundle.run.updatedAt.localeCompare(left.bundle.run.updatedAt));
  return sorted[0]?.runId ?? null;
}

async function resolveRuntimeRunIdForTaskRunSpec(
  control: ExecutionRuntimeControlContract,
  taskRunSpecId: string | null,
): Promise<string | null> {
  if (!taskRunSpecId) return null;
  const runtimeRecords = (await control.listRuns()).filter(
    (record) => record.bundle.run.taskRunSpecId === taskRunSpecId,
  );
  const sorted = runtimeRecords.sort((left, right) => right.bundle.run.updatedAt.localeCompare(left.bundle.run.updatedAt));
  return sorted[0]?.runId ?? null;
}

async function selectInspectionRunner(
  record: ExecutionRunStoredRecord,
  input: {
    requestedRunnerId: string | null;
    runnersControl: ExecutionRunnerControlContract;
  },
): Promise<{
  selectedBy: 'query-runner-id' | 'active-lease-owner';
  runner: ExecutionRunnerStoredRecord;
} | null> {
  const selectedBy = input.requestedRunnerId ? 'query-runner-id' : 'active-lease-owner';
  const runnerId = input.requestedRunnerId ?? getActiveExecutionRunLease(record)?.ownerId ?? null;
  if (!runnerId) {
    return null;
  }

  const runner = await input.runnersControl.readRunner(runnerId);
  if (!runner) {
    if (input.requestedRunnerId) {
      throw new RuntimeRunInspectionError('not-found', `Execution runner ${runnerId} was not found.`);
    }
    return null;
  }

  return {
    selectedBy,
    runner,
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
