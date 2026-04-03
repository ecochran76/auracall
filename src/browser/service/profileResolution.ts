import {
  resolveBootstrapSourceCookiePath,
  resolveManagedProfileDir,
  resolveManagedProfileName,
} from '../profileStore.js';
import type { DebugPortStrategy, ResolvedBrowserConfig } from '../types.js';
import type { BrowserSessionConfig } from '../types.js';
import {
  getRuntimeProfileBrowserProfile,
  getRuntimeProfileBrowserProfileId,
  resolveRuntimeSelection,
  type ResolvedRuntimeSelection,
} from '../../config/model.js';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserConfig } from '../config.js';
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
  browserProfileId: string | null;
  defaultService: ServiceId | null;
  keepBrowser?: boolean;
  cacheDefaults: ResolvedProfileCacheDefaults;
}

export interface ResolvedBrowserProfile {
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
  browserProfile: ResolvedBrowserProfile;
  serviceBinding: ResolvedServiceBinding;
  launchProfile: ResolvedBrowserLaunchProfile;
}

export interface ResolvedUserBrowserLaunchContext {
  resolvedConfig: ResolvedBrowserConfig;
  resolution: ResolvedBrowserProfileResolution;
  launchProfile: ResolvedBrowserLaunchProfile;
}

export interface ResolvedManagedBrowserLaunchContext {
  resolution: ResolvedBrowserProfileResolution;
  launchProfile: ResolvedBrowserLaunchProfile;
  managedProfileDir: string;
  userDataDir: string;
  defaultManagedProfileDir: string;
  configuredChromeProfile: string;
  chromeProfile: string;
  managedChromeProfile: string;
  bootstrapCookiePath: string | null;
}

export interface ResolvedSessionBrowserLaunchContext {
  resolvedConfig: ResolvedBrowserConfig;
  managedLaunchContext: ResolvedManagedBrowserLaunchContext;
}

export interface ResolvedSelectedBrowserProfileResolution {
  runtimeSelection: ResolvedRuntimeSelection;
  resolution: ResolvedBrowserProfileResolution;
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

export function resolveUserBrowserLaunchContext(
  userConfig: Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'>,
  target: ServiceId,
): ResolvedUserBrowserLaunchContext {
  const resolvedConfig = resolveBrowserConfig({
    ...(userConfig.browser ?? {}),
    target,
  }, { auracallProfileName: userConfig.auracallProfile ?? null });
  const resolution = resolveBrowserProfileResolutionFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browser: resolvedConfig,
    target,
  });
  return {
    resolvedConfig,
    resolution,
    launchProfile: resolution.launchProfile,
  };
}

export function resolveManagedBrowserLaunchContextFromResolvedConfig(input: {
  auracallProfile?: string | null;
  browser?: MutableBrowserConfig | null;
  target?: ServiceId | null;
}): ResolvedManagedBrowserLaunchContext {
  const rawBrowser = isRecord(input.browser) ? input.browser : {};
  const target = input.target ?? (asNonEmptyString(rawBrowser.target) as ServiceId | undefined) ?? 'chatgpt';
  const resolution = resolveBrowserProfileResolutionFromResolvedConfig({
    auracallProfile: input.auracallProfile ?? null,
    browser: rawBrowser,
    target,
  });
  const launchProfile = resolution.launchProfile;
  const configuredChromeProfile =
    launchProfile.chromeProfile ?? asNonEmptyString(rawBrowser.chromeProfile) ?? 'Default';
  const managedProfileDir = resolveManagedProfileDir({
    configuredDir:
      launchProfile.manualLoginProfileDir ?? asNonEmptyString(rawBrowser.manualLoginProfileDir) ?? null,
    managedProfileRoot:
      launchProfile.managedProfileRoot ?? asNonEmptyString(rawBrowser.managedProfileRoot) ?? null,
    auracallProfileName: input.auracallProfile ?? 'default',
    target,
  });
  const defaultManagedProfileDir = resolveManagedProfileDir({
    configuredDir: null,
    managedProfileRoot:
      launchProfile.managedProfileRoot ?? asNonEmptyString(rawBrowser.managedProfileRoot) ?? null,
    auracallProfileName: input.auracallProfile ?? 'default',
    target,
  });
  const managedChromeProfile = resolveManagedProfileName(managedProfileDir, configuredChromeProfile);
  const bootstrapCookiePath = resolveBootstrapSourceCookiePath({
    configuredCookiePath:
      launchProfile.bootstrapCookiePath ??
      launchProfile.chromeCookiePath ??
      asNonEmptyString(rawBrowser.bootstrapCookiePath) ??
      asNonEmptyString(rawBrowser.chromeCookiePath) ??
      null,
    managedProfileDir,
    managedProfileName: managedChromeProfile,
  });
  return {
    resolution,
    launchProfile,
    managedProfileDir,
    userDataDir: managedProfileDir,
    defaultManagedProfileDir,
    configuredChromeProfile,
    chromeProfile: configuredChromeProfile,
    managedChromeProfile,
    bootstrapCookiePath,
  };
}

export function resolveSessionBrowserLaunchContext(
  sessionConfig: BrowserSessionConfig | undefined,
): ResolvedSessionBrowserLaunchContext {
  const resolvedConfig = resolveBrowserConfig(sessionConfig ?? {}, {
    auracallProfileName: sessionConfig?.auracallProfileName ?? null,
  });
  const managedLaunchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: sessionConfig?.auracallProfileName ?? null,
    browser: resolvedConfig,
    target: resolvedConfig.target ?? 'chatgpt',
  });
  return {
    resolvedConfig,
    managedLaunchContext,
  };
}

export function resolveSelectedBrowserProfileResolution(input: {
  merged: MutableConfig;
  browser: MutableBrowserConfig;
  explicitProfileName?: string | null;
  explicitAgentId?: string | null;
  runtimeProfile?: Record<string, unknown> | null;
}): ResolvedSelectedBrowserProfileResolution {
  const runtimeSelection = resolveRuntimeSelection(input.merged, {
    explicitProfileName: input.explicitProfileName ?? null,
    explicitAgentId: input.explicitAgentId ?? null,
  });
  const runtimeProfile =
    (isRecord(input.runtimeProfile) ? input.runtimeProfile : null) ?? runtimeSelection.runtimeProfile ?? {};
  const resolution = resolveBrowserProfileResolution({
    merged: input.merged,
    profileName: input.explicitProfileName ?? runtimeSelection.runtimeProfileId,
    profile: runtimeProfile,
    browser: input.browser,
  });
  return {
    runtimeSelection,
    resolution,
  };
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
  const browserProfileId = getRuntimeProfileBrowserProfileId(profile);
  const selectedBrowserProfile = getRuntimeProfileBrowserProfile(merged, profile) ?? {};
  const effectiveProfileBrowser = {
    ...selectedBrowserProfile,
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
    browserProfileId,
    defaultService,
    keepBrowser: asBoolean(profile.keepBrowser),
    cacheDefaults,
  };

  const browserProfile: ResolvedBrowserProfile = {
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

  const configuredLaunchProfileName = asNonEmptyString(browser.chromeProfile) ?? browserProfile.sourceProfileName;
  const effectiveLaunchProfileName =
    serviceBinding.manualLoginProfileDir && configuredLaunchProfileName
      ? resolveManagedProfileName(serviceBinding.manualLoginProfileDir, configuredLaunchProfileName)
      : configuredLaunchProfileName;

  const launchProfile: ResolvedBrowserLaunchProfile = {
    target: defaultService,
    targetUrl: serviceUrl,
    chromePath: asNonEmptyString(browser.chromePath) ?? browserProfile.chromePath,
    display: asNonEmptyString(browser.display) ?? browserProfile.display,
    chromeProfile: effectiveLaunchProfileName,
    chromeCookiePath: asNonEmptyString(browser.chromeCookiePath) ?? browserProfile.sourceCookiePath,
    bootstrapCookiePath: asNonEmptyString(browser.bootstrapCookiePath) ?? browserProfile.bootstrapCookiePath,
    manualLoginProfileDir: serviceBinding.manualLoginProfileDir,
    managedProfileRoot: asNonEmptyString(browser.managedProfileRoot) ?? browserProfile.managedProfileRoot,
    debugPort: asFiniteNumber(browser.debugPort) ?? browserProfile.debugPort,
    debugPortStrategy: asDebugPortStrategy(browser.debugPortStrategy) ?? browserProfile.debugPortStrategy,
    blockingProfileAction:
      asBlockingProfileAction(browser.blockingProfileAction) ?? browserProfile.blockingProfileAction,
    remoteChrome: asRemoteChrome(browser.remoteChrome),
    headless: asBoolean(browser.headless),
    hideWindow: asBoolean(browser.hideWindow),
    keepBrowser: asBoolean(browser.keepBrowser) ?? profileFamily.keepBrowser,
    manualLogin: asBoolean(browser.manualLogin) ?? serviceBinding.manualLogin,
    wslChromePreference: asWslPreference(browser.wslChromePreference) ?? browserProfile.wslChromePreference,
    serviceTabLimit: asFiniteNumber(browser.serviceTabLimit) ?? browserProfile.serviceTabLimit,
    blankTabLimit: asFiniteNumber(browser.blankTabLimit) ?? browserProfile.blankTabLimit,
    collapseDisposableWindows:
      asBoolean(browser.collapseDisposableWindows) ?? browserProfile.collapseDisposableWindows,
  };

  return {
    profileFamily,
    browserProfile,
    serviceBinding,
    launchProfile,
  };
}
