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
      runtimeProfile: z.string().nullable().optional(),
      service: z.string().nullable().optional(),
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
});
