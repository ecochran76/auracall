import chalk from 'chalk';
import type { Command, OptionValues } from 'commander';
import { usesDefaultStatusFilters } from './options.js';
import { attachSession, showStatus, type AttachSessionOptions, type ShowStatusOptions } from './sessionDisplay.js';
import { sessionStore } from '../sessionStore.js';
import type { UserConfig } from '../config.js';
import { createLlmService } from '../browser/llmService/index.js';
import { spawn } from 'node:child_process';

export interface StatusOptions extends OptionValues {
  hours: number;
  limit: number;
  all: boolean;
  clear?: boolean;
  clean?: boolean;
  render?: boolean;
  renderMarkdown?: boolean;
  path?: boolean;
  verboseRender?: boolean;
  hidePrompt?: boolean;
  model?: string;
  openConversation?: boolean;
  printUrl?: boolean;
  browserPath?: string;
  browserProfile?: string;
}

interface SessionCommandDependencies {
  showStatus: (options: ShowStatusOptions) => Promise<void> | void;
  attachSession: (sessionId: string, options?: AttachSessionOptions) => Promise<void>;
  usesDefaultStatusFilters: (cmd: Command) => boolean;
  deleteSessionsOlderThan: (options?: { hours?: number; includeAll?: boolean }) => Promise<{ deleted: number; remaining: number }>;
  getSessionPaths: (sessionId: string) => Promise<{ dir: string; metadata: string; log: string; request: string }>;
}

const defaultDependencies: SessionCommandDependencies = {
  showStatus,
  attachSession,
  usesDefaultStatusFilters,
  deleteSessionsOlderThan: (options) => sessionStore.deleteOlderThan(options),
  getSessionPaths: (sessionId) => sessionStore.getPaths(sessionId),
};

const SESSION_OPTION_KEYS = new Set([
  'hours',
  'limit',
  'all',
  'clear',
  'clean',
  'render',
  'renderMarkdown',
  'path',
  'model',
  'openConversation',
  'printUrl',
  'browserPath',
  'browserProfile',
]);

export async function handleSessionCommand(
  sessionId: string | undefined,
  command: Command,
  deps: SessionCommandDependencies = defaultDependencies,
  userConfig?: UserConfig,
): Promise<void> {
  const sessionOptions = command.opts<StatusOptions>();
  if (sessionOptions.verboseRender) {
    process.env.ORACLE_VERBOSE_RENDER = '1';
  }
  const renderSource = command.getOptionValueSource?.('render');
  const renderMarkdownSource = command.getOptionValueSource?.('renderMarkdown');
  const renderExplicit = renderSource === 'cli' || renderMarkdownSource === 'cli';
  const autoRender = !renderExplicit && process.stdout.isTTY;
  const pathRequested = Boolean(sessionOptions.path);
  const clearRequested = Boolean(sessionOptions.clear || sessionOptions.clean);
  const openConversationRequested =
    (command.getOptionValueSource?.('openConversation') === 'cli')
      ? Boolean(sessionOptions.openConversation)
      : Boolean(userConfig?.browser?.sessionOpen?.openConversation ?? sessionOptions.openConversation);
  const printUrlRequested =
    (command.getOptionValueSource?.('printUrl') === 'cli')
      ? Boolean(sessionOptions.printUrl)
      : Boolean(userConfig?.browser?.sessionOpen?.printUrl ?? sessionOptions.printUrl);
  const browserPathOverride =
    (command.getOptionValueSource?.('browserPath') === 'cli')
      ? (typeof sessionOptions.browserPath === 'string' && sessionOptions.browserPath.trim().length > 0
          ? sessionOptions.browserPath.trim()
          : null)
      : (userConfig?.browser?.sessionOpen?.browserPath ?? null);
  const browserProfileOverride =
    (command.getOptionValueSource?.('browserProfile') === 'cli')
      ? (typeof sessionOptions.browserProfile === 'string' && sessionOptions.browserProfile.trim().length > 0
          ? sessionOptions.browserProfile.trim()
          : null)
      : (userConfig?.browser?.sessionOpen?.browserProfile ?? null);
  if (clearRequested) {
    if (sessionId) {
      console.error('Cannot combine a session ID with --clear. Remove the ID to delete cached sessions.');
      process.exitCode = 1;
      return;
    }
    const hours = sessionOptions.hours;
    const includeAll = sessionOptions.all;
    const result = await deps.deleteSessionsOlderThan({ hours, includeAll });
    const scope = includeAll ? 'all stored sessions' : `sessions older than ${hours}h`;
    console.log(formatSessionCleanupMessage(result, scope));
    return;
  }
  if (sessionId === 'clear' || sessionId === 'clean') {
    console.error('Session cleanup now uses --clear. Run "oracle session --clear --hours <n>" instead.');
    process.exitCode = 1;
    return;
  }
  if (pathRequested) {
    if (!sessionId) {
      console.error('The --path flag requires a session ID.');
      process.exitCode = 1;
      return;
    }
    try {
      const paths = await deps.getSessionPaths(sessionId);
      const richTty = Boolean(process.stdout.isTTY && chalk.level > 0);
      const label = (text: string): string => (richTty ? chalk.cyan(text) : text);
      const value = (text: string): string => (richTty ? chalk.dim(text) : text);
      console.log(`${label('Session dir:')} ${value(paths.dir)}`);
      console.log(`${label('Metadata:')} ${value(paths.metadata)}`);
      console.log(`${label('Request:')} ${value(paths.request)}`);
      console.log(`${label('Log:')} ${value(paths.log)}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }
  if (openConversationRequested) {
    if (!sessionId) {
      console.error('The --open-conversation flag requires a session ID.');
      process.exitCode = 1;
      return;
    }
    const metadata = await sessionStore.readSession(sessionId);
    if (!metadata) {
      console.error(`Session ${sessionId} was not found.`);
      process.exitCode = 1;
      return;
    }
    const url = resolveConversationUrl(metadata, userConfig);
    if (!url) {
      console.error('No conversation URL found in this session.');
      process.exitCode = 1;
      return;
    }
    if (printUrlRequested) {
      console.log(url);
      return;
    }
    const opened = openConversationUrl(url, metadata, browserPathOverride, browserProfileOverride);
    if (!opened) {
      console.log(url);
    }
    return;
  }
  if (!sessionId) {
    const showExamples = deps.usesDefaultStatusFilters(command);
    await deps.showStatus({
      hours: sessionOptions.all ? Infinity : sessionOptions.hours,
      includeAll: sessionOptions.all,
      limit: sessionOptions.limit,
      showExamples,
      modelFilter: sessionOptions.model,
    });
    return;
  }
  // Surface any root-level flags that were provided but are ignored when attaching to a session.
  const ignoredFlags = listIgnoredFlags(command);
  if (ignoredFlags.length > 0) {
    console.log(`Ignoring flags on session attach: ${ignoredFlags.join(', ')}`);
  }
  const renderMarkdown = Boolean(sessionOptions.render || sessionOptions.renderMarkdown || autoRender);
  await deps.attachSession(sessionId, {
    renderMarkdown,
    renderPrompt: !sessionOptions.hidePrompt,
    model: sessionOptions.model,
  });
}

function resolveConversationUrl(
  metadata: {
    browser?: {
      config?: { target?: string | null; projectId?: string | null; conversationId?: string | null };
      runtime?: { tabUrl?: string | null; conversationId?: string | null };
      context?: { provider?: string | null; projectId?: string | null; conversationId?: string | null };
    };
  },
  userConfig?: UserConfig,
): string | null {
  const runtimeUrl = metadata.browser?.runtime?.tabUrl ?? null;
  if (runtimeUrl && hasConversationMarker(runtimeUrl)) {
    return runtimeUrl;
  }
  const conversationId =
    metadata.browser?.context?.conversationId ??
    metadata.browser?.config?.conversationId ??
    metadata.browser?.runtime?.conversationId ??
    null;
  if (!conversationId) {
    return runtimeUrl && hasConversationMarker(runtimeUrl) ? runtimeUrl : null;
  }
  const providerId =
    (metadata.browser?.context?.provider as 'chatgpt' | 'grok' | 'gemini' | null) ??
    (metadata.browser?.config?.target as 'chatgpt' | 'grok' | 'gemini' | null) ??
    'chatgpt';
  if (providerId === 'gemini') {
    return runtimeUrl && hasConversationMarker(runtimeUrl) ? runtimeUrl : null;
  }
  if (!userConfig) {
    return runtimeUrl ?? null;
  }
  const projectId = metadata.browser?.context?.projectId ?? metadata.browser?.config?.projectId ?? null;
  const llmService = createLlmService(providerId === 'grok' ? 'grok' : 'chatgpt', userConfig);
  return llmService.provider.resolveConversationUrl?.(conversationId, projectId ?? undefined) ?? runtimeUrl ?? null;
}

function hasConversationMarker(url: string): boolean {
  return url.includes('/c/') || url.includes('chat=');
}

function openConversationUrl(
  url: string,
  metadata: {
    browser?: {
      config?: { chromePath?: string | null; chromeProfile?: string | null; manualLoginProfileDir?: string | null };
      runtime?: { userDataDir?: string | null };
    };
  },
  browserPathOverride: string | null,
  browserProfileOverride: string | null,
): boolean {
  const chromePath = browserPathOverride ?? metadata.browser?.config?.chromePath ?? null;
  const profileDir = browserProfileOverride ?? metadata.browser?.config?.chromeProfile ?? 'Default';
  const userDataDir =
    metadata.browser?.runtime?.userDataDir ?? metadata.browser?.config?.manualLoginProfileDir ?? null;
  if (chromePath) {
    const args = ['--new-window', url];
    if (userDataDir) {
      args.unshift(`--profile-directory=${profileDir}`);
      args.unshift(`--user-data-dir=${userDataDir}`);
    }
    const proc = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
    proc.unref();
    return true;
  }
  if (process.platform === 'darwin') {
    const proc = spawn('open', [url], { detached: true, stdio: 'ignore' });
    proc.unref();
    return true;
  }
  if (process.platform === 'win32') {
    const proc = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    proc.unref();
    return true;
  }
  const proc = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  proc.unref();
  return true;
}

export function formatSessionCleanupMessage(
  result: { deleted: number; remaining: number },
  scope: string,
): string {
  const deletedLabel = `${result.deleted} ${result.deleted === 1 ? 'session' : 'sessions'}`;
  const remainingLabel = `${result.remaining} ${result.remaining === 1 ? 'session' : 'sessions'} remain`;
  const hint = 'Run "oracle session --clear --all" to delete everything.';
  return `Deleted ${deletedLabel} (${scope}). ${remainingLabel}.\n${hint}`;
}

function listIgnoredFlags(command: Command): string[] {
  const opts = command.optsWithGlobals() as Record<string, unknown>;
  const ignored: string[] = [];
  for (const key of Object.keys(opts)) {
    if (SESSION_OPTION_KEYS.has(key)) {
      continue;
    }
    const source = command.getOptionValueSource?.(key);
    if (source !== 'cli' && source !== 'env') {
      continue;
    }
    const value = opts[key];
    if (value === undefined || value === false || value === null) {
      continue;
    }
    ignored.push(key);
  }
  return ignored;
}
