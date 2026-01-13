import { CHATGPT_URL, DEFAULT_MODEL_STRATEGY, DEFAULT_MODEL_TARGET, GROK_URL } from './constants.js';
import { normalizeBrowserModelStrategy } from './modelStrategy.js';
import type { BrowserAutomationConfig, ResolvedBrowserConfig } from './types.js';
import { isTemporaryChatUrl, normalizeChatgptUrl } from './utils.js';
import { discoverDefaultBrowserProfile, resolveProfileDirectoryName, type WslChromePreference } from './service/profile.js';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BROWSER_CONFIG: ResolvedBrowserConfig = {
  chromeProfile: null,
  chromePath: null,
  chromeCookiePath: null,
  display: null,
  blockingProfileAction: 'restart-managed',
  managedProfileRoot: path.join(os.homedir(), '.oracle'),
  target: 'chatgpt',
  projectId: null,
  conversationId: null,
  geminiUrl: null,
  grokUrl: null,
  url: CHATGPT_URL,
  chatgptUrl: CHATGPT_URL,
  timeoutMs: 1_200_000,
  debugPort: null,
  debugPortRange: [45000, 45100],
  inputTimeoutMs: 60_000,
  cookieSync: true,
  cookieNames: null,
  cookieSyncWaitMs: 0,
  inlineCookies: null,
  inlineCookiesSource: null,
  headless: false,
  keepBrowser: false,
  hideWindow: false,
  desiredModel: DEFAULT_MODEL_TARGET,
  modelStrategy: DEFAULT_MODEL_STRATEGY,
  debug: false,
  allowCookieErrors: false,
  remoteChrome: null,
  manualLogin: false,
  manualLoginProfileDir: null,
  manualLoginCookieSync: false,
  wslChromePreference: 'auto',
};

export function resolveBrowserConfig(config: BrowserAutomationConfig | undefined): ResolvedBrowserConfig {
  const debugPortEnv = parseDebugPort(
    process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT,
  );
  const envAllowCookieErrors =
    (process.env.ORACLE_BROWSER_ALLOW_COOKIE_ERRORS ?? '').trim().toLowerCase() === 'true' ||
    (process.env.ORACLE_BROWSER_ALLOW_COOKIE_ERRORS ?? '').trim() === '1';
  const target = config?.target ?? DEFAULT_BROWSER_CONFIG.target;
  const rawUrl =
    target === 'grok'
      ? config?.grokUrl ?? config?.url ?? GROK_URL
      : config?.chatgptUrl ?? config?.url ?? DEFAULT_BROWSER_CONFIG.url;
  const normalizedUrl =
    target === 'grok'
      ? (rawUrl ?? GROK_URL)
      : normalizeChatgptUrl(rawUrl ?? DEFAULT_BROWSER_CONFIG.url, DEFAULT_BROWSER_CONFIG.url);
  const desiredModel = config?.desiredModel ?? DEFAULT_BROWSER_CONFIG.desiredModel ?? DEFAULT_MODEL_TARGET;
  const modelStrategy =
    normalizeBrowserModelStrategy(config?.modelStrategy) ??
    DEFAULT_BROWSER_CONFIG.modelStrategy ??
    DEFAULT_MODEL_STRATEGY;
  if (modelStrategy === 'select' && isTemporaryChatUrl(normalizedUrl) && /\bpro\b/i.test(desiredModel)) {
    throw new Error(
      'Temporary Chat mode does not expose Pro models in the ChatGPT model picker. ' +
        'Remove "temporary-chat=true" from your browser URL, or use a non-Pro model label (e.g. "GPT-5.2").',
    );
  }
  const isWindows = process.platform === 'win32';
  const manualLogin = config?.manualLogin ?? (isWindows ? true : DEFAULT_BROWSER_CONFIG.manualLogin);
  const cookieSyncDefault = isWindows ? false : DEFAULT_BROWSER_CONFIG.cookieSync;
  const normalizedCookieNames = normalizeCookieNames(config?.cookieNames ?? DEFAULT_BROWSER_CONFIG.cookieNames);
  const normalizedInlineCookies = normalizeInlineCookies(config?.inlineCookies ?? DEFAULT_BROWSER_CONFIG.inlineCookies);
  const wslChromePreference = normalizeWslChromePreference(
    config?.wslChromePreference ?? process.env.ORACLE_WSL_CHROME,
  );
  const explicitProfileDir = config?.manualLoginProfileDir ?? process.env.ORACLE_BROWSER_PROFILE_DIR ?? null;
  const discoveredProfile = discoverDefaultBrowserProfile({ preference: wslChromePreference });
  const resolvedProfileDir = normalizeManualLoginProfileDir(
    explicitProfileDir ?? path.join(os.homedir(), '.oracle', 'browser-profile'),
  );
  const resolvedChromeProfile = resolveProfileDirectoryName(
    resolvedProfileDir,
    config?.chromeProfile ?? discoveredProfile?.profileName ?? DEFAULT_BROWSER_CONFIG.chromeProfile ?? 'Default',
  );
  const resolvedChromePath = config?.chromePath ?? discoveredProfile?.chromePath ?? DEFAULT_BROWSER_CONFIG.chromePath;
  const resolvedCookiePath =
    config?.chromeCookiePath ?? discoveredProfile?.cookiePath ?? DEFAULT_BROWSER_CONFIG.chromeCookiePath;
  const resolvedDisplay =
    config?.display ?? process.env.ORACLE_BROWSER_DISPLAY ?? DEFAULT_BROWSER_CONFIG.display;
  const debugPortRange = normalizeDebugPortRange(config?.debugPortRange);
  const normalizedRemoteChrome = normalizeRemoteChrome(config?.remoteChrome ?? DEFAULT_BROWSER_CONFIG.remoteChrome);
  const mapProfileConflictAction = (
    value: BrowserAutomationConfig['profileConflictAction'] | undefined,
  ): BrowserAutomationConfig['blockingProfileAction'] | undefined => {
    if (!value) return undefined;
    if (value === 'terminate-existing') return 'restart';
    if (value === 'attach-existing') return 'fail';
    return value;
  };
  const normalizeBlockingProfileAction = (
    value: BrowserAutomationConfig['blockingProfileAction'] | undefined,
  ): ResolvedBrowserConfig['blockingProfileAction'] | undefined => {
    if (!value) return undefined;
    if (value === 'restart-oracle') return 'restart-managed';
    return value as ResolvedBrowserConfig['blockingProfileAction'];
  };
  const blockingProfileAction =
    normalizeBlockingProfileAction(config?.blockingProfileAction) ??
    normalizeBlockingProfileAction(mapProfileConflictAction(config?.profileConflictAction)) ??
    DEFAULT_BROWSER_CONFIG.blockingProfileAction;
  return {
    ...DEFAULT_BROWSER_CONFIG,
    ...(config ?? {}),
    blockingProfileAction,
    managedProfileRoot: config?.managedProfileRoot ?? DEFAULT_BROWSER_CONFIG.managedProfileRoot,
    target,
    url: normalizedUrl,
    chatgptUrl: target === 'grok' ? DEFAULT_BROWSER_CONFIG.chatgptUrl : normalizedUrl,
    timeoutMs: config?.timeoutMs ?? DEFAULT_BROWSER_CONFIG.timeoutMs,
    debugPort: debugPortEnv ?? config?.debugPort ?? DEFAULT_BROWSER_CONFIG.debugPort,
    debugPortRange,
    inputTimeoutMs: config?.inputTimeoutMs ?? DEFAULT_BROWSER_CONFIG.inputTimeoutMs,
    cookieSync: config?.cookieSync ?? cookieSyncDefault,
    cookieNames: normalizedCookieNames,
    cookieSyncWaitMs: config?.cookieSyncWaitMs ?? DEFAULT_BROWSER_CONFIG.cookieSyncWaitMs,
    inlineCookies: normalizedInlineCookies,
    inlineCookiesSource: config?.inlineCookiesSource ?? DEFAULT_BROWSER_CONFIG.inlineCookiesSource,
    headless: config?.headless ?? DEFAULT_BROWSER_CONFIG.headless,
    keepBrowser: config?.keepBrowser ?? DEFAULT_BROWSER_CONFIG.keepBrowser,
    hideWindow: config?.hideWindow ?? DEFAULT_BROWSER_CONFIG.hideWindow,
    desiredModel,
    modelStrategy,
    chromeProfile: resolvedChromeProfile,
    chromePath: resolvedChromePath,
    chromeCookiePath: resolvedCookiePath,
    display: resolvedDisplay,
    geminiUrl: config?.geminiUrl ?? DEFAULT_BROWSER_CONFIG.geminiUrl,
    grokUrl: config?.grokUrl ?? DEFAULT_BROWSER_CONFIG.grokUrl,
    debug: config?.debug ?? DEFAULT_BROWSER_CONFIG.debug,
    allowCookieErrors: config?.allowCookieErrors ?? envAllowCookieErrors ?? DEFAULT_BROWSER_CONFIG.allowCookieErrors,
    remoteChrome: normalizedRemoteChrome,
    thinkingTime: config?.thinkingTime,
    manualLogin,
    manualLoginProfileDir: manualLogin ? resolvedProfileDir : null,
    manualLoginCookieSync: config?.manualLoginCookieSync ?? DEFAULT_BROWSER_CONFIG.manualLoginCookieSync,
    wslChromePreference,
  };
}

function normalizeManualLoginProfileDir(value: string): string {
  if (!isWsl()) {
    return value;
  }
  const trimmed = value.trim();
  const uncMatch = trimmed.match(/^\\\\wsl\.localhost\\[^\\]+\\(.+)$/);
  if (uncMatch?.[1]) {
    return `/${uncMatch[1].replace(/\\/g, '/')}`;
  }
  const uncSlashMatch = trimmed.match(/^\/\/wsl\.localhost\/[^/]+\/(.+)$/);
  if (uncSlashMatch?.[1]) {
    return `/${uncSlashMatch[1].replace(/\//g, '/')}`;
  }
  const driveMatch = trimmed.match(/^([a-zA-Z]):\\(.+)$/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2].replace(/\\/g, '/')}`;
  }
  return value;
}

function normalizeDebugPortRange(
  value: [number, number] | null | undefined,
): [number, number] | null {
  if (!value) return null;
  const [start, end] = value;
  const startNum = Number(start);
  const endNum = Number(end);
  if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
    throw new Error('browser.debugPortRange must contain two numbers.');
  }
  const min = Math.min(startNum, endNum);
  const max = Math.max(startNum, endNum);
  if (min <= 0 || max > 65535) {
    throw new Error('browser.debugPortRange must be within 1-65535.');
  }
  if (min === max) {
    return [min, max];
  }
  return [min, max];
}

function normalizeCookieNames(value: string[] | string | null | undefined): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => entry.trim()).filter(Boolean);
    return normalized.length ? normalized : null;
  }
  const names = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return names.length ? names : null;
}

function normalizeInlineCookies(
  value: import('./types.js').CookieParam[] | string | null | undefined,
): import('./types.js').CookieParam[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseCookiePayload(trimmed) ?? parseCookiePayload(Buffer.from(trimmed, 'base64').toString('utf8'));
  return parsed ?? null;
}

function parseCookiePayload(raw: string): import('./types.js').CookieParam[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeRemoteChrome(
  value: import('./types.js').BrowserAutomationConfig['remoteChrome'],
): { host: string; port: number } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return parseRemoteChromeTarget(value);
  }
  return value;
}

function parseRemoteChromeTarget(raw: string): { host: string; port: number } | null {
  const target = raw.trim();
  if (!target) {
    return null;
  }
  const ipv6Match = target.match(/^\[(.+)]:(\d+)$/);
  let host: string | undefined;
  let portSegment: string | undefined;

  if (ipv6Match) {
    host = ipv6Match[1]?.trim();
    portSegment = ipv6Match[2]?.trim();
  } else {
    const lastColon = target.lastIndexOf(':');
    if (lastColon === -1) {
      return null;
    }
    host = target.slice(0, lastColon).trim();
    portSegment = target.slice(lastColon + 1).trim();
  }
  if (!host) return null;
  const port = Number.parseInt(portSegment ?? '', 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    return null;
  }
  return { host, port };
}

function normalizeWslChromePreference(input: string | null | undefined): WslChromePreference {
  const normalized = (input ?? '').trim().toLowerCase();
  if (normalized === 'windows' || normalized === 'wsl' || normalized === 'auto') {
    return normalized as WslChromePreference;
  }
  return 'auto';
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}

function parseDebugPort(raw?: string | null): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return null;
  }
  return value;
}
