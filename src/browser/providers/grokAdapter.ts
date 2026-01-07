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
      const projectUrl = projectId ? `https://grok.com/project/${projectId}` : undefined;
      const { client, targetId, shouldClose, host, port } = await connectToGrokTab(options, projectUrl);
      if (projectUrl) {
        await navigateToProject(client, projectUrl);
        await openConversationList(client);
      }
      try {
        const openConversations = await listOpenConversations(host, port, projectId);
        const history = await listHistoryConversations(client, projectId);
        const clicked = await listConversationsByClick(client, projectId);
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const projectId = ${JSON.stringify(projectId ?? null)};
            const conversations = new Map();
            const add = (id, title, url) => {
              if (!id) return;
              if (!conversations.has(id)) {
                conversations.set(id, { id, title: title || id, url: url || null });
              }
            };
            const current = location.href;
            try {
              const currentUrl = new URL(current);
              const currentChat = currentUrl.searchParams.get('chat');
              const currentMatch = currentUrl.pathname.match(/\\/c\\/([^/?#]+)/);
              const chatId = currentChat || currentMatch?.[1] || '';
              if (chatId) {
                add(chatId, document.title || chatId, current);
              }
            } catch {
              // ignore URL parse
            }
            const panel =
              document.querySelector('[role="tabpanel"]') ||
              document.querySelector('[id*="content-conversations"]') ||
              document.querySelector('main');
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
                add(chatId, title, url);
              }
            }
            const candidates = Array.from(
              document.querySelectorAll(
                'a,button,[role="link"],[role="button"],[data-href],[data-url],[data-chat-id],[data-conversation-id]'
              )
            );
            for (const node of candidates) {
              const href =
                node.getAttribute('href') ||
                node.getAttribute('data-href') ||
                node.getAttribute('data-url') ||
                node.dataset?.href ||
                node.dataset?.url ||
                '';
              const chatId =
                node.getAttribute('data-chat-id') ||
                node.getAttribute('data-conversation-id') ||
                node.dataset?.chatId ||
                node.dataset?.conversationId ||
                null;
              let url = '';
              let chatFromUrl = '';
              if (href) {
                try {
                  const resolved = href.startsWith('http') ? href : new URL(href, location.origin).toString();
                  url = resolved;
                  const parsed = new URL(resolved);
                  chatFromUrl = parsed.searchParams.get('chat') || '';
                  if (!chatFromUrl) {
                    const match = parsed.pathname.match(/\\/c\\/([^/?#]+)/);
                    chatFromUrl = match?.[1] || '';
                  }
                } catch {
                  // ignore URL parse
                }
              }
              const finalChatId = chatId || chatFromUrl;
              if (!finalChatId) continue;
              if (projectId && url && !url.includes('/project/' + projectId)) {
                continue;
              }
              const text = (node.textContent || '').trim();
              add(finalChatId, text, url || null);
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
            projectId: projectId ?? undefined,
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
): Promise<{ client: ChromeClient; targetId?: string; shouldClose: boolean; host: string; port: number }> {
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
  let targetId = preferred?.id ?? candidates[0]?.id;
  let shouldClose = false;
  if (!targetId) {
    const fallbackUrl = preferredUrl ?? 'https://grok.com/';
    const created = await CDP.New({ host, port, url: fallbackUrl });
    targetId = created.id;
    shouldClose = true;
  }
  if (!targetId) {
    throw new Error('No grok.com tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId, shouldClose, host, port };
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

async function openConversationList(client: ChromeClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"]'));
      const labels = ['history', 'chat', 'conversations', 'messages'];
      for (const node of candidates) {
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        if (!label) continue;
        if (labels.some((word) => label.includes(word))) {
          node.click();
          return true;
        }
      }
      return false;
    })()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 750));
}

async function listHistoryConversations(
  client: ChromeClient,
  projectId?: string,
): Promise<Conversation[]> {
  const opened = await openHistoryDialog(client);
  if (!opened) return [];
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const projectId = ${JSON.stringify(projectId ?? null)};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('dialog') ||
        document.querySelector('[aria-modal="true"]');
      if (!dialog) return [];
      const items = Array.from(
        dialog.querySelectorAll('a,button,[role="link"],[role="button"],[data-href],[data-url]')
      );
      const conversations = [];
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
        const text = (node.textContent || '').trim();
        conversations.push({ id: chatId, title: text || chatId, url });
      }
      return conversations;
    })()`,
    returnByValue: true,
  });
  const raw = (result?.value ?? []) as Array<{ id: string; title: string; url?: string }>;
  return raw.map((entry) => ({
    id: entry.id,
    title: entry.title,
    provider: 'grok',
    projectId,
    url: entry.url,
  }));
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

async function listConversationsByClick(
  client: ChromeClient,
  projectId?: string,
): Promise<Conversation[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const panel = document.querySelector('[role="tabpanel"]');
      if (!panel) return [];
      const items = Array.from(panel.querySelectorAll('[class*="cursor-pointer"]'));
      let index = 0;
      const entries = [];
      for (const node of items) {
        const titleNode = node.querySelector('[class*="truncate"]') || node;
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
