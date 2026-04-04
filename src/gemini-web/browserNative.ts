import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome, hideChromeWindow, wasChromeLaunchedByAuracall } from '../browser/chromeLifecycle.js';
import { resolveBrowserConfig } from '../browser/config.js';
import { bootstrapManagedProfile } from '../browser/profileStore.js';
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from '../browser/service/profileResolution.js';
import type { BrowserRunOptions, BrowserRunResult, BrowserLogger } from '../browser/types.js';

const GEMINI_PROMPT_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]';
const GEMINI_UPLOAD_BUTTON_SELECTOR = 'button[aria-label="Open upload file menu"]';
const GEMINI_UPLOAD_FILES_MENU_SELECTOR = '[data-test-id="local-images-files-uploader-button"]';
const GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR = '[data-test-id="hidden-local-image-upload-button"]';
const GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR = '[data-test-id="hidden-local-file-upload-button"]';
const GEMINI_SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const GEMINI_SEND_TOUCH_TARGET_SELECTOR = `${GEMINI_SEND_BUTTON_SELECTOR} .mat-mdc-button-touch-target`;
const GEMINI_HISTORY_SELECTOR = '[data-test-id="chat-history-container"]';

function isLikelyImagePath(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(path.extname(filePath).toLowerCase());
}

const GEMINI_SIGNED_OUT_PROBE_EXPRESSION = `(() => {
  const host = String(globalThis.location?.hostname ?? '').toLowerCase();
  if (host === 'accounts.google.com') return true;
  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = globalThis.getComputedStyle?.(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  return Array.from(document.querySelectorAll('a,button,[role="button"]')).some((el) => {
    if (!isVisible(el)) return false;
    const label = normalize(\`\${el.getAttribute?.('aria-label') ?? ''} \${el.textContent ?? ''}\`);
    if (!/(^|\\b)(sign in|log in|login)(\\b|$)/.test(label)) return false;
    const href = el instanceof HTMLAnchorElement ? normalize(el.getAttribute('href') ?? '') : '';
    return host === 'gemini.google.com' || href.includes('accounts.google.com');
  });
})()`;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractGeminiAnswerText(options: {
  currentText: string;
  prompt: string;
}): string {
  let text = normalizeWhitespace(options.currentText);
  const prompt = normalizeWhitespace(options.prompt);

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

async function triggerGeminiFileChooser(page: Page, attachmentPaths: string[]): Promise<void> {
  const imageOnly = attachmentPaths.length > 0 && attachmentPaths.every(isLikelyImagePath);
  await page.click(GEMINI_UPLOAD_BUTTON_SELECTOR);
  await page.waitForSelector(GEMINI_UPLOAD_FILES_MENU_SELECTOR, { visible: true, timeout: 10_000 });
  const tryChooser = async (
    selector: string,
    timeoutMs: number,
  ): Promise<import('puppeteer-core').FileChooser | null> => {
    try {
      return await Promise.all([
        page.waitForFileChooser({ timeout: timeoutMs }),
        page.evaluate((targetSelector: string) => {
          const target = document.querySelector(targetSelector);
          if (target instanceof HTMLElement) {
            target.click();
            return;
          }
          throw new Error(`No Gemini upload trigger matched ${targetSelector}`);
        }, selector),
      ]).then(([fileChooser]) => fileChooser);
    } catch {
      return null;
    }
  };

  const selectorOrder = imageOnly
    ? [GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR, GEMINI_UPLOAD_FILES_MENU_SELECTOR, GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR]
    : [GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR, GEMINI_UPLOAD_FILES_MENU_SELECTOR, GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR];

  let chooser = null;
  for (const [index, selector] of selectorOrder.entries()) {
    chooser = await tryChooser(selector, index === 0 ? 2_500 : 10_000);
    if (chooser) break;
  }

  if (!chooser) {
    throw new Error('Waiting for Gemini file chooser failed across all known upload triggers.');
  }

  await chooser.accept(attachmentPaths);
}

async function readGeminiHistoryText(page: Page): Promise<string> {
  const result = await page.evaluate(`(() => {
    const history = document.querySelector(${JSON.stringify(GEMINI_HISTORY_SELECTOR)});
    const root = history instanceof HTMLElement ? history : document.body;
    return String(root?.innerText ?? root?.textContent ?? '');
  })()`);
  return typeof result === 'string' ? result : '';
}

async function isGeminiSignedOut(page: Page): Promise<boolean> {
  const result = await page.evaluate(GEMINI_SIGNED_OUT_PROBE_EXPRESSION);
  return Boolean(result);
}

async function waitForGeminiAnswer(page: Page, options: {
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const deadline = Date.now() + options.timeoutMs;
  let lastAnswer = '';
  let stableCount = 0;

  while (Date.now() < deadline) {
    const currentText = await readGeminiHistoryText(page);
    const answer = extractGeminiAnswerText({
      currentText,
      prompt: options.prompt,
    });

    if (answer.length > 0) {
      if (answer === lastAnswer) {
        stableCount += 1;
      } else {
        lastAnswer = answer;
        stableCount = 0;
      }

      if (stableCount >= 2) {
        return answer;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error('Timed out waiting for Gemini browser-native attachment response.');
}

async function waitForAttachmentPreview(
  page: Page,
  attachmentNames: string[],
  timeoutMs: number,
): Promise<void> {
  await page.waitForFunction(
    (names: string[]) => {
      const previews = Array.from(document.querySelectorAll('[data-test-id="file-preview"]'));
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
      return names.every((name) => {
        const removeLabel = 'Remove file ' + name;
        const hasRemove = buttons.some((el) => String(el.getAttribute('aria-label') ?? '').includes(removeLabel));
        const hasPreview = previews.some((el) => {
          const previewText = String(el.textContent ?? '').replace(/\s+/g, ' ').trim();
          const previewTitle =
            String(el.getAttribute('title') ?? '') ||
            String(el.querySelector('[data-test-id="file-name"]')?.getAttribute?.('title') ?? '');
          return previewText.includes(name) || previewTitle.includes(name);
        });
        return hasRemove || hasPreview;
      });
    },
    { timeout: timeoutMs },
    attachmentNames,
  );
}

async function waitForGeminiSendReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (sendSelector: string) => {
      const send = document.querySelector(sendSelector);
      if (!(send instanceof HTMLElement)) return false;
      const style = globalThis.getComputedStyle?.(send);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      const rect = send.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
      return ariaDisabled !== 'true' && !send.hasAttribute('disabled');
    },
    { timeout: timeoutMs },
    GEMINI_SEND_BUTTON_SELECTOR,
  );
}

async function waitForGeminiSubmit(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (promptSelector: string, sendSelector: string) => {
      const prompt = document.querySelector(promptSelector);
      const send = document.querySelector(sendSelector);
      const promptText = String(prompt?.textContent ?? '').trim();
      const ariaDisabled = String(send?.getAttribute?.('aria-disabled') ?? '').toLowerCase();
      const disabled = Boolean(send?.hasAttribute?.('disabled'));
      return promptText.length === 0 || ariaDisabled === 'true' || disabled;
    },
    { timeout: timeoutMs },
    GEMINI_PROMPT_SELECTOR,
    GEMINI_SEND_BUTTON_SELECTOR,
  );
}

async function submitGeminiPrompt(page: Page, timeoutMs: number): Promise<void> {
  await waitForGeminiSendReady(page, timeoutMs);
  if (await page.$(GEMINI_SEND_TOUCH_TARGET_SELECTOR)) {
    await page.click(GEMINI_SEND_TOUCH_TARGET_SELECTOR);
  } else {
    await page.click(GEMINI_SEND_BUTTON_SELECTOR);
  }
  try {
    await waitForGeminiSubmit(page, 10_000);
    return;
  } catch {
    await page.evaluate((touchSelector: string, sendSelector: string) => {
      const touchTarget = document.querySelector(touchSelector);
      if (touchTarget instanceof HTMLElement) {
        touchTarget.click();
        return;
      }
      const send = document.querySelector(sendSelector);
      if (send instanceof HTMLElement) send.click();
    }, GEMINI_SEND_TOUCH_TARGET_SELECTOR, GEMINI_SEND_BUTTON_SELECTOR);
    await waitForGeminiSubmit(page, 10_000);
  }
}

export async function runGeminiNativeBrowserAttachmentPrompt(options: {
  runOptions: BrowserRunOptions;
  prompt: string;
  geminiUrl: string;
  timeoutMs: number;
  logger?: BrowserLogger;
}): Promise<BrowserRunResult> {
  const startTime = Date.now();
  const logger = options.logger ?? (() => undefined);
  const config = resolveBrowserConfig(
    { ...(options.runOptions.config ?? {}), target: 'gemini' },
    { auracallProfileName: options.runOptions.config?.auracallProfileName ?? null },
  );
  const launchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: options.runOptions.config?.auracallProfileName ?? null,
    browser: config,
    target: 'gemini',
  });
  const userDataDir = launchContext.managedProfileDir;
  const chromeProfile = launchContext.configuredChromeProfile;
  await mkdir(userDataDir, { recursive: true });
  await bootstrapManagedProfile({
    managedProfileDir: userDataDir,
    managedProfileName: chromeProfile,
    sourceCookiePath: launchContext.bootstrapCookiePath,
    logger,
  });

  const chrome = await launchChrome(config, userDataDir, logger);
  const chromeHost = (chrome as { host?: string }).host ?? '127.0.0.1';
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://${chromeHost}:${chrome.port}`,
      defaultViewport: null,
    });
    page = await browser.newPage();
    if (!config.headless && config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
      await hideChromeWindow(chrome, logger);
    }

    await page.goto(options.geminiUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector(GEMINI_PROMPT_SELECTOR, { visible: true, timeout: 45_000 });
    await page.waitForSelector(GEMINI_UPLOAD_BUTTON_SELECTOR, { visible: true, timeout: 45_000 });
    if (await isGeminiSignedOut(page)) {
      throw new Error(
        'Gemini login required; the opened Gemini page still shows a visible Sign in state. Finish signing in to gemini.google.com in the managed browser profile, then retry.',
      );
    }

    const attachmentPaths = (options.runOptions.attachments ?? []).map((attachment) => attachment.path);
    const attachmentNames = attachmentPaths.map((filePath) => path.basename(filePath));

    await triggerGeminiFileChooser(page, attachmentPaths);
    await waitForAttachmentPreview(page, attachmentNames, 20_000);

    await page.click(GEMINI_PROMPT_SELECTOR);
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('KeyA');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await page.keyboard.type(options.prompt);
    await submitGeminiPrompt(page, 20_000);

    const answerText = await waitForGeminiAnswer(page, {
      prompt: options.prompt,
      timeoutMs: options.timeoutMs,
    });
    const tookMs = Date.now() - startTime;
    return {
      answerText,
      answerMarkdown: answerText,
      tookMs,
      answerTokens: Math.ceil(answerText.length / 4),
      answerChars: answerText.length,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      chromeHost,
      userDataDir,
    };
  } finally {
    await page?.close().catch(() => undefined);
    browser?.disconnect();
    if (!config.keepBrowser && wasChromeLaunchedByAuracall(chrome)) {
      try {
        await chrome.kill();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
