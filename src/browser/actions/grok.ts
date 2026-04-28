import path from 'node:path';
import type { ChromeClient, BrowserLogger, BrowserAttachment } from '../types.js';
import { delay } from '../utils.js';
import { GROK_PROVIDER } from '../providers/grok.js';
import { detectGrokSignedInIdentity } from '../providers/grokIdentity.js';
import { ensureServicesRegistry, resolveServiceModelLabels } from '../../services/registry.js';
import {
  buildFindAllSelectorsExpression,
  buildFindFirstSelectorExpression,
  buildSelectorArrayLiteral,
} from '../providers/shared.js';
import {
  GROK_MODEL_LABEL_NORMALIZER,
  normalizeGrokModelLabel,
} from '../providers/grokModelMenu.js';
import {
  isGrokRateLimitToastText,
  type GrokAssistantSnapshot,
} from '../providers/grokEvidence.js';
import { navigateAndSettle, type NavigateAndSettleOptions } from '../service/ui.js';

const GROK_SELECTORS = GROK_PROVIDER.selectors;
const GROK_INPUT_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.input);
const GROK_SEND_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.sendButton);
const GROK_MODEL_BUTTON_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.modelButton);
const GROK_MENU_ITEM_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.menuItem);
const GROK_ASSISTANT_BUBBLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantBubble);
const GROK_ASSISTANT_ROLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantRole);
const GROK_MENU_CONTAINER_SELECTORS = JSON.stringify([
  '[data-radix-dropdown-menu-content]',
  '[data-radix-menu-content]',
  'div[data-state="open"]',
]);
const GROK_VISIBLE_INPUT_EXPRESSION = `(() => {
  const selectors = ${GROK_INPUT_SELECTORS};
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.hasAttribute('disabled') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  for (const selector of selectors) {
    const match = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (match) return match;
  }
  return null;
})()`;

export async function navigateToGrok(
  Page: ChromeClient['Page'],
  Runtime: ChromeClient['Runtime'],
  url: string,
  logger: BrowserLogger,
  options: Pick<NavigateAndSettleOptions, 'mutationAudit' | 'mutationSource'> = {},
): Promise<void> {
  logger(`Navigating to ${url}`);
  const settled = await navigateAndSettle({ Page, Runtime }, {
    url,
    timeoutMs: 45_000,
    mutationAudit: options.mutationAudit,
    mutationSource: options.mutationSource ?? 'legacy:grok:navigate',
  });
  if (!settled.ok) {
    throw new Error(`Grok navigation to ${url} did not settle: ${settled.reason ?? settled.phase}`);
  }
}

export async function ensureGrokLoggedIn(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  options: { headless: boolean; timeoutMs?: number } = { headless: false },
): Promise<void> {
  const checkLogin = async (): Promise<{ ok: boolean; reason: 'identity' | 'guest-cta' | 'not-found' | 'unknown' }> => {
    const href = await readLocationHref(Runtime);
    if (GROK_PROVIDER.loginUrlHints?.some((hint) => href.includes(hint))) {
      return { ok: false, reason: 'guest-cta' };
    }
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        const hasNotFound =
          text.includes("link doesn't exist") ||
          text.includes('link does not exist') ||
          text.includes('page not found') ||
          text.includes('issue finding id');
        return { hasNotFound };
      })()`,
      returnByValue: true,
    });
    if (result?.value?.hasNotFound) {
      return { ok: false, reason: 'not-found' };
    }
    const status = await detectGrokSignedInIdentity(Runtime);
    if (status.identity) {
      return { ok: true, reason: 'identity' };
    }
    if (status.guestAuthCta) {
      return { ok: false, reason: 'guest-cta' };
    }
    return { ok: false, reason: 'unknown' };
  };

  const initial = await checkLogin();
  if (initial.ok) {
    logger('Login check passed (identity verified)');
    return;
  }

  if (options.headless) {
    throw new Error('Grok login required; could not verify a signed-in Grok account. Please sign in to grok.com and retry.');
  }

  const deadline = Date.now() + Math.min(options.timeoutMs ?? 1_200_000, 10 * 60_000);
  let lastNotice = 0;
  while (Date.now() < deadline) {
    const status = await checkLogin();
    if (status.ok) {
      logger('Login check passed (identity verified)');
      return;
    }
    const now = Date.now();
    if (now - lastNotice > 5000) {
      const suffix =
        status.reason === 'guest-cta'
          ? 'visible Sign in/Sign up controls still present'
          : status.reason === 'not-found'
            ? 'page is not on a valid Grok chat route yet'
            : 'signed-in identity not detected yet';
      logger(`Waiting for Grok login to complete in the open browser (${suffix})...`);
      lastNotice = now;
    }
    await delay(1000);
  }
  throw new Error('Grok login required; timed out waiting for a verified signed-in Grok account.');
}

export async function ensureGrokPromptReady(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await Runtime.evaluate({
      expression: `(() => Boolean(${GROK_VISIBLE_INPUT_EXPRESSION}))()`,
      returnByValue: true,
    });
    if (ready.result?.value) {
      logger('Prompt textarea ready');
      return;
    }
    await delay(250);
  }
  throw new Error('Grok prompt not ready before timeout.');
}

export async function setGrokPrompt(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
  prompt: string,
): Promise<void> {
  const normalizeText = (value: string): string => value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  const focusOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return { ok: false };
      const dispatchClick = (target) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 1,
            view: window,
          }));
        }
      };
      dispatchClick(el);
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'input' };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        const doc = el.ownerDocument;
        const selection = doc?.getSelection?.();
        if (selection) {
          const range = doc.createRange();
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        el.textContent = '';
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: '', inputType: 'deleteByCut' }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        return { ok: true, mode: 'contenteditable' };
      }
      return { ok: false };
    })()`,
    returnByValue: true,
  });
  if (!focusOutcome.result?.value?.ok) {
    throw new Error('Unable to focus the Grok prompt composer.');
  }

  const mode = String(focusOutcome.result?.value?.mode ?? '');
  const shouldPreferDomInjection = mode === 'contenteditable' && prompt.includes('\n');
  if (!shouldPreferDomInjection) {
    await Input.insertText({ text: prompt });
    await delay(250);
  }

  const verifyOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return { ok: false, text: '' };
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return { ok: true, text: el.value || '' };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return { ok: true, text: el.innerText || el.textContent || '' };
      }
      return { ok: false, text: '' };
    })()`,
    returnByValue: true,
  });
  const observedText = normalizeText(String(verifyOutcome.result?.value?.text ?? ''));
  if (observedText === normalizeText(prompt)) {
    return;
  }

  const fallbackOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return false;
      const text = ${JSON.stringify(prompt)};
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const prototype = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(el, text);
        } else {
          el.value = text;
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        el.replaceChildren();
        const lines = text.split(/\\r?\\n/);
        lines.forEach((line, index) => {
          if (index > 0) {
            el.appendChild(document.createElement('br'));
          }
          el.appendChild(document.createTextNode(line));
        });
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste' }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  if (!fallbackOutcome.result?.value) {
    throw new Error('Unable to set Grok prompt text.');
  }

  const postFallback = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return { ok: false, text: '' };
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return { ok: true, text: el.value || '' };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return { ok: true, text: el.innerText || el.textContent || '' };
      }
      return { ok: false, text: '' };
    })()`,
    returnByValue: true,
  });
  if (normalizeText(String(postFallback.result?.value?.text ?? '')) !== normalizeText(prompt)) {
    throw new Error('Unable to preserve Grok prompt formatting in the composer.');
  }
}

export async function submitGrokPrompt(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
): Promise<void> {
  const readSubmissionState = async (): Promise<{
    composerText: string;
    turnCount: number;
    submitDisabled: boolean;
    hasEnabledSubmit: boolean;
  }> => {
    const state = await Runtime.evaluate({
      expression: `(() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const selectors = ${GROK_SEND_SELECTORS};
        const btn = selectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .find((candidate) => candidate instanceof HTMLButtonElement && isVisible(candidate) && !candidate.disabled) || null;
        const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
        const composerText =
          el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
            ? (el.value || '')
            : el instanceof HTMLElement && el.isContentEditable
              ? (el.innerText || el.textContent || '')
              : '';
        const turnCount = document.querySelectorAll('[id^="response-"]').length;
        return {
          composerText,
          turnCount,
          submitDisabled: btn ? Boolean(btn.disabled) : false,
          hasEnabledSubmit: Boolean(btn),
        };
      })()`,
      returnByValue: true,
    });
    return {
      composerText: String(state.result?.value?.composerText ?? ''),
      turnCount: Number(state.result?.value?.turnCount ?? 0),
      submitDisabled: Boolean(state.result?.value?.submitDisabled),
      hasEnabledSubmit: Boolean(state.result?.value?.hasEnabledSubmit),
    };
  };

  const waitDeadline = Date.now() + 10_000;
  let baseline = await readSubmissionState();
  while (!baseline.hasEnabledSubmit && Date.now() < waitDeadline) {
    await delay(250);
    baseline = await readSubmissionState();
  }
  if (!baseline.hasEnabledSubmit) {
    throw new Error('Unable to locate Grok submit button.');
  }

  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const selectors = ${GROK_SEND_SELECTORS};
      const btn = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((candidate) => candidate instanceof HTMLButtonElement && isVisible(candidate) && !candidate.disabled) || null;
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!outcome.result?.value) {
    throw new Error('Unable to locate Grok submit button.');
  }

  await delay(600);
  const afterClick = await readSubmissionState();
  const committed =
    afterClick.turnCount > baseline.turnCount ||
    afterClick.submitDisabled ||
    afterClick.composerText.trim().length === 0;
  if (committed) {
    return;
  }

  await Input.dispatchKeyEvent({
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    text: '\r',
    unmodifiedText: '\r',
  });
  await Input.dispatchKeyEvent({
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

export async function selectGrokMode(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
  label: string,
  logger: BrowserLogger,
): Promise<void> {
  const servicesRegistry = await ensureServicesRegistry();
  const candidateLabels = resolveServiceModelLabels(servicesRegistry, 'grok', label);
  const normalizedCandidates = candidateLabels
    .concat(candidateLabels.length === 0 ? [label] : [])
    .map((candidate) => normalizeGrokModelLabel(candidate))
    .filter(Boolean);
  const menuOpened = await openGrokModelMenu(Runtime, Input);
  if (!menuOpened) {
    logger('Unable to open Grok model menu via click or keyboard.');
    return;
  }
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
      const menuSelectors = ${GROK_MENU_CONTAINER_SELECTORS};
      const menu = menuSelectors.map((selector) => document.querySelector(selector)).find(Boolean);
      const items = menu
        ? ${buildFindAllSelectorsExpression(GROK_MENU_ITEM_SELECTORS, 'menuItemSelectors')}.filter((el) => menu.contains(el))
        : ${buildFindAllSelectorsExpression(GROK_MENU_ITEM_SELECTORS)};
      const candidates = ${JSON.stringify(normalizedCandidates)};
      const target = items.find((el) => {
        const text = normalize(el.textContent || '');
        return candidates.some((candidate) => text.startsWith(candidate));
      });
      if (!target) {
        return {
          ok: false,
          available: items.map((el) => normalize(el.textContent || '')).filter(Boolean),
        };
      }
      target.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const result = outcome.result?.value as { ok?: boolean; available?: string[] } | undefined;
  if (!result?.ok) {
    const available = (result?.available ?? []).filter(Boolean);
    const availableHint = available.length > 0 ? ` Available: ${available.join(', ')}.` : '';
    logger(
      `Unable to find Grok mode "${normalizedCandidates.join('" / "') || label}" in menu.${availableHint}`,
    );
    return;
  }
  logger(`Selected Grok mode: ${normalizedCandidates[0] ?? label}`);
}

export async function waitForGrokAssistantResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<string> {
  const result = await waitForGrokAssistantResult(Runtime, timeoutMs, logger);
  return result.text;
}

export async function waitForGrokAssistantResult(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
  options: {
    baseline?: {
      count: number;
      lastText: string;
      lastMarkdown: string;
      lastHtml: string;
      toastText?: string;
    } | null;
    onResponseIncoming?: () => void;
  } = {},
): Promise<{ text: string; markdown: string; html?: string }> {
  const baseline = options.baseline ?? (await readAssistantSnapshot(Runtime));
  let lastSignature = baseline.lastMarkdown || baseline.lastText;
  let stableCount = 0;
  let responseIncomingNotified = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await readAssistantSnapshot(Runtime);
    if (current.toastText && isGrokRateLimitToastText(current.toastText)) {
      throw new Error(current.toastText);
    }
    const currentSignature = current.lastMarkdown || current.lastText;
    const baselineSignature = baseline.lastMarkdown || baseline.lastText;
    const hasNewContent =
      current.count > baseline.count ||
      (current.count === baseline.count && currentSignature.length > baselineSignature.length);

    if (hasNewContent && currentSignature.trim().length > 0) {
      if (!responseIncomingNotified) {
        responseIncomingNotified = true;
        options.onResponseIncoming?.();
      }
      if (currentSignature === lastSignature) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastSignature = currentSignature;
      }
      if (stableCount >= 2) {
        logger('Recovered assistant response');
        return {
          text: current.lastText,
          markdown: current.lastMarkdown || current.lastText,
          html: current.lastHtml || undefined,
        };
      }
    }
    await delay(500);
  }
  throw new Error('Timed out waiting for Grok response.');
}

export async function uploadGrokAttachments(
  dom: ChromeClient['DOM'],
  runtime: ChromeClient['Runtime'],
  attachments: BrowserAttachment[],
  logger: BrowserLogger,
): Promise<void> {
  if (!attachments.length) return;
  const inputNode = await queryFileInputNode(dom);
  if (!inputNode.nodeId) {
    throw new Error('Unable to locate Grok file input.');
  }
  for (const attachment of attachments) {
    await dom.setFileInputFiles({ nodeId: inputNode.nodeId, files: [attachment.path] });
    const name = path.basename(attachment.displayPath ?? attachment.path);
    const appeared = await waitForAttachmentName(runtime, name);
    if (!appeared) {
      logger(`Attachment name not detected for ${attachment.displayPath}; proceeding anyway.`);
    }
  }
}

async function waitForAttachmentName(
  runtime: ChromeClient['Runtime'],
  name: string,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const outcome = await runtime.evaluate({
      expression: `(() => document.body?.innerText?.includes(${JSON.stringify(name)}) ?? false)()`,
      returnByValue: true,
    });
    if (outcome.result?.value) return true;
    await delay(250);
  }
  return false;
}

export function buildGrokAssistantSnapshotExpressionForTest(): string {
  return buildGrokAssistantSnapshotExpression();
}

export async function readGrokAssistantSnapshotForRuntime(
  Runtime: ChromeClient['Runtime'],
): Promise<GrokAssistantSnapshot> {
  return readAssistantSnapshot(Runtime);
}

function buildGrokAssistantSnapshotExpression(): string {
  return `(() => {
      const bubbles = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_BUBBLE_SELECTORS)};
      const assistant = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_ROLE_SELECTORS)};
      const candidates = assistant.length > 0
        ? assistant
        : bubbles.filter((b) => !b.className.includes('bg-surface-l1'));
      const last = candidates[candidates.length - 1];
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const readToastText = () => {
        const selectors = [
          '[role="alert"]',
          '[role="status"]',
          '[data-sonner-toast]',
          '[data-toast]',
          '[data-radix-toast-viewport] *',
        ];
        const values = selectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .filter((node) => isVisible(node))
          .map((node) => normalizeText(node.textContent || ''))
          .filter(Boolean)
          .filter((text) => /query limit|too many requests|rate limit|request limit|try again in\\s+\\d+/i.test(text));
        return values[values.length - 1] || '';
      };
      if (!last) return { count: candidates.length, lastText: '', lastMarkdown: '', lastHtml: '', toastText: readToastText() };

      const normalizeText = (value) =>
        String(value || '')
          .replace(/\\u200b/g, '')
          .replace(/\\r\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();
      const normalizeInlineWhitespace = (value) => String(value || '').replace(/\\s+/g, ' ');
      const collapseInline = (value) => normalizeText(normalizeInlineWhitespace(value));
      const normalizeCode = (value) => String(value || '').replace(/\\u200b/g, '').replace(/\\r\\n/g, '\\n').replace(/\\n$/, '');
      const markdownRoot =
        last.querySelector('.response-content-markdown') ||
        last.querySelector('[class*="response-content-markdown"]') ||
        Array.from(last.querySelectorAll('.markdown')).find((node) =>
          !node.closest('.thinking-container') && !node.closest('.action-buttons'),
        );

      const isExcluded = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.tagName === 'BUTTON') return true;
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        const className = (node.className || '').toString().toLowerCase();
        if (
          testId.includes('follow-up') ||
          testId.includes('suggest') ||
          testId.includes('thinking') ||
          className.includes('thinking-container') ||
          className.includes('action-buttons') ||
          className.includes('sticky')
        ) {
          return true;
        }
        return false;
      };

      const cleanPlainText = (root) => {
        if (!(root instanceof HTMLElement)) return '';
        const clone = root.cloneNode(true);
        clone.querySelectorAll('*').forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isExcluded(node)) {
            node.remove();
            return;
          }
          if ((node.getAttribute('data-testid') || '').toLowerCase() === 'code-block') {
            const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) =>
              !candidate.closest('button'),
            );
            const replacement = document.createElement('div');
            replacement.textContent = normalizeCode(codeNode?.textContent || '');
            node.replaceWith(replacement);
          }
        });
        return normalizeText(clone.textContent || '');
      };

      const inlineText = (node) => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
        }
        if (!(node instanceof HTMLElement)) {
          return '';
        }
        if (isExcluded(node)) return '';
        if ((node.getAttribute('data-testid') || '').toLowerCase() === 'code-block') {
          const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) => !candidate.closest('button'));
          return normalizeCode(codeNode?.textContent || '');
        }
        if (node.tagName === 'BR') {
          return '\\n';
        }
        if (node.tagName === 'CODE' && !node.closest('[data-testid="code-block"]')) {
          return \`\\\`\${collapseInline(node.textContent || '')}\\\`\`;
        }
        return Array.from(node.childNodes).map((child) => inlineText(child)).join('');
      };

      const serializeListItem = (node, depth, ordered, index) => {
        const indent = '  '.repeat(depth);
        const marker = ordered ? \`\${index + 1}. \` : '- ';
        const bodyParts = [];
        const nestedParts = [];
        for (const child of Array.from(node.childNodes)) {
          if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) {
            const nested = serializeBlock(child, depth + 1);
            if (nested) nestedParts.push(nested);
            continue;
          }
          const value = inlineText(child);
          if (value) bodyParts.push(value);
        }
        const body = collapseInline(bodyParts.join(''));
        const firstLine = \`\${indent}\${marker}\${body}\`.trimEnd();
        return [firstLine, ...nestedParts].filter(Boolean).join('\\n');
      };

      const serializeCodeBlock = (node) => {
        const languageNode = node.querySelector('span.font-mono');
        const language = collapseInline(languageNode?.textContent || '');
        const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) => !candidate.closest('button'));
        const code = normalizeCode(codeNode?.textContent || '');
        if (!code) return '';
        return \`\\\`\\\`\\\`\${language}\\n\${code}\\n\\\`\\\`\\\`\`;
      };

      const serializeBlock = (node, depth = 0) => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
          return collapseInline(node.textContent || '');
        }
        if (!(node instanceof HTMLElement)) return '';
        if (isExcluded(node)) return '';
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        if (testId === 'code-block') {
          return serializeCodeBlock(node);
        }
        const tag = node.tagName;
        if (tag === 'UL' || tag === 'OL') {
          const ordered = tag === 'OL';
          return Array.from(node.children)
            .filter((child) => child.tagName === 'LI')
            .map((child, index) => serializeListItem(child, depth, ordered, index))
            .filter(Boolean)
            .join('\\n');
        }
        if (tag === 'LI') {
          return serializeListItem(node, depth, false, 0);
        }
        if (/^H[1-6]$/.test(tag)) {
          const level = Number(tag.slice(1));
          return \`\${'#'.repeat(level)} \${collapseInline(inlineText(node))}\`.trim();
        }
        if (tag === 'P') {
          return collapseInline(inlineText(node));
        }
        if (tag === 'BLOCKQUOTE') {
          return normalizeText(inlineText(node))
            .split('\\n')
            .map((line) => \`> \${line}\`.trimEnd())
            .join('\\n');
        }
        if (tag === 'PRE') {
          const codeNode = node.querySelector('code');
          const code = normalizeCode(codeNode?.textContent || node.textContent || '');
          return code ? \`\\\`\\\`\\\`\\n\${code}\\n\\\`\\\`\\\`\` : '';
        }
        const directChildren = Array.from(node.children).filter((child) => !isExcluded(child));
        if (directChildren.length === 0) {
          return collapseInline(inlineText(node));
        }
        const nestedBlocks = directChildren
          .map((child) => serializeBlock(child, depth))
          .filter(Boolean);
        if (nestedBlocks.length > 0) {
          return nestedBlocks.join('\\n\\n');
        }
        return collapseInline(inlineText(node));
      };

      if (markdownRoot) {
        const markdown = normalizeText(
          Array.from(markdownRoot.children).map((child) => serializeBlock(child)).filter(Boolean).join('\\n\\n') ||
            serializeBlock(markdownRoot),
        );
        const text = cleanPlainText(markdownRoot);
        return {
          count: candidates.length,
          lastText: text || markdown,
          lastMarkdown: markdown || text,
          lastHtml: markdownRoot.innerHTML || '',
          toastText: readToastText(),
        };
      }

      const clone = last.cloneNode(true);
      const removableSelectors = [
        '.thinking-container',
        '.action-buttons',
        '[data-testid*="follow-up"]',
        '[data-testid*="suggest"]',
      ];
      for (const selector of removableSelectors) {
        clone.querySelectorAll(selector).forEach((node) => node.remove());
      }
      clone.querySelectorAll('*').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const className = (node.className || '').toString().toLowerCase();
        const ariaLabel = (node.getAttribute('aria-label') || '').toLowerCase();
        if (
          node.tagName === 'BUTTON' ||
          className.includes('action-buttons') ||
          className.includes('suggest') ||
          ariaLabel.includes('suggest')
        ) {
          node.remove();
        }
      });

      const fallbackText = normalizeText(clone.textContent || '');
      return {
        count: candidates.length,
        lastText: fallbackText,
        lastMarkdown: fallbackText,
        lastHtml: '',
        toastText: readToastText(),
      };
    })()`;
}

async function readAssistantSnapshot(
  Runtime: ChromeClient['Runtime'],
): Promise<{ count: number; lastText: string; lastMarkdown: string; lastHtml: string; toastText: string }> {
  const outcome = await Runtime.evaluate({
    expression: buildGrokAssistantSnapshotExpression(),
    returnByValue: true,
  });
  return {
    count: outcome.result?.value?.count ?? 0,
    lastText: outcome.result?.value?.lastText ?? '',
    lastMarkdown: outcome.result?.value?.lastMarkdown ?? '',
    lastHtml: outcome.result?.value?.lastHtml ?? '',
    toastText: outcome.result?.value?.toastText ?? '',
  };
}

async function _waitForDocumentReady(Runtime: ChromeClient['Runtime'], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result?.value === 'complete' || result?.value === 'interactive') {
      return;
    }
    await delay(200);
  }
  throw new Error('Page did not reach ready state in time');
}

async function readLocationHref(Runtime: ChromeClient['Runtime']): Promise<string> {
  const { result } = await Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  return typeof result?.value === 'string' ? result.value : '';
}

async function queryFileInputNode(dom: ChromeClient['DOM']) {
  const documentNode = await dom.getDocument();
  for (const selector of GROK_PROVIDER.selectors.fileInput) {
    const match = await dom.querySelector({
      nodeId: documentNode.root.nodeId,
      selector,
    });
    if (match.nodeId) {
      return match;
    }
  }
  return { nodeId: 0 };
}

async function openGrokModelMenu(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
): Promise<boolean> {
  const clicked = await Runtime.evaluate({
    expression: `(() => {
      const btn = ${buildFindFirstSelectorExpression(GROK_MODEL_BUTTON_SELECTORS)};
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (clicked.result?.value && (await waitForMenuItems(Runtime, 800))) {
    return true;
  }

  await Runtime.evaluate({
    expression: `(() => {
      const editor = ${buildFindFirstSelectorExpression(GROK_INPUT_SELECTORS)};
      editor?.focus();
    })()`,
  });
  await pressKey(Input, 'Tab', 'Tab');
  await pressKey(Input, 'Tab', 'Tab');
  await pressKey(Input, ' ', 'Space');
  return await waitForMenuItems(Runtime, 1000);
}

async function waitForMenuItems(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const outcome = await Runtime.evaluate({
      expression: `(() => {
        const menuSelectors = ${GROK_MENU_CONTAINER_SELECTORS};
        const menu = menuSelectors.map((selector) => document.querySelector(selector)).find(Boolean);
        if (!menu) return false;
        const items = ${buildFindAllSelectorsExpression(GROK_MENU_ITEM_SELECTORS, 'menuItemSelectors')};
        return items.some((el) => menu.contains(el));
      })()`,
      returnByValue: true,
    });
    if (outcome.result?.value) return true;
    await delay(100);
  }
  return false;
}

async function pressKey(Input: ChromeClient['Input'], key: string, code: string): Promise<void> {
  await Input.dispatchKeyEvent({ type: 'keyDown', key, code });
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code });
}
