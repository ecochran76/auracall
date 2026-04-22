import { z } from 'zod';
import type {
  TaskRunSpec,
  TaskRunSpecConstraints,
  TaskRunSpecHumanInteractionPolicy,
  TaskRunSpecInputArtifact,
  TaskRunSpecOverrides,
  TaskRunSpecLocalActionPolicy,
  TaskRunSpecRequestedBy,
  TaskRunSpecRequestedOutput,
  TaskRunSpecTurnPolicy,
  TeamRun,
  TeamRunArtifactRef,
  TeamRunExecutionPolicy,
  TeamRunFailure,
  TeamRunBundle,
  TeamRunHandoff,
  TeamRunHistoryEvent,
  TeamRunLocalActionRequest,
  TeamRunSharedState,
  TeamRunStep,
  TeamRunStepInput,
  TeamRunStepOutput,
  TeamRunStructuredOutput,
} from './types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from './types.js';
import {
  DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY,
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
} from './types.js';

export const TeamRunStatusSchema = z.enum(['planned', 'running', 'succeeded', 'failed', 'cancelled']);

export const TeamRunTriggerSchema = z.enum(['cli', 'service', 'api', 'mcp', 'scheduled', 'internal']);

export const TeamRunExecutionModeSchema = z.enum(['sequential']);

export const TeamRunFailPolicySchema = z.enum(['fail-fast']);

export const TeamRunParallelismModeSchema = z.enum(['disabled']);

export const TeamRunHandoffRequirementSchema = z.enum(['explicit']);

export const TeamRunStepKindSchema = z.enum(['prompt', 'analysis', 'handoff', 'review', 'synthesis']);

export const TeamRunStepStatusSchema = z.enum([
  'planned',
  'ready',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'skipped',
  'cancelled',
]);

export const TeamRunHandoffStatusSchema = z.enum(['prepared', 'delivered', 'consumed', 'failed']);

export const TeamRunLocalActionRequestStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'executed',
  'failed',
  'cancelled',
]);

export const TeamRunSharedStateStatusSchema = z.enum(['active', 'succeeded', 'failed', 'cancelled']);

export const TeamRunHistoryEventTypeSchema = z.enum([
  'step-planned',
  'step-started',
  'step-succeeded',
  'step-failed',
  'handoff-created',
  'handoff-consumed',
  'artifact-added',
  'note-added',
]);

export const TeamRunServiceIdSchema = z.enum(['chatgpt', 'gemini', 'grok']).nullable();

export const TaskRunSpecTriggerSchema = TeamRunTriggerSchema;

export const TaskRunSpecLocalActionModeSchema = z.enum(['forbidden', 'allowed', 'approval-required']);
export const TaskRunSpecLocalActionComplexityStageSchema = z.enum([
  'bounded-command',
  'repo-automation',
  'extended',
]);

export const TaskRunSpecHumanDefaultBehaviorSchema = z.enum(['pause', 'fail', 'continue']);
export const TaskRunSpecRequestedOutputKindSchema = z.enum([
  'final-response',
  'patch',
  'artifact-bundle',
  'review-note',
  'structured-report',
]);
export const TaskRunSpecRequestedOutputFormatSchema = z.enum(['text', 'markdown', 'json', 'diff', 'bundle']);
export const TaskRunSpecRequestedOutputDestinationSchema = z.enum([
  'response-body',
  'artifact-store',
  'handoff',
]);
export const TaskRunSpecInputArtifactKindSchema = z.enum([
  'file',
  'directory',
  'doc',
  'bundle',
  'prior-artifact',
  'url',
]);
export const TaskRunSpecTurnStopStatusSchema = z.enum(['succeeded', 'failed', 'cancelled', 'needs-human']);
export const TaskRunSpecHumanRequiredOnSchema = z.enum(['needs-approval', 'missing-info', 'needs-human']);
export const TaskRunSpecLocalActionResultReportingModeSchema = z.enum([
  'summary-only',
  'summary-and-payload',
]);

export const TaskRunSpecRequestedOutputSchema: z.ZodType<TaskRunSpecRequestedOutput> = z.object({
  kind: TaskRunSpecRequestedOutputKindSchema,
  label: z.string(),
  format: TaskRunSpecRequestedOutputFormatSchema,
  required: z.boolean(),
  schemaHint: z.string().nullable().optional(),
  destination: TaskRunSpecRequestedOutputDestinationSchema,
});

export const TaskRunSpecInputArtifactSchema: z.ZodType<TaskRunSpecInputArtifact> = z.object({
  id: z.string(),
  kind: TaskRunSpecInputArtifactKindSchema,
  title: z.string(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  mediaType: z.string().nullable().optional(),
  notes: z.array(z.string()),
  required: z.boolean(),
});

export const TaskRunSpecTurnPolicySchema: z.ZodType<TaskRunSpecTurnPolicy> = z.object({
  maxTurns: z.number().int().positive().nullable().optional(),
  stopOnStatus: z.array(TaskRunSpecTurnStopStatusSchema),
  allowTeamInitiatedStop: z.boolean(),
  allowHumanEscalation: z.boolean(),
});

export const TaskRunSpecHumanInteractionPolicySchema: z.ZodType<TaskRunSpecHumanInteractionPolicy> = z.object({
  requiredOn: z.array(TaskRunSpecHumanRequiredOnSchema),
  allowClarificationRequests: z.boolean(),
  allowApprovalRequests: z.boolean(),
  defaultBehavior: TaskRunSpecHumanDefaultBehaviorSchema,
});

export const TaskRunSpecLocalActionPolicySchema: z.ZodType<TaskRunSpecLocalActionPolicy> = z.object({
  mode: TaskRunSpecLocalActionModeSchema,
  complexityStage: TaskRunSpecLocalActionComplexityStageSchema,
  allowedActionKinds: z.array(z.string()),
  allowedCommands: z.array(z.string()),
  allowedCwdRoots: z.array(z.string()),
  resultReportingMode: TaskRunSpecLocalActionResultReportingModeSchema,
});

export const TaskRunSpecConstraintsSchema: z.ZodType<TaskRunSpecConstraints> = z.object({
  allowedServices: z.array(TeamRunServiceIdSchema).nullable().optional(),
  blockedServices: z.array(z.enum(['chatgpt', 'gemini', 'grok'])).nullable().optional(),
  maxRuntimeMinutes: z.number().int().positive().nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  providerBudget: z
    .object({
      maxRequests: z.number().int().positive().nullable().optional(),
      maxTokens: z.number().int().positive().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const TaskRunSpecOverridesSchema: z.ZodType<TaskRunSpecOverrides> = z.object({
  runtimeProfileId: z.string().nullable().optional(),
  browserProfileId: z.string().nullable().optional(),
  agentIds: z.array(z.string()).nullable().optional(),
  promptAppend: z.string().nullable().optional(),
  structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TaskRunSpecRequestedBySchema: z.ZodType<TaskRunSpecRequestedBy> = z.object({
  kind: TaskRunSpecTriggerSchema,
  id: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

export const TaskRunSpecSchema: z.ZodType<TaskRunSpec> = z.object({
  id: z.string(),
  teamId: z.string(),
  title: z.string(),
  objective: z.string(),
  successCriteria: z.array(z.string()),
  requestedOutputs: z.array(TaskRunSpecRequestedOutputSchema),
  inputArtifacts: z.array(TaskRunSpecInputArtifactSchema),
  context: z.record(z.string(), z.unknown()),
  constraints: TaskRunSpecConstraintsSchema,
  overrides: TaskRunSpecOverridesSchema,
  turnPolicy: TaskRunSpecTurnPolicySchema,
  humanInteractionPolicy: TaskRunSpecHumanInteractionPolicySchema,
  localActionPolicy: TaskRunSpecLocalActionPolicySchema,
  requestedBy: TaskRunSpecRequestedBySchema.nullable(),
  trigger: TaskRunSpecTriggerSchema,
  createdAt: z.string(),
});

export const TeamRunExecutionPolicySchema: z.ZodType<TeamRunExecutionPolicy> = z.object({
  executionMode: TeamRunExecutionModeSchema,
  failPolicy: TeamRunFailPolicySchema,
  parallelismMode: TeamRunParallelismModeSchema,
  handoffRequirement: TeamRunHandoffRequirementSchema,
});

export const TeamRunArtifactRefSchema: z.ZodType<TeamRunArtifactRef> = z.object({
  id: z.string(),
  kind: z.string(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

export const TeamRunStructuredOutputSchema: z.ZodType<TeamRunStructuredOutput> = z.object({
  key: z.string(),
  value: z.unknown(),
});

export const TeamRunFailureSchema: z.ZodType<TeamRunFailure> = z.object({
  code: z.string(),
  message: z.string(),
  ownerStepId: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TeamRunStepInputSchema: z.ZodType<TeamRunStepInput> = z.object({
  prompt: z.string().nullable().optional(),
  handoffIds: z.array(z.string()),
  artifacts: z.array(TeamRunArtifactRefSchema),
  structuredData: z.record(z.string(), z.unknown()),
  notes: z.array(z.string()),
});

export const TeamRunStepOutputSchema: z.ZodType<TeamRunStepOutput> = z.object({
  summary: z.string().nullable().optional(),
  artifacts: z.array(TeamRunArtifactRefSchema),
  structuredData: z.record(z.string(), z.unknown()),
  notes: z.array(z.string()),
});

export const TeamRunSchema: z.ZodType<TeamRun> = z.object({
  id: z.string(),
  teamId: z.string(),
  taskRunSpecId: z.string().nullable().optional(),
  status: TeamRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  trigger: TeamRunTriggerSchema,
  requestedBy: z.string().nullable(),
  entryPrompt: z.string().nullable(),
  initialInputs: z.record(z.string(), z.unknown()),
  sharedStateId: z.string(),
  stepIds: z.array(z.string()),
  policy: TeamRunExecutionPolicySchema,
});

export const TeamRunStepSchema: z.ZodType<TeamRunStep> = z.object({
  id: z.string(),
  teamRunId: z.string(),
  agentId: z.string(),
  runtimeProfileId: z.string().nullable(),
  browserProfileId: z.string().nullable(),
  service: TeamRunServiceIdSchema,
  kind: TeamRunStepKindSchema,
  status: TeamRunStepStatusSchema,
  order: z.number().int(),
  dependsOnStepIds: z.array(z.string()),
  input: TeamRunStepInputSchema,
  output: TeamRunStepOutputSchema.nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  failure: TeamRunFailureSchema.nullable(),
});

export const TeamRunHandoffSchema: z.ZodType<TeamRunHandoff> = z.object({
  id: z.string(),
  teamRunId: z.string(),
  fromStepId: z.string(),
  toStepId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  summary: z.string(),
  artifacts: z.array(TeamRunArtifactRefSchema),
  structuredData: z.record(z.string(), z.unknown()),
  notes: z.array(z.string()),
  status: TeamRunHandoffStatusSchema,
  createdAt: z.string(),
});

export const TeamRunLocalActionRequestSchema: z.ZodType<TeamRunLocalActionRequest> = z.object({
  id: z.string(),
  teamRunId: z.string(),
  ownerStepId: z.string(),
  kind: z.string(),
  summary: z.string(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()),
  structuredPayload: z.record(z.string(), z.unknown()),
  notes: z.array(z.string()),
  status: TeamRunLocalActionRequestStatusSchema,
  createdAt: z.string(),
  approvedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  resultSummary: z.string().nullable().optional(),
  resultPayload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TeamRunHistoryEventSchema: z.ZodType<TeamRunHistoryEvent> = z.object({
  id: z.string(),
  teamRunId: z.string(),
  type: TeamRunHistoryEventTypeSchema,
  createdAt: z.string(),
  stepId: z.string().nullable().optional(),
  handoffId: z.string().nullable().optional(),
  artifactId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TeamRunSharedStateSchema: z.ZodType<TeamRunSharedState> = z.object({
  id: z.string(),
  teamRunId: z.string(),
  status: TeamRunSharedStateStatusSchema,
  artifacts: z.array(TeamRunArtifactRefSchema),
  structuredOutputs: z.array(TeamRunStructuredOutputSchema),
  notes: z.array(z.string()),
  history: z.array(TeamRunHistoryEventSchema),
  lastUpdatedAt: z.string(),
});

export const TeamRunBundleSchema: z.ZodType<TeamRunBundle> = z.object({
  teamRun: TeamRunSchema,
  steps: z.array(TeamRunStepSchema),
  handoffs: z.array(TeamRunHandoffSchema),
  localActionRequests: z.array(TeamRunLocalActionRequestSchema),
  sharedState: TeamRunSharedStateSchema,
});

export const DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA = TeamRunExecutionPolicySchema.parse(
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
);

export const DEFAULT_TASK_RUN_SPEC_TURN_POLICY_SCHEMA = TaskRunSpecTurnPolicySchema.parse(
  DEFAULT_TASK_RUN_SPEC_TURN_POLICY,
);

export const DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY_SCHEMA =
  TaskRunSpecHumanInteractionPolicySchema.parse(DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY);

export const DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY_SCHEMA =
  TaskRunSpecLocalActionPolicySchema.parse(DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY);
