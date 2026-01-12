import type { OracleConfig } from './schema.js';

type MutableConfig = Record<string, unknown>;

const KNOWN_SERVICES = new Set(['chatgpt', 'gemini', 'grok']);

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

export function normalizeConfigV1toV2(config: OracleConfig): OracleConfig {
  if (!isRecord(config)) return config;

  const normalized: MutableConfig = { ...config };
  const browserDefaults = isRecord(normalized.browserDefaults) ? normalized.browserDefaults : null;

  if (browserDefaults) {
    const existingBrowser = isRecord(normalized.browser) ? normalized.browser : {};
    normalized.browser = mergeRecords(browserDefaults, existingBrowser);
  }

  const llmDefaults = isRecord(normalized.llmDefaults) ? normalized.llmDefaults : null;
  if (llmDefaults) {
    const browser = isRecord(normalized.browser) ? normalized.browser : {};
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
        legacyProfile.browser = mergeRecords(legacyBrowser, profileValue.browser);
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

  return normalized as OracleConfig;
}
