#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-operator-search-ux-smoke-'));
  setAuracallHomeDirOverrideForTest(homeDir);
  const server = await createResponsesHttpServer({
    host: '127.0.0.1',
    port: 0,
    accountMirrorSchedulerIntervalMs: 0,
    recoverRunsOnStart: false,
  });
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: await resolveChromeExecutable(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error: unknown) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    });
    await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
    const url = `http://127.0.0.1:${server.port}/dashboard?nav=search&kind=artifact&assets=available&materialization=succeeded`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForSelector('.search-command-bar', { timeout: 15_000 });
    await assertSearchState(page, {
      expectedAssetsParam: true,
      expectedMaterializationParam: true,
      label: 'desktop Search dashboard',
    });

    await page.setViewport({ width: 390, height: 860, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForSelector('.search-command-bar', { timeout: 15_000 });
    await assertSearchState(page, {
      expectedAssetsParam: true,
      expectedMaterializationParam: true,
      label: 'mobile Search dashboard',
    });
    const mobileOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    if (mobileOverflow) {
      throw new Error('mobile Search dashboard has page-level horizontal overflow.');
    }
    const mobileViewportTop = await page.evaluate(() =>
      document.querySelector('.search-viewport')?.getBoundingClientRect().top ?? 999
    );
    if (mobileViewportTop > 90) {
      throw new Error(`mobile Search viewport starts too low: ${mobileViewportTop}.`);
    }
    const mobileTable = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.search-table-head .search-th')] as HTMLElement[];
      const titleHeader = headers.find((element) => element.textContent?.toLowerCase().includes('title'));
      const tenantHeader = headers.find((element) => element.textContent?.toLowerCase().includes('tenant'));
      const actionHeader = headers.find((element) => element.textContent?.toLowerCase().includes('actions'));
      const titleRect = titleHeader?.getBoundingClientRect();
      const clientWidth = document.documentElement.clientWidth;
      const visibleTitleWidth = titleRect
        ? Math.max(0, Math.min(titleRect.right, clientWidth) - Math.max(titleRect.left, 0))
        : 0;
      return {
        visibleTitleWidth,
        hasTenantHeader: Boolean(tenantHeader),
        actionPosition: actionHeader ? getComputedStyle(actionHeader).position : null,
      };
    });
    if (mobileTable.visibleTitleWidth < 120) {
      throw new Error(`mobile Search table title column is too compressed: ${JSON.stringify(mobileTable)}.`);
    }
    if (mobileTable.hasTenantHeader) {
      throw new Error(`mobile Search table should use the compact column set: ${JSON.stringify(mobileTable)}.`);
    }
    if (mobileTable.actionPosition === 'sticky') {
      throw new Error(`mobile Search table actions should not overlay content: ${JSON.stringify(mobileTable)}.`);
    }

    await page.click('button.search-asset-toggle');
    await page.waitForFunction(() => !location.href.includes('assets=available'), { timeout: 5_000 });
    const afterToggle = await page.evaluate(() => ({
      href: location.href,
      pressed: document.querySelector('button.search-asset-toggle')?.getAttribute('aria-pressed') ?? null,
    }));
    if (afterToggle.pressed !== 'false') {
      throw new Error(`asset toggle aria-pressed: expected false, got ${String(afterToggle.pressed)}.`);
    }
    if (afterToggle.href.includes('assets=available')) {
      throw new Error(`asset toggle did not clear assets=available: ${afterToggle.href}.`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Search dashboard page errors: ${pageErrors.join('; ')}`);
    }

    console.log(JSON.stringify({
      ok: true,
      port: server.port,
      checks: {
        desktopUrlFilters: 'ok',
        mobileUrlFilters: 'ok',
        cachedAssetToggle: 'ok',
        copySearchUrlAction: 'ok',
        shippedContextBadges: 'ok',
        mobilePaneLayout: 'ok',
        mobileTitleColumn: 'ok',
        mobileActionsOverlay: 'ok',
        mobileHorizontalOverflow: false,
      },
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function assertSearchState(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>,
  input: {
    expectedAssetsParam: boolean;
    expectedMaterializationParam: boolean;
    label: string;
  },
): Promise<void> {
  const state = await page.evaluate(() => ({
    href: location.href,
    bodyText: document.body.innerText,
    hasAssetToggle: Boolean(document.querySelector('button.search-asset-toggle')),
    hasCopySearchUrl: [...document.querySelectorAll('button[aria-label],button[title]')].some((element) =>
      (element.getAttribute('aria-label') || element.getAttribute('title')) === 'Copy current Search URL'
    ),
  }));
  if (input.expectedAssetsParam && !state.href.includes('assets=available')) {
    throw new Error(`${input.label}: URL did not preserve assets=available: ${state.href}.`);
  }
  if (input.expectedMaterializationParam && !state.href.includes('materialization=succeeded')) {
    throw new Error(`${input.label}: URL did not preserve materialization=succeeded: ${state.href}.`);
  }
  if (!state.bodyText.includes('Available') || !state.bodyText.includes('Done')) {
    throw new Error(`${input.label}: cache-state and materialization controls were not rendered.`);
  }
  if (!state.hasAssetToggle) {
    throw new Error(`${input.label}: available cached assets toggle was not rendered.`);
  }
  if (!state.hasCopySearchUrl) {
    throw new Error(`${input.label}: copy-current-search-url action was not rendered.`);
  }
  if (/\b(?:planned|draft)\b/iu.test(state.bodyText)) {
    throw new Error(`${input.label}: shipped Search context still renders planned/draft labels.`);
  }
}

async function resolveChromeExecutable(): Promise<string> {
  const explicit = process.env.AURACALL_OPERATOR_UX_SMOKE_CHROME_PATH;
  const candidates = [
    explicit,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known local browser path.
    }
  }
  throw new Error(
    'No Chromium executable found for operator Search UX smoke. Set AURACALL_OPERATOR_UX_SMOKE_CHROME_PATH.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
