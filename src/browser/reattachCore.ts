import { mkdir } from 'node:fs/promises';
import type { BrowserRuntimeMetadata, BrowserSessionConfig, ResolvedBrowserConfig } from './types.js';
import type { BrowserLogger, ChromeClient } from './types.js';
import { resolveManagedProfileDir } from './profileStore.js';
import {
  connectToChromeTarget as connectToChromeTargetCore,
  listChromeTargets as listChromeTargetsCore,
} from '../../packages/browser-service/src/chromeLifecycle.js';

export type ReattachTargetInfo = {
  targetId?: string;
  url?: string;
  type?: string;
  title?: string;
};

export interface ReattachDeps {
  listTargets?: () => Promise<ReattachTargetInfo[]>;
  connect?: (options?: unknown) => Promise<ChromeClient>;
  waitForAssistantResponse?: (
    Runtime: ChromeClient['Runtime'],
    timeoutMs: number,
    logger: BrowserLogger,
    minTurn?: number,
  ) => Promise<{ text: string; meta?: unknown }>;
  captureAssistantMarkdown?: (
    Runtime: ChromeClient['Runtime'],
    meta: unknown,
    logger: BrowserLogger,
  ) => Promise<string | null>;
  recoverSession?: (runtime: ReattachRuntime, config: BrowserSessionConfig | undefined) => Promise<ReattachResult>;
  promptPreview?: string;
  helpers?: ReattachHelperDeps;
}

export interface ReattachResult {
  answerText: string;
  answerMarkdown: string;
}

export type ReattachRuntime = BrowserRuntimeMetadata & {
  conversationId?: string;
};

export type ReattachHelperDeps = {
  pickTarget: (targets: ReattachTargetInfo[], runtime: ReattachRuntime) => ReattachTargetInfo | undefined;
  extractConversationIdFromUrl: (url: string) => string | null | undefined;
  buildConversationUrl: (runtime: { tabUrl?: string; conversationId?: string }, baseUrl: string) => string | null;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number, message: string) => Promise<T>;
  openConversationFromSidebar: (
    Runtime: ChromeClient['Runtime'],
    options: { conversationId?: string | null; preferProjects?: boolean; promptPreview?: string },
  ) => Promise<boolean>;
  openConversationFromSidebarWithRetry: (
    Runtime: ChromeClient['Runtime'],
    options: { conversationId?: string | null; preferProjects?: boolean; promptPreview?: string },
    timeoutMs: number,
  ) => Promise<boolean>;
  waitForLocationChange: (Runtime: ChromeClient['Runtime'], timeoutMs: number) => Promise<void>;
  readConversationTurnIndex: (Runtime: ChromeClient['Runtime'], logger: BrowserLogger) => Promise<number | null>;
  buildPromptEchoMatcher: (preview?: string | null) => unknown;
  recoverPromptEcho: (
    Runtime: ChromeClient['Runtime'],
    answer: { text: string; meta?: unknown },
    matcher: unknown,
    logger: BrowserLogger,
    minTurn?: number | null,
    timeoutMs?: number,
  ) => Promise<{ text: string; meta?: unknown }>;
  alignPromptEchoMarkdown: (
    text: string,
    markdown: string,
    matcher: unknown,
    logger: BrowserLogger,
  ) => { answerText: string; answerMarkdown: string };
};

export interface ReattachRuntimeDeps {
  resolveBrowserConfig: (config: BrowserSessionConfig) => ResolvedBrowserConfig;
  launchChrome: (
    config: ResolvedBrowserConfig,
    userDataDir: string,
    logger: BrowserLogger,
  ) => Promise<{
    port: number;
    kill: () => Promise<void>;
    host?: string;
    process?: { unref?: () => void };
  }>;
  connectToChrome: (port: number, logger: BrowserLogger, host?: string) => Promise<ChromeClient>;
  hideChromeWindow: (chrome: { port: number; host?: string }, logger: BrowserLogger) => Promise<void>;
  syncCookies: (
    Network: ChromeClient['Network'],
    url: string | null,
    profile: string | null,
    logger: BrowserLogger,
    options: {
      allowErrors?: boolean;
      filterNames?: string[] | null;
      inlineCookies?: unknown[] | null;
      cookiePath?: string | null;
      waitMs?: number;
    },
  ) => Promise<number>;
  cleanupStaleProfileState: (
    userDataDir: string,
    logger: BrowserLogger,
    options: { lockRemovalMode?: 'never' | 'if_recorded_pid_dead' },
  ) => Promise<void>;
  navigateToChatGPT: (
    Page: ChromeClient['Page'],
    Runtime: ChromeClient['Runtime'],
    url: string,
    logger: BrowserLogger,
  ) => Promise<void>;
  ensureNotBlocked: (
    Runtime: ChromeClient['Runtime'],
    headless: boolean | null | undefined,
    logger: BrowserLogger,
  ) => Promise<void>;
  ensureLoggedIn: (
    Runtime: ChromeClient['Runtime'],
    logger: BrowserLogger,
    options?: { appliedCookies?: number },
  ) => Promise<void>;
  ensurePromptReady: (
    Runtime: ChromeClient['Runtime'],
    timeoutMs: number | undefined,
    logger: BrowserLogger,
  ) => Promise<void>;
}

export async function resumeBrowserSessionCore(
  runtime: ReattachRuntime,
  config: BrowserSessionConfig | undefined,
  logger: BrowserLogger,
  deps: ReattachDeps = {} as ReattachDeps,
  runtimeDeps?: ReattachRuntimeDeps,
): Promise<ReattachResult> {
  if (!deps.helpers) {
    throw new Error('Reattach helpers are required.');
  }
  const helpers = deps.helpers;
  const recoverSession =
    deps.recoverSession ??
    (async (runtimeMeta, configMeta) =>
      resumeBrowserSessionViaNewChrome(runtimeMeta, configMeta, logger, deps, helpers, runtimeDeps));

  if (!runtime.chromePort) {
    logger('No running Chrome detected; reopening browser to locate the session.');
    return recoverSession(runtime, config);
  }

  const host = runtime.chromeHost ?? '127.0.0.1';
  try {
    const listTargets =
      deps.listTargets ??
      (async () => {
        const targets = await listChromeTargetsCore(runtime.chromePort as number, host);
        return targets as unknown as ReattachTargetInfo[];
      });
    const connect = deps.connect ?? ((options?: unknown) => {
      const resolved = options as { host?: string; port?: number; target?: string };
      if (!resolved.port) {
        throw new Error('Missing DevTools port for reattach.');
      }
      return connectToChromeTargetCore({
        port: resolved.port,
        host: resolved.host,
        target: resolved.target,
      });
    });
    const targetList = (await listTargets()) as ReattachTargetInfo[];
    const target = helpers.pickTarget(targetList, runtime);
    const client: ChromeClient = (await connect({
      host,
      port: runtime.chromePort,
      target: target?.targetId,
    })) as unknown as ChromeClient;
    const { Runtime, DOM } = client;
    if (Runtime?.enable) {
      await Runtime.enable();
    }
    if (DOM && typeof DOM.enable === 'function') {
      await DOM.enable();
    }

    const ensureConversationOpen = async () => {
      const { result } = await Runtime.evaluate({ expression: 'location.href', returnByValue: true });
      const href = typeof result?.value === 'string' ? result.value : '';
      if (href.includes('/c/')) {
        const currentId = helpers.extractConversationIdFromUrl(href);
        if (!runtime.conversationId || (currentId && currentId === runtime.conversationId)) {
          return;
        }
      }
      const opened = await helpers.openConversationFromSidebarWithRetry(
        Runtime,
        {
          conversationId: runtime.conversationId ?? helpers.extractConversationIdFromUrl(runtime.tabUrl ?? ''),
          preferProjects: true,
          promptPreview: deps.promptPreview,
        },
        15_000,
      );
      if (!opened) {
        throw new Error('Unable to locate prior ChatGPT conversation in sidebar.');
      }
      await helpers.waitForLocationChange(Runtime, 15_000);
    };

    const waitForResponse = deps.waitForAssistantResponse;
    const captureMarkdown = deps.captureAssistantMarkdown;
    if (!waitForResponse || !captureMarkdown) {
      throw new Error('Reattach dependencies missing response capture handlers.');
    }
    const timeoutMs = config?.timeoutMs ?? 120_000;
    const pingTimeoutMs = Math.min(5_000, Math.max(1_500, Math.floor(timeoutMs * 0.05)));
    await helpers.withTimeout(
      Runtime.evaluate({ expression: '1+1', returnByValue: true }),
      pingTimeoutMs,
      'Reattach target did not respond',
    );
    await ensureConversationOpen();
    const minTurnIndex = await helpers.readConversationTurnIndex(Runtime, logger);
    const promptEcho = helpers.buildPromptEchoMatcher(deps.promptPreview);
    const answer = await helpers.withTimeout(
      waitForResponse(Runtime, timeoutMs, logger, minTurnIndex ?? undefined),
      timeoutMs + 5_000,
      'Reattach response timed out',
    );
    const recovered = await helpers.recoverPromptEcho(Runtime, answer, promptEcho, logger, minTurnIndex, timeoutMs);
    const markdown =
      (await helpers.withTimeout(
        captureMarkdown(Runtime, recovered.meta, logger),
        15_000,
        'Reattach markdown capture timed out',
      )) ?? recovered.text;
    const aligned = helpers.alignPromptEchoMarkdown(recovered.text, markdown, promptEcho, logger);

    if (client && typeof client.close === 'function') {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    return { answerText: aligned.answerText, answerMarkdown: aligned.answerMarkdown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Existing Chrome reattach failed (${message}); reopening browser to locate the session.`);
    return recoverSession(runtime, config);
  }
}

async function resumeBrowserSessionViaNewChrome(
  runtime: ReattachRuntime,
  config: BrowserSessionConfig | undefined,
  logger: BrowserLogger,
  deps: ReattachDeps,
  helpers: ReattachHelperDeps,
  runtimeDeps?: ReattachRuntimeDeps,
): Promise<ReattachResult> {
  if (!runtimeDeps) {
    throw new Error('Reattach runtime dependencies missing; cannot launch new Chrome.');
  }
  const resolved = runtimeDeps.resolveBrowserConfig(config ?? {});
  const manualLogin = true;
  const userDataDir = resolveManagedProfileDir({
    configuredDir: resolved.manualLoginProfileDir ?? null,
    managedProfileRoot: resolved.managedProfileRoot ?? null,
    target: resolved.target ?? 'chatgpt',
  });
  await mkdir(userDataDir, { recursive: true });
  const chrome = await runtimeDeps.launchChrome(resolved, userDataDir, logger);
  const chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
  const client = await runtimeDeps.connectToChrome(chrome.port, logger, chromeHost);
  const { Network, Page, Runtime, DOM } = client;

  if (Runtime?.enable) {
    await Runtime.enable();
  }
  if (DOM && typeof DOM.enable === 'function') {
    await DOM.enable();
  }
  if (!resolved.headless && resolved.hideWindow) {
    await runtimeDeps.hideChromeWindow(chrome, logger);
  }

  const appliedCookies = 0;

  await runtimeDeps.navigateToChatGPT(Page, Runtime, resolved.url ?? 'https://chatgpt.com/', logger);
  await runtimeDeps.ensureNotBlocked(Runtime, resolved.headless, logger);
  await runtimeDeps.ensureLoggedIn(Runtime, logger, { appliedCookies });
  if (resolved.url && resolved.url !== 'https://chatgpt.com/') {
    await runtimeDeps.navigateToChatGPT(Page, Runtime, resolved.url, logger);
    await runtimeDeps.ensureNotBlocked(Runtime, resolved.headless, logger);
  }
  await runtimeDeps.ensurePromptReady(Runtime, resolved.inputTimeoutMs, logger);

  const conversationUrl = helpers.buildConversationUrl(runtime, resolved.url ?? 'https://chatgpt.com/');
  if (conversationUrl) {
    logger(`Reopening conversation at ${conversationUrl}`);
    await runtimeDeps.navigateToChatGPT(Page, Runtime, conversationUrl, logger);
    await runtimeDeps.ensureNotBlocked(Runtime, resolved.headless, logger);
    await runtimeDeps.ensurePromptReady(Runtime, resolved.inputTimeoutMs, logger);
  } else {
    const opened = await helpers.openConversationFromSidebarWithRetry(
      Runtime,
      {
        conversationId: runtime.conversationId ?? helpers.extractConversationIdFromUrl(runtime.tabUrl ?? ''),
        preferProjects:
          resolved.url !== 'https://chatgpt.com/' ||
          Boolean(runtime.tabUrl && (/\/g\//.test(runtime.tabUrl) || runtime.tabUrl.includes('/project'))),
        promptPreview: deps.promptPreview,
      },
      15_000,
    );
    if (!opened) {
      throw new Error('Unable to locate prior ChatGPT conversation in sidebar.');
    }
    await helpers.waitForLocationChange(Runtime, 15_000);
  }

  const waitForResponse = deps.waitForAssistantResponse;
  const captureMarkdown = deps.captureAssistantMarkdown;
  if (!waitForResponse || !captureMarkdown) {
    throw new Error('Reattach dependencies missing response capture handlers.');
  }
  const timeoutMs = resolved.timeoutMs ?? 120_000;
  const minTurnIndex = await helpers.readConversationTurnIndex(Runtime, logger);
  const promptEcho = helpers.buildPromptEchoMatcher(deps.promptPreview);
  const answer = await waitForResponse(Runtime, timeoutMs, logger, minTurnIndex ?? undefined);
  const recovered = await helpers.recoverPromptEcho(Runtime, answer, promptEcho, logger, minTurnIndex, timeoutMs);
  const markdown = (await captureMarkdown(Runtime, recovered.meta, logger)) ?? recovered.text;
  const aligned = helpers.alignPromptEchoMarkdown(recovered.text, markdown, promptEcho, logger);

  if (client && typeof client.close === 'function') {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
  if (!resolved.keepBrowser) {
    try {
      await chrome.kill();
    } catch {
      // ignore
    }
    if (manualLogin) {
      await runtimeDeps.cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'never' }).catch(
        () => undefined,
      );
    }
  }

  return { answerText: aligned.answerText, answerMarkdown: aligned.answerMarkdown };
}
