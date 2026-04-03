import type { OracleConfig } from './schema.js';
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

  if (result.version === undefined) {
    result.version = 2;
  }
  if (!isRecord(result.globals)) {
    result.globals = {};
  }
  if (!isRecord(result.browserDefaults) && isRecord(result.browser)) {
    result.browserDefaults = result.browser;
  }
  if (!isRecord(result.llmDefaults)) {
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

  if (options.targetShape) {
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

    delete result.browserFamilies;
    delete result.profiles;
  }

  if (options.stripLegacy) {
    delete result.auracallProfiles;
    delete result.browser;
  }

  return result as OracleConfig;
}
