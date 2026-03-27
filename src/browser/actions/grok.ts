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
): Promise<void> {
  logger(`Navigating to ${url}`);
  await Page.navigate({ url });
  await waitForDocumentReady(Runtime, 45_000);
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

export async function setGrokPrompt(Runtime: ChromeClient['Runtime'], prompt: string): Promise<void> {
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return false;
      el.focus();
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
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  if (!outcome.result?.value) {
    throw new Error('Unable to set Grok prompt text.');
  }
}

export async function submitGrokPrompt(Runtime: ChromeClient['Runtime']): Promise<void> {
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const btn = ${buildFindFirstSelectorExpression(GROK_SEND_SELECTORS)};
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!outcome.result?.value) {
    throw new Error('Unable to locate Grok submit button.');
  }
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
  const baseline = await readAssistantSnapshot(Runtime);
  let lastText = baseline.lastText;
  let stableCount = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await readAssistantSnapshot(Runtime);
    const hasNewContent = current.count > baseline.count || (current.count === baseline.count && current.lastText.length > baseline.lastText.length);
    
    if (hasNewContent && current.lastText.trim().length > 0) {
      if (current.lastText === lastText) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastText = current.lastText;
      }
      if (stableCount >= 2) {
        logger('Recovered assistant response');
        return current.lastText;
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

async function readAssistantSnapshot(Runtime: ChromeClient['Runtime']): Promise<{ count: number; lastText: string }> {
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const bubbles = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_BUBBLE_SELECTORS)};
      const assistant = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_ROLE_SELECTORS)};
      const candidates = assistant.length > 0
        ? assistant
        : bubbles.filter((b) => !b.className.includes('bg-surface-l1'));
      const last = candidates[candidates.length - 1];
      if (!last) return { count: candidates.length, lastText: '' };

      const normalizeText = (value) => value.replace(/\\u200b/g, '').trim();
      const markdownRoot =
        last.querySelector('.response-content-markdown') ||
        last.querySelector('[class*="response-content-markdown"]') ||
        Array.from(last.querySelectorAll('.markdown')).find((node) =>
          !node.closest('.thinking-container') && !node.closest('.action-buttons'),
        );
      if (markdownRoot) {
        return { count: candidates.length, lastText: normalizeText(markdownRoot.textContent || '') };
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

      return { count: candidates.length, lastText: normalizeText(clone.textContent || '') };
    })()`,
    returnByValue: true,
  });
  return {
    count: outcome.result?.value?.count ?? 0,
    lastText: outcome.result?.value?.lastText ?? '',
  };
}

async function waitForDocumentReady(Runtime: ChromeClient['Runtime'], timeoutMs: number): Promise<void> {
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
