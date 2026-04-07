import { readFile } from 'node:fs/promises';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import type { Page } from 'puppeteer-core';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import {
  buildBrowserDomSearchExpression,
  type BrowserDomSearchMatch,
  type BrowserDomSearchOptions,
} from '../../../packages/browser-service/src/service/domSearch.js';
import type { BrowserToolsUiListResult } from '../../../packages/browser-service/src/browserTools.js';
import {
  navigateAndSettle,
  pressButton,
  setInputValue,
  submitInlineRename,
  waitForPredicate,
} from '../service/ui.js';
import type { ChromeClient } from '../types.js';
import type {
  BrowserProvider,
  BrowserProviderListOptions,
  BrowserProviderPromptInput,
  BrowserProviderPromptResult,
  ProviderUserIdentity,
} from './types.js';
import type { Conversation, ConversationContext, FileRef, Project, ProjectMemoryMode } from './domain.js';
import {
  requireBundledServiceBaseUrl,
  requireBundledServiceCompatibleHosts,
  requireBundledServiceRouteTemplate,
  resolveBundledServiceComposerKnownLabels,
  resolveBundledServiceFeatureDetector,
  resolveBundledServiceFeatureFlagTokens,
} from '../../services/registry.js';
import { GeminiFeatureSchema } from '../llmService/providers/schema.js';

const GEMINI_BASE_URL = requireBundledServiceBaseUrl('gemini');
const GEMINI_APP_URL = requireBundledServiceRouteTemplate('gemini', 'app');
const GEMINI_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('gemini');
const GEMINI_GEMS_VIEW_URL = new URL('gems/view', GEMINI_BASE_URL).toString();
const GEMINI_GEM_CREATE_URL = new URL('gems/create', GEMINI_BASE_URL).toString();
const GEMINI_FEATURE_DETECTOR = resolveBundledServiceFeatureDetector('gemini', 'gemini-feature-probe-v1');
const GEMINI_FEATURE_FLAG_TOKENS = resolveBundledServiceFeatureFlagTokens('gemini', {
  search: ['search'],
  grounding: ['grounding'],
  deep_research: ['deep research'],
  personal_intelligence: ['personal intelligence'],
});
const GEMINI_DISCOVERY_LABELS = resolveBundledServiceComposerKnownLabels('gemini', [
  'create image',
  'create music',
  'write anything',
  'create video',
  'help me learn',
  'guided learning',
  'canvas',
  'deep research',
  'personal intelligence',
]);
const GEMINI_TOOLS_BUTTON_SELECTORS = [
  'button.toolbox-drawer-button',
  'button.toolbox-drawer-button-with-label',
  'button[aria-haspopup="menu"] .toolbox-drawer-button-label-icon-text',
  'button[aria-haspopup="menu"]',
];
const GEMINI_TOOLS_DRAWER_ROW_SELECTORS = [
  'button.toolbox-drawer-item-list-button[role="menuitemcheckbox"]',
  'button[mat-list-item].toolbox-drawer-item-list-button[role="menuitemcheckbox"]',
  'button[role="menuitemcheckbox"]',
];
const GEMINI_PERSONAL_INTELLIGENCE_SELECTORS = [
  'button[role="switch"][aria-label="Personal Intelligence"]',
  'button[role="switch"][aria-label*="Personal Intelligence"]',
];
const GEMINI_MODE_PICKER_SELECTORS = [
  'button[data-test-id="bard-mode-menu-button"]',
  'button[aria-label="Open mode picker"]',
];
const GEMINI_NEW_CHAT_BUTTON_SELECTORS = [
  'button[data-test-id="new-chat-button"]',
  'button[aria-label="New chat"]',
];
const GEMINI_GEM_NAME_INPUT_SELECTOR = 'input[aria-label="Input for a Gem name"]';
const GEMINI_GEM_DESCRIPTION_INPUT_SELECTOR = 'textarea[data-test-id="description-input-field"]';
const GEMINI_GEM_INSTRUCTIONS_INPUT_SELECTOR = 'div[aria-label="Enter a prompt for Gemini"]';
const GEMINI_GEM_CREATE_BUTTON_SELECTOR = 'button[data-test-id="create-button"]';
const GEMINI_GEM_START_CHAT_BUTTON_SELECTOR = 'button[data-test-id="new-chat-button"]';
const GEMINI_GEM_KNOWLEDGE_UPLOAD_TRIGGER_SELECTOR =
  'button[aria-label*="upload file menu for gem knowledge" i]';
const GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR =
  'button[role="menuitem"][data-test-id="local-images-files-uploader-button"][aria-label*="Upload files" i]';
const GEMINI_GEM_KNOWLEDGE_HIDDEN_UPLOAD_SELECTORS = [
  'button[data-test-id="hidden-local-image-upload-button"]',
  'button[data-test-id="hidden-local-file-upload-button"]',
];
const GEMINI_PROMPT_INPUT_SELECTORS = [
  'div[role="textbox"][aria-label="Enter a prompt for Gemini"]',
  'div[role="textbox"][contenteditable="true"]',
  'textarea[aria-label*="Gemini"]',
];
const GEMINI_SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[type="submit"][aria-label*="Send"]',
];
const GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR =
  'input[data-test-id="edit-title-input"][aria-label="Rename this chat"]';
const GEMINI_CONVERSATION_RENAME_SAVE_SELECTOR = 'button[data-test-id="save-button"]';

function resolvePortFromEnv(): number | undefined {
  const raw = process.env.AURACALL_BROWSER_PORT;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeWhitespace(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePromptText(value: string): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

function sanitizeGeminiAssistantText(value: string): string {
  const normalized = normalizePromptText(value);
  return normalized
    .replace(/^(?:show thinking\s+)?gemini said(?:\s+|$)/i, '')
    .replace(/\s+(?:copy prompt|listen|show more options)(?:\s+(?:copy prompt|listen|show more options))*$/i, '')
    .trim();
}

function sanitizeGeminiUserText(value: string): string {
  return normalizePromptText(value)
    .replace(/^you said\s+/i, '')
    .trim();
}

type GeminiFeatureProbe = {
  detector?: string | null;
  search?: boolean;
  grounding?: boolean;
  deep_research?: boolean;
  personal_intelligence?: boolean;
  modes?: string[] | null;
  toggles?: Record<string, boolean> | null;
  active_mode?: string | null;
};

type GeminiDomSearchResult = {
  totalScanned: number;
  matched: BrowserDomSearchMatch[];
};

function normalizeGeminiDiscoveryLabel(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/(?:\s+new)+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeGeminiFeatureSignature(probe: GeminiFeatureProbe | null | undefined): string | null {
  if (!probe || typeof probe !== 'object') {
    return null;
  }
  const knownModes = new Set(GEMINI_DISCOVERY_LABELS.map((entry) => normalizeGeminiDiscoveryLabel(entry)).filter(Boolean));
  const modes = Array.isArray(probe.modes)
    ? Array.from(
        new Set(
          probe.modes
            .map((entry) => normalizeGeminiDiscoveryLabel(entry))
            .filter((entry) => Boolean(entry) && knownModes.has(entry)),
        ),
      ).sort()
    : [];
  const toggles = probe.toggles && typeof probe.toggles === 'object'
    ? Object.fromEntries(
        Object.entries(probe.toggles)
          .map(([key, value]) => [normalizeGeminiDiscoveryLabel(key), Boolean(value)] as const)
          .filter(([key]) => key.length > 0)
          .sort(([left], [right]) => left.localeCompare(right)),
      )
    : undefined;
  const normalizedActiveMode = normalizeGeminiDiscoveryLabel(probe.active_mode ?? '');
  const normalized = {
    detector: normalizeWhitespace(probe.detector ?? '') || GEMINI_FEATURE_DETECTOR,
    search: typeof probe.search === 'boolean' ? probe.search : undefined,
    grounding: typeof probe.grounding === 'boolean' ? probe.grounding : undefined,
    deep_research: typeof probe.deep_research === 'boolean' ? probe.deep_research : undefined,
    personal_intelligence:
      typeof probe.personal_intelligence === 'boolean' ? probe.personal_intelligence : undefined,
    modes,
    toggles: toggles && Object.keys(toggles).length > 0 ? toggles : undefined,
    active_mode:
      normalizedActiveMode && normalizedActiveMode !== 'open mode picker' ? normalizedActiveMode : undefined,
  };
  const parsed = GeminiFeatureSchema.safeParse(normalized);
  if (!parsed.success) {
    return null;
  }
  const hasAnySignal =
    normalized.search !== undefined ||
    normalized.grounding !== undefined ||
    normalized.deep_research !== undefined ||
    normalized.personal_intelligence !== undefined ||
    normalized.modes.length > 0 ||
    (normalized.toggles && Object.keys(normalized.toggles).length > 0) ||
    normalized.active_mode !== undefined;
  if (!hasAnySignal) {
    return null;
  }
  return JSON.stringify(normalized);
}

export function deriveGeminiFeatureProbeFromUiList(
  uiList: BrowserToolsUiListResult | null | undefined,
): GeminiFeatureProbe | null {
  if (!uiList) {
    return null;
  }
  const modes = Array.from(
    new Set(
      uiList.sections.menuItems
        .map((item) => normalizeGeminiDiscoveryLabel(item.text ?? item.ariaLabel ?? null))
        .filter(Boolean),
    ),
  ).sort();
  const toggles = Object.fromEntries(
    uiList.sections.switches
      .map((item) => {
        const label = normalizeGeminiDiscoveryLabel(item.ariaLabel ?? item.text ?? null);
        if (!label || typeof item.checked !== 'boolean') {
          return null;
        }
        return [label, item.checked] as const;
      })
      .filter((entry): entry is readonly [string, boolean] => Boolean(entry))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (modes.length === 0 && Object.keys(toggles).length === 0) {
    return null;
  }
  return {
    detector: GEMINI_FEATURE_DETECTOR,
    deep_research: modes.includes('deep research'),
    personal_intelligence: Object.prototype.hasOwnProperty.call(toggles, 'personal intelligence')
      ? Boolean(toggles['personal intelligence'])
      : undefined,
    modes,
    toggles,
    active_mode: null,
  };
}

export function mergeGeminiFeatureProbes(
  providerProbe: GeminiFeatureProbe | null | undefined,
  uiListProbe: GeminiFeatureProbe | null | undefined,
): GeminiFeatureProbe | null {
  if (!providerProbe && !uiListProbe) {
    return null;
  }
  const modes = Array.from(
    new Set(
      [...(providerProbe?.modes ?? []), ...(uiListProbe?.modes ?? [])]
        .map((entry) => normalizeGeminiDiscoveryLabel(entry))
        .filter(Boolean),
    ),
  ).sort();
  const toggles = Object.fromEntries(
    Object.entries({
      ...(providerProbe?.toggles ?? {}),
      ...(uiListProbe?.toggles ?? {}),
    })
      .map(([key, value]) => [normalizeGeminiDiscoveryLabel(key), Boolean(value)] as const)
      .filter(([key]) => key.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    detector: normalizeWhitespace(providerProbe?.detector ?? uiListProbe?.detector ?? '') || GEMINI_FEATURE_DETECTOR,
    search: providerProbe?.search,
    grounding: providerProbe?.grounding,
    deep_research:
      typeof uiListProbe?.deep_research === 'boolean'
        ? uiListProbe.deep_research
        : providerProbe?.deep_research ?? modes.includes('deep research'),
    personal_intelligence:
      Object.prototype.hasOwnProperty.call(toggles, 'personal intelligence')
        ? Boolean(toggles['personal intelligence'])
        : providerProbe?.personal_intelligence ?? uiListProbe?.personal_intelligence,
    modes,
    toggles,
    active_mode: normalizeGeminiDiscoveryLabel(providerProbe?.active_mode ?? uiListProbe?.active_mode ?? '') || null,
  };
}

export async function prepareGeminiToolsDrawerForUiList(page: Page): Promise<void> {
  const dismissOverlayExpression = `(() => {
    const dispatchEscape = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    };
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    dispatchEscape();
    dispatchEscape();
    return true;
  })()`;
  await page.evaluate(dismissOverlayExpression).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 150));

  const drawerReadyExpression = `(() => {
    const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
    const switchSelectors = ${JSON.stringify(GEMINI_PERSONAL_INTELLIGENCE_SELECTORS)};
    const modeMenus = Array.from(document.querySelectorAll('.gds-mode-switch-menu, [data-test-id="bard-mode-menu-button"][aria-expanded="true"]'))
      .filter((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    return (
      modeMenus.length === 0 &&
      rowSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node))) ||
      switchSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node)))
    );
  })()`;
  const drawerReady = await page.evaluate(drawerReadyExpression);
  if (drawerReady) {
    return;
  }

  const pointExpression = `(() => {
    const selectors = ${JSON.stringify(GEMINI_TOOLS_BUTTON_SELECTORS)};
    const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement) || !visible(node)) continue;
        const button = node.matches('button') ? node : node.closest('button');
        if (!(button instanceof HTMLElement) || !visible(button)) continue;
        const label = normalize(button.getAttribute('aria-label') || button.textContent);
        if (label !== 'tools') continue;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  })()`;
  const point = await page.evaluate(pointExpression);

  if (!point) {
    return;
  }

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 200));

  await page.waitForFunction(
    `(() => {
      const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
      const switchSelectors = ${JSON.stringify(GEMINI_PERSONAL_INTELLIGENCE_SELECTORS)};
      const modeMenus = Array.from(document.querySelectorAll('.gds-mode-switch-menu'))
        .filter((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      const visible = (node: Element | null) =>
        Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      return (
        modeMenus.length === 0 &&
        (rowSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node))) ||
        switchSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node)))
        )
      );
    })()`,
    {
      timeout: 3000,
    },
  ).catch(() => undefined);
}

export async function cleanupGeminiUiListPreparation(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    return true;
  })()`).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function runGeminiDomSearch(
  Runtime: ChromeClient['Runtime'],
  options: BrowserDomSearchOptions,
): Promise<GeminiDomSearchResult> {
  const { result } = await Runtime.evaluate({
    expression: buildBrowserDomSearchExpression(options),
    returnByValue: true,
  });
  return (result?.value as GeminiDomSearchResult | null | undefined) ?? { totalScanned: 0, matched: [] };
}

function buildGeminiDomSearchHasMatchesExpression(options: BrowserDomSearchOptions): string {
  const searchExpression = buildBrowserDomSearchExpression(options);
  return `(() => {
    const result = ${searchExpression};
    return Boolean(result && Array.isArray(result.matched) && result.matched.length > 0);
  })()`;
}

async function ensureGeminiToolsDrawerOpen(client: ChromeClient): Promise<boolean> {
  const buttonSearch = await runGeminiDomSearch(client.Runtime, {
    classIncludes: ['toolbox-drawer-button'],
    text: ['Tools'],
    tag: ['button'],
    visibleOnly: true,
    limit: 10,
  }).catch(() => ({ totalScanned: 0, matched: [] }));
  const hasExpandedToolsButton = buttonSearch.matched.some((match) => match.expanded === true);
  const existingRows = await runGeminiDomSearch(client.Runtime, {
    classIncludes: ['toolbox-drawer-item-list-button'],
    role: ['menuitemcheckbox'],
    visibleOnly: true,
    limit: 50,
    maxScan: 10_000,
  }).catch(() => ({ totalScanned: 0, matched: [] }));
  if (hasExpandedToolsButton && existingRows.matched.length > 0) {
    return true;
  }
  const programmaticOpen = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(GEMINI_TOOLS_BUTTON_SELECTORS.join(','))}));
      const button = candidates.find((candidate) => {
        if (!(candidate instanceof HTMLElement)) return false;
        if (!visible(candidate)) return false;
        const label = normalize(candidate.textContent || candidate.getAttribute('aria-label') || '');
        return label === 'tools';
      });
      if (!(button instanceof HTMLElement)) return false;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
      return true;
    })()`,
    returnByValue: true,
  }).catch(() => ({ result: { value: false } }));
  let opened = Boolean(programmaticOpen.result?.value);
  if (!opened) {
    opened = await clickGeminiFeatureProbeTarget(client, GEMINI_TOOLS_BUTTON_SELECTORS, {
      requireText: 'tools',
    }).catch(() => false);
  }
  if (!opened) {
    return false;
  }
  await waitForPredicate(
    client.Runtime,
    buildGeminiDomSearchHasMatchesExpression({
      classIncludes: ['toolbox-drawer-item-list-button'],
      role: ['menuitemcheckbox'],
      visibleOnly: true,
      limit: 1,
      maxScan: 10_000,
    }),
    {
      timeoutMs: 3_000,
      description: 'Gemini tools drawer rows',
    },
  ).catch(() => undefined);
  const rows = await runGeminiDomSearch(client.Runtime, {
    classIncludes: ['toolbox-drawer-item-list-button'],
    role: ['menuitemcheckbox'],
    visibleOnly: true,
    limit: 50,
    maxScan: 10_000,
  }).catch(() => ({ totalScanned: 0, matched: [] }));
  return rows.matched.length > 0;
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.txt':
    case '.md':
    case '.log':
    case '.csv':
    case '.ts':
    case '.tsx':
    case '.js':
    case '.json':
    case '.yaml':
    case '.yml':
    case '.xml':
    case '.html':
    case '.css':
      return 'text/plain';
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function isLikelyImagePath(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(path.extname(filePath).toLowerCase());
}

export function normalizeGeminiProjectId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const extracted = extractGeminiProjectIdFromUrl(trimmed);
  if (extracted) return extracted;
  const normalized = trimmed.replace(/^gem\//i, '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return null;
  return /^[a-z0-9_-]{6,}$/i.test(normalized) ? normalized : null;
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

function geminiConversationRouteExpression(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (/^\/app\/[^/]+$/i.test(path)) {
      return `location.pathname === ${JSON.stringify(path)}`;
    }
    if (path === '/app') {
      return `location.pathname === "/app" || /^\\/app\\/[^/?#]+$/i.test(location.pathname)`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function geminiConversationSurfaceReadyExpression(): string {
  return `(() => {
    const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
    if (visible(document.querySelector('[data-test-id="all-conversations"]'))) return true;
    if (visible(document.querySelector('button[aria-label="Main menu"]'))) {
      const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (text.includes('conversation with gemini') || text.includes('what can we get done')) return true;
      if (Array.from(document.querySelectorAll('div[role="textbox"], textarea')).some((node) => visible(node))) return true;
    }
    if (Array.from(document.querySelectorAll('a[href*="/app/"]')).some((node) => visible(node))) return true;
    if (Array.from(document.querySelectorAll('button[data-test-id="actions-menu-button"], a[data-test-id="actions-menu-button"]')).some((node) => visible(node))) return true;
    if (Array.from(document.querySelectorAll('button[aria-label], a[aria-label]')).some((node) => {
      if (!visible(node)) return false;
      const label = String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return label.startsWith('more options for ');
    })) return true;
    const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    if (text.includes('use your precise location')) return true;
    return false;
  })()`;
}

export function classifyGeminiBlockingState(state: {
  href?: string | null;
  title?: string | null;
  bodyText?: string | null;
} | null | undefined): string | null {
  const href = normalizeWhitespace(state?.href ?? '').toLowerCase();
  const title = normalizeWhitespace(state?.title ?? '').toLowerCase();
  const bodyText = normalizeWhitespace(state?.bodyText ?? '').toLowerCase();
  const combined = `${title} ${bodyText}`.trim();
  if (
    href.includes('google.com/sorry/') ||
    (combined.includes('our systems have detected unusual traffic') &&
      combined.includes('this page checks to see if it\'s really you'))
  ) {
    return 'Google blocked Gemini with an unusual-traffic interstitial (google.com/sorry).';
  }
  return null;
}

export function resolveGeminiConfiguredUrl(
  value: string | null | undefined,
  fallback: string = GEMINI_APP_URL,
): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return fallback;
  return isGeminiUrl(trimmed) ? trimmed : fallback;
}

export function geminiUrlMatchesPreference(
  candidateUrl: string | null | undefined,
  preferredUrl: string | null | undefined,
): boolean {
  const candidate = String(candidateUrl ?? '').trim();
  const preferred = String(preferredUrl ?? '').trim();
  if (!candidate || !preferred) {
    return false;
  }
  try {
    const candidateParsed = new URL(candidate);
    const preferredParsed = new URL(preferred);
    if (candidateParsed.hostname !== preferredParsed.hostname) {
      return false;
    }
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';
    const candidatePath = normalizePath(candidateParsed.pathname);
    const preferredPath = normalizePath(preferredParsed.pathname);
    if (candidatePath !== preferredPath) {
      return false;
    }
    return candidateParsed.search === preferredParsed.search;
  } catch {
    return candidate === preferred;
  }
}

export function selectPreferredGeminiTarget<T extends { url?: string | null }>(
  targets: T[],
  preferredUrl?: string,
): T | undefined {
  if (targets.length === 0) {
    return undefined;
  }
  if (!preferredUrl) {
    return targets[0];
  }
  return targets.find((target) => geminiUrlMatchesPreference(target.url, preferredUrl));
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
  const preferred = selectPreferredGeminiTarget(candidates, preferredUrl);
  let targetInfo = preferred ?? serviceResolved;
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

type GeminiConversationContextProbe = {
  provider: 'gemini';
  conversationId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
  }>;
  files?: FileRef[];
  artifacts?: ConversationContext['artifacts'];
};

type GeminiDeleteTrace = Array<Record<string, unknown>>;

function summarizeGeminiDeleteTrace(trace: GeminiDeleteTrace, edgeCount: number = 6): string {
  if (trace.length <= edgeCount * 2) {
    return JSON.stringify(trace);
  }
  return JSON.stringify([
    ...trace.slice(0, edgeCount),
    { phase: 'trace-truncated', omitted: trace.length - edgeCount * 2 },
    ...trace.slice(-edgeCount),
  ]);
}

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

async function clickGeminiFeatureProbeTarget(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  selectors: readonly string[],
  options: { requireText?: string | null } = {},
): Promise<boolean> {
  const located = await client.Runtime.evaluate({
    expression: `(() => {
      const selectors = ${JSON.stringify(selectors)};
      const requiredText = ${JSON.stringify(normalizeGeminiDiscoveryLabel(options.requireText ?? ''))};
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      for (const selector of selectors) {
        const candidates = Array.from(document.querySelectorAll(selector));
        const target = candidates.find((candidate) => {
          if (!(candidate instanceof HTMLElement)) return false;
          if (requiredText) {
            const text = normalize(candidate.textContent || candidate.getAttribute('aria-label') || '');
            if (text !== requiredText) return false;
          }
          return true;
        });
        if (!(target instanceof HTMLElement)) continue;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const touchTarget = target.querySelector('.mat-mdc-button-touch-target');
        const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : target;
        const rect = clickTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      return null;
    })()`,
    returnByValue: true,
  });
  const point = located.result?.value as { x?: number; y?: number } | undefined;
  if (typeof point?.x !== 'number' || typeof point?.y !== 'number') {
    return false;
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
  await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}

async function readGeminiToolsDrawerProbe(Runtime: ChromeClient['Runtime']): Promise<GeminiFeatureProbe | null> {
  const [rowSearch, toggleSearch] = await Promise.all([
    runGeminiDomSearch(Runtime, {
      classIncludes: ['toolbox-drawer-item-list-button'],
      role: ['menuitemcheckbox'],
      visibleOnly: true,
      limit: 50,
      maxScan: 10_000,
    }),
    runGeminiDomSearch(Runtime, {
      ariaLabel: ['Personal Intelligence'],
      role: ['switch'],
      visibleOnly: true,
      limit: 10,
      maxScan: 10_000,
    }),
  ]);
  const modes = Array.from(
    new Set(
      rowSearch.matched
        .map((match) => normalizeGeminiDiscoveryLabel(match.text || match.ariaLabel || null))
        .filter(Boolean),
    ),
  ).sort();
  const toggles = Object.fromEntries(
    toggleSearch.matched
      .map((match) => {
        const label = normalizeGeminiDiscoveryLabel(match.ariaLabel || match.text || null);
        if (!label || typeof match.checked !== 'boolean') {
          return null;
        }
        return [label, match.checked] as const;
      })
      .filter((entry): entry is readonly [string, boolean] => Boolean(entry))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (modes.length === 0 && Object.keys(toggles).length === 0) {
    return null;
  }
  return {
    detector: GEMINI_FEATURE_DETECTOR,
    deep_research: modes.includes('deep research'),
    personal_intelligence: Object.prototype.hasOwnProperty.call(toggles, 'personal intelligence')
      ? Boolean(toggles['personal intelligence'])
      : undefined,
    modes,
    toggles,
    active_mode: null,
  };
}

async function readGeminiFeatureProbe(Runtime: ChromeClient['Runtime']): Promise<GeminiFeatureProbe | null> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const simplify = (value) =>
        normalize(value)
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const detector = ${JSON.stringify(GEMINI_FEATURE_DETECTOR)};
      const flagTokens = ${JSON.stringify(GEMINI_FEATURE_FLAG_TOKENS)};
      const knownLabels = ${JSON.stringify(GEMINI_DISCOVERY_LABELS)};
      const ignore = new Set([
        'main menu',
        'new chat',
        'my stuff',
        'settings help',
        'microphone',
        'temporary chat',
        'search',
        'pro',
        'open mode picker',
      ]);
      const addText = (sink, value) => {
        const normalized = simplify(value);
        if (normalized) sink.push(normalized);
      };
      const bodyCorpus = [];
      addText(bodyCorpus, document.body?.innerText || '');
      for (const key of Object.keys(localStorage).slice(0, 100)) {
        addText(bodyCorpus, key);
        try { addText(bodyCorpus, localStorage.getItem(key) || ''); } catch {}
      }
      for (const key of Object.keys(sessionStorage).slice(0, 100)) {
        addText(bodyCorpus, key);
        try { addText(bodyCorpus, sessionStorage.getItem(key) || ''); } catch {}
      }
      for (const script of Array.from(document.querySelectorAll('script[type="application/json"], script')).slice(0, 20)) {
        addText(bodyCorpus, (script.textContent || '').slice(0, 50000));
      }
      const pickerButton = document.querySelector(${JSON.stringify(GEMINI_MODE_PICKER_SELECTORS.join(','))});
      const activeMode = pickerButton instanceof HTMLElement
        ? simplify(pickerButton.getAttribute('aria-label') || pickerButton.textContent || '')
        : '';
      const overlayRoots = Array.from(document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="dialog"]'))
        .filter((node) => visible(node));
      const drawerRoot = overlayRoots[0] || null;
      const modeLabels = new Set();
      const toggleStates = {};
      const modeCorpus = [];
      const sourceRoot = drawerRoot || document.body;
      for (const node of Array.from(sourceRoot.querySelectorAll('button, [role="button"], [role="menuitem"], [role="switch"], a[aria-label], button[aria-label]')).slice(0, 500)) {
        if (!visible(node)) continue;
        const label = simplify(node.getAttribute?.('aria-label') || node.textContent || '');
        if (!label) continue;
        if (ignore.has(label)) continue;
        if (label.startsWith('google account ')) continue;
        modeLabels.add(label);
        modeCorpus.push(label);
        const ariaChecked = node.getAttribute?.('aria-checked');
        if (ariaChecked === 'true' || ariaChecked === 'false') {
          toggleStates[label] = ariaChecked === 'true';
        }
      }
      const haystack = Array.from(new Set([...bodyCorpus, ...modeCorpus, activeMode].filter(Boolean))).join('\\n');
      const flags = {};
      for (const [name, tokens] of Object.entries(flagTokens)) {
        flags[name] = tokens.some((token) => haystack.includes(String(token || '').toLowerCase().trim()));
      }
      for (const label of knownLabels) {
        const normalized = simplify(label);
        if (normalized && haystack.includes(normalized)) {
          modeLabels.add(normalized);
        }
      }
      return {
        detector,
        search: Boolean(flags.search),
        grounding: Boolean(flags.grounding),
        deep_research: Boolean(flags.deep_research),
        personal_intelligence: Boolean(flags.personal_intelligence),
        modes: Array.from(modeLabels).sort(),
        toggles: toggleStates,
        active_mode: activeMode || null,
      };
    })()`,
    returnByValue: true,
  });
  return (result?.value as GeminiFeatureProbe | null | undefined) ?? null;
}

async function readGeminiFeatureSignature(client: ChromeClient): Promise<string | null> {
  await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
  await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
  await clickGeminiFeatureProbeTarget(client, GEMINI_NEW_CHAT_BUTTON_SELECTORS).catch(() => false);
  await waitForPredicate(
    client.Runtime,
    `(() => location.pathname === "/app")()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini root composer route',
    },
  ).catch(() => undefined);
  const openedTools = await ensureGeminiToolsDrawerOpen(client).catch(() => false);
  if (openedTools) {
    const drawerProbe = await readGeminiToolsDrawerProbe(client.Runtime);
    const normalizedDrawerSignature = normalizeGeminiFeatureSignature(drawerProbe);
    if (normalizedDrawerSignature) {
      await client.Runtime.evaluate({
        expression: `(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
          return true;
        })()`,
        returnByValue: true,
      }).catch(() => undefined);
      return normalizedDrawerSignature;
    }
  }
  const opened = await clickGeminiFeatureProbeTarget(client, GEMINI_MODE_PICKER_SELECTORS).catch(() => false);
  if (opened) {
    await waitForPredicate(
      client.Runtime,
      `(() => {
        const roots = document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="dialog"]');
        return Array.from(roots).some((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      })()`,
      {
        timeoutMs: 3_000,
        description: 'Gemini mode picker overlay',
      },
    ).catch(() => undefined);
  }
  const probe = await readGeminiFeatureProbe(client.Runtime);
  await client.Runtime.evaluate({
    expression: `(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
  return normalizeGeminiFeatureSignature(probe);
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
  const routeExpression = geminiConversationRouteExpression(url);
  const readyExpression = geminiConversationSurfaceReadyExpression();
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression,
    routeDescription: 'Gemini conversation route',
    readyExpression,
    readyDescription: 'Gemini conversation surface',
    timeoutMs: 20_000,
    fallbackToLocationAssign: true,
  });
  if (settled.ok) {
    return;
  }
  await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
  if (routeExpression) {
    const routeReady = await waitForPredicate(client.Runtime, routeExpression, {
      timeoutMs: 5_000,
      description: 'Gemini conversation route recovery',
    });
    if (!routeReady.ok) {
      const state = await collectGeminiConversationSurfaceState(client.Runtime, 'route-recovery-failed');
      const blockingReason = classifyGeminiBlockingState(state);
      if (blockingReason) {
        throw new Error(`${blockingReason} state=${JSON.stringify(state)}`);
      }
      throw new Error(
        `Gemini conversation surface did not become ready: ${settled.reason ?? settled.phase} state=${JSON.stringify(state)}`,
      );
    }
  }
  const recovered = await waitForPredicate(client.Runtime, readyExpression, {
    timeoutMs: 8_000,
    description: 'Gemini conversation surface recovery',
  });
  if (!recovered.ok) {
    const state = await collectGeminiConversationSurfaceState(client.Runtime, 'ready-recovery-failed');
    const blockingReason = classifyGeminiBlockingState(state);
    if (blockingReason) {
      throw new Error(`${blockingReason} state=${JSON.stringify(state)}`);
    }
    throw new Error(
      `Gemini conversation surface did not become ready: ${settled.reason ?? settled.phase} state=${JSON.stringify(state)}`,
    );
  }
}

async function collectGeminiConversationSurfaceState(
  Runtime: ChromeClient['Runtime'],
  phase: string,
): Promise<Record<string, unknown>> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || ''))
        .slice(0, 5);
      const anchors = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .filter((node) => visible(node))
        .map((node) => ({
          href: node instanceof HTMLAnchorElement ? node.href : '',
          text: normalize(node.textContent || ''),
        }))
        .slice(0, 8);
      const actionLabels = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean)
        .filter((label) => /more options|dismiss|delete/i.test(label))
        .slice(0, 12);
      return {
        href: location.href,
        title: document.title || '',
        hasConversationList: visible(document.querySelector('[data-test-id="all-conversations"]')),
        dialogs,
        anchors,
        actionLabels,
        bodyText: normalize(document.body?.innerText || '').slice(0, 800),
      };
    })()`,
    returnByValue: true,
  });
  return {
    phase,
    ...(typeof result?.value === 'object' && result?.value ? (result.value as Record<string, unknown>) : {}),
  };
}

async function collectGeminiDeleteSurfaceState(
  Runtime: ChromeClient['Runtime'],
  phase: string,
): Promise<Record<string, unknown>> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const deleteButton = document.querySelector('button[data-test-id="delete-button"]');
      const confirmButton = document.querySelector('button[data-test-id="confirm-button"]');
      const confirmButtons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node))
        .map((node) => {
          const touchTarget = node instanceof HTMLElement ? node.querySelector('.mat-mdc-button-touch-target') : null;
          const rect = (touchTarget instanceof HTMLElement ? touchTarget : node).getBoundingClientRect();
          return {
            text: normalize(node.textContent || ''),
            ariaLabel: normalize(node.getAttribute('aria-label') || ''),
            disabled: node instanceof HTMLButtonElement ? node.disabled : false,
            ariaDisabled: normalize(node.getAttribute('aria-disabled') || ''),
            className: normalize(node.getAttribute('class') || '').slice(0, 200),
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        })
        .slice(0, 4);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || ''))
        .slice(0, 5);
      const visibleActionLabels = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter((label) => /more options|delete|dismiss/i.test(label))
        .slice(0, 20);
      return {
        href: location.href,
        deleteReady: deleteButton instanceof HTMLElement && visible(deleteButton),
        confirmReady: confirmButton instanceof HTMLElement && visible(confirmButton),
        confirmButtons,
        dialogs,
        visibleActionLabels,
      };
    })()`,
    returnByValue: true,
  });
  return {
    phase,
    ...(typeof result?.value === 'object' && result?.value ? (result.value as Record<string, unknown>) : {}),
  };
}

async function waitForGeminiConversationListEntry(
  Runtime: ChromeClient['Runtime'],
  conversationId: string,
  options?: { timeoutMs?: number; description?: string },
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
  await Runtime.evaluate({
    expression: `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (list instanceof HTMLElement) {
        list.scrollTop = 0;
        return { reset: true };
      }
      return { reset: false };
    })()`,
    returnByValue: true,
  });
  return waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const list = document.querySelector('[data-test-id="all-conversations"]');
      const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .find((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
      if (anchor instanceof HTMLAnchorElement) {
        const rowNode = anchor.closest('[data-test-id="conversation"], li, div, section, article') || anchor;
        if (!(rowNode instanceof Element)) {
          return null;
        }
        rowNode.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = rowNode.getBoundingClientRect();
        return {
          title: normalize(rowNode.textContent || anchor.textContent || '') || '${conversationId}',
          x: rect.left + rect.width - 12,
          y: rect.top + rect.height / 2,
          left: rect.left,
          visible: visible(rowNode),
        };
      }
      if (list instanceof HTMLElement && list.scrollHeight > list.clientHeight) {
        const before = list.scrollTop;
        const step = Math.max(Math.floor(list.clientHeight * 0.8), 200);
        list.scrollTop = Math.min(list.scrollHeight, before + step);
      }
      return null;
    })()`,
    {
      timeoutMs: options?.timeoutMs ?? 10_000,
      description:
        options?.description ?? `Gemini conversation list entry ready for ${conversationId}`,
    },
  );
}

async function validateGeminiConversationUrlWithClient(
  client: Pick<ChromeClient, 'Page' | 'Runtime' | 'Runtime'>,
  conversationId: string,
): Promise<void> {
  const targetUrl = resolveGeminiConversationUrl(conversationId);
  const settled = await navigateAndSettle(client, {
    url: targetUrl,
    routeExpression: `location.pathname === ${JSON.stringify(`/app/${conversationId}`)}`,
    routeDescription: `Gemini conversation route for ${conversationId}`,
    readyExpression: `document.readyState === "interactive" || document.readyState === "complete"`,
    readyDescription: `Gemini conversation document ready for ${conversationId}`,
    timeoutMs: 12_000,
    fallbackToLocationAssign: true,
  });
  if (!settled.ok) {
    throw new Error('Conversation URL is invalid or missing.');
  }
  const { result } = await client.Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  const href = typeof result?.value === 'string' ? result.value : '';
  if (!href.includes(`/app/${conversationId}`)) {
    throw new Error('Conversation URL is invalid or missing.');
  }
  await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
  await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
  const rowReady = await waitForGeminiConversationListEntry(client.Runtime, conversationId, {
    timeoutMs: 8_000,
    description: `Gemini root conversation list entry visible for ${conversationId}`,
  });
  if (!rowReady.ok) {
    throw new Error('Conversation URL is invalid or missing.');
  }
}

async function dismissGeminiPreciseLocationDialog(
  Runtime: ChromeClient['Runtime'],
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const visible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
          .filter((node) => visible(node) && normalize(node.textContent || '').includes('use your precise location'));
        if (!dialogs.length) return { present: false };
        let clicked = 0;
        for (const dialog of dialogs) {
          const dismissButtons = Array.from(dialog.querySelectorAll('button, [role="button"]'))
            .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || node.textContent || '') === 'dismiss');
          for (const button of dismissButtons) {
            if (!(button instanceof HTMLElement)) continue;
            button.click();
            clicked += 1;
          }
        }
        return { present: true, clicked };
      })()`,
      returnByValue: true,
    });
    const payload = (result?.value ?? {}) as { present?: boolean; clicked?: number };
    if (!payload.present) {
      return;
    }
    if ((payload.clicked ?? 0) < 1) {
      throw new Error('Gemini precise-location dialog is blocking the conversation list, but no visible Dismiss button was found.');
    }
    const dismissed = await waitForPredicate(
      Runtime,
      `(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const visible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const remaining = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
          .filter((node) => visible(node) && normalize(node.textContent || '').includes('use your precise location'));
        return remaining.length === 0 ? { dismissed: true } : null;
      })()`,
      {
        timeoutMs: 3_000,
        description: 'Gemini precise-location dialog dismissed',
      },
    );
    if (dismissed.ok) {
      return;
    }
  }
  throw new Error('Gemini precise-location dialog remained visible after repeated dismiss attempts.');
}

async function ensureGeminiMainMenuOpen(
  client: Pick<ChromeClient, 'Runtime'>,
): Promise<void> {
  const listReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (!(list instanceof Element)) return null;
      const rect = list.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { open: true } : null;
    })()`,
    {
      timeoutMs: 1_000,
      description: 'Gemini main menu already open',
    },
  );
  if (listReady.ok) {
    return;
  }
  const opened = await pressButton(client.Runtime, {
    selector: 'button[aria-label="Main menu"]',
    interactionStrategies: ['click', 'pointer'],
    timeoutMs: 5_000,
  });
  if (!opened.ok) {
    throw new Error(opened.reason ?? 'Gemini main menu toggle not found.');
  }
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (!(list instanceof Element)) return null;
      const rect = list.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { open: true } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini main menu open',
    },
  );
  if (!ready.ok) {
    throw new Error('Gemini main menu did not open.');
  }
}

async function setGeminiPrompt(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  prompt: string,
): Promise<void> {
  const normalizedPrompt = normalizePromptText(prompt);
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dispatchClick = (target) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 1,
            view: window,
          }));
        }
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (!(target instanceof HTMLElement)) return { ok: false };
      dispatchClick(target);
      target.focus();
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.value = '';
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'input' };
      }
      if (target.isContentEditable) {
        const selection = target.ownerDocument?.getSelection?.();
        if (selection) {
          const range = target.ownerDocument.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        target.replaceChildren();
        target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: '', inputType: 'deleteByCut' }));
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        return { ok: true, mode: 'contenteditable' };
      }
      return { ok: false };
    })()`,
    returnByValue: true,
  });
  if (!result?.value?.ok) {
    throw new Error('Gemini prompt composer did not become ready.');
  }

  await client.Input.insertText({ text: prompt });

  const verified = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '')
        .replace(/\\r\\n/g, '\\n')
        .replace(/\\u00a0/g, ' ')
        .split('\\n')
        .map((line) => line.replace(/\\s+/g, ' ').trim())
        .join('\\n')
        .trim();
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        return { text: normalize(target.value || '') };
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        return { text: normalize(target.innerText || target.textContent || '') };
      }
      return { text: '' };
    })()`,
    returnByValue: true,
  });
  if (normalizePromptText(String(verified.result?.value?.text ?? '')) === normalizedPrompt) {
    return;
  }

  const fallback = await client.Runtime.evaluate({
    expression: `(() => {
      const text = ${JSON.stringify(prompt)};
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.value = text;
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        target.replaceChildren();
        const lines = text.split(/\\r?\\n/);
        lines.forEach((line, index) => {
          if (index > 0) {
            target.appendChild(document.createElement('br'));
          }
          target.appendChild(document.createTextNode(line));
        });
        target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste' }));
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  if (!fallback.result?.value) {
    throw new Error('Gemini prompt text could not be inserted into the composer.');
  }
}

async function clickGeminiSendButton(client: Pick<ChromeClient, 'Runtime' | 'Input'>): Promise<void> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_SEND_BUTTON_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node) && !(node instanceof HTMLButtonElement && node.disabled));
      if (!(target instanceof HTMLElement)) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
    returnByValue: true,
  });
  const point = (result?.value ?? null) as { x?: number; y?: number } | null;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('Gemini send button did not become ready.');
  }
  await client.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: Number(point.x),
    y: Number(point.y),
    button: 'none',
  });
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
}

async function readGeminiPromptState(Runtime: ChromeClient['Runtime']): Promise<{
  href: string;
  conversationId: string | null;
  assistantTexts: string[];
  isGenerating: boolean;
}> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const root =
        document.querySelector('[data-test-id="chat-history-container"]') ||
        document.querySelector('main') ||
        document.body;
      const assistantTexts = [];
      const seen = new Set();
      const responseSelectors = [
        'structured-content-container.model-response-text',
        'structured-content-container',
        'message-content',
        '.response-content .markdown',
        '.response-content',
        'model-response',
      ];
      const responseNodes = root
        ? Array.from(root.querySelectorAll(responseSelectors.join(',')))
        : [];
      for (const node of responseNodes) {
        if (!(node instanceof HTMLElement) || !visible(node)) continue;
        if (node.closest('form,[role="textbox"],textarea,input,button,nav,aside,[role="dialog"],[data-test-id="all-conversations"],user-query,user-query-content')) continue;
        const text = normalize(node.innerText || node.textContent || '');
        if (text.length < 3) continue;
        const childDuplicates = Array.from(node.children)
          .filter((child) => child instanceof HTMLElement && visible(child))
          .some((child) => normalize((child).innerText || child.textContent || '') === text);
        if (childDuplicates) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        assistantTexts.push(text);
      }
      if (assistantTexts.length === 0 && root) {
        const fallbackNodes = Array.from(root.querySelectorAll('p,li,pre,code,blockquote,div,span'));
        for (const node of fallbackNodes) {
          if (!(node instanceof HTMLElement) || !visible(node)) continue;
          if (node.closest('form,[role="textbox"],textarea,input,button,nav,aside,[role="dialog"],[data-test-id="all-conversations"],user-query,user-query-content')) continue;
          const text = normalize(node.innerText || node.textContent || '');
          if (text.length < 16) continue;
          const childDuplicates = Array.from(node.children)
            .filter((child) => child instanceof HTMLElement && visible(child))
            .some((child) => normalize((child).innerText || child.textContent || '') === text);
          if (childDuplicates) continue;
          if (seen.has(text)) continue;
          seen.add(text);
          assistantTexts.push(text);
        }
      }
      const sendButtons = ${JSON.stringify(GEMINI_SEND_BUTTON_SELECTORS)};
      const isGenerating = Array.from(document.querySelectorAll('button'))
        .some((button) => {
          if (!(button instanceof HTMLButtonElement) || !visible(button)) return false;
          const label = normalize(button.getAttribute('aria-label') || button.textContent || '').toLowerCase();
          if (sendButtons.some((selector) => button.matches(selector))) return false;
          return label.includes('stop') || label.includes('cancel generation');
        });
      const match = location.pathname.match(/^\\/app\\/([^/?#]+)/i);
      return {
        href: location.href,
        conversationId: match?.[1] ?? null,
        assistantTexts,
        isGenerating,
      };
    })()`,
    returnByValue: true,
  });
  const value = (result?.value ?? {}) as {
    href?: string;
    conversationId?: string | null;
    assistantTexts?: string[];
    isGenerating?: boolean;
  };
  return {
    href: typeof value.href === 'string' ? value.href : '',
    conversationId: typeof value.conversationId === 'string' && value.conversationId.trim() ? value.conversationId : null,
    assistantTexts: Array.isArray(value.assistantTexts) ? value.assistantTexts.map((entry) => normalizeWhitespace(entry)) : [],
    isGenerating: Boolean(value.isGenerating),
  };
}

export function selectNewestGeminiAssistantText(
  baseline: string[],
  current: string[],
  prompt: string,
): string | null {
  const baselineSet = new Set(baseline.map((entry) => normalizePromptText(entry)));
  const normalizedPrompt = normalizePromptText(prompt);
  const candidates = current
    .map((entry) => sanitizeGeminiAssistantText(entry))
    .filter((entry) => entry && entry !== normalizedPrompt && !baselineSet.has(entry));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

async function waitForGeminiPromptResponse(
  Runtime: ChromeClient['Runtime'],
  baseline: { href: string; conversationId: string | null; assistantTexts: string[] },
  prompt: string,
  timeoutMs: number,
): Promise<BrowserProviderPromptResult> {
  const deadline = Date.now() + timeoutMs;
  let stableText: string | null = null;
  let stableCount = 0;
  while (Date.now() < deadline) {
    const state = await readGeminiPromptState(Runtime);
    const nextText = selectNewestGeminiAssistantText(baseline.assistantTexts, state.assistantTexts, prompt);
    if (nextText) {
      if (nextText === stableText) {
        stableCount += 1;
      } else {
        stableText = nextText;
        stableCount = 1;
      }
      if (!state.isGenerating && stableCount >= 2) {
        return {
          text: nextText,
          conversationId: state.conversationId ?? baseline.conversationId,
          url: state.href || baseline.href,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_250));
  }
  throw new Error('Timed out waiting for Gemini assistant response.');
}

async function readGeminiConversationContextWithClient(
  client: Pick<ChromeClient, 'Runtime' | 'Page'>,
  conversationId: string,
): Promise<GeminiConversationContextProbe> {
  await navigateToGeminiConversationSurface(client, resolveGeminiConversationUrl(conversationId));
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasUser = Array.from(document.querySelectorAll('user-query, user-query-content'))
        .some((node) => visible(node));
      const hasAssistantText = Array.from(document.querySelectorAll(
        'structured-content-container.model-response-text, structured-content-container, message-content, .response-content .markdown, .response-content, model-response'
      )).some((node) => visible(node));
      const hasAssistantMedia = Array.from(document.querySelectorAll(
        'model-response img.image, model-response img.loaded, model-response button.image-button, model-response button[data-test-id="download-generated-image-button"]'
      )).some((node) => visible(node));
      return hasUser || hasAssistantText || hasAssistantMedia ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: `Gemini conversation content ready for ${conversationId}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini conversation content not found for ${conversationId}.`);
  }
  await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasAssistantText = Array.from(document.querySelectorAll(
        'structured-content-container.model-response-text message-content, structured-content-container.model-response-text .markdown, message-content'
      )).some((node) => visible(node) && String(node.textContent || '').trim().length > 0);
      const hasAssistantMedia = Array.from(document.querySelectorAll(
        'model-response img.image, model-response img.loaded, model-response button.image-button, model-response button[data-test-id="download-generated-image-button"]'
      )).some((node) => visible(node));
      return hasAssistantText || hasAssistantMedia ? { settled: true } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: `Gemini conversation response settled for ${conversationId}`,
    },
  ).catch(() => undefined);
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const sanitizeAssistant = (value) => normalize(value)
        .replace(/^(?:show thinking\\s+)?gemini said(?:\\s+|$)/i, '')
        .replace(/\\s+(?:copy prompt|listen|show more options)(?:\\s+(?:copy prompt|listen|show more options))*$/i, '')
        .trim();
      const sanitizeUser = (value) => normalize(value)
        .replace(/^you said\\s+/i, '')
        .trim();
      const inferMimeType = (name) => {
        const lower = String(name || '').toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.pdf')) return 'application/pdf';
        if (lower.endsWith('.doc')) return 'application/msword';
        if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
        if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (lower.endsWith('.csv')) return 'text/csv';
        if (lower.endsWith('.md')) return 'text/markdown';
        if (lower.endsWith('.txt')) return 'text/plain';
        return undefined;
      };
      const chooseText = (container, selectors, sanitizer) => {
        for (const selector of selectors) {
          for (const node of Array.from(container.querySelectorAll(selector))) {
            if (!(node instanceof HTMLElement) || !visible(node)) continue;
            const text = sanitizer(node.innerText || node.textContent || '');
            if (!text) continue;
            const childDuplicates = Array.from(node.children)
              .filter((child) => child instanceof HTMLElement && visible(child))
              .some((child) => sanitizer(child.innerText || child.textContent || '') === text);
            if (childDuplicates) continue;
            return text;
          }
        }
        return sanitizer(container.innerText || container.textContent || '');
      };
      const root = document.querySelector('main') || document.body;
      const turns = Array.from(root.querySelectorAll('user-query, model-response'))
        .filter((node) => node instanceof HTMLElement && visible(node));
      turns.sort((left, right) => {
        const position = left.compareDocumentPosition(right);
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        return 0;
      });
      const messages = [];
      const files = [];
      const artifacts = [];
      const seenFileIds = new Set();
      const seenArtifactIds = new Set();
      for (const node of turns) {
        if (!(node instanceof HTMLElement)) continue;
        const isUser = node.matches('user-query');
        let assistantArtifactsAdded = 0;
        if (!isUser) {
          const messageIndex = messages.length;
          const generatedImages = Array.from(node.querySelectorAll('img.image, img.loaded, img'))
            .filter((entry) => entry instanceof HTMLImageElement && visible(entry));
          let artifactOrdinal = 0;
          for (const image of generatedImages) {
            if (!(image instanceof HTMLImageElement)) continue;
            const container =
              image.closest('image-renderer, image-response, .image-container, .image-button') ||
              image.parentElement ||
              node;
            const dedupeKey = normalize(image.src || '') || ('message-' + messageIndex + '-image-' + artifactOrdinal);
            if (seenArtifactIds.has(dedupeKey)) continue;
            seenArtifactIds.add(dedupeKey);
            const artifactId =
              ${JSON.stringify('gemini-artifact:')} +
              ${JSON.stringify(conversationId)} +
              ':' + messageIndex +
              ':' + artifactOrdinal;
            artifactOrdinal += 1;
            const width = image.naturalWidth || image.width || null;
            const height = image.naturalHeight || image.height || null;
            artifacts.push({
              id: artifactId,
              title: 'Generated image ' + artifactOrdinal,
              kind: 'image',
              uri: image.src || undefined,
              messageIndex,
              metadata: {
                width,
                height,
                hasDownloadButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="download-generated-image-button"]'),
                ),
                hasShareButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="share-button"]'),
                ),
              },
            });
            assistantArtifactsAdded += 1;
          }
        }
        const text = isUser
          ? chooseText(
              node,
              [
                'user-query-content p.query-text-line',
                'user-query-content .query-text',
                'user-query-content .query-content',
                'user-query-content',
              ],
              sanitizeUser,
            )
          : chooseText(
              node,
              [
                'structured-content-container.model-response-text message-content',
                'structured-content-container.model-response-text .markdown',
                'structured-content-container.model-response-text',
                'message-content',
                '.response-content .markdown',
                '.response-content',
              ],
              sanitizeAssistant,
            );
        if (!text && assistantArtifactsAdded === 0) continue;
        const role = isUser ? 'user' : 'assistant';
        const previous = messages[messages.length - 1];
        if (previous && previous.role === role && previous.text === text) continue;
        if (text) {
          messages.push({ role, text });
        }
        if (isUser) {
          const turnFileNodes = Array.from(node.querySelectorAll(
            '[data-test-id="uploaded-file"], [data-test-id="file-preview"], img[data-test-id="image-preview"], button[aria-label^="Remove file "]',
          )).filter((entry) => entry instanceof HTMLElement && visible(entry));
          let fileOrdinal = 0;
          for (const fileNode of turnFileNodes) {
            if (!(fileNode instanceof HTMLElement)) continue;
            const chip = fileNode.closest('[data-test-id="uploaded-file"], [data-test-id="file-preview"], uploader-file-preview, uploader-file-preview-container')
              || fileNode;
            const labeledButton = chip.querySelector('button[aria-label]') || chip.querySelector('[aria-label]');
            const removeButton = chip.querySelector('button[aria-label^="Remove file "]');
            const imagePreview = chip.matches('img[data-test-id="image-preview"]')
              ? chip
              : chip.querySelector('img[data-test-id="image-preview"]');
            const explicitName = labeledButton instanceof HTMLElement
              ? normalize(labeledButton.getAttribute('aria-label') || labeledButton.getAttribute('title') || '')
              : '';
            const removeName = removeButton instanceof HTMLElement
              ? normalize((removeButton.getAttribute('aria-label') || '').replace(/^Remove file\\s+/i, ''))
              : '';
            const visibleName = normalize(
              chip.querySelector('.new-file-name, [data-test-id="file-name"]')?.textContent || '',
            );
            const visibleType = normalize(
              chip.querySelector('.new-file-type, .file-type')?.textContent || '',
            );
            let name = explicitName || removeName || visibleName;
            if (name && visibleType && !/\\.[a-z0-9]{1,8}$/i.test(name) && /^[A-Z0-9]{1,8}$/i.test(visibleType)) {
              name = name + '.' + visibleType.toLowerCase();
            }
            if (!name && imagePreview instanceof HTMLImageElement) {
              name = normalize(imagePreview.getAttribute('aria-label') || imagePreview.getAttribute('alt') || '');
            }
            if (!name) continue;
            const fileId = ${JSON.stringify('gemini-conversation-file:')} + ${JSON.stringify(conversationId)} + ':' + fileOrdinal + ':' + name;
            fileOrdinal += 1;
            if (seenFileIds.has(fileId)) continue;
            seenFileIds.add(fileId);
            const mimeType = inferMimeType(name);
            files.push({
              id: fileId,
              name,
              provider: 'gemini',
              source: 'conversation',
              mimeType,
              metadata: {
                messageIndex: messages.length - 1,
                kind: imagePreview instanceof HTMLImageElement ? 'image-preview' : 'uploaded-file',
              },
            });
          }
          continue;
        }
      }
      if (artifacts.length === 0) {
        const responseNodes = Array.from(root.querySelectorAll('model-response'))
          .filter((entry) => entry instanceof HTMLElement && visible(entry));
        let responseIndex = 0;
        for (const responseNode of responseNodes) {
          if (!(responseNode instanceof HTMLElement)) continue;
          const generatedImages = Array.from(responseNode.querySelectorAll('img.image, img.loaded, img'))
            .filter((entry) => entry instanceof HTMLImageElement && visible(entry));
          let artifactOrdinal = 0;
          for (const image of generatedImages) {
            if (!(image instanceof HTMLImageElement)) continue;
            const src = normalize(image.src || '');
            if (!src || seenArtifactIds.has(src)) continue;
            seenArtifactIds.add(src);
            const container =
              image.closest('image-renderer, image-response, .image-container, .image-button') ||
              image.parentElement ||
              responseNode;
            const width = image.naturalWidth || image.width || null;
            const height = image.naturalHeight || image.height || null;
            artifacts.push({
              id:
                ${JSON.stringify('gemini-artifact:')} +
                ${JSON.stringify(conversationId)} +
                ':fallback:' + responseIndex + ':' + artifactOrdinal,
              title: 'Generated image ' + (artifactOrdinal + 1),
              kind: 'image',
              uri: src || undefined,
              messageIndex: messages.length > 0 ? messages.length - 1 : undefined,
              metadata: {
                width,
                height,
                hasDownloadButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="download-generated-image-button"]'),
                ),
                hasShareButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="share-button"]'),
                ),
              },
            });
            artifactOrdinal += 1;
          }
          responseIndex += 1;
        }
      }
      return JSON.stringify({
        provider: 'gemini',
        conversationId: ${JSON.stringify(conversationId)},
        messages,
        files,
        artifacts,
      });
    })()`,
    returnByValue: true,
  });
  const rawPayload = typeof result?.value === 'string' ? result.value : null;
  const payload = rawPayload ? (JSON.parse(rawPayload) as GeminiConversationContextProbe) : null;
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error(`Gemini conversation messages not found for ${conversationId}.`);
  }
  return payload;
}

async function openGeminiConversationMenu(
  client: ChromeClient,
  conversationId: string,
  trace?: GeminiDeleteTrace,
): Promise<void> {
  await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
  await dismissGeminiPreciseLocationDialog(client.Runtime);
  await ensureGeminiMainMenuOpen(client);
  await client.Runtime.evaluate({
    expression: `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (list instanceof HTMLElement) {
        list.scrollTop = 0;
        return { reset: true };
      }
      return { reset: false };
    })()`,
    returnByValue: true,
  });
  const ready = await waitForGeminiConversationListEntry(client.Runtime, conversationId, {
    timeoutMs: 10_000,
    description: `Gemini conversation row menu ready for ${conversationId}`,
  });
  if (!ready.ok) {
    throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
  }
  const rowInfo = (ready.value ?? {}) as { title?: string; x?: number; y?: number; left?: number };
  const title = normalizeWhitespace(rowInfo.title ?? '');
  const hoverX = Number.isFinite(rowInfo.x) ? Number(rowInfo.x) : 0;
  const hoverY = Number.isFinite(rowInfo.y) ? Number(rowInfo.y) : 0;
  const hoverLeft = Number.isFinite(rowInfo.left) ? Number(rowInfo.left) : 0;
  if (!title || !Number.isFinite(hoverY)) {
    throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
  }
  await client.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: hoverLeft + 10,
    y: hoverY,
    button: 'none',
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: hoverX,
    y: hoverY,
    button: 'none',
  });
  if (trace) {
    trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'after-hover'));
  }
  const menuButtonReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const targetLabel = ${JSON.stringify(`More options for ${title}`)};
      const targetY = ${JSON.stringify(hoverY)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            distance: Math.abs((rect.top + rect.height / 2) - targetY),
          };
        });
      return candidates.length > 0 ? { count: candidates.length } : null;
    })()`,
    {
      timeoutMs: 3_000,
      description: `Gemini conversation action button ready for ${conversationId}`,
    },
  );
  if (!menuButtonReady.ok) {
    if (trace) {
      trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'menu-button-missing'));
    }
    throw new Error('conversation-actions-menu-missing');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const targetLabel = ${JSON.stringify(`More options for ${title}`)};
      const targetY = ${JSON.stringify(hoverY)};
      const candidates = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel)
        .map((node) => {
          const touchTarget =
            node instanceof HTMLElement ? node.querySelector('.mat-mdc-button-touch-target') : null;
          const rect = (touchTarget instanceof HTMLElement ? touchTarget : node).getBoundingClientRect();
          return {
            distance: Math.abs((rect.top + rect.height / 2) - targetY),
            clicked: node instanceof HTMLElement ? (node.click(), true) : false,
          };
        })
        .sort((left, right) => left.distance - right.distance);
      const match = candidates[0];
      if (!match) return { ok: false, reason: 'conversation-actions-menu-missing' };
      return { ok: true, clicked: match.clicked };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as { ok?: boolean; reason?: string; clicked?: boolean };
  if (!payload.ok) {
    throw new Error(payload.reason || `Gemini conversation row menu not found for ${conversationId}.`);
  }
  if (!payload.clicked) {
    throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
  }
  if (trace) {
    trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'after-menu-click'));
  }
}

async function selectGeminiConversationDeleteMenuItem(client: ChromeClient, trace?: GeminiDeleteTrace): Promise<void> {
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const button = document.querySelector('button[data-test-id="delete-button"]');
      const rect = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
      return rect && rect.width > 0 && rect.height > 0
        ? { ready: true }
        : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini conversation delete menu item ready',
    },
  );
  if (!ready.ok) {
    if (trace) {
      trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'delete-menu-missing'));
    }
    throw new Error('Gemini conversation delete menu did not open.');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const deleteNode = document.querySelector('button[data-test-id="delete-button"]');
      if (!(deleteNode instanceof HTMLElement)) return { ok: false, reason: 'delete-menu-item-missing' };
      deleteNode.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as { ok?: boolean; reason?: string };
  if (!payload.ok) {
    throw new Error(payload.reason || 'Gemini conversation delete menu item not found.');
  }
  if (trace) {
    trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'after-delete-click'));
  }
}

async function openGeminiConversationRenameDialog(client: ChromeClient): Promise<void> {
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const button = document.querySelector('button[data-test-id="rename-button"]');
      const rect = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
      return rect && rect.width > 0 && rect.height > 0 ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini conversation rename menu item ready',
    },
  );
  if (!ready.ok) {
    throw new Error('Gemini conversation rename menu did not open.');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const button = Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((node) => node instanceof HTMLElement &&
          node.getAttribute('data-test-id') === 'rename-button' &&
          node.getBoundingClientRect().width > 0 &&
          node.getBoundingClientRect().height > 0);
      if (!(button instanceof HTMLElement)) return { ok: false };
      button.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  if (result?.value?.ok !== true) {
    throw new Error('Gemini conversation rename menu item not found.');
  }
  const dialogReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const input = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR)});
      const save = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_SAVE_SELECTOR)});
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      return visible(input) && visible(save) ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini conversation rename dialog ready',
    },
  );
  if (!dialogReady.ok) {
    throw new Error('Gemini conversation rename dialog did not open.');
  }
}

async function renameGeminiConversationOnPage(
  client: ChromeClient,
  conversationId: string,
  newTitle: string,
): Promise<void> {
  const normalizedTitle = normalizeWhitespace(newTitle);
  if (!normalizedTitle) {
    throw new Error('Gemini conversation title cannot be empty.');
  }
  await openGeminiConversationActionsMenuOnConversationPage(client, conversationId);
  await openGeminiConversationRenameDialog(client);
  const renamed = await submitInlineRename(
    client.Runtime,
    {
      inputSelector: GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR,
      value: normalizedTitle,
      closeSelector: '[role="dialog"], mat-dialog-container',
      submitStrategy: 'native-then-synthetic',
      entryStrategy: 'native-input',
      timeoutMs: 10_000,
    },
    {
      Input: client.Input,
    },
  );
  if (!renamed.ok) {
    throw new Error(`Gemini conversation rename save failed: ${renamed.reason ?? 'Rename dialog did not submit.'}`);
  }
  const dialogClosed = await waitForPredicate(
    client.Runtime,
    `(() => {
      const dialog = document.querySelector('[role="dialog"], mat-dialog-container');
      const input = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR)});
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      return !visible(dialog) && !visible(input) ? { closed: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: 'Gemini conversation rename dialog dismissed',
    },
  );
  if (!dialogClosed.ok) {
    throw new Error('Gemini conversation rename dialog remained visible after save.');
  }
  await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
  await ensureGeminiMainMenuOpen(client);
  const persisted = await waitForPredicate(
    client.Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .find((node) =>
          node instanceof HTMLAnchorElement &&
          visible(node) &&
          node.href.includes('/app/' + ${JSON.stringify(conversationId)}),
        );
      if (!(anchor instanceof HTMLAnchorElement)) return null;
      const title = normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');
      return title === ${JSON.stringify(normalizedTitle)} ? { title } : null;
    })()`,
    {
      timeoutMs: 15_000,
      description: `Gemini renamed conversation visible in root list for ${conversationId}`,
    },
  );
  if (!persisted.ok) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
        const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
          .find((node) =>
            node instanceof HTMLAnchorElement &&
            node.href.includes('/app/' + ${JSON.stringify(conversationId)}),
          );
        if (!(anchor instanceof HTMLAnchorElement)) return null;
        return normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');
      })()`,
      returnByValue: true,
    });
    throw new Error(
      `Gemini conversation rename did not persist. Expected "${normalizedTitle}", got "${String(result?.value ?? '')}".`,
    );
  }
}

async function clickGeminiConversationDeleteConfirmations(
  client: ChromeClient,
  trace?: GeminiDeleteTrace,
): Promise<number> {
  const opened = await waitForPredicate(
    client.Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => {
          if (!visible(node)) return false;
          const text = normalize(node.textContent || '');
          const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
            .filter((button) => visible(button))
            .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''));
          return !text.includes('use your precise location') && buttons.includes('delete') && buttons.includes('cancel');
        });
      return dialogs.length > 0 ? { count: dialogs.length } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini conversation delete confirmation dialog ready',
    },
  );
  if (!opened.ok) {
    if (trace) {
      trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'confirm-dialog-missing'));
    }
    throw new Error('Gemini conversation delete confirmation dialog did not open.');
  }
  if (trace) {
    trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'confirm-dialog-open'));
  }
  let clicked = 0;
  const clearedPredicate = `(() => {
    const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const active = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.classList.contains('mdc-dialog--closing')) return false;
        const text = normalize(node.textContent || '');
        const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
          .filter((button) => visible(button))
          .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''));
        return !text.includes('use your precise location') && buttons.includes('delete') && buttons.includes('cancel');
      });
    return active.length === 0 ? { cleared: true } : null;
  })()`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const button = document.querySelector('button[data-test-id="confirm-button"]');
        if (!(button instanceof HTMLElement)) return null;
        const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
        const rect = (touchTarget instanceof HTMLElement ? touchTarget : button).getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true,
    });
    const point = (result?.value ?? null) as { x?: number; y?: number } | null;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      break;
    }
    await client.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: Number(point.x),
      y: Number(point.y),
      button: 'none',
    });
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: Number(point.x),
      y: Number(point.y),
      button: 'left',
      clickCount: 1,
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: Number(point.x),
      y: Number(point.y),
      button: 'left',
      clickCount: 1,
    });
    clicked += 1;
    const cleared = await waitForPredicate(client.Runtime, clearedPredicate, {
      timeoutMs: 5_000,
      description: 'Gemini conversation delete confirmation dismissed',
    });
    if (cleared.ok) {
      if (trace) {
        trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'after-confirm-click'));
      }
      return clicked;
    }
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const button = document.querySelector('button[data-test-id="confirm-button"]');
      if (!(button instanceof HTMLElement)) return { ok: false };
      button.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as { ok?: boolean };
  if (payload.ok) {
    clicked += 1;
    const cleared = await waitForPredicate(client.Runtime, clearedPredicate, {
      timeoutMs: 5_000,
      description: 'Gemini conversation delete confirmation dismissed',
    });
    if (cleared.ok) {
      if (trace) {
        trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'after-confirm-click'));
      }
      return clicked;
    }
  }
  if (clicked < 1) {
    throw new Error('Gemini conversation delete confirmation button not found.');
  }
  throw new Error('Gemini conversation delete confirmation remained visible after confirm attempts.');
}

async function waitForGeminiConversationRemoved(
  client: ChromeClient,
  conversationId: string,
  timeoutMs: number = 90_000,
  trace?: GeminiDeleteTrace,
): Promise<void> {
  const freshAbsenceRequired = 2;
  let consecutiveFreshAbsenceCount = 0;
  const startedAt = Date.now();
  const verifierTrace: Array<Record<string, unknown>> = [];

  const localDisappear = await waitForPredicate(
    client.Runtime,
    `(() => {
      const remaining = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
      return remaining ? null : { removed: true };
    })()`,
    {
      timeoutMs: 8_000,
      description: `Gemini conversation ${conversationId} removed from current page`,
    },
  );
  verifierTrace.push({
    phase: 'current-page',
    ok: localDisappear.ok,
    elapsedMs: Date.now() - startedAt,
    attempts: localDisappear.attempts ?? null,
  });

  const deadline = Date.now() + timeoutMs;
  let lastSeen = false;
  let lastReason = '';
  let pass = 0;
  while (Date.now() < deadline) {
    pass += 1;
    try {
      await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
      await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      verifierTrace.push({
        phase: 'fresh-root-error',
        pass,
        elapsedMs: Date.now() - startedAt,
        reason: lastReason,
      });
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    const check = await client.Runtime.evaluate({
      expression: `(() => {
        const remaining = Array.from(document.querySelectorAll('a[href*="/app/"]'))
          .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
        return { remaining };
      })()`,
      returnByValue: true,
    });
    lastSeen = Boolean((check.result?.value as { remaining?: boolean } | undefined)?.remaining);
    if (!lastSeen) {
      consecutiveFreshAbsenceCount += 1;
      verifierTrace.push({
        phase: 'fresh-root',
        pass,
        elapsedMs: Date.now() - startedAt,
        remaining: false,
        consecutiveFreshAbsenceCount,
      });
      if (consecutiveFreshAbsenceCount >= freshAbsenceRequired) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    consecutiveFreshAbsenceCount = 0;
    verifierTrace.push({
      phase: 'fresh-root',
      pass,
      elapsedMs: Date.now() - startedAt,
      remaining: true,
      consecutiveFreshAbsenceCount,
    });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  if (trace) {
    trace.push(...verifierTrace);
  }
  const traceSummary = summarizeGeminiDeleteTrace(verifierTrace, 4);
  if (lastSeen) {
    throw new Error(`Gemini conversation ${conversationId} still appears in the conversation list after delete. trace=${traceSummary}`);
  }
  throw new Error(`${lastReason || `Gemini conversation ${conversationId} delete could not be verified.`} trace=${traceSummary}`);
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
  const pressed = await pressGeminiGemSaveButton(client);
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
  await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const startChat = document.querySelector(${JSON.stringify(GEMINI_GEM_START_CHAT_BUTTON_SELECTOR)});
      return visible(startChat) ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: `Gemini Gem edit surface ready after create for ${input.name}`,
    },
  ).catch(() => undefined);
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

export function resolveGeminiProjectMenuAriaLabel(projectName: string): string {
  return `More options for "${projectName}" Gem`;
}

async function openGeminiProjectActionsMenuOnProjectPage(
  client: ChromeClient,
  projectId: string,
): Promise<void> {
  await navigateToGeminiConversationSurface(client, resolveGeminiProjectUrl(projectId));
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const onRoute = location.pathname === ${JSON.stringify(`/gem/${projectId}`)};
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      return onRoute && button instanceof HTMLElement && visible(button) ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: `Gemini Gem actions button ready for ${projectId}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini Gem actions button not ready for ${projectId}.`);
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      if (!(button instanceof HTMLElement)) return null;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    })()`,
    returnByValue: true,
  });
  const point = result?.value as { x?: number; y?: number } | null;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Gemini Gem actions button not clickable for ${projectId}.`);
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: Number(point.x), y: Number(point.y), button: 'none' });
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
}

async function openGeminiConversationActionsMenuOnConversationPage(
  client: ChromeClient,
  conversationId: string,
): Promise<void> {
  await navigateToGeminiConversationSurface(client, resolveGeminiConversationUrl(conversationId));
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const onRoute = location.pathname === ${JSON.stringify(`/app/${conversationId}`)};
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      return onRoute && button instanceof HTMLElement && visible(button) ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: `Gemini conversation actions button ready for ${conversationId}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini conversation actions button not ready for ${conversationId}.`);
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      if (!(button instanceof HTMLElement)) return null;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    })()`,
    returnByValue: true,
  });
  const point = result?.value as { x?: number; y?: number } | null;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Gemini conversation actions button not clickable for ${conversationId}.`);
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: Number(point.x), y: Number(point.y), button: 'none' });
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: Number(point.x),
    y: Number(point.y),
    button: 'left',
    clickCount: 1,
  });
}

async function openGeminiProjectMenu(
  client: ChromeClient,
  projectId: string,
): Promise<{ projectName: string; menuLabel: string }> {
  const projectName = await readGeminiPersistedProjectName(client, projectId, { timeoutMs: 20_000 });
  const menuLabel = resolveGeminiProjectMenuAriaLabel(projectName);
  await navigateToGeminiGemsViewPage(client);
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const label = ${JSON.stringify(menuLabel)};
      return Array.from(document.querySelectorAll('button[aria-label],a[aria-label]'))
        .some((node) => String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label)
        ? { ready: true }
        : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: `Gemini Gem row menu ready for ${projectName}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini Gem row menu not found for "${projectName}".`);
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const projectId = ${JSON.stringify(projectId)};
      const label = ${JSON.stringify(menuLabel)};
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const projectAnchor = anchors.find((node) =>
        node instanceof HTMLAnchorElement &&
        visible(node) &&
        node.href.includes('/gem/' + projectId),
      );
      const row =
        (projectAnchor instanceof HTMLElement
          ? projectAnchor.closest('[role="listitem"], mat-list-item, li, div')
          : null) ??
        null;
      const rowCandidate = row instanceof HTMLElement && visible(row) ? row : null;
      const scopedButtons = rowCandidate
        ? Array.from(rowCandidate.querySelectorAll('button[aria-label],a[aria-label]'))
        : [];
      const target =
        scopedButtons.find((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label,
        ) ??
        Array.from(document.querySelectorAll('button[aria-label],a[aria-label]')).find((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label,
        );
      if (!(target instanceof HTMLElement)) return { ok: false, reason: rowCandidate ? 'row-menu-missing' : 'project-row-missing' };
      if (rowCandidate) {
        rowCandidate.scrollIntoView({ block: 'center', inline: 'center' });
      }
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const rowRect = rowCandidate?.getBoundingClientRect();
      const touchTarget = target.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : target;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: 'row-menu-not-clickable' };
      }
      return {
        ok: true,
        rowX: rowRect && rowRect.width > 0 && rowRect.height > 0 ? rowRect.left + Math.min(40, Math.max(12, rowRect.width / 5)) : null,
        rowY: rowRect && rowRect.width > 0 && rowRect.height > 0 ? rowRect.top + rowRect.height / 2 : null,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as {
    ok?: boolean; reason?: string; x?: number; y?: number; rowX?: number | null; rowY?: number | null;
  };
  if (!payload.ok) {
    throw new Error(payload.reason || `Gemini Gem row menu not found for "${projectName}".`);
  }
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
    throw new Error(`Gemini Gem row menu not clickable for "${projectName}".`);
  }
  if (Number.isFinite(payload.rowX) && Number.isFinite(payload.rowY)) {
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: Number(payload.rowX), y: Number(payload.rowY), button: 'none' });
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: Number(payload.rowX),
      y: Number(payload.rowY),
      button: 'left',
      clickCount: 1,
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: Number(payload.rowX),
      y: Number(payload.rowY),
      button: 'left',
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: Number(payload.x), y: Number(payload.y), button: 'none' });
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: Number(payload.x),
    y: Number(payload.y),
    button: 'left',
    clickCount: 1,
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: Number(payload.x),
    y: Number(payload.y),
    button: 'left',
    clickCount: 1,
  });
  return { projectName, menuLabel };
}

async function selectGeminiProjectDeleteMenuItem(client: ChromeClient): Promise<void> {
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const button =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      return button instanceof HTMLElement && visible(button)
        ? { ready: true }
        : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini Gem delete menu item ready',
    },
  );
  if (!ready.ok) {
    throw new Error('Gemini Gem delete menu did not open.');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const deleteNode =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      if (!(deleteNode instanceof HTMLElement)) return { ok: false, reason: 'delete-menu-item-missing' };
      deleteNode.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = deleteNode.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : deleteNode;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { ok: false, reason: 'delete-menu-item-not-clickable' };
      return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
    returnByValue: true,
  });
  const payload = (result?.value ?? {}) as { ok?: boolean; reason?: string; x?: number; y?: number };
  if (!payload.ok) {
    throw new Error(payload.reason || 'Gemini Gem delete menu item not found.');
  }
  const waitForConfirm = async (timeoutMs: number): Promise<boolean> => {
    const ready = await waitForPredicate(
      client.Runtime,
      `(() => {
        const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        const button = document.querySelector('button[data-test-id="confirm-button"]');
        return button instanceof HTMLElement && visible(button) ? { ready: true } : null;
      })()`,
      {
        timeoutMs,
        description: 'Gemini delete confirm button ready',
      },
    );
    return ready.ok;
  };
  if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: Number(payload.x), y: Number(payload.y), button: 'none' });
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: Number(payload.x),
      y: Number(payload.y),
      button: 'left',
      clickCount: 1,
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: Number(payload.x),
      y: Number(payload.y),
      button: 'left',
      clickCount: 1,
    });
    if (await waitForConfirm(1_500)) {
      return;
    }
  }
  const fallbackClick = await client.Runtime.evaluate({
    expression: `(() => {
      const button =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (fallbackClick.result?.value === true && await waitForConfirm(2_500)) {
    return;
  }
  throw new Error('Gemini Gem delete menu item did not open the confirmation dialog.');
}

async function pressGeminiGemSaveButton(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
): Promise<{ ok?: boolean; reason?: string }> {
  const located = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const exact = new Set(['create', 'update chat', 'update gem', 'save', 'update']);
      const button = Array.from(document.querySelectorAll(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))
        .find((node) => {
          if (!(node instanceof HTMLElement) || !visible(node)) return false;
          if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') return false;
          const text = normalize(node.textContent || '').toLowerCase();
          const aria = normalize(node.getAttribute('aria-label') || '').toLowerCase();
          return exact.has(text) || exact.has(aria) || aria.includes('save gem updates');
        });
      if (!(button instanceof HTMLElement)) return null;
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = clickTarget.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
    returnByValue: true,
  });
  const point = located.result?.value as { x?: number; y?: number } | undefined;
  if (typeof point?.x === 'number' && typeof point?.y === 'number') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      return { ok: true };
    }
  }
  const fallback = await pressButton(client.Runtime, {
    selector: GEMINI_GEM_CREATE_BUTTON_SELECTOR,
    match: {
      exact: ['Create', 'Update Chat', 'Update Gem', 'Save', 'Update'],
    },
    interactionStrategies: ['click', 'pointer'],
    timeoutMs: 10_000,
  });
  if (!fallback.ok) {
    return fallback;
  }
  return { ok: true };
}

async function openGeminiKnowledgeUploadMenu(
  Runtime: ChromeClient['Runtime'],
): Promise<void> {
  const pressed = await pressButton(Runtime, {
    selector: GEMINI_GEM_KNOWLEDGE_UPLOAD_TRIGGER_SELECTOR,
    interactionStrategies: ['click', 'pointer'],
    timeoutMs: 10_000,
  });
  if (!pressed.ok) {
    throw new Error(`Gemini Gem knowledge upload menu did not open: ${pressed.reason ?? 'upload trigger not clickable.'}`);
  }
  const ready = await waitForPredicate(
    Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const items = Array.from(document.querySelectorAll('button[role="menuitem"], [role="menuitem"]'))
        .filter((node) => visible(node));
      return items.length > 0 ? { ready: true } : null;
    })()`,
    {
      timeoutMs: 10_000,
      description: 'Gemini Gem knowledge upload menu ready',
    },
  );
  if (!ready.ok) {
    throw new Error('Gemini Gem knowledge upload menu item did not become ready.');
  }
}

async function clickFirstGeminiKnowledgeMenuRow(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
): Promise<boolean> {
  const located = await client.Runtime.evaluate({
    expression: `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const items = Array.from(document.querySelectorAll('button[role="menuitem"], [role="menuitem"]'))
        .filter((node) => visible(node));
      const first = items[0];
      if (!(first instanceof HTMLElement)) return null;
      first.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = first.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
    returnByValue: true,
  });
  const point = located.result?.value as { x?: number; y?: number } | undefined;
  if (typeof point?.x !== 'number' || typeof point?.y !== 'number') {
    return false;
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y });
  await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}

async function dispatchGeminiKnowledgeFiles(
  client: Pick<ChromeClient, 'Page' | 'DOM' | 'Runtime' | 'Input'>,
  filePaths: string[],
): Promise<void> {
  const imageOnly = filePaths.length > 0 && filePaths.every(isLikelyImagePath);
  await client.Page.enable();
  await client.DOM.enable();
  await (client.Page as unknown as {
    setInterceptFileChooserDialog(params: { enabled: boolean }): Promise<unknown>;
    fileChooserOpened(callback: (params: { backendNodeId?: number }) => void): void;
  }).setInterceptFileChooserDialog({ enabled: true });
  try {
    const chooserOpened = new Promise<{ backendNodeId?: number }>((resolve) => {
      (client.Page as unknown as {
        fileChooserOpened(callback: (params: { backendNodeId?: number }) => void): void;
      }).fileChooserOpened((params) => resolve(params));
    });
    const trustedClick = async (selector: string): Promise<boolean> => {
      const located = await client.Runtime.evaluate({
        expression: `(() => {
          const target = document.querySelector(${JSON.stringify(selector)});
          if (!(target instanceof HTMLElement)) return null;
          const rect = target.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return null;
          target.scrollIntoView({ block: 'center', inline: 'center' });
          const nextRect = target.getBoundingClientRect();
          return {
            x: nextRect.left + nextRect.width / 2,
            y: nextRect.top + nextRect.height / 2,
          };
        })()`,
        returnByValue: true,
      });
      const point = located.result?.value as { x?: number; y?: number } | undefined;
      if (typeof point?.x !== 'number' || typeof point?.y !== 'number') {
        return false;
      }
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y });
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      return true;
    };
    const clickKnowledgeScopedHiddenTrigger = async (selector: string): Promise<boolean> => {
      const located = await client.Runtime.evaluate({
        expression: `(() => {
          const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
          const matchesScope = (node) => {
            let current = node;
            for (let depth = 0; current && depth < 6; depth += 1) {
              const text = normalize(current.textContent || '');
              if (text.includes('Add files for your Gem to reference')) {
                return true;
              }
              current = current.parentElement;
            }
            return false;
          };
          const targets = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
          const target = targets.find((node) => node instanceof HTMLElement && matchesScope(node));
          if (!(target instanceof HTMLElement)) return null;
          target.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = target.getBoundingClientRect();
          return {
            x: rect.left + Math.max(rect.width, 1) / 2,
            y: rect.top + Math.max(rect.height, 1) / 2,
          };
        })()`,
        returnByValue: true,
      });
      const point = located.result?.value as { x?: number; y?: number } | undefined;
      if (typeof point?.x !== 'number' || typeof point?.y !== 'number') {
        return false;
      }
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y });
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      return true;
    };
    const hiddenSelectorOrder = imageOnly
      ? [
          GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR,
          'button[data-test-id="hidden-local-image-upload-button"]',
          'button[data-test-id="hidden-local-file-upload-button"]',
        ]
      : [
          GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR,
          'button[data-test-id="hidden-local-file-upload-button"]',
          'button[data-test-id="hidden-local-image-upload-button"]',
        ];
    await client.Runtime.evaluate({
      expression: `(() => {
        const selectors = ${JSON.stringify(hiddenSelectorOrder)};
        for (const selector of selectors) {
          const target = document.querySelector(selector);
          if (!(target instanceof HTMLElement)) continue;
          target.click();
          return { ok: true, selector };
        }
        return { ok: false };
      })()`,
      returnByValue: true,
    });
    let chooserPayload: { backendNodeId?: number } | null = null;
    try {
      await clickFirstGeminiKnowledgeMenuRow(client).catch(() => false);
      chooserPayload = await Promise.race([
        chooserOpened,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('chooser-timeout')), 3_000)),
      ]);
    } catch {
      let activated = false;
      for (const selector of hiddenSelectorOrder) {
        const clickedTrusted = await clickKnowledgeScopedHiddenTrigger(selector).catch(() => false);
        if (clickedTrusted) {
          activated = true;
          break;
        }
        const clickedGeneric = await trustedClick(selector).catch(() => false);
        if (clickedGeneric) {
          activated = true;
          break;
        }
        const clicked = await client.Runtime.evaluate({
          expression: `(() => {
            const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
            const matchesScope = (node) => {
              let current = node;
              for (let depth = 0; current && depth < 6; depth += 1) {
                const text = normalize(current.textContent || '');
                if (text.includes('Add files for your Gem to reference')) {
                  return true;
                }
                current = current.parentElement;
              }
              return false;
            };
            const targets = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
            const target = targets.find((node) => node instanceof HTMLElement && matchesScope(node)) ?? document.querySelector(${JSON.stringify(selector)});
            if (!(target instanceof HTMLElement)) return false;
            target.click();
            return true;
          })()`,
          returnByValue: true,
        });
        if (clicked.result?.value === true) {
          activated = true;
          break;
        }
      }
      if (!activated) {
        throw new Error('Gemini Gem knowledge Upload file action did not activate.');
      }
      chooserPayload = await Promise.race([
        chooserOpened,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini Gem knowledge file chooser did not open.')), 10_000)),
      ]);
    }
    if (!chooserPayload || !Number.isFinite(chooserPayload.backendNodeId)) {
      throw new Error('Gemini Gem knowledge file chooser did not expose a backend node.');
    }
    await client.DOM.setFileInputFiles({
      backendNodeId: chooserPayload.backendNodeId,
      files: [...filePaths],
    });
  } finally {
    await (client.Page as unknown as {
      setInterceptFileChooserDialog(params: { enabled: boolean }): Promise<unknown>;
    }).setInterceptFileChooserDialog({ enabled: false }).catch(() => undefined);
  }
}

async function waitForGeminiKnowledgeFilesVisible(
  Runtime: ChromeClient['Runtime'],
  fileNames: string[],
  timeoutMs: number = 30_000,
): Promise<void> {
  const ready = await waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const names = ${JSON.stringify(fileNames.map((name) => name.toLowerCase()))};
      const body = normalize(document.body?.innerText || '');
      const removeLabels = Array.from(document.querySelectorAll('button[aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      const scopedRemoveLabels = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const hasScopedPreview =
        document.querySelector('uploader-file-preview-container.selected-files-container') !== null ||
        document.querySelector('uploader-file-preview') !== null ||
        document.querySelector('img[data-test-id="image-preview"]') !== null ||
        document.querySelector('div[data-test-id="file-preview"]') !== null;
      return names.every((name) =>
        body.includes(name) ||
        previewNames.includes(name) ||
        removeLabels.includes('remove file ' + name) ||
        scopedRemoveLabels.includes('remove file ' + name) ||
        (hasScopedPreview && scopedRemoveLabels.some((label) => label.startsWith('remove file ')))
      )
        ? { ready: true }
        : null;
    })()`,
    {
      timeoutMs,
      description: `Gemini Gem knowledge files visible: ${fileNames.join(', ')}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini Gem knowledge upload did not surface files: ${fileNames.join(', ')}`);
  }
}

async function waitForGeminiGemSaved(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number = 20_000,
): Promise<void> {
  const saved = await waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const savedBadge = Array.from(document.querySelectorAll('div[role="status"].save-state, div[role="status"], div, span'))
        .some((node) => visible(node) && normalize(node.textContent || '') === 'gem saved');
      if (savedBadge) {
        return { ready: true, state: 'saved-badge' };
      }
      return null;
    })()`,
    {
      timeoutMs,
      description: 'Gemini Gem saved',
    },
  );
  if (!saved.ok) {
    throw new Error('Gemini Gem save did not settle.');
  }
}

async function waitForGeminiGemDirty(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number = 10_000,
): Promise<void> {
  const dirty = await waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const dirtyBadge = Array.from(document.querySelectorAll('div[role="status"].save-state, div[role="status"], div, span'))
        .some((node) => visible(node) && normalize(node.textContent || '') === 'gem not saved');
      return dirtyBadge ? { ready: true } : null;
    })()`,
    {
      timeoutMs,
      description: 'Gemini Gem dirty state visible',
    },
  );
  if (!dirty.ok) {
    throw new Error('Gemini Gem did not enter an unsaved state.');
  }
}

async function waitForGeminiEditSurfaceReady(
  Runtime: ChromeClient['Runtime'],
  projectId: string,
  timeoutMs: number = 20_000,
): Promise<void> {
  const ready = await waitForPredicate(
    Runtime,
    `(() => {
      const onRoute = location.pathname === ${JSON.stringify(`/gems/edit/${projectId}`)};
      const hasName = Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)}));
      const hasSave = Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}));
      return onRoute && hasName && hasSave ? { ready: true } : null;
    })()`,
    {
      timeoutMs,
      description: `Gemini Gem edit surface settled for ${projectId}`,
    },
  );
  if (!ready.ok) {
    throw new Error(`Gemini Gem edit surface did not settle for ${projectId}.`);
  }
}

async function scrapeGeminiProjectKnowledgeFiles(
  Runtime: ChromeClient['Runtime'],
): Promise<FileRef[]> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const rows = Array.from(document.querySelectorAll('button, [role="button"], div, li, span'))
        .filter((node) => visible(node))
        .map((node) => ({
          text: normalize(node.textContent || ''),
          aria: normalize(node.getAttribute?.('aria-label') || ''),
          testId: normalize(node.getAttribute?.('data-test-id') || ''),
        }));
      const blocked = new Set([
        'upload file',
        'add from drive',
        'import code',
        'knowledge',
        'start chat',
        'share',
      ]);
      const items = [];
      const seen = new Set();
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      for (const name of previewNames) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: name,
          name,
          provider: 'gemini',
          source: 'project',
        });
      }
      const removeButtons = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter((label) => /^Remove file\\s+/i.test(label))
        .map((label) => label.replace(/^Remove file\\s+/i, '').trim())
        .filter(Boolean);
      for (const name of removeButtons) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: name,
          name,
          provider: 'gemini',
          source: 'project',
        });
      }
      for (const row of rows) {
        const text = row.text;
        if (!text || text.length < 3 || text.length > 220) continue;
        if (blocked.has(text.toLowerCase())) continue;
        const corpus = (row.text + ' ' + row.aria + ' ' + row.testId).toLowerCase();
        if (corpus.includes('upload file') || corpus.includes('add from drive') || corpus.includes('import code')) continue;
        if (!/[.][a-z0-9]{1,8}$/i.test(text)) continue;
        const lower = text.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: text,
          name: text,
          provider: 'gemini',
          source: 'project',
        });
      }
      return items;
    })()`,
    returnByValue: true,
  });
  return Array.isArray(result?.value) ? (result.value as FileRef[]) : [];
}

async function waitForGeminiProjectKnowledgeHydrated(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number = 8_000,
): Promise<void> {
  await waitForPredicate(
    Runtime,
    `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasPreviewName = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .some((node) => visible(node) && String(node.getAttribute('title') || node.textContent || '').trim().length > 0);
      const hasRemoveButton = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .some((node) => visible(node) && /^remove file\\s+/i.test(String(node.getAttribute('aria-label') || '').trim()));
      const hasPreviewChip = Array.from(document.querySelectorAll('div[data-test-id="file-preview"], uploader-file-preview-container.selected-files-container, uploader-file-preview'))
        .some((node) => visible(node));
      return hasPreviewName || hasRemoveButton || hasPreviewChip ? { ready: true } : null;
    })()`,
    {
      timeoutMs,
      description: 'Gemini Gem knowledge list hydrated',
    },
  ).catch(() => undefined);
}

async function clickGeminiKnowledgeRemoveButton(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  fileName: string,
): Promise<boolean> {
  const located = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const targetLabel = ${JSON.stringify(`remove file ${fileName}`.toLowerCase())};
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'));
      const button = buttons.find((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel);
      if (!(button instanceof HTMLElement)) {
        return null;
      }
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
    returnByValue: true,
  });
  const point = located.result?.value as { x?: number; y?: number } | undefined;
  if (typeof point?.x !== 'number' || typeof point?.y !== 'number') {
    return false;
  }
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
  await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}

async function waitForGeminiKnowledgeFileRemoved(
  Runtime: ChromeClient['Runtime'],
  fileName: string,
  timeoutMs: number = 10_000,
): Promise<void> {
  const removed = await waitForPredicate(
    Runtime,
    `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const name = ${JSON.stringify(fileName.toLowerCase())};
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      const removeLabels = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const body = normalize(document.body?.innerText || '');
      const hasRemoveButton = removeLabels.includes('remove file ' + name);
      const hasPreviewName = previewNames.includes(name);
      const hasBodyOnly = body.includes(name) && (hasRemoveButton || hasPreviewName);
      return hasRemoveButton || hasPreviewName || hasBodyOnly ? null : { removed: true };
    })()`,
    {
      timeoutMs,
      description: `Gemini Gem knowledge file removed: ${fileName}`,
    },
  );
  if (!removed.ok) {
    throw new Error(`Gemini Gem knowledge file removal did not settle for ${fileName}.`);
  }
}

async function clickGeminiDeleteConfirmations(client: ChromeClient): Promise<number> {
  const opened = await waitForPredicate(
    client.Runtime,
    `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node));
      return buttons.length > 0 ? { count: buttons.length } : null;
    })()`,
    {
      timeoutMs: 5_000,
      description: 'Gemini delete confirmation dialog ready',
    },
  );
  if (!opened.ok) {
    throw new Error('Gemini delete confirmation dialog did not open.');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      let clicked = 0;
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || node.textContent || '') === 'delete');
      for (const button of buttons) {
        if (!(button instanceof HTMLElement)) continue;
        button.click();
        clicked += 1;
      }
      return { clicked };
    })()`,
    returnByValue: true,
  });
  const clicked = Number((result?.value as { clicked?: number } | undefined)?.clicked ?? 0);
  if (clicked < 1) {
    throw new Error('Gemini delete confirmation button not found.');
  }
  return clicked;
}

export function createGeminiAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'createProject'
  | 'deleteConversation'
  | 'deleteProjectFile'
  | 'getFeatureSignature'
  | 'getUserIdentity'
  | 'listProjects'
  | 'listConversations'
  | 'listProjectFiles'
  | 'readConversationContext'
  | 'renameConversation'
  | 'renameProject'
  | 'runPrompt'
  | 'selectRemoveProjectItem'
  | 'pushProjectRemoveConfirmation'
  | 'uploadProjectFiles'
  | 'validateConversationUrl'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
    },
    async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL),
      );
      try {
        return await readGeminiUserIdentity(client);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async getFeatureSignature(options?: BrowserProviderListOptions): Promise<string | null> {
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL),
      );
      try {
        return await readGeminiFeatureSignature(client);
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
        : resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL);
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
    async runPrompt(
      input: BrowserProviderPromptInput,
      options?: BrowserProviderListOptions,
    ): Promise<BrowserProviderPromptResult> {
      const targetUrl = resolveGeminiConfiguredUrl(input.targetUrl ?? options?.configuredUrl, GEMINI_APP_URL);
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, targetUrl);
      try {
        await navigateToGeminiConversationSurface(client, targetUrl);
        await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
        const baseline = await readGeminiPromptState(client.Runtime);
        await setGeminiPrompt(client, input.prompt);
        await clickGeminiSendButton(client);
        return await waitForGeminiPromptResponse(
          client.Runtime,
          baseline,
          input.prompt,
          Math.max(30_000, input.timeoutMs ?? 90_000),
        );
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
    async readConversationContext(
      conversationId: string,
      _projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<ConversationContext> {
      const normalizedConversationId = normalizeGeminiConversationId(conversationId);
      if (!normalizedConversationId) {
        throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
      }
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiConversationUrl(normalizedConversationId),
      );
      try {
        return await readGeminiConversationContextWithClient(client, normalizedConversationId);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async renameConversation(
      conversationId: string,
      newTitle: string,
      _projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedConversationId = normalizeGeminiConversationId(conversationId);
      if (!normalizedConversationId) {
        throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
      }
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiConversationUrl(normalizedConversationId),
      );
      try {
        await renameGeminiConversationOnPage(client, normalizedConversationId, newTitle);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async deleteConversation(
      conversationId: string,
      _projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedConversationId = normalizeGeminiConversationId(conversationId);
      if (!normalizedConversationId) {
        throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
      }
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiConversationUrl(normalizedConversationId),
      );
      const trace: GeminiDeleteTrace = [];
      try {
        await openGeminiConversationActionsMenuOnConversationPage(client, normalizedConversationId);
        await selectGeminiConversationDeleteMenuItem(client, trace);
        await clickGeminiConversationDeleteConfirmations(client, trace);
        await waitForGeminiConversationRemoved(client, normalizedConversationId, 90_000, trace);
      } catch (error) {
        trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, 'delete-error'));
        const traceSummary = summarizeGeminiDeleteTrace(trace, 5);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} trace=${traceSummary}`);
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async validateConversationUrl(
      conversationId: string,
      _projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedConversationId = normalizeGeminiConversationId(conversationId);
      if (!normalizedConversationId) {
        throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
      }
      const targetUrl = resolveGeminiConversationUrl(normalizedConversationId);
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(options, targetUrl);
      try {
        await validateGeminiConversationUrlWithClient(client, normalizedConversationId);
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
        const pressed = await pressGeminiGemSaveButton(client);
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
    async uploadProjectFiles(
      projectId: string,
      filePaths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedProjectId = normalizeGeminiProjectId(projectId);
      if (!normalizedProjectId) {
        throw new Error(`Invalid Gemini Gem id: ${projectId}`);
      }
      if (filePaths.length === 0) return;
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiEditProjectUrl(normalizedProjectId),
      );
      try {
        await navigateToGeminiEditPage(client, normalizedProjectId);
        await openGeminiKnowledgeUploadMenu(client.Runtime);
        const fileNames = filePaths.map((filePath) => path.basename(filePath));
        await dispatchGeminiKnowledgeFiles(client, filePaths);
        let knowledgeVisible = false;
        try {
          await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 8_000);
          knowledgeVisible = true;
        } catch {
          await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
          const persisted = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
          const persistedNames = persisted.map((item) => item.name.toLowerCase());
          if (fileNames.every((name) => persistedNames.includes(name.toLowerCase()))) {
            knowledgeVisible = true;
          }
        }
        if (!knowledgeVisible) {
          throw new Error(`Gemini Gem knowledge upload did not surface files: ${fileNames.join(', ')}`);
        }
        await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
        const pressed = await pressGeminiGemSaveButton(client);
        if (!pressed.ok) {
          throw new Error(`Gemini Gem knowledge save failed: ${pressed.reason ?? 'Save button not clickable.'}`);
        }
        await waitForGeminiGemSaved(client.Runtime);
        await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
        const persistedAfterSave = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
        const persistedNames = persistedAfterSave.map((item) => item.name.toLowerCase());
        if (!fileNames.every((name) => persistedNames.includes(name.toLowerCase()))) {
          const stillOnEditRoute = await client.Runtime.evaluate({
            expression: `location.pathname === ${JSON.stringify(`/gems/edit/${normalizedProjectId}`)}`,
            returnByValue: true,
          });
          if (stillOnEditRoute.result?.value === true) {
            await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 10_000);
          } else {
            await navigateToGeminiEditPage(client, normalizedProjectId);
            await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 10_000);
          }
        }
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async listProjectFiles(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
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
        await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
        let files = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
        if (files.length === 0) {
          await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 8_000);
          files = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
        }
        return files;
      } finally {
        await client.close().catch(() => undefined);
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
        await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
        await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 8_000);
        const existing = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
        const matched = existing.find((item) => item.name.toLowerCase() === fileName.toLowerCase());
        if (!matched) {
          return;
        }
        const clicked = await clickGeminiKnowledgeRemoveButton(client, matched.name);
        if (!clicked) {
          throw new Error(`Gemini Gem knowledge remove button not found for ${matched.name}.`);
        }
        await waitForGeminiKnowledgeFileRemoved(client.Runtime, matched.name, 10_000);
        await waitForGeminiGemDirty(client.Runtime, 10_000);
        const pressed = await pressGeminiGemSaveButton(client);
        if (!pressed.ok) {
          throw new Error(`Gemini Gem knowledge delete save failed: ${pressed.reason ?? 'Save button not clickable.'}`);
        }
        await waitForGeminiGemSaved(client.Runtime);
        await navigateToGeminiEditPage(client, normalizedProjectId);
        await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(() => undefined);
        await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 5_000);
        const persisted = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
        const stillPresent = persisted.some((item) => item.name.toLowerCase() === matched.name.toLowerCase());
        if (stillPresent) {
          throw new Error(`Gemini Gem knowledge file "${matched.name}" still appears after delete.`);
        }
      } finally {
        await client.close().catch(() => undefined);
        if (shouldClose && targetId) {
          await CDP.Close({ host, port, id: targetId }).catch(() => undefined);
        }
      }
    },
    async selectRemoveProjectItem(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const normalizedProjectId = normalizeGeminiProjectId(projectId);
      if (!normalizedProjectId) {
        throw new Error(`Invalid Gemini Gem id: ${projectId}`);
      }
      void options;
      // Gemini keeps delete as one direct-page action chain.
      // The shared CLI still calls select + confirm as two steps, so Gemini
      // keeps the full flow in pushProjectRemoveConfirmation(...).
    },
    async pushProjectRemoveConfirmation(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const normalizedProjectId = normalizeGeminiProjectId(projectId);
      if (!normalizedProjectId) {
        throw new Error(`Invalid Gemini Gem id: ${projectId}`);
      }
      const { client, targetId, shouldClose, host, port } = await connectToGeminiTab(
        options,
        resolveGeminiProjectUrl(normalizedProjectId),
      );
      try {
        await openGeminiProjectActionsMenuOnProjectPage(client, normalizedProjectId);
        await selectGeminiProjectDeleteMenuItem(client);
        await clickGeminiDeleteConfirmations(client);
        await navigateToGeminiGemsViewPage(client);
        const deleted = await waitForPredicate(
          client.Runtime,
          `(() => {
            const projectId = ${JSON.stringify(normalizedProjectId)};
            return !Array.from(document.querySelectorAll('a[href]'))
              .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/gem/' + projectId))
              ? { deleted: true }
              : null;
          })()`,
          {
            timeoutMs: 15_000,
            description: `Gemini Gem ${normalizedProjectId} removed`,
          },
        );
        if (!deleted.ok) {
          throw new Error(`Gemini Gem ${normalizedProjectId} still appears in the Gem manager after delete confirmation.`);
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
