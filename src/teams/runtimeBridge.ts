import {
  resolveHostLocalActionExecutionPolicy,
  type ResolvedTeamRuntimeSelections,
} from '../config/model.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../runtime/model.js';
import { createExecutionServiceHost, type ExecutionServiceHost, type ExecutionServiceHostDeps } from '../runtime/serviceHost.js';
import type { ExecutionRunStoredRecord } from '../runtime/store.js';
import {
  createTeamRunServicePlanFromConfig,
  createTeamRunServicePlanFromConfigTaskRunSpec,
  createTeamRunServicePlanFromResolvedTeam,
  createTeamRunServicePlanFromResolvedTeamTaskRunSpec,
  type TeamRunServicePlan,
} from './service.js';
import type { ExecutionRunStepStatus, ExecutionRunStatus, ExecutionRunSourceKind } from '../runtime/types.js';
import type { TaskRunSpec, TeamRun, TeamRunStep } from './types.js';
import {
  createTaskRunSpecRecordStore,
  type TaskRunSpecRecordStore,
  type TaskRunSpecStoredRecord,
} from './store.js';

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

export interface ExecuteTeamRunTaskRunSpecFromConfigInput extends ExecuteTeamRunBridgeInput {
  config: Record<string, unknown>;
  teamId: string;
  taskRunSpec: TaskRunSpec;
}

export interface ExecuteTeamRunFromResolvedTeamInput extends ExecuteTeamRunBridgeInput {
  team: ResolvedTeamRuntimeSelections;
}

export interface ExecuteTeamRunTaskRunSpecFromResolvedTeamInput extends ExecuteTeamRunBridgeInput {
  team: ResolvedTeamRuntimeSelections;
  taskRunSpec: TaskRunSpec;
}

export interface TeamRuntimeBridgeResult {
  teamPlan: TeamRunServicePlan;
  persistedTaskRunSpecRecord?: TaskRunSpecStoredRecord | null;
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
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: TeamRunStep['service'];
}

export interface TeamRuntimeExecutionSummary {
  teamRunId: string;
  taskRunSpecId: string | null;
  runtimeRunId: string;
  runtimeSourceKind: ExecutionRunSourceKind;
  runtimeRunStatus: ExecutionRunStatus;
  runtimeUpdatedAt: string;
  terminalStepCount: number;
  stepSummaries: TeamRuntimeExecutionStepSummary[];
}

export interface TeamRuntimeBridgeDeps {
  control?: ExecutionRuntimeControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
  now?: () => string;
  ownerId?: string;
  executeStoredRunStep?: ExecutionServiceHostDeps['executeStoredRunStep'];
  executeLocalActionRequest?: ExecutionServiceHostDeps['executeLocalActionRequest'];
}

export interface TeamRuntimeBridge {
  executeFromConfig(input: ExecuteTeamRunFromConfigInput): Promise<TeamRuntimeBridgeResult>;
  executeFromConfigTaskRunSpec(input: ExecuteTeamRunTaskRunSpecFromConfigInput): Promise<TeamRuntimeBridgeResult>;
  executeFromResolvedTeam(input: ExecuteTeamRunFromResolvedTeamInput): Promise<TeamRuntimeBridgeResult>;
  executeFromResolvedTeamTaskRunSpec(
    input: ExecuteTeamRunTaskRunSpecFromResolvedTeamInput,
  ): Promise<TeamRuntimeBridgeResult>;
}

export function createTeamRuntimeBridge(deps: TeamRuntimeBridgeDeps = {}): TeamRuntimeBridge {
  const control = deps.control ?? createExecutionRuntimeControl();
  const taskRunSpecStore = deps.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const defaultHost = createExecutionServiceHost({
    control,
    now: deps.now,
    ownerId: deps.ownerId ?? 'host:team-runtime-bridge',
    executeStoredRunStep: deps.executeStoredRunStep,
    executeLocalActionRequest: deps.executeLocalActionRequest,
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
      const host = createExecutionServiceHost({
        control,
        now: deps.now,
        ownerId: deps.ownerId ?? 'host:team-runtime-bridge',
        localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(input.config),
        executeStoredRunStep: deps.executeStoredRunStep,
        executeLocalActionRequest: deps.executeLocalActionRequest,
      });
      return executeTeamRuntimePlan({ control, host, teamPlan, taskRunSpecStore });
    },

    async executeFromConfigTaskRunSpec(input) {
      const teamPlan = createTeamRunServicePlanFromConfigTaskRunSpec({
        config: input.config,
        teamId: input.teamId,
        runId: input.runId,
        createdAt: input.createdAt,
        taskRunSpec: input.taskRunSpec,
        updatedAt: input.updatedAt,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
      });
      const host = createExecutionServiceHost({
        control,
        now: deps.now,
        ownerId: deps.ownerId ?? 'host:team-runtime-bridge',
        localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(input.config),
        executeStoredRunStep: deps.executeStoredRunStep,
        executeLocalActionRequest: deps.executeLocalActionRequest,
      });
      return executeTeamRuntimePlan({ control, host, teamPlan, taskRunSpecStore });
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
      return executeTeamRuntimePlan({ control, host: defaultHost, teamPlan, taskRunSpecStore });
    },

    async executeFromResolvedTeamTaskRunSpec(input) {
      const teamPlan = createTeamRunServicePlanFromResolvedTeamTaskRunSpec({
        runId: input.runId,
        createdAt: input.createdAt,
        team: input.team,
        taskRunSpec: input.taskRunSpec,
        updatedAt: input.updatedAt,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
      });
      return executeTeamRuntimePlan({ control, host: defaultHost, teamPlan, taskRunSpecStore });
    },
  };
}

async function executeTeamRuntimePlan(input: {
  control: ExecutionRuntimeControlContract;
  host: ExecutionServiceHost;
  teamPlan: TeamRunServicePlan;
  taskRunSpecStore: TaskRunSpecRecordStore;
}): Promise<TeamRuntimeBridgeResult> {
  const persistedTaskRunSpecRecord = input.teamPlan.taskRunSpec
    ? await persistTaskRunSpec({ store: input.taskRunSpecStore, taskRunSpec: input.teamPlan.taskRunSpec })
    : null;

  const runtimeBundle = createExecutionRunRecordBundleFromTeamRun({
    teamRun: input.teamPlan.teamRun,
    steps: input.teamPlan.steps,
    handoffs: input.teamPlan.handoffs,
    localActionRequests: input.teamPlan.localActionRequests,
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
    persistedTaskRunSpecRecord,
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
      runtimeProfileId: runtimeStep?.runtimeProfileId ?? teamStep.runtimeProfileId,
      browserProfileId: runtimeStep?.browserProfileId ?? teamStep.browserProfileId,
      service: runtimeStep?.service ?? teamStep.service,
    };
  });

  return {
    teamRunId: input.teamPlan.teamRun.id,
    taskRunSpecId: input.teamPlan.teamRun.taskRunSpecId ?? input.runtimeRecord.bundle.run.taskRunSpecId ?? null,
    runtimeRunId: input.runtimeRecord.bundle.run.id,
    runtimeSourceKind: input.runtimeRecord.bundle.run.sourceKind,
    runtimeRunStatus: input.runtimeRecord.bundle.run.status,
    runtimeUpdatedAt: input.runtimeRecord.bundle.run.updatedAt,
    terminalStepCount: input.teamPlan.terminalStepIds.length,
    stepSummaries,
  };
}

async function persistTaskRunSpec(input: {
  store: TaskRunSpecRecordStore;
  taskRunSpec: TaskRunSpec;
}): Promise<TaskRunSpecStoredRecord> {
  await input.store.ensureStorage();
  const existing = await input.store.readRecord(input.taskRunSpec.id);
  return input.store.writeRecord(input.taskRunSpec, {
    expectedRevision: existing?.revision ?? 0,
  });
}

function mapRuntimeStepStatusToTeamStatus(
  runtimeStatus: ExecutionRunStepStatus,
): TeamRunStep['status'] {
  if (runtimeStatus === 'runnable') {
    return 'ready';
  }

  return runtimeStatus;
}
