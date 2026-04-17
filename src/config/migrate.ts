import type { OracleConfig } from './schema.js';
import { resolveManagedProfileDir } from '../browser/profileStore.js';
import path from 'node:path';
import {
  getCurrentRuntimeProfiles,
  ensureRuntimeProfiles,
  getRuntimeProfileBrowserProfileId,
  getRuntimeProfiles,
  setRuntimeProfileBrowserProfile,
} from './model.js';

type MutableConfig = Record<string, unknown>;

export type ConfigAliasRule = {
  path: string;
  from: string;
  to: string;
  map?: (value: unknown) => unknown;
};

const KNOWN_SERVICES = new Set(['chatgpt', 'gemini', 'grok']);
const KNOWN_SERVICE_IDS = ['chatgpt', 'gemini', 'grok'] as const;
const RUNTIME_BROWSER_OWNED_OVERRIDE_KEYS = new Set([
  'chromePath',
  'display',
  'managedProfileRoot',
  'sourceProfilePath',
  'sourceProfileName',
  'sourceCookiePath',
  'bootstrapCookiePath',
  'debugPort',
  'debugPortStrategy',
  'debugPortRange',
  'blockingProfileAction',
  'wslChromePreference',
  'serviceTabLimit',
  'blankTabLimit',
  'collapseDisposableWindows',
  'headless',
  'hideWindow',
  'remoteChrome',
]);
const RUNTIME_SERVICE_SCOPED_OVERRIDE_KEYS = new Set([
  'modelStrategy',
  'thinkingTime',
  'composerTool',
]);

const mapProfileConflictAction = (value: unknown): unknown => {
  if (value === 'terminate-existing') return 'restart';
  if (value === 'attach-existing') return 'fail';
  return value;
};

const DEFAULT_ALIAS_RULES: ConfigAliasRule[] = [
  { path: 'browser', from: 'profileConflictAction', to: 'blockingProfileAction', map: mapProfileConflictAction },
  { path: 'browserDefaults', from: 'profileConflictAction', to: 'blockingProfileAction', map: mapProfileConflictAction },
  { path: 'profiles.*.browser', from: 'profileConflictAction', to: 'blockingProfileAction', map: mapProfileConflictAction },
  { path: 'runtimeProfiles.*.browser', from: 'profileConflictAction', to: 'blockingProfileAction', map: mapProfileConflictAction },
  { path: 'browser', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'browserDefaults', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'profiles.*.browser', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'runtimeProfiles.*.browser', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'services.*', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'profiles.*.services.*', from: 'interactiveLogin', to: 'manualLogin' },
  { path: 'runtimeProfiles.*.services.*', from: 'interactiveLogin', to: 'manualLogin' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergeRecords(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  return { ...base, ...overlay };
}

function valuesEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeRuntimeProfileBrowserOwnedOverrides(options: {
  browserProfiles: Record<string, unknown>;
  runtimeProfiles: Record<string, unknown>;
}): void {
  for (const runtimeProfileValue of Object.values(options.runtimeProfiles)) {
    if (!isRecord(runtimeProfileValue)) continue;
    const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfileValue);
    if (!browserProfileId) continue;
    const browserProfileValue = options.browserProfiles[browserProfileId];
    if (!isRecord(browserProfileValue)) continue;

    const browserOverrides = isRecord(runtimeProfileValue.browser) ? runtimeProfileValue.browser : null;
    if (browserOverrides) {
      for (const [key, value] of Object.entries(browserOverrides)) {
        if (!RUNTIME_BROWSER_OWNED_OVERRIDE_KEYS.has(key)) continue;
        if (browserProfileValue[key] === undefined) {
          browserProfileValue[key] = value;
        }
        if (valuesEquivalent(browserProfileValue[key], value)) {
          delete browserOverrides[key];
        }
      }
      if (Object.keys(browserOverrides).length === 0) {
        delete runtimeProfileValue.browser;
      }
    }

    if (runtimeProfileValue.keepBrowser !== undefined && browserProfileValue.keepBrowser === undefined) {
      browserProfileValue.keepBrowser = runtimeProfileValue.keepBrowser;
    }
    if (
      runtimeProfileValue.keepBrowser !== undefined &&
      browserProfileValue.keepBrowser === runtimeProfileValue.keepBrowser
    ) {
      delete runtimeProfileValue.keepBrowser;
    }
  }
}

function normalizeRuntimeProfileServiceScopedOverrides(runtimeProfiles: Record<string, unknown>): void {
  for (const runtimeProfileValue of Object.values(runtimeProfiles)) {
    if (!isRecord(runtimeProfileValue)) continue;
    const defaultService = asString(runtimeProfileValue.defaultService);
    if (!defaultService || !KNOWN_SERVICES.has(defaultService)) continue;

    const browserOverrides = isRecord(runtimeProfileValue.browser) ? runtimeProfileValue.browser : null;
    if (!browserOverrides) continue;

    const runtimeServices = isRecord(runtimeProfileValue.services) ? runtimeProfileValue.services : {};
    const serviceConfig = isRecord(runtimeServices[defaultService])
      ? (runtimeServices[defaultService] as Record<string, unknown>)
      : {};

    for (const [key, value] of Object.entries(browserOverrides)) {
      if (!RUNTIME_SERVICE_SCOPED_OVERRIDE_KEYS.has(key)) continue;
      if (serviceConfig[key] === undefined) {
        serviceConfig[key] = value;
      }
      if (valuesEquivalent(serviceConfig[key], value)) {
        delete browserOverrides[key];
      }
    }

    if (Object.keys(serviceConfig).length > 0) {
      runtimeServices[defaultService] = serviceConfig;
      runtimeProfileValue.services = runtimeServices;
    }
    if (Object.keys(browserOverrides).length === 0) {
      delete runtimeProfileValue.browser;
    }
  }
}

function normalizeRedundantManagedProfileDirOverrides(options: {
  config: MutableConfig;
  browserProfiles: Record<string, unknown>;
  runtimeProfiles: Record<string, unknown>;
}): void {
  const globalBrowser = isRecord(options.config.browser) ? options.config.browser : {};
  for (const [runtimeProfileName, runtimeProfileValue] of Object.entries(options.runtimeProfiles)) {
    if (!isRecord(runtimeProfileValue)) continue;

    const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfileValue);
    const browserProfileValue =
      browserProfileId && isRecord(options.browserProfiles[browserProfileId]) ? options.browserProfiles[browserProfileId] : null;
    const browserOverrides = isRecord(runtimeProfileValue.browser) ? runtimeProfileValue.browser : null;
    const managedProfileRoot =
      (browserOverrides && typeof browserOverrides.managedProfileRoot === 'string' && browserOverrides.managedProfileRoot.trim().length > 0
        ? browserOverrides.managedProfileRoot.trim()
        : null) ??
      (browserProfileValue &&
      typeof browserProfileValue.managedProfileRoot === 'string' &&
      browserProfileValue.managedProfileRoot.trim().length > 0
        ? browserProfileValue.managedProfileRoot.trim()
        : null) ??
      (typeof globalBrowser.managedProfileRoot === 'string' && globalBrowser.managedProfileRoot.trim().length > 0
        ? globalBrowser.managedProfileRoot.trim()
        : null);

    const defaultService = asString(runtimeProfileValue.defaultService);
    const defaultServiceId =
      defaultService === 'chatgpt' || defaultService === 'gemini' || defaultService === 'grok' ? defaultService : null;
    const runtimeBrowserManualLoginProfileDir =
      browserOverrides &&
      typeof browserOverrides.manualLoginProfileDir === 'string' &&
      browserOverrides.manualLoginProfileDir.trim().length > 0
        ? browserOverrides.manualLoginProfileDir.trim()
        : null;
    if (browserOverrides && runtimeBrowserManualLoginProfileDir && defaultServiceId) {
      const expected = resolveManagedProfileDir({
        configuredDir: null,
        managedProfileRoot,
        auracallProfileName: runtimeProfileName,
        target: defaultServiceId,
      });
      if (path.resolve(runtimeBrowserManualLoginProfileDir) === path.resolve(expected)) {
        delete browserOverrides.manualLoginProfileDir;
      }
    }

    const runtimeServices = isRecord(runtimeProfileValue.services) ? runtimeProfileValue.services : null;
    if (runtimeServices) {
      for (const serviceId of KNOWN_SERVICE_IDS) {
        const serviceConfig = isRecord(runtimeServices[serviceId]) ? runtimeServices[serviceId] : null;
        if (!serviceConfig) continue;
        const manualLoginProfileDir =
          typeof serviceConfig.manualLoginProfileDir === 'string' && serviceConfig.manualLoginProfileDir.trim().length > 0
            ? serviceConfig.manualLoginProfileDir.trim()
            : null;
        if (!manualLoginProfileDir) continue;
        const expected = resolveManagedProfileDir({
          configuredDir: null,
          managedProfileRoot,
          auracallProfileName: runtimeProfileName,
          target: serviceId,
        });
        if (path.resolve(manualLoginProfileDir) === path.resolve(expected)) {
          delete serviceConfig.manualLoginProfileDir;
        }
      }
    }

    if (browserOverrides && Object.keys(browserOverrides).length === 0) {
      delete runtimeProfileValue.browser;
    }
  }
}

function normalizeRedundantRuntimeProfileServiceDefaults(config: MutableConfig, runtimeProfiles: Record<string, unknown>): void {
  const globalServices = isRecord(config.services) ? (config.services as Record<string, unknown>) : {};
  for (const runtimeProfileValue of Object.values(runtimeProfiles)) {
    if (!isRecord(runtimeProfileValue)) continue;
    const runtimeServices = isRecord(runtimeProfileValue.services) ? runtimeProfileValue.services : null;
    if (!runtimeServices) continue;

    for (const serviceId of KNOWN_SERVICE_IDS) {
      const globalService = isRecord(globalServices[serviceId]) ? (globalServices[serviceId] as Record<string, unknown>) : null;
      const runtimeService = isRecord(runtimeServices[serviceId]) ? (runtimeServices[serviceId] as Record<string, unknown>) : null;
      if (!globalService || !runtimeService) continue;

      for (const key of RUNTIME_SERVICE_SCOPED_OVERRIDE_KEYS) {
        if (runtimeService[key] === undefined || globalService[key] === undefined) continue;
        if (valuesEquivalent(runtimeService[key], globalService[key])) {
          delete runtimeService[key];
        }
      }
    }
  }
}

function pruneEmptyRuntimeProfileServices(runtimeProfiles: Record<string, unknown>): void {
  for (const runtimeProfileValue of Object.values(runtimeProfiles)) {
    if (!isRecord(runtimeProfileValue)) continue;
    const runtimeServices = isRecord(runtimeProfileValue.services) ? runtimeProfileValue.services : null;
    if (!runtimeServices) continue;
    for (const serviceId of KNOWN_SERVICE_IDS) {
      const serviceConfig = isRecord(runtimeServices[serviceId]) ? runtimeServices[serviceId] : null;
      if (serviceConfig && Object.keys(serviceConfig).length === 0) {
        delete runtimeServices[serviceId];
      }
    }
    if (Object.keys(runtimeServices).length === 0) {
      delete runtimeProfileValue.services;
    }
  }
}

function applyAliasRule(config: MutableConfig, rule: ConfigAliasRule): void {
  const segments = rule.path.split('.');
  const walk = (node: unknown, index: number): void => {
    if (!isRecord(node)) return;
    if (index >= segments.length) {
      if (node[rule.to] === undefined && node[rule.from] !== undefined) {
        const value = node[rule.from];
        node[rule.to] = rule.map ? rule.map(value) : value;
      }
      return;
    }
    const key = segments[index];
    if (key === '*') {
      for (const value of Object.values(node)) {
        walk(value, index + 1);
      }
      return;
    }
    if (Object.hasOwn(node, key)) {
      walk(node[key], index + 1);
    }
  };
  walk(config, 0);
}

export function applyConfigAliases(config: MutableConfig, rules: ConfigAliasRule[]): void {
  for (const rule of rules) {
    applyAliasRule(config, rule);
  }
}

export function normalizeConfigV1toV2(
  config: OracleConfig,
  options: { aliasRules?: ConfigAliasRule[] } = {},
): OracleConfig {
  if (!isRecord(config)) return config;

  const normalized: MutableConfig = { ...config };
  if (
    typeof normalized.defaultRuntimeProfile === 'string' &&
    normalized.defaultRuntimeProfile.trim().length > 0 &&
    (typeof normalized.auracallProfile !== 'string' || normalized.auracallProfile.trim().length === 0)
  ) {
    normalized.auracallProfile = normalized.defaultRuntimeProfile.trim();
  }
  const browserDefaults = isRecord(normalized.browserDefaults) ? normalized.browserDefaults : null;

  if (browserDefaults) {
    const browserDefaultsRecord = browserDefaults as Record<string, unknown>;
    const existingBrowser = isRecord(normalized.browser) ? normalized.browser : {};
    normalized.browser = mergeRecords(browserDefaultsRecord, existingBrowser);
  }

  const llmDefaults = isRecord(normalized.llmDefaults) ? normalized.llmDefaults : null;
  if (llmDefaults) {
    const browser = isRecord(normalized.browser) ? normalized.browser : {};
    if (llmDefaults.defaultProjectId && llmDefaults.defaultProjectName) {
      console.warn(
        'Both llmDefaults.defaultProjectId and llmDefaults.defaultProjectName are set; using defaultProjectId.',
      );
    }
    if (normalized.model === undefined && llmDefaults.model !== undefined) {
      normalized.model = llmDefaults.model;
    }
    if (browser.modelStrategy === undefined && llmDefaults.modelStrategy !== undefined) {
      browser.modelStrategy = llmDefaults.modelStrategy;
    }
    if (browser.projectName === undefined && llmDefaults.defaultProjectName !== undefined) {
      browser.projectName = llmDefaults.defaultProjectName;
    }
    if (browser.projectId === undefined && llmDefaults.defaultProjectId !== undefined) {
      browser.projectId = llmDefaults.defaultProjectId;
    }
    normalized.browser = browser;

    const services = isRecord(normalized.services) ? normalized.services : {};
    for (const [serviceKey, serviceValue] of Object.entries(services)) {
      if (!KNOWN_SERVICES.has(serviceKey)) continue;
      if (!isRecord(serviceValue)) continue;
      const serviceConfig = serviceValue as Record<string, unknown>;
      const defaultProjectName = serviceConfig.defaultProjectName;
      const defaultProjectId = serviceConfig.defaultProjectId;
      if (defaultProjectId && defaultProjectName) {
        console.warn(
          `Service "${serviceKey}" sets both defaultProjectId and defaultProjectName; using defaultProjectId.`,
        );
      }
      if (serviceConfig.projectName === undefined && defaultProjectName !== undefined) {
        serviceConfig.projectName = defaultProjectName;
      }
      if (serviceConfig.projectId === undefined && defaultProjectId !== undefined) {
        serviceConfig.projectId = defaultProjectId;
      }
      services[serviceKey] = serviceConfig;
    }
    normalized.services = services;
  }

  const profiles = getCurrentRuntimeProfiles(normalized);
  if (Object.keys(profiles).length > 0) {
    const auracallProfiles = getRuntimeProfiles(
      isRecord(normalized.auracallProfiles) ? { profiles: normalized.auracallProfiles } : {},
    );
    for (const [name, profileValue] of Object.entries(profiles)) {
      if (!isRecord(profileValue)) continue;
      const legacyProfile = isRecord(auracallProfiles[name]) ? auracallProfiles[name] : {};

      if (legacyProfile.engine === undefined && profileValue.engine !== undefined) {
        legacyProfile.engine = profileValue.engine;
      }
      if (legacyProfile.search === undefined && profileValue.search !== undefined) {
        legacyProfile.search = profileValue.search;
      }
      if (legacyProfile.defaultService === undefined && profileValue.defaultService !== undefined) {
        legacyProfile.defaultService = profileValue.defaultService;
      }
      const runtimeProfileBrowserProfileId = getRuntimeProfileBrowserProfileId(profileValue);
      if (getRuntimeProfileBrowserProfileId(legacyProfile) === null && runtimeProfileBrowserProfileId !== null) {
        setRuntimeProfileBrowserProfile(
          legacyProfile,
          runtimeProfileBrowserProfileId,
        );
      }
      if (legacyProfile.keepBrowser === undefined && profileValue.keepBrowser !== undefined) {
        legacyProfile.keepBrowser = profileValue.keepBrowser;
      }

      if (isRecord(profileValue.browser)) {
        const legacyBrowser = isRecord(legacyProfile.browser) ? legacyProfile.browser : {};
        const profileBrowser = profileValue.browser as Record<string, unknown>;
        legacyProfile.browser = mergeRecords(legacyBrowser, profileBrowser);
      }

      if (isRecord(profileValue.services)) {
        const legacyServices = isRecord(legacyProfile.services) ? legacyProfile.services : {};
        legacyProfile.services = mergeRecords(legacyServices, profileValue.services);
      }

      if (isRecord(profileValue.services)) {
        for (const [serviceKey, serviceValue] of Object.entries(profileValue.services)) {
          if (!KNOWN_SERVICES.has(serviceKey)) continue;
          if (!isRecord(serviceValue)) continue;
          const serviceConfig = serviceValue as Record<string, unknown>;
          const defaultProjectName = serviceConfig.defaultProjectName;
          const defaultProjectId = serviceConfig.defaultProjectId;
          if (defaultProjectId && defaultProjectName) {
            console.warn(
              `Profile "${name}" service "${serviceKey}" sets both defaultProjectId and defaultProjectName; using defaultProjectId.`,
            );
          }
          const legacyServices = isRecord(legacyProfile.services) ? legacyProfile.services : {};
          const legacyService = isRecord(legacyServices[serviceKey])
            ? (legacyServices[serviceKey] as Record<string, unknown>)
            : {};
          if (legacyService.projectName === undefined && defaultProjectName !== undefined) {
            legacyService.projectName = defaultProjectName;
          }
          if (legacyService.projectId === undefined && defaultProjectId !== undefined) {
            legacyService.projectId = defaultProjectId;
          }
          legacyServices[serviceKey] = legacyService;
          legacyProfile.services = legacyServices;
        }
      }

      if (isRecord(profileValue.cache) && legacyProfile.cache === undefined) {
        legacyProfile.cache = profileValue.cache;
      }

      const llmConfig = isRecord(profileValue.llm) ? profileValue.llm : null;
      if (llmConfig) {
        if (llmConfig.defaultProjectId && llmConfig.defaultProjectName) {
          console.warn(
            `Profile "${name}" sets both llm.defaultProjectId and llm.defaultProjectName; using defaultProjectId.`,
          );
        }
        const defaultService =
          asString(profileValue.defaultService) ??
          asString(legacyProfile.defaultService) ??
          asString((normalized.browser as Record<string, unknown> | undefined)?.target);
        if (defaultService && KNOWN_SERVICES.has(defaultService)) {
          const legacyServices = isRecord(legacyProfile.services) ? legacyProfile.services : {};
          const serviceConfig = isRecord(legacyServices[defaultService])
            ? (legacyServices[defaultService] as Record<string, unknown>)
            : {};

          if (serviceConfig.model === undefined && llmConfig.model !== undefined) {
            serviceConfig.model = llmConfig.model;
          }
          if (serviceConfig.modelStrategy === undefined && llmConfig.modelStrategy !== undefined) {
            serviceConfig.modelStrategy = llmConfig.modelStrategy;
          }
          if (serviceConfig.projectName === undefined && llmConfig.defaultProjectName !== undefined) {
            serviceConfig.projectName = llmConfig.defaultProjectName;
          }
          if (serviceConfig.projectId === undefined && llmConfig.defaultProjectId !== undefined) {
            serviceConfig.projectId = llmConfig.defaultProjectId;
          }

          legacyServices[defaultService] = serviceConfig;
          legacyProfile.services = legacyServices;
        }
      }
      auracallProfiles[name] = legacyProfile;
    }
    normalized.auracallProfiles = auracallProfiles;
  }

  applyConfigAliases(normalized, options.aliasRules ?? DEFAULT_ALIAS_RULES);

  return normalized as OracleConfig;
}

export function materializeConfigV2(
  config: OracleConfig,
  options: { stripLegacy?: boolean; targetShape?: boolean } = {},
): OracleConfig {
  if (!isRecord(config)) return config;
  const result: MutableConfig = { ...config };
  const targetShape = options.targetShape ?? false;

  if (targetShape) {
    result.version = 3;
  } else if (typeof result.version !== 'number' || result.version >= 3) {
    result.version = 2;
  }
  if (!isRecord(result.globals)) {
    result.globals = {};
  }
  if (!isRecord(result.browserDefaults) && isRecord(result.browser)) {
    result.browserDefaults = result.browser;
  }
  if (!isRecord(result.llmDefaults)) {
    // Compatibility bridge output still backfills legacy llmDefaults from the
    // root model/browser defaults when no explicit llmDefaults block exists.
    const llmDefaults: Record<string, unknown> = {};
    if (result.model !== undefined) {
      llmDefaults.model = result.model;
    }
    if (isRecord(result.browser) && result.browser.modelStrategy !== undefined) {
      llmDefaults.modelStrategy = result.browser.modelStrategy;
    }
    if (isRecord(result.browser) && result.browser.projectName !== undefined) {
      llmDefaults.defaultProjectName = result.browser.projectName;
    }
    if (isRecord(result.browser) && result.browser.projectId !== undefined) {
      llmDefaults.defaultProjectId = result.browser.projectId;
    }
    if (Object.keys(llmDefaults).length > 0) {
      result.llmDefaults = llmDefaults;
    }
  }
  if (!isRecord(result.profiles) && isRecord(result.auracallProfiles)) {
    const runtimeProfiles = ensureRuntimeProfiles(result);
    for (const [name, runtimeProfile] of Object.entries(result.auracallProfiles)) {
      if (isRecord(runtimeProfile)) {
        runtimeProfiles[name] = runtimeProfile;
      }
    }
  }

  if (targetShape) {
    const defaultRuntimeProfile =
      typeof result.defaultRuntimeProfile === 'string' && result.defaultRuntimeProfile.trim().length > 0
        ? result.defaultRuntimeProfile.trim()
        : typeof result.auracallProfile === 'string' && result.auracallProfile.trim().length > 0
          ? result.auracallProfile.trim()
          : null;
    if (defaultRuntimeProfile) {
      result.defaultRuntimeProfile = defaultRuntimeProfile;
    }
    const sourceBrowserProfiles = isRecord(result.browserProfiles)
      ? (result.browserProfiles as Record<string, unknown>)
      : isRecord(result.browserFamilies)
        ? (result.browserFamilies as Record<string, unknown>)
        : {};
    if (Object.keys(sourceBrowserProfiles).length > 0) {
      result.browserProfiles = Object.fromEntries(
        Object.entries(sourceBrowserProfiles).map(([name, browserProfile]) => [
          name,
          isRecord(browserProfile) ? { ...browserProfile } : browserProfile,
        ]),
      );
    }

    const sourceRuntimeProfiles = isRecord(result.runtimeProfiles)
      ? (result.runtimeProfiles as Record<string, unknown>)
      : isRecord(result.profiles)
        ? (result.profiles as Record<string, unknown>)
        : isRecord(result.auracallProfiles)
          ? (result.auracallProfiles as Record<string, unknown>)
          : {};
    if (Object.keys(sourceRuntimeProfiles).length > 0) {
      result.runtimeProfiles = Object.fromEntries(
        Object.entries(sourceRuntimeProfiles).map(([name, runtimeProfile]) => {
          if (!isRecord(runtimeProfile)) {
            return [name, runtimeProfile];
          }
          const nextRuntimeProfile: Record<string, unknown> = { ...runtimeProfile };
          const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
          if (browserProfileId) {
            nextRuntimeProfile.browserProfile = browserProfileId;
          }
          delete nextRuntimeProfile.browserFamily;
          return [name, nextRuntimeProfile];
        }),
      );
    }

    if (isRecord(result.browserProfiles) && isRecord(result.runtimeProfiles)) {
      normalizeRuntimeProfileBrowserOwnedOverrides({
        browserProfiles: result.browserProfiles as Record<string, unknown>,
        runtimeProfiles: result.runtimeProfiles as Record<string, unknown>,
      });
      normalizeRuntimeProfileServiceScopedOverrides(result.runtimeProfiles as Record<string, unknown>);
      normalizeRedundantManagedProfileDirOverrides({
        config: result,
        browserProfiles: result.browserProfiles as Record<string, unknown>,
        runtimeProfiles: result.runtimeProfiles as Record<string, unknown>,
      });
      normalizeRedundantRuntimeProfileServiceDefaults(result, result.runtimeProfiles as Record<string, unknown>);
      pruneEmptyRuntimeProfileServices(result.runtimeProfiles as Record<string, unknown>);
    }

    delete result.browserFamilies;
    delete result.profiles;
    delete result.auracallProfile;
  } else {
    const defaultRuntimeProfile =
      typeof result.defaultRuntimeProfile === 'string' && result.defaultRuntimeProfile.trim().length > 0
        ? result.defaultRuntimeProfile.trim()
        : null;
    if (defaultRuntimeProfile) {
      result.auracallProfile = defaultRuntimeProfile;
    }
    delete result.defaultRuntimeProfile;

    if (isRecord(result.browserFamilies) && isRecord(result.profiles)) {
      normalizeRuntimeProfileBrowserOwnedOverrides({
        browserProfiles: result.browserFamilies as Record<string, unknown>,
        runtimeProfiles: result.profiles as Record<string, unknown>,
      });
      normalizeRuntimeProfileServiceScopedOverrides(result.profiles as Record<string, unknown>);
      normalizeRedundantManagedProfileDirOverrides({
        config: result,
        browserProfiles: result.browserFamilies as Record<string, unknown>,
        runtimeProfiles: result.profiles as Record<string, unknown>,
      });
      normalizeRedundantRuntimeProfileServiceDefaults(result, result.profiles as Record<string, unknown>);
      pruneEmptyRuntimeProfileServices(result.profiles as Record<string, unknown>);
    }
  }

  if (options.stripLegacy) {
    delete result.auracallProfiles;
    delete result.browser;
  }

  return result as OracleConfig;
}
