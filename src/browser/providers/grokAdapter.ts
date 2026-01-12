import CDP from 'chrome-remote-interface';
import type { Project, Conversation } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { ChromeClient } from '../types.js';
import {
  closeDialog,
  DEFAULT_DIALOG_SELECTORS,
  findAndClickByLabel,
  isDialogOpen,
  waitForDialog,
} from '../service/ui.js';

export function createGrokAdapter(): Pick<
  BrowserProvider,
  'listProjects' | 'listConversations' | 'getUserIdentity' | 'capabilities' | 'renameConversation'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const { client, targetId, shouldClose, host, port } = await connectToGrokTab(
        options,
        'https://grok.com/project',
      );
      try {
        const debug = process.env.ORACLE_DEBUG_GROK === '1';
        const waitForProjectLinks = async (timeoutMs: number): Promise<void> => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const { result } = await client.Runtime.evaluate({
              expression: `Boolean(document.querySelector('main a[href*="/project/"], nav a[href*="/project/"], aside a[href*="/project/"]'))`,
              returnByValue: true,
            });
            if (result?.value) return;
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        };
        const scrapeProjects = async (): Promise<{
          items: Array<{ id: string; name: string; url?: string | null }>;
          error?: string | null;
          linkCount?: number | null;
        }> => {
          const { result } = await client.Runtime.evaluate({
            expression: `(() => {
            try {
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
              const roots = [
                document.querySelector('main'),
                document.querySelector('nav'),
                document.querySelector('aside'),
                document.body,
              ].filter(Boolean);
              const seen = new Set();
              const links = [];
              for (const root of roots) {
                for (const link of Array.from(root.querySelectorAll('a[href*="/project/"]'))) {
                  if (seen.has(link)) continue;
                  seen.add(link);
                  links.push(link);
                }
              }
              for (const link of links) {
                const href = link.getAttribute('href') || '';
                const match = href.match(/\\/project\\/([^/?#]+)/);
                if (!match?.[1]) continue;
                const text = (link.textContent || '').trim();
                const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
                add(match[1], text, url);
              }
              return {
                items: Array.from(projects.values()),
                error: null,
                linkCount: links.length,
              };
            } catch (error) {
              return { items: [], error: String(error), linkCount: null };
            }
          })()`,
            returnByValue: true,
          });
          return (result?.value ?? { items: [] }) as {
            items: Array<{ id: string; name: string; url?: string | null }>;
            error?: string | null;
            linkCount?: number | null;
          };
        };
        await navigateToProject(client, 'https://grok.com/project');
        await waitForProjectLinks(10_000);
        if (debug) {
          const { result } = await client.Runtime.evaluate({
            expression: `(() => ({
              href: location.href,
              linkCount: document.querySelectorAll('a[href*="/project/"]').length,
              title: document.title,
            }))()`,
            returnByValue: true,
          });
          console.log('[grok-projects] after navigate', result?.value);
        }
        let raw = await scrapeProjects();
        if (debug) {
          console.log('[grok-projects] scraped', {
            count: raw.items.length,
            sample: raw.items.slice(0, 3),
            error: raw.error,
            linkCount: raw.linkCount,
          });
        }
        if (raw.items.length === 0) {
          await navigateToProject(client, 'https://grok.com/');
          await waitForProjectLinks(10_000);
          if (debug) {
            const { result } = await client.Runtime.evaluate({
              expression: `(() => ({
                href: location.href,
                linkCount: document.querySelectorAll('a[href*="/project/"]').length,
                title: document.title,
              }))()`,
              returnByValue: true,
            });
            console.log('[grok-projects] after fallback', result?.value);
          }
          raw = await scrapeProjects();
          if (debug) {
            console.log('[grok-projects] scraped fallback', {
              count: raw.items.length,
              sample: raw.items.slice(0, 3),
              error: raw.error,
              linkCount: raw.linkCount,
            });
          }
        }
        const projects = new Map<string, { id: string; name: string; url?: string | null }>();
        for (const entry of raw.items) {
          if (!entry?.id) continue;
          projects.set(entry.id, entry);
        }
        return Array.from(projects.values()).map((entry) => ({
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
        if (includeHistory) {
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
                if (text === 'today') return now;
                if (text === 'yesterday') return now - 24 * 60 * 60 * 1000;
                const cleaned = text.replace(/[.,]/g, '');
                const shortMatch = cleaned.match(/^(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)$/);
                const agoMatch = cleaned.match(/(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\\s*ago/);
                const match = agoMatch || shortMatch;
                if (match) {
                  const amount = Number.parseInt(match[1], 10);
                  if (!Number.isFinite(amount)) return null;
                  const unit = match[2];
                  const isMonth = unit.startsWith('mo');
                  const isMinute = unit.startsWith('m') && !isMonth;
                  const isHour = unit.startsWith('h');
                  const isDay = unit.startsWith('d');
                  const isWeek = unit.startsWith('w');
                  const isYear = unit.startsWith('y');
                  const ms =
                    isMinute
                      ? amount * 60 * 1000
                      : isHour
                        ? amount * 60 * 60 * 1000
                        : isDay
                          ? amount * 24 * 60 * 60 * 1000
                          : isWeek
                            ? amount * 7 * 24 * 60 * 60 * 1000
                            : isMonth
                              ? amount * 30 * 24 * 60 * 60 * 1000
                              : isYear
                                ? amount * 365 * 24 * 60 * 60 * 1000
                                : null;
                  return ms === null ? null : now - ms;
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
                  if (parsed !== null) return parsed;
                }

                // Scan direct text of children for relative time patterns
                const candidates = Array.from(node.querySelectorAll('*'));
                for (const candidate of candidates.reverse()) {
                  const text = (candidate.textContent || '').trim();
                  if (text.length > 20) continue; 
                  const parsed = parseRelative(text);
                  if (parsed !== null) return parsed;
                }
                return null;
              };
              
              const items = Array.from(document.querySelectorAll('a,button,[role="link"],[role="button"],[role="option"],[data-href],[data-url],[data-value]'));
              const nodeDetails = items.slice(0, 10).map(n => ({
                tag: n.tagName,
                text: (n.textContent || '').trim().slice(0, 30),
                href: n.getAttribute('href'),
                dataValue: n.getAttribute('data-value') || n.dataset?.value
              }));
              
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
                    const match = fullUrl.match(/\/c\/([^/?#]+)/);
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
                const ts = readTimestamp(row);
                
                // Exclude time text from title if possible
                let title = (row.textContent || '').trim();
                const titleNode = row.querySelector('[class*="line-clamp"], [class*="truncate"]');
                if (titleNode) {
                   title = (titleNode.textContent || '').trim();
                }
                // Try cleaning title with safe regexes
                title = title
                    .replace(/(^|\\s)\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago(\\s|$)/gi, '')
                    .replace(/(^|\\s)(yesterday|today)(\\s|$)/gi, '')
                    .replace(/(^|\\s)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\s+[0-9]{1,2}(\\s|$)/gi, '')
                    .replace(/\\s+/g, ' ')
                    .trim();

                if (!title) continue;
                add(chatId, title, url, ts);
              }
              return { items: Array.from(conversations.values()), count: conversations.size, nodes: items.length, href: location.href, path: location.pathname, projectId, nodeDetails };
            } catch (e) {
              return { error: e.message, stack: e.stack };
            }
          })()`,
          returnByValue: true,
        });
        const payload = (result?.value ?? { items: [] }) as any;
        const raw = payload.items || [];
        if (raw.length === 0) {
           // Debug logging if needed, can be enabled via env
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
    async getUserIdentity(
      options?: BrowserProviderListOptions,
    ): Promise<import('./types.js').ProviderUserIdentity | null> {
      const { client, targetId, shouldClose, host, port } = await connectToGrokTab(options);
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const identity = { id: null, name: null, handle: null, email: null, source: null };
            const normalize = (value) => String(value || '').trim();
            const assign = (source, candidate) => {
              if (!candidate || typeof candidate !== 'object') return false;
              const id = normalize(candidate.id || candidate.userId || candidate.uid || '');
              const name = normalize(candidate.name || candidate.displayName || candidate.fullName || candidate.username || '');
              const handle = normalize(candidate.handle || candidate.username || candidate.screen_name || candidate.userName || '');
              const email = normalize(candidate.email || '');
              if (id) identity.id = identity.id || id;
              if (name) identity.name = identity.name || name;
              if (handle) identity.handle = identity.handle || handle;
              if (email) identity.email = identity.email || email;
              if ((id || name || handle || email) && !identity.source) identity.source = source;
              return Boolean(id || name || handle || email);
            };
            try {
              const next = window.__NEXT_DATA__?.props?.pageProps || window.__NEXT_DATA__?.props?.initialProps || {};
              const candidates = [
                next.user,
                next.viewer,
                next.profile,
                next.account,
                next.session?.user,
                next.data?.user,
              ];
              for (const candidate of candidates) {
                if (assign('next-data', candidate)) break;
              }
            } catch {}

            if (!identity.id && !identity.name && !identity.handle && !identity.email) {
              const button = document.querySelector('button[aria-label*="account" i], button[aria-label*="profile" i], button[aria-label*="settings" i], a[aria-label*="account" i], a[aria-label*="profile" i]');
              if (button) {
                const label = normalize(button.getAttribute('aria-label') || button.textContent || '');
                if (label) {
                  identity.name = identity.name || label;
                  identity.source = identity.source || 'dom-label';
                }
              }
              const handleNode = Array.from(document.querySelectorAll('a,button,span,div')).find((node) => {
                const text = normalize(node.textContent || '');
                return text.startsWith('@') && text.length > 2 && text.length < 48;
              });
              if (handleNode) {
                const handle = normalize(handleNode.textContent || '');
                if (handle) {
                  identity.handle = identity.handle || handle;
                  identity.source = identity.source || 'dom-handle';
                }
              }
              const avatar = document.querySelector('img[alt], img[title]');
              if (avatar) {
                const alt = normalize(avatar.getAttribute('alt') || avatar.getAttribute('title') || '');
                if (alt && !alt.toLowerCase().includes('avatar')) {
                  identity.name = identity.name || alt;
                  identity.source = identity.source || 'dom-avatar';
                }
              }
            }

            return identity;
          })()`,
          returnByValue: true,
        });
        const identity = result?.value as { id?: string | null; name?: string | null; handle?: string | null; email?: string | null; source?: string | null } | undefined;
        if (!identity) return null;
        const normalizedName = identity.name?.toLowerCase().trim() ?? '';
        const lowSignalName =
          identity.source === 'dom-avatar' &&
          (!normalizedName ||
            ['pfp', 'profile', 'avatar', 'account'].includes(normalizedName) ||
            normalizedName.length < 3);
        if (lowSignalName) {
          identity.name = null;
          identity.source = null;
        }
        if (!identity.id && !identity.name && !identity.handle && !identity.email) {
          return await getIdentityFromSettingsMenu(client);
        }
        return {
          id: identity.id || undefined,
          name: identity.name || undefined,
          handle: identity.handle || undefined,
          email: identity.email || undefined,
          source: identity.source || undefined,
        };
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
      const targetUrl = projectId
        ? `https://grok.com/project/${projectId}?chat=${conversationId}`
        : `https://grok.com/c/${conversationId}`;

      const connection = projectId
        ? await connectToGrokProjectTab(options, projectId, targetUrl)
        : await connectToGrokTab(options, targetUrl);

      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        // Wait a bit for the sidebar to reflect the active conversation
        await new Promise(r => setTimeout(r, 2000));

        const performRename = async (preferDialog: boolean) => {
          const evalResult = await client.Runtime.evaluate({
            expression: `(async () => {
              const chatId = ${JSON.stringify(conversationId)};
              const newTitle = ${JSON.stringify(newTitle)};
              const preferDialog = ${JSON.stringify(preferDialog)};
              const logs = [];
              const log = (msg) => {
                logs.push(msg);
                console.log('[browser-rename] ' + msg);
              };

              try {
                const dialog = document.querySelector('[role="dialog"]') || document.querySelector('dialog') || document.querySelector('[aria-modal="true"]');
                const sidebar = document.querySelector('nav') || document.querySelector('aside') || document.querySelector('.group\/sidebar-wrapper');
                const roots = [];
                if (preferDialog && dialog) roots.push(dialog);
                if (sidebar) roots.push(sidebar);
                if (!preferDialog && dialog) roots.push(dialog);
                const root = roots[0] || document;

                const selectors = [
                  'a[href*="' + chatId + '"]',
                  '[data-value="conversation:' + chatId + '"]',
                  '[data-value*="' + chatId + '"]',
                  '[data-href*="' + chatId + '"]',
                  '[data-url*="' + chatId + '"]',
                ];

                log('Searching for conversation row for chatId: ' + chatId);
                let item = null;
                for (const selector of selectors) {
                  const items = Array.from(root.querySelectorAll(selector));
                  if (items.length) {
                    item = items[0];
                    break;
                  }
                }
                if (!item && root !== document) {
                  for (const selector of selectors) {
                    const items = Array.from(document.querySelectorAll(selector));
                    if (items.length) {
                      item = items[0];
                      break;
                    }
                  }
                }

                if (!item) {
                  log('Conversation item not found for selectors.');
                  return { success: false, logs };
                }
                log('Found item: ' + item.tagName);

                const row = item.closest('div.grid') || item.closest('li') || item.closest('div[class*="rounded"]') || item.parentElement;
                log('Found row: ' + (row ? row.className : 'null'));

                if (!row) throw new Error('Could not find row container for conversation');

                log('Triggering mouseover/mouseenter on row');
                row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                await new Promise(r => setTimeout(r, 500));

                log('Searching for menu button');
                const menuBtn = row.querySelector('button[aria-label*="option" i], button[aria-label*="menu" i], [aria-haspopup="menu"]');

                if (!menuBtn) {
                  const buttons = Array.from(row.querySelectorAll('button'));
                  const btnDebug = buttons.map(b => ({ tag: b.tagName, label: b.getAttribute('aria-label') || b.textContent }));
                  log('Available buttons in row: ' + JSON.stringify(btnDebug));
                  log('Menu button not found in row. Row HTML: ' + row.innerHTML.slice(0, 300));
                  throw new Error('Menu button not found for conversation');
                }
                log('Clicking menu button');
                menuBtn.click();
                await new Promise(r => setTimeout(r, 800));

                const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], button, a'));
                const renameBtn = menuItems.find(el => (el.textContent || '').toLowerCase().includes('rename'));

                if (!renameBtn) {
                  log('Rename option not found in menu. Found ' + menuItems.length + ' candidates.');
                  throw new Error('Rename option not found in menu');
                }
                log('Clicking rename button');
                renameBtn.click();
                await new Promise(r => setTimeout(r, 800));

                const input = row.querySelector('input, [contenteditable="true"]');
                if (!input) {
                  log('Rename input/contenteditable not found in row after clicking rename');
                  throw new Error('Rename input not found');
                }
                log('Found input: ' + input.tagName);

                if (input.tagName === 'INPUT') {
                  input.focus();
                  input.value = newTitle;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  input.focus();
                  input.textContent = newTitle;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                log('Submitting with Enter');
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
                await new Promise(r => setTimeout(r, 1000));

                return { success: true, logs };
              } catch (e) {
                return { success: false, error: e.message, logs };
              }
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });

          if (evalResult.exceptionDetails) {
            return {
              success: false,
              error: 'JS Exception: ' + evalResult.exceptionDetails.exception?.description,
              logs: [],
            };
          }
          return evalResult.result?.value || { success: false, error: 'Empty result from browser', logs: [] };
        };

        let info = await performRename(false);
        if (!info || !info.success) {
          const opened = await openHistoryDialog(client);
          if (opened) {
            await expandHistoryDialog(client);
            info = await performRename(true);
          }
        }
        if (!info || !info.success) {
          throw new Error(info?.error || 'Rename failed');
        }
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    }
,
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
  let host = options?.host ?? '127.0.0.1';
  let port = options?.port ?? resolvePortFromEnv();
  if ((!port || !host) && options?.browserService) {
    const target = await options.browserService.resolveDevToolsTarget({
      host,
      port,
      ensurePort: true,
      launchUrl: urlOverride ?? options?.configuredUrl ?? 'https://grok.com/',
    });
    host = target.host ?? host;
    port = target.port ?? port;
  }
  if (!port) {
    throw new Error('Missing DevTools port. Launch a Grok browser session or set ORACLE_BROWSER_PORT.');
  }
  const targets = await CDP.List({ host, port });
  const candidates = targets.filter((target) => target.type === 'page' && target.url?.includes('grok.com'));
  const preferredUrl = urlOverride ?? options?.configuredUrl;
  const preferred = preferredUrl
    ? candidates.find((target) => target.url?.includes(preferredUrl ?? ''))
    : undefined;
  let targetInfo = preferred;
  let shouldClose = false;
  let usedExisting = Boolean(targetInfo?.id);
  if (!targetInfo && preferredUrl) {
    const created = await CDP.New({ host, port, url: preferredUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  } else if (!targetInfo) {
    targetInfo = candidates[0];
    usedExisting = Boolean(targetInfo?.id);
  }
  if (!targetInfo?.id) {
    const fallbackUrl = preferredUrl ?? 'https://grok.com/';
    const created = await CDP.New({ host, port, url: fallbackUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  }
  if (!targetInfo?.id) {
    throw new Error('No grok.com tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port, target: targetInfo });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId: targetInfo.id, shouldClose, host, port, usedExisting };
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
  let host = options?.host ?? '127.0.0.1';
  let port = options?.port ?? resolvePortFromEnv();
  if ((!port || !host) && options?.browserService) {
    const target = await options.browserService.resolveDevToolsTarget({
      host,
      port,
      ensurePort: true,
      launchUrl: projectUrl,
    });
    host = target.host ?? host;
    port = target.port ?? port;
  }
  if (!port) {
    throw new Error('Missing DevTools port. Launch a Grok browser session or set ORACLE_BROWSER_PORT.');
  }
  const targets = await CDP.List({ host, port });
  const match = projectId
    ? targets.find(
        (target) => target.type === 'page' && target.url?.includes(`/project/${projectId}`),
      )
    : undefined;
  let targetInfo = match;
  let shouldClose = false;
  let usedExisting = Boolean(targetInfo?.id);
  if (!targetInfo?.id) {
    const created = await CDP.New({ host, port, url: projectUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  }
  if (!targetInfo?.id) {
    throw new Error('No grok.com project tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port, target: targetInfo });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId: targetInfo.id, shouldClose, host, port, usedExisting };
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
      const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
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
  try {
    if (!opened) return [];
    await expandHistoryDialog(client);
    const maxItems = Math.max(1, options?.historyLimit ?? 200);
    const cutoffMs = options?.historySince ? Date.parse(options.historySince) : NaN;
    const entries = new Map<string, { id: string; title: string; url?: string; timestamp?: number | null }>();
    let idleCount = 0;
    let lastCount = 0;
    let lastScrollTop = -1;
    while (entries.size < maxItems && idleCount < 10) {
      const expression = `(() => {
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
            if (text === 'just now' || text === 'moments ago') return now;
            if (text === 'today') return now;
            if (text === 'yesterday') return now - 24 * 60 * 60 * 1000;
            const cleaned = text.replace(/[.,]/g, '');
            const shortMatch = cleaned.match(/^(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)$/);
            const agoMatch = cleaned.match(/(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\\s*ago/);
            const match = agoMatch || shortMatch;
            if (match) {
              const amount = Number.parseInt(match[1], 10);
              if (!Number.isFinite(amount)) return null;
              const unit = match[2];
              const isMonth = unit.startsWith('mo');
              const isMinute = unit.startsWith('m') && !isMonth;
              const isHour = unit.startsWith('h');
              const isDay = unit.startsWith('d');
              const isWeek = unit.startsWith('w');
              const isYear = unit.startsWith('y');
              const ms =
                isMinute
                  ? amount * 60 * 1000
                  : isHour
                    ? amount * 60 * 60 * 1000
                    : isDay
                      ? amount * 24 * 60 * 60 * 1000
                      : isWeek
                        ? amount * 7 * 24 * 60 * 60 * 1000
                        : isMonth
                          ? amount * 30 * 24 * 60 * 60 * 1000
                          : isYear
                            ? amount * 365 * 24 * 60 * 60 * 1000
                            : null;
              return ms === null ? null : now - ms;
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
                if (parsed !== null) return { ts: parsed, label: String(candidate || '').trim() };
                const absolute = Date.parse(String(candidate || ''));
                if (Number.isFinite(absolute)) return { ts: absolute, label: String(candidate || '').trim() };
              }
              const timeNode =
                node.querySelector?.('.z-20') ||
                node.querySelector?.('[class*="time"]') ||
                node.querySelector?.('[class*="timestamp"]');
              if (timeNode) {
                const text = (timeNode.textContent || '').trim();
                const parsed = parseRelative(text);
                if (parsed !== null) return { ts: parsed, label: text };
                const absolute = Date.parse(text);
                if (Number.isFinite(absolute)) return { ts: absolute, label: text };
              }
              const descendants = Array.from(node.querySelectorAll?.('*') ?? []).reverse();
              for (const el of descendants) {
                const text = (el.textContent || '').trim();
                if (!text || text.length > 40) continue;
                const parsed = parseRelative(text);
                if (parsed !== null) return { ts: parsed, label: text };
                const absolute = Date.parse(text);
                if (Number.isFinite(absolute)) return { ts: absolute, label: text };
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
                const escaped = timeLabel.replace(/[.*+?^$()|[\\]\\\\]/g, '\\$&');
                title = title.replace(new RegExp(escaped, 'i'), '').trim();
              }
              const timeCleanRegex = /(^|\\s)\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago(\\s|$)/gi;
              const dayCleanRegex = /(^|\\s)(yesterday|today)(\\s|$)/gi;
              const dateCleanRegex = /(^|\\s)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\s+[0-9]{1,2}(\\s|$)/gi;
              title = title
                  .replace(timeCleanRegex, '')
                  .replace(dayCleanRegex, '')
                  .replace(dateCleanRegex, '')
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
        })()`;
      const { result } = await client.Runtime.evaluate({
        expression,
        returnByValue: true,
      });
      const payload = (result?.value || {}) as {
        items?: Array<{ id: string; title: string; url?: string; timestamp?: number | null }>;
        canScroll?: boolean;
        atBottom?: boolean;
        scrollTop?: number;
        scrollHeight?: number;
        oldest?: number | null;
        error?: string;
      };
      if (process.env.ORACLE_DEBUG_GROK === '1') {
         if (!payload.items) console.log('[grok-history] RAW:', JSON.stringify(result));
      }
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
      if (typeof payload.scrollTop === 'number') {
        lastScrollTop = payload.scrollTop;
      }
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

async function getIdentityFromSettingsMenu(client: ChromeClient): Promise<ProviderUserIdentity | null> {
  const target = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (v) => String(v || '').trim();
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const candidates = buttons
        .map((btn) => {
          const rect = btn.getBoundingClientRect();
          const label = normalize(btn.getAttribute('aria-label') || btn.textContent || '');
          const hasImg = Boolean(btn.querySelector('img,svg'));
          return { label, hasImg, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        })
        .filter((b) => (b.label || b.hasImg) && b.y > window.innerHeight * 0.6 && b.x < window.innerWidth * 0.5);
      if (!candidates.length) return null;
      candidates.sort((a, b) => (a.x - b.x) || (b.y - a.y));
      return candidates[0];
    })()`,
    returnByValue: true,
  });
  const candidate = target?.result?.value as { x: number; y: number; w: number; h: number } | null;
  if (!candidate) return null;

  const clickX = Math.round(candidate.x + candidate.w / 2);
  const clickY = Math.round(candidate.y + candidate.h / 2);
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: clickX, y: clickY, button: 'left' });
  await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });

  let dialogOpened = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await client.Runtime.evaluate({
      expression: `(() => {
        const normalize = (v) => String(v || '').trim().toLowerCase();
        const nodes = Array.from(document.querySelectorAll('[role="menu"], [data-state="open"], [data-radix-portal]'));
        const menu = nodes.find((node) => node.querySelector('button, a, [role="menuitem"]')) || document;
        const items = Array.from(menu.querySelectorAll('button, a, [role="menuitem"]'));
        const settings = items.find((el) => normalize(el.textContent || el.getAttribute('aria-label') || '').includes('settings'));
        if (settings) {
          settings.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    dialogOpened = await isDialogOpen(client.Runtime, DEFAULT_DIALOG_SELECTORS);
    if (dialogOpened) break;
    await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  }
  if (!dialogOpened) {
    return null;
  }

  const identityResult = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (v) => String(v || '').trim();
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) return null;
      const text = normalize(dialog.textContent || '');
      const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      let name = null;
      if (emailMatch) {
        const before = text.slice(0, emailMatch.index ?? 0).trim();
        const nameMatch = before.match(/([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,3})$/);
        if (nameMatch) {
          name = nameMatch[1];
        }
      }
      return {
        id: uuidMatch ? uuidMatch[0] : null,
        name,
        handle: null,
        email: emailMatch ? emailMatch[0] : null,
        source: 'settings-dialog',
      };
    })()`,
    returnByValue: true,
  });

  await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);

  const identity = identityResult?.result?.value as {
    id?: string | null;
    name?: string | null;
    handle?: string | null;
    email?: string | null;
    source?: string | null;
  } | null;
  if (!identity) return null;
  if (!identity.id && !identity.name && !identity.handle && !identity.email) return null;
  return {
    id: identity.id || undefined,
    name: identity.name || undefined,
    handle: identity.handle || undefined,
    email: identity.email || undefined,
    source: identity.source || undefined,
  };
}

async function ensureSidebarOpen(client: ChromeClient): Promise<void> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => Boolean(document.querySelector('nav') || document.querySelector('aside') || document.querySelector('.group\/sidebar-wrapper')))()`,
    returnByValue: true,
  });
  if (result?.value) return;
  await findAndClickByLabel(client.Runtime, {
    selectors: ['button', '[role="button"]'],
    match: {
      includeAll: ['toggle', 'menu'],
      includeAny: ['toggle menu'],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function expandHistoryDialog(client: ChromeClient): Promise<void> {
  await findAndClickByLabel(client.Runtime, {
    selectors: ['button', 'a', '[role="button"]', '[role="link"]', '[role="option"]', 'div.cursor-pointer'],
    rootSelectors: [...DEFAULT_DIALOG_SELECTORS],
    match: {
      includeAll: ['show', 'all'],
      includeAny: ['show all'],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function openHistoryDialog(client: ChromeClient): Promise<boolean> {
  if (await isDialogOpen(client.Runtime, DEFAULT_DIALOG_SELECTORS)) {
    return true;
  }

  const findAndClickHistory = async () => {
    const clicked = await findAndClickByLabel(client.Runtime, {
      selectors: ['a', 'button', '[role="button"]', '[role="link"]'],
      match: {
        includeAny: ['history'],
        includeAll: ['hi', 'tory'],
      },
    });
    if (!clicked && process.env.ORACLE_DEBUG_GROK === '1') {
      console.log('[DEBUG] History button not found.');
    }
    return clicked;
  };

  if (await findAndClickHistory()) {
    return waitForDialog(client.Runtime, 10_000, DEFAULT_DIALOG_SELECTORS);
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
    return waitForDialog(client.Runtime, 10_000, DEFAULT_DIALOG_SELECTORS);
  }

  return false;
}


async function closeHistoryDialog(client: ChromeClient): Promise<void> {
  await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
  if (!(await isDialogOpen(client.Runtime, DEFAULT_DIALOG_SELECTORS))) {
    return;
  }
  await findAndClickByLabel(client.Runtime, {
    selectors: ['a', 'button', '[role="button"]', '[role="link"]'],
    match: {
      includeAny: ['history'],
      includeAll: ['hi', 'tory'],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
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
