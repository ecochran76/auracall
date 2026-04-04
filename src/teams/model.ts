import {
  TeamRunSchema,
  TeamRunSharedStateSchema,
  TeamRunStepSchema,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
} from './schema.js';
import { resolveTeamRuntimeSelections, type ResolvedTeamRuntimeSelections } from '../config/model.js';
import type {
  TeamRun,
  TeamRunSharedState,
  TeamRunStep,
  TeamRunServiceId,
  TeamRunStepInput,
  TeamRunStepKind,
  TeamRunStepStatus,
} from './types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from './types.js';

export interface CreateTeamRunStepInput {
  id: string;
  agentId: string;
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  service?: TeamRunServiceId;
  kind?: TeamRunStepKind;
  status?: TeamRunStepStatus;
  order: number;
  dependsOnStepIds?: string[];
  input?: Partial<TeamRunStepInput>;
}

export interface CreateTeamRunBundleInput {
  runId: string;
  teamId: string;
  sharedStateId?: string;
  createdAt: string;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
  steps: CreateTeamRunStepInput[];
}

export interface CreateTeamRunFromResolvedTeamInput {
  runId: string;
  createdAt: string;
  team: ResolvedTeamRuntimeSelections;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
}

function buildStepInput(input: Partial<TeamRunStepInput> = {}): TeamRunStepInput {
  return {
    prompt: input.prompt ?? null,
    handoffIds: input.handoffIds ?? [],
    artifacts: input.artifacts ?? [],
    structuredData: input.structuredData ?? {},
    notes: input.notes ?? [],
  };
}

export function createTeamRunStep(teamRunId: string, input: CreateTeamRunStepInput): TeamRunStep {
  return TeamRunStepSchema.parse({
    id: input.id,
    teamRunId,
    agentId: input.agentId,
    runtimeProfileId: input.runtimeProfileId ?? null,
    browserProfileId: input.browserProfileId ?? null,
    service: input.service ?? null,
    kind: input.kind ?? 'prompt',
    status: input.status ?? 'planned',
    order: input.order,
    dependsOnStepIds: input.dependsOnStepIds ?? [],
    input: buildStepInput(input.input),
    output: null,
    startedAt: null,
    completedAt: null,
    failure: null,
  });
}

export function createTeamRunBundleFromResolvedTeam(
  input: CreateTeamRunFromResolvedTeamInput,
): {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  sharedState: TeamRunSharedState;
} {
  const steps = input.team.members.map((member, index) => {
    const stepId = `${input.runId}:step:${index + 1}`;
    const previousStepId = index > 0 ? `${input.runId}:step:${index}` : null;
    const hasRuntimeContext = member.exists && member.runtimeProfileId;
    return {
      id: stepId,
      agentId: member.agentId ?? `member-${index + 1}`,
      runtimeProfileId: member.runtimeProfileId,
      browserProfileId: member.browserProfileId,
      service: member.defaultService,
      kind: 'prompt' as const,
      status: hasRuntimeContext ? ('planned' as const) : ('blocked' as const),
      order: index + 1,
      dependsOnStepIds: previousStepId ? [previousStepId] : [],
      input: {
        notes: [
          hasRuntimeContext
            ? 'planned from resolved team runtime selection'
            : 'blocked because the member does not resolve to a runnable runtime profile',
        ],
      },
    };
  });

  return createTeamRunBundle({
    runId: input.runId,
    teamId: input.team.teamId ?? '(none)',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    entryPrompt: input.entryPrompt,
    initialInputs: {
      selectedTeamId: input.team.teamId,
      teamExists: input.team.exists,
      ...input.initialInputs,
    },
    steps,
  });
}

export function createTeamRunBundleFromConfig(input: {
  config: Record<string, unknown>;
  teamId: string;
  runId: string;
  createdAt: string;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
}): {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  sharedState: TeamRunSharedState;
} {
  const resolvedTeam = resolveTeamRuntimeSelections(input.config, input.teamId);
  return createTeamRunBundleFromResolvedTeam({
    runId: input.runId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    entryPrompt: input.entryPrompt,
    initialInputs: input.initialInputs,
    team: resolvedTeam,
  });
}

export function createTeamRunSharedState(input: {
  id: string;
  teamRunId: string;
  createdAt: string;
}): TeamRunSharedState {
  return TeamRunSharedStateSchema.parse({
    id: input.id,
    teamRunId: input.teamRunId,
    status: 'active',
    artifacts: [],
    structuredOutputs: [],
    notes: [],
    history: [],
    lastUpdatedAt: input.createdAt,
  });
}

export function createTeamRunBundle(input: CreateTeamRunBundleInput): {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  sharedState: TeamRunSharedState;
} {
  const steps = input.steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((step) => createTeamRunStep(input.runId, step));
  const sharedState = createTeamRunSharedState({
    id: input.sharedStateId ?? `${input.runId}:state`,
    teamRunId: input.runId,
    createdAt: input.createdAt,
  });
  const teamRun = TeamRunSchema.parse({
    id: input.runId,
    teamId: input.teamId,
    status: 'planned',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    trigger: input.trigger ?? 'service',
    requestedBy: input.requestedBy ?? null,
    entryPrompt: input.entryPrompt ?? null,
    initialInputs: input.initialInputs ?? {},
    sharedStateId: sharedState.id,
    stepIds: steps.map((step) => step.id),
    policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
  });
  return {
    teamRun,
    steps,
    sharedState,
  };
}

export { DEFAULT_TEAM_RUN_EXECUTION_POLICY };
