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
  MediaGenerationMaterializeOptions,
  MediaGenerationMaterializer,
  MediaGenerationRequest,
  MediaGenerationArtifact,
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
  materializer?: MediaGenerationMaterializer;
  capabilityReporter?: WorkbenchCapabilityReporter | null;
  runtimeProfile?: string | null;
  onGenerationSettled?: (response: MediaGenerationResponse) => void | Promise<void>;
}

export interface MediaGenerationService {
  createGeneration(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
  createGenerationAsync?(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
  materializeGeneration?(id: string, options?: MediaGenerationMaterializeOptions): Promise<MediaGenerationResponse>;
  readGeneration(id: string): Promise<MediaGenerationResponse | null>;
}

export function createMediaGenerationService(deps: MediaGenerationServiceDeps = {}): MediaGenerationService {
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? (() => `medgen_${randomUUID().replace(/-/g, '')}`);
  const store = deps.store ?? createMediaGenerationRecordStore();
  const executor = deps.executor ?? defaultMediaGenerationExecutor;
  const materializer = deps.materializer ?? null;
  const capabilityReporter = deps.capabilityReporter ?? null;
  const runtimeProfile = deps.runtimeProfile ?? null;

  return {
    async createGeneration(input) {
      const context = await initializeGeneration(input);
      return executeGeneration(context);
    },

    async createGenerationAsync(input) {
      const context = await initializeGeneration(input);
      void executeGeneration(context);
      return context.runningResponse;
    },

    async materializeGeneration(id, options = {}) {
      if (!materializer) {
        throw new MediaGenerationExecutionError(
          'media_materializer_not_implemented',
          'Media generation resumed materialization is not configured for this runtime.',
        );
      }
      const record = await store.readRecord(id);
      if (!record) {
        throw new MediaGenerationExecutionError(
          'media_generation_not_found',
          `Media generation ${id} was not found.`,
          { id },
        );
      }
      const existing = record.response;
      const timeline = [...(existing.timeline ?? [])];
      let currentResponse = existing;
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
      await fs.mkdir(store.getArtifactDir(id), { recursive: true });
      const result = await materializer({
        response: existing,
        artifactDir: store.getArtifactDir(id),
        options,
        emitTimeline: persistTimelineEvent,
      });
      const updatedAt = now().toISOString();
      const response = MediaGenerationResponseSchema.parse({
        ...currentResponse,
        updatedAt,
        artifacts: mergeMediaGenerationArtifacts(currentResponse.artifacts, result.artifacts),
        model: result.model ?? currentResponse.model ?? null,
        timeline,
        metadata: {
          ...(currentResponse.metadata ?? {}),
          ...(result.metadata ?? {}),
          resumedMaterializedAt: updatedAt,
          resumedArtifactCount: result.artifacts.length,
        },
      } satisfies MediaGenerationResponse);
      await store.writeResponse(response, { persistedAt: updatedAt });
      return response;
    },

    async readGeneration(id) {
      const record = await store.readRecord(id);
      return record?.response ?? null;
    },
  };

  async function initializeGeneration(input: MediaGenerationRequest) {
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
        runtimeProfile,
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
    return {
      request,
      id,
      createdAt,
      timeline,
      runningResponse,
      persistTimelineEvent,
    };
  }

  async function executeGeneration(context: Awaited<ReturnType<typeof initializeGeneration>>) {
    const {
      request,
      id,
      createdAt,
      timeline,
      runningResponse,
      persistTimelineEvent,
    } = context;
    try {
      let capability: WorkbenchCapability | null = null;
      try {
        capability = await resolveMediaGenerationCapability(request, capabilityReporter, runtimeProfile);
      } catch (error) {
        if (error instanceof MediaGenerationExecutionError && error.code === 'media_capability_unavailable') {
          await persistTimelineEvent({
            event: 'capability_unavailable',
            details: error.details ?? null,
          });
        }
        throw error;
      }
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
        workbenchCapability: capability,
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
          runtimeProfile,
          count: request.count ?? null,
          size: request.size ?? null,
          aspectRatio: request.aspectRatio ?? null,
        },
        failure: null,
      } satisfies MediaGenerationResponse);
      await store.writeResponse(response, { persistedAt: completedAt });
      await notifyGenerationSettled(response);
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
        metadata: {
          ...(runningResponse.metadata ?? {}),
          ...formatFailureMetadata(failure),
        },
        failure,
      } satisfies MediaGenerationResponse);
      await store.writeResponse(response, { persistedAt: completedAt });
      await notifyGenerationSettled(response);
      return response;
    }
  }

  async function notifyGenerationSettled(response: MediaGenerationResponse): Promise<void> {
    if (!deps.onGenerationSettled) return;
    try {
      await deps.onGenerationSettled(response);
    } catch {
      // Settlement hooks are observational; they must not change provider work results.
    }
  }
}

function mergeMediaGenerationArtifacts(
  existing: MediaGenerationArtifact[],
  incoming: MediaGenerationArtifact[],
): MediaGenerationArtifact[] {
  const order: string[] = [];
  const byId = new Map<string, MediaGenerationArtifact>();
  for (const artifact of existing) {
    if (!byId.has(artifact.id)) {
      order.push(artifact.id);
    }
    byId.set(artifact.id, artifact);
  }
  for (const artifact of incoming) {
    if (!byId.has(artifact.id)) {
      order.push(artifact.id);
    }
    byId.set(artifact.id, artifact);
  }
  return order.map((id) => byId.get(id)).filter((entry): entry is MediaGenerationArtifact => Boolean(entry));
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

const GROK_MEDIA_CAPABILITY_IDS: Partial<Record<MediaGenerationType, string>> = {
  image: 'grok.media.imagine_image',
  video: 'grok.media.imagine_video',
};

async function resolveMediaGenerationCapability(
  request: MediaGenerationRequest,
  reporter: WorkbenchCapabilityReporter | null,
  runtimeProfile: string | null,
): Promise<WorkbenchCapability | null> {
  if (isGrokVideoReadbackProbe(request)) {
    return null;
  }
  if (!reporter || request.transport !== 'browser') {
    return null;
  }
  const capabilityId = request.provider === 'gemini'
    ? GEMINI_MEDIA_CAPABILITY_IDS[request.mediaType]
    : request.provider === 'grok'
      ? GROK_MEDIA_CAPABILITY_IDS[request.mediaType]
      : null;
  if (!capabilityId) {
    return null;
  }
  const report = await reporter.listCapabilities({
    provider: request.provider,
    category: 'media',
    runtimeProfile,
    includeUnavailable: true,
    entrypoint: request.provider === 'grok' ? 'grok-imagine' : null,
    diagnostics: request.provider === 'grok' ? 'browser-state' : null,
    discoveryAction: request.provider === 'grok' && request.mediaType === 'video'
      ? 'grok-imagine-video-mode'
      : null,
  });
  const capability = report.capabilities.find((entry) => entry.id === capabilityId) ?? null;
  if (capability?.availability === 'available') {
    return capability;
  }
  throw new MediaGenerationExecutionError(
    'media_capability_unavailable',
    `${formatProviderLabel(request.provider)} browser ${request.mediaType} generation requires ${capabilityId}, but the capability is ${capability?.availability ?? 'not_visible'}. Run auracall capabilities --target ${request.provider}${request.provider === 'grok' ? ' --entrypoint grok-imagine --diagnostics browser-state' : ''} --json to inspect the current workbench state.`,
    {
      capabilityId,
      availability: capability?.availability ?? 'not_visible',
      providerLabels: capability?.providerLabels ?? [],
      source: capability?.source ?? null,
      observedAt: capability?.observedAt ?? null,
      workbenchCapability: capability ? formatCapabilityMetadata(capability) : null,
      inspectionCommand: `auracall capabilities --target ${request.provider}${request.provider === 'grok' ? ' --entrypoint grok-imagine --diagnostics browser-state' : ''} --json`,
      runtimeProfile,
      transport: request.transport,
    },
  );
}

function isGrokVideoReadbackProbe(request: MediaGenerationRequest): boolean {
  return request.provider === 'grok'
    && request.mediaType === 'video'
    && request.transport === 'browser'
    && request.metadata?.grokVideoReadbackProbe === true;
}

function formatProviderLabel(provider: string): string {
  return provider === 'grok' ? 'Grok' : provider === 'gemini' ? 'Gemini' : provider;
}

function formatCapabilityMetadata(capability: WorkbenchCapability): Record<string, unknown> {
  return {
    id: capability.id,
    availability: capability.availability,
    providerLabels: capability.providerLabels,
    source: capability.source,
    observedAt: capability.observedAt ?? null,
    metadata: capability.metadata ?? null,
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

function formatFailureMetadata(failure: MediaGenerationFailure): Record<string, unknown> {
  const details = failure.details ?? {};
  return {
    failureCode: failure.code,
    capabilityId: details.capabilityId ?? null,
    capabilityAvailability: details.availability ?? null,
    workbenchCapability: details.workbenchCapability ?? null,
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
