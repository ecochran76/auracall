import { resolveSelectedBrowserProfileResolution } from './profileResolution.js';

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
  const { resolution } = resolveSelectedBrowserProfileResolution({
    merged,
    explicitProfileName: asNonEmptyString(merged.auracallProfile) ?? null,
    runtimeProfile: profile,
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
  if ((overrideExisting || browser.debugPortRange === undefined) && resolution.browserProfile.debugPortRange !== undefined) {
    browser.debugPortRange = resolution.browserProfile.debugPortRange;
  } else if (browser.debugPortRange === undefined && devRange !== undefined) {
    browser.debugPortRange = devRange;
  }
  applyBrowserProfileDefaults(merged, profile, browser, { overrideExisting });
  applyServiceDefaults(merged, profile, browser, { overrideExisting });
  applyCacheDefaults(browser, resolution.profileFamily.cacheDefaults);
}

function applyBrowserProfileDefaults(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const profileBrowser = isRecord(profile.browser) ? profile.browser : {};
  const { resolution } = resolveSelectedBrowserProfileResolution({
    merged,
    explicitProfileName: asNonEmptyString(merged.auracallProfile) ?? null,
    runtimeProfile: profile,
    browser,
  });
  const browserProfile = resolution.browserProfile;

  if ((overrideExisting || browser.chromePath === undefined) && browserProfile.chromePath) {
    browser.chromePath = browserProfile.chromePath;
  }
  if ((overrideExisting || browser.display === undefined) && browserProfile.display) {
    browser.display = browserProfile.display;
  }
  if (
    (overrideExisting || browser.managedProfileRoot === undefined) &&
    browserProfile.managedProfileRoot !== undefined
  ) {
    browser.managedProfileRoot = browserProfile.managedProfileRoot;
  }
  if (
    (overrideExisting || browser.blockingProfileAction === undefined) &&
    browserProfile.blockingProfileAction !== undefined
  ) {
    browser.blockingProfileAction = browserProfile.blockingProfileAction;
  }
  if ((overrideExisting || browser.chromeProfile === undefined) && browserProfile.sourceProfileName) {
    browser.chromeProfile = browserProfile.sourceProfileName;
  }
  if ((overrideExisting || browser.chromeCookiePath === undefined) && browserProfile.sourceCookiePath) {
    browser.chromeCookiePath = browserProfile.sourceCookiePath;
  }
  if (
    (overrideExisting || browser.bootstrapCookiePath === undefined) &&
    browserProfile.bootstrapCookiePath
  ) {
    browser.bootstrapCookiePath = browserProfile.bootstrapCookiePath;
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
  if ((overrideExisting || browser.headless === undefined) && browserProfile.headless !== undefined) {
    browser.headless = browserProfile.headless;
  }
  if ((overrideExisting || browser.hideWindow === undefined) && browserProfile.hideWindow !== undefined) {
    browser.hideWindow = browserProfile.hideWindow;
  }
  if ((overrideExisting || browser.keepBrowser === undefined) && profileBrowser.keepBrowser !== undefined) {
    browser.keepBrowser = profileBrowser.keepBrowser;
  }
  if ((overrideExisting || browser.serviceTabLimit === undefined) && browserProfile.serviceTabLimit !== undefined) {
    browser.serviceTabLimit = browserProfile.serviceTabLimit;
  }
  if ((overrideExisting || browser.blankTabLimit === undefined) && browserProfile.blankTabLimit !== undefined) {
    browser.blankTabLimit = browserProfile.blankTabLimit;
  }
  if (
    (overrideExisting || browser.collapseDisposableWindows === undefined) &&
    browserProfile.collapseDisposableWindows !== undefined
  ) {
    browser.collapseDisposableWindows = browserProfile.collapseDisposableWindows;
  }
  if ((overrideExisting || browser.debugPort === undefined) && browserProfile.debugPort !== undefined) {
    browser.debugPort = browserProfile.debugPort;
  }
  if (
    (overrideExisting || browser.debugPortStrategy === undefined) &&
    browserProfile.debugPortStrategy !== undefined
  ) {
    browser.debugPortStrategy = browserProfile.debugPortStrategy;
  }
  if ((overrideExisting || browser.remoteChrome === undefined) && browserProfile.remoteChrome !== undefined) {
    browser.remoteChrome = browserProfile.remoteChrome;
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
    browserProfile.wslChromePreference !== undefined
  ) {
    browser.wslChromePreference = browserProfile.wslChromePreference;
  }
}

function applyServiceDefaults(
  merged: MutableConfig,
  profile: Record<string, unknown>,
  browser: MutableBrowserConfig,
  options: { overrideExisting?: boolean } = {},
): void {
  const overrideExisting = options.overrideExisting ?? false;
  const { resolution } = resolveSelectedBrowserProfileResolution({
    merged,
    explicitProfileName: asNonEmptyString(merged.auracallProfile) ?? null,
    runtimeProfile: profile,
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

  const serviceId = resolution.serviceBinding.serviceId;
  if (!serviceId) {
    return;
  }
  const services = isRecord(merged.services) ? merged.services : {};
  const profileServices = isRecord(profile.services) ? profile.services : {};
  const serviceConfig = {
    ...(isRecord(services[serviceId]) ? services[serviceId] : {}),
    ...(isRecord(profileServices[serviceId]) ? profileServices[serviceId] : {}),
  };
  const projectId = asNonEmptyString(serviceConfig.projectId);
  const projectName = asNonEmptyString(serviceConfig.projectName);
  const conversationId = asNonEmptyString(serviceConfig.conversationId);
  const conversationName = asNonEmptyString(serviceConfig.conversationName);
  const model = asNonEmptyString(serviceConfig.model);
  const modelStrategy = asNonEmptyString(serviceConfig.modelStrategy);
  const thinkingTime = asNonEmptyString(serviceConfig.thinkingTime);
  const composerTool = asNonEmptyString(serviceConfig.composerTool);
  const manualLogin = typeof serviceConfig.manualLogin === 'boolean' ? serviceConfig.manualLogin : undefined;
  const manualLoginProfileDir = asNonEmptyString(serviceConfig.manualLoginProfileDir);

  if ((overrideExisting || browser.projectId === undefined) && projectId) {
    browser.projectId = projectId;
  }
  if ((overrideExisting || browser.projectName === undefined) && projectName) {
    browser.projectName = projectName;
  }
  if ((overrideExisting || browser.conversationId === undefined) && conversationId) {
    browser.conversationId = conversationId;
  }
  if ((overrideExisting || browser.conversationName === undefined) && conversationName) {
    browser.conversationName = conversationName;
  }
  if ((overrideExisting || !merged.model) && model && merged.engine === 'browser') {
    merged.model = model;
  }
  if ((overrideExisting || browser.modelStrategy === undefined) && modelStrategy) {
    browser.modelStrategy = modelStrategy;
  }
  if ((overrideExisting || browser.thinkingTime === undefined) && thinkingTime) {
    browser.thinkingTime = thinkingTime;
  }
  if ((overrideExisting || browser.composerTool === undefined) && composerTool) {
    browser.composerTool = composerTool;
  }
  if ((overrideExisting || browser.manualLogin === undefined) && manualLogin !== undefined) {
    browser.manualLogin = manualLogin;
  }
  if ((overrideExisting || browser.manualLoginProfileDir === undefined) && manualLoginProfileDir) {
    browser.manualLoginProfileDir = manualLoginProfileDir;
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
