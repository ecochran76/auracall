import { z } from 'zod';
import type {
  TeamRun,
  TeamRunArtifactRef,
  TeamRunExecutionPolicy,
  TeamRunFailure,
  TeamRunHandoff,
  TeamRunHistoryEvent,
  TeamRunSharedState,
  TeamRunStep,
  TeamRunStepInput,
  TeamRunStepOutput,
  TeamRunStructuredOutput,
} from './types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from './types.js';

export const TeamRunStatusSchema = z.enum(['planned', 'running', 'succeeded', 'failed', 'cancelled']);

export const TeamRunTriggerSchema = z.enum(['cli', 'service', 'api', 'scheduled', 'internal']);

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

export const DEFAULT_TEAM_RUN_EXECUTION_POLICY_SCHEMA = TeamRunExecutionPolicySchema.parse(
  DEFAULT_TEAM_RUN_EXECUTION_POLICY,
);
