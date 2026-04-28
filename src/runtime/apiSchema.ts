import { z } from 'zod';
import { ExecutionRunRecordBundleSchema } from './schema.js';
import type {
  ExecutionRequest,
  ExecutionRequestArtifactInput,
  ExecutionRequestExtensionHints,
  ExecutionRequestInputMessage,
  ExecutionResponse,
  ExecutionResponseArtifactOutputItem,
  ExecutionResponseFromRunRecordInput,
  ExecutionResponseMessageOutputItem,
  ExecutionResponseOutputItem,
  ExecutionResponseOutputTextPart,
} from './apiTypes.js';

export const ExecutionTransportSchema = z.enum(['api', 'browser', 'auto']);

export const ExecutionResponseStatusSchema = z.enum(['in_progress', 'completed', 'failed', 'cancelled']);

export const ExecutionResponseOutputContentPartTypeSchema = z.enum(['output_text']);

export const ExecutionResponseOutputItemTypeSchema = z.enum(['message', 'artifact']);

export const ExecutionResponseArtifactTypeSchema = z.enum([
  'file',
  'image',
  'music',
  'video',
  'canvas',
  'document',
  'generated',
]);

export const ExecutionRequestExtensionHintsSchema: z.ZodType<ExecutionRequestExtensionHints> = z.object({
  runtimeProfile: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
  transport: ExecutionTransportSchema.nullable().optional(),
  outputContract: z.string().nullable().optional(),
  composerTool: z.string().nullable().optional(),
  deepResearchPlanAction: z.enum(['start', 'edit']).nullable().optional(),
});

export const ExecutionRequestInputMessageSchema: z.ZodType<ExecutionRequestInputMessage> = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

export const ExecutionRequestArtifactInputSchema: z.ZodType<ExecutionRequestArtifactInput> = z.object({
  id: z.string(),
  mimeType: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
});

export const ExecutionRequestSchema: z.ZodType<ExecutionRequest> = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(ExecutionRequestInputMessageSchema)]),
  instructions: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.record(z.string(), z.unknown())).optional(),
  attachments: z.array(ExecutionRequestArtifactInputSchema).optional(),
  auracall: ExecutionRequestExtensionHintsSchema.optional(),
});

export const ExecutionResponseOutputTextPartSchema: z.ZodType<ExecutionResponseOutputTextPart> = z.object({
  type: ExecutionResponseOutputContentPartTypeSchema,
  text: z.string(),
});

export const ExecutionResponseMessageOutputItemSchema: z.ZodType<ExecutionResponseMessageOutputItem> = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(ExecutionResponseOutputTextPartSchema),
});

export const ExecutionResponseArtifactOutputItemSchema: z.ZodType<ExecutionResponseArtifactOutputItem> = z.object({
  type: z.literal('artifact'),
  id: z.string(),
  artifact_type: ExecutionResponseArtifactTypeSchema,
  title: z.string().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  disposition: z.enum(['inline', 'attachment']).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const ExecutionResponseOutputItemSchema: z.ZodType<ExecutionResponseOutputItem> = z.union([
  ExecutionResponseMessageOutputItemSchema,
  ExecutionResponseArtifactOutputItemSchema,
]);

export const ExecutionResponseSchema: z.ZodType<ExecutionResponse> = z.object({
  id: z.string(),
  object: z.literal('response'),
  status: ExecutionResponseStatusSchema,
  model: z.string().nullable().optional(),
  output: z.array(ExecutionResponseOutputItemSchema),
  metadata: z
    .object({
      runId: z.string().nullable().optional(),
      taskRunSpecId: z.string().nullable().optional(),
      taskRunSpecSummary: z
        .object({
          id: z.string().nullable().optional(),
          teamId: z.string().nullable().optional(),
          title: z.string().nullable().optional(),
          objective: z.string().nullable().optional(),
          createdAt: z.string().nullable().optional(),
          persistedAt: z.string().nullable().optional(),
          requestedOutputCount: z.number().int().nonnegative().optional(),
          inputArtifactCount: z.number().int().nonnegative().optional(),
        })
        .nullable()
        .optional(),
      runtimeProfile: z.string().nullable().optional(),
      service: z.string().nullable().optional(),
      executionSummary: z
        .object({
          terminalStepId: z.string().nullable().optional(),
          completedAt: z.string().nullable().optional(),
          lastUpdatedAt: z.string().nullable().optional(),
          stepSummaries: z
            .array(
              z.object({
                stepId: z.string().nullable().optional(),
                order: z.number().int().nonnegative().optional(),
                agentId: z.string().nullable().optional(),
                status: z.string().nullable().optional(),
                runtimeProfileId: z.string().nullable().optional(),
                browserProfileId: z.string().nullable().optional(),
                service: z.string().nullable().optional(),
              }),
            )
            .nullable()
            .optional(),
          localActionSummary: z
            .object({
              ownerStepId: z.string().nullable().optional(),
              generatedAt: z.string().nullable().optional(),
              total: z.number().int().nonnegative().optional(),
              counts: z
                .object({
                  requested: z.number().int().nonnegative().optional(),
                  approved: z.number().int().nonnegative().optional(),
                  rejected: z.number().int().nonnegative().optional(),
                  executed: z.number().int().nonnegative().optional(),
                  failed: z.number().int().nonnegative().optional(),
                  cancelled: z.number().int().nonnegative().optional(),
                })
                .nullable()
                .optional(),
              items: z
                .array(
                  z.object({
                    requestId: z.string().nullable().optional(),
                    kind: z.string().nullable().optional(),
                    status: z.string().nullable().optional(),
                    summary: z.string().nullable().optional(),
                    command: z.string().nullable().optional(),
                    args: z.array(z.string()).optional(),
                    resultSummary: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            })
            .nullable()
            .optional(),
          requestedOutputSummary: z
            .object({
              total: z.number().int().nonnegative().optional(),
              fulfilledCount: z.number().int().nonnegative().optional(),
              missingRequiredCount: z.number().int().nonnegative().optional(),
              items: z
                .array(
                  z.object({
                    label: z.string().nullable().optional(),
                    kind: z.string().nullable().optional(),
                    format: z.string().nullable().optional(),
                    destination: z.string().nullable().optional(),
                    required: z.boolean().optional(),
                    fulfilled: z.boolean().optional(),
                    evidence: z.enum(['message', 'artifact', 'structured-output']).nullable().optional(),
                  }),
                )
                .optional(),
            })
            .nullable()
            .optional(),
          requestedOutputPolicy: z
            .object({
              status: z.enum(['satisfied', 'missing-required']).nullable().optional(),
              message: z.string().nullable().optional(),
              missingRequiredLabels: z.array(z.string()).optional(),
            })
            .nullable()
            .optional(),
          inputArtifactSummary: z
            .object({
              total: z.number().int().nonnegative().optional(),
              items: z
                .array(
                  z.object({
                    id: z.string().nullable().optional(),
                    kind: z.string().nullable().optional(),
                    title: z.string().nullable().optional(),
                    path: z.string().nullable().optional(),
                    uri: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            })
            .nullable()
            .optional(),
          handoffTransferSummary: z
            .object({
              total: z.number().int().nonnegative().optional(),
              items: z
                .array(
                  z.object({
                    handoffId: z.string().nullable().optional(),
                    fromStepId: z.string().nullable().optional(),
                    fromAgentId: z.string().nullable().optional(),
                    title: z.string().nullable().optional(),
                    objective: z.string().nullable().optional(),
                    requestedOutputCount: z.number().int().nonnegative().optional(),
                    inputArtifactCount: z.number().int().nonnegative().optional(),
                  }),
                )
                .optional(),
            })
            .nullable()
            .optional(),
          providerUsageSummary: z
            .object({
              ownerStepId: z.string().nullable().optional(),
              generatedAt: z.string().nullable().optional(),
              inputTokens: z.number().int().nonnegative().optional(),
              outputTokens: z.number().int().nonnegative().optional(),
              reasoningTokens: z.number().int().nonnegative().optional(),
              totalTokens: z.number().int().nonnegative().optional(),
            })
            .nullable()
            .optional(),
          browserRunSummary: z.record(z.string(), z.unknown()).nullable().optional(),
          cancellationSummary: z
            .object({
              cancelledAt: z.string().nullable().optional(),
              source: z.enum(['operator', 'service-host']).nullable().optional(),
              reason: z.string().nullable().optional(),
            })
            .nullable()
            .optional(),
          operatorControlSummary: z
            .object({
              humanEscalationResume: z
                .object({
                  resumedAt: z.string().nullable().optional(),
                  note: z.string().nullable().optional(),
                })
                .nullable()
                .optional(),
              targetedDrain: z
                .object({
                  requestedAt: z.string().nullable().optional(),
                  status: z.enum(['executed', 'skipped']).nullable().optional(),
                  reason: z.string().nullable().optional(),
                  skipReason: z.string().nullable().optional(),
                })
                .nullable()
                .optional(),
            })
            .nullable()
            .optional(),
          orchestrationTimelineSummary: z
            .object({
              total: z.number().int().nonnegative().optional(),
              items: z
                .array(
                  z.object({
                    type: z
                      .enum(['step-started', 'step-succeeded', 'step-failed', 'handoff-consumed', 'note-added'])
                      .nullable()
                      .optional(),
                    createdAt: z.string().nullable().optional(),
                    stepId: z.string().nullable().optional(),
                    note: z.string().nullable().optional(),
                    handoffId: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            })
            .nullable()
            .optional(),
          failureSummary: z
            .object({
              code: z.string().nullable().optional(),
              message: z.string().nullable().optional(),
              details: z.record(z.string(), z.unknown()).nullable().optional(),
            })
            .nullable()
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export const ExecutionResponseFromRunRecordInputSchema: z.ZodType<ExecutionResponseFromRunRecordInput> = z.object({
  responseId: z.string(),
  runRecord: ExecutionRunRecordBundleSchema,
  model: z.string().nullable().optional(),
  output: z.array(ExecutionResponseOutputItemSchema),
  runtimeProfile: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
  taskRunSpecSummary: z
    .object({
      id: z.string().nullable().optional(),
      teamId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      objective: z.string().nullable().optional(),
      createdAt: z.string().nullable().optional(),
      persistedAt: z.string().nullable().optional(),
      requestedOutputCount: z.number().int().nonnegative().optional(),
      inputArtifactCount: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
});
