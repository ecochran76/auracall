import { Command } from 'commander';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import {
  buildBrowserDomSearchExpression,
  type BrowserDomSearchMatch,
  type BrowserDomSearchOptions,
} from './service/domSearch.js';

/** Utility type so TypeScript knows the async function constructor */
type AsyncFunctionCtor = new (...args: string[]) => (...fnArgs: unknown[]) => Promise<unknown>;

export interface BrowserToolsPortResolverOptions {
  port?: number;
  chromePath?: string;
  profileDir?: string;
  copyProfile?: boolean;
  auracallProfile?: string;
  browserTarget?: 'chatgpt' | 'gemini' | 'grok';
}

export interface BrowserToolsCliOptions {
  resolvePortOrLaunch: (options: BrowserToolsPortResolverOptions) => Promise<number>;
  argv?: string[];
  defaultChromeBin?: string;
  defaultProfileDir?: string;
}

export interface BrowserToolsPageCandidate {
  url: string;
  focused: boolean;
  title?: string | null;
  readyState?: string | null;
  visibilityState?: string | null;
}

export type BrowserToolsPageSelectionReason =
  | 'url-contains'
  | 'focused'
  | 'non-internal-page'
  | 'last-page';

export interface BrowserToolsPageSelectionCandidate extends BrowserToolsPageCandidate {
  index: number;
  selected: boolean;
  matchesUrlContains: boolean;
  selectionReasons: BrowserToolsPageSelectionReason[];
  isBlank: boolean;
  isBrowserInternal: boolean;
}

export interface BrowserToolsPageSelectionExplanation {
  selectedIndex: number;
  selectedReason: BrowserToolsPageSelectionReason | null;
  candidates: BrowserToolsPageSelectionCandidate[];
}

export interface BrowserToolsTabCensusEntry extends BrowserToolsPageSelectionCandidate {}

export interface BrowserToolsTabCensusResult extends BrowserToolsPageSelectionExplanation {
  selectedTab: BrowserToolsTabCensusEntry | null;
  tabs: BrowserToolsTabCensusEntry[];
}

export interface BrowserToolsVisibleCounts {
  buttons: number;
  links: number;
  inputs: number;
  textareas: number;
  contenteditables: number;
}

export interface BrowserToolsDocumentProbe {
  url: string;
  title: string | null;
  readyState: string | null;
  visibilityState: string | null;
  focused: boolean;
  scriptCount: number;
  bodyTextLength: number;
  visibleCounts: BrowserToolsVisibleCounts;
}

export interface BrowserToolsSelectorProbe {
  selector: string;
  matched: number;
  visible: number;
  firstVisibleTag: string | null;
  firstVisibleText: string | null;
}

export interface BrowserToolsScriptTextProbe {
  enabled: boolean;
  scriptSelector: string;
  scriptCount: number;
  matched: boolean;
  matchedAny: string[];
  missingAll: string[];
  preview: string | null;
}

export interface BrowserToolsStorageProbe {
  localStorageCount: number;
  sessionStorageCount: number;
  sampleLocalStorageKeys: string[];
  sampleSessionStorageKeys: string[];
  matchedAny: string[];
  missingAll: string[];
}

export interface BrowserToolsCookieProbe {
  cookieCount: number;
  sampleNames: string[];
  domains: string[];
  matchedAny: string[];
  missingAll: string[];
}

export interface BrowserToolsPageProbeResult {
  document: BrowserToolsDocumentProbe;
  blockingState: BrowserToolsBlockingState | null;
  selectors: BrowserToolsSelectorProbe[];
  scriptText: BrowserToolsScriptTextProbe | null;
  storage: BrowserToolsStorageProbe | null;
  cookies: BrowserToolsCookieProbe | null;
}

export interface BrowserToolsBlockingState {
  kind: 'google-sorry' | 'captcha' | 'cloudflare' | 'human-verification';
  summary: string;
  requiresHuman: boolean;
}

export interface BrowserToolsPageProbeOptions {
  selectors?: string[];
  scriptAny?: string[];
  scriptAll?: string[];
  scriptSelector?: string;
  storageAny?: string[];
  storageAll?: string[];
  cookieAny?: string[];
  cookieAll?: string[];
  caseSensitive?: boolean;
}

export interface BrowserToolsDoctorReport {
  census: BrowserToolsTabCensusResult;
  pageProbe: BrowserToolsPageProbeResult | null;
  uiList: BrowserToolsUiListResult | null;
}

export type BrowserToolsDomSearchMatch = BrowserDomSearchMatch;

export interface BrowserToolsDomSearchResult {
  url: string;
  title: string | null;
  totalScanned: number;
  matched: BrowserToolsDomSearchMatch[];
}

export type BrowserToolsDomSearchOptions = BrowserDomSearchOptions;

export interface BrowserToolsUiListItem {
  tag: string;
  role: string | null;
  text: string | null;
  ariaLabel: string | null;
  title: string | null;
  dataTestId: string | null;
  className: string | null;
  href: string | null;
  checked: boolean | null;
  expanded: boolean | null;
  disabled: boolean | null;
  visible: boolean;
  inputType: string | null;
  widgetType: string | null;
  pathHint: string | null;
  interactionHints: string[];
}

export interface BrowserToolsUiListSummary {
  buttons: number;
  menuItems: number;
  switches: number;
  inputs: number;
  links: number;
  dialogs: number;
  menus: number;
  fileInputs: number;
  uploadCandidates: number;
}

export interface BrowserToolsUiListSections {
  buttons: BrowserToolsUiListItem[];
  menuItems: BrowserToolsUiListItem[];
  switches: BrowserToolsUiListItem[];
  inputs: BrowserToolsUiListItem[];
  links: BrowserToolsUiListItem[];
  dialogs: BrowserToolsUiListItem[];
  menus: BrowserToolsUiListItem[];
  fileInputs: BrowserToolsUiListItem[];
  uploadCandidates: BrowserToolsUiListItem[];
}

export interface BrowserToolsUiListResult {
  url: string;
  title: string | null;
  totalScanned: number;
  summary: BrowserToolsUiListSummary;
  sections: BrowserToolsUiListSections;
}

export interface BrowserToolsUiListOptions {
  selector?: string | null;
  visibleOnly?: boolean;
  caseSensitive?: boolean;
  limitPerKind?: number;
  maxScan?: number;
}

export const BROWSER_TOOLS_CONTRACT_VERSION = 1 as const;

export interface BrowserToolsProbeContract {
  contract: 'browser-tools.page-probe';
  version: typeof BROWSER_TOOLS_CONTRACT_VERSION;
  generatedAt: string;
  selection: {
    selectedIndex: number | null;
    selectedReason: BrowserToolsPageSelectionReason | null;
    selectedTab: BrowserToolsTabCensusEntry | null;
  };
  pageProbe: BrowserToolsPageProbeResult | null;
}

export interface BrowserToolsDoctorContract {
  contract: 'browser-tools.doctor-report';
  version: typeof BROWSER_TOOLS_CONTRACT_VERSION;
  generatedAt: string;
  report: BrowserToolsDoctorReport;
}

interface ChromeProcessInfo {
  pid: number;
  port: number;
  command: string;
}

interface ChromeTabInfo {
  id?: string;
  title?: string;
  url?: string;
  type?: string;
}

interface ChromeSessionDescription extends ChromeProcessInfo {
  version?: Record<string, string>;
  tabs: ChromeTabInfo[];
}

function browserURL(port: number): string {
  return `http://localhost:${port}`;
}

async function connectBrowser(port: number) {
  return puppeteer.connect({ browserURL: browserURL(port), defaultViewport: null });
}

async function getActivePage(port: number, options?: { urlContains?: string }) {
  const browser = await connectBrowser(port);
  const census = await collectBrowserToolsTabCensusFromBrowser(browser, options);
  const pages = await browser.pages();
  const selectedIndex = census.selectedIndex;
  const page = selectedIndex >= 0 ? pages[selectedIndex] : undefined;
  if (!page) {
    await browser.disconnect();
    throw new Error('No active tab found');
  }
  return { browser, page };
}

function isBrowserToolsBlankUrl(url: string): boolean {
  return url === 'about:blank';
}

function isBrowserToolsInternalUrl(url: string): boolean {
  return url.startsWith('chrome://') || url.startsWith('devtools://');
}

export function classifyBrowserToolsBlockingState(input: {
  url?: string | null;
  title?: string | null;
  bodyText?: string | null;
}): BrowserToolsBlockingState | null {
  const url = String(input.url ?? '').trim().toLowerCase();
  const title = String(input.title ?? '').trim().toLowerCase();
  const bodyText = String(input.bodyText ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const corpus = [url, title, bodyText].filter(Boolean).join(' ');
  if (
    url.includes('google.com/sorry') ||
    /unusual traffic|not a robot/.test(corpus)
  ) {
    return {
      kind: 'google-sorry',
      summary: 'Google unusual-traffic interstitial detected (google.com/sorry).',
      requiresHuman: true,
    };
  }
  if (
    /cloudflare/.test(corpus) &&
    /(just a moment|verify you are human|checking your browser|security check)/.test(corpus)
  ) {
    return {
      kind: 'cloudflare',
      summary: 'Cloudflare anti-bot interstitial detected.',
      requiresHuman: true,
    };
  }
  if (
    /recaptcha|g-recaptcha|hcaptcha|captcha/.test(corpus)
  ) {
    return {
      kind: 'captcha',
      summary: 'CAPTCHA or reCAPTCHA challenge detected.',
      requiresHuman: true,
    };
  }
  if (
    /human verification|verify you are human|prove you are human|confirm you are human/.test(corpus)
  ) {
    return {
      kind: 'human-verification',
      summary: 'Human-verification page detected.',
      requiresHuman: true,
    };
  }
  return null;
}

export function explainBrowserToolsPageSelection(
  pages: BrowserToolsPageCandidate[],
  options?: { urlContains?: string },
): BrowserToolsPageSelectionExplanation {
  const urlContains = options?.urlContains?.trim();
  let selectedIndex = -1;
  let selectedReason: BrowserToolsPageSelectionReason | null = null;

  if (urlContains) {
    const matchingIndexes = pages
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.url && candidate.url.includes(urlContains));
    const visibleMatch = matchingIndexes.find(
      ({ candidate }) => candidate.visibilityState === 'visible',
    );
    const focusedMatch = matchingIndexes.find(({ candidate }) => candidate.focused);
    const chosenMatch = visibleMatch ?? focusedMatch ?? matchingIndexes[0];
    if (chosenMatch) {
      selectedIndex = chosenMatch.index;
      selectedReason = 'url-contains';
    }
  }
  if (selectedIndex < 0) {
    const focusedIndex = pages.findIndex((candidate) => candidate.focused);
    if (focusedIndex >= 0) {
      selectedIndex = focusedIndex;
      selectedReason = 'focused';
    }
  }
  if (selectedIndex < 0) {
    const nonChromeIndex = pages.findIndex((candidate) => {
      if (!candidate.url) {
        return false;
      }
      return !isBrowserToolsBlankUrl(candidate.url) && !isBrowserToolsInternalUrl(candidate.url);
    });
    if (nonChromeIndex >= 0) {
      selectedIndex = nonChromeIndex;
      selectedReason = 'non-internal-page';
    }
  }
  if (selectedIndex < 0 && pages.length > 0) {
    selectedIndex = pages.length - 1;
    selectedReason = 'last-page';
  }

  const candidates = pages.map((candidate, index) => {
    const matchesUrlContains = Boolean(urlContains && candidate.url?.includes(urlContains));
    const selectionReasons: BrowserToolsPageSelectionReason[] = [];
    if (matchesUrlContains) {
      selectionReasons.push('url-contains');
    }
    if (candidate.focused) {
      selectionReasons.push('focused');
    }
    if (
      candidate.url &&
      !isBrowserToolsBlankUrl(candidate.url) &&
      !isBrowserToolsInternalUrl(candidate.url)
    ) {
      selectionReasons.push('non-internal-page');
    }
    if (pages.length > 0 && index === pages.length - 1) {
      selectionReasons.push('last-page');
    }
    return {
      ...candidate,
      index,
      selected: index === selectedIndex,
      matchesUrlContains,
      selectionReasons,
      isBlank: isBrowserToolsBlankUrl(candidate.url),
      isBrowserInternal: isBrowserToolsInternalUrl(candidate.url),
    };
  });

  return {
    selectedIndex,
    selectedReason,
    candidates,
  };
}

export function selectBrowserToolsPageIndex(
  pages: BrowserToolsPageCandidate[],
  options?: { urlContains?: string },
): number {
  return explainBrowserToolsPageSelection(pages, options).selectedIndex;
}

function parseNumberListArg(value: string): number[] {
  return parseNumberList(value) ?? [];
}

function parseNumberList(inputValue: string | undefined): number[] | undefined {
  if (!inputValue) {
    return undefined;
  }
  const parsed = inputValue
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isFinite(value));
  return parsed.length > 0 ? parsed : undefined;
}

async function describeChromeSessions(options: {
  ports?: number[];
  pids?: number[];
  includeAll?: boolean;
}): Promise<ChromeSessionDescription[]> {
  const { ports, pids, includeAll } = options;
  const processes = await listDevtoolsChromes();
  const portSet = new Set(ports ?? []);
  const pidSet = new Set(pids ?? []);
  const candidates = processes.filter((proc) => {
    if (includeAll) {
      return true;
    }
    if (portSet.size > 0 && portSet.has(proc.port)) {
      return true;
    }
    if (pidSet.size > 0 && pidSet.has(proc.pid)) {
      return true;
    }
    return false;
  });
  const results: ChromeSessionDescription[] = [];
  for (const proc of candidates) {
    const [version, tabs] = await Promise.all([
      fetchJson(`http://localhost:${proc.port}/json/version`).catch(() => undefined),
      fetchJson(`http://localhost:${proc.port}/json/list`).catch(() => []),
    ]);
    const filteredTabs = Array.isArray(tabs)
      ? (tabs as ChromeTabInfo[]).filter((tab) => {
          const type = tab.type?.toLowerCase() ?? '';
          if (type && type !== 'page' && type !== 'app') {
            if (!tab.url || tab.url.startsWith('devtools://') || tab.url.startsWith('chrome-extension://')) {
              return false;
            }
          }
          if (!tab.url || tab.url.trim().length === 0) {
            return false;
          }
          return true;
        })
      : [];
    results.push({
      ...proc,
      version: (version as Record<string, string>) ?? undefined,
      tabs: filteredTabs,
    });
  }
  return results;
}

async function listDevtoolsChromes(): Promise<ChromeProcessInfo[]> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.warn('Chrome inspection is only supported on macOS and Linux for now.');
    return [];
  }
  const { execSync } = await import('node:child_process');
  let output = '';
  try {
    output = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to enumerate processes: ${message}`);
  }
  const processes: ChromeProcessInfo[] = [];
  output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        return;
      }
      const pid = Number.parseInt(match[1], 10);
      const command = match[2];
      if (!Number.isFinite(pid) || pid <= 0) {
        return;
      }
      if (!/chrome/i.test(command) || !/--remote-debugging-port/.test(command)) {
        return;
      }
      const portMatch = command.match(/--remote-debugging-port(?:=|\s+)(\d+)/);
      if (!portMatch) {
        return;
      }
      const port = Number.parseInt(portMatch[1], 10);
      if (!Number.isFinite(port)) {
        return;
      }
      processes.push({ pid, port, command });
    });
  return processes;
}

function fetchJson(url: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(undefined);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Request to ${url} timed out`));
    });
    request.on('error', (error) => {
      reject(error);
    });
  });
}

async function collectBrowserToolsPageCandidates(browser: Awaited<ReturnType<typeof connectBrowser>>): Promise<BrowserToolsPageCandidate[]> {
  const pages = await browser.pages();
  const candidates: BrowserToolsPageCandidate[] = [];
  for (const candidate of pages) {
    const url = candidate.url();
    let title: string | null = null;
    let focused = false;
    let readyState: string | null = null;
    let visibilityState: string | null = null;
    try {
      title = await candidate.title();
    } catch {
      title = null;
    }
    try {
      const pageState = await candidate.evaluate(() => ({
        focused: document.hasFocus(),
        readyState: document.readyState ?? null,
        visibilityState: document.visibilityState ?? null,
      }));
      focused = Boolean(pageState.focused);
      readyState = typeof pageState.readyState === 'string' ? pageState.readyState : null;
      visibilityState = typeof pageState.visibilityState === 'string' ? pageState.visibilityState : null;
    } catch {
      focused = false;
      readyState = null;
      visibilityState = null;
    }
    candidates.push({ url, focused, title, readyState, visibilityState });
  }
  return candidates;
}

async function collectBrowserToolsTabCensusFromBrowser(
  browser: Browser,
  options?: { urlContains?: string },
): Promise<BrowserToolsTabCensusResult> {
  const candidates = await collectBrowserToolsPageCandidates(browser);
  const selection = explainBrowserToolsPageSelection(candidates, options);
  const tabs = selection.candidates.map((candidate) => ({ ...candidate }));
  return {
    ...selection,
    selectedTab: tabs[selection.selectedIndex] ?? null,
    tabs,
  };
}

export async function collectBrowserToolsTabCensus(
  port: number,
  options?: { urlContains?: string },
): Promise<BrowserToolsTabCensusResult> {
  const browser = await connectBrowser(port);
  try {
    return await collectBrowserToolsTabCensusFromBrowser(browser, options);
  } finally {
    await browser.disconnect();
  }
}

function printBrowserToolsTabCensus(result: BrowserToolsTabCensusResult): void {
  if (result.tabs.length === 0) {
    console.log('No tabs reported.');
    return;
  }
  const selectionLabel = result.selectedTab
    ? `Selected tab: ${result.selectedTab.index + 1} (${result.selectedReason ?? 'unknown'})`
    : 'Selected tab: none';
  console.log(selectionLabel);
  result.tabs.forEach((tab, index) => {
    if (index > 0) {
      console.log('');
    }
    const flags: string[] = [];
    if (tab.selected) flags.push('selected');
    if (tab.focused) flags.push('focused');
    if (tab.matchesUrlContains) flags.push('url-match');
    if (tab.isBlank) flags.push('blank');
    if (tab.isBrowserInternal) flags.push('internal');
    const title = tab.title?.trim() ? tab.title : '(untitled)';
    console.log(`Tab ${tab.index + 1}: ${title}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    console.log(`  url: ${tab.url || '(no url)'}`);
    console.log(`  readyState: ${tab.readyState ?? 'unknown'}`);
    console.log(`  visibilityState: ${tab.visibilityState ?? 'unknown'}`);
    console.log(`  selectionReasons: ${tab.selectionReasons.length ? tab.selectionReasons.join(', ') : '(none)'}`);
  });
}

export async function collectBrowserToolsPageProbe(
  page: Page,
  options: BrowserToolsPageProbeOptions = {},
): Promise<BrowserToolsPageProbeResult> {
  const selectors = options.selectors ?? [];
  const scriptAny = options.scriptAny ?? [];
  const scriptAll = options.scriptAll ?? [];
  const scriptSelector = options.scriptSelector ?? 'script';
  const storageAny = options.storageAny ?? [];
  const storageAll = options.storageAll ?? [];
  const cookieAny = options.cookieAny ?? [];
  const cookieAll = options.cookieAll ?? [];
  const caseSensitive = options.caseSensitive ?? false;
  const pageUrl = page.url();
  const pageTitle = await page.title().catch(() => null);
  const pageCookies = await page.cookies().catch(() => []);
  const probeOptionsJson = JSON.stringify({
    selectors,
    scriptAny,
    scriptAll,
    scriptSelector,
    storageAny,
    storageAll,
    caseSensitive,
  });
  const result = await page.evaluate(`
    (() => {
      const probeOptions = ${probeOptionsJson};
      const normalizeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const normalizeMatch = (value) => {
        const text = String(value || '');
        return probeOptions.caseSensitive ? text : text.toLowerCase();
      };
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const visibleCounts = {
        buttons: Array.from(document.querySelectorAll('button,[role="button"]')).filter(isVisible).length,
        links: Array.from(document.querySelectorAll('a,[role="link"]')).filter(isVisible).length,
        inputs: Array.from(document.querySelectorAll('input')).filter(isVisible).length,
        textareas: Array.from(document.querySelectorAll('textarea')).filter(isVisible).length,
        contenteditables: Array.from(document.querySelectorAll('[contenteditable]:not([contenteditable="false"])')).filter(isVisible).length,
      };

      const selectorReports = probeOptions.selectors.map((selector) => {
        const nodes = Array.from(document.querySelectorAll(selector));
        const visibleNodes = nodes.filter(isVisible);
        const firstVisible = visibleNodes[0] ?? null;
        return {
          selector,
          matched: nodes.length,
          visible: visibleNodes.length,
          firstVisibleTag: firstVisible && typeof firstVisible.tagName === 'string' ? firstVisible.tagName.toLowerCase() : null,
          firstVisibleText: normalizeText(firstVisible ? firstVisible.textContent : '').slice(0, 160) || null,
        };
      });

      const localStorageKeys = (() => {
        try {
          return Object.keys(localStorage);
        } catch {
          return [];
        }
      })();
      const sessionStorageKeys = (() => {
        try {
          return Object.keys(sessionStorage);
        } catch {
          return [];
        }
      })();
      const storageKeys = [...localStorageKeys, ...sessionStorageKeys];
      const normalizedStorageKeys = storageKeys.map((entry) => normalizeMatch(entry));
      const normalizedStorageAny = probeOptions.storageAny.map((token) => normalizeMatch(token));
      const normalizedStorageAll = probeOptions.storageAll.map((token) => normalizeMatch(token));
      const matchedStorageAny = normalizedStorageAny.filter((token) => normalizedStorageKeys.includes(token));
      const missingStorageAll = normalizedStorageAll.filter((token) => !normalizedStorageKeys.includes(token));

      const scriptNodes = Array.from(document.querySelectorAll(probeOptions.scriptSelector));
      const scriptTexts = scriptNodes
        .map((node) => String(node.textContent || ''))
        .filter((entry) => entry.length > 0);
      const normalizedScriptTexts = scriptTexts.map((entry) => normalizeMatch(entry));
      const normalizedAny = probeOptions.scriptAny.map((token) => normalizeMatch(token));
      const normalizedAll = probeOptions.scriptAll.map((token) => normalizeMatch(token));
      const enabled = normalizedAny.length > 0 || normalizedAll.length > 0;
      const matchedAny = normalizedAny.filter((token) =>
        normalizedScriptTexts.some((text) => text.includes(token)),
      );
      const missingAll = normalizedAll.filter((token) =>
        !normalizedScriptTexts.some((text) => text.includes(token)),
      );
      let preview = null;
      let matched = false;
      if (enabled) {
        for (let index = 0; index < normalizedScriptTexts.length; index += 1) {
          const text = normalizedScriptTexts[index];
          const allOk = normalizedAll.length === 0 || normalizedAll.every((token) => text.includes(token));
          const anyOk = normalizedAny.length === 0 || normalizedAny.some((token) => text.includes(token));
          if (allOk && anyOk) {
            matched = true;
            preview = normalizeText(scriptTexts[index]).slice(0, 200) || null;
            break;
          }
        }
      }

      return {
        document: {
          readyState: document.readyState ?? null,
          visibilityState: document.visibilityState ?? null,
          focused: document.hasFocus(),
          scriptCount: scriptNodes.length,
          bodyTextLength: normalizeText(document.body?.innerText || document.body?.textContent || '').length,
          visibleCounts,
        },
        bodyText: normalizeText(document.body?.innerText || document.body?.textContent || '').slice(0, 4000),
        selectors: selectorReports,
        storage: {
          localStorageCount: localStorageKeys.length,
          sessionStorageCount: sessionStorageKeys.length,
          sampleLocalStorageKeys: localStorageKeys.slice(0, 12),
          sampleSessionStorageKeys: sessionStorageKeys.slice(0, 12),
          matchedAny: probeOptions.storageAny.filter((token) =>
            matchedStorageAny.includes(normalizeMatch(token)),
          ),
          missingAll: probeOptions.storageAll.filter((token) =>
            missingStorageAll.includes(normalizeMatch(token)),
          ),
        },
        scriptText: enabled
          ? {
              enabled,
              scriptSelector: probeOptions.scriptSelector,
              scriptCount: scriptNodes.length,
              matched,
              matchedAny: probeOptions.scriptAny.filter((token) =>
                matchedAny.includes(normalizeMatch(token)),
              ),
              missingAll: probeOptions.scriptAll.filter((token) =>
                missingAll.includes(normalizeMatch(token)),
              ),
              preview,
            }
          : null,
      };
    })()
  `) as {
    document: BrowserToolsPageProbeResult['document'];
    bodyText: string;
    selectors: BrowserToolsPageProbeResult['selectors'];
    scriptText: BrowserToolsPageProbeResult['scriptText'];
    storage: BrowserToolsPageProbeResult['storage'];
  };

  const cookieNames = pageCookies.map((cookie) => cookie.name);
  const cookieDomains = Array.from(new Set(pageCookies.map((cookie) => cookie.domain).filter(Boolean))).slice(0, 12);

  return {
    document: {
      url: pageUrl,
      title: pageTitle,
      readyState: result.document.readyState,
      visibilityState: result.document.visibilityState,
      focused: result.document.focused,
      scriptCount: result.document.scriptCount,
      bodyTextLength: result.document.bodyTextLength,
      visibleCounts: result.document.visibleCounts,
    },
    blockingState: classifyBrowserToolsBlockingState({
      url: pageUrl,
      title: pageTitle,
      bodyText: result.bodyText,
    }),
    selectors: result.selectors,
    scriptText: result.scriptText,
    storage: result.storage,
    cookies: {
      cookieCount: pageCookies.length,
      sampleNames: cookieNames.slice(0, 12),
      domains: cookieDomains,
      matchedAny: resolveMatchedAnyTokens(cookieNames, cookieAny, caseSensitive),
      missingAll: resolveMissingAllTokens(cookieNames, cookieAll, caseSensitive),
    },
  };
}

export async function collectBrowserToolsDomSearch(
  page: Page,
  options: BrowserToolsDomSearchOptions = {},
): Promise<BrowserToolsDomSearchResult> {
  const pageUrl = page.url();
  const pageTitle = await page.title().catch(() => null);
  const result = await page.evaluate(
    buildBrowserDomSearchExpression(options),
  ) as { totalScanned: number; matched: BrowserToolsDomSearchMatch[] };
  return {
    url: pageUrl,
    title: pageTitle,
    totalScanned: result.totalScanned,
    matched: result.matched,
  };
}

export async function collectBrowserToolsUiList(
  page: Page,
  options: BrowserToolsUiListOptions = {},
): Promise<BrowserToolsUiListResult> {
  const pageUrl = page.url();
  const pageTitle = await page.title().catch(() => null);
  const normalizedOptions = {
    selector: typeof options.selector === 'string' && options.selector.trim().length > 0 ? options.selector.trim() : null,
    visibleOnly: options.visibleOnly ?? true,
    caseSensitive: options.caseSensitive ?? false,
    limitPerKind: Math.max(1, Math.min(options.limitPerKind ?? 20, 200)),
    maxScan: Math.max(100, Math.min(options.maxScan ?? 5000, 20000)),
  };
  const optionsJson = JSON.stringify(normalizedOptions);
  const result = await page.evaluate(`
    (() => {
      const options = ${optionsJson};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const normalizeMatch = (value) => {
        const text = normalize(value);
        return options.caseSensitive ? text : text.toLowerCase();
      };
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const startsWithAny = (value, prefixes) => prefixes.some((prefix) => value.startsWith(prefix));
      const sections = {
        buttons: [],
        menuItems: [],
        switches: [],
        inputs: [],
        links: [],
        dialogs: [],
        menus: [],
        fileInputs: [],
        uploadCandidates: [],
      };
      const summary = {
        buttons: 0,
        menuItems: 0,
        switches: 0,
        inputs: 0,
        links: 0,
        dialogs: 0,
        menus: 0,
        fileInputs: 0,
        uploadCandidates: 0,
      };
      const seenBySection = {
        buttons: new Set(),
        menuItems: new Set(),
        switches: new Set(),
        inputs: new Set(),
        links: new Set(),
        dialogs: new Set(),
        menus: new Set(),
        fileInputs: new Set(),
        uploadCandidates: new Set(),
      };
      const root = options.selector
        ? Array.from(document.querySelectorAll(options.selector))
        : Array.from(document.querySelectorAll('*'));
      let totalScanned = 0;
      const serialize = (node) => {
        const tag = String(node.tagName || '').toLowerCase();
        const role = normalize(node.getAttribute('role') || '') || null;
        const text = normalize(node.textContent || '') || null;
        const ariaLabel = normalize(node.getAttribute('aria-label') || '') || null;
        const title = normalize(node.getAttribute('title') || '') || null;
        const dataTestId = normalize(node.getAttribute('data-test-id') || '') || null;
        const className = normalize(node.className || '') || null;
        const href = node instanceof HTMLAnchorElement ? normalize(node.href || '') || null : null;
        const checkedAttr = node.getAttribute('aria-checked');
        const expandedAttr = node.getAttribute('aria-expanded');
        const disabledAttr = node.getAttribute('disabled') !== null || node.getAttribute('aria-disabled') === 'true';
        const inputType =
          node instanceof HTMLInputElement
            ? normalize(node.getAttribute('type') || node.type || '') || null
            : null;
        const lowerText = normalizeMatch([text, ariaLabel, title, dataTestId, className].filter(Boolean).join(' '));
        const normalizedAriaLabel = normalizeMatch(ariaLabel || '');
        const attributeCorpus = normalizeMatch([title, dataTestId, className].filter(Boolean).join(' '));
        const shortControlLabel = normalizeMatch(text || '');
        const hasUploadAriaLabel =
          !normalizedAriaLabel.startsWith('more options for ') &&
          (
            normalizedAriaLabel.includes('upload') ||
            normalizedAriaLabel.includes('attach') ||
            normalizedAriaLabel.includes('choose file') ||
            normalizedAriaLabel.includes('choose files') ||
            normalizedAriaLabel.includes('browse') ||
            normalizedAriaLabel.includes('file-picker') ||
            normalizedAriaLabel.includes('file chooser')
          );
        const frameworkManaged =
          lowerText.includes('mat-mdc') ||
          lowerText.includes('mdc-') ||
          lowerText.includes('toolbox-drawer') ||
          lowerText.includes('menu-trigger') ||
          lowerText.includes('touch-target');
        const hoverLikely =
          lowerText.includes('hover') ||
          lowerText.includes('tooltip-trigger') ||
          lowerText.includes('reveal') ||
          lowerText.includes('conversation-actions') ||
          lowerText.includes('actions-menu');
        const uploadCandidate =
          inputType === 'file' ||
          ((tag === 'button' ||
            tag === 'input' ||
            tag === 'label' ||
            tag === 'a' ||
            tag === 'textarea' ||
            tag === 'select' ||
            node.isContentEditable ||
            role === 'button' ||
            role === 'link' ||
            role === 'switch' ||
            (role ? role.startsWith('menuitem') : false)) &&
            (
              attributeCorpus.includes('upload') ||
              attributeCorpus.includes('attach') ||
              attributeCorpus.includes('choose file') ||
              attributeCorpus.includes('choose files') ||
              attributeCorpus.includes('browse') ||
              attributeCorpus.includes('file-picker') ||
              attributeCorpus.includes('file chooser') ||
              hasUploadAriaLabel ||
              ((tag === 'button' || tag === 'label') && (
                shortControlLabel.includes('upload') ||
                shortControlLabel.includes('attach') ||
                shortControlLabel.includes('choose file') ||
                shortControlLabel.includes('choose files') ||
                shortControlLabel.includes('browse')
              ))
            ));
        const pathParts = [];
        let current = node;
        while (current instanceof HTMLElement && pathParts.length < 4) {
          const currentTag = String(current.tagName || '').toLowerCase();
          const id = normalize(current.id || '');
          const cls = normalize(current.className || '')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((entry) => '.' + entry)
            .join('');
          pathParts.unshift(currentTag + (id ? '#' + id : '') + cls);
          current = current.parentElement;
        }
        let widgetType = null;
        if (role === 'dialog' || tag === 'dialog' || node.getAttribute('aria-modal') === 'true') widgetType = 'dialog';
        else if (role === 'menu' || role === 'listbox') widgetType = 'menu';
        else if (role === 'switch') widgetType = 'switch';
        else if (role && role.startsWith('menuitem')) widgetType = 'menu-item';
        else if (inputType === 'file') widgetType = 'file-input';
        else if (tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable) widgetType = 'input';
        else if (tag === 'a' || role === 'link') widgetType = 'link';
        else if (uploadCandidate) widgetType = 'upload-trigger';
        else if (tag === 'button' || role === 'button') widgetType = 'button';
        const interactionHints = [];
        if (widgetType === 'button' || widgetType === 'menu-item' || widgetType === 'switch' || widgetType === 'upload-trigger') {
          interactionHints.push('hard-click-preferred');
        }
        if (
          widgetType === 'button' ||
          widgetType === 'menu-item' ||
          widgetType === 'switch' ||
          widgetType === 'input' ||
          widgetType === 'link' ||
          widgetType === 'upload-trigger'
        ) {
          interactionHints.push('keyboard-activatable');
        }
        if (frameworkManaged) {
          interactionHints.push('soft-js-events-possible');
        }
        if (hoverLikely) {
          interactionHints.push('hover-or-pointer-state-likely');
        }
        if (widgetType === 'switch') {
          interactionHints.push('pointer-gesture-preferred');
        }
        if (uploadCandidate) {
          interactionHints.push('file-chooser-candidate');
        }
        if (inputType === 'file' && !isVisible(node)) {
          interactionHints.push('hidden-native-file-input');
        }
        return {
          tag,
          role,
          text,
          ariaLabel,
          title,
          dataTestId,
          className,
          href,
          checked: checkedAttr === 'true' ? true : checkedAttr === 'false' ? false : null,
          expanded: expandedAttr === 'true' ? true : expandedAttr === 'false' ? false : null,
          disabled: disabledAttr ? true : node.getAttribute('aria-disabled') === 'false' ? false : null,
          visible: isVisible(node),
          inputType,
          widgetType,
          pathHint: pathParts.join(' > ') || null,
          interactionHints: Array.from(new Set(interactionHints)),
        };
      };
      const add = (section, node) => {
        summary[section] += 1;
        if (sections[section].length >= options.limitPerKind) return;
        const key = [
          node.tagName,
          node.getAttribute('role') || '',
          node.getAttribute('aria-label') || '',
          node.getAttribute('data-test-id') || '',
          normalize(node.textContent || '').slice(0, 160),
        ].join('::');
        if (seenBySection[section].has(key)) return;
        seenBySection[section].add(key);
        sections[section].push(serialize(node));
      };
      for (const node of root) {
        if (!(node instanceof HTMLElement)) continue;
        totalScanned += 1;
        if (totalScanned > options.maxScan) break;
        const visible = isVisible(node);
        const tag = normalizeMatch(node.tagName || '');
        const role = normalizeMatch(node.getAttribute('role') || '');
        if (tag === 'dialog' || role === 'dialog' || node.getAttribute('aria-modal') === 'true') {
          add('dialogs', node);
        }
        if (role === 'menu' || role === 'listbox') {
          add('menus', node);
        }
        const textCorpus = normalizeMatch(
          [
            node.textContent || '',
            node.getAttribute('aria-label') || '',
            node.getAttribute('title') || '',
            node.getAttribute('data-test-id') || '',
            node.className || '',
          ].join(' '),
        );
        const normalizedAriaLabel = normalizeMatch(node.getAttribute('aria-label') || '');
        const attributeCorpus = normalizeMatch(
          [
            node.getAttribute('title') || '',
            node.getAttribute('data-test-id') || '',
            node.className || '',
          ].join(' '),
        );
        const shortControlLabel = normalizeMatch(node.textContent || '');
        const hasUploadAriaLabel =
          !normalizedAriaLabel.startsWith('more options for ') &&
          (
            normalizedAriaLabel.includes('upload') ||
            normalizedAriaLabel.includes('attach') ||
            normalizedAriaLabel.includes('choose file') ||
            normalizedAriaLabel.includes('choose files') ||
            normalizedAriaLabel.includes('browse') ||
            normalizedAriaLabel.includes('file-picker') ||
            normalizedAriaLabel.includes('file chooser')
          );
        const inputType =
          node instanceof HTMLInputElement
            ? normalizeMatch(node.getAttribute('type') || node.type || '')
            : '';
        const uploadCandidate =
          inputType === 'file' ||
          ((tag === 'button' ||
            tag === 'input' ||
            tag === 'label' ||
            tag === 'a' ||
            tag === 'textarea' ||
            tag === 'select' ||
            node.isContentEditable ||
            role === 'button' ||
            role === 'link' ||
            role === 'switch' ||
            startsWithAny(role, ['menuitem'])) &&
            (
              attributeCorpus.includes('upload') ||
              attributeCorpus.includes('attach') ||
              attributeCorpus.includes('choose file') ||
              attributeCorpus.includes('choose files') ||
              attributeCorpus.includes('browse') ||
              attributeCorpus.includes('file-picker') ||
              attributeCorpus.includes('file chooser') ||
              hasUploadAriaLabel ||
              ((tag === 'button' || tag === 'label') && (
                shortControlLabel.includes('upload') ||
                shortControlLabel.includes('attach') ||
                shortControlLabel.includes('choose file') ||
                shortControlLabel.includes('choose files') ||
                shortControlLabel.includes('browse')
              ))
            ));
        if (options.visibleOnly && !visible && inputType !== 'file' && !uploadCandidate) continue;
        if (inputType === 'file') {
          add('fileInputs', node);
        }
        if (uploadCandidate) {
          add('uploadCandidates', node);
        }
        if (!visible) continue;
        if (role === 'switch') {
          add('switches', node);
          continue;
        }
        if (startsWithAny(role, ['menuitem'])) {
          add('menuItems', node);
          continue;
        }
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable) {
          add('inputs', node);
          continue;
        }
        if (tag === 'a' || role === 'link') {
          add('links', node);
          continue;
        }
        if (tag === 'button' || role === 'button') {
          add('buttons', node);
          continue;
        }
      }
      return { totalScanned, summary, sections };
    })()
  `) as {
    totalScanned: number;
    summary: BrowserToolsUiListSummary;
    sections: BrowserToolsUiListSections;
  };
  return {
    url: pageUrl,
    title: pageTitle,
    totalScanned: result.totalScanned,
    summary: result.summary,
    sections: result.sections,
  };
}

export async function collectBrowserToolsDoctorReport(
  port: number,
  options: {
    urlContains?: string;
    includeUiList?: boolean;
    uiListSelector?: string;
    uiListVisibleOnly?: boolean;
    uiListCaseSensitive?: boolean;
    uiListLimitPerKind?: number;
    uiListMaxScan?: number;
    prepareSelectedPage?: ((page: Page) => Promise<void>) | null;
    cleanupSelectedPage?: ((page: Page) => Promise<void>) | null;
  } & BrowserToolsPageProbeOptions = {},
): Promise<BrowserToolsDoctorReport> {
  const browser = await connectBrowser(port);
  try {
    const census = await collectBrowserToolsTabCensusFromBrowser(browser, {
      urlContains: options.urlContains,
    });
    const pages = await browser.pages();
    const selectedPage = census.selectedIndex >= 0 ? pages[census.selectedIndex] : null;
    if (selectedPage && options.prepareSelectedPage) {
      await options.prepareSelectedPage(selectedPage);
    }
    const pageProbe = selectedPage
      ? await collectBrowserToolsPageProbe(selectedPage, options)
      : null;
    const uiList =
      selectedPage && options.includeUiList
        ? await collectBrowserToolsUiList(selectedPage, {
            selector: options.uiListSelector,
            visibleOnly: options.uiListVisibleOnly ?? true,
            caseSensitive: options.uiListCaseSensitive ?? false,
            limitPerKind: options.uiListLimitPerKind ?? 20,
            maxScan: options.uiListMaxScan ?? 5000,
          })
        : null;
    if (selectedPage && options.cleanupSelectedPage) {
      await options.cleanupSelectedPage(selectedPage);
    }
    return { census, pageProbe, uiList };
  } finally {
    await browser.disconnect();
  }
}

export function summarizeBrowserToolsPageProbe(result: BrowserToolsPageProbeResult): string[] {
  const lines = [
    `Selected page: ${result.document.title || '(untitled)'}`,
    `  url: ${result.document.url}`,
    `  readyState: ${result.document.readyState ?? 'unknown'}`,
    `  visibilityState: ${result.document.visibilityState ?? 'unknown'}`,
    `  focused: ${result.document.focused ? 'yes' : 'no'}`,
    `  scriptCount: ${result.document.scriptCount}`,
    `  bodyTextLength: ${result.document.bodyTextLength}`,
    `  visibleCounts: buttons=${result.document.visibleCounts.buttons}, links=${result.document.visibleCounts.links}, inputs=${result.document.visibleCounts.inputs}, textareas=${result.document.visibleCounts.textareas}, contenteditables=${result.document.visibleCounts.contenteditables}`,
  ];
  if (result.blockingState) {
    lines.push(
      `Blocking state: ${result.blockingState.kind} (${result.blockingState.requiresHuman ? 'manual-clear required' : 'auto-recoverable'})`,
    );
    lines.push(`  summary: ${result.blockingState.summary}`);
  }
  if (result.storage) {
    lines.push(
      `Storage: local=${result.storage.localStorageCount}, session=${result.storage.sessionStorageCount}, matchedAny=${result.storage.matchedAny.join(', ') || '(none)'}, missingAll=${result.storage.missingAll.join(', ') || '(none)'}`,
    );
    if (result.storage.sampleLocalStorageKeys.length > 0 || result.storage.sampleSessionStorageKeys.length > 0) {
      lines.push(
        `  sampleKeys: local=[${result.storage.sampleLocalStorageKeys.join(', ') || '(none)'}], session=[${result.storage.sampleSessionStorageKeys.join(', ') || '(none)'}]`,
      );
    }
  }
  if (result.cookies) {
    lines.push(
      `Cookies: count=${result.cookies.cookieCount}, matchedAny=${result.cookies.matchedAny.join(', ') || '(none)'}, missingAll=${result.cookies.missingAll.join(', ') || '(none)'}`,
    );
    if (result.cookies.sampleNames.length > 0 || result.cookies.domains.length > 0) {
      lines.push(
        `  sampleNames=[${result.cookies.sampleNames.join(', ') || '(none)'}], domains=[${result.cookies.domains.join(', ') || '(none)'}]`,
      );
    }
  }
  if (result.selectors.length > 0) {
    lines.push('Selectors:');
    for (const selector of result.selectors) {
      lines.push(
        `  ${selector.selector}: matched=${selector.matched}, visible=${selector.visible}, firstVisible=${selector.firstVisibleTag ?? 'none'}${selector.firstVisibleText ? ` "${selector.firstVisibleText}"` : ''}`,
      );
    }
  }
  if (result.scriptText) {
    lines.push(
      `Script text: selector=${result.scriptText.scriptSelector}, matched=${result.scriptText.matched ? 'yes' : 'no'}, matchedAny=${result.scriptText.matchedAny.join(', ') || '(none)'}, missingAll=${result.scriptText.missingAll.join(', ') || '(none)'}`,
    );
    if (result.scriptText.preview) {
      lines.push(`  preview: ${result.scriptText.preview}`);
    }
  }
  return lines;
}

export function summarizeBrowserToolsDoctorReport(report: BrowserToolsDoctorReport): string[] {
  const lines: string[] = [];
  const selectionLabel = report.census.selectedTab
    ? `Doctor selection: tab ${report.census.selectedTab.index + 1} (${report.census.selectedReason ?? 'unknown'})`
    : 'Doctor selection: none';
  lines.push(selectionLabel);
  if (report.pageProbe) {
    lines.push(...summarizeBrowserToolsPageProbe(report.pageProbe));
  } else {
    lines.push('No selected page to probe.');
  }
  if (report.uiList) {
    lines.push(
      `UI list: menus=${report.uiList.summary.menus}, menuItems=${report.uiList.summary.menuItems}, switches=${report.uiList.summary.switches}, uploadCandidates=${report.uiList.summary.uploadCandidates}`,
    );
  }
  return lines;
}

export function createBrowserToolsProbeContract(
  report: BrowserToolsDoctorReport,
  options: { generatedAt?: string } = {},
): BrowserToolsProbeContract {
  return {
    contract: 'browser-tools.page-probe',
    version: BROWSER_TOOLS_CONTRACT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    selection: {
      selectedIndex: report.census.selectedIndex >= 0 ? report.census.selectedIndex : null,
      selectedReason: report.census.selectedReason,
      selectedTab: report.census.selectedTab,
    },
    pageProbe: report.pageProbe,
  };
}

export function browserToolsReportRequiresManualClear(
  report: BrowserToolsDoctorReport | null | undefined,
): boolean {
  return Boolean(report?.pageProbe?.blockingState?.requiresHuman);
}

export function createBrowserToolsDoctorContract(
  report: BrowserToolsDoctorReport,
  options: { generatedAt?: string } = {},
): BrowserToolsDoctorContract {
  return {
    contract: 'browser-tools.doctor-report',
    version: BROWSER_TOOLS_CONTRACT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    report,
  };
}

function printBrowserToolsPageProbe(result: BrowserToolsPageProbeResult): void {
  summarizeBrowserToolsPageProbe(result).forEach((line) => console.log(line));
}

function printBrowserToolsDoctorReport(report: BrowserToolsDoctorReport): void {
  printBrowserToolsTabCensus(report.census);
  console.log('');
  summarizeBrowserToolsDoctorReport(report).forEach((line) => console.log(line));
}

function printBrowserToolsDomSearch(result: BrowserToolsDomSearchResult): void {
  console.log(`Page: ${result.title || '(untitled)'}`);
  console.log(`URL: ${result.url}`);
  console.log(`Scanned: ${result.totalScanned}`);
  console.log(`Matches: ${result.matched.length}`);
  result.matched.forEach((match, index) => {
    console.log('');
    console.log(`Match ${index + 1}: <${match.tag}>${match.role ? ` role=${match.role}` : ''}`);
    if (match.text) console.log(`  text: ${match.text}`);
    if (match.ariaLabel) console.log(`  ariaLabel: ${match.ariaLabel}`);
    if (match.dataTestId) console.log(`  dataTestId: ${match.dataTestId}`);
    if (match.className) console.log(`  class: ${match.className}`);
    if (match.id) console.log(`  id: ${match.id}`);
    if (match.href) console.log(`  href: ${match.href}`);
    if (match.checked !== null) console.log(`  checked: ${match.checked ? 'true' : 'false'}`);
    if (match.expanded !== null) console.log(`  expanded: ${match.expanded ? 'true' : 'false'}`);
  });
}

function printBrowserToolsUiList(result: BrowserToolsUiListResult): void {
  console.log(`Page: ${result.title || '(untitled)'}`);
  console.log(`URL: ${result.url}`);
  console.log(`Scanned: ${result.totalScanned}`);
  console.log(
    `Summary: buttons=${result.summary.buttons}, menuItems=${result.summary.menuItems}, switches=${result.summary.switches}, inputs=${result.summary.inputs}, links=${result.summary.links}, dialogs=${result.summary.dialogs}, menus=${result.summary.menus}, fileInputs=${result.summary.fileInputs}, uploadCandidates=${result.summary.uploadCandidates}`,
  );
  const sectionOrder: Array<keyof BrowserToolsUiListSections> = [
    'dialogs',
    'menus',
    'buttons',
    'menuItems',
    'switches',
    'inputs',
    'links',
    'fileInputs',
    'uploadCandidates',
  ];
  for (const section of sectionOrder) {
    const items = result.sections[section];
    if (items.length === 0) continue;
    console.log('');
    console.log(`${section}: ${items.length}`);
    items.forEach((item, index) => {
      console.log(`  ${index + 1}. <${item.tag}>${item.role ? ` role=${item.role}` : ''}`);
      if (item.text) console.log(`     text: ${item.text}`);
      if (item.ariaLabel) console.log(`     ariaLabel: ${item.ariaLabel}`);
      if (item.dataTestId) console.log(`     dataTestId: ${item.dataTestId}`);
      if (item.widgetType) console.log(`     widgetType: ${item.widgetType}`);
      if (item.inputType) console.log(`     inputType: ${item.inputType}`);
      if (item.href) console.log(`     href: ${item.href}`);
      if (item.checked !== null) console.log(`     checked: ${item.checked}`);
      if (item.expanded !== null) console.log(`     expanded: ${item.expanded}`);
      if (item.disabled !== null) console.log(`     disabled: ${item.disabled}`);
      console.log(`     visible: ${item.visible}`);
      if (item.pathHint) console.log(`     pathHint: ${item.pathHint}`);
      if (item.interactionHints.length > 0) {
        console.log(`     hints: ${item.interactionHints.join(', ')}`);
      }
      if (item.className) console.log(`     class: ${item.className}`);
    });
  }
}

function collectStringArg(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function normalizeProbeToken(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function resolveMatchedAnyTokens(
  availableValues: string[],
  requestedValues: string[],
  caseSensitive: boolean,
): string[] {
  const normalizedAvailable = new Set(availableValues.map((value) => normalizeProbeToken(value, caseSensitive)));
  return requestedValues.filter((value) => normalizedAvailable.has(normalizeProbeToken(value, caseSensitive)));
}

function resolveMissingAllTokens(
  availableValues: string[],
  requestedValues: string[],
  caseSensitive: boolean,
): string[] {
  const normalizedAvailable = new Set(availableValues.map((value) => normalizeProbeToken(value, caseSensitive)));
  return requestedValues.filter((value) => !normalizedAvailable.has(normalizeProbeToken(value, caseSensitive)));
}

export function createBrowserToolsProgram(options: BrowserToolsCliOptions): Command {
  const program = new Command();
  program
    .name('browser-tools')
    .description('Lightweight Chrome DevTools helpers (no MCP required).')
    .configureHelp({ sortSubcommands: true })
    .showSuggestionAfterError();
  program
    .option('--auracall-profile <name>', 'AuraCall runtime profile to resolve before launching/attaching.')
    .option('--browser-target <target>', 'Browser target to resolve before launching/attaching (chatgpt|gemini|grok).');

  const withResolverOptions = (
    commandOptions: Record<string, unknown> & {
      port?: number;
      chromePath?: string;
      profileDir?: string;
      profile?: boolean;
    },
  ): BrowserToolsPortResolverOptions => {
    const globalOptions = program.opts<{
      auracallProfile?: string;
      browserTarget?: 'chatgpt' | 'gemini' | 'grok';
    }>();
    return {
      port: commandOptions.port,
      chromePath: typeof commandOptions.chromePath === 'string' ? commandOptions.chromePath : undefined,
      profileDir: typeof commandOptions.profileDir === 'string' ? commandOptions.profileDir : undefined,
      copyProfile: Boolean(commandOptions.profile),
      auracallProfile: globalOptions.auracallProfile,
      browserTarget: globalOptions.browserTarget,
    };
  };

  program
    .command('start')
    .description('Launch Chrome with remote debugging enabled.')
    .option('-p, --port <number>', 'Remote debugging port (default: from registry or range)', (value) => Number.parseInt(value, 10))
    .option('--profile', 'Copy your default Chrome profile before launch.', false)
    .option('--profile-dir <path>', 'Directory for the temporary Chrome profile.')
    .option('--chrome-path <path>', 'Path to the Chrome binary.')
    .action(async (commandOptions) => {
      const resolvedPort = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      console.log(`✓ Chrome listening on http://localhost:${resolvedPort}${commandOptions.profile ? ' (profile copied)' : ''}`);
    });

  program
    .command('tabs')
    .description('Inspect tabs in a DevTools-enabled Chrome instance and explain which one would be selected.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const census = await collectBrowserToolsTabCensus(port, {
        urlContains: commandOptions.urlContains as string | undefined,
      });
      if (commandOptions.json) {
        console.log(JSON.stringify(census, null, 2));
        return;
      }
      printBrowserToolsTabCensus(census);
    });

  program
    .command('probe')
    .description('Collect structured generic probes from the selected page.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--selector <selector>', 'Probe a selector for total/visible matches (repeatable).', collectStringArg, [])
    .option('--script-any <text>', 'Require any matching script text token (repeatable).', collectStringArg, [])
    .option('--script-all <text>', 'Require all matching script text tokens (repeatable).', collectStringArg, [])
    .option('--storage-any <key>', 'Require any matching storage key across local/session storage (repeatable).', collectStringArg, [])
    .option('--storage-all <key>', 'Require all matching storage keys across local/session storage (repeatable).', collectStringArg, [])
    .option('--cookie-any <name>', 'Require any matching cookie name (repeatable).', collectStringArg, [])
    .option('--cookie-all <name>', 'Require all matching cookie names (repeatable).', collectStringArg, [])
    .option('--script-selector <selector>', 'Selector used to collect script text.', 'script')
    .option('--case-sensitive', 'Treat script-text tokens as case-sensitive.', false)
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const report = await collectBrowserToolsDoctorReport(port, {
        urlContains: commandOptions.urlContains as string | undefined,
        selectors: commandOptions.selector as string[],
        scriptAny: commandOptions.scriptAny as string[],
        scriptAll: commandOptions.scriptAll as string[],
        storageAny: commandOptions.storageAny as string[],
        storageAll: commandOptions.storageAll as string[],
        cookieAny: commandOptions.cookieAny as string[],
        cookieAll: commandOptions.cookieAll as string[],
        scriptSelector: commandOptions.scriptSelector as string | undefined,
        caseSensitive: Boolean(commandOptions.caseSensitive),
      });
      if (commandOptions.json) {
        console.log(JSON.stringify(createBrowserToolsProbeContract(report), null, 2));
        if (browserToolsReportRequiresManualClear(report)) {
          process.exitCode = 1;
        }
        return;
      }
      if (!report.pageProbe) {
        console.log('No selected page to probe.');
        return;
      }
      printBrowserToolsPageProbe(report.pageProbe);
      if (browserToolsReportRequiresManualClear(report)) {
        process.exitCode = 1;
      }
    });

  program
    .command('doctor')
    .description('Summarize the selected page with tab census plus structured generic probes.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--selector <selector>', 'Probe a selector for total/visible matches (repeatable).', collectStringArg, [])
    .option('--script-any <text>', 'Require any matching script text token (repeatable).', collectStringArg, [])
    .option('--script-all <text>', 'Require all matching script text tokens (repeatable).', collectStringArg, [])
    .option('--storage-any <key>', 'Require any matching storage key across local/session storage (repeatable).', collectStringArg, [])
    .option('--storage-all <key>', 'Require all matching storage keys across local/session storage (repeatable).', collectStringArg, [])
    .option('--cookie-any <name>', 'Require any matching cookie name (repeatable).', collectStringArg, [])
    .option('--cookie-all <name>', 'Require all matching cookie names (repeatable).', collectStringArg, [])
    .option('--script-selector <selector>', 'Selector used to collect script text.', 'script')
    .option('--case-sensitive', 'Treat script-text tokens as case-sensitive.', false)
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const report = await collectBrowserToolsDoctorReport(port, {
        urlContains: commandOptions.urlContains as string | undefined,
        selectors: commandOptions.selector as string[],
        scriptAny: commandOptions.scriptAny as string[],
        scriptAll: commandOptions.scriptAll as string[],
        storageAny: commandOptions.storageAny as string[],
        storageAll: commandOptions.storageAll as string[],
        cookieAny: commandOptions.cookieAny as string[],
        cookieAll: commandOptions.cookieAll as string[],
        scriptSelector: commandOptions.scriptSelector as string | undefined,
        caseSensitive: Boolean(commandOptions.caseSensitive),
      });
      if (commandOptions.json) {
        console.log(JSON.stringify(createBrowserToolsDoctorContract(report), null, 2));
        if (browserToolsReportRequiresManualClear(report)) {
          process.exitCode = 1;
        }
        return;
      }
      printBrowserToolsDoctorReport(report);
      if (browserToolsReportRequiresManualClear(report)) {
        process.exitCode = 1;
      }
    });

  program
    .command('ls')
    .description('List the important visible UI surfaces and interactive controls on the selected page.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--selector <selector>', 'Optional root selector to limit the listing scope.')
    .option('--visible-only', 'Only consider visible nodes.', true)
    .option('--all', 'Include hidden nodes too.')
    .option('--limit-per-kind <count>', 'Return at most N rows per UI section.', (value) => Number.parseInt(value, 10), 20)
    .option('--max-scan <count>', 'Scan at most N nodes before stopping.', (value) => Number.parseInt(value, 10), 5000)
    .option('--case-sensitive', 'Treat text normalization as case-sensitive.', false)
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port, { urlContains: commandOptions.urlContains as string | undefined });
      try {
        const result = await collectBrowserToolsUiList(page, {
          selector: commandOptions.selector as string | undefined,
          visibleOnly: commandOptions.all ? false : Boolean(commandOptions.visibleOnly),
          caseSensitive: Boolean(commandOptions.caseSensitive),
          limitPerKind: commandOptions.limitPerKind as number,
          maxScan: commandOptions.maxScan as number,
        });
        if (commandOptions.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        printBrowserToolsUiList(result);
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('search')
    .description('Search the selected page DOM for visible nodes that match structured criteria.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--selector <selector>', 'Optional root selector to limit the search scope.')
    .option('--text <value>', 'Require matching text content substring (repeatable).', collectStringArg, [])
    .option('--aria-label <value>', 'Require matching aria-label substring (repeatable).', collectStringArg, [])
    .option('--role <value>', 'Require matching role substring (repeatable).', collectStringArg, [])
    .option('--data-testid <value>', 'Require matching data-test-id substring (repeatable).', collectStringArg, [])
    .option('--class-includes <value>', 'Require matching class substring (repeatable).', collectStringArg, [])
    .option('--tag <value>', 'Require matching tag name (repeatable).', collectStringArg, [])
    .option('--checked <value>', 'Filter on aria-checked state (true|false).')
    .option('--expanded <value>', 'Filter on aria-expanded state (true|false).')
    .option('--visible-only', 'Only consider visible nodes.', true)
    .option('--all', 'Include hidden nodes too.')
    .option('--limit <count>', 'Return at most N matches.', (value) => Number.parseInt(value, 10), 50)
    .option('--max-scan <count>', 'Scan at most N nodes before stopping.', (value) => Number.parseInt(value, 10), 5000)
    .option('--case-sensitive', 'Treat text filters as case-sensitive.', false)
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const parseBooleanOption = (value: unknown): boolean | null => {
        if (typeof value !== 'string') return null;
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
        throw new Error(`Expected "true" or "false", received "${value}".`);
      };
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port, { urlContains: commandOptions.urlContains as string | undefined });
      try {
        const result = await collectBrowserToolsDomSearch(page, {
          selector: commandOptions.selector as string | undefined,
          text: commandOptions.text as string[],
          ariaLabel: commandOptions.ariaLabel as string[],
          role: commandOptions.role as string[],
          dataTestId: commandOptions.dataTestid as string[] | undefined ?? commandOptions.dataTestId as string[] | undefined,
          classIncludes: commandOptions.classIncludes as string[],
          tag: commandOptions.tag as string[],
          checked: parseBooleanOption(commandOptions.checked),
          expanded: parseBooleanOption(commandOptions.expanded),
          visibleOnly: commandOptions.all ? false : Boolean(commandOptions.visibleOnly),
          caseSensitive: Boolean(commandOptions.caseSensitive),
          limit: commandOptions.limit as number,
          maxScan: commandOptions.maxScan as number,
        });
        if (commandOptions.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        printBrowserToolsDomSearch(result);
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('nav <url>')
    .description('Navigate the current tab or open a new tab.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--new', 'Open in a new tab.', false)
    .action(async (url: string, commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const browser = await connectBrowser(port);
      try {
        if (commandOptions.new) {
          const page = await browser.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          console.log('✓ Opened in new tab:', url);
        } else {
          const pages = await browser.pages();
          const page = pages.at(-1);
          if (!page) {
            throw new Error('No active tab found');
          }
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          console.log('✓ Navigated current tab to:', url);
        }
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('eval <code...>')
    .description('Evaluate JavaScript in the active page context.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .action(async (code: string[], commandOptions) => {
      const snippet = code.join(' ');
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port, { urlContains: commandOptions.urlContains as string | undefined });
      try {
        const result = await page.evaluate((body) => {
          const ASYNC_FN = Object.getPrototypeOf(async () => {}).constructor as AsyncFunctionCtor;
          return new ASYNC_FN(`return (${body})`)();
        }, snippet);

        if (Array.isArray(result)) {
          result.forEach((entry, index) => {
            if (index > 0) {
              console.log('');
            }
            Object.entries(entry).forEach(([key, value]) => {
              console.log(`${key}: ${value}`);
            });
          });
        } else if (typeof result === 'object' && result !== null) {
          Object.entries(result).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        } else {
          console.log(result);
        }
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('screenshot')
    .description('Capture the current viewport and print the temp PNG path.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port);
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(
          os.tmpdir(),
          `screenshot-${timestamp}.png`,
        ) as `${string}.png`;
        await page.screenshot({ path: filePath });
        console.log(filePath);
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('pick <message...>')
    .description('Interactive DOM picker that prints metadata for clicked elements.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .option('--url-contains <value>', 'Prefer a tab whose URL contains this value.')
    .option('--multi', 'Allow multiple selections without Cmd/Ctrl.', false)
    .option('--cycle [mode]', 'Cycle mode: on|off|auto (auto when --multi).')
    .option('--no-cycle', 'Disable cycle mode.')
    .option('--include-hover', 'Include the last hovered element in the output.', false)
    .option('--mode <mode>', 'Selection mode: click, hover, or both.', 'click')
    .option('--max <count>', 'Auto-finish after N selections.', (value) => Number.parseInt(value, 10))
    .option('--timeout <ms>', 'Auto-cancel after N milliseconds.', (value) => Number.parseInt(value, 10))
    .action(async (messageParts: string[], commandOptions) => {
      const message = messageParts.join(' ');
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port, { urlContains: commandOptions.urlContains as string | undefined });
      try {
        const cycleValue = commandOptions.cycle;
        const normalizedCycle =
          typeof cycleValue === 'string'
            ? cycleValue.toLowerCase()
            : typeof cycleValue === 'boolean'
              ? cycleValue
              : undefined;
        const cycle =
          normalizedCycle === 'on' || normalizedCycle === true
            ? true
            : normalizedCycle === 'off' || normalizedCycle === false
              ? false
              : undefined;
        const pickOptions = {
          multi: Boolean(commandOptions.multi),
          cycle,
          includeHover: Boolean(commandOptions.includeHover),
          mode: (commandOptions.mode as string) || 'click',
          max: Number.isFinite(commandOptions.max as number) ? (commandOptions.max as number) : undefined,
          timeout: Number.isFinite(commandOptions.timeout as number) ? (commandOptions.timeout as number) : undefined,
        };
        const pickScript = `
(() => {
  const scope = globalThis;
  scope.pickOverlayInjected = true;
  scope.pickOverlayVersion = '2';
  scope.pick = (prompt, options) =>
    new Promise((resolve) => {
      const selections = [];
      const selectedElements = new Set();
      let lastHover = null;
      let finished = false;
      let paused = false;
      const mode = (options && options.mode) || 'click';
      const allowHover = mode === 'hover' || mode === 'both';
      const allowClick = mode === 'click' || mode === 'both';
      const multi = Boolean(options && options.multi);
      const cycle =
        options && Object.prototype.hasOwnProperty.call(options, 'cycle')
          ? Boolean(options.cycle)
          : multi;
      const includeHover = Boolean(options && options.includeHover);
      const max = options && Number.isFinite(options.max) ? options.max : null;
      const timeout = options && Number.isFinite(options.timeout) ? options.timeout : null;

      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none';

      const highlight = document.createElement('div');
      highlight.style.cssText =
        'position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.05s ease';
      overlay.appendChild(highlight);

      const banner = document.createElement('div');
      banner.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:8px;font:14px system-ui;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647';

      const updateBanner = () => {
        const modeLabel = allowHover && allowClick ? 'click/hover' : allowHover ? 'hover' : 'click';
        const multiLabel = multi ? 'multi-click' : 'click';
        banner.textContent =
          prompt +
          ' (' +
          selections.length +
          ' selected, mode=' +
          modeLabel +
          ', ' +
          multiLabel +
          ', Enter=finish, ESC=cancel)';
      };

      const cleanup = () => {
        if (finished) return;
        finished = true;
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        banner.remove();
        selectedElements.forEach((el) => {
          el.style.outline = '';
        });
      };

      const pause = () => {
        if (paused || finished) return;
        paused = true;
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.style.display = 'none';
        banner.style.display = 'none';
      };

      const resume = () => {
        if (!paused || finished) return;
        paused = false;
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        overlay.style.display = '';
        banner.style.display = '';
        updateBanner();
      };

      const serialize = (el, source) => {
        const parents = [];
        let current = el.parentElement;
        while (current && current !== document.body) {
          const id = current.id ? '#' + current.id : '';
          const cls = current.className ? '.' + current.className.trim().split(/\\s+/).join('.') : '';
          parents.push(current.tagName.toLowerCase() + id + cls);
          current = current.parentElement;
        }
        return {
          source,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          class: el.className || null,
          text: (el.textContent || '').trim().slice(0, 200) || null,
          html: el.outerHTML.slice(0, 500),
          parents: parents.join(' > '),
        };
      };

      const onMove = (event) => {
        if (paused) return;
        const node = document.elementFromPoint(event.clientX, event.clientY);
        if (!node || overlay.contains(node) || banner.contains(node)) return;
        const rect = node.getBoundingClientRect();
        highlight.style.cssText =
          'position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);top:' +
          rect.top +
          'px;left:' +
          rect.left +
          'px;width:' +
          rect.width +
          'px;height:' +
          rect.height +
          'px';
        if (allowHover) {
          lastHover = node;
        }
      };
      const onClick = (event) => {
        if (!allowClick) return;
        if (banner.contains(event.target)) return;
        if (!cycle) {
          event.preventDefault();
          event.stopPropagation();
        }
        const node = document.elementFromPoint(event.clientX, event.clientY);
        if (!node || overlay.contains(node) || banner.contains(node)) return;

        if (multi || event.metaKey || event.ctrlKey) {
          if (!selectedElements.has(node)) {
            selectedElements.add(node);
            node.style.outline = '3px solid #10b981';
            selections.push(serialize(node, 'click'));
            updateBanner();
            if (max && selections.length >= max) {
              finalize();
              return;
            }
            if (cycle) {
              pause();
              setTimeout(resume, 150);
            }
          }
        } else {
          finalize(node);
        }
      };

      const finalize = (node) => {
        const output = selections.length > 0 ? selections.slice() : [];
        if (node && !selectedElements.has(node)) {
          output.push(serialize(node, 'click'));
        }
        if (includeHover && lastHover && !selectedElements.has(lastHover)) {
          output.push(serialize(lastHover, 'hover'));
        }
        cleanup();
        if (output.length > 0) {
          resolve(output.length === 1 ? output[0] : output);
        } else {
          resolve(null);
        }
      };

      const onKey = (event) => {
        if (event.key === 'Escape') {
          cleanup();
          resolve(null);
        } else if (event.key === 'Enter') {
          finalize();
        }
      };

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);

      document.body.append(overlay, banner);
      updateBanner();

      if (timeout && timeout > 0) {
        setTimeout(() => {
          if (!finished) {
            cleanup();
            resolve(null);
          }
        }, timeout);
      }
    });
})();
`;
        await page.evaluate((script) => {
          (0, eval)(script);
        }, pickScript);
        const injected = await page.evaluate(() => (globalThis as { pickOverlayInjected?: boolean }).pickOverlayInjected);
        if (!injected) {
          console.log('⚠️ Picker overlay did not inject. Try focusing the tab and re-run with --timeout 60000.');
        }

        const result = await page.evaluate((msg, pickOpts) => {
          const pickFn = (window as Window & { pick?: (message: string, options: unknown) => Promise<unknown> }).pick;
          if (!pickFn) {
            return null;
          }
          return pickFn(msg, pickOpts);
        }, message, {
          multi: pickOptions.multi,
          includeHover: pickOptions.includeHover,
          mode: pickOptions.mode,
          max: pickOptions.max ?? null,
          timeout: pickOptions.timeout ?? null,
        });

        if (Array.isArray(result)) {
          result.forEach((entry, index) => {
            if (index > 0) {
              console.log('');
            }
            Object.entries(entry).forEach(([key, value]) => {
              console.log(`${key}: ${value}`);
            });
          });
        } else if (result && typeof result === 'object') {
          Object.entries(result).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        } else {
          console.log(result);
        }
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('cookies')
    .description('Dump cookies from the active tab as JSON.')
    .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
    .action(async (commandOptions) => {
      const port = await options.resolvePortOrLaunch(withResolverOptions(commandOptions as Record<string, unknown>));
      const { browser, page } = await getActivePage(port);
      try {
        const cookies = await page.cookies();
        console.log(JSON.stringify(cookies, null, 2));
      } finally {
        await browser.disconnect();
      }
    });

  program
    .command('inspect')
    .description('List Chrome processes launched with --remote-debugging-port and show their open tabs.')
    .option('--ports <list>', 'Comma-separated list of ports to include.', parseNumberListArg)
    .option('--pids <list>', 'Comma-separated list of PIDs to include.', parseNumberListArg)
    .option('--json', 'Emit machine-readable JSON output.', false)
    .action(async (commandOptions) => {
      const ports = (commandOptions.ports as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
      const pids = (commandOptions.pids as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
      const sessions = await describeChromeSessions({
        ports,
        pids,
        includeAll: !ports?.length && !pids?.length,
      });
      if (commandOptions.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }
      if (sessions.length === 0) {
        console.log('No Chrome instances with DevTools ports found.');
        return;
      }
      sessions.forEach((session, index) => {
        if (index > 0) {
          console.log('');
        }
        const header = [`Chrome PID ${session.pid}`, `(port ${session.port})`];
        if (session.version?.Browser) {
          header.push(`- ${session.version.Browser}`);
        }
        console.log(header.join(' '));
        if (session.tabs.length === 0) {
          console.log('  (no tabs reported)');
          return;
        }
        session.tabs.forEach((tab, idx) => {
          const title = tab.title || '(untitled)';
          const url = tab.url || '(no url)';
          console.log(`  Tab ${idx + 1}: ${title}`);
          console.log(`           ${url}`);
        });
      });
    });

  program
    .command('kill')
    .description('Terminate Chrome instances that have DevTools ports open.')
    .option('--ports <list>', 'Comma-separated list of ports to target.', parseNumberListArg)
    .option('--pids <list>', 'Comma-separated list of PIDs to target.', parseNumberListArg)
    .option('--all', 'Kill every matching Chrome instance.', false)
    .option('--force', 'Skip the confirmation prompt.', false)
    .action(async (commandOptions) => {
      const ports = (commandOptions.ports as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
      const pids = (commandOptions.pids as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
      const killAll = Boolean(commandOptions.all);
      if (!killAll && (!ports?.length && !pids?.length)) {
        console.error('Specify --all, --ports <list>, or --pids <list> to select targets.');
        process.exit(1);
      }
      const sessions = await describeChromeSessions({ ports, pids, includeAll: killAll });
      if (sessions.length === 0) {
        console.log('No matching Chrome instances found.');
        return;
      }
      if (!commandOptions.force) {
        console.log('About to terminate the following Chrome sessions:');
        sessions.forEach((session) => {
          console.log(`  PID ${session.pid} (port ${session.port})`);
        });
        const rl = readline.createInterface({ input, output });
        const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
        rl.close();
        if (answer !== 'y' && answer !== 'yes') {
          console.log('Aborted.');
          return;
        }
      }
      const failures: { pid: number; error: string }[] = [];
      sessions.forEach((session) => {
        try {
          process.kill(session.pid);
          console.log(`✓ Killed Chrome PID ${session.pid} (port ${session.port})`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`✗ Failed to kill PID ${session.pid}: ${message}`);
          failures.push({ pid: session.pid, error: message });
        }
      });
      if (failures.length > 0) {
        process.exitCode = 1;
      }
    });

  return program;
}

export async function runBrowserToolsCli(options: BrowserToolsCliOptions): Promise<void> {
  const program = createBrowserToolsProgram(options);
  await program.parseAsync(options.argv ?? process.argv);
}
