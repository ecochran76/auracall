import path from 'node:path';
import { BrowserAutomationClient } from '../browser/client.js';
import type { BrowserProviderPromptProgressEvent } from '../browser/providers/types.js';
import type { ConversationArtifact, FileRef } from '../browser/providers/domain.js';
import type { ResolvedUserConfig } from '../config.js';
import type {
  MediaGenerationArtifact,
  MediaGenerationExecutor,
  MediaGenerationExecutorInput,
  MediaGenerationTimelineEmitter,
  MediaGenerationTimelineEvent,
  MediaGenerationType,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';

const GEMINI_CAPABILITY_IDS: Record<'image' | 'music' | 'video', string> = {
  image: 'gemini.media.create_image',
  music: 'gemini.media.create_music',
  video: 'gemini.media.create_video',
};

const GEMINI_MUSIC_DEFAULT_DOWNLOAD_VARIANTS = [
  'VideoAudio with cover art',
  'Audio onlyMP3 track',
] as const;

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
  const capabilityId = GEMINI_CAPABILITY_IDS[request.mediaType];

  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'gemini' });
  const emitPromptProgress = async (event: BrowserProviderPromptProgressEvent): Promise<void> => {
    const timelineEvent = mapGeminiPromptProgressToTimelineEvent(event);
    if (!timelineEvent) {
      return;
    }
    await input.emitTimeline?.(timelineEvent);
  };
  const promptResult = await client.runPrompt({
    prompt: request.prompt,
    capabilityId,
    completionMode: 'prompt_submitted',
    noProject: true,
    timeoutMs,
    onProgress: emitPromptProgress,
  });
  const conversationId = normalizeNonEmpty(promptResult.conversationId) ?? extractGeminiConversationId(promptResult.url);
  const tabTargetId = normalizeNonEmpty(promptResult.tabTargetId);
  await input.emitTimeline?.({
    event: 'prompt_submitted',
    details: {
      capabilityId,
      conversationId: conversationId ?? null,
      tabTargetId: tabTargetId ?? null,
      url: promptResult.url ?? null,
    },
  });
  if (!conversationId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      `Gemini browser ${request.mediaType} generation completed without a conversation id for artifact readback.`,
      {
        url: promptResult.url ?? null,
      },
    );
  }
  if (!tabTargetId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      `Gemini browser ${request.mediaType} generation completed without a submitted tab target id for no-navigation artifact readback.`,
      {
        conversationId,
        url: promptResult.url ?? null,
      },
    );
  }

  const { artifacts, pollCount, lastReadbackError } = await waitForGeminiMediaArtifacts(
    client,
    conversationId,
    tabTargetId,
    promptResult.url ?? resolveGeminiConversationUrl(conversationId),
    request.mediaType,
    request.metadata,
    timeoutMs,
    input.emitTimeline,
  );
  if (artifacts.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_provider_timeout',
      `Gemini browser ${request.mediaType} generation submitted successfully, but no generated ${request.mediaType} artifact appeared before the timeout.`,
      {
        conversationId,
        timeoutMs,
        pollCount,
        lastReadbackError,
      },
    );
  }

  const materializationTargets = buildGeminiMaterializationTargets(artifacts, request.mediaType);
  const requestedCount = request.mediaType === 'music'
    ? materializationTargets.length
    : Math.max(1, Math.min(request.count ?? 1, materializationTargets.length));
  const materialized: MediaGenerationArtifact[] = [];
  for (const target of materializationTargets.slice(0, requestedCount)) {
    const listOptions = {
      configuredUrl: promptResult.url ?? resolveGeminiConversationUrl(conversationId),
      tabUrl: promptResult.url ?? resolveGeminiConversationUrl(conversationId),
      tabTargetId,
      preserveActiveTab: true,
      ...(target.downloadVariantLabel ? { downloadVariantLabel: target.downloadVariantLabel } : {}),
    };
    const file = await client.materializeConversationArtifact(conversationId, target.artifact, input.artifactDir, {
      listOptions,
    });
    if (!file) continue;
    await input.emitTimeline?.({
      event: 'artifact_materialized',
      details: {
        providerArtifactId: target.artifact.id,
        fileName: file.name || null,
        path: file.localPath ?? null,
        mimeType: file.mimeType ?? null,
        materialization: file.metadata?.materialization ?? null,
        downloadLabel: file.metadata?.downloadLabel ?? target.downloadVariantLabel ?? null,
        downloadVariant: file.metadata?.downloadVariant ?? inferGeminiMusicDownloadVariant(target.downloadVariantLabel) ?? null,
      },
    });
    materialized.push(mapGeminiFileToMediaArtifact(file, target.artifact, request.mediaType, materialized.length + 1));
  }
  if (materialized.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      `Gemini browser ${request.mediaType} generation exposed artifacts, but none could be materialized.`,
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
      executor: 'gemini-browser',
      conversationId,
      tabUrl: promptResult.url ?? null,
      tabTargetId,
      capabilityId,
      generatedArtifactCount: artifacts.length,
      artifactPollCount: pollCount,
    },
  };
}

interface GeminiMaterializationTarget {
  artifact: ConversationArtifact;
  downloadVariantLabel?: string | null;
}

function buildGeminiMaterializationTargets(
  artifacts: ConversationArtifact[],
  mediaType: MediaGenerationType,
): GeminiMaterializationTarget[] {
  if (mediaType !== 'music') {
    return artifacts.map((artifact) => ({ artifact }));
  }
  return artifacts.flatMap((artifact) => {
    const existingVariant = normalizeNonEmpty(artifact.metadata?.downloadVariant);
    if (existingVariant) {
      return [{ artifact }];
    }
    const options = normalizeGeminiDownloadOptions(artifact.metadata?.downloadOptions);
    let providerVariants = options.filter((label) => {
      const normalized = label.toLowerCase();
      return normalized !== 'download track' && normalized !== normalizeNonEmpty(artifact.metadata?.downloadLabel)?.toLowerCase();
    });
    if (providerVariants.length === 0 && artifact.metadata?.hasDownloadButton === true) {
      providerVariants = [...GEMINI_MUSIC_DEFAULT_DOWNLOAD_VARIANTS];
    }
    if (providerVariants.length <= 1) {
      return [{ artifact }];
    }
    return providerVariants.map((label) => {
      const variant = inferGeminiMusicDownloadVariant(label);
      return {
        artifact: {
          ...artifact,
          id: `${artifact.id}:${variant ?? sanitizeGeminiVariantId(label)}`,
          metadata: {
            ...(artifact.metadata ?? {}),
            downloadLabel: label,
            ...(variant ? { downloadVariant: variant } : {}),
            downloadOptions: options,
          },
        },
        downloadVariantLabel: label,
      };
    });
  });
}

function normalizeGeminiDownloadOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const options: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const label = normalizeNonEmpty(item);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(label);
  }
  return options;
}

function inferGeminiMusicDownloadVariant(label: unknown): string | null {
  const normalized = String(label ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (/\bmp3\b|audio only/.test(normalized)) return 'mp3';
  if (/cover art|album art|\bvideo\b/.test(normalized)) return 'video_with_album_art';
  return null;
}

function sanitizeGeminiVariantId(label: string): string {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'variant';
}

function mapGeminiPromptProgressToTimelineEvent(
  event: BrowserProviderPromptProgressEvent,
): Omit<MediaGenerationTimelineEvent, 'at'> | null {
  return {
    event: event.phase,
    details: normalizeTimelineProgressDetails(event.details),
  };
}

function normalizeTimelineProgressDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!details || typeof details !== 'object') {
    return {};
  }
  const normalized = { ...details };
  if (!normalizeNonEmpty(normalized.tabTargetId)) {
    const targetId = normalizeNonEmpty(normalized.targetId);
    if (targetId) {
      normalized.tabTargetId = targetId;
    }
  }
  return normalized;
}

async function waitForGeminiMediaArtifacts(
  client: BrowserAutomationClient,
  conversationId: string,
  tabTargetId: string,
  tabUrl: string,
  mediaType: 'image' | 'music' | 'video',
  metadata: Record<string, unknown> | null | undefined,
  timeoutMs: number,
  emitTimeline: MediaGenerationTimelineEmitter | undefined,
): Promise<{ artifacts: ConversationArtifact[]; pollCount: number; lastReadbackError?: string | null }> {
  const pollIntervalMs = resolveArtifactPollIntervalMs(metadata);
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let lastArtifacts: ConversationArtifact[] = [];
  let lastReadbackError: string | null = null;
  while (Date.now() <= deadline) {
    pollCount += 1;
    try {
      lastArtifacts = await client.readActiveConversationArtifacts(conversationId, {
        configuredUrl: tabUrl,
        tabUrl,
        tabTargetId,
        preserveActiveTab: true,
      });
      lastReadbackError = null;
      const matchingArtifacts = lastArtifacts.filter((artifact) => isMediaArtifact(artifact, mediaType));
      await emitTimeline?.({
        event: 'artifact_poll',
        details: {
          pollCount,
          artifactCount: lastArtifacts.length,
          imageArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'image')).length,
          musicArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'music')).length,
          videoArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'video')).length,
          lastReadbackError: null,
        },
      });
      if (matchingArtifacts.length > 0) {
        await emitTimeline?.({
          event: mediaVisibleEvent(mediaType),
          details: {
            pollCount,
            generatedArtifactCount: matchingArtifacts.length,
            ...generatedCountDetails(mediaType, matchingArtifacts.length),
            artifactIds: matchingArtifacts.map((artifact) => artifact.id),
          },
        });
        return { artifacts: matchingArtifacts, pollCount, lastReadbackError };
      }
    } catch (error) {
      lastReadbackError = error instanceof Error ? error.message : String(error);
      await emitTimeline?.({
        event: 'artifact_poll',
        details: {
          pollCount,
          artifactCount: lastArtifacts.length,
          imageArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'image')).length,
          musicArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'music')).length,
          videoArtifactCount: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, 'video')).length,
          lastReadbackError,
        },
      });
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
  return { artifacts: lastArtifacts.filter((artifact) => isMediaArtifact(artifact, mediaType)), pollCount, lastReadbackError };
}

function resolveGeminiConversationUrl(conversationId: string): string {
  return `https://gemini.google.com/app/${encodeURIComponent(conversationId)}`;
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

function isMediaArtifact(artifact: ConversationArtifact, mediaType: 'image' | 'music' | 'video'): boolean {
  if (mediaType === 'image') {
    return artifact.kind === 'image';
  }
  if (mediaType === 'music') {
    return artifact.kind === 'generated' && isGeminiMusicArtifact(artifact);
  }
  return artifact.kind === 'generated' && artifact.metadata?.mediaType === 'video';
}

function isGeminiMusicArtifact(artifact: ConversationArtifact): boolean {
  const metadata = artifact.metadata ?? {};
  if (metadata.mediaType === 'music') return true;
  const fields = [
    metadata.fileName,
    metadata.downloadLabel,
    metadata.shareLabel,
    metadata.playLabel,
    metadata.downloadVariant,
    artifact.title,
    artifact.uri,
  ].map((value) => String(value ?? '').toLowerCase());
  return fields.some((value) =>
    /\b(mp3|track|music|song|remix|audio)\b/.test(value) ||
    /\.(mp3|m4a|wav|aac|flac|ogg)(?:$|[?#])/.test(value) ||
    value.includes('with album art')
  );
}

function mediaVisibleEvent(mediaType: 'image' | 'music' | 'video'): 'image_visible' | 'music_visible' | 'video_visible' {
  if (mediaType === 'image') return 'image_visible';
  if (mediaType === 'music') return 'music_visible';
  return 'video_visible';
}

function generatedCountDetails(mediaType: 'image' | 'music' | 'video', count: number): Record<string, number> {
  if (mediaType === 'image') return { generatedImageCount: count };
  if (mediaType === 'music') return { generatedMusicCount: count };
  return { generatedVideoCount: count };
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
    id: file.id || artifact.id || `gemini_${mediaType}_${ordinal}`,
    type: mediaType,
    mimeType: file.mimeType ?? null,
    fileName: file.name || (localPath ? path.basename(localPath) : fallbackGeminiFileName(mediaType, ordinal)),
    path: localPath,
    uri: localPath ? `file://${localPath}` : file.remoteUrl ?? artifact.uri ?? null,
    width: numberOrNull(metadata.width),
    height: numberOrNull(metadata.height),
    metadata,
  };
}

function fallbackGeminiFileName(mediaType: MediaGenerationType, ordinal: number): string {
  if (mediaType === 'video') return `gemini-video-${ordinal}.mp4`;
  if (mediaType === 'music') return `gemini-music-${ordinal}.mp4`;
  return `gemini-image-${ordinal}.png`;
}

function normalizeNonEmpty(value: unknown): string | null {
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
