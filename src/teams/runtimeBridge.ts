import type { ResolvedTeamRuntimeSelections } from '../config/model.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../runtime/model.js';
import { createExecutionServiceHost, type ExecutionServiceHost, type ExecutionServiceHostDeps } from '../runtime/serviceHost.js';
import type { ExecutionRunStoredRecord } from '../runtime/store.js';
import { createTeamRunServicePlanFromConfig, createTeamRunServicePlanFromResolvedTeam, type TeamRunServicePlan } from './service.js';
import type { ExecutionRunStepStatus, ExecutionRunStatus, ExecutionRunSourceKind } from '../runtime/types.js';
import type { TeamRun, TeamRunStep } from './types.js';

export interface ExecuteTeamRunBridgeInput {
  runId: string;
  createdAt: string;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
}

export interface ExecuteTeamRunFromConfigInput extends ExecuteTeamRunBridgeInput {
  config: Record<string, unknown>;
  teamId: string;
}

export interface ExecuteTeamRunFromResolvedTeamInput extends ExecuteTeamRunBridgeInput {
  team: ResolvedTeamRuntimeSelections;
}

export interface TeamRuntimeBridgeResult {
  teamPlan: TeamRunServicePlan;
  createdRuntimeRecord: ExecutionRunStoredRecord;
  finalRuntimeRecord: ExecutionRunStoredRecord;
  executionSummary: TeamRuntimeExecutionSummary;
  hostDrainResults: Array<Awaited<ReturnType<ExecutionServiceHost['drainRunsUntilIdle']>>>;
}

export interface TeamRuntimeExecutionStepSummary {
  teamStepId: string;
  teamStepOrder: number;
  teamStepStatus: TeamRunStep['status'];
  runtimeStepId: string | null;
  runtimeStepStatus: ExecutionRunStepStatus | null;
  runtimeStepFailure: string | null;
}

export interface TeamRuntimeExecutionSummary {
  teamRunId: string;
  runtimeRunId: string;
  runtimeSourceKind: ExecutionRunSourceKind;
  runtimeRunStatus: ExecutionRunStatus;
  runtimeUpdatedAt: string;
  terminalStepCount: number;
  stepSummaries: TeamRuntimeExecutionStepSummary[];
}

export interface TeamRuntimeBridgeDeps {
  control?: ExecutionRuntimeControlContract;
  now?: () => string;
  ownerId?: string;
  executeStoredRunStep?: ExecutionServiceHostDeps['executeStoredRunStep'];
}

export interface TeamRuntimeBridge {
  executeFromConfig(input: ExecuteTeamRunFromConfigInput): Promise<TeamRuntimeBridgeResult>;
  executeFromResolvedTeam(input: ExecuteTeamRunFromResolvedTeamInput): Promise<TeamRuntimeBridgeResult>;
}

export function createTeamRuntimeBridge(deps: TeamRuntimeBridgeDeps = {}): TeamRuntimeBridge {
  const control = deps.control ?? createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    now: deps.now,
    ownerId: deps.ownerId ?? 'host:team-runtime-bridge',
    executeStoredRunStep: deps.executeStoredRunStep,
  });

  return {
    async executeFromConfig(input) {
      const teamPlan = createTeamRunServicePlanFromConfig({
        config: input.config,
        teamId: input.teamId,
        runId: input.runId,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
        entryPrompt: input.entryPrompt,
        initialInputs: input.initialInputs,
      });
      return executeTeamRuntimePlan({ control, host, teamPlan });
    },

    async executeFromResolvedTeam(input) {
      const teamPlan = createTeamRunServicePlanFromResolvedTeam({
        runId: input.runId,
        createdAt: input.createdAt,
        team: input.team,
        updatedAt: input.updatedAt,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
        entryPrompt: input.entryPrompt,
        initialInputs: input.initialInputs,
      });
      return executeTeamRuntimePlan({ control, host, teamPlan });
    },
  };
}

async function executeTeamRuntimePlan(input: {
  control: ExecutionRuntimeControlContract;
  host: ExecutionServiceHost;
  teamPlan: TeamRunServicePlan;
}): Promise<TeamRuntimeBridgeResult> {
  const runtimeBundle = createExecutionRunRecordBundleFromTeamRun({
    teamRun: input.teamPlan.teamRun,
    steps: input.teamPlan.steps,
    sharedState: input.teamPlan.sharedState,
  });

  const createdRuntimeRecord = await input.control.createRun(runtimeBundle);
  const hostDrainResult = await input.host.drainRunsUntilIdle({
    runId: runtimeBundle.run.id,
    maxRuns: 100,
  });
  const finalRuntimeRecord = hostDrainResult.drained.at(-1)?.record ?? createdRuntimeRecord;
  const hostDrainResults = [hostDrainResult];

  return {
    teamPlan: input.teamPlan,
    createdRuntimeRecord,
    finalRuntimeRecord,
    executionSummary: summarizeTeamRuntimeExecution({
      teamPlan: input.teamPlan,
      runtimeRecord: finalRuntimeRecord,
    }),
    hostDrainResults,
  };
}

function summarizeTeamRuntimeExecution(input: {
  teamPlan: TeamRunServicePlan;
  runtimeRecord: ExecutionRunStoredRecord;
}): TeamRuntimeExecutionSummary {
  const runtimeStepsByTeamStepId = new Map(
    input.runtimeRecord.bundle.steps.map((step) => [step.sourceStepId, step]),
  );

  const stepSummaries: TeamRuntimeExecutionStepSummary[] = input.teamPlan.steps.map((teamStep) => {
    const runtimeStep = runtimeStepsByTeamStepId.get(teamStep.id);
    return {
      teamStepId: teamStep.id,
      teamStepOrder: teamStep.order,
      teamStepStatus: runtimeStep ? mapRuntimeStepStatusToTeamStatus(runtimeStep.status) : teamStep.status,
      runtimeStepId: runtimeStep?.id ?? null,
      runtimeStepStatus: runtimeStep?.status ?? null,
      runtimeStepFailure: runtimeStep?.failure?.message ?? null,
    };
  });

  return {
    teamRunId: input.teamPlan.teamRun.id,
    runtimeRunId: input.runtimeRecord.bundle.run.id,
    runtimeSourceKind: input.runtimeRecord.bundle.run.sourceKind,
    runtimeRunStatus: input.runtimeRecord.bundle.run.status,
    runtimeUpdatedAt: input.runtimeRecord.bundle.run.updatedAt,
    terminalStepCount: input.teamPlan.terminalStepIds.length,
    stepSummaries,
  };
}

function mapRuntimeStepStatusToTeamStatus(
  runtimeStatus: ExecutionRunStepStatus,
): TeamRunStep['status'] {
  if (runtimeStatus === 'runnable') {
    return 'ready';
  }

  return runtimeStatus;
}
