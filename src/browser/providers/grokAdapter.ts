import path from 'node:path';
import CDP from 'chrome-remote-interface';
import type { Project, Conversation, ConversationContext, FileRef } from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import type { ChromeClient } from '../types.js';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import {
  detectGrokSignedInIdentity,
  extractGrokIdentityFromSerializedScripts,
  normalizeGrokIdentityProbe,
  readGrokSerializedIdentityScriptsWithRetry,
  type GrokIdentityProbeResult,
} from './grokIdentity.js';
import {
  ensureServicesRegistry,
  resolveBundledServiceBaseUrl,
  resolveBundledServiceRouteTemplate,
  resolveServiceModelLabels,
} from '../../services/registry.js';
import { GROK_MODEL_LABEL_NORMALIZER, normalizeGrokModelLabel } from './grokModelMenu.js';
import { uploadGrokAttachments } from '../actions/grok.js';
import { transferAttachmentViaDataTransfer } from '../actions/attachmentDataTransfer.js';
import {
  clickRevealedRowAction,
  closeDialog,
  DEFAULT_DIALOG_SELECTORS,
  ensureCollapsibleExpanded,
  findAndClickByLabel,
  hoverElement,
  isDialogOpen,
  openAndSelectMenuItem,
  selectMenuItem,
  openAndSelectListbox,
  openMenu,
  openRevealedRowMenu,
  openRadixMenu,
  pressMenuButtonByAriaLabel,
  pressDialogButton,
  pressRowAction,
  pressButton,
  hoverRowAndClickAction,
  hoverAndReveal,
  navigateAndSettle,
  submitInlineRename,
  queryRowsByText,
  waitForDialog,
  waitForDocumentReady as waitForDocumentReadyUi,
  waitForNotSelector,
  waitForPredicate,
  waitForSelector,
  withUiDiagnostics,
} from '../service/ui.js';
import { cssClassContains } from '../service/selectors.js';

const GROK_SIDEBAR_WRAPPER_SELECTOR = `div${cssClassContains('group/sidebar-wrapper')}`;
const GROK_SIDEBAR_WRAPPER_MATCH = cssClassContains('group/sidebar-wrapper');
const GROK_MENU_BUTTON_SELECTOR = `a${cssClassContains('peer/menu-button')}`;
const GROK_MENU_ITEM_SELECTOR = `li${cssClassContains('group/menu-item')}`;
const GROK_ROUNDED_SELECTOR = `div${cssClassContains('rounded')}`;
const GROK_LINE_CLAMP_SELECTOR = cssClassContains('line-clamp');
const GROK_TRUNCATE_SELECTOR = cssClassContains('truncate');
const GROK_TITLE_SELECTOR = `${GROK_LINE_CLAMP_SELECTOR}, ${GROK_TRUNCATE_SELECTOR}`;
const GROK_TIME_SELECTOR = cssClassContains('time');
const GROK_TIMESTAMP_SELECTOR = cssClassContains('timestamp');
const GROK_SOURCES_CONTENT_SELECTOR = 'div[id*="content-sources"]';
const GROK_SOURCES_ROOT_SELECTOR = `${GROK_SOURCES_CONTENT_SELECTOR}, main`;
const GROK_ASSET_ROW_SELECTOR = `div${cssClassContains('group/asset-row')}`;
const GROK_SOURCES_FILES_ROW_SELECTOR = `div${cssClassContains('group/collapsible-row')}`;
const GROK_PROJECT_SOURCES_ATTACH_SELECTOR = `button[aria-label="Attach"]${cssClassContains('ms-[1px]')}`;
const GROK_PERSONAL_FILES_SEARCH_SELECTOR = 'input[placeholder*="Search"][placeholder*="files"], input[placeholder*="Search files"]';
const GROK_PERSONAL_FILES_ROW_SELECTOR = `div${cssClassContains('hover:bg-surface-l1')}${cssClassContains('group')}`;
const GROK_PERSONAL_FILES_MODAL_MARKER = 'data-oracle-personal-files-modal';
const GROK_HOME_URL = resolveBundledServiceBaseUrl('grok', 'https://grok.com/');
const GROK_FILES_URL = resolveBundledServiceRouteTemplate('grok', 'files', 'https://grok.com/files');
const GROK_PROJECTS_INDEX_URL = resolveBundledServiceRouteTemplate('grok', 'projectIndex', 'https://grok.com/project');
const GROK_PROJECT_URL_TEMPLATE = resolveBundledServiceRouteTemplate(
  'grok',
  'project',
  'https://grok.com/project/{projectId}',
);
const GROK_PROJECT_SOURCES_URL_TEMPLATE = resolveBundledServiceRouteTemplate(
  'grok',
  'projectSources',
  'https://grok.com/project/{projectId}?tab=sources',
);
const GROK_CONVERSATION_URL_TEMPLATE = resolveBundledServiceRouteTemplate(
  'grok',
  'conversation',
  'https://grok.com/c/{conversationId}',
);
const GROK_PROJECT_CONVERSATION_URL_TEMPLATE = resolveBundledServiceRouteTemplate(
  'grok',
  'projectConversation',
  'https://grok.com/project/{projectId}?chat={conversationId}',
);
const GROK_CREATE_PROJECT_DIALOG_SELECTOR = '[data-oracle-create-project-dialog="true"]';
const GROK_ACCOUNT_FILE_LINK_SELECTOR = 'a[href*="/files?file="], a[href*="?file="]';
const GROK_ACCOUNT_FILE_UPLOAD_INPUT_SELECTOR = 'main header input[type="file"]';
const GROK_GENERIC_CONVERSATION_TITLES = new Set([
  'chat',
  'new chat',
  'conversation',
  'new conversation',
  'grok',
  'untitled',
]);

type GrokProjectFileProbe = {
  name: string;
  size?: number;
};

type GrokAccountFileProbe = {
  id: string;
  name: string;
  remoteUrl?: string;
};

type GrokConversationFileProbe = {
  rowId?: string;
  rowIndex?: number;
  chipIndex?: number;
  name: string;
  fileTypeLabel?: string | null;
  remoteUrl?: string | null;
};

type GrokProjectLinkProbe = {
  id: string;
  name: string;
  url?: string | null;
};

type GrokMainSidebarProbe = {
  triggerDataState?: string | null;
  triggerAriaExpanded?: string | null;
  triggerIconRotated?: boolean | null;
  sidebarWidth?: number | null;
  sidebarRight?: number | null;
};

type ChromeClientWithFocusPolicy = ChromeClient & { __auracallSuppressFocus?: boolean };

function setClientSuppressFocus(client: ChromeClient, suppressFocus: boolean | undefined): void {
  (client as ChromeClientWithFocusPolicy).__auracallSuppressFocus = Boolean(suppressFocus);
}

function isClientFocusSuppressed(client: ChromeClient): boolean {
  return Boolean((client as ChromeClientWithFocusPolicy).__auracallSuppressFocus);
}

export function isGrokMainSidebarOpenProbe(probe: GrokMainSidebarProbe | null | undefined): boolean {
  if (!probe) {
    return false;
  }
  const triggerDataState = probe.triggerDataState?.trim().toLowerCase();
  if (triggerDataState === 'open') {
    return true;
  }
  const triggerAriaExpanded = probe.triggerAriaExpanded?.trim().toLowerCase();
  if (triggerAriaExpanded === 'true') {
    return true;
  }
  if (probe.triggerIconRotated) {
    return true;
  }
  return (probe.sidebarWidth ?? 0) > 120 && (probe.sidebarRight ?? 0) > 40;
}

export { normalizeGrokIdentityProbe, extractGrokIdentityFromSerializedScripts } from './grokIdentity.js';

function interpolateGrokRoute(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => params[key] ?? '');
}

export function resolveGrokProjectUrl(projectId: string): string {
  return interpolateGrokRoute(GROK_PROJECT_URL_TEMPLATE, { projectId });
}

export function resolveGrokProjectSourcesUrl(projectId: string): string {
  return interpolateGrokRoute(GROK_PROJECT_SOURCES_URL_TEMPLATE, { projectId });
}

export function resolveGrokConversationUrl(conversationId: string, projectId?: string | null): string {
  const cleanProjectId = typeof projectId === 'string' ? projectId.trim() : '';
  return cleanProjectId
    ? interpolateGrokRoute(GROK_PROJECT_CONVERSATION_URL_TEMPLATE, { projectId: cleanProjectId, conversationId })
    : interpolateGrokRoute(GROK_CONVERSATION_URL_TEMPLATE, { conversationId });
}

export function findGrokProjectByName(
  entries: GrokProjectLinkProbe[],
  projectName: string,
): GrokProjectLinkProbe | null {
  const normalizedTarget = projectName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedTarget) {
    return null;
  }
  return (
    entries.find((entry) => entry.name.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedTarget) ?? null
  );
}

export function parseGrokPersonalFilesRowTexts(rowTexts: string[]): GrokProjectFileProbe[] {
  const files: GrokProjectFileProbe[] = [];
  for (const rawText of rowTexts) {
    const text = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)\s*$/i);
    let size: number | undefined;
    let name = text;
    if (sizeMatch) {
      const amount = Number.parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toLowerCase();
      if (Number.isFinite(amount)) {
        const multiplier = unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1;
        size = Math.round(amount * multiplier);
      }
      name = text.slice(0, sizeMatch.index).trim();
    }
    if (!name) {
      continue;
    }
    files.push({ name, size });
  }
  return files;
}

export function extractGrokAccountFileIdFromUrl(url: string | null | undefined): string | null {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, GROK_FILES_URL);
    const fileId = parsed.searchParams.get('file');
    return fileId?.trim() || null;
  } catch {
    return null;
  }
}

export function extractGrokProjectIdFromUrl(url: string | null | undefined): string | null {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) {
    return null;
  }
  const match = value.match(/\/project\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function mapGrokConversationFileProbes(
  conversationId: string,
  probes: GrokConversationFileProbe[] | null | undefined,
): FileRef[] {
  const cleanConversationId = String(conversationId || '').trim();
  if (!cleanConversationId || !Array.isArray(probes) || probes.length === 0) {
    return [];
  }
  const deduped = new Map<string, FileRef>();
  for (const probe of probes) {
    const name = typeof probe?.name === 'string' ? probe.name.trim() : '';
    if (!name) {
      continue;
    }
    const rowId = typeof probe?.rowId === 'string' ? probe.rowId.trim() : '';
    const rowIndex = Number.isFinite(probe?.rowIndex) ? Number(probe?.rowIndex) : -1;
    const chipIndex = Number.isFinite(probe?.chipIndex) ? Number(probe?.chipIndex) : 0;
    const uniqueKey = `${rowId || `row-${rowIndex}`}:${chipIndex}:${name}`;
    if (deduped.has(uniqueKey)) {
      continue;
    }
    const fileTypeLabel =
      typeof probe?.fileTypeLabel === 'string' && probe.fileTypeLabel.trim().length > 0
        ? probe.fileTypeLabel.trim()
        : null;
    const remoteUrl =
      typeof probe?.remoteUrl === 'string' && probe.remoteUrl.trim().length > 0 ? probe.remoteUrl.trim() : undefined;
    deduped.set(uniqueKey, {
      id: `grok-conversation-file:${cleanConversationId}:${uniqueKey}`,
      name,
      provider: 'grok',
      source: 'conversation',
      remoteUrl,
      metadata: {
        conversationId: cleanConversationId,
        rowId: rowId || null,
        rowIndex: rowIndex >= 0 ? rowIndex : null,
        chipIndex,
        fileTypeLabel,
      },
    });
  }
  return Array.from(deduped.values());
}

export function grokUrlMatchesPreference(
  candidateUrl: string | null | undefined,
  preferredUrl: string | null | undefined,
): boolean {
  const candidateValue = typeof candidateUrl === 'string' ? candidateUrl.trim() : '';
  const preferredValue = typeof preferredUrl === 'string' ? preferredUrl.trim() : '';
  if (!candidateValue || !preferredValue) {
    return false;
  }
  try {
    const candidate = new URL(candidateValue);
    const preferred = new URL(preferredValue);
    if (candidate.host !== preferred.host) {
      return false;
    }
    const preferredPath = normalizeGrokUrlPath(preferred.pathname);
    const candidatePath = normalizeGrokUrlPath(candidate.pathname);
    if (preferredPath === '/') {
      return true;
    }
    if (candidatePath !== preferredPath) {
      return false;
    }
    if (!preferred.search) {
      return true;
    }
    return normalizeGrokUrlSearch(candidate.searchParams) === normalizeGrokUrlSearch(preferred.searchParams);
  } catch {
    return candidateValue.includes(preferredValue);
  }
}

export function parseGrokWorkspaceCreateError(body: string | null | undefined): string | null {
  const raw = typeof body === 'string' ? body.trim() : '';
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const message =
      typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.error === 'string'
          ? parsed.error
          : '';
    const normalized = message.trim();
    return normalized || raw;
  } catch {
    return raw;
  }
}

function normalizeGrokConversationTitle(title: string | null | undefined): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function grokConversationTitleQuality(
  title: string | null | undefined,
  conversationId?: string | null | undefined,
): number {
  const normalized = normalizeGrokConversationTitle(title);
  const id = normalizeGrokConversationTitle(conversationId);
  if (!normalized) {
    return 0;
  }
  if (id && normalized === id) {
    return 0;
  }
  if (
    GROK_GENERIC_CONVERSATION_TITLES.has(normalized) ||
    /^(new )?(chat|conversation)( \d+)?$/.test(normalized)
  ) {
    return 1;
  }
  let score = 2;
  if (/\s/.test(normalized)) {
    score += 1;
  }
  if (normalized.length >= 12) {
    score += 1;
  }
  return score;
}

function grokConversationTimestampValue(value: string | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function choosePreferredGrokConversation(
  existing: Conversation | null | undefined,
  candidate: Conversation,
): Conversation {
  if (!existing) {
    return candidate;
  }
  const existingQuality = grokConversationTitleQuality(existing.title, existing.id);
  const candidateQuality = grokConversationTitleQuality(candidate.title, candidate.id);
  if (candidateQuality !== existingQuality) {
    return candidateQuality > existingQuality ? candidate : existing;
  }
  const existingTimestamp = grokConversationTimestampValue(existing.updatedAt);
  const candidateTimestamp = grokConversationTimestampValue(candidate.updatedAt);
  if (candidateTimestamp !== existingTimestamp) {
    return candidateTimestamp > existingTimestamp ? candidate : existing;
  }
  const existingHasUrl = Boolean(existing.url);
  const candidateHasUrl = Boolean(candidate.url);
  if (candidateHasUrl !== existingHasUrl) {
    return candidateHasUrl ? candidate : existing;
  }
  return candidate;
}

export async function ensureGrokTabVisible(
  client: ChromeClient,
  options?: { timeoutMs?: number },
): Promise<void> {
  if (isClientFocusSuppressed(client)) {
    return;
  }
  await client.Page.bringToFront().catch(() => undefined);
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visibilityState = document.visibilityState ?? null;
      if (visibilityState !== 'visible') {
        return null;
      }
      return {
        visibilityState,
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        href: location.href,
        title: document.title || null,
      };
    })()`,
    {
      timeoutMs: options?.timeoutMs ?? 5_000,
      description: 'visible Grok tab',
    },
  );
  if (ready.ok) {
    return;
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => ({
      visibilityState: document.visibilityState ?? null,
      hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
      href: location.href,
      title: document.title || null,
    }))()`,
    returnByValue: true,
  });
  const probe = result?.value as {
    visibilityState?: string | null;
    hasFocus?: boolean | null;
    href?: string | null;
    title?: string | null;
  } | undefined;
  throw new Error(
    `Grok tab did not become visible (visibility=${probe?.visibilityState ?? 'unknown'}, href=${probe?.href ?? 'unknown'})`,
  );
}

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
  | 'uploadCreateProjectFiles'
  | 'clickCreateProjectConfirm'
  | 'createProject'
  | 'toggleProjectSidebar'
  | 'toggleMainSidebar'
  | 'clickHistoryItem'
  | 'clickHistorySeeAll'
  | 'clickChatArea'
  | 'openProjectMenu'
  | 'updateProjectInstructions'
  | 'getProjectInstructions'
  | 'readConversationContext'
  | 'listConversationFiles'
  | 'listAccountFiles'
  | 'uploadAccountFiles'
  | 'deleteAccountFile'
  | 'uploadProjectFiles'
  | 'listProjectFiles'
  | 'deleteProjectFile'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
      files: true,
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const { client, targetId, shouldClose, host, port } = await connectToGrokTab(
        options,
        'https://grok.com/project',
      );
      try {
        const debug = process.env.AURACALL_DEBUG_GROK === '1';
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
        await openConversationList(client, resolvedProjectId);
      }
      try {
        const openConversations = await listOpenConversations(host, port, resolvedProjectId);
        let rootSidebarConversations: Conversation[] = [];
        if (resolvedProjectId) {
          const projectPageConversations = await listProjectPageConversations(client, resolvedProjectId);
          const merged = new Map<string, Conversation>();
          const mergeConversation = (entry: Conversation) => {
            merged.set(entry.id, choosePreferredGrokConversation(merged.get(entry.id), entry));
          };
          for (const entry of projectPageConversations) {
            mergeConversation(entry);
          }
          if (projectPageConversations.length === 0 && options?.includeHistory) {
            for (const entry of await listHistoryConversations(client, resolvedProjectId, options)) {
              mergeConversation(entry);
            }
          }
          for (const entry of openConversations) {
            mergeConversation(entry);
          }
          return Array.from(merged.values());
        }
        const includeHistory = Boolean(options?.includeHistory);
        let history: Conversation[] = [];
        await navigateToProject(client, GROK_HOME_URL);
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-root-conversations' });
        rootSidebarConversations = await listRootSidebarConversations(client);
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
            history = await listHistoryConversations(client, undefined, options);
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
              
              const baseSelector = projectId
                ? 'main a, main button, main [role="link"], main [role="button"], main [role="option"], main [data-href], main [data-url], main [data-value]'
                : 'a,button,[role="link"],[role="button"],[role="option"],[data-href],[data-url],[data-value]';
              const items = Array.from(document.querySelectorAll(baseSelector));
              const nodeDetails = items.slice(0, 10).map(n => ({
                tag: n.tagName,
                text: (n.textContent || '').trim().slice(0, 30),
                href: n.getAttribute('href'),
                dataValue: n.getAttribute('data-value') || n.dataset?.value
              }));
              
              for (const node of items) {
                if (projectId && node.closest(${JSON.stringify(GROK_SIDEBAR_WRAPPER_SELECTOR)})) {
                  continue;
                }
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
                const titleNode = row.querySelector(${JSON.stringify(GROK_TITLE_SELECTOR)});
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
        const mergeConversation = (entry: Conversation) => {
          merged.set(entry.id, choosePreferredGrokConversation(merged.get(entry.id), entry));
        };
        for (const entry of raw) {
          if (!entry || typeof entry !== 'object') continue;
          const record = entry as Record<string, unknown>;
          const id = typeof record.id === 'string' ? record.id : null;
          const title = typeof record.title === 'string' ? record.title : '';
          if (!id || !title) continue;
          const url = typeof record.url === 'string' ? record.url : undefined;
          const timestamp = typeof record.timestamp === 'number' ? record.timestamp : undefined;
          mergeConversation({
            id,
            title,
            provider: 'grok',
            projectId: resolvedProjectId ?? undefined,
            url,
            updatedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
          });
        }
        for (const entry of history) {
          mergeConversation(entry);
        }
        for (const entry of rootSidebarConversations) {
          mergeConversation(entry);
        }
        for (const entry of openConversations) {
          mergeConversation(entry);
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
        const status = await detectGrokSignedInIdentity(client.Runtime);
        let normalized = status.identity;
        if (!normalized && !status.guestAuthCta) {
          const serializedScripts = targetId
            ? await readGrokSerializedIdentityScriptsForTarget(host, port, targetId)
            : await readGrokSerializedIdentityScriptsWithRetry(client.Runtime);
          normalized = extractGrokIdentityFromSerializedScripts(serializedScripts);
        }
        if (!normalized) {
          if (status.guestAuthCta) {
            return null;
          }
          return await getIdentityFromSettingsMenu(client);
        }
        return normalized;
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
      const resolvedProjectId = projectId?.trim() || undefined;
      const projectUrl = resolvedProjectId
        ? `https://grok.com/project/${resolvedProjectId}`
        : undefined;
      const connection = projectUrl
        ? await connectToGrokProjectTab(options, resolvedProjectId ?? null, projectUrl)
        : await connectToGrokTab(options, GROK_HOME_URL);
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      try {
        let sidebarError: unknown;
        try {
          if (projectUrl) {
            if (!usedExisting) {
              await navigateToProject(client, projectUrl);
            }
            await ensureProjectPage(client, resolvedProjectId);
            await openConversationList(client, resolvedProjectId);
          }
          await renameConversationInSidebarList(client, conversationId, newTitle);
          if (projectUrl) {
            await navigateToProject(client, projectUrl);
            await ensureProjectPage(client, resolvedProjectId);
            await openConversationList(client, resolvedProjectId);
            await waitForGrokProjectConversationListTitle(client.Runtime, conversationId, newTitle);
          }
          return;
        } catch (error) {
          sidebarError = error;
        }
        await navigateToProject(client, GROK_HOME_URL);
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-rename' });
        const opened = await openHistoryDialog(client);
        if (!opened) {
          throw sidebarError instanceof Error ? sidebarError : new Error('History dialog did not open');
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
    },

    async deleteConversation(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const resolvedProjectId = projectId?.trim() || undefined;
      const projectUrl = resolvedProjectId
        ? `https://grok.com/project/${resolvedProjectId}`
        : undefined;
      const connection = projectUrl
        ? await connectToGrokProjectTab(options, resolvedProjectId ?? null, projectUrl)
        : await connectToGrokTab(options, GROK_HOME_URL);
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      try {
        let sidebarError: unknown;
        try {
          if (projectUrl) {
            if (!usedExisting) {
              await navigateToProject(client, projectUrl);
            }
            await ensureProjectPage(client, resolvedProjectId);
            await openConversationList(client, resolvedProjectId);
          }
          await deleteConversationFromSidebarList(client, conversationId);
          if (projectUrl) {
            await navigateToProject(client, projectUrl);
            await ensureProjectPage(client, resolvedProjectId);
            await openConversationList(client, resolvedProjectId);
            await waitForGrokConversationSidebarGone(client.Runtime, conversationId);
          }
          return;
        } catch (error) {
          sidebarError = error;
        }
        await navigateToProject(client, GROK_HOME_URL);
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-delete' });
        const opened = await openHistoryDialog(client);
        if (!opened) {
          throw sidebarError instanceof Error ? sidebarError : new Error('History dialog did not open');
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
      const projectUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, projectUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await navigateToProject(client, projectUrl);
        await closeHistoryDialog(client);
        await openProjectRenameEditor(client, {
          logPrefix: 'browser-rename-project',
          projectId,
        });
        await submitProjectRenameWithClient(client, newTitle);
        let applied = await waitForProjectRenameApplied(client, newTitle, 3_000);
        if (!applied.ok) {
          await navigateToProject(client, projectUrl);
          await closeHistoryDialog(client);
          await openProjectRenameEditor(client, {
            logPrefix: 'browser-rename-project-retry',
            projectId,
          });
          await submitProjectRenameWithClient(client, newTitle);
          applied = await waitForProjectRenameApplied(client, newTitle, 5_000);
        }
        if (!applied.ok) {
          const debug = await readProjectRenameDebug(client);
          throw new Error(
            `Project rename did not apply (current=${debug.current || 'n/a'}, visibleInput=${debug.visibleInput ? 'true' : 'false'})`,
          );
        }
        await navigateToProject(client, GROK_PROJECTS_INDEX_URL);
        await ensureSidebarOpen(client);
        const listed = await waitForProjectRenameAppliedInList(client.Runtime, projectId, newTitle, 5_000);
        if (!listed.ok) {
          throw new Error(`Project rename did not persist in project list for ${projectId}`);
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
    ): Promise<Project | null> {
      const targetUrl = `https://grok.com/project/${projectId}`;
      const connection = await connectToGrokProjectTab(options, projectId, targetUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      let created: Project | null = null;
      try {
        await navigateToProject(client, targetUrl);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        const sourceName = (await readProjectNameFromPage(client)) ?? `Project ${projectId}`;
        try {
          await navigateToProject(client, GROK_PROJECTS_INDEX_URL);
          await ensureSidebarOpen(client);
          await closeHistoryDialog(client);
          const { result: beforeResult } = await client.Runtime.evaluate({
            expression: 'location.href',
            returnByValue: true,
          });
          const beforeHref = typeof beforeResult?.value === 'string' ? beforeResult.value : '';
          await openProjectMenuAndSelect(client, 'Clone', {
            logPrefix: 'browser-clone-project',
            preferSidebarRow: true,
            projectId,
          });
          await waitForNotSelector(client.Runtime, '[role="menuitem"], [data-radix-collection-item]', 2000);
          const projectUrl = await waitForProjectUrl(client, 20_000, beforeHref);
          const match = projectUrl?.match(/\/project\/([^/?#]+)/);
          const name = await readProjectNameFromPage(client);
          if (match?.[1]) {
            created = {
              id: match[1],
              name: name ?? match[1],
              provider: 'grok',
              url: projectUrl ?? undefined,
            };
          }
        } catch (error) {
          if (!isMissingGrokCloneMenuError(error)) {
            throw error;
          }
          const cloneSeed = projectId.replace(/[^a-f]/gi, '').slice(0, 6).toLowerCase() || 'copy';
          const fallbackName = `${sourceName} Copy ${cloneSeed}`;
          await navigateToProject(client, GROK_PROJECTS_INDEX_URL);
          await ensureSidebarOpen(client);
          await closeHistoryDialog(client);
          await openCreateProjectModalWithClient(client);
          await setCreateProjectFieldsWithClient(client, { name: fallbackName });
          await clickCreateProjectNextWithClient(client);
          const { result: beforeResult } = await client.Runtime.evaluate({
            expression: 'location.href',
            returnByValue: true,
          });
          const beforeHref = typeof beforeResult?.value === 'string' ? beforeResult.value : '';
          await clickCreateProjectConfirmWithClient(client);
          const projectUrl = await waitForProjectUrl(client, 20_000, beforeHref);
          const match = projectUrl?.match(/\/project\/([^/?#]+)/);
          const name = await readProjectNameFromPage(client);
          if (match?.[1]) {
            created = {
              id: match[1],
              name: name ?? fallbackName,
              provider: 'grok',
              url: projectUrl ?? undefined,
            };
          }
        }
      } finally {
        await closeHistoryDialog(client);
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
      return created;
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
        await openProjectRenameEditor(client, {
          logPrefix: 'browser-select-rename-project',
          projectId,
        });
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
        await navigateToProject(client, GROK_PROJECTS_INDEX_URL);
        await ensureSidebarOpen(client);
        await closeHistoryDialog(client);
        await openProjectMenuAndSelect(client, 'Clone', {
          logPrefix: 'browser-select-clone-project',
          preferSidebarRow: true,
          projectId,
        });
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
        const menuSelector = await openProjectMenuButton(client, { logPrefix: 'browser-select-remove-project' });
        const clicked = await selectMenuItem(client.Runtime, {
          menuSelector,
          itemMatch: { exact: ['remove', 'delete'], includeAny: ['remove', 'delete'] },
          closeMenuAfter: true,
          timeoutMs: 3000,
        });
        if (!clicked) {
          throw new Error('Remove/Delete project menu item not found');
        }
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
            if (!(await isValidProjectUrl(client).catch(() => false))) {
              lastError = null;
              break;
            }
            await closeHistoryHoverMenu(client, { logPrefix: 'browser-remove-project' });
            let dialogOpen = await waitForProjectRemoveDialog(client, 1_000);
            if (!dialogOpen) {
              await navigateToProject(client, targetUrl);
              await closeHistoryHoverMenu(client, { logPrefix: 'browser-remove-project' });
              await ensureSidebarOpen(client);
              const menuSelector = await openProjectMenuButton(client, { logPrefix: 'browser-remove-project' });
              const clicked = await selectMenuItem(client.Runtime, {
                menuSelector,
                itemMatch: { exact: ['remove', 'delete'], includeAny: ['remove', 'delete'] },
                closeMenuAfter: true,
                timeoutMs: 3000,
              });
              if (!clicked) {
                throw new Error('Remove/Delete project menu item not found');
              }
              dialogOpen = await waitForProjectRemoveDialog(client, 5_000);
            }
            if (!dialogOpen) {
              throw new Error('Project remove dialog did not open');
            }
            await clickProjectRemoveConfirmation(client, { logPrefix: 'browser-remove-project' });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (!(await isValidProjectUrl(client).catch(() => false))) {
              lastError = null;
              break;
            }
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
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await ensureMainSidebarOpen(client, { logPrefix: 'browser-project-create' });
        const rootSelectors = [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside'];
        const tagResult = await client.Runtime.evaluate({
          expression: `(() => {
            const roots = ${JSON.stringify(rootSelectors)}
              .map((sel) => document.querySelector(sel))
              .filter(Boolean);
            const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const pickRoot = () => {
              for (const candidate of roots) {
                const count = candidate.querySelectorAll(
                  ${JSON.stringify(GROK_MENU_BUTTON_SELECTOR)},
                ).length;
                if (count > 0) return candidate;
              }
              return document;
            };
            const root = pickRoot();
            const links = Array.from(
              root.querySelectorAll(${JSON.stringify(GROK_MENU_BUTTON_SELECTOR)}),
            );
            const itemLink = links.find((link) => normalize(link.textContent || '').includes('projects')) || null;
            const item = itemLink
              ? itemLink.closest(${JSON.stringify(GROK_MENU_ITEM_SELECTOR)}) ||
                itemLink.parentElement
              : null;
            if (!item || !itemLink) {
              const labels = links.map((link) => normalize(link.textContent || '')).filter(Boolean).slice(0, 8);
              return { ok: false, reason: 'Projects menu item not found', labels };
            }
            item.setAttribute('data-oracle-projects-row', 'true');
            return { ok: true };
          })()`,
          returnByValue: true,
        });
        const tagInfo = tagResult.result?.value as { ok: boolean; reason?: string; labels?: string[] } | undefined;
        if (!tagInfo?.ok) {
          throw new Error(
            tagInfo?.reason || 'Create project modal not opened',
          );
        }

        let tagged = false;
        let lastReason = 'Create project button not revealed';
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const hoverResult = await hoverAndReveal(client.Runtime, client.Input, {
            rowSelector: '[data-oracle-projects-row="true"]',
            rootSelectors,
            timeoutMs: 1500,
          });
          if (!hoverResult.ok) {
            lastReason = hoverResult.reason || lastReason;
            await new Promise((resolve) => setTimeout(resolve, 150));
            continue;
          }
          const buttonTag = await client.Runtime.evaluate({
            expression: `(() => {
              const row = document.querySelector('[data-oracle-projects-row="true"]');
              if (!row) return { ok: false, reason: 'Projects row missing' };
              const button =
                row.querySelector('span.absolute button') ||
                row.querySelector('button.group-hover\\\\/menu-item\\\\:opacity-100') ||
                row.querySelector('button') ||
                row.querySelector('[role="button"]') ||
                null;
              if (!button) return { ok: false, reason: 'Create project button not found' };
              button.setAttribute('data-oracle-create-project', 'true');
              return { ok: true };
            })()`,
            returnByValue: true,
          });
          const buttonInfo = buttonTag.result?.value as { ok: boolean; reason?: string } | undefined;
          if (buttonInfo?.ok) {
            tagged = true;
            break;
          }
          lastReason = buttonInfo?.reason || lastReason;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        if (!tagged) {
          const debug = await client.Runtime.evaluate({
            expression: `(() => {
              const row = document.querySelector('[data-oracle-projects-row="true"]');
              return {
                rowFound: Boolean(row),
                html: row ? row.outerHTML.slice(0, 600) : null,
              };
            })()`,
            returnByValue: true,
          });
          const debugInfo = debug.result?.value as { rowFound?: boolean; html?: string | null } | undefined;
          throw new Error(`${lastReason || 'Create project modal not opened'} (rowFound=${debugInfo?.rowFound}, html=${debugInfo?.html || 'n/a'})`);
        }

        const pressed = await pressButton(client.Runtime, {
          selector: '[data-oracle-create-project="true"]',
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
      fields: { name?: string; instructions?: string; modelLabel?: string; memoryMode?: 'global' | 'project' },
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
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
              const visible = (el) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              };
              const input = Array.from(document.querySelectorAll('input[placeholder], input[aria-label]'))
                .find((el) => {
                  if (!visible(el)) return false;
                  const label = String(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
                  return label.includes('project name');
                }) || null;
              if (!input) {
                return { success: false, error: 'Project name input not found', logs };
              }
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              const writeValue = (value) => {
                input.focus();
                input.select?.();
                if (setter) {
                  setter.call(input, '');
                } else {
                  input.value = '';
                }
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
                if (setter) {
                  setter.call(input, value);
                } else {
                  input.value = value;
                }
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertFromPaste' }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              };
              for (let attempt = 0; attempt < 6; attempt += 1) {
                writeValue(nameValue);
                await new Promise((resolve) => setTimeout(resolve, 120));
                if ((input.value || '').trim() === nameValue.trim()) {
                  input.blur?.();
                  return { success: true, value: input.value, logs, attempt };
                }
              }
              return { success: false, error: 'Create project name did not stick', value: input.value, logs };
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });
          if (evalResult.exceptionDetails) {
            throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
          }
          const info = evalResult.result?.value as { success: boolean; error?: string; value?: string } | undefined;
          if (!info?.success) {
            throw new Error(info?.error || 'Create project name failed');
          }
          if ((info.value || '').trim() !== fields.name.trim()) {
            throw new Error('Create project name did not stick');
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
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickCreateProjectNextWithClient(client);
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectAttach(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const opened = await openMenu(client.Runtime, {
          trigger: {
            selector: `button${cssClassContains('group/attach-button')}`,
            rootSelectors: DEFAULT_DIALOG_SELECTORS,
            requireVisible: true,
          },
          menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
          timeoutMs: 2000,
        });
        if (!opened.ok) {
          throw new Error('Create project attach menu did not open');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectUploadFile(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const clicked = await openAndSelectMenuItem(client.Runtime, {
          trigger: {
            selector: `button${cssClassContains('group/attach-button')}`,
            rootSelectors: DEFAULT_DIALOG_SELECTORS,
            requireVisible: true,
          },
          menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
          menuRootSelectors: [
            '[role="menu"][data-state="open"]',
            '[data-radix-menu-content][data-state="open"]',
          ],
          itemMatch: { exact: ['upload a file'], includeAny: ['upload a file'] },
          closeMenuAfter: false,
          timeoutMs: 2000,
        });
        if (!clicked) {
          throw new Error('Upload file menu item not found');
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async uploadCreateProjectFiles(
      paths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const attachments = paths.map((filePath) => ({
          path: filePath,
          displayPath: filePath,
          source: 'project-create',
        }));
        const tagResult = await client.Runtime.evaluate({
          expression: `(() => {
            const dialog =
              document.querySelector('div[role="dialog"][data-state="open"]') ||
              document.querySelector('[role="dialog"]') ||
              document.querySelector('[aria-modal="true"]') ||
              document.querySelector('dialog');
            const root = dialog || document;
            const input = root.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
            if (!input) return { ok: false };
            input.setAttribute('data-oracle-project-upload', 'true');
            return { ok: true };
          })()`,
          returnByValue: true,
        });
        const tagged = tagResult.result?.value as { ok?: boolean } | undefined;
        if (tagged?.ok) {
          for (const attachment of attachments) {
            await transferAttachmentViaDataTransfer(
              client.Runtime,
              attachment,
              'input[type="file"][data-oracle-project-upload="true"]',
            );
            const name = path.basename(attachment.displayPath ?? attachment.path);
            const deadline = Date.now() + 5000;
            let confirmed = false;
            while (Date.now() < deadline) {
              const status = await client.Runtime.evaluate({
                expression: `(() => {
                  const name = ${JSON.stringify(name)};
                  const dialog =
                    document.querySelector('div[role="dialog"][data-state="open"]') ||
                    document.querySelector('[role="dialog"]') ||
                    document.querySelector('[aria-modal="true"]') ||
                    document.querySelector('dialog') ||
                    document.body;
                  const rows = Array.from(dialog.querySelectorAll('div')).filter((node) =>
                    (node.textContent || '').includes(name),
                  );
                  for (const row of rows) {
                    const text = (row.textContent || '').trim();
                    if (!text) continue;
                    if (/(?:^|[^0-9])0\\s*b(?:$|[^a-z])/i.test(text)) continue;
                    return { ok: true, text };
                  }
                  return { ok: false };
                })()`,
                returnByValue: true,
              });
              const ok = status.result?.value?.ok;
              if (ok) {
                confirmed = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
            if (!confirmed) {
              throw new Error(`Attachment "${name}" did not finish uploading (still 0 B).`);
            }
          }
          return;
        }
        await uploadGrokAttachments(client.DOM, client.Runtime, attachments, (msg) => {
          console.log(`[browser-project-create] ${msg}`);
        });
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async clickCreateProjectConfirm(options?: BrowserProviderListOptions): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await clickCreateProjectConfirmWithClient(client);
      } finally {
        await client.close();
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
        memoryMode?: 'global' | 'project';
      },
      options?: BrowserProviderListOptions,
    ): Promise<Project | null> {
      const connection = await connectToGrokTab(options, GROK_PROJECTS_INDEX_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      let created: Project | null = null;
      try {
        let workspaceCreateErrorRequestId: string | null = null;
        await client.Network.enable();
        client.Network.responseReceived((params) => {
          const url = params.response?.url ?? '';
          const status = params.response?.status ?? 0;
          if (url.includes('/rest/workspaces') && status >= 400) {
            workspaceCreateErrorRequestId = params.requestId;
          }
        });
        await openCreateProjectModalWithClient(client);
        await setCreateProjectFieldsWithClient(client, {
          name: input.name,
          instructions: input.instructions,
          modelLabel: input.modelLabel,
        });
        await clickCreateProjectNextWithClient(client);
        if (input.files && input.files.length > 0) {
          await clickCreateProjectAttachWithClient(client);
          await clickCreateProjectUploadFileWithClient(client);
          await uploadCreateProjectFilesWithClient(client, input.files);
          await waitForProjectUploadsComplete(
            client,
            input.files.map((filePath) => path.basename(filePath)),
          );
        }
        const { result: beforeResult } = await client.Runtime.evaluate({
          expression: 'location.href',
          returnByValue: true,
        });
        const beforeHref = typeof beforeResult?.value === 'string' ? beforeResult.value : '';
        await clickCreateProjectConfirmWithClient(client);
        let projectUrl = await waitForProjectUrl(client, 20_000, beforeHref);
        if (!projectUrl) {
          projectUrl = await recoverCreatedProjectUrlByName(client, input.name, 10_000);
        }
        if (!projectUrl && workspaceCreateErrorRequestId) {
          const response = await client.Network.getResponseBody({ requestId: workspaceCreateErrorRequestId }).catch(
            () => null,
          );
          const message = parseGrokWorkspaceCreateError(response?.body);
          if (message) {
            throw new Error(`Create project failed: ${message}`);
          }
        }
        const match = projectUrl?.match(/\/project\/([^/?#]+)/);
        if (match?.[1]) {
          created = {
            id: match[1],
            name: input.name,
            provider: 'grok',
            url: projectUrl ?? undefined,
          };
        }
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
      return created;
    },

    async listAccountFiles(
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const connection = await connectToGrokTab(options, GROK_FILES_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const files = await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToGrokFiles(client, GROK_FILES_URL);
            return readVisibleAccountFilesWithClient(client);
          },
          {
            label: 'grok-account-list-files',
            rootSelectors: ['main', '[role="main"]'],
            menuSelectors: ['[role="menu"]', '[data-radix-menu-content][data-state="open"]'],
            candidateSelectors: [
              '[data-oracle-account-file-row="true"]',
              GROK_ACCOUNT_FILE_LINK_SELECTOR,
              'button[aria-label="Delete file"]',
              'button[aria-label="Delete"]',
            ],
            buttonSelectors: ['button', 'button[aria-label="Open menu"]', '[role="button"]'],
            context: {
              surface: 'grok-account-files',
              action: 'list',
            },
          },
        );
        return files.map((file) => ({
          id: file.id,
          name: file.name,
          provider: 'grok',
          source: 'account',
          remoteUrl: file.remoteUrl,
        }));
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async uploadAccountFiles(
      filePaths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      if (filePaths.length === 0) return;
      const connection = await connectToGrokTab(options, GROK_FILES_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const fileNames = filePaths.map((filePath) => path.basename(filePath));
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToGrokFiles(client, GROK_FILES_URL);
            await uploadAccountFilesWithClient(client, filePaths);
            await waitForAccountFilesPersisted(client, fileNames);
          },
          {
            label: 'grok-account-upload-files',
            rootSelectors: ['main', '[role="main"]'],
            candidateSelectors: [
              'input[type="file"]',
              GROK_ACCOUNT_FILE_UPLOAD_INPUT_SELECTOR,
              '[data-oracle-account-upload="true"]',
              GROK_ACCOUNT_FILE_LINK_SELECTOR,
            ],
            buttonSelectors: ['button', '[role="button"]', 'button[aria-label="Save"]'],
            context: {
              surface: 'grok-account-files',
              action: 'upload',
              fileNames,
            },
          },
        );
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async deleteAccountFile(
      fileId: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const connection = await connectToGrokTab(options, GROK_FILES_URL);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToGrokFiles(client, GROK_FILES_URL);
            await removeAccountFileWithClient(client, fileId);
            await waitForAccountFileRemoved(client, fileId);
          },
          {
            label: 'grok-account-delete-file',
            rootSelectors: ['main', '[role="main"]'],
            candidateSelectors: [
              '[data-oracle-account-file-row="true"]',
              GROK_ACCOUNT_FILE_LINK_SELECTOR,
              'button[aria-label="Delete file"]',
              'button[aria-label="Delete"]',
            ],
            buttonSelectors: ['button', 'button[aria-label="Delete file"]', 'button[aria-label="Delete"]'],
            menuSelectors: ['[role="dialog"]', '[role="menu"]', '[data-radix-menu-content][data-state="open"]'],
            context: {
              surface: 'grok-account-files',
              action: 'delete',
              fileId,
            },
          },
        );
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async uploadProjectFiles(
      projectId: string,
      filePaths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      if (filePaths.length === 0) return;
      const projectUrl = `https://grok.com/project/${projectId}?tab=sources`;
      const connection = await connectToGrokProjectTab(options, projectId, projectUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const fileNames = filePaths.map((filePath) => path.basename(filePath));
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToProject(client, projectUrl);
            await ensureProjectSourcesTabSelected(client);
            await waitForProjectSourcesTab(client);
            await uploadProjectSourceFilesWithClient(client, filePaths);
            await waitForProjectSourcesUploadsComplete(client, fileNames);
            await clickPersonalFilesSaveWithClient(client);
            await waitForProjectFilesPersisted(client, fileNames);
          },
          {
            label: 'grok-project-upload-files',
            rootSelectors: [
              `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
              GROK_SOURCES_ROOT_SELECTOR,
              '[role="dialog"]',
              'main',
            ],
            menuSelectors: ['[role="menu"]', '[data-radix-menu-content][data-state="open"]'],
            candidateSelectors: [
              GROK_PERSONAL_FILES_ROW_SELECTOR,
              `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
              GROK_PERSONAL_FILES_SEARCH_SELECTOR,
              'button[aria-label="Attach"]',
            ],
            buttonSelectors: [
              'button',
              '[role="button"]',
              'button[aria-label="Attach"]',
              'button[aria-label="Save"]',
            ],
            context: {
              surface: 'grok-project-files',
              action: 'upload',
              projectId,
              fileNames,
            },
          },
        );
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async listProjectFiles(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const projectUrl = `https://grok.com/project/${projectId}?tab=sources`;
      const connection = await connectToGrokProjectTab(options, projectId, projectUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        const files = await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToProject(client, projectUrl);
            await ensureProjectSourcesTabSelected(client);
            await waitForProjectSourcesTab(client);
            await ensureProjectSourcesFilesExpanded(client);
            return readVisiblePersonalFilesWithClient(client);
          },
          {
            label: 'grok-project-list-files',
            rootSelectors: [GROK_SOURCES_ROOT_SELECTOR, 'main', `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`],
            candidateSelectors: [GROK_PERSONAL_FILES_ROW_SELECTOR, GROK_ASSET_ROW_SELECTOR, GROK_SOURCES_FILES_ROW_SELECTOR],
            buttonSelectors: ['button', '[role="button"]', 'button[aria-label="Attach"]'],
            context: {
              surface: 'grok-project-files',
              action: 'list',
              projectId,
            },
          },
        );
        const seen = new Set<string>();
        return files
          .filter((file) => {
            const key = file.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((file) => ({
            id: file.name,
            name: file.name,
            provider: 'grok',
            source: 'project',
            size: file.size ?? undefined,
          }));
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async deleteProjectFile(
      projectId: string,
      fileName: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const projectUrl = `https://grok.com/project/${projectId}?tab=sources`;
      const connection = await connectToGrokProjectTab(options, projectId, projectUrl);
      const { client, targetId, shouldClose, host, port } = connection;
      try {
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            await navigateToProject(client, projectUrl);
            await ensureProjectSourcesTabSelected(client);
            await waitForProjectSourcesTab(client);
            await ensureProjectSourcesFilesExpanded(client);
            await removeProjectSourceFileWithClient(client, fileName);
            await waitForProjectSourceFileMarkedRemoved(client, fileName);
            await clickPersonalFilesSaveWithClient(client);
          },
          {
            label: 'grok-project-delete-file',
            rootSelectors: [
              `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
              GROK_SOURCES_ROOT_SELECTOR,
              'main',
            ],
            menuSelectors: ['[role="menu"]', '[role="dialog"]', '[data-radix-menu-content][data-state="open"]'],
            candidateSelectors: [
              GROK_PERSONAL_FILES_ROW_SELECTOR,
              `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
              GROK_PERSONAL_FILES_SEARCH_SELECTOR,
            ],
            buttonSelectors: [
              'button',
              '[role="button"]',
              'button[aria-label="Attach"]',
              'button[aria-label="Save"]',
              'button[aria-label="Remove"]',
              'button[aria-label="Delete"]',
            ],
            context: {
              surface: 'grok-project-files',
              action: 'delete',
              projectId,
              fileName,
            },
          },
        );
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
    },

    async readConversationContext(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<ConversationContext> {
      const cleanProjectId = typeof projectId === 'string' && projectId.trim().length > 0 ? projectId.trim() : undefined;
      const targetUrl = cleanProjectId
        ? `https://grok.com/project/${cleanProjectId}?chat=${conversationId}`
        : `https://grok.com/c/${conversationId}`;
      const connection = cleanProjectId
        ? await connectToGrokProjectTab(options, cleanProjectId, targetUrl)
        : await connectToGrokTab(options, targetUrl);
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      try {
        if (cleanProjectId) {
          const shouldNavigate = !(usedExisting && (await currentGrokUrlMatchesPreference(client, targetUrl)));
          if (shouldNavigate) {
            await navigateToProject(client, targetUrl);
          }
        } else {
          const shouldNavigate = !(usedExisting && (await currentGrokUrlMatchesPreference(client, targetUrl)));
          if (shouldNavigate) {
            await navigateToConversation(client, targetUrl);
          }
          if (!(await isValidConversationUrl(client))) {
            throw new Error('Conversation URL is invalid or missing.');
          }
        }

        const ready = await waitForGrokConversationSurface(client.Runtime, {
          timeoutMs: 10_000,
          requireResponse: true,
        });
        if (!ready.ok) {
          throw new Error('Conversation content not found');
        }

        const evalResult = await client.Runtime.evaluate({
          expression: `(async () => {
            const normalize = (value) => String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
            const normalizeUrl = (value) => {
              if (!value) return '';
              try {
                const parsed = new URL(String(value), window.location.origin);
                if (!/^https?:$/i.test(parsed.protocol)) return '';
                if (parsed.origin === window.location.origin) return '';
                return parsed.href;
              } catch {
                return '';
              }
            };
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const rows = Array.from(document.querySelectorAll('main [id^="response-"]'));
            const messages = [];
            const sources = [];
            const seenSourceKeys = new Set();
            const rowMessageIndex = new WeakMap();
            const pushSource = (anchor, messageIndex, sourceGroup) => {
              if (!anchor) return;
              const href = normalizeUrl(anchor.getAttribute('href') || anchor.href || '');
              if (!href) return;
              const indexPart = Number.isFinite(messageIndex) ? String(messageIndex) : 'n/a';
              const groupPart = typeof sourceGroup === 'string' ? sourceGroup.trim() : 'n/a';
              const key = \`\${indexPart}::\${groupPart}::\${href}\`;
              if (seenSourceKeys.has(key)) return;
              seenSourceKeys.add(key);
              let domain = '';
              try {
                domain = new URL(href).hostname || '';
              } catch {}
              const title = normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');
              sources.push({
                url: href,
                title: title || undefined,
                domain: domain || undefined,
                messageIndex,
                sourceGroup: groupPart !== 'n/a' ? groupPart : undefined,
              });
            };

            const pushFromRow = (row) => {
              const classText = String(row.getAttribute('class') || '');
              const role = classText.includes('items-end') ? 'user' : classText.includes('items-start') ? 'assistant' : null;
              if (!role) return;
              const markdown = row.querySelector('[class*="response-content-markdown"]');
              const bubble = row.querySelector('div.message-bubble');
              const text = normalize((markdown && markdown.textContent) || (bubble && bubble.textContent) || '');
              if (!text) return;
              messages.push({ role, text });
              rowMessageIndex.set(row, messages.length - 1);
              if (role === 'assistant') {
                const messageIndex = messages.length - 1;
                const links = Array.from(row.querySelectorAll('a[href]'));
                for (const link of links) {
                  pushSource(link, messageIndex);
                }
              }
            };

            for (const row of rows) {
              pushFromRow(row);
            }

            if (messages.length === 0) {
              const fallbackRows = Array.from(document.querySelectorAll('div.message-bubble'));
              for (const bubble of fallbackRows) {
                const row = bubble.closest('div[class*="items-start"], div[class*="items-end"]');
                const classText = String(row?.getAttribute('class') || bubble.getAttribute('class') || '');
                const role = classText.includes('items-end') ? 'user' : classText.includes('items-start') ? 'assistant' : null;
                if (!role) continue;
                const text = normalize(bubble.textContent || '');
                if (!text) continue;
                messages.push({ role, text });
                if (row) rowMessageIndex.set(row, messages.length - 1);
                if (role === 'assistant') {
                  const messageIndex = messages.length - 1;
                  const links = Array.from((row || bubble).querySelectorAll('a[href]'));
                  for (const link of links) {
                    pushSource(link, messageIndex);
                  }
                }
              }
            }

            const clickElement = (element) => {
              if (!element) return;
              const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];
              for (const type of events) {
                element.dispatchEvent(
                  new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                  }),
                );
              }
            };

            const isVisible = (element) => {
              if (!(element instanceof HTMLElement)) return false;
              const rect = element.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return false;
              const style = window.getComputedStyle(element);
              if (!style) return true;
              if (style.display === 'none') return false;
              if (style.visibility === 'hidden') return false;
              if (style.pointerEvents === 'none') return false;
              return true;
            };

            const findAccordionButtons = () =>
              Array.from(document.querySelectorAll('button[aria-controls][aria-expanded]')).filter((button) =>
                /searched/i.test((button.textContent || '').trim()),
              );

            const collectAccordionLinks = async (messageIndex) => {
              const accordionButtons = findAccordionButtons();
              for (const button of accordionButtons) {
                const groupLabel = normalize(button.textContent || '');
                if (button.getAttribute('aria-expanded') !== 'true') {
                  clickElement(button);
                  await sleep(70);
                }
                const panelId = button.getAttribute('aria-controls') || '';
                const panel = panelId ? document.getElementById(panelId) : null;
                if (!panel) continue;
                const anchors = Array.from(panel.querySelectorAll('a[href]'));
                for (const anchor of anchors) {
                  pushSource(anchor, messageIndex, groupLabel || undefined);
                }
              }
            };

            const findSourceChips = () =>
              Array.from(document.querySelectorAll('button, [role="button"]')).filter((element) => {
                const label = normalize(element.getAttribute('aria-label') || '');
                const text = normalize(element.textContent || '');
                const combined = normalize(\`\${label} \${text}\`);
                if (!/\\bsources?\\b/i.test(combined)) return false;
                if (/\\bsearched\\b/i.test(text)) return false;
                if (!isVisible(element)) return false;
                return true;
              });

            const waitForAccordionButtons = async (timeoutMs) => {
              const deadline = Date.now() + timeoutMs;
              while (Date.now() < deadline) {
                if (findAccordionButtons().length > 0) return true;
                await sleep(50);
              }
              return findAccordionButtons().length > 0;
            };

            let openedSidebar = findAccordionButtons().length > 0;
            if (!openedSidebar) {
              const sourceChips = findSourceChips();
              for (const chip of sourceChips) {
                clickElement(chip);
                if (await waitForAccordionButtons(800)) {
                  openedSidebar = true;
                  break;
                }
              }
            }

            if (openedSidebar) {
              await collectAccordionLinks(undefined);
              document.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'Escape',
                  code: 'Escape',
                  bubbles: true,
                  cancelable: true,
                }),
              );
              await sleep(60);
            } else {
              await collectAccordionLinks(undefined);
            }

            return { ok: true, messages, sources };
          })()`,
          returnByValue: true,
          awaitPromise: true,
        });
        const info = evalResult.result?.value as {
          ok?: boolean;
          messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
          sources?: Array<{ url: string; title?: string; domain?: string; messageIndex?: number; sourceGroup?: string }>;
        } | undefined;
        const messages = Array.isArray(info?.messages) ? info.messages : [];
        const sources = Array.isArray(info?.sources) ? info.sources : [];
        const files = await readVisibleConversationFilesWithClient(client, conversationId);
        if (messages.length === 0) {
          throw new Error('Conversation messages not found');
        }
        return {
          provider: 'grok',
          conversationId,
          messages,
          files,
          sources,
        };
      } finally {
        await client.close();
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },

    async listConversationFiles(
      conversationId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const cleanProjectId =
        typeof options?.projectId === 'string' && options.projectId.trim().length > 0 ? options.projectId.trim() : undefined;
      const targetUrl = cleanProjectId
        ? `https://grok.com/project/${cleanProjectId}?chat=${conversationId}`
        : `https://grok.com/c/${conversationId}`;
      const connection = cleanProjectId
        ? await connectToGrokProjectTab(options, cleanProjectId, targetUrl)
        : await connectToGrokTab(options, targetUrl);
      const { client, targetId, shouldClose, host, port, usedExisting } = connection;
      try {
        if (cleanProjectId) {
          const shouldNavigate = !(usedExisting && (await currentGrokUrlMatchesPreference(client, targetUrl)));
          if (shouldNavigate) {
            await navigateToProject(client, targetUrl);
          }
        } else {
          const shouldNavigate = !(usedExisting && (await currentGrokUrlMatchesPreference(client, targetUrl)));
          if (shouldNavigate) {
            await navigateToConversation(client, targetUrl);
          }
          if (!(await isValidConversationUrl(client))) {
            throw new Error('Conversation URL is invalid or missing.');
          }
        }
        const ready = await waitForGrokConversationSurface(client.Runtime, {
          timeoutMs: 12_000,
          requireResponse: false,
        });
        if (!ready.ok) {
          throw new Error('Conversation content not found');
        }
        return await readVisibleConversationFilesWithClient(client, conversationId);
      } finally {
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
  }
  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'grok';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string; id?: string } | null }>;
      })
    | undefined;
  const preferredUrl = urlOverride ?? options?.configuredUrl ?? 'https://grok.com/';
  let resolvedTargetIdFromService: string | undefined;
  if (serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: preferredUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    resolvedTargetIdFromService = resolveGrokTargetId(target.tab);
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
    throw new Error('Missing DevTools port. Launch a Grok browser session or set AURACALL_BROWSER_PORT.');
  }
  const resolvedPort = port;
  const targets = await CDP.List({ host, port: resolvedPort });
  const candidates = targets.filter((target) => target.type === 'page' && target.url?.includes('grok.com'));
  const preferred = selectPreferredGrokTarget(candidates, preferredUrl);
  const serviceResolved = resolvedTargetIdFromService
    ? candidates.find((target) => resolveGrokTargetId(target) === resolvedTargetIdFromService)
    : undefined;
  let targetInfo = preferred ?? serviceResolved;
  let shouldClose = false;
  let usedExisting = Boolean(resolveGrokTargetId(targetInfo));
  const tabPolicy = resolveBrowserTabPolicy(options);
  if (!targetInfo && preferredUrl) {
    const opened = await openOrReuseChromeTarget(resolvedPort, preferredUrl, {
      host,
      reusePolicy: 'same-origin',
      matchingTabLimit: tabPolicy.serviceTabLimit,
      blankTabLimit: tabPolicy.blankTabLimit,
      collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
      suppressFocus: tabPolicy.suppressFocus,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  } else if (!targetInfo) {
    targetInfo = candidates[0];
    usedExisting = Boolean(resolveGrokTargetId(targetInfo));
  }
  if (!resolveGrokTargetId(targetInfo)) {
    const fallbackUrl = preferredUrl ?? GROK_HOME_URL;
    const opened = await openOrReuseChromeTarget(resolvedPort, fallbackUrl, {
      host,
      reusePolicy: 'same-origin',
      matchingTabLimit: tabPolicy.serviceTabLimit,
      blankTabLimit: tabPolicy.blankTabLimit,
      collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
      suppressFocus: tabPolicy.suppressFocus,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  }
  const targetId = resolveGrokTargetId(targetInfo);
  if (!targetId) {
    throw new Error('No grok.com tab found. Launch a Grok browser session and retry.');
  }
  const client = await connectToChromeTarget({ host, port: resolvedPort, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  setClientSuppressFocus(client, tabPolicy.suppressFocus);
  return { client, targetId, shouldClose, host, port: resolvedPort, usedExisting };
}

async function openCreateProjectModalWithClient(client: ChromeClient): Promise<void> {
  await ensureMainSidebarOpen(client, { logPrefix: 'browser-project-create' });
  const rootSelectors = [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside'];
  const tryDirectCreateButton = async (): Promise<boolean> => {
    const pressed = await pressButton(client.Runtime, {
      match: { exact: ['new project'], includeAny: ['new project'] },
      rootSelectors,
      requireVisible: true,
      timeoutMs: 2000,
    });
    if (!pressed.ok) {
      return false;
    }
    return waitForSelector(
      client.Runtime,
      'input[placeholder*="project name" i]',
      5000,
    );
  };
  const tryRevealCreateButton = async (): Promise<{ ok: boolean; reason?: string }> => {
    const tagResult = await client.Runtime.evaluate({
      expression: `(() => {
        const roots = ${JSON.stringify(rootSelectors)}
          .map((sel) => document.querySelector(sel))
          .filter(Boolean);
        const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const pickRoot = () => {
          for (const candidate of roots) {
            const count = candidate.querySelectorAll(
              ${JSON.stringify(GROK_MENU_BUTTON_SELECTOR)},
            ).length;
            if (count > 0) return candidate;
          }
          return document;
        };
        const root = pickRoot();
        const links = Array.from(
          root.querySelectorAll(${JSON.stringify(GROK_MENU_BUTTON_SELECTOR)}),
        );
        const itemLink = links.find((link) => normalize(link.textContent || '').includes('projects')) || null;
        const item = itemLink
          ? itemLink.closest(${JSON.stringify(GROK_MENU_ITEM_SELECTOR)}) ||
            itemLink.parentElement
          : null;
        if (!item || !itemLink) {
          const labels = links.map((link) => normalize(link.textContent || '')).filter(Boolean).slice(0, 8);
          return { ok: false, reason: 'Projects menu item not found', labels };
        }
        item.setAttribute('data-oracle-projects-row', 'true');
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const tagInfo = tagResult.result?.value as { ok: boolean; reason?: string } | undefined;
    if (!tagInfo?.ok) {
      return { ok: false, reason: tagInfo?.reason || 'Projects row not found' };
    }

    let lastReason = 'Create project button not revealed';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const hoverResult = await hoverAndReveal(client.Runtime, client.Input, {
        rowSelector: '[data-oracle-projects-row="true"]',
        rootSelectors,
        timeoutMs: 1500,
      });
      if (!hoverResult.ok) {
        lastReason = hoverResult.reason || lastReason;
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
      const buttonTag = await client.Runtime.evaluate({
        expression: `(() => {
          const row = document.querySelector('[data-oracle-projects-row="true"]');
          if (!row) return { ok: false, reason: 'Projects row missing' };
          const button =
            row.querySelector('span.absolute button') ||
            row.querySelector('button.group-hover\\\\/menu-item\\\\:opacity-100') ||
            row.querySelector('button') ||
            row.querySelector('[role="button"]') ||
            null;
          if (!button) return { ok: false, reason: 'Create project button not found' };
          button.setAttribute('data-oracle-create-project', 'true');
          return { ok: true };
        })()`,
        returnByValue: true,
      });
      const buttonInfo = buttonTag.result?.value as { ok: boolean; reason?: string } | undefined;
      if (buttonInfo?.ok) {
        return { ok: true };
      }
      lastReason = buttonInfo?.reason || lastReason;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return { ok: false, reason: lastReason };
  };

  if (await tryDirectCreateButton()) {
    return;
  }
  let revealed = await tryRevealCreateButton();
  if (!revealed.ok) {
    await client.Page.navigate({ url: 'https://grok.com/' });
    await waitForDocumentReady(client, 15_000);
    await ensureMainSidebarOpen(client, { logPrefix: 'browser-project-create' });
    await closeHistoryDialog(client);
    if (await tryDirectCreateButton()) {
      return;
    }
    revealed = await tryRevealCreateButton();
  }

  if (!revealed.ok) {
    const debug = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector('[data-oracle-projects-row="true"]');
        return {
          rowFound: Boolean(row),
          html: row ? row.outerHTML.slice(0, 600) : null,
        };
      })()`,
      returnByValue: true,
    });
    const debugInfo = debug.result?.value as { rowFound?: boolean; html?: string | null } | undefined;
    throw new Error(`${revealed.reason || 'Create project modal not opened'} (rowFound=${debugInfo?.rowFound}, html=${debugInfo?.html || 'n/a'})`);
  }

  const pressed = await pressButton(client.Runtime, {
    selector: '[data-oracle-create-project="true"]',
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
  const tagged = await tagVisibleCreateProjectDialog(client);
  if (!tagged) {
    throw new Error('Create project dialog could not be identified');
  }
}

async function setCreateProjectFieldsWithClient(
  client: ChromeClient,
  fields: { name?: string; instructions?: string; modelLabel?: string },
): Promise<void> {
  await tagVisibleCreateProjectDialog(client);
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
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const taggedDialog = document.querySelector(${JSON.stringify(GROK_CREATE_PROJECT_DIALOG_SELECTOR)});
        const visibleDialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(visible);
        const dialogWithProjectName =
          (taggedDialog && visible(taggedDialog)
            ? taggedDialog
            : null) ||
          visibleDialogs.find((node) =>
            Boolean(node.querySelector('input[placeholder*="project name" i], input[aria-label*="project name" i]')),
          ) ||
          null;
        const dialogWithInstructions =
          visibleDialogs.find((node) =>
            Boolean(node.querySelector('textarea[placeholder*="instruction" i], textarea')),
          ) || null;
        const dialogRoot = dialogWithProjectName || dialogWithInstructions || document;
        const input = Array.from(dialogRoot.querySelectorAll('input[placeholder], input[aria-label]'))
          .find((el) => {
            if (!visible(el)) return false;
            const label = String(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('project name');
          }) || null;
              if (!input) {
                return { success: false, error: 'Project name input not found', logs };
              }
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              const writeValue = (value) => {
                input.focus();
                input.select?.();
                if (setter) {
                  setter.call(input, '');
                } else {
                  input.value = '';
                }
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
                if (setter) {
                  setter.call(input, value);
                } else {
                  input.value = value;
                }
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertFromPaste' }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              };
              for (let attempt = 0; attempt < 6; attempt += 1) {
                writeValue(nameValue);
                await new Promise((resolve) => setTimeout(resolve, 120));
                if ((input.value || '').trim() === nameValue.trim()) {
                  input.blur?.();
                  return { success: true, value: input.value, logs, attempt };
                }
              }
              return { success: false, error: 'Create project name did not stick', value: input.value, logs };
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });
    if (evalResult.exceptionDetails) {
      throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
    }
    const info = evalResult.result?.value as { success: boolean; error?: string; value?: string } | undefined;
    if (!info?.success) {
      throw new Error(info?.error || 'Create project name failed');
    }
    if ((info.value || '').trim() !== fields.name.trim()) {
      throw new Error('Create project name did not stick');
    }
  }

  await resolveProjectInstructionsModal(client, {
    serviceId: 'grok',
    text: fields.instructions,
    modelLabel: fields.modelLabel,
  });
}

async function clickCreateProjectNextWithClient(client: ChromeClient): Promise<void> {
  await tagVisibleCreateProjectDialog(client);
  const finalStep = await waitForCreateProjectFinalStep(client, 1_500);
  if (finalStep.ok) {
    return;
  }

  const pressed = await pressButton(client.Runtime, {
    match: { exact: ['next'], includeAny: ['next'] },
    rootSelectors: [GROK_CREATE_PROJECT_DIALOG_SELECTOR],
    requireVisible: true,
    timeoutMs: 2_000,
  });
  if (!pressed.ok) {
    const debug = await readCreateProjectDialogDebug(client);
    throw new Error(`${pressed.reason || 'Next button not found'} (${formatCreateProjectDialogDebug(debug)})`);
  }

  const advanced = await waitForCreateProjectFinalStep(client, 5_000);
  if (!advanced.ok) {
    const debug = await readCreateProjectDialogDebug(client);
    throw new Error(`Create project next did not advance to sources step (${formatCreateProjectDialogDebug(debug)})`);
  }
}

async function clickCreateProjectAttachWithClient(client: ChromeClient): Promise<void> {
  await tagVisibleCreateProjectDialog(client);
  const opened = await openMenu(client.Runtime, {
    trigger: {
      selector: `button${cssClassContains('group/attach-button')}`,
      rootSelectors: [GROK_CREATE_PROJECT_DIALOG_SELECTOR],
      requireVisible: true,
    },
    menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
    timeoutMs: 2000,
  });
  if (!opened.ok) {
    throw new Error('Create project attach menu did not open');
  }
}

async function clickCreateProjectUploadFileWithClient(client: ChromeClient): Promise<void> {
  await tagVisibleCreateProjectDialog(client);
  const clicked = await openAndSelectMenuItem(client.Runtime, {
    trigger: {
      selector: `button${cssClassContains('group/attach-button')}`,
      rootSelectors: [GROK_CREATE_PROJECT_DIALOG_SELECTOR],
      requireVisible: true,
    },
    menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
    menuRootSelectors: [
      '[role="menu"][data-state="open"]',
      '[data-radix-menu-content][data-state="open"]',
    ],
    itemMatch: { exact: ['upload a file'], includeAny: ['upload a file'] },
    closeMenuAfter: false,
    timeoutMs: 2000,
  });
  if (!clicked) {
    throw new Error('Upload file menu item not found');
  }
}

async function uploadCreateProjectFilesWithClient(
  client: ChromeClient,
  paths: string[],
): Promise<void> {
  const attachments = paths.map((filePath) => ({
    path: filePath,
    displayPath: filePath,
    source: 'project-create',
  }));
  const tagResult = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector('div[role="dialog"][data-state="open"]') ||
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      const root = dialog || document;
      const input = root.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
      if (!input) return { ok: false };
      input.setAttribute('data-oracle-project-upload', 'true');
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const tagged = tagResult.result?.value as { ok?: boolean } | undefined;
  if (!tagged?.ok) {
    throw new Error('Project upload input not found');
  }
  for (const attachment of attachments) {
    await transferAttachmentViaDataTransfer(
      client.Runtime,
      attachment,
      'input[type="file"][data-oracle-project-upload="true"]',
    );
    const name = path.basename(attachment.displayPath ?? attachment.path);
    const deadline = Date.now() + 15000;
    let confirmed = false;
    while (Date.now() < deadline) {
      const status = await client.Runtime.evaluate({
        expression: `(() => {
          const name = ${JSON.stringify(name)};
          const dialog =
            document.querySelector('div[role="dialog"][data-state="open"]') ||
            document.querySelector('[role="dialog"]') ||
            document.querySelector('[aria-modal="true"]') ||
            document.querySelector('dialog') ||
            document.body;
          const rows = Array.from(dialog.querySelectorAll('div')).filter((node) =>
            (node.textContent || '').includes(name),
          );
          for (const row of rows) {
            const text = (row.textContent || '').trim();
            if (!text) continue;
            return { ok: true, text };
          }
          return { ok: false };
        })()`,
        returnByValue: true,
      });
      const ok = status.result?.value?.ok;
      if (ok) {
        confirmed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!confirmed) {
      throw new Error(`Attachment "${name}" did not appear in project sources after upload.`);
    }
  }
}

async function waitForProjectUploadsComplete(
  client: ChromeClient,
  fileNames: string[],
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const normalized = fileNames.map((name) => name.toLowerCase());
  while (Date.now() < deadline) {
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const names = ${JSON.stringify(normalized)};
        const dialog =
          document.querySelector('div[role="dialog"][data-state="open"]') ||
          document.querySelector('[role="dialog"]') ||
          document.querySelector('[aria-modal="true"]') ||
          document.querySelector('dialog') ||
          document.body;
        const text = (dialog.textContent || '').toLowerCase();
        const missing = [];
        for (const name of names) {
          if (!text.includes(name)) missing.push(name);
        }
        if (missing.length > 0) {
          return { ok: false, reason: 'missing', missing };
        }
        const zeroByte = names.find((name) => {
          const idx = text.indexOf(name);
          if (idx === -1) return false;
          const snippet = text.slice(idx, idx + 80);
          return /(?:^|[^0-9])0\\s*b(?:$|[^a-z])/i.test(snippet);
        });
        if (zeroByte) {
          return { ok: false, reason: 'size', name: zeroByte };
        }
        if (text.includes('uploading') || text.includes('processing')) {
          return { ok: false, reason: 'busy' };
        }
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (result.result?.value?.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Project uploads did not finish before timeout.');
}

async function waitForProjectSourcesTab(client: ChromeClient): Promise<void> {
  const ready = await waitForSelector(
    client.Runtime,
    `${GROK_SOURCES_CONTENT_SELECTOR}, ${GROK_SOURCES_FILES_ROW_SELECTOR}`,
    10_000,
  );
  if (!ready) {
    throw new Error('Project sources tab did not load.');
  }
}

async function tagPersonalFilesModalRoot(client: ChromeClient): Promise<boolean> {
  const evalResult = await client.Runtime.evaluate({
    expression: `(() => {
      for (const node of document.querySelectorAll('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]')) {
        node.removeAttribute('${GROK_PERSONAL_FILES_MODAL_MARKER}');
      }
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const input = Array.from(document.querySelectorAll(${JSON.stringify(GROK_PERSONAL_FILES_SEARCH_SELECTOR)}))
        .find((node) => visible(node));
      if (!input) return { ok: false };
      const root =
        input.closest('div[id^="radix-"]') ||
        input.closest('div[role="dialog"]') ||
        input.closest('div');
      if (!root) return { ok: false };
      root.setAttribute('${GROK_PERSONAL_FILES_MODAL_MARKER}', 'true');
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  return Boolean(evalResult.result?.value?.ok);
}

async function ensurePersonalFilesModalOpen(client: ChromeClient): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await tagPersonalFilesModalRoot(client)) {
      return;
    }
    const clicked = await pressButton(client.Runtime, {
      match: { includeAny: ['personal files'] },
      rootSelectors: ['main'],
      requireVisible: true,
      timeoutMs: 5000,
      logCandidatesOnMiss: attempt === 2,
    });
    if (!clicked.ok) {
      throw new Error(clicked.reason || 'Personal files opener not found');
    }
    await waitForPredicate(
      client.Runtime,
      `(() => Boolean(
        document.querySelector(${JSON.stringify(GROK_PERSONAL_FILES_SEARCH_SELECTOR)}) ||
        Array.from(document.querySelectorAll('[role="dialog"], div[id^="radix-"]')).find((node) =>
          (node.textContent || '').toLowerCase().includes('personal files'),
        )
      ))()`,
      { timeoutMs: 8_000, pollMs: 200 },
    );
    if (await tagPersonalFilesModalRoot(client)) {
      return;
    }
  }
  throw new Error('Personal files modal not found');
}

async function clickPersonalFilesSaveWithClient(client: ChromeClient): Promise<void> {
  const clicked = await pressButton(client.Runtime, {
    match: { exact: ['save'] },
    rootSelectors: [`[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`],
    requireVisible: true,
    timeoutMs: 4000,
    logCandidatesOnMiss: true,
  });
  if (!clicked.ok) {
    throw new Error(clicked.reason || 'Personal files Save button not found');
  }
  await waitForNotSelector(client.Runtime, `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`, 5000);
}

async function readVisiblePersonalFilesWithClient(client: ChromeClient): Promise<GrokProjectFileProbe[]> {
  await ensurePersonalFilesModalOpen(client);
  const evalResult = await client.Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
      const rows = Array.from(root.querySelectorAll(${JSON.stringify(GROK_PERSONAL_FILES_ROW_SELECTOR)}));
      return {
        rowTexts: rows
          .map((row) => String(row.textContent || ''))
          .filter((text) => text && text.trim().length > 0),
      };
    })()`,
    returnByValue: true,
  });
  const rowTexts = (evalResult.result?.value?.rowTexts as string[] | undefined) ?? [];
  return parseGrokPersonalFilesRowTexts(rowTexts);
}

async function waitForProjectFilesPersisted(
  client: ChromeClient,
  fileNames: string[],
  timeoutMs = 12_000,
): Promise<void> {
  const expected = Array.from(
    new Set(
      fileNames
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (expected.length === 0) {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  let missing = expected;
  while (Date.now() < deadline) {
    await ensureProjectSourcesTabSelected(client);
    await waitForProjectSourcesTab(client);
    await ensureProjectSourcesFilesExpanded(client);
    const files = await readVisiblePersonalFilesWithClient(client).catch(() => []);
    const present = new Set(files.map((file) => file.name.toLowerCase()));
    missing = expected.filter((name) => !present.has(name));
    if (missing.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Uploaded file(s) did not persist after save: ${missing.join(', ')}`);
}

async function waitForGrokFilesPageReady(client: ChromeClient, timeoutMs = 15_000): Promise<void> {
  const ready = await waitForPredicate(
    client.Runtime,
    grokFilesPageReadyExpression(),
    { timeoutMs, pollMs: 200, description: 'Grok files page ready' },
  );
  if (!ready.ok) {
    throw new Error('Grok files page did not load');
  }
}

async function navigateToGrokFiles(client: ChromeClient, url: string): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 15_000,
    pollMs: 200,
    routeExpression: grokFilesPathExpression(),
    routeDescription: 'Grok files path',
    readyExpression: grokFilesPageReadyExpression(),
    readyDescription: 'Grok files page ready',
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    if (settled.phase === 'route') {
      throw new Error('Grok files page did not navigate');
    }
    throw new Error('Grok files page did not load');
  }
  await ensureGrokTabVisible(client);
}

async function readVisibleAccountFilesWithClient(client: ChromeClient): Promise<GrokAccountFileProbe[]> {
  await waitForGrokFilesPageReady(client);
  const result = await client.Runtime.evaluate({
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const selector = ${JSON.stringify(GROK_ACCOUNT_FILE_LINK_SELECTOR)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const extractId = (href) => {
        try {
          return new URL(href, location.origin).searchParams.get('file') || '';
        } catch {
          return '';
        }
      };
      const pickScroller = () => {
        const main = document.querySelector('main');
        const candidates = Array.from((main || document).querySelectorAll('*')).filter((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = getComputedStyle(node);
          const overflowY = style.overflowY || '';
          return /(auto|scroll)/.test(overflowY) && node.scrollHeight - node.clientHeight > 40;
        });
        candidates.sort((left, right) => right.scrollHeight - left.scrollHeight);
        return candidates[0] || document.scrollingElement || document.documentElement;
      };
      const collect = () =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => {
            const href = node instanceof HTMLAnchorElement ? node.href : String(node.getAttribute('href') || '');
            const id = extractId(href);
            const name = normalize(
              node.querySelector('span[style*="mask-image"], span.flex-1, span')?.textContent || '',
            );
            return {
              id,
              name,
              remoteUrl: href || null,
            };
          })
          .filter((item) => item.id && item.name);
      const scroller = pickScroller();
      let previousCount = -1;
      let stableReads = 0;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const count = collect().length;
        const mainText = normalize(document.querySelector('main')?.textContent || '');
        const loadMore = mainText.includes('scroll to load more');
        if (count === previousCount) {
          stableReads += 1;
        } else {
          stableReads = 0;
          previousCount = count;
        }
        if (!loadMore && stableReads >= 2) {
          break;
        }
        if (scroller instanceof HTMLElement) {
          scroller.scrollTop = scroller.scrollHeight;
          scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(350);
      }
      return collect();
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const rawItems = Array.isArray(result.result?.value) ? (result.result.value as GrokAccountFileProbe[]) : [];
  const deduped = new Map<string, GrokAccountFileProbe>();
  for (const item of rawItems) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!id || !name) continue;
    if (!deduped.has(id)) {
      deduped.set(id, {
        id,
        name,
        remoteUrl: typeof item.remoteUrl === 'string' && item.remoteUrl.trim().length > 0 ? item.remoteUrl : undefined,
      });
    }
  }
  return Array.from(deduped.values());
}

async function readVisibleConversationFilesWithClient(
  client: ChromeClient,
  conversationId: string,
): Promise<FileRef[]> {
  const result = await client.Runtime.evaluate({
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const collectRows = () => {
        const primary = Array.from(document.querySelectorAll('main [id^="response-"]'));
        if (primary.length > 0) return primary;
        return Array.from(document.querySelectorAll('main div[class*="items-end"]'));
      };
      const collectItems = () => {
        const items = [];
        const rows = collectRows();
        rows.forEach((row, rowIndex) => {
          const classText = String(row.getAttribute('class') || '');
          const looksLikeUserRow = classText.includes('items-end') || /justify-end/.test(classText);
          if (!looksLikeUserRow) return;
          const rowId = normalize(row.getAttribute('id') || '');
          const chips = Array.from(
            row.querySelectorAll('div[class*="bg-chip"], div[class*="group/chip"], div[data-state]'),
          )
            .filter((chip) => chip.querySelector('span'))
            .filter((chip) => !chip.closest('button'));
          chips.forEach((chip, chipIndex) => {
            const name = normalize(
              chip.querySelector('span.truncate, span[class*="truncate"], span')?.textContent || '',
            );
            if (!name) return;
            const fileTypeLabel = normalize(
              chip.querySelector('svg[aria-label], [role="img"][aria-label]')?.getAttribute('aria-label') || '',
            );
            const link = chip.querySelector('a[href]');
            const href =
              link instanceof HTMLAnchorElement ? link.href : normalize(link?.getAttribute('href') || '') || null;
            items.push({
              rowId: rowId || null,
              rowIndex,
              chipIndex,
              name,
              fileTypeLabel: fileTypeLabel || null,
              remoteUrl: href,
            });
          });
        });
        return items;
      };
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const items = collectItems();
        if (items.length > 0) {
          return items;
        }
        await sleep(200);
      }
      return collectItems();
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const rawItems = Array.isArray(result.result?.value) ? (result.result.value as GrokConversationFileProbe[]) : [];
  return mapGrokConversationFileProbes(conversationId, rawItems);
}

async function uploadAccountFilesWithClient(
  client: ChromeClient,
  paths: string[],
): Promise<void> {
  await waitForGrokFilesPageReady(client);
  const tagResult = await client.Runtime.evaluate({
    expression: `(() => {
      const input =
        document.querySelector(${JSON.stringify(GROK_ACCOUNT_FILE_UPLOAD_INPUT_SELECTOR)}) ||
        document.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false };
      }
      input.setAttribute('data-oracle-account-upload', 'true');
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  if (!tagResult.result?.value?.ok) {
    throw new Error('Account files upload input not found');
  }
  for (const filePath of paths) {
    await transferAttachmentViaDataTransfer(
      client.Runtime,
      {
        path: filePath,
        displayPath: filePath,
      },
      'input[type="file"][data-oracle-account-upload="true"]',
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitForAccountFilesPersisted(
  client: ChromeClient,
  fileNames: string[],
  timeoutMs = 15_000,
): Promise<void> {
  const expected = Array.from(
    new Set(
      fileNames
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (expected.length === 0) {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  let missing = expected;
  while (Date.now() < deadline) {
    const files = await readVisibleAccountFilesWithClient(client).catch(() => []);
    const present = new Set(files.map((file) => file.name.toLowerCase()));
    missing = expected.filter((name) => !present.has(name));
    if (missing.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Uploaded account file(s) did not persist: ${missing.join(', ')}`);
}

async function removeAccountFileWithClient(
  client: ChromeClient,
  fileId: string,
): Promise<void> {
  await readVisibleAccountFilesWithClient(client);
  const marked = await client.Runtime.evaluate({
    expression: `(() => {
      const targetId = ${JSON.stringify(fileId)};
      const rows = Array.from(document.querySelectorAll(${JSON.stringify(GROK_ACCOUNT_FILE_LINK_SELECTOR)}));
      for (const row of rows) {
        const href = row instanceof HTMLAnchorElement ? row.href : String(row.getAttribute('href') || '');
        try {
          const id = new URL(href, location.origin).searchParams.get('file') || '';
          if (id === targetId) {
            row.setAttribute('data-oracle-account-file-row', 'true');
            return { ok: true };
          }
        } catch {}
      }
      return { ok: false };
    })()`,
    returnByValue: true,
  });
  if (!marked.result?.value?.ok) {
    throw new Error(`Account file ${fileId} not found`);
  }
  await hoverElement(client.Runtime, client.Input, {
    selector: '[data-oracle-account-file-row="true"]',
    timeoutMs: 5000,
  });
  const clicked = await pressButton(client.Runtime, {
    selector: 'button[aria-label="Delete file"]',
    rootSelectors: ['[data-oracle-account-file-row="true"]'],
    requireVisible: true,
    timeoutMs: 5000,
    logCandidatesOnMiss: true,
  });
  if (!clicked.ok) {
    const fallback = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector('[data-oracle-account-file-row="true"]');
        const button = row?.querySelector('button[aria-label="Delete file"]');
        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false };
        }
        button.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (!fallback.result?.value?.ok) {
      throw new Error(clicked.reason || `Delete button not found for account file ${fileId}`);
    }
  }
  if (await waitForDialog(client.Runtime, 1_500)) {
    const confirmed = await pressDialogButton(client.Runtime, {
      match: { exact: ['delete', 'remove'], includeAny: ['delete', 'remove'] },
      preferLast: true,
      timeoutMs: 3_000,
    });
    if (!confirmed.ok) {
      throw new Error(confirmed.reason || `Delete confirmation not found for account file ${fileId}`);
    }
    await waitForNotSelector(client.Runtime, DEFAULT_DIALOG_SELECTORS.join(', '), 5_000).catch(() => undefined);
    return;
  }
  const stagedDelete = await waitForPredicate(
    client.Runtime,
    `(() => {
      const row = document.querySelector('[data-oracle-account-file-row="true"]');
      if (!row) {
        return true;
      }
      return Boolean(
        row.querySelector('button[aria-label="Delete"]') &&
        row.querySelector('button[aria-label="Cancel"]'),
      );
    })()`,
    { timeoutMs: 3_000, pollMs: 150, description: 'account file staged delete actions' },
  );
  if (!stagedDelete.ok) {
    return;
  }
  const rowStillPresent = await client.Runtime.evaluate({
    expression: `(() => Boolean(document.querySelector('[data-oracle-account-file-row="true"]')))()`,
    returnByValue: true,
  });
  if (!rowStillPresent.result?.value) {
    return;
  }
  await hoverElement(client.Runtime, client.Input, {
    selector: '[data-oracle-account-file-row="true"]',
    timeoutMs: 5_000,
  });
  const stagedClicked = await pressButton(client.Runtime, {
    selector: 'button[aria-label="Delete"]',
    rootSelectors: ['[data-oracle-account-file-row="true"]'],
    requireVisible: true,
    timeoutMs: 5_000,
    logCandidatesOnMiss: true,
  });
  if (!stagedClicked.ok) {
    const fallback = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector('[data-oracle-account-file-row="true"]');
        const button = row?.querySelector('button[aria-label="Delete"]');
        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false };
        }
        button.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (!fallback.result?.value?.ok) {
      throw new Error(stagedClicked.reason || `Inline delete confirmation not found for account file ${fileId}`);
    }
  }
  if (await waitForDialog(client.Runtime, 1_500)) {
    const confirmed = await pressDialogButton(client.Runtime, {
      match: { exact: ['delete', 'remove'], includeAny: ['delete', 'remove'] },
      preferLast: true,
      timeoutMs: 3_000,
    });
    if (!confirmed.ok) {
      throw new Error(confirmed.reason || `Delete confirmation not found for account file ${fileId}`);
    }
    await waitForNotSelector(client.Runtime, DEFAULT_DIALOG_SELECTORS.join(', '), 5_000).catch(() => undefined);
  }
}

async function waitForAccountFileRemoved(
  client: ChromeClient,
  fileId: string,
  timeoutMs = 12_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = await readVisibleAccountFilesWithClient(client).catch(() => []);
    if (!files.some((file) => file.id === fileId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Account file ${fileId} still appears on the Grok files page after delete`);
}

async function setPersonalFilesSearchQuery(client: ChromeClient, query: string): Promise<void> {
  await ensurePersonalFilesModalOpen(client);
  const result = await client.Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]');
      if (!root) return { ok: false };
      const input = root.querySelector(${JSON.stringify(GROK_PERSONAL_FILES_SEARCH_SELECTOR)});
      if (!input) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, ${JSON.stringify(query)});
      else input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  if (!result.result?.value?.ok) {
    throw new Error('Personal files search input not found');
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export async function ensureProjectSourcesTabSelected(client: ChromeClient): Promise<void> {
  await waitForSelector(client.Runtime, '[role="tablist"]', 5000);
  const evalResult = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const sources = tabs.find((tab) => normalize(tab.textContent || '') === 'sources');
      if (!sources) {
        const sourcesContent = document.querySelector(${JSON.stringify(GROK_SOURCES_CONTENT_SELECTOR)});
        if (sourcesContent) return { ok: true, active: true };
        const filesRow = Array.from(document.querySelectorAll('div')).find((node) => {
          const text = normalize(node.textContent || '');
          if (text !== 'files' && !text.startsWith('files')) return false;
          const klass = (node.getAttribute('class') || '').toLowerCase();
          return klass.includes('group/collapsible-row');
        });
        return filesRow ? { ok: true, active: true } : { ok: false, reason: 'Sources tab not found' };
      }
      const active =
        sources.getAttribute('aria-selected') === 'true' ||
        sources.getAttribute('data-state') === 'active';
      return { ok: true, active };
    })()`,
    returnByValue: true,
  });
  const info = evalResult.result?.value as { ok?: boolean; active?: boolean; reason?: string } | undefined;
  if (!info?.ok) {
    const filesReady = await waitForSelector(client.Runtime, GROK_SOURCES_FILES_ROW_SELECTOR, 5000);
    if (filesReady) {
      return;
    }
    throw new Error(info?.reason || 'Sources tab not found');
  }
  if (info.active) {
    return;
  }
  const pressed = await pressButton(client.Runtime, {
    match: { exact: ['sources'] },
    rootSelectors: ['[role="tablist"]'],
    timeoutMs: 5000,
    postSelector: GROK_SOURCES_CONTENT_SELECTOR,
    logCandidatesOnMiss: true,
  });
  if (!pressed.ok) {
    throw new Error(pressed.reason || 'Failed to activate Sources tab');
  }
  await waitForProjectSourcesTab(client);
}

export async function ensureProjectSourcesFilesExpanded(client: ChromeClient): Promise<void> {
  const directSelector = `${GROK_SOURCES_ROOT_SELECTOR} div${cssClassContains('group/collapsible-row')} button`;
  const hasRows = await waitForSelector(client.Runtime, GROK_ASSET_ROW_SELECTOR, 500);
  if (hasRows) {
    return;
  }
  const pressed = await pressButton(client.Runtime, {
    selector: directSelector,
    match: { includeAny: ['files'] },
    rootSelectors: [GROK_SOURCES_ROOT_SELECTOR],
    requireVisible: true,
    timeoutMs: 2000,
  });
  if (!pressed.ok) {
    return;
  }
  await waitForSelector(client.Runtime, GROK_ASSET_ROW_SELECTOR, 2000);
}

export async function clickProjectSourcesAttachWithClient(client: ChromeClient): Promise<void> {
  await ensureProjectSourcesFilesExpanded(client);
  await ensurePersonalFilesModalOpen(client);
  const opened = await openRadixMenu(client.Runtime, {
    trigger: {
      selector: 'button',
      rootSelectors: [`[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`],
      match: { exact: ['attach'] },
      requireVisible: true,
    },
    menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
    timeoutMs: 2000,
  });
  if (!opened.ok) {
    throw new Error('Project sources attach menu did not open');
  }
}

export async function clickProjectSourcesUploadFileWithClient(client: ChromeClient): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickProjectSourcesAttachWithClient(client);
    await waitForSelector(
      client.Runtime,
      '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
      3000,
    );
    const clicked = await selectMenuItem(client.Runtime, {
      menuSelector: '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]',
      menuRootSelectors: [
        '[role="menu"][data-state="open"]',
        '[data-radix-menu-content][data-state="open"]',
      ],
      itemMatch: { exact: ['upload a file'], includeAny: ['upload a file'] },
      closeMenuAfter: false,
      timeoutMs: 3000,
    });
    if (clicked) return;
  }
  const labelsEval = await client.Runtime.evaluate({
    expression: `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]'))
        .filter((el) => visible(el))
        .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 20);
      return { items };
    })()`,
    returnByValue: true,
  });
  const items = (labelsEval.result?.value?.items as string[] | undefined) ?? [];
  throw new Error(
    `Upload file menu item not found (visible menu items: ${items.join(', ')})`,
  );
}

export async function uploadProjectSourceFilesWithClient(
  client: ChromeClient,
  paths: string[],
): Promise<void> {
  await ensurePersonalFilesModalOpen(client);
  const ensureInput = async (): Promise<void> => {
    const hasInput = await client.Runtime.evaluate({
      expression: `(() => {
        const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
        return { ok: Boolean(root.querySelector('input[type="file"]') || document.querySelector('input[type="file"]')) };
      })()`,
      returnByValue: true,
    });
    if (hasInput.result?.value?.ok) return;
    await clickProjectSourcesUploadFileWithClient(client);
  };
  await ensureInput();
  const attachments = paths.map((filePath) => ({
    path: filePath,
    displayPath: filePath,
    source: 'project-sources',
  }));
  const tagResult = await client.Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
      const input = root.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
      if (!input) return { ok: false };
      input.setAttribute('data-oracle-project-upload', 'true');
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const tagged = tagResult.result?.value as { ok?: boolean } | undefined;
  if (!tagged?.ok) {
    throw new Error('Project sources upload input not found');
  }
  for (const attachment of attachments) {
    await transferAttachmentViaDataTransfer(
      client.Runtime,
      attachment,
      'input[type="file"][data-oracle-project-upload="true"]',
    );
    const name = path.basename(attachment.displayPath ?? attachment.path);
    const deadline = Date.now() + 5000;
    let confirmed = false;
    while (Date.now() < deadline) {
      const status = await client.Runtime.evaluate({
        expression: `(() => {
          const name = ${JSON.stringify(name)};
          const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
          const rows = Array.from(root.querySelectorAll('div')).filter((node) =>
            (node.textContent || '').includes(name),
          );
          for (const row of rows) {
            const text = (row.textContent || '').trim();
            if (!text) continue;
            if (/(?:^|[^0-9])0\\s*b(?:$|[^a-z])/i.test(text)) continue;
            return { ok: true, text };
          }
          return { ok: false };
        })()`,
        returnByValue: true,
      });
      const ok = status.result?.value?.ok;
      if (ok) {
        confirmed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!confirmed) {
      throw new Error(`Attachment "${name}" did not finish uploading (still 0 B).`);
    }
  }
}

async function waitForProjectSourcesUploadsComplete(
  client: ChromeClient,
  fileNames: string[],
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const normalized = fileNames.map((name) => name.toLowerCase());
  while (Date.now() < deadline) {
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const names = ${JSON.stringify(normalized)};
        const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
        const text = (root.textContent || '').toLowerCase();
        const missing = [];
        for (const name of names) {
          if (!text.includes(name)) missing.push(name);
        }
        if (missing.length > 0) {
          return { ok: false, reason: 'missing', missing };
        }
        const zeroByte = names.find((name) => {
          const idx = text.indexOf(name);
          if (idx === -1) return false;
          const snippet = text.slice(idx, idx + 80);
          return /(?:^|[^0-9])0\\s*b(?:$|[^a-z])/i.test(snippet);
        });
        if (zeroByte) {
          return { ok: false, reason: 'size', name: zeroByte };
        }
        if (text.includes('uploading') || text.includes('processing')) {
          return { ok: false, reason: 'busy' };
        }
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (result.result?.value?.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Project source uploads did not finish before timeout.');
}

export async function removeProjectSourceFileWithClient(
  client: ChromeClient,
  fileName: string,
): Promise<void> {
  await ensurePersonalFilesModalOpen(client);
  await setPersonalFilesSearchQuery(client, fileName);
  const deadline = Date.now() + 5000;
  let rowInfo: { ok: boolean; reason?: string } = { ok: false, reason: 'Row not found' };
  while (Date.now() < deadline) {
    rowInfo = await queryRowsByText(client.Runtime, {
      rootSelector: `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
      rowSelector: GROK_PERSONAL_FILES_ROW_SELECTOR,
      match: { text: fileName },
    });
    if (rowInfo.ok) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!rowInfo.ok) {
    throw new Error(rowInfo.reason || 'File row not found');
  }
  await hoverRowAndClickAction(client.Runtime, client.Input, {
    rootSelector: `[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]`,
    rowSelector: GROK_PERSONAL_FILES_ROW_SELECTOR,
    match: { text: fileName },
    actionMatch: { includeAny: ['remove', 'delete'] },
    timeoutMs: 5000,
  });
}

async function waitForProjectSourceFileMarkedRemoved(
  client: ChromeClient,
  fileName: string,
  timeoutMs = 10_000,
): Promise<void> {
  await ensurePersonalFilesModalOpen(client);
  await setPersonalFilesSearchQuery(client, fileName);
  const deadline = Date.now() + timeoutMs;
  const needle = fileName.toLowerCase();
  while (Date.now() < deadline) {
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const target = ${JSON.stringify(needle)};
        const root = document.querySelector('[${GROK_PERSONAL_FILES_MODAL_MARKER}="true"]') || document;
        const rows = Array.from(root.querySelectorAll('div')).filter((node) => {
          const text = String(node.textContent || '').toLowerCase();
          return text.includes(target);
        });
        for (const row of rows) {
          const classText = String(row.getAttribute('class') || '').toLowerCase();
          const hasOpacity = classText.includes('opacity-50');
          const hasUndo = Boolean(row.querySelector('button[aria-label="Undo"]'));
          const hasLineThrough = Boolean(row.querySelector('span.line-through'));
          if (hasOpacity || hasUndo || hasLineThrough) {
            return { ok: true, hasOpacity, hasUndo, hasLineThrough };
          }
        }
        return { ok: false };
      })()`,
      returnByValue: true,
    });
    if (result.result?.value?.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Project file "${fileName}" did not enter pending-remove state before timeout.`);
}

async function clickCreateProjectConfirmWithClient(client: ChromeClient): Promise<void> {
  await tagVisibleCreateProjectDialog(client);
  const finalStep = await waitForCreateProjectFinalStep(client, 5_000);
  if (!finalStep.ok) {
    const debug = await readCreateProjectDialogDebug(client);
    throw new Error(`Create project final step not ready (${formatCreateProjectDialogDebug(debug)})`);
  }

  const pressed = await pressButton(client.Runtime, {
    match: { exact: ['create'], includeAny: ['create'] },
    rootSelectors: [GROK_CREATE_PROJECT_DIALOG_SELECTOR],
    requireVisible: true,
    timeoutMs: 2_000,
  });
  if (!pressed.ok) {
    const debug = await readCreateProjectDialogDebug(client);
    throw new Error(`${pressed.reason || 'Create button not found'} (${formatCreateProjectDialogDebug(debug)})`);
  }
}

async function waitForCreateProjectFinalStep(
  client: ChromeClient,
  timeoutMs: number,
): Promise<{ ok: boolean; buttons?: string[] }> {
  await tagVisibleCreateProjectDialog(client);
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialog =
        document.querySelector(${JSON.stringify(GROK_CREATE_PROJECT_DIALOG_SELECTOR)}) ||
        Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).find((node) => visible(node)) ||
        null;
      if (!dialog) {
        return null;
      }
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const buttons = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const hasCreate = buttons.includes('create');
      const hasAddSourcesLater = buttons.includes('add sources later');
      const hasAttach = Array.from(dialog.querySelectorAll('button[aria-label="Attach"]')).some((node) => visible(node));
      if (!hasCreate || (!hasAddSourcesLater && !hasAttach)) {
        return null;
      }
      return { buttons };
    })()`,
    {
      timeoutMs,
      description: 'create-project final step',
    },
  );
  if (!ready.ok) {
    return { ok: false };
  }
  const probe = ready.value as { buttons?: string[] } | undefined;
  return {
    ok: true,
    buttons: Array.isArray(probe?.buttons) ? probe.buttons : undefined,
  };
}

async function readCreateProjectDialogDebug(
  client: ChromeClient,
): Promise<{ text?: string; buttons?: string[]; inputs?: string[] }> {
  await tagVisibleCreateProjectDialog(client);
  const result = await client.Runtime.evaluate({
    expression: `(() => {
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialog =
        document.querySelector(${JSON.stringify(GROK_CREATE_PROJECT_DIALOG_SELECTOR)}) ||
        Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).find((node) => visible(node)) ||
        null;
      if (!dialog) {
        return { text: null, buttons: [], inputs: [] };
      }
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const buttons = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const inputs = Array.from(dialog.querySelectorAll('input, textarea'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.value || ''))
        .filter(Boolean);
      return {
        text: normalize(dialog.textContent || '').slice(0, 240),
        buttons,
        inputs,
      };
    })()`,
    returnByValue: true,
  });
  return (result.result?.value as { text?: string; buttons?: string[]; inputs?: string[] } | undefined) ?? {};
}

function formatCreateProjectDialogDebug(debug: {
  text?: string;
  buttons?: string[];
  inputs?: string[];
}): string {
  const parts: string[] = [];
  if (debug.text) {
    parts.push(`text=${debug.text}`);
  }
  if (debug.buttons && debug.buttons.length > 0) {
    parts.push(`buttons=${debug.buttons.join('|')}`);
  }
  if (debug.inputs && debug.inputs.length > 0) {
    parts.push(`inputs=${debug.inputs.join('|')}`);
  }
  return parts.join(', ') || 'dialog=n/a';
}

async function tagVisibleCreateProjectDialog(client: ChromeClient): Promise<boolean> {
  const result = await client.Runtime.evaluate({
    expression: `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const existing = document.querySelector(${JSON.stringify(GROK_CREATE_PROJECT_DIALOG_SELECTOR)});
      if (existing && visible(existing)) {
        return true;
      }
      for (const node of Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))) {
        node.removeAttribute('data-oracle-create-project-dialog');
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(visible);
      const match =
        dialogs.find((node) =>
          Boolean(node.querySelector('input[placeholder*="project name" i], input[aria-label*="project name" i]')),
        ) || null;
      if (!match) {
        return false;
      }
      match.setAttribute('data-oracle-create-project-dialog', 'true');
      return true;
    })()`,
    returnByValue: true,
  });
  return Boolean(result.result?.value);
}

function isMissingGrokCloneMenuError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /menu item not found:\s*clone/i.test(error.message);
}

async function waitForProjectUrl(
  client: ChromeClient,
  timeoutMs: number,
  previousHref?: string,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { result } = await client.Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    const href = typeof result?.value === 'string' ? result.value : '';
    if (extractGrokProjectIdFromUrl(href) && (!previousHref || href !== previousHref)) {
      return href;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function waitForGrokProjectLinks(client: ChromeClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `Boolean(document.querySelector('main a[href*="/project/"], nav a[href*="/project/"], aside a[href*="/project/"]'))`,
      returnByValue: true,
    });
    if (result?.value) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function scrapeVisibleGrokProjects(client: ChromeClient): Promise<{
  items: GrokProjectLinkProbe[];
  error?: string | null;
  linkCount?: number | null;
}> {
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
    items: GrokProjectLinkProbe[];
    error?: string | null;
    linkCount?: number | null;
  };
}

async function recoverCreatedProjectUrlByName(
  client: ChromeClient,
  projectName: string,
  timeoutMs: number,
): Promise<string | null> {
  for (const url of [GROK_PROJECTS_INDEX_URL, GROK_HOME_URL]) {
    await navigateToProject(client, url);
    await waitForGrokProjectLinks(client, timeoutMs);
    const visible = await scrapeVisibleGrokProjects(client);
    const match = findGrokProjectByName(visible.items, projectName);
    if (match?.url) {
      return match.url;
    }
    if (match?.id) {
      return `https://grok.com/project/${match.id}?tab=conversations`;
    }
  }
  return null;
}

async function readProjectNameFromPage(client: ChromeClient): Promise<string | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const input = document.querySelector('input[aria-label="Project name"]');
      if (input && input.value) return String(input.value || '').trim();
      const header = document.querySelector('h1, h2, header h1, header h2');
      if (header && header.textContent) return String(header.textContent || '').trim();
      const title = document.title || '';
      if (!title) return null;
      return title.replace(/\\s*-\\s*Grok\\s*$/i, '').trim();
    })()`,
    returnByValue: true,
  });
  const name = typeof result?.value === 'string' ? result.value.trim() : '';
  return name.length > 0 ? name : null;
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
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string; id?: string } | null }>;
      })
    | undefined;
  if (serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: projectUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    const resolvedPort = target.port ?? port;
    const resolvedTargetId = resolveGrokTargetId(target.tab);
    if (resolvedTargetId && resolvedPort) {
      const client = await CDP({ host, port: resolvedPort, target: resolvedTargetId });
      await Promise.all([client.Page.enable(), client.Runtime.enable()]);
      return {
        client,
        targetId: resolvedTargetId,
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
    throw new Error('Missing DevTools port. Launch a Grok browser session or set AURACALL_BROWSER_PORT.');
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
  let usedExisting = Boolean(resolveGrokTargetId(targetInfo));
  const tabPolicy = resolveBrowserTabPolicy(options);
  if (!resolveGrokTargetId(targetInfo)) {
    const opened = await openOrReuseChromeTarget(resolvedPort, projectUrl, {
      host,
      reusePolicy: 'same-origin',
      matchingTabLimit: tabPolicy.serviceTabLimit,
      blankTabLimit: tabPolicy.blankTabLimit,
      collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
      suppressFocus: tabPolicy.suppressFocus,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  }
  const targetId = resolveGrokTargetId(targetInfo);
  if (!targetId) {
    throw new Error('No grok.com project tab found. Launch a Grok browser session and retry.');
  }
  const client = await CDP({ host, port: resolvedPort, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { client, targetId, shouldClose, host, port: resolvedPort, usedExisting };
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

function resolveGrokTargetId(
  target:
    | { targetId?: string | null; id?: string | null }
    | string
    | null
    | undefined,
): string | undefined {
  if (typeof target === 'string') {
    const trimmed = target.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  const resolved = target?.targetId ?? target?.id;
  if (typeof resolved !== 'string') {
    return undefined;
  }
  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function selectPreferredGrokTarget<T extends { url?: string | null }>(
  targets: T[],
  preferredUrl?: string,
): T | undefined {
  if (targets.length === 0) {
    return undefined;
  }
  if (!preferredUrl) {
    return targets[0];
  }
  const exact = targets.find((target) => grokUrlMatchesPreference(target.url, preferredUrl));
  if (exact) {
    return exact;
  }
  return grokUsesBroadTargetMatch(preferredUrl)
    ? targets.find((target) => typeof target.url === 'string' && target.url.includes('grok.com')) ?? targets[0]
    : undefined;
}

async function currentGrokUrlMatchesPreference(
  client: ChromeClient,
  preferredUrl: string,
): Promise<boolean> {
  const { result } = await client.Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  const currentUrl = typeof result?.value === 'string' ? result.value : '';
  return grokUrlMatchesPreference(currentUrl, preferredUrl);
}

function grokUsesBroadTargetMatch(preferredUrl: string): boolean {
  try {
    return normalizeGrokUrlPath(new URL(preferredUrl).pathname) === '/';
  } catch {
    return preferredUrl === GROK_HOME_URL;
  }
}

function normalizeGrokUrlPath(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return trimmed.replace(/\/+$/, '') || '/';
}

function normalizeGrokUrlSearch(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .filter(([key]) => key.toLowerCase() !== 'rid')
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
      }
      return leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function grokFilesPathExpression(): string {
  return `(() => {
    try {
      return new URL(location.href).pathname === '/files';
    } catch {
      return location.pathname === '/files';
    }
  })()`;
}

function grokFilesPageReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
    if (location.pathname !== '/files') {
      return false;
    }
    const heading = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]')).some((node) =>
      normalize(node.textContent || '') === 'files',
    );
    const uploadInput = Boolean(
      document.querySelector(${JSON.stringify(GROK_ACCOUNT_FILE_UPLOAD_INPUT_SELECTOR)}) ||
      document.querySelector('main input[type="file"]'),
    );
    const searchInput = Boolean(
      document.querySelector(${JSON.stringify(GROK_PERSONAL_FILES_SEARCH_SELECTOR)}) ||
      document.querySelector('input[placeholder*="search" i]'),
    );
    const fileLinks = document.querySelectorAll(${JSON.stringify(GROK_ACCOUNT_FILE_LINK_SELECTOR)}).length;
    const mainText = normalize(document.querySelector('main')?.textContent || '');
    const emptyState = mainText.includes('files') && (mainText.includes('private') || mainText.includes('upload'));
    return (heading && uploadInput) || (searchInput && uploadInput) || fileLinks > 0 || emptyState;
  })()`;
}

function grokUrlSettleExpression(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    const targetPath = normalizeGrokUrlPath(parsed.pathname);
    const targetSearch = normalizeGrokUrlSearch(parsed.searchParams);
    return `(() => {
      const normalizePath = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed || trimmed === '/') {
          return '/';
        }
        return trimmed.replace(/\\/+$/, '') || '/';
      };
      const normalizeSearch = (params) =>
        Array.from(params.entries())
          .filter(([key]) => String(key || '').toLowerCase() !== 'rid')
          .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
            if (leftKey !== rightKey) {
              return leftKey.localeCompare(rightKey);
            }
            return leftValue.localeCompare(rightValue);
          })
          .map(([key, value]) => \`\${key}=\${value}\`)
          .join('&');
      try {
        const current = new URL(location.href);
        return current.host === ${JSON.stringify(parsed.host)} &&
          normalizePath(current.pathname) === ${JSON.stringify(targetPath)} &&
          normalizeSearch(current.searchParams) === ${JSON.stringify(targetSearch)};
      } catch {
        return false;
      }
    })()`;
  } catch {
    return `location.href === ${JSON.stringify(targetUrl)}`;
  }
}

async function navigateToProject(client: ChromeClient, url: string): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    timeoutMs: 15_000,
    fallbackTimeoutMs: 15_000,
    pollMs: 200,
    routeExpression: grokUrlSettleExpression(url),
    routeDescription: `Grok route ${url}`,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Grok page did not navigate to ${url}`);
  }
  await ensureGrokTabVisible(client);
  if (!(await isValidProjectUrl(client))) {
    throw new Error('Project URL is invalid or points to a deleted project.');
  }
}

async function navigateToConversation(client: ChromeClient, url: string): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    timeoutMs: 15_000,
    fallbackTimeoutMs: 15_000,
    pollMs: 200,
    routeExpression: grokUrlSettleExpression(url),
    routeDescription: `Grok conversation route ${url}`,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error(`Grok conversation did not navigate to ${url}`);
  }
  await ensureGrokTabVisible(client);
  if (!(await isValidConversationUrl(client))) {
    throw new Error('Conversation URL is invalid or missing.');
  }
}

async function waitForDocumentReady(client: ChromeClient, timeoutMs: number): Promise<void> {
  const ready = await waitForDocumentReadyUi(client.Runtime, {
    timeoutMs,
    pollMs: 200,
  });
  if (!ready.ok) {
    throw new Error('Document did not become ready');
  }
}

async function waitForGrokConversationSurface(
  Runtime: ChromeClient['Runtime'],
  options?: { timeoutMs?: number; requireResponse?: boolean },
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const requireResponse = options?.requireResponse ?? false;
  return waitForPredicate(
    Runtime,
    `(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      let isConversation = false;
      try {
        const current = new URL(location.href);
        isConversation =
          /\\/c\\/[^/?#]+$/.test(current.pathname) ||
          (current.pathname.startsWith('/project/') && current.searchParams.has('chat'));
      } catch {
        isConversation = /\\/c\\//.test(location.pathname) || /(?:\\?|&)chat=/.test(location.search);
      }
      if (!isConversation) return false;
      if (main.querySelector('[id^="response-"], div.message-bubble, [class*="response-content-markdown"]')) {
        return true;
      }
      if (${JSON.stringify(requireResponse)}) {
        return false;
      }
      if (
        main.querySelector(
          'div[class*="bg-chip"] span, div[class*="group/chip"] span, a[href*="/files?file="], a[href*="/files?"]',
        )
      ) {
        return true;
      }
      const conversationRows = Array.from(
        main.querySelectorAll('div[class*="items-end"], div[class*="items-start"], div[class*="message"]'),
      ).filter((node) => {
        const text = String(node.textContent || '').trim();
        if (text.length === 0) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return conversationRows.length > 0;
    })()`,
    {
      timeoutMs,
      description: requireResponse ? 'grok-conversation-response' : 'grok-conversation-surface',
    },
  );
}

async function openProjectRenameEditor(
  client: ChromeClient,
  options?: { logPrefix?: string; projectId?: string; projectName?: string | null },
): Promise<void> {
  await ensureGrokTabVisible(client);
  const renameInputSelector = 'input[aria-label="Project name"], input[aria-label^="Rename "]';
  const isProjectIndex = await client.Runtime.evaluate({
    expression: `location.pathname.replace(/\\/+$/, '') === '/project'`,
    returnByValue: true,
  });
  if (!isProjectIndex.result?.value) {
    await waitForPredicate(
      client.Runtime,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const headings = Array.from(document.querySelectorAll('main h1, main h2, header h1, header h2'))
          .filter((node) => visible(node))
          .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter((text) => text.length > 0);
        if (headings.length > 0) {
          return true;
        }
        return Boolean(
          document.querySelector('button[aria-label="Options"]') ||
          document.querySelector('button[aria-label="Open menu"]') ||
          document.querySelector('main [role="button"]') ||
          document.querySelector('main [data-sidebar="menu-button"]'),
        );
      })()`,
      {
        timeoutMs: 10_000,
        description: 'grok-project-rename-surface',
      },
    );
    const openedFromHeader = await client.Runtime.evaluate({
      expression: `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const title = normalize((document.title || '').replace(/\\s*-\\s*Grok\\s*$/i, ''));
        const headings = Array.from(document.querySelectorAll('h1[role="button"], h1, h2[role="button"], h2'));
        const match =
          headings.find((el) => visible(el) && normalize(el.textContent) === title) ||
          headings.find((el) => visible(el) && (el.getAttribute('role') || '').toLowerCase() === 'button') ||
          null;
        if (!match) {
          return { ok: false };
        }
        match.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const headerOpened = (openedFromHeader.result?.value as { ok?: boolean } | undefined)?.ok === true;
    if (headerOpened) {
      const inputReady = await waitForSelector(client.Runtime, renameInputSelector, 3000);
      if (inputReady) {
        return;
      }
    }
  }
  await openProjectMenuAndSelect(client, 'Rename', {
    logPrefix: options?.logPrefix,
    preferSidebarRow: true,
    projectId: options?.projectId,
    projectName: options?.projectName,
  });
  const inputReady = await waitForSelector(client.Runtime, renameInputSelector, 3000);
  if (!inputReady) {
    throw new Error('Project rename input not found');
  }
}

async function submitProjectRenameWithClient(client: ChromeClient, newTitle: string): Promise<void> {
  const commitInfo = await submitInlineRename(client.Runtime, {
    value: newTitle,
    inputSelector: 'input[aria-label="Project name"], input[aria-label^="Rename "]',
    rootSelectors: ['header', 'main'],
    saveButtonMatch: { exact: ['save'] },
    closeSelector: 'input[aria-label="Project name"], input[aria-label^="Rename "]',
    timeoutMs: 3_000,
  });
  if (!commitInfo.ok) {
    throw new Error(commitInfo.reason || 'Project rename submit failed');
  }
}

async function waitForProjectRenameApplied(
  client: ChromeClient,
  newTitle: string,
  timeoutMs: number,
): Promise<{ ok: boolean }> {
  const applied = await waitForPredicate(
    client.Runtime,
    `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(newTitle)});
      const input = Array.from(document.querySelectorAll('input[aria-label="Project name"], input[aria-label^="Rename "]')).find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
      const heading = Array.from(document.querySelectorAll('h1, h2, header h1, header h2')).find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
      const title = normalize((document.title || '').replace(/\\s*-\\s*Grok\\s*$/i, ''));
      const current = normalize((heading && heading.textContent) || title || (input && input.value) || '');
      if (!current || current !== expected) {
        return null;
      }
      return { current, visibleInput: Boolean(input) };
    })()`,
    {
      timeoutMs,
      description: 'grok-project-rename-applied',
    },
  );
  return { ok: applied.ok };
}

async function waitForProjectRenameAppliedInList(
  Runtime: ChromeClient['Runtime'],
  projectId: string,
  newTitle: string,
  timeoutMs: number,
): Promise<{ ok: boolean }> {
  const applied = await waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(newTitle)});
      const projectId = ${JSON.stringify(projectId)};
      const links = Array.from(document.querySelectorAll('a[href*="/project/"]'));
      const match = links.find((link) => {
        const href = link.getAttribute('href') || '';
        return href.includes('/project/' + projectId);
      }) || null;
      if (!match) {
        return null;
      }
      const current = normalize(match.textContent || '');
      return current === expected ? { current } : null;
    })()`,
    {
      timeoutMs,
      description: 'grok-project-rename-applied-list',
    },
  );
  return { ok: applied.ok };
}

async function readProjectRenameDebug(
  client: ChromeClient,
): Promise<{ current?: string; visibleInput?: boolean }> {
  const result = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const input = Array.from(document.querySelectorAll('input[aria-label="Project name"], input[aria-label^="Rename "]')).find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
      const heading = Array.from(document.querySelectorAll('h1, h2, header h1, header h2')).find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
      return {
        current: normalize((heading && heading.textContent) || (document.title || '').replace(/\\s*-\\s*Grok\\s*$/i, '') || (input && input.value) || ''),
        visibleInput: Boolean(input),
      };
    })()`,
    returnByValue: true,
  });
  return (result.result?.value as { current?: string; visibleInput?: boolean } | undefined) ?? {};
}

export async function openProjectMenuButton(
  client: ChromeClient,
  options?: { logPrefix?: string; preferSidebarRow?: boolean; projectId?: string; projectName?: string | null },
): Promise<string> {
  return withUiDiagnostics(
    client.Runtime,
    async () => {
      await ensureGrokTabVisible(client);
      const menuSelector = '[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"], [role="menu"]';
      const isActualMenuSelector = (selector?: string | null): boolean =>
        typeof selector === 'string' &&
        (selector.includes('[role="menu"') || selector.includes('[data-radix-menu-content'));
      if (!options?.preferSidebarRow) {
        for (const label of ['Open menu', 'Options']) {
          const mainScoped = await pressMenuButtonByAriaLabel(client.Runtime, {
            label,
            rootSelectors: ['main'],
            menuSelector,
            timeoutMs: 2000,
          });
          if (mainScoped.ok && isActualMenuSelector(mainScoped.menuSelector)) {
            return mainScoped.menuSelector || menuSelector;
          }
        }
        for (const label of ['Options', 'Open menu']) {
          const direct = await pressMenuButtonByAriaLabel(client.Runtime, {
            label,
            menuSelector,
            timeoutMs: 2000,
          });
          if (direct.ok && isActualMenuSelector(direct.menuSelector)) {
            return direct.menuSelector || menuSelector;
          }
        }
      }

      await waitForSelector(client.Runtime, 'button[aria-label="Options"], button[aria-label="Open menu"]', 5000);
      const projectName = await readProjectNameFromPage(client);
      const tagResult = await client.Runtime.evaluate({
        expression: `(() => {
      const name = ${JSON.stringify(options?.projectName ?? projectName ?? '')};
      const explicitProjectId = ${JSON.stringify(options?.projectId ?? '')};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const target = normalize(name);
      const explicitId = normalize(explicitProjectId);
      const pathMatch = window.location.pathname.match(/\\/project\\/([^/?#]+)/i);
      const currentProjectId = pathMatch?.[1]?.toLowerCase() || '';
      document
        .querySelectorAll('[data-oracle-project-row], [data-oracle-project-options], [data-oracle-project-link]')
        .forEach((node) => {
          node.removeAttribute('data-oracle-project-row');
          node.removeAttribute('data-oracle-project-options');
          node.removeAttribute('data-oracle-project-link');
        });
      const findProjectRow = (link) => {
        const candidates = [
          link.closest('li'),
          link.closest('div.max-h-11'),
          link.closest('div[class*="menu-item"]'),
          link.closest('div[class*="sidebar"]'),
          link.parentElement,
          link.closest('div'),
          link,
        ].filter(Boolean);
        for (const candidate of candidates) {
          if (!(candidate instanceof Element)) continue;
          if (candidate.querySelector('a[href*="/project/"]')) {
            return candidate;
          }
        }
        return link;
      };
      const sidebarRoots = [
        document.querySelector(${JSON.stringify(GROK_SIDEBAR_WRAPPER_SELECTOR)}),
        document.querySelector('[data-sidebar="sidebar"]'),
        document.querySelector('nav'),
        document.querySelector('aside'),
      ].filter(Boolean);
      const seenLinks = new Set();
      const collectLinks = (roots) => {
        const values = [];
        for (const root of roots) {
          if (!(root instanceof Element)) continue;
          for (const link of Array.from(root.querySelectorAll('a[href*="/project/"]'))) {
            if (seenLinks.has(link)) continue;
            seenLinks.add(link);
            values.push(link);
          }
        }
        return values;
      };
      const sidebarLinks = collectLinks(sidebarRoots);
      const links = sidebarLinks.length > 0
        ? sidebarLinks
        : Array.from(document.querySelectorAll('a[href*="/project/"]'));
      const extractRowInfo = (link) => {
        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/\\/project\\/([^/?#]+)/i);
        const id = idMatch?.[1]?.toLowerCase() || '';
        const row = findProjectRow(link);
        const title = normalize(link.textContent || row.textContent || '');
        return { row, link, id, title };
      };
      const entries = links.map(extractRowInfo).filter((entry) => entry.row);
      const match =
        entries.find((entry) => explicitId && entry.id === explicitId) ||
        entries.find((entry) => currentProjectId && entry.id === currentProjectId) ||
        entries.find((entry) => target && entry.title === target) ||
        entries.find((entry) => target && entry.title.includes(target)) ||
        null;
      if (!match) return { ok: false };
      match.row.setAttribute('data-oracle-project-row', 'true');
      match.link.setAttribute('data-oracle-project-link', 'true');
      return { ok: true };
    })()`,
      });
      const tagged = tagResult.result?.value as { ok?: boolean } | undefined;
      if (tagged?.ok) {
        try {
          const revealResult = await hoverAndReveal(client.Runtime, client.Input, {
            rowSelector: '[data-oracle-project-row="true"]',
            rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside'],
            actionMatch: { exact: ['options', 'open menu'] },
            timeoutMs: 3000,
          });
          if (revealResult.ok) {
            const taggedButton = await waitForPredicate(
              client.Runtime,
              `(() => {
            const visible = (node) => {
              if (!(node instanceof HTMLElement)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const row = document.querySelector('[data-oracle-project-row="true"]');
            const link = document.querySelector('[data-oracle-project-link="true"]');
            if (!(link instanceof HTMLElement)) {
              return null;
            }
            const roots = [row, link.closest('nav'), link.closest('aside'), document].filter(Boolean);
            const seen = new Set();
            const candidates = [];
            for (const root of roots) {
              if (!(root instanceof Element || root instanceof Document)) continue;
              for (const button of Array.from(
                root.querySelectorAll('button[aria-label="Options"], button[aria-label="Open menu"], button[aria-haspopup="menu"]'),
              )) {
                if (seen.has(button) || !visible(button)) continue;
                seen.add(button);
                candidates.push(button);
              }
            }
            const rowElement = row instanceof HTMLElement ? row : null;
            const linkRect = link.getBoundingClientRect();
            const score = (button) => {
              const rect = button.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const linkCenterX = linkRect.left + linkRect.width / 2;
              const linkCenterY = linkRect.top + linkRect.height / 2;
              const dy = Math.abs(centerY - linkCenterY);
              const dx = Math.abs(centerX - linkCenterX);
              const sameRow = rowElement ? rowElement.contains(button) : false;
              const overlapY = Math.max(0, Math.min(rect.bottom, linkRect.bottom) - Math.max(rect.top, linkRect.top));
              return dy * 1000 + dx - overlapY * 10 + (sameRow ? -500 : 0);
            };
            const best = candidates
              .map((button) => ({ button, score: score(button) }))
              .sort((a, b) => a.score - b.score)[0]?.button || null;
            if (!(best instanceof HTMLElement)) {
              return null;
            }
            document
              .querySelectorAll('[data-oracle-project-options]')
              .forEach((node) => node.removeAttribute('data-oracle-project-options'));
            best.setAttribute('data-oracle-project-options', 'true');
            return { tagged: true };
          })()`,
              {
                timeoutMs: 1_500,
                description: 'visible project row menu button',
              },
            );
            if (taggedButton.ok) {
              const opened = await openRevealedRowMenu(client, {
                rowSelector: '[data-oracle-project-row="true"]',
                triggerSelector: '[data-oracle-project-options="true"]',
                rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside'],
                triggerRootSelectors: ['[data-oracle-project-row="true"]'],
                actionMatch: { exact: ['options', 'open menu'] },
                menuSelector,
                prepareTriggerBeforeOpen: true,
                directTriggerClickFallback: true,
                timeoutMs: 3_000,
              });
              if (opened.ok && isActualMenuSelector(opened.menuSelector)) {
                return opened.menuSelector || menuSelector;
              }
            }
          }
        } catch {
          // Fall through to broader project-menu strategies if the tagged row is transient.
        }
      }
      for (const label of ['Options', 'Open menu']) {
        const pressed = await pressMenuButtonByAriaLabel(client.Runtime, {
          label,
          rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]'],
          menuSelector,
          timeoutMs: 5000,
        });
        if (pressed.ok && isActualMenuSelector(pressed.menuSelector)) {
          return pressed.menuSelector || menuSelector;
        }
      }
      for (const label of ['Options', 'Open menu']) {
        const globalOpen = await pressMenuButtonByAriaLabel(client.Runtime, {
          label,
          menuSelector,
          timeoutMs: 5000,
        });
        if (globalOpen.ok && isActualMenuSelector(globalOpen.menuSelector)) {
          return globalOpen.menuSelector || menuSelector;
        }
      }
      throw new Error('Project menu button not found');
    },
    {
      label: 'grok-project-menu',
      rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside', 'main'],
      menuSelectors: [
        '[role="menu"][data-state="open"]',
        '[data-radix-menu-content][data-state="open"]',
        '[role="menu"]',
      ],
      candidateSelectors: [
        '[data-oracle-project-row="true"]',
        '[data-oracle-project-options="true"]',
        '[data-oracle-project-link="true"]',
        'a[href*="/project/"]',
        'button[aria-label="Options"]',
        'button[aria-label="Open menu"]',
      ],
      buttonSelectors: [
        'button[aria-label="Options"]',
        'button[aria-label="Open menu"]',
        'button[aria-haspopup="menu"]',
        '[role="menuitem"]',
      ],
    },
  );
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
        const match = items.find((el) => {
          const text = (el.textContent || '').trim().toLowerCase();
          return text === target || text.includes(target);
        });
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
  options?: { logPrefix?: string; preferSidebarRow?: boolean; projectId?: string; projectName?: string | null },
): Promise<void> {
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const menuSelector = await openProjectMenuButton(client, options);
      const clicked = await selectMenuItem(client.Runtime, {
        menuSelector,
        itemMatch: { exact: [label.toLowerCase()], includeAny: [label.toLowerCase()] },
        closeMenuAfter: true,
        timeoutMs: 3000,
      });
      if (!clicked) {
        await clickProjectMenuItem(client, label, options);
      }
    },
    {
      label: `grok-project-menu-item:${label.toLowerCase()}`,
      rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'nav', 'aside', 'main'],
      menuSelectors: [
        '[role="menu"][data-state="open"]',
        '[data-radix-menu-content][data-state="open"]',
        '[role="menu"]',
      ],
      candidateSelectors: [
        '[data-oracle-project-row="true"]',
        '[data-oracle-project-options="true"]',
        '[data-oracle-project-link="true"]',
        '[role="menuitem"]',
      ],
      buttonSelectors: [
        '[data-oracle-project-options="true"]',
        'button[aria-label="Options"]',
        'button[aria-label="Open menu"]',
        '[role="menuitem"]',
      ],
    },
  );
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
  await ensureGrokTabVisible(client);
  const onProjectPage = await client.Runtime.evaluate({
    expression: 'location.pathname.includes("/project/")',
    returnByValue: true,
  });
  if (!onProjectPage.result?.value) {
    throw new Error('Not on a project page');
  }

  const sidebarAlreadyVisible = await isProjectSidebarVisible(client);
  if (sidebarAlreadyVisible) {
    return;
  }

  const collapseVisible = await waitForSelector(client.Runtime, 'button[aria-label="Collapse side panel"]', 1500);
  if (collapseVisible) {
    return;
  }

  const expand = await pressButton(client.Runtime, {
    selector: 'button[aria-label="Expand side panel"]',
    requireVisible: true,
    timeoutMs: 3000,
    logCandidatesOnMiss: true,
  });
  if (!expand.ok) {
    throw new Error(expand.reason || 'Project sidebar toggle not found');
  }
  const openedAfterExpand = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      if (document.querySelector('button[aria-label="Collapse side panel"]')) {
        return true;
      }
      const nodes = Array.from(document.querySelectorAll('div, aside, [role="complementary"], [data-side]'));
      return nodes.some((node) => {
        if (!visible(node)) return false;
        const classText = String(node.getAttribute('class') || '');
        const text = String(node.textContent || '').toLowerCase();
        const looksLikePanel =
          classText.includes('group/side-panel-section') ||
          classText.includes('side-panel') ||
          classText.includes('sidepanel') ||
          node.hasAttribute('data-side') ||
          node.getAttribute('role') === 'complementary';
        return looksLikePanel && (text.includes('instructions') || text.includes('sources'));
      });
    })()`,
    {
      timeoutMs: 3000,
      description: 'grok-project-sidebar-open',
    },
  );
  if (!openedAfterExpand.ok) {
    throw new Error('Project sidebar did not open');
  }
}

async function isProjectSidebarVisible(client: ChromeClient): Promise<boolean> {
  const result = await client.Runtime.evaluate({
    expression: `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      if (document.querySelector('button[aria-label="Collapse side panel"]')) {
        return true;
      }
      const nodes = Array.from(document.querySelectorAll('div, aside, [role="complementary"], [data-side]'));
      return nodes.some((node) => {
        if (!visible(node)) return false;
        const classText = String(node.getAttribute('class') || '');
        const text = String(node.textContent || '').toLowerCase();
        const looksLikePanel =
          classText.includes('group/side-panel-section') ||
          classText.includes('side-panel') ||
          classText.includes('sidepanel') ||
          node.hasAttribute('data-side') ||
          node.getAttribute('role') === 'complementary';
        return looksLikePanel && (text.includes('instructions') || text.includes('sources'));
      });
    })()`,
    returnByValue: true,
  });
  return Boolean(result.result?.value);
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
  await ensureGrokTabVisible(client);
  await waitForDocumentReady(client, 10_000);
  await waitForSelector(client.Runtime, 'button[data-sidebar="trigger"]', 10_000);
  if (await isMainSidebarOpen(client)) {
    return;
  }
  await clickMainSidebarToggle(client, options);
  await waitForSelector(
    client.Runtime,
    'button[data-sidebar="trigger"][data-state="open"], button[data-sidebar="trigger"][aria-expanded="true"], button[data-sidebar="trigger"] svg.lucide-chevrons-right.rotate-180',
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
      const triggerDataState = trigger?.getAttribute('data-state') || null;
      const triggerAriaExpanded = trigger?.getAttribute('aria-expanded') || null;
      let triggerIconRotated = false;
      if (trigger) {
        const icon = trigger.querySelector('svg.lucide-chevrons-right');
        if (icon) {
          triggerIconRotated = icon.classList.contains('rotate-180');
        }
      }
      const sidebar =
        document.querySelector('div.z-20.bg-surface-base.border-r') ||
        document.querySelector('[data-sidebar="sidebar"], nav, aside');
      const rect = sidebar ? sidebar.getBoundingClientRect() : { width: 0, right: 0 };
      return {
        triggerDataState,
        triggerAriaExpanded,
        triggerIconRotated,
        sidebarWidth: rect.width,
        sidebarRight: rect.right,
      };
    })()`,
    returnByValue: true,
  });
  return isGrokMainSidebarOpenProbe(result?.value as GrokMainSidebarProbe | undefined);
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
  const direct = await pressButton(client.Runtime, {
    selector: '[aria-label="History"], [aria-label*="History" i]',
    timeoutMs: 3000,
  });
  if (direct.ok) {
    return true;
  }
  const result = await pressButton(client.Runtime, {
    match: { includeAny: ['history'] },
    timeoutMs: 3000,
  });
  if (result.ok) {
    return true;
  }
  await ensureMainSidebarOpen(client, { logPrefix: options?.logPrefix ?? 'browser-history-item' });
  const retryDirect = await pressButton(client.Runtime, {
    selector: '[aria-label="History"], [aria-label*="History" i]',
    timeoutMs: 3000,
  });
  if (retryDirect.ok) {
    return true;
  }
  const retry = await pressButton(client.Runtime, {
    match: { includeAny: ['history'] },
    timeoutMs: 3000,
  });
  return Boolean(retry.ok);
}

async function tagGrokConversationSidebarRow(
  Runtime: ChromeClient['Runtime'],
  conversationId: string,
): Promise<void> {
  const evalResult = await Runtime.evaluate({
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const chatId = ${JSON.stringify(conversationId)};
      const selectors = [
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
        '[data-href*="' + chatId + '"]',
        '[data-url*="' + chatId + '"]',
      ];
      const clearTags = () => {
        document
          .querySelectorAll('[data-oracle-grok-conversation-row], [data-oracle-grok-conversation-options]')
          .forEach((node) => {
            node.removeAttribute('data-oracle-grok-conversation-row');
            node.removeAttribute('data-oracle-grok-conversation-options');
          });
      };
      let lastReason = 'Conversation sidebar row not found';
      for (let attempt = 0; attempt < 80; attempt += 1) {
        clearTags();
        let anchor = null;
        for (const selector of selectors) {
          anchor = document.querySelector(selector);
          if (anchor) {
            break;
          }
        }
        if (!anchor) {
          lastReason = 'Conversation sidebar row not found';
          await sleep(250);
          continue;
        }
        const row =
          anchor.closest('[data-sidebar="menu-button"]') ||
          anchor.closest('[data-sidebar="menu-item"]') ||
          anchor.closest('li') ||
          anchor.closest('[data-sidebar="group"]') ||
          anchor.closest('div') ||
          anchor.parentElement;
        if (!row) {
          lastReason = 'Conversation sidebar row container not found';
          await sleep(250);
          continue;
        }
        row.setAttribute('data-oracle-grok-conversation-row', 'true');
        const optionsButton =
          row.querySelector('button[aria-label="Options"]') ||
          row.querySelector('button[aria-label*="option" i]');
        if (!optionsButton) {
          lastReason = 'Conversation options button not found';
          await sleep(250);
          continue;
        }
        optionsButton.setAttribute('data-oracle-grok-conversation-options', 'true');
        return {
          ok: true,
          title: (anchor.textContent || '').replace(/\\s+/g, ' ').trim() || chatId,
        };
      }
      return { ok: false, reason: lastReason };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const info = evalResult.result?.value as
    | { ok: true; title?: string }
    | { ok: false; reason?: string }
    | undefined;
  if (!info?.ok) {
    throw new Error(info?.reason || 'Conversation sidebar row not found');
  }
}

async function openGrokConversationSidebarMenu(
  client: ChromeClient,
  conversationId: string,
): Promise<string> {
  return withUiDiagnostics(
    client.Runtime,
    async () => {
      await navigateToProject(client, GROK_HOME_URL);
      await ensureMainSidebarOpen(client, { logPrefix: 'browser-conversation-sidebar' });
      await closeHistoryDialog(client);
      await tagGrokConversationSidebarRow(client.Runtime, conversationId);
      const opened = await openRevealedRowMenu(client, {
        rowSelector: '[data-oracle-grok-conversation-row="true"]',
        triggerSelector: '[data-oracle-grok-conversation-options="true"]',
        rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, 'nav', 'aside', 'main'],
        triggerRootSelectors: ['[data-oracle-grok-conversation-row="true"]'],
        actionMatch: { exact: ['options'] },
        menuSelector: '[role="menu"]',
        timeoutMs: 3000,
      });
      if (!opened.ok) {
        throw new Error(opened.reason || 'Conversation options menu did not open');
      }
      return opened.menuSelector || '[role="menu"]';
    },
    {
      label: 'grok-conversation-sidebar-menu',
      rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, 'nav', 'aside', 'main'],
      menuSelectors: ['[role="menu"]', '[data-radix-menu-content][data-state="open"]'],
      candidateSelectors: [
        '[data-oracle-grok-conversation-row="true"]',
        '[data-oracle-grok-conversation-options="true"]',
        `a[href*="${conversationId}"]`,
        `[data-value*="${conversationId}"]`,
      ],
      buttonSelectors: [
        '[data-oracle-grok-conversation-options="true"]',
        'button[aria-label="Options"]',
        '[role="menuitem"]',
      ],
    },
  );
}

async function waitForGrokConversationSidebarTitle(
  Runtime: ChromeClient['Runtime'],
  conversationId: string,
  expectedTitle: string,
): Promise<void> {
  const renamed = await waitForPredicate(
    Runtime,
    `(() => {
      const chatId = ${JSON.stringify(conversationId)};
      const expected = ${JSON.stringify(expectedTitle.trim().toLowerCase())};
      const selectors = [
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
      ];
      let anchor = null;
      for (const selector of selectors) {
        anchor = document.querySelector(selector);
        if (anchor) {
          break;
        }
      }
      if (!anchor) {
        return null;
      }
      const text = (anchor.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) {
        return null;
      }
      return text.toLowerCase().includes(expected) ? { text } : null;
    })()`,
    {
      timeoutMs: 5000,
      description: `Grok sidebar title ${conversationId} => ${expectedTitle}`,
    },
  );
  if (!renamed.ok) {
    throw new Error(`Rename did not persist for conversation ${conversationId}`);
  }
}

async function waitForGrokProjectConversationListTitle(
  Runtime: ChromeClient['Runtime'],
  conversationId: string,
  expectedTitle: string,
): Promise<void> {
  const renamed = await waitForPredicate(
    Runtime,
    `(() => {
      const chatId = ${JSON.stringify(conversationId)};
      const expected = ${JSON.stringify(expectedTitle.trim().toLowerCase())};
      const selectors = [
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
      ];
      let anchor = null;
      for (const selector of selectors) {
        anchor = document.querySelector(selector);
        if (anchor) {
          break;
        }
      }
      if (!anchor) {
        return null;
      }
      const text = (anchor.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) {
        return null;
      }
      return text.toLowerCase().includes(expected) ? { text } : null;
    })()`,
    {
      timeoutMs: 5000,
      description: `Grok project conversation list title ${conversationId} => ${expectedTitle}`,
    },
  );
  if (!renamed.ok) {
    throw new Error(`Project conversation list did not persist rename for ${conversationId}`);
  }
}

async function waitForGrokConversationSidebarGone(
  Runtime: ChromeClient['Runtime'],
  conversationId: string,
): Promise<void> {
  const gone = await waitForPredicate(
    Runtime,
    `(() => {
      const chatId = ${JSON.stringify(conversationId)};
      const selectors = [
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
      ];
      return selectors.every((selector) => !document.querySelector(selector)) ? { gone: true } : null;
    })()`,
    {
      timeoutMs: 5000,
      description: `Grok sidebar row removed for ${conversationId}`,
    },
  );
  if (!gone.ok) {
    throw new Error(`Conversation ${conversationId} did not disappear after delete`);
  }
}

async function renameConversationInSidebarList(
  client: ChromeClient,
  conversationId: string,
  newTitle: string,
): Promise<void> {
  const menuSelector = await openGrokConversationSidebarMenu(client, conversationId);
  const selected = await selectMenuItem(client.Runtime, {
    menuSelector,
    menuRootSelectors: [menuSelector],
    itemMatch: { exact: ['rename'] },
    timeoutMs: 3000,
  });
  if (!selected) {
    throw new Error('Rename menu item not found');
  }
  const commitInfo = await submitInlineRename(client.Runtime, {
    value: newTitle,
    inputMatch: { exact: ['rename'] },
    rootSelectors: ['[data-oracle-grok-conversation-row="true"]'],
    saveButtonMatch: { exact: ['save'] },
    closeSelector: 'input[aria-label="Rename"]',
    timeoutMs: 5000,
  });
  if (!commitInfo.ok) {
    throw new Error(commitInfo.reason || 'Rename submit failed');
  }
  await waitForGrokConversationSidebarTitle(client.Runtime, conversationId, newTitle);
}

async function deleteConversationFromSidebarList(
  client: ChromeClient,
  conversationId: string,
): Promise<void> {
  const menuSelector = await openGrokConversationSidebarMenu(client, conversationId);
  const selected = await selectMenuItem(client.Runtime, {
    menuSelector,
    menuRootSelectors: [menuSelector],
    itemMatch: { exact: ['delete'] },
    timeoutMs: 3000,
  });
  if (!selected) {
    throw new Error('Delete menu item not found');
  }
  const confirmReady = await waitForSelector(client.Runtime, '[role="dialog"] button', 1500);
  if (confirmReady) {
    const confirmInfo = await pressDialogButton(client.Runtime, {
      match: { includeAny: ['delete'] },
      rootSelectors: DEFAULT_DIALOG_SELECTORS,
      preferLast: true,
      timeoutMs: 1500,
    });
    if (!confirmInfo.ok) {
      throw new Error(confirmInfo.reason || 'Delete confirmation failed');
    }
  }
  await waitForGrokConversationSidebarGone(client.Runtime, conversationId);
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

async function openConversationList(client: ChromeClient, projectId?: string): Promise<void> {
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
  let ready = await waitForProjectConversationList(client.Runtime);
  if (!ready.ok && projectId) {
    await navigateToProject(client, `https://grok.com/project/${projectId}?tab=conversations`);
    ready = await waitForProjectConversationList(client.Runtime);
  }
  if (!ready.ok) {
    throw new Error('Project conversations list did not load');
  }
}

async function listRootSidebarConversations(client: ChromeClient): Promise<Conversation[]> {
  await waitForPredicate(
    client.Runtime,
    `(() => {
      const roots = [
        document.querySelector(${JSON.stringify(GROK_SIDEBAR_WRAPPER_SELECTOR)}),
        document.querySelector('[data-sidebar="sidebar"]'),
        document.querySelector('nav'),
        document.querySelector('aside'),
      ].filter(Boolean);
      if (roots.length === 0) return false;
      return roots.some((root) =>
        root.querySelector('a[href*="/c/"], [data-value^="conversation:"]'),
      );
    })()`,
    {
      timeoutMs: 5_000,
      description: 'grok-root-sidebar-conversations',
    },
  );
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
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
        if (!match) return null;
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
      };
      const readTimestamp = (row) => {
        const timeEl = row.querySelector('time');
        const candidates = [
          timeEl?.getAttribute?.('datetime'),
          timeEl?.textContent,
          row.querySelector(${JSON.stringify(GROK_TIME_SELECTOR)})?.textContent,
          row.querySelector(${JSON.stringify(GROK_TIMESTAMP_SELECTOR)})?.textContent,
        ];
        for (const candidate of candidates) {
          const parsed = parseRelative(candidate);
          if (parsed !== null) return parsed;
          const absolute = Date.parse(String(candidate || ''));
          if (Number.isFinite(absolute)) return absolute;
        }
        return null;
      };
      const extractTitle = (row, chatId) => {
        const titleNode =
          row.querySelector('span.truncate, div.truncate, [data-testid*="title"], [data-testid*="conversation"], h3, h4') ||
          null;
        const rawTitle = normalize(titleNode?.textContent || row.textContent || '');
        const cleaned = rawTitle
          .replace(/(^|\\s)\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago(\\s|$)/gi, ' ')
          .replace(/(^|\\s)(yesterday|today)(\\s|$)/gi, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
        return cleaned || chatId;
      };
      const roots = [
        document.querySelector(${JSON.stringify(GROK_SIDEBAR_WRAPPER_SELECTOR)}),
        document.querySelector('[data-sidebar="sidebar"]'),
        document.querySelector('nav'),
        document.querySelector('aside'),
      ].filter(Boolean);
      const items = new Map();
      for (const root of roots) {
        const nodes = Array.from(root.querySelectorAll('a[href*="/c/"], [data-value^="conversation:"]'));
        for (const node of nodes) {
          const href =
            node.getAttribute('href') ||
            node.getAttribute('data-href') ||
            node.getAttribute('data-url') ||
            '';
          const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
          let chatId = '';
          let url = '';
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
              continue;
            }
          }
          if (!chatId) continue;
          const row =
            node.closest('[data-sidebar="menu-item"]') ||
            node.closest('li') ||
            node.closest('div') ||
            node;
          const title = extractTitle(row, chatId);
          if (!title) continue;
          items.set(chatId, {
            id: chatId,
            title,
            url: url || null,
            timestamp: readTimestamp(row),
          });
        }
      }
      return { items: Array.from(items.values()) };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? { items: [] }) as { items?: unknown[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const conversations: Conversation[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    if (!id || !title) continue;
    const url = typeof record.url === 'string' ? record.url : undefined;
    const timestamp = typeof record.timestamp === 'number' ? record.timestamp : undefined;
    conversations.push({
      id,
      title,
      provider: 'grok',
      url,
      updatedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
    });
  }
  return conversations;
}

async function waitForProjectConversationList(
  Runtime: ChromeClient['Runtime'],
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
  return waitForPredicate(
    Runtime,
    `(() => {
      const root =
        document.querySelector('main [role="tabpanel"]') ||
        document.querySelector('main');
      if (!root) return false;
      if (root.querySelector('a[href*="/c/"], [data-value^="conversation:"]')) {
        return true;
      }
      const text = String(root.textContent || '').toLowerCase();
      return (
        text.includes('start a conversation in this project') ||
        text.includes('no conversations yet')
      );
    })()`,
    {
      timeoutMs: 5_000,
      description: 'grok-project-conversations',
    },
  );
}

async function listProjectPageConversations(
  client: ChromeClient,
  projectId: string,
): Promise<Conversation[]> {
  const ready = await waitForProjectConversationList(client.Runtime);
  if (!ready.ok) {
    return [];
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const root =
        document.querySelector('main [role="tabpanel"]') ||
        document.querySelector('main');
      if (!root) {
        return { items: [] };
      }

      const now = Date.now();
      const parseRelative = (value) => {
        const text = String(value || '').toLowerCase().trim();
        if (!text) return null;
        if (text === 'just now' || text === 'moments ago' || text === 'today') return now;
        if (text === 'yesterday') return now - 24 * 60 * 60 * 1000;
        const cleaned = text.replace(/[.,]/g, '');
        const shortMatch = cleaned.match(/^(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)$/);
        const agoMatch = cleaned.match(/(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\\s*ago/);
        const match = agoMatch || shortMatch;
        if (!match) return null;
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
      };

      const readTimestamp = (row) => {
        const timeEl = row.querySelector('time');
        const candidates = [
          timeEl?.getAttribute?.('datetime'),
          timeEl?.textContent,
          row.querySelector(${JSON.stringify(GROK_TIME_SELECTOR)})?.textContent,
          row.querySelector(${JSON.stringify(GROK_TIMESTAMP_SELECTOR)})?.textContent,
        ];
        for (const candidate of candidates) {
          const parsed = parseRelative(candidate);
          if (parsed !== null) return parsed;
          const absolute = Date.parse(String(candidate || ''));
          if (Number.isFinite(absolute)) return absolute;
        }
        return null;
      };

      const extractTitle = (row, chatId) => {
        const titleNode =
          row.querySelector('span.truncate, div.truncate, [data-testid*="title"], [data-testid*="conversation"], h3, h4') ||
          null;
        const rawTitle = (titleNode?.textContent || row.textContent || '').replace(/\\s+/g, ' ').trim();
        const cleaned = rawTitle
          .replace(/(^|\\s)\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago(\\s|$)/gi, ' ')
          .replace(/(^|\\s)(yesterday|today)(\\s|$)/gi, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
        return cleaned || chatId;
      };

      const items = new Map();
      const nodes = Array.from(
        root.querySelectorAll('a[href*="/c/"], [data-value^="conversation:"]'),
      );
      for (const node of nodes) {
        const href =
          node.getAttribute('href') ||
          node.getAttribute('data-href') ||
          node.getAttribute('data-url') ||
          '';
        const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
        let chatId = '';
        let url = '';
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
            continue;
          }
        }
        if (!chatId) continue;
        const row = node.closest('div.max-h-11, li, [role="option"], div') || node;
        const title = extractTitle(row, chatId);
        if (!title) continue;
        items.set(chatId, {
          id: chatId,
          title,
          url: url || null,
          timestamp: readTimestamp(row),
        });
      }
      return { items: Array.from(items.values()) };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? { items: [] }) as { items?: unknown[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const conversations: Conversation[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    if (!id || !title) continue;
    const url = typeof record.url === 'string' ? record.url : undefined;
    const timestamp = typeof record.timestamp === 'number' ? record.timestamp : undefined;
    conversations.push({
      id,
      title,
      provider: 'grok',
      projectId,
      url,
      updatedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
    });
  }
  return conversations;
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
        item.closest(${JSON.stringify(GROK_ROUNDED_SELECTOR)}) ||
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

  const clickInfo = await clickRevealedRowAction(client, {
    rowSelector: info.itemSelector,
    anchorSelector: info.itemSelector,
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    actionMatch: { exact: ['rename'] },
    timeoutMs: 1500,
  });
  if (!clickInfo.ok) {
    throw new Error(clickInfo.reason || 'Rename click failed');
  }

  const commitInfo = await submitInlineRename(client.Runtime, {
    value: newTitle,
    inputSelector: 'input[aria-label="Rename"]',
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    saveButtonMatch: { exact: ['save'] },
    closeSelector: 'input[aria-label="Rename"]',
    timeoutMs: 3000,
  });
  if (!commitInfo.ok) {
    throw new Error(commitInfo.reason || 'Rename submit failed');
  }

  const renamed = await waitForPredicate(
    client.Runtime,
    `(() => {
      const chatId = ${JSON.stringify(conversationId)};
      const expected = ${JSON.stringify(newTitle.trim().toLowerCase())};
      const dialog =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]') ||
        document.querySelector('dialog');
      if (!dialog) {
        return null;
      }
      const selectors = [
        '[data-value="conversation:' + chatId + '"]',
        '[data-value*="' + chatId + '"]',
        'a[href="/c/' + chatId + '"]',
        'a[href*="' + chatId + '"]',
      ];
      let item = null;
      for (const selector of selectors) {
        item = dialog.querySelector(selector);
        if (item) {
          break;
        }
      }
      if (!item) {
        return null;
      }
      const row =
        item.closest('div.grid') ||
        item.closest(${JSON.stringify(GROK_ROUNDED_SELECTOR)}) ||
        item.closest('li') ||
        item.closest('div') ||
        item.parentElement;
      const text = (row?.textContent || item.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) {
        return null;
      }
      return text.toLowerCase().includes(expected) ? { text } : null;
    })()`,
    {
      timeoutMs: 5000,
      description: `Grok conversation ${conversationId} renamed to ${newTitle}`,
    },
  );
  if (!renamed.ok) {
    throw new Error(`Rename did not persist for conversation ${conversationId}`);
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
          row.querySelector(${JSON.stringify(GROK_LINE_CLAMP_SELECTOR)}) ||
          row.querySelector(${JSON.stringify(GROK_TRUNCATE_SELECTOR)}) ||
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
            anchor.closest(${JSON.stringify(GROK_ROUNDED_SELECTOR)}) ||
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

  const deleteInfo = await clickRevealedRowAction(client, {
    rowSelector: info.itemSelector,
    anchorSelector: info.itemSelector,
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    actionMatch: { exact: ['delete'] },
    timeoutMs: 1500,
  });
  if (!deleteInfo.ok) {
    throw new Error(deleteInfo.reason || 'Delete click failed');
  }

  const confirmReady = await waitForSelector(
    client.Runtime,
    '[role="dialog"] button',
    1000,
  );
  if (!confirmReady) {
    throw new Error('Delete confirmation not found');
  }

  const confirmInfo = await pressDialogButton(client.Runtime, {
    match: { includeAny: ['delete'] },
    rootSelectors: DEFAULT_DIALOG_SELECTORS,
    preferLast: true,
    timeoutMs: 1000,
  });
  if (!confirmInfo.ok) {
    throw new Error(confirmInfo.reason || 'Delete confirmation failed');
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
    const maxItems = Math.max(1, options?.historyLimit ?? 2000);
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
                node.querySelector?.(${JSON.stringify(GROK_TIME_SELECTOR)}) ||
                node.querySelector?.(${JSON.stringify(GROK_TIMESTAMP_SELECTOR)});
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
      if (process.env.AURACALL_DEBUG_GROK === '1') {
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

async function readGrokSerializedIdentityScriptsForTarget(
  host: string,
  port: number,
  targetId: string,
): Promise<string[]> {
  const client = await connectToChromeTarget({ host, port, target: targetId });
  try {
    await Promise.all([client.Page.enable(), client.Runtime.enable()]);
    return await readGrokSerializedIdentityScriptsWithRetry(client.Runtime);
  } finally {
    await client.close().catch(() => undefined);
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
  await ensureGrokTabVisible(client);
  const { result } = await client.Runtime.evaluate({
    expression: `(() => Boolean(document.querySelector('nav') || document.querySelector('aside') || document.querySelector(${JSON.stringify(GROK_SIDEBAR_WRAPPER_MATCH)})))()`,
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
  await waitForSelector(
    client.Runtime,
    `nav, aside, ${GROK_SIDEBAR_WRAPPER_MATCH}`,
    3000,
  );
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
    if (!clicked && process.env.AURACALL_DEBUG_GROK === '1') {
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

  const pressed = await pressButton(client.Runtime, {
    match: { includeAny: ['edit instructions'] },
    rootSelectors: [GROK_SIDEBAR_WRAPPER_SELECTOR, '[data-sidebar="sidebar"]', 'main'],
    requireVisible: true,
    timeoutMs: 2000,
  });

  if (!pressed.ok) {
    const tagged = await client.Runtime.evaluate({
      expression: `(() => {
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const candidate = Array.from(document.querySelectorAll('div[role="button"], button[role="button"], button, [role="button"]'))
          .find((node) => normalize(node.textContent || '').startsWith('instructions'));
        if (!candidate) return { ok: false };
        candidate.setAttribute('data-oracle-project-instructions-card', 'true');
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (!tagged.result?.value?.ok) {
      throw new Error(pressed.reason || 'Edit instructions button failed');
    }
    const fallback = await pressButton(client.Runtime, {
      selector: '[data-oracle-project-instructions-card="true"]',
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!fallback.ok) {
      throw new Error(fallback.reason || pressed.reason || 'Edit instructions button failed');
    }
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
  const desiredModelLabels = options.modelLabel
    ? resolveServiceModelLabels(registry, options.serviceId, options.modelLabel)
    : [];
  let desiredModelForEval: string | null = desiredModelLabels[0] ?? options.modelLabel ?? null;
  if (options.modelLabel) {
    const normalized = normalizeGrokModelLabel(desiredModelForEval).toLowerCase();
    const selected = await openAndSelectListbox(client.Runtime, {
      trigger: {
        selector: '#model-select-trigger, button[aria-label="Model select"], button[data-slot="select-trigger"]',
        rootSelectors: [
          '[role="dialog"][data-state="open"]',
          'dialog[open]',
          GROK_SIDEBAR_WRAPPER_SELECTOR,
          'main',
        ],
      },
      itemMatch: { startsWith: [normalized] },
      listboxSelector: '[role="listbox"]',
      timeoutMs: 5000,
      closeAfter: true,
    });
    if (!selected) {
      throw new Error('Model option not found');
    }
    desiredModelForEval = null;
  }

  const safeJson = (value: unknown) =>
    JSON.stringify(value)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

  const expression = `(async () => {
      const desiredText = ${safeJson(options.text ?? null)};
      const desiredModel = ${safeJson(desiredModelForEval)};
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
        document.querySelector(${JSON.stringify(GROK_SIDEBAR_WRAPPER_SELECTOR)}) ||
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
  if (process.env.AURACALL_DEBUG_GROK === '1') {
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
    if (projectId) {
      if (!url.includes(`/project/${projectId}`)) {
        continue;
      }
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
