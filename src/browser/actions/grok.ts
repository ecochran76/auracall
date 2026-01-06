import path from 'node:path';
import type { ChromeClient, BrowserLogger, BrowserAttachment } from '../types.js';
import { delay } from '../utils.js';

const GROK_INPUT_SELECTOR = 'div.ProseMirror[contenteditable="true"]';
const GROK_SEND_SELECTOR = 'button[aria-label="Submit"][type="submit"]';
const GROK_MODEL_BUTTON_SELECTOR = 'button[aria-label="Model select"]';
const GROK_MENU_ITEM_SELECTOR = '[role="menuitem"]';

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
  if (href.includes('accounts.x.ai/sign-in')) {
    throw new Error('Grok login required; please sign in to accounts.x.ai and retry.');
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
        const el = document.querySelector('${GROK_INPUT_SELECTOR}');
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
      const el = document.querySelector('${GROK_INPUT_SELECTOR}');
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
      const btn = document.querySelector('${GROK_SEND_SELECTOR}');
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
      const items = Array.from(document.querySelectorAll('${GROK_MENU_ITEM_SELECTOR}'));
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
  const documentNode = await DOM.getDocument();
  const inputNode = await DOM.querySelector({
    nodeId: documentNode.root.nodeId,
    selector: 'input[type="file"]',
  });
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
      const bubbles = Array.from(document.querySelectorAll('main .message-bubble'))
        .filter((b) => b.className.includes('w-full') && b.className.includes('max-w-none'));
      const last = bubbles[bubbles.length - 1];
      return { count: bubbles.length, lastText: last ? (last.textContent || '').trim() : '' };
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

async function openGrokModelMenu(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
): Promise<boolean> {
  const clicked = await Runtime.evaluate({
    expression: `(() => {
      const btn = document.querySelector('${GROK_MODEL_BUTTON_SELECTOR}');
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
      const editor = document.querySelector('${GROK_INPUT_SELECTOR}');
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
      expression: `(() => document.querySelector('${GROK_MENU_ITEM_SELECTOR}') !== null)()`,
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
