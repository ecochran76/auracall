import { z } from 'zod';
import type {
  MediaGenerationArtifact,
  MediaGenerationFailure,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaGenerationStoredRecord,
  MediaGenerationTimelineEvent,
} from './types.js';

export const MediaGenerationProviderSchema = z.enum(['gemini', 'grok']);

export const MediaGenerationTypeSchema = z.enum(['image', 'music', 'video']);

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

export const MediaGenerationTimelineEventSchema: z.ZodType<MediaGenerationTimelineEvent> = z.object({
  event: z.enum([
    'running_persisted',
    'capability_discovered',
    'capability_unavailable',
    'executor_started',
    'browser_operation_queued',
    'browser_operation_acquired',
    'browser_target_attached',
    'gemini_surface_ready',
    'capability_selected',
    'composer_ready',
    'prompt_inserted',
    'send_attempted',
    'submit_path_observed',
    'submitted_state_observed',
    'prompt_submitted',
    'run_state_observed',
    'artifact_poll',
    'image_visible',
    'music_visible',
    'video_visible',
    'no_generated_media',
    'artifact_materialized',
    'completed',
    'failed',
  ]),
  at: z.string(),
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
  timeline: z.array(MediaGenerationTimelineEventSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  failure: MediaGenerationFailureSchema.nullable().optional(),
});

export const MediaGenerationStoredRecordSchema: z.ZodType<MediaGenerationStoredRecord> = z.object({
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  persistedAt: z.string(),
  response: MediaGenerationResponseSchema,
});
