import type { ResolvedUserConfig } from '../config.js';
import type { ChromeClient } from './types.js';
import { BrowserService } from './service/browserService.js';
import { connectToChromeTarget } from '../../packages/browser-service/src/chromeLifecycle.js';
import { readAssistantSnapshot } from './actions/assistantResponse.js';
import { readGrokAssistantSnapshotForRuntime } from './actions/grok.js';
import {
  createLlmHardStopObservation,
  createLlmServiceStateObservation,
  createLlmUnknownObservation,
  resolveVisibleAnswerServiceState,
} from './llmServiceState.js';
import {
  buildGeminiActivityEvidenceExpression,
  coerceGeminiActivityEvidence,
  type GeminiActivityEvidence,
} from './providers/geminiEvidence.js';
import type { RuntimeRunInspectionServiceStateProbeResult } from '../runtime/inspection.js';

const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const GEMINI_APP_URL = 'https://gemini.google.com/app';
const GROK_HOME_URL = 'https://grok.com/';
const GEMINI_PROMPT_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]';
const GEMINI_SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const GEMINI_HISTORY_SELECTOR = '[data-test-id="chat-history-container"]';

type ChatgptServiceStateProbeDeps = {
  createBrowserService?: (userConfig: ResolvedUserConfig) => BrowserService;
  connectToTarget?: typeof connectToChromeTarget;
};

type GeminiServiceStateProbeDeps = {
  createBrowserService?: (userConfig: ResolvedUserConfig) => BrowserService;
  connectToTarget?: typeof connectToChromeTarget;
};

type GrokServiceStateProbeDeps = {
  createBrowserService?: (userConfig: ResolvedUserConfig) => BrowserService;
  connectToTarget?: typeof connectToChromeTarget;
};

export async function probeChatgptBrowserServiceState(
  userConfig: ResolvedUserConfig,
  deps: ChatgptServiceStateProbeDeps = {},
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const browserService = deps.createBrowserService?.(userConfig) ?? BrowserService.fromConfig(userConfig, 'chatgpt');
  const target = await browserService.resolveServiceTarget({
    serviceId: 'chatgpt',
    configuredUrl: userConfig.services?.chatgpt?.url ?? CHATGPT_HOME_URL,
    ensurePort: true,
  });
  const port = target.port;
  const host = target.host ?? '127.0.0.1';
  const targetId = resolveTargetId(target.tab);
  if (!port || !targetId) {
    return null;
  }

  const client = await (deps.connectToTarget ?? connectToChromeTarget)({
    host,
    port,
    target: targetId,
  });
  try {
    const { Runtime } = client;
    await Runtime.enable();
    const hardStop = await readChatgptHardStopState(Runtime);
    if (hardStop) {
      return hardStop;
    }
    const thinkingText = await readChatgptThinkingStatus(Runtime);
    if (thinkingText) {
      return createLlmServiceStateObservation({
        service: 'chatgpt',
        state: 'thinking',
        evidenceRef: thinkingText === 'Thinking' ? 'chatgpt-placeholder-turn' : 'chatgpt-thinking-status',
        confidence: 'high',
      });
    }
    const snapshot = await readAssistantSnapshot(Runtime);
    if (!snapshot?.text?.trim()) {
      return createLlmUnknownObservation({
        service: 'chatgpt',
        evidenceRef: 'chatgpt-live-probe-no-signal',
      });
    }
    const stopVisible = await isChatgptStopButtonVisible(Runtime);
    return resolveVisibleAnswerServiceState({
      service: 'chatgpt',
      isComplete: !stopVisible,
      incomingEvidenceRef: 'chatgpt-streaming-visible',
      completeEvidenceRef: 'chatgpt-response-finished',
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function probeGeminiBrowserServiceState(
  userConfig: ResolvedUserConfig,
  options: { prompt?: string | null } = {},
  deps: GeminiServiceStateProbeDeps = {},
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const browserService = deps.createBrowserService?.(userConfig) ?? BrowserService.fromConfig(userConfig, 'gemini');
  const target = await browserService.resolveServiceTarget({
    serviceId: 'gemini',
    configuredUrl: userConfig.services?.gemini?.url ?? GEMINI_APP_URL,
    ensurePort: true,
  });
  const port = target.port;
  const host = target.host ?? '127.0.0.1';
  const targetId = resolveTargetId(target.tab);
  if (!port || !targetId) {
    return null;
  }

  const client = await (deps.connectToTarget ?? connectToChromeTarget)({
    host,
    port,
    target: targetId,
  });
  try {
    const { Runtime } = client;
    await Runtime.enable();
    const hardStop = await readGeminiHardStopState(Runtime);
    if (hardStop) {
      return hardStop;
    }
    const geminiState = await readGeminiProbeState(Runtime);
    const normalizedPrompt = normalizeGeminiWhitespace(options.prompt ?? '');
    const answer = normalizedPrompt
      ? extractGeminiAnswerText({
          currentText: geminiState.historyText,
          prompt: normalizedPrompt,
        })
      : '';

    if (answer.length > 0) {
      const likelyComplete =
        geminiState.sendReady &&
        geminiState.promptText.length === 0 &&
        !geminiState.hasPendingBlob &&
        !geminiState.hasRemoveButton &&
        !geminiState.isGenerating;
      return resolveVisibleAnswerServiceState({
        service: 'gemini',
        isComplete: likelyComplete,
        incomingEvidenceRef: geminiState.hasActiveAvatarSpinner
          ? 'gemini-active-avatar-spinner'
          : 'gemini-native-answer-visible',
        completeEvidenceRef: 'gemini-native-response-finished',
      });
    }

    if (geminiState.hasActiveAvatarSpinner || (geminiState.hasStopControl && !geminiState.hasGeneratedMedia)) {
      return createLlmServiceStateObservation({
        service: 'gemini',
        state: 'thinking',
        evidenceRef: geminiState.hasActiveAvatarSpinner
          ? 'gemini-active-avatar-spinner'
          : 'gemini-stop-control-without-media',
        confidence: geminiState.hasActiveAvatarSpinner ? 'high' : 'medium',
      });
    }

    if (normalizedPrompt && isGeminiPromptCommitted({ historyText: geminiState.historyText, prompt: normalizedPrompt })) {
      return createLlmServiceStateObservation({
        service: 'gemini',
        state: 'thinking',
        evidenceRef: 'gemini-native-prompt-committed',
        confidence: 'medium',
      });
    }

    return createLlmUnknownObservation({
      service: 'gemini',
      evidenceRef: 'gemini-live-probe-no-signal',
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function probeGrokBrowserServiceState(
  userConfig: ResolvedUserConfig,
  deps: GrokServiceStateProbeDeps = {},
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const browserService = deps.createBrowserService?.(userConfig) ?? BrowserService.fromConfig(userConfig, 'grok');
  const target = await browserService.resolveServiceTarget({
    serviceId: 'grok',
    configuredUrl: userConfig.services?.grok?.url ?? GROK_HOME_URL,
    ensurePort: true,
  });
  const port = target.port;
  const host = target.host ?? '127.0.0.1';
  const targetId = resolveTargetId(target.tab);
  if (!port || !targetId) {
    return null;
  }

  const client = await (deps.connectToTarget ?? connectToChromeTarget)({
    host,
    port,
    target: targetId,
  });
  try {
    const { Runtime } = client;
    await Runtime.enable();
    const hardStop = await readGrokHardStopState(Runtime);
    if (hardStop) {
      return hardStop;
    }
    const snapshot = await readGrokAssistantSnapshotForRuntime(Runtime);
    if (snapshot.toastText && isGrokRateLimitToastText(snapshot.toastText)) {
      return createLlmServiceStateObservation({
        service: 'grok',
        state: 'provider-error',
        evidenceRef: 'grok-rate-limit-toast',
        confidence: 'high',
      });
    }
    if ((snapshot.lastMarkdown || snapshot.lastText).trim().length > 0) {
      return createLlmServiceStateObservation({
        service: 'grok',
        state: 'response-incoming',
        evidenceRef: 'grok-assistant-visible',
        confidence: 'high',
      });
    }
    return createLlmUnknownObservation({
      service: 'grok',
      evidenceRef: 'grok-live-probe-no-signal',
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function readChatgptHardStopState(
  Runtime: ChromeClient['Runtime'],
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const text = normalize(document.body?.innerText || '');
      const path = normalize(location.pathname || '');
      const title = normalize(document.title || '');
      const hasCaptcha =
        text.includes('captcha') ||
        text.includes('verify you are human') ||
        text.includes('human verification') ||
        text.includes('cf-challenge');
      const loginRequired =
        path.includes('/auth') ||
        text.includes('log in') ||
        text.includes('sign up') ||
        title.includes('log in');
      return { hasCaptcha, loginRequired };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { hasCaptcha?: boolean; loginRequired?: boolean } | undefined;
  if (value?.hasCaptcha) {
    return createLlmHardStopObservation({
      service: 'chatgpt',
      state: 'captcha-or-human-verification',
      evidenceRef: 'chatgpt-human-verification-page',
    });
  }
  if (value?.loginRequired) {
    return createLlmHardStopObservation({
      service: 'chatgpt',
      state: 'login-required',
      evidenceRef: 'chatgpt-login-surface',
    });
  }
  return null;
}

async function readGeminiHardStopState(
  Runtime: ChromeClient['Runtime'],
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const href = normalize(location.href || '');
      const host = normalize(location.hostname || '');
      const text = normalize(document.body?.innerText || '');
      const title = normalize(document.title || '');
      const visibleAction = Array.from(document.querySelectorAll('a,button,[role="button"]')).some((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const label = normalize(\`\${el.getAttribute('aria-label') || ''} \${el.textContent || ''}\`);
        return /(^|\\b)(sign in|log in|login)(\\b|$)/.test(label);
      });
      return {
        blocked:
          href.includes('google.com/sorry') ||
          text.includes('unusual traffic') ||
          text.includes('captcha') ||
          text.includes('verify you are human') ||
          text.includes('human verification'),
        loginRequired:
          host === 'accounts.google.com' ||
          title.includes('sign in') ||
          (host === 'gemini.google.com' && visibleAction),
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { blocked?: boolean; loginRequired?: boolean } | undefined;
  if (value?.blocked) {
    return createLlmHardStopObservation({
      service: 'gemini',
      state: 'captcha-or-human-verification',
      evidenceRef: 'gemini-human-verification-page',
    });
  }
  if (value?.loginRequired) {
    return createLlmHardStopObservation({
      service: 'gemini',
      state: 'login-required',
      evidenceRef: 'gemini-login-surface',
    });
  }
  return null;
}

async function readGrokHardStopState(
  Runtime: ChromeClient['Runtime'],
): Promise<RuntimeRunInspectionServiceStateProbeResult | null> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const href = normalize(location.href || '');
      const text = normalize(document.body?.innerText || '');
      const title = normalize(document.title || '');
      const visibleAuthAction = Array.from(document.querySelectorAll('a,button,[role="button"]')).some((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const label = normalize(\`\${el.getAttribute('aria-label') || ''} \${el.textContent || ''}\`);
        return /(^|\\b)(sign in|log in|login|create account|sign up)(\\b|$)/.test(label);
      });
      return {
        blocked:
          text.includes('captcha') ||
          text.includes('verify you are human') ||
          text.includes('human verification'),
        loginRequired:
          href.includes('accounts.x.ai/sign-in') ||
          title.includes('sign in') ||
          visibleAuthAction,
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { blocked?: boolean; loginRequired?: boolean } | undefined;
  if (value?.blocked) {
    return createLlmHardStopObservation({
      service: 'grok',
      state: 'captcha-or-human-verification',
      evidenceRef: 'grok-human-verification-page',
    });
  }
  if (value?.loginRequired) {
    return createLlmHardStopObservation({
      service: 'grok',
      state: 'login-required',
      evidenceRef: 'grok-login-surface',
    });
  }
  return null;
}

async function readChatgptThinkingStatus(Runtime: ChromeClient['Runtime']): Promise<string | null> {
  const { result } = await Runtime.evaluate({
    expression: buildThinkingStatusExpression(),
    returnByValue: true,
  });
  const value = typeof result?.value === 'string' ? result.value.trim() : '';
  const sanitized = sanitizeThinkingText(value);
  return sanitized || null;
}

async function readGeminiProbeState(
  Runtime: ChromeClient['Runtime'],
): Promise<{
  historyText: string;
  promptText: string;
  sendReady: boolean;
  hasPendingBlob: boolean;
  hasRemoveButton: boolean;
} & GeminiActivityEvidence> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const prompt = document.querySelector(${JSON.stringify(GEMINI_PROMPT_SELECTOR)});
      const history = document.querySelector(${JSON.stringify(GEMINI_HISTORY_SELECTOR)});
      const send = document.querySelector(${JSON.stringify(GEMINI_SEND_BUTTON_SELECTOR)});
      const hasPendingBlob = Array.from(document.querySelectorAll('img')).some((el) => {
        const src = String(el.getAttribute('src') ?? '');
        if (!src.startsWith('blob:')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const hasRemoveButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((el) =>
        String(el.getAttribute('aria-label') ?? '').toLowerCase().includes('remove file'),
      );
      const activityEvidence = ${buildGeminiActivityEvidenceExpression()};
      const sendReady = (() => {
        if (!(send instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(send);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
          return false;
        }
        const rect = send.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
        return ariaDisabled !== 'true' && !send.hasAttribute('disabled');
      })();
      return {
        historyText: normalize(history instanceof HTMLElement ? history.innerText : history?.textContent ?? ''),
        promptText: normalize(prompt?.textContent ?? ''),
        sendReady,
        hasPendingBlob,
        hasRemoveButton,
        ...activityEvidence,
      };
    })()`,
    returnByValue: true,
  });
  const value = (result?.value ?? {}) as Record<string, unknown>;
  const activityEvidence = coerceGeminiActivityEvidence(value);
  return {
    historyText: typeof value.historyText === 'string' ? value.historyText : '',
    promptText: typeof value.promptText === 'string' ? value.promptText : '',
    sendReady: Boolean(value.sendReady),
    hasPendingBlob: Boolean(value.hasPendingBlob),
    hasRemoveButton: Boolean(value.hasRemoveButton),
    ...activityEvidence,
  };
}

async function isChatgptStopButtonVisible(Runtime: ChromeClient['Runtime']): Promise<boolean> {
  const { result } = await Runtime.evaluate({
    expression: `Boolean(document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]'))`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

function resolveTargetId(tab: { targetId?: string; id?: string } | null | undefined): string | null {
  if (typeof tab?.targetId === 'string' && tab.targetId.trim().length > 0) {
    return tab.targetId.trim();
  }
  if (typeof tab?.id === 'string' && tab.id.trim().length > 0) {
    return tab.id.trim();
  }
  return null;
}

function sanitizeThinkingText(raw: string): string {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  const placeholderPattern = /^chatgpt said:\s*thinking\s*$/i;
  if (placeholderPattern.test(normalized)) {
    return 'Thinking';
  }
  if (lower.startsWith('you said:') || lower.includes('### file:')) {
    return '';
  }
  if (lower.includes('thinking')) {
    return 'Thinking';
  }
  if (lower.includes('reasoning')) {
    return 'Reasoning';
  }
  if (lower.includes('clarifying')) {
    return 'Clarifying';
  }
  if (lower.includes('planning')) {
    return 'Planning';
  }
  if (lower.includes('drafting')) {
    return 'Drafting';
  }
  if (lower.includes('summarizing')) {
    return 'Summarizing';
  }
  return '';
}

function buildThinkingStatusExpression(): string {
  const selectors = [
    'span.loading-shimmer',
    'span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary',
    '[data-testid*="thinking"]',
    '[data-testid*="reasoning"]',
    '[role="status"]',
    '[aria-live="polite"]',
  ];
  const keywords = ['pro thinking', 'thinking', 'reasoning', 'clarifying', 'planning', 'drafting', 'summarizing'];
  const selectorLiteral = JSON.stringify(selectors);
  const keywordsLiteral = JSON.stringify(keywords);
  return `(() => {
    const selectors = ${selectorLiteral};
    const keywords = ${keywordsLiteral};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const nodes = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => nodes.add(node));
    }
    document.querySelectorAll('[data-testid]').forEach((node) => nodes.add(node));
    const assistantTurns = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"]'));
    const lastAssistantTurn = assistantTurns.length > 0 ? assistantTurns[assistantTurns.length - 1] : null;
    if (lastAssistantTurn instanceof HTMLElement && isVisible(lastAssistantTurn)) {
      const assistantText = normalize(lastAssistantTurn.textContent || '');
      if (/^chatgpt said:\\s*thinking\\s*$/i.test(assistantText)) {
        return assistantText;
      }
    }
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisible(node)) continue;
      const text = normalize(node.textContent || '');
      if (!text) continue;
      const classLabel = (node.className || '').toLowerCase();
      const dataLabel = ((node.getAttribute('data-testid') || '') + ' ' + (node.getAttribute('aria-label') || '')).toLowerCase();
      const normalizedText = text.toLowerCase();
      const matches = keywords.some((keyword) =>
        normalizedText.includes(keyword) || classLabel.includes(keyword) || dataLabel.includes(keyword)
      );
      if (matches) {
        const shimmerChild = node.querySelector('span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary');
        if (shimmerChild?.textContent?.trim()) {
          return shimmerChild.textContent.trim();
        }
        return text.trim();
      }
    }
    return null;
  })()`;
}

function normalizeGeminiWhitespace(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractGeminiAnswerText(options: { currentText: string; prompt: string }): string {
  let text = normalizeGeminiWhitespace(options.currentText);
  const prompt = normalizeGeminiWhitespace(options.prompt);
  if (!prompt) {
    return '';
  }
  const promptIndex = text.toLowerCase().lastIndexOf(prompt.toLowerCase());
  if (promptIndex < 0) {
    return '';
  }
  text = text.slice(promptIndex + prompt.length).trim();
  text = text.replace(/^(?:tools|fast|submit)(?:\s+(?:tools|fast|submit))*\b/i, '').trim();
  text = text.replace(/\b(?:tools|fast|submit)(?:\s+(?:tools|fast|submit))*\s*$/i, '').trim();
  return text;
}

function isGeminiPromptCommitted(options: { historyText: string; prompt: string }): boolean {
  const historyText = normalizeGeminiWhitespace(options.historyText);
  const prompt = normalizeGeminiWhitespace(options.prompt);
  if (!historyText || !prompt) {
    return false;
  }
  return historyText.includes(prompt) || historyText.includes(prompt.slice(0, 80));
}

function isGrokRateLimitToastText(value: string): boolean {
  return /query limit|too many requests|rate limit|request limit|try again in\s+\d+/i.test(value);
}
