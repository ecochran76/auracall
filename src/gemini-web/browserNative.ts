import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page, Target } from 'puppeteer-core';
import { launchChrome, hideChromeWindow, wasChromeLaunchedByAuracall } from '../browser/chromeLifecycle.js';
import { openOrReuseChromeTarget } from '../../packages/browser-service/src/chromeLifecycle.js';
import { resolveBrowserConfig } from '../browser/config.js';
import { bootstrapManagedProfile } from '../browser/profileStore.js';
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from '../browser/service/profileResolution.js';
import type { BrowserRunOptions, BrowserRunResult, BrowserLogger } from '../browser/types.js';

const GEMINI_PROMPT_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]';
const GEMINI_UPLOAD_BUTTON_SELECTOR = 'button[aria-label="Open upload file menu"]';
const GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR = `${GEMINI_UPLOAD_BUTTON_SELECTOR} .mat-mdc-button-touch-target`;
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

function isTransientGeminiPageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /frame got detached|requesting main frame too early/i.test(message);
}

function resolveChromeTargetId(target: { id?: string; targetId?: string } | null | undefined): string | null {
  if (!target) return null;
  return typeof target.id === 'string'
    ? target.id
    : typeof target.targetId === 'string'
      ? target.targetId
      : null;
}

async function waitForPuppeteerPageTarget(browser: Browser, targetId: string, timeoutMs: number): Promise<Page> {
  const target = await browser.waitForTarget(
    (candidate) => ((candidate as Target & { _targetId?: string })._targetId ?? null) === targetId,
    { timeout: timeoutMs },
  );
  const page = await target.page();
  if (!page) {
    throw new Error(`Gemini browser target ${targetId} did not resolve to a Puppeteer page.`);
  }
  return page;
}

async function closeCompetingGeminiPages(browser: Browser, selectedTargetId: string): Promise<void> {
  const pages = await browser.pages();
  await Promise.all(
    pages.map(async (candidate) => {
      const candidateTargetId = ((candidate.target() as Target & { _targetId?: string })._targetId ?? null);
      if (candidateTargetId === selectedTargetId) {
        return;
      }
      let url = '';
      try {
        url = candidate.url();
      } catch {
        url = '';
      }
      if (!url.startsWith('https://gemini.google.com/')) {
        return;
      }
      await candidate.close().catch(() => undefined);
    }),
  );
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

export function detectGeminiNativeAttachmentFailure(currentText: string): string | null {
  const text = normalizeWhitespace(currentText).toLowerCase();
  if (text.includes('image upload failed')) {
    return 'Gemini native image upload failed on the page before the prompt was answered.';
  }
  if (text.includes('image not received, please re-upload')) {
    return 'Gemini reported that the uploaded image was not received and must be re-uploaded.';
  }
  return null;
}

async function triggerGeminiFileChooser(page: Page, attachmentPaths: string[]): Promise<void> {
  const imageOnly = attachmentPaths.length > 0 && attachmentPaths.every(isLikelyImagePath);
  let menuReady = false;
  let lastMenuError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.bringToFront();
      if (await page.$(GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR)) {
        await page.click(GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR);
      } else {
        await page.click(GEMINI_UPLOAD_BUTTON_SELECTOR);
      }
      await page.waitForSelector(GEMINI_UPLOAD_FILES_MENU_SELECTOR, { visible: true, timeout: 10_000 });
      menuReady = true;
      break;
    } catch (error) {
      lastMenuError = error;
      if (!isTransientGeminiPageError(error) || attempt > 0) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  if (!menuReady) {
    throw lastMenuError instanceof Error ? lastMenuError : new Error('Gemini upload menu did not become ready.');
  }

  if (imageOnly) {
    const files = await Promise.all(
      attachmentPaths.map(async (filePath) => ({
        name: path.basename(filePath),
        mimeType:
          path.extname(filePath).toLowerCase() === '.jpg' || path.extname(filePath).toLowerCase() === '.jpeg'
            ? 'image/jpeg'
            : path.extname(filePath).toLowerCase() === '.gif'
              ? 'image/gif'
              : path.extname(filePath).toLowerCase() === '.webp'
                ? 'image/webp'
                : path.extname(filePath).toLowerCase() === '.svg'
                  ? 'image/svg+xml'
                  : 'image/png',
        base64: (await readFile(filePath)).toString('base64'),
      })),
    );
    const dispatched = await page.evaluate(`(() => {
      const selector = ${JSON.stringify(GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR)};
      const payloads = ${JSON.stringify(files)};
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) return false;
      const decode = (b64) => Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
      const event = new Event('fileSelected', { bubbles: false, cancelable: true });
      event.files = payloads.map((file) => new File([decode(file.base64)], file.name, { type: file.mimeType }));
      return target.dispatchEvent(event);
    })()`);
    if (dispatched) {
      return;
    }
  }

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

async function readGeminiNativeState(page: Page): Promise<{
  historyText: string;
  promptText: string;
  hasPendingBlob: boolean;
  hasRemoveButton: boolean;
}> {
  const result = await page.evaluate(
    (promptSelector: string, historySelector: string) => {
      const prompt = document.querySelector(promptSelector);
      const history = document.querySelector(historySelector);
      const hasPendingBlob = Array.from(document.querySelectorAll('img')).some((el) => {
        const src = String(el.getAttribute('src') ?? '');
        if (!src.startsWith('blob:')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const hasRemoveButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((el) =>
        String(el.getAttribute('aria-label') ?? '').toLowerCase().includes('remove file'),
      );
      return {
        historyText: String(history?.innerText ?? history?.textContent ?? ''),
        promptText: String(prompt?.textContent ?? ''),
        hasPendingBlob,
        hasRemoveButton,
      };
    },
    GEMINI_PROMPT_SELECTOR,
    GEMINI_HISTORY_SELECTOR,
  );
  return {
    historyText: typeof result.historyText === 'string' ? result.historyText : '',
    promptText: typeof result.promptText === 'string' ? result.promptText : '',
    hasPendingBlob: Boolean(result.hasPendingBlob),
    hasRemoveButton: Boolean(result.hasRemoveButton),
  };
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
  let lastState: Awaited<ReturnType<typeof readGeminiNativeState>> | null = null;

  while (Date.now() < deadline) {
    const state = await readGeminiNativeState(page);
    lastState = state;
    const currentText = state.historyText;
    const attachmentFailure = detectGeminiNativeAttachmentFailure(currentText);
    if (attachmentFailure) {
      throw new Error(attachmentFailure);
    }
    const answer = extractGeminiAnswerText({
      currentText,
      prompt: options.prompt,
    });

    const promptText = normalizeWhitespace(state.promptText);
    if (promptText.length > 0 && !state.hasPendingBlob && !state.hasRemoveButton) {
      throw new Error('Gemini prompt remained in the composer after the attachment vanished and no response materialized.');
    }

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

  if (lastState) {
    const promptText = normalizeWhitespace(lastState.promptText);
    if (promptText.length > 0 && !lastState.hasPendingBlob && !lastState.hasRemoveButton) {
      throw new Error('Gemini prompt remained in the composer after the attachment vanished and no response materialized.');
    }
    if (promptText.length > 0 && (lastState.hasPendingBlob || lastState.hasRemoveButton)) {
      throw new Error('Gemini prompt remained pending with the attachment still staged and no response materialized.');
    }
  }

  throw new Error('Timed out waiting for Gemini browser-native attachment response.');
}

async function waitForAttachmentPreview(
  page: Page,
  attachmentNames: string[],
  timeoutMs: number,
): Promise<void> {
  await page.waitForFunction(
    (names: string[], imageNames: string[]) => {
      const previews = Array.from(document.querySelectorAll('[data-test-id="file-preview"]'));
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
      const visibleImages = Array.from(document.querySelectorAll('img')).filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = globalThis.getComputedStyle?.(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const src = String(el.getAttribute('src') ?? '');
        return src.startsWith('blob:');
      });
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
        const isImageName = imageNames.includes(name);
        const hasImagePreview = isImageName && visibleImages.length > 0;
        return hasRemove || hasPreview || hasImagePreview;
      });
    },
    { timeout: timeoutMs },
    attachmentNames,
    attachmentNames.filter(isLikelyImagePath),
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

async function waitForGeminiSubmit(page: Page, promptText: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const normalizedPrompt = normalizeWhitespace(promptText);
  while (Date.now() < deadline) {
    const state = await page.evaluate(
      (promptSelector: string, sendSelector: string, expectedPrompt: string) => {
        const prompt = document.querySelector(promptSelector);
        const send = document.querySelector(sendSelector);
        const composerText = String(prompt?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const ariaDisabled = String(send?.getAttribute?.('aria-disabled') ?? '').toLowerCase();
        const disabled = Boolean(send?.hasAttribute?.('disabled'));
        const history = document.querySelector('[data-test-id="chat-history-container"]');
        const historyText = String(history?.innerText ?? history?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const promptInHistory =
          expectedPrompt.length > 0 &&
          (historyText.includes(expectedPrompt) || historyText.includes(expectedPrompt.slice(0, 80)));
        const nativeFailure =
          historyText.toLowerCase().includes('image upload failed') ||
          historyText.toLowerCase().includes('image not received, please re-upload');
        const hasPendingBlob = Array.from(document.querySelectorAll('img')).some((el) => {
          const src = String(el.getAttribute('src') ?? '');
          if (!src.startsWith('blob:')) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const hasRemoveButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((el) =>
          String(el.getAttribute('aria-label') ?? '').toLowerCase().includes('remove file'),
        );
        return {
          composerText,
          ariaDisabled,
          disabled,
          promptInHistory,
          nativeFailure,
          hasPendingBlob,
          hasRemoveButton,
        };
      },
      GEMINI_PROMPT_SELECTOR,
      GEMINI_SEND_BUTTON_SELECTOR,
      normalizedPrompt,
    );

    if (state.promptInHistory || state.nativeFailure || state.composerText.length === 0 || state.ariaDisabled === 'true' || state.disabled) {
      return;
    }

    if (state.composerText.length > 0 && !state.hasPendingBlob && !state.hasRemoveButton) {
      throw new Error('Gemini native attachment disappeared before the prompt committed to history.');
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Gemini prompt did not commit before timeout.');
}

async function submitGeminiPrompt(page: Page, promptText: string, timeoutMs: number): Promise<void> {
  await waitForGeminiSendReady(page, timeoutMs);
  try {
    await page.bringToFront();
    await page.focus(GEMINI_PROMPT_SELECTOR);
    await page.keyboard.press('Enter');
    await waitForGeminiSubmit(page, promptText, 10_000);
    return;
  } catch {
    if (await page.$(GEMINI_SEND_TOUCH_TARGET_SELECTOR)) {
      await page.click(GEMINI_SEND_TOUCH_TARGET_SELECTOR);
    } else {
      await page.click(GEMINI_SEND_BUTTON_SELECTOR);
    }
    try {
      await waitForGeminiSubmit(page, promptText, 10_000);
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
      await waitForGeminiSubmit(page, promptText, 10_000);
    }
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
    const opened = await openOrReuseChromeTarget(chrome.port, options.geminiUrl, {
      host: chromeHost,
      logger,
      reusePolicy: 'new',
      blankTabLimit: 0,
    });
    const targetId = resolveChromeTargetId(opened.target);
    if (!targetId) {
      throw new Error('Gemini native browser run did not get a Chrome target id.');
    }
    page = await waitForPuppeteerPageTarget(browser, targetId, 15_000);
    await closeCompetingGeminiPages(browser, targetId);
    await page.bringToFront();
    if (!config.headless && config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
      await hideChromeWindow(chrome, logger);
    }

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
    await submitGeminiPrompt(page, options.prompt, 20_000);

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
