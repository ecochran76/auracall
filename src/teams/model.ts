import {
  TeamRunSchema,
  TeamRunSharedStateSchema,
  TeamRunStepSchema,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
} from './schema.js';
import type {
  TeamRun,
  TeamRunSharedState,
  TeamRunStep,
  TeamRunServiceId,
  TeamRunStepInput,
  TeamRunStepKind,
} from './types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from './types.js';

export interface CreateTeamRunStepInput {
  id: string;
  agentId: string;
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  service?: TeamRunServiceId;
  kind?: TeamRunStepKind;
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
    status: 'planned',
    order: input.order,
    dependsOnStepIds: input.dependsOnStepIds ?? [],
    input: buildStepInput(input.input),
    output: null,
    startedAt: null,
    completedAt: null,
    failure: null,
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
