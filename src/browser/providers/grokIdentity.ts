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

/** Parse actual bootstrap objects without searching account fields across unrelated
 * subtrees. This self-contained function also runs in the provider page. */
function collectSerializedGrokUsers(scriptTexts: string[]): string[] {
	const identities: string[] = [];
	let scanned = 0;
	let nodes = 0;
 let exhausted = false;
	const record = (value: unknown): Record<string, unknown> | null =>
		value !== null && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	const visit = (value: unknown, depth = 0): void => {
		if (exhausted) return;
  if (depth > 48 || ++nodes > 50000) { exhausted = true; return; }
		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}
		const object = record(value);
		if (!object) return;
		const user = record(record(object.initialData)?.user);
		if (user) {
			const selected: Record<string, string> = {};
			for (const field of [
				"userId",
				"id",
				"email",
				"xUsername",
				"username",
				"givenName",
				"familyName",
				"name",
				"displayName",
			]) {
				const value = user[field];
				if (typeof value === "string" && value.trim() && value.length <= 512)
					selected[field] = value.trim();
			}
			if (
				selected.userId ||
				selected.id ||
				selected.email ||
				selected.xUsername ||
				selected.username
			)
				identities.push(JSON.stringify({ initialData: { user: selected } }));
		}
		for (const child of Object.values(object)) visit(child, depth + 1);
	};
	const parsePayload = (payload: string): void => {
		try {
			visit(JSON.parse(payload));
			return;
		} catch {
			/* Flight records have hexadecimal prefixes. */
		}
		for (const line of payload.split(/\r?\n/)) {
			const match = /^[a-f0-9]+:(.*)$/i.exec(line);
			if (!match || !match[1].includes("initialData")) continue;
			try {
				visit(JSON.parse(match[1]));
			} catch {
				/* Text and module records are not account objects. */
			}
		}
	};
	const arrayEnd = (text: string, start: number): number => {
		let depth = 0,
			quoted = false,
			escaped = false;
		for (let index = start; index < text.length; index++) {
			const character = text[index];
			if (quoted) {
				if (escaped) escaped = false;
				else if (character === "\\") escaped = true;
				else if (character === '"') quoted = false;
			} else if (character === '"') quoted = true;
			else if (character === "[") depth++;
			else if (character === "]" && --depth === 0) return index + 1;
		}
		return -1;
	};
	for (const raw of scriptTexts) {
		if (typeof raw !== "string" || !raw.includes("initialData")) continue;
		// Inspect at most 2 MiB per qualifying script and 8 MiB total. Return only
		// <=8 small identity projections, never raw bootstrap/session payloads.
		scanned += raw.length;
		if (raw.length > 2 * 1024 * 1024 || scanned > 8 * 1024 * 1024) return [];
		const pushes = /self\.__next_f\.push\(/g;
		let foundPush = false;
  let offset = 0;
		while (offset < raw.length) {
   pushes.lastIndex = offset;
   const match = pushes.exec(raw);
   if (!match) break;
   offset = pushes.lastIndex;
			foundPush = true;
			let start = pushes.lastIndex;
			while (/\s/.test(raw[start] ?? "")) start++;
			if (raw[start] !== "[") continue;
			const end = arrayEnd(raw, start);
			if (end < 0) continue;
			const encoded = raw.slice(start, end);
   try {
    const chunk = JSON.parse(encoded);
    if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string") parsePayload(chunk[1]);
   } catch { /* Malformed bootstrap frames cannot establish identity. */ }
			offset = end;
		}
		if (!foundPush) parsePayload(raw);
		if (identities.length > 8 || exhausted) return [];
	}
	return identities;
}

export const GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION = `(() => {
  // tsx/esbuild may preserve nested function names through this inert helper.
  const __name = (fn) => fn;
  const collect = ${collectSerializedGrokUsers.toString()};
  return collect(Array.from(document.scripts).map(script => script.textContent || ''));
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
  const lowSignalNameFragments = ['cookies settings', 'preference center', 'privacy settings'];
  const lowSignalHandles = new Set(['@grok', '@xai-official']);

  const id = identity.id?.trim() || undefined;
  const email = identity.email?.trim() || undefined;
  let name = identity.name?.trim() || undefined;
  let handle = identity.handle?.trim() || undefined;
  let source = identity.source?.trim() || undefined;

  const lowSignalName =
    lowSignalNames.has(normalizedName) ||
    lowSignalNameFragments.some((fragment) => normalizedName.includes(fragment)) ||
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

  if (handle && !isPlausibleGrokHandle(handle) && !id && !email) {
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

function isPlausibleGrokHandle(value: string): boolean {
  return /^@[A-Za-z0-9_]{2,30}$/.test(value.trim());
}

export function extractGrokIdentityFromSerializedScripts(
	scriptTexts: string[] | null | undefined,
): ProviderUserIdentity | null {
	if (!Array.isArray(scriptTexts) || scriptTexts.length === 0) return null;
	const candidates = collectSerializedGrokUsers(scriptTexts)
		.map((text) => {
			const user = JSON.parse(text).initialData.user as Record<string, string>;
			const name =
				[user.givenName, user.familyName].filter(Boolean).join(" ").trim() ||
				user.name ||
				user.displayName;
			const handle = user.xUsername || user.username;
			return normalizeGrokIdentityProbe({
				id: user.userId || user.id,
				email: user.email,
				name: name || null,
				handle: handle ? `@${handle.replace(/^@+/, "")}` : null,
				source: "next-flight",
				guestAuthCta: false,
			});
		})
		.filter((candidate): candidate is ProviderUserIdentity => candidate !== null);
	const identities = new Set(
		candidates.map((candidate) =>
			JSON.stringify([
				candidate.id ?? null,
				candidate.email?.toLowerCase() ?? null,
				candidate.handle?.toLowerCase() ?? null,
			]),
		),
	);
	return identities.size === 1 ? candidates[0] : null;
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
  // Display labels cannot hide existing serialized stable account evidence.
  if (identity && (identity.id || identity.email || identity.handle)) {
    return {
      identity,
      guestAuthCta: Boolean(initialProbe?.guestAuthCta),
      probe: initialProbe,
    };
  }

  if (!initialProbe?.guestAuthCta) {
    const scriptTexts = await readGrokSerializedIdentityScriptsWithRetry(Runtime, options);
    identity = extractGrokIdentityFromSerializedScripts(scriptTexts) ?? identity;
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
