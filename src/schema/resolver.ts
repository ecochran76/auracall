import { ConfigSchema, type OracleConfig } from '../config/schema.js';
import { CLI_MAPPING } from './cli-map.js';
import { loadUserConfig } from '../config.js';
import type { OptionValues } from 'commander';
import { resolveApiModel, inferModelFromLabel, normalizeBaseUrl } from '../cli/options.js';
import { resolveEngine, type EngineMode } from '../cli/engine.js';
import { resolveCookiePath, resolveProfileDirectoryName } from '../browser/service/profile.js';
import { normalizeConfigV1toV2 } from '../config/migrate.js';

type ServiceId = 'chatgpt' | 'gemini' | 'grok';

type MutableBrowserConfig = Record<string, unknown>;
type MutableConfig = Record<string, unknown> & {
  browser?: MutableBrowserConfig;
  dev?: { browserPortRange?: [number, number] };
  engine?: string;
  search?: unknown;
  oracleProfile?: string;
  oracleProfiles?: Record<string, unknown>;
  model?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Simple deep merge helper if needed
function deepSet(obj: MutableConfig, path: string, value: unknown) {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  while (keys.length > 1) {
    const key = keys.shift();
    if (!key) {
      return;
    }
    if (!isRecord(current[key])) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const leaf = keys[0];
  if (!leaf) {
    return;
  }
  current[leaf] = value;
}

export async function resolveConfig(
  cliOptions: OptionValues,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  options: { aliasRules?: import('../config/migrate.js').ConfigAliasRule[] } = {},
): Promise<OracleConfig> {
  // 1. Load User/System/Project Config
  const loaded = await loadUserConfig(cwd);
  const fileConfig = loaded.config;

  // 2. Map CLI Options to Config Structure
  const cliConfig: MutableConfig = {};
  for (const [flag, value] of Object.entries(cliOptions)) {
    if (value === undefined) continue;
    const mapPath = CLI_MAPPING[flag];
    if (mapPath) {
      deepSet(cliConfig, mapPath, value);
    }
  }

  // Handle shorthands
  if (cliOptions.chatgpt) {
    deepSet(cliConfig, 'browser.target', 'chatgpt');
    if (!cliConfig.model) cliConfig.model = 'gpt-5.2';
    cliConfig.engine = 'browser';
  }
  if (cliOptions.gemini) {
    deepSet(cliConfig, 'browser.target', 'gemini');
    if (!cliConfig.model) cliConfig.model = 'gemini-3-pro';
    cliConfig.engine = 'browser';
  }

  // 3. Merge (CLI overrides File)
  const merged = mergeRecursively(fileConfig as MutableConfig, cliConfig);
  const normalized = normalizeConfigV1toV2(merged as OracleConfig, {
    aliasRules: options.aliasRules,
  }) as MutableConfig;
  applyOracleProfile(normalized);

  // 4. Resolve Model and Engine Business Logic
  const cliModelArg = cliConfig.model || normalized.model || 'gpt-5.2-pro';
  
  // Decide engine
  let engine = resolveEngine({
    engine: (typeof normalized.engine === 'string' ? (normalized.engine as EngineMode) : undefined),
    browserFlag: cliOptions.browser,
    env,
  });

  const inferredModel = (engine === 'browser') ? inferModelFromLabel(cliModelArg) : resolveApiModel(cliModelArg);
  
  // Engine coercion
  const isClaude = inferredModel.startsWith('claude');
  const isCodex = inferredModel.startsWith('gpt-5.1-codex');
  const isGrok = inferredModel.startsWith('grok');
  const multiModelProvided = Array.isArray(cliOptions.models) && cliOptions.models.length > 0;

  if ((isClaude || isCodex || multiModelProvided) && engine === 'browser') {
    engine = 'api';
  }

  // Resolve Base URL
  const baseUrl = normalizeBaseUrl(
    asNonEmptyString(normalized.apiBaseUrl) ??
      (isClaude ? env.ANTHROPIC_BASE_URL : isGrok ? env.XAI_BASE_URL : env.OPENAI_BASE_URL),
  );

  // Update merged object with resolved values
  normalized.model = inferredModel;
  normalized.engine = engine;
  normalized.apiBaseUrl = baseUrl;

  // 5. Validate and Default
  return ConfigSchema.parse(normalized);
}

function mergeRecursively(target: MutableConfig, source: MutableConfig): MutableConfig {
  if (!isRecord(source)) {
    return source as MutableConfig;
  }
  if (!isRecord(target)) {
    return source;
  }
  
  const result: MutableConfig = { ...target };
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
       result[key] = source[key];
    } else if (isRecord(source[key])) {
      result[key] = mergeRecursively(
        (isRecord(target[key]) ? (target[key] as MutableConfig) : ({} as MutableConfig)),
        source[key] as MutableConfig,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function applyOracleProfile(merged: MutableConfig): void {
  const profiles = merged.oracleProfiles ?? null;
  if (!profiles || typeof profiles !== 'object') {
    return;
  }
  const profileName = resolveActiveProfileName(merged);
  if (!profileName || !profiles[profileName]) {
    return;
  }
  merged.oracleProfile = profileName;
  const profile = profiles[profileName];
  if (!isRecord(profile)) {
    return;
  }

  if (merged.engine === undefined && profile.engine !== undefined) {
    merged.engine = profile.engine as string;
  }
  if (merged.search === undefined && profile.search !== undefined) {
    merged.search = profile.search;
  }

  merged.browser = merged.browser ?? {};
  const browser = merged.browser;
  const profileBrowser = (profile.browser ?? {}) as Record<string, unknown>;
  const defaultService =
    asNonEmptyString(profile.defaultService) ??
    asNonEmptyString(browser.target) ??
    asNonEmptyString(merged.browser?.target);
  if (!browser.target && defaultService) {
    browser.target = defaultService;
  }
  if (profile.keepBrowser !== undefined && browser.keepBrowser === undefined) {
    browser.keepBrowser = profile.keepBrowser as boolean;
  }
  const devRange = merged.dev?.browserPortRange;
  if (browser.debugPortRange === undefined && profileBrowser.debugPortRange !== undefined) {
    browser.debugPortRange = profileBrowser.debugPortRange;
  } else if (browser.debugPortRange === undefined && devRange !== undefined) {
    browser.debugPortRange = devRange;
  }

  applyBrowserProfileDefaults(browser, profileBrowser);
  applyServiceDefaults(merged, profile, browser);
  applyCacheDefaults(browser, profile.cache ?? null);
}

function resolveActiveProfileName(merged: MutableConfig): string | null {
  const profiles = merged.oracleProfiles ?? null;
  if (!profiles || typeof profiles !== 'object') return null;
  const explicit = typeof merged.oracleProfile === 'string' ? merged.oracleProfile.trim() : '';
  if (explicit && profiles[explicit]) return explicit;
  if (profiles.default) return 'default';
  const keys = Object.keys(profiles);
  return keys.length ? keys[0] : null;
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
