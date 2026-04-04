import CDP from 'chrome-remote-interface';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import type { ChromeClient } from '../types.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { Conversation, Project } from './domain.js';
import { requireBundledServiceBaseUrl, requireBundledServiceCompatibleHosts, requireBundledServiceRouteTemplate } from '../../services/registry.js';

const GEMINI_BASE_URL = requireBundledServiceBaseUrl('gemini');
const GEMINI_APP_URL = requireBundledServiceRouteTemplate('gemini', 'app');
const GEMINI_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('gemini');
const GEMINI_GEMS_VIEW_URL = new URL('gems/view', GEMINI_BASE_URL).toString();

function resolvePortFromEnv(): number | undefined {
  const raw = process.env.AURACALL_BROWSER_PORT;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeWhitespace(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeGeminiProjectId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const extracted = extractGeminiProjectIdFromUrl(trimmed);
  return extracted ?? (trimmed.replace(/^gem\//i, '').replace(/^\/+|\/+$/g, '') || null);
}

export function normalizeGeminiConversationId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/app\/([^/?#]+)/i);
  return match?.[1] ?? (trimmed.replace(/^app\//i, '').replace(/^\/+|\/+$/g, '') || null);
}

export function extractGeminiProjectIdFromUrl(url: string): string | null {
  const match = String(url).match(/\/gem\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export function resolveGeminiProjectUrl(projectId: string): string {
  return new URL(`gem/${projectId}`, GEMINI_BASE_URL).toString();
}

export function resolveGeminiConversationUrl(conversationId: string): string {
  return new URL(`app/${conversationId}`, GEMINI_BASE_URL).toString();
}

function isGeminiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return GEMINI_COMPATIBLE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveGeminiTargetId(target: { id?: string; targetId?: string } | null | undefined): string | undefined {
  if (!target) return undefined;
  if (typeof target.id === 'string' && target.id.trim()) return target.id;
  if (typeof target.targetId === 'string' && target.targetId.trim()) return target.targetId;
  return undefined;
}

async function connectToGeminiTab(
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
      return { client, targetId: options.tabTargetId, shouldClose: false, host, port, usedExisting: true };
    } catch {
      // Resolve again below if the cached target id is stale.
    }
  }

  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'gemini';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string; id?: string } | null }>;
      })
    | undefined;

  const preferredUrl = urlOverride ?? options?.configuredUrl ?? GEMINI_APP_URL;
  let resolvedTargetIdFromService: string | undefined;
  if (serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'gemini',
      configuredUrl: preferredUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    resolvedTargetIdFromService = resolveGeminiTargetId(target.tab);
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
    throw new Error('Missing DevTools port. Launch a Gemini browser session or set AURACALL_BROWSER_PORT.');
  }

  const targets = await CDP.List({ host, port });
  const candidates = targets.filter((target) => target.type === 'page' && isGeminiUrl(target.url ?? ''));
  const serviceResolved = resolvedTargetIdFromService
    ? candidates.find((target) => resolveGeminiTargetId(target) === resolvedTargetIdFromService)
    : undefined;
  let targetInfo = serviceResolved ?? candidates[0];
  let shouldClose = false;
  let usedExisting = Boolean(resolveGeminiTargetId(targetInfo));
  if (!targetInfo) {
    const opened = await openOrReuseChromeTarget(port, preferredUrl, {
      host,
      reusePolicy: 'same-origin',
      compatibleHosts: GEMINI_COMPATIBLE_HOSTS,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  }
  const targetId = resolveGeminiTargetId(targetInfo);
  if (!targetId) {
    throw new Error('No Gemini tab found. Launch a Gemini browser session and retry.');
  }
  const client = await connectToChromeTarget({ host, port, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId, shouldClose, host, port, usedExisting };
}

type GeminiProjectProbe = {
  id: string;
  name: string;
  url?: string | null;
};

type GeminiConversationProbe = {
  id: string;
  title: string;
  url?: string | null;
  updatedAt?: string | null;
};

function extractGeminiIdentityFromLabel(label: string | null | undefined): ProviderUserIdentity | null {
  const normalized = normalizeWhitespace(label ?? '');
  if (!normalized) return null;
  const match = normalized.match(/^Google Account:\s*(.+?)\s*\(([^)]+@[^)]+)\)$/i);
  if (!match) return null;
  return {
    name: normalizeWhitespace(match[1]),
    email: normalizeWhitespace(match[2]).toLowerCase(),
    source: 'google-account-label',
  };
}

async function scrapeGeminiProjects(client: ChromeClient): Promise<Project[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const rows = Array.from(document.querySelectorAll('a[href*="/gem/"]'));
      const items = [];
      const seen = new Set();
      const titleCaseSlug = (value) => normalize(value)
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      for (const anchor of rows) {
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        const href = anchor.href || '';
        if (!href || href.includes('/gems/view')) continue;
        const match = href.match(/\\/gem\\/([^/?#]+)/i);
        if (!match?.[1]) continue;
        const row = anchor.closest('li,div,section,article') || anchor;
        const id = match[1];
        if (seen.has(id)) continue;
        const optionLabel = Array.from(row.querySelectorAll('button[aria-label],a[aria-label]'))
          .map((node) => normalize(node.getAttribute('aria-label') || ''))
          .find((label) => /more options for .* gem/i.test(label));
        const optionMatch = optionLabel?.match(/more options for "?(.+?)"? gem/i);
        const startLabel = normalize(anchor.getAttribute('aria-label') || '');
        const startMatch = startLabel.match(/start a new conversation with gem:\\s*(.+)$/i);
        const buttonText = Array.from(row.querySelectorAll('button'))
          .map((node) => normalize(node.textContent || ''))
          .find((label) => label.length > 0 && label.length <= 80 && !/^(share|edit gem|new gem|show more)$/i.test(label));
        const textName = normalize(anchor.textContent || '');
        const slugName = /^[a-z0-9-]+$/i.test(id) && /[a-z]/i.test(id) ? titleCaseSlug(id) : '';
        const preferOptionMatch = !slugName;
        let name = (preferOptionMatch ? optionMatch?.[1] : '') || startMatch?.[1] || buttonText || slugName || textName;
        name = name.replace(/^start a new conversation with gem:\\s*/i, '').replace(/^[A-Z]\\s+(?=[A-Z])/,'').trim();
        if (!name || !isVisible(anchor)) continue;
        seen.add(id);
        items.push({ id, name, url: href });
      }
      return items;
    })()`,
    returnByValue: true,
  });
  const payload = Array.isArray(result?.value) ? (result.value as GeminiProjectProbe[]) : [];
  return payload
    .filter((item) => item?.id && item?.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      provider: 'gemini' as const,
      url: item.url ?? undefined,
    }));
}

async function readGeminiUserIdentity(client: ChromeClient): Promise<ProviderUserIdentity | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const labels = Array.from(document.querySelectorAll('a[aria-label],button[aria-label]'))
        .map((node) => String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      return labels.find((label) => /^Google Account:/i.test(label)) ?? null;
    })()`,
    returnByValue: true,
  });
  return extractGeminiIdentityFromLabel(typeof result?.value === 'string' ? result.value : null);
}

async function scrapeGeminiConversations(
  client: ChromeClient,
  projectId?: string,
): Promise<Conversation[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const root = document.querySelector('[data-test-id="all-conversations"]') || document.body;
      const rows = Array.from(root.querySelectorAll('[data-test-id="conversation"], a[href*="/app/"]'));
      const items = [];
      const seen = new Set();
      for (const row of rows) {
        const anchor = row.matches?.('a[href*="/app/"]')
          ? row
          : row.querySelector?.('a[href*="/app/"]');
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        if (!isVisible(anchor)) continue;
        const href = anchor.href || '';
        const match = href.match(/\\/app\\/([^/?#]+)/i);
        if (!match?.[1]) continue;
        const id = match[1];
        if (seen.has(id)) continue;
        const title = normalize(row.textContent || anchor.textContent || '') || id;
        seen.add(id);
        items.push({
          id,
          title,
          url: href,
          updatedAt: null,
        });
      }
      return items;
    })()`,
    returnByValue: true,
  });
  const payload = Array.isArray(result?.value) ? (result.value as GeminiConversationProbe[]) : [];
  return payload
    .filter((item) => item?.id && item?.title)
    .map((item) => ({
      id: item.id,
      title: item.title,
      provider: 'gemini' as const,
      projectId,
      url: item.url ?? undefined,
      updatedAt: item.updatedAt ?? undefined,
    }));
}

export function createGeminiAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'getUserIdentity'
  | 'listProjects'
  | 'listConversations'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
    },
    async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, options?.configuredUrl ?? GEMINI_APP_URL);
      try {
        return await readGeminiUserIdentity(client);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, GEMINI_GEMS_VIEW_URL);
      try {
        return await scrapeGeminiProjects(client);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async listConversations(projectId?: string, options?: BrowserProviderListOptions): Promise<Conversation[]> {
      const normalizedProjectId = normalizeGeminiProjectId(projectId);
      const targetUrl = normalizedProjectId
        ? resolveGeminiProjectUrl(normalizedProjectId)
        : (options?.configuredUrl ?? GEMINI_APP_URL);
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, targetUrl);
      try {
        return await scrapeGeminiConversations(client, normalizedProjectId ?? undefined);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
  };
}
