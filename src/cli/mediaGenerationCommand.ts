import { type Command, type OptionValues } from 'commander';
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
    .description('Create one durable media generation through the shared Gemini/Grok contract.')
    .argument('[prompt]', 'Prompt to send to the provider media tool.')
    .requiredOption('--provider <gemini|grok>', 'Provider to use.')
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

  return mediaCommand;
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
