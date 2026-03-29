import path from 'node:path';
import CDP from 'chrome-remote-interface';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import type { ChromeClient } from '../types.js';
import { transferAttachmentViaDataTransfer } from '../actions/attachmentDataTransfer.js';
import type { FileRef, Project, ProjectMemoryMode } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import {
  closeDialog,
  DEFAULT_DIALOG_SELECTORS,
  navigateAndSettle,
  openAndSelectMenuItem,
  openMenu,
  openSurface,
  pressButton,
  setInputValue,
  waitForPredicate,
  waitForSelector,
  withUiDiagnostics,
} from '../service/ui.js';

const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const CHATGPT_PROJECT_DIALOG_SELECTOR = '[data-testid="modal-new-project-enhanced"], dialog[open], [role="dialog"], dialog';
const CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS = [
  '[data-testid="modal-new-project-enhanced"]',
  'dialog[open]',
  '[role="dialog"]',
  'dialog',
] as const;
const CHATGPT_PROJECT_NAME_INPUT_SELECTOR = 'input[name="projectName"], input[aria-label="Project name"], #project-name';
const CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR = 'textarea[aria-label="Instructions"], textarea#instructions';
const CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL = 'Project settings';
const CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH = 'project settings';
const CHATGPT_COMPATIBLE_HOSTS = ['chatgpt.com', 'chat.openai.com'];
const CHATGPT_PROJECT_SOURCES_INPUT_ATTR = 'data-auracall-chatgpt-project-source-input';
const CHATGPT_PROJECT_SOURCE_ACTION_ATTR = 'data-auracall-chatgpt-project-source-action';

type ChatgptProjectLinkProbe = {
  id: string;
  name: string;
  url?: string | null;
};

type ChatgptAuthSessionProbe = {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  account?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

type ChatgptProjectSourceProbe = {
  rowText?: string | null;
  leafTexts?: string[] | null;
  metadataText?: string | null;
};

export function normalizeChatgptProjectId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(g-p-[a-z0-9]+)/i);
  return match?.[1] ?? null;
}

type ChromeClientWithFocusPolicy = ChromeClient & { __auracallSuppressFocus?: boolean };

function setClientSuppressFocus(client: ChromeClient, suppressFocus: boolean | undefined): void {
  (client as ChromeClientWithFocusPolicy).__auracallSuppressFocus = Boolean(suppressFocus);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePortFromEnv(): number | null {
  const raw = process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveBrowserTabPolicy(
  options: Pick<BrowserProviderListOptions, 'browserService'> | undefined,
): {
  serviceTabLimit?: number;
  blankTabLimit?: number;
  collapseDisposableWindows?: boolean;
  suppressFocus?: boolean;
} {
  const config = options?.browserService?.getConfig?.();
  return {
    serviceTabLimit: config?.serviceTabLimit ?? undefined,
    blankTabLimit: config?.blankTabLimit ?? undefined,
    collapseDisposableWindows: config?.collapseDisposableWindows,
    suppressFocus: config?.hideWindow ?? undefined,
  };
}

function resolveChatgptTargetId(
  target:
    | { targetId?: string | null; id?: string | null }
    | string
    | null
    | undefined,
): string | undefined {
  if (!target) return undefined;
  if (typeof target === 'string') return target;
  return target.targetId ?? target.id ?? undefined;
}

function isChatgptUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return CHATGPT_COMPATIBLE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeProjectName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeUiText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeFileKey(value: string | null | undefined): string {
  return normalizeUiText(value).toLowerCase();
}

function isRetryableConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('WebSocket connection closed') || message.includes('ECONNRESET');
}

export function extractChatgptProjectIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match =
      parsed.pathname.match(/^\/g\/([^/]+)\/project\/?$/) ??
      parsed.pathname.match(/^\/g\/([^/]+)\/c\/[^/]+\/?$/);
    return normalizeChatgptProjectId(match?.[1]) ?? null;
  } catch {
    return null;
  }
}

export function findChatgptProjectByName<T extends { id: string; name: string; url?: string }>(
  projects: readonly T[],
  name: string,
): T | null {
  const target = normalizeProjectName(name);
  return projects.find((project) => normalizeProjectName(project.name) === target) ?? null;
}

export function resolveChatgptProjectMemoryLabel(mode: ProjectMemoryMode): 'Default' | 'Project-only' {
  return mode === 'project' ? 'Project-only' : 'Default';
}

export function normalizeChatgptAuthSessionIdentity(
  probe: ChatgptAuthSessionProbe | null | undefined,
): ProviderUserIdentity | null {
  if (!probe || typeof probe !== 'object') {
    return null;
  }
  const user = probe.user && typeof probe.user === 'object' ? probe.user : null;
  const account = probe.account && typeof probe.account === 'object' ? probe.account : null;
  const normalize = (value: string | null | undefined): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const id = normalize(user?.id) ?? normalize(account?.id);
  const email = normalize(user?.email) ?? normalize(account?.email);
  const name = normalize(user?.name) ?? normalize(account?.name);
  if (!id && !email && !name) {
    return null;
  }
  return {
    id,
    email,
    name,
    source: 'auth-session',
  };
}

export function extractChatgptProjectSourceName(
  probe: Pick<ChatgptProjectSourceProbe, 'rowText' | 'leafTexts'> | null | undefined,
): string | null {
  if (!probe || typeof probe !== 'object') return null;
  const rowText = normalizeUiText(probe.rowText);
  const leafTexts = Array.isArray(probe.leafTexts)
    ? Array.from(
        new Set(
          probe.leafTexts
            .map((value) => normalizeUiText(value))
            .filter(Boolean),
        ),
      )
    : [];
  for (const candidate of leafTexts) {
    if (candidate === rowText) continue;
    if (candidate.includes(' · ')) continue;
    if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\b/i.test(candidate)) continue;
    return candidate;
  }
  const beforeMeta = rowText.split(/\s+·\s+/)[0]?.trim() ?? '';
  if (!beforeMeta) return null;
  const stripped = beforeMeta.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, '').trim();
  return stripped || beforeMeta || null;
}

export function normalizeChatgptProjectSourceProbes(
  probes: readonly ChatgptProjectSourceProbe[],
): FileRef[] {
  const files: FileRef[] = [];
  const seen = new Set<string>();
  for (const probe of probes) {
    const name = extractChatgptProjectSourceName(probe);
    if (!name) continue;
    const key = normalizeFileKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const metadataText = normalizeUiText(probe.metadataText);
    files.push({
      id: name,
      name,
      provider: 'chatgpt',
      source: 'project',
      metadata: metadataText ? { label: metadataText } : undefined,
    });
  }
  return files;
}

function buildProjectRouteExpression(projectId?: string): string {
  return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const normalized = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!normalized) return null;
    const id = normalized[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && id !== expected) return null;
    return { id, href: location.href, title: document.title };
  })()`;
}

function buildProjectRouteChangeExpression(initialProjectId?: string | null): string {
  return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const found = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!found) return null;
    const normalized = found[1];
    const initial = ${JSON.stringify(initialProjectId ?? null)};
    if (initial && normalized === initial) return null;
    return { id: normalized, href: location.href, title: document.title };
  })()`;
}

function buildProjectNameAppliedExpression(projectId: string, expectedName: string): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const expected = normalize(${JSON.stringify(expectedName)});
    if (!expected) return null;
    const values = new Set();
    const title = document.title.replace(/^ChatGPT\\s*-\\s*/i, '');
    values.add(normalize(title));
    const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((node) => normalize(node.getAttribute('aria-label') || '').startsWith('edit the title of '));
    if (titleButton) {
      values.add(normalize(titleButton.textContent || ''));
      const aria = normalize(titleButton.getAttribute('aria-label') || '');
      if (aria.startsWith('edit the title of ')) {
        values.add(aria.replace(/^edit the title of\\s+/, ''));
      }
    }
    const projectLink = document.querySelector(${JSON.stringify(`a[href*="/g/${projectId}/project"]`)});
    if (projectLink) {
      values.add(normalize(projectLink.textContent || ''));
    }
    return Array.from(values).some((value) => value === expected) ? { values: Array.from(values) } : null;
  })()`;
}

function buildProjectSurfaceReadyExpression(projectId?: string | null): string {
  return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll('button,[role="button"],a,[role="tab"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || node.textContent || ''))
      .filter(Boolean);
    const hasProjectControls =
      labels.some((label) => label.startsWith('edit the title of ')) ||
      labels.includes('show project details') ||
      (labels.includes('chats') && labels.includes('sources'));
    return hasProjectControls ? { id: normalizedId, href: location.href, labels: labels.slice(0, 20) } : null;
  })()`;
}

function buildProjectSettingsReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasNameInput = Boolean(dialog.querySelector('input[aria-label="Project name"]'));
      const hasInstructions = Boolean(dialog.querySelector('textarea[aria-label="Instructions"], textarea#instructions'));
      const hasDelete = Array.from(dialog.querySelectorAll('button'))
        .some((button) => normalize(button.textContent || '') === 'delete project');
      if (hasNameInput || hasInstructions || hasDelete || text.includes('project settings')) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

function buildProjectSourcesReadyExpression(projectId?: string | null): string {
  return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const queryTab = new URL(location.href).searchParams.get('tab');
    const sourceTab = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((node) => {
        const id = String(node.getAttribute('id') || '');
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        return id.endsWith('-sources') || label === 'sources';
      });
    const selected = String(sourceTab?.getAttribute('aria-selected') || '').toLowerCase() === 'true';
    const addSources = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((node) => {
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        return label === 'add sources' || label === 'add';
      });
    const hasRows = document.querySelectorAll('button[aria-label="Source actions"]').length > 0;
    return (selected || queryTab === 'sources') && (Boolean(addSources) || hasRows)
      ? { id: normalizedId, href: location.href, selected, hasRows }
      : null;
  })()`;
}

function buildProjectSourcesUploadDialogReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasInput = Boolean(dialog.querySelector('input[type="file"][multiple]'));
      const hasUpload = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .some((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === 'upload');
      if ((text.includes('add sources') || text.includes('drag sources here')) && hasInput && hasUpload) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

function buildProjectSourcesSnapshotExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const panel = Array.from(document.querySelectorAll('[role="tabpanel"]'))
      .find((node) => String(node.getAttribute('aria-labelledby') || '').endsWith('-sources'));
    const scope = panel || document;
    const rows = Array.from(scope.querySelectorAll('div[class*="group/file-row"]'));
    return rows.map((row) => {
      const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
        .map((node) => normalize(node.textContent || ''))
        .filter(Boolean)
        .slice(0, 24);
      const metadataText = leafTexts.find((text) => text.includes(' · ')) || null;
      return {
        rowText: normalize(row.textContent || ''),
        leafTexts,
        metadataText,
      };
    });
  })()`;
}

function buildProjectSourceNamesPresentExpression(fileNames: readonly string[]): string {
  return `(() => {
    const expected = ${JSON.stringify(fileNames)}.map((value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
    if (expected.length === 0) return { ok: true, names: [] };
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll('div[class*="group/file-row"]'))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    const unique = Array.from(new Set(texts));
    const matches = expected.filter((name) => unique.some((text) => text === name || text.includes(name)));
    return matches.length === expected.length ? { ok: true, matches, names: unique.slice(0, 40) } : null;
  })()`;
}

function buildProjectSourceRemovedExpression(fileName: string): string {
  return `(() => {
    const expected = String(${JSON.stringify(fileName)} || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll('div[class*="group/file-row"]'))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    return texts.some((text) => text === expected || text.includes(expected)) ? null : { ok: true };
  })()`;
}

function buildChatgptAuthSessionIdentityExpression(): string {
  return `(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        user: data?.user
          ? {
              id: typeof data.user.id === 'string' ? data.user.id : null,
              name: typeof data.user.name === 'string' ? data.user.name : null,
              email: typeof data.user.email === 'string' ? data.user.email : null,
            }
          : null,
        account: data?.account
          ? {
              id: typeof data.account.id === 'string' ? data.account.id : null,
              name: typeof data.account.name === 'string' ? data.account.name : null,
              email: typeof data.account.email === 'string' ? data.account.email : null,
            }
          : null,
      };
    } catch {
      return null;
    }
  })()`;
}

function buildChatgptFallbackIdentityExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').trim();
    const storageKeys = Object.keys(window.localStorage || {});
    const userKey = storageKeys.find((key) => /(?:^|\\/)user-[A-Za-z0-9]+/.test(key)) || '';
    const idMatch = userKey.match(/(user-[A-Za-z0-9]+)/);
    const profileTrigger = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || ''))
      .find((label) => /open profile menu$/i.test(label) && label.toLowerCase() !== 'open profile menu');
    const name = profileTrigger ? profileTrigger.replace(/,?\\s*open profile menu$/i, '').trim() : '';
    return {
      user: {
        id: idMatch ? idMatch[1] : null,
        name: name || null,
        email: null,
      },
      account: null,
    };
  })()`;
}

function buildProjectDeleteConfirmationExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const labels = Array.from(dialog.querySelectorAll('button'))
        .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
        .filter(Boolean);
      if (text.includes('delete project?') && labels.includes('delete') && labels.includes('cancel')) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

async function connectToChatgptTab(
  options?: BrowserProviderListOptions,
  urlOverride?: string,
): Promise<{
  client: ChromeClient;
  targetId?: string;
  shouldClose: boolean;
  host: string;
  port: number;
  usedExisting: boolean;
}> {
  let host = options?.host ?? '127.0.0.1';
  let port = options?.port ?? resolvePortFromEnv();
  if (options?.tabTargetId && port) {
    try {
      const client = await connectToChromeTarget({ host, port, target: options.tabTargetId });
      await Promise.all([client.Page.enable(), client.Runtime.enable()]);
      setClientSuppressFocus(client, resolveBrowserTabPolicy(options).suppressFocus);
      return {
        client,
        targetId: options.tabTargetId,
        shouldClose: false,
        host,
        port,
        usedExisting: true,
      };
    } catch {
      // Fall back to rescanning below when the previously resolved target id went stale.
    }
  }

  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'chatgpt';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string; id?: string } | null }>;
      })
    | undefined;
  const preferredUrl = urlOverride ?? options?.configuredUrl ?? CHATGPT_HOME_URL;
  let resolvedTargetIdFromService: string | undefined;
  if (serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'chatgpt',
      configuredUrl: preferredUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    resolvedTargetIdFromService = resolveChatgptTargetId(target.tab);
  }
  if ((!port || !host) && options?.browserService) {
    const target = await options.browserService.resolveDevToolsTarget({
      host,
      port: port ?? undefined,
      ensurePort: true,
      launchUrl: preferredUrl,
    });
    host = target.host ?? host;
    port = target.port ?? port;
  }
  if (!port) {
    throw new Error('Missing DevTools port. Launch a ChatGPT browser session or set AURACALL_BROWSER_PORT.');
  }

  const resolvedPort = port;
  const targets = await CDP.List({ host, port: resolvedPort });
  const candidates = targets.filter((target) => target.type === 'page' && isChatgptUrl(target.url ?? ''));
  const serviceResolved = resolvedTargetIdFromService
    ? candidates.find((target) => resolveChatgptTargetId(target) === resolvedTargetIdFromService)
    : undefined;
  let targetInfo = serviceResolved ?? candidates[0];
  let shouldClose = false;
  let usedExisting = Boolean(resolveChatgptTargetId(targetInfo));
  const tabPolicy = resolveBrowserTabPolicy(options);

  if (!targetInfo) {
    const opened = await openOrReuseChromeTarget(resolvedPort, preferredUrl, {
      host,
      reusePolicy: 'same-origin',
      compatibleHosts: CHATGPT_COMPATIBLE_HOSTS,
      matchingTabLimit: tabPolicy.serviceTabLimit,
      blankTabLimit: tabPolicy.blankTabLimit,
      collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
      suppressFocus: tabPolicy.suppressFocus,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  }

  const targetId = resolveChatgptTargetId(targetInfo);
  if (!targetId) {
    throw new Error('No ChatGPT tab found. Launch a ChatGPT browser session and retry.');
  }
  const client = await connectToChromeTarget({ host, port: resolvedPort, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  setClientSuppressFocus(client, tabPolicy.suppressFocus);
  return { client, targetId, shouldClose, host, port: resolvedPort, usedExisting };
}

async function ensureChatgptSidebarOpen(client: ChromeClient): Promise<void> {
  const sidebarReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const sidebarMarkers = [
        ...Array.from(document.querySelectorAll('button,a,[role="button"]'))
          .map((node) => String(node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()),
      ];
      return sidebarMarkers.includes('new project') ? { ok: true } : null;
    })()`,
    { timeoutMs: 800 },
  );
  if (sidebarReady.ok) return;
  const opened = await pressButton(client.Runtime, {
    match: { exact: ['open sidebar'] },
    requireVisible: true,
    timeoutMs: 2000,
  });
  if (!opened.ok) {
    return;
  }
  await waitForPredicate(
    client.Runtime,
    `(() => Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .some((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === 'new project') || null)()`,
    { timeoutMs: 3000 },
  );
}

async function navigateToChatgptUrl(client: ChromeClient, url: string, projectId?: string): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildProjectRouteExpression(projectId),
    routeDescription: projectId ? `chatgpt project ${projectId}` : `chatgpt route ${url}`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 10_000,
  });
  if (projectId && !settled.ok) {
    throw new Error(settled.reason || `ChatGPT project ${projectId} did not settle`);
  }
}

async function openProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
  const url = `https://chatgpt.com/g/${projectId}/project?tab=sources`;
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildProjectRouteExpression(projectId),
    routeDescription: `chatgpt project ${projectId}`,
    readyExpression: buildProjectSourcesReadyExpression(projectId),
    readyDescription: `ChatGPT project sources ready for ${projectId}`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 10_000,
  });
  if (settled.ok) return;
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSourcesReadyExpression(projectId),
        readyDescription: `ChatGPT project sources ready for ${projectId}`,
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'sources-tab-id',
            trigger: {
              selector: '[role="tab"][id$="-sources"]',
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'sources-tab-label',
            trigger: {
              match: { exact: ['sources'] },
              rootSelectors: ['[role="tablist"]'],
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project sources tab did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-sources',
      candidateSelectors: ['[role="tab"]', 'button', '[role="button"]', 'div[class*="group/file-row"]'],
      context: {
        surface: 'chatgpt-project-sources',
        projectId,
      },
    },
  );
}

async function readChatgptProjectSourceFiles(client: ChromeClient): Promise<FileRef[]> {
  const { result } = await client.Runtime.evaluate({
    expression: buildProjectSourcesSnapshotExpression(),
    returnByValue: true,
  });
  const probes = Array.isArray(result?.value) ? (result.value as ChatgptProjectSourceProbe[]) : [];
  return normalizeChatgptProjectSourceProbes(probes);
}

async function readChatgptProjectSourceFilesSettled(
  client: ChromeClient,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<FileRef[]> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const pollMs = options?.pollMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  let last: FileRef[] = [];
  while (Date.now() < deadline) {
    const files = await readChatgptProjectSourceFiles(client);
    if (files.length > 0) {
      return files;
    }
    last = files;
    await sleep(pollMs);
  }
  return last;
}

async function reloadProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
  await client.Page.reload({ ignoreCache: true });
  const ready = await waitForPredicate(
    client.Runtime,
    buildProjectSourcesReadyExpression(projectId),
    {
      timeoutMs: 15_000,
      description: `ChatGPT project sources ready after reload for ${projectId}`,
    },
  );
  if (ready.ok) return;
  await openProjectSourcesTab(client, projectId);
}

async function waitForProjectSourceNamesPersisted(
  client: ChromeClient,
  projectId: string,
  expectedNames: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 30_000;
  await sleep(4_000);
  while (Date.now() < deadline) {
    await reloadProjectSourcesTab(client, projectId);
    const persisted = await waitForPredicate(
      client.Runtime,
      buildProjectSourceNamesPresentExpression(expectedNames),
      {
        timeoutMs: 8_000,
        description: `ChatGPT project source list persisted for ${projectId}`,
      },
    );
    if (persisted.ok) {
      return;
    }
    await sleep(2_000);
  }
  throw new Error(`ChatGPT project source upload did not persist for ${projectId}`);
}

async function waitForProjectSourceRemovedPersisted(
  client: ChromeClient,
  projectId: string,
  fileName: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  await sleep(1_500);
  while (Date.now() < deadline) {
    await reloadProjectSourcesTab(client, projectId);
    const removed = await waitForPredicate(
      client.Runtime,
      buildProjectSourceRemovedExpression(fileName),
      {
        timeoutMs: 6_000,
        description: `ChatGPT project source removed after reload: ${fileName}`,
      },
    );
    if (removed.ok) {
      return;
    }
    await sleep(1_500);
  }
  throw new Error(`ChatGPT project source "${fileName}" still appeared after reload`);
}

async function openProjectSourcesUploadDialog(client: ChromeClient, projectId: string): Promise<void> {
  await openProjectSourcesTab(client, projectId);
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSourcesUploadDialogReadyExpression(),
        readyDescription: `ChatGPT project sources upload dialog ready for ${projectId}`,
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'add-sources',
            trigger: {
              match: { exact: ['add sources'] },
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'add-empty-state',
            trigger: {
              match: { exact: ['add'] },
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project sources upload dialog did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-sources-upload-dialog',
      candidateSelectors: ['button', '[role="button"]', '[role="dialog"]', 'input[type="file"]'],
      context: {
        surface: 'chatgpt-project-sources-upload-dialog',
        projectId,
      },
    },
  );
}

async function tagChatgptProjectSourceInput(client: ChromeClient): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCES_INPUT_ATTR)};
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const dialog = document.querySelector('[role="dialog"], dialog[open]') || document;
      const input = Array.from(dialog.querySelectorAll('input[type="file"][multiple]'))
        .find((node) => !['upload-files', 'upload-photos', 'upload-camera'].includes(node.id));
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false };
      }
      input.setAttribute(attribute, 'true');
      return { ok: true, selector: 'input[' + attribute + '="true"]' };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; selector?: string } | undefined;
  if (!info?.ok || !info.selector) {
    throw new Error('ChatGPT project sources file input not found');
  }
  return info.selector;
}

async function uploadChatgptProjectSourceFilesWithClient(
  client: ChromeClient,
  projectId: string,
  filePaths: readonly string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  await openProjectSourcesUploadDialog(client, projectId);
  const selector = await tagChatgptProjectSourceInput(client);
  await client.DOM.enable();
  const documentRoot = await client.DOM.getDocument({ depth: 0 });
  const query = await client.DOM.querySelector({
    nodeId: documentRoot.root.nodeId,
    selector,
  });
  if (!query.nodeId) {
    throw new Error('ChatGPT project sources upload input could not be resolved');
  }
  await client.DOM.setFileInputFiles({
    nodeId: query.nodeId,
    files: [...filePaths],
  });
  await client.Runtime.evaluate({
    expression: `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
  const expectedNames = filePaths.map((filePath) => path.basename(filePath));
  const uploadReady = await waitForPredicate(
    client.Runtime,
    buildProjectSourceNamesPresentExpression(expectedNames),
    {
      timeoutMs: 12_000,
      description: `ChatGPT project sources appeared for ${projectId}`,
    },
  );
  if (!uploadReady.ok && filePaths.length === 1) {
    await transferAttachmentViaDataTransfer(
      client.Runtime,
      {
        path: filePaths[0],
        displayPath: filePaths[0],
      },
      selector,
    );
  }
  const previewVerified = await waitForPredicate(
    client.Runtime,
    buildProjectSourceNamesPresentExpression(expectedNames),
    {
      timeoutMs: 12_000,
      description: `ChatGPT project source preview ready for ${projectId}`,
    },
  );
  if (!previewVerified.ok) {
    throw new Error(`ChatGPT project source upload preview did not appear for ${projectId}`);
  }
  await waitForProjectSourceNamesPersisted(client, projectId, expectedNames);
}

async function tagChatgptProjectSourceAction(client: ChromeClient, fileName: string): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_ATTR)};
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const rows = Array.from(document.querySelectorAll('div[class*="group/file-row"]'));
      const extractName = (row) => {
        const rowText = String(row.textContent || '').replace(/\\s+/g, ' ').trim();
        const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
          .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        for (const candidate of leafTexts) {
          if (candidate === rowText) continue;
          if (candidate.includes(' · ')) continue;
          if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\\b/i.test(candidate)) continue;
          return candidate;
        }
        const beforeMeta = rowText.split(/\\s+·\\s+/)[0]?.trim() ?? '';
        return beforeMeta.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, '').trim() || beforeMeta;
      };
      for (const row of rows) {
        const name = normalize(extractName(row));
        if (!name || name !== expected) continue;
        const button = row.querySelector('button[aria-label="Source actions"]');
        if (!(button instanceof HTMLButtonElement)) continue;
        button.setAttribute(attribute, 'true');
        return { ok: true, selector: 'button[' + attribute + '="true"]' };
      }
      return {
        ok: false,
        candidates: rows
          .map((row) => extractName(row))
          .filter(Boolean)
          .slice(0, 10),
      };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; selector?: string; candidates?: string[] } | undefined;
  if (!info?.ok || !info.selector) {
    const candidates = Array.isArray(info?.candidates) && info.candidates.length > 0
      ? ` (${info.candidates.join(', ')})`
      : '';
    throw new Error(`ChatGPT project source action button not found for "${fileName}"${candidates}`);
  }
  return info.selector;
}

async function confirmChatgptProjectSourceRemovalIfPresent(client: ChromeClient, fileName: string): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))) {
        const text = normalize(dialog.textContent || '');
        if (!text.includes('remove') && !text.includes('delete')) continue;
        if (expected && text && !text.includes(expected) && !text.includes('source')) continue;
        const button = Array.from(dialog.querySelectorAll('button'))
          .find((node) => {
            const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
            return label === 'remove' || label === 'delete';
          });
        if (button instanceof HTMLButtonElement) {
          button.click();
          return true;
        }
      }
      return false;
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
}

async function openCreateProjectModalWithClient(client: ChromeClient): Promise<void> {
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      await ensureChatgptSidebarOpen(client);
      const alreadyOpen = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 500);
      if (alreadyOpen) return;
      const pressed = await pressButton(client.Runtime, {
        match: { exact: ['new project'] },
        requireVisible: true,
        timeoutMs: 3000,
      });
      if (!pressed.ok) {
        throw new Error(pressed.reason || 'New project button not found');
      }
      const ready = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 5000);
      if (!ready) {
        throw new Error('ChatGPT create-project dialog did not open');
      }
    },
    {
      label: 'chatgpt-open-create-project-modal',
      candidateSelectors: ['button', '[role="button"]', 'dialog', '[role="dialog"]'],
    },
  );
}

async function readChatgptUserIdentity(client: ChromeClient): Promise<ProviderUserIdentity | null> {
  const authSessionResult = await client.Runtime.evaluate({
    expression: buildChatgptAuthSessionIdentityExpression(),
    awaitPromise: true,
    returnByValue: true,
  });
  const authIdentity = normalizeChatgptAuthSessionIdentity(
    (authSessionResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null,
  );
  if (authIdentity) {
    return authIdentity;
  }

  const fallbackResult = await client.Runtime.evaluate({
    expression: buildChatgptFallbackIdentityExpression(),
    returnByValue: true,
  });
  return normalizeChatgptAuthSessionIdentity(
    (fallbackResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null,
  );
}

async function setCreateProjectFieldsWithClient(
  client: ChromeClient,
  fields: { name?: string; instructions?: string; memoryMode?: ProjectMemoryMode },
): Promise<void> {
  if (fields.name) {
    const ok = await setInputValue(client.Runtime, {
      selector: CHATGPT_PROJECT_NAME_INPUT_SELECTOR,
      rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
      value: fields.name,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!ok) {
      throw new Error('ChatGPT project name input not found');
    }
  }
  if (fields.memoryMode) {
    await setCreateProjectMemoryModeWithClient(client, fields.memoryMode);
  }
}

async function setCreateProjectMemoryModeWithClient(
  client: ChromeClient,
  memoryMode: ProjectMemoryMode,
): Promise<void> {
  const targetLabel = resolveChatgptProjectMemoryLabel(memoryMode);
  const interactionStrategies = ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const;
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const menuAlreadyOpen = await waitForSelector(client.Runtime, '[role="menu"] [role="menuitemradio"]', 250);
      if (!menuAlreadyOpen) {
        const opened = await openMenu(client.Runtime, {
          trigger: {
            match: { exact: [CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH] },
            requireVisible: true,
            rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
            interactionStrategies,
          },
          menuSelector: '[role="menu"]',
          timeoutMs: 3000,
        });
        if (!opened.ok) {
          const detail = JSON.stringify({
            reason: opened.reason,
            interactionStrategies,
            attemptedStrategies: opened.attemptedStrategies,
            rootSelectorUsed: opened.rootSelectorUsed,
          });
          throw new Error(`ChatGPT project settings menu trigger did not open (${detail})`);
        }
      }
      const { result } = await client.Runtime.evaluate({
        expression: `(() => {
          const target = ${JSON.stringify(targetLabel.toLowerCase())};
          const items = Array.from(document.querySelectorAll('[role="menuitemradio"]'));
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const item = items.find((node) => normalize(node.textContent).startsWith(target));
          if (!item) {
            return {
              ok: false,
              reason: 'memory-option-missing',
              visibleOptions: items.map((node) => normalize(node.textContent)),
            };
          }
          item.click();
          return { ok: true };
        })()`,
        returnByValue: true,
      });
      const info = result?.value as
        | { ok?: boolean; reason?: string; visibleOptions?: string[] }
        | undefined;
      if (!info?.ok) {
        const visible = Array.isArray(info?.visibleOptions) && info.visibleOptions.length > 0
          ? ` (${info.visibleOptions.join(', ')})`
          : '';
        throw new Error(`${info?.reason || 'memory-option-click-failed'}${visible}`);
      }
      const closed = await waitForPredicate(
        client.Runtime,
        `(() => {
          const button = Array.from(document.querySelectorAll('button'))
            .find((node) => String(node.getAttribute('aria-label') || '') === ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL)});
          if (!button) return null;
          const expanded = String(button.getAttribute('aria-expanded') || '').toLowerCase();
          return expanded === '' || expanded === 'false' ? { ok: true } : null;
        })()`,
        {
          timeoutMs: 3000,
          description: `ChatGPT project settings menu closed after selecting ${targetLabel}`,
        },
      );
      if (!closed.ok) {
        throw new Error(`ChatGPT project settings menu did not close after selecting ${targetLabel}`);
      }
    },
    {
      label: 'chatgpt-set-create-project-memory-mode',
      candidateSelectors: ['button', '[role="menuitemradio"]', '[role="menu"]'],
      context: {
        triggerLabel: CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL,
        triggerRoots: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
        interactionStrategies: [...interactionStrategies],
      },
    },
  );
}

async function clickCreateProjectConfirmWithClient(client: ChromeClient): Promise<void> {
  const ready = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 5000);
  if (!ready) {
    throw new Error('ChatGPT create-project dialog not found');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector(${JSON.stringify(CHATGPT_PROJECT_DIALOG_SELECTOR)}) ||
        document.querySelector('dialog[open]') ||
        document.querySelector('[role="dialog"]');
      if (!dialog) return { ok: false, reason: 'dialog-missing' };
      const button = Array.from(dialog.querySelectorAll('button'))
        .find((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === 'create project');
      if (!button) return { ok: false, reason: 'button-missing' };
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; reason?: string } | undefined;
  if (!info?.ok) {
    throw new Error(info?.reason || 'ChatGPT create project button not found');
  }
}

async function openProjectSettingsPanel(client: ChromeClient, projectId: string): Promise<void> {
  await navigateToChatgptUrl(client, `https://chatgpt.com/g/${projectId}/project`, projectId);
  const readySurface = await waitForPredicate(
    client.Runtime,
    buildProjectSurfaceReadyExpression(projectId),
    {
      timeoutMs: 15_000,
      description: `ChatGPT project surface ready for ${projectId}`,
    },
  );
  if (!readySurface.ok) {
    throw new Error(`ChatGPT project surface did not hydrate for ${projectId}`);
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSettingsReadyExpression(),
        readyDescription: 'ChatGPT project settings ready',
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'edit-title',
            trigger: {
              match: { startsWith: ['edit the title of'] },
              requireVisible: true,
              timeoutMs: 5_000,
            },
          },
          {
            name: 'show-project-details',
            trigger: {
              match: { exact: ['show project details'] },
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'edit-title-retry',
            trigger: {
              match: { startsWith: ['edit the title of'] },
              requireVisible: true,
              timeoutMs: 5_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project settings did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-settings',
      candidateSelectors: ['button', '[role="button"]', 'input', 'textarea'],
      context: {
        surface: 'chatgpt-project-settings',
        fallbackTriggers: ['edit-title', 'show-project-details', 'edit-title-retry'],
      },
    },
  );
}

async function applyProjectSettings(
  client: ChromeClient,
  projectId: string,
  fields: { name?: string; instructions?: string },
): Promise<void> {
  await openProjectSettingsPanel(client, projectId);
  if (fields.name) {
    const renamed = await setInputValue(client.Runtime, {
      selector: 'input[aria-label="Project name"]',
      rootSelectors: DEFAULT_DIALOG_SELECTORS,
      value: fields.name,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!renamed) {
      throw new Error('ChatGPT project settings name input not found');
    }
  }
  if (fields.instructions !== undefined) {
    const updated = await setInputValue(client.Runtime, {
      selector: CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR,
      rootSelectors: DEFAULT_DIALOG_SELECTORS,
      value: fields.instructions,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!updated) {
      throw new Error('ChatGPT project instructions textarea not found');
    }
  }
  await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
}

async function waitForProjectNameApplied(
  client: ChromeClient,
  projectId: string,
  expectedName: string,
): Promise<void> {
  const result = await waitForPredicate(
    client.Runtime,
    buildProjectNameAppliedExpression(projectId, expectedName),
    {
      timeoutMs: 8000,
      description: `ChatGPT project name ${expectedName} applied`,
    },
  );
  if (!result.ok) {
    throw new Error('ChatGPT project rename did not apply');
  }
}

async function readCurrentProject(client: ChromeClient): Promise<Project | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
      if (!match) return null;
      const projectId = match[1];
      const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith('edit the title of '));
      const title = (titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || projectId)
        .replace(/\\s+/g, ' ')
        .trim();
      return {
        id: projectId,
        name: title || projectId,
        url: location.href,
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { id?: string; name?: string; url?: string } | null;
  const normalizedId = normalizeChatgptProjectId(value?.id);
  if (!normalizedId) return null;
  return {
    id: normalizedId,
    name: value?.name || normalizedId,
    provider: 'chatgpt',
    url: value?.url || `https://chatgpt.com/g/${normalizedId}/project`,
  };
}

async function scrapeChatgptProjects(client: ChromeClient): Promise<Project[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const parseProjectId = (href) => {
        try {
          const url = new URL(href, location.origin);
          const match = url.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/) || url.pathname.match(/^\\/g\\/([^/]+)\\/c\\/[^/]+\\/?$/);
          if (!match) return null;
          const raw = String(match[1] || '').trim();
          const normalized = raw.match(/^(g-p-[a-z0-9]+)/i);
          return normalized ? normalized[1] : null;
        } catch {
          return null;
        }
      };
      const projects = new Map();
      const currentId = parseProjectId(location.href);
      if (currentId) {
        const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
          .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith('edit the title of '));
        const currentName = normalize(titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || currentId);
        projects.set(currentId, {
          id: currentId,
          name: currentName || currentId,
          url: location.href,
        });
      }
      for (const link of Array.from(document.querySelectorAll('a[href*="/project"]'))) {
        const href = link.getAttribute('href') || '';
        const projectId = parseProjectId(href);
        if (!projectId) continue;
        const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
        const name = normalize(link.textContent || projectId) || projectId;
        if (!projects.has(projectId)) {
          projects.set(projectId, { id: projectId, name, url });
        }
      }
      return Array.from(projects.values());
    })()`,
    returnByValue: true,
  });
  const probes = (result?.value ?? []) as ChatgptProjectLinkProbe[];
  return probes.map((project) => ({
    id: project.id,
    name: project.name,
    provider: 'chatgpt',
    url: project.url ?? `https://chatgpt.com/g/${project.id}/project`,
  }));
}

export function createChatgptAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'getUserIdentity'
  | 'listProjects'
  | 'listProjectFiles'
  | 'uploadProjectFiles'
  | 'deleteProjectFile'
  | 'renameProject'
  | 'openCreateProjectModal'
  | 'setCreateProjectFields'
  | 'clickCreateProjectConfirm'
  | 'createProject'
  | 'selectRemoveProjectItem'
  | 'pushProjectRemoveConfirmation'
> {
  return {
    capabilities: {
      projects: true,
      files: true,
    },
    async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        return await readChatgptUserIdentity(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const attempt = async (currentOptions?: BrowserProviderListOptions): Promise<Project[]> => {
        const { client } = await connectToChatgptTab(currentOptions, currentOptions?.configuredUrl ?? CHATGPT_HOME_URL);
        try {
          await ensureChatgptSidebarOpen(client);
          return await scrapeChatgptProjects(client);
        } finally {
          await client.close().catch(() => undefined);
        }
      };
      try {
        return await attempt(options);
      } catch (error) {
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
        const retryOptions = options ? { ...options, tabTargetId: undefined } : undefined;
        return attempt(retryOptions);
      }
    },
    async openCreateProjectModal(options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await openCreateProjectModalWithClient(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async setCreateProjectFields(
      fields: { name?: string; instructions?: string; modelLabel?: string; memoryMode?: ProjectMemoryMode },
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await openCreateProjectModalWithClient(client);
        await setCreateProjectFieldsWithClient(client, fields);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async clickCreateProjectConfirm(options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await clickCreateProjectConfirmWithClient(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async createProject(
      input: {
        name: string;
        instructions?: string;
        modelLabel?: string;
        files?: string[];
        memoryMode?: ProjectMemoryMode;
      },
      options?: BrowserProviderListOptions,
    ): Promise<Project | null> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await navigateToChatgptUrl(client, options?.configuredUrl ?? CHATGPT_HOME_URL);
        const initialProjects = await scrapeChatgptProjects(client);
        const initialProjectIds = new Set(initialProjects.map((project) => project.id));
        const initialCurrentProject = await readCurrentProject(client);
        await openCreateProjectModalWithClient(client);
        await setCreateProjectFieldsWithClient(client, input);
        await clickCreateProjectConfirmWithClient(client);
        const routeChanged = await waitForPredicate(
          client.Runtime,
          buildProjectRouteChangeExpression(initialCurrentProject?.id ?? null),
          {
            timeoutMs: 12_000,
            description: `ChatGPT project route changed for ${input.name}`,
          },
        );
        const deadline = Date.now() + 12_000;
        let created: Project | null = null;
        if (routeChanged.ok) {
          const routeValue = routeChanged.value as { id?: string; href?: string } | undefined;
          const createdId = normalizeChatgptProjectId(routeValue?.id);
          if (createdId) {
            await waitForPredicate(
              client.Runtime,
              buildProjectSurfaceReadyExpression(createdId),
              {
                timeoutMs: 15_000,
                description: `ChatGPT project surface ready for ${input.name}`,
              },
            );
            try {
              await waitForProjectNameApplied(client, createdId, input.name);
            } catch {
              // Title/sidebar hydration can lag after route change; route change itself is authoritative.
            }
            const current = await readCurrentProject(client);
            created = {
              id: createdId,
              name:
                current && normalizeProjectName(current.name) === normalizeProjectName(input.name)
                  ? current.name
                  : input.name,
              provider: 'chatgpt',
              url: current?.url ?? routeValue?.href ?? `https://chatgpt.com/g/${createdId}/project`,
              memoryMode: input.memoryMode,
            };
          }
        }
        while (Date.now() < deadline) {
          if (created) break;
          const current = await readCurrentProject(client);
          if (
            current &&
            current.id !== initialCurrentProject?.id &&
            normalizeProjectName(current.name) === normalizeProjectName(input.name)
          ) {
            created = {
              ...current,
              memoryMode: input.memoryMode,
            };
            break;
          }
          const projects = await scrapeChatgptProjects(client);
          const match = findChatgptProjectByName(projects, input.name);
          if (match && !initialProjectIds.has(match.id)) {
            created = {
              ...match,
              memoryMode: input.memoryMode,
            };
            break;
          }
          await sleep(400);
        }
        if (!created) {
          throw new Error(`ChatGPT project creation could not be verified for "${input.name}"`);
        }
        if (input.instructions?.trim()) {
          await applyProjectSettings(client, created.id, { instructions: input.instructions });
        }
        if (Array.isArray(input.files) && input.files.length > 0) {
          await uploadChatgptProjectSourceFilesWithClient(client, created.id, input.files);
        }
        return created;
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async uploadProjectFiles(
      projectId: string,
      filePaths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      if (filePaths.length === 0) return;
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await uploadChatgptProjectSourceFilesWithClient(client, projectId, filePaths);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listProjectFiles(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await openProjectSourcesTab(client, projectId);
        const initial = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
        if (initial.length > 0) {
          return initial;
        }
        await reloadProjectSourcesTab(client, projectId);
        return await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async deleteProjectFile(
      projectId: string,
      fileName: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await openProjectSourcesTab(client, projectId);
        await readChatgptProjectSourceFilesSettled(client);
        const selector = await tagChatgptProjectSourceAction(client, fileName);
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            const removed = await openAndSelectMenuItem(client.Runtime, {
              trigger: {
                selector,
                interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
                requireVisible: true,
                timeoutMs: 3_000,
              },
              itemMatch: { exact: ['remove'] },
              menuSelector: '[role="menu"]',
              timeoutMs: 4_000,
              closeMenuAfter: true,
            });
            if (!removed) {
              throw new Error(`ChatGPT source actions menu did not remove "${fileName}"`);
            }
          },
          {
            label: 'chatgpt-remove-project-source',
            candidateSelectors: ['button[aria-label="Source actions"]', '[role="menu"]', '[role="menuitem"]'],
            context: {
              projectId,
              fileName,
            },
          },
        );
        let removal = await waitForPredicate(
          client.Runtime,
          buildProjectSourceRemovedExpression(fileName),
          {
            timeoutMs: 4_000,
            description: `ChatGPT project source removed: ${fileName}`,
          },
        );
        if (!removal.ok) {
          await confirmChatgptProjectSourceRemovalIfPresent(client, fileName);
          removal = await waitForPredicate(
            client.Runtime,
            buildProjectSourceRemovedExpression(fileName),
            {
              timeoutMs: 8_000,
              description: `ChatGPT project source removed after confirmation: ${fileName}`,
            },
          );
        }
        if (!removal.ok) {
          throw new Error(`ChatGPT project source "${fileName}" did not disappear after removal`);
        }
        await waitForProjectSourceRemovedPersisted(client, projectId, fileName);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async renameProject(projectId: string, newTitle: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await applyProjectSettings(client, projectId, { name: newTitle });
        await waitForProjectNameApplied(client, projectId, newTitle);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async selectRemoveProjectItem(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await openProjectSettingsPanel(client, projectId);
        const pressed = await pressButton(client.Runtime, {
          match: { exact: ['delete project'] },
          rootSelectors: DEFAULT_DIALOG_SELECTORS,
          requireVisible: true,
          timeoutMs: 5000,
        });
        if (!pressed.ok) {
          throw new Error(pressed.reason || 'ChatGPT delete project button not found');
        }
        const confirmation = await waitForPredicate(
          client.Runtime,
          buildProjectDeleteConfirmationExpression(),
          {
            timeoutMs: 5_000,
            description: 'ChatGPT project delete confirmation ready',
          },
        );
        if (!confirmation.ok) {
          throw new Error('ChatGPT delete confirmation did not open');
        }
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async pushProjectRemoveConfirmation(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
            for (const dialog of dialogs) {
              const text = normalize(dialog.textContent || '');
              if (!text.includes('delete project?')) continue;
              const button = Array.from(dialog.querySelectorAll('button'))
                .find((node) => normalize(node.getAttribute('aria-label') || node.textContent || '') === 'delete');
              if (!button) {
                return { ok: false, reason: 'delete-button-missing' };
              }
              button.click();
              return { ok: true };
            }
            return { ok: false, reason: 'confirmation-dialog-missing' };
          })()`,
          returnByValue: true,
        });
        const pressed = result?.value as { ok?: boolean; reason?: string } | undefined;
        if (!pressed?.ok) {
          throw new Error(pressed?.reason || 'ChatGPT delete confirmation button not found');
        }
        const leftProject = await waitForPredicate(
          client.Runtime,
          `(() => {
            const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
            return !match || match[1] !== ${JSON.stringify(projectId)} ? { href: location.href } : null;
          })()`,
          {
            timeoutMs: 10_000,
            description: `ChatGPT project ${projectId} deleted`,
          },
        );
        if (!leftProject.ok) {
          throw new Error('ChatGPT project delete did not leave the deleted project page');
        }
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}
