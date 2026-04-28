import { BrowserAutomationClient } from '../browser/client.js';
import type { ConversationArtifact, FileRef } from '../browser/providers/domain.js';
import type { BrowserProviderPromptProgressEvent } from '../browser/providers/types.js';
import type { ResolvedUserConfig } from '../config.js';
import type {
  MediaGenerationArtifact,
  MediaGenerationExecutor,
  MediaGenerationExecutorInput,
  MediaGenerationTimelineEmitter,
  MediaGenerationTimelineEvent,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';

export const CHATGPT_IMAGE_CAPABILITY_ID = 'chatgpt.media.create_image';

export function createChatgptBrowserMediaGenerationExecutor(userConfig: ResolvedUserConfig): MediaGenerationExecutor {
  return async (input) => executeChatgptBrowserMediaGeneration(input, userConfig);
}

async function executeChatgptBrowserMediaGeneration(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const { request } = input;
  const timeoutMs = resolveMediaTimeoutMs(request.metadata);
  if (request.provider !== 'chatgpt' || request.transport !== 'browser') {
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      'Only ChatGPT browser media generation is implemented by this executor.',
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
      `ChatGPT browser ${request.mediaType} generation is not implemented yet.`,
      {
        provider: request.provider,
        transport: request.transport,
        mediaType: request.mediaType,
      },
    );
  }

  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'chatgpt' });
  const emitPromptProgress = async (event: BrowserProviderPromptProgressEvent): Promise<void> => {
    const timelineEvent = mapPromptProgressToTimelineEvent(event);
    if (!timelineEvent) return;
    await input.emitTimeline?.(timelineEvent);
  };
  const promptResult = await client.runPrompt({
    prompt: request.prompt,
    capabilityId: CHATGPT_IMAGE_CAPABILITY_ID,
    completionMode: 'prompt_submitted',
    noProject: true,
    timeoutMs,
    onProgress: emitPromptProgress,
  }, {
    preserveActiveTab: true,
    mutationSourcePrefix: 'media:chatgpt-image',
  });
  const conversationId = normalizeNonEmpty(promptResult.conversationId) ?? extractChatgptConversationId(promptResult.url);
  const tabTargetId = normalizeNonEmpty(promptResult.tabTargetId);
  const tabUrl = normalizeNonEmpty(promptResult.url) ?? (conversationId ? resolveChatgptConversationUrl(conversationId) : null);
  await input.emitTimeline?.({
    event: 'prompt_submitted',
    details: {
      capabilityId: CHATGPT_IMAGE_CAPABILITY_ID,
      conversationId: conversationId ?? null,
      tabTargetId,
      url: tabUrl,
    },
  });
  if (!conversationId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'ChatGPT browser image generation completed without a conversation id for artifact readback.',
      {
        url: promptResult.url ?? null,
      },
    );
  }
  if (!tabTargetId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'ChatGPT browser image generation completed without a submitted tab target id for no-navigation artifact readback.',
      {
        conversationId,
        url: promptResult.url ?? null,
      },
    );
  }

  const { artifacts, pollCount, lastReadbackError } = await waitForChatgptImageArtifacts(
    client,
    conversationId,
    tabTargetId,
    tabUrl ?? resolveChatgptConversationUrl(conversationId),
    timeoutMs,
    input.emitTimeline,
  );
  if (artifacts.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_provider_timeout',
      'ChatGPT browser image generation submitted successfully, but no generated image artifact appeared before the timeout.',
      {
        conversationId,
        timeoutMs,
        pollCount,
        lastReadbackError,
      },
    );
  }

  const requestedCount = Math.max(1, Math.min(request.count ?? 1, artifacts.length));
  const materialized: MediaGenerationArtifact[] = [];
  for (const artifact of artifacts.slice(0, requestedCount)) {
    const file = await client.materializeConversationArtifact(conversationId, artifact, input.artifactDir, {
      listOptions: {
        configuredUrl: tabUrl ?? resolveChatgptConversationUrl(conversationId),
        tabUrl: tabUrl ?? resolveChatgptConversationUrl(conversationId),
        tabTargetId,
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:chatgpt-image',
      },
    });
    if (!file) continue;
    await input.emitTimeline?.({
      event: 'artifact_materialized',
      details: {
        providerArtifactId: artifact.id,
        fileName: file.name || null,
        path: file.localPath ?? null,
        mimeType: file.mimeType ?? null,
        materialization: file.metadata?.materialization ?? null,
      },
    });
    materialized.push(mapChatgptFileToMediaArtifact(file, artifact, materialized.length + 1));
  }
  if (materialized.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'ChatGPT browser image generation exposed artifacts, but none could be materialized.',
      {
        conversationId,
        artifactIds: artifacts.map((artifact) => artifact.id),
      },
    );
  }

  return {
    artifacts: materialized,
    model: request.model ?? null,
    metadata: {
      executor: 'chatgpt-browser',
      conversationId,
      tabUrl: tabUrl ?? null,
      tabTargetId,
      capabilityId: CHATGPT_IMAGE_CAPABILITY_ID,
      generatedArtifactCount: artifacts.length,
      artifactPollCount: pollCount,
    },
  };
}

async function waitForChatgptImageArtifacts(
  client: BrowserAutomationClient,
  conversationId: string,
  tabTargetId: string,
  tabUrl: string,
  timeoutMs: number,
  emitTimeline?: MediaGenerationTimelineEmitter,
): Promise<{ artifacts: ConversationArtifact[]; pollCount: number; lastReadbackError?: string | null }> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let lastReadbackError: string | null = null;
  while (Date.now() < deadline) {
    pollCount += 1;
    try {
      const artifacts = await client.readActiveConversationArtifacts(conversationId, {
        configuredUrl: tabUrl,
        tabUrl,
        tabTargetId,
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:chatgpt-image',
      });
      const imageArtifacts = artifacts.filter(isChatgptImageArtifact);
      await emitTimeline?.({
        event: imageArtifacts.length > 0 ? 'image_visible' : 'artifact_poll',
        details: {
          conversationId,
          pollCount,
          artifactCount: artifacts.length,
          imageArtifactCount: imageArtifacts.length,
        },
      });
      if (imageArtifacts.length > 0) {
        return { artifacts: imageArtifacts, pollCount, lastReadbackError };
      }
    } catch (error) {
      lastReadbackError = error instanceof Error ? error.message : String(error);
      await emitTimeline?.({
        event: 'artifact_poll',
        details: {
          conversationId,
          pollCount,
          lastReadbackError,
        },
      });
    }
    await delay(resolvePollIntervalMs(pollCount));
  }
  return { artifacts: [], pollCount, lastReadbackError };
}

function isChatgptImageArtifact(artifact: ConversationArtifact): boolean {
  if (artifact.kind === 'image') return true;
  const mimeType = normalizeNonEmpty(artifact.metadata?.mimeType) ?? normalizeNonEmpty(artifact.metadata?.contentType);
  if (mimeType?.toLowerCase().startsWith('image/')) return true;
  const uri = normalizeNonEmpty(artifact.uri) ?? normalizeNonEmpty(artifact.metadata?.remoteUrl);
  return Boolean(uri && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(uri));
}

function mapPromptProgressToTimelineEvent(
  event: BrowserProviderPromptProgressEvent,
): Omit<MediaGenerationTimelineEvent, 'at'> | null {
  return {
    event: event.phase,
    details: normalizeTimelineProgressDetails(event.details),
  };
}

function mapChatgptFileToMediaArtifact(
  file: FileRef,
  providerArtifact: ConversationArtifact,
  index: number,
): MediaGenerationArtifact {
  const mimeType = file.mimeType ?? normalizeNonEmpty(providerArtifact.metadata?.mimeType) ?? 'image/png';
  return {
    id: file.id || providerArtifact.id || `chatgpt-image-${index}`,
    type: 'image',
    mimeType,
    fileName: file.name || `chatgpt-image-${index}.${inferExtensionFromMimeType(mimeType)}`,
    path: file.localPath ?? null,
    uri: file.localPath ? `file://${file.localPath}` : (file.remoteUrl ?? providerArtifact.uri ?? null),
    metadata: {
      provider: 'chatgpt',
      providerArtifactId: providerArtifact.id,
      remoteUrl: file.remoteUrl ?? providerArtifact.uri ?? null,
      ...(file.metadata ?? {}),
      ...(providerArtifact.metadata ?? {}),
    },
  };
}

function resolveMediaTimeoutMs(metadata: Record<string, unknown> | null | undefined): number {
  const configured = resolvePositiveInteger(metadata?.timeoutMs ?? metadata?.browserTimeoutMs);
  return configured ?? 5 * 60_000;
}

function resolvePollIntervalMs(pollCount: number): number {
  if (pollCount < 10) return 1_000;
  if (pollCount < 40) return 2_000;
  return 5_000;
}

function extractChatgptConversationId(url: unknown): string | null {
  const value = normalizeNonEmpty(url);
  if (!value) return null;
  const match = /\/c\/([^/?#]+)/.exec(value);
  return match?.[1] ?? null;
}

function resolveChatgptConversationUrl(conversationId: string): string {
  return `https://chatgpt.com/c/${encodeURIComponent(conversationId)}`;
}

function inferExtensionFromMimeType(mimeType: string | null | undefined): string {
  const normalized = String(mimeType ?? '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  return 'png';
}

function resolvePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function normalizeNonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeTimelineProgressDetails(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
