import type { BrowserRuntimeMetadata, BrowserSessionConfig } from '../sessionStore.js';
import {
  waitForAssistantResponse,
  captureAssistantMarkdown,
  navigateToChatGPT,
  ensureNotBlocked,
  ensureLoggedIn,
  ensurePromptReady,
} from './pageActions.js';
import type { BrowserLogger, ChromeClient, CookieParam } from './types.js';
import { launchChrome, connectToChrome, hideChromeWindow } from './chromeLifecycle.js';
import { resolveBrowserConfig } from './config.js';
import { syncCookies } from './cookies.js';
import { cleanupStaleProfileState } from './profileState.js';
import {
  pickTarget,
  extractConversationIdFromUrl,
  buildConversationUrl,
  withTimeout,
  openConversationFromSidebar,
  openConversationFromSidebarWithRetry,
  waitForLocationChange,
  readConversationTurnIndex,
  buildPromptEchoMatcher,
  recoverPromptEcho,
  alignPromptEchoMarkdown,
  type AssistantPayload,
  type TargetInfoLite,
} from './reattachHelpers.js';

type PromptEchoMatcher = { isEcho: (text: string) => boolean };
import {
  resumeBrowserSessionCore,
  type ReattachDeps,
  type ReattachResult,
} from '../../packages/browser-service/src/reattach.js';

export async function resumeBrowserSession(
  runtime: BrowserRuntimeMetadata,
  config: BrowserSessionConfig | undefined,
  logger: BrowserLogger,
  deps: ReattachDeps = {},
): Promise<ReattachResult> {
  return resumeBrowserSessionCore(
    runtime,
    config,
    logger,
    {
      ...deps,
      waitForAssistantResponse: deps.waitForAssistantResponse ?? waitForAssistantResponse,
      captureAssistantMarkdown:
        deps.captureAssistantMarkdown ??
        ((Runtime, meta, logger) =>
          captureAssistantMarkdown(
            Runtime,
            meta as { messageId?: string | null; turnId?: string | null },
            logger,
          )),
      helpers: {
        pickTarget: (targets, runtime) => pickTarget(targets as TargetInfoLite[], runtime) ?? undefined,
        extractConversationIdFromUrl: (url) => extractConversationIdFromUrl(url) ?? null,
        buildConversationUrl,
        withTimeout,
        openConversationFromSidebar: (Runtime, options) =>
          openConversationFromSidebar(Runtime, options),
        openConversationFromSidebarWithRetry: (Runtime, options, timeoutMs) =>
          openConversationFromSidebarWithRetry(Runtime, options, timeoutMs),
        waitForLocationChange,
        readConversationTurnIndex,
        buildPromptEchoMatcher: (preview) => buildPromptEchoMatcher(preview),
        recoverPromptEcho: (Runtime, answer, matcher, logger, minTurn, timeoutMs) =>
          recoverPromptEcho(
            Runtime,
            answer as unknown as AssistantPayload,
            matcher as PromptEchoMatcher | null,
            logger,
            minTurn ?? null,
            timeoutMs ?? 0,
          ),
        alignPromptEchoMarkdown: (text, markdown, matcher, logger) =>
          alignPromptEchoMarkdown(text, markdown, matcher as PromptEchoMatcher | null, logger),
      },
    },
    {
      resolveBrowserConfig: (candidate) => resolveBrowserConfig(candidate as BrowserSessionConfig),
      launchChrome: async (config, userDataDir, logger) => {
        const chrome = await launchChrome(config, userDataDir, logger);
        return {
          port: chrome.port,
          host: chrome.host,
          process: chrome.process,
          kill: async () => {
            await chrome.kill();
          },
        };
      },
      connectToChrome,
      hideChromeWindow: async (chrome, logger) =>
        hideChromeWindow(chrome as Parameters<typeof hideChromeWindow>[0], logger),
      syncCookies: (Network, url, profile, logger, options) =>
        syncCookies(Network, url ?? '', profile ?? undefined, logger, {
          ...options,
          inlineCookies: options.inlineCookies as CookieParam[] | null | undefined,
        }),
      cleanupStaleProfileState,
      navigateToChatGPT,
      ensureNotBlocked: (Runtime, headless, logger) => ensureNotBlocked(Runtime, Boolean(headless), logger),
      ensureLoggedIn,
      ensurePromptReady: (Runtime, timeoutMs, logger) => ensurePromptReady(Runtime, timeoutMs ?? 120_000, logger),
    },
  );
}

// biome-ignore lint/style/useNamingConvention: test-only export used in vitest suite
export const __test__ = {
  openConversationFromSidebar: (
    Runtime: ChromeClient['Runtime'],
    options: { conversationId?: string | null; preferProjects?: boolean; promptPreview?: string },
  ) => openConversationFromSidebar(Runtime, options),
  pickTarget,
  extractConversationIdFromUrl,
  buildConversationUrl,
};
