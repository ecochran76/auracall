import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { MediaGenerationRequestSchema, MediaGenerationResponseSchema } from './schema.js';
import {
  createMediaGenerationRecordStore,
  type MediaGenerationRecordStore,
} from './store.js';
import type {
  MediaGenerationExecutor,
  MediaGenerationFailure,
  MediaGenerationRequest,
  MediaGenerationResponse,
} from './types.js';

export interface MediaGenerationServiceDeps {
  now?: () => Date;
  generateId?: () => string;
  store?: MediaGenerationRecordStore;
  executor?: MediaGenerationExecutor;
}

export interface MediaGenerationService {
  createGeneration(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
  readGeneration(id: string): Promise<MediaGenerationResponse | null>;
}

export function createMediaGenerationService(deps: MediaGenerationServiceDeps = {}): MediaGenerationService {
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? (() => `medgen_${randomUUID().replace(/-/g, '')}`);
  const store = deps.store ?? createMediaGenerationRecordStore();
  const executor = deps.executor ?? defaultMediaGenerationExecutor;

  return {
    async createGeneration(input) {
      const request = MediaGenerationRequestSchema.parse(input);
      const id = generateId();
      const createdAt = now().toISOString();
      const runningResponse: MediaGenerationResponse = {
        id,
        object: 'media_generation',
        status: 'running',
        provider: request.provider,
        mediaType: request.mediaType,
        model: request.model ?? null,
        prompt: request.prompt,
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
        artifacts: [],
        metadata: {
          ...(request.metadata ?? {}),
          source: request.source ?? null,
          transport: request.transport ?? null,
          count: request.count ?? null,
          size: request.size ?? null,
          aspectRatio: request.aspectRatio ?? null,
        },
      };
      await store.ensureStorage();
      await store.writeResponse(runningResponse, { persistedAt: createdAt });
      await fs.mkdir(store.getArtifactDir(id), { recursive: true });

      try {
        const result = await executor({
          request,
          id,
          createdAt,
          artifactDir: store.getArtifactDir(id),
        });
        const completedAt = now().toISOString();
        const response = MediaGenerationResponseSchema.parse({
          ...runningResponse,
          status: 'succeeded',
          model: result.model ?? runningResponse.model,
          updatedAt: completedAt,
          completedAt,
          artifacts: result.artifacts,
          metadata: {
            ...(runningResponse.metadata ?? {}),
            ...(result.metadata ?? {}),
            source: request.source ?? null,
            transport: request.transport ?? null,
            count: request.count ?? null,
            size: request.size ?? null,
            aspectRatio: request.aspectRatio ?? null,
          },
          failure: null,
        } satisfies MediaGenerationResponse);
        await store.writeResponse(response, { persistedAt: completedAt });
        return response;
      } catch (error) {
        const completedAt = now().toISOString();
        const failure = createMediaGenerationFailure(error);
        const response = MediaGenerationResponseSchema.parse({
          ...runningResponse,
          status: 'failed',
          updatedAt: completedAt,
          completedAt,
          failure,
        } satisfies MediaGenerationResponse);
        await store.writeResponse(response, { persistedAt: completedAt });
        return response;
      }
    },

    async readGeneration(id) {
      const record = await store.readRecord(id);
      return record?.response ?? null;
    },
  };
}

export async function defaultMediaGenerationExecutor(): Promise<never> {
  throw new MediaGenerationExecutionError(
    'media_provider_not_implemented',
    'Media generation provider execution is not implemented yet. The API/MCP contract is available for adapter wiring.',
  );
}

export class MediaGenerationExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'MediaGenerationExecutionError';
  }
}

function createMediaGenerationFailure(error: unknown): MediaGenerationFailure {
  if (error instanceof MediaGenerationExecutionError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details ?? null,
    };
  }
  return {
    code: 'media_generation_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}
