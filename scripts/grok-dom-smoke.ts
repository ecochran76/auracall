#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { getOracleHomeDir } from '../src/oracleHome.js';
import { isDevToolsResponsive } from '../src/browser/processCheck.js';

const DEFAULT_URL = 'https://grok.com/';
const DEFAULT_MODE = 'Grok 4.1 Thinking';

const PROMPT_SELECTOR = 'div.ProseMirror[contenteditable="true"]';
const SEND_SELECTOR = 'button[aria-label="Submit"][type="submit"]';
const MODEL_SELECTOR = 'button[aria-label="Model select"]';
const ATTACH_SELECTOR = 'button[aria-label="Attach"]';
const FILE_INPUT_SELECTOR = 'input[type="file"]';
const MENU_ITEM_SELECTOR = '[role="menuitem"]';

async function resolveTarget(): Promise<{ host: string; port: number }> {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (!raw) return findTargetFromRegistry();
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return { host: '127.0.0.1', port: parsed };
  }
  return findTargetFromRegistry();
}

async function findTargetFromRegistry(): Promise<{ host: string; port: number }> {
  const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
  try {
    const raw = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(raw) as {
      instances?: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string }>;
    };
    const candidates = Object.values(registry.instances ?? {})
      .filter((instance) => typeof instance.port === 'number' && instance.port > 0)
      .sort((a, b) => {
        const aTime = Date.parse(a.lastSeenAt || a.launchedAt || '') || 0;
        const bTime = Date.parse(b.lastSeenAt || b.launchedAt || '') || 0;
        return bTime - aTime;
      });
    for (const instance of candidates) {
      const host = instance.host || '127.0.0.1';
      const port = instance.port as number;
      if (await isDevToolsResponsive({ host, port, attempts: 2, timeoutMs: 750 })) {
        return { host, port };
      }
    }
  } catch {
    // ignore registry read errors
  }
  throw new Error(
    'No DevTools port found. Set ORACLE_BROWSER_PORT or launch Grok via oracle so it registers.',
  );
}

function resolveUrl(): string {
  return process.env.ORACLE_GROK_URL ?? process.env.GROK_URL ?? process.argv[2] ?? DEFAULT_URL;
}

function resolveMode(): string {
  return process.env.ORACLE_GROK_MODE ?? process.argv[3] ?? DEFAULT_MODE;
}

async function main() {
  const { host, port } = await resolveTarget();
  const url = resolveUrl();
  const mode = resolveMode();
  const browserURL = `http://${host}:${port}`;

  const browser = await puppeteer.connect({ browserURL, defaultViewport: null });
  let page = (await browser.pages()).at(-1);
  if (!page) {
    page = await browser.newPage();
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const currentUrl = page.url();
  if (currentUrl.includes('accounts.x.ai') || currentUrl.includes('sign-in')) {
    throw new Error(`Grok login required; redirected to ${currentUrl}`);
  }

  const prompt = await page.waitForSelector(PROMPT_SELECTOR, { timeout: 15000 });
  if (!prompt) throw new Error('Prompt selector not found.');

  const sendButton = await page.$(SEND_SELECTOR);
  if (!sendButton) throw new Error('Send button selector not found.');

  const modelButton = await page.$(MODEL_SELECTOR);
  if (!modelButton) throw new Error('Model selector button not found.');

  const attachButton = await page.$(ATTACH_SELECTOR);
  if (!attachButton) throw new Error('Attach button selector not found.');

  const fileInput = await page.$(FILE_INPUT_SELECTOR);
  if (!fileInput) throw new Error('File input selector not found.');

  await prompt.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.waitForSelector(MENU_ITEM_SELECTOR, { timeout: 5000 });

  const labels = await page.$$eval(MENU_ITEM_SELECTOR, (items) =>
    items.map((item) => item.textContent?.trim() ?? '').filter(Boolean),
  );

  const normalizedMode = mode.trim().toLowerCase();
  const clicked = await page.evaluate((selector, target) => {
    const items = Array.from(document.querySelectorAll(selector));
    for (const item of items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (text === target || text.startsWith(target)) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, MENU_ITEM_SELECTOR, normalizedMode);

  if (!clicked) {
    throw new Error(`Model menu item not found for "${mode}". Items: ${labels.join(', ')}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  const buttonLabel = await page.$eval(MODEL_SELECTOR, (el) => el.textContent?.trim() ?? '');
  if (!buttonLabel.toLowerCase().includes(normalizedMode)) {
    throw new Error(`Model selector did not update (got "${buttonLabel}", expected "${mode}").`);
  }

  console.log(`[grok-smoke] PASS: selectors + model switch OK`);
  console.log(`[grok-smoke] URL: ${currentUrl}`);
  console.log(`[grok-smoke] Mode: ${buttonLabel}`);
  await browser.disconnect();
}

main().catch((error) => {
  console.error('[grok-smoke] FAIL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
