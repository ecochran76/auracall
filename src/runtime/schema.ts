import { z } from 'zod';
import {
  TeamRunArtifactRefSchema,
  TeamRunExecutionPolicySchema,
  TeamRunFailureSchema,
  TeamRunHandoffSchema,
  TeamRunLocalActionRequestSchema,
  TeamRunStepInputSchema,
  TeamRunStepKindSchema,
  TeamRunStepOutputSchema,
  TeamRunStructuredOutputSchema,
  TeamRunTriggerSchema,
} from '../teams/schema.js';
import type {
  ExecutionRunAffinityRecord,
  ExecutionRunnerRecord,
  ExecutionRun,
  ExecutionRunEvent,
  ExecutionRunLease,
  ExecutionRunRecordBundle,
  ExecutionRunSharedState,
  ExecutionRunStep,
} from './types.js';

export const ExecutionRunStatusSchema = z.enum(['planned', 'running', 'succeeded', 'failed', 'cancelled']);

export const ExecutionRunSourceKindSchema = z.enum(['team-run', 'direct']);

export const ExecutionRunStepStatusSchema = z.enum([
  'planned',
  'runnable',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'skipped',
  'cancelled',
]);

export const ExecutionRunEventTypeSchema = z.enum([
  'run-created',
  'step-planned',
  'step-runnable',
  'step-started',
  'step-succeeded',
  'step-failed',
  'handoff-consumed',
  'lease-acquired',
  'lease-released',
  'note-added',
]);

export const ExecutionRunLeaseStatusSchema = z.enum(['active', 'released', 'expired']);

export const ExecutionRunServiceIdSchema = z.enum(['chatgpt', 'gemini', 'grok']).nullable();
export const ExecutionRunnerServiceIdSchema = z.enum(['chatgpt', 'gemini', 'grok']);

export const ExecutionRunAffinityHostRequirementSchema = z.enum(['any', 'same-host']);
export const ExecutionRunnerStatusSchema = z.enum(['active', 'stale']);

export const ExecutionRunSchema: z.ZodType<ExecutionRun> = z.object({
  id: z.string(),
  sourceKind: ExecutionRunSourceKindSchema,
  sourceId: z.string().nullable(),
  taskRunSpecId: z.string().nullable().optional(),
  status: ExecutionRunStatusSchema,
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

export const ExecutionRunStepSchema: z.ZodType<ExecutionRunStep> = z.object({
  id: z.string(),
  runId: z.string(),
  sourceStepId: z.string().nullable(),
  agentId: z.string(),
  runtimeProfileId: z.string().nullable(),
  browserProfileId: z.string().nullable(),
  service: ExecutionRunServiceIdSchema,
  kind: TeamRunStepKindSchema,
  status: ExecutionRunStepStatusSchema,
  order: z.number().int(),
  dependsOnStepIds: z.array(z.string()),
  input: TeamRunStepInputSchema,
  output: TeamRunStepOutputSchema.nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  failure: TeamRunFailureSchema.nullable(),
});

export const ExecutionRunEventSchema: z.ZodType<ExecutionRunEvent> = z.object({
  id: z.string(),
  runId: z.string(),
  type: ExecutionRunEventTypeSchema,
  createdAt: z.string(),
  stepId: z.string().nullable().optional(),
  leaseId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const ExecutionRunLeaseSchema: z.ZodType<ExecutionRunLease> = z.object({
  id: z.string(),
  runId: z.string(),
  ownerId: z.string(),
  status: ExecutionRunLeaseStatusSchema,
  acquiredAt: z.string(),
  heartbeatAt: z.string(),
  expiresAt: z.string(),
  releasedAt: z.string().nullable().optional(),
  releaseReason: z.string().nullable().optional(),
});

export const ExecutionRunAffinityRecordSchema: z.ZodType<ExecutionRunAffinityRecord> = z.object({
  service: ExecutionRunServiceIdSchema,
  serviceAccountId: z.string().nullable(),
  browserRequired: z.boolean(),
  runtimeProfileId: z.string().nullable(),
  browserProfileId: z.string().nullable(),
  hostRequirement: ExecutionRunAffinityHostRequirementSchema,
  requiredHostId: z.string().nullable(),
  eligibilityNote: z.string().nullable(),
});

export const ExecutionRunnerRecordSchema: z.ZodType<ExecutionRunnerRecord> = z.object({
  id: z.string(),
  hostId: z.string(),
  status: ExecutionRunnerStatusSchema,
  startedAt: z.string(),
  lastHeartbeatAt: z.string(),
  expiresAt: z.string(),
  lastActivityAt: z.string().nullable().optional().transform((value) => value ?? null),
  lastClaimedRunId: z.string().nullable().optional().transform((value) => value ?? null),
  serviceIds: z.array(ExecutionRunnerServiceIdSchema),
  runtimeProfileIds: z.array(z.string()),
  browserProfileIds: z.array(z.string()),
  serviceAccountIds: z.array(z.string()),
  browserCapable: z.boolean(),
  eligibilityNote: z.string().nullable(),
});

export const ExecutionRunSharedStateSchema: z.ZodType<ExecutionRunSharedState> = z.object({
  id: z.string(),
  runId: z.string(),
  status: z.enum(['active', 'succeeded', 'failed', 'cancelled']),
  artifacts: z.array(TeamRunArtifactRefSchema),
  structuredOutputs: z.array(TeamRunStructuredOutputSchema),
  notes: z.array(z.string()),
  history: z.array(ExecutionRunEventSchema),
  lastUpdatedAt: z.string(),
});

export const ExecutionRunRecordBundleSchema: z.ZodType<ExecutionRunRecordBundle> = z.object({
  run: ExecutionRunSchema,
  steps: z.array(ExecutionRunStepSchema),
  handoffs: z.array(TeamRunHandoffSchema),
  localActionRequests: z.array(TeamRunLocalActionRequestSchema),
  sharedState: ExecutionRunSharedStateSchema,
  events: z.array(ExecutionRunEventSchema),
  leases: z.array(ExecutionRunLeaseSchema),
});
