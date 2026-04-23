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
  MediaGenerationTimelineEvent,
  MediaGenerationType,
} from './types.js';
import type { WorkbenchCapability, WorkbenchCapabilityReporter } from '../workbench/types.js';

export interface MediaGenerationServiceDeps {
  now?: () => Date;
  generateId?: () => string;
  store?: MediaGenerationRecordStore;
  executor?: MediaGenerationExecutor;
  capabilityReporter?: WorkbenchCapabilityReporter | null;
  runtimeProfile?: string | null;
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
  const capabilityReporter = deps.capabilityReporter ?? null;
  const runtimeProfile = deps.runtimeProfile ?? null;

  return {
    async createGeneration(input) {
      const request = MediaGenerationRequestSchema.parse(input);
      const id = generateId();
      const createdAt = now().toISOString();
      const timeline: MediaGenerationTimelineEvent[] = [
        {
          event: 'running_persisted',
          at: createdAt,
          details: {
            status: 'running',
          },
        },
      ];
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
        timeline,
        metadata: {
          ...(request.metadata ?? {}),
          source: request.source ?? null,
          transport: request.transport ?? null,
          count: request.count ?? null,
          size: request.size ?? null,
          aspectRatio: request.aspectRatio ?? null,
        },
      };
      let currentResponse = runningResponse;
      const persistTimelineEvent = async (
        event: Omit<MediaGenerationTimelineEvent, 'at'> & { at?: string },
      ): Promise<void> => {
        const at = event.at ?? now().toISOString();
        timeline.push({
          event: event.event,
          at,
          details: normalizeTimelineDetails(event.details),
        });
        currentResponse = MediaGenerationResponseSchema.parse({
          ...currentResponse,
          updatedAt: at,
          timeline: [...timeline],
        } satisfies MediaGenerationResponse);
        await store.writeResponse(currentResponse, { persistedAt: at });
      };
      await store.ensureStorage();
      await store.writeResponse(runningResponse, { persistedAt: createdAt });
      await fs.mkdir(store.getArtifactDir(id), { recursive: true });

      try {
        const capability = await resolveMediaGenerationCapability(request, capabilityReporter, runtimeProfile);
        if (capability) {
          await persistTimelineEvent({
            event: 'capability_discovered',
            details: formatCapabilityMetadata(capability),
          });
        }
        await persistTimelineEvent({
          event: 'executor_started',
          details: {
            provider: request.provider,
            mediaType: request.mediaType,
            transport: request.transport ?? null,
          },
        });
        const result = await executor({
          request,
          id,
          createdAt,
          artifactDir: store.getArtifactDir(id),
          emitTimeline: persistTimelineEvent,
        });
        const completedAt = now().toISOString();
        timeline.push({
          event: 'completed',
          at: completedAt,
          details: {
            status: 'succeeded',
            artifactCount: result.artifacts.length,
          },
        });
        const response = MediaGenerationResponseSchema.parse({
          ...runningResponse,
          status: 'succeeded',
          model: result.model ?? runningResponse.model,
          updatedAt: completedAt,
          completedAt,
          artifacts: result.artifacts,
          timeline,
          metadata: {
            ...(runningResponse.metadata ?? {}),
            ...(result.metadata ?? {}),
            ...(capability ? { workbenchCapability: formatCapabilityMetadata(capability) } : {}),
            source: request.source ?? null,
            transport: request.transport ?? null,
            count: request.count ?? null,
            size: request.size ?? null,
            aspectRatio: request.aspectRatio ?? null,
          },
          failure: null,
        } satisfies MediaGenerationResponse);
        currentResponse = response;
        await store.writeResponse(response, { persistedAt: completedAt });
        return response;
      } catch (error) {
        const completedAt = now().toISOString();
        const failure = createMediaGenerationFailure(error);
        timeline.push({
          event: 'failed',
          at: completedAt,
          details: {
            status: 'failed',
            code: failure.code,
            message: failure.message,
          },
        });
        const response = MediaGenerationResponseSchema.parse({
          ...runningResponse,
          status: 'failed',
          updatedAt: completedAt,
          completedAt,
          timeline,
          failure,
        } satisfies MediaGenerationResponse);
        currentResponse = response;
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

const GEMINI_MEDIA_CAPABILITY_IDS: Record<MediaGenerationType, string> = {
  image: 'gemini.media.create_image',
  music: 'gemini.media.create_music',
  video: 'gemini.media.create_video',
};

async function resolveMediaGenerationCapability(
  request: MediaGenerationRequest,
  reporter: WorkbenchCapabilityReporter | null,
  runtimeProfile: string | null,
): Promise<WorkbenchCapability | null> {
  if (!reporter || request.provider !== 'gemini' || request.transport !== 'browser') {
    return null;
  }
  const capabilityId = GEMINI_MEDIA_CAPABILITY_IDS[request.mediaType];
  const report = await reporter.listCapabilities({
    provider: 'gemini',
    category: 'media',
    runtimeProfile,
    includeUnavailable: true,
  });
  const capability = report.capabilities.find((entry) => entry.id === capabilityId) ?? null;
  if (capability?.availability === 'available') {
    return capability;
  }
  throw new MediaGenerationExecutionError(
    'media_capability_unavailable',
    `Gemini browser ${request.mediaType} generation requires ${capabilityId}, but the capability is ${capability?.availability ?? 'not_visible'}. Run auracall capabilities --target gemini --json to inspect the current workbench state.`,
    {
      capabilityId,
      availability: capability?.availability ?? 'not_visible',
      providerLabels: capability?.providerLabels ?? [],
      source: capability?.source ?? null,
      observedAt: capability?.observedAt ?? null,
      runtimeProfile,
      transport: request.transport,
    },
  );
}

function formatCapabilityMetadata(capability: WorkbenchCapability): Record<string, unknown> {
  return {
    id: capability.id,
    availability: capability.availability,
    providerLabels: capability.providerLabels,
    source: capability.source,
    observedAt: capability.observedAt ?? null,
  };
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

function normalizeTimelineDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
  } catch {
    return {
      serialization: 'failed',
    };
  }
}
