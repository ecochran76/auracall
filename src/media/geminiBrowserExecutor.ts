import path from 'node:path';
import { BrowserAutomationClient } from '../browser/client.js';
import type { ConversationArtifact, FileRef } from '../browser/providers/domain.js';
import type { ResolvedUserConfig } from '../config.js';
import type {
  MediaGenerationArtifact,
  MediaGenerationExecutor,
  MediaGenerationExecutorInput,
  MediaGenerationType,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';

const GEMINI_IMAGE_CAPABILITY_ID = 'gemini.media.create_image';

export function createGeminiBrowserMediaGenerationExecutor(userConfig: ResolvedUserConfig): MediaGenerationExecutor {
  return async (input) => executeGeminiBrowserMediaGeneration(input, userConfig);
}

async function executeGeminiBrowserMediaGeneration(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const { request } = input;
  const timeoutMs = resolveMediaTimeoutMs(request.mediaType, request.metadata);
  if (request.provider !== 'gemini' || request.transport !== 'browser') {
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      'Only Gemini browser media generation is implemented by this executor.',
      {
        provider: request.provider,
        transport: request.transport ?? null,
        mediaType: request.mediaType,
      },
    );
  }
  if (request.mediaType !== 'image') {
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      `Gemini browser ${request.mediaType} generation is not implemented yet.`,
      {
        provider: request.provider,
        transport: request.transport,
        mediaType: request.mediaType,
      },
    );
  }

  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'gemini' });
  const promptResult = await client.runPrompt({
    prompt: request.prompt,
    capabilityId: GEMINI_IMAGE_CAPABILITY_ID,
    completionMode: 'prompt_submitted',
    noProject: true,
    timeoutMs,
  });
  const conversationId = normalizeNonEmpty(promptResult.conversationId) ?? extractGeminiConversationId(promptResult.url);
  if (!conversationId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'Gemini browser image generation completed without a conversation id for artifact readback.',
      {
        url: promptResult.url ?? null,
      },
    );
  }

  const { imageArtifacts, pollCount } = await waitForGeminiImageArtifacts(
    client,
    conversationId,
    request.metadata,
    timeoutMs,
  );
  if (imageArtifacts.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_provider_timeout',
      'Gemini browser image generation submitted successfully, but no generated image artifact appeared before the timeout.',
      {
        conversationId,
        timeoutMs,
        pollCount,
      },
    );
  }

  const requestedCount = Math.max(1, Math.min(request.count ?? 1, imageArtifacts.length));
  const materialized: MediaGenerationArtifact[] = [];
  for (const artifact of imageArtifacts.slice(0, requestedCount)) {
    const file = await client.materializeConversationArtifact(conversationId, artifact, input.artifactDir);
    if (!file) continue;
    materialized.push(mapGeminiFileToMediaArtifact(file, artifact, request.mediaType, materialized.length + 1));
  }
  if (materialized.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Gemini browser image generation exposed artifacts, but none could be materialized.',
      {
        conversationId,
        artifactIds: imageArtifacts.map((artifact) => artifact.id),
      },
    );
  }

  return {
    artifacts: materialized,
    model: request.model ?? null,
    metadata: {
      executor: 'gemini-browser',
      conversationId,
      tabUrl: promptResult.url ?? null,
      capabilityId: GEMINI_IMAGE_CAPABILITY_ID,
      generatedArtifactCount: imageArtifacts.length,
      artifactPollCount: pollCount,
    },
  };
}

async function waitForGeminiImageArtifacts(
  client: BrowserAutomationClient,
  conversationId: string,
  metadata: Record<string, unknown> | null | undefined,
  timeoutMs: number,
): Promise<{ imageArtifacts: ConversationArtifact[]; pollCount: number }> {
  const pollIntervalMs = resolveArtifactPollIntervalMs(metadata);
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let lastArtifacts: ConversationArtifact[] = [];
  while (Date.now() <= deadline) {
    pollCount += 1;
    const context = await client.getConversationContext(conversationId, { refresh: true });
    lastArtifacts = context.artifacts ?? [];
    const imageArtifacts = lastArtifacts.filter(isImageArtifact);
    if (imageArtifacts.length > 0) {
      return { imageArtifacts, pollCount };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
  return { imageArtifacts: lastArtifacts.filter(isImageArtifact), pollCount };
}

function resolveMediaTimeoutMs(mediaType: MediaGenerationType, metadata: Record<string, unknown> | null | undefined): number {
  const candidate = metadata?.timeoutMs;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(30_000, Math.min(candidate, 600_000));
  }
  return mediaType === 'image' ? 300_000 : 600_000;
}

function resolveArtifactPollIntervalMs(metadata: Record<string, unknown> | null | undefined): number {
  const candidate = metadata?.artifactPollIntervalMs;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(250, Math.min(candidate, 30_000));
  }
  return 5_000;
}

function isImageArtifact(artifact: ConversationArtifact): boolean {
  return artifact.kind === 'image';
}

function mapGeminiFileToMediaArtifact(
  file: FileRef,
  artifact: ConversationArtifact,
  mediaType: MediaGenerationType,
  ordinal: number,
): MediaGenerationArtifact {
  const localPath = normalizeNonEmpty(file.localPath);
  const metadata: Record<string, unknown> = {
    ...(artifact.metadata ?? {}),
    ...(file.metadata ?? {}),
    providerArtifactId: artifact.id,
    providerArtifactTitle: artifact.title,
    remoteUrl: file.remoteUrl ?? artifact.uri ?? null,
  };
  return {
    id: file.id || artifact.id || `gemini_image_${ordinal}`,
    type: mediaType,
    mimeType: file.mimeType ?? null,
    fileName: file.name || (localPath ? path.basename(localPath) : `gemini-image-${ordinal}.png`),
    path: localPath,
    uri: localPath ? `file://${localPath}` : file.remoteUrl ?? artifact.uri ?? null,
    width: numberOrNull(metadata.width),
    height: numberOrNull(metadata.height),
    metadata,
  };
}

function normalizeNonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function extractGeminiConversationId(value: string | null | undefined): string | null {
  const raw = normalizeNonEmpty(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/app\/([^/?#]+)/i);
    return match?.[1] ?? null;
  } catch {
    const match = raw.match(/(?:^|\/)app\/([^/?#]+)/i);
    return match?.[1] ?? null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
