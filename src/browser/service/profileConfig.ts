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
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const profileBrowser = (profile.browser ?? {}) as Record<string, unknown>;
  const mergedBrowser = isRecord(merged.browser) ? merged.browser : {};
  const defaultService =
    asNonEmptyString(profile.defaultService) ??
    asNonEmptyString(browser.target) ??
    asNonEmptyString(mergedBrowser.target);
  if ((overrideExisting || !browser.target) && defaultService) {
    browser.target = defaultService;
  }
  if (profile.keepBrowser !== undefined && (overrideExisting || browser.keepBrowser === undefined)) {
    browser.keepBrowser = profile.keepBrowser as boolean;
  }
  const devRange = isRecord(merged.dev) ? merged.dev.browserPortRange : undefined;
  if ((overrideExisting || browser.debugPortRange === undefined) && profileBrowser.debugPortRange !== undefined) {
    browser.debugPortRange = profileBrowser.debugPortRange;
  } else if (browser.debugPortRange === undefined && devRange !== undefined) {
    browser.debugPortRange = devRange;
  }
  applyBrowserProfileDefaults(browser, profileBrowser, { overrideExisting });
  applyServiceDefaults(merged, profile, browser, { overrideExisting });
  applyCacheDefaults(browser, profile.cache ?? null);
}

function applyBrowserProfileDefaults(
  browser: MutableBrowserConfig,
  profileBrowser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const profilePath = asNonEmptyString(profileBrowser.profilePath);
  const profileName = asNonEmptyString(profileBrowser.profileName) ?? asNonEmptyString(profileBrowser.chromeProfile);
  const cookiePath = asNonEmptyString(profileBrowser.cookiePath) ?? asNonEmptyString(profileBrowser.chromeCookiePath);
  const bootstrapCookiePath = asNonEmptyString(profileBrowser.bootstrapCookiePath);
  const chromeProfile = asNonEmptyString(browser.chromeProfile);
  const resolvedProfileName = profilePath && chromeProfile
    ? resolveProfileDirectoryName(profilePath, chromeProfile)
    : chromeProfile;
  const resolvedProfileCookie = profilePath
    ? resolveCookiePath(profilePath, resolvedProfileName ?? profileName ?? chromeProfile ?? 'Default')
    : undefined;

  if ((overrideExisting || browser.chromePath === undefined) && profileBrowser.chromePath) {
    browser.chromePath = profileBrowser.chromePath;
  }
  if ((overrideExisting || browser.display === undefined) && profileBrowser.display) {
    browser.display = profileBrowser.display;
  }
  if ((overrideExisting || browser.managedProfileRoot === undefined) && profileBrowser.managedProfileRoot !== undefined) {
    browser.managedProfileRoot = profileBrowser.managedProfileRoot;
  }
  if ((overrideExisting || browser.blockingProfileAction === undefined) && profileBrowser.blockingProfileAction !== undefined) {
    browser.blockingProfileAction = profileBrowser.blockingProfileAction;
  }
  if ((overrideExisting || browser.chromeProfile === undefined) && profileName) {
    browser.chromeProfile = profilePath
      ? resolveProfileDirectoryName(profilePath, profileName)
      : profileName;
  }
  if (overrideExisting || browser.chromeCookiePath === undefined) {
    if (cookiePath) {
      browser.chromeCookiePath = cookiePath;
    } else if (resolvedProfileCookie) {
      browser.chromeCookiePath = resolvedProfileCookie;
    }
  }
  if (overrideExisting || browser.bootstrapCookiePath === undefined) {
    if (bootstrapCookiePath) {
      browser.bootstrapCookiePath = bootstrapCookiePath;
    } else if (cookiePath) {
      browser.bootstrapCookiePath = cookiePath;
    } else if (resolvedProfileCookie) {
      browser.bootstrapCookiePath = resolvedProfileCookie;
    }
  }
  if ((overrideExisting || browser.manualLogin === undefined) && profileBrowser.manualLogin !== undefined) {
    browser.manualLogin = profileBrowser.manualLogin;
  }
  if (overrideExisting || browser.manualLoginProfileDir === undefined) {
    const manualLoginProfileDir = asNonEmptyString(profileBrowser.manualLoginProfileDir);
    if (manualLoginProfileDir) {
      browser.manualLoginProfileDir = manualLoginProfileDir;
    } else if (profilePath) {
      browser.manualLoginProfileDir = profilePath;
    }
  }
  if ((overrideExisting || browser.headless === undefined) && profileBrowser.headless !== undefined) {
    browser.headless = profileBrowser.headless;
  }
  if ((overrideExisting || browser.hideWindow === undefined) && profileBrowser.hideWindow !== undefined) {
    browser.hideWindow = profileBrowser.hideWindow;
  }
  if ((overrideExisting || browser.keepBrowser === undefined) && profileBrowser.keepBrowser !== undefined) {
    browser.keepBrowser = profileBrowser.keepBrowser;
  }
  if ((overrideExisting || browser.serviceTabLimit === undefined) && profileBrowser.serviceTabLimit !== undefined) {
    browser.serviceTabLimit = profileBrowser.serviceTabLimit;
  }
  if ((overrideExisting || browser.blankTabLimit === undefined) && profileBrowser.blankTabLimit !== undefined) {
    browser.blankTabLimit = profileBrowser.blankTabLimit;
  }
  if ((overrideExisting || browser.collapseDisposableWindows === undefined) && profileBrowser.collapseDisposableWindows !== undefined) {
    browser.collapseDisposableWindows = profileBrowser.collapseDisposableWindows;
  }
  if ((overrideExisting || browser.debugPort === undefined) && profileBrowser.debugPort !== undefined) {
    browser.debugPort = profileBrowser.debugPort;
  }
  if ((overrideExisting || browser.debugPortStrategy === undefined) && profileBrowser.debugPortStrategy !== undefined) {
    browser.debugPortStrategy = profileBrowser.debugPortStrategy;
  }
  if ((overrideExisting || browser.remoteChrome === undefined) && profileBrowser.remoteChrome !== undefined) {
    browser.remoteChrome = profileBrowser.remoteChrome;
  }
  if ((overrideExisting || browser.thinkingTime === undefined) && profileBrowser.thinkingTime !== undefined) {
    browser.thinkingTime = profileBrowser.thinkingTime;
  }
  if ((overrideExisting || browser.modelStrategy === undefined) && profileBrowser.modelStrategy !== undefined) {
    browser.modelStrategy = profileBrowser.modelStrategy;
  }
  if ((overrideExisting || browser.attachments === undefined) && profileBrowser.attachments !== undefined) {
    browser.attachments = profileBrowser.attachments;
  }
  if ((overrideExisting || browser.inlineFiles === undefined) && profileBrowser.inlineFiles !== undefined) {
    browser.inlineFiles = profileBrowser.inlineFiles;
  }
  if ((overrideExisting || browser.bundleFiles === undefined) && profileBrowser.bundleFiles !== undefined) {
    browser.bundleFiles = profileBrowser.bundleFiles;
  }
  if ((overrideExisting || browser.cookieNames === undefined) && profileBrowser.cookieNames !== undefined) {
    browser.cookieNames = profileBrowser.cookieNames;
  }
  if ((overrideExisting || browser.inlineCookies === undefined) && profileBrowser.inlineCookies !== undefined) {
    browser.inlineCookies = profileBrowser.inlineCookies;
  }
  if ((overrideExisting || browser.inlineCookiesFile === undefined) && profileBrowser.inlineCookiesFile !== undefined) {
    browser.inlineCookiesFile = profileBrowser.inlineCookiesFile;
  }
  if ((overrideExisting || browser.allowCookieErrors === undefined) && profileBrowser.allowCookieErrors !== undefined) {
    browser.allowCookieErrors = profileBrowser.allowCookieErrors;
  }
  if ((overrideExisting || browser.noCookieSync === undefined) && profileBrowser.noCookieSync !== undefined) {
    browser.noCookieSync = profileBrowser.noCookieSync;
  }
  if ((overrideExisting || browser.cookieSyncWaitMs === undefined) && profileBrowser.cookieSyncWaitMs !== undefined) {
    browser.cookieSyncWaitMs = profileBrowser.cookieSyncWaitMs;
  }
  if ((overrideExisting || browser.wslChromePreference === undefined) && profileBrowser.wslChromePreference !== undefined) {
    browser.wslChromePreference = profileBrowser.wslChromePreference;
  }
}

function applyServiceDefaults(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
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
  browser.chatgptUrl = (overrideExisting || browser.chatgptUrl === undefined)
    ? resolveUrl('chatgpt', currentChatgptUrl)
    : browser.chatgptUrl;
  browser.geminiUrl = (overrideExisting || browser.geminiUrl === undefined)
    ? resolveUrl('gemini', currentGeminiUrl)
    : browser.geminiUrl;
  browser.grokUrl = (overrideExisting || browser.grokUrl === undefined)
    ? resolveUrl('grok', currentGrokUrl)
    : browser.grokUrl;

  if (!target) {
    return;
  }
  const serviceConfig = resolveServiceConfig(target);
  if ((overrideExisting || browser.projectId === undefined) && serviceConfig.projectId) {
    browser.projectId = serviceConfig.projectId;
  }
  if ((overrideExisting || browser.projectName === undefined) && serviceConfig.projectName) {
    browser.projectName = serviceConfig.projectName;
  }
  if ((overrideExisting || browser.conversationId === undefined) && serviceConfig.conversationId) {
    browser.conversationId = serviceConfig.conversationId;
  }
  if ((overrideExisting || browser.conversationName === undefined) && serviceConfig.conversationName) {
    browser.conversationName = serviceConfig.conversationName;
  }
  if ((overrideExisting || !merged.model) && serviceConfig.model && merged.engine === 'browser') {
    merged.model = serviceConfig.model as string;
  }
  if ((overrideExisting || browser.modelStrategy === undefined) && serviceConfig.modelStrategy) {
    browser.modelStrategy = serviceConfig.modelStrategy;
  }
  if ((overrideExisting || browser.thinkingTime === undefined) && serviceConfig.thinkingTime) {
    browser.thinkingTime = serviceConfig.thinkingTime;
  }
  if ((overrideExisting || browser.manualLogin === undefined) && serviceConfig.manualLogin !== undefined) {
    browser.manualLogin = serviceConfig.manualLogin;
  }
  if ((overrideExisting || browser.manualLoginProfileDir === undefined) && serviceConfig.manualLoginProfileDir) {
    browser.manualLoginProfileDir = serviceConfig.manualLoginProfileDir;
  }
}

function applyCacheDefaults(browser: MutableBrowserConfig, cache: unknown): void {
  if (!isRecord(cache)) return;
  browser.cache = browser.cache ?? {};
  const targetCache = browser.cache as Record<string, unknown>;
  if (targetCache.store === undefined && cache.store !== undefined) {
    targetCache.store = cache.store;
  }
  if (targetCache.refresh === undefined && cache.refresh !== undefined) {
    targetCache.refresh = cache.refresh;
  }
  if (targetCache.includeHistory === undefined && cache.includeHistory !== undefined) {
    targetCache.includeHistory = cache.includeHistory;
  }
  if (
    targetCache.includeProjectOnlyConversations === undefined &&
    cache.includeProjectOnlyConversations !== undefined
  ) {
    targetCache.includeProjectOnlyConversations = cache.includeProjectOnlyConversations;
  }
  if (targetCache.historyLimit === undefined && cache.historyLimit !== undefined) {
    targetCache.historyLimit = cache.historyLimit;
  }
  if (targetCache.historySince === undefined && cache.historySince !== undefined) {
    targetCache.historySince = cache.historySince;
  }
  if (targetCache.cleanupDays === undefined && cache.cleanupDays !== undefined) {
    targetCache.cleanupDays = cache.cleanupDays;
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
