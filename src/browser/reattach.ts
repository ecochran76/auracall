import type { BrowserRuntimeMetadata } from '../sessionStore.js';
import {
  waitForAssistantResponse,
  captureAssistantMarkdown,
  navigateToChatGPT,
  ensureNotBlocked,
  ensureLoggedIn,
  ensurePromptReady,
} from './pageActions.js';
import type { BrowserLogger, BrowserSessionConfig, ChromeClient, CookieParam } from './types.js';
import { launchChrome, connectToChrome, hideChromeWindow, wasChromeLaunchedByAuracall } from './chromeLifecycle.js';
import { resolveBrowserConfig } from './config.js';
import { syncCookies } from './cookies.js';
import { cleanupStaleProfileState } from './profileState.js';
import { collectReattachRegistryDiagnostics } from './service/registryDiagnostics.js';
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
  describeReattachFailure,
  ReattachFailure,
  type ReattachDeps,
  type ReattachResult,
  type ReattachFailureDetails,
  type ReattachFailureKind,
} from './reattachCore.js';

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
      classifyBrowserProfileFailure:
        deps.classifyBrowserProfileFailure ??
        (async (runtimeMeta, configMeta) => classifyRuntimeBrowserProfileFailure(runtimeMeta, configMeta)),
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
      resolveBrowserConfig: (candidate) => resolveBrowserConfig(candidate as BrowserSessionConfig, {
        auracallProfileName: (candidate as BrowserSessionConfig | undefined)?.auracallProfileName ?? null,
      }),
      launchChrome: async (config, userDataDir, logger) => {
        const chrome = await launchChrome(config, userDataDir, logger);
        return {
          port: chrome.port,
          host: chrome.host,
          launchedByAuracall: wasChromeLaunchedByAuracall(chrome),
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

export { ReattachFailure, describeReattachFailure };
export type { ReattachFailureDetails, ReattachFailureKind };

async function classifyRuntimeBrowserProfileFailure(
  runtime: BrowserRuntimeMetadata,
  config: BrowserSessionConfig | undefined,
): Promise<ReattachFailureDetails | null> {
  if (!runtime.chromePort) {
    return null;
  }
  const diagnostics = await collectReattachRegistryDiagnostics({ runtime, config });
  const expectedProfilePath = diagnostics?.expectedProfilePath
    ? normalizePath(diagnostics.expectedProfilePath)
    : null;
  const expectedProfileName = diagnostics?.expectedProfileName
    ? normalizeProfileName(diagnostics.expectedProfileName)
    : null;
  if (!expectedProfilePath || !expectedProfileName) {
    return null;
  }
  const selectedPortCandidates = diagnostics?.selectedPortCandidates ?? [];
  const strongSelectedPortCandidates = selectedPortCandidates.filter((candidate) => {
    return candidate.liveness === 'live' || candidate.liveness === 'profile-mismatch';
  });
  if (strongSelectedPortCandidates.length === 0) {
    return null;
  }
  const hasExpectedOwner = strongSelectedPortCandidates.some((owner) => {
    return (
      normalizePath(owner.profilePath) === expectedProfilePath &&
      normalizeProfileName(owner.profileName) === expectedProfileName
    );
  });
  if (hasExpectedOwner) {
    return null;
  }
  return {
    kind: 'wrong-browser-profile',
    message: 'Existing Chrome no longer exposes the expected ChatGPT browser profile.',
    chromePort: runtime.chromePort ?? null,
    expectedOrigin: extractOrigin(runtime.tabUrl ?? null),
    pageTargetCount: undefined,
    matchingOriginTargetCount: undefined,
    conversationId: runtime.conversationId ?? null,
  };
}

function normalizePath(value: string): string {
  return value.trim().replace(/\/+$/u, '');
}

function normalizeProfileName(value: string): string {
  return value.trim().toLowerCase();
}

function extractOrigin(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
