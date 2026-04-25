import type { ResolvedUserConfig } from '../config.js';
import { createBrowserMediaGenerationExecutor } from '../media/browserExecutor.js';
import { createMediaGenerationService, type MediaGenerationService } from '../media/service.js';
import { summarizeMediaGenerationStatus } from '../media/statusSummary.js';
import type {
  MediaGenerationProvider,
  MediaGenerationResponse,
  MediaGenerationTransport,
  MediaGenerationType,
} from '../media/types.js';
import { createBrowserWorkbenchCapabilityDiagnostics } from '../workbench/browserDiagnostics.js';
import { createBrowserWorkbenchCapabilityDiscovery } from '../workbench/browserDiscovery.js';
import { createWorkbenchCapabilityService } from '../workbench/service.js';

export interface MediaGenerationCliOptions {
  provider: string;
  mediaType: string;
  prompt: string;
  model?: string | null;
  transport?: string | null;
  count?: number | null;
  size?: string | null;
  aspectRatio?: string | null;
  wait?: boolean;
}

export interface MediaGenerationCliDeps {
  service?: Pick<MediaGenerationService, 'createGeneration' | 'createGenerationAsync'>;
}

export function createConfiguredMediaGenerationService(userConfig: ResolvedUserConfig): MediaGenerationService {
  const workbenchCapabilityReporter = createWorkbenchCapabilityService({
    discoverCapabilities: createBrowserWorkbenchCapabilityDiscovery(userConfig),
    diagnoseCapabilities: createBrowserWorkbenchCapabilityDiagnostics(userConfig),
  });
  return createMediaGenerationService({
    executor: createBrowserMediaGenerationExecutor(userConfig),
    capabilityReporter: workbenchCapabilityReporter,
    runtimeProfile: typeof userConfig.auracallProfile === 'string' ? userConfig.auracallProfile : null,
  });
}

export async function createMediaGenerationFromCli(
  options: MediaGenerationCliOptions,
  userConfig: ResolvedUserConfig,
  deps: MediaGenerationCliDeps = {},
): Promise<MediaGenerationResponse> {
  const request = {
    provider: parseProvider(options.provider),
    mediaType: parseMediaType(options.mediaType),
    prompt: parsePrompt(options.prompt),
    model: normalizeOptionalString(options.model),
    transport: parseTransport(options.transport ?? 'browser'),
    count: options.count ?? null,
    size: normalizeOptionalString(options.size),
    aspectRatio: normalizeOptionalString(options.aspectRatio),
    source: 'cli' as const,
  };
  const service = deps.service ?? createConfiguredMediaGenerationService(userConfig);
  const shouldWait = options.wait !== false;
  if (!shouldWait && service.createGenerationAsync) {
    return service.createGenerationAsync(request);
  }
  return service.createGeneration(request);
}

export function formatMediaGenerationCli(response: MediaGenerationResponse): string {
  const status = summarizeMediaGenerationStatus(response);
  const lines = [
    `Media generation ${status.id} is ${status.status}`,
    `Provider: ${status.provider}`,
    `Type: ${status.mediaType}`,
    `Updated: ${status.updatedAt}`,
    `Last event: ${status.lastEvent ? `${status.lastEvent.event} at ${status.lastEvent.at}` : 'none'}`,
    `Artifacts: ${status.artifactCount}`,
  ];

  for (const artifact of status.artifacts) {
    const label = artifact.fileName ?? artifact.id;
    const location = artifact.path ?? artifact.uri ?? null;
    const materialization = artifact.materialization ? ` [${artifact.materialization}]` : '';
    lines.push(`- ${artifact.type}: ${label}${location ? ` -> ${location}` : ''}${materialization}`);
  }

  if (status.failure) {
    lines.push(`Failure: ${status.failure.code}: ${status.failure.message}`);
  }
  if (response.status === 'running') {
    lines.push(`Poll: auracall run status ${response.id}`);
  }
  return lines.join('\n');
}

function parseProvider(value: string): MediaGenerationProvider {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'gemini' || normalized === 'grok') {
    return normalized;
  }
  throw new Error(`Invalid media provider "${value}". Use "gemini" or "grok".`);
}

function parseMediaType(value: string): MediaGenerationType {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image' || normalized === 'music' || normalized === 'video') {
    return normalized;
  }
  throw new Error(`Invalid media type "${value}". Use "image", "music", or "video".`);
}

function parseTransport(value: string | null | undefined): MediaGenerationTransport | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'api' || normalized === 'browser' || normalized === 'auto') {
    return normalized;
  }
  throw new Error(`Invalid media transport "${value}". Use "api", "browser", or "auto".`);
}

function parsePrompt(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Media prompt is required.');
  }
  return normalized;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
