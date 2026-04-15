import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY_SCHEMA,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY_SCHEMA,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY_SCHEMA,
  TeamRunBundleSchema,
  TeamRunLocalActionRequestSchema,
  TeamRunSchema,
  TeamRunSharedStateSchema,
  TeamRunStepSchema,
  TaskRunSpecSchema,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA,
} from './schema.js';
import {
  getTeam,
  resolveRuntimeSelection,
  resolveTeamRuntimeSelections,
  type ResolvedTeamRuntimeSelections,
} from '../config/model.js';
import { TeamConfigSchema } from '../schema/types.js';
import type {
  TaskRunSpec,
  TeamRun,
  TeamRunBundle,
  TeamRunHandoff,
  TeamRunLocalActionRequest,
  TeamRunSharedState,
  TeamRunStep,
  TeamRunServiceId,
  TeamRunStepInput,
  TeamRunStepKind,
  TeamRunStepStatus,
} from './types.js';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
} from './types.js';

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
  taskRunSpecId?: string | null;
  sharedStateId?: string;
  createdAt: string;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
  entryPrompt?: string | null;
  initialInputs?: Record<string, unknown>;
  steps: CreateTeamRunStepInput[];
  handoffs?: TeamRunHandoff[];
  localActionRequests?: TeamRunLocalActionRequest[];
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

export interface CreateTeamRunFromResolvedTeamTaskRunSpecInput {
  runId: string;
  createdAt: string;
  team: ResolvedTeamRuntimeSelections;
  taskRunSpec: TaskRunSpec;
  teamConfig?: Record<string, unknown> | null;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
}

interface TeamRolePlanningConfig {
  roleId: string;
  agentId: string;
  order: number;
  instructions: string | null;
  responseShape: Record<string, unknown> | null;
  stepKind: TeamRunStepKind | null;
  handoffToRoleId: string | null;
}

interface EffectiveTaskRunSpecExecutionSelection {
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: TeamRunServiceId;
  reason: string | null;
}

export interface CreateTaskRunSpecInput {
  id: string;
  teamId: string;
  title: string;
  objective: string;
  createdAt: string;
  successCriteria?: string[];
  requestedOutputs?: TaskRunSpec['requestedOutputs'];
  inputArtifacts?: TaskRunSpec['inputArtifacts'];
  context?: Record<string, unknown>;
  constraints?: TaskRunSpec['constraints'];
  overrides?: TaskRunSpec['overrides'];
  turnPolicy?: Partial<TaskRunSpec['turnPolicy']>;
  humanInteractionPolicy?: Partial<TaskRunSpec['humanInteractionPolicy']>;
  localActionPolicy?: Partial<TaskRunSpec['localActionPolicy']>;
  requestedBy?: TaskRunSpec['requestedBy'];
  trigger?: TaskRunSpec['trigger'];
}

export interface CreateTeamRunLocalActionRequestInput {
  id: string;
  teamRunId: string;
  ownerStepId: string;
  kind: string;
  summary: string;
  command?: string | null;
  args?: string[];
  structuredPayload?: Record<string, unknown>;
  notes?: string[];
  status?: TeamRunLocalActionRequest['status'];
  createdAt: string;
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

function mapTaskArtifactToTeamArtifactRef(
  artifact: TaskRunSpec['inputArtifacts'][number],
): TeamRunStepInput['artifacts'][number] {
  return {
    id: artifact.id,
    kind: artifact.kind,
    path: artifact.path ?? null,
    uri: artifact.uri ?? null,
    title: artifact.title ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildTaskRunSpecRequestedOutputs(
  input: TaskRunSpec['requestedOutputs'] = [],
): TaskRunSpec['requestedOutputs'] {
  return input.map((output) => ({
    kind: output.kind,
    label: output.label,
    format: output.format,
    required: output.required,
    schemaHint: output.schemaHint ?? null,
    destination: output.destination,
  }));
}

function buildTaskRunSpecInputArtifacts(
  input: TaskRunSpec['inputArtifacts'] = [],
): TaskRunSpec['inputArtifacts'] {
  return input.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title ?? artifact.path ?? artifact.uri ?? artifact.id,
    path: artifact.path ?? null,
    uri: artifact.uri ?? null,
    mediaType: artifact.mediaType ?? null,
    notes: artifact.notes ?? [],
    required: artifact.required ?? true,
  }));
}

function buildTaskRunSpecTurnPolicy(
  input: Partial<TaskRunSpec['turnPolicy']> = {},
): TaskRunSpec['turnPolicy'] {
  return {
    maxTurns: input.maxTurns ?? DEFAULT_TASK_RUN_SPEC_TURN_POLICY.maxTurns,
    stopOnStatus: input.stopOnStatus ?? DEFAULT_TASK_RUN_SPEC_TURN_POLICY.stopOnStatus,
    allowTeamInitiatedStop:
      input.allowTeamInitiatedStop ?? DEFAULT_TASK_RUN_SPEC_TURN_POLICY.allowTeamInitiatedStop,
    allowHumanEscalation:
      input.allowHumanEscalation ?? DEFAULT_TASK_RUN_SPEC_TURN_POLICY.allowHumanEscalation,
  };
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join('; ') : '(none)';
}

function formatRequestedOutputs(outputs: TaskRunSpec['requestedOutputs']): string {
  if (outputs.length === 0) return '(none)';
  return outputs
    .map((output) => {
      const format = output.format ? ` format=${output.format}` : '';
      const required = output.required ? ' required' : ' optional';
      return `${output.label} [${output.kind}${format}${required} destination=${output.destination}]`;
    })
    .join('; ');
}

function formatInputArtifacts(artifacts: TaskRunSpec['inputArtifacts']): string {
  if (artifacts.length === 0) return '(none)';
  return artifacts
    .map((artifact) => artifact.title ?? artifact.path ?? artifact.uri ?? artifact.id)
    .join('; ');
}

function readTaskTransferContract(
  step: TeamRunStep | undefined,
): {
  title: string | null;
  objective: string | null;
  successCriteria: string[];
  requestedOutputs: Array<{
    label: string | null;
    kind: string | null;
    destination: string | null;
    required: boolean;
  }>;
  inputArtifacts: Array<{
    id: string | null;
    kind: string | null;
    title: string | null;
    path: string | null;
    uri: string | null;
  }>;
} | null {
  if (!step) {
    return null;
  }

  const structuredData = isRecord(step.input.structuredData) ? step.input.structuredData : null;
  if (!structuredData) {
    return null;
  }

  const title = typeof structuredData.taskTitle === 'string' ? structuredData.taskTitle : null;
  const objective = typeof structuredData.taskObjective === 'string' ? structuredData.taskObjective : null;
  const successCriteria = Array.isArray(structuredData.successCriteria)
    ? structuredData.successCriteria.filter((value): value is string => typeof value === 'string')
    : [];
  const requestedOutputs = Array.isArray(structuredData.requestedOutputs)
    ? structuredData.requestedOutputs.map((output) => {
        const candidate = isRecord(output) ? output : {};
        return {
          label: typeof candidate.label === 'string' ? candidate.label : null,
          kind: typeof candidate.kind === 'string' ? candidate.kind : null,
          destination: typeof candidate.destination === 'string' ? candidate.destination : null,
          required: candidate.required === true,
        };
      })
    : [];
  const inputArtifacts = step.input.artifacts.map((artifact) => ({
    id: typeof artifact.id === 'string' ? artifact.id : null,
    kind: typeof artifact.kind === 'string' ? artifact.kind : null,
    title: typeof artifact.title === 'string' ? artifact.title : null,
    path: typeof artifact.path === 'string' ? artifact.path : null,
    uri: typeof artifact.uri === 'string' ? artifact.uri : null,
  }));

  if (!title && !objective && successCriteria.length === 0 && requestedOutputs.length === 0 && inputArtifacts.length === 0) {
    return null;
  }

  return {
    title,
    objective,
    successCriteria,
    requestedOutputs,
    inputArtifacts,
  };
}

function inferStepKindForTaskRunSpec(input: {
  index: number;
  total: number;
  taskRunSpec: TaskRunSpec;
}): TeamRunStepKind {
  if (input.total <= 1) {
    return input.taskRunSpec.requestedOutputs.length > 0 ? 'synthesis' : 'analysis';
  }
  if (input.index === 0) {
    return 'analysis';
  }
  if (input.index === input.total - 1) {
    return 'synthesis';
  }
  return 'review';
}

function parseTeamRolePlanningConfigs(
  teamConfig: Record<string, unknown> | null | undefined,
): TeamRolePlanningConfig[] {
  if (!teamConfig) {
    return [];
  }
  const parsed = TeamConfigSchema.safeParse(teamConfig);
  if (!parsed.success || !parsed.data.roles) {
    return [];
  }

  return Object.entries(parsed.data.roles)
    .map(([roleId, role]) => ({
      roleId,
      agentId: role.agent,
      order: role.order ?? Number.MAX_SAFE_INTEGER,
      instructions: role.instructions ?? null,
      responseShape: role.responseShape ?? null,
      stepKind: role.stepKind ?? null,
      handoffToRoleId: role.handoffToRole ?? null,
    }))
    .sort((left, right) => left.order - right.order || left.roleId.localeCompare(right.roleId));
}

function buildTaskRunSpecPrompt(input: {
  taskRunSpec: TaskRunSpec;
  index: number;
  total: number;
  teamInstructions?: string | null;
  roleInstructions?: string | null;
  responseShape?: Record<string, unknown> | null;
}): string {
  const roleNote =
    input.total <= 1
      ? 'Execute this assignment and produce the requested outputs.'
      : input.index === 0
        ? 'Analyze the assignment, frame the work clearly, and prepare the next member handoff.'
        : input.index === input.total - 1
          ? 'Use prior team state to produce the final requested outputs for this assignment.'
          : 'Continue the assignment using prior team state and produce a handoff-ready update.';

  const lines = [
    `Assignment: ${input.taskRunSpec.title}`,
    `Objective: ${input.taskRunSpec.objective}`,
    `Success criteria: ${formatList(input.taskRunSpec.successCriteria)}`,
    `Requested outputs: ${formatRequestedOutputs(input.taskRunSpec.requestedOutputs)}`,
    `Input artifacts: ${formatInputArtifacts(input.taskRunSpec.inputArtifacts)}`,
    `Role guidance: ${roleNote}`,
  ];

  if (input.teamInstructions) {
    lines.push(`Team instructions: ${input.teamInstructions}`);
  }
  if (input.roleInstructions) {
    lines.push(`Role instructions: ${input.roleInstructions}`);
  }
  if (input.responseShape && Object.keys(input.responseShape).length > 0) {
    lines.push(`Response shape hint: ${JSON.stringify(input.responseShape)}`);
  }
  if (input.taskRunSpec.overrides.promptAppend) {
    lines.push(`Task override: ${input.taskRunSpec.overrides.promptAppend}`);
  }
  return lines.join('\n');
}

function buildTaskRunSpecAgentFilter(taskRunSpec: TaskRunSpec): Set<string> | null {
  const agentIds = taskRunSpec.overrides.agentIds?.filter((agentId) => agentId.trim().length > 0) ?? [];
  return agentIds.length > 0 ? new Set(agentIds) : null;
}

function resolveTaskRunSpecExecutionSelection(input: {
  config?: Record<string, unknown> | null;
  taskRunSpec: TaskRunSpec;
  agentId: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: TeamRunServiceId;
}): EffectiveTaskRunSpecExecutionSelection {
  const requestedRuntimeProfileId = input.taskRunSpec.overrides.runtimeProfileId;
  const requestedBrowserProfileId = input.taskRunSpec.overrides.browserProfileId;
  const agentId = typeof input.agentId === 'string' && input.agentId.trim().length > 0 ? input.agentId : null;

  if (requestedRuntimeProfileId && input.config) {
    const overrideSelection = resolveRuntimeSelection(input.config, {
      explicitProfileName: requestedRuntimeProfileId,
      explicitAgentId: agentId,
    });
    if (!overrideSelection.runtimeProfileId) {
      return {
        runtimeProfileId: null,
        browserProfileId: null,
        service: null,
        reason: `blocked because taskRunSpec runtimeProfileId could not resolve (${requestedRuntimeProfileId})`,
      };
    }
    if (requestedBrowserProfileId && overrideSelection.browserProfileId !== requestedBrowserProfileId) {
      return {
        runtimeProfileId: overrideSelection.runtimeProfileId,
        browserProfileId: overrideSelection.browserProfileId,
        service: overrideSelection.defaultService,
        reason:
          `blocked because taskRunSpec browserProfileId (${requestedBrowserProfileId}) ` +
          `does not match the selected runtime profile browser profile (${overrideSelection.browserProfileId ?? 'none'})`,
      };
    }
    return {
      runtimeProfileId: overrideSelection.runtimeProfileId,
      browserProfileId: overrideSelection.browserProfileId,
      service: overrideSelection.defaultService,
      reason: null,
    };
  }

  if (requestedRuntimeProfileId && input.runtimeProfileId !== requestedRuntimeProfileId) {
    return {
      runtimeProfileId: input.runtimeProfileId,
      browserProfileId: input.browserProfileId,
      service: input.service,
      reason:
        `blocked because resolved team selection does not match taskRunSpec runtimeProfileId (${requestedRuntimeProfileId})`,
    };
  }

  if (requestedBrowserProfileId && input.browserProfileId !== requestedBrowserProfileId) {
    return {
      runtimeProfileId: input.runtimeProfileId,
      browserProfileId: input.browserProfileId,
      service: input.service,
      reason:
        `blocked because resolved team selection does not match taskRunSpec browserProfileId (${requestedBrowserProfileId})`,
    };
  }

  return {
    runtimeProfileId: input.runtimeProfileId,
    browserProfileId: input.browserProfileId,
    service: input.service,
    reason: null,
  };
}

function isTaskRunSpecServiceAllowed(input: {
  taskRunSpec: TaskRunSpec;
  service: TeamRunServiceId;
}): { allowed: boolean; reason: string | null } {
  const { allowedServices, blockedServices } = input.taskRunSpec.constraints;
  if (Array.isArray(allowedServices) && allowedServices.length > 0 && !allowedServices.includes(input.service)) {
    return {
      allowed: false,
      reason: `blocked because taskRunSpec allowedServices excludes the selected service${input.service ? ` (${input.service})` : ' (none)'}`,
    };
  }
  if (input.service && Array.isArray(blockedServices) && blockedServices.includes(input.service)) {
    return {
      allowed: false,
      reason: `blocked because taskRunSpec blockedServices excludes the selected service (${input.service})`,
    };
  }
  return {
    allowed: true,
    reason: null,
  };
}

function buildRoleAwareTeamRunStepsFromTaskRunSpec(input: {
  runId: string;
  team: ResolvedTeamRuntimeSelections;
  taskRunSpec: TaskRunSpec;
  teamConfig?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
}): CreateTeamRunStepInput[] {
  const selectedAgentIds = buildTaskRunSpecAgentFilter(input.taskRunSpec);
  const roles = parseTeamRolePlanningConfigs(input.teamConfig).filter((role) =>
    selectedAgentIds ? selectedAgentIds.has(role.agentId) : true,
  );
  if (roles.length === 0) {
    return [];
  }
  const membersByAgentId = new Map(
    input.team.members.map((member) => [member.agentId ?? '', member]),
  );
  const teamInstructions =
    isRecord(input.teamConfig) && typeof input.teamConfig.instructions === 'string'
      ? input.teamConfig.instructions
      : null;

  return roles.map((role, index) => {
    const member = membersByAgentId.get(role.agentId);
    const stepId = `${input.runId}:step:${index + 1}`;
    const previousStepId = index > 0 ? `${input.runId}:step:${index}` : null;
    const executionSelection = resolveTaskRunSpecExecutionSelection({
      config: input.config,
      taskRunSpec: input.taskRunSpec,
      agentId: role.agentId,
      runtimeProfileId: member?.runtimeProfileId ?? null,
      browserProfileId: member?.browserProfileId ?? null,
      service: member?.defaultService ?? null,
    });
    const service = executionSelection.service;
    const hasRuntimeContext = Boolean(member?.exists && executionSelection.runtimeProfileId);
    const serviceConstraint = isTaskRunSpecServiceAllowed({
      taskRunSpec: input.taskRunSpec,
      service,
    });
    const isRunnable = hasRuntimeContext && !executionSelection.reason && serviceConstraint.allowed;
    return {
      id: stepId,
      agentId: role.agentId,
      runtimeProfileId: executionSelection.runtimeProfileId,
      browserProfileId: executionSelection.browserProfileId,
      service,
      kind:
        role.stepKind ??
        inferStepKindForTaskRunSpec({
          index,
          total: roles.length,
          taskRunSpec: input.taskRunSpec,
        }),
      status: isRunnable ? 'planned' : 'blocked',
      order: index + 1,
      dependsOnStepIds: previousStepId ? [previousStepId] : [],
      input: {
        prompt: isRunnable
          ? buildTaskRunSpecPrompt({
              taskRunSpec: input.taskRunSpec,
              index,
              total: roles.length,
              teamInstructions,
              roleInstructions: role.instructions,
              responseShape: role.responseShape,
            })
          : null,
        artifacts: input.taskRunSpec.inputArtifacts.map(mapTaskArtifactToTeamArtifactRef),
        structuredData: {
          taskRunSpecId: input.taskRunSpec.id,
          taskTitle: input.taskRunSpec.title,
          taskObjective: input.taskRunSpec.objective,
          taskContext: input.taskRunSpec.context,
          successCriteria: input.taskRunSpec.successCriteria,
          requestedOutputs: input.taskRunSpec.requestedOutputs,
          constraints: input.taskRunSpec.constraints,
          overrides: input.taskRunSpec.overrides,
          turnPolicy: input.taskRunSpec.turnPolicy,
          humanInteractionPolicy: input.taskRunSpec.humanInteractionPolicy,
          localActionPolicy: input.taskRunSpec.localActionPolicy,
          taskOverrideStructuredContext: input.taskRunSpec.overrides.structuredContext,
          roleId: role.roleId,
          roleInstructions: role.instructions,
          responseShape: role.responseShape,
          handoffToRoleId: role.handoffToRoleId,
        },
        notes: [
          isRunnable
            ? 'planned from resolved team runtime selection, team role config, and taskRunSpec'
            : executionSelection.reason ??
              serviceConstraint.reason ??
              'blocked because the member does not resolve to a runnable runtime profile',
        ],
      },
    };
  });
}

function buildTeamRunStepsFromTaskRunSpec(input: {
  runId: string;
  team: ResolvedTeamRuntimeSelections;
  taskRunSpec: TaskRunSpec;
  config?: Record<string, unknown> | null;
}): CreateTeamRunStepInput[] {
  const selectedAgentIds = buildTaskRunSpecAgentFilter(input.taskRunSpec);
  const members = input.team.members.filter((member) =>
    selectedAgentIds ? typeof member.agentId === 'string' && selectedAgentIds.has(member.agentId) : true,
  );
  return members.map((member, index) => {
    const stepId = `${input.runId}:step:${index + 1}`;
    const previousStepId = index > 0 ? `${input.runId}:step:${index}` : null;
    const executionSelection = resolveTaskRunSpecExecutionSelection({
      config: input.config,
      taskRunSpec: input.taskRunSpec,
      agentId: member.agentId,
      runtimeProfileId: member.runtimeProfileId,
      browserProfileId: member.browserProfileId,
      service: member.defaultService,
    });
    const hasRuntimeContext = member.exists && executionSelection.runtimeProfileId;
    const serviceConstraint = isTaskRunSpecServiceAllowed({
      taskRunSpec: input.taskRunSpec,
      service: executionSelection.service,
    });
    const isRunnable = hasRuntimeContext && !executionSelection.reason && serviceConstraint.allowed;
    const total = members.length;
    return {
      id: stepId,
      agentId: member.agentId ?? `member-${index + 1}`,
      runtimeProfileId: executionSelection.runtimeProfileId,
      browserProfileId: executionSelection.browserProfileId,
      service: executionSelection.service,
      kind: inferStepKindForTaskRunSpec({
        index,
        total,
        taskRunSpec: input.taskRunSpec,
      }),
      status: isRunnable ? 'planned' : 'blocked',
      order: index + 1,
      dependsOnStepIds: previousStepId ? [previousStepId] : [],
      input: {
        prompt: isRunnable
          ? buildTaskRunSpecPrompt({
              taskRunSpec: input.taskRunSpec,
              index,
              total,
            })
          : null,
        artifacts: input.taskRunSpec.inputArtifacts.map(mapTaskArtifactToTeamArtifactRef),
        structuredData: {
          taskRunSpecId: input.taskRunSpec.id,
          taskTitle: input.taskRunSpec.title,
          taskObjective: input.taskRunSpec.objective,
          taskContext: input.taskRunSpec.context,
          successCriteria: input.taskRunSpec.successCriteria,
          requestedOutputs: input.taskRunSpec.requestedOutputs,
          constraints: input.taskRunSpec.constraints,
          overrides: input.taskRunSpec.overrides,
          turnPolicy: input.taskRunSpec.turnPolicy,
          humanInteractionPolicy: input.taskRunSpec.humanInteractionPolicy,
          localActionPolicy: input.taskRunSpec.localActionPolicy,
          taskOverrideStructuredContext: input.taskRunSpec.overrides.structuredContext,
        },
        notes: [
          isRunnable
            ? 'planned from resolved team runtime selection and taskRunSpec'
            : executionSelection.reason ??
              serviceConstraint.reason ??
              'blocked because the member does not resolve to a runnable runtime profile',
        ],
      },
    };
  });
}

export function createPlannedTeamRunHandoffs(input: {
  teamRun: TeamRun;
  steps: TeamRunStep[];
}): TeamRunHandoff[] {
  const stepIds = new Set(input.steps.map((step) => step.id));
  return input.steps.flatMap((step) => {
    const targets = step.dependsOnStepIds
      .filter((dependencyStepId) => stepIds.has(dependencyStepId))
      .map((dependencyStepId) => ({ fromStepId: dependencyStepId, toStepId: step.id }));

    return targets.map(({ fromStepId, toStepId }, index) => {
      const fromStep = input.steps.find((candidate) => candidate.id === fromStepId);
      const taskTransfer = readTaskTransferContract(fromStep);
      const roleTarget =
        typeof step.input.structuredData.handoffToRoleId === 'string'
          ? ` -> ${step.input.structuredData.handoffToRoleId}`
          : '';
      return {
        id: `${input.teamRun.id}:handoff:${toStepId}:${index + 1}`,
        teamRunId: input.teamRun.id,
        fromStepId,
        toStepId,
        fromAgentId: fromStep?.agentId ?? '(unknown)',
        toAgentId: step.agentId,
        summary: `Planned handoff for ${input.teamRun.id}${roleTarget}`.trim(),
        artifacts: [],
        structuredData: {
          taskRunSpecId: input.teamRun.taskRunSpecId ?? null,
          toRoleId:
            typeof step.input.structuredData.roleId === 'string'
              ? step.input.structuredData.roleId
              : null,
          ...(taskTransfer ? { taskTransfer } : {}),
        },
        notes: ['planned handoff derived from team step dependencies'],
        status: 'prepared',
        createdAt: input.teamRun.createdAt,
      };
    });
  });
}

function buildTaskRunSpecHumanInteractionPolicy(
  input: Partial<TaskRunSpec['humanInteractionPolicy']> = {},
): TaskRunSpec['humanInteractionPolicy'] {
  return {
    requiredOn: input.requiredOn ?? DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY.requiredOn,
    allowClarificationRequests:
      input.allowClarificationRequests ??
      DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY.allowClarificationRequests,
    allowApprovalRequests:
      input.allowApprovalRequests ?? DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY.allowApprovalRequests,
    defaultBehavior:
      input.defaultBehavior ?? DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY.defaultBehavior,
  };
}

function buildTaskRunSpecLocalActionPolicy(
  input: Partial<TaskRunSpec['localActionPolicy']> = {},
): TaskRunSpec['localActionPolicy'] {
  return {
    mode: input.mode ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.mode,
    complexityStage:
      input.complexityStage ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.complexityStage,
    allowedActionKinds:
      input.allowedActionKinds ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.allowedActionKinds,
    allowedCommands:
      input.allowedCommands ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.allowedCommands,
    allowedCwdRoots:
      input.allowedCwdRoots ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.allowedCwdRoots,
    resultReportingMode:
      input.resultReportingMode ?? DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY.resultReportingMode,
  };
}

function buildTaskRunSpecConstraints(
  input: TaskRunSpec['constraints'] = {},
): TaskRunSpec['constraints'] {
  return {
    allowedServices: input.allowedServices ?? null,
    blockedServices: input.blockedServices ?? null,
    maxRuntimeMinutes: input.maxRuntimeMinutes ?? null,
    maxTurns: input.maxTurns ?? null,
    providerBudget: input.providerBudget
      ? {
          maxRequests: input.providerBudget.maxRequests ?? null,
          maxTokens: input.providerBudget.maxTokens ?? null,
        }
      : null,
  };
}

function buildTaskRunSpecOverrides(
  input: TaskRunSpec['overrides'] = {},
): TaskRunSpec['overrides'] {
  return {
    runtimeProfileId: input.runtimeProfileId ?? null,
    browserProfileId: input.browserProfileId ?? null,
    agentIds: input.agentIds ?? null,
    promptAppend: input.promptAppend ?? null,
    structuredContext: input.structuredContext ?? null,
  };
}

function buildTaskRunSpecRequestedBy(
  input: TaskRunSpec['requestedBy'] = null,
): TaskRunSpec['requestedBy'] {
  if (!input) {
    return null;
  }
  return {
    kind: input.kind,
    id: input.id ?? null,
    label: input.label ?? null,
  };
}

function projectTaskRunSpecRequestedByToTeamRunRequestedBy(
  input: TaskRunSpec['requestedBy'],
): string | null {
  if (!input) {
    return null;
  }
  return input.label ?? input.id ?? input.kind;
}

export function createTaskRunSpec(input: CreateTaskRunSpecInput): TaskRunSpec {
  return TaskRunSpecSchema.parse({
    id: input.id,
    teamId: input.teamId,
    title: input.title,
    objective: input.objective,
    successCriteria: input.successCriteria ?? [],
    requestedOutputs: buildTaskRunSpecRequestedOutputs(input.requestedOutputs),
    inputArtifacts: buildTaskRunSpecInputArtifacts(input.inputArtifacts),
    context: input.context ?? {},
    constraints: buildTaskRunSpecConstraints(input.constraints),
    overrides: buildTaskRunSpecOverrides(input.overrides),
    turnPolicy: buildTaskRunSpecTurnPolicy(input.turnPolicy),
    humanInteractionPolicy: buildTaskRunSpecHumanInteractionPolicy(input.humanInteractionPolicy),
    localActionPolicy: buildTaskRunSpecLocalActionPolicy(input.localActionPolicy),
    requestedBy: buildTaskRunSpecRequestedBy(input.requestedBy),
    trigger: input.trigger ?? 'service',
    createdAt: input.createdAt,
  });
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

export function createTeamRunLocalActionRequest(
  input: CreateTeamRunLocalActionRequestInput,
): TeamRunLocalActionRequest {
  return TeamRunLocalActionRequestSchema.parse({
    id: input.id,
    teamRunId: input.teamRunId,
    ownerStepId: input.ownerStepId,
    kind: input.kind,
    summary: input.summary,
    command: input.command ?? null,
    args: input.args ?? [],
    structuredPayload: input.structuredPayload ?? {},
    notes: input.notes ?? [],
    status: input.status ?? 'requested',
    createdAt: input.createdAt,
    approvedAt: null,
    completedAt: null,
    resultSummary: null,
    resultPayload: null,
  });
}

export function createTeamRunBundleFromResolvedTeam(
  input: CreateTeamRunFromResolvedTeamInput,
): TeamRunBundle {
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

export function createTeamRunBundleFromResolvedTeamTaskRunSpec(
  input: CreateTeamRunFromResolvedTeamTaskRunSpecInput,
): TeamRunBundle {
  const roleAwareSteps = buildRoleAwareTeamRunStepsFromTaskRunSpec({
    runId: input.runId,
    team: input.team,
    taskRunSpec: input.taskRunSpec,
    teamConfig: input.teamConfig,
  });
  return createTeamRunBundle({
    runId: input.runId,
    teamId: input.team.teamId ?? '(none)',
    taskRunSpecId: input.taskRunSpec.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    trigger: input.trigger ?? input.taskRunSpec.trigger,
    requestedBy: input.requestedBy ?? projectTaskRunSpecRequestedByToTeamRunRequestedBy(input.taskRunSpec.requestedBy),
    entryPrompt: input.taskRunSpec.objective,
    initialInputs: {
      selectedTeamId: input.team.teamId,
      teamExists: input.team.exists,
      taskRunSpecTitle: input.taskRunSpec.title,
    },
    steps:
      roleAwareSteps.length > 0
        ? roleAwareSteps
        : buildTeamRunStepsFromTaskRunSpec({
            runId: input.runId,
            team: input.team,
            taskRunSpec: input.taskRunSpec,
            config: null,
          }),
  });
}

export function createTeamRunBundleFromConfigTaskRunSpec(input: {
  config: Record<string, unknown>;
  teamId: string;
  runId: string;
  createdAt: string;
  taskRunSpec: TaskRunSpec;
  updatedAt?: string;
  trigger?: TeamRun['trigger'];
  requestedBy?: string | null;
}): TeamRunBundle {
  const resolvedTeam = resolveTeamRuntimeSelections(input.config, input.teamId);
  const teamConfig = getTeam(input.config, input.teamId);
  const roleAwareSteps = buildRoleAwareTeamRunStepsFromTaskRunSpec({
    runId: input.runId,
    team: resolvedTeam,
    taskRunSpec: input.taskRunSpec,
    teamConfig,
    config: input.config,
  });
  return createTeamRunBundle({
    runId: input.runId,
    teamId: resolvedTeam.teamId ?? '(none)',
    taskRunSpecId: input.taskRunSpec.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    trigger: input.trigger ?? input.taskRunSpec.trigger,
    requestedBy: input.requestedBy ?? projectTaskRunSpecRequestedByToTeamRunRequestedBy(input.taskRunSpec.requestedBy),
    entryPrompt: input.taskRunSpec.objective,
    initialInputs: {
      selectedTeamId: resolvedTeam.teamId,
      teamExists: resolvedTeam.exists,
      taskRunSpecTitle: input.taskRunSpec.title,
    },
    steps:
      roleAwareSteps.length > 0
        ? roleAwareSteps
        : buildTeamRunStepsFromTaskRunSpec({
            runId: input.runId,
            team: resolvedTeam,
            taskRunSpec: input.taskRunSpec,
            config: input.config,
          }),
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
}): TeamRunBundle {
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

export function createTeamRunBundle(input: CreateTeamRunBundleInput): TeamRunBundle {
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
    taskRunSpecId: input.taskRunSpecId ?? null,
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

  const handoffs =
    input.handoffs?.map((handoff) => ({
      ...handoff,
      teamRunId: teamRun.id,
    })) ??
    createPlannedTeamRunHandoffs({
      teamRun,
      steps,
    });

  const localActionRequests = (input.localActionRequests ?? []).map((request) =>
    createTeamRunLocalActionRequest({
      ...request,
      teamRunId: teamRun.id,
    }),
  );

  return TeamRunBundleSchema.parse({
    teamRun,
    steps,
    handoffs,
    localActionRequests,
    sharedState,
  });
}

export { DEFAULT_TEAM_RUN_EXECUTION_POLICY };
export {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
};
