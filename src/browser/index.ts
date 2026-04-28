import { rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveBrowserConfig } from './config.js';
import {
  bootstrapManagedProfile,
  findBrowserCookieFile,
} from './profileStore.js';
import type {
  BrowserAttachment,
  BrowserLogger,
  BrowserPassiveObservation,
  BrowserRunOptions,
  BrowserRunResult,
  ChromeClient,
} from './types.js';
import {
  launchChrome,
  registerTerminationHooks,
  hideChromeWindow,
  wasChromeLaunchedByAuracall,
  connectToChrome,
  connectToRemoteChrome,
  closeRemoteChromeTarget,
  buildWslFirewallHint,
  reuseRunningChromeProfile,
} from './chromeLifecycle.js';
import { syncCookies } from './cookies.js';
import {
  navigateToChatGPT,
  navigateToPromptReadyWithFallback,
  ensureNotBlocked,
  ensureLoggedIn,
  ensurePromptReady,
  installJavaScriptDialogAutoDismissal,
  ensureModelSelection,
  ensureChatgptComposerTool,
  readCurrentChatgptComposerTool,
  submitPrompt,
  clearPromptComposer,
  waitForAssistantResponse,
  captureAssistantMarkdown,
  clearComposerAttachments,
  uploadAttachmentFile,
  waitForAttachmentCompletion,
  waitForUserTurnAttachments,
  readAssistantSnapshot,
} from './pageActions.js';
import { uploadAttachmentViaDataTransfer } from './actions/remoteFileTransfer.js';
import {
  navigateToGrok,
  ensureGrokLoggedIn,
  ensureGrokPromptReady,
  readGrokAssistantSnapshotForRuntime,
  setGrokPrompt,
  submitGrokPrompt,
  waitForGrokAssistantResult,
  uploadGrokAttachments,
  selectGrokMode,
} from './actions/grok.js';
import {
  isChatgptDeepResearchTool,
  startChatgptDeepResearchPlan,
  type ChatgptDeepResearchStage,
} from './actions/chatgptDeepResearch.js';
import {
  ensureThinkingTime,
  evaluateChatgptProModeGate,
  formatChatgptProModeGateError,
  type ChatgptProMode,
  type ChatgptProModeGate,
} from './actions/thinkingTime.js';
import { estimateTokenCount, withRetries, delay } from './utils.js';
import { formatElapsed } from '../oracle/format.js';
import { CHATGPT_URL, CONVERSATION_TURN_SELECTOR, DEFAULT_MODEL_STRATEGY } from './constants.js';
import {
  buildChatgptAuthSessionIdentityExpression,
  classifyChatgptBlockingSurfaceProbe,
  normalizeChatgptAuthSessionIdentity,
} from './providers/chatgptAdapter.js';
import {
  buildChatgptThinkingStatusExpression,
  sanitizeChatgptThinkingText,
} from './providers/chatgptEvidence.js';
import { resolveGrokConversationUrl, resolveGrokProjectUrl } from './providers/grokAdapter.js';
import { resolveCompatibleHostsForUrl } from './urlFamilies.js';
import type { LaunchedChrome } from 'chrome-launcher';
import { BrowserAutomationError } from '../oracle/errors.js';
import type { ThinkingTimeLevel } from '../oracle/types.js';
import type { ProviderUserIdentity } from './providers/types.js';
import { alignPromptEchoPair, buildPromptEchoMatcher } from './reattachHelpers.js';
import {
  cleanupStaleProfileState,
  shouldCleanupManualLoginProfileState,
  writeChromePid,
  writeDevToolsActivePort,
} from './profileState.js';
import { isProcessAlive, isDevToolsResponsive } from './processCheck.js';
import {
  DEFAULT_DEBUG_PORT,
  DEFAULT_DEBUG_PORT_RANGE,
  pickAvailableDebugPort,
} from './portSelection.js';
import { dismissOpenMenus, navigateAndSettle } from './service/ui.js';
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from './service/profileResolution.js';
import {
  appendChatgptMutationRecord,
  CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS,
  CHATGPT_MUTATION_MAX_WEIGHT,
  CHATGPT_MUTATION_WINDOW_MS,
  CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS,
  CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS,
  CHATGPT_RATE_LIMIT_COOLDOWN_MS,
  extractChatgptRateLimitSummary,
  getChatgptMutationBudgetWaitMs,
  getChatgptPostCommitQuietWaitMs,
  isChatgptRateLimitMessage,
  readChatgptRateLimitGuardState,
  resolveChatgptRateLimitProfileName,
  writeChatgptRateLimitGuardState,
} from './chatgptRateLimitGuard.js';
import {
  captureBrowserPostmortemSnapshot,
  logBrowserPostmortemSnapshot,
  logStructuredDebugEvent,
  persistBrowserPostmortemRecord,
} from './domDebug.js';
import { classifyBrowserToolsBlockingState } from '../../packages/browser-service/src/browserTools.js';
import {
  createFileBackedBrowserOperationDispatcher,
  formatBrowserOperationBusyResult,
  type BrowserOperationAcquiredResult,
} from '../../packages/browser-service/src/service/operationDispatcher.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import { recordBrowserOperationQueueObservation } from './operationQueueObservations.js';
import {
  readSimpleProviderGuardState,
  resolveSimpleProviderGuardProfileName,
  writeSimpleProviderGuardState,
} from './simpleProviderGuard.js';

export type { BrowserAutomationConfig, BrowserRunOptions, BrowserRunResult } from './types.js';
export { CHATGPT_URL, DEFAULT_MODEL_STRATEGY, DEFAULT_MODEL_TARGET } from './constants.js';
export { parseDuration, delay, normalizeChatgptUrl, isTemporaryChatUrl } from './utils.js';

export function resolveManagedBrowserLaunchContextForTest(
  config: ReturnType<typeof resolveBrowserConfig>,
  target: 'chatgpt' | 'grok' | 'gemini',
  auracallProfileName: string | null = null,
) {
  return resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: auracallProfileName,
    browser: config,
    target,
  });
}

async function captureChatgptDeepResearchReviewEvidence(input: {
  Page: ChromeClient['Page'];
  stage: ChatgptDeepResearchStage | null;
  planAction: 'start' | 'edit' | null;
  tabUrl: string | null;
  modifyPlanLabel: string | null;
  modifyPlanVisible: boolean | null;
  editTargetKind: string | null;
  editTargetX: number | null;
  editTargetY: number | null;
}): Promise<Record<string, unknown> | null> {
  if (
    input.planAction !== 'edit' ||
    (input.stage !== 'plan-edit-opened' && input.stage !== 'auto-started')
  ) {
    return null;
  }
  const capturedAt = new Date().toISOString();
  let screenshotPath: string | null = null;
  let screenshotBytes: number | null = null;
  const screenshot = await input.Page.captureScreenshot({ format: 'png' }).catch(() => null);
  if (screenshot && typeof screenshot.data === 'string' && screenshot.data.length > 0) {
    await (async () => {
      const bytes = Buffer.from(screenshot.data, 'base64');
      const dir = path.join(getAuracallHomeDir(), 'diagnostics', 'chatgpt-deep-research');
      await mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${capturedAt.replace(/[:.]/g, '-')}-${sanitizeDiagnosticsToken(input.stage ?? 'unknown')}.png`);
      await writeFile(filePath, bytes);
      screenshotPath = filePath;
      screenshotBytes = bytes.length;
    })().catch(() => undefined);
  }
  return {
    capturedAt,
    stage: input.stage,
    planAction: input.planAction,
    tabUrl: input.tabUrl,
    modifyPlanLabel: input.modifyPlanLabel,
    modifyPlanVisible: input.modifyPlanVisible,
    editTargetKind: input.editTargetKind,
    editTargetX: input.editTargetX,
    editTargetY: input.editTargetY,
    screenshotPath,
    screenshotMimeType: screenshotPath ? 'image/png' : null,
    screenshotBytes,
  };
}

function sanitizeDiagnosticsToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

async function resolveBrowserRuntimeEntryContext(options: {
  config?: BrowserRunOptions['config'];
  log?: BrowserLogger;
  pickDebugPort?: typeof pickAvailableDebugPort;
}): Promise<{
  config: ReturnType<typeof resolveBrowserConfig>;
  target: 'chatgpt' | 'grok' | 'gemini';
  logger: BrowserLogger;
}> {
  let config = resolveBrowserConfig(options.config, {
    auracallProfileName: options.config?.auracallProfileName ?? null,
  });
  const logger: BrowserLogger = options.log ?? ((_message: string) => {});
  if (logger.verbose === undefined) {
    logger.verbose = Boolean(config.debug);
  }
  if (logger.sessionLog === undefined && options.log?.sessionLog) {
    logger.sessionLog = options.log.sessionLog;
  }
  const target = config.target ?? 'chatgpt';
  if (!config.remoteChrome && !config.debugPort && config.debugPortStrategy !== 'auto') {
    const range = config.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE;
    const pickPort = options.pickDebugPort ?? pickAvailableDebugPort;
    const availablePort = await pickPort(DEFAULT_DEBUG_PORT, logger, range);
    if (availablePort !== DEFAULT_DEBUG_PORT) {
      logger(`DevTools port ${DEFAULT_DEBUG_PORT} busy; using ${availablePort} to avoid attaching to stray Chrome.`);
    }
    config = { ...config, debugPort: availablePort };
  }
  return {
    config,
    target,
    logger,
  };
}

export async function resolveBrowserRuntimeEntryContextForTest(options: {
  config?: BrowserRunOptions['config'];
  log?: BrowserLogger;
  pickDebugPort?: typeof pickAvailableDebugPort;
}) {
  return resolveBrowserRuntimeEntryContext(options);
}

async function readChatgptIdentityForProMode(
  Runtime: ChromeClient['Runtime'],
): Promise<ProviderUserIdentity | null> {
  const { result } = await Runtime.evaluate({
    expression: buildChatgptAuthSessionIdentityExpression(),
    awaitPromise: true,
    returnByValue: true,
  });
  return normalizeChatgptAuthSessionIdentity(result?.value as Parameters<typeof normalizeChatgptAuthSessionIdentity>[0]);
}

async function assertChatgptProModeAllowed(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel,
  logger: BrowserLogger,
): Promise<ChatgptProModeGate> {
  let identity: ProviderUserIdentity | null = null;
  try {
    identity = await readChatgptIdentityForProMode(Runtime);
  } catch (error) {
    if (logger.verbose) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`ChatGPT Pro mode account verification failed: ${message}`);
    }
  }
  const gate = evaluateChatgptProModeGate(level, identity);
  if (!gate.allowed) {
    throw new Error(formatChatgptProModeGateError(gate));
  }
  if (logger.verbose) {
    const summary = [
      gate.accountLevel ? `level=${gate.accountLevel}` : null,
      gate.accountPlanType ? `plan=${gate.accountPlanType}` : null,
      gate.accountStructure ? `structure=${gate.accountStructure}` : null,
    ].filter(Boolean).join(', ');
    logger(`ChatGPT Pro mode "${gate.proMode}" allowed${summary ? ` (${summary})` : ''}.`);
  }
  return gate;
}

async function readVerifiedChatgptAccountIdentity(
  Runtime: ChromeClient['Runtime'],
  action: string,
): Promise<ProviderUserIdentity> {
  const identity = await readChatgptIdentityForProMode(Runtime);
  if (!identity?.accountLevel) {
    throw new Error(
      `ChatGPT ${action} requires a verified account tier, but AuraCall could not verify the current browser profile account level. Run the ChatGPT identity smoke for this AuraCall runtime profile first.`,
    );
  }
  return identity;
}

async function prepareManagedBrowserProfileLaunch(options: {
  config: ReturnType<typeof resolveBrowserConfig>;
  target: 'chatgpt' | 'grok' | 'gemini';
  logger: BrowserLogger;
  auracallProfileName?: string | null;
}): Promise<{
  userDataDir: string;
  defaultManagedProfileDir: string;
  chromeProfile: string;
  bootstrapCookiePath: string | null;
  allowDestructiveProfileRetryReset: boolean;
}> {
  const launchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: options.auracallProfileName ?? null,
    browser: options.config,
    target: options.target,
  });
  const {
    managedProfileDir: userDataDir,
    defaultManagedProfileDir,
    configuredChromeProfile: chromeProfile,
    bootstrapCookiePath,
  } = launchContext;
  const allowDestructiveProfileRetryReset =
    path.resolve(userDataDir) === path.resolve(defaultManagedProfileDir);
  await mkdir(userDataDir, { recursive: true });
  options.logger(`Using managed browser profile at ${userDataDir}`);
  options.logger(`Browser profile selection: ${userDataDir}`);
  const bootstrapResult = await bootstrapManagedProfile({
    managedProfileDir: userDataDir,
    managedProfileName: chromeProfile,
    sourceCookiePath: bootstrapCookiePath,
    logger: options.logger,
  });
  if (bootstrapResult.cloned) {
    options.logger(
      `Seeded managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}).`,
    );
  }
  return {
    userDataDir,
    defaultManagedProfileDir,
    chromeProfile,
    bootstrapCookiePath,
    allowDestructiveProfileRetryReset,
  };
}

async function acquireBrowserExecutionOperation(options: {
  managedProfileDir: string | null | undefined;
  target: 'chatgpt' | 'grok' | 'gemini';
  logger: BrowserLogger;
  queueTimeoutMs?: number;
  queuePollMs?: number;
}, skipOperation = false): Promise<BrowserOperationAcquiredResult | null> {
  if (skipOperation) {
    options.logger('[browser] operation dispatcher already owned by caller; nested browser-execution acquire skipped.');
    return null;
  }
  if (!options.managedProfileDir) {
    return null;
  }
  const dispatcher = createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const seenBlockedOperationIds = new Set<string>();
  const acquired = await dispatcher.acquireQueued({
    managedProfileDir: options.managedProfileDir,
    serviceTarget: options.target,
    kind: 'browser-execution',
    operationClass: 'exclusive-mutating',
    ownerCommand: 'browser-execution',
  }, {
    timeoutMs: resolveBrowserExecutionQueueNumber(options.queueTimeoutMs, 10 * 60 * 1000),
    pollMs: resolveBrowserExecutionQueueNumber(options.queuePollMs, 1000),
    onBlocked: (result, context) => {
      if (seenBlockedOperationIds.has(result.blockedBy.id)) {
        return;
      }
      seenBlockedOperationIds.add(result.blockedBy.id);
      recordBrowserOperationQueueObservation({
        event: 'queued',
        key: result.key,
        blockedBy: result.blockedBy,
        attempt: context.attempt,
        elapsedMs: context.elapsedMs,
      });
      options.logger(
        `[browser] operation queued for ${result.key}; blocked by ` +
        `${result.blockedBy.kind}/${result.blockedBy.operationClass} ` +
        `pid=${result.blockedBy.ownerPid} attempt=${context.attempt}`,
      );
    },
  });
  if (!acquired.acquired) {
    recordBrowserOperationQueueObservation({
      event: 'busy-timeout',
      key: acquired.key,
      blockedBy: acquired.blockedBy,
    });
    throw new Error(formatBrowserOperationBusyResult(acquired));
  }
  recordBrowserOperationQueueObservation({
    event: 'acquired',
    key: acquired.operation.key,
    operation: acquired.operation,
  });
  options.logger(`[browser] operation dispatcher key: ${acquired.operation.key}`);
  return acquired;
}

export const acquireBrowserExecutionOperationForTest = acquireBrowserExecutionOperation;

function resolveBrowserExecutionQueueNumber(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return fallback;
}

async function withBrowserExecutionOperation<T>(
  config: ReturnType<typeof resolveBrowserConfig>,
  target: 'chatgpt' | 'grok' | 'gemini',
  logger: BrowserLogger,
  callback: () => Promise<T>,
): Promise<T> {
  const operation = await acquireBrowserExecutionOperation({
    managedProfileDir: config.manualLoginProfileDir,
    target,
    logger,
  });
  try {
    return await callback();
  } finally {
    await operation?.release();
  }
}

function isCloudflareChallengeError(error: unknown): error is BrowserAutomationError {
  if (!(error instanceof BrowserAutomationError)) return false;
  return (error.details as { stage?: string } | undefined)?.stage === 'cloudflare-challenge';
}

function isManualClearBlockingPageError(error: unknown): error is BrowserAutomationError {
  if (!(error instanceof BrowserAutomationError)) return false;
  return (error.details as { stage?: string } | undefined)?.stage === 'manual-clear-blocking-page';
}

function shouldPreserveBrowserOnError(error: unknown, headless: boolean): boolean {
  return !headless && (isCloudflareChallengeError(error) || isManualClearBlockingPageError(error));
}

export function shouldPreserveBrowserOnErrorForTest(error: unknown, headless: boolean): boolean {
  return shouldPreserveBrowserOnError(error, headless);
}

async function detectManualClearBlockingState(
  Runtime: ChromeClient['Runtime'],
): Promise<ReturnType<typeof classifyBrowserToolsBlockingState>> {
  const evaluation = await Runtime.evaluate({
    expression: `(() => ({
      url: String(globalThis.location?.href ?? ''),
      title: String(document.title ?? ''),
      bodyText: String(document.body?.innerText ?? document.body?.textContent ?? '').slice(0, 20000),
    }))()`,
    returnByValue: true,
  }).catch(() => null);
  const value = evaluation?.result?.value as { url?: unknown; title?: unknown; bodyText?: unknown } | undefined;
  return classifyBrowserToolsBlockingState({
    url: typeof value?.url === 'string' ? value.url : '',
    title: typeof value?.title === 'string' ? value.title : '',
    bodyText: typeof value?.bodyText === 'string' ? value.bodyText : '',
  });
}

async function ensureNoManualClearBlockingPage(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  options: { action: string } = { action: 'browser run' },
): Promise<void> {
  const blockingState = await detectManualClearBlockingState(Runtime);
  if (!blockingState?.requiresHuman) {
    return;
  }
  logger(`Blocking page detected before ${options.action}: ${blockingState.summary}`);
  throw new BrowserAutomationError(
    `${blockingState.summary} Clear the page manually in the open browser, then rerun the lowest-churn AuraCall command.`,
    {
      stage: 'manual-clear-blocking-page',
      blockingState,
      action: options.action,
    },
  );
}

function shouldTreatChatgptAssistantResponseAsStale(options: {
  baselineText?: string | null;
  baselineMessageId?: string | null;
  baselineTurnId?: string | null;
  answerText?: string | null;
  answerMessageId?: string | null;
  answerTurnId?: string | null;
}): boolean {
  const normalizeForComparison = (text: string): string =>
    text.toLowerCase().replace(/\s+/g, ' ').trim();
  const baselineNormalized = options.baselineText ? normalizeForComparison(options.baselineText) : '';
  if (!baselineNormalized) {
    return false;
  }
  const normalizedAnswer = options.answerText ? normalizeForComparison(options.answerText) : '';
  const baselinePrefix =
    baselineNormalized.length >= 80
      ? baselineNormalized.slice(0, Math.min(200, baselineNormalized.length))
      : '';
  const sameMessageId =
    Boolean(options.baselineMessageId) &&
    Boolean(options.answerMessageId) &&
    options.answerMessageId === options.baselineMessageId;
  const sameTurnId =
    Boolean(options.baselineTurnId) &&
    Boolean(options.answerTurnId) &&
    options.answerTurnId === options.baselineTurnId;
  const endsWithBaseline =
    normalizedAnswer.length > baselineNormalized.length &&
    normalizedAnswer.endsWith(baselineNormalized);
  return (
    sameMessageId ||
    sameTurnId ||
    normalizedAnswer === baselineNormalized ||
    (baselinePrefix.length > 0 && normalizedAnswer.startsWith(baselinePrefix)) ||
    endsWithBaseline
  );
}

export function shouldTreatChatgptAssistantResponseAsStaleForTest(options: {
  baselineText?: string | null;
  baselineMessageId?: string | null;
  baselineTurnId?: string | null;
  answerText?: string | null;
  answerMessageId?: string | null;
  answerTurnId?: string | null;
}): boolean {
  return shouldTreatChatgptAssistantResponseAsStale(options);
}

function resolveChatgptBrowserGuardProfileName(
  config: ReturnType<typeof resolveBrowserConfig>,
  managedProfileDir?: string | null,
): string {
  return resolveChatgptRateLimitProfileName({
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
}

async function enforceChatgptBrowserRateLimitGuard(
  config: ReturnType<typeof resolveBrowserConfig>,
  logger: BrowserLogger,
  managedProfileDir?: string | null,
): Promise<void> {
  const state = await readChatgptRateLimitGuardState({
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
  if (!state) {
    return;
  }
  const now = Date.now();
  if (typeof state.cooldownUntil === 'number' && state.cooldownUntil > now) {
    const remainingMs = state.cooldownUntil - now;
    if (remainingMs <= CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS) {
      logger(`[browser] Waiting ${Math.ceil(remainingMs / 1000)}s for ChatGPT cooldown to clear.`);
      await delay(remainingMs);
    } else {
      const summary = state.cooldownReason ? ` ${state.cooldownReason}` : '';
      throw new Error(
        `ChatGPT rate limit cooldown active until ${new Date(state.cooldownUntil).toISOString()} (${Math.ceil(
          remainingMs / 1000,
        )}s remaining).${summary}`.trim(),
      );
    }
  }
  const postCommitWaitMs = getChatgptPostCommitQuietWaitMs(state, now, {
    windowMs: CHATGPT_MUTATION_WINDOW_MS,
  });
  if (postCommitWaitMs > 0) {
    if (postCommitWaitMs <= CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS) {
      logger(`[browser] Waiting ${Math.ceil(postCommitWaitMs / 1000)}s for ChatGPT post-write quiet period.`);
      await delay(postCommitWaitMs);
    } else {
      throw new Error(
        `ChatGPT post-write quiet period active until ${new Date(now + postCommitWaitMs).toISOString()} (${Math.ceil(
          postCommitWaitMs / 1000,
        )}s remaining).`,
      );
    }
  }
  const budgetWaitMs = getChatgptMutationBudgetWaitMs(state, Date.now(), {
    windowMs: CHATGPT_MUTATION_WINDOW_MS,
    maxWeight: CHATGPT_MUTATION_MAX_WEIGHT,
  });
  if (budgetWaitMs <= 0) {
    return;
  }
  if (budgetWaitMs <= CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS) {
    logger(`[browser] Waiting ${Math.ceil(budgetWaitMs / 1000)}s for ChatGPT write budget to clear.`);
    await delay(budgetWaitMs);
    return;
  }
  throw new Error(
    `ChatGPT write budget active until ${new Date(Date.now() + budgetWaitMs).toISOString()} (${Math.ceil(
      budgetWaitMs / 1000,
    )}s remaining).`,
  );
}

async function noteChatgptBrowserMutationSuccess(
  config: ReturnType<typeof resolveBrowserConfig>,
  managedProfileDir?: string | null,
): Promise<void> {
  const profile = resolveChatgptBrowserGuardProfileName(config, managedProfileDir);
  const current = await readChatgptRateLimitGuardState({
    profileName: profile,
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
  const now = Date.now();
  const recentMutations = appendChatgptMutationRecord(
    current?.recentMutations ?? current?.recentMutationAts,
    'browserRun',
    now,
    CHATGPT_MUTATION_WINDOW_MS,
  );
  await writeChatgptRateLimitGuardState(
    {
      provider: 'chatgpt',
      profile,
      updatedAt: now,
      lastMutationAt: now,
      recentMutations,
      recentMutationAts: recentMutations.map((entry) => entry.at),
      cooldownUntil:
        typeof current?.cooldownUntil === 'number' && current.cooldownUntil > now ? current.cooldownUntil : undefined,
      cooldownDetectedAt:
        typeof current?.cooldownUntil === 'number' && current.cooldownUntil > now
          ? current?.cooldownDetectedAt
          : undefined,
      cooldownReason:
        typeof current?.cooldownUntil === 'number' && current.cooldownUntil > now
          ? current?.cooldownReason
          : undefined,
      cooldownAction:
        typeof current?.cooldownUntil === 'number' && current.cooldownUntil > now
          ? current?.cooldownAction
          : undefined,
    },
    {
      profileName: profile,
      managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
      managedProfileRoot: config.managedProfileRoot ?? null,
    },
  );
}

function resolveGrokBrowserGuardProfileName(
  config: ReturnType<typeof resolveBrowserConfig>,
  managedProfileDir?: string | null,
): string {
  return resolveSimpleProviderGuardProfileName({
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
}

function isGrokRateLimitMessage(message: string): boolean {
  return /too many requests|query limit|rate limit|request limit|slow down|try again later|try again in\s+\d+/i.test(message);
}

function extractGrokRateLimitSummary(message: string): string | null {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const direct = normalized.match(
    /(query limit[^.]*\.?(?:\s*try again in [^.]*\.?)?|too many requests[^.]*\.?|rate limit[^.]*\.?|request limit[^.]*\.?|slow down[^.]*\.?|try again later[^.]*\.?|try again in [^.]*\.?)/i,
  );
  return direct?.[1]?.trim() ?? null;
}

function extractRetryAfterMs(message: string): number | null {
  const match = message.match(/try again in\s+(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours)/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const unit = match[2].toLowerCase();
  if (unit.startsWith('sec')) {
    return amount * 1000;
  }
  if (unit.startsWith('hour')) {
    return amount * 60 * 60_000;
  }
  return amount * 60_000;
}

async function enforceGrokBrowserRateLimitGuard(
  config: ReturnType<typeof resolveBrowserConfig>,
  logger: BrowserLogger,
  managedProfileDir?: string | null,
): Promise<void> {
  const state = await readSimpleProviderGuardState({
    provider: 'grok',
    profileName: resolveGrokBrowserGuardProfileName(config, managedProfileDir),
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
  if (!state) {
    return;
  }
  const now = Date.now();
  if (typeof state.cooldownUntil === 'number' && state.cooldownUntil > now) {
    const remainingMs = state.cooldownUntil - now;
    if (remainingMs <= GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS) {
      logger(`[browser] Waiting ${Math.ceil(remainingMs / 1000)}s for Grok cooldown to clear.`);
      await delay(remainingMs);
    } else {
      const summary = state.cooldownReason ? ` ${state.cooldownReason}` : '';
      throw new Error(
        `Grok rate limit cooldown active until ${new Date(state.cooldownUntil).toISOString()} (${Math.ceil(
          remainingMs / 1000,
        )}s remaining).${summary}`.trim(),
      );
    }
  }
  const lastMutationAt = typeof state.lastMutationAt === 'number' ? state.lastMutationAt : null;
  if (!lastMutationAt) {
    return;
  }
  const quietUntil = Math.max(lastMutationAt + GROK_MUTATION_MIN_INTERVAL_MS, lastMutationAt + GROK_POST_COMMIT_QUIET_MS);
  const remainingMs = quietUntil - now;
  if (remainingMs <= 0) {
    return;
  }
  if (remainingMs <= GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS) {
    logger(`[browser] Waiting ${Math.ceil(remainingMs / 1000)}s for Grok write spacing.`);
    await delay(remainingMs);
    return;
  }
  throw new Error(
    `Grok write spacing active until ${new Date(quietUntil).toISOString()} (${Math.ceil(
      remainingMs / 1000,
    )}s remaining).`,
  );
}

async function noteGrokBrowserMutationSuccess(
  config: ReturnType<typeof resolveBrowserConfig>,
  managedProfileDir?: string | null,
): Promise<void> {
  const now = Date.now();
  const current = await readSimpleProviderGuardState({
    provider: 'grok',
    profileName: resolveGrokBrowserGuardProfileName(config, managedProfileDir),
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
  const next = {
    provider: 'grok' as const,
    profile: resolveGrokBrowserGuardProfileName(config, managedProfileDir),
    updatedAt: now,
    lastMutationAt: now,
  };
  if (typeof current?.cooldownUntil === 'number' && current.cooldownUntil > now) {
    Object.assign(next, {
      cooldownUntil: current.cooldownUntil,
      cooldownDetectedAt: current.cooldownDetectedAt,
      cooldownReason: current.cooldownReason,
      cooldownAction: current.cooldownAction,
    });
  }
  await writeSimpleProviderGuardState(next, {
    provider: 'grok',
    profileName: next.profile,
    managedProfileDir: managedProfileDir ?? config.manualLoginProfileDir ?? null,
    managedProfileRoot: config.managedProfileRoot ?? null,
  });
}

async function handleGrokBrowserRateLimitFailure(options: {
  config: ReturnType<typeof resolveBrowserConfig>;
  logger: BrowserLogger;
  error: Error;
  action: string;
  managedProfileDir?: string | null;
}): Promise<Error> {
  if (!isGrokRateLimitMessage(options.error.message)) {
    return options.error;
  }
  const now = Date.now();
  const retryAfterMs = extractRetryAfterMs(options.error.message);
  const cooldownUntil = now + (retryAfterMs ?? GROK_RATE_LIMIT_COOLDOWN_MS);
  const profile = resolveGrokBrowserGuardProfileName(options.config, options.managedProfileDir);
  const reason = extractGrokRateLimitSummary(options.error.message);
  await writeSimpleProviderGuardState(
    {
      provider: 'grok',
      profile,
      updatedAt: now,
      lastMutationAt: now,
      cooldownDetectedAt: now,
      cooldownUntil,
      cooldownReason: reason ?? undefined,
      cooldownAction: options.action,
    },
    {
      provider: 'grok',
      profileName: profile,
      managedProfileDir: options.managedProfileDir ?? options.config.manualLoginProfileDir ?? null,
      managedProfileRoot: options.config.managedProfileRoot ?? null,
    },
  );
  options.logger(`[browser] Grok rate limit detected; cooling down until ${new Date(cooldownUntil).toISOString()}.`);
  const detail = reason ? ` ${reason}` : '';
  return new Error(
    `Grok rate limit detected while ${options.action}; cooling down until ${new Date(
      cooldownUntil,
    ).toISOString()}.${detail}`.trim(),
    { cause: options.error },
  );
}

type ChatgptVisibleBlockingSurface = {
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
};

async function detectVisibleChatgptBlockingSurface(
  Runtime: ChromeClient['Runtime'],
): Promise<ChatgptVisibleBlockingSurface | null> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matches = [];
      for (const selector of ['[role="dialog"]', '[aria-modal="true"]', '[role="alert"]', '[aria-live]']) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(node)) continue;
          const text = normalize(node.textContent || '');
          if (!text) continue;
          const buttonLabels = Array.from(node.querySelectorAll('button,[role="button"]'))
            .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
            .filter(Boolean)
            .slice(0, 8);
          matches.push({
            text: text.slice(0, 240),
            ariaLabel: normalize(node.getAttribute('aria-label') || ''),
            buttonLabels,
          });
        }
      }
      if (matches.length > 0) {
        return { type: 'overlay', probe: matches[0] };
      }
      const retryLabels = ['retry', 'try again', 'regenerate', 'regenerate response', 'continue generating'];
      for (const node of Array.from(document.querySelectorAll('button,[role="button"]'))) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const label = normalize(node.getAttribute('aria-label') || node.textContent || '');
        if (!retryLabels.includes(label)) continue;
        const scope =
          node.closest('section[data-testid^="conversation-turn-"]') ||
          node.closest('[data-message-author-role]') ||
          node.parentElement;
        return {
          type: 'retry',
          probe: {
            text: normalize(scope?.textContent || node.textContent || '').slice(0, 240),
            ariaLabel: '',
            buttonLabels: [label],
          },
        };
      }
      return null;
    })()`,
    returnByValue: true,
  });
  const value = result?.value as
    | { type?: string; probe?: { text?: string; ariaLabel?: string; buttonLabels?: string[] } | null }
    | null
    | undefined;
  const classified = classifyChatgptBlockingSurfaceProbe(value?.probe ?? null);
  return classified
    ? {
        kind: classified.kind,
        summary: classified.summary,
        details: {
          source: value?.type ?? null,
          probe: value?.probe ?? null,
        },
      }
    : null;
}

function formatChatgptBlockingSurfaceError(surface: { kind: string; summary: string }): string {
  switch (surface.kind) {
    case 'retry-affordance':
      return `ChatGPT assistant turn failed and exposed a retry/regenerate control (auto-click disabled): ${surface.summary}`;
    case 'connection-failed':
      return `ChatGPT conversation entered a connection-failed state: ${surface.summary}`;
    case 'transient-error':
      return `ChatGPT surfaced a transient error state: ${surface.summary}`;
    case 'rate-limit':
      return surface.summary;
    default:
      return surface.summary;
  }
}

export function formatChatgptBlockingSurfaceErrorForTest(surface: { kind: string; summary: string }): string {
  return formatChatgptBlockingSurfaceError(surface);
}

async function logChatgptUnexpectedState(options: {
  Runtime: ChromeClient['Runtime'];
  logger: BrowserLogger;
  context: string;
  surface?: ChatgptVisibleBlockingSurface | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!options.logger?.verbose) {
    return;
  }
  logStructuredDebugEvent(options.logger, options.context, {
    surface: options.surface
      ? {
          kind: options.surface.kind,
          summary: options.surface.summary,
          details: options.surface.details ?? null,
        }
      : null,
    ...(options.extra ?? {}),
  });
  const snapshot = await captureBrowserPostmortemSnapshot(options.Runtime).catch(() => null);
  if (snapshot) {
    await persistBrowserPostmortemRecord({
      context: options.context,
      payload: {
        provider: 'chatgpt',
        mode: 'send',
        context: options.context,
        surface: options.surface
          ? {
              kind: options.surface.kind,
              summary: options.surface.summary,
              details: options.surface.details ?? null,
            }
          : null,
        snapshot,
        ...(options.extra ?? {}),
      },
    }).catch(() => undefined);
  }
  await logBrowserPostmortemSnapshot(options.Runtime, options.logger, options.context).catch(() => undefined);
}

export async function logChatgptUnexpectedStateForTest(options: {
  Runtime: ChromeClient['Runtime'];
  logger: BrowserLogger;
  context: string;
  surface?: ChatgptVisibleBlockingSurface | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  await logChatgptUnexpectedState(options);
}

async function handleChatgptBrowserRateLimitFailure(options: {
  config: ReturnType<typeof resolveBrowserConfig>;
  logger: BrowserLogger;
  error: Error;
  action: string;
  Runtime?: ChromeClient['Runtime'] | null;
  managedProfileDir?: string | null;
}): Promise<Error> {
  let reason = extractChatgptRateLimitSummary(options.error.message);
  if (!reason && options.Runtime) {
    const surface = await detectVisibleChatgptBlockingSurface(options.Runtime).catch(() => null);
    if (surface?.kind === 'rate-limit') {
      reason = surface.summary;
    }
  }
  if (!reason && !isChatgptRateLimitMessage(options.error.message)) {
    return options.error;
  }
  const now = Date.now();
  const cooldownUntil = now + CHATGPT_RATE_LIMIT_COOLDOWN_MS;
  const profile = resolveChatgptBrowserGuardProfileName(options.config, options.managedProfileDir);
  const current = await readChatgptRateLimitGuardState({
    profileName: profile,
    managedProfileDir: options.managedProfileDir ?? options.config.manualLoginProfileDir ?? null,
    managedProfileRoot: options.config.managedProfileRoot ?? null,
  });
  const recentMutations = appendChatgptMutationRecord(
    current?.recentMutations ?? current?.recentMutationAts,
    options.action,
    now,
    CHATGPT_MUTATION_WINDOW_MS,
  );
  await writeChatgptRateLimitGuardState(
    {
      provider: 'chatgpt',
      profile,
      updatedAt: now,
      lastMutationAt: now,
      recentMutations,
      recentMutationAts: recentMutations.map((entry) => entry.at),
      cooldownDetectedAt: now,
      cooldownUntil,
      cooldownReason: reason ?? undefined,
      cooldownAction: options.action,
    },
    {
      profileName: profile,
      managedProfileDir: options.managedProfileDir ?? options.config.manualLoginProfileDir ?? null,
      managedProfileRoot: options.config.managedProfileRoot ?? null,
    },
  );
  options.logger(
    `[browser] ChatGPT rate limit detected; cooling down until ${new Date(cooldownUntil).toISOString()}.`,
  );
  const detail = reason ? ` ${reason}` : '';
  return new Error(
    `ChatGPT rate limit detected while ${options.action}; cooling down until ${new Date(
      cooldownUntil,
    ).toISOString()}.${detail}`.trim(),
    { cause: options.error },
  );
}

function createWindowsManagedProfileRetryReset(options: {
  config: ReturnType<typeof resolveBrowserConfig>;
  userDataDir: string;
  bootstrapCookiePath: string | null;
  logger: BrowserLogger;
  allowDestructiveReset?: boolean;
}) {
  const { config, userDataDir, bootstrapCookiePath, logger, allowDestructiveReset = true } = options;
  const chromePath = config.chromePath?.trim() ?? '';
  const windowsChromeFromWsl =
    process.platform === 'linux' &&
    (Boolean(process.env.WSL_DISTRO_NAME) || os.release().toLowerCase().includes('microsoft')) &&
    /^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath);
  if (!windowsChromeFromWsl) {
    return undefined;
  }
  return async ({ failedPort, nextPort, attempt }: { failedPort: number; nextPort: number; attempt: number }) => {
    if (!allowDestructiveReset) {
      logger(
        `Skipping destructive managed-profile reset after failed Windows Chrome launch on ${failedPort}; preserving explicit profile state before retry ${attempt + 1} (${nextPort}).`,
      );
      return;
    }
    logger(
      `Resetting managed browser profile after failed Windows Chrome launch on ${failedPort} before retry ${attempt + 1} (${nextPort}).`,
    );
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(userDataDir, { recursive: true });
    if (!bootstrapCookiePath) {
      return;
    }
    const bootstrapResult = await bootstrapManagedProfile({
      managedProfileDir: userDataDir,
      managedProfileName: config.chromeProfile ?? 'Default',
      sourceCookiePath: bootstrapCookiePath,
      seedPolicy: 'force-reseed',
      logger,
    });
    if (bootstrapResult.cloned || bootstrapResult.reseeded) {
      logger(
        `Refreshed managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}) for Windows retry.`,
      );
    }
  };
}

export async function runBrowserMode(options: BrowserRunOptions): Promise<BrowserRunResult> {
  const promptText = options.prompt?.trim();
  if (!promptText) {
    throw new Error('Prompt text is required when using browser mode.');
  }

  const attachments: BrowserAttachment[] = options.attachments ?? [];
  const fallbackSubmission = options.fallbackSubmission;
  const { config, target, logger } = await resolveBrowserRuntimeEntryContext(options);
  const runtimeHintCb = options.runtimeHintCb;
  if (config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') {
    logger(
      `[browser-mode] config: ${JSON.stringify({
        ...config,
        promptLength: promptText.length,
      })}`,
    );
  }

  // Remote Chrome mode - connect to existing browser
  if (config.remoteChrome) {
    // Warn about ignored local-only options
    if (config.headless || config.hideWindow || config.keepBrowser || config.chromePath) {
      logger(
        'Note: --remote-chrome ignores local Chrome flags ' +
        '(--browser-headless, --browser-hide-window, --browser-keep-browser, --browser-chrome-path).'
      );
    }

    if (target === 'grok') {
      return withBrowserExecutionOperation(config, target, logger, () =>
        runRemoteGrokBrowserMode(promptText, attachments, config, logger, options),
      );
    }

    return withBrowserExecutionOperation(config, target, logger, () =>
      runRemoteBrowserMode(promptText, attachments, config, logger, options),
    );
  }

  if (target === 'grok') {
    return runGrokBrowserMode({
      promptText,
      attachments,
      config,
      logger,
      runtimeHintCb,
      auracallProfileName: options.config?.auracallProfileName ?? null,
    });
  }

  let lastTargetId: string | undefined;
  let lastUrl: string | undefined;
  let selectedThinkingTime: ThinkingTimeLevel | null = null;
  let selectedChatgptProMode: ChatgptProMode | null = null;
  let selectedChatgptAccountLevel: string | null = null;
  let selectedChatgptAccountPlanType: string | null = null;
  let selectedChatgptAccountStructure: string | null = null;
  let chatgptDeepResearchStage: ChatgptDeepResearchStage | null = null;
  let chatgptDeepResearchPlanAction: 'start' | 'edit' | null = null;
  let chatgptDeepResearchStartMethod: 'manual' | 'auto' | null = null;
  let chatgptDeepResearchStartLabel: string | null = null;
  let chatgptDeepResearchModifyPlanLabel: string | null = null;
  let chatgptDeepResearchModifyPlanVisible: boolean | null = null;
  let chatgptDeepResearchReviewEvidence: Record<string, unknown> | null = null;
  const emitRuntimeHint = async (): Promise<void> => {
    if (!runtimeHintCb || !chrome?.port) {
      return;
    }
    const conversationId = lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined;
    const hint = {
      selectedAgentId: config.selectedAgentId ?? null,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      chromeHost,
      chromeTargetId: lastTargetId,
      tabUrl: lastUrl,
      conversationId,
      userDataDir,
      controllerPid: process.pid,
      thinkingTime: selectedThinkingTime ?? undefined,
      chatgptProMode: selectedChatgptProMode ?? undefined,
      chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
      chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
      chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
      chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
      chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
      chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
      chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
      chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
      chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
      chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
    };
    try {
      await runtimeHintCb(hint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to persist runtime hint: ${message}`);
    }
  };

  const manualLogin = true;
  const {
    userDataDir,
    chromeProfile,
    bootstrapCookiePath,
    allowDestructiveProfileRetryReset,
  } = await prepareManagedBrowserProfileLaunch({
    config,
    target,
    logger,
    auracallProfileName: options.config?.auracallProfileName ?? null,
  });
  const browserOperation = await acquireBrowserExecutionOperation({
    managedProfileDir: userDataDir,
    target,
    logger,
  }, options.skipBrowserExecutionOperation);
  await enforceChatgptBrowserRateLimitGuard(config, logger, userDataDir);
  const onWindowsRetry = createWindowsManagedProfileRetryReset({
    config,
    userDataDir,
    bootstrapCookiePath,
    logger,
    allowDestructiveReset: allowDestructiveProfileRetryReset,
  });

  const effectiveKeepBrowser = Boolean(config.keepBrowser || config.deepResearchPlanAction === 'edit');
  const ownedChromePids = new Set<number>();
  const ownedChromePorts = new Set<number>();
  const rememberOwnedChrome = (candidate: LaunchedChrome | null | undefined): void => {
    if (typeof candidate?.pid === 'number' && Number.isFinite(candidate.pid) && candidate.pid > 0) {
      ownedChromePids.add(candidate.pid);
    }
    if (typeof candidate?.port === 'number' && Number.isFinite(candidate.port) && candidate.port > 0) {
      ownedChromePorts.add(candidate.port);
    }
  };
  const reusedChrome = await reuseRunningChromeProfile(userDataDir, logger);
  let chrome =
    reusedChrome ??
    (await launchChrome(
      {
        ...config,
        remoteChrome: config.remoteChrome,
      },
      userDataDir,
      logger,
      { onWindowsRetry, ownedPids: ownedChromePids, ownedPorts: ownedChromePorts },
    ));
  if (!reusedChrome) {
    rememberOwnedChrome(chrome);
  }
  let chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
  // Persist profile state so future manual-login runs can reuse this Chrome.
  const persistManualLoginState = async (): Promise<void> => {
    if (!manualLogin || !chrome.port) return;
    await writeDevToolsActivePort(userDataDir, chrome.port);
    if (!reusedChrome && chrome.pid) {
      await writeChromePid(userDataDir, chrome.pid);
    }
  };

  await persistManualLoginState();

  let client: Awaited<ReturnType<typeof connectToChrome>> | null = null;
  const startedAt = Date.now();
  let answerText = '';
  let answerMarkdown = '';
  let answerHtml = '';
  let selectedComposerTool: string | null = null;
  let runStatus: 'attempted' | 'complete' = 'attempted';
  let connectionClosedUnexpectedly = false;
  let stopThinkingMonitor: (() => void) | null = null;
  let removeDialogHandler: (() => void) | null = null;
  let appliedCookies = 0;
  let removeTerminationHooks: (() => void) | null = null;
  let preserveBrowserOnError = false;
  let runtimeForGuard: ChromeClient['Runtime'] | null = null;
  const passiveObservations: BrowserPassiveObservation[] = [];

  try {
    try {
      try {
        client = await connectToChrome(chrome.port, logger, chromeHost);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!manualLogin) {
          throw error;
        }
        logger(
          `DevTools connection failed (${message}); clearing stale profile state and relaunching Chrome.`,
        );
        await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
        try {
          await chrome.kill();
        } catch {
          // ignore cleanup errors
        }
        chrome = await launchChrome(
          {
            ...config,
            remoteChrome: config.remoteChrome,
          },
          userDataDir,
          logger,
          { onWindowsRetry, ownedPids: ownedChromePids, ownedPorts: ownedChromePorts },
        );
        rememberOwnedChrome(chrome);
        chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
        await persistManualLoginState();
        client = await connectToChrome(chrome.port, logger, chromeHost);
      }
    } catch (error) {
      const hint = buildWslFirewallHint(chromeHost, chrome.port);
      if (hint) {
        logger(hint);
      }
      throw error;
    }
    try {
      removeTerminationHooks = registerTerminationHooks(chrome, userDataDir, effectiveKeepBrowser, logger, {
        isInFlight: () => runStatus !== 'complete',
        emitRuntimeHint,
        preserveUserDataDir: manualLogin,
      });
    } catch {
      // ignore failure; cleanup still happens below
    }
    const disconnectPromise = new Promise<never>((_, reject) => {
      client?.on('disconnect', () => {
        connectionClosedUnexpectedly = true;
        logger('Chrome window closed; attempting to abort run.');
        reject(new Error('Chrome window closed before auracall finished. Please keep it open until completion.'));
      });
    });
    const raceWithDisconnect = <T>(promise: Promise<T>): Promise<T> =>
      Promise.race([promise, disconnectPromise]);
      const { Network, Page, Runtime, Input, DOM } = client;
      runtimeForGuard = Runtime;

    if (!config.headless && config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
      await hideChromeWindow(chrome, logger);
    }

    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === 'function') {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);
    removeDialogHandler = installJavaScriptDialogAutoDismissal(Page, logger);
    const existingManagedCookieFile = findBrowserCookieFile(userDataDir, chromeProfile);
    const shouldSeedManagedProfile =
      config.cookieSync &&
      !config.inlineCookies &&
      Boolean(bootstrapCookiePath) &&
      (Boolean(config.manualLoginCookieSync) || !existingManagedCookieFile);
    const shouldApplyInlineCookies = Boolean(config.inlineCookies);

    if (shouldApplyInlineCookies || shouldSeedManagedProfile) {
      if (shouldSeedManagedProfile) {
        logger(
          `Bootstrapping managed browser profile from source browser cookies at ${bootstrapCookiePath}.`,
        );
      } else if (!config.inlineCookies) {
        logger(
          'Heads-up: macOS may prompt for your Keychain password to read Chrome cookies; use --copy or --render for manual flow.',
        );
      }
      const cookieCount = await syncCookies(Network, config.url, chromeProfile, logger, {
        allowErrors: config.allowCookieErrors ?? false,
        filterNames: config.cookieNames ?? undefined,
        inlineCookies: config.inlineCookies ?? undefined,
        cookiePath: shouldSeedManagedProfile ? bootstrapCookiePath ?? undefined : config.chromeCookiePath ?? undefined,
        waitMs: config.cookieSyncWaitMs ?? 0,
      });
      appliedCookies = cookieCount;
      if (config.inlineCookies && cookieCount === 0) {
        throw new Error('No inline cookies were applied; aborting before navigation.');
      }
      logger(
        cookieCount > 0
          ? config.inlineCookies
            ? `Applied ${cookieCount} inline cookies`
            : shouldSeedManagedProfile
              ? `Seeded ${cookieCount} cookies into managed browser profile ${chromeProfile}`
              : `Copied ${cookieCount} cookies from source browser profile ${chromeProfile}`
          : config.inlineCookies
            ? 'No inline cookies applied; continuing without session reuse'
            : shouldSeedManagedProfile
              ? 'No source browser cookies were applied to the managed browser profile; continuing without session reuse'
              : 'No Chrome cookies found; continuing without session reuse',
      );
    } else if (existingManagedCookieFile) {
      logger(`Reusing managed browser profile cookies from ${existingManagedCookieFile}.`);
    } else {
      logger('No managed-profile cookies found and no bootstrap source available; continuing without session reuse.');
    }

    const baseUrl = CHATGPT_URL;
    // First load the base ChatGPT homepage to satisfy potential interstitials,
    // then hop to the requested URL if it differs.
    await raceWithDisconnect(navigateToChatGPT(Page, Runtime, baseUrl, logger));
    await raceWithDisconnect(ensureNotBlocked(Runtime, config.headless, logger));
    await raceWithDisconnect(
      ensureNoManualClearBlockingPage(Runtime, logger, { action: 'ChatGPT login/prompt preparation' }),
    );
    // Learned: login checks must happen on the base domain before jumping into project URLs.
    await raceWithDisconnect(
      waitForLogin({
        runtime: Runtime,
        logger,
        appliedCookies,
        manualLogin,
        manualLoginWaitForSession: config.manualLoginWaitForSession,
        timeoutMs: config.timeoutMs,
        authRecoveryCommand: buildAuthModeCommand(config),
        managedProfileDir: config.manualLoginProfileDir,
      }),
    );

    if (config.url !== baseUrl) {
      await raceWithDisconnect(
        navigateToPromptReadyWithFallback(Page, Runtime, {
          url: config.url,
          fallbackUrl: baseUrl,
          timeoutMs: config.inputTimeoutMs,
          headless: config.headless,
          logger,
        }),
      );
      await raceWithDisconnect(
        ensureNoManualClearBlockingPage(Runtime, logger, { action: 'ChatGPT prompt preparation' }),
      );
    } else {
      await raceWithDisconnect(ensurePromptReady(Runtime, config.inputTimeoutMs, logger));
    }
    logger(`Prompt textarea ready (initial focus, ${promptText.length.toLocaleString()} chars queued)`);
    const captureRuntimeSnapshot = async () => {
      try {
        if (client?.Target?.getTargetInfo) {
          const info = await client.Target.getTargetInfo({});
          lastTargetId = info?.targetInfo?.targetId ?? lastTargetId;
          lastUrl = info?.targetInfo?.url ?? lastUrl;
        }
      } catch {
        // ignore
      }
      try {
        const { result } = await Runtime.evaluate({
          expression: 'location.href',
          returnByValue: true,
        });
        if (typeof result?.value === 'string') {
          lastUrl = result.value;
        }
      } catch {
        // ignore
      }
      if (lastUrl) {
        logger(`[browser] url = ${lastUrl}`);
      }
      if (chrome?.port) {
        const suffix = lastTargetId ? ` target=${lastTargetId}` : '';
        if (lastUrl) {
          logger(`[reattach] chrome port=${chrome.port} host=${chromeHost} url=${lastUrl}${suffix}`);
        } else {
          logger(`[reattach] chrome port=${chrome.port} host=${chromeHost}${suffix}`);
        }
        await emitRuntimeHint();
      }
    };
    let conversationHintInFlight: Promise<boolean> | null = null;
    const updateConversationHint = async (label: string, timeoutMs = 10_000): Promise<boolean> => {
      if (!chrome?.port) {
        return false;
      }
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const { result } = await Runtime.evaluate({ expression: 'location.href', returnByValue: true });
          if (typeof result?.value === 'string' && result.value.includes('/c/')) {
            lastUrl = result.value;
            logger(`[browser] conversation url (${label}) = ${lastUrl}`);
            await emitRuntimeHint();
            return true;
          }
        } catch {
          // ignore; keep polling until timeout
        }
        await delay(250);
      }
      return false;
    };
    const scheduleConversationHint = (label: string, timeoutMs?: number): void => {
      if (conversationHintInFlight) {
        return;
      }
      // Learned: the /c/ URL can update after the answer; emit hints in the background.
      // Run in the background so prompt submission/streaming isn't blocked by slow URL updates.
      conversationHintInFlight = updateConversationHint(label, timeoutMs)
        .catch(() => false)
        .finally(() => {
          conversationHintInFlight = null;
        });
    };
    await captureRuntimeSnapshot();
    const modelStrategy = config.modelStrategy ?? DEFAULT_MODEL_STRATEGY;
    if (config.desiredModel && modelStrategy !== 'ignore') {
      await raceWithDisconnect(dismissOpenMenus(Runtime).catch(() => false));
      await raceWithDisconnect(
        withRetries(
          () => ensureModelSelection(Runtime, config.desiredModel as string, logger, modelStrategy),
          {
            retries: 2,
            delayMs: 300,
            onRetry: (attempt, error) => {
              if (options.verbose) {
                logger(
                  `[retry] Model picker attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
                );
              }
            },
          },
        ),
      ).catch((error) => {
        const base = error instanceof Error ? error.message : String(error);
        const hint =
          appliedCookies === 0
            ? ' No cookies were applied; log in to ChatGPT in Chrome or provide inline cookies (--browser-inline-cookies[(-file)] or AURACALL_BROWSER_COOKIES_JSON).'
            : '';
        throw new Error(`${base}${hint}`);
      });
      await raceWithDisconnect(ensurePromptReady(Runtime, config.inputTimeoutMs, logger));
      logger(`Prompt textarea ready (after model switch, ${promptText.length.toLocaleString()} chars queued)`);
    } else if (modelStrategy === 'ignore') {
      logger('Model picker: skipped (strategy=ignore)');
    }
    // Handle thinking time selection if specified
    const thinkingTime = config.thinkingTime;
    if (thinkingTime && shouldApplyThinkingTime(config.desiredModel)) {
      const proModeGate = await raceWithDisconnect(assertChatgptProModeAllowed(Runtime, thinkingTime, logger));
      await raceWithDisconnect(dismissOpenMenus(Runtime).catch(() => false));
      await raceWithDisconnect(
        withRetries(() => ensureThinkingTime(Runtime, thinkingTime, logger), {
          retries: 2,
          delayMs: 300,
          onRetry: (attempt, error) => {
            if (options.verbose) {
              logger(`[retry] Thinking time (${thinkingTime}) attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
            }
          },
        }),
      );
      selectedThinkingTime = thinkingTime;
      selectedChatgptProMode = proModeGate.proMode;
      selectedChatgptAccountLevel = proModeGate.accountLevel ?? null;
      selectedChatgptAccountPlanType = proModeGate.accountPlanType ?? null;
      selectedChatgptAccountStructure = proModeGate.accountStructure ?? null;
      await emitRuntimeHint();
    }
    if (config.composerTool) {
      await raceWithDisconnect(dismissOpenMenus(Runtime).catch(() => false));
      await raceWithDisconnect(
        withRetries(() => ensureChatgptComposerTool(Runtime, config.composerTool as string, logger), {
          retries: 2,
          delayMs: 300,
          onRetry: (attempt, error) => {
            if (options.verbose) {
              logger(
                `[retry] Composer tool (${config.composerTool}) attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
              );
            }
          },
        }),
      );
      const composerSelection = await raceWithDisconnect(readCurrentChatgptComposerTool(Runtime));
      selectedComposerTool =
        composerSelection.label ?? (isChatgptDeepResearchTool(config.composerTool) ? config.composerTool : null);
      if (isChatgptDeepResearchTool(selectedComposerTool ?? config.composerTool)) {
        const identity = await raceWithDisconnect(readVerifiedChatgptAccountIdentity(Runtime, 'Deep Research'));
        selectedChatgptAccountLevel = identity.accountLevel ?? null;
        selectedChatgptAccountPlanType = identity.accountPlanType ?? null;
        selectedChatgptAccountStructure = identity.accountStructure ?? null;
        chatgptDeepResearchStage = 'tool-selected';
        chatgptDeepResearchPlanAction = config.deepResearchPlanAction ?? 'start';
        await emitRuntimeHint();
      }
      await raceWithDisconnect(ensurePromptReady(Runtime, config.inputTimeoutMs, logger));
      logger(`Prompt textarea ready (after composer tool, ${promptText.length.toLocaleString()} chars queued)`);
    }
    const submitOnce = async (prompt: string, submissionAttachments: BrowserAttachment[]) => {
      const baselineSnapshot = await readAssistantSnapshot(Runtime).catch(() => null);
      const baselineAssistantText =
        typeof baselineSnapshot?.text === 'string' ? baselineSnapshot.text.trim() : '';
      const baselineAssistantMessageId =
        typeof baselineSnapshot?.messageId === 'string' ? baselineSnapshot.messageId.trim() : '';
      const baselineAssistantTurnId =
        typeof baselineSnapshot?.turnId === 'string' ? baselineSnapshot.turnId.trim() : '';
      const attachmentNames = submissionAttachments.map((a) => path.basename(a.path));
      let attachmentWaitTimedOut = false;
      let inputOnlyAttachments = false;
      if (submissionAttachments.length > 0) {
        if (!DOM) {
          throw new Error('Chrome DOM domain unavailable while uploading attachments.');
        }
        await clearComposerAttachments(Runtime, 5_000, logger);
        for (let attachmentIndex = 0; attachmentIndex < submissionAttachments.length; attachmentIndex += 1) {
          const attachment = submissionAttachments[attachmentIndex];
          logger(`Uploading attachment: ${attachment.displayPath}`);
          const uiConfirmed = await uploadAttachmentFile(
            { runtime: Runtime, dom: DOM, input: Input },
            attachment,
            logger,
            { expectedCount: attachmentIndex + 1 },
          );
          if (!uiConfirmed) {
            inputOnlyAttachments = true;
          }
          await delay(500);
        }
        // Scale timeout based on number of files: base 45s + 20s per additional file.
        const baseTimeout = config.inputTimeoutMs ?? 30_000;
        const perFileTimeout = 20_000;
        const waitBudget = Math.max(baseTimeout, 45_000) + (submissionAttachments.length - 1) * perFileTimeout;
        try {
          await waitForAttachmentCompletion(Runtime, waitBudget, attachmentNames, logger);
          logger('All attachments uploaded');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/Attachments did not finish uploading before timeout/i.test(message)) {
            attachmentWaitTimedOut = true;
            logger(
              `[browser] Attachment upload timed out after ${Math.round(waitBudget / 1000)}s; continuing without confirmation.`,
            );
          } else {
            throw error;
          }
        }
      }
      let baselineTurns = await readConversationTurnCount(Runtime, logger);
      // Learned: return baselineTurns so assistant polling can ignore earlier content.
      const sendAttachmentNames = attachmentWaitTimedOut ? [] : attachmentNames;
      const committedTurns = await submitPrompt(
        {
          runtime: Runtime,
          input: Input,
          attachmentNames: sendAttachmentNames,
          baselineTurns: baselineTurns ?? undefined,
          inputTimeoutMs: config.inputTimeoutMs ?? undefined,
        },
        prompt,
        logger,
      );
      if (typeof committedTurns === 'number' && Number.isFinite(committedTurns)) {
        if (baselineTurns === null || committedTurns > baselineTurns) {
          baselineTurns = Math.max(0, committedTurns - 1);
        }
      }
      if (attachmentNames.length > 0) {
        if (attachmentWaitTimedOut) {
          logger('Attachment confirmation timed out; skipping user-turn attachment verification.');
        } else if (inputOnlyAttachments) {
          logger('Attachment UI did not render before send; skipping user-turn attachment verification.');
        } else {
          const verified = await waitForUserTurnAttachments(Runtime, attachmentNames, 20_000, logger);
          if (!verified) {
            throw new Error('Sent user message did not expose attachment UI after upload.');
          }
          logger('Verified attachments present on sent user message');
        }
      }
      // Reattach needs a /c/ URL; ChatGPT can update it late, so poll in the background.
      scheduleConversationHint('post-submit', config.timeoutMs ?? 120_000);
      return {
        baselineTurns,
        baselineAssistantText,
        baselineAssistantMessageId,
        baselineAssistantTurnId,
      };
    };

    let baselineTurns: number | null = null;
    let baselineAssistantText: string | null = null;
    let baselineAssistantMessageId: string | null = null;
    let baselineAssistantTurnId: string | null = null;
    try {
      const submission = await raceWithDisconnect(submitOnce(promptText, attachments));
      baselineTurns = submission.baselineTurns;
      baselineAssistantText = submission.baselineAssistantText;
      baselineAssistantMessageId = submission.baselineAssistantMessageId || null;
      baselineAssistantTurnId = submission.baselineAssistantTurnId || null;
    } catch (error) {
      const isPromptTooLarge =
        error instanceof BrowserAutomationError &&
        (error.details as { code?: string } | undefined)?.code === 'prompt-too-large';
      if (fallbackSubmission && isPromptTooLarge) {
        // Learned: when prompts truncate, retry with file uploads so the UI receives the full content.
        logger('[browser] Inline prompt too large; retrying with file uploads.');
        await raceWithDisconnect(clearPromptComposer(Runtime, logger));
        await raceWithDisconnect(ensurePromptReady(Runtime, config.inputTimeoutMs, logger));
        const submission = await raceWithDisconnect(
          submitOnce(fallbackSubmission.prompt, fallbackSubmission.attachments),
        );
        baselineTurns = submission.baselineTurns;
        baselineAssistantText = submission.baselineAssistantText;
        baselineAssistantMessageId = submission.baselineAssistantMessageId || null;
        baselineAssistantTurnId = submission.baselineAssistantTurnId || null;
      } else {
        throw error;
      }
    }
    if (chatgptDeepResearchStage === 'tool-selected') {
      recordBrowserPassiveObservation(passiveObservations, {
        state: 'plan-ready',
        source: 'browser-service',
        evidenceRef: 'chatgpt-deep-research-plan',
        confidence: 'medium',
      });
      chatgptDeepResearchStage = 'plan-ready';
      await emitRuntimeHint();
      const deepResearchPlanTimeoutMs = Math.min(config.timeoutMs ?? 120_000, 120_000);
      const startResult = await raceWithDisconnect(
        startChatgptDeepResearchPlan(
          Runtime,
          logger,
          chatgptDeepResearchPlanAction ?? 'start',
          deepResearchPlanTimeoutMs,
          Input,
        ),
      );
      chatgptDeepResearchStage =
        startResult.stage === 'auto-started'
          ? 'auto-started'
          : startResult.stage === 'plan-edit-opened'
            ? 'plan-edit-opened'
            : 'research-started';
      chatgptDeepResearchStartMethod = startResult.startMethod;
      chatgptDeepResearchStartLabel = startResult.startLabel;
      chatgptDeepResearchModifyPlanLabel = startResult.modifyPlanLabel;
      chatgptDeepResearchModifyPlanVisible = startResult.modifyPlanVisible;
      chatgptDeepResearchReviewEvidence = await captureChatgptDeepResearchReviewEvidence({
        Page,
        stage: chatgptDeepResearchStage,
        planAction: chatgptDeepResearchPlanAction,
        tabUrl: lastUrl ?? null,
        modifyPlanLabel: chatgptDeepResearchModifyPlanLabel,
        modifyPlanVisible: chatgptDeepResearchModifyPlanVisible,
        editTargetKind: startResult.editTargetKind ?? null,
        editTargetX: startResult.editTargetX ?? null,
        editTargetY: startResult.editTargetY ?? null,
      });
      recordBrowserPassiveObservation(passiveObservations, {
        state: startResult.stage === 'plan-edit-opened' ? 'awaiting-human' : 'research-started',
        source: 'browser-service',
        evidenceRef: typeof chatgptDeepResearchReviewEvidence?.screenshotPath === 'string'
          ? chatgptDeepResearchReviewEvidence.screenshotPath
          : startResult.startLabel ?? startResult.modifyPlanLabel ?? 'chatgpt-deep-research-start',
        confidence: 'high',
      });
      await emitRuntimeHint();
    }
    if (
      options.completionMode === 'prompt_submitted' ||
      chatgptDeepResearchStage === 'plan-edit-opened' ||
      (chatgptDeepResearchPlanAction === 'edit' && chatgptDeepResearchStage === 'auto-started')
    ) {
      await updateConversationHint('post-submit', Math.min(config.timeoutMs ?? 120_000, 120_000));
      await captureRuntimeSnapshot();
      runStatus = 'complete';
      if (chatgptDeepResearchStage !== 'plan-edit-opened' && chatgptDeepResearchStage !== 'auto-started') {
        recordBrowserPassiveObservation(passiveObservations, {
          state: 'response-incoming',
          source: 'browser-service',
          evidenceRef: 'chatgpt-prompt-submitted',
          confidence: 'high',
        });
      }
      const durationMs = Date.now() - startedAt;
      await noteChatgptBrowserMutationSuccess(config, userDataDir).catch(() => undefined);
      return {
        answerText: '',
        answerMarkdown: '',
        tookMs: durationMs,
        answerTokens: 0,
        answerChars: 0,
        chromePid: chrome.pid,
        chromePort: chrome.port,
        chromeHost,
        userDataDir,
        chromeTargetId: lastTargetId,
        tabUrl: lastUrl,
        conversationId: lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined,
        composerTool: selectedComposerTool,
        thinkingTime: selectedThinkingTime ?? undefined,
        chatgptProMode: selectedChatgptProMode ?? undefined,
        chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
        chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
        chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
        chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
        chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
        chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
        chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
        chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
        chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
        chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
        passiveObservations,
        controllerPid: process.pid,
      };
    }
    stopThinkingMonitor = startThinkingStatusMonitor(
      Runtime,
      logger,
      options.verbose ?? false,
      (message) => {
        recordBrowserPassiveObservation(passiveObservations, {
          state: 'thinking',
          source: 'browser-service',
          evidenceRef: message,
          confidence: 'medium',
        });
      },
    );
    // Helper to normalize text for echo detection (collapse whitespace, lowercase)
    const normalizeForComparison = (text: string): string =>
      text.toLowerCase().replace(/\s+/g, ' ').trim();
    const readFreshAssistantCandidate = async (
      baselineNormalized: string,
      baselinePrefix: string,
    ): Promise<{ text: string; html?: string; meta: { turnId?: string | null; messageId?: string | null } } | null> => {
      const snapshots = await Promise.all([
        readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null),
        readAssistantSnapshot(Runtime).catch(() => null),
      ]);
      let best:
        | { text: string; html?: string; meta: { turnId?: string | null; messageId?: string | null } }
        | null = null;
      for (const snapshot of snapshots) {
        const text = typeof snapshot?.text === 'string' ? snapshot.text.trim() : '';
        if (!text) continue;
        const normalized = normalizeForComparison(text);
        const isBaseline =
          normalized === baselineNormalized || (baselinePrefix.length > 0 && normalized.startsWith(baselinePrefix));
        if (isBaseline) continue;
        const candidate = {
          text,
          html: snapshot?.html ?? undefined,
          meta: { turnId: snapshot?.turnId ?? undefined, messageId: snapshot?.messageId ?? undefined },
        };
        if (
          !best ||
          (!best.meta.messageId && Boolean(candidate.meta.messageId)) ||
          candidate.text.length > best.text.length
        ) {
          best = candidate;
        }
      }
      return best;
    };
    const waitForFreshAssistantResponse = async (baselineNormalized: string, timeoutMs: number) => {
      const baselinePrefix =
        baselineNormalized.length >= 80
          ? baselineNormalized.slice(0, Math.min(200, baselineNormalized.length))
          : '';
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const candidate = await readFreshAssistantCandidate(baselineNormalized, baselinePrefix);
        if (candidate) {
          return candidate;
        }
        await delay(350);
      }
      return null;
    };
    let answer = await raceWithDisconnect(
      waitForAssistantResponseWithReload(
        Runtime,
        Page,
        config.timeoutMs,
        logger,
        baselineTurns ?? undefined,
        {
          onResponseIncoming: () => {
            recordBrowserPassiveObservation(passiveObservations, {
              state: 'response-incoming',
              source: 'browser-service',
              evidenceRef: 'chatgpt-assistant-snapshot',
              confidence: 'high',
            });
          },
        },
      ),
    );
    // Ensure we store the final conversation URL even if the UI updated late.
    await updateConversationHint('post-response', 15_000);
    const baselineNormalized = baselineAssistantText ? normalizeForComparison(baselineAssistantText) : '';
    if (baselineNormalized) {
      const isBaseline = shouldTreatChatgptAssistantResponseAsStale({
        baselineText: baselineAssistantText,
        baselineMessageId: baselineAssistantMessageId,
        baselineTurnId: baselineAssistantTurnId,
        answerText: answer.text,
        answerMessageId: answer.meta?.messageId ?? null,
        answerTurnId: answer.meta?.turnId ?? null,
      });
      if (isBaseline) {
        logger('Detected stale assistant response; waiting for new response...');
        const refreshed = await waitForFreshAssistantResponse(baselineNormalized, 15_000);
        if (refreshed) {
          answer = refreshed;
        } else {
          const visibleBlockingSurface = await detectVisibleChatgptBlockingSurface(Runtime).catch(() => null);
          if (visibleBlockingSurface) {
            await logChatgptUnexpectedState({
              Runtime,
              logger,
              context: 'chatgpt-stale-send-blocked',
              surface: visibleBlockingSurface,
              extra: {
                policy: visibleBlockingSurface.kind === 'retry-affordance' ? 'fail-fast-no-auto-retry-click' : 'fail-fast',
                baselineMessageId: baselineAssistantMessageId ?? null,
                baselineTurnId: baselineAssistantTurnId ?? null,
                answerMessageId: answer.meta?.messageId ?? null,
                answerTurnId: answer.meta?.turnId ?? null,
              },
            });
            throw new Error(formatChatgptBlockingSurfaceError(visibleBlockingSurface));
          }
          await logChatgptUnexpectedState({
            Runtime,
            logger,
            context: 'chatgpt-stale-send-without-visible-surface',
            extra: {
              baselineMessageId: baselineAssistantMessageId ?? null,
              baselineTurnId: baselineAssistantTurnId ?? null,
              answerMessageId: answer.meta?.messageId ?? null,
              answerTurnId: answer.meta?.turnId ?? null,
            },
          });
          throw new Error('Stale ChatGPT assistant response detected after send.');
        }
      }
    }
    answerText = answer.text;
    answerHtml = answer.html ?? '';
    const copiedMarkdown = await raceWithDisconnect(
      withRetries(
        async () => {
          const attempt = await captureAssistantMarkdown(Runtime, answer.meta, logger);
          if (!attempt) {
            throw new Error('copy-missing');
          }
          return attempt;
        },
        {
          retries: 2,
          delayMs: 350,
          onRetry: (attempt, error) => {
            if (options.verbose) {
              logger(
                `[retry] Markdown capture attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
              );
            }
          },
        },
      ),
    ).catch(() => null);
    answerMarkdown = copiedMarkdown ?? answerText;

    const promptEchoMatcher = buildPromptEchoMatcher(promptText);

    // Final sanity check: ensure we didn't accidentally capture the user prompt instead of the assistant turn.
    const finalSnapshot = await readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null);
    const finalText = typeof finalSnapshot?.text === 'string' ? finalSnapshot.text.trim() : '';
    if (finalText && finalText !== promptText.trim()) {
      const trimmedMarkdown = answerMarkdown.trim();
      const finalIsEcho = promptEchoMatcher ? promptEchoMatcher.isEcho(finalText) : false;
      const lengthDelta = finalText.length - trimmedMarkdown.length;
      const missingCopy = !copiedMarkdown && lengthDelta >= 0;
      const likelyTruncatedCopy =
        copiedMarkdown &&
        trimmedMarkdown.length > 0 &&
        lengthDelta >= Math.max(12, Math.floor(trimmedMarkdown.length * 0.75));
      if ((missingCopy || likelyTruncatedCopy) && !finalIsEcho && finalText !== trimmedMarkdown) {
        logger('Refreshed assistant response via final DOM snapshot');
        answerText = finalText;
        answerMarkdown = finalText;
      }
    }

    // Detect prompt echo using normalized comparison (whitespace-insensitive).
    const alignedEcho = alignPromptEchoPair(
      answerText,
      answerMarkdown,
      promptEchoMatcher,
      copiedMarkdown ? logger : undefined,
      {
        text: 'Aligned assistant response text to copied markdown after prompt echo',
        markdown: 'Aligned assistant markdown to response text after prompt echo',
      },
    );
    answerText = alignedEcho.answerText;
    answerMarkdown = alignedEcho.answerMarkdown;
    const isPromptEcho = alignedEcho.isEcho;
    if (isPromptEcho) {
      logger('Detected prompt echo in response; waiting for actual assistant response...');
      const deadline = Date.now() + 15_000;
      let bestText: string | null = null;
      let stableCount = 0;
      while (Date.now() < deadline) {
        const snapshot = await readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null);
        const text = typeof snapshot?.text === 'string' ? snapshot.text.trim() : '';
        const isStillEcho = !text || Boolean(promptEchoMatcher?.isEcho(text));
        if (!isStillEcho) {
          if (!bestText || text.length > bestText.length) {
            bestText = text;
            stableCount = 0;
          } else if (text === bestText) {
            stableCount += 1;
          }
          if (stableCount >= 2) {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (bestText) {
        logger('Recovered assistant response after detecting prompt echo');
        answerText = bestText;
        answerMarkdown = bestText;
      }
    }
    const minAnswerChars = 16;
    if (answerText.trim().length > 0 && answerText.trim().length < minAnswerChars) {
      const deadline = Date.now() + 12_000;
      let bestText = answerText.trim();
      let stableCycles = 0;
      while (Date.now() < deadline) {
        const snapshot = await readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null);
        const text = typeof snapshot?.text === 'string' ? snapshot.text.trim() : '';
        if (text && text.length > bestText.length) {
          bestText = text;
          stableCycles = 0;
        } else {
          stableCycles += 1;
        }
        if (stableCycles >= 3 && bestText.length >= minAnswerChars) {
          break;
        }
        await delay(400);
      }
      if (bestText.length > answerText.trim().length) {
        logger('Refreshed short assistant response from latest DOM snapshot');
        answerText = bestText;
        answerMarkdown = bestText;
      }
    }
    if (connectionClosedUnexpectedly) {
      // Bail out on mid-run disconnects so the session stays reattachable.
      throw new Error('Chrome disconnected before completion');
    }
    stopThinkingMonitor?.();
    runStatus = 'complete';
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'response-complete',
      source: 'browser-service',
      evidenceRef: 'chatgpt-response-finished',
      confidence: 'high',
    });
    const durationMs = Date.now() - startedAt;
    const answerChars = answerText.length;
    const answerTokens = estimateTokenCount(answerMarkdown);
    await noteChatgptBrowserMutationSuccess(config, userDataDir).catch(() => undefined);
  return {
    answerText,
    answerMarkdown,
    answerHtml: answerHtml.length > 0 ? answerHtml : undefined,
    tookMs: durationMs,
      answerTokens,
      answerChars,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      chromeHost,
      userDataDir,
      chromeTargetId: lastTargetId,
      tabUrl: lastUrl,
      conversationId: lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined,
      composerTool: selectedComposerTool,
      thinkingTime: selectedThinkingTime ?? undefined,
      chatgptProMode: selectedChatgptProMode ?? undefined,
      chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
      chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
      chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
      chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
      chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
      chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
      chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
      chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
      chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
      chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
      passiveObservations,
      controllerPid: process.pid,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const guardedError = await handleChatgptBrowserRateLimitFailure({
      config,
      logger,
      error: normalizedError,
      action: 'browserRun',
      Runtime: runtimeForGuard,
      managedProfileDir: userDataDir,
    });
    stopThinkingMonitor?.();
    const socketClosed = connectionClosedUnexpectedly || isWebSocketClosureError(guardedError);
    connectionClosedUnexpectedly = connectionClosedUnexpectedly || socketClosed;
    if (shouldPreserveBrowserOnError(normalizedError, config.headless)) {
      preserveBrowserOnError = true;
      const runtime = {
        chromePid: chrome.pid,
        chromePort: chrome.port,
        chromeHost,
        userDataDir,
        chromeTargetId: lastTargetId,
        tabUrl: lastUrl,
        controllerPid: process.pid,
      };
      const reuseProfileHint =
        `auracall --engine browser --browser-manual-login ` +
        `--browser-manual-login-profile-dir ${JSON.stringify(userDataDir)}`;
      await emitRuntimeHint();
      logger('Cloudflare challenge detected; leaving browser open so you can complete the check.');
      logger(`Reuse this managed browser profile with: ${reuseProfileHint}`);
      throw new BrowserAutomationError(
        'Cloudflare challenge detected. Complete the “Just a moment…” check in the open browser, then rerun.',
        {
          stage: 'cloudflare-challenge',
          runtime,
          reuseProfileHint,
        },
        guardedError,
      );
    }
    if (!socketClosed) {
      logger(`Failed to complete ChatGPT run: ${guardedError.message}`);
      if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && guardedError.stack) {
        logger(guardedError.stack);
      }
      throw guardedError;
    }
    if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && guardedError.stack) {
      logger(`Chrome window closed before completion: ${guardedError.message}`);
      logger(guardedError.stack);
    }
    await emitRuntimeHint();
    throw new BrowserAutomationError(
      'Chrome window closed before auracall finished. Please keep it open until completion.',
      {
        stage: 'connection-lost',
        runtime: {
          chromePid: chrome.pid,
          chromePort: chrome.port,
          chromeHost,
          userDataDir,
          chromeTargetId: lastTargetId,
          tabUrl: lastUrl,
          controllerPid: process.pid,
        },
      },
      guardedError,
    );
  } finally {
    try {
      try {
        if (!connectionClosedUnexpectedly) {
          await client?.close();
        }
      } catch {
        // ignore
      }
      removeDialogHandler?.();
      removeTerminationHooks?.();
      const keepBrowserOpen = effectiveKeepBrowser || preserveBrowserOnError;
      if (!keepBrowserOpen) {
        if (!connectionClosedUnexpectedly) {
          try {
            if (manualLogin) {
              await gracefulShutdownChrome(chrome, client ?? null, logger);
            } else {
              await chrome.kill();
            }
          } catch {
            // ignore kill failures
          }
        }
        if (manualLogin && !effectiveKeepBrowser) {
          const shouldCleanup = await shouldCleanupManualLoginProfileState(
            userDataDir,
            logger.verbose ? logger : undefined,
            {
              connectionClosedUnexpectedly,
              host: chromeHost,
            },
          );
          if (shouldCleanup) {
            // Preserve the persistent manual-login profile, but clear stale reattach hints.
            await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'never' }).catch(() => undefined);
          }
        } else {
          await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        }
        if (!connectionClosedUnexpectedly) {
          const totalSeconds = (Date.now() - startedAt) / 1000;
          logger(`Cleanup ${runStatus} • ${totalSeconds.toFixed(1)}s total`);
        }
      } else if (!connectionClosedUnexpectedly) {
        logger(`Chrome left running on port ${chrome.port} with profile ${userDataDir}`);
      }
    } finally {
      await browserOperation?.release();
    }
  }
}


async function waitForLogin({
  runtime,
  logger,
  appliedCookies,
  manualLogin,
  manualLoginWaitForSession,
  timeoutMs,
  authRecoveryCommand,
  managedProfileDir,
}: {
  runtime: ChromeClient['Runtime'];
  logger: BrowserLogger;
  appliedCookies: number;
  manualLogin: boolean;
  manualLoginWaitForSession: boolean;
  timeoutMs: number;
  authRecoveryCommand?: string | null;
  managedProfileDir?: string | null;
}): Promise<void> {
  if (!manualLogin) {
    await ensureLoggedIn(runtime, logger, { appliedCookies, authRecoveryCommand, managedProfileDir });
    return;
  }
  const deadline = Date.now() + Math.min(timeoutMs ?? 1_200_000, 20 * 60_000);
  let lastNotice = 0;
  while (Date.now() < deadline) {
    try {
      await ensureLoggedIn(runtime, logger, { appliedCookies, authRecoveryCommand, managedProfileDir });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const loginDetected = message?.toLowerCase().includes('login button');
      const sessionMissing = message?.toLowerCase().includes('session not detected');
      if (!loginDetected && !sessionMissing) {
        throw error;
      }
      if (!manualLoginWaitForSession) {
        throw error;
      }
      const now = Date.now();
      if (now - lastNotice > 5000) {
        logger(
          'Manual login mode: please sign into chatgpt.com in the opened Chrome window; waiting for session to appear...',
        );
        lastNotice = now;
      }
      await delay(1000);
    }
  }
  const authHint = authRecoveryCommand ? ` Open auth mode with: ${authRecoveryCommand}` : '';
  const profileHint = managedProfileDir ? ` Managed browser profile: ${managedProfileDir}.` : '';
  throw new BrowserAutomationError(
    `Manual login mode timed out waiting for ChatGPT session; please sign in and retry.${authHint}${profileHint}`,
    {
      stage: 'chatgpt-login-required',
      providerState: 'login-required',
      authRecoveryCommand: authRecoveryCommand ?? null,
      managedProfileDir: managedProfileDir ?? null,
    },
  );
}

function buildAuthModeCommand(config: ReturnType<typeof resolveBrowserConfig>): string {
  const target = config.target ?? 'chatgpt';
  const profileName = config.auracallProfileName?.trim();
  const profileArg = profileName ? ` --profile ${shellQuote(profileName)}` : '';
  return `auracall${profileArg} login --target ${shellQuote(target)}`;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

async function _assertNavigatedToHttp(
  runtime: ChromeClient['Runtime'],
  _logger: BrowserLogger,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastUrl = '';
  while (Date.now() < deadline) {
    const { result } = await runtime.evaluate({
      expression: 'typeof location === "object" && location.href ? location.href : ""',
      returnByValue: true,
    });
    const url = typeof result?.value === 'string' ? result.value : '';
    lastUrl = url;
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    await delay(250);
  }
  throw new BrowserAutomationError('ChatGPT session not detected; page never left new tab.', {
    stage: 'execute-browser',
    details: { url: lastUrl || '(empty)' },
  });
}

async function runRemoteBrowserMode(
  promptText: string,
  attachments: BrowserAttachment[],
  config: ReturnType<typeof resolveBrowserConfig>,
  logger: BrowserLogger,
  options: BrowserRunOptions,
): Promise<BrowserRunResult> {
  const remoteChromeConfig = config.remoteChrome;
  if (!remoteChromeConfig) {
    throw new Error('Remote Chrome configuration missing. Pass --remote-chrome <host:port> to use this mode.');
  }
  const { host, port } = remoteChromeConfig;
  await enforceChatgptBrowserRateLimitGuard(config, logger, config.manualLoginProfileDir ?? null);
  logger(`Connecting to remote Chrome at ${host}:${port}`);

  let client: ChromeClient | null = null;
  let remoteTargetId: string | null = null;
  let lastUrl: string | undefined;
  let connectedHost = host;
  let connectedPort = port;
  let disposeRemoteTransport: (() => Promise<void>) | null = null;
  const runtimeHintCb = options.runtimeHintCb;
  let selectedThinkingTime: ThinkingTimeLevel | null = null;
  let selectedChatgptProMode: ChatgptProMode | null = null;
  let selectedChatgptAccountLevel: string | null = null;
  let selectedChatgptAccountPlanType: string | null = null;
  let selectedChatgptAccountStructure: string | null = null;
  let chatgptDeepResearchStage: ChatgptDeepResearchStage | null = null;
  let chatgptDeepResearchPlanAction: 'start' | 'edit' | null = null;
  let chatgptDeepResearchStartMethod: 'manual' | 'auto' | null = null;
  let chatgptDeepResearchStartLabel: string | null = null;
  let chatgptDeepResearchModifyPlanLabel: string | null = null;
  let chatgptDeepResearchModifyPlanVisible: boolean | null = null;
  let chatgptDeepResearchReviewEvidence: Record<string, unknown> | null = null;
  const emitRuntimeHint = async () => {
    if (!runtimeHintCb) return;
    try {
      await runtimeHintCb({
        selectedAgentId: config.selectedAgentId ?? null,
        chromePort: connectedPort,
        chromeHost: connectedHost,
        chromeTargetId: remoteTargetId ?? undefined,
        tabUrl: lastUrl,
        controllerPid: process.pid,
        thinkingTime: selectedThinkingTime ?? undefined,
        chatgptProMode: selectedChatgptProMode ?? undefined,
        chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
        chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
        chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
        chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
        chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
        chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
        chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
        chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
        chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
        chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to persist runtime hint: ${message}`);
    }
  };
  const startedAt = Date.now();
  let answerText = '';
  let answerMarkdown = '';
  let answerHtml = '';
  let selectedComposerTool: string | null = null;
  let connectionClosedUnexpectedly = false;
  let stopThinkingMonitor: (() => void) | null = null;
  let removeDialogHandler: (() => void) | null = null;
  let runtimeForGuard: ChromeClient['Runtime'] | null = null;
  const passiveObservations: BrowserPassiveObservation[] = [];

  try {
    const connection = await connectToRemoteChrome(host, port, logger, config.url, {
      compatibleHosts: resolveCompatibleHostsForUrl(config.url),
      serviceTabLimit: config.serviceTabLimit ?? undefined,
      blankTabLimit: config.blankTabLimit ?? undefined,
      collapseDisposableWindows: config.collapseDisposableWindows,
    });
    client = connection.client;
    remoteTargetId = connection.targetId ?? null;
    connectedHost = connection.host;
    connectedPort = connection.port;
    disposeRemoteTransport = connection.dispose ?? null;
    await emitRuntimeHint();
    const markConnectionLost = () => {
      connectionClosedUnexpectedly = true;
    };
    client.on('disconnect', markConnectionLost);
    const { Network, Page, Runtime, Input, DOM } = client;
    runtimeForGuard = Runtime;

    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === 'function') {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);
    removeDialogHandler = installJavaScriptDialogAutoDismissal(Page, logger);

    // Skip cookie sync for remote Chrome - it already has cookies
    logger('Skipping cookie sync for remote Chrome (using existing session)');

    await navigateToChatGPT(Page, Runtime, config.url, logger);
    await ensureNotBlocked(Runtime, config.headless, logger);
    await ensureNoManualClearBlockingPage(Runtime, logger, { action: 'ChatGPT remote prompt preparation' });
    await ensureLoggedIn(Runtime, logger, { remoteSession: true });
    await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
    logger(`Prompt textarea ready (initial focus, ${promptText.length.toLocaleString()} chars queued)`);
    try {
      const { result } = await Runtime.evaluate({
        expression: 'location.href',
        returnByValue: true,
      });
      if (typeof result?.value === 'string') {
        lastUrl = result.value;
      }
      await emitRuntimeHint();
    } catch {
      // ignore
    }

    const modelStrategy = config.modelStrategy ?? DEFAULT_MODEL_STRATEGY;
    if (config.desiredModel && modelStrategy !== 'ignore') {
      await dismissOpenMenus(Runtime).catch(() => false);
      await withRetries(
        () => ensureModelSelection(Runtime, config.desiredModel as string, logger, modelStrategy),
        {
          retries: 2,
          delayMs: 300,
          onRetry: (attempt, error) => {
            if (options.verbose) {
              logger(`[retry] Model picker attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
            }
          },
        },
      );
      await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
      logger(`Prompt textarea ready (after model switch, ${promptText.length.toLocaleString()} chars queued)`);
    } else if (modelStrategy === 'ignore') {
      logger('Model picker: skipped (strategy=ignore)');
    }
    // Handle thinking time selection if specified
    const thinkingTime = config.thinkingTime;
    if (thinkingTime && shouldApplyThinkingTime(config.desiredModel)) {
      const proModeGate = await assertChatgptProModeAllowed(Runtime, thinkingTime, logger);
      await dismissOpenMenus(Runtime).catch(() => false);
      await withRetries(() => ensureThinkingTime(Runtime, thinkingTime, logger), {
        retries: 2,
        delayMs: 300,
        onRetry: (attempt, error) => {
          if (options.verbose) {
            logger(`[retry] Thinking time (${thinkingTime}) attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
          }
        },
      });
      selectedThinkingTime = thinkingTime;
      selectedChatgptProMode = proModeGate.proMode;
      selectedChatgptAccountLevel = proModeGate.accountLevel ?? null;
      selectedChatgptAccountPlanType = proModeGate.accountPlanType ?? null;
      selectedChatgptAccountStructure = proModeGate.accountStructure ?? null;
      await emitRuntimeHint();
    }
    if (config.composerTool) {
      await dismissOpenMenus(Runtime).catch(() => false);
      await withRetries(() => ensureChatgptComposerTool(Runtime, config.composerTool as string, logger), {
        retries: 2,
        delayMs: 300,
        onRetry: (attempt, error) => {
          if (options.verbose) {
            logger(
              `[retry] Composer tool (${config.composerTool}) attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });
      const composerSelection = await readCurrentChatgptComposerTool(Runtime);
      selectedComposerTool =
        composerSelection.label ?? (isChatgptDeepResearchTool(config.composerTool) ? config.composerTool : null);
      if (isChatgptDeepResearchTool(selectedComposerTool ?? config.composerTool)) {
        const identity = await readVerifiedChatgptAccountIdentity(Runtime, 'Deep Research');
        selectedChatgptAccountLevel = identity.accountLevel ?? null;
        selectedChatgptAccountPlanType = identity.accountPlanType ?? null;
        selectedChatgptAccountStructure = identity.accountStructure ?? null;
        chatgptDeepResearchStage = 'tool-selected';
        chatgptDeepResearchPlanAction = config.deepResearchPlanAction ?? 'start';
        await emitRuntimeHint();
      }
      await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
      logger(`Prompt textarea ready (after composer tool, ${promptText.length.toLocaleString()} chars queued)`);
    }

    const submitOnce = async (prompt: string, submissionAttachments: BrowserAttachment[]) => {
      const baselineSnapshot = await readAssistantSnapshot(Runtime).catch(() => null);
      const baselineAssistantText =
        typeof baselineSnapshot?.text === 'string' ? baselineSnapshot.text.trim() : '';
      const baselineAssistantMessageId =
        typeof baselineSnapshot?.messageId === 'string' ? baselineSnapshot.messageId.trim() : '';
      const baselineAssistantTurnId =
        typeof baselineSnapshot?.turnId === 'string' ? baselineSnapshot.turnId.trim() : '';
      const attachmentNames = submissionAttachments.map((a) => path.basename(a.path));
      if (submissionAttachments.length > 0) {
        if (!DOM) {
          throw new Error('Chrome DOM domain unavailable while uploading attachments.');
        }
        await clearComposerAttachments(Runtime, 5_000, logger);
        // Use remote file transfer for remote Chrome (reads local files and injects via CDP)
        for (const attachment of submissionAttachments) {
          logger(`Uploading attachment: ${attachment.displayPath}`);
          await uploadAttachmentViaDataTransfer({ runtime: Runtime, dom: DOM }, attachment, logger);
          await delay(500);
        }
        // Scale timeout based on number of files: base 30s + 15s per additional file
        const baseTimeout = config.inputTimeoutMs ?? 30_000;
        const perFileTimeout = 15_000;
        const waitBudget = Math.max(baseTimeout, 30_000) + (submissionAttachments.length - 1) * perFileTimeout;
        await waitForAttachmentCompletion(Runtime, waitBudget, attachmentNames, logger);
        logger('All attachments uploaded');
      }
      let baselineTurns = await readConversationTurnCount(Runtime, logger);
      const committedTurns = await submitPrompt(
        {
          runtime: Runtime,
          input: Input,
          attachmentNames,
          baselineTurns: baselineTurns ?? undefined,
          inputTimeoutMs: config.inputTimeoutMs ?? undefined,
        },
        prompt,
        logger,
      );
      if (typeof committedTurns === 'number' && Number.isFinite(committedTurns)) {
        if (baselineTurns === null || committedTurns > baselineTurns) {
          baselineTurns = Math.max(0, committedTurns - 1);
        }
      }
      return {
        baselineTurns,
        baselineAssistantText,
        baselineAssistantMessageId,
        baselineAssistantTurnId,
      };
    };

    let baselineTurns: number | null = null;
    let baselineAssistantText: string | null = null;
    let baselineAssistantMessageId: string | null = null;
    let baselineAssistantTurnId: string | null = null;
    try {
      const submission = await submitOnce(promptText, attachments);
      baselineTurns = submission.baselineTurns;
      baselineAssistantText = submission.baselineAssistantText;
      baselineAssistantMessageId = submission.baselineAssistantMessageId || null;
      baselineAssistantTurnId = submission.baselineAssistantTurnId || null;
    } catch (error) {
      const isPromptTooLarge =
        error instanceof BrowserAutomationError &&
        (error.details as { code?: string } | undefined)?.code === 'prompt-too-large';
      if (options.fallbackSubmission && isPromptTooLarge) {
        logger('[browser] Inline prompt too large; retrying with file uploads.');
        await clearPromptComposer(Runtime, logger);
        await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
        const submission = await submitOnce(options.fallbackSubmission.prompt, options.fallbackSubmission.attachments);
        baselineTurns = submission.baselineTurns;
        baselineAssistantText = submission.baselineAssistantText;
        baselineAssistantMessageId = submission.baselineAssistantMessageId || null;
        baselineAssistantTurnId = submission.baselineAssistantTurnId || null;
      } else {
        throw error;
      }
    }
    if (chatgptDeepResearchStage === 'tool-selected') {
      recordBrowserPassiveObservation(passiveObservations, {
        state: 'plan-ready',
        source: 'browser-service',
        evidenceRef: 'chatgpt-deep-research-plan',
        confidence: 'medium',
      });
      chatgptDeepResearchStage = 'plan-ready';
      await emitRuntimeHint();
      const deepResearchPlanTimeoutMs = Math.min(config.timeoutMs ?? 120_000, 120_000);
      const startResult = await startChatgptDeepResearchPlan(
        Runtime,
        logger,
        chatgptDeepResearchPlanAction ?? 'start',
        deepResearchPlanTimeoutMs,
        Input,
      );
      chatgptDeepResearchStage =
        startResult.stage === 'auto-started'
          ? 'auto-started'
          : startResult.stage === 'plan-edit-opened'
            ? 'plan-edit-opened'
            : 'research-started';
      chatgptDeepResearchStartMethod = startResult.startMethod;
      chatgptDeepResearchStartLabel = startResult.startLabel;
      chatgptDeepResearchModifyPlanLabel = startResult.modifyPlanLabel;
      chatgptDeepResearchModifyPlanVisible = startResult.modifyPlanVisible;
      chatgptDeepResearchReviewEvidence = await captureChatgptDeepResearchReviewEvidence({
        Page,
        stage: chatgptDeepResearchStage,
        planAction: chatgptDeepResearchPlanAction,
        tabUrl: lastUrl ?? null,
        modifyPlanLabel: chatgptDeepResearchModifyPlanLabel,
        modifyPlanVisible: chatgptDeepResearchModifyPlanVisible,
        editTargetKind: startResult.editTargetKind ?? null,
        editTargetX: startResult.editTargetX ?? null,
        editTargetY: startResult.editTargetY ?? null,
      });
      recordBrowserPassiveObservation(passiveObservations, {
        state: startResult.stage === 'plan-edit-opened' ? 'awaiting-human' : 'research-started',
        source: 'browser-service',
        evidenceRef: typeof chatgptDeepResearchReviewEvidence?.screenshotPath === 'string'
          ? chatgptDeepResearchReviewEvidence.screenshotPath
          : startResult.startLabel ?? startResult.modifyPlanLabel ?? 'chatgpt-deep-research-start',
        confidence: 'high',
      });
      await emitRuntimeHint();
    }
    if (
      chatgptDeepResearchStage === 'plan-edit-opened' ||
      (chatgptDeepResearchPlanAction === 'edit' && chatgptDeepResearchStage === 'auto-started')
    ) {
      const durationMs = Date.now() - startedAt;
      await noteChatgptBrowserMutationSuccess(config, config.manualLoginProfileDir ?? null).catch(() => undefined);
      return {
        answerText: '',
        answerMarkdown: '',
        tookMs: durationMs,
        answerTokens: 0,
        answerChars: 0,
        chromePid: undefined,
        chromePort: connectedPort,
        chromeHost: connectedHost,
        userDataDir: undefined,
        chromeTargetId: remoteTargetId ?? undefined,
        tabUrl: lastUrl,
        conversationId: lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined,
        composerTool: selectedComposerTool,
        thinkingTime: selectedThinkingTime ?? undefined,
        chatgptProMode: selectedChatgptProMode ?? undefined,
        chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
        chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
        chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
        chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
        chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
        chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
        chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
        chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
        chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
        chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
        passiveObservations,
        controllerPid: process.pid,
      };
    }
    stopThinkingMonitor = startThinkingStatusMonitor(
      Runtime,
      logger,
      options.verbose ?? false,
      (message) => {
        recordBrowserPassiveObservation(passiveObservations, {
          state: 'thinking',
          source: 'browser-service',
          evidenceRef: message,
          confidence: 'medium',
        });
      },
    );
    // Helper to normalize text for echo detection (collapse whitespace, lowercase)
    const normalizeForComparison = (text: string): string =>
      text.toLowerCase().replace(/\s+/g, ' ').trim();
    const readFreshAssistantCandidate = async (
      baselineNormalized: string,
      baselinePrefix: string,
    ): Promise<{ text: string; html?: string; meta: { turnId?: string | null; messageId?: string | null } } | null> => {
      const snapshots = await Promise.all([
        readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null),
        readAssistantSnapshot(Runtime).catch(() => null),
      ]);
      let best:
        | { text: string; html?: string; meta: { turnId?: string | null; messageId?: string | null } }
        | null = null;
      for (const snapshot of snapshots) {
        const text = typeof snapshot?.text === 'string' ? snapshot.text.trim() : '';
        if (!text) continue;
        const normalized = normalizeForComparison(text);
        const isBaseline =
          normalized === baselineNormalized || (baselinePrefix.length > 0 && normalized.startsWith(baselinePrefix));
        if (isBaseline) continue;
        const candidate = {
          text,
          html: snapshot?.html ?? undefined,
          meta: { turnId: snapshot?.turnId ?? undefined, messageId: snapshot?.messageId ?? undefined },
        };
        if (
          !best ||
          (!best.meta.messageId && Boolean(candidate.meta.messageId)) ||
          candidate.text.length > best.text.length
        ) {
          best = candidate;
        }
      }
      return best;
    };
    const waitForFreshAssistantResponse = async (baselineNormalized: string, timeoutMs: number) => {
      const baselinePrefix =
        baselineNormalized.length >= 80
          ? baselineNormalized.slice(0, Math.min(200, baselineNormalized.length))
          : '';
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const candidate = await readFreshAssistantCandidate(baselineNormalized, baselinePrefix);
        if (candidate) {
          return candidate;
        }
        await delay(350);
      }
      return null;
    };
    let answer = await waitForAssistantResponseWithReload(
      Runtime,
      Page,
      config.timeoutMs,
      logger,
      baselineTurns ?? undefined,
      {
        onResponseIncoming: () => {
          recordBrowserPassiveObservation(passiveObservations, {
            state: 'response-incoming',
            source: 'browser-service',
            evidenceRef: 'chatgpt-assistant-snapshot',
            confidence: 'high',
          });
        },
      },
    );
    const baselineNormalized = baselineAssistantText ? normalizeForComparison(baselineAssistantText) : '';
    if (baselineNormalized) {
      const isBaseline = shouldTreatChatgptAssistantResponseAsStale({
        baselineText: baselineAssistantText,
        baselineMessageId: baselineAssistantMessageId,
        baselineTurnId: baselineAssistantTurnId,
        answerText: answer.text,
        answerMessageId: answer.meta?.messageId ?? null,
        answerTurnId: answer.meta?.turnId ?? null,
      });
      if (isBaseline) {
        logger('Detected stale assistant response; waiting for new response...');
        const refreshed = await waitForFreshAssistantResponse(baselineNormalized, 15_000);
        if (refreshed) {
          answer = refreshed;
        } else {
          const visibleBlockingSurface = await detectVisibleChatgptBlockingSurface(Runtime).catch(() => null);
          if (visibleBlockingSurface) {
            await logChatgptUnexpectedState({
              Runtime,
              logger,
              context: 'chatgpt-stale-send-blocked',
              surface: visibleBlockingSurface,
              extra: {
                policy: visibleBlockingSurface.kind === 'retry-affordance' ? 'fail-fast-no-auto-retry-click' : 'fail-fast',
                baselineMessageId: baselineAssistantMessageId ?? null,
                baselineTurnId: baselineAssistantTurnId ?? null,
                answerMessageId: answer.meta?.messageId ?? null,
                answerTurnId: answer.meta?.turnId ?? null,
              },
            });
            throw new Error(formatChatgptBlockingSurfaceError(visibleBlockingSurface));
          }
          await logChatgptUnexpectedState({
            Runtime,
            logger,
            context: 'chatgpt-stale-send-without-visible-surface',
            extra: {
              baselineMessageId: baselineAssistantMessageId ?? null,
              baselineTurnId: baselineAssistantTurnId ?? null,
              answerMessageId: answer.meta?.messageId ?? null,
              answerTurnId: answer.meta?.turnId ?? null,
            },
          });
          throw new Error('Stale ChatGPT assistant response detected after send.');
        }
      }
    }
    answerText = answer.text;
    answerHtml = answer.html ?? '';

    const copiedMarkdown = await withRetries(
      async () => {
        const attempt = await captureAssistantMarkdown(Runtime, answer.meta, logger);
        if (!attempt) {
          throw new Error('copy-missing');
        }
        return attempt;
      },
      {
        retries: 2,
        delayMs: 350,
        onRetry: (attempt, error) => {
          if (options.verbose) {
            logger(
              `[retry] Markdown capture attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      },
    ).catch(() => null);

    answerMarkdown = copiedMarkdown ?? answerText;

    // Final sanity check: ensure we didn't accidentally capture the user prompt instead of the assistant turn.
    const finalSnapshot = await readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null);
    const finalText = typeof finalSnapshot?.text === 'string' ? finalSnapshot.text.trim() : '';
    if (
      finalText &&
      finalText !== answerMarkdown.trim() &&
      finalText !== promptText.trim() &&
      finalText.length >= answerMarkdown.trim().length
    ) {
      logger('Refreshed assistant response via final DOM snapshot');
      answerText = finalText;
      answerMarkdown = finalText;
    }

    // Detect prompt echo using normalized comparison (whitespace-insensitive).
    const promptEchoMatcher = buildPromptEchoMatcher(promptText);
    const alignedEcho = alignPromptEchoPair(
      answerText,
      answerMarkdown,
      promptEchoMatcher,
      copiedMarkdown ? logger : undefined,
      {
        text: 'Aligned assistant response text to copied markdown after prompt echo',
        markdown: 'Aligned assistant markdown to response text after prompt echo',
      },
    );
    answerText = alignedEcho.answerText;
    answerMarkdown = alignedEcho.answerMarkdown;
    const isPromptEcho = alignedEcho.isEcho;
    if (isPromptEcho) {
      logger('Detected prompt echo in response; waiting for actual assistant response...');
      const deadline = Date.now() + 15_000;
      let bestText: string | null = null;
      let stableCount = 0;
      while (Date.now() < deadline) {
        const snapshot = await readAssistantSnapshot(Runtime, baselineTurns ?? undefined).catch(() => null);
        const text = typeof snapshot?.text === 'string' ? snapshot.text.trim() : '';
        const isStillEcho = !text || Boolean(promptEchoMatcher?.isEcho(text));
        if (!isStillEcho) {
          if (!bestText || text.length > bestText.length) {
            bestText = text;
            stableCount = 0;
          } else if (text === bestText) {
            stableCount += 1;
          }
          if (stableCount >= 2) {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (bestText) {
        logger('Recovered assistant response after detecting prompt echo');
        answerText = bestText;
        answerMarkdown = bestText;
      }
    }
    stopThinkingMonitor?.();
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'response-complete',
      source: 'browser-service',
      evidenceRef: 'chatgpt-response-finished',
      confidence: 'high',
    });

    const durationMs = Date.now() - startedAt;
    const answerChars = answerText.length;
    const answerTokens = estimateTokenCount(answerMarkdown);
    await noteChatgptBrowserMutationSuccess(config, config.manualLoginProfileDir ?? null).catch(() => undefined);

    return {
      answerText,
      answerMarkdown,
      answerHtml: answerHtml.length > 0 ? answerHtml : undefined,
      tookMs: durationMs,
      answerTokens,
      answerChars,
      chromePid: undefined,
      chromePort: connectedPort,
      chromeHost: connectedHost,
      userDataDir: undefined,
      chromeTargetId: remoteTargetId ?? undefined,
      tabUrl: lastUrl,
      conversationId: lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined,
      composerTool: selectedComposerTool,
      thinkingTime: selectedThinkingTime ?? undefined,
      chatgptProMode: selectedChatgptProMode ?? undefined,
      chatgptAccountLevel: selectedChatgptAccountLevel ?? undefined,
      chatgptAccountPlanType: selectedChatgptAccountPlanType ?? undefined,
      chatgptAccountStructure: selectedChatgptAccountStructure ?? undefined,
      chatgptDeepResearchStage: chatgptDeepResearchStage ?? undefined,
      chatgptDeepResearchPlanAction: chatgptDeepResearchPlanAction ?? undefined,
      chatgptDeepResearchStartMethod: chatgptDeepResearchStartMethod ?? undefined,
      chatgptDeepResearchStartLabel: chatgptDeepResearchStartLabel ?? undefined,
      chatgptDeepResearchModifyPlanLabel: chatgptDeepResearchModifyPlanLabel ?? undefined,
      chatgptDeepResearchModifyPlanVisible: chatgptDeepResearchModifyPlanVisible ?? undefined,
      chatgptDeepResearchReviewEvidence: chatgptDeepResearchReviewEvidence ?? undefined,
      passiveObservations,
      controllerPid: process.pid,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const guardedError = await handleChatgptBrowserRateLimitFailure({
      config,
      logger,
      error: normalizedError,
      action: 'remoteBrowserRun',
      Runtime: runtimeForGuard,
      managedProfileDir: config.manualLoginProfileDir ?? null,
    });
    stopThinkingMonitor?.();
    const socketClosed = connectionClosedUnexpectedly || isWebSocketClosureError(guardedError);
    connectionClosedUnexpectedly = connectionClosedUnexpectedly || socketClosed;

    if (!socketClosed) {
      logger(`Failed to complete ChatGPT run: ${guardedError.message}`);
      if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && guardedError.stack) {
        logger(guardedError.stack);
      }
      throw guardedError;
    }

    throw new BrowserAutomationError('Remote Chrome connection lost before Aura-Call finished.', {
      stage: 'connection-lost',
      runtime: {
        chromeHost: connectedHost,
        chromePort: connectedPort,
        chromeTargetId: remoteTargetId ?? undefined,
        tabUrl: lastUrl,
        controllerPid: process.pid,
      },
    }, guardedError);
  } finally {
    try {
      if (!connectionClosedUnexpectedly && client) {
        await client.close();
      }
    } catch {
      // ignore
    }
    removeDialogHandler?.();
    await closeRemoteChromeTarget(connectedHost, connectedPort, remoteTargetId ?? undefined, logger);
    await disposeRemoteTransport?.().catch(() => undefined);
    // Don't kill remote Chrome - it's not ours to manage
    const totalSeconds = (Date.now() - startedAt) / 1000;
    logger(`Remote session complete • ${totalSeconds.toFixed(1)}s total`);
  }
}

async function runRemoteGrokBrowserMode(
  promptText: string,
  attachments: BrowserAttachment[],
  config: ReturnType<typeof resolveBrowserConfig>,
  logger: BrowserLogger,
  options: BrowserRunOptions,
): Promise<BrowserRunResult> {
  const passiveObservations: BrowserPassiveObservation[] = [];
  const remoteChromeConfig = config.remoteChrome;
  if (!remoteChromeConfig) {
    throw new Error('Remote Chrome configuration missing. Pass --remote-chrome <host:port> to use this mode.');
  }
  const { host, port } = remoteChromeConfig;
  logger(`Connecting to remote Chrome at ${host}:${port}`);

  let client: ChromeClient | null = null;
  let remoteTargetId: string | null = null;
  let lastUrl: string | undefined;
  let connectedHost = host;
  let connectedPort = port;
  let connectionClosedUnexpectedly = false;
  let disposeRemoteTransport: (() => Promise<void>) | null = null;
  const startedAt = Date.now();
  await enforceGrokBrowserRateLimitGuard(config, logger, config.manualLoginProfileDir ?? null);
  const runtimeHintCb = options.runtimeHintCb;
  const emitRuntimeHint = async () => {
    if (!runtimeHintCb) return;
    try {
      await runtimeHintCb({
        selectedAgentId: config.selectedAgentId ?? null,
        chromePort: connectedPort,
        chromeHost: connectedHost,
        chromeTargetId: remoteTargetId ?? undefined,
        tabUrl: lastUrl,
        controllerPid: process.pid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to persist runtime hint: ${message}`);
    }
  };

  try {
    let grokTargetUrl = config.grokUrl ?? config.url;
    if (config.projectId) {
      grokTargetUrl = config.conversationId
        ? resolveGrokConversationUrl(config.conversationId, config.projectId)
        : resolveGrokProjectUrl(config.projectId);
    }
    const connection = await connectToRemoteChrome(host, port, logger, grokTargetUrl, {
      compatibleHosts: resolveCompatibleHostsForUrl(grokTargetUrl),
      serviceTabLimit: config.serviceTabLimit ?? undefined,
      blankTabLimit: config.blankTabLimit ?? undefined,
      collapseDisposableWindows: config.collapseDisposableWindows,
    });
    client = connection.client;
    remoteTargetId = connection.targetId ?? null;
    connectedHost = connection.host;
    connectedPort = connection.port;
    disposeRemoteTransport = connection.dispose ?? null;
    await emitRuntimeHint();
    client.on('disconnect', () => {
      connectionClosedUnexpectedly = true;
    });

    const { Network, Page, Runtime, Input, DOM } = client;
    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === 'function') {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);
    installJavaScriptDialogAutoDismissal(Page, logger);

    logger('Skipping cookie sync for remote Chrome (using existing session)');
    await navigateToGrok(Page, Runtime, grokTargetUrl, logger);
    await ensureNotBlocked(Runtime, config.headless, logger);
    await ensureNoManualClearBlockingPage(Runtime, logger, { action: 'Grok remote prompt preparation' });
    await ensureGrokLoggedIn(Runtime, logger, { headless: config.headless, timeoutMs: config.timeoutMs });
    await ensureGrokPromptReady(Runtime, config.inputTimeoutMs, logger);
    logger(`Prompt textarea ready (initial focus, ${promptText.length.toLocaleString()} chars queued)`);

    try {
      const { result } = await Runtime.evaluate({
        expression: 'location.href',
        returnByValue: true,
      });
      if (typeof result?.value === 'string') {
        lastUrl = result.value;
      }
      await emitRuntimeHint();
    } catch {
      // ignore
    }

    const modelStrategy = config.modelStrategy ?? DEFAULT_MODEL_STRATEGY;
    if (config.desiredModel && modelStrategy !== 'ignore') {
      await selectGrokMode(Input, Runtime, config.desiredModel, logger);
      await ensureGrokPromptReady(Runtime, config.inputTimeoutMs, logger);
      logger(`Prompt textarea ready (after model switch, ${promptText.length.toLocaleString()} chars queued)`);
    } else if (modelStrategy === 'ignore') {
      logger('Model picker: skipped (strategy=ignore)');
    }

    if (attachments.length > 0) {
      if (!DOM) {
        throw new Error('Unable to upload attachments (DOM domain unavailable).');
      }
      await uploadGrokAttachments(DOM, Runtime, attachments, logger);
    }

    const grokAssistantBaseline = await readGrokAssistantSnapshotForRuntime(Runtime);
    await setGrokPrompt(Input, Runtime, promptText);
    await submitGrokPrompt(Input, Runtime);
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'thinking',
      source: 'browser-service',
      evidenceRef: 'grok-prompt-submitted',
      confidence: 'medium',
    });
    logger('Submitted prompt');
    await delay(500);

    const href = await Runtime.evaluate({ expression: 'location.href', returnByValue: true });
    const currentUrl = typeof href.result?.value === 'string' ? href.result.value : '';
    if (currentUrl) {
      lastUrl = currentUrl;
      await emitRuntimeHint();
    }

    const answer = await waitForGrokAssistantResult(Runtime, config.timeoutMs, logger, {
      baseline: grokAssistantBaseline,
      onResponseIncoming: () => {
        recordBrowserPassiveObservation(passiveObservations, {
          state: 'response-incoming',
          source: 'browser-service',
          evidenceRef: 'grok-assistant-visible',
          confidence: 'high',
        });
      },
    });
    await noteGrokBrowserMutationSuccess(config, config.manualLoginProfileDir ?? null).catch(() => undefined);
    const durationMs = Date.now() - startedAt;
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'response-complete',
      source: 'browser-service',
      evidenceRef: 'grok-response-finished',
      confidence: 'high',
    });

    return {
      answerText: answer.text,
      answerMarkdown: answer.markdown,
      answerHtml: answer.html,
      tookMs: durationMs,
      answerTokens: estimateTokenCount(answer.markdown),
      answerChars: answer.text.length,
      chromePid: undefined,
      chromePort: connectedPort,
      chromeHost: connectedHost,
      userDataDir: undefined,
      chromeTargetId: remoteTargetId ?? undefined,
      tabUrl: lastUrl,
      passiveObservations,
      controllerPid: process.pid,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const guardedError = await handleGrokBrowserRateLimitFailure({
      config,
      logger,
      error: normalizedError,
      action: 'browserRun',
      managedProfileDir: config.manualLoginProfileDir ?? null,
    });
    const socketClosed = connectionClosedUnexpectedly || isWebSocketClosureError(normalizedError);
    connectionClosedUnexpectedly = connectionClosedUnexpectedly || socketClosed;
    if (!socketClosed) {
      logger(`Failed to complete Grok run: ${guardedError.message}`);
      if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && guardedError.stack) {
        logger(guardedError.stack);
      }
      throw guardedError;
    }
    throw new BrowserAutomationError('Remote Chrome connection lost before Aura-Call finished.', {
      stage: 'connection-lost',
      runtime: {
        chromeHost: connectedHost,
        chromePort: connectedPort,
        chromeTargetId: remoteTargetId ?? undefined,
        tabUrl: lastUrl,
        controllerPid: process.pid,
      },
    });
  } finally {
    try {
      if (!connectionClosedUnexpectedly && client) {
        await client.close();
      }
    } catch {
      // ignore
    }
    await closeRemoteChromeTarget(connectedHost, connectedPort, remoteTargetId ?? undefined, logger);
    await disposeRemoteTransport?.().catch(() => undefined);
    const totalSeconds = (Date.now() - startedAt) / 1000;
    logger(`Remote session complete • ${totalSeconds.toFixed(1)}s total`);
  }
}

export { estimateTokenCount } from './utils.js';
export { resolveBrowserConfig, DEFAULT_BROWSER_CONFIG } from './config.js';
export { syncCookies } from './cookies.js';
export {
  navigateToChatGPT,
  ensureNotBlocked,
  ensurePromptReady,
  ensureModelSelection,
  submitPrompt,
  waitForAssistantResponse,
  captureAssistantMarkdown,
  uploadAttachmentFile,
  waitForAttachmentCompletion,
} from './pageActions.js';

const GROK_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS = 30_000;
const GROK_POST_COMMIT_QUIET_MS = 8_000;
const GROK_MUTATION_MIN_INTERVAL_MS = 12_000;

function isWebSocketClosureError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('websocket connection closed') ||
    message.includes('websocket is closed') ||
    message.includes('websocket error') ||
    message.includes('target closed')
  );
}

function shouldApplyThinkingTime(desiredModel: string | null | undefined): boolean {
  if (!desiredModel) return false;
  return /\b(thinking|pro)\b/i.test(desiredModel);
}

export function formatThinkingLog(startedAt: number, now: number, message: string, locatorSuffix: string): string {
  const elapsedMs = now - startedAt;
  const elapsedText = formatElapsed(elapsedMs);
  const progress = Math.min(1, elapsedMs / 600_000); // soft target: 10 minutes
  const pct = Math.round(progress * 100)
    .toString()
    .padStart(3, ' ');
  const statusLabel = message ? ` — ${message}` : '';
  return `${pct}% [${elapsedText} / ~10m]${statusLabel}${locatorSuffix}`;
}

async function waitForAssistantResponseWithReload(
  Runtime: ChromeClient['Runtime'],
  Page: ChromeClient['Page'],
  timeoutMs: number,
  logger: BrowserLogger,
  minTurnIndex?: number,
  options: { onResponseIncoming?: () => void } = {},
) {
  try {
    return await waitForAssistantResponse(Runtime, timeoutMs, logger, minTurnIndex, options);
  } catch (error) {
    if (!shouldReloadAfterAssistantError(error)) {
      throw error;
    }
    const conversationUrl = await readConversationUrl(Runtime);
    if (!conversationUrl || !isConversationUrl(conversationUrl)) {
      throw error;
    }
    logger('Assistant response stalled; reloading conversation and retrying once');
    const settled = await navigateAndSettle({ Page, Runtime }, {
      url: conversationUrl,
      timeoutMs: 45_000,
      mutationSource: 'legacy:chatgpt:assistant-response-retry-navigation',
    });
    if (!settled.ok) {
      throw error;
    }
    await delay(1000);
    return await waitForAssistantResponse(Runtime, timeoutMs, logger, minTurnIndex, options);
  }
}

function shouldReloadAfterAssistantError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('assistant-response') ||
    message.includes('watchdog') ||
    message.includes('timeout') ||
    message.includes('capture assistant response')
  );
}

async function readConversationUrl(Runtime: ChromeClient['Runtime']): Promise<string | null> {
  try {
    const currentUrl = await Runtime.evaluate({ expression: 'location.href', returnByValue: true });
    return typeof currentUrl.result?.value === 'string' ? currentUrl.result.value : null;
  } catch {
    return null;
  }
}

async function readConversationTurnCount(
  Runtime: ChromeClient['Runtime'],
  logger?: BrowserLogger,
): Promise<number | null> {
  const selectorLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { result } = await Runtime.evaluate({
        expression: `document.querySelectorAll(${selectorLiteral}).length`,
        returnByValue: true,
      });
      const raw = typeof result?.value === 'number' ? result.value : Number(result?.value);
      if (!Number.isFinite(raw)) {
        throw new Error('Turn count not numeric');
      }
      return Math.max(0, Math.floor(raw));
    } catch (error) {
      if (attempt < attempts - 1) {
        await delay(150);
        continue;
      }
      if (logger?.verbose) {
        logger(`Failed to read conversation turn count: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }
  return null;
}

function isConversationUrl(url: string): boolean {
  return /\/c\/[a-z0-9-]+/i.test(url);
}

function startThinkingStatusMonitor(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  includeDiagnostics = false,
  onThinkingStatus?: (message: string) => void,
): () => void {
  let stopped = false;
  let pending = false;
  let lastMessage: string | null = null;
  const startedAt = Date.now();
  const interval = setInterval(async () => {
    // stop flag flips asynchronously
    if (stopped || pending) {
      return;
    }
    pending = true;
    try {
      const nextMessage = await readThinkingStatus(Runtime);
      if (nextMessage && nextMessage !== lastMessage) {
        lastMessage = nextMessage;
        onThinkingStatus?.(nextMessage);
        let locatorSuffix = '';
        if (includeDiagnostics) {
          try {
            const snapshot = await readAssistantSnapshot(Runtime);
            locatorSuffix = ` | assistant-turn=${snapshot ? 'present' : 'missing'}`;
          } catch {
            locatorSuffix = ' | assistant-turn=error';
          }
        }
        logger(formatThinkingLog(startedAt, Date.now(), nextMessage, locatorSuffix));
      }
    } catch {
      // ignore DOM polling errors
    } finally {
      pending = false;
    }
  }, 1500);
  interval.unref?.();
  return () => {
    // multiple callers may race to stop
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(interval);
  };
}

function recordBrowserPassiveObservation(
  observations: BrowserPassiveObservation[],
  observation: Omit<BrowserPassiveObservation, 'observedAt'>,
): void {
  if (observations.some((entry) => entry.state === observation.state)) {
    return;
  }
  observations.push({
    ...observation,
    observedAt: new Date().toISOString(),
  });
}

async function runGrokBrowserMode({
  promptText,
  attachments,
  config,
  logger,
  runtimeHintCb,
  auracallProfileName,
}: {
  promptText: string;
  attachments: BrowserAttachment[];
  config: ReturnType<typeof resolveBrowserConfig>;
  logger: BrowserLogger;
  runtimeHintCb?: BrowserRunOptions['runtimeHintCb'];
  auracallProfileName?: string | null;
}): Promise<BrowserRunResult> {
  const passiveObservations: BrowserPassiveObservation[] = [];
  let chrome: LaunchedChrome | null = null;
  let chromeHost = '127.0.0.1';
  let lastUrl: string | undefined;
  let answerText = '';
  let answerMarkdown = '';
  let answerHtml = '';
  let runStatus: 'attempted' | 'complete' = 'attempted';
  let connectionClosedUnexpectedly = false;
  let removeTerminationHooks: (() => void) | null = null;
  let preserveBrowserOnError = false;
  const startedAt = Date.now();
  const launchConfig = config.headless
    ? { ...config, headless: false }
    : config;
  const headless = Boolean(launchConfig.headless);
  if (config.headless) {
    logger('Grok requires a visible browser; overriding headless=false.');
  }
  logger(
    `[browser] launch mode: headless=${headless} display=${launchConfig.display ?? '(unset)'} chromePath=${launchConfig.chromePath ?? '(default)'}`,
  );
  const emitRuntimeHint = async (): Promise<void> => {
    if (!runtimeHintCb || !chrome?.port) {
      return;
    }
    const conversationId = lastUrl ? extractConversationIdFromUrl(lastUrl) : undefined;
    const hint = {
      selectedAgentId: config.selectedAgentId ?? null,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      chromeHost,
      chromeTargetId: undefined,
      tabUrl: lastUrl,
      conversationId,
      userDataDir,
      controllerPid: process.pid,
    };
    try {
      await runtimeHintCb(hint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to persist runtime hint: ${message}`);
    }
  };
  const manualLogin = true;
  const runtimeTarget = (config.target ?? 'grok') as 'grok';
  const {
    userDataDir,
    chromeProfile,
    bootstrapCookiePath,
    allowDestructiveProfileRetryReset,
  } = await prepareManagedBrowserProfileLaunch({
    config,
    target: runtimeTarget,
    logger,
    auracallProfileName,
  });
  const browserOperation = await acquireBrowserExecutionOperation({
    managedProfileDir: userDataDir,
    target: runtimeTarget,
    logger,
  });
  await enforceGrokBrowserRateLimitGuard(config, logger, userDataDir);
  const onWindowsRetry = createWindowsManagedProfileRetryReset({
    config: launchConfig,
    userDataDir,
    bootstrapCookiePath,
    logger,
    allowDestructiveReset: allowDestructiveProfileRetryReset,
  });

  const effectiveKeepBrowser = Boolean(launchConfig.keepBrowser);
  const ownedChromePids = new Set<number>();
  const ownedChromePorts = new Set<number>();
  const rememberOwnedChrome = (candidate: LaunchedChrome | null | undefined): void => {
    if (typeof candidate?.pid === 'number' && Number.isFinite(candidate.pid) && candidate.pid > 0) {
      ownedChromePids.add(candidate.pid);
    }
    if (typeof candidate?.port === 'number' && Number.isFinite(candidate.port) && candidate.port > 0) {
      ownedChromePorts.add(candidate.port);
    }
  };
  const reusedChrome = await reuseRunningChromeProfile(userDataDir, logger);
  let effectiveConfig = launchConfig;
  chrome =
    reusedChrome ??
    (await launchChrome(
      {
        ...effectiveConfig,
        remoteChrome: effectiveConfig.remoteChrome,
      },
      userDataDir,
      logger,
      { onWindowsRetry, ownedPids: ownedChromePids, ownedPorts: ownedChromePorts },
    ));
  if (!reusedChrome) {
    rememberOwnedChrome(chrome);
  }
  chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
  if (manualLogin && chrome.port) {
    await writeDevToolsActivePort(userDataDir, chrome.port);
    if (!reusedChrome && chrome.pid) {
      await writeChromePid(userDataDir, chrome.pid);
    }
  }
  const ensureDevToolsReady = async (): Promise<void> => {
    if (!chrome?.port) {
      throw new Error('Chrome DevTools port unavailable after launch.');
    }
    const probe = await isDevToolsResponsive({ port: chrome.port, host: chromeHost, attempts: 8, timeoutMs: 2500 });
    if (probe) {
      return;
    }
    const useAutoDebugPort = effectiveConfig.debugPortStrategy === 'auto';
    const fallbackRange = effectiveConfig.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE;
    const fallbackPort = useAutoDebugPort
      ? null
      : await pickAvailableDebugPort(DEFAULT_DEBUG_PORT, logger, fallbackRange);
    logger(
      useAutoDebugPort
        ? `DevTools port ${chrome.port} unreachable; relaunching Chrome with a fresh auto-assigned Windows DevTools port.`
        : `DevTools port ${chrome.port} unreachable; relaunching Chrome on ${fallbackPort}.`,
    );
    try {
      await chrome.kill();
    } catch {
      // ignore cleanup errors
    }
    if (manualLogin) {
      await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
    }
    effectiveConfig = { ...effectiveConfig, debugPort: fallbackPort };
    chrome = await launchChrome(
      {
        ...effectiveConfig,
        remoteChrome: effectiveConfig.remoteChrome,
      },
      userDataDir,
      logger,
      { onWindowsRetry, ownedPids: ownedChromePids, ownedPorts: ownedChromePorts },
    );
    rememberOwnedChrome(chrome);
    chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
    if (manualLogin && chrome.port) {
      await writeDevToolsActivePort(userDataDir, chrome.port);
      if (chrome.pid) {
        await writeChromePid(userDataDir, chrome.pid);
      }
    }
    const retryProbe = await isDevToolsResponsive({ port: chrome.port, host: chromeHost, attempts: 8, timeoutMs: 2500 });
    if (!retryProbe) {
      throw new Error(`DevTools port ${chrome.port} unreachable.`);
    }
  };
  await ensureDevToolsReady();

  try {
    removeTerminationHooks = registerTerminationHooks(chrome, userDataDir, effectiveKeepBrowser, logger, {
      isInFlight: () => runStatus !== 'complete',
      emitRuntimeHint,
      preserveUserDataDir: manualLogin,
    });
  } catch {
    // ignore
  }

  let client: Awaited<ReturnType<typeof connectToChrome>> | null = null;
  try {
    try {
      client = await connectToChrome(chrome.port, logger, chromeHost);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reachable = await isDevToolsResponsive({ port: chrome.port, host: chromeHost, attempts: 4, timeoutMs: 2000 });
      if (reachable) {
        client = await connectToChrome(chrome.port, logger, chromeHost);
      } else if (manualLogin) {
        logger(`DevTools connection failed (${message}); clearing stale profile state and relaunching Chrome.`);
        await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
        try {
          await chrome.kill();
        } catch {
          // ignore cleanup errors
        }
        chrome = await launchChrome(
          {
            ...config,
            remoteChrome: config.remoteChrome,
          },
          userDataDir,
          logger,
          { ownedPids: ownedChromePids, ownedPorts: ownedChromePorts },
        );
        rememberOwnedChrome(chrome);
        chromeHost = (chrome as unknown as { host?: string }).host ?? '127.0.0.1';
        if (chrome.port) {
          await writeDevToolsActivePort(userDataDir, chrome.port);
          if (chrome.pid) {
            await writeChromePid(userDataDir, chrome.pid);
          }
        }
        client = await connectToChrome(chrome.port, logger, chromeHost);
      } else {
        throw error;
      }
    }
    const disconnectPromise = new Promise<never>((_, reject) => {
      client?.on('disconnect', () => {
        connectionClosedUnexpectedly = true;
        logger('Chrome window closed; attempting to abort run.');
        reject(new Error('Chrome window closed before auracall finished. Please keep it open until completion.'));
      });
    });
    const raceWithDisconnect = <T>(promise: Promise<T>): Promise<T> =>
      Promise.race([promise, disconnectPromise]);

    const { Network, Page, Runtime, Input, DOM } = client;
    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === 'function') {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);
    installJavaScriptDialogAutoDismissal(Page, logger);

    const existingManagedCookieFile = findBrowserCookieFile(userDataDir, chromeProfile);
    const shouldSeedManagedProfile =
      config.cookieSync &&
      !config.inlineCookies &&
      Boolean(bootstrapCookiePath) &&
      (Boolean(config.manualLoginCookieSync) || !existingManagedCookieFile);
    if (shouldSeedManagedProfile) {
      logger(`Bootstrapping managed Grok profile from source cookies at ${bootstrapCookiePath}.`);
      await syncCookies(Network, config.url, chromeProfile, logger, {
        cookiePath: bootstrapCookiePath ?? undefined,
        waitMs: 500,
        allowErrors: config.allowCookieErrors ?? false,
      });
    } else if (existingManagedCookieFile) {
      logger(`Reusing managed browser profile cookies from ${existingManagedCookieFile}.`);
    } else {
      logger(`No managed-profile cookies found at ${userDataDir}; Grok may require sign-in.`);
    }

    if (!headless && launchConfig.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
      await hideChromeWindow(chrome, logger);
    }

    let grokTargetUrl = config.grokUrl ?? config.url;
    if (config.projectId) {
      grokTargetUrl = config.conversationId
        ? resolveGrokConversationUrl(config.conversationId, config.projectId)
        : resolveGrokProjectUrl(config.projectId);
    }
    await raceWithDisconnect(navigateToGrok(Page, Runtime, grokTargetUrl, logger));
    await raceWithDisconnect(ensureNotBlocked(Runtime, headless, logger));
    await raceWithDisconnect(
      ensureNoManualClearBlockingPage(Runtime, logger, { action: 'Grok login/prompt preparation' }),
    );
    const projectLookup = await Runtime.evaluate({
      expression: `(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        const hasMissingProject = text.includes('issue finding id') || text.includes('link does not exist');
        const homeLink = Array.from(document.querySelectorAll('a,button')).find((el) =>
          (el.textContent || '').toLowerCase().includes('return home'),
        );
        return { hasMissingProject, canGoHome: Boolean(homeLink) };
      })()`,
      returnByValue: true,
    });
    if (projectLookup.result?.value?.hasMissingProject && projectLookup.result?.value?.canGoHome) {
      logger('Grok project link not found; returning home to refresh session and retrying.');
      await Runtime.evaluate({
        expression: `(() => {
          const homeLink = Array.from(document.querySelectorAll('a,button')).find((el) =>
            (el.textContent || '').toLowerCase().includes('return home'),
          );
          if (!homeLink) return false;
          homeLink.click();
          return true;
        })()`,
        returnByValue: true,
      });
      await raceWithDisconnect(navigateToGrok(Page, Runtime, grokTargetUrl, logger));
      await raceWithDisconnect(ensureNotBlocked(Runtime, headless, logger));
      await raceWithDisconnect(
        ensureNoManualClearBlockingPage(Runtime, logger, { action: 'Grok project/conversation navigation' }),
      );
    }
    await raceWithDisconnect(ensureGrokLoggedIn(Runtime, logger, { headless, timeoutMs: config.timeoutMs }));
    await raceWithDisconnect(ensureGrokPromptReady(Runtime, config.inputTimeoutMs, logger));

    if (config.desiredModel && config.modelStrategy !== 'ignore') {
      await raceWithDisconnect(selectGrokMode(Input, Runtime, config.desiredModel, logger));
    }

    if (attachments.length > 0) {
      if (!DOM) {
        throw new Error('Unable to upload attachments (DOM domain unavailable).');
      }
      await raceWithDisconnect(uploadGrokAttachments(DOM, Runtime, attachments, logger));
    }

    const grokAssistantBaseline = await raceWithDisconnect(readGrokAssistantSnapshotForRuntime(Runtime));
    await raceWithDisconnect(setGrokPrompt(Input, Runtime, promptText));
    await raceWithDisconnect(submitGrokPrompt(Input, Runtime));
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'thinking',
      source: 'browser-service',
      evidenceRef: 'grok-prompt-submitted',
      confidence: 'medium',
    });
    await delay(500);
    const href = await Runtime.evaluate({ expression: 'location.href', returnByValue: true });
    const currentUrl = typeof href.result?.value === 'string' ? href.result.value : '';
    if (currentUrl) {
      lastUrl = currentUrl;
      await emitRuntimeHint();
    }

    const answer = await raceWithDisconnect(
      waitForGrokAssistantResult(Runtime, config.timeoutMs, logger, {
        baseline: grokAssistantBaseline,
        onResponseIncoming: () => {
          recordBrowserPassiveObservation(passiveObservations, {
            state: 'response-incoming',
            source: 'browser-service',
            evidenceRef: 'grok-assistant-visible',
            confidence: 'high',
          });
        },
      }),
    );
    await noteGrokBrowserMutationSuccess(config, userDataDir).catch(() => undefined);
    answerText = answer.text;
    answerMarkdown = answer.markdown;
    answerHtml = answer.html ?? '';
    if (connectionClosedUnexpectedly) {
      throw new Error('Chrome disconnected before completion');
    }
    runStatus = 'complete';
    const durationMs = Date.now() - startedAt;
    const answerTokens = estimateTokenCount(answerMarkdown);
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'response-complete',
      source: 'browser-service',
      evidenceRef: 'grok-response-finished',
      confidence: 'high',
    });
    return {
      answerText,
      answerMarkdown,
      answerHtml: answerHtml.length > 0 ? answerHtml : undefined,
      tookMs: durationMs,
      answerTokens,
      answerChars: answerText.length,
      chromePid: chrome.pid ?? undefined,
      chromePort: chrome.port,
      chromeHost,
      userDataDir,
      chromeTargetId: undefined,
      tabUrl: currentUrl,
      conversationId: extractConversationIdFromUrl(currentUrl),
      passiveObservations,
      controllerPid: chrome.process?.pid,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const guardedError = await handleGrokBrowserRateLimitFailure({
      config,
      logger,
      error: normalizedError,
      action: 'browserRun',
      managedProfileDir: userDataDir,
    });
    if (shouldPreserveBrowserOnError(error, headless)) {
      preserveBrowserOnError = true;
      const runtime = {
        chromePid: chrome?.pid,
        chromePort: chrome?.port,
        chromeHost,
        userDataDir,
        chromeTargetId: undefined,
        tabUrl: undefined,
        controllerPid: process.pid,
      };
      const reuseProfileHint =
        `auracall --engine browser --browser-manual-login ` +
        `--browser-manual-login-profile-dir ${JSON.stringify(userDataDir)}`;
      await emitRuntimeHint().catch(() => undefined);
      logger('Cloudflare challenge detected; leaving browser open so you can complete the check.');
      logger(`Reuse this managed browser profile with: ${reuseProfileHint}`);
      throw new BrowserAutomationError(
        'Cloudflare challenge detected. Complete the “Just a moment…” check in the open browser, then rerun.',
        {
          stage: 'cloudflare-challenge',
          runtime,
          reuseProfileHint,
        },
        error,
      );
    }
    if (guardedError instanceof BrowserAutomationError) {
      throw guardedError;
    }
    const message = guardedError.message || 'Grok browser automation failed.';
    throw new BrowserAutomationError(message, { stage: 'execute-browser' }, guardedError);
  } finally {
    try {
      const keepBrowserOpen = effectiveKeepBrowser || preserveBrowserOnError;
      if (!keepBrowserOpen && chrome) {
        try {
          if (manualLogin) {
            await gracefulShutdownChrome(chrome, client ?? null, logger);
          } else {
            await chrome.kill();
          }
        } catch {
          // ignore
        }
      }
      if (manualLogin) {
        if (!keepBrowserOpen) {
          const shouldCleanup = await shouldCleanupManualLoginProfileState(userDataDir, logger, {
            connectionClosedUnexpectedly,
          });
          if (shouldCleanup) {
            await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
          }
        }
      } else {
        if (!keepBrowserOpen) {
          await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      removeTerminationHooks?.();
      try {
        await client?.close?.();
      } catch {
        // ignore
      }
      if (keepBrowserOpen && !connectionClosedUnexpectedly && chrome) {
        logger(`Chrome left running on port ${chrome.port} with profile ${userDataDir}`);
      }
    } finally {
      await browserOperation?.release();
    }
  }
}

async function readThinkingStatus(Runtime: ChromeClient['Runtime']): Promise<string | null> {
  const expression = buildChatgptThinkingStatusExpression();
  try {
    const { result } = await Runtime.evaluate({ expression, returnByValue: true });
    const value = typeof result.value === 'string' ? result.value.trim() : '';
    const sanitized = sanitizeChatgptThinkingText(value);
    return sanitized || null;
  } catch {
    return null;
  }
}

async function gracefulShutdownChrome(
  chrome: LaunchedChrome,
  client: Awaited<ReturnType<typeof connectToChrome>> | null,
  logger: BrowserLogger,
): Promise<void> {
  let requested = false;
  if (client?.Browser?.close) {
    try {
      await client.Browser.close();
      requested = true;
      logger('Requested Chrome shutdown via DevTools.');
    } catch {
      // ignore and fall back
    }
  }
  if (!requested && chrome.process?.pid) {
    try {
      chrome.process.kill('SIGTERM');
      requested = true;
      logger(`Requested Chrome shutdown via SIGTERM (pid ${chrome.process.pid}).`);
    } catch {
      // ignore
    }
  }
  if (requested && chrome.process?.pid) {
    const pid = chrome.process.pid;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!isProcessAlive(pid)) {
        return;
      }
      await delay(100);
    }
  }
  await chrome.kill();
}

function extractConversationIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const chatId = parsed.searchParams.get('chat');
    if (chatId) {
      return chatId;
    }
  } catch {
    // ignore parse errors
  }
  const match = url.match(/\/c\/([a-zA-Z0-9-]+)/);
  return match?.[1];
}

export function sanitizeThinkingTextForTest(raw: string): string {
  return sanitizeChatgptThinkingText(raw);
}

export function buildThinkingStatusExpressionForTest(): string {
  return buildChatgptThinkingStatusExpression();
}
