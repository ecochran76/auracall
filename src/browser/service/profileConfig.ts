import { resolveBrowserProfileResolution } from './profileResolution.js';

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
  const resolution = resolveBrowserProfileResolution({
    merged,
    profileName: asNonEmptyString(merged.auracallProfile) ?? null,
    profile,
    browser,
  });
  if (!browser.target && resolution.profileFamily.defaultService) {
    browser.target = resolution.profileFamily.defaultService;
  }
  if (
    resolution.profileFamily.keepBrowser !== undefined &&
    (overrideExisting || browser.keepBrowser === undefined)
  ) {
    browser.keepBrowser = resolution.profileFamily.keepBrowser;
  }
  const devRange = isRecord(merged.dev) ? merged.dev.browserPortRange : undefined;
  if ((overrideExisting || browser.debugPortRange === undefined) && resolution.browserFamily.debugPortRange !== undefined) {
    browser.debugPortRange = resolution.browserFamily.debugPortRange;
  } else if (browser.debugPortRange === undefined && devRange !== undefined) {
    browser.debugPortRange = devRange;
  }
  applyBrowserProfileDefaults(browser, profileBrowser, { overrideExisting });
  applyServiceDefaults(merged, profile, browser, { overrideExisting });
  applyCacheDefaults(browser, resolution.profileFamily.cacheDefaults);
}

function applyBrowserProfileDefaults(
  browser: MutableBrowserConfig,
  profileBrowser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const resolution = resolveBrowserProfileResolution({
    merged: { browser },
    profileName: null,
    profile: { browser: profileBrowser },
    browser,
  });
  const browserFamily = resolution.browserFamily;

  if ((overrideExisting || browser.chromePath === undefined) && browserFamily.chromePath) {
    browser.chromePath = browserFamily.chromePath;
  }
  if ((overrideExisting || browser.display === undefined) && browserFamily.display) {
    browser.display = browserFamily.display;
  }
  if (
    (overrideExisting || browser.managedProfileRoot === undefined) &&
    browserFamily.managedProfileRoot !== undefined
  ) {
    browser.managedProfileRoot = browserFamily.managedProfileRoot;
  }
  if (
    (overrideExisting || browser.blockingProfileAction === undefined) &&
    browserFamily.blockingProfileAction !== undefined
  ) {
    browser.blockingProfileAction = browserFamily.blockingProfileAction;
  }
  if ((overrideExisting || browser.chromeProfile === undefined) && browserFamily.sourceProfileName) {
    browser.chromeProfile = browserFamily.sourceProfileName;
  }
  if ((overrideExisting || browser.chromeCookiePath === undefined) && browserFamily.sourceCookiePath) {
    browser.chromeCookiePath = browserFamily.sourceCookiePath;
  }
  if (
    (overrideExisting || browser.bootstrapCookiePath === undefined) &&
    browserFamily.bootstrapCookiePath
  ) {
    browser.bootstrapCookiePath = browserFamily.bootstrapCookiePath;
  }
  if ((overrideExisting || browser.manualLogin === undefined) && profileBrowser.manualLogin !== undefined) {
    browser.manualLogin = profileBrowser.manualLogin;
  }
  if (overrideExisting || browser.manualLoginProfileDir === undefined) {
    const manualLoginProfileDir = asNonEmptyString(profileBrowser.manualLoginProfileDir);
    if (manualLoginProfileDir) {
      browser.manualLoginProfileDir = manualLoginProfileDir;
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
  if ((overrideExisting || browser.serviceTabLimit === undefined) && browserFamily.serviceTabLimit !== undefined) {
    browser.serviceTabLimit = browserFamily.serviceTabLimit;
  }
  if ((overrideExisting || browser.blankTabLimit === undefined) && browserFamily.blankTabLimit !== undefined) {
    browser.blankTabLimit = browserFamily.blankTabLimit;
  }
  if (
    (overrideExisting || browser.collapseDisposableWindows === undefined) &&
    browserFamily.collapseDisposableWindows !== undefined
  ) {
    browser.collapseDisposableWindows = browserFamily.collapseDisposableWindows;
  }
  if ((overrideExisting || browser.debugPort === undefined) && browserFamily.debugPort !== undefined) {
    browser.debugPort = browserFamily.debugPort;
  }
  if (
    (overrideExisting || browser.debugPortStrategy === undefined) &&
    browserFamily.debugPortStrategy !== undefined
  ) {
    browser.debugPortStrategy = browserFamily.debugPortStrategy;
  }
  if ((overrideExisting || browser.remoteChrome === undefined) && profileBrowser.remoteChrome !== undefined) {
    browser.remoteChrome = profileBrowser.remoteChrome;
  }
  if ((overrideExisting || browser.thinkingTime === undefined) && profileBrowser.thinkingTime !== undefined) {
    browser.thinkingTime = profileBrowser.thinkingTime;
  }
  if ((overrideExisting || browser.composerTool === undefined) && profileBrowser.composerTool !== undefined) {
    browser.composerTool = profileBrowser.composerTool;
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
  if (
    (overrideExisting || browser.wslChromePreference === undefined) &&
    browserFamily.wslChromePreference !== undefined
  ) {
    browser.wslChromePreference = browserFamily.wslChromePreference;
  }
}

function applyServiceDefaults(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const resolution = resolveBrowserProfileResolution({
    merged,
    profileName: asNonEmptyString(merged.auracallProfile) ?? null,
    profile,
    browser,
  });

  const currentChatgptUrl = asNonEmptyString(browser.chatgptUrl) ?? null;
  const currentGeminiUrl = asNonEmptyString(browser.geminiUrl) ?? null;
  const currentGrokUrl = asNonEmptyString(browser.grokUrl) ?? null;
  browser.chatgptUrl = (overrideExisting || browser.chatgptUrl === undefined)
    ? resolution.serviceBinding.urls.chatgpt ?? currentChatgptUrl
    : browser.chatgptUrl;
  browser.geminiUrl = (overrideExisting || browser.geminiUrl === undefined)
    ? resolution.serviceBinding.urls.gemini ?? currentGeminiUrl
    : browser.geminiUrl;
  browser.grokUrl = (overrideExisting || browser.grokUrl === undefined)
    ? resolution.serviceBinding.urls.grok ?? currentGrokUrl
    : browser.grokUrl;

  if (!resolution.serviceBinding.serviceId) {
    return;
  }
  if ((overrideExisting || browser.projectId === undefined) && resolution.serviceBinding.projectId) {
    browser.projectId = resolution.serviceBinding.projectId;
  }
  if ((overrideExisting || browser.projectName === undefined) && resolution.serviceBinding.projectName) {
    browser.projectName = resolution.serviceBinding.projectName;
  }
  if ((overrideExisting || browser.conversationId === undefined) && resolution.serviceBinding.conversationId) {
    browser.conversationId = resolution.serviceBinding.conversationId;
  }
  if ((overrideExisting || browser.conversationName === undefined) && resolution.serviceBinding.conversationName) {
    browser.conversationName = resolution.serviceBinding.conversationName;
  }
  if ((overrideExisting || !merged.model) && resolution.serviceBinding.model && merged.engine === 'browser') {
    merged.model = resolution.serviceBinding.model;
  }
  if ((overrideExisting || browser.modelStrategy === undefined) && resolution.serviceBinding.modelStrategy) {
    browser.modelStrategy = resolution.serviceBinding.modelStrategy;
  }
  if ((overrideExisting || browser.thinkingTime === undefined) && resolution.serviceBinding.thinkingTime) {
    browser.thinkingTime = resolution.serviceBinding.thinkingTime;
  }
  if ((overrideExisting || browser.composerTool === undefined) && resolution.serviceBinding.composerTool) {
    browser.composerTool = resolution.serviceBinding.composerTool;
  }
  if ((overrideExisting || browser.manualLogin === undefined) && resolution.serviceBinding.manualLogin !== undefined) {
    browser.manualLogin = resolution.serviceBinding.manualLogin;
  }
  if ((overrideExisting || browser.manualLoginProfileDir === undefined) && resolution.serviceBinding.manualLoginProfileDir) {
    browser.manualLoginProfileDir = resolution.serviceBinding.manualLoginProfileDir;
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
