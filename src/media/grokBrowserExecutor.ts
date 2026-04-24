import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserAutomationClient } from '../browser/client.js';
import type { BrowserProviderPromptProgressEvent } from '../browser/providers/types.js';
import type { ResolvedUserConfig } from '../config.js';
import {
  type MediaGenerationArtifact,
  type MediaGenerationExecutor,
  type MediaGenerationExecutorInput,
  type MediaGenerationTimelineEvent,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';

const GROK_IMAGE_CAPABILITY_ID = 'grok.media.imagine_image';
const GROK_IMAGINE_URL = 'https://grok.com/imagine';

type GrokImagineEvidence = {
  runState: string | null;
  pending: boolean;
  terminalImage: boolean;
  terminalVideo: boolean;
  blocked: boolean;
  accountGated: boolean;
  media: {
    images: Array<Record<string, unknown>>;
    videos: Array<Record<string, unknown>>;
    urls: string[];
  };
};

export function createGrokBrowserMediaGenerationExecutor(userConfig: ResolvedUserConfig): MediaGenerationExecutor {
  return async (input) => executeGrokBrowserMediaGeneration(input, userConfig);
}

async function executeGrokBrowserMediaGeneration(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const { request } = input;
  const timeoutMs = resolveMediaTimeoutMs(request.metadata);
  if (request.provider !== 'grok' || request.transport !== 'browser') {
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      'Only Grok browser media generation is implemented by this executor.',
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
      `Grok browser ${request.mediaType} generation is not implemented yet.`,
      {
        provider: request.provider,
        transport: request.transport,
        mediaType: request.mediaType,
      },
    );
  }

  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'grok' });
  const emitPromptProgress = async (event: BrowserProviderPromptProgressEvent): Promise<void> => {
    const timelineEvent = mapPromptProgressToTimelineEvent(event);
    if (!timelineEvent) return;
    await input.emitTimeline?.(timelineEvent);
  };
  const promptResult = await client.runPrompt({
    prompt: request.prompt,
    capabilityId: GROK_IMAGE_CAPABILITY_ID,
    completionMode: 'prompt_submitted',
    configuredUrl: GROK_IMAGINE_URL,
    timeoutMs,
    onProgress: emitPromptProgress,
  }, {
    configuredUrl: GROK_IMAGINE_URL,
    preserveActiveTab: true,
    mutationSourcePrefix: 'media:grok-imagine',
  });
  const tabTargetId = normalizeNonEmpty(promptResult.tabTargetId);
  const tabUrl = normalizeNonEmpty(promptResult.url) ?? GROK_IMAGINE_URL;
  await input.emitTimeline?.({
    event: 'prompt_submitted',
    details: {
      capabilityId: GROK_IMAGE_CAPABILITY_ID,
      tabTargetId,
      url: tabUrl,
    },
  });
  if (!tabTargetId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'Grok browser image generation completed without a submitted tab target id for no-navigation readback.',
      {
        url: tabUrl,
      },
    );
  }

  const { evidence, pollCount } = await waitForGrokImagineTerminalImage(
    client,
    tabTargetId,
    tabUrl,
    request.metadata,
    timeoutMs,
    input.emitTimeline,
  );
  const imageEntries = evidence.media.images.filter((entry) => normalizeNonEmpty(entry.src) || normalizeNonEmpty(entry.href));
  const requestedCount = Math.max(1, Math.min(request.count ?? 1, imageEntries.length));
  const artifacts: MediaGenerationArtifact[] = [];
  for (const entry of imageEntries.slice(0, requestedCount)) {
    const artifact = await materializeGrokImageEntry(entry, input.artifactDir, artifacts.length + 1);
    if (!artifact) continue;
    artifacts.push(artifact);
    await input.emitTimeline?.({
      event: 'artifact_materialized',
      details: {
        providerArtifactId: artifact.id,
        path: artifact.path ?? null,
        uri: artifact.uri ?? null,
        mimeType: artifact.mimeType ?? null,
        materialization: artifact.metadata?.materialization ?? null,
      },
    });
  }
  if (artifacts.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok browser image generation reached terminal image state, but no generated image artifact could be materialized.',
      {
        tabUrl,
        mediaUrlCount: evidence.media.urls.length,
      },
    );
  }

  return {
    artifacts,
    model: request.model ?? null,
    metadata: {
      executor: 'grok-browser',
      tabUrl,
      tabTargetId,
      capabilityId: GROK_IMAGE_CAPABILITY_ID,
      runState: evidence.runState,
      artifactPollCount: pollCount,
      generatedArtifactCount: artifacts.length,
    },
  };
}

async function waitForGrokImagineTerminalImage(
  client: BrowserAutomationClient,
  tabTargetId: string,
  tabUrl: string,
  metadata: Record<string, unknown> | null | undefined,
  timeoutMs: number,
  emitTimeline: MediaGenerationExecutorInput['emitTimeline'],
): Promise<{ evidence: GrokImagineEvidence; pollCount: number }> {
  const pollIntervalMs = resolveArtifactPollIntervalMs(metadata);
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let lastEvidence: GrokImagineEvidence | null = null;
  while (Date.now() <= deadline) {
    pollCount += 1;
    const signature = await client.getFeatureSignature({
      configuredUrl: tabUrl,
      tabUrl,
      tabTargetId,
      preserveActiveTab: true,
    });
    const evidence = parseGrokImagineEvidence(signature);
    lastEvidence = evidence;
    await emitTimeline?.({
      event: 'run_state_observed',
      details: {
        pollCount,
        runState: evidence.runState,
        pending: evidence.pending,
        terminalImage: evidence.terminalImage,
        terminalVideo: evidence.terminalVideo,
        blocked: evidence.blocked,
        accountGated: evidence.accountGated,
        imageCount: evidence.media.images.length,
        videoCount: evidence.media.videos.length,
        mediaUrlCount: evidence.media.urls.length,
      },
    });
    if (evidence.blocked || evidence.accountGated) {
      throw new MediaGenerationExecutionError(
        'media_generation_provider_blocked',
        `Grok Imagine reported ${evidence.runState ?? (evidence.accountGated ? 'account_gated' : 'blocked')} after prompt submission.`,
        {
          tabUrl,
          runState: evidence.runState,
          accountGated: evidence.accountGated,
          blocked: evidence.blocked,
        },
      );
    }
    if (evidence.terminalImage && evidence.media.images.length > 0) {
      await emitTimeline?.({
        event: 'image_visible',
        details: {
          pollCount,
          generatedArtifactCount: evidence.media.images.length,
          mediaUrlCount: evidence.media.urls.length,
        },
      });
      return { evidence, pollCount };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
  throw new MediaGenerationExecutionError(
    'media_generation_provider_timeout',
    'Grok browser image generation submitted successfully, but no terminal generated image appeared before the timeout.',
    {
      tabUrl,
      timeoutMs,
      pollCount,
      lastRunState: lastEvidence?.runState ?? null,
      pending: lastEvidence?.pending ?? null,
    },
  );
}

async function materializeGrokImageEntry(
  entry: Record<string, unknown>,
  artifactDir: string,
  ordinal: number,
): Promise<MediaGenerationArtifact | null> {
  const remoteUrl = normalizeNonEmpty(entry.src) ?? normalizeNonEmpty(entry.href);
  if (!remoteUrl || remoteUrl.startsWith('blob:') || remoteUrl.startsWith('data:')) {
    return null;
  }
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    return null;
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `grok-imagine-${ordinal}.${extension}`;
  const filePath = path.join(artifactDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(filePath, bytes);
  return {
    id: `grok_imagine_image_${ordinal}`,
    type: 'image',
    mimeType,
    fileName,
    path: filePath,
    uri: `file://${filePath}`,
    width: numberOrNull(entry.width),
    height: numberOrNull(entry.height),
    metadata: {
      providerArtifactId: `grok_imagine_image_${ordinal}`,
      remoteUrl,
      materialization: 'remote-media-fetch',
    },
  };
}

function parseGrokImagineEvidence(signature: string | null | undefined): GrokImagineEvidence {
  try {
    const parsed = signature ? JSON.parse(signature) as { imagine?: Record<string, unknown> } : {};
    const imagine = parsed.imagine && typeof parsed.imagine === 'object' ? parsed.imagine : {};
    const mediaRecord = imagine.media && typeof imagine.media === 'object' && !Array.isArray(imagine.media)
      ? imagine.media as Record<string, unknown>
      : {};
    return {
      runState: normalizeNonEmpty(imagine.run_state),
      pending: imagine.pending === true,
      terminalImage: imagine.terminal_image === true,
      terminalVideo: imagine.terminal_video === true,
      blocked: imagine.blocked === true,
      accountGated: imagine.account_gated === true,
      media: {
        images: collectRecordArray(mediaRecord.images),
        videos: collectRecordArray(mediaRecord.videos),
        urls: Array.isArray(mediaRecord.urls)
          ? mediaRecord.urls.map((entry) => String(entry ?? '').trim()).filter(Boolean)
          : [],
      },
    };
  } catch {
    return {
      runState: null,
      pending: false,
      terminalImage: false,
      terminalVideo: false,
      blocked: false,
      accountGated: false,
      media: { images: [], videos: [], urls: [] },
    };
  }
}

function mapPromptProgressToTimelineEvent(
  event: BrowserProviderPromptProgressEvent,
): Omit<MediaGenerationTimelineEvent, 'at'> | null {
  return {
    event: event.phase,
    details: event.details ?? {},
  };
}

function resolveMediaTimeoutMs(metadata: Record<string, unknown> | null | undefined): number {
  const candidate = metadata?.timeoutMs;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(30_000, Math.min(candidate, 600_000));
  }
  return 300_000;
}

function resolveArtifactPollIntervalMs(metadata: Record<string, unknown> | null | undefined): number {
  const candidate = metadata?.artifactPollIntervalMs;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(250, Math.min(candidate, 30_000));
  }
  return 5_000;
}

function collectRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
}

function normalizeNonEmpty(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
