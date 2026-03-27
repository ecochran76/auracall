type BrowserServiceTarget = 'chatgpt' | 'gemini' | 'grok';

const CHATGPT_COMPATIBLE_HOSTS = ['chatgpt.com', 'chat.openai.com'];
const GEMINI_COMPATIBLE_HOSTS = ['gemini.google.com'];
const GROK_COMPATIBLE_HOSTS = ['grok.com'];

export function resolveCompatibleHostsForTarget(target: BrowserServiceTarget): string[] {
  switch (target) {
    case 'chatgpt':
      return [...CHATGPT_COMPATIBLE_HOSTS];
    case 'gemini':
      return [...GEMINI_COMPATIBLE_HOSTS];
    case 'grok':
      return [...GROK_COMPATIBLE_HOSTS];
  }
}

export function resolveCompatibleHostsForUrl(url: string | null | undefined): string[] {
  const host = extractHost(url);
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

function extractHost(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).host.toLowerCase();
  } catch {
    return null;
  }
}
