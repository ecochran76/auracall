import type { ChromeClient, BrowserLogger } from '../types.js';
import type {
  LabelMatchOptions,
  PressButtonOptions,
  VisibleMenuInventoryEntry,
  VisibleMenuInventoryItem,
} from '../service/ui.js';
import { ATTACHMENT_MENU_SELECTOR } from '../constants.js';
import { logDomFailure } from '../domDebug.js';
import {
  resolveBundledServiceComposerAliases,
  resolveBundledServiceComposerChipIgnoreTokens,
  resolveBundledServiceComposerFileRequestLabels,
  resolveBundledServiceComposerKnownLabels,
  resolveBundledServiceComposerMoreLabels,
  resolveBundledServiceComposerTopMenuSignalLabels,
  resolveBundledServiceComposerTopMenuSignalSubstrings,
  resolveBundledServiceComposerTopLevelSentinels,
} from '../../services/registry.js';
import {
  collectVisibleMenuInventory,
  dismissOpenMenus,
  openMenu,
  openSubmenu,
  selectAndVerifyNestedMenuPathOption,
} from '../service/ui.js';

type ComposerToolOutcome =
  | { status: 'already-selected'; label?: string | null }
  | { status: 'switched'; label?: string | null; previousLabel?: string | null }
  | { status: 'trigger-not-found' }
  | { status: 'menu-not-found'; availableTopLevel?: string[] }
  | { status: 'option-not-found'; availableTopLevel?: string[]; availableMore?: string[] }
  | { status: 'selection-not-confirmed'; label?: string | null; availableTopLevel?: string[]; availableMore?: string[] };

export type ChatgptComposerToolSelection = {
  label: string | null;
  source: 'chip' | 'top-menu' | 'more-menu' | 'none';
  availableTopLevel: string[];
  availableMore: string[];
};

const COMPOSER_TOOL_ALIASES = resolveBundledServiceComposerAliases('chatgpt', {});

const COMPOSER_TOP_LEVEL_SENTINELS = resolveBundledServiceComposerTopLevelSentinels('chatgpt', []);
const COMPOSER_MORE_LABELS = resolveBundledServiceComposerMoreLabels('chatgpt', []);
const COMPOSER_TOP_MENU_SIGNAL_LABELS = resolveBundledServiceComposerTopMenuSignalLabels('chatgpt', []);
const COMPOSER_TOP_MENU_SIGNAL_SUBSTRINGS = resolveBundledServiceComposerTopMenuSignalSubstrings('chatgpt', []);
const KNOWN_COMPOSER_TOOL_LABELS = resolveBundledServiceComposerKnownLabels('chatgpt', []);
const COMPOSER_FILE_REQUEST_LABELS = resolveBundledServiceComposerFileRequestLabels('chatgpt', []);
const COMPOSER_CHIP_IGNORE_TOKENS = resolveBundledServiceComposerChipIgnoreTokens('chatgpt', []);

export async function ensureChatgptComposerTool(
  Runtime: ChromeClient['Runtime'],
  requestedTool: string,
  logger: BrowserLogger,
): Promise<void> {
  if (isComposerFileRequest(requestedTool)) {
    throw new Error(
      'ChatGPT file upload stays on the attachment path. Use --file with the normal browser attachment flow instead of --browser-composer-tool for files.',
    );
  }

  const result = await selectComposerTool(Runtime, requestedTool);
  switch (result.status) {
    case 'already-selected':
      logger(`Composer tool: ${result.label ?? requestedTool} (already selected)`);
      return;
    case 'switched':
      logger(
        result.previousLabel
          ? `Composer tool: ${result.label ?? requestedTool} (was ${result.previousLabel})`
          : `Composer tool: ${result.label ?? requestedTool}`,
      );
      return;
    case 'trigger-not-found':
      await logDomFailure(Runtime, logger, 'chatgpt-composer-tool-trigger');
      throw new Error('Unable to find the ChatGPT Add files and more button in the composer.');
    case 'menu-not-found':
      await logDomFailure(Runtime, logger, 'chatgpt-composer-tool-menu');
      throw new Error('Unable to open the ChatGPT composer add-ons menu.');
    case 'option-not-found': {
      await logDomFailure(Runtime, logger, 'chatgpt-composer-tool-option');
      const topHint = result.availableTopLevel?.length ? ` Top level: ${result.availableTopLevel.join(', ')}.` : '';
      const moreHint = result.availableMore?.length ? ` More: ${result.availableMore.join(', ')}.` : '';
      throw new Error(`Unable to find ChatGPT composer tool "${requestedTool}".${topHint}${moreHint}`);
    }
    case 'selection-not-confirmed': {
      await logDomFailure(Runtime, logger, 'chatgpt-composer-tool-selection');
      const topHint = result.availableTopLevel?.length ? ` Top level: ${result.availableTopLevel.join(', ')}.` : '';
      const moreHint = result.availableMore?.length ? ` More: ${result.availableMore.join(', ')}.` : '';
      throw new Error(
        `ChatGPT composer tool "${requestedTool}" did not stay selected after activation.${topHint}${moreHint}`,
      );
    }
    default:
      await logDomFailure(Runtime, logger, 'chatgpt-composer-tool-unknown');
      throw new Error(`Unknown error selecting ChatGPT composer tool "${requestedTool}".`);
  }
}

export function resolveComposerToolCandidatesForTest(requestedTool: string): string[] {
  return resolveComposerToolCandidates(requestedTool);
}

export function resolveComposerToolLocationForTest(
  requestedTool: string,
  topLevelLabels: string[],
  moreLabels: string[] = [],
): { location: 'top' | 'more' | 'missing'; label?: string } {
  const toolCandidates = resolveComposerToolCandidates(requestedTool);
  const topLevel = findBestComposerToolItem(
    topLevelLabels.map((label) => ({ label, role: null, selected: false })),
    toolCandidates,
  );
  if (topLevel) {
    return { location: 'top', label: topLevel.label };
  }
  const more = findBestComposerToolItem(
    moreLabels.map((label) => ({ label, role: null, selected: false })),
    toolCandidates,
  );
  if (more) {
    return { location: 'more', label: more.label };
  }
  return { location: 'missing' };
}

export function resolveCurrentComposerToolSelectionForTest(
  chipLabel: string | null | undefined,
  topItems: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[] = [],
  moreItems: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[] = [],
): Pick<ChatgptComposerToolSelection, 'label' | 'source'> {
  return resolveCurrentComposerToolSelection(chipLabel, topItems, moreItems);
}

function normalizeComposerToolLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveComposerToolCandidates(requestedTool: string): string[] {
  const normalized = normalizeComposerToolLabel(requestedTool);
  const aliases = COMPOSER_TOOL_ALIASES[normalized] ?? [];
  return Array.from(
    new Set([normalized, ...aliases.map((entry) => normalizeComposerToolLabel(entry)).filter(Boolean)]),
  ).filter(Boolean);
}

function isComposerFileRequest(requestedTool: string): boolean {
  const normalized = normalizeComposerToolLabel(requestedTool);
  return COMPOSER_FILE_REQUEST_LABELS.includes(normalized);
}

function scoreComposerToolLabel(label: string, toolCandidates: readonly string[]): number {
  const normalized = normalizeComposerToolLabel(label);
  if (!normalized) return 0;
  let best = 0;
  for (const candidate of toolCandidates) {
    if (!candidate) continue;
    if (normalized === candidate) {
      best = Math.max(best, 1_000 + candidate.length);
      continue;
    }
    const candidateWords = candidate.split(' ').filter(Boolean);
    if (candidateWords.length > 0 && candidateWords.every((word) => normalized.includes(word))) {
      best = Math.max(best, 500 + candidate.length);
      continue;
    }
    if (normalized.includes(candidate)) {
      best = Math.max(best, 300 + candidate.length);
    }
  }
  return best;
}

function findBestComposerToolItem(
  items: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[],
  toolCandidates: readonly string[],
): Pick<VisibleMenuInventoryItem, 'label' | 'selected'> | null {
  let best: Pick<VisibleMenuInventoryItem, 'label' | 'selected'> | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = scoreComposerToolLabel(item.label, toolCandidates);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function findSelectedComposerToolItem(
  items: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[],
  toolCandidates: readonly string[],
): Pick<VisibleMenuInventoryItem, 'label' | 'selected'> | null {
  return findBestComposerToolItem(
    items.filter((item) => item.selected),
    toolCandidates,
  );
}

function resolveCurrentComposerToolSelection(
  chipLabel: string | null | undefined,
  topItems: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[] = [],
  moreItems: readonly Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[] = [],
): Pick<ChatgptComposerToolSelection, 'label' | 'source'> {
  const chipCandidate = typeof chipLabel === 'string' ? chipLabel.trim() : '';
  if (chipCandidate && scoreComposerToolLabel(chipCandidate, KNOWN_COMPOSER_TOOL_LABELS) > 0) {
    return { label: chipCandidate, source: 'chip' };
  }
  const topSelection = findSelectedComposerToolItem(topItems, KNOWN_COMPOSER_TOOL_LABELS);
  if (topSelection?.label) {
    return { label: topSelection.label, source: 'top-menu' };
  }
  const moreSelection = findSelectedComposerToolItem(moreItems, KNOWN_COMPOSER_TOOL_LABELS);
  if (moreSelection?.label) {
    return { label: moreSelection.label, source: 'more-menu' };
  }
  return { label: null, source: 'none' };
}

function buildComposerTriggerOptions(): PressButtonOptions {
  return {
    selector: ATTACHMENT_MENU_SELECTOR,
    requireVisible: true,
    interactionStrategies: ['pointer', 'click'],
  };
}

function buildTopLevelExpectedMatch(toolCandidates: readonly string[]): LabelMatchOptions {
  return {
    includeAny: Array.from(new Set([...toolCandidates, ...COMPOSER_TOP_LEVEL_SENTINELS])),
  };
}

function includesAnyExact(labels: readonly string[], candidates: readonly string[]): boolean {
  return labels.some((label) => candidates.includes(label));
}

function includesAnySubstring(labels: readonly string[], candidates: readonly string[]): boolean {
  return labels.some((label) => candidates.some((candidate) => candidate.length > 0 && label.includes(candidate)));
}

function scoreComposerTopLevelMenu(entry: VisibleMenuInventoryEntry, toolCandidates: readonly string[]): number {
  const labels = entry.itemLabels;
  if (!labels.length) return 0;
  let score = 0;
  if (includesAnyExact(labels, COMPOSER_MORE_LABELS)) score += 1_000;
  if (includesAnySubstring(labels, COMPOSER_TOP_MENU_SIGNAL_SUBSTRINGS)) score += 700;
  if (includesAnyExact(labels, COMPOSER_TOP_MENU_SIGNAL_LABELS)) score += 500;
  if (labels.some((label) => scoreComposerToolLabel(label, toolCandidates) > 0)) score += 250;
  return score > 0 ? score + labels.length : 0;
}

function findVisibleComposerTopMenu(
  entries: readonly VisibleMenuInventoryEntry[],
  toolCandidates: readonly string[],
): VisibleMenuInventoryEntry | null {
  const ranked = entries
    .map((entry) => ({ entry, score: scoreComposerTopLevelMenu(entry, toolCandidates) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.entry ?? null;
}

function buildComposerChipVisibleExpression(toolCandidates: readonly string[]): string {
  return `(() => {
    const toolCandidates = ${JSON.stringify(toolCandidates)};
    const ignoreTokens = ${JSON.stringify(COMPOSER_CHIP_IGNORE_TOKENS)};
    const normalize = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const scoreLabel = (label) => {
      let best = 0;
      for (const candidate of toolCandidates) {
        if (!candidate || !label) continue;
        if (label === candidate) {
          best = Math.max(best, 1000 + candidate.length);
          continue;
        }
        const candidateWords = candidate.split(' ').filter(Boolean);
        if (candidateWords.length > 0 && candidateWords.every((word) => label.includes(word))) {
          best = Math.max(best, 500 + candidate.length);
          continue;
        }
        if (label.includes(candidate)) {
          best = Math.max(best, 300 + candidate.length);
        }
      }
      return best;
    };
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const root =
      document.querySelector('[data-testid*="composer"]') ??
      document.querySelector('form') ??
      document.body;
    if (!root) return null;
    const nodes = Array.from(
      root.querySelectorAll('button, [role="button"], [aria-label*="click to remove" i], [data-testid*="pill"]'),
    ).filter(isVisible);
    const match = nodes
      .map((node) => ({
        label: normalize(node.getAttribute?.('aria-label') || node.textContent || ''),
        text: (node.textContent || '').trim() || null,
      }))
      .find((entry) => {
        if (!entry.label || ignoreTokens.some((token) => token.length > 0 && entry.label.includes(token))) {
          return false;
        }
        return scoreLabel(entry.label) > 0;
      });
    return match ? { label: match.text || match.label } : null;
  })()`;
}

async function readMenuEntry(
  Runtime: ChromeClient['Runtime'],
  menuSelector: string,
): Promise<VisibleMenuInventoryEntry | null> {
  const inventory = await collectVisibleMenuInventory(Runtime, {
    menuSelectors: [menuSelector],
    limit: 12,
  });
  return inventory.find((entry) => entry.selector === menuSelector) ?? inventory[0] ?? null;
}

async function openComposerTopMenu(
  Runtime: ChromeClient['Runtime'],
  toolCandidates: readonly string[],
): Promise<
  | {
      ok: true;
      menuSelector: string;
      topLevelLabels: string[];
      topItems: Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[];
      topMatch: Pick<VisibleMenuInventoryItem, 'label' | 'selected'> | null;
    }
  | { ok: false; reason: 'trigger-not-found' | 'menu-not-found'; topLevelLabels: string[] }
> {
  const visibleMenus = await collectVisibleMenuInventory(Runtime, {
    menuSelectors: ['[role="menu"]', '[data-radix-collection-root]'],
    limit: 12,
  });
  const existing = findVisibleComposerTopMenu(visibleMenus, toolCandidates);
  if (existing) {
    return {
      ok: true,
      menuSelector: existing.selector,
      topLevelLabels: existing.itemLabels,
      topItems: existing.items,
      topMatch: findBestComposerToolItem(existing.items, toolCandidates),
    };
  }

  await dismissOpenMenus(Runtime, 500);
  const opened = await openMenu(Runtime, {
    trigger: buildComposerTriggerOptions(),
    menuSelector: '[role="menu"]',
    anchorSelector: ATTACHMENT_MENU_SELECTOR,
    expectedItemMatch: buildTopLevelExpectedMatch(toolCandidates),
    timeoutMs: 5000,
  });
  if (!opened.ok) {
    const reason =
      opened.reason?.includes('Button') || opened.reason?.includes('selector not found')
        ? 'trigger-not-found'
        : 'menu-not-found';
    return { ok: false, reason, topLevelLabels: [] };
  }
  const menuSelector = opened.menuSelector || '[role="menu"]';
  const menuEntry = await readMenuEntry(Runtime, menuSelector);
  if (!menuEntry) {
    return { ok: false, reason: 'menu-not-found', topLevelLabels: [] };
  }
  return {
    ok: true,
    menuSelector: menuEntry.selector,
    topLevelLabels: menuEntry.itemLabels,
    topItems: menuEntry.items,
    topMatch: findBestComposerToolItem(menuEntry.items, toolCandidates),
  };
}

async function openComposerMoreMenu(
  Runtime: ChromeClient['Runtime'],
  topMenuSelector: string,
  toolCandidates: readonly string[],
): Promise<
  | {
      ok: true;
      menuSelector: string;
      moreLabels: string[];
      moreItems: Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[];
      moreMatch: Pick<VisibleMenuInventoryItem, 'label' | 'selected'> | null;
    }
  | { ok: false; moreLabels: string[] }
> {
  const opened = await openSubmenu(Runtime, {
    parentMenuSelector: topMenuSelector,
    itemMatch: { exact: [...COMPOSER_MORE_LABELS] },
    expectedItemMatch: { includeAny: [...toolCandidates] },
    interactionStrategies: ['pointer', 'click'],
    timeoutMs: 5000,
  });
  if (!opened.ok || !opened.menuSelector) {
    return { ok: false, moreLabels: [] };
  }
  const menuEntry = await readMenuEntry(Runtime, opened.menuSelector);
  if (!menuEntry) {
    return { ok: false, moreLabels: [] };
  }
  return {
    ok: true,
    menuSelector: menuEntry.selector,
    moreLabels: menuEntry.itemLabels,
    moreItems: menuEntry.items,
    moreMatch: findBestComposerToolItem(menuEntry.items, toolCandidates),
  };
}

async function readComposerToolChip(
  Runtime: ChromeClient['Runtime'],
  toolCandidates: readonly string[],
): Promise<string | null> {
  const result = await Runtime.evaluate({
    expression: buildComposerChipVisibleExpression(toolCandidates),
    returnByValue: true,
  });
  const value = result.result?.value as { label?: string | null } | null | undefined;
  return typeof value?.label === 'string' && value.label.trim().length > 0 ? value.label.trim() : null;
}

export async function readCurrentChatgptComposerTool(
  Runtime: ChromeClient['Runtime'],
): Promise<ChatgptComposerToolSelection> {
  await dismissOpenMenus(Runtime).catch(() => false);
  const chipLabel = await readComposerToolChip(Runtime, KNOWN_COMPOSER_TOOL_LABELS);
  const topOpened = await openComposerTopMenu(Runtime, KNOWN_COMPOSER_TOOL_LABELS);
  if (!topOpened.ok) {
    const current = resolveCurrentComposerToolSelection(chipLabel, [], []);
    return {
      ...current,
      availableTopLevel: topOpened.topLevelLabels,
      availableMore: [],
    };
  }
  let moreLabels: string[] = [];
  let moreItems: Pick<VisibleMenuInventoryItem, 'label' | 'selected'>[] = [];
  if (includesAnyExact(topOpened.topLevelLabels, COMPOSER_MORE_LABELS)) {
    const moreOpened = await openComposerMoreMenu(Runtime, topOpened.menuSelector, KNOWN_COMPOSER_TOOL_LABELS);
    if (moreOpened.ok) {
      moreLabels = moreOpened.moreLabels;
      moreItems = moreOpened.moreItems;
    }
  }
  const current = resolveCurrentComposerToolSelection(chipLabel, topOpened.topItems, moreItems);
  await dismissOpenMenus(Runtime).catch(() => false);
  return {
    ...current,
    availableTopLevel: topOpened.topLevelLabels,
    availableMore: moreLabels,
  };
}

async function collectComposerAvailability(
  Runtime: ChromeClient['Runtime'],
  toolCandidates: readonly string[],
): Promise<{ availableTopLevel: string[]; availableMore: string[] }> {
  const topOpened = await openComposerTopMenu(Runtime, toolCandidates);
  if (!topOpened.ok) {
    return { availableTopLevel: topOpened.topLevelLabels, availableMore: [] };
  }
  if (!includesAnyExact(topOpened.topLevelLabels, COMPOSER_MORE_LABELS)) {
    return { availableTopLevel: topOpened.topLevelLabels, availableMore: [] };
  }
  const moreOpened = await openComposerMoreMenu(Runtime, topOpened.menuSelector, toolCandidates);
  return {
    availableTopLevel: topOpened.topLevelLabels,
    availableMore: moreOpened.moreLabels,
  };
}

async function selectComposerTool(
  Runtime: ChromeClient['Runtime'],
  requestedTool: string,
): Promise<ComposerToolOutcome> {
  const toolCandidates = resolveComposerToolCandidates(requestedTool);
  const currentSelection = await readCurrentChatgptComposerTool(Runtime);
  if (currentSelection.label && scoreComposerToolLabel(currentSelection.label, toolCandidates) > 0) {
    return { status: 'already-selected', label: currentSelection.label };
  }

  const topLevelSelection = await selectAndVerifyNestedMenuPathOption(Runtime, {
    trigger: buildComposerTriggerOptions(),
    menuSelector: '[role="menu"]',
    steps: [
      { itemMatch: { includeAny: [...toolCandidates] } },
    ],
    selectedItemMatch: { includeAny: [...toolCandidates] },
    timeoutMs: 5000,
    closeMenusAfter: true,
  });
  if (topLevelSelection.ok) {
    return {
      status: topLevelSelection.alreadySelected ? 'already-selected' : 'switched',
      label: topLevelSelection.label ?? requestedTool,
      previousLabel: currentSelection.label,
    };
  }

  const moreSelection = await selectAndVerifyNestedMenuPathOption(Runtime, {
    trigger: buildComposerTriggerOptions(),
    menuSelector: '[role="menu"]',
    steps: [
      { itemMatch: { exact: [...COMPOSER_MORE_LABELS] }, interactionStrategies: ['pointer', 'click'] },
      { itemMatch: { includeAny: [...toolCandidates] } },
    ],
    selectedItemMatch: { includeAny: [...toolCandidates] },
    timeoutMs: 5000,
    closeMenusAfter: true,
  });
  if (moreSelection.ok) {
    return {
      status: moreSelection.alreadySelected ? 'already-selected' : 'switched',
      label: moreSelection.label ?? requestedTool,
      previousLabel: currentSelection.label,
    };
  }

  const availability = await collectComposerAvailability(Runtime, toolCandidates);
  if (availability.availableTopLevel.length === 0) {
    return { status: 'menu-not-found', availableTopLevel: [] };
  }

  const verificationFailure = moreSelection.phase === 'verify' ? moreSelection : topLevelSelection.phase === 'verify' ? topLevelSelection : null;
  if (verificationFailure) {
    return {
      status: 'selection-not-confirmed',
      label: requestedTool,
      availableTopLevel: availability.availableTopLevel,
      availableMore: verificationFailure.availableLabels?.length ? verificationFailure.availableLabels : availability.availableMore,
    };
  }

  return {
    status: 'option-not-found',
    availableTopLevel: availability.availableTopLevel,
    availableMore: availability.availableMore,
  };
}
