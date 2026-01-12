import type { BrowserRuntimeMetadata, BrowserSessionConfig } from '../sessionStore.js';
import {
  waitForAssistantResponse,
  captureAssistantMarkdown,
  navigateToChatGPT,
  ensureNotBlocked,
  ensureLoggedIn,
  ensurePromptReady,
} from './pageActions.js';
import type { BrowserLogger, ChromeClient } from './types.js';
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
} from './reattachHelpers.js';
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
      captureAssistantMarkdown: deps.captureAssistantMarkdown ?? captureAssistantMarkdown,
      helpers: {
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
      },
    },
    {
      resolveBrowserConfig: (candidate) => resolveBrowserConfig(candidate as BrowserSessionConfig),
      launchChrome,
      connectToChrome,
      hideChromeWindow,
      syncCookies,
      cleanupStaleProfileState,
      navigateToChatGPT,
      ensureNotBlocked,
      ensureLoggedIn,
      ensurePromptReady,
    },
  );
}

// biome-ignore lint/style/useNamingConvention: test-only export used in vitest suite
export const __test__ = {
  openConversationFromSidebar: (Runtime: ChromeClient['Runtime'], options: { conversationId?: string | null }) =>
    openConversationFromSidebar(Runtime, options),
  pickTarget,
  extractConversationIdFromUrl,
  buildConversationUrl,
};
