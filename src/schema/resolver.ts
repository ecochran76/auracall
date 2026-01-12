import { ConfigSchema, type OracleConfig } from './types.js';
import { CLI_MAPPING } from './cli-map.js';
import { loadUserConfig } from '../config.js';
import type { OptionValues } from 'commander';
import { resolveApiModel, inferModelFromLabel, normalizeBaseUrl } from '../cli/options.js';
import { resolveEngine } from '../cli/engine.js';
import { resolveCookiePath, resolveProfileDirectoryName } from '../browser/service/profile.js';

type ServiceId = 'chatgpt' | 'gemini' | 'grok';

// Simple deep merge helper if needed
function deepSet(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  while (keys.length > 1) {
    const key = keys.shift()!;
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[0]] = value;
}

export async function resolveConfig(
  cliOptions: OptionValues,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<OracleConfig> {
  // 1. Load User/System/Project Config
  const loaded = await loadUserConfig(cwd);
  const fileConfig = loaded.config;

  // 2. Map CLI Options to Config Structure
  const cliConfig: any = {};
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
  const merged = mergeRecursively(fileConfig, cliConfig);
  applyOracleProfile(merged);

  // 4. Resolve Model and Engine Business Logic
  const cliModelArg = cliConfig.model || merged.model || 'gpt-5.2-pro';
  
  // Decide engine
  let engine = resolveEngine({
    engine: merged.engine,
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
    merged.apiBaseUrl ||
      (isClaude ? env.ANTHROPIC_BASE_URL : isGrok ? env.XAI_BASE_URL : env.OPENAI_BASE_URL),
  );

  // Update merged object with resolved values
  merged.model = inferredModel;
  merged.engine = engine;
  merged.apiBaseUrl = baseUrl;

  // 5. Validate and Default
  return ConfigSchema.parse(merged);
}

function mergeRecursively(target: any, source: any): any {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  if (typeof target !== 'object' || target === null) {
    return source;
  }
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Array) {
       result[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      result[key] = mergeRecursively(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function applyOracleProfile(merged: any): void {
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

  if (merged.engine === undefined && profile.engine !== undefined) {
    merged.engine = profile.engine;
  }
  if (merged.search === undefined && profile.search !== undefined) {
    merged.search = profile.search;
  }

  merged.browser = merged.browser ?? {};
  const browser = merged.browser;
  const profileBrowser = profile.browser ?? {};
  const defaultService = profile.defaultService ?? browser.target ?? merged.browser?.target ?? undefined;
  if (!browser.target && defaultService) {
    browser.target = defaultService;
  }
  if (profile.keepBrowser !== undefined && browser.keepBrowser === undefined) {
    browser.keepBrowser = profile.keepBrowser;
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

function resolveActiveProfileName(merged: any): string | null {
  const profiles = merged.oracleProfiles ?? null;
  if (!profiles || typeof profiles !== 'object') return null;
  const explicit = typeof merged.oracleProfile === 'string' ? merged.oracleProfile.trim() : '';
  if (explicit && profiles[explicit]) return explicit;
  if (profiles.default) return 'default';
  const keys = Object.keys(profiles);
  return keys.length ? keys[0] : null;
}

function applyBrowserProfileDefaults(browser: any, profileBrowser: any): void {
  if (browser.chromePath === undefined && profileBrowser.chromePath) {
    browser.chromePath = profileBrowser.chromePath;
  }
  if (browser.display === undefined && profileBrowser.display) {
    browser.display = profileBrowser.display;
  }
  if (browser.blockingProfileAction === undefined && profileBrowser.blockingProfileAction !== undefined) {
    browser.blockingProfileAction = profileBrowser.blockingProfileAction;
  }
  if (browser.chromeProfile === undefined && profileBrowser.profileName) {
    const profilePath = profileBrowser.profilePath ?? null;
    browser.chromeProfile = profilePath
      ? resolveProfileDirectoryName(profilePath, profileBrowser.profileName)
      : profileBrowser.profileName;
  }
  if (browser.chromeCookiePath === undefined) {
    const profilePath = profileBrowser.profilePath ?? null;
    const resolvedProfileName = profilePath && browser.chromeProfile
      ? resolveProfileDirectoryName(profilePath, browser.chromeProfile)
      : browser.chromeProfile;
    if (profileBrowser.cookiePath) {
      browser.chromeCookiePath = profileBrowser.cookiePath;
    } else if (profileBrowser.profilePath) {
      const profileName = resolvedProfileName ?? profileBrowser.profileName ?? browser.chromeProfile ?? 'Default';
      const resolvedCookie = resolveCookiePath(profileBrowser.profilePath, profileName);
      if (resolvedCookie) {
        browser.chromeCookiePath = resolvedCookie;
      }
    }
  }
  if (browser.manualLogin === undefined && profileBrowser.manualLogin !== undefined) {
    browser.manualLogin = profileBrowser.manualLogin;
  }
  if (browser.manualLoginProfileDir === undefined) {
    if (profileBrowser.manualLoginProfileDir) {
      browser.manualLoginProfileDir = profileBrowser.manualLoginProfileDir;
    } else if (profileBrowser.profilePath) {
      browser.manualLoginProfileDir = profileBrowser.profilePath;
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

function applyServiceDefaults(merged: any, profile: any, browser: any): void {
  const services = merged.services ?? {};
  const profileServices = profile.services ?? {};
  const target = browser.target as ServiceId | undefined;

  const resolveUrl = (service: ServiceId, fallback: string | null = null): string | null => {
    const profileUrl = profileServices?.[service]?.url;
    const globalUrl = services?.[service]?.url;
    return profileUrl ?? globalUrl ?? fallback;
  };

  const resolveServiceConfig = (service: ServiceId): Record<string, unknown> => ({
    ...(services?.[service] ?? {}),
    ...(profileServices?.[service] ?? {}),
  });

  browser.chatgptUrl = browser.chatgptUrl ?? resolveUrl('chatgpt', browser.chatgptUrl ?? null);
  browser.geminiUrl = browser.geminiUrl ?? resolveUrl('gemini', browser.geminiUrl ?? null);
  browser.grokUrl = browser.grokUrl ?? resolveUrl('grok', browser.grokUrl ?? null);

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
    merged.model = serviceConfig.model;
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

function applyCacheDefaults(browser: any, cache: any): void {
  if (!cache) return;
  browser.cache = browser.cache ?? {};
  const targetCache = browser.cache;
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
