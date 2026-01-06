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
      try {
        const openConversations = await listOpenConversations(host, port, projectId);
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
              if (currentChat) {
                add(currentChat, document.title || currentChat, current);
              }
            } catch {
              // ignore URL parse
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
                  chatFromUrl = new URL(resolved).searchParams.get('chat') || '';
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
    let chatId = '';
    try {
      const parsed = new URL(url);
      chatId = parsed.searchParams.get('chat') ?? '';
    } catch {
      chatId = '';
    }
    if (!chatId) continue;
    if (projectId && !url.includes(`/project/${projectId}`)) {
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
