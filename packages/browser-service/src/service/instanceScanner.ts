import CDP from 'chrome-remote-interface';
import type { BrowserInstance, RegistryOptions } from './stateRegistry.js';
import { getInstance, updateInstance } from './stateRegistry.js';
import type { BrowserLogger } from '../types.js';

export type TabDescriptor = {
  targetId?: string;
  url?: string;
  title?: string;
  type?: string;
};

export type InstanceScanResult = {
  instance: BrowserInstance;
  tabs: TabDescriptor[];
};

async function listTargets(host: string, port: number): Promise<TabDescriptor[]> {
  const targets = await CDP.List({ host, port });
  return (targets as unknown as TabDescriptor[])
    .filter((target) => target.type !== 'browser');
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
  const { matchUrl, matchTitle, preferTypes } = options;
  const scored = tabs.map((tab) => {
    let score = 0;
    if (tab.url && matchUrl?.(tab.url)) score += 3;
    if (tab.title && matchTitle?.(tab.title)) score += 2;
    if (tab.type && preferTypes?.includes(tab.type)) score += 1;
    return { tab, score };
  });
  const sorted = scored.sort((a, b) => b.score - a.score);
  return sorted[0]?.score ? sorted[0].tab : null;
}
