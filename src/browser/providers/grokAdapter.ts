import CDP from 'chrome-remote-interface';
import type { Project, Conversation } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions } from './types.js';
import type { ChromeClient } from '../types.js';

export function createGrokAdapter(): Pick<
  BrowserProvider,
  'listProjects' | 'listConversations' | 'capabilities' | 'renameConversation'
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
        await openConversationList(client);
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
              await navigateToProject(historyConnection.client, 'https://grok.com/');
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
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            try {
              const projectId = ${JSON.stringify(resolvedProjectId ?? null)};
              const conversations = new Map();
              const add = (id, title, url, ts) => {
                if (!id) return;
                if (!conversations.has(id)) {
                  conversations.set(id, { id, title: title || id, url: url || null, timestamp: ts });
                }
              };

              const now = Date.now();
              const parseRelative = (value) => {
                const text = String(value || '').toLowerCase().trim();
                if (!text) return null;
                if (text === 'just now' || text === 'moments ago') return now;
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
                // Check specific time elements first
                const timeEl = node.querySelector('time');
                if (timeEl) {
                  const dt = timeEl.getAttribute('datetime');
                  if (dt) {
                    const parsed = Date.parse(dt);
                    if (Number.isFinite(parsed)) return parsed;
                  }
                  const text = timeEl.textContent;
                  const parsed = parseRelative(text);
                  if (parsed) return parsed;
                }

                // Scan direct text of children for relative time patterns
                // We look for short strings on the right side usually
                const candidates = Array.from(node.querySelectorAll('*'));
                // Often the time is the last element or close to it
                for (const candidate of candidates.reverse()) {
                  const text = (candidate.textContent || '').trim();
                  // Avoid reading the whole title
                  if (text.length > 20) continue; 
                  const parsed = parseRelative(text);
                  if (parsed) return parsed;
                }
                return null;
              };
              
              const items = Array.from(document.querySelectorAll('a,button,[role="link"],[role="button"],[role="option"],[data-href],[data-url],[data-value]'));
              
              for (const node of items) {
                const href = node.getAttribute('href') || node.getAttribute('data-href') || node.getAttribute('data-url') || '';
                const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
                let chatId = '';
                let url = '';

                if (dataValue.startsWith('conversation:')) {
                  chatId = dataValue.split(':')[1];
                  url = 'https://grok.com/c/' + chatId;
                } else if (href) {
                  try {
                    const fullUrl = href.startsWith('http') ? href : new URL(href, location.origin).toString();
                    const match = fullUrl.match(/\\/c\\/([^/?#]+)/);
                    if (match?.[1]) {
                      chatId = match[1];
                      url = fullUrl;
                    }
                  } catch { /* ignore */ }
                }

                if (!chatId) continue;
                
                if (projectId && url.includes('/project/') && !url.includes('/project/' + projectId)) {
                  continue;
                }

                const row = node.closest('div,li') || node;
                const titleNode = row?.querySelector?.('[class*="line-clamp"],[class*="truncate"]') || row;
                
                // Exclude time text from title if possible
                let title = (titleNode?.textContent || '').trim();
                const ts = readTimestamp(row);

                if (ts) {
                  // Attempt to clean title if it accidentally includes the time text (e.g. if titleNode IS the row)
                  // This is a simple heuristic: if title ends with time-like string, chop it.
                  // But usually titleNode is a specific element.
                }

                if (!title) continue;
                add(chatId, title, url, ts);
              }
              return { items: Array.from(conversations.values()), count: conversations.size, nodes: items.length, href: location.href, path: location.pathname, projectId };
            } catch (e) {
              return { error: e.message, stack: e.stack };
            }
          })()`,
          returnByValue: true,
        });
        const payload = (result?.value ?? { items: [] }) as any;
        const raw = payload.items || [];
        if (raw.length === 0) {
           console.log('[DEBUG] Scraper result:', JSON.stringify(payload, null, 2));
        }
        const merged = new Map<string, Conversation>();
        for (const entry of raw) {
          merged.set(entry.id, {
            id: entry.id,
            title: entry.title,
            provider: 'grok',
            projectId: resolvedProjectId ?? undefined,
            url: entry.url ?? undefined,
            updatedAt: typeof entry.timestamp === 'number' ? new Date(entry.timestamp).toISOString() : undefined,
          });
        }
        for (const entry of history) {
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
    async renameConversation(
      conversationId: string,
      newTitle: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const projectUrl = projectId ? `https://grok.com/project/${projectId}?tab=conversations` : undefined;
      // If no project, we might need to find it in history/sidebar. For now, require project or assume sidebar.
      // But sidebar items often don't have rename.
      
      const connection = projectUrl
        ? await connectToGrokProjectTab(options, projectId ?? null, projectUrl)
        : await connectToGrokTab(options, `https://grok.com/`);
        
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      try {
        if (projectUrl && !usedExisting) {
           await navigateToProject(client, projectUrl);
        }
        
        await client.Runtime.evaluate({
          expression: `(async () => {
            const chatId = ${JSON.stringify(conversationId)};
            const newTitle = ${JSON.stringify(newTitle)};
            
            // 1. Find the item
            const selector = \`a[href*="\${chatId}"], [data-value*="\${chatId}"]\`;
            let item = document.querySelector(selector);
            
            if (!item) {
               // Try scrolling or waiting?
               // Assuming it's visible for now.
               throw new Error('Conversation item not found: ' + chatId);
            }
            
            const row = item.closest('div.grid') || item.closest('li') || item.parentElement;
            
            // 2. Find "More" button (usually 3 dots)
            // It might appear on hover.
            row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await new Promise(r => setTimeout(r, 200));
            
            const menuBtn = row.querySelector('button[aria-label="More options"], button[aria-label="Options"], button[aria-haspopup="menu"]');
            
            if (!menuBtn) throw new Error('Menu button not found for conversation');
            
            menuBtn.click();
            await new Promise(r => setTimeout(r, 500));
            
            // 3. Click Rename
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const renameBtn = menuItems.find(el => el.textContent.toLowerCase().includes('rename'));
            
            if (!renameBtn) throw new Error('Rename option not found in menu');
            
            renameBtn.click();
            await new Promise(r => setTimeout(r, 500));
            
            // 4. Type new name
            // It usually turns into an input or contenteditable
            const input = row.querySelector('input, [contenteditable="true"]');
            if (!input) throw new Error('Rename input not found');
            
            if (input.tagName === 'INPUT') {
               input.value = newTitle;
               input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
               input.textContent = newTitle;
               input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // 5. Submit
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            
          })()`,
          awaitPromise: true
        });
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
  await new Promise((resolve) => setTimeout(resolve, 3000));
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
    while (entries.size < maxItems && idleCount < 10) {
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
                if (parsed) return { ts: parsed, label: String(candidate || '').trim() };
                const absolute = Date.parse(String(candidate || ''));
                if (Number.isFinite(absolute)) return { ts: absolute, label: String(candidate || '').trim() };
              }
              return { ts: null, label: '' };
            };
            const extractTitle = (node, timeLabel) => {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
                acceptNode: (textNode) => {
                  const parent = textNode.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  if (parent.closest('time')) return NodeFilter.FILTER_REJECT;
                  return NodeFilter.FILTER_ACCEPT;
                },
              });
              let text = '';
              while (walker.nextNode()) {
                text += ' ' + (walker.currentNode.nodeValue || '');
              }
              let title = text.replace(/\\s+/g, ' ').trim();
              if (timeLabel) {
                const escaped = timeLabel.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&');
                title = title.replace(new RegExp(escaped, 'i'), '').trim();
              }
              title = title
                .replace(/\\b\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago\\b/gi, '')
                .replace(/\\b(yesterday|today)\\b/gi, '')
                .replace(/\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\s+\\d{1,2}\\b/gi, '')
                .replace(/\\s+/g, ' ')
                .trim();
              return title;
            };
            const items = Array.from(
            dialog.querySelectorAll('[role="option"], a[href*="/c/"]')
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
            const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
            
            let url = '';
            let chatId = '';
            
            if (dataValue.startsWith('conversation:')) {
              chatId = dataValue.split(':')[1];
              url = 'https://grok.com/c/' + chatId;
            } else if (href) {
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
            }
            
            if (!chatId) continue;
            if (projectId && url.includes('/project/') && !url.includes('/project/' + projectId)) {
              continue;
            }
            const row = node.closest('div,li') || node;
            const { ts, label } = readTimestamp(row);
            if (typeof ts === 'number') {
              oldest = oldest === null ? ts : Math.min(oldest, ts);
            }
            const text = extractTitle(row, label) || (row.textContent || node.textContent || '').trim();
            conversations.push({ id: chatId, title: text || chatId, url, timestamp: ts ?? null });
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
        updatedAt: typeof entry.timestamp === 'number' ? new Date(entry.timestamp).toISOString() : undefined,
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
      const nodes = Array.from(dialog.querySelectorAll('button,a,[role="button"],[role="link"],[role="option"],div.cursor-pointer'));
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
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function openHistoryDialog(client: ChromeClient): Promise<boolean> {
  const findAndClickHistory = async () => {
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
    return clicked.result?.value;
  };

  if (await findAndClickHistory()) {
    return waitForDialog(client);
  }

  // Try opening the sidebar/menu
  await client.Runtime.evaluate({
    expression: `(() => {
      const menus = Array.from(document.querySelectorAll('button[aria-label="Toggle Menu"]'));
      if (menus[0]) {
        menus[0].click();
      }
    })()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (await findAndClickHistory()) {
    return waitForDialog(client);
  }

  return false;
}

async function waitForDialog(client: ChromeClient): Promise<boolean> {
  const deadline = Date.now() + 10_000;
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
      const getDialog = () => document.querySelector('[role="dialog"]') || document.querySelector('dialog') || document.querySelector('[aria-modal="true"]');
      let dialog = getDialog();
      if (!dialog) return true;

      // Try backdrop click
      const backdrop =
        dialog.parentElement?.querySelector?.('[data-state="open"][class*="backdrop"]') ||
        document.querySelector('[data-state="open"][data-radix-portal] > [class*="backdrop"]') ||
        document.querySelector('[data-radix-portal] [data-state="open"]');
      
      if (backdrop && backdrop !== dialog) {
        backdrop.click();
      }

      // Try Escape on body (proven to work)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
      
      // Try Escape on dialog
      if (getDialog()) {
         getDialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
      }
      
      return true;
    })()`,
    returnByValue: true,
  });
  
  // Verification loop
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `Boolean(document.querySelector('[role="dialog"],dialog,[aria-modal="true"]'))`,
      returnByValue: true
    });
    if (!result?.value) return; // Closed
    await new Promise(r => setTimeout(r, 250));
  }
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
