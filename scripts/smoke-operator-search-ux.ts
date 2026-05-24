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
    const reconciliationRequests: Array<Record<string, unknown>> = [];
    page.on('pageerror', (error: unknown) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.pathname === '/v1/search') {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(operatorSearchFixture()),
        });
        return;
      }
      if (requestUrl.pathname === '/v1/account-mirrors/materializations' && request.method() === 'POST') {
        const parsed = parseJsonObject(request.postData() || '{}');
        reconciliationRequests.push(parsed);
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            object: 'history_materialization_job_create_result',
            job: {
              object: 'history_materialization_job',
              id: 'hmj_search_reconcile_1',
              status: 'queued',
              provider: 'gemini',
              runtimeProfile: 'auracall-gemini-pro',
              source: { type: 'catalog_item', catalogItemId: 'gemini_conv_1', catalogKind: 'conversations' },
              createdAt: '2026-05-23T12:00:00.000Z',
              updatedAt: '2026-05-23T12:00:00.000Z',
            },
          }),
        });
        return;
      }
      if (requestUrl.pathname === '/v1/account-mirrors/materializations/hmj_search_reconcile_1') {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            object: 'history_materialization_job',
            id: 'hmj_search_reconcile_1',
            status: 'succeeded',
            provider: 'gemini',
            runtimeProfile: 'auracall-gemini-pro',
          }),
        });
        return;
      }
      void request.continue();
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
    await page.goto(`http://127.0.0.1:${server.port}/dashboard?nav=search&kind=conversation`, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });
    await page.waitForSelector('.search-command-bar', { timeout: 15_000 });
    await page.waitForSelector('button[aria-label="Reconcile conversation"]', { timeout: 15_000 });
    await page.click('button[aria-label="Reconcile conversation"]');
    await waitForCondition(
      () => reconciliationRequests.length > 0,
      5_000,
      'Search conversation row did not POST a reconciliation request.',
    );
    const reconciliationRequest = reconciliationRequests[0];
    assertObjectIncludes(reconciliationRequest, {
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      catalogItemId: 'gemini_conv_1',
      catalogKind: 'conversations',
      refreshSnapshot: true,
      force: false,
    }, 'Search conversation row reconciliation payload');
    if (!Array.isArray(reconciliationRequest.assetKinds) || reconciliationRequest.assetKinds[0] !== 'all') {
      throw new Error(`Search conversation row reconciliation assetKinds drifted: ${JSON.stringify(reconciliationRequest)}.`);
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
        conversationReconcileAction: 'ok',
      },
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function operatorSearchFixture(): Record<string, unknown> {
  return {
    object: 'search_projection',
    generatedAt: '2026-05-23T12:00:00.000Z',
    nextCursor: null,
    metrics: { rows: 2 },
    rows: [
      {
        id: 'artifact-row-1',
        source: 'archive',
        kind: 'artifact',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        tenant: 'ecochran76@gmail.com',
        projectId: 'design-review',
        title: 'Cached readout artifact',
        summary: 'A deterministic cached artifact for Search smoke coverage.',
        status: 'succeeded',
        sortTime: '2026-05-23T12:00:00.000Z',
        updatedAt: '2026-05-23T12:00:00.000Z',
        itemId: 'generated-artifact:resp_1:artifact_1',
        counts: { messages: 0, files: 1, artifacts: 1 },
        links: {
          provider: 'https://chatgpt.com/c/resp_1',
          archiveItem: '/v1/archive/items/b64/Z2VuZXJhdGVkLWFydGlmYWN0OnJlc3BfMTphcnRpZmFjdF8x',
          asset: '/v1/archive/items/b64/Z2VuZXJhdGVkLWFydGlmYWN0OnJlc3BfMTphcnRpZmFjdF8x/asset',
        },
        metadata: {
          fileAvailable: true,
          materializationStatus: 'succeeded',
          assetFreshness: {
            availability: 'available',
            materializedAt: '2026-05-23T12:00:00.000Z',
            materializationJobId: 'ramj_smoke_1',
          },
        },
      },
      {
        id: 'conversation-row-1',
        source: 'account-mirror',
        kind: 'conversation',
        provider: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        tenant: 'ecochran76@gmail.com',
        projectId: 'none',
        title: 'Recent Gemini image chat',
        summary: 'A cached conversation row that can be reconciled on demand.',
        status: 'cached',
        sortTime: '2026-05-23T11:59:00.000Z',
        updatedAt: '2026-05-23T11:59:00.000Z',
        itemId: 'gemini_conv_1',
        counts: { messages: 6, files: 0, artifacts: 1 },
        links: {
          provider: 'https://gemini.google.com/app/gemini_conv_1',
          catalogItem: '/v1/account-mirrors/catalog/items/gemini_conv_1?provider=gemini&runtimeProfile=auracall-gemini-pro&kind=conversations',
        },
        metadata: {
          fileAvailable: null,
        },
      },
    ],
    facets: {
      providers: [
        { value: 'chatgpt', count: 1 },
        { value: 'gemini', count: 1 },
      ],
      statuses: [
        { value: 'cached', count: 1 },
        { value: 'succeeded', count: 1 },
      ],
      assetAvailability: [
        { value: 'available', count: 1 },
        { value: 'pending', count: 1 },
      ],
      materialization: [
        { value: 'succeeded', count: 1 },
      ],
    },
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function assertObjectIncludes(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  label: string,
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${label}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}.`);
    }
  }
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number, message: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
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
