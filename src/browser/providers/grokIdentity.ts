import type { ChromeClient } from '../types.js';
import type { ProviderUserIdentity } from './types.js';

export type GrokIdentityProbeResult = {
  id?: string | null;
  name?: string | null;
  handle?: string | null;
  email?: string | null;
  source?: string | null;
  guestAuthCta?: boolean | null;
};

export const GROK_IDENTITY_PROBE_EXPRESSION = `(() => {
  const identity = { id: null, name: null, handle: null, email: null, source: null };
  const normalize = (value) => String(value || '').trim();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const guestAuthCta = Array.from(document.querySelectorAll('a,button')).some((el) => {
    if (!isVisible(el)) return false;
    const label = normalize(el.textContent || '').replace(/\\s+/g, ' ');
    return /^(sign in|log in|login|create account|sign up)$/i.test(label);
  });
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
  if (!guestAuthCta && !identity.id && !identity.name && !identity.handle && !identity.email) {
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
  return { ...identity, guestAuthCta };
})()`;

export const GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION = `(() => {
  return Array.from(document.scripts)
    .map((script) => script.textContent || '')
    .filter((text) => {
      const candidate = String(text || '');
      if (!candidate) return false;
      const hasIdentityCore =
        candidate.includes('userId') &&
        (candidate.includes('email') || candidate.includes('xUsername') || candidate.includes('givenName'));
      const hasInitialDataUser =
        candidate.includes('initialData') &&
        candidate.includes('user') &&
        (candidate.includes('profileImageUrl') || candidate.includes('familyName') || candidate.includes('email'));
      return hasIdentityCore || hasInitialDataUser;
    })
    .slice(0, 8)
    .map((text) => text.slice(0, 16000));
})()`;

export function normalizeGrokIdentityProbe(
  identity: GrokIdentityProbeResult | null | undefined,
): ProviderUserIdentity | null {
  if (!identity) return null;

  const normalizedName = identity.name?.toLowerCase().trim() ?? '';
  const normalizedHandle = identity.handle?.toLowerCase().trim() ?? '';
  const lowSignalNames = new Set([
    '',
    'pfp',
    'profile',
    'avatar',
    'account',
    'settings',
    'language',
    'home page',
    'sign in',
    'sign up',
  ]);
  const lowSignalHandles = new Set(['@grok', '@xai-official']);

  const id = identity.id?.trim() || undefined;
  const email = identity.email?.trim() || undefined;
  let name = identity.name?.trim() || undefined;
  let handle = identity.handle?.trim() || undefined;
  let source = identity.source?.trim() || undefined;

  const lowSignalName =
    lowSignalNames.has(normalizedName) ||
    ((identity.source === 'dom-avatar' || identity.source === 'dom-label') &&
      normalizedName.length > 0 &&
      normalizedName.length < 3);
  if (lowSignalName) {
    name = undefined;
    if (!id && !email && !handle) {
      source = undefined;
    }
  }

  if (handle && lowSignalHandles.has(normalizedHandle) && !id && !email) {
    handle = undefined;
    if (!name) {
      source = undefined;
    }
  }

  if (identity.guestAuthCta && !id && !email && !handle && !name) {
    return null;
  }

  if (!id && !email && !handle && !name) {
    return null;
  }

  return {
    id,
    name,
    handle,
    email,
    source,
  };
}

export function extractGrokIdentityFromSerializedScripts(
  scriptTexts: string[] | null | undefined,
): ProviderUserIdentity | null {
  if (!Array.isArray(scriptTexts) || scriptTexts.length === 0) {
    return null;
  }

  for (const rawText of scriptTexts) {
    const text = normalizeSerializedScriptText(rawText);
    if (
      !text.includes('"initialData":{"user":') &&
      !(text.includes('"userId":"') && text.includes('"email":"'))
    ) {
      continue;
    }

    const givenName = matchSerializedField(text, 'givenName');
    const familyName = matchSerializedField(text, 'familyName');
    const name =
      [givenName, familyName].filter(Boolean).join(' ').trim() ||
      matchSerializedField(text, 'name') ||
      matchSerializedField(text, 'displayName');
    const xUsername = matchSerializedField(text, 'xUsername') || matchSerializedField(text, 'username');
    const candidate = normalizeGrokIdentityProbe({
      id: matchSerializedField(text, 'userId'),
      email: matchSerializedField(text, 'email'),
      name: name || null,
      handle: xUsername ? `@${xUsername.replace(/^@+/, '')}` : null,
      source: 'next-flight',
      guestAuthCta: false,
    });
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export async function detectGrokSignedInIdentity(
  Runtime: ChromeClient['Runtime'],
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<{
  identity: ProviderUserIdentity | null;
  guestAuthCta: boolean;
  probe: GrokIdentityProbeResult | null;
}> {
  const initialProbe = await evaluateGrokIdentityProbe(Runtime);
  let identity = normalizeGrokIdentityProbe(initialProbe);
  if (identity) {
    return {
      identity,
      guestAuthCta: Boolean(initialProbe?.guestAuthCta),
      probe: initialProbe,
    };
  }

  if (!initialProbe?.guestAuthCta) {
    const scriptTexts = await readGrokSerializedIdentityScriptsWithRetry(Runtime, options);
    identity = extractGrokIdentityFromSerializedScripts(scriptTexts);
  }

  return {
    identity,
    guestAuthCta: Boolean(initialProbe?.guestAuthCta),
    probe: initialProbe,
  };
}

export async function evaluateGrokIdentityProbe(
  Runtime: ChromeClient['Runtime'],
): Promise<GrokIdentityProbeResult | null> {
  const response = await Runtime.evaluate({
    expression: GROK_IDENTITY_PROBE_EXPRESSION,
    returnByValue: true,
  });
  const result = response?.result;
  return (result?.value as GrokIdentityProbeResult | undefined) ?? null;
}

export async function readGrokSerializedIdentityScripts(
  Runtime: ChromeClient['Runtime'],
): Promise<string[]> {
  const response = await Runtime.evaluate({
    expression: GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION,
    returnByValue: true,
  });
  const result = response?.result;
  return Array.isArray(result?.value) ? result.value.filter((entry) => typeof entry === 'string') : [];
}

export async function readGrokSerializedIdentityScriptsWithRetry(
  Runtime: ChromeClient['Runtime'],
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const start = Date.now();
  let lastScripts: string[] = [];
  while (Date.now() - start < timeoutMs) {
    lastScripts = await readGrokSerializedIdentityScripts(Runtime);
    if (lastScripts.length > 0) {
      return lastScripts;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return lastScripts;
}

function normalizeSerializedScriptText(rawText: string): string {
  let normalized = rawText;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = normalized
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\u0026/g, '&')
      .replace(/\\\\/g, '\\');
    if (next === normalized) {
      break;
    }
    normalized = next;
  }
  return normalized;
}

function matchSerializedField(text: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`"${escaped}":"([^"]+)"`, 'i'));
  return match?.[1]?.trim() || undefined;
}
