import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { BrowserAutomationClient } from '../browser/client.js';
import type { FileRef } from '../browser/providers/domain.js';
import type { BrowserProviderPromptProgressEvent } from '../browser/providers/types.js';
import type { ChromeClient } from '../browser/types.js';
import { armDownloadCapture, waitForDownloadCapture } from '../browser/service/ui.js';
import { connectToChromeTarget } from '../../packages/browser-service/src/chromeLifecycle.js';
import type { ResolvedUserConfig } from '../config.js';
import {
  type MediaGenerationArtifact,
  type MediaGenerationExecutor,
  type MediaGenerationExecutorInput,
  type MediaGenerationTimelineEvent,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';

const GROK_IMAGE_CAPABILITY_ID = 'grok.media.imagine_image';
const GROK_VIDEO_CAPABILITY_ID = 'grok.media.imagine_video';
const GROK_IMAGINE_URL = 'https://grok.com/imagine';

type GrokImagineEvidence = {
  href: string | null;
  runState: string | null;
  pending: boolean;
  terminalImage: boolean;
  terminalVideo: boolean;
  blocked: boolean;
  accountGated: boolean;
  media: {
    images: Array<Record<string, unknown>>;
    videos: Array<Record<string, unknown>>;
    visibleTiles: Array<Record<string, unknown>>;
    urls: string[];
  };
};

type GrokImagineEvidenceSummary = {
  tabUrl: string;
  runState: string | null;
  pending: boolean | null;
  terminalImage: boolean | null;
  terminalVideo: boolean | null;
  imageCount: number | null;
  generatedImageCount: number | null;
  publicGalleryImageCount: number | null;
  visibleTileCount: number | null;
  publicGalleryVisibleTileCount: number | null;
  mediaUrlCount: number | null;
  providerHref: string | null;
  templateRoute: boolean;
};

export const GROK_VIDEO_POST_SUBMIT_ACCEPTANCE_CONTRACT = {
  pendingSignal:
    'After prompt submission, pending is true when Grok Imagine reports pending/generating/progress state before terminal media.',
  terminalVideoSignal:
    'Terminal video requires terminal_video=true plus at least one generated, non-public video media entry or selected generated video tile.',
  generatedVideoIdentity:
    'Generated video identity must come from provider account media, not imagine-public.x.ai gallery/template media.',
  materialization:
    'A video artifact is materializable when a generated video entry/tile has src/href media bytes or a visible download/open control is present for the selected generated item.',
  failureCases: [
    'account_gated',
    'blocked',
    'terminal_public_template_without_generated_video',
    'terminal_video_without_materialization_candidate',
    'timeout_without_terminal_video',
  ],
} as const;

export interface GrokImagineVideoAcceptanceEvaluation {
  pending: boolean;
  terminalVideo: boolean;
  generatedVideoCount: number;
  selectedGeneratedVideoCount: number;
  publicGalleryVideoCount: number;
  downloadControlCount: number;
  materializationCandidateCount: number;
  publicTemplateWithoutGeneratedVideo: boolean;
  ready: boolean;
  failureReason: string | null;
}

export interface GrokImagineVideoMaterializationCandidate {
  source: 'generated-video' | 'selected-tile' | 'download-control';
  remoteUrl: string | null;
  mimeType: string | null;
  selected: boolean;
}

export type GrokImagineVideoReadbackDecision =
  | 'pending'
  | 'ready'
  | 'failed'
  | 'continue';

export interface GrokImagineVideoReadbackEvaluation extends GrokImagineVideoAcceptanceEvaluation {
  decision: GrokImagineVideoReadbackDecision;
  pollCount: number;
  runState: string | null;
  providerHref: string | null;
  visibleTileCount: number;
  mediaUrlCount: number;
  materializationCandidate: GrokImagineVideoMaterializationCandidate | null;
  failureReason: string | null;
  timelineDetails: Record<string, unknown>;
  runStateTimelineEvent: Omit<MediaGenerationTimelineEvent, 'at'>;
  terminalTimelineEvent: Omit<MediaGenerationTimelineEvent, 'at'> | null;
}

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
  if (request.mediaType === 'video') {
    return executeGrokBrowserVideoGeneration(input, userConfig);
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
  const requestedVisibleTileCount = resolveGrokImageRequestedVisibleTileCount(request.count, request.metadata);
  const activeFiles = await client.materializeActiveMediaArtifacts({
    capabilityId: GROK_IMAGE_CAPABILITY_ID,
    mediaType: 'image',
    maxItems: requestedVisibleTileCount,
    compareFullQuality: true,
    fullQualityActivationContext: 'post-submit',
  }, input.artifactDir, {
    configuredUrl: tabUrl,
    tabUrl,
    tabTargetId,
    preserveActiveTab: true,
    mutationSourcePrefix: 'media:grok-imagine',
  }).catch(() => []);
  const activeMaterializationDiagnostics = extractGrokMaterializationDiagnostics(activeFiles);
  await input.emitTimeline?.({
    event: 'artifact_poll',
    details: {
      materializationSource: 'grok-browser-service',
      requestedVisibleTileCount,
      activeFileCount: activeFiles.length,
      visibleFileCount: activeFiles.filter((file) => file.metadata?.materialization === 'visible-tile-browser-capture').length,
      fullQualityFileCount: activeFiles.filter((file) => file.metadata?.materialization === 'download-button' ||
        file.metadata?.materialization === 'download-button-anchor-fetch').length,
      grokMaterializationDiagnostics: activeMaterializationDiagnostics,
    },
  });
  const activeArtifacts = activeFiles.map((file, index) => mapGrokFileToMediaArtifact(file, index + 1));
  const artifacts: MediaGenerationArtifact[] = [];
  for (const artifact of activeArtifacts) {
    artifacts.push(artifact);
    await input.emitTimeline?.({
      event: 'artifact_materialized',
      details: {
        providerArtifactId: artifact.id,
        path: artifact.path ?? null,
        uri: artifact.uri ?? null,
        mimeType: artifact.mimeType ?? null,
        materialization: artifact.metadata?.materialization ?? null,
        visibleTile: artifact.metadata?.materialization === 'visible-tile-browser-capture',
        fullQualityDiffersFromPreview: artifact.metadata?.fullQualityDiffersFromPreview ?? null,
      },
    });
  }
  const imageEntries = evidence.media.images
    .filter(isGeneratedGrokImageEntry)
    .filter((entry) => normalizeNonEmpty(entry.src) || normalizeNonEmpty(entry.href));
  const seenFallbackRemoteUrls = new Set(
    artifacts
      .map((artifact) => normalizeNonEmpty(artifact.metadata?.remoteUrl))
      .filter((value): value is string => Boolean(value)),
  );
  for (const entry of imageEntries) {
    if (artifacts.length >= requestedVisibleTileCount) break;
    const remoteUrl = normalizeNonEmpty(entry.src) ?? normalizeNonEmpty(entry.href);
    if (remoteUrl && seenFallbackRemoteUrls.has(remoteUrl)) continue;
    const artifact = await materializeGrokImageEntry(entry, input.artifactDir, artifacts.length + 1);
    if (!artifact) continue;
    const materializedRemoteUrl = normalizeNonEmpty(artifact.metadata?.remoteUrl);
    if (materializedRemoteUrl) {
      seenFallbackRemoteUrls.add(materializedRemoteUrl);
    }
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
      requestedVisibleTileCount,
      visibleTileMaterializationLimit: requestedVisibleTileCount,
      grokMaterializationDiagnostics: activeMaterializationDiagnostics,
    },
  };
}

async function executeGrokBrowserVideoSkeleton(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const audit = extractGrokVideoModeAudit(input.workbenchCapability?.metadata);
  await input.emitTimeline?.({
    event: 'capability_selected',
    details: {
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      mode: 'Video',
      discoveryAction: 'grok-imagine-video-mode',
      source: input.workbenchCapability?.source ?? null,
      observedAt: input.workbenchCapability?.observedAt ?? null,
    },
  });
  await input.emitTimeline?.({
    event: 'composer_ready',
    details: {
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      mode: 'Video',
      composer: audit?.composer ?? [],
      submitControls: audit?.submitControls ?? [],
      uploadControls: audit?.uploadControls ?? [],
      aspectControls: audit?.aspectControls ?? [],
    },
  });
  await input.emitTimeline?.({
    event: 'submitted_state_observed',
    details: {
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      mode: 'Video',
      submitted: false,
      reason: 'video_executor_skeleton_pre_submit_stop',
      filmstrip: audit?.filmstrip ?? [],
      downloadControls: audit?.downloadControls ?? [],
      visibleMedia: audit?.visibleMedia ?? [],
      generatedMediaSelectorCount: numberOrZero(audit?.generatedMediaSelectorCount),
      selectedGeneratedMediaCount: numberOrZero(audit?.selectedGeneratedMediaCount),
    },
  });
  if (isGrokVideoReadbackProbeEnabled(input.request.metadata)) {
    return executeGrokBrowserVideoReadbackProbe(input, userConfig);
  }
  throw new MediaGenerationExecutionError(
    'media_provider_not_implemented',
    'Grok browser video diagnostic skeleton requires explicit readback probe metadata; normal video generation uses the submitted-tab executor path.',
    {
      provider: 'grok',
      transport: input.request.transport ?? null,
      mediaType: 'video',
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      preSubmitStop: true,
      discoveryAction: 'grok-imagine-video-mode',
      videoModeAudit: audit,
    },
  );
}

async function executeGrokBrowserVideoGeneration(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  if (isGrokVideoReadbackProbeEnabled(input.request.metadata)) {
    return executeGrokBrowserVideoSkeleton(input, userConfig);
  }
  const timeoutMs = resolveMediaTimeoutMs(input.request.metadata);
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'grok' });
  const emitPromptProgress = async (event: BrowserProviderPromptProgressEvent): Promise<void> => {
    const timelineEvent = mapPromptProgressToTimelineEvent(event);
    if (!timelineEvent) return;
    await input.emitTimeline?.(timelineEvent);
  };
  const promptResult = await client.runPrompt({
    prompt: input.request.prompt,
    capabilityId: GROK_VIDEO_CAPABILITY_ID,
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
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      tabTargetId,
      url: tabUrl,
    },
  });
  if (!tabTargetId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'Grok browser video generation submitted without a tab target id for no-navigation readback.',
      { tabUrl, capabilityId: GROK_VIDEO_CAPABILITY_ID },
    );
  }
  const readback = await waitForGrokImagineTerminalVideoReadback(
    client,
    tabTargetId,
    tabUrl,
    {
      host: normalizeNonEmpty(promptResult.devtoolsHost) ?? '127.0.0.1',
      port: numberOrZero(promptResult.devtoolsPort),
    },
    input.request.metadata,
    timeoutMs,
    input.emitTimeline,
  );
  if (!readback.materializationCandidate) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok browser video generation reached ready state without a materialization candidate.',
      { tabUrl, tabTargetId, capabilityId: GROK_VIDEO_CAPABILITY_ID },
    );
  }
  const devtoolsPort = numberOrZero(promptResult.devtoolsPort);
  const artifact = (devtoolsPort
    ? await materializeGrokVideoCandidateFromBrowser(
        readback.materializationCandidate,
        input.artifactDir,
        1,
        {
          host: normalizeNonEmpty(promptResult.devtoolsHost) ?? '127.0.0.1',
          port: devtoolsPort,
          targetId: tabTargetId,
        },
      ).catch(() => null)
    : null) ??
    await materializeGrokVideoCandidate(readback.materializationCandidate, input.artifactDir, 1);
  if (!artifact) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok browser video generation found a generated video candidate, but it could not be materialized through the browser download control or direct asset URL.',
      {
        tabUrl,
        tabTargetId,
        capabilityId: GROK_VIDEO_CAPABILITY_ID,
        materializationCandidate: readback.materializationCandidate,
      },
    );
  }
  await input.emitTimeline?.({
    event: 'artifact_materialized',
    details: {
      providerArtifactId: artifact.id,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      mimeType: artifact.mimeType ?? null,
      materialization: artifact.metadata?.materialization ?? null,
      materializationSource: artifact.metadata?.materializationSource ?? null,
    },
  });
  return {
    artifacts: [artifact],
    model: input.request.model ?? null,
    metadata: {
      executor: 'grok-browser',
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      tabUrl,
      tabTargetId,
      devtoolsHost: normalizeNonEmpty(promptResult.devtoolsHost) ?? null,
      devtoolsPort: devtoolsPort || null,
      runState: readback.runState,
      artifactPollCount: readback.pollCount,
      generatedArtifactCount: 1,
      materializationCandidateSource: readback.materializationCandidate.source,
    },
  };
}

async function executeGrokBrowserVideoReadbackProbe(
  input: MediaGenerationExecutorInput,
  userConfig: ResolvedUserConfig,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const tabTargetId = normalizeNonEmpty(input.request.metadata?.grokVideoReadbackTabTargetId);
  const tabUrl = normalizeNonEmpty(input.request.metadata?.grokVideoReadbackTabUrl) ?? GROK_IMAGINE_URL;
  const devtoolsPort = resolveReadbackDevtoolsPort(input.request.metadata?.grokVideoReadbackDevtoolsPort);
  const devtoolsHost = normalizeNonEmpty(input.request.metadata?.grokVideoReadbackDevtoolsHost) ?? '127.0.0.1';
  if (!tabTargetId) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'Grok browser video readback probe requires metadata.grokVideoReadbackTabTargetId for an existing submitted tab.',
      {
        provider: 'grok',
        transport: input.request.transport ?? null,
        mediaType: 'video',
        capabilityId: GROK_VIDEO_CAPABILITY_ID,
        readbackProbe: true,
      },
    );
  }
  if (!devtoolsPort) {
    throw new MediaGenerationExecutionError(
      'media_generation_readback_failed',
      'Grok browser video readback probe requires metadata.grokVideoReadbackDevtoolsPort so it can attach directly to the existing submitted tab without browser-service target fallback.',
      {
        provider: 'grok',
        transport: input.request.transport ?? null,
        mediaType: 'video',
        capabilityId: GROK_VIDEO_CAPABILITY_ID,
        readbackProbe: true,
        tabTargetId,
      },
    );
  }
  const timeoutMs = resolveMediaTimeoutMs(input.request.metadata);
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'grok' });
  const readback = await waitForGrokImagineTerminalVideoReadback(
    client,
    tabTargetId,
    tabUrl,
    { host: devtoolsHost, port: devtoolsPort },
    input.request.metadata,
    timeoutMs,
    input.emitTimeline,
  );
  if (!readback.materializationCandidate) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok browser video readback reached ready state without a materialization candidate.',
      {
        tabUrl,
        tabTargetId,
        capabilityId: GROK_VIDEO_CAPABILITY_ID,
        readbackProbe: true,
      },
    );
  }
  const artifact = await materializeGrokVideoCandidateFromBrowser(
    readback.materializationCandidate,
    input.artifactDir,
    1,
    { host: devtoolsHost, port: devtoolsPort, targetId: tabTargetId },
  ).catch(() => null) ??
    await materializeGrokVideoCandidate(readback.materializationCandidate, input.artifactDir, 1);
  if (!artifact) {
    throw new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok browser video readback found a generated video candidate, but it could not be materialized through the browser download control or direct asset URL.',
      {
        tabUrl,
        tabTargetId,
        capabilityId: GROK_VIDEO_CAPABILITY_ID,
        readbackProbe: true,
        materializationCandidate: readback.materializationCandidate,
        downloadControlSelector: 'button[aria-label*="Download" i], button[title*="Download" i], [role="button"][aria-label*="Download" i]',
      },
    );
  }
  await input.emitTimeline?.({
    event: 'artifact_materialized',
    details: {
      providerArtifactId: artifact.id,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      mimeType: artifact.mimeType ?? null,
      materialization: artifact.metadata?.materialization ?? null,
      materializationSource: artifact.metadata?.materializationSource ?? null,
    },
  });
  return {
    artifacts: [artifact],
    model: input.request.model ?? null,
    metadata: {
      executor: 'grok-browser',
      capabilityId: GROK_VIDEO_CAPABILITY_ID,
      tabUrl,
      tabTargetId,
      devtoolsHost,
      devtoolsPort,
      readbackProbe: true,
      runState: readback.runState,
      artifactPollCount: readback.pollCount,
      generatedArtifactCount: 1,
      materializationCandidateSource: readback.materializationCandidate.source,
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
  let consecutiveTerminalNoGenerated = 0;
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
        generatedImageCount: countGeneratedGrokImages(evidence),
        publicGalleryImageCount: evidence.media.images.filter(isPublicGalleryGrokMediaEntry).length,
        videoCount: evidence.media.videos.length,
        visibleTileCount: evidence.media.visibleTiles.length,
        publicGalleryVisibleTileCount: evidence.media.visibleTiles.filter(isPublicGalleryGrokMediaEntry).length,
        mediaUrlCount: evidence.media.urls.length,
        providerHref: evidence.href,
        templateRoute: isGrokImagineTemplateRoute(evidence.href),
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
    const generatedImages = evidence.media.images.filter(isGeneratedGrokImageEntry);
    if (evidence.terminalImage && generatedImages.length > 0) {
      await emitTimeline?.({
        event: 'image_visible',
        details: {
          pollCount,
          generatedArtifactCount: generatedImages.length,
          visibleTileCount: evidence.media.visibleTiles.length,
          mediaUrlCount: evidence.media.urls.length,
        },
      });
      return { evidence, pollCount };
    }
    if (hasTerminalPublicTemplateMediaWithoutGeneratedOutput(evidence)) {
      consecutiveTerminalNoGenerated += 1;
      if (consecutiveTerminalNoGenerated >= 3) {
        const details = summarizeGrokImagineEvidence(tabUrl, evidence);
        await emitTimeline?.({
          event: 'no_generated_media',
          details: {
            pollCount,
            ...details,
          },
        });
        throw new MediaGenerationExecutionError(
          'media_generation_no_generated_output',
          'Grok Imagine reached a public/template media surface after submission, but no generated account image appeared.',
          {
            ...details,
            pollCount,
            timeoutMs,
          },
        );
      }
    } else {
      consecutiveTerminalNoGenerated = 0;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
  throw new MediaGenerationExecutionError(
    'media_generation_provider_timeout',
    'Grok browser image generation submitted successfully, but no terminal generated image appeared before the timeout.',
    {
      timeoutMs,
      pollCount,
      ...summarizeGrokImagineEvidence(tabUrl, lastEvidence),
    },
  );
}

async function materializeGrokImageEntry(
  entry: Record<string, unknown>,
  artifactDir: string,
  ordinal: number,
): Promise<MediaGenerationArtifact | null> {
  const remoteUrl = normalizeNonEmpty(entry.src) ?? normalizeNonEmpty(entry.href);
  if (!remoteUrl || remoteUrl.startsWith('blob:')) {
    return null;
  }
  let bytes: Buffer;
  let mimeType: string;
  let materialization = 'remote-media-fetch';
  if (remoteUrl.startsWith('data:image/')) {
    const parsed = parseImageDataUrl(remoteUrl);
    if (!parsed) return null;
    bytes = parsed.buffer;
    mimeType = parsed.mimeType;
    materialization = 'visible-tile-data-url';
  } else {
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      return null;
    }
    mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `grok-imagine-${ordinal}.${extension}`;
  const filePath = path.join(artifactDir, fileName);
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
      materialization,
      checksumSha256: sha256Hex(bytes),
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
      href: normalizeNonEmpty(imagine.href),
      runState: normalizeNonEmpty(imagine.run_state),
      pending: imagine.pending === true,
      terminalImage: imagine.terminal_image === true,
      terminalVideo: imagine.terminal_video === true,
      blocked: imagine.blocked === true,
      accountGated: imagine.account_gated === true,
      media: {
        images: collectRecordArray(mediaRecord.images),
        videos: collectRecordArray(mediaRecord.videos),
        visibleTiles: collectRecordArray(mediaRecord.visible_tiles),
        urls: Array.isArray(mediaRecord.urls)
          ? mediaRecord.urls.map((entry) => String(entry ?? '').trim()).filter(Boolean)
          : [],
      },
    };
  } catch {
    return {
      href: null,
      runState: null,
      pending: false,
      terminalImage: false,
      terminalVideo: false,
      blocked: false,
      accountGated: false,
      media: { images: [], videos: [], visibleTiles: [], urls: [] },
    };
  }
}

export function evaluateGrokImagineVideoPostSubmitAcceptance(
  signature: string | null | undefined,
): GrokImagineVideoAcceptanceEvaluation {
  const parsed = parseGrokImagineSignatureObject(signature);
  const imagine = parsed.imagine;
  const media = parsed.media;
  const videos = collectRecordArray(media.videos);
  const visibleTiles = collectRecordArray(media.visible_tiles);
  const materializationControls = collectRecordArray(imagine.materialization_controls);
  const generatedVideos = videos.filter(isGeneratedGrokVideoEntry);
  const selectedGeneratedVideos = generatedVideos.filter((entry) => entry.selected === true);
  const selectedGeneratedVideoTiles = visibleTiles.filter((entry) =>
    isGeneratedGrokVideoEntry(entry) && entry.selected === true);
  const materializationCandidateCount = generatedVideos.filter(hasGrokVideoMaterializationCandidate).length +
    selectedGeneratedVideoTiles.filter(hasGrokVideoMaterializationCandidate).length +
    materializationControls.filter(isGrokDownloadOrOpenControl).length;
  const publicTemplateWithoutGeneratedVideo = !Boolean(imagine.pending) &&
    !Boolean(imagine.account_gated) &&
    !Boolean(imagine.blocked) &&
    Boolean(imagine.terminal_video) &&
    generatedVideos.length === 0 &&
    (isGrokImagineTemplateRoute(normalizeNonEmpty(imagine.href)) ||
      videos.some(isPublicGalleryGrokMediaEntry) ||
      visibleTiles.some(isPublicGalleryGrokMediaEntry) ||
      collectStringArray(media.urls).some((url) => containsGrokPublicGalleryUrl(url)));
  const runState = normalizeNonEmpty(imagine.run_state)?.toLowerCase();
  const pending = Boolean(imagine.pending) || runState === 'pending' || runState === 'generating' || runState === 'progress';
  const terminalVideo = Boolean(imagine.terminal_video);
  const hasGeneratedSelection = generatedVideos.length > 0 || selectedGeneratedVideoTiles.length > 0;
  const ready = terminalVideo && hasGeneratedSelection && materializationCandidateCount > 0 && !publicTemplateWithoutGeneratedVideo;
  const failureReason = Boolean(imagine.account_gated)
    ? 'account_gated'
    : Boolean(imagine.blocked)
      ? 'blocked'
      : publicTemplateWithoutGeneratedVideo
        ? 'terminal_public_template_without_generated_video'
        : terminalVideo && hasGeneratedSelection && materializationCandidateCount === 0
          ? 'terminal_video_without_materialization_candidate'
          : null;
  return {
    pending,
    terminalVideo,
    generatedVideoCount: generatedVideos.length,
    selectedGeneratedVideoCount: selectedGeneratedVideos.length + selectedGeneratedVideoTiles.length,
    publicGalleryVideoCount: videos.filter(isPublicGalleryGrokMediaEntry).length,
    downloadControlCount: materializationControls.filter(isGrokDownloadOrOpenControl).length,
    materializationCandidateCount,
    publicTemplateWithoutGeneratedVideo,
    ready,
    failureReason,
  };
}

export function evaluateGrokImagineVideoPostSubmitReadback(
  signature: string | null | undefined,
  pollCount = 1,
): GrokImagineVideoReadbackEvaluation {
  const parsed = parseGrokImagineSignatureObject(signature);
  const imagine = parsed.imagine;
  const media = parsed.media;
  const acceptance = evaluateGrokImagineVideoPostSubmitAcceptance(signature);
  const runState = normalizeNonEmpty(imagine.run_state);
  const providerHref = normalizeNonEmpty(imagine.href);
  const visibleTileCount = collectRecordArray(media.visible_tiles).length;
  const mediaUrlCount = collectStringArray(media.urls).length;
  const materializationCandidate = selectGrokImagineVideoMaterializationCandidate(signature);
  const decision: GrokImagineVideoReadbackDecision = acceptance.ready
    ? 'ready'
    : acceptance.failureReason
      ? 'failed'
      : acceptance.pending
        ? 'pending'
        : 'continue';
  const timelineDetails = {
    pollCount,
    runState,
    pending: acceptance.pending,
    terminalVideo: acceptance.terminalVideo,
    generatedVideoCount: acceptance.generatedVideoCount,
    selectedGeneratedVideoCount: acceptance.selectedGeneratedVideoCount,
    publicGalleryVideoCount: acceptance.publicGalleryVideoCount,
    downloadControlCount: acceptance.downloadControlCount,
    materializationCandidateCount: acceptance.materializationCandidateCount,
    materializationCandidateSource: materializationCandidate?.source ?? null,
    publicTemplateWithoutGeneratedVideo: acceptance.publicTemplateWithoutGeneratedVideo,
    mediaUrlCount,
    visibleTileCount,
    providerHref,
    decision,
    failureReason: acceptance.failureReason,
  };
  return {
    ...acceptance,
    decision,
    pollCount,
    runState,
    providerHref,
    visibleTileCount,
    mediaUrlCount,
    materializationCandidate,
    timelineDetails: {
      ...timelineDetails,
    },
    runStateTimelineEvent: {
      event: 'run_state_observed',
      details: timelineDetails,
    },
    terminalTimelineEvent: acceptance.ready
      ? {
          event: 'video_visible',
          details: {
            pollCount,
            generatedVideoCount: acceptance.generatedVideoCount,
            selectedGeneratedVideoCount: acceptance.selectedGeneratedVideoCount,
            materializationCandidateCount: acceptance.materializationCandidateCount,
            materializationCandidateSource: materializationCandidate?.source ?? null,
            mediaUrlCount,
            visibleTileCount,
            providerHref,
          },
        }
      : null,
  };
}

export function selectGrokImagineVideoMaterializationCandidate(
  signature: string | null | undefined,
): GrokImagineVideoMaterializationCandidate | null {
  const parsed = parseGrokImagineSignatureObject(signature);
  const videos = collectRecordArray(parsed.media.videos);
  const visibleTiles = collectRecordArray(parsed.media.visible_tiles);
  const materializationControls = collectRecordArray(parsed.imagine.materialization_controls);
  const generatedVideo = videos.find((entry) => isGeneratedGrokVideoEntry(entry) && hasGrokVideoMaterializationCandidate(entry));
  if (generatedVideo) {
    return mapGrokVideoMaterializationCandidate('generated-video', generatedVideo);
  }
  const selectedTile = visibleTiles.find((entry) =>
    isGeneratedGrokVideoEntry(entry) && entry.selected === true && hasGrokVideoMaterializationCandidate(entry));
  if (selectedTile) {
    return mapGrokVideoMaterializationCandidate('selected-tile', selectedTile);
  }
  const downloadControl = materializationControls.find(isGrokDownloadOrOpenControl);
  if (downloadControl) {
    return {
      source: 'download-control',
      remoteUrl: normalizeNonEmpty(downloadControl.href),
      mimeType: null,
      selected: Boolean(downloadControl.selected),
    };
  }
  return null;
}

export async function waitForGrokImagineTerminalVideoReadback(
  client: Pick<BrowserAutomationClient, 'getFeatureSignature'>,
  tabTargetId: string,
  tabUrl: string,
  devtools: { host: string; port?: number | null },
  metadata: Record<string, unknown> | null | undefined,
  timeoutMs: number,
  emitTimeline: MediaGenerationExecutorInput['emitTimeline'],
): Promise<GrokImagineVideoReadbackEvaluation> {
  const pollIntervalMs = resolveArtifactPollIntervalMs(metadata);
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let lastEvaluation: GrokImagineVideoReadbackEvaluation | null = null;
  while (Date.now() <= deadline) {
    pollCount += 1;
    const signature = await client.getFeatureSignature({
      configuredUrl: tabUrl,
      tabUrl,
      tabTargetId,
      ...(devtools.port ? { host: devtools.host, port: devtools.port } : {}),
      preserveActiveTab: true,
    });
    const evaluation = evaluateGrokImagineVideoPostSubmitReadback(signature, pollCount);
    lastEvaluation = evaluation;
    await emitTimeline?.(evaluation.runStateTimelineEvent);
    if (evaluation.decision === 'ready') {
      if (evaluation.terminalTimelineEvent) {
        await emitTimeline?.(evaluation.terminalTimelineEvent);
      }
      return evaluation;
    }
    if (evaluation.decision === 'failed') {
      throw createGrokVideoReadbackFailure(evaluation, tabUrl, timeoutMs);
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
  throw new MediaGenerationExecutionError(
    'media_generation_provider_timeout',
    'Grok browser video generation submitted successfully, but no terminal generated video appeared before the timeout.',
    {
      timeoutMs,
      pollCount,
      tabUrl,
      lastDecision: lastEvaluation?.decision ?? null,
      lastRunState: lastEvaluation?.runState ?? null,
      generatedVideoCount: lastEvaluation?.generatedVideoCount ?? null,
      selectedGeneratedVideoCount: lastEvaluation?.selectedGeneratedVideoCount ?? null,
      materializationCandidateCount: lastEvaluation?.materializationCandidateCount ?? null,
      providerHref: lastEvaluation?.providerHref ?? null,
    },
  );
}

export async function materializeGrokVideoCandidate(
  candidate: GrokImagineVideoMaterializationCandidate,
  artifactDir: string,
  ordinal: number,
): Promise<MediaGenerationArtifact | null> {
  const remoteUrl = normalizeNonEmpty(candidate.remoteUrl);
  if (!remoteUrl || remoteUrl.startsWith('blob:') || remoteUrl.startsWith('data:')) {
    return null;
  }
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    return null;
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ||
    candidate.mimeType ||
    'video/mp4';
  const extension = resolveVideoExtension(mimeType, remoteUrl);
  const fileName = `grok-imagine-video-${ordinal}.${extension}`;
  const filePath = path.join(artifactDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(filePath, bytes);
  return {
    id: `grok_imagine_video_${ordinal}`,
    type: 'video',
    mimeType,
    fileName,
    path: filePath,
    uri: `file://${filePath}`,
    metadata: {
      providerArtifactId: `grok_imagine_video_${ordinal}`,
      remoteUrl,
      materialization: 'remote-media-fetch',
      materializationSource: candidate.source,
      selected: candidate.selected,
    },
  };
}

async function materializeGrokVideoCandidateFromBrowser(
  candidate: GrokImagineVideoMaterializationCandidate,
  artifactDir: string,
  ordinal: number,
  target: { host: string; port: number; targetId: string },
): Promise<MediaGenerationArtifact | null> {
  await fs.mkdir(artifactDir, { recursive: true });
  const client = await connectToChromeTarget({ host: target.host, port: target.port, target: target.targetId });
  try {
    await Promise.all([
      client.Page.enable().catch(() => undefined),
      client.Runtime.enable().catch(() => undefined),
    ]);
    await configureGrokVideoDownloadBehavior(client, artifactDir);
    await armDownloadCapture(client.Runtime, { stateKey: '__auracallGrokImagineVideoDownloadCapture' });
    const click = await client.Runtime.evaluate({
      expression: `(async () => {
        const visible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const controls = Array.from(document.querySelectorAll('button[aria-label*="Download" i], button[title*="Download" i], [role="button"][aria-label*="Download" i]'))
          .filter((node) => node instanceof HTMLElement && visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
        const control = controls[0] || null;
        if (!(control instanceof HTMLElement)) {
          return { ok: false, reason: 'download-control-missing' };
        }
        control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        control.click();
        return {
          ok: true,
          ariaLabel: control.getAttribute('aria-label') || null,
          title: control.getAttribute('title') || null,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const clickValue = click.result?.value as { ok?: boolean } | undefined;
    if (clickValue?.ok !== true) {
      return null;
    }
    const capture = await waitForDownloadCapture(client.Runtime, {
      stateKey: '__auracallGrokImagineVideoDownloadCapture',
      timeoutMs: 1_500,
      pollMs: 100,
    });
    const filePath = await waitForGrokVideoDownloadedFile(artifactDir, 15_000);
    if (!filePath) {
      return null;
    }
    return await mapGrokVideoDownloadFileToArtifact(filePath, candidate, ordinal, capture.href || null);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function configureGrokVideoDownloadBehavior(client: ChromeClient, downloadPath: string): Promise<void> {
  const cdpClient = client as unknown as { send?: (method: string, params?: Record<string, unknown>) => Promise<unknown> };
  if (typeof cdpClient.send !== 'function') return;
  try {
    await cdpClient.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
      eventsEnabled: true,
    });
    return;
  } catch {
    // Fall back to the older Page domain when Browser.setDownloadBehavior is unavailable.
  }
  try {
    await cdpClient.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });
  } catch {
    // Leave downloads unconfigured; the direct URL fetch fallback still has a chance.
  }
}

async function waitForGrokVideoDownloadedFile(destDir: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let lastPath: string | null = null;
  let lastSize = -1;
  let stableCount = 0;
  while (Date.now() < deadline) {
    const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
    const candidates = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) =>
        /^grok-imagine-video-\d+\./.test(name) ||
        (!name.endsWith('.crdownload') && !name.endsWith('.tmp') && /\.(mp4|webm|mov)$/i.test(name)))
      .sort();
    for (const name of candidates) {
      const candidatePath = path.join(destDir, name);
      const stat = await fs.stat(candidatePath).catch(() => null);
      if (!stat || stat.size <= 0) continue;
      if (candidatePath === lastPath && stat.size === lastSize) stableCount += 1;
      else {
        lastPath = candidatePath;
        lastSize = stat.size;
        stableCount = 0;
      }
      if (stableCount >= 1) return candidatePath;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function mapGrokVideoDownloadFileToArtifact(
  filePath: string,
  candidate: GrokImagineVideoMaterializationCandidate,
  ordinal: number,
  downloadHref: string | null,
): Promise<MediaGenerationArtifact> {
  const mimeType = inferVideoMimeTypeFromPath(filePath, candidate.mimeType ?? null);
  const extension = resolveVideoExtension(mimeType, filePath);
  const canonicalName = `grok-imagine-video-${ordinal}.${extension}`;
  const canonicalPath = path.join(path.dirname(filePath), canonicalName);
  let outputPath = filePath;
  if (path.basename(filePath) !== canonicalName) {
    await fs.rename(filePath, canonicalPath).catch(async () => {
      await fs.copyFile(filePath, canonicalPath);
      await fs.unlink(filePath).catch(() => undefined);
    });
    outputPath = canonicalPath;
  }
  return {
    id: `grok_imagine_video_${ordinal}`,
    type: 'video',
    mimeType,
    fileName: path.basename(outputPath),
    path: outputPath,
    uri: `file://${outputPath}`,
    metadata: {
      providerArtifactId: `grok_imagine_video_${ordinal}`,
      remoteUrl: normalizeNonEmpty(candidate.remoteUrl),
      downloadHref: normalizeNonEmpty(downloadHref),
      materialization: 'download-button',
      materializationSource: candidate.source,
      selected: candidate.selected,
    },
  };
}

function inferVideoMimeTypeFromPath(filePath: string, fallback: string | null): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return fallback || 'video/mp4';
}

function parseGrokImagineSignatureObject(signature: string | null | undefined): {
  imagine: Record<string, unknown>;
  media: Record<string, unknown>;
} {
  try {
    const parsed = signature ? JSON.parse(signature) as { imagine?: Record<string, unknown> } : {};
    const imagine = parsed.imagine && typeof parsed.imagine === 'object' ? parsed.imagine : {};
    const media = imagine.media && typeof imagine.media === 'object' && !Array.isArray(imagine.media)
      ? imagine.media as Record<string, unknown>
      : {};
    return { imagine, media };
  } catch {
    return { imagine: {}, media: {} };
  }
}

function isGeneratedGrokImageEntry(entry: Record<string, unknown>): boolean {
  return entry.generated === true && entry.publicGallery !== true && entry.public_gallery !== true;
}

function isGeneratedGrokVideoEntry(entry: Record<string, unknown>): boolean {
  if (entry.publicGallery === true || entry.public_gallery === true) return false;
  if (containsGrokPublicGalleryUrl(entry.src) || containsGrokPublicGalleryUrl(entry.href) || containsGrokPublicGalleryUrl(entry.poster)) {
    return false;
  }
  const kind = normalizeNonEmpty(entry.kind)?.toLowerCase() ?? '';
  const tag = normalizeNonEmpty(entry.tag)?.toLowerCase() ?? '';
  const hasVideoIdentity = kind === 'video' || tag === 'video' || normalizeNonEmpty(entry.src)?.endsWith('.mp4') === true;
  return entry.generated === true && hasVideoIdentity;
}

function hasGrokVideoMaterializationCandidate(entry: Record<string, unknown>): boolean {
  const src = normalizeNonEmpty(entry.src);
  const href = normalizeNonEmpty(entry.href);
  return Boolean(src || href);
}

function isGrokDownloadOrOpenControl(entry: Record<string, unknown>): boolean {
  const haystack = [
    entry.text,
    entry.ariaLabel,
    entry.aria_label,
    entry.title,
    entry.href,
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
  return /\b(download|save|export|open)\b/.test(haystack);
}

function mapGrokVideoMaterializationCandidate(
  source: GrokImagineVideoMaterializationCandidate['source'],
  entry: Record<string, unknown>,
): GrokImagineVideoMaterializationCandidate {
  const remoteUrl = normalizeNonEmpty(entry.src) ?? normalizeNonEmpty(entry.href);
  return {
    source,
    remoteUrl,
    mimeType: normalizeNonEmpty(entry.mimeType) ?? normalizeNonEmpty(entry.mime_type) ?? 'video/mp4',
    selected: Boolean(entry.selected),
  };
}

function createGrokVideoReadbackFailure(
  evaluation: GrokImagineVideoReadbackEvaluation,
  tabUrl: string,
  timeoutMs: number,
): MediaGenerationExecutionError {
  const details = {
    ...evaluation.timelineDetails,
    tabUrl,
    timeoutMs,
  };
  if (evaluation.failureReason === 'account_gated' || evaluation.failureReason === 'blocked') {
    return new MediaGenerationExecutionError(
      'media_generation_provider_blocked',
      `Grok Imagine reported ${evaluation.failureReason} after video prompt submission.`,
      details,
    );
  }
  if (evaluation.failureReason === 'terminal_public_template_without_generated_video') {
    return new MediaGenerationExecutionError(
      'media_generation_no_generated_output',
      'Grok Imagine reached a public/template video surface after submission, but no generated account video appeared.',
      details,
    );
  }
  if (evaluation.failureReason === 'terminal_video_without_materialization_candidate') {
    return new MediaGenerationExecutionError(
      'media_generation_artifact_materialization_failed',
      'Grok Imagine reached terminal generated video state, but no video materialization candidate was available.',
      details,
    );
  }
  return new MediaGenerationExecutionError(
    'media_generation_provider_failed',
    'Grok Imagine video readback failed.',
    details,
  );
}

function resolveVideoExtension(mimeType: string, remoteUrl: string): string {
  const lowerMimeType = mimeType.toLowerCase();
  const lowerUrl = remoteUrl.toLowerCase();
  if (lowerMimeType.includes('webm') || lowerUrl.endsWith('.webm')) return 'webm';
  if (lowerMimeType.includes('quicktime') || lowerUrl.endsWith('.mov')) return 'mov';
  return 'mp4';
}

function isPublicGalleryGrokMediaEntry(entry: Record<string, unknown>): boolean {
  return entry.publicGallery === true ||
    entry.public_gallery === true ||
    containsGrokPublicGalleryUrl(entry.src) ||
    containsGrokPublicGalleryUrl(entry.href) ||
    containsGrokPublicGalleryUrl(entry.poster);
}

function containsGrokPublicGalleryUrl(value: unknown): boolean {
  return typeof value === 'string' && value.includes('imagine-public.x.ai');
}

function countGeneratedGrokImages(evidence: GrokImagineEvidence | null): number | null {
  return evidence ? evidence.media.images.filter(isGeneratedGrokImageEntry).length : null;
}

function hasTerminalPublicTemplateMediaWithoutGeneratedOutput(evidence: GrokImagineEvidence): boolean {
  if (evidence.pending || evidence.blocked || evidence.accountGated) return false;
  if (!evidence.terminalImage && !evidence.terminalVideo) return false;
  if (countGeneratedGrokImages(evidence) !== 0) return false;
  return isGrokImagineTemplateRoute(evidence.href) ||
    evidence.media.images.some(isPublicGalleryGrokMediaEntry) ||
    evidence.media.visibleTiles.some(isPublicGalleryGrokMediaEntry) ||
    evidence.media.videos.some(isPublicGalleryGrokMediaEntry) ||
    evidence.media.urls.some((url) => containsGrokPublicGalleryUrl(url));
}

function isGrokImagineTemplateRoute(href: string | null | undefined): boolean {
  return typeof href === 'string' && /\/imagine\/templates\//.test(href);
}

function summarizeGrokImagineEvidence(
  tabUrl: string,
  evidence: GrokImagineEvidence | null,
): GrokImagineEvidenceSummary {
  return {
    tabUrl,
    runState: evidence?.runState ?? null,
    pending: evidence?.pending ?? null,
    terminalImage: evidence?.terminalImage ?? null,
    terminalVideo: evidence?.terminalVideo ?? null,
    imageCount: evidence?.media.images.length ?? null,
    generatedImageCount: countGeneratedGrokImages(evidence),
    publicGalleryImageCount: evidence?.media.images.filter(isPublicGalleryGrokMediaEntry).length ?? null,
    visibleTileCount: evidence?.media.visibleTiles.length ?? null,
    publicGalleryVisibleTileCount: evidence?.media.visibleTiles.filter(isPublicGalleryGrokMediaEntry).length ?? null,
    mediaUrlCount: evidence?.media.urls.length ?? null,
    providerHref: evidence?.href ?? null,
    templateRoute: isGrokImagineTemplateRoute(evidence?.href),
  };
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

function resolveGrokImageRequestedVisibleTileCount(
  requestCount: number | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): number {
  if (typeof requestCount === 'number' && Number.isFinite(requestCount)) {
    return Math.max(1, Math.min(Math.trunc(requestCount), 8));
  }
  const candidate = metadata?.visibleTileMaterializationLimit;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(1, Math.min(Math.trunc(candidate), 8));
  }
  return 8;
}

function isGrokVideoReadbackProbeEnabled(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.grokVideoReadbackProbe === true;
}

function mapGrokFileToMediaArtifact(file: FileRef, ordinal: number): MediaGenerationArtifact {
  const metadata = file.metadata ?? {};
  return {
    id: file.id || `grok_imagine_image_${ordinal}`,
    type: 'image',
    mimeType: file.mimeType ?? null,
    fileName: file.name || `grok-imagine-${ordinal}.jpg`,
    path: file.localPath ?? null,
    uri: file.localPath ? `file://${file.localPath}` : file.remoteUrl ?? null,
    width: numberOrNull(metadata.width),
    height: numberOrNull(metadata.height),
    metadata: {
      ...metadata,
      providerArtifactId: file.id,
      remoteUrl: file.remoteUrl ?? null,
      checksumSha256: file.checksumSha256 ?? null,
    },
  };
}

function extractGrokMaterializationDiagnostics(files: FileRef[]): Record<string, unknown> | null {
  for (const file of files) {
    const diagnostics = file.metadata?.grokMaterializationDiagnostics;
    if (diagnostics && typeof diagnostics === 'object' && !Array.isArray(diagnostics)) {
      return diagnostics as Record<string, unknown>;
    }
  }
  return null;
}

function collectRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
}

function collectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

function extractGrokVideoModeAudit(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const discoveryAction = metadata?.discoveryAction;
  if (!discoveryAction || typeof discoveryAction !== 'object' || Array.isArray(discoveryAction)) {
    return null;
  }
  const audit = (discoveryAction as Record<string, unknown>).videoModeAudit;
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    return null;
  }
  return audit as Record<string, unknown>;
}

function normalizeNonEmpty(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function parseImageDataUrl(value: string): { mimeType: string; buffer: Buffer } | null {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match?.[1] || !match?.[2]) return null;
  if (match[2].length % 4 !== 0) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length < 32) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer,
  };
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveReadbackDevtoolsPort(value: unknown): number | null {
  const candidate = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : NaN;
  return Number.isInteger(candidate) && candidate > 0 && candidate < 65536 ? candidate : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
