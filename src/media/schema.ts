import { z } from 'zod';
import type {
  MediaGenerationArtifact,
  MediaGenerationFailure,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaGenerationStoredRecord,
} from './types.js';

export const MediaGenerationProviderSchema = z.enum(['gemini', 'grok']);

export const MediaGenerationTypeSchema = z.enum(['image', 'video']);

export const MediaGenerationTransportSchema = z.enum(['api', 'browser', 'auto']);

export const MediaGenerationSourceSchema = z.enum(['cli', 'api', 'mcp']);

export const MediaGenerationStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

export const MediaGenerationRequestSchema: z.ZodType<MediaGenerationRequest> = z.object({
  provider: MediaGenerationProviderSchema,
  mediaType: MediaGenerationTypeSchema,
  prompt: z.string().trim().min(1),
  model: z.string().trim().min(1).nullable().optional(),
  transport: MediaGenerationTransportSchema.nullable().optional(),
  count: z.number().int().min(1).max(8).nullable().optional(),
  size: z.string().trim().min(1).nullable().optional(),
  aspectRatio: z.string().trim().min(1).nullable().optional(),
  outputDir: z.string().trim().min(1).nullable().optional(),
  source: MediaGenerationSourceSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const MediaGenerationArtifactSchema: z.ZodType<MediaGenerationArtifact> = z.object({
  id: z.string().min(1),
  type: MediaGenerationTypeSchema,
  mimeType: z.string().min(1).nullable().optional(),
  fileName: z.string().min(1).nullable().optional(),
  path: z.string().min(1).nullable().optional(),
  uri: z.string().min(1).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const MediaGenerationFailureSchema: z.ZodType<MediaGenerationFailure> = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const MediaGenerationResponseSchema: z.ZodType<MediaGenerationResponse> = z.object({
  id: z.string().min(1),
  object: z.literal('media_generation'),
  status: MediaGenerationStatusSchema,
  provider: MediaGenerationProviderSchema,
  mediaType: MediaGenerationTypeSchema,
  model: z.string().min(1).nullable().optional(),
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  artifacts: z.array(MediaGenerationArtifactSchema),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  failure: MediaGenerationFailureSchema.nullable().optional(),
});

export const MediaGenerationStoredRecordSchema: z.ZodType<MediaGenerationStoredRecord> = z.object({
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  persistedAt: z.string(),
  response: MediaGenerationResponseSchema,
});
