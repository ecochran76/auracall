import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createMediaGenerationService,
  type MediaGenerationService,
} from '../../media/service.js';
import { probeMediaGenerationBrowserDiagnostics } from '../../media/browserDiagnostics.js';
import { MediaGenerationRequestSchema } from '../../media/schema.js';
import { summarizeMediaGenerationStatus } from '../../media/statusSummary.js';
import type { MediaGenerationRequest, MediaGenerationResponse } from '../../media/types.js';

const mediaGenerationInputShape = {
  provider: z.enum(['gemini', 'grok']),
  mediaType: z.enum(['image', 'music', 'video']),
  prompt: z.string().min(1),
  model: z.string().min(1).nullable().optional(),
  transport: z.enum(['api', 'browser', 'auto']).nullable().optional(),
  count: z.number().int().min(1).max(8).nullable().optional(),
  size: z.string().min(1).nullable().optional(),
  aspectRatio: z.string().min(1).nullable().optional(),
  outputDir: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
} satisfies z.ZodRawShape;

const mediaGenerationArtifactShape = z.object({
  id: z.string(),
  type: z.enum(['image', 'music', 'video']),
  mimeType: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const mediaGenerationTimelineEventShape = z.object({
  event: z.enum([
    'running_persisted',
    'capability_discovered',
    'executor_started',
    'prompt_submitted',
    'artifact_poll',
    'image_visible',
    'artifact_materialized',
    'completed',
    'failed',
  ]),
  at: z.string(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

const mediaGenerationOutputShape = {
  id: z.string(),
  object: z.literal('media_generation'),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  provider: z.enum(['gemini', 'grok']),
  mediaType: z.enum(['image', 'music', 'video']),
  model: z.string().nullable().optional(),
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  artifacts: z.array(mediaGenerationArtifactShape),
  timeline: z.array(mediaGenerationTimelineEventShape).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  failure: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
} satisfies z.ZodRawShape;

const mediaGenerationStatusInputShape = {
  id: z.string().min(1),
  diagnostics: z.enum(['browser-state']).optional(),
} satisfies z.ZodRawShape;

const mediaGenerationStatusArtifactShape = z.object({
  id: z.string(),
  type: z.enum(['image', 'music', 'video']),
  fileName: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  materialization: z.string().nullable().optional(),
  remoteUrl: z.string().nullable().optional(),
});

const mediaGenerationStatusOutputShape = {
  id: z.string(),
  object: z.literal('media_generation_status'),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  provider: z.enum(['gemini', 'grok']),
  mediaType: z.enum(['image', 'music', 'video']),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  lastEvent: mediaGenerationTimelineEventShape.nullable().optional(),
  timeline: z.array(mediaGenerationTimelineEventShape),
  artifactCount: z.number().int().nonnegative(),
  artifacts: z.array(mediaGenerationStatusArtifactShape),
  browserDiagnostics: z.unknown().optional(),
  failure: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()),
} satisfies z.ZodRawShape;

export interface RegisterMediaGenerationToolDeps {
  service?: MediaGenerationService;
}

export function registerMediaGenerationTool(
  server: McpServer,
  deps: RegisterMediaGenerationToolDeps = {},
): void {
  const service = deps.service ?? createMediaGenerationService();
  server.registerTool(
    'media_generation',
    {
      title: 'Generate Aura-Call media',
      description:
        'Create one Aura-Call media generation request through the shared Gemini/Grok image/music/video contract. Provider adapters may fail until wired.',
      inputSchema: mediaGenerationInputShape,
      outputSchema: mediaGenerationOutputShape,
    },
    createMediaGenerationToolHandler(service),
  );
  server.registerTool(
    'media_generation_status',
    {
      title: 'Read Aura-Call media generation status',
      description:
        'Read the current status, timeline, artifact cache path, and materialization method for one Aura-Call media generation.',
      inputSchema: mediaGenerationStatusInputShape,
      outputSchema: mediaGenerationStatusOutputShape,
    },
    createMediaGenerationStatusToolHandler(service),
  );
}

export function createMediaGenerationToolHandler(service: MediaGenerationService) {
  return async (input: unknown) => {
    const textContent = (text: string) => [{ type: 'text' as const, text }];
    const payload = MediaGenerationRequestSchema.parse({
      ...(input as MediaGenerationRequest),
      source: 'mcp',
    });
    const result = await service.createGeneration(payload);
    const line =
      result.status === 'succeeded'
        ? `Media generation ${result.id} succeeded with ${result.artifacts.length} artifact(s).`
        : `Media generation ${result.id} ${result.status}: ${result.failure?.message ?? 'no failure details'}`;
    return {
      isError: result.status === 'failed',
      content: textContent(line),
      structuredContent: result as MediaGenerationResponse & Record<string, unknown>,
    };
  };
}

export function createMediaGenerationStatusToolHandler(service: MediaGenerationService) {
  return async (input: unknown) => {
    const textContent = (text: string) => [{ type: 'text' as const, text }];
    const payload = z.object(mediaGenerationStatusInputShape).parse(input);
    const response = await service.readGeneration(payload.id);
    if (!response) {
      throw new Error(`Media generation "${payload.id}" not found.`);
    }
    const summary = {
      ...summarizeMediaGenerationStatus(response),
      ...(payload.diagnostics === 'browser-state'
        ? { browserDiagnostics: await probeMediaGenerationBrowserDiagnostics(response) }
        : {}),
    };
    const lastEvent = summary.lastEvent?.event ?? 'no timeline event';
    const line = `Media generation ${summary.id} is ${summary.status}; last event ${lastEvent}; artifacts ${summary.artifactCount}.`;
    return {
      isError: summary.status === 'failed',
      content: textContent(line),
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
