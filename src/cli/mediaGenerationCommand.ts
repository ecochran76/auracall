import type { Command, OptionValues } from 'commander';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ResolvedUserConfig } from '../config.js';
import {
  createBrowserMediaGenerationExecutor,
  createBrowserMediaGenerationMaterializer,
} from '../media/browserExecutor.js';
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

export interface MediaGenerationMaterializeCliOptions {
  id: string;
  count?: number | null;
  conversationUrl?: string | null;
  conversationId?: string | null;
}

export interface MediaGenerationInspectCliOptions {
  id: string;
}

export interface MediaGenerationArtifactCacheInspection {
  artifactId: string;
  type: MediaGenerationType;
  fileName: string | null;
  path: string | null;
  uri: string | null;
  materialization: string | null;
  fileAvailable: boolean;
  fileSize: number | null;
  mtime: string | null;
  reason: string | null;
}

export interface MediaGenerationInspection {
  object: 'media_generation_inspection';
  id: string;
  status: MediaGenerationResponse['status'];
  provider: MediaGenerationProvider;
  mediaType: MediaGenerationType;
  updatedAt: string;
  mediaGeneration: MediaGenerationResponse;
  artifactCache: MediaGenerationArtifactCacheInspection[];
  summary: {
    artifactCount: number;
    cachedArtifactCount: number;
    missingArtifactCount: number;
  };
}

export interface MediaGenerationCliDeps {
  service?: Partial<Pick<
    MediaGenerationService,
    'createGeneration' | 'createGenerationAsync' | 'materializeGeneration' | 'readGeneration'
  >>;
}

export interface RegisterMediaGenerationCliCommandDeps extends MediaGenerationCliDeps {
  resolveUserConfig: (options: OptionValues) => Promise<ResolvedUserConfig>;
  parseIntOption: (value: string | undefined) => number | undefined;
}

export function registerMediaGenerationCliCommand(
  program: Command,
  deps: RegisterMediaGenerationCliCommandDeps,
): Command {
  const mediaCommand = program
    .command('media')
    .description('Create and inspect durable media-generation runs.');

  mediaCommand
    .command('generate')
    .description('Create one durable media generation through the shared ChatGPT/Gemini/Grok contract.')
    .argument('[prompt]', 'Prompt to send to the provider media tool.')
    .requiredOption('--provider <chatgpt|gemini|grok>', 'Provider to use.')
    .requiredOption('--type <image|music|video>', 'Media type to generate.')
    .option('-p, --prompt <prompt>', 'Prompt to send to the provider media tool.')
    .option('--model <model>', 'Provider model override.')
    .option('--transport <api|browser|auto>', 'Provider transport path.', 'browser')
    .option('--count <count>', 'Requested output count, bounded by the media contract.', deps.parseIntOption)
    .option('--size <size>', 'Provider size/resolution hint.')
    .option('--aspect-ratio <ratio>', 'Provider aspect-ratio hint.')
    .option('--json', 'Emit machine-readable JSON output.', false)
    .option('--wait', 'Wait for terminal completion before returning.', true)
    .option('--no-wait', 'Return a running media generation id immediately when supported.')
    .action(async function (this: Command, promptArg?: string) {
      const parentOptions =
        typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
      const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
      const rootOptions = program.opts?.() ?? {};
      const commandOptions = {
        ...rootOptions,
        ...parentOptions,
        ...ownOptions,
      } as OptionValues;
      const prompt =
        typeof ownOptions.prompt === 'string'
          ? ownOptions.prompt
          : typeof promptArg === 'string'
            ? promptArg
            : typeof rootOptions.prompt === 'string'
              ? rootOptions.prompt
              : '';
      const userConfig = await deps.resolveUserConfig(commandOptions);
      const response = await createMediaGenerationFromCli(
        {
          provider: String(ownOptions.provider ?? ''),
          mediaType: String(ownOptions.type ?? ''),
          prompt,
          model: typeof ownOptions.model === 'string' ? ownOptions.model : null,
          transport: typeof ownOptions.transport === 'string' ? ownOptions.transport : 'browser',
          count: typeof ownOptions.count === 'number' ? ownOptions.count : null,
          size: typeof ownOptions.size === 'string' ? ownOptions.size : null,
          aspectRatio: typeof ownOptions.aspectRatio === 'string' ? ownOptions.aspectRatio : null,
          wait: ownOptions.wait !== false,
        },
        userConfig,
        {
          service: deps.service,
        },
      );

      if (ownOptions.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }
      console.log(formatMediaGenerationCli(response));
    });

  mediaCommand
    .command('inspect')
    .description('Inspect one durable media generation and its local artifact cache without provider/browser work.')
    .argument('<id>', 'Durable media generation id to inspect.')
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async function (this: Command, id: string) {
      const parentOptions =
        typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
      const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
      const rootOptions = program.opts?.() ?? {};
      const commandOptions = {
        ...rootOptions,
        ...parentOptions,
        ...ownOptions,
      } as OptionValues;
      const userConfig = await deps.resolveUserConfig(commandOptions);
      const inspection = await inspectMediaGenerationFromCli(
        {
          id,
        },
        userConfig,
        {
          service: deps.service,
        },
      );

      if (ownOptions.json) {
        console.log(JSON.stringify(inspection, null, 2));
        return;
      }
      console.log(formatMediaGenerationInspectionCli(inspection));
    });

  mediaCommand
    .command('materialize')
    .description('Resume artifact materialization for an existing durable media generation.')
    .argument('<id>', 'Durable media generation id to materialize.')
    .option('--count <count>', 'Maximum visible provider tiles to inspect while resuming.', deps.parseIntOption)
    .option('--conversation-url <url>', 'Provider conversation URL to reopen when the stored record lacks one.')
    .option('--conversation-id <id>', 'Provider conversation id to reopen when the stored record lacks one.')
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async function (this: Command, id: string) {
      const parentOptions =
        typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
      const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
      const rootOptions = program.opts?.() ?? {};
      const commandOptions = {
        ...rootOptions,
        ...parentOptions,
        ...ownOptions,
      } as OptionValues;
      const userConfig = await deps.resolveUserConfig(commandOptions);
      const response = await materializeMediaGenerationFromCli(
        {
          id,
          count: typeof ownOptions.count === 'number' ? ownOptions.count : null,
          conversationUrl: typeof ownOptions.conversationUrl === 'string' ? ownOptions.conversationUrl : null,
          conversationId: typeof ownOptions.conversationId === 'string' ? ownOptions.conversationId : null,
        },
        userConfig,
        {
          service: deps.service,
        },
      );

      if (ownOptions.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }
      console.log(formatMediaGenerationCli(response));
    });

  return mediaCommand;
}

export function createConfiguredMediaGenerationService(userConfig: ResolvedUserConfig): MediaGenerationService {
  const workbenchCapabilityReporter = createWorkbenchCapabilityService({
    discoverCapabilities: createBrowserWorkbenchCapabilityDiscovery(userConfig),
    diagnoseCapabilities: createBrowserWorkbenchCapabilityDiagnostics(userConfig),
  });
  return createMediaGenerationService({
    executor: createBrowserMediaGenerationExecutor(userConfig),
    materializer: createBrowserMediaGenerationMaterializer(userConfig),
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
  if (!service.createGeneration) {
    throw new Error('Media generation creation is not available in this runtime.');
  }
  return service.createGeneration(request);
}

export async function materializeMediaGenerationFromCli(
  options: MediaGenerationMaterializeCliOptions,
  userConfig: ResolvedUserConfig,
  deps: MediaGenerationCliDeps = {},
): Promise<MediaGenerationResponse> {
  const id = normalizeRequiredId(options.id);
  const service = deps.service ?? createConfiguredMediaGenerationService(userConfig);
  if (!service.materializeGeneration) {
    throw new Error('Media generation materialization is not available in this runtime.');
  }
  const metadata = buildMaterializeMetadata(options);
  return service.materializeGeneration(id, {
    count: options.count ?? null,
    compareFullQuality: true,
    source: 'cli',
    ...(metadata ? { metadata } : {}),
  });
}

export async function inspectMediaGenerationFromCli(
  options: MediaGenerationInspectCliOptions,
  userConfig: ResolvedUserConfig,
  deps: MediaGenerationCliDeps = {},
): Promise<MediaGenerationInspection> {
  const id = normalizeRequiredId(options.id);
  const service = deps.service ?? createConfiguredMediaGenerationService(userConfig);
  if (!service.readGeneration) {
    throw new Error('Media generation inspection is not available in this runtime.');
  }
  const response = await service.readGeneration(id);
  if (!response) {
    throw new Error(`Media generation ${id} was not found.`);
  }
  const artifactCache = await Promise.all(response.artifacts.map(inspectMediaGenerationArtifactCache));
  const cachedArtifactCount = artifactCache.filter((artifact) => artifact.fileAvailable).length;
  return {
    object: 'media_generation_inspection',
    id: response.id,
    status: response.status,
    provider: response.provider,
    mediaType: response.mediaType,
    updatedAt: response.updatedAt,
    mediaGeneration: response,
    artifactCache,
    summary: {
      artifactCount: artifactCache.length,
      cachedArtifactCount,
      missingArtifactCount: artifactCache.length - cachedArtifactCount,
    },
  };
}

function buildMaterializeMetadata(options: MediaGenerationMaterializeCliOptions): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  const conversationUrl = normalizeOptionalString(options.conversationUrl);
  const conversationId = normalizeOptionalString(options.conversationId);
  if (conversationUrl) {
    metadata.conversationUrl = conversationUrl;
  }
  if (conversationId) {
    metadata.conversationId = conversationId;
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

export function formatMediaGenerationInspectionCli(inspection: MediaGenerationInspection): string {
  const lines = [
    `Media generation ${inspection.id} is ${inspection.status}`,
    `Provider: ${inspection.provider}`,
    `Type: ${inspection.mediaType}`,
    `Updated: ${inspection.updatedAt}`,
    `Artifacts: ${inspection.summary.artifactCount}`,
    `Cached files: ${inspection.summary.cachedArtifactCount}`,
    `Missing files: ${inspection.summary.missingArtifactCount}`,
  ];

  for (const artifact of inspection.artifactCache) {
    const label = artifact.fileName ?? artifact.artifactId;
    const state = artifact.fileAvailable ? 'available' : `missing${artifact.reason ? ` (${artifact.reason})` : ''}`;
    const size = artifact.fileSize === null ? '' : ` ${artifact.fileSize} bytes`;
    const materialization = artifact.materialization ? ` [${artifact.materialization}]` : '';
    const location = artifact.path ?? artifact.uri ?? null;
    lines.push(`- ${artifact.type}: ${label} -> ${state}${size}${materialization}${location ? ` ${location}` : ''}`);
  }

  return lines.join('\n');
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

async function inspectMediaGenerationArtifactCache(
  artifact: MediaGenerationResponse['artifacts'][number],
): Promise<MediaGenerationArtifactCacheInspection> {
  const path = resolveArtifactCachePath(artifact.path, artifact.uri);
  if (!path) {
    return {
      artifactId: artifact.id,
      type: artifact.type,
      fileName: artifact.fileName ?? null,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      materialization: readMaterializationLabel(artifact.metadata),
      fileAvailable: false,
      fileSize: null,
      mtime: null,
      reason: 'missing-local-path',
    };
  }
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      return {
        artifactId: artifact.id,
        type: artifact.type,
        fileName: artifact.fileName ?? null,
        path,
        uri: artifact.uri ?? null,
        materialization: readMaterializationLabel(artifact.metadata),
        fileAvailable: false,
        fileSize: null,
        mtime: null,
        reason: 'not-a-file',
      };
    }
    return {
      artifactId: artifact.id,
      type: artifact.type,
      fileName: artifact.fileName ?? null,
      path,
      uri: artifact.uri ?? null,
      materialization: readMaterializationLabel(artifact.metadata),
      fileAvailable: true,
      fileSize: stat.size,
      mtime: stat.mtime.toISOString(),
      reason: null,
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {
        artifactId: artifact.id,
        type: artifact.type,
        fileName: artifact.fileName ?? null,
        path,
        uri: artifact.uri ?? null,
        materialization: readMaterializationLabel(artifact.metadata),
        fileAvailable: false,
        fileSize: null,
        mtime: null,
        reason: 'local-file-missing',
      };
    }
    throw error;
  }
}

function resolveArtifactCachePath(pathValue: string | null | undefined, uriValue: string | null | undefined): string | null {
  const directPath = normalizeOptionalString(pathValue);
  if (directPath) return directPath;
  const uri = normalizeOptionalString(uriValue);
  if (!uri?.startsWith('file://')) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

function readMaterializationLabel(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.materialization;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseProvider(value: string): MediaGenerationProvider {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'chatgpt' || normalized === 'gemini' || normalized === 'grok') {
    return normalized;
  }
  throw new Error(`Invalid media provider "${value}". Use "chatgpt", "gemini", or "grok".`);
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

function normalizeRequiredId(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Media generation id is required.');
  }
  return normalized;
}
