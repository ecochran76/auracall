import CDP from 'chrome-remote-interface';
import type { Project, Conversation } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { ChromeClient } from '../types.js';
import { ensureServicesRegistry } from '../../services/registry.js';
import { GROK_MODEL_LABEL_NORMALIZER, normalizeGrokModelLabel } from './grokModelMenu.js';
import {
  closeDialog,
  DEFAULT_DIALOG_SELECTORS,
  findAndClickByLabel,
  hoverElement,
  isDialogOpen,
  pressButton,
  waitForDialog,
  waitForNotSelector,
  waitForSelector,
} from '../service/ui.js';

export function createGrokAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'listProjects'
  | 'listConversations'
  | 'getUserIdentity'
  | 'renameConversation'
  | 'deleteConversation'
  | 'renameProject'
  | 'cloneProject'
  | 'selectRenameProjectItem'
  | 'selectCloneProjectItem'
  | 'selectRemoveProjectItem'
  | 'pushProjectRemoveConfirmation'
  | 'validateProjectUrl'
  | 'validateConversationUrl'
  | 'openCreateProjectModal'
  | 'setCreateProjectFields'
  | 'clickCreateProjectNext'
  | 'clickCreateProjectAttach'
  | 'clickCreateProjectUploadFile'
  | 'clickCreateProjectConfirm'
  | 'toggleProjectSidebar'
  | 'toggleMainSidebar'
  | 'clickHistoryItem'
  | 'clickHistorySeeAll'
  | 'clickChatArea'
  | 'openProjectMenu'
  | 'updateProjectInstructions'
  | 'getProjectInstructions'
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
        const payload = (result?.value ?? { items: [] }) as { items?: unknown[] };
        const raw = Array.isArray(payload.items) ? payload.items : [];
        if (raw.length === 0) {
           // Debug logging if needed, can be enabled via env
        }
        const merged = new Map<string, Conversation>();
        for (const entry of raw) {
          if (!entry || typeof entry !== 'object') continue;
          const record = entry as Record<string, unknown>;
          const id = typeof record.id === 'string' ? record.id : null;
          const title = typeof record.title === 'string' ? record.title : '';
          if (!id || !title) continue;
          const url = typeof record.url === 'string' ? record.url : undefined;
          const timestamp = typeof record.timestamp === 'number' ? record.timestamp : undefined;
          merged.set(id, {
            id,
            title,
            provider: 'grok',
            projectId: resolvedProjectId ?? undefined,
            url,
            updatedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
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
      if (!projectId) {
        const connection = await connectToGrokTab(options, 'https://grok.com/');
        const { client, targetId, shouldClose, host, port } = connection;
        try {
          await ensureMainSidebarOpen(client, { logPrefix: 'browser-rename' });
          const opened = await openHistoryDialog(client);
          if (!opened) {
            throw new Error('History dialog did not open');
          }
          await expandHistoryDialog(client);
          await closeHistoryHoverMenu(client, { logPrefix: 'browser-rename' });
          await renameConversationInHistoryDialog(client, conversationId, newTitle);
        } finally {
          await closeHistoryDialog(client);
          await client.close();
          if (shouldClose && targetId) {
            await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
          }
        }
        return;
      }

      const targetUrl = `https://grok.com/project/${projectId}?chat=${conversationId}`;

      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);

      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        if (!(await isValidConversationUrl(client))) {
          throw new Error('Conversation URL is invalid or missing.');
        }
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await closeHistoryHoverMenu(client, { logPrefix: 'browser-rename' });
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
                const dialog =
                  document.querySelector('[role="dialog"]') ||
                  document.querySelector('dialog') ||
                  document.querySelector('[aria-modal="true"]');
                const sidebar =
                  document.querySelector('nav') ||
                  document.querySelector('aside') ||
                  document.querySelector('.group\\\\/sidebar-wrapper');
                const roots = [];
                if (preferDialog) {
                  if (dialog) {
                    roots.push(dialog);
                  } else {
                    return { success: false, error: 'History dialog not found', logs };
                  }
                }
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
                const matchedItems = [];
                for (const selector of selectors) {
                  matchedItems.push(...Array.from(root.querySelectorAll(selector)));
                }
                if (root !== document) {
                  for (const selector of selectors) {
                    matchedItems.push(...Array.from(document.querySelectorAll(selector)));
                  }
                }
                if (matchedItems.length > 0) {
                  const preferred = matchedItems.find((candidate) => {
                    const candidateRow =
                      candidate.closest('div.grid') ||
                      candidate.closest('div[class*="rounded"]') ||
                      candidate.closest('div');
                    if (!candidateRow) return false;
                    const className = candidateRow.className || '';
                    return className.includes('grid') && className.includes('rounded');
                  });
                  item = preferred || matchedItems[0];
                }

                if (!item) {
                  log('Conversation item not found for selectors.');
                  return { success: false, logs };
                }
                log('Found item: ' + item.tagName);

                const row =
                  item.closest('div.grid') ||
                  item.closest('div[class*="rounded"]') ||
                  item.closest('li') ||
                  item.closest('div') ||
                  item.parentElement;
                log('Found row: ' + (row ? row.className : 'null'));

                if (!row) throw new Error('Could not find row container for conversation');

                log('Triggering mouseover/mouseenter on row');
                row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                await new Promise(r => setTimeout(r, 500));

                const visibleRect = (el) => {
                  const rect = el.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0 ? rect : null;
                };
                const rowRect = visibleRect(row);
                const distanceToRow = (rect) => {
                  if (!rowRect) return 0;
                  const dx = Math.abs(rect.x - rowRect.x);
                  const dy = Math.abs(rect.y - rowRect.y);
                  return dx + dy;
                };

                log('Searching for rename button');
                const renameCandidates = Array.from(root.querySelectorAll('button[aria-label="Rename"]'));
                const renameButtons = renameCandidates.filter((btn) => visibleRect(btn));
                let renameBtn = renameButtons.find((btn) => row.contains(btn)) || null;
                if (!renameBtn && renameButtons.length > 0 && rowRect) {
                  renameBtn = renameButtons
                    .map((btn) => ({ btn, rect: visibleRect(btn) }))
                    .filter((entry) => entry.rect)
                    .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0]?.btn || null;
                }
                if (!renameBtn) {
                  const hiddenCandidate = renameCandidates.find((btn) => row.contains(btn));
                  if (hiddenCandidate) {
                    hiddenCandidate.classList.remove('hidden');
                    hiddenCandidate.style.display = 'flex';
                    hiddenCandidate.style.opacity = '1';
                    hiddenCandidate.style.pointerEvents = 'auto';
                    renameBtn = hiddenCandidate;
                  }
                }
                if (!renameBtn) {
                  log('Rename button not found. Attempting menu fallback.');
                  let menuBtn = row.querySelector('button[aria-label*="option" i], button[aria-label*="menu" i], [aria-haspopup="menu"]');
                  if (!menuBtn) {
                    const ellipsis = row.querySelector('svg.lucide-ellipsis');
                    if (ellipsis) {
                      menuBtn = ellipsis.closest('button');
                    }
                  }
                  if (!menuBtn) {
                    throw new Error('Menu button not found for conversation');
                  }
                  menuBtn.click();
                  await new Promise(r => setTimeout(r, 800));
                  const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], button, a'));
                  renameBtn = menuItems.find(el => (el.textContent || '').toLowerCase().includes('rename')) || null;
                  if (!renameBtn) {
                    throw new Error('Rename option not found in menu');
                  }
                }
                log('Clicking rename button');
                renameBtn.click();
                await new Promise(r => setTimeout(r, 600));

                const inputs = Array.from(root.querySelectorAll('input, [contenteditable="true"]'));
                const visibleInputs = inputs.filter((el) => visibleRect(el));
                const active = document.activeElement;
                let input =
                  (active && (active.tagName === 'INPUT' || active.getAttribute('contenteditable') === 'true'))
                    ? active
                    : null;
                if (!input) {
                  input =
                    visibleInputs.find((el) => row.contains(el)) ||
                    (rowRect
                      ? visibleInputs
                          .map((el) => ({ el, rect: visibleRect(el) }))
                          .filter((entry) => entry.rect)
                          .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0]?.el
                      : null);
                }
                if (!input) {
                  log('Rename input/contenteditable not found in row after clicking rename');
                  throw new Error('Rename input not found');
                }
                log('Found input: ' + input.tagName);

                if (input.tagName === 'INPUT') {
                  input.focus();
                  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                  if (setter) {
                    setter.call(input, newTitle);
                  } else {
                    input.value = newTitle;
                  }
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  input.focus();
                  input.textContent = newTitle;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                const saveButtons = Array.from(root.querySelectorAll('button[aria-label="Save"]')).filter((button) => visibleRect(button));
                const saveButton =
                  saveButtons.find((button) => row.contains(button)) ||
                  (rowRect
                    ? saveButtons
                        .map((button) => ({ button, rect: visibleRect(button) }))
                        .filter((entry) => entry.rect)
                        .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0]?.button
                    : null);
                if (saveButton) {
                  saveButton.click();
                  await new Promise(r => setTimeout(r, 600));
                }

                log('Submitting with Enter');
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
                await new Promise(r => setTimeout(r, 1000));

                const titleNode = row.querySelector('span.truncate') || row.querySelector('span');
                const currentTitle = (titleNode?.textContent || '').trim();
                if (currentTitle && currentTitle !== newTitle.trim()) {
                  return { success: false, error: 'Rename did not apply (saw "' + currentTitle + '")', logs };
                }

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
              error: `JS Exception: ${evalResult.exceptionDetails.exception?.description}`,
              logs: [],
            };
          }
          return evalResult.result?.value || { success: false, error: 'Empty result from browser', logs: [] };
        };

        let info;
        info = await performRename(false);
        if (!info || !info.success) {
          const opened = await openHistoryDialog(client);
          if (opened) {
            await expandHistoryDialog(client);
            await closeHistoryHoverMenu(client, { logPrefix: 'browser-rename' });
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
    },

    async deleteConversation(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-delete' });
        const opened = await openHistoryDialog(client);
        if (!opened) {
          throw new Error('History dialog did not open');
        }
        await expandHistoryDialog(client);
        await closeHistoryHoverMenu(client, { logPrefix: 'browser-delete' });
        await deleteConversationInHistoryDialog(client, conversationId);
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async renameProject(
      projectId: string,
      newTitle: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Rename', { logPrefix: 'browser-rename-project' });

        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const projectId = ${JSON.stringify(projectId)};
            const newTitle = ${JSON.stringify(newTitle)};
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-rename-project] ' + msg);
            };

            const linkSelectors = [
              'a[href="/project/' + projectId + '"]',
              'a[href*="/project/' + projectId + '"]',
            ];
            let projectLink = null;
            for (let attempt = 0; attempt < 10; attempt += 1) {
              for (const selector of linkSelectors) {
                projectLink = document.querySelector(selector);
                if (projectLink) break;
              }
              if (projectLink) break;
              await new Promise(r => setTimeout(r, 400));
            }

            if (!projectLink) {
              log('Project link not found for id: ' + projectId);
            }

            const row = projectLink || null;
            if (row) {
              row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              await new Promise(r => setTimeout(r, 400));
            }

            await new Promise(r => setTimeout(r, 400));

            const active = document.activeElement;
            let input =
              (active && (active.tagName === 'INPUT' || active.getAttribute('contenteditable') === 'true')) ? active : null;
            if (!input) {
              input = Array.from(document.querySelectorAll('input[aria-label]')).find((candidate) => {
                const label = (candidate.getAttribute('aria-label') || '').toLowerCase();
                if (label !== 'project name') return false;
                const rect = candidate.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              }) || null;
            }
            if (!input) {
              input = document.querySelector('input, [contenteditable="true"]');
            }
            if (!input) {
              return { success: false, error: 'Rename input not found', logs };
            }

            if (input.tagName === 'INPUT') {
              input.focus();
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (setter) {
                setter.call(input, newTitle);
              } else {
                input.value = newTitle;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              input.focus();
              input.textContent = newTitle;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }

            log('Submitting rename');
            input.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
            );
            input.dispatchEvent(
              new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
            );

            const form = input.closest('form');
            if (form && typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else if (form) {
              form.submit();
            }

            const scoped = input.closest('div,header,section') || document;
            const saveButton = Array.from(scoped.querySelectorAll('button[type="submit"][aria-label="Save"]')).find((button) => {
              const rect = button.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }) || null;
            if (saveButton) {
              saveButton.click();
            }

            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });

        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Rename project failed');
        }
        const closed = await waitForNotSelector(client.Runtime, 'input[aria-label="Project name"]', 3000);
        if (!closed) {
          throw new Error('Project rename stayed in edit mode');
        }
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async cloneProject(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Clone', { logPrefix: 'browser-clone-project' });
        await waitForNotSelector(client.Runtime, '[role="menuitem"], [data-radix-collection-item]', 2000);
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async openProjectMenu(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuButton(client, { logPrefix: 'browser-open-project-menu' });
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async selectRenameProjectItem(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Rename', { logPrefix: 'browser-select-rename-project' });
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async selectCloneProjectItem(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Clone', { logPrefix: 'browser-select-clone-project' });
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async selectRemoveProjectItem(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Remove', { logPrefix: 'browser-select-remove-project' });
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async pushProjectRemoveConfirmation(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const maxAttempts = 3;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            await waitForDocumentReady(client, 10_000);
            await ensureMainSidebarOpen(client, { logPrefix: 'browser-remove-project' });
            await closeHistoryHoverMenu(client, { logPrefix: 'browser-remove-project' });
            await ensureSidebarOpen(client);
            await openProjectMenuAndSelect(client, 'Remove', { logPrefix: 'browser-remove-project' });
            await waitForProjectRemoveDialog(client, 5_000);
            await clickProjectRemoveConfirmation(client, { logPrefix: 'browser-remove-project' });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('Execution context was destroyed')) {
              throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        if (lastError) {
          throw lastError;
        }
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async validateProjectUrl(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokTab(options);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `location.href`,
          returnByValue: true,
        });
        const href = typeof result?.value === 'string' ? result.value : '';
        if (href.includes(`/project/${projectId}`)) {
          if (!(await isValidProjectUrl(client))) {
            throw new Error('Project URL is invalid or points to a deleted project.');
          }
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async validateConversationUrl(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const targetUrl = projectId
        ? `https://grok.com/project/${projectId}?chat=${conversationId}`
        : `https://grok.com/c/${conversationId}`;
      const connection = await connectToGrokTab(options);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `location.href`,
          returnByValue: true,
        });
        const href = typeof result?.value === 'string' ? result.value : '';
        if (href.includes(targetUrl)) {
          if (!(await isValidConversationUrl(client))) {
            throw new Error('Conversation URL is invalid or missing.');
          }
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async openCreateProjectModal(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-project-create' });
        const pressed = await pressButton(client.Runtime, {
          match: { exact: ['create new project'] },
          rootSelectors: ['div.group\\\\/sidebar-wrapper', '[data-sidebar="sidebar"]', 'nav', 'aside'],
          timeoutMs: 5000,
        });
        if (!pressed.ok) {
          throw new Error(pressed.reason || 'Create project modal not opened');
        }
        const ready = await waitForSelector(
          client.Runtime,
          'input[placeholder*="project name" i]',
          5000,
        );
        if (!ready) {
          throw new Error('Create project modal did not render');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async setCreateProjectFields(
      fields: { name?: string; instructions?: string; modelLabel?: string },
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await waitForSelector(
          client.Runtime,
          'input[placeholder*="project name" i], textarea[placeholder*="instruction" i]',
          5000,
        );
        if (fields.name) {
          const evalResult = await client.Runtime.evaluate({
            expression: `(async () => {
              const logs = [];
              const log = (msg) => {
                logs.push(msg);
                console.log('[browser-project-create] ' + msg);
              };

              const nameValue = ${JSON.stringify(fields.name ?? '')};
              if (!nameValue) {
                return { success: true, logs };
              }
              const input = Array.from(document.querySelectorAll('input[placeholder]'))
                .find((el) => (el.getAttribute('placeholder') || '').toLowerCase().includes('project name')) || null;
              if (!input) {
                return { success: false, error: 'Project name input not found', logs };
              }
              input.focus();
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (setter) {
                setter.call(input, nameValue);
              } else {
                input.value = nameValue;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return { success: true, logs };
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });
          if (evalResult.exceptionDetails) {
            throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
          }
          const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
          if (!info?.success) {
            throw new Error(info?.error || 'Create project name failed');
          }
        }

        await resolveProjectInstructionsModal(client, {
          serviceId: 'grok',
          text: fields.instructions,
          modelLabel: fields.modelLabel,
        });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectNext(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-project-create] ' + msg);
            };
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextBtn = buttons.find((button) => (button.textContent || '').trim().toLowerCase() === 'next') || null;
            if (!nextBtn) {
              return { success: false, error: 'Next button not found', logs };
            }
            nextBtn.click();
            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Create project next failed');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectAttach(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-project-create] ' + msg);
            };
            const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
            const attachBtn = buttons.find((button) => (button.getAttribute('aria-label') || '').toLowerCase() === 'attach') || null;
            if (!attachBtn) {
              return { success: false, error: 'Attach button not found', logs };
            }
            attachBtn.click();
            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Create project attach failed');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectUploadFile(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-project-create] ' + msg);
            };
            const items = Array.from(document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]'));
            const uploadItem = items.find((item) => (item.textContent || '').trim().toLowerCase() === 'upload a file') || null;
            if (!uploadItem) {
              return { success: false, error: 'Upload file menu item not found', logs };
            }
            uploadItem.click();
            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Create project upload failed');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectConfirm(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-project-create] ' + msg);
            };
            const buttons = Array.from(document.querySelectorAll('button'));
            const createBtn = buttons.find((button) => (button.textContent || '').trim().toLowerCase() === 'create') || null;
            if (!createBtn) {
              return { success: false, error: 'Create button not found', logs };
            }
            createBtn.click();
            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Create project confirm failed');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async toggleProjectSidebar(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickProjectSidebarToggle(client, { logPrefix: 'browser-toggle-project-sidebar' });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async toggleMainSidebar(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickMainSidebarToggle(client, { logPrefix: 'browser-toggle-main-sidebar' });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickHistoryItem(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickHistoryMenuItem(client, { logPrefix: 'browser-history-item' });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickHistorySeeAll(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickHistorySeeAll(client, { logPrefix: 'browser-history-see-all' });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickChatArea(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, 'https://grok.com/');
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickChatArea(client, { logPrefix: 'browser-chat-area' });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async updateProjectInstructions(
      projectId: string,
      instructions: string,
      options?: BrowserProviderListOptions,
      modelLabel?: string,
    ): Promise<void> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await ensureProjectSidebarOpen(client);
        await closeHistoryDialog(client);
        await pushProjectInstructionsEditButton(client);
        await resolveProjectInstructionsModal(client, {
          text: instructions,
          modelLabel,
          serviceId: 'grok',
        });

        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const logs = [];
            const log = (msg) => {
              logs.push(msg);
              console.log('[browser-project-instructions] ' + msg);
            };

            const visible = (el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };

            const findSaveButton = () =>
              Array.from(document.querySelectorAll('button'))
                .filter(visible)
                .find((button) => (button.textContent || '').trim().toLowerCase() === 'save') || null;

            let saveButton = null;
            for (let attempt = 0; attempt < 12; attempt += 1) {
              saveButton = findSaveButton();
              if (saveButton && !saveButton.disabled) break;
              await new Promise(r => setTimeout(r, 250));
            }

            if (!saveButton) {
              return { success: false, error: 'Save button not found', logs };
            }

            if (saveButton.disabled) {
              return { success: false, error: 'Save button is disabled', logs };
            }

            saveButton.click();
            await new Promise(r => setTimeout(r, 800));

            const nextSave = findSaveButton();
            if (nextSave && !nextSave.disabled) {
              return { success: false, error: 'Save did not apply', logs };
            }

            return { success: true, logs };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });

        if (evalResult.exceptionDetails) {
          throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
        }
        const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
        if (!info?.success) {
          throw new Error(info?.error || 'Update instructions failed');
        }
        await waitForNotSelector(client.Runtime, '[role="dialog"]', 5000);
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async getProjectInstructions(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<{ text: string; model?: string | null }> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await ensureProjectSidebarOpen(client);
        await closeHistoryDialog(client);
        await pushProjectInstructionsEditButton(client);
        const info = await resolveProjectInstructionsModal(client, {
          serviceId: 'grok',
        });
        return { text: info.text, model: info.model };
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    }

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
  if (options?.tabTargetId && port) {
    const client = await CDP({ host, port, target: options.tabTargetId });
    await Promise.all([client.Page.enable(), client.Runtime.enable()]);
    return {
      client,
      targetId: options.tabTargetId,
      shouldClose: false,
      host,
      port,
      usedExisting: true,
    };
  }
  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'grok';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string } | null }>;
      })
    | undefined;
  const preferredUrl = urlOverride ?? options?.configuredUrl ?? 'https://grok.com/';
  if ((!port || !host) && serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: preferredUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    const resolvedPort = target.port ?? port;
    if (target.tab?.targetId && resolvedPort) {
      const client = await CDP({ host, port: resolvedPort, target: target.tab.targetId });
      await Promise.all([client.Page.enable(), client.Runtime.enable()]);
      return {
        client,
        targetId: target.tab.targetId,
        shouldClose: false,
        host,
        port: resolvedPort,
        usedExisting: true,
      };
    }
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
    throw new Error('Missing DevTools port. Launch a Grok browser session or set ORACLE_BROWSER_PORT.');
  }
  const resolvedPort = port;
  const targets = await CDP.List({ host, port: resolvedPort });
  const candidates = targets.filter((target) => target.type === 'page' && target.url?.includes('grok.com'));
  const preferred = preferredUrl
    ? candidates.find((target) => target.url?.includes(preferredUrl ?? ''))
    : undefined;
  let targetInfo = preferred;
  let shouldClose = false;
  let usedExisting = Boolean(targetInfo?.id);
  if (!targetInfo && preferredUrl) {
    const created = await CDP.New({ host, port: resolvedPort, url: preferredUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  } else if (!targetInfo) {
    targetInfo = candidates[0];
    usedExisting = Boolean(targetInfo?.id);
  }
  if (!targetInfo?.id) {
    const fallbackUrl = preferredUrl ?? 'https://grok.com/';
    const created = await CDP.New({ host, port: resolvedPort, url: fallbackUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  }
  if (!targetInfo?.id) {
    throw new Error('No grok.com tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port: resolvedPort, target: targetInfo });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId: targetInfo.id, shouldClose, host, port: resolvedPort, usedExisting };
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
  if (options?.tabTargetId && port) {
    const client = await CDP({ host, port, target: options.tabTargetId });
    await Promise.all([client.Page.enable(), client.Runtime.enable()]);
    return {
      client,
      targetId: options.tabTargetId,
      shouldClose: false,
      host,
      port,
      usedExisting: true,
    };
  }
  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'grok';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string } | null }>;
      })
    | undefined;
  if ((!port || !host) && serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: projectUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    const resolvedPort = target.port ?? port;
    if (target.tab?.targetId && resolvedPort) {
      const client = await CDP({ host, port: resolvedPort, target: target.tab.targetId });
      await Promise.all([client.Page.enable(), client.Runtime.enable()]);
      return {
        client,
        targetId: target.tab.targetId,
        shouldClose: false,
        host,
        port: resolvedPort,
        usedExisting: true,
      };
    }
  }
  if ((!port || !host) && options?.browserService) {
    const target = await options.browserService.resolveDevToolsTarget({
      host,
      port: port ?? undefined,
      ensurePort: true,
      launchUrl: projectUrl,
    });
    host = target.host ?? host;
    port = target.port ?? port;
  }
  if (!port) {
    throw new Error('Missing DevTools port. Launch a Grok browser session or set ORACLE_BROWSER_PORT.');
  }
  const resolvedPort = port;
  const targets = await CDP.List({ host, port: resolvedPort });
  const match = projectId
    ? targets.find(
        (target) => target.type === 'page' && target.url?.includes(`/project/${projectId}`),
      )
    : undefined;
  let targetInfo = match;
  let shouldClose = false;
  let usedExisting = Boolean(targetInfo?.id);
  if (!targetInfo?.id) {
    const created = await CDP.New({ host, port: resolvedPort, url: projectUrl });
    targetInfo = created ?? undefined;
    shouldClose = true;
    usedExisting = false;
  }
  if (!targetInfo?.id) {
    throw new Error('No grok.com project tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port: resolvedPort, target: targetInfo });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId: targetInfo.id, shouldClose, host, port: resolvedPort, usedExisting };
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
  await waitForDocumentReady(client, 15_000);
  if (!(await isValidProjectUrl(client))) {
    throw new Error('Project URL is invalid or points to a deleted project.');
  }
}

async function waitForDocumentReady(client: ChromeClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
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

export async function openProjectMenuButton(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-open-project-menu';
  await waitForSelector(
    client.Runtime,
    'button[aria-label="Open menu"], button[aria-label="Options"], button[aria-haspopup="menu"]',
    5000,
  );
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const findMenuButton = () => {
        const root =
          document.querySelector('div.group\\\\/sidebar-wrapper') ||
          document.querySelector('[data-sidebar="sidebar"]') ||
          document.body;
        const scopedButtons = Array.from(root.querySelectorAll('button[aria-label]')).filter(visible);
        const labeled = scopedButtons.find((button) => {
          const label = (button.getAttribute('aria-label') || '').toLowerCase();
          return label === 'open menu' || label === 'options';
        });
        if (labeled) return labeled;
        const menus = Array.from(root.querySelectorAll('button[aria-haspopup="menu"]')).filter(visible);
        const ellipsis = menus.find((button) => button.querySelector('svg.lucide-ellipsis'));
        if (ellipsis) return ellipsis;
        return (
          menus.find((button) => {
            const label = (button.getAttribute('aria-label') || button.textContent || '').toLowerCase();
            return label.includes('menu') || label.includes('options') || label.includes('more');
          }) || null
        );
      };

      const menuBtn = findMenuButton();

      if (!menuBtn) {
        const labels = Array.from(document.querySelectorAll('button[aria-label]'))
          .map((button) => button.getAttribute('aria-label'))
          .filter(Boolean)
          .slice(0, 12);
        return { success: false, error: 'Project menu button not found (labels: ' + labels.join(', ') + ')', logs };
      }

      menuBtn.scrollIntoView({ block: 'center', inline: 'center' });
      const pointerOpts = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 };
      menuBtn.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
      menuBtn.dispatchEvent(new MouseEvent('mousedown', pointerOpts));
      menuBtn.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
      menuBtn.dispatchEvent(new MouseEvent('mouseup', pointerOpts));
      menuBtn.dispatchEvent(new MouseEvent('click', pointerOpts));

      log('Project menu opened');
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Project menu button not found');
  }
  const opened = await waitForSelector(
    client.Runtime,
    '[role="menuitem"], [data-radix-collection-item]',
    3000,
  );
  if (!opened) {
    throw new Error('Project menu opened, but no menu items found');
  }
}

export async function clickProjectMenuItem(
  client: ChromeClient,
  label: string,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-project-menu-item';
  await waitForSelector(
    client.Runtime,
    '[role="menuitem"], [data-radix-collection-item]',
    3000,
  );
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const target = ${JSON.stringify(label)}.trim().toLowerCase();
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const findItem = () => {
        const items = Array.from(
          document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]')
        ).filter(visible);
        const match = items.find((el) => (el.textContent || '').trim().toLowerCase() === target);
        return { match, items };
      };

      const result = findItem();
      const match = result.match;
      const items = result.items;

      if (!match) {
        const labels = items.map((el) => (el.textContent || '').trim()).filter(Boolean).slice(0, 10);
        return { success: false, error: 'Menu item not found: ' + target + ' (items: ' + labels.join(', ') + ')', logs };
      }

      match.click();
      log('Clicked menu item: ' + target);
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || `Menu item not found: ${label}`);
  }
}

async function openProjectMenuAndSelect(
  client: ChromeClient,
  label: string,
  options?: { logPrefix?: string },
): Promise<void> {
  await openProjectMenuButton(client, options);
  await clickProjectMenuItem(client, label, options);
}

export async function clickProjectRemoveConfirmation(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-project-remove-confirm';
  await waitForDialog(client.Runtime, 5000, DEFAULT_DIALOG_SELECTORS);
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const findButton = () => {
        const dialog = document.querySelector('div[role="dialog"][data-state="open"]');
        const scope = dialog || document;
        const buttons = Array.from(scope.querySelectorAll('button')).filter(visible);
        const match = buttons.find((button) => {
          const text = (button.textContent || '').trim().toLowerCase();
          return text === 'delete project' || text === 'remove project';
        });
        return { match, buttons, dialog: Boolean(dialog) };
      };

      const result = findButton();
      const match = result.match;
      const buttons = result.buttons;
      const dialogFound = result.dialog;

      if (!match) {
        const labels = buttons
          .map((button) => (button.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 10);
        return {
          success: false,
          error:
            'Remove confirmation not found (dialog=' +
            dialogFound +
            ', buttons: ' +
            labels.join(', ') +
            ')',
          logs,
        };
      }

      match.click();
      log('Clicked delete project confirmation');
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Remove confirmation not found');
  }
}

export async function ensureProjectSidebarOpen(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-project-sidebar-open';
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      if (!location.pathname.includes('/project/')) {
        return { success: false, error: 'Not on a project page', logs };
      }

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const findButton = () => {
        const buttons = Array.from(document.querySelectorAll('button[aria-label]')).filter(visible);
        const collapse = buttons.find((button) =>
          (button.getAttribute('aria-label') || '').toLowerCase() === 'collapse side panel'
        );
        if (collapse) return { state: 'open', button: collapse };
        const expand = buttons.find((button) =>
          (button.getAttribute('aria-label') || '').toLowerCase() === 'expand side panel'
        );
        if (expand) return { state: 'closed', button: expand };
        return { state: 'unknown', button: null };
      };

      const info = findButton();
      if (info.state === 'open') {
        return { success: true, logs, clicked: false };
      }
      if (info.state === 'closed' && info.button) {
        info.button.click();
        return { success: true, logs, clicked: true };
      }

      return { success: false, error: 'Project sidebar toggle not found', logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string; clicked?: boolean } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Project sidebar did not open');
  }
  if (info.clicked) {
    const opened = await waitForSelector(client.Runtime, 'button[aria-label="Collapse side panel"]', 3000);
    if (!opened) {
      throw new Error('Project sidebar did not open');
    }
  }
}

async function waitForProjectRemoveDialog(
  client: ChromeClient,
  timeoutMs: number,
): Promise<boolean> {
  const opened = await waitForDialog(client.Runtime, timeoutMs, DEFAULT_DIALOG_SELECTORS);
  if (!opened) return false;
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"], dialog[open]');
      if (!dialog) return false;
      const text = (dialog.textContent || '').toLowerCase();
      return text.includes('delete project') || text.includes('are you sure');
    })()`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

export async function clickMainSidebarToggle(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const pressed = await pressButton(client.Runtime, {
    selector: 'button[data-sidebar="trigger"]',
    timeoutMs: 5000,
  });
  if (!pressed.ok) {
    const fallback = await pressButton(client.Runtime, {
      match: { exact: ['toggle sidebar'] },
      timeoutMs: 5000,
    });
    if (!fallback.ok) {
      throw new Error(fallback.reason || pressed.reason || 'Main sidebar toggle not found');
    }
  }
}

export async function ensureMainSidebarOpen(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  await waitForDocumentReady(client, 10_000);
  await waitForSelector(client.Runtime, 'button[data-sidebar="trigger"]', 10_000);
  if (await isMainSidebarOpen(client)) {
    return;
  }
  await clickMainSidebarToggle(client, options);
  await waitForSelector(
    client.Runtime,
    'button[data-sidebar="trigger"] svg.lucide-chevrons-right.rotate-180',
    3000,
  );
  if (!(await isMainSidebarOpen(client))) {
    throw new Error('Main sidebar did not open');
  }
}

export async function isMainSidebarOpen(client: ChromeClient): Promise<boolean> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const trigger = document.querySelector('button[data-sidebar="trigger"]');
      if (trigger) {
        const icon = trigger.querySelector('svg.lucide-chevrons-right');
        if (icon) {
          return icon.classList.contains('rotate-180');
        }
      }
      const sidebar = document.querySelector('div.z-20.bg-surface-base.border-r');
      if (!sidebar) return false;
      const rect = sidebar.getBoundingClientRect();
      return rect.width > 120 && rect.right > 40;
    })()`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

export async function isValidProjectUrl(client: ChromeClient): Promise<boolean> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const errorCard = document.querySelector('div.flex.flex-col.max-w-xl.text-center.items-center.justify-center');
      if (!errorCard) return true;
      const text = (errorCard.textContent || '').toLowerCase();
      if (text.includes('there was an issue finding id')) return false;
      if (text.includes('error') && text.includes('return home')) return false;
      return true;
    })()`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

export async function isValidConversationUrl(client: ChromeClient): Promise<boolean> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const errorCard = document.querySelector('div.flex.flex-col.max-w-xl.text-center.items-center.justify-center');
      if (!errorCard) return true;
      const text = (errorCard.textContent || '').toLowerCase();
      if (text.includes('page not found')) return false;
      if (text.includes('there was an error loading this page')) return false;
      if (text.includes('return to home')) return false;
      return true;
    })()`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

export async function closeHistoryHoverMenu(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-history-hover-close';
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      const dialog = document.querySelector('div[role=\"dialog\"][data-side]');
      if (!dialog) {
        return { success: true, logs };
      }
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      dialog.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      log('Closed history hover menu');
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'History hover menu did not close');
  }
}

export async function clickProjectSidebarToggle(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-project-sidebar-toggle';
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      if (!location.pathname.includes('/project/')) {
        log('Not on a project page; skipping project sidebar toggle.');
        return { success: true, logs };
      }

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      let match = null;
      const container =
        document.querySelector('div.absolute.start-3.top-3') ||
        document.querySelector('div.absolute.left-3.top-3') ||
        document.querySelector('[data-sidebar="sidebar"]');
      if (container) {
        const containerButtons = Array.from(container.querySelectorAll('button')).filter(visible);
        match =
          containerButtons.find((button) => {
            const label = (button.getAttribute('aria-label') || '').toLowerCase();
            return label === 'collapse side panel' || label === 'expand side panel';
          }) ||
          containerButtons.find((button) => {
            const label = (button.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('side panel');
          }) ||
          null;
      }
      if (!match) {
        const buttons = Array.from(document.querySelectorAll('button[aria-label]')).filter(visible);
        match = buttons.find((button) => {
          const label = (button.getAttribute('aria-label') || '').toLowerCase();
          return label === 'collapse side panel' || label === 'expand side panel';
        }) || buttons.find((button) => {
          const label = (button.getAttribute('aria-label') || '').toLowerCase();
          return label.includes('side panel');
        }) || null;
      }

      if (!match) {
        return { success: false, error: 'Project sidebar toggle not found', logs };
      }

      match.click();
      log('Toggled project sidebar');
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Project sidebar toggle not found');
  }
}

export async function clickHistoryMenuItem(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<boolean> {
  const result = await pressButton(client.Runtime, {
    match: { includeAny: ['history'] },
    timeoutMs: 3000,
  });
  if (result.ok) {
    return true;
  }
  await ensureMainSidebarOpen(client, { logPrefix: options?.logPrefix ?? 'browser-history-item' });
  const retry = await pressButton(client.Runtime, {
    match: { includeAny: ['history'] },
    timeoutMs: 3000,
  });
  return Boolean(retry.ok);
}

export async function clickHistorySeeAll(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const dialogSelectors = ['div[role="dialog"][data-state="open"]', '[role="dialog"][aria-modal="true"]', 'dialog[open]'];
  const first = await pressButton(client.Runtime, {
    match: { exact: ['see all', 'show all'] },
    rootSelectors: dialogSelectors,
    timeoutMs: 3000,
  });
  if (first.ok) {
    return;
  }
  await clickMainSidebarToggle(client, { logPrefix: options?.logPrefix ?? 'browser-history-see-all' });
  const retry = await pressButton(client.Runtime, {
    match: { exact: ['see all', 'show all'] },
    timeoutMs: 3000,
  });
  if (!retry.ok) {
    throw new Error(retry.reason || first.reason || 'History see-all not found');
  }
}

export async function clickChatArea(
  client: ChromeClient,
  options?: { logPrefix?: string },
): Promise<void> {
  const logPrefix = options?.logPrefix ?? 'browser-chat-area';
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[' + ${JSON.stringify(logPrefix)} + '] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const overlays = Array.from(
        document.querySelectorAll('div[data-aria-hidden="true"][aria-hidden="true"].fixed.inset-0')
      ).filter(visible);
      const target =
        overlays[0] ||
        Array.from(document.querySelectorAll('div.w-full.h-full.overflow-y-auto')).filter(visible)[0] ||
        null;
      if (!target) {
        return { success: false, error: 'Chat area not found', logs };
      }
      const opts = { bubbles: true, cancelable: true };
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));
      log('Clicked chat area');
      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Chat area not found');
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
  await waitForSelector(client.Runtime, 'a[href*="/c/"], [data-value^="conversation:"]', 5000);
}

async function renameConversationInHistoryDialog(
  client: ChromeClient,
  conversationId: string,
  newTitle: string,
): Promise<void> {
  const ready = await waitForSelector(
    client.Runtime,
    '[role="dialog"] a[href*="/c/"], [role="dialog"] [data-value^="conversation:"]',
    5000,
  );
  if (!ready) {
    throw new Error('History dialog did not render conversation rows');
  }

  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const chatId = ${JSON.stringify(conversationId)};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) {
        return { success: false, error: 'History dialog not found' };
      }

      const selectors = [
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
      ];
      let item = null;
      let itemSelector = null;
      for (const selector of selectors) {
        item = dialog.querySelector(selector);
        if (item) {
          itemSelector = selector;
          break;
        }
      }
      if (!item) {
        const link = dialog.querySelector('a.col-start-1.col-end-2.row-start-1.row-end-2[href*="/c/"]');
        if (link) {
          const href = link.getAttribute('href') || '';
          if (href.includes(chatId)) {
            item = link;
            itemSelector = 'a[href="/c/' + chatId + '"]';
          }
        }
      }
      if (!item || !itemSelector) {
        return { success: false, error: 'Conversation row not found in history dialog' };
      }

      const row =
        item.closest('div.grid') ||
        item.closest('div[class*="rounded"]') ||
        item.closest('li') ||
        item.closest('div') ||
        item.parentElement;
      if (!row) {
        return { success: false, error: 'Conversation row container not found' };
      }

      const target = item.tagName === 'A' ? item : row;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = target.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { success: false, error: 'Conversation row not visible' };
      }

      return { success: true, itemSelector };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as
    | { success: boolean; error?: string; itemSelector?: string }
    | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Rename flow failed');
  }

  if (!info.itemSelector) {
    throw new Error('Rename hover target missing');
  }

  const hoverResult = await hoverElement(client.Runtime, client.Input, {
    selector: info.itemSelector,
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    timeoutMs: 1500,
  });
  if (!hoverResult.ok) {
    throw new Error(hoverResult.reason || 'Rename hover failed');
  }

  const renameReady = await waitForSelector(
    client.Runtime,
    '[role="dialog"] button[aria-label="Rename"], [role="dialog"] button[aria-label*="rename" i]',
    1000,
  );
  if (!renameReady) {
    throw new Error('Rename button not found after hover');
  }

  const clickResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const selector = ${JSON.stringify(info.itemSelector)};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) return { success: false, error: 'History dialog not found' };
      const item = dialog.querySelector(selector);
      if (!item) return { success: false, error: 'Conversation row not found' };
      const row =
        item.closest('div.grid') ||
        item.closest('div[class*="rounded"]') ||
        item.closest('li') ||
        item.closest('div') ||
        item.parentElement;
      if (!row) return { success: false, error: 'Conversation row container not found' };

      const visibleRect = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? rect : null;
      };
      const rowRect = visibleRect(row);
      const distanceToRow = (rect) => {
        if (!rowRect) return 0;
        const dx = Math.abs(rect.x - rowRect.x);
        const dy = Math.abs(rect.y - rowRect.y);
        return dx + dy;
      };
      const candidates = [
        ...Array.from(row.querySelectorAll('button[aria-label="Rename"], button[aria-label*="rename" i]')),
        ...Array.from(dialog.querySelectorAll('button[aria-label="Rename"], button[aria-label*="rename" i]')),
      ].filter((btn, idx, arr) => arr.indexOf(btn) === idx);
      if (candidates.length === 0) {
        return { success: false, error: 'Rename button not found in row' };
      }
      const pickClosest = (items) => {
        if (!rowRect) return items[0] || null;
        return items
          .map((btn) => ({ btn, rect: visibleRect(btn) }))
          .filter((entry) => entry.rect)
          .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0]?.btn || null;
      };
      const renameBtn = candidates.find((btn) => row.contains(btn)) || pickClosest(candidates);
      if (!renameBtn) return { success: false, error: 'Rename button not found in row' };
      renameBtn.click();
      return { success: true };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (clickResult.exceptionDetails) {
    throw new Error(`JS Exception: ${clickResult.exceptionDetails.exception?.description}`);
  }
  const clickInfo = clickResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!clickInfo?.success) {
    throw new Error(clickInfo?.error || 'Rename click failed');
  }

  const inputReady = await waitForSelector(client.Runtime, 'input[aria-label="Rename"]', 3000);
  if (!inputReady) {
    throw new Error('Rename input not found');
  }

  const commitResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const value = ${JSON.stringify(newTitle)};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog') ||
        document;
      const input = dialog.querySelector('input[aria-label="Rename"]');
      if (!input) return { success: false, error: 'Rename input missing' };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      const saveCandidates = Array.from(dialog.querySelectorAll('button[aria-label="Save"]'));
      const saveBtn =
        saveCandidates.find((btn) => input.closest('div')?.contains(btn)) ||
        saveCandidates[0] ||
        null;
      if (saveBtn) saveBtn.click();
      return { success: true };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (commitResult.exceptionDetails) {
    throw new Error(`JS Exception: ${commitResult.exceptionDetails.exception?.description}`);
  }
  const commitInfo = commitResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!commitInfo?.success) {
    throw new Error(commitInfo?.error || 'Rename submit failed');
  }

  const closed = await waitForNotSelector(client.Runtime, 'input[aria-label="Rename"]', 3000);
  if (!closed) {
    throw new Error('Rename input did not close');
  }
}

async function deleteConversationInHistoryDialog(
  client: ChromeClient,
  conversationRef: string,
): Promise<void> {
  const ready = await waitForSelector(
    client.Runtime,
    '[role="dialog"] a[href*="/c/"], [role="dialog"] [data-value^="conversation:"]',
    5000,
  );
  if (!ready) {
    throw new Error('History dialog did not render conversation rows');
  }

  const evalResult = await client.Runtime.evaluate({
    expression: `(() => {
      const input = ${JSON.stringify(conversationRef)};
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) {
        return { success: false, error: 'History dialog not found' };
      }

      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const ignored = new Set(['new tab', 'rename', 'delete', 'hide conversation previews']);

      const extractTitle = (row) => {
        const titleNode =
          row.querySelector('[class*="line-clamp"]') ||
          row.querySelector('[class*="truncate"]') ||
          row.querySelector('span') ||
          row.querySelector('div');
        const candidate = normalize(titleNode?.textContent || row.textContent || '');
        if (!candidate) return '';
        const buttonLabels = Array.from(row.querySelectorAll('button')).map((btn) =>
          normalize(btn.getAttribute('aria-label') || btn.textContent || ''),
        );
        let cleaned = candidate;
        for (const label of buttonLabels) {
          if (!label) continue;
          cleaned = cleaned.replace(label, ' ');
        }
        for (const word of ignored) {
          cleaned = cleaned.replace(word, ' ');
        }
        return normalize(cleaned);
      };

      const anchors = Array.from(dialog.querySelectorAll('a[href*="/c/"]'));
      const rows = anchors
        .map((anchor) => {
          const row =
            anchor.closest('div.grid') ||
            anchor.closest('div[class*="rounded"]') ||
            anchor.closest('li') ||
            anchor.closest('div') ||
            anchor.parentElement;
          const href = anchor.getAttribute('href') || '';
          const match = href.match(/\\/c\\/([^/?#]+)/);
          const id = match?.[1] || '';
          return { anchor, row, id, title: row ? extractTitle(row) : '' };
        })
        .filter((entry) => Boolean(entry.row && entry.id));

      let itemSelector = null;
      if (isUuid) {
        const matched = rows.find((entry) => entry.id.toLowerCase() === input.toLowerCase());
        if (matched) {
          itemSelector = 'a[href="/c/' + matched.id + '"]';
        }
      } else {
        const desired = normalize(input);
        const matches = rows.filter((entry) => entry.title && entry.title === desired);
        if (matches.length === 1) {
          itemSelector = 'a[href="/c/' + matches[0].id + '"]';
        } else if (matches.length > 1) {
          return {
            success: false,
            error: 'Multiple conversations match name',
            matches: matches.map((entry) => ({ id: entry.id, title: entry.title })),
          };
        }
      }

      if (!itemSelector) {
        return {
          success: false,
          error: isUuid
            ? 'Conversation row not found in history dialog'
            : 'Conversation name not found in history dialog',
        };
      }

      return { success: true, itemSelector };
    })()`,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as
    | { success: boolean; error?: string; itemSelector?: string; matches?: Array<{ id: string; title: string }> }
    | undefined;
  if (!info?.success) {
    if (info?.matches?.length) {
      const summary = info.matches.map((match) => `${match.title} (${match.id})`).join(', ');
      throw new Error(`${info.error || 'Delete flow failed'}: ${summary}`);
    }
    throw new Error(info?.error || 'Delete flow failed');
  }
  if (!info.itemSelector) {
    throw new Error('Delete hover target missing');
  }

  const hoverResult = await hoverElement(client.Runtime, client.Input, {
    selector: info.itemSelector,
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    timeoutMs: 1500,
  });
  if (!hoverResult.ok) {
    throw new Error(hoverResult.reason || 'Delete hover failed');
  }

  const deleteReady = await waitForSelector(
    client.Runtime,
    '[role="dialog"] button[aria-label="Delete"], [role="dialog"] button[aria-label*="delete" i]',
    1000,
  );
  if (!deleteReady) {
    throw new Error('Delete button not found after hover');
  }

  const deleteClick = await client.Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(info.itemSelector)};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) return { success: false, error: 'History dialog not found' };
      const item = dialog.querySelector(selector);
      if (!item) return { success: false, error: 'Conversation row not found' };
      const row =
        item.closest('div.grid') ||
        item.closest('div[class*="rounded"]') ||
        item.closest('li') ||
        item.closest('div') ||
        item.parentElement;
      if (!row) return { success: false, error: 'Conversation row container not found' };

      const visibleRect = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? rect : null;
      };
      const rowRect = visibleRect(row);
      const distanceToRow = (rect) => {
        if (!rowRect) return 0;
        const dx = Math.abs(rect.x - rowRect.x);
        const dy = Math.abs(rect.y - rowRect.y);
        return dx + dy;
      };
      const candidates = [
        ...Array.from(row.querySelectorAll('button[aria-label="Delete"], button[aria-label*="delete" i]')),
        ...Array.from(dialog.querySelectorAll('button[aria-label="Delete"], button[aria-label*="delete" i]')),
      ].filter((btn, idx, arr) => arr.indexOf(btn) === idx);
      if (candidates.length === 0) {
        return { success: false, error: 'Delete button not found in row' };
      }
      const pickClosest = (items) => {
        if (!rowRect) return items[0] || null;
        return items
          .map((btn) => ({ btn, rect: visibleRect(btn) }))
          .filter((entry) => entry.rect)
          .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0]?.btn || null;
      };
      const deleteBtn = candidates.find((btn) => row.contains(btn)) || pickClosest(candidates);
      if (!deleteBtn) return { success: false, error: 'Delete button not found in row' };
      deleteBtn.click();
      return { success: true };
    })()`,
    returnByValue: true,
  });

  if (deleteClick.exceptionDetails) {
    throw new Error(`JS Exception: ${deleteClick.exceptionDetails.exception?.description}`);
  }
  const deleteInfo = deleteClick.result?.value as { success: boolean; error?: string } | undefined;
  if (!deleteInfo?.success) {
    throw new Error(deleteInfo?.error || 'Delete click failed');
  }

  const confirmReady = await waitForSelector(
    client.Runtime,
    '[role="dialog"] button',
    1000,
  );
  if (!confirmReady) {
    throw new Error('Delete confirmation not found');
  }

  const confirmResult = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) return { success: false, error: 'History dialog not found' };
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const candidates = buttons.filter((btn) => {
        const label = normalize(btn.getAttribute('aria-label'));
        const text = normalize(btn.textContent);
        return label === 'delete' || text === 'delete' || label.includes('delete') || text.includes('delete');
      });
      if (candidates.length === 0) {
        return { success: false, error: 'Delete confirmation not found' };
      }
      const confirm = candidates[candidates.length - 1];
      confirm.click();
      return { success: true };
    })()`,
    returnByValue: true,
  });

  if (confirmResult.exceptionDetails) {
    throw new Error(`JS Exception: ${confirmResult.exceptionDetails.exception?.description}`);
  }
  const confirmInfo = confirmResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!confirmInfo?.success) {
    throw new Error(confirmInfo?.error || 'Delete confirmation failed');
  }

  const deleted = await waitForNotSelector(
    client.Runtime,
    `[role="dialog"] ${info.itemSelector}`,
    4000,
  );
  if (!deleted) {
    throw new Error('Conversation row did not disappear after delete');
  }
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
      const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i);
      const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      let name = null;
      if (emailMatch) {
        const before = text.slice(0, emailMatch.index ?? 0).trim();
        const nameMatch = before.match(/([A-Za-z][A-Za-z'-]+(?:\\s+[A-Za-z][A-Za-z'-]+){0,3})$/);
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
    expression: `(() => Boolean(document.querySelector('nav') || document.querySelector('aside') || document.querySelector('.group\\\\/sidebar-wrapper')))()`,
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
  await waitForSelector(client.Runtime, 'nav, aside, .group\\\\/sidebar-wrapper', 3000);
}

async function expandHistoryDialog(client: ChromeClient): Promise<void> {
  await clickHistorySeeAll(client, { logPrefix: 'browser-history-expand' });
  await waitForSelector(
    client.Runtime,
    'div[role="dialog"] a[href*="/c/"], div[role="dialog"] [data-value^="conversation:"]',
    5000,
  );
}

export async function isHistoryDialogOpen(client: ChromeClient): Promise<boolean> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"], dialog[open]');
      if (!dialog) return false;
      const text = (dialog.textContent || '').toLowerCase();
      if (text.includes('show all')) return true;
      if (text.includes('history')) return true;
      const hasConversationLink = Boolean(dialog.querySelector('a[href*="/c/"], [data-value^="conversation:"]'));
      return hasConversationLink;
    })()`,
    returnByValue: true,
  });
  return Boolean(result?.value);
}

export async function waitForHistoryDialogOpen(
  client: ChromeClient,
  timeoutMs: number,
): Promise<boolean> {
  const opened = await waitForDialog(client.Runtime, timeoutMs, DEFAULT_DIALOG_SELECTORS);
  if (!opened) return false;
  return isHistoryDialogOpen(client);
}

async function openHistoryDialog(client: ChromeClient): Promise<boolean> {
  if (await isHistoryDialogOpen(client)) {
    return true;
  }

  await closeHistoryHoverMenu(client, { logPrefix: 'browser-history-open' });
  await ensureMainSidebarOpen(client, { logPrefix: 'browser-history-open' });

  const findAndClickHistory = async () => {
    const clicked = await clickHistoryMenuItem(client, { logPrefix: 'browser-history-open' });
    if (!clicked && process.env.ORACLE_DEBUG_GROK === '1') {
      console.log('[DEBUG] History button not found.');
    }
    return clicked;
  };

  if (await findAndClickHistory()) {
    const opened = await waitForDialog(client.Runtime, 10_000, DEFAULT_DIALOG_SELECTORS);
    if (opened) {
      await closeHistoryHoverMenu(client, { logPrefix: 'browser-history-open' });
    }
    return opened ? isHistoryDialogOpen(client) : false;
  }

  // Try opening the main sidebar/menu
  await clickMainSidebarToggle(client, { logPrefix: 'browser-history-open' });
  await waitForSelector(client.Runtime, '[aria-label="History"]', 3000);

  if (await findAndClickHistory()) {
    const opened = await waitForDialog(client.Runtime, 10_000, DEFAULT_DIALOG_SELECTORS);
    if (opened) {
      await closeHistoryHoverMenu(client, { logPrefix: 'browser-history-open' });
    }
    return opened ? isHistoryDialogOpen(client) : false;
  }

  return false;
}

export async function pushProjectInstructionsEditButton(
  client: ChromeClient,
): Promise<void> {
  const openDialog = await waitForSelector(
    client.Runtime,
    'div[role="dialog"][data-state="open"] textarea, dialog[open] textarea',
    1000,
  );
  if (openDialog) {
    return;
  }
  await waitForSelector(client.Runtime, 'button[aria-label*="Edit instructions" i]', 5000);
  const evalResult = await client.Runtime.evaluate({
    expression: `(async () => {
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[browser-project-instructions] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      if (!location.pathname.includes('/project/')) {
        return { success: false, error: 'Not on a project page', logs };
      }

      const root =
        document.querySelector('div.group\\\\/sidebar-wrapper') ||
        document.querySelector('[data-sidebar="sidebar"]') ||
        document.querySelector('main') ||
        document.body;
      if (!root) {
        return { success: false, error: 'Project root not found', logs };
      }

      const dialog = document.querySelector('[role="dialog"][data-state="open"], dialog[open]');
      const dialogHasTextarea = Boolean(dialog && dialog.querySelector('textarea'));
      if (dialogHasTextarea) {
        log('Instructions dialog already open');
        return { success: true, logs };
      }

      const editButton = Array.from(root.querySelectorAll('button[aria-label]'))
        .filter(visible)
        .find((button) => (button.getAttribute('aria-label') || '').toLowerCase().includes('edit instructions')) || null;
      if (!editButton) {
        const labels = Array.from(root.querySelectorAll('button[aria-label]'))
          .map((button) => button.getAttribute('aria-label'))
          .filter(Boolean)
          .slice(0, 12);
        return { success: false, error: 'Edit instructions button not found (labels: ' + labels.join(', ') + ')', logs };
      }

      editButton.click();

      return { success: true, logs };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as { success: boolean; error?: string } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Edit instructions button failed');
  }
  const ready = await waitForSelector(client.Runtime, 'textarea', 5000);
  if (!ready) {
    throw new Error('Instructions textarea not found');
  }
}

export async function resolveProjectInstructionsModal(
  client: ChromeClient,
  options: {
    text?: string;
    modelLabel?: string;
    serviceId: 'grok';
    inspectModels?: boolean;
  },
): Promise<{ text: string; model?: string | null }> {
  const registry = await ensureServicesRegistry();
  const expected = registry.services[options.serviceId]?.models?.map((model) => model.label) ?? [];
  let preopenedListId: string | null = null;
  if (options.modelLabel) {
    const preflight = await client.Runtime.evaluate({
      expression: `(async () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"], dialog[open]'));
        const dialogWithProjectName = dialogs.find((dialog) =>
          dialog.querySelector('input[placeholder*="Project name" i]'),
        );
        const dialogWithInstructions = dialogs.find((dialog) =>
          dialog.querySelector('textarea[placeholder*="instruction" i]') || dialog.querySelector('textarea'),
        );
        const root =
          dialogWithProjectName ||
          dialogWithInstructions ||
          document.querySelector('#model-select-trigger')?.closest('div[role="dialog"]') ||
          document.querySelector('[role="dialog"][data-state="open"]') ||
          document.querySelector('div.group\\\\/sidebar-wrapper') ||
          document.querySelector('main') ||
          document.body;
        if (!root) {
          return { success: false, error: 'Project instructions modal not found' };
        }
        const trigger =
          root.querySelector('#model-select-trigger') ||
          root.querySelector('button[aria-label="Model select"]') ||
          root.querySelector('button[data-slot="select-trigger"]') ||
          null;
        if (!trigger) {
          return { success: false, error: 'Model select trigger not found' };
        }
        try {
          trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        } catch {}
        trigger.click();
        return { success: true, listId: trigger.getAttribute('aria-controls') || '' };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (preflight.exceptionDetails) {
      throw new Error(`JS Exception: ${preflight.exceptionDetails.exception?.description}`);
    }
    const info = preflight.result?.value as { success: boolean; error?: string; listId?: string } | undefined;
    if (!info?.success) {
      throw new Error(info?.error || 'Project instructions modal preflight failed');
    }
    if (info.listId) {
      await waitForSelector(client.Runtime, `#${info.listId}`, 3000);
      preopenedListId = info.listId;
    } else {
      await waitForSelector(client.Runtime, '[role="listbox"]', 3000);
    }
  }

  const safeJson = (value: unknown) =>
    JSON.stringify(value)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

  const expression = `(async () => {
      const desiredText = ${safeJson(options.text ?? null)};
      const desiredModel = ${safeJson(options.modelLabel ?? null)};
      const expectedModels = ${safeJson(expected)};
      const preopenedListId = ${safeJson(preopenedListId)};
      const inspectModels = ${safeJson(options.inspectModels ?? false)};
      const logs = [];
      const log = (msg) => {
        logs.push(msg);
        console.log('[browser-project-instructions] ' + msg);
      };

      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"], dialog[open]'));
      const dialogWithProjectName = dialogs.find((dialog) =>
        dialog.querySelector('input[placeholder*="Project name" i]'),
      );
      const dialogWithInstructions = dialogs.find((dialog) =>
        dialog.querySelector('textarea[placeholder*="instruction" i]') || dialog.querySelector('textarea'),
      );
      const root =
        dialogWithProjectName ||
        dialogWithInstructions ||
        document.querySelector('#model-select-trigger')?.closest('div[role="dialog"]') ||
        document.querySelector('[role="dialog"][data-state="open"]') ||
        document.querySelector('div.group\\\\/sidebar-wrapper') ||
        document.querySelector('main') ||
        document.body;
      if (!root) {
        return { success: false, error: 'Project instructions modal not found', logs };
      }

      const trigger =
        root.querySelector('#model-select-trigger') ||
        root.querySelector('button[aria-label="Model select"]') ||
        root.querySelector('button[data-slot="select-trigger"]') ||
        null;

      const readSelectedModel = () => {
        if (!trigger) return null;
        const valueNode = trigger.querySelector('[data-slot="select-value"]');
        const text = (valueNode?.textContent || trigger.textContent || '').trim();
        return text || null;
      };

      const resolveListbox = () => {
        if (!trigger) return null;
        const listId = preopenedListId || trigger.getAttribute('aria-controls') || '';
        if (listId) {
          const byId = document.getElementById(listId);
          if (byId) return byId;
        }
        const listboxes = Array.from(document.querySelectorAll('[role="listbox"]'));
        if (listboxes.length === 0) return null;
        const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
        const desired = normalize(desiredModel || '');
        const expected = (expectedModels || []).map((label) => normalize(label)).filter(Boolean);
        const matchesExpected = (box) => {
          const labels = Array.from(
            box.querySelectorAll('[role="option"], [data-radix-collection-item], [data-slot="select-item"]'),
          )
            .map((el) => normalize(el.textContent || ''))
            .filter(Boolean);
          if (desired) {
            return labels.some((label) => label.startsWith(desired));
          }
          if (expected.length > 0) {
            return labels.some((label) => expected.some((expectedLabel) => label.startsWith(expectedLabel)));
          }
          return false;
        };
        return listboxes.find(matchesExpected) || listboxes[0];
      };

      const openModelMenu = async () => {
        if (!trigger) return [];
        if (trigger.getAttribute('aria-expanded') !== 'true') {
          try {
            trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
            trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          } catch {}
          trigger.click();
        }
        let listbox = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          listbox = resolveListbox();
          if (listbox) break;
          await new Promise(r => setTimeout(r, 150));
        }
        if (!listbox) return [];
        const viewport = listbox.querySelector('[data-radix-select-viewport]') || listbox;
        const scope = viewport || listbox;
        const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
        const items = Array.from(
          scope.querySelectorAll('[role="option"], [data-radix-collection-item], [data-slot="select-item"]'),
        )
          .map(el => normalize(el.textContent || ''))
          .filter(Boolean);
        return items;
      };

      const closeModelMenu = async () => {
        if (!trigger) return;
        const isExpanded = () => trigger.getAttribute('aria-expanded') === 'true';
        const listId = trigger.getAttribute('aria-controls') || '';
        const listboxExists = () =>
          (listId ? Boolean(document.getElementById(listId)) : Boolean(document.querySelector('[role="listbox"]')));
        if (isExpanded() || listboxExists()) {
          trigger.click();
          await new Promise(r => setTimeout(r, 200));
        }
      };

      let availableModels = [];
      if (trigger && (desiredModel || inspectModels)) {
        availableModels = await openModelMenu();
        if (desiredModel) {
          const listbox = resolveListbox();
          const viewport = listbox?.querySelector('[data-radix-select-viewport]') || listbox;
          const scope = viewport || listbox || document;
          const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
          const target = normalize(desiredModel || '');
          const match = Array.from(scope.querySelectorAll('[role="option"], [data-radix-collection-item], [data-slot="select-item"]'))
            .find(el => normalize(el.textContent || '').startsWith(target));
          if (match) {
            match.click();
            await new Promise(r => setTimeout(r, 300));
            const selectedNow = normalize(readSelectedModel() || '');
            if (selectedNow && target && !selectedNow.startsWith(target)) {
              return { success: false, error: 'Model selection did not update', logs };
            }
          } else {
            return { success: false, error: 'Model option not found', logs };
          }
        }
        await closeModelMenu();
      }

      let textarea = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        textarea =
          Array.from(root.querySelectorAll('textarea')).find(visible) ||
          Array.from(document.querySelectorAll('textarea')).find(visible) ||
          null;
        if (textarea) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (!textarea) {
        return { success: false, error: 'Instructions textarea not found', logs };
      }

      if (desiredText !== null) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(textarea, desiredText);
        } else {
          textarea.value = desiredText;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const text = textarea.value || '';
      const normalizeLabel = ${GROK_MODEL_LABEL_NORMALIZER};
      const model = normalizeLabel(readSelectedModel() || '') || null;

      return { success: true, text, model, availableModels, logs };
    })()`;
  if (process.env.ORACLE_DEBUG_GROK === '1') {
    console.log('[oracle] project instructions modal expression:\\n' + expression);
  }

  const evalResult = await client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evalResult.exceptionDetails) {
    throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
  }
  const info = evalResult.result?.value as {
    success: boolean;
    error?: string;
    text?: string;
    model?: string | null;
    availableModels?: string[];
  } | undefined;
  if (!info?.success) {
    throw new Error(info?.error || 'Project instructions modal failed');
  }

  const availableRaw = info.availableModels ?? [];
  const available = availableRaw.map((label) => {
    const normalized = normalizeGrokModelLabel(label);
    const match = expected.find((expectedLabel) =>
      normalized.toLowerCase().startsWith(expectedLabel.toLowerCase()),
    );
    return match ?? normalized;
  });
  if (expected.length > 0 && availableRaw.length > 0) {
    const missingInUi = expected.filter((label) => !available.some((item) => item.toLowerCase() === label.toLowerCase()));
    const missingInRegistry = available.filter(
      (label) => !expected.some((item) => item.toLowerCase() === label.toLowerCase()),
    );
    if (missingInUi.length > 0 || missingInRegistry.length > 0) {
      console.warn(
        `[oracle] Grok model list mismatch (missing in UI: ${missingInUi.join(', ') || 'none'}; missing in registry: ${missingInRegistry.join(', ') || 'none'})`,
      );
    }
  }

  return { text: info.text ?? '', model: info.model ?? null };
}


export async function closeHistoryDialog(client: ChromeClient): Promise<void> {
  if (!(await isHistoryDialogOpen(client))) {
    return;
  }
  await client.Runtime.evaluate({
    expression: `(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
      return true;
    })()`,
    returnByValue: true,
  });
  await waitForNotSelector(client.Runtime, '[role="dialog"]', 2000);
  if (await isHistoryDialogOpen(client)) {
    await clickChatArea(client, { logPrefix: 'browser-history-close' });
    await waitForNotSelector(client.Runtime, '[role="dialog"]', 2000);
  }
  if (await isHistoryDialogOpen(client)) {
    await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
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
