import { createTeamRunBundleFromConfig, createTeamRunBundleFromResolvedTeam } from './model.js';
import { TeamRunSchema, TeamRunSharedStateSchema, TeamRunStepSchema } from './schema.js';
import type { ResolvedTeamRuntimeSelections } from '../config/model.js';
import type { TeamRun, TeamRunSharedState, TeamRunStep } from './types.js';

export interface TeamRunServicePlan {
  teamRun: TeamRun;
  sharedState: TeamRunSharedState;
  steps: TeamRunStep[];
  stepsById: Record<string, TeamRunStep>;
  runnableStepIds: string[];
  waitingStepIds: string[];
  blockedStepIds: string[];
  terminalStepIds: string[];
  missingDependencyStepIds: string[];
}

function isTerminalStep(step: TeamRunStep): boolean {
  return (
    step.status === 'succeeded' ||
    step.status === 'failed' ||
    step.status === 'skipped' ||
    step.status === 'cancelled'
  );
}

function canDispatchStep(step: TeamRunStep): boolean {
  return step.status === 'planned' || step.status === 'ready';
}

export function createTeamRunServicePlan(input: {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  sharedState: TeamRunSharedState;
}): TeamRunServicePlan {
  const teamRun = TeamRunSchema.parse(input.teamRun);
  const sharedState = TeamRunSharedStateSchema.parse(input.sharedState);
  const steps = input.steps
    .map((step) => TeamRunStepSchema.parse(step))
    .slice()
    .sort((left, right) => left.order - right.order);
  const stepsById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<string, TeamRunStep>;
  const runnableStepIds: string[] = [];
  const waitingStepIds: string[] = [];
  const blockedStepIds: string[] = [];
  const terminalStepIds: string[] = [];
  const missingDependencyStepIds = new Set<string>();

  for (const step of steps) {
    if (step.status === 'blocked') {
      blockedStepIds.push(step.id);
      continue;
    }
    if (isTerminalStep(step)) {
      terminalStepIds.push(step.id);
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
      runnableStepIds.push(step.id);
    } else {
      waitingStepIds.push(step.id);
    }
  }

  return {
    teamRun,
    sharedState,
    steps,
    stepsById,
    runnableStepIds,
    waitingStepIds,
    blockedStepIds,
    terminalStepIds,
    missingDependencyStepIds: Array.from(missingDependencyStepIds).sort(),
  };
}

export function createTeamRunServicePlanFromResolvedTeam(input: {
  runId: string;
  createdAt: string;
  team: ResolvedTeamRuntimeSelections;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
}): TeamRunServicePlan {
  return createTeamRunServicePlan(
    createTeamRunBundleFromResolvedTeam({
      runId: input.runId,
      createdAt: input.createdAt,
      team: input.team,
      updatedAt: input.updatedAt,
      trigger: input.trigger,
      requestedBy: input.requestedBy,
      entryPrompt: input.entryPrompt,
      initialInputs: input.initialInputs,
    }),
  );
}

export function createTeamRunServicePlanFromConfig(input: {
  config: Record<string, unknown>;
  teamId: string;
  runId: string;
  createdAt: string;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
}): TeamRunServicePlan {
  return createTeamRunServicePlan(
    createTeamRunBundleFromConfig({
      config: input.config,
      teamId: input.teamId,
      runId: input.runId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      trigger: input.trigger,
      requestedBy: input.requestedBy,
      entryPrompt: input.entryPrompt,
      initialInputs: input.initialInputs,
    }),
  );
}
