import path from 'node:path';
import type { ChromeClient, BrowserLogger, BrowserAttachment } from '../types.js';
import { delay } from '../utils.js';
import { GROK_PROVIDER } from '../providers/grok.js';
import {
  buildFindAllSelectorsExpression,
  buildFindFirstSelectorExpression,
  buildSelectorArrayLiteral,
} from '../providers/shared.js';

const GROK_SELECTORS = GROK_PROVIDER.selectors;
const GROK_INPUT_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.input);
const GROK_SEND_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.sendButton);
const GROK_MODEL_BUTTON_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.modelButton);
const GROK_MENU_ITEM_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.menuItem);
const GROK_ASSISTANT_BUBBLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantBubble);
const GROK_ASSISTANT_ROLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantRole);

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

export async function ensureGrokLoggedIn(Runtime: ChromeClient['Runtime'], logger: BrowserLogger): Promise<void> {
  const href = await readLocationHref(Runtime);
  if (GROK_PROVIDER.loginUrlHints?.some((hint) => href.includes(hint))) {
    throw new Error('Grok login required; please sign in to accounts.x.ai and retry.');
  }
  const probe = await Runtime.evaluate({
    expression: `(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      const authPattern = /(sign in|log in|login|create account|sign up)/i;
      const hasAuthCta = Array.from(document.querySelectorAll('a,button')).some((el) =>
        authPattern.test((el.textContent || '').trim()),
      );
      const hasNotFound =
        text.includes("link doesn't exist") ||
        text.includes('link does not exist') ||
        text.includes('page not found');
      return { hasAuthCta, hasNotFound };
    })()`,
    returnByValue: true,
  });
  if (probe.result?.value?.hasAuthCta || probe.result?.value?.hasNotFound) {
    throw new Error('Grok login required; open the profile in a browser and sign in.');
  }
  logger('Login check passed');
}

export async function ensureGrokPromptReady(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await Runtime.evaluate({
      expression: `(() => {
        const el = ${buildFindFirstSelectorExpression(GROK_INPUT_SELECTORS)};
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })()`,
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
      const el = ${buildFindFirstSelectorExpression(GROK_INPUT_SELECTORS)};
      if (!el) return false;
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, ${JSON.stringify(prompt)});
      return true;
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
  const menuOpened = await openGrokModelMenu(Runtime, Input);
  if (!menuOpened) {
    logger('Unable to open Grok model menu via click or keyboard.');
    return;
  }
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const items = ${buildFindAllSelectorsExpression(GROK_MENU_ITEM_SELECTORS)};
      const target = items.find((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(label)}));
      if (!target) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!outcome.result?.value) {
    logger(`Unable to find Grok mode "${label}" in menu.`);
    return;
  }
  logger(`Selected Grok mode: ${label}`);
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
    if (current.count > baseline.count && current.lastText.trim().length > 0) {
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
  DOM: ChromeClient['DOM'],
  Runtime: ChromeClient['Runtime'],
  attachments: BrowserAttachment[],
  logger: BrowserLogger,
): Promise<void> {
  if (!attachments.length) return;
  const inputNode = await queryFileInputNode(DOM);
  if (!inputNode.nodeId) {
    throw new Error('Unable to locate Grok file input.');
  }
  for (const attachment of attachments) {
    await DOM.setFileInputFiles({ nodeId: inputNode.nodeId, files: [attachment.path] });
    const name = path.basename(attachment.displayPath ?? attachment.path);
    const appeared = await waitForAttachmentName(Runtime, name);
    if (!appeared) {
      logger(`Attachment name not detected for ${attachment.displayPath}; proceeding anyway.`);
    }
  }
}

async function waitForAttachmentName(
  Runtime: ChromeClient['Runtime'],
  name: string,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const outcome = await Runtime.evaluate({
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
      return { count: candidates.length, lastText: last ? (last.textContent || '').trim() : '' };
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

async function queryFileInputNode(DOM: ChromeClient['DOM']) {
  const documentNode = await DOM.getDocument();
  for (const selector of GROK_PROVIDER.selectors.fileInput) {
    const match = await DOM.querySelector({
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
      expression: `(() => ${buildFindAllSelectorsExpression(GROK_MENU_ITEM_SELECTORS)}.length > 0)()`,
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
