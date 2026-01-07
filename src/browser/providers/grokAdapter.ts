import CDP from 'chrome-remote-interface';
import type { Project, Conversation } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions } from './types.js';
import type { ChromeClient } from '../types.js';

export function createGrokAdapter(): Pick<
  BrowserProvider,
  'listProjects' | 'listConversations' | 'capabilities'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const { client, targetId, shouldClose, host, port } = await connectToGrokTab(options);
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const projects = new Map();
            const add = (id, name, url) => {
              if (!id) return;
              if (!projects.has(id)) {
                projects.set(id, { id, name: name || id, url: url || null });
              }
            };
            const current = location.href;
            const currentMatch = current.match(/\\/project\\/([^/?#]+)/);
            if (currentMatch?.[1]) {
              add(currentMatch[1], document.title || currentMatch[1], current);
            }
            const links = Array.from(document.querySelectorAll('a[href*="/project/"]'));
            for (const link of links) {
              const href = link.getAttribute('href') || '';
              const match = href.match(/\\/project\\/([^/?#]+)/);
              if (!match?.[1]) continue;
              const text = (link.textContent || '').trim();
              const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
              add(match[1], text, url);
            }
            return Array.from(projects.values());
          })()`,
          returnByValue: true,
        });
        const raw = (result?.value ?? []) as Array<{ id: string; name: string; url?: string | null }>;
        return raw.map((entry) => ({
          id: entry.id,
          name: entry.name,
          provider: 'grok',
          url: entry.url ?? undefined,
        }));
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async listConversations(projectId?: string, options?: BrowserProviderListOptions): Promise<Conversation[]> {
      const resolvedProjectId = projectId?.trim() || undefined;
      const projectUrl = resolvedProjectId ? `https://grok.com/project/${resolvedProjectId}` : undefined;
      const connection = projectUrl
        ? await connectToGrokProjectTab(options, resolvedProjectId ?? null, projectUrl)
        : await connectToGrokTab(options, projectUrl);
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      if (projectUrl) {
        if (!usedExisting) {
          await navigateToProject(client, projectUrl);
        }
        await ensureProjectPage(client, resolvedProjectId);
        await closeHistoryDialog(client);
        await openConversationList(client);
        await closeHistoryDialog(client);
      }
      try {
        const includeHistory = Boolean(options?.includeHistory);
        const openConversations = resolvedProjectId
          ? []
          : await listOpenConversations(host, port, resolvedProjectId);
        let history: Conversation[] = [];
        if (!resolvedProjectId && includeHistory) {
          if (options?.configuredUrl?.includes('/project/')) {
            const historyConnection = await connectToGrokTab(
              { ...options, configuredUrl: 'https://grok.com/' },
              'https://grok.com/',
            );
            try {
              history = await listHistoryConversations(
                historyConnection.client,
                resolvedProjectId,
                { ...options, configuredUrl: 'https://grok.com/' },
              );
            } finally {
              await historyConnection.client.close();
              if (historyConnection.shouldClose && historyConnection.targetId) {
                await CDP.Close({
                  host: historyConnection.host,
                  port: historyConnection.port,
                  id: historyConnection.targetId,
                }).catch(() => undefined);
              }
            }
          } else {
            history = await listHistoryConversations(client, resolvedProjectId, options);
          }
        }
        const clicked = resolvedProjectId
          ? []
          : await listConversationsByClick(client, resolvedProjectId);
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const projectId = ${JSON.stringify(resolvedProjectId ?? null)};
            if (projectId && !location.pathname.includes('/project/' + projectId)) {
              return [];
            }
            const conversations = new Map();
            const add = (id, title, url) => {
              if (!id) return;
              if (!conversations.has(id)) {
                conversations.set(id, { id, title: title || id, url: url || null });
              }
            };
            const root = document.querySelector('main') || document.body;
            const panels = Array.from(root.querySelectorAll('[id*="content-conversations"]'));
            const panel =
              panels.find((node) => {
                const state = node.getAttribute('data-state') || '';
                const hidden = node.getAttribute('aria-hidden');
                if (state === 'active') return true;
                if (hidden === 'false') return true;
                return (node as HTMLElement).offsetParent !== null;
              }) ?? panels[0];
            if (panel) {
              const anchors = Array.from(panel.querySelectorAll('a[href*="/c/"]'));
              for (const anchor of anchors) {
                const href = anchor.getAttribute('href') || '';
                if (!href.includes('/c/')) continue;
                const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
                const match = url.match(/\\/c\\/([^/?#]+)/);
                const chatId = match?.[1] || '';
                if (!chatId) continue;
                const row =
                  anchor.closest('div.max-h-11') ||
                  anchor.closest('div[class*="rounded"]') ||
                  anchor.closest('div[class*="grid"]') ||
                  anchor.parentElement;
                const titleNode = row?.querySelector?.('[class*="line-clamp"],[class*="truncate"]') || row;
                const title = (titleNode?.textContent || '').trim();
                if (!title) continue;
                add(chatId, title, url);
              }
            }
            return Array.from(conversations.values());
          })()`,
          returnByValue: true,
        });
        const raw = (result?.value ?? []) as Array<{ id: string; title: string; url?: string | null }>;
        const merged = new Map<string, Conversation>();
        for (const entry of raw) {
          merged.set(entry.id, {
            id: entry.id,
            title: entry.title,
            provider: 'grok',
            projectId: resolvedProjectId ?? undefined,
            url: entry.url ?? undefined,
          });
        }
        for (const entry of history) {
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        }
        for (const entry of clicked) {
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        }
        for (const entry of openConversations) {
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        }
        return Array.from(merged.values());
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
  };
}

async function connectToGrokTab(
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
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? resolvePortFromEnv();
  if (!port) {
    throw new Error('Missing DevTools port. Set ORACLE_BROWSER_PORT or browser.debugPort.');
  }
  const targets = await CDP.List({ host, port });
  const candidates = targets.filter((target) => target.type === 'page' && target.url?.includes('grok.com'));
  const preferredUrl = urlOverride ?? options?.configuredUrl;
  const preferred = preferredUrl
    ? candidates.find((target) => target.url?.includes(preferredUrl ?? ''))
    : undefined;
  let targetId = preferred?.id;
  let shouldClose = false;
  let usedExisting = Boolean(targetId);
  if (!targetId && preferredUrl) {
    const created = await CDP.New({ host, port, url: preferredUrl });
    targetId = created.id;
    shouldClose = true;
    usedExisting = false;
  } else if (!targetId) {
    targetId = candidates[0]?.id;
    usedExisting = Boolean(targetId);
  }
  if (!targetId) {
    const fallbackUrl = preferredUrl ?? 'https://grok.com/';
    const created = await CDP.New({ host, port, url: fallbackUrl });
    targetId = created.id;
    shouldClose = true;
    usedExisting = false;
  }
  if (!targetId) {
    throw new Error('No grok.com tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId, shouldClose, host, port, usedExisting };
}

async function connectToGrokProjectTab(
  options: BrowserProviderListOptions | undefined,
  projectId: string | null,
  projectUrl: string,
): Promise<{
  client: ChromeClient;
  targetId?: string;
  shouldClose: boolean;
  host: string;
  port: number;
  usedExisting: boolean;
}> {
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? resolvePortFromEnv();
  if (!port) {
    throw new Error('Missing DevTools port. Set ORACLE_BROWSER_PORT or browser.debugPort.');
  }
  const targets = await CDP.List({ host, port });
  const match = projectId
    ? targets.find(
        (target) => target.type === 'page' && target.url?.includes(`/project/${projectId}`),
      )
    : undefined;
  let targetId = match?.id;
  let shouldClose = false;
  let usedExisting = Boolean(targetId);
  if (!targetId) {
    const created = await CDP.New({ host, port, url: projectUrl });
    targetId = created.id;
    shouldClose = true;
    usedExisting = false;
  }
  const client = await CDP({ host, port, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId, shouldClose, host, port, usedExisting };
}

function resolvePortFromEnv(): number | null {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function navigateToProject(client: ChromeClient, url: string): Promise<void> {
  await client.Page.navigate({ url });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result?.value === 'complete' || result?.value === 'interactive') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function ensureProjectPage(client: ChromeClient, projectId?: string): Promise<void> {
  if (!projectId) return;
  const expected = `/project/${projectId}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    if (typeof result?.value === 'string' && result.value.includes(expected)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await client.Runtime.evaluate({
    expression: `(() => {
      const link = document.querySelector('a[href*="/project/${projectId}"]');
      if (link) {
        link.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  const clickDeadline = Date.now() + 10_000;
  while (Date.now() < clickDeadline) {
    const { result } = await client.Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    if (typeof result?.value === 'string' && result.value.includes(expected)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const fallbackUrl = `https://grok.com/project/${projectId}?tab=conversations`;
  await client.Page.navigate({ url: fallbackUrl });
  const secondaryDeadline = Date.now() + 10_000;
  while (Date.now() < secondaryDeadline) {
    const { result } = await client.Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    if (typeof result?.value === 'string' && result.value.includes(expected)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function openConversationList(client: ChromeClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const tablist = document.querySelector('[role="tablist"]');
      if (tablist) {
        const tabs = Array.from(tablist.querySelectorAll('a,button,[role="tab"],[role="button"],[role="link"]'));
        for (const node of tabs) {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
          if (!label) continue;
          if (label.includes('conversations')) {
            node.click();
            return true;
          }
        }
      }
      return false;
    })()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 750));
}

async function listHistoryConversations(
  client: ChromeClient,
  projectId: string | undefined,
  options?: BrowserProviderListOptions,
): Promise<Conversation[]> {
  let opened = await openHistoryDialog(client);
  if (!opened) {
    const fallbackUrl = options?.configuredUrl?.includes('/project/') ? 'https://grok.com/' : undefined;
    if (fallbackUrl) {
      await navigateToProject(client, fallbackUrl);
    }
    opened = await openHistoryDialog(client);
  }
  if (!opened) return [];
  try {
    await expandHistoryDialog(client);
    const maxItems = Math.max(1, options?.historyLimit ?? 200);
    const cutoffMs = options?.historySince ? Date.parse(options.historySince) : NaN;
    const entries = new Map<string, { id: string; title: string; url?: string; timestamp?: number | null }>();
    let idleCount = 0;
    let lastCount = 0;
    let lastScrollTop = -1;
    while (entries.size < maxItems && idleCount < 4) {
      const { result } = await client.Runtime.evaluate({
        expression: `(() => {
          const projectId = ${JSON.stringify(projectId ?? null)};
          const dialog =
            document.querySelector('[role="dialog"]') ||
            document.querySelector('dialog') ||
            document.querySelector('[aria-modal="true"]');
          if (!dialog) return { items: [], canScroll: false, atBottom: true, scrollTop: 0, scrollHeight: 0, oldest: null };
          const now = Date.now();
          const parseRelative = (value) => {
            const text = String(value || '').toLowerCase().trim();
            if (!text) return null;
            if (text === 'yesterday') return now - 24 * 60 * 60 * 1000;
            const match = text.match(/(\\d+)\\s+(minute|hour|day|week|month|year)s?\\s+ago/);
            if (match) {
              const amount = Number.parseInt(match[1], 10);
              if (!Number.isFinite(amount)) return null;
              const unit = match[2];
              const ms =
                unit === 'minute'
                  ? amount * 60 * 1000
                  : unit === 'hour'
                    ? amount * 60 * 60 * 1000
                    : unit === 'day'
                      ? amount * 24 * 60 * 60 * 1000
                      : unit === 'week'
                        ? amount * 7 * 24 * 60 * 60 * 1000
                        : unit === 'month'
                          ? amount * 30 * 24 * 60 * 60 * 1000
                          : amount * 365 * 24 * 60 * 60 * 1000;
              return now - ms;
            }
            const parsed = Date.parse(text);
            return Number.isFinite(parsed) ? parsed : null;
          };
          const readTimestamp = (node) => {
            const timeEl = node.querySelector?.('time');
            const candidates = [
              timeEl?.getAttribute?.('datetime'),
              timeEl?.getAttribute?.('title'),
              timeEl?.getAttribute?.('aria-label'),
              timeEl?.textContent,
              node.getAttribute?.('title'),
              node.getAttribute?.('aria-label'),
            ];
            for (const candidate of candidates) {
              const parsed = parseRelative(candidate);
              if (parsed) return parsed;
              const absolute = Date.parse(String(candidate || ''));
              if (Number.isFinite(absolute)) return absolute;
            }
            return null;
          };
          const items = Array.from(
            dialog.querySelectorAll('a,button,[role="link"],[role="button"],[data-href],[data-url]')
          );
          const conversations = [];
          let oldest = null;
          for (const node of items) {
            const href =
              node.getAttribute('href') ||
              node.getAttribute('data-href') ||
              node.getAttribute('data-url') ||
              node.dataset?.href ||
              node.dataset?.url ||
              '';
            if (!href) continue;
            let url = '';
            let chatId = '';
            try {
              url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
              const parsed = new URL(url);
              chatId = parsed.searchParams.get('chat') || '';
              if (!chatId) {
                const match = parsed.pathname.match(/\\/c\\/([^/?#]+)/);
                chatId = match?.[1] || '';
              }
            } catch {
              // ignore URL parse
            }
            if (!chatId) continue;
            if (projectId && url.includes('/project/') && !url.includes('/project/' + projectId)) {
              continue;
            }
            const row = node.closest('div,li') || node;
            const timestamp = readTimestamp(row);
            if (typeof timestamp === 'number') {
              oldest = oldest === null ? timestamp : Math.min(oldest, timestamp);
            }
            const text = (row.textContent || node.textContent || '').trim();
            conversations.push({ id: chatId, title: text || chatId, url, timestamp });
          }
          const scrollables = Array.from(dialog.querySelectorAll('*')).filter((el) => {
            const element = el;
            return element.scrollHeight > element.clientHeight + 24;
          });
          const scrollable =
            scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || dialog;
          const canScroll = scrollable.scrollHeight > scrollable.clientHeight + 24;
          const scrollTop = scrollable.scrollTop;
          const atBottom = scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 5;
          if (canScroll && !atBottom) {
            scrollable.scrollTop = scrollable.scrollHeight;
          }
          return {
            items: conversations,
            canScroll,
            atBottom,
            scrollTop,
            scrollHeight: scrollable.scrollHeight,
            oldest,
          };
        })()`,
        returnByValue: true,
      });
      const payload = result?.value as {
        items: Array<{ id: string; title: string; url?: string; timestamp?: number | null }>;
        canScroll: boolean;
        atBottom: boolean;
        scrollTop: number;
        scrollHeight: number;
        oldest: number | null;
      };
      for (const entry of payload.items ?? []) {
        if (!entries.has(entry.id)) {
          entries.set(entry.id, entry);
        }
      }
      const oldestTimestamp = payload.oldest;
      if (Number.isFinite(cutoffMs) && typeof oldestTimestamp === 'number' && oldestTimestamp <= cutoffMs) {
        break;
      }
      if (!payload.canScroll || payload.atBottom) {
        break;
      }
      if (entries.size === lastCount && payload.scrollTop === lastScrollTop) {
        idleCount += 1;
      } else {
        idleCount = 0;
      }
      lastCount = entries.size;
      lastScrollTop = payload.scrollTop;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return Array.from(entries.values())
      .slice(0, maxItems)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        provider: 'grok',
        projectId,
        url: entry.url,
      }));
  } finally {
    await closeHistoryDialog(client);
  }
}

async function expandHistoryDialog(client: ChromeClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('dialog') ||
        document.querySelector('[aria-modal="true"]');
      if (!dialog) return false;
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const nodes = Array.from(dialog.querySelectorAll('button,a,[role="button"],[role="link"]'));
      for (const node of nodes) {
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        if (label.includes('show all')) {
          node.click();
          return true;
        }
      }
      return false;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function openHistoryDialog(client: ChromeClient): Promise<boolean> {
  const clicked = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const nodes = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"]'));
      for (const node of nodes) {
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        if (label === 'history' || label.endsWith(' history') || label.includes('history')) {
          node.click();
          return true;
        }
      }
      return false;
    })()`,
    returnByValue: true,
  });
  if (!clicked.result?.value) {
    return false;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => Boolean(document.querySelector('[role="dialog"],dialog,[aria-modal="true"]')) )()`,
      returnByValue: true,
    });
    if (result?.value) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function closeHistoryDialog(client: ChromeClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('dialog') ||
        document.querySelector('[aria-modal="true"]');
      if (!dialog) return false;
      const backdrop =
        dialog.parentElement?.querySelector?.('[data-state="open"]') ||
        document.querySelector('[data-state="open"][data-radix-portal]') ||
        document.querySelector('[data-radix-portal] [data-state="open"]');
      if (backdrop) {
        backdrop.click();
        return true;
      }
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(event);
      return true;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function listConversationsByClick(
  client: ChromeClient,
  projectId?: string,
): Promise<Conversation[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const panel = document.querySelector('[role="tabpanel"]');
      if (!panel) return [];
      const items = Array.from(panel.querySelectorAll('a[href*="/c/"]'));
      let index = 0;
      const entries = [];
      for (const node of items) {
        const row =
          node.closest('div.max-h-11') ||
          node.closest('div[class*="rounded"]') ||
          node.closest('div[class*="grid"]') ||
          node.parentElement;
        const titleNode = row?.querySelector?.('[class*="line-clamp"],[class*="truncate"]') || row || node;
        const title = (titleNode.textContent || '').trim();
        node.setAttribute('data-oracle-conv-index', String(index));
        entries.push({ index, title });
        index += 1;
      }
      return entries;
    })()`,
    returnByValue: true,
  });
  const entries = (result?.value ?? []) as Array<{ index: number; title: string }>;
  const output: Conversation[] = [];
  for (const entry of entries.slice(0, 30)) {
    const clicked = await client.Runtime.evaluate({
      expression: `(() => {
        const node = document.querySelector('[data-oracle-conv-index="${entry.index}"]');
        if (!node) return false;
        node.click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result?.value) continue;
    const chatId = await waitForChatId(client, 4000);
    if (!chatId) continue;
    output.push({
      id: chatId,
      title: entry.title || chatId,
      provider: 'grok',
      projectId,
      url: `https://grok.com/c/${chatId}`,
    });
  }
  return output;
}

async function waitForChatId(client: ChromeClient, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        try {
          const url = new URL(location.href);
          const chat = url.searchParams.get('chat');
          if (chat) return chat;
          const match = url.pathname.match(/\\/c\\/([^/?#]+)/);
          return match?.[1] || null;
        } catch {
          return null;
        }
      })()`,
      returnByValue: true,
    });
    if (typeof result?.value === 'string' && result.value.length > 0) {
      return result.value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function listOpenConversations(
  host: string,
  port: number,
  projectId?: string,
): Promise<Conversation[]> {
  const targets = await CDP.List({ host, port });
  const entries: Conversation[] = [];
  for (const target of targets) {
    const url = target.url ?? '';
    if (!url.includes('grok.com')) continue;
    const chatId = extractChatIdFromUrl(url) ?? '';
    if (!chatId) continue;
    if (projectId && url.includes('/project/') && !url.includes(`/project/${projectId}`)) {
      continue;
    }
    entries.push({
      id: chatId,
      title: target.title ?? chatId,
      provider: 'grok',
      projectId,
      url,
    });
  }
  return entries;
}

function extractChatIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, 'https://grok.com');
    const chat = parsed.searchParams.get('chat');
    if (chat) return chat;
    const match = parsed.pathname.match(/\/c\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = rawUrl.match(/\/c\/([^/?#]+)/);
    return match?.[1] ?? null;
  }
}
