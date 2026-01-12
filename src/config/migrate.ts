import type { OracleConfig } from './schema.js';

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
  }

  const profiles = isRecord(normalized.profiles) ? normalized.profiles : null;
  if (profiles) {
    const oracleProfiles = isRecord(normalized.oracleProfiles) ? normalized.oracleProfiles : {};
    for (const [name, profileValue] of Object.entries(profiles)) {
      if (!isRecord(profileValue)) continue;
      const legacyProfile = isRecord(oracleProfiles[name]) ? oracleProfiles[name] : {};

      if (legacyProfile.engine === undefined && profileValue.engine !== undefined) {
        legacyProfile.engine = profileValue.engine;
      }
      if (legacyProfile.search === undefined && profileValue.search !== undefined) {
        legacyProfile.search = profileValue.search;
      }
      if (legacyProfile.defaultService === undefined && profileValue.defaultService !== undefined) {
        legacyProfile.defaultService = profileValue.defaultService;
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

      oracleProfiles[name] = legacyProfile;
    }
    normalized.oracleProfiles = oracleProfiles;
  }

  applyConfigAliases(normalized, options.aliasRules ?? DEFAULT_ALIAS_RULES);

  return normalized as OracleConfig;
}
