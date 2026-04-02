import { resolveManagedProfileDir, resolveManagedProfileName } from '../profileStore.js';
import type { DebugPortStrategy, ResolvedBrowserConfig } from '../types.js';
import { resolveCookiePath, resolveProfileDirectoryName } from './profile.js';

type ServiceId = 'chatgpt' | 'gemini' | 'grok';
type MutableBrowserConfig = Record<string, unknown>;
type MutableConfig = Record<string, unknown>;

export interface ResolvedProfileCacheDefaults {
  store?: string;
  refresh?: boolean;
  includeHistory?: boolean;
  includeProjectOnlyConversations?: boolean;
  historyLimit?: number;
  historySince?: string;
  cleanupDays?: number;
  rootDir?: string;
}

export interface ResolvedProfileFamily {
  profileName: string | null;
  browserFamilyId: string | null;
  defaultService: ServiceId | null;
  keepBrowser?: boolean;
  cacheDefaults: ResolvedProfileCacheDefaults;
}

export interface ResolvedBrowserFamily {
  chromePath?: string;
  display?: string;
  managedProfileRoot?: string;
  sourceProfilePath?: string;
  sourceProfileName?: string;
  sourceCookiePath?: string;
  bootstrapCookiePath?: string;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy;
  debugPortRange?: [number, number];
  blockingProfileAction?: ResolvedBrowserConfig['blockingProfileAction'];
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  serviceTabLimit?: number;
  blankTabLimit?: number;
  collapseDisposableWindows?: boolean;
}

export interface ResolvedServiceBinding {
  serviceId: ServiceId | null;
  serviceUrl: string | null;
  urls: Partial<Record<ServiceId, string>>;
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  conversationName?: string;
  model?: string;
  modelStrategy?: string;
  thinkingTime?: string;
  composerTool?: string;
  manualLogin?: boolean;
  manualLoginProfileDir?: string;
}

export interface ResolvedBrowserLaunchProfile {
  target: ServiceId | null;
  targetUrl: string | null;
  chromePath?: string;
  display?: string;
  chromeProfile?: string;
  chromeCookiePath?: string;
  bootstrapCookiePath?: string;
  manualLoginProfileDir?: string;
  managedProfileRoot?: string;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy;
  blockingProfileAction?: ResolvedBrowserConfig['blockingProfileAction'];
  remoteChrome?: { host: string; port: number };
  headless?: boolean;
  hideWindow?: boolean;
  keepBrowser?: boolean;
  manualLogin?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  serviceTabLimit?: number;
  blankTabLimit?: number;
  collapseDisposableWindows?: boolean;
}

export interface ResolvedBrowserProfileResolution {
  profileFamily: ResolvedProfileFamily;
  browserFamily: ResolvedBrowserFamily;
  serviceBinding: ResolvedServiceBinding;
  launchProfile: ResolvedBrowserLaunchProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asDebugPortRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const first = asFiniteNumber(value[0]);
  const second = asFiniteNumber(value[1]);
  return first !== undefined && second !== undefined ? [first, second] : undefined;
}

function asDebugPortStrategy(value: unknown): DebugPortStrategy | undefined {
  return value === 'fixed' || value === 'auto' ? value : undefined;
}

function asBlockingProfileAction(
  value: unknown,
): ResolvedBrowserConfig['blockingProfileAction'] | undefined {
  return value === 'fail' || value === 'restart' || value === 'restart-managed' ? value : undefined;
}

function asWslPreference(value: unknown): 'auto' | 'wsl' | 'windows' | undefined {
  return value === 'auto' || value === 'wsl' || value === 'windows' ? value : undefined;
}

function asRemoteChrome(value: unknown): { host: string; port: number } | undefined {
  if (!isRecord(value)) return undefined;
  const host = asNonEmptyString(value.host);
  const port = asFiniteNumber(value.port);
  return host && port ? { host, port } : undefined;
}


export function resolveBrowserProfileResolutionFromResolvedConfig(input: {
  auracallProfile?: string | null;
  browser?: MutableBrowserConfig | null;
  target?: ServiceId | null;
}): ResolvedBrowserProfileResolution {
  const rawBrowser = isRecord(input.browser) ? input.browser : {};
  const target = input.target ?? (asNonEmptyString(rawBrowser.target) as ServiceId | undefined) ?? null;
  const manualLoginProfileDir =
    asNonEmptyString(rawBrowser.manualLoginProfileDir) ??
    (target
      ? resolveManagedProfileDir({
          managedProfileRoot: asNonEmptyString(rawBrowser.managedProfileRoot) ?? null,
          auracallProfileName: input.auracallProfile ?? 'default',
          target,
        })
      : undefined);
  const browser = {
    ...rawBrowser,
    ...(target ? { target } : {}),
    ...(manualLoginProfileDir ? { manualLoginProfileDir } : {}),
  };
  return resolveBrowserProfileResolution({
    merged: { browser },
    profileName: input.auracallProfile ?? null,
    profile: {},
    browser,
  });
}

export function resolveBrowserProfileResolution(input: {
  merged: MutableConfig;
  profileName: string | null;
  profile: Record<string, unknown>;
  browser: MutableBrowserConfig;
}): ResolvedBrowserProfileResolution {
  const { merged, profileName, profile, browser } = input;
  const profileBrowser = isRecord(profile.browser) ? profile.browser : {};
  const mergedBrowser = isRecord(merged.browser) ? merged.browser : {};
  const browserFamilies = isRecord(merged.browserFamilies) ? merged.browserFamilies : {};
  const browserFamilyId = asNonEmptyString(profile.browserFamily) ?? null;
  const selectedBrowserFamily =
    browserFamilyId && isRecord(browserFamilies[browserFamilyId])
      ? (browserFamilies[browserFamilyId] as Record<string, unknown>)
      : {};
  const effectiveProfileBrowser = {
    ...selectedBrowserFamily,
    ...profileBrowser,
  };
  const services = isRecord(merged.services) ? merged.services : {};
  const profileServices = isRecord(profile.services) ? profile.services : {};

  const defaultServiceRaw =
    asNonEmptyString(browser.target) ??
    asNonEmptyString(mergedBrowser.target) ??
    asNonEmptyString(profile.defaultService);
  const defaultService =
    defaultServiceRaw === 'chatgpt' || defaultServiceRaw === 'gemini' || defaultServiceRaw === 'grok'
      ? defaultServiceRaw
      : null;

  const sourceProfilePath = asNonEmptyString(effectiveProfileBrowser.profilePath);
  const sourceProfileNameCandidate =
    asNonEmptyString(effectiveProfileBrowser.profileName) ?? asNonEmptyString(effectiveProfileBrowser.chromeProfile);
  const currentChromeProfile = asNonEmptyString(browser.chromeProfile);
  const sourceProfileName =
    sourceProfilePath && currentChromeProfile
      ? resolveProfileDirectoryName(sourceProfilePath, currentChromeProfile)
      : currentChromeProfile ?? sourceProfileNameCandidate;
  const sourceCookiePath =
    asNonEmptyString(effectiveProfileBrowser.cookiePath) ??
    asNonEmptyString(effectiveProfileBrowser.chromeCookiePath) ??
    (sourceProfilePath
      ? resolveCookiePath(sourceProfilePath, sourceProfileName ?? sourceProfileNameCandidate ?? currentChromeProfile ?? 'Default')
      : undefined);
  const bootstrapCookiePath =
    asNonEmptyString(effectiveProfileBrowser.bootstrapCookiePath) ?? sourceCookiePath;

  const resolveUrl = (service: ServiceId): string | undefined => {
    const profileConfig = isRecord(profileServices[service]) ? profileServices[service] : {};
    const globalConfig = isRecord(services[service]) ? services[service] : {};
    return asNonEmptyString(profileConfig.url) ?? asNonEmptyString(globalConfig.url);
  };

  const resolveServiceConfig = (service: ServiceId): Record<string, unknown> => ({
    ...(isRecord(services[service]) ? services[service] : {}),
    ...(isRecord(profileServices[service]) ? profileServices[service] : {}),
  });

  const serviceConfig = defaultService ? resolveServiceConfig(defaultService) : {};
  const serviceUrl = defaultService ? resolveUrl(defaultService) ?? null : null;

  const cache = isRecord(profile.cache) ? profile.cache : {};
  const cacheDefaults: ResolvedProfileCacheDefaults = {
    store: asNonEmptyString(cache.store),
    refresh: asBoolean(cache.refresh),
    includeHistory: asBoolean(cache.includeHistory),
    includeProjectOnlyConversations: asBoolean(cache.includeProjectOnlyConversations),
    historyLimit: asFiniteNumber(cache.historyLimit),
    historySince: asNonEmptyString(cache.historySince),
    cleanupDays: asFiniteNumber(cache.cleanupDays),
    rootDir: asNonEmptyString(cache.rootDir),
  };

  const profileFamily: ResolvedProfileFamily = {
    profileName,
    browserFamilyId,
    defaultService,
    keepBrowser: asBoolean(profile.keepBrowser),
    cacheDefaults,
  };

  const browserFamily: ResolvedBrowserFamily = {
    chromePath: asNonEmptyString(effectiveProfileBrowser.chromePath),
    display: asNonEmptyString(effectiveProfileBrowser.display),
    managedProfileRoot: asNonEmptyString(effectiveProfileBrowser.managedProfileRoot),
    sourceProfilePath,
    sourceProfileName,
    sourceCookiePath,
    bootstrapCookiePath,
    debugPort: asFiniteNumber(effectiveProfileBrowser.debugPort),
    debugPortStrategy: asDebugPortStrategy(effectiveProfileBrowser.debugPortStrategy),
    debugPortRange: asDebugPortRange(effectiveProfileBrowser.debugPortRange),
    blockingProfileAction: asBlockingProfileAction(effectiveProfileBrowser.blockingProfileAction),
    wslChromePreference: asWslPreference(effectiveProfileBrowser.wslChromePreference),
    serviceTabLimit: asFiniteNumber(effectiveProfileBrowser.serviceTabLimit),
    blankTabLimit: asFiniteNumber(effectiveProfileBrowser.blankTabLimit),
    collapseDisposableWindows: asBoolean(effectiveProfileBrowser.collapseDisposableWindows),
  };

  const serviceBinding: ResolvedServiceBinding = {
    serviceId: defaultService,
    serviceUrl,
    urls: {
      chatgpt: resolveUrl('chatgpt'),
      gemini: resolveUrl('gemini'),
      grok: resolveUrl('grok'),
    },
    projectId: asNonEmptyString(browser.projectId) ?? asNonEmptyString(serviceConfig.projectId),
    projectName: asNonEmptyString(browser.projectName) ?? asNonEmptyString(serviceConfig.projectName),
    conversationId: asNonEmptyString(browser.conversationId) ?? asNonEmptyString(serviceConfig.conversationId),
    conversationName: asNonEmptyString(browser.conversationName) ?? asNonEmptyString(serviceConfig.conversationName),
    model: asNonEmptyString(merged.model) ?? asNonEmptyString(serviceConfig.model),
    modelStrategy: asNonEmptyString(browser.modelStrategy) ?? asNonEmptyString(serviceConfig.modelStrategy),
    thinkingTime: asNonEmptyString(browser.thinkingTime) ?? asNonEmptyString(serviceConfig.thinkingTime),
    composerTool: asNonEmptyString(browser.composerTool) ?? asNonEmptyString(serviceConfig.composerTool),
    manualLogin: asBoolean(browser.manualLogin) ?? asBoolean(serviceConfig.manualLogin),
    manualLoginProfileDir:
      asNonEmptyString(browser.manualLoginProfileDir) ?? asNonEmptyString(serviceConfig.manualLoginProfileDir),
  };

  const configuredLaunchProfileName = asNonEmptyString(browser.chromeProfile) ?? browserFamily.sourceProfileName;
  const effectiveLaunchProfileName =
    serviceBinding.manualLoginProfileDir && configuredLaunchProfileName
      ? resolveManagedProfileName(serviceBinding.manualLoginProfileDir, configuredLaunchProfileName)
      : configuredLaunchProfileName;

  const launchProfile: ResolvedBrowserLaunchProfile = {
    target: defaultService,
    targetUrl: serviceUrl,
    chromePath: asNonEmptyString(browser.chromePath) ?? browserFamily.chromePath,
    display: asNonEmptyString(browser.display) ?? browserFamily.display,
    chromeProfile: effectiveLaunchProfileName,
    chromeCookiePath: asNonEmptyString(browser.chromeCookiePath) ?? browserFamily.sourceCookiePath,
    bootstrapCookiePath: asNonEmptyString(browser.bootstrapCookiePath) ?? browserFamily.bootstrapCookiePath,
    manualLoginProfileDir: serviceBinding.manualLoginProfileDir,
    managedProfileRoot: asNonEmptyString(browser.managedProfileRoot) ?? browserFamily.managedProfileRoot,
    debugPort: asFiniteNumber(browser.debugPort) ?? browserFamily.debugPort,
    debugPortStrategy: asDebugPortStrategy(browser.debugPortStrategy) ?? browserFamily.debugPortStrategy,
    blockingProfileAction:
      asBlockingProfileAction(browser.blockingProfileAction) ?? browserFamily.blockingProfileAction,
    remoteChrome: asRemoteChrome(browser.remoteChrome),
    headless: asBoolean(browser.headless),
    hideWindow: asBoolean(browser.hideWindow),
    keepBrowser: asBoolean(browser.keepBrowser) ?? profileFamily.keepBrowser,
    manualLogin: asBoolean(browser.manualLogin) ?? serviceBinding.manualLogin,
    wslChromePreference: asWslPreference(browser.wslChromePreference) ?? browserFamily.wslChromePreference,
    serviceTabLimit: asFiniteNumber(browser.serviceTabLimit) ?? browserFamily.serviceTabLimit,
    blankTabLimit: asFiniteNumber(browser.blankTabLimit) ?? browserFamily.blankTabLimit,
    collapseDisposableWindows:
      asBoolean(browser.collapseDisposableWindows) ?? browserFamily.collapseDisposableWindows,
  };

  return {
    profileFamily,
    browserFamily,
    serviceBinding,
    launchProfile,
  };
}
