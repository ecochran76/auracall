import { resolveCookiePath, resolveProfileDirectoryName } from './profile.js';

type ServiceId = 'chatgpt' | 'gemini' | 'grok';
type MutableBrowserConfig = Record<string, unknown>;
type MutableConfig = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function applyBrowserProfileOverrides(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
): void {
  const profileBrowser = (profile.browser ?? {}) as Record<string, unknown>;
  const mergedBrowser = isRecord(merged.browser) ? merged.browser : {};
  const defaultService =
    asNonEmptyString(profile.defaultService) ??
    asNonEmptyString(browser.target) ??
    asNonEmptyString(mergedBrowser.target);
  if (!browser.target && defaultService) {
    browser.target = defaultService;
  }
  if (profile.keepBrowser !== undefined && browser.keepBrowser === undefined) {
    browser.keepBrowser = profile.keepBrowser as boolean;
  }
  const devRange = isRecord(merged.dev) ? merged.dev.browserPortRange : undefined;
  if (browser.debugPortRange === undefined && profileBrowser.debugPortRange !== undefined) {
    browser.debugPortRange = profileBrowser.debugPortRange;
  } else if (browser.debugPortRange === undefined && devRange !== undefined) {
    browser.debugPortRange = devRange;
  }
  applyBrowserProfileDefaults(browser, profileBrowser);
  applyServiceDefaults(merged, profile, browser);
  applyCacheDefaults(browser, profile.cache ?? null);
}

function applyBrowserProfileDefaults(browser: MutableBrowserConfig, profileBrowser: MutableBrowserConfig): void {
  const profilePath = asNonEmptyString(profileBrowser.profilePath);
  const profileName = asNonEmptyString(profileBrowser.profileName);
  const cookiePath = asNonEmptyString(profileBrowser.cookiePath);
  const chromeProfile = asNonEmptyString(browser.chromeProfile);

  if (browser.chromePath === undefined && profileBrowser.chromePath) {
    browser.chromePath = profileBrowser.chromePath;
  }
  if (browser.display === undefined && profileBrowser.display) {
    browser.display = profileBrowser.display;
  }
  if (browser.blockingProfileAction === undefined && profileBrowser.blockingProfileAction !== undefined) {
    browser.blockingProfileAction = profileBrowser.blockingProfileAction;
  }
  if (browser.chromeProfile === undefined && profileName) {
    browser.chromeProfile = profilePath
      ? resolveProfileDirectoryName(profilePath, profileName)
      : profileName;
  }
  if (browser.chromeCookiePath === undefined) {
    const resolvedProfileName = profilePath && chromeProfile
      ? resolveProfileDirectoryName(profilePath, chromeProfile)
      : chromeProfile;
    if (cookiePath) {
      browser.chromeCookiePath = cookiePath;
    } else if (profilePath) {
      const resolvedName = resolvedProfileName ?? profileName ?? chromeProfile ?? 'Default';
      const resolvedCookie = resolveCookiePath(profilePath, resolvedName);
      if (resolvedCookie) {
        browser.chromeCookiePath = resolvedCookie;
      }
    }
  }
  if (browser.manualLogin === undefined && profileBrowser.manualLogin !== undefined) {
    browser.manualLogin = profileBrowser.manualLogin;
  }
  if (browser.manualLoginProfileDir === undefined) {
    const manualLoginProfileDir = asNonEmptyString(profileBrowser.manualLoginProfileDir);
    if (manualLoginProfileDir) {
      browser.manualLoginProfileDir = manualLoginProfileDir;
    } else if (profilePath) {
      browser.manualLoginProfileDir = profilePath;
    }
  }
  if (browser.headless === undefined && profileBrowser.headless !== undefined) {
    browser.headless = profileBrowser.headless;
  }
  if (browser.hideWindow === undefined && profileBrowser.hideWindow !== undefined) {
    browser.hideWindow = profileBrowser.hideWindow;
  }
  if (browser.keepBrowser === undefined && profileBrowser.keepBrowser !== undefined) {
    browser.keepBrowser = profileBrowser.keepBrowser;
  }
  if (browser.debugPort === undefined && profileBrowser.debugPort !== undefined) {
    browser.debugPort = profileBrowser.debugPort;
  }
  if (browser.remoteChrome === undefined && profileBrowser.remoteChrome !== undefined) {
    browser.remoteChrome = profileBrowser.remoteChrome;
  }
  if (browser.thinkingTime === undefined && profileBrowser.thinkingTime !== undefined) {
    browser.thinkingTime = profileBrowser.thinkingTime;
  }
  if (browser.modelStrategy === undefined && profileBrowser.modelStrategy !== undefined) {
    browser.modelStrategy = profileBrowser.modelStrategy;
  }
  if (browser.attachments === undefined && profileBrowser.attachments !== undefined) {
    browser.attachments = profileBrowser.attachments;
  }
  if (browser.inlineFiles === undefined && profileBrowser.inlineFiles !== undefined) {
    browser.inlineFiles = profileBrowser.inlineFiles;
  }
  if (browser.bundleFiles === undefined && profileBrowser.bundleFiles !== undefined) {
    browser.bundleFiles = profileBrowser.bundleFiles;
  }
  if (browser.cookieNames === undefined && profileBrowser.cookieNames !== undefined) {
    browser.cookieNames = profileBrowser.cookieNames;
  }
  if (browser.inlineCookies === undefined && profileBrowser.inlineCookies !== undefined) {
    browser.inlineCookies = profileBrowser.inlineCookies;
  }
  if (browser.inlineCookiesFile === undefined && profileBrowser.inlineCookiesFile !== undefined) {
    browser.inlineCookiesFile = profileBrowser.inlineCookiesFile;
  }
  if (browser.allowCookieErrors === undefined && profileBrowser.allowCookieErrors !== undefined) {
    browser.allowCookieErrors = profileBrowser.allowCookieErrors;
  }
  if (browser.noCookieSync === undefined && profileBrowser.noCookieSync !== undefined) {
    browser.noCookieSync = profileBrowser.noCookieSync;
  }
  if (browser.cookieSyncWaitMs === undefined && profileBrowser.cookieSyncWaitMs !== undefined) {
    browser.cookieSyncWaitMs = profileBrowser.cookieSyncWaitMs;
  }
  if (browser.wslChromePreference === undefined && profileBrowser.wslChromePreference !== undefined) {
    browser.wslChromePreference = profileBrowser.wslChromePreference;
  }
}

function applyServiceDefaults(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
): void {
  const services = isRecord(merged.services) ? merged.services : {};
  const profileServices = isRecord(profile.services) ? profile.services : {};
  const target = browser.target as ServiceId | undefined;

  const resolveUrl = (service: ServiceId, fallback: string | null = null): string | null => {
    const profileConfig = (profileServices[service] ?? {}) as Record<string, unknown>;
    const serviceConfig = (services[service] ?? {}) as Record<string, unknown>;
    const profileUrl = asNonEmptyString(profileConfig.url);
    const globalUrl = asNonEmptyString(serviceConfig.url);
    return profileUrl ?? globalUrl ?? fallback;
  };

  const resolveServiceConfig = (service: ServiceId): Record<string, unknown> => ({
    ...(services[service] ?? {}),
    ...(profileServices[service] ?? {}),
  });

  const currentChatgptUrl = asNonEmptyString(browser.chatgptUrl) ?? null;
  const currentGeminiUrl = asNonEmptyString(browser.geminiUrl) ?? null;
  const currentGrokUrl = asNonEmptyString(browser.grokUrl) ?? null;
  browser.chatgptUrl = browser.chatgptUrl ?? resolveUrl('chatgpt', currentChatgptUrl);
  browser.geminiUrl = browser.geminiUrl ?? resolveUrl('gemini', currentGeminiUrl);
  browser.grokUrl = browser.grokUrl ?? resolveUrl('grok', currentGrokUrl);

  if (!target) {
    return;
  }
  const serviceConfig = resolveServiceConfig(target);
  if (browser.projectId === undefined && serviceConfig.projectId) {
    browser.projectId = serviceConfig.projectId;
  }
  if (browser.projectName === undefined && serviceConfig.projectName) {
    browser.projectName = serviceConfig.projectName;
  }
  if (browser.conversationId === undefined && serviceConfig.conversationId) {
    browser.conversationId = serviceConfig.conversationId;
  }
  if (browser.conversationName === undefined && serviceConfig.conversationName) {
    browser.conversationName = serviceConfig.conversationName;
  }
  if (!merged.model && serviceConfig.model && merged.engine === 'browser') {
    merged.model = serviceConfig.model as string;
  }
  if (browser.modelStrategy === undefined && serviceConfig.modelStrategy) {
    browser.modelStrategy = serviceConfig.modelStrategy;
  }
  if (browser.thinkingTime === undefined && serviceConfig.thinkingTime) {
    browser.thinkingTime = serviceConfig.thinkingTime;
  }
  if (browser.manualLogin === undefined && serviceConfig.manualLogin !== undefined) {
    browser.manualLogin = serviceConfig.manualLogin;
  }
  if (browser.manualLoginProfileDir === undefined && serviceConfig.manualLoginProfileDir) {
    browser.manualLoginProfileDir = serviceConfig.manualLoginProfileDir;
  }
}

function applyCacheDefaults(browser: MutableBrowserConfig, cache: unknown): void {
  if (!isRecord(cache)) return;
  browser.cache = browser.cache ?? {};
  const targetCache = browser.cache as Record<string, unknown>;
  if (targetCache.refresh === undefined && cache.refresh !== undefined) {
    targetCache.refresh = cache.refresh;
  }
  if (targetCache.includeHistory === undefined && cache.includeHistory !== undefined) {
    targetCache.includeHistory = cache.includeHistory;
  }
  if (targetCache.historyLimit === undefined && cache.historyLimit !== undefined) {
    targetCache.historyLimit = cache.historyLimit;
  }
  if (targetCache.historySince === undefined && cache.historySince !== undefined) {
    targetCache.historySince = cache.historySince;
  }
  if (targetCache.rootDir === undefined && cache.rootDir !== undefined) {
    targetCache.rootDir = cache.rootDir;
  }
  if (targetCache.useDetectedIdentity === undefined && cache.useDetectedIdentity !== undefined) {
    targetCache.useDetectedIdentity = cache.useDetectedIdentity;
  }
  if (targetCache.refreshHours === undefined && cache.refreshHours !== undefined) {
    targetCache.refreshHours = cache.refreshHours;
  }
}
