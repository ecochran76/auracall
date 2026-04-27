#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import { BrowserAutomationClient } from '../src/browser/client.js';
import { connectToChromeTarget } from '../packages/browser-service/src/chromeLifecycle.js';
import { resolveConfig } from '../src/schema/resolver.js';

const DEFAULT_PROMPT = 'Generate an image of an asphalt secret agent';
const DEFAULT_DURATION_MS = 150_000;
const DEFAULT_INTERVAL_MS = 3_000;
const GROK_IMAGINE_URL = 'https://grok.com/imagine';

type Args = {
  profile?: string;
  prompt: string;
  durationMs: number;
  intervalMs: number;
  outputDir?: string;
  screenshotEvery: number;
};

type PollSnapshot = {
  at: string;
  elapsedMs: number;
  url: string;
  title: string;
  bodyText: string;
  statusText: string[];
  imageCount: number;
  generatedImageCount: number;
  visibleTileCount: number;
  selectedTileCount: number;
  playOverlayCount: number;
  downloadButtonCount: number;
  submitDisabled: boolean | null;
  submitAriaLabel: string | null;
  generationModes: Array<{ label: string; checked: string | null }>;
  speedModes: Array<{ label: string; checked: string | null }>;
  images: Array<{
    alt: string | null;
    src: string | null;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    visible: boolean;
    tileSurface: string | null;
    generated: boolean;
  }>;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    prompt: DEFAULT_PROMPT,
    durationMs: DEFAULT_DURATION_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    screenshotEvery: 5,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const entry = argv[index];
    const next = argv[index + 1];
    if (entry === '--profile' && next) {
      args.profile = next;
      index += 1;
    } else if (entry === '--prompt' && next) {
      args.prompt = next;
      index += 1;
    } else if (entry === '--duration-ms' && next) {
      args.durationMs = clampNumber(Number(next), 10_000, 600_000, DEFAULT_DURATION_MS);
      index += 1;
    } else if (entry === '--interval-ms' && next) {
      args.intervalMs = clampNumber(Number(next), 1_000, 30_000, DEFAULT_INTERVAL_MS);
      index += 1;
    } else if (entry === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (entry === '--screenshot-every' && next) {
      args.screenshotEvery = clampNumber(Number(next), 0, 100, 5);
      index += 1;
    } else if (entry === '--help' || entry === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${entry}`);
    }
  }
  return args;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

function printHelp(): void {
  console.log([
    'Usage: AURACALL_ALLOW_RAW_CDP=1 pnpm tsx scripts/browser-service/grok-imagine-passive-smoke.ts [options]',
    '',
    'Submits one Grok Imagine image prompt through AuraCall, then only passively polls the submitted tab.',
    '',
    'Options:',
    '  --profile <name>          AuraCall runtime profile',
    `  --prompt <text>           Prompt to submit (default: "${DEFAULT_PROMPT}")`,
    `  --duration-ms <ms>        Polling duration, 10000-600000 (default: ${DEFAULT_DURATION_MS})`,
    `  --interval-ms <ms>        Polling interval, 1000-30000 (default: ${DEFAULT_INTERVAL_MS})`,
    '  --output-dir <path>       Directory for JSONL and screenshots',
    '  --screenshot-every <n>    Capture every n polls; 0 disables screenshots',
  ].join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const outputDir = path.resolve(args.outputDir ?? path.join(os.tmpdir(), `auracall-grok-passive-${Date.now()}`));
  await fs.mkdir(outputDir, { recursive: true });
  const eventsPath = path.join(outputDir, 'events.jsonl');
  const userConfig = await resolveConfig({
    profile: args.profile,
    browser: true,
    browserTarget: 'grok',
    browserKeepBrowser: true,
  });
  const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'grok' });
  const progressEvents: unknown[] = [];
  console.log(`[grok-passive] output: ${outputDir}`);
  console.log('[grok-passive] submitting one prompt through AuraCall browser services');
  const promptResult = await client.runPrompt({
    prompt: args.prompt,
    capabilityId: 'grok.media.imagine_image',
    completionMode: 'prompt_submitted',
    configuredUrl: GROK_IMAGINE_URL,
    timeoutMs: Math.min(args.durationMs, 180_000),
    onProgress: (event) => {
      progressEvents.push({ at: new Date().toISOString(), ...event });
      console.log(`[grok-passive] progress: ${event.phase}`);
    },
  }, {
    configuredUrl: GROK_IMAGINE_URL,
    preserveActiveTab: true,
    mutationSourcePrefix: 'smoke:grok-imagine-passive',
  });
  await appendJsonl(eventsPath, {
    type: 'prompt_result',
    at: new Date().toISOString(),
    promptResult,
    progressEvents,
  });
  const tabTargetId = nonEmpty(promptResult.tabTargetId);
  const devtoolsPort = typeof promptResult.devtoolsPort === 'number' ? promptResult.devtoolsPort : null;
  if (!tabTargetId || !devtoolsPort) {
    throw new Error(`Prompt result missing tab target or DevTools port: ${JSON.stringify(promptResult)}`);
  }
  const devtoolsHost = nonEmpty(promptResult.devtoolsHost) ?? '127.0.0.1';
  const cdp = await connectToChromeTarget({ host: devtoolsHost, port: devtoolsPort, target: tabTargetId });
  await cdp.Page.enable().catch(() => undefined);
  try {
    console.log('[grok-passive] polling DOM only; no generated tile clicks or post-submit navigation');
    const startedAt = Date.now();
    let previousKey: string | null = null;
    for (let poll = 1; Date.now() - startedAt <= args.durationMs; poll += 1) {
      const elapsedMs = Date.now() - startedAt;
      const snapshot = await captureDomSnapshot(cdp, elapsedMs);
      const key = [
        snapshot.url,
        snapshot.generatedImageCount,
        snapshot.visibleTileCount,
        snapshot.downloadButtonCount,
        snapshot.submitDisabled,
        snapshot.statusText.join('|'),
        snapshot.images.map((image) => `${image.src}:${image.naturalWidth}x${image.naturalHeight}`).join('|'),
      ].join('::');
      const changed = key !== previousKey;
      previousKey = key;
      const screenshotPath = await maybeCaptureScreenshot({
        cdp,
        outputDir,
        poll,
        screenshotEvery: args.screenshotEvery,
        changed,
      });
      await appendJsonl(eventsPath, {
        type: 'poll',
        poll,
        changed,
        screenshotPath,
        snapshot,
      });
      console.log(formatPollLine(poll, changed, snapshot, screenshotPath));
      if (snapshot.generatedImageCount > 0) {
        await appendJsonl(eventsPath, {
          type: 'ready_observed',
          at: new Date().toISOString(),
          poll,
          elapsedMs,
          reason: 'generated_images_visible_in_passive_dom',
        });
        break;
      }
      await delay(Math.min(args.intervalMs, Math.max(0, args.durationMs - elapsedMs)));
    }
  } finally {
    await cdp.close().catch(() => undefined);
  }
  console.log(`[grok-passive] events: ${eventsPath}`);
}

async function captureDomSnapshot(cdp: Awaited<ReturnType<typeof connectToChromeTarget>>, elapsedMs: number): Promise<PollSnapshot> {
  const expression = `(() => {
    const textOf = (node) => (node && node.textContent ? node.textContent.trim().replace(/\\s+/g, ' ') : '');
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height), visible: rect.width > 0 && rect.height > 0 };
    };
    const srcKind = (value, tileRoot, rect) => {
      if (!value) return false;
      if (/\\/generated\\//.test(value) && rect.width >= 120 && rect.height >= 80) return true;
      if (/blob:/.test(value) && rect.width >= 120 && rect.height >= 80) return true;
      if (/data:image\\//.test(value) && tileRoot && rect.width >= 120 && rect.height >= 80) return true;
      return false;
    };
    const images = Array.from(document.querySelectorAll('img')).map((img) => {
      const rect = rectOf(img);
      const src = img.currentSrc || img.src || '';
      const tileRoot = img.closest('[id^="imagine-masonry-section"], [data-filmstrip-scroll="true"]');
      return {
        alt: img.getAttribute('alt'),
        src: src || null,
        width: rect.width,
        height: rect.height,
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
        visible: rect.visible,
        tileSurface: tileRoot?.matches?.('[data-filmstrip-scroll="true"]') ? 'filmstrip' : tileRoot ? 'masonry' : null,
        generated: srcKind(src, tileRoot, rect),
      };
    });
    const visibleTileSelectors = [
      '[data-filmstrip-item="true"]',
      '[id^="imagine-masonry-section"] img',
      'button:has(img)',
      'a:has(img)',
    ];
    const tileNodes = new Set();
    for (const selector of visibleTileSelectors) {
      try {
        for (const node of document.querySelectorAll(selector)) {
          const rect = node.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20) tileNodes.add(node);
        }
      } catch {}
    }
    const buttons = Array.from(document.querySelectorAll('button'));
    const submit = buttons.find((button) => (button.getAttribute('aria-label') || '').toLowerCase() === 'submit') || null;
    const statusText = Array.from(document.querySelectorAll('[role="status"], [aria-live], [data-state], .toast, .notification'))
      .map(textOf)
      .filter(Boolean)
      .slice(0, 20);
    const generationModes = Array.from(document.querySelectorAll('[role="radiogroup"][aria-label="Generation mode"] [role="radio"]'))
      .map((button) => ({ label: textOf(button), checked: button.getAttribute('aria-checked') }));
    const speedModes = Array.from(document.querySelectorAll('[role="radiogroup"][aria-label="Image generation speed"] [role="radio"]'))
      .map((button) => ({ label: textOf(button), checked: button.getAttribute('aria-checked') }));
    const playOverlayCount = Array.from(document.querySelectorAll('svg, [aria-label], button, [role="button"]'))
      .filter((node) => /play/i.test((node.getAttribute('aria-label') || '') + ' ' + textOf(node))).length;
    const downloadButtonCount = buttons.filter((button) => /download/i.test((button.getAttribute('aria-label') || '') + ' ' + textOf(button))).length;
    return {
      at: new Date().toISOString(),
      elapsedMs: ${elapsedMs},
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 500),
      statusText,
      imageCount: images.length,
      generatedImageCount: images.filter((image) => image.generated && image.visible).length,
      visibleTileCount: tileNodes.size,
      selectedTileCount: Array.from(document.querySelectorAll('[data-filmstrip-item="true"][tabindex="0"], .ring-white')).length,
      playOverlayCount,
      downloadButtonCount,
      submitDisabled: submit ? submit.disabled : null,
      submitAriaLabel: submit ? submit.getAttribute('aria-label') : null,
      generationModes,
      speedModes,
      images: images.filter((image) => image.visible).slice(0, 40),
    };
  })()`;
  const { result, exceptionDetails } = await cdp.Runtime.evaluate({ expression, returnByValue: true });
  if (exceptionDetails) {
    throw new Error(`DOM snapshot failed: ${exceptionDetails.text ?? 'Runtime.evaluate exception'}`);
  }
  return result.value as PollSnapshot;
}

async function maybeCaptureScreenshot(input: {
  cdp: Awaited<ReturnType<typeof connectToChromeTarget>>;
  outputDir: string;
  poll: number;
  screenshotEvery: number;
  changed: boolean;
}): Promise<string | null> {
  if (input.screenshotEvery <= 0) return null;
  if (!input.changed && input.poll % input.screenshotEvery !== 0) return null;
  const screenshot = await input.cdp.Page.captureScreenshot({ format: 'jpeg', quality: 80 }).catch(() => null);
  if (!screenshot?.data) return null;
  const screenshotPath = path.join(input.outputDir, `poll-${String(input.poll).padStart(3, '0')}.jpg`);
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
}

function formatPollLine(
  poll: number,
  changed: boolean,
  snapshot: PollSnapshot,
  screenshotPath: string | null,
): string {
  return [
    `[grok-passive] poll=${poll}`,
    `changed=${changed ? 'yes' : 'no'}`,
    `elapsed=${snapshot.elapsedMs}ms`,
    `images=${snapshot.generatedImageCount}/${snapshot.imageCount}`,
    `tiles=${snapshot.visibleTileCount}`,
    `downloads=${snapshot.downloadButtonCount}`,
    `submitDisabled=${snapshot.submitDisabled}`,
    `url=${snapshot.url}`,
    screenshotPath ? `screenshot=${path.basename(screenshotPath)}` : null,
  ].filter(Boolean).join(' ');
}

async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`);
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('[grok-passive] FAIL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
