import {
  ExecutionRunEventSchema,
  ExecutionRunRecordBundleSchema,
  ExecutionRunSchema,
  ExecutionRunSharedStateSchema,
  ExecutionRunStepSchema,
} from './schema.js';
import type {
  ExecutionRun,
  ExecutionRunEvent,
  ExecutionRunRecordBundle,
  ExecutionRunSharedState,
  ExecutionRunStep,
} from './types.js';
import type { TeamRun, TeamRunSharedState, TeamRunStep } from '../teams/types.js';

function mapTeamRunStatusToExecutionStatus(status: TeamRun['status']): ExecutionRun['status'] {
  return status;
}

function mapTeamRunStepStatusToExecutionStatus(status: TeamRunStep['status']): ExecutionRunStep['status'] {
  if (status === 'ready') return 'runnable';
  return status;
}

export function createExecutionRun(input: {
  id: string;
  sourceKind?: ExecutionRun['sourceKind'];
  sourceId?: string | null;
  status?: ExecutionRun['status'];
  createdAt: string;
  updatedAt?: string;
  trigger: ExecutionRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
  sharedStateId: string;
  stepIds?: string[];
  policy: ExecutionRun['policy'];
}): ExecutionRun {
  return ExecutionRunSchema.parse({
    id: input.id,
    sourceKind: input.sourceKind ?? 'direct',
    sourceId: input.sourceId ?? null,
    status: input.status ?? 'planned',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    trigger: input.trigger,
    requestedBy: input.requestedBy ?? null,
    entryPrompt: input.entryPrompt ?? null,
    initialInputs: input.initialInputs ?? {},
    sharedStateId: input.sharedStateId,
    stepIds: input.stepIds ?? [],
    policy: input.policy,
  });
}

export function createExecutionRunStep(input: {
  id: string;
  runId: string;
  sourceStepId?: string | null;
  agentId: string;
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  service?: ExecutionRunStep['service'];
  kind: ExecutionRunStep['kind'];
  status?: ExecutionRunStep['status'];
  order: number;
  dependsOnStepIds?: string[];
  input: ExecutionRunStep['input'];
  output?: ExecutionRunStep['output'];
  startedAt?: string | null;
  completedAt?: string | null;
  failure?: ExecutionRunStep['failure'];
}): ExecutionRunStep {
  return ExecutionRunStepSchema.parse({
    id: input.id,
    runId: input.runId,
    sourceStepId: input.sourceStepId ?? null,
    agentId: input.agentId,
    runtimeProfileId: input.runtimeProfileId ?? null,
    browserProfileId: input.browserProfileId ?? null,
    service: input.service ?? null,
    kind: input.kind,
    status: input.status ?? 'planned',
    order: input.order,
    dependsOnStepIds: input.dependsOnStepIds ?? [],
    input: input.input,
    output: input.output ?? null,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    failure: input.failure ?? null,
  });
}

export function createExecutionRunEvent(input: {
  id: string;
  runId: string;
  type: ExecutionRunEvent['type'];
  createdAt: string;
  stepId?: string | null;
  leaseId?: string | null;
  note?: string | null;
  payload?: Record<string, unknown> | null;
}): ExecutionRunEvent {
  return ExecutionRunEventSchema.parse({
    id: input.id,
    runId: input.runId,
    type: input.type,
    createdAt: input.createdAt,
    stepId: input.stepId ?? null,
    leaseId: input.leaseId ?? null,
    note: input.note ?? null,
    payload: input.payload ?? null,
  });
}

export function createExecutionRunSharedState(input: {
  id: string;
  runId: string;
  status?: ExecutionRunSharedState['status'];
  artifacts?: ExecutionRunSharedState['artifacts'];
  structuredOutputs?: ExecutionRunSharedState['structuredOutputs'];
  notes?: string[];
  history?: ExecutionRunEvent[];
  lastUpdatedAt: string;
}): ExecutionRunSharedState {
  return ExecutionRunSharedStateSchema.parse({
    id: input.id,
    runId: input.runId,
    status: input.status ?? 'active',
    artifacts: input.artifacts ?? [],
    structuredOutputs: input.structuredOutputs ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    lastUpdatedAt: input.lastUpdatedAt,
  });
}

export function createExecutionRunRecordBundle(input: {
  run: ExecutionRun;
  steps: ExecutionRunStep[];
  sharedState: ExecutionRunSharedState;
  events?: ExecutionRunEvent[];
}): ExecutionRunRecordBundle {
  return ExecutionRunRecordBundleSchema.parse({
    run: input.run,
    steps: input.steps.slice().sort((left, right) => left.order - right.order),
    sharedState: input.sharedState,
    events: input.events ?? [],
    leases: [],
  });
}

export function createExecutionRunRecordBundleFromTeamRun(input: {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  sharedState: TeamRunSharedState;
}): ExecutionRunRecordBundle {
  const steps = input.steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((step) =>
      createExecutionRunStep({
        id: step.id,
        runId: input.teamRun.id,
        sourceStepId: step.id,
        agentId: step.agentId,
        runtimeProfileId: step.runtimeProfileId,
        browserProfileId: step.browserProfileId,
        service: step.service,
        kind: step.kind,
        status: mapTeamRunStepStatusToExecutionStatus(step.status),
        order: step.order,
        dependsOnStepIds: step.dependsOnStepIds,
        input: step.input,
        output: step.output,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        failure: step.failure,
      }),
    );

  const events: ExecutionRunEvent[] = [
    createExecutionRunEvent({
      id: `${input.teamRun.id}:event:run-created`,
      runId: input.teamRun.id,
      type: 'run-created',
      createdAt: input.teamRun.createdAt,
      note: 'projected from team-run planning bundle',
      payload: {
        sourceKind: 'team-run',
        sourceId: input.teamRun.id,
      },
    }),
    ...steps.map((step) =>
      createExecutionRunEvent({
        id: `${input.teamRun.id}:event:${step.id}:planned`,
        runId: input.teamRun.id,
        type: step.status === 'runnable' ? 'step-runnable' : 'step-planned',
        createdAt: input.teamRun.createdAt,
        stepId: step.id,
        note:
          step.status === 'blocked'
            ? 'step is blocked at projection time'
            : 'step projected from team-run planning bundle',
        payload: {
          order: step.order,
          sourceStepId: step.sourceStepId,
          status: step.status,
        },
      }),
    ),
  ];

  const sharedState = createExecutionRunSharedState({
    id: input.sharedState.id,
    runId: input.teamRun.id,
    status: input.sharedState.status,
    artifacts: input.sharedState.artifacts,
    structuredOutputs: input.sharedState.structuredOutputs,
    notes: input.sharedState.notes,
    history: [
      ...events,
      ...input.sharedState.history.map((event) =>
        createExecutionRunEvent({
          id: event.id,
          runId: input.teamRun.id,
          type: event.type === 'handoff-consumed' ? 'note-added' : mapTeamHistoryEventType(event.type),
          createdAt: event.createdAt,
          stepId: event.stepId ?? null,
          note: event.note ?? null,
          payload: event.payload ?? null,
        }),
      ),
    ],
    lastUpdatedAt: input.sharedState.lastUpdatedAt,
  });

  const run = createExecutionRun({
    id: input.teamRun.id,
    sourceKind: 'team-run',
    sourceId: input.teamRun.id,
    status: mapTeamRunStatusToExecutionStatus(input.teamRun.status),
    createdAt: input.teamRun.createdAt,
    updatedAt: input.teamRun.updatedAt,
    trigger: input.teamRun.trigger,
    requestedBy: input.teamRun.requestedBy,
    entryPrompt: input.teamRun.entryPrompt,
    initialInputs: input.teamRun.initialInputs,
    sharedStateId: sharedState.id,
    stepIds: steps.map((step) => step.id),
    policy: input.teamRun.policy,
  });

  return createExecutionRunRecordBundle({
    run,
    steps,
    sharedState,
    events,
  });
}

function mapTeamHistoryEventType(type: TeamRunSharedState['history'][number]['type']): ExecutionRunEvent['type'] {
  switch (type) {
    case 'step-planned':
      return 'step-planned';
    case 'step-started':
      return 'step-started';
    case 'step-succeeded':
      return 'step-succeeded';
    case 'step-failed':
      return 'step-failed';
    case 'handoff-created':
      return 'note-added';
    case 'handoff-consumed':
      return 'note-added';
    case 'artifact-added':
      return 'note-added';
    case 'note-added':
      return 'note-added';
    default:
      return 'note-added';
  }
}
