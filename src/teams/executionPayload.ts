import type { TeamRuntimeBridgeResult } from './runtimeBridge.js';
import type { TaskRunSpec } from './types.js';

export interface TeamRunExecutionPayload {
  teamId: string;
  taskRunSpecId: string;
  teamRunId: string;
  runtimeRunId: string;
  runtimeSourceKind: TeamRuntimeBridgeResult['executionSummary']['runtimeSourceKind'];
  runtimeRunStatus: TeamRuntimeBridgeResult['executionSummary']['runtimeRunStatus'];
  runtimeUpdatedAt: string;
  terminalStepCount: number;
  finalOutputSummary: string | null;
  sharedStateStatus: TeamRuntimeBridgeResult['finalRuntimeRecord']['bundle']['sharedState']['status'];
  sharedStateNotes: string[];
  stepSummaries: TeamRuntimeBridgeResult['executionSummary']['stepSummaries'];
}

export function buildTeamRunExecutionPayload(input: {
  teamId: string;
  bridgeResult: TeamRuntimeBridgeResult;
  taskRunSpec: TaskRunSpec;
}): TeamRunExecutionPayload {
  const finalStep = input.bridgeResult.finalRuntimeRecord.bundle.steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .at(-1);

  return {
    teamId: input.teamId,
    taskRunSpecId: input.taskRunSpec.id,
    teamRunId: input.bridgeResult.executionSummary.teamRunId,
    runtimeRunId: input.bridgeResult.executionSummary.runtimeRunId,
    runtimeSourceKind: input.bridgeResult.executionSummary.runtimeSourceKind,
    runtimeRunStatus: input.bridgeResult.executionSummary.runtimeRunStatus,
    runtimeUpdatedAt: input.bridgeResult.executionSummary.runtimeUpdatedAt,
    terminalStepCount: input.bridgeResult.executionSummary.terminalStepCount,
    finalOutputSummary: finalStep?.output?.summary ?? null,
    sharedStateStatus: input.bridgeResult.finalRuntimeRecord.bundle.sharedState.status,
    sharedStateNotes: input.bridgeResult.finalRuntimeRecord.bundle.sharedState.notes,
    stepSummaries: input.bridgeResult.executionSummary.stepSummaries,
  };
}
