import type { BrowserInstance, RegistryOptions } from './stateRegistry.js';
import { getInstance, updateInstance } from './stateRegistry.js';
import type { BrowserLogger } from '../types.js';
import { listChromeTargets } from '../chromeLifecycle.js';

export type TabDescriptor = {
  targetId?: string;
  id?: string;
  url?: string;
  title?: string;
  type?: string;
};

export type TabSelectionReason = 'match-url' | 'match-title' | 'preferred-type';

export type TabSelectionCandidate = {
  index: number;
  tab: TabDescriptor;
  score: number;
  selected: boolean;
  reasons: TabSelectionReason[];
};

export type TabResolutionExplanation = {
  tab: TabDescriptor | null;
  score: number;
  candidates: TabSelectionCandidate[];
};

export type InstanceScanResult = {
  instance: BrowserInstance;
  tabs: TabDescriptor[];
};

async function listTargets(host: string, port: number): Promise<TabDescriptor[]> {
  const targets = await listChromeTargets(port, host);
  return (targets as unknown as TabDescriptor[])
    .filter((target) => target.type !== 'browser')
    .map((target) => normalizeTabDescriptor(target))
    .filter((target): target is TabDescriptor => Boolean(target));
}

export function normalizeTabDescriptor(
  tab: TabDescriptor | null | undefined,
): TabDescriptor | null {
  if (!tab) return null;
  return {
    targetId: tab.targetId ?? tab.id,
    url: tab.url,
    title: tab.title,
    type: tab.type,
  };
}

export async function scanInstanceTabs(
  instance: BrowserInstance,
  logger?: BrowserLogger,
): Promise<InstanceScanResult | null> {
  try {
    const tabs = await listTargets(instance.host, instance.port);
    return { instance, tabs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.(`Failed to query DevTools targets (${instance.host}:${instance.port}): ${message}`);
    return null;
  }
}

export async function scanRegisteredInstance(
  options: RegistryOptions,
  profilePath: string,
  profileName: string | null | undefined,
  logger?: BrowserLogger,
  updates: Partial<BrowserInstance> = {},
): Promise<InstanceScanResult | null> {
  const instance = await getInstance(options, profilePath, profileName);
  if (!instance) return null;
  const scan = await scanInstanceTabs(instance, logger);
  if (!scan) return null;
  const urls = scan.tabs.map((tab) => tab.url).filter(Boolean) as string[];
  await updateInstance(options, profilePath, profileName, {
    tabs: scan.tabs,
    lastKnownUrls: urls.length ? urls : undefined,
    lastSeenAt: new Date().toISOString(),
    ...updates,
  });
  return scan;
}

export function resolveTab(
  tabs: TabDescriptor[],
  options: {
    matchUrl?: (url: string) => boolean;
    matchTitle?: (title: string) => boolean;
    preferTypes?: string[];
  } = {},
): TabDescriptor | null {
  return explainTabResolution(tabs, options).tab;
}

export function explainTabResolution(
  tabs: TabDescriptor[],
  options: {
    matchUrl?: (url: string) => boolean;
    matchTitle?: (title: string) => boolean;
    preferTypes?: string[];
  } = {},
): TabResolutionExplanation {
  const { matchUrl, matchTitle, preferTypes } = options;
  const scored = tabs.map((tab, index) => {
    const normalizedTab = normalizeTabDescriptor(tab) ?? tab;
    const reasons: TabSelectionReason[] = [];
    let score = 0;
    if (normalizedTab.url && matchUrl?.(normalizedTab.url)) {
      score += 3;
      reasons.push('match-url');
    }
    if (normalizedTab.title && matchTitle?.(normalizedTab.title)) {
      score += 2;
      reasons.push('match-title');
    }
    if (normalizedTab.type && preferTypes?.includes(normalizedTab.type)) {
      score += 1;
      reasons.push('preferred-type');
    }
    return { index, tab: normalizedTab, score, reasons };
  });
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });
  const winner = sorted[0]?.score ? sorted[0] : null;
  return {
    tab: winner?.tab ?? null,
    score: winner?.score ?? 0,
    candidates: scored.map((candidate) => ({
      ...candidate,
      selected: Boolean(winner && winner.index === candidate.index),
    })),
  };
}

export function summarizeTabResolution(
  explanation: TabResolutionExplanation,
  options: { maxCandidates?: number } = {},
): string {
  const maxCandidates = options.maxCandidates ?? 3;
  const sorted = [...explanation.candidates].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });
  if (!explanation.tab) {
    const preview = sorted
      .slice(0, maxCandidates)
      .map((candidate) => `#${candidate.index + 1} score=${candidate.score}`)
      .join(', ');
    return `No tab matched; candidates: ${preview || '(none)'}`;
  }
  const selected = sorted.find((candidate) => candidate.selected) ?? null;
  const selectedLabel = selected
    ? formatTabSelectionCandidate(selected)
    : formatTabDescriptor(explanation.tab);
  const losing = sorted
    .filter((candidate) => !candidate.selected)
    .slice(0, maxCandidates - 1)
    .map((candidate) => formatTabSelectionCandidate(candidate))
    .join(' | ');
  return losing
    ? `Selected ${selectedLabel}; next candidates: ${losing}`
    : `Selected ${selectedLabel}`;
}

function formatTabSelectionCandidate(candidate: TabSelectionCandidate): string {
  const base = formatTabDescriptor(candidate.tab);
  const reasons = candidate.reasons.length ? ` reasons=${candidate.reasons.join('+')}` : '';
  return `${base} score=${candidate.score}${reasons}`;
}

function formatTabDescriptor(tab: TabDescriptor): string {
  const targetId = tab.targetId ?? tab.id ?? 'unknown';
  const type = tab.type ?? 'unknown';
  const url = tab.url ?? '(no url)';
  return `tab=${targetId} type=${type} url=${url}`;
}
