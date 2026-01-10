#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Command, Option } from 'commander';
import type { OptionValues } from 'commander';
// Allow `npx @steipete/oracle oracle-mcp` to resolve the MCP server even though npx runs the default binary.
if (process.argv[2] === 'oracle-mcp') {
  const { startMcpServer } = await import('../src/mcp/server.js');
  await startMcpServer();
  process.exit(0);
}
import { resolveEngine, type EngineMode, defaultWaitPreference } from '../src/cli/engine.js';
import { shouldRequirePrompt } from '../src/cli/promptRequirement.js';
import chalk from 'chalk';
import type {
  SessionMetadata,
  SessionMode,
  BrowserSessionConfig,
  BrowserContextMetadata,
} from '../src/sessionStore.js';
import { sessionStore, pruneOldSessions } from '../src/sessionStore.js';
import { DEFAULT_MODEL, MODEL_CONFIGS, runOracle, readFiles, estimateRequestTokens, buildRequestBody } from '../src/oracle.js';
import { isKnownModel } from '../src/oracle/modelResolver.js';
import type { ModelName, PreviewMode, RunOracleOptions } from '../src/oracle.js';
import { CHATGPT_URL, DEFAULT_MODEL_STRATEGY, normalizeChatgptUrl } from '../src/browserMode.js';
import { GROK_URL } from '../src/browser/constants.js';
import { createRemoteBrowserExecutor } from '../src/remote/client.js';
import { createGeminiWebExecutor } from '../src/gemini-web/index.js';
import { applyHelpStyling } from '../src/cli/help.js';
import {
  collectPaths,
  collectModelList,
  parseFloatOption,
  parseIntOption,
  parseSearchOption,
  usesDefaultStatusFilters,
  resolvePreviewMode,
  normalizeModelOption,
  normalizeBaseUrl,
  resolveApiModel,
  inferModelFromLabel,
  parseHeartbeatOption,
  parseTimeoutOption,
  mergePathLikeOptions,
  dedupePathInputs,
} from '../src/cli/options.js';
import { copyToClipboard } from '../src/cli/clipboard.js';
import { buildMarkdownBundle } from '../src/cli/markdownBundle.js';
import { shouldDetachSession } from '../src/cli/detach.js';
import { applyHiddenAliases } from '../src/cli/hiddenAliases.js';
import { buildBrowserConfig, resolveBrowserModelLabel } from '../src/cli/browserConfig.js';
import { performSessionRun } from '../src/cli/sessionRunner.js';
import type { BrowserSessionRunnerDeps } from '../src/browser/sessionRunner.js';
import { isMediaFile } from '../src/browser/prompt.js';
import type { BrowserProviderListOptions } from '../src/browser/providers/types.js';
import { attachSession, showStatus, formatCompletionSummary } from '../src/cli/sessionDisplay.js';
import type { ShowStatusOptions } from '../src/cli/sessionDisplay.js';
import { formatCompactNumber } from '../src/cli/format.js';
import { formatIntroLine } from '../src/cli/tagline.js';
import { warnIfOversizeBundle } from '../src/cli/bundleWarnings.js';
import { formatRenderedMarkdown } from '../src/cli/renderOutput.js';
import { resolveRenderFlag, resolveRenderPlain } from '../src/cli/renderFlags.js';
import { resolveGeminiModelId } from '../src/oracle/gemini.js';
import { handleSessionCommand, type StatusOptions, formatSessionCleanupMessage } from '../src/cli/sessionCommand.js';
import { isErrorLogged } from '../src/cli/errorUtils.js';
import { handleSessionAlias, handleStatusFlag } from '../src/cli/rootAlias.js';
import { resolveOutputPath } from '../src/cli/writeOutputPath.js';
import { getCliVersion } from '../src/version.js';
import { runDryRunSummary, runBrowserPreview } from '../src/cli/dryRun.js';
import { launchTui } from '../src/cli/tui/index.js';
import {
  resolveNotificationSettings,
  deriveNotificationSettingsFromMetadata,
  type NotificationSettings,
} from '../src/cli/notifier.js';
import { loadUserConfig, type UserConfig } from '../src/config.js';
import { shouldBlockDuplicatePrompt } from '../src/cli/duplicatePromptGuard.js';
import os from 'node:os';
import path from 'node:path';
import { getOracleHomeDir } from '../src/oracleHome.js';
import { BrowserAutomationClient } from '../src/browser/client.js';
import {
  deriveProjectsFromConfig,
  deriveConversationsFromConfig,
} from '../src/browser/providers/service.js';
import {
  matchProjectByName,
  matchConversationByTitle,
  readConversationCache,
  PROVIDER_CACHE_TTL_MS,
  readProjectCache,
  resolveProviderCacheKey,
  writeConversationCache,
  writeProjectCache,
} from '../src/browser/providers/cache.js';
import { resolveConfig } from '../src/schema/resolver.js';
import { isPortOpen } from '../src/browser/processCheck.js';
import type { BrowserProvider } from '../src/browser/providers/types.js';

interface CliOptions extends OptionValues {
  prompt?: string;
  message?: string;
  file?: string[];
  include?: string[];
  files?: string[];
  path?: string[];
  paths?: string[];
  render?: boolean;
  model: string;
  models?: string[];
  chatgpt?: boolean;
  gemini?: boolean;
  force?: boolean;
  slug?: string;
  filesReport?: boolean;
  maxInput?: number;
  maxOutput?: number;
  system?: string;
  silent?: boolean;
  search?: boolean;
  preview?: boolean | string;
  previewMode?: PreviewMode;
  apiKey?: string;
  session?: string;
  execSession?: string;
  notify?: boolean;
  notifySound?: boolean;
  renderMarkdown?: boolean;
  sessionId?: string;
  engine?: EngineMode;
  browser?: boolean;
  timeout?: number | 'auto';
  browserChromeProfile?: string;
  browserChromePath?: string;
  browserCookiePath?: string;
  geminiUrl?: string;
  grokUrl?: string;
  chatgptUrl?: string;
  browserUrl?: string;
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  conversationName?: string;
  browserTimeout?: string;
  browserInputTimeout?: string;
  browserCookieWait?: string;
  browserNoCookieSync?: boolean;
  browserInlineCookiesFile?: string;
  browserCookieNames?: string;
  browserInlineCookies?: string;
  browserHeadless?: boolean;
  browserHideWindow?: boolean;
  browserKeepBrowser?: boolean;
  browserModelStrategy?: 'select' | 'current' | 'ignore';
  browserManualLogin?: boolean;
  browserManualLoginProfileDir?: string;
  browserWslChrome?: 'auto' | 'wsl' | 'windows';
  browserTarget?: 'chatgpt' | 'gemini' | 'grok';
  browserThinkingTime?: 'light' | 'standard' | 'extended' | 'heavy';
  browserAllowCookieErrors?: boolean;
  browserAttachments?: string;
  browserInlineFiles?: boolean;
  browserBundleFiles?: boolean;
  remoteChrome?: string;
  browserPort?: number;
  browserDebugPort?: number;
  remoteHost?: string;
  remoteToken?: string;
  copyMarkdown?: boolean;
  copy?: boolean;
  verbose?: boolean;
  debugHelp?: boolean;
  heartbeat?: number;
  status?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  noWait?: boolean;
  baseUrl?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  showModelId?: boolean;
  retainHours?: number;
  writeOutput?: string;
  writeOutputPath?: string;
}

type ResolvedCliOptions = Omit<CliOptions, 'model'> & {
  model: ModelName;
  models?: ModelName[];
  effectiveModelId?: string;
  writeOutputPath?: string;
};

const VERSION = getCliVersion();
const CLI_ENTRYPOINT = fileURLToPath(import.meta.url);
const rawCliArgs = process.argv.slice(2);
const userCliArgs = rawCliArgs[0] === CLI_ENTRYPOINT ? rawCliArgs.slice(1) : rawCliArgs;
const isTty = process.stdout.isTTY;

const program = new Command();
let introPrinted = false;
program.hook('preAction', () => {
  if (introPrinted) return;
  console.log(formatIntroLine(VERSION, { env: process.env, richTty: isTty }));
  introPrinted = true;
});
applyHelpStyling(program, VERSION, isTty);
program.hook('preAction', (thisCommand) => {
  if (thisCommand !== program) {
    return;
  }
  if (userCliArgs.some((arg) => arg === '--help' || arg === '-h')) {
    return;
  }
  if (userCliArgs.length === 0) {
    // Let the root action handle zero-arg entry (help + hint to `oracle tui`).
    return;
  }
  const opts = thisCommand.optsWithGlobals() as CliOptions;
  applyHiddenAliases(opts, (key, value) => thisCommand.setOptionValue(key, value));
  const positional = thisCommand.args?.[0] as string | undefined;
  if (!opts.prompt && positional) {
    opts.prompt = positional;
    thisCommand.setOptionValue('prompt', positional);
  }
  if (shouldRequirePrompt(userCliArgs, opts)) {
    console.log(chalk.yellow('Prompt is required. Provide it via --prompt "<text>" or positional [prompt].'));
    thisCommand.help({ error: false });
    process.exitCode = 1;
    return;
  }
});
program
  .name('oracle')
  .description('One-shot GPT-5.2 Pro / GPT-5.2 / GPT-5.1 Codex tool for hard questions that benefit from large file context and server-side search.')
  .version(VERSION)
  .argument('[prompt]', 'Prompt text (shorthand for --prompt).')
  .option('-p, --prompt <text>', 'User prompt to send to the model.')
  .addOption(new Option('--message <text>', 'Alias for --prompt.').hideHelp())
  .option(
    '-f, --file <paths...>',
    'Files/directories or glob patterns to attach (prefix with !pattern to exclude). Files larger than 1 MB are rejected automatically.',
    collectPaths,
    [],
  )
  .addOption(
    new Option('--include <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--files <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--path <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--paths <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option(
      '--copy-markdown',
      'Copy the assembled markdown bundle to the clipboard; pair with --render to print it too.',
    ).default(false),
  )
  .addOption(new Option('--copy').hideHelp().default(false))
  .option('-s, --slug <words>', 'Custom session slug (3-5 words).')
  .option(
    '-m, --model <model>',
    'Model to target (gpt-5.2-pro default; also supports gpt-5.1-pro alias). Also gpt-5-pro, gpt-5.1, gpt-5.1-codex API-only, gpt-5.2, gpt-5.2-instant, gpt-5.2-pro, gemini-3-pro, claude-4.5-sonnet, claude-4.1-opus, or ChatGPT labels like "5.2 Thinking" for browser runs).',
    normalizeModelOption,
  )
  .addOption(
    new Option(
      '--models <models>',
      'Comma-separated API model list to query in parallel (e.g., "gpt-5.2-pro,gemini-3-pro").',
    )
      .argParser(collectModelList)
      .default([]),
  )
  .addOption(
    new Option(
      '--chatgpt',
      'Use ChatGPT browser automation (shorthand for --engine browser --model gpt-5.2).',
    ),
  )
  .addOption(
    new Option(
      '--gemini',
      'Use Gemini web automation (shorthand for --engine browser --model gemini-3-pro).',
    ),
  )
  .addOption(
    new Option(
      '-e, --engine <mode>',
      'Execution engine (api | browser). Browser engine: GPT models automate ChatGPT; Gemini models use a cookie-based client for gemini.google.com. If omitted, oracle picks api when OPENAI_API_KEY is set, otherwise browser.',
    ).choices(['api', 'browser'])
  )
  .addOption(
    new Option('--mode <mode>', 'Alias for --engine (api | browser).').choices(['api', 'browser']).hideHelp(),
  )
  .option('--files-report', 'Show token usage per attached file (also prints automatically when files exceed the token budget).', false)
  .option('-v, --verbose', 'Enable verbose logging for all operations.', false)
  .addOption(
    new Option('--[no-]notify', 'Desktop notification when a session finishes (default on unless CI/SSH).')
      .default(undefined),
  )
  .addOption(
    new Option('--[no-]notify-sound', 'Play a notification sound on completion (default off).').default(undefined),
  )
  .addOption(
    new Option(
      '--timeout <seconds|auto>',
      'Overall timeout before aborting the API call (auto = 60m for gpt-5.2-pro, 120s otherwise).',
    )
      .argParser(parseTimeoutOption)
      .default('auto'),
  )
  .addOption(
    new Option(
      '--preview [mode]',
      '(alias) Preview the request without calling the model (summary | json | full). Deprecated: use --dry-run instead.',
    )
      .hideHelp()
      .choices(['summary', 'json', 'full'])
      .preset('summary'),
  )
  .addOption(
    new Option('--dry-run [mode]', 'Preview without calling the model (summary | json | full).')
      .choices(['summary', 'json', 'full'])
      .preset('summary')
      .default(false),
  )
  .addOption(new Option('--exec-session <id>').hideHelp())
  .addOption(new Option('--session <id>').hideHelp())
  .addOption(new Option('--status', 'Show stored sessions (alias for `oracle status`).').default(false).hideHelp())
  .option(
    '--render-markdown',
    'Print the assembled markdown bundle for prompt + files and exit; pair with --copy to put it on the clipboard.',
    false,
  )
  .option('--render', 'Alias for --render-markdown.', false)
  .option('--render-plain', 'Render markdown without ANSI/highlighting (use plain text even in a TTY).', false)
  .option(
    '--write-output <path>',
    'Write only the final assistant message to this file (overwrites; multi-model appends .<model> before the extension).',
  )
  .option('--verbose-render', 'Show render/TTY diagnostics when replaying sessions.', false)
  .addOption(
    new Option('--search <mode>', 'Set server-side search behavior (on/off).')
      .argParser(parseSearchOption)
      .hideHelp(),
  )
  .addOption(
    new Option('--max-input <tokens>', 'Override the input token budget for the selected model.')
      .argParser(parseIntOption)
      .hideHelp(),
  )
  .addOption(
    new Option('--max-output <tokens>', 'Override the max output tokens for the selected model.')
      .argParser(parseIntOption)
      .hideHelp(),
  )
  .option(
    '--base-url <url>',
    'Override the OpenAI-compatible base URL for API runs (e.g. LiteLLM proxy endpoint).',
  )
  .option('--azure-endpoint <url>', 'Azure OpenAI Endpoint (e.g. https://resource.openai.azure.com/).')
  .option('--azure-deployment <name>', 'Azure OpenAI Deployment Name.')
  .option('--azure-api-version <version>', 'Azure OpenAI API Version.')
  .addOption(new Option('--browser', '(deprecated) Use --engine browser instead.').default(false).hideHelp())
  .addOption(new Option('--browser-chrome-profile <name>', 'Chrome profile name/path for cookie reuse.').hideHelp())
  .addOption(new Option('--browser-chrome-path <path>', 'Explicit Chrome or Chromium executable path.').hideHelp())
  .addOption(
    new Option('--browser-cookie-path <path>', 'Explicit Chrome/Chromium cookie DB path for session reuse.'),
  )
  .addOption(new Option('--gemini-url <url>', 'Override the Gemini web URL (e.g., https://gemini.google.com/gem/<id>).'))
  .addOption(new Option('--grok-url <url>', `Override the Grok web URL (e.g., ${GROK_URL}project/<id>).`))
  .addOption(new Option('--project-id <id>', 'Override the provider project scope for browser runs.').hideHelp())
  .addOption(new Option('--conversation-id <id>', 'Attach browser runs to a specific conversation.').hideHelp())
  .addOption(new Option('--project-name <name>', 'Resolve browser project by cached name.'))
  .addOption(new Option('--conversation-name <name>', 'Resolve browser conversation by cached title.'))
  .addOption(
    new Option(
      '--chatgpt-url <url>',
      `Override the ChatGPT web URL (e.g., workspace/folder like https://chatgpt.com/g/.../project; default ${CHATGPT_URL}).`,
    ),
  )
  .addOption(new Option('--browser-url <url>', `Alias for --chatgpt-url (default ${CHATGPT_URL}).`).hideHelp())
  .addOption(new Option('--browser-timeout <ms|s|m>', 'Maximum time to wait for an answer (default 1200s / 20m).').hideHelp())
  .addOption(
    new Option('--browser-input-timeout <ms|s|m>', 'Maximum time to wait for the prompt textarea (default 30s).').hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-cookie-wait <ms|s|m>',
      'Wait before retrying cookie sync when Chrome cookies are empty or locked.',
    ).hideHelp(),
  )
  .addOption(
    new Option('--browser-target <chatgpt|gemini|grok>', 'Override the browser automation target.').choices([
      'chatgpt',
      'gemini',
      'grok',
    ]),
  )
  .addOption(
    new Option('--browser-port <port>', 'Use a fixed Chrome DevTools port (helpful on WSL firewalls).')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option('--browser-debug-port <port>', '(alias) Use a fixed Chrome DevTools port.').argParser(parseIntOption).hideHelp(),
  )
  .addOption(new Option('--browser-cookie-names <names>', 'Comma-separated cookie allowlist for sync.').hideHelp())
  .addOption(
    new Option('--browser-inline-cookies <jsonOrBase64>', 'Inline cookies payload (JSON array or base64-encoded JSON).').hideHelp(),
  )
  .addOption(
    new Option('--browser-inline-cookies-file <path>', 'Load inline cookies from file (JSON or base64 JSON).').hideHelp(),
  )
  .addOption(new Option('--browser-no-cookie-sync', 'Skip copying cookies from Chrome.').hideHelp())
  .addOption(
    new Option(
      '--browser-manual-login',
      'Skip cookie copy; reuse a persistent automation profile and wait for manual ChatGPT login.',
    ).hideHelp(),
  )
  .addOption(new Option('--browser-headless', 'Launch Chrome in headless mode.').hideHelp())
  .addOption(new Option('--browser-hide-window', 'Hide the Chrome window after launch (macOS headful only).').hideHelp())
  .addOption(new Option('--browser-keep-browser', 'Keep Chrome running after completion.').hideHelp())
  .option(
    '--browser-model-strategy <strategy>',
    'Strategy for selecting the model in the browser (select | current | ignore).',
    DEFAULT_MODEL_STRATEGY,
  )
  .addOption(
    new Option(
      '--browser-model-label <label>',
      'Fuzzy label for selecting a model from the browser UI picker (ChatGPT/Grok). Defaults to the --model label.',
    ).hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-thinking-time <level>',
      "ChatGPT 'thinking' time level (light | standard | extended | heavy).",
    ).hideHelp(),
  )
  .addOption(
    new Option('--browser-allow-cookie-errors', 'Continue even if Chrome cookies cannot be copied.').hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-attachments <mode>',
      'How to deliver --file inputs in browser mode: auto (default) pastes inline up to ~60k chars then uploads; never always paste inline; always always upload.',
    )
      .choices(['auto', 'never', 'always'])
      .default('auto'),
  )
  .addOption(
    new Option(
      '--remote-chrome <host:port>',
      'Connect to remote Chrome DevTools Protocol (e.g., 192.168.1.10:9222 or [2001:db8::1]:9222 for IPv6).',
    ),
  )
  .addOption(new Option('--remote-host <host:port>', 'Delegate browser runs to a remote `oracle serve` instance.'))
  .addOption(new Option('--remote-token <token>', 'Access token for the remote `oracle serve` instance.'))
  .addOption(
    new Option('--browser-inline-files', 'Alias for --browser-attachments never (force pasting file contents inline).').default(false),
  )
  .addOption(new Option('--browser-bundle-files', 'Bundle all attachments into a single archive before uploading.').default(false))
  .addOption(
    new Option(
      '--youtube <url>',
      'YouTube video URL to analyze (Gemini web/cookie mode only; uses your signed-in Chrome cookies for gemini.google.com).',
    ),
  )
  .addOption(
    new Option(
      '--generate-image <file>',
      'Generate image and save to file (Gemini web/cookie mode only; requires gemini.google.com Chrome cookies).',
    ),
  )
  .addOption(new Option('--edit-image <file>', 'Edit existing image (use with --output, Gemini web/cookie mode only).'))
  .addOption(new Option('--output <file>', 'Output file path for image operations (Gemini web/cookie mode only).'))
  .addOption(
    new Option(
      '--aspect <ratio>',
      'Aspect ratio for image generation: 16:9, 1:1, 4:3, 3:4 (Gemini web/cookie mode only).',
    ),
  )
  .addOption(new Option('--gemini-show-thoughts', 'Display Gemini thinking process (Gemini web/cookie mode only).').default(false))
  .option(
    '--retain-hours <hours>',
    'Prune stored sessions older than this many hours before running (set 0 to disable).',
    parseFloatOption,
  )
  .option('--force', 'Force start a new session even if an identical prompt is already running.', false)
  .option('--debug-help', 'Show the advanced/debug option set and exit.', false)
  .option('--heartbeat <seconds>', 'Emit periodic in-progress updates (0 to disable).', parseHeartbeatOption, 30)
  .addOption(new Option('--wait').default(undefined))
  .addOption(new Option('--no-wait').default(undefined).hideHelp())
  .showHelpAfterError('(use --help for usage)');

program.addHelpText(
  'after',
  `
Examples:
  # Quick API run with two files
  oracle --prompt "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

  # Browser run (no API key) + globbed TypeScript sources, excluding tests
  oracle --engine browser --prompt "Review the TS data layer" \\
    --file "src/**/*.ts" --file "!src/**/*.test.ts"

  # Build, print, and copy a markdown bundle (semi-manual)
  oracle --render --copy -p "Review the TS data layer" --file "src/**/*.ts" --file "!src/**/*.test.ts"
`,
);

program
  .command('serve')
  .description('Run Oracle browser automation as a remote service for other machines.')
  .option('--host <address>', 'Interface to bind (default 0.0.0.0).')
  .option('--port <number>', 'Port to listen on (default random).', parseIntOption)
  .option('--token <value>', 'Access token clients must provide (random if omitted).')
  .action(async (commandOptions) => {
    const { serveRemote } = await import('../src/remote/server.js');
    await serveRemote({
      host: commandOptions.host,
      port: commandOptions.port,
      token: commandOptions.token,
    });
  });

program
  .command('projects')
  .description('List available projects/workspaces for the active browser provider.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .option('--refresh', 'Force refresh of cached project data.')
  .action(async (commandOptions) => {
    const { config: userConfig } = await loadUserConfig();
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
    const provider = client.provider;
    const listOptions = await client.buildListOptions();
    const cacheContext = { provider: target, userConfig, listOptions: { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null } };
    if (!provider.listProjects) {
      const fallback = deriveProjectsFromConfig({
        provider: target,
        configuredUrl: listOptions.configuredUrl,
        projectId: userConfig.browser?.projectId ?? null,
      });
      if (fallback.length === 0) {
        console.log(chalk.yellow(`Project listing is not implemented yet for ${target}.`));
        return;
      }
      try {
        await writeProjectCache(cacheContext, fallback);
      } catch (error) {
        console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.log(JSON.stringify(fallback, null, 2));
      return;
    }
    const projects = await client.listProjects(listOptions);
    if (Array.isArray(projects) && projects.length === 0) {
      const fallback = deriveProjectsFromConfig({
        provider: target,
        configuredUrl: listOptions.configuredUrl,
        projectId: userConfig.browser?.projectId ?? null,
      });
      if (fallback.length > 0) {
        try {
          await writeProjectCache(cacheContext, fallback);
        } catch (error) {
          console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
        }
        console.log(JSON.stringify(fallback, null, 2));
        return;
      }
    }
    if (Array.isArray(projects)) {
      try {
        await writeProjectCache(cacheContext, projects);
      } catch (error) {
        console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (process.stdout.isTTY) {
      console.table(projects);
    } else {
      console.log(JSON.stringify(projects, null, 2));
    }
  });

program
  .command('conversations')
  .description('List conversations for the active browser provider.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .option('--project-id <id>', 'Limit conversations to a specific project/workspace.')
  .option('--project-name <name>', 'Resolve project ID by name using the cached project list.')
  .option('--conversation-name <name>', 'Resolve a conversation by cached title.')
  .option('--include-history', 'Include the History dialog results when listing conversations.')
  .option('--history-limit <count>', 'Maximum History conversations to fetch (default 200).')
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .option('--filter <text>', 'Filter conversations by title/id substring (case-insensitive).')
  .option('--refresh', 'Force refresh of cached project/conversation data.')
  .action(async (commandOptions, command) => {
    const parentOptions = command.parent?.opts?.() ?? {};
    const { config: userConfig } = await loadUserConfig();
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
    const provider = client.provider;
    let projectId =
      (commandOptions.projectId?.trim() ||
       parentOptions.projectId?.trim() ||
       userConfig.browser?.projectId ||
       undefined);
    const listDefaults = userConfig.browser?.list;
    const includeHistory =
      (command.getOptionValueSource?.('includeHistory') === 'cli')
        ? Boolean(commandOptions.includeHistory)
        : Boolean(listDefaults?.includeHistory ?? commandOptions.includeHistory);
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : listDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : listDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);
    const filterText =
      (command.getOptionValueSource?.('filter') === 'cli')
        ? commandOptions.filter
        : listDefaults?.filter ?? commandOptions.filter;
    const refreshFlag =
      (command.getOptionValueSource?.('refresh') === 'cli')
        ? Boolean(commandOptions.refresh)
        : Boolean(listDefaults?.refresh ?? commandOptions.refresh);
    let listOptions: BrowserProviderListOptions = await client.buildListOptions({
      includeHistory,
      historyLimit,
      historySince,
    });
    if (!projectId && listOptions.includeHistory && listOptions.configuredUrl?.includes('/project/')) {
      listOptions = { ...listOptions, configuredUrl: null };
    }
    if (typeof listOptions.historyLimit === 'number' && (!Number.isFinite(listOptions.historyLimit) || listOptions.historyLimit <= 0)) {
      throw new Error('history-limit must be a positive number.');
    }
    if (listOptions.historySince && !Number.isFinite(Date.parse(listOptions.historySince))) {
      throw new Error('history-since must be a valid date (YYYY-MM-DD or ISO timestamp).');
    }
    const cacheContext = { provider: target, userConfig, listOptions: { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null } };
    const projectName =
      typeof commandOptions.projectName === 'string'
        ? commandOptions.projectName.trim()
        : typeof parentOptions.projectName === 'string'
          ? parentOptions.projectName.trim()
          : '';
    const forceRefresh = refreshFlag;
    if (!projectId && projectName) {
      projectId = await resolveProjectIdByName({ projectName, cacheContext, provider, forceRefresh });
    }
    const conversationName =
      typeof commandOptions.conversationName === 'string'
        ? commandOptions.conversationName.trim()
        : typeof parentOptions.conversationName === 'string'
          ? parentOptions.conversationName.trim()
          : '';
    if (conversationName) {
      const conversationMatch = await resolveConversationByName({
        conversationName,
        cacheContext,
        provider,
        projectId,
        forceRefresh,
      });
      console.log(JSON.stringify([conversationMatch], null, 2));
      return;
    }
    if (!provider.listConversations) {
      let fallback = deriveConversationsFromConfig({
        provider: target,
        configuredUrl: listOptions.configuredUrl,
        projectId: projectId ?? null,
        conversationId: userConfig.browser?.conversationId ?? null,
      });
      if (fallback.length === 0) {
        console.log(chalk.yellow(`Conversation listing is not implemented yet for ${target}.`));
        return;
      }
      try {
        await writeConversationCache(cacheContext, fallback);
      } catch (error) {
        console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
      }
      fallback = filterConversationsByQuery(fallback, filterText);
      console.log(JSON.stringify(fallback, null, 2));
      return;
    }
    const conversations = await client.listConversations(projectId, listOptions);
    let resolved = conversations;
    if (Array.isArray(resolved) && resolved.length === 0) {
      const fallback = deriveConversationsFromConfig({
        provider: target,
        configuredUrl: listOptions.configuredUrl,
        projectId: projectId ?? null,
        conversationId: userConfig.browser?.conversationId ?? null,
      });
      if (fallback.length > 0) {
        try {
          await writeConversationCache(cacheContext, fallback);
        } catch (error) {
          console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
        }
        const filtered = filterConversationsByQuery(fallback, filterText);
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }
    }
    if (Array.isArray(resolved)) {
      try {
        await writeConversationCache(cacheContext, resolved);
      } catch (error) {
        console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const filtered = filterConversationsByQuery(resolved, filterText);
    if (process.stdout.isTTY) {
      console.table(filtered);
    } else {
      console.log(JSON.stringify(filtered, null, 2));
    }
  });

program
  .command('rename <id> <name>')
  .description('Rename a conversation.')
  .option('--target <chatgpt|grok>', 'Choose which provider to use.')
  .option('--project-id <id>', 'Project ID (if conversation is in a project).')
  .action(async (id, name, commandOptions) => {
    const { config: userConfig } = await loadUserConfig();
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
    const provider = client.provider;
    
    if (!provider.renameConversation) {
      console.error(`Rename is not supported for ${target}.`);
      process.exit(1);
    }
    
    // Resolve project ID if needed (e.g. from name via existing logic? for now direct ID)
    const projectId = commandOptions.projectId ?? userConfig.browser?.projectId;
    console.log(`Renaming conversation ${id} to "${name}"...`);
    try {
      await client.renameConversation(id, name, projectId);
      console.log(chalk.green('Renamed successfully.'));
    } catch (error) {
      console.error(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('cache')
  .description('Show cached browser project/conversation lists.')
  .option('--provider <chatgpt|grok>', 'Limit cache listing to a provider (chatgpt or grok).')
  .option('--refresh', 'Refresh cache entries for the active provider.')
  .option('--include-history', 'Include the History dialog results when refreshing conversations.')
  .option('--history-limit <count>', 'Maximum History conversations to fetch (default 200).')
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .action(async (commandOptions, command) => {
    const providers = new Set(['chatgpt', 'grok']);
    const filter =
      typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
        ? commandOptions.provider.trim()
        : null;
    if (filter && !providers.has(filter)) {
      throw new Error(`Invalid provider "${filter}". Use "chatgpt" or "grok".`);
    }
    const { config: userConfig } = await loadUserConfig();
    const cacheDefaults = userConfig.browser?.cache;
    const includeHistory =
      (command.getOptionValueSource?.('includeHistory') === 'cli')
        ? Boolean(commandOptions.includeHistory)
        : Boolean(cacheDefaults?.includeHistory ?? commandOptions.includeHistory);
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : cacheDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : cacheDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);
    const refreshFlag =
      (command.getOptionValueSource?.('refresh') === 'cli')
        ? Boolean(commandOptions.refresh)
        : Boolean(cacheDefaults?.refresh ?? commandOptions.refresh);
    if (refreshFlag) {
      const target = (filter ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
      if (!providers.has(target)) {
        throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
      }
      const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
      const listOptions = await client.buildListOptions({
        configuredUrl: target === 'grok' ? userConfig.browser?.grokUrl ?? null : userConfig.browser?.chatgptUrl ?? null,
        includeHistory,
        historyLimit,
        historySince,
      });
      if (typeof listOptions.historyLimit === 'number' && (!Number.isFinite(listOptions.historyLimit) || listOptions.historyLimit <= 0)) {
        throw new Error('history-limit must be a positive number.');
      }
      if (listOptions.historySince && !Number.isFinite(Date.parse(listOptions.historySince))) {
        throw new Error('history-since must be a valid date (YYYY-MM-DD or ISO timestamp).');
      }
      await refreshProviderCache(target, userConfig, listOptions);
    }
    const cacheRoot = path.join(getOracleHomeDir(), 'cache', 'providers');
    const output: Array<{
      provider: string;
      profileKey: string;
      kind: 'projects' | 'conversations';
      fetchedAt: string | null;
      ageHours: number | null;
      stale: boolean;
      sourceUrl?: string | null;
    }> = [];
    let providerEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      providerEntries = await fs.readdir(cacheRoot, { withFileTypes: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      throw error;
    }
    for (const providerEntry of providerEntries) {
      if (!providerEntry.isDirectory()) continue;
      if (filter && providerEntry.name !== filter) continue;
      const providerDir = path.join(cacheRoot, providerEntry.name);
      const profileEntries = await fs.readdir(providerDir, { withFileTypes: true });
      for (const profileEntry of profileEntries) {
        if (!profileEntry.isDirectory()) continue;
        const profileDir = path.join(providerDir, profileEntry.name);
        const files = await fs.readdir(profileDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          if (file.name !== 'projects.json' && file.name !== 'conversations.json') continue;
          const kind = file.name === 'projects.json' ? 'projects' : 'conversations';
          const fullPath = path.join(profileDir, file.name);
          try {
            const raw = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(raw) as { fetchedAt?: string; sourceUrl?: string | null };
            const fetchedAt = parsed?.fetchedAt ?? null;
            const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
            const ageMs = Number.isFinite(fetchedMs) ? Date.now() - fetchedMs : NaN;
            const ageHours = Number.isFinite(ageMs) ? Math.round((ageMs / 3600000) * 10) / 10 : null;
            const stale = !Number.isFinite(fetchedMs) || ageMs > PROVIDER_CACHE_TTL_MS;
            output.push({
              provider: providerEntry.name,
              profileKey: profileEntry.name,
              kind,
              fetchedAt,
              ageHours,
              stale,
              sourceUrl: parsed?.sourceUrl ?? null,
            });
          } catch (error) {
            console.warn(`Failed to read cache file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    console.log(JSON.stringify(output, null, 2));
  });

program
  .command('doctor')
  .description('Verify that the browser UI matches the expected selectors.')
  .option('--target <chatgpt|grok>', 'Choose which provider to inspect (chatgpt or grok).')
  .option('--save-snapshot', 'Save a semantic snapshot of the page even if checks pass.')
  .action(async (commandOptions) => {
    const { config: userConfig } = await loadUserConfig();
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
    try {
      const { report, port } = await client.diagnose({
        basePath: process.cwd(),
        saveSnapshot: Boolean(commandOptions.saveSnapshot),
      });

      console.log(`Diagnosed ${target} via port ${port}.`);
      console.log(`\nDiagnosis for ${report.url}:`);
      const tableData = report.checks.map((c) => ({
        Component: c.name,
        Status: c.matched ? '✅ PASS' : '❌ FAIL',
        Matches: c.matchCount,
        Selector: c.matchedSelector || c.selectors[0],
      }));

      if (process.stdout.isTTY) {
        console.table(tableData);
      } else {
        console.log(JSON.stringify(tableData, null, 2));
      }

      if (report.snapshotPath) {
        console.log(`\nSnapshot saved to: ${report.snapshotPath}`);
      }

      if (!report.allPassed) {
        console.error('\nSome selectors failed to match. The UI structure may have changed.');
        process.exit(1);
      }
    } catch (error) {
      console.error(`Failed to connect or diagnose: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

async function refreshProviderCache(
  providerId: 'chatgpt' | 'grok',
  userConfig: UserConfig,
  listOptions: BrowserProviderListOptions,
): Promise<void> {
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: providerId });
  const provider = client.provider;
  const cacheContext = { provider: providerId, userConfig, listOptions };
  if (provider.listProjects) {
    const projects = await provider.listProjects(listOptions);
    if (Array.isArray(projects)) {
      await writeProjectCache(cacheContext, projects);
    }
  }
  if (provider.listConversations) {
    const conversations = await provider.listConversations(undefined, listOptions);
    if (Array.isArray(conversations)) {
      await writeConversationCache(cacheContext, conversations);
    }
  }
}

function filterConversationsByQuery<T extends Array<{ id?: string; title?: string }>>(
  conversations: T,
  rawFilter: unknown,
): T;
function filterConversationsByQuery(conversations: unknown, rawFilter: unknown): unknown;
function filterConversationsByQuery(conversations: unknown, rawFilter: unknown): unknown {
  if (!Array.isArray(conversations)) return conversations;
  const filter = typeof rawFilter === 'string' ? rawFilter.trim().toLowerCase() : '';
  if (!filter) return conversations;
  return conversations.filter((entry) => {
    const value = entry as { id?: string; title?: string } | null;
    const title = String(value?.title ?? '').toLowerCase();
    const id = String(value?.id ?? '').toLowerCase();
    return title.includes(filter) || id.includes(filter);
  });
}

async function resolveBrowserNameHints(options: CliOptions, userConfig: UserConfig): Promise<void> {
  const projectName = typeof options.projectName === 'string' ? options.projectName.trim() : '';
  const conversationName = typeof options.conversationName === 'string' ? options.conversationName.trim() : '';
  
  if (options.verbose) {
    console.log(chalk.dim(`[hints] projectName=${projectName} conversationName=${conversationName}`));
  }

  if (!projectName && !conversationName) {
    return;
  }
  const modelName = (options.model ?? '').toLowerCase();
  const target = modelName.startsWith('grok')
    ? 'grok'
    : modelName.startsWith('gemini')
      ? 'gemini'
      : options.browserTarget ?? userConfig.browser?.target ?? 'chatgpt';
  if (target === 'gemini') {
    return;
  }
  const configuredUrl =
    target === 'grok'
      ? options.grokUrl ?? userConfig.browser?.grokUrl ?? null
      : options.chatgptUrl ?? options.browserUrl ?? userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null;
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
  const listOptions = await client.buildListOptions({
    configuredUrl,
    includeHistory: true,
    historyLimit: 200,
  });
  const cacheContext = { provider: target, userConfig, listOptions: { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null } };
  const provider = client.provider;

  if (!options.projectId && projectName) {
    options.projectId = await resolveProjectIdByName({
      projectName,
      cacheContext,
      provider,
      forceRefresh: false,
      allowAutoRefresh: !options.dryRun,
    });
    if (options.projectId) {
      console.log(chalk.dim(`Resolved project "${projectName}" to ${options.projectId}`));
    }
  }
  if (!options.conversationId && conversationName) {
    const match = await resolveConversationByName({
      conversationName,
      cacheContext,
      provider,
      projectId: options.projectId ?? undefined,
      forceRefresh: false,
      allowAutoRefresh: !options.dryRun,
    });
    if (match) {
      console.log(chalk.dim(`Resolved conversation "${conversationName}" to ${match.id}`));
      options.conversationId = match.id;
    }
  }
}

async function buildBrowserContext({
  options,
  userConfig,
  browserConfig,
  model,
}: {
  options: CliOptions;
  userConfig: UserConfig;
  browserConfig?: BrowserSessionConfig;
  model: string;
}): Promise<BrowserContextMetadata | null> {
  if (!browserConfig) {
    return null;
  }
  const target = browserConfig.target ?? (model.toLowerCase().startsWith('grok') ? 'grok' : 'chatgpt');
  if (target === 'gemini') {
    return null;
  }
  const configuredUrl =
    target === 'grok'
      ? browserConfig.grokUrl ?? userConfig.browser?.grokUrl ?? null
      : browserConfig.chatgptUrl ?? browserConfig.url ?? userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null;
  const projectName = options.projectName ? options.projectName.trim() : null;
  const conversationName = options.conversationName ? options.conversationName.trim() : null;
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
  const listOptions = await client.buildListOptions({ configuredUrl });
  const cacheKey = resolveProviderCacheKey({ provider: target, userConfig, listOptions });
  return {
    provider: target,
    projectId: browserConfig.projectId ?? null,
    projectName: projectName?.length ? projectName : null,
    conversationId: browserConfig.conversationId ?? null,
    conversationName: conversationName?.length ? conversationName : null,
    configuredUrl,
    cacheKey,
  };
}

async function resolveProjectIdByName({
  projectName,
  cacheContext,
  provider,
  forceRefresh,
  allowAutoRefresh = true,
}: {
  projectName: string;
  cacheContext: {
    provider: 'chatgpt' | 'grok';
    userConfig: UserConfig;
    listOptions: BrowserProviderListOptions;
  };
  provider: BrowserProvider;
  forceRefresh: boolean;
  allowAutoRefresh?: boolean;
}): Promise<string> {
  let cached = await readProjectCache(cacheContext);
  if ((forceRefresh || (allowAutoRefresh && cached.stale)) && provider.listProjects) {
    const port = cacheContext.listOptions.port;
    if (port && await isPortOpen('127.0.0.1', port)) {
      try {
        const refreshed = await provider.listProjects(cacheContext.listOptions);
        if (Array.isArray(refreshed)) {
          await writeProjectCache(cacheContext, refreshed);
          cached = { items: refreshed, fetchedAt: Date.now(), stale: false };
        }
      } catch (error) {
        console.warn(`Failed to refresh projects: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (forceRefresh) {
      console.warn(`Cannot refresh projects: Chrome DevTools port ${port ?? '(unknown)'} is not open.`);
    }
  } else if (forceRefresh && !provider.listProjects) {
    console.warn('Project refresh requested, but this provider does not support project listing.');
  }
  const { match, candidates } = matchProjectByName(cached.items, projectName);
  if (match) {
    return match.id;
  }
  if (candidates.length > 1) {
    const names = candidates.map((item) => item.name || item.id).join(', ');
    throw new Error(`Project name "${projectName}" is ambiguous. Matches: ${names}`);
  }
  throw new Error(`No cached project named "${projectName}". Run "oracle projects" to refresh.`);
}

async function resolveConversationByName({
  conversationName,
  cacheContext,
  provider,
  projectId,
  forceRefresh,
  allowAutoRefresh = true,
}: {
  conversationName: string;
  cacheContext: {
    provider: 'chatgpt' | 'grok';
    userConfig: UserConfig;
    listOptions: BrowserProviderListOptions;
  };
  provider: BrowserProvider;
  projectId?: string;
  forceRefresh: boolean;
  allowAutoRefresh?: boolean;
}): Promise<{ id: string; title?: string; url?: string } | null> {
  let cached = await readConversationCache(cacheContext);
  if ((forceRefresh || (allowAutoRefresh && cached.stale)) && provider.listConversations) {
    const port = cacheContext.listOptions.port;
    if (port && await isPortOpen('127.0.0.1', port)) {
      try {
        const conversations = await provider.listConversations(projectId, cacheContext.listOptions);
        if (Array.isArray(conversations)) {
          await writeConversationCache(cacheContext, conversations);
          cached = { items: conversations, fetchedAt: Date.now(), stale: false };
        }
      } catch (error) {
        console.warn(`Failed to refresh conversations: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (forceRefresh) {
      console.warn(`Cannot refresh conversations: Chrome DevTools port ${port ?? '(unknown)'} is not open.`);
    }
  } else if (forceRefresh && !provider.listConversations) {
    console.warn('Conversation refresh requested, but this provider does not support conversation listing.');
  }

  const { match, candidates } = matchConversationByTitle(cached.items, conversationName);
  if (match) {
    return match;
  }
  if (candidates.length > 1) {
    const names = candidates.map((item) => item.title || item.id).join(', ');
    throw new Error(`Conversation name "${conversationName}" is ambiguous. Matches: ${names}`);
  }
  throw new Error(`No cached conversation named "${conversationName}". Run "oracle conversations" to refresh.`);
}

program
  .command('login')
  .description('Launch the configured browser profile for ChatGPT, Gemini, or Grok sign-in.')
  .option('--chatgpt', 'Alias for --target chatgpt.')
  .option('--gemini', 'Alias for --target gemini.')
  .option('--grok', 'Alias for --target grok.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which site to open (chatgpt, gemini, or grok).')
  .option('--chatgpt-url <url>', 'Override the ChatGPT URL for login.')
  .option('--gemini-url <url>', 'Override the Gemini URL for login.')
  .option('--grok-url <url>', 'Override the Grok URL for login.')
  .option('--export-cookies', 'Export Gemini cookies to ~/.oracle/cookies.json while you sign in.')
  .addOption(new Option('--browser-chrome-path <path>', 'Chrome/Chromium executable path.'))
  .addOption(new Option('--browser-chrome-profile <name>', 'Chrome profile name to launch.'))
  .addOption(new Option('--browser-cookie-path <path>', 'Cookie DB path to infer the browser profile.'))
  .addOption(new Option('--browser-manual-login-profile-dir <path>', 'Manual-login profile directory override.'))
  .addOption(
    new Option(
      '--browser-wsl-chrome <auto|wsl|windows>',
      'On WSL, prefer WSL-native Chrome or Windows-hosted Chrome (default: auto).',
    )
      .choices(['auto', 'wsl', 'windows']),
  )
  .action(async (commandOptions) => {
    const { config: userConfig } = await loadUserConfig();
    const explicitTarget = commandOptions.target;
    const aliasTarget = commandOptions.grok ? 'grok' : commandOptions.gemini ? 'gemini' : commandOptions.chatgpt ? 'chatgpt' : undefined;
    if (explicitTarget && aliasTarget && explicitTarget !== aliasTarget) {
      throw new Error('Do not combine --target with --chatgpt/--gemini/--grok.');
    }
    const target = (explicitTarget ?? aliasTarget ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid login target "${target}". Use "chatgpt", "gemini", or "grok".`);
    }

    const chromePath =
      commandOptions.browserChromePath ?? userConfig.browser?.chromePath ?? undefined;
    if (!chromePath) {
      throw new Error('Missing browser chromePath. Set browser.chromePath in config or pass --browser-chrome-path.');
    }
    const manualLoginDir =
      commandOptions.browserManualLoginProfileDir ??
      userConfig.browser?.manualLoginProfileDir ??
      path.join(os.homedir(), '.oracle', 'browser-profile');
    const chromeProfile =
      commandOptions.browserChromeProfile ?? userConfig.browser?.chromeProfile ?? 'Default';
    const cookiePath =
      commandOptions.browserCookiePath ?? userConfig.browser?.chromeCookiePath ?? undefined;

    const client = await BrowserAutomationClient.fromConfig(userConfig, {
      target: target === 'grok' ? 'grok' : 'chatgpt',
    });
    await client.login({
      target,
      chromePath,
      chromeProfile,
      manualLoginProfileDir: manualLoginDir,
      cookiePath,
      chatgptUrl:
        commandOptions.chatgptUrl ??
        userConfig.browser?.chatgptUrl ??
        userConfig.browser?.url ??
        CHATGPT_URL,
      geminiUrl: commandOptions.geminiUrl ?? userConfig.browser?.geminiUrl ?? 'https://gemini.google.com/app',
      grokUrl: commandOptions.grokUrl ?? userConfig.browser?.grokUrl ?? GROK_URL,
      exportCookies: Boolean(commandOptions.exportCookies),
    });
  });

program
  .command('tui')
  .description('Launch the interactive terminal UI for humans (no automation).')
  .action(async () => {
    await sessionStore.ensureStorage();
    await launchTui({ version: VERSION, printIntro: false });
  });

const sessionCommand = program
  .command('session [id]')
  .description('Attach to a stored session or list recent sessions when no ID is provided.')
  .option('--hours <hours>', 'Look back this many hours when listing sessions (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show when listing (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .option('--clear', 'Delete stored sessions older than the provided window (24h default).', false)
  .option('--hide-prompt', 'Hide stored prompt when displaying a session.', false)
  .option('--render', 'Render completed session output as markdown (rich TTY only).', false)
  .option('--render-markdown', 'Alias for --render.', false)
  .option('--open-conversation', 'Open the provider conversation linked to this session.', false)
  .option('--print-url', 'Print the linked conversation URL instead of opening it.', false)
  .option('--browser-path <path>', 'Override the browser binary to open the conversation URL.')
  .option('--browser-profile <name>', 'Override the browser profile directory for open-conversation.')
  .option('--model <name>', 'Filter sessions/output for a specific model.', '')
  .option('--path', 'Print the stored session paths instead of attaching.', false)
  .addOption(new Option('--clean', 'Deprecated alias for --clear.').default(false).hideHelp())
  .action(async (sessionId, _options: StatusOptions, cmd: Command) => {
    const { config: userConfig } = await loadUserConfig();
    await handleSessionCommand(sessionId, cmd, undefined, userConfig);
  });

const statusCommand = program
  .command('status [id]')
  .description('List recent sessions (24h window by default) or attach to a session when an ID is provided.')
  .option('--hours <hours>', 'Look back this many hours (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .option('--clear', 'Delete stored sessions older than the provided window (24h default).', false)
  .option('--render', 'Render completed session output as markdown (rich TTY only).', false)
  .option('--render-markdown', 'Alias for --render.', false)
  .option('--model <name>', 'Filter sessions/output for a specific model.', '')
  .option('--hide-prompt', 'Hide stored prompt when displaying a session.', false)
  .addOption(new Option('--clean', 'Deprecated alias for --clear.').default(false).hideHelp())
  .action(async (sessionId: string | undefined, _options: StatusOptions, command: Command) => {
    const statusOptions = command.opts<StatusOptions>();
    const clearRequested = Boolean(statusOptions.clear || statusOptions.clean);
    if (clearRequested) {
      if (sessionId) {
        console.error('Cannot combine a session ID with --clear. Remove the ID to delete cached sessions.');
        process.exitCode = 1;
        return;
      }
      const hours = statusOptions.hours;
      const includeAll = statusOptions.all;
      const result = await sessionStore.deleteOlderThan({ hours, includeAll });
      const scope = includeAll ? 'all stored sessions' : `sessions older than ${hours}h`;
      console.log(formatSessionCleanupMessage(result, scope));
      return;
    }
    if (sessionId === 'clear' || sessionId === 'clean') {
      console.error('Session cleanup now uses --clear. Run "oracle status --clear --hours <n>" instead.');
      process.exitCode = 1;
      return;
    }
    if (sessionId) {
      const autoRender = !command.getOptionValueSource?.('render') && !command.getOptionValueSource?.('renderMarkdown')
        ? process.stdout.isTTY
        : false;
      const renderMarkdown = Boolean(statusOptions.render || statusOptions.renderMarkdown || autoRender);
      await attachSession(sessionId, { renderMarkdown, renderPrompt: !statusOptions.hidePrompt });
      return;
    }
    const showExamples = usesDefaultStatusFilters(command);
    await showStatus({
      hours: statusOptions.all ? Infinity : statusOptions.hours,
      includeAll: statusOptions.all,
      limit: statusOptions.limit,
      showExamples,
    });
  });

function buildRunOptions(options: ResolvedCliOptions, overrides: Partial<RunOracleOptions> = {}): RunOracleOptions {
  if (!options.prompt) {
    throw new Error('Prompt is required.');
  }
  const normalizedBaseUrl = normalizeBaseUrl(overrides.baseUrl ?? options.baseUrl);
  const azure =
    options.azureEndpoint || overrides.azure?.endpoint
      ? {
          endpoint: overrides.azure?.endpoint ?? options.azureEndpoint,
          deployment: overrides.azure?.deployment ?? options.azureDeployment,
          apiVersion: overrides.azure?.apiVersion ?? options.azureApiVersion,
        }
      : undefined;

  return {
    prompt: options.prompt,
    model: options.model,
    models: overrides.models ?? options.models,
    effectiveModelId: overrides.effectiveModelId ?? options.effectiveModelId ?? options.model,
    file: overrides.file ?? options.file ?? [],
    slug: overrides.slug ?? options.slug,
    filesReport: overrides.filesReport ?? options.filesReport,
    maxInput: overrides.maxInput ?? options.maxInput,
    maxOutput: overrides.maxOutput ?? options.maxOutput,
    system: overrides.system ?? options.system,
    timeoutSeconds: overrides.timeoutSeconds ?? (options.timeout as number | 'auto' | undefined),
    silent: overrides.silent ?? options.silent,
    search: overrides.search ?? options.search,
    preview: overrides.preview ?? undefined,
    previewMode: overrides.previewMode ?? options.previewMode,
    apiKey: overrides.apiKey ?? options.apiKey,
    baseUrl: normalizedBaseUrl,
    azure,
    sessionId: overrides.sessionId ?? options.sessionId,
    verbose: overrides.verbose ?? options.verbose,
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? resolveHeartbeatIntervalMs(options.heartbeat),
    browserAttachments: overrides.browserAttachments ?? (options.browserAttachments as 'auto' | 'never' | 'always' | undefined) ?? 'auto',
    browserInlineFiles: overrides.browserInlineFiles ?? options.browserInlineFiles ?? false,
    browserBundleFiles: overrides.browserBundleFiles ?? options.browserBundleFiles ?? false,
    background: overrides.background ?? undefined,
    renderPlain: overrides.renderPlain ?? options.renderPlain ?? false,
    writeOutputPath: overrides.writeOutputPath ?? options.writeOutputPath,
  };
}

export function enforceBrowserSearchFlag(
  runOptions: RunOracleOptions,
  sessionMode: SessionMode,
  logFn: (message: string) => void = console.log,
): void {
  if (sessionMode === 'browser' && runOptions.search === false) {
    logFn(chalk.dim('Note: search is not available in browser engine; ignoring search=false.'));
    runOptions.search = undefined;
  }
}

function resolveHeartbeatIntervalMs(seconds: number | undefined): number | undefined {
  if (typeof seconds !== 'number' || seconds <= 0) {
    return undefined;
  }
  return Math.round(seconds * 1000);
}

function buildRunOptionsFromMetadata(metadata: SessionMetadata): RunOracleOptions {
  const stored = metadata.options ?? {};
  return {
    prompt: stored.prompt ?? '',
    model: (stored.model as ModelName) ?? DEFAULT_MODEL,
    models: stored.models as ModelName[] | undefined,
    effectiveModelId: stored.effectiveModelId ?? stored.model,
    file: stored.file ?? [],
    slug: stored.slug,
    filesReport: stored.filesReport,
    maxInput: stored.maxInput,
    maxOutput: stored.maxOutput,
    system: stored.system,
    silent: stored.silent,
    search: stored.search,
    preview: false,
    previewMode: undefined,
    apiKey: undefined,
    baseUrl: normalizeBaseUrl(stored.baseUrl),
    azure: stored.azure,
    sessionId: metadata.id,
    verbose: stored.verbose,
    heartbeatIntervalMs: stored.heartbeatIntervalMs,
    browserAttachments: stored.browserAttachments,
    browserInlineFiles: stored.browserInlineFiles,
    browserBundleFiles: stored.browserBundleFiles,
    background: stored.background,
    renderPlain: stored.renderPlain,
    writeOutputPath: stored.writeOutputPath,
  };
}

function getSessionMode(metadata: SessionMetadata): SessionMode {
  return metadata.mode ?? metadata.options?.mode ?? 'api';
}

function getBrowserConfigFromMetadata(metadata: SessionMetadata): BrowserSessionConfig | undefined {
  return metadata.options?.browserConfig ?? metadata.browser?.config;
}

async function runRootCommand(options: CliOptions): Promise<void> {
  if (process.env.ORACLE_FORCE_TUI === '1') {
    await sessionStore.ensureStorage();
    await launchTui({ version: VERSION, printIntro: false });
    return;
  }
  const config = await resolveConfig(options, process.cwd(), process.env);
  const userConfig = config; // Keep reference for existing code usage

  const helpRequested = rawCliArgs.some((arg: string) => arg === '--help' || arg === '-h');
  const multiModelProvided = Array.isArray(options.models) && options.models.length > 0;
  
  const optionUsesDefault = (name: string): boolean => {
    const source = program.getOptionValueSource?.(name);
    return source == null || source === 'default';
  };

  if (!optionUsesDefault('model') && multiModelProvided) {
    throw new Error('--models cannot be combined with --model.');
  }

  const userForcedBrowser = options.browser || options.engine === 'browser';
  const cliModelArg = normalizeModelOption(options.model);

  if (helpRequested) {
    if (options.verbose) {
      console.log('');
      printDebugHelp(program.name());
      console.log('');
    }
    program.help({ error: false });
    return;
  }
  const previewMode = resolvePreviewMode(options.dryRun || options.preview);
  const mergedFileInputs = mergePathLikeOptions(
    options.file,
    options.include,
    options.files,
    options.path,
    options.paths,
  );
  if (mergedFileInputs.length > 0) {
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    options.file = deduped;
  }
  const copyMarkdown = options.copyMarkdown || options.copy;
  const renderMarkdown = resolveRenderFlag(options.render, options.renderMarkdown);
  const renderPlain = resolveRenderPlain(options.renderPlain, options.render, options.renderMarkdown);

  const applyRetentionOption = (): void => {
    if (optionUsesDefault('retainHours') && typeof userConfig.sessionRetentionHours === 'number') {
      options.retainHours = userConfig.sessionRetentionHours;
    }
    const envRetention = process.env.ORACLE_RETAIN_HOURS;
    if (optionUsesDefault('retainHours') && envRetention) {
      const parsed = Number.parseFloat(envRetention);
      if (!Number.isNaN(parsed)) {
        options.retainHours = parsed;
      }
    }
  };
  applyRetentionOption();

  const remoteHost =
    options.remoteHost ?? userConfig.remoteHost ?? userConfig.remote?.host ?? process.env.ORACLE_REMOTE_HOST;
  const remoteToken =
    options.remoteToken ?? userConfig.remoteToken ?? userConfig.remote?.token ?? process.env.ORACLE_REMOTE_TOKEN;
  if (remoteHost) {
    console.log(chalk.dim(`Remote browser host detected: ${remoteHost}`));
  }

  if (userCliArgs.length === 0) {
    console.log(chalk.yellow('No prompt or subcommand supplied. Run `oracle --help` or `oracle tui` for the TUI.'));
    program.outputHelp();
    return;
  }
  const retentionHours = typeof options.retainHours === 'number' ? options.retainHours : undefined;
  await sessionStore.ensureStorage();
  await pruneOldSessions(retentionHours, (message) => console.log(chalk.dim(message)));

  if (options.debugHelp) {
    printDebugHelp(program.name());
    return;
  }
  if (options.dryRun && options.renderMarkdown) {
    throw new Error('--dry-run cannot be combined with --render-markdown.');
  }

  let engine = config.engine || 'api';
  const resolvedModel = config.model;
  const resolvedBaseUrl = config.apiBaseUrl;
  
  if (options.browser) {
    console.log(chalk.yellow('`--browser` is deprecated; use `--engine browser` instead.'));
  }

  if (remoteHost && engine !== 'browser') {
    throw new Error('--remote-host requires --engine browser.');
  }
  if (remoteHost && options.remoteChrome) {
    throw new Error('--remote-host cannot be combined with --remote-chrome.');
  }

  const normalizedMultiModels: ModelName[] = multiModelProvided
    ? Array.from(new Set(options.models!.map((entry) => resolveApiModel(entry))))
    : [];

  const effectiveModelId = resolvedModel.startsWith('gemini')
    ? resolveGeminiModelId(resolvedModel)
    : isKnownModel(resolvedModel)
      ? MODEL_CONFIGS[resolvedModel].apiModel ?? resolvedModel
      : resolvedModel;
  
  const { models: _rawModels, ...optionsWithoutModels } = options;
  const resolvedOptions: ResolvedCliOptions = { ...optionsWithoutModels, model: resolvedModel };
  if (normalizedMultiModels.length > 0) {
    resolvedOptions.models = normalizedMultiModels;
  }
  resolvedOptions.baseUrl = resolvedBaseUrl;
  resolvedOptions.effectiveModelId = effectiveModelId;
  resolvedOptions.writeOutputPath = resolveOutputPath(options.writeOutput, process.cwd());

  // Decide whether to block until completion:
  let waitPreference = resolveWaitFlag({
    waitFlag: options.wait,
    noWaitFlag: options.noWait,
    model: resolvedModel,
    engine,
  });
  if (remoteHost && !waitPreference) {
    console.log(chalk.dim('Remote browser runs require --wait; ignoring --no-wait.'));
    waitPreference = true;
  }

  await resolveBrowserNameHints(options, userConfig as any);

  if (await handleStatusFlag(options, { attachSession, showStatus })) {
    return;
  }

  if (await handleSessionAlias(options, { attachSession })) {
    return;
  }

  if (options.execSession) {
    await executeSession(options.execSession);
    return;
  }

  if (renderMarkdown || copyMarkdown) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --render-markdown or --copy-markdown.');
    }
    const bundle = await buildMarkdownBundle(
      { prompt: options.prompt, file: options.file, system: options.system },
      { cwd: process.cwd() },
    );
    const modelConfig = isKnownModel(resolvedModel) ? MODEL_CONFIGS[resolvedModel] : MODEL_CONFIGS['gpt-5.1'];
    const requestBody = buildRequestBody({
      modelConfig,
      systemPrompt: bundle.systemPrompt,
      userPrompt: bundle.promptWithFiles,
      searchEnabled: options.search !== false,
      background: false,
      storeResponse: false,
    });
    const estimatedTokens = estimateRequestTokens(requestBody, modelConfig);
    const warnThreshold = Math.min(196_000, modelConfig.inputLimit ?? 196_000);
    warnIfOversizeBundle(estimatedTokens, warnThreshold, console.log);
    if (renderMarkdown) {
      const output = renderPlain
        ? bundle.markdown
        : await formatRenderedMarkdown(bundle.markdown, { richTty: isTty });
      // Trim trailing newlines from the rendered bundle so we print exactly one blank before the summary line.
      console.log(output.replace(/\n+$/u, ''));
    }
    if (copyMarkdown) {
      const result = await copyToClipboard(bundle.markdown);
      if (result.success) {
        const filesPart = bundle.files.length > 0 ? `; ${bundle.files.length} files` : '';
        const summary = `Copied markdown to clipboard (~${formatCompactNumber(estimatedTokens)} tokens${filesPart}).`;
        console.log(chalk.green(summary));
      } else {
        const reason = result.error instanceof Error ? result.error.message : String(result.error ?? 'unknown error');
        console.log(
          chalk.dim(
            `Copy failed (${reason}); markdown not printed. Re-run with --render-markdown if you need the content.`,
          ),
        );
      }
    }
    return;
  }

  if (previewMode) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --dry-run/preview.');
    }
    if (userConfig.promptSuffix) {
      options.prompt = `${options.prompt.trim()}\n${userConfig.promptSuffix}`;
    }
    resolvedOptions.prompt = options.prompt;
    const runOptions = buildRunOptions(resolvedOptions, { preview: true, previewMode, baseUrl: resolvedBaseUrl });
    if (engine === 'browser') {
      await runBrowserPreview(
        {
          runOptions,
          cwd: process.cwd(),
          version: VERSION,
          previewMode,
          log: console.log,
        },
        {},
      );
      return;
    }
    // API dry-run/preview path
    if (previewMode === 'summary') {
      await runDryRunSummary(
        {
          engine,
          runOptions,
          cwd: process.cwd(),
          version: VERSION,
          log: console.log,
        },
        {},
      );
      return;
    }
    await runDryRunSummary(
      {
        engine,
        runOptions,
        cwd: process.cwd(),
        version: VERSION,
        log: console.log,
      },
      {},
    );
    return;
  }

  if (!options.prompt) {
    throw new Error('Prompt is required when starting a new session.');
  }

  if (userConfig.promptSuffix) {
    options.prompt = `${options.prompt.trim()}\n${userConfig.promptSuffix}`;
  }
  resolvedOptions.prompt = options.prompt;

  const duplicateBlocked = await shouldBlockDuplicatePrompt({
    prompt: resolvedOptions.prompt,
    force: options.force,
    sessionStore,
    log: console.log,
  });
  if (duplicateBlocked) {
    process.exitCode = 1;
    return;
  }

  if (options.file && options.file.length > 0) {
    const isBrowserMode = engine === 'browser' || userForcedBrowser;
    const filesToValidate = isBrowserMode ? options.file.filter((f: string) => !isMediaFile(f)) : options.file;
    if (filesToValidate.length > 0) {
      await readFiles(filesToValidate, { cwd: process.cwd() });
    }
  }

  const getSource = (key: keyof CliOptions) => program.getOptionValueSource?.(key as string) ?? undefined;

  const notifications = resolveNotificationSettings({
    cliNotify: options.notify,
    cliNotifySound: options.notifySound,
    env: process.env,
    config: userConfig.notify,
  });

  const sessionMode: SessionMode = engine === 'browser' ? 'browser' : 'api';
  const browserModelLabelOverride =
    sessionMode === 'browser'
      ? (options.browserModelLabel || !resolvedModel.startsWith('grok')
          ? resolveBrowserModelLabel(options.browserModelLabel ?? cliModelArg, resolvedModel)
          : undefined)
      : undefined;
  const browserConfig =
    sessionMode === 'browser'
      ? await buildBrowserConfig({
          ...options,
          model: resolvedModel,
          browserModelLabel: browserModelLabelOverride,
          browserManualLogin: config.browser.manualLogin,
          browserManualLoginProfileDir: config.browser.manualLoginProfileDir,
          browserChromeProfile: config.browser.chromeProfile,
          browserChromePath: config.browser.chromePath,
          browserCookiePath: config.browser.chromeCookiePath,
          browserHeadless: config.browser.headless,
          browserHideWindow: config.browser.hideWindow,
          browserKeepBrowser: config.browser.keepBrowser,
          browserTimeout: config.browser.timeoutMs ? String(config.browser.timeoutMs) : undefined,
          browserInputTimeout: config.browser.inputTimeoutMs ? String(config.browser.inputTimeoutMs) : undefined,
          browserCookieWait: config.browser.cookieSyncWaitMs ? String(config.browser.cookieSyncWaitMs) : undefined,
        })
      : undefined;
  const browserContext = await buildBrowserContext({
    options,
    userConfig,
    browserConfig,
    model: resolvedModel,
  });

  let browserDeps: BrowserSessionRunnerDeps | undefined;
  if (browserConfig && remoteHost) {
    browserDeps = {
      executeBrowser: createRemoteBrowserExecutor({ host: remoteHost, token: remoteToken }),
    };
    console.log(chalk.dim(`Routing browser automation to remote host ${remoteHost}`));
  } else if (browserConfig && resolvedModel.startsWith('gemini')) {
    browserDeps = {
      executeBrowser: createGeminiWebExecutor({
        youtube: options.youtube,
        generateImage: options.generateImage,
        editImage: options.editImage,
        outputPath: options.output,
        aspectRatio: options.aspect,
        showThoughts: options.geminiShowThoughts,
        geminiUrl: options.geminiUrl ?? userConfig.browser?.geminiUrl ?? undefined,
      }),
    };
    console.log(chalk.dim('Using Gemini web client for browser automation'));
    if (browserConfig.modelStrategy && browserConfig.modelStrategy !== 'select') {
      console.log(chalk.dim('Browser model strategy is ignored for Gemini web runs.'));
    }
  }
  const remoteExecutionActive = Boolean(browserDeps);

  if (options.dryRun) {
    const baseRunOptions = buildRunOptions(resolvedOptions, {
      preview: false,
      previewMode: undefined,
      baseUrl: resolvedBaseUrl,
    });
    await runDryRunSummary(
      {
        engine,
        runOptions: baseRunOptions,
        cwd: process.cwd(),
        version: VERSION,
        log: console.log,
        browserConfig,
      },
      {},
    );
    return;
  }

  await sessionStore.ensureStorage();
  const baseRunOptions = buildRunOptions(resolvedOptions, {
    preview: false,
    previewMode: undefined,
    background: userConfig.background ?? resolvedOptions.background,
    baseUrl: resolvedBaseUrl,
  });
  enforceBrowserSearchFlag(baseRunOptions, sessionMode, console.log);
  if (sessionMode === 'browser' && baseRunOptions.search === false) {
    console.log(chalk.dim('Note: search is not available in browser engine; ignoring search=false.'));
    baseRunOptions.search = undefined;
  }
  let sessionMeta = await sessionStore.createSession(
    {
      ...resolvedOptions,
      mode: engine as SessionMode,
      browserConfig,
    },
    process.cwd(),
    notifications,
  );
  if (browserContext && sessionMode === 'browser') {
    sessionMeta = await sessionStore.updateSession(sessionMeta.id, {
      browser: { config: browserConfig, context: browserContext },
    });
  }
  const liveRunOptions: RunOracleOptions = {
    ...baseRunOptions,
    sessionId: sessionMeta.id,
    effectiveModelId,
  };
  const disableDetachEnv = process.env.ORACLE_NO_DETACH === '1';
  const detachAllowed = remoteExecutionActive
    ? false
    : shouldDetachSession({
        engine,
        model: resolvedModel,
        waitPreference,
        disableDetachEnv,
      });
  const detached = !detachAllowed
    ? false
    : await launchDetachedSession(sessionMeta.id).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`Unable to detach session runner (${message}). Running inline...`));
      return false;
    });

  if (!waitPreference) {
    if (!detached) {
      console.log(chalk.red('Unable to start in background; use --wait to run inline.'));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.blue(`Session running in background. Reattach via: oracle session ${sessionMeta.id}`));
    console.log(
      chalk.dim('Pro runs can take up to 60 minutes (usually 10-15). Add --wait to stay attached.'),
    );
    return;
  }

  if (detached === false) {
    await runInteractiveSession(
      sessionMeta,
      liveRunOptions,
      sessionMode,
      browserConfig,
      false,
      notifications,
      userConfig,
      true,
      browserDeps,
    );
    return;
  }
  if (detached) {
    console.log(chalk.blue(`Reattach via: oracle session ${sessionMeta.id}`));
    await attachSession(sessionMeta.id, { suppressMetadata: true });
  }
}

async function runInteractiveSession(
  sessionMeta: SessionMetadata,
  runOptions: RunOracleOptions,
  mode: SessionMode,
  browserConfig?: BrowserSessionConfig,
  showReattachHint = true,
  notifications?: NotificationSettings,
  userConfig?: UserConfig,
  suppressSummary = false,
  browserDeps?: BrowserSessionRunnerDeps,
): Promise<void> {
  const { logLine, writeChunk, stream } = sessionStore.createLogWriter(sessionMeta.id);
  let headerAugmented = false;
  const combinedLog = (message = ''): void => {
    if (!headerAugmented && message.startsWith('oracle (')) {
      headerAugmented = true;
      if (showReattachHint) {
        console.log(`${message}\n${chalk.blue(`Reattach via: oracle session ${sessionMeta.id}`)}`);
      } else {
        console.log(message);
      }
      logLine(message);
      return;
    }
    console.log(message);
    logLine(message);
  };
  const combinedWrite = (chunk: string): boolean => {
    // runOracle handles stdout; keep this write hook for session logs only to avoid double-printing
    writeChunk(chunk);
    return true;
  };
  try {
    await performSessionRun({
      sessionMeta,
      runOptions,
      mode,
      browserConfig,
      cwd: process.cwd(),
      log: combinedLog,
      write: combinedWrite,
      version: VERSION,
      notifications:
        notifications ?? deriveNotificationSettingsFromMetadata(sessionMeta, process.env, userConfig?.notify),
      browserDeps,
    });
    const latest = await sessionStore.readSession(sessionMeta.id);
    if (!suppressSummary) {
      const summary = latest ? formatCompletionSummary(latest, { includeSlug: true }) : null;
      if (summary) {
        console.log('\n' + chalk.green.bold(summary));
        logLine(summary); // plain text in log, colored on stdout
      }
    }
  } catch (error) {
    throw error;
  } finally {
    stream.end();
  }
}

async function launchDetachedSession(sessionId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const args = ['--', CLI_ENTRYPOINT, '--exec-session', sessionId];
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function executeSession(sessionId: string) {
  const metadata = await sessionStore.readSession(sessionId);
  if (!metadata) {
    console.error(chalk.red(`No session found with ID ${sessionId}`));
    process.exitCode = 1;
    return;
  }
  const runOptions = buildRunOptionsFromMetadata(metadata);
  const sessionMode = getSessionMode(metadata);
  const browserConfig = getBrowserConfigFromMetadata(metadata);
  const { logLine, writeChunk, stream } = sessionStore.createLogWriter(sessionId);
  const userConfig = (await loadUserConfig()).config;
  const notifications = deriveNotificationSettingsFromMetadata(metadata, process.env, userConfig.notify);
  try {
    await performSessionRun({
      sessionMeta: metadata,
      runOptions,
      mode: sessionMode,
      browserConfig,
      cwd: metadata.cwd ?? process.cwd(),
      log: logLine,
      write: writeChunk,
      version: VERSION,
      notifications,
    });
  } catch {
    // Errors are already logged to the session log; keep quiet to mirror stored-session behavior.
  } finally {
    stream.end();
  }
}

function printDebugHelp(cliName: string): void {
  console.log(chalk.bold('Advanced Options'));
  printDebugOptionGroup([
    ['--search <on|off>', 'Enable or disable the server-side search tool (default on).'],
    ['--max-input <tokens>', 'Override the input token budget.'],
    ['--max-output <tokens>', 'Override the max output tokens (model default otherwise).'],
  ]);
  console.log('');
  console.log(chalk.bold('Browser Options'));
  printDebugOptionGroup([
    ['--chatgpt-url <url>', 'Override the ChatGPT web URL (workspace/folder targets).'],
    ['--gemini-url <url>', 'Override the Gemini web URL (e.g., https://gemini.google.com/gem/<id>).'],
    ['--grok-url <url>', 'Override the Grok web URL (e.g., https://grok.com/project/<id>).'],
    ['--browser-target <chatgpt|gemini|grok>', 'Override the browser automation target.'],
    ['--browser-chrome-profile <name>', 'Reuse cookies from a specific Chrome profile.'],
    ['--browser-chrome-path <path>', 'Point to a custom Chrome/Chromium binary.'],
    ['--browser-cookie-path <path>', 'Use a specific Chrome/Chromium cookie store file.'],
    ['--browser-url <url>', 'Alias for --chatgpt-url.'],
    ['--browser-timeout <ms|s|m>', 'Cap total wait time for the assistant response.'],
    ['--browser-input-timeout <ms|s|m>', 'Cap how long we wait for the composer textarea.'],
    ['--browser-cookie-wait <ms|s|m>', 'Wait before retrying cookie sync when Chrome cookies are empty or locked.'],
    ['--browser-no-cookie-sync', 'Skip copying cookies from your main profile.'],
    ['--browser-manual-login', 'Skip cookie copy; reuse a persistent automation profile and log in manually.'],
    ['--browser-headless', 'Launch Chrome in headless mode.'],
    ['--browser-hide-window', 'Hide the Chrome window (macOS headful only).'],
    ['--browser-keep-browser', 'Leave Chrome running after completion.'],
  ]);
  console.log('');
  console.log(chalk.dim(`Tip: run \`${cliName} --help\` to see the primary option set.`));
}

function printDebugOptionGroup(entries: Array<[string, string]>): void {
  const flagWidth = Math.max(...entries.map(([flag]) => flag.length));
  entries.forEach(([flag, description]) => {
    const label = chalk.cyan(flag.padEnd(flagWidth + 2));
    console.log(`  ${label}${description}`);
  });
}

function resolveWaitFlag({
  waitFlag,
  noWaitFlag,
  model,
  engine,
}: {
  waitFlag?: boolean;
  noWaitFlag?: boolean;
  model: ModelName;
  engine: EngineMode;
}): boolean {
  if (waitFlag === true) return true;
  if (noWaitFlag === true) return false;
  return defaultWaitPreference(model, engine);
}


program.action(async function (this: Command) {
  const options = this.optsWithGlobals() as CliOptions;
  await runRootCommand(options);
});

async function main(): Promise<void> {
  try {
    const parsePromise = program.parseAsync(process.argv);
    const sigintPromise = once(process, 'SIGINT').then(() => 'sigint' as const);

    const result = await Promise.race([parsePromise, sigintPromise]);
    if (result === 'sigint') {
      console.log(chalk.yellow('\nInterrupted.'));
      process.exit(130);
    }
  } catch (error) {
    console.error(chalk.red('FATAL ERROR:'), error);
    process.exit(1);
  }
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    if (!isErrorLogged(error)) {
      console.error(chalk.red('✖'), error.message);
    }
  } else {
    console.error(chalk.red('✖'), error);
  }
  process.exitCode = 1;
});
