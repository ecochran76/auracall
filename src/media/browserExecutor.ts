import path from 'node:path';
import type { ResolvedUserConfig } from '../config.js';
import { BrowserAutomationClient } from '../browser/client.js';
import type {
  MediaGenerationExecutor,
  MediaGenerationExecutorInput,
  MediaGenerationMaterializer,
} from './types.js';
import { MediaGenerationExecutionError } from './service.js';
import { createGeminiApiMediaGenerationExecutor } from './geminiApiExecutor.js';
import { createGeminiBrowserMediaGenerationExecutor } from './geminiBrowserExecutor.js';
import {
  createGrokBrowserMediaGenerationExecutor,
  extractGrokMaterializationDiagnostics,
  GROK_IMAGE_CAPABILITY_ID,
  mapGrokFileToMediaArtifact,
} from './grokBrowserExecutor.js';
import { createChatgptBrowserMediaGenerationExecutor } from './chatgptBrowserExecutor.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  resolveManagedBrowserLaunchContextFromResolvedConfig,
  resolveUserBrowserLaunchContext,
} from '../browser/service/profileResolution.js';
import type { BrowserProfileTarget } from '../browser/profileStore.js';
import {
  buildBrowserOperationKey,
  createFileBackedBrowserOperationDispatcher,
  formatBrowserOperationBusyResult,
  type BrowserOperationBusyResult,
  type BrowserOperationRecord,
} from '../../packages/browser-service/src/service/operationDispatcher.js';

const DEFAULT_BROWSER_MEDIA_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BROWSER_MEDIA_QUEUE_POLL_MS = 1000;

export function createBrowserMediaGenerationExecutor(userConfig: ResolvedUserConfig): MediaGenerationExecutor {
  const gemini = createGeminiBrowserMediaGenerationExecutor(userConfig);
  const geminiApi = createGeminiApiMediaGenerationExecutor({ env: process.env });
  const grok = createGrokBrowserMediaGenerationExecutor(userConfig);
  const chatgpt = createChatgptBrowserMediaGenerationExecutor(userConfig);
  return async (input) => {
    if (input.request.provider === 'gemini' && input.request.transport === 'api') {
      return geminiApi(input);
    }
    if (input.request.provider === 'gemini') {
      return withQueuedBrowserMediaOperation(userConfig, input, () => gemini(input));
    }
    if (input.request.provider === 'grok') {
      return withQueuedBrowserMediaOperation(userConfig, input, () => grok(input));
    }
    if (input.request.provider === 'chatgpt') {
      return withQueuedBrowserMediaOperation(userConfig, input, () => chatgpt(input));
    }
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      `Media generation provider ${input.request.provider} is not implemented by the browser executor.`,
      {
        provider: input.request.provider,
        transport: input.request.transport ?? null,
        mediaType: input.request.mediaType,
      },
    );
  };
}

export function createBrowserMediaGenerationMaterializer(userConfig: ResolvedUserConfig): MediaGenerationMaterializer {
  return async (input) => {
    const { response } = input;
    if (response.provider !== 'grok' || response.mediaType !== 'image') {
      throw new MediaGenerationExecutionError(
        'media_materializer_not_implemented',
        `Resumed browser media materialization is currently implemented for Grok image runs only.`,
        {
          provider: response.provider,
          mediaType: response.mediaType,
        },
      );
    }
    const count = resolveMaterializationCount(input.options?.count, 1);
    const executorInput: MediaGenerationExecutorInput = {
      id: response.id,
      createdAt: response.createdAt,
      artifactDir: input.artifactDir,
      emitTimeline: input.emitTimeline,
      request: {
        provider: response.provider,
        mediaType: response.mediaType,
        prompt: response.prompt,
        model: response.model ?? null,
        transport: 'browser',
        count,
        source: input.options?.source ?? null,
        metadata: {
          ...(response.metadata ?? {}),
          ...(input.options?.metadata ?? {}),
          visibleTileMaterializationLimit: count,
          grokFullQualityMaterializationMode: 'resumed',
        },
      },
    };
    return withQueuedBrowserMediaOperation(userConfig, executorInput, async () => {
      await input.emitTimeline?.({
        event: 'artifact_poll',
        details: {
          materializationSource: 'grok-browser-service-resume',
          requestedVisibleTileCount: count,
          fullQualityActivationContext: 'resumed',
        },
      });
      const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'grok' });
      const files = await client.materializeActiveMediaArtifacts({
        capabilityId: GROK_IMAGE_CAPABILITY_ID,
        mediaType: 'image',
        maxItems: count,
        compareFullQuality: input.options?.compareFullQuality !== false,
        fullQualityActivationContext: 'resumed',
      }, input.artifactDir, {
        configuredUrl: 'https://grok.com/imagine',
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:grok-imagine-resume',
      });
      const diagnostics = extractGrokMaterializationDiagnostics(files);
      await input.emitTimeline?.({
        event: 'artifact_poll',
        details: {
          materializationSource: 'grok-browser-service-resume',
          activeFileCount: files.length,
          visibleFileCount: files.filter((file) => file.metadata?.materialization === 'visible-tile-browser-capture').length,
          fullQualityFileCount: files.filter((file) => file.metadata?.materialization === 'download-button' ||
            file.metadata?.materialization === 'download-button-anchor-fetch').length,
          grokMaterializationDiagnostics: diagnostics,
        },
      });
      const artifacts = files.map((file, index) => mapGrokFileToMediaArtifact(file, index + 1));
      for (const artifact of artifacts) {
        await input.emitTimeline?.({
          event: 'artifact_materialized',
          details: {
            providerArtifactId: artifact.id,
            path: artifact.path ?? null,
            uri: artifact.uri ?? null,
            mimeType: artifact.mimeType ?? null,
            materialization: artifact.metadata?.materialization ?? null,
            fullQualityDiffersFromPreview: artifact.metadata?.fullQualityDiffersFromPreview ?? null,
            resumed: true,
          },
        });
      }
      return {
        artifacts,
        model: response.model ?? null,
        metadata: {
          materializer: 'grok-browser-resume',
          requestedVisibleTileCount: count,
          grokMaterializationDiagnostics: diagnostics,
        },
      };
    });
  };
}

async function withQueuedBrowserMediaOperation<T>(
  userConfig: ResolvedUserConfig,
  input: Parameters<MediaGenerationExecutor>[0],
  run: () => Promise<T>,
): Promise<T> {
  const operationInput = resolveBrowserMediaOperationInput(userConfig, input);
  const dispatcher = createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const blockedOperationIds = new Set<string>();
  const acquired = await dispatcher.acquireQueued(operationInput, {
    timeoutMs: resolveQueueNumber(input.request.metadata?.browserOperationQueueTimeoutMs, DEFAULT_BROWSER_MEDIA_QUEUE_TIMEOUT_MS),
    pollMs: resolveQueueNumber(input.request.metadata?.browserOperationQueuePollMs, DEFAULT_BROWSER_MEDIA_QUEUE_POLL_MS),
    onBlocked: async (result, context) => {
      if (blockedOperationIds.has(result.blockedBy.id)) {
        return;
      }
      blockedOperationIds.add(result.blockedBy.id);
      await input.emitTimeline?.({
        event: 'browser_operation_queued',
        details: {
          dispatcherKey: result.key,
          attempt: context.attempt,
          elapsedMs: context.elapsedMs,
          blockedBy: summarizeBrowserOperation(result.blockedBy),
        },
      });
    },
  });
  if (!acquired.acquired) {
    throw createBrowserOperationBusyError(acquired);
  }
  await input.emitTimeline?.({
    event: 'browser_operation_acquired',
    details: {
      dispatcherKey: acquired.operation.key,
      operation: summarizeBrowserOperation(acquired.operation),
    },
  });
  try {
    return await run();
  } finally {
    await acquired.release();
  }
}

function resolveBrowserMediaOperationInput(
  userConfig: ResolvedUserConfig,
  input: Parameters<MediaGenerationExecutor>[0],
) {
  const provider = input.request.provider === 'grok'
    ? 'grok'
    : input.request.provider === 'chatgpt'
      ? 'chatgpt'
      : 'gemini';
  const readbackProbeDevtoolsPort = input.request.provider === 'grok'
    && input.request.mediaType === 'video'
    && input.request.metadata?.grokVideoReadbackProbe === true
    ? resolvePositiveInteger(input.request.metadata?.grokVideoReadbackDevtoolsPort)
    : null;
  if (readbackProbeDevtoolsPort) {
    const host = normalizeNonEmpty(input.request.metadata?.grokVideoReadbackDevtoolsHost) ?? '127.0.0.1';
    const targetId = normalizeNonEmpty(input.request.metadata?.grokVideoReadbackTabTargetId) ?? undefined;
    return {
      rawDevTools: {
        host,
        port: readbackProbeDevtoolsPort,
        targetId,
      },
      kind: 'media-generation' as const,
      operationClass: 'exclusive-mutating' as const,
      ownerCommand: `media-generation:${provider}:${input.request.mediaType}:readback`,
      devTools: {
        host,
        port: readbackProbeDevtoolsPort,
        targetId,
      },
    };
  }
  const managedProfileDir = resolveBrowserMediaManagedProfileDir(userConfig, provider);
  return {
    managedProfileDir,
    serviceTarget: provider,
    kind: 'media-generation' as const,
    operationClass: 'exclusive-mutating' as const,
    ownerCommand: `media-generation:${provider}:${input.request.mediaType}`,
  };
}

function resolveBrowserMediaManagedProfileDir(
  userConfig: ResolvedUserConfig,
  provider: BrowserProfileTarget,
): string {
  const launchContext = resolveUserBrowserLaunchContext(userConfig, provider);
  const managedLaunchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browserProfileName: launchContext.resolution.profileFamily.browserProfileId ?? null,
    browser: launchContext.resolvedConfig,
    target: provider,
  });
  return managedLaunchContext.managedProfileDir;
}

function createBrowserOperationBusyError(result: BrowserOperationBusyResult): MediaGenerationExecutionError {
  return new MediaGenerationExecutionError(
    'browser_operation_busy',
    formatBrowserOperationBusyResult(result),
    {
      dispatcherKey: result.key,
      blockedBy: summarizeBrowserOperation(result.blockedBy),
    },
  );
}

function summarizeBrowserOperation(operation: BrowserOperationRecord): Record<string, unknown> {
  return {
    id: operation.id,
    key: operation.key,
    kind: operation.kind,
    operationClass: operation.operationClass,
    ownerPid: operation.ownerPid,
    ownerCommand: operation.ownerCommand ?? null,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    managedProfileDir: operation.managedProfileDir ?? null,
    serviceTarget: operation.serviceTarget ?? null,
    rawDevTools: operation.rawDevTools ?? null,
    devTools: operation.devTools ?? null,
  };
}

function resolveQueueNumber(value: unknown, fallback: number): number {
  const parsed = resolvePositiveInteger(value);
  return parsed ?? fallback;
}

function resolveMaterializationCount(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.trunc(value), 8));
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

export function resolveBrowserMediaOperationKeyForTest(
  userConfig: ResolvedUserConfig,
  input: Parameters<MediaGenerationExecutor>[0],
): string {
  return buildBrowserOperationKey(resolveBrowserMediaOperationInput(userConfig, input));
}

export function resolveBrowserMediaMaterializationOperationKeyForTest(
  userConfig: ResolvedUserConfig,
  input: MediaGenerationExecutorInput,
): string {
  return buildBrowserOperationKey(resolveBrowserMediaOperationInput(userConfig, input));
}
