import CDP from 'chrome-remote-interface';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import {
  navigateAndSettle,
  pressButton,
  setInputValue,
  waitForPredicate,
} from '../service/ui.js';
import type { ChromeClient } from '../types.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { Conversation, Project, ProjectMemoryMode } from './domain.js';
import { requireBundledServiceBaseUrl, requireBundledServiceCompatibleHosts, requireBundledServiceRouteTemplate } from '../../services/registry.js';

const GEMINI_BASE_URL = requireBundledServiceBaseUrl('gemini');
const GEMINI_APP_URL = requireBundledServiceRouteTemplate('gemini', 'app');
const GEMINI_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('gemini');
const GEMINI_GEMS_VIEW_URL = new URL('gems/view', GEMINI_BASE_URL).toString();
const GEMINI_GEM_CREATE_URL = new URL('gems/create', GEMINI_BASE_URL).toString();
const GEMINI_GEM_NAME_INPUT_SELECTOR = 'input[aria-label="Input for a Gem name"]';
const GEMINI_GEM_DESCRIPTION_INPUT_SELECTOR = 'textarea[data-test-id="description-input-field"]';
const GEMINI_GEM_INSTRUCTIONS_INPUT_SELECTOR = 'div[aria-label="Enter a prompt for Gemini"]';
const GEMINI_GEM_CREATE_BUTTON_SELECTOR = 'button[data-test-id="create-button"]';

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
  const match = String(url).match(/\/gem\/([^/?#]+)|\/gems\/edit\/([^/?#]+)/i);
  return match?.[1] ?? match?.[2] ?? null;
}

export function resolveGeminiProjectUrl(projectId: string): string {
  return new URL(`gem/${projectId}`, GEMINI_BASE_URL).toString();
}

export function resolveGeminiCreateProjectUrl(): string {
  return GEMINI_GEM_CREATE_URL;
}

export function resolveGeminiEditProjectUrl(projectId: string): string {
  return new URL(`gems/edit/${projectId}`, GEMINI_BASE_URL).toString();
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
        const slugName = id.includes('-') && /^[a-z0-9-]+$/i.test(id) && /[a-z]/i.test(id) ? titleCaseSlug(id) : '';
        const preferOptionMatch = !slugName;
        let name =
          (preferOptionMatch ? optionMatch?.[1] : '') ||
          startMatch?.[1] ||
          slugName ||
          optionMatch?.[1] ||
          buttonText ||
          textName;
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

async function navigateToGeminiCreatePage(client: Pick<ChromeClient, 'Page' | 'Runtime'>): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url: GEMINI_GEM_CREATE_URL,
    routeExpression: `location.pathname === "/gems/create"`,
    routeDescription: 'Gemini Gem create route',
    readyExpression: `Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)})) && Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))`,
    readyDescription: 'Gemini Gem create surface',
    timeoutMs: 20_000,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Gemini Gem create page did not become ready: ${settled.reason ?? settled.phase}`);
  }
}

async function navigateToGeminiGemsViewPage(client: Pick<ChromeClient, 'Page' | 'Runtime'>): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url: GEMINI_GEMS_VIEW_URL,
    routeExpression: `location.pathname === "/gems/view"`,
    routeDescription: 'Gemini Gem manager route',
    readyExpression: `Boolean(document.querySelector('button[data-test-id="open-bots-creation-window"]'))`,
    readyDescription: 'Gemini Gem manager surface',
    timeoutMs: 20_000,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Gemini Gem manager page did not become ready: ${settled.reason ?? settled.phase}`);
  }
}

async function navigateToGeminiEditPage(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  projectId: string,
): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url: resolveGeminiEditProjectUrl(projectId),
    routeExpression: `location.pathname === ${JSON.stringify(`/gems/edit/${projectId}`)}`,
    routeDescription: `Gemini Gem edit route for ${projectId}`,
    readyExpression: `Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)})) && Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))`,
    readyDescription: `Gemini Gem edit surface for ${projectId}`,
    timeoutMs: 20_000,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Gemini Gem edit page did not become ready: ${settled.reason ?? settled.phase}`);
  }
}

async function navigateToGeminiConversationSurface(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  url: string,
): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    routeDescription: 'Gemini conversation route',
    readyExpression: `Boolean(document.querySelector('[data-test-id="all-conversations"]')) || /\\/app\\/[^/?#]+$/i.test(location.pathname)`,
    readyDescription: 'Gemini conversation surface',
    timeoutMs: 20_000,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Gemini conversation surface did not become ready: ${settled.reason ?? settled.phase}`);
  }
}

async function createGeminiProjectWithClient(
  client: ChromeClient,
  input: {
    name: string;
    instructions?: string;
    modelLabel?: string;
    files?: string[];
    memoryMode?: ProjectMemoryMode;
  },
): Promise<Project | null> {
  if (Array.isArray(input.files) && input.files.length > 0) {
    throw new Error('Gem knowledge upload during Gemini project creation is not supported yet.');
  }
  if (input.modelLabel && input.modelLabel.trim().length > 0) {
    throw new Error('Gemini Gem creation does not support setting a model label yet.');
  }
  if (input.memoryMode) {
    throw new Error('Gemini Gem creation does not support memory mode selection.');
  }

  await navigateToGeminiCreatePage(client);

  const setName = await setInputValue(client.Runtime, {
    selector: GEMINI_GEM_NAME_INPUT_SELECTOR,
    value: input.name,
    timeoutMs: 10_000,
  });
  if (!setName) {
    throw new Error('Gemini Gem name input did not become ready.');
  }

  if (typeof input.instructions === 'string' && input.instructions.trim().length > 0) {
    const trimmedInstructions = input.instructions.trim();
    const setDescription = await setInputValue(client.Runtime, {
      selector: GEMINI_GEM_DESCRIPTION_INPUT_SELECTOR,
      value: trimmedInstructions,
      timeoutMs: 5_000,
    });
    if (!setDescription) {
      throw new Error('Gemini Gem description input did not become ready.');
    }
    const setInstructions = await setInputValue(client.Runtime, {
      selector: GEMINI_GEM_INSTRUCTIONS_INPUT_SELECTOR,
      value: trimmedInstructions,
      timeoutMs: 5_000,
    });
    if (!setInstructions) {
      throw new Error('Gemini Gem instructions input did not become ready.');
    }
  }

  const beforeHref = String(
    (
      await client.Runtime.evaluate({
        expression: 'location.href',
        returnByValue: true,
      })
    ).result?.value ?? '',
  );
  const pressed = await pressButton(client.Runtime, {
    selector: GEMINI_GEM_CREATE_BUTTON_SELECTOR,
    interactionStrategies: ['click', 'pointer'],
    timeoutMs: 10_000,
  });
  if (!pressed.ok) {
    throw new Error(`Gemini Gem save failed: ${pressed.reason ?? 'Save button not clickable.'}`);
  }

  const routeChanged = await waitForPredicate(
    client.Runtime,
    `(() => {
      const href = location.href;
      if (!href || href === ${JSON.stringify(beforeHref)}) return false;
      return (/\\/gem\\/([^/?#]+)/i.test(href) || /\\/gems\\/edit\\/([^/?#]+)/i.test(href)) && !/\\/gems\\/create(?:[/?#]|$)/i.test(href);
    })()`,
    {
      timeoutMs: 20_000,
      description: `Gemini Gem route changed for ${input.name}`,
    },
  );
  if (!routeChanged.ok) {
    throw new Error(`Gemini Gem creation could not be verified for "${input.name}".`);
  }

  const { result } = await client.Runtime.evaluate({
    expression: `(() => ({ href: location.href, title: document.title || "" }))()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as { href?: string; title?: string };
  const createdId = normalizeGeminiProjectId(payload.href ?? '');
  if (!createdId) {
    throw new Error(`Gemini Gem creation route resolved without a project id for "${input.name}".`);
  }
  return {
    id: createdId,
    name: input.name,
    provider: 'gemini',
    url: payload.href ? String(payload.href) : resolveGeminiProjectUrl(createdId),
  };
}

async function readGeminiPersistedProjectName(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  projectId: string,
  options?: { expectedName?: string; timeoutMs?: number },
): Promise<string> {
  await navigateToGeminiEditPage(client, projectId);
  const expectedName = typeof options?.expectedName === 'string' ? options.expectedName.trim() : '';
  const predicate = expectedName
    ? `(() => {
        const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
        if (!(input instanceof HTMLInputElement)) return null;
        const value = input.value.trim();
        return value === ${JSON.stringify(expectedName)} ? { value } : null;
      })()`
    : `(() => {
        const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
        if (!(input instanceof HTMLInputElement)) return null;
        const value = input.value.trim();
        return value ? { value } : null;
      })()`;
  const ready = await waitForPredicate(client.Runtime, predicate, {
    timeoutMs: options?.timeoutMs ?? 15_000,
    description: expectedName
      ? `Gemini Gem name persisted as ${expectedName}`
      : 'Gemini Gem name hydrated',
  });
  const value = typeof (ready.value as { value?: string } | undefined)?.value === 'string'
    ? ((ready.value as { value?: string }).value ?? '').trim()
    : '';
  if (!value) {
    throw new Error('Gemini Gem name input did not expose a persisted name.');
  }
  return value;
}

export function createGeminiAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'createProject'
  | 'getUserIdentity'
  | 'listProjects'
  | 'listConversations'
  | 'renameProject'
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
        await navigateToGeminiGemsViewPage(client);
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
        await navigateToGeminiConversationSurface(client, targetUrl);
        return await scrapeGeminiConversations(client, normalizedProjectId ?? undefined);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
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
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, GEMINI_GEM_CREATE_URL);
      try {
        return await createGeminiProjectWithClient(client, input);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async renameProject(projectId: string, newTitle: string, options?: BrowserProviderListOptions): Promise<void> {
      const normalizedProjectId = normalizeGeminiProjectId(projectId);
      if (!normalizedProjectId) {
        throw new Error(`Invalid Gemini Gem id: ${projectId}`);
      }
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiEditProjectUrl(normalizedProjectId),
      );
      try {
        await navigateToGeminiEditPage(client, normalizedProjectId);
        const setName = await setInputValue(client.Runtime, {
          selector: GEMINI_GEM_NAME_INPUT_SELECTOR,
          value: newTitle,
          timeoutMs: 10_000,
        });
        if (!setName) {
          throw new Error('Gemini Gem name input did not become ready for rename.');
        }
        await client.Runtime.evaluate({
          expression: `(() => {
            const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
            if (!(input instanceof HTMLInputElement)) return false;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          })()`,
          returnByValue: true,
        });
        const pressed = await pressButton(client.Runtime, {
          selector: GEMINI_GEM_CREATE_BUTTON_SELECTOR,
          interactionStrategies: ['click', 'pointer'],
          timeoutMs: 10_000,
        });
        if (!pressed.ok) {
          throw new Error(`Gemini Gem update failed: ${pressed.reason ?? 'Update button not clickable.'}`);
        }
        const persistedName = await readGeminiPersistedProjectName(client, normalizedProjectId, {
          expectedName: newTitle,
          timeoutMs: 20_000,
        });
        if (persistedName !== newTitle.trim()) {
          throw new Error(`Gemini Gem rename did not persist. Expected "${newTitle}", got "${persistedName}".`);
        }
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
  };
}
