import { requireBundledServiceCompatibleHosts } from '../services/registry.js';

type BrowserServiceTarget = 'chatgpt' | 'gemini' | 'grok';

const CHATGPT_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('chatgpt');
const GEMINI_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('gemini');
const GROK_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('grok');

export function resolveCompatibleHostsForTarget(target: BrowserServiceTarget): string[] {
  const compatibleHostsByTarget: Record<BrowserServiceTarget, string[]> = {
    chatgpt: CHATGPT_COMPATIBLE_HOSTS,
    gemini: GEMINI_COMPATIBLE_HOSTS,
    grok: GROK_COMPATIBLE_HOSTS,
  };
  return [...compatibleHostsByTarget[target]];
}

export function resolveCompatibleHostsForUrl(url: string | null | undefined): string[] {
  const host = extractHostname(url);
  if (!host) {
    return [];
  }
  if (CHATGPT_COMPATIBLE_HOSTS.includes(host)) {
    return [...CHATGPT_COMPATIBLE_HOSTS];
  }
  if (GEMINI_COMPATIBLE_HOSTS.includes(host)) {
    return [...GEMINI_COMPATIBLE_HOSTS];
  }
  if (GROK_COMPATIBLE_HOSTS.includes(host)) {
    return [...GROK_COMPATIBLE_HOSTS];
  }
  return [host];
}

export function matchesServiceUrl(target: BrowserServiceTarget, url: string | null | undefined): boolean {
  const host = extractHostname(url);
  if (!host) {
    return false;
  }
  return resolveCompatibleHostsForTarget(target).includes(host);
}

function extractHostname(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
}
