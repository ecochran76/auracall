import type { OracleConfig } from './schema.js';

type MutableRecord = Record<string, unknown>;
type MutableBrowserProfile = Record<string, unknown>;
type MutableRuntimeProfile = Record<string, unknown>;

export interface ProjectedBrowserProfile {
  id: string;
}

export interface ProjectedRuntimeProfile {
  id: string;
  browserProfileId: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProjectedConfigModel {
  activeRuntimeProfileId: string | null;
  activeBrowserProfileId: string | null;
  browserProfiles: ProjectedBrowserProfile[];
  runtimeProfiles: ProjectedRuntimeProfile[];
}

export interface ConfigModelInspection {
  activeRuntimeProfileId: string | null;
  activeBrowserProfileId: string | null;
  activeDefaultService: 'chatgpt' | 'gemini' | 'grok' | null;
  browserProfileIds: string[];
  runtimeProfiles: ProjectedRuntimeProfile[];
  legacyRuntimeProfileIds: string[];
  bridgeState: {
    browserProfilesPresent: boolean;
    auracallRuntimeProfilesPresent: boolean;
    legacyRuntimeProfilesPresent: boolean;
  };
  projectedModel: ProjectedConfigModel;
}

export interface ConfigModelDoctorIssue {
  code:
    | 'no-runtime-profiles'
    | 'legacy-runtime-profiles-present'
    | 'runtime-profile-missing-browser-profile'
    | 'runtime-profile-browser-profile-missing'
    | 'unused-browser-profile'
    | 'active-runtime-profile-missing-browser-profile';
  severity: 'warning' | 'info';
  message: string;
  auracallRuntimeProfile?: string;
  browserProfile?: string;
}

export interface ConfigModelDoctorReport {
  ok: boolean;
  activeAuracallRuntimeProfile: string | null;
  activeBrowserProfile: string | null;
  issueCount: number;
  issues: ConfigModelDoctorIssue[];
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asServiceId(value: unknown): 'chatgpt' | 'gemini' | 'grok' | null {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

export function getBrowserProfiles(config: OracleConfig | MutableRecord): Record<string, MutableBrowserProfile> {
  return isRecord(config.browserFamilies) ? (config.browserFamilies as Record<string, MutableBrowserProfile>) : {};
}

export function getBrowserProfile(
  config: OracleConfig | MutableRecord,
  browserProfileName: string | null | undefined,
): MutableBrowserProfile | null {
  const name =
    typeof browserProfileName === 'string' && browserProfileName.trim().length > 0
      ? browserProfileName.trim()
      : null;
  if (!name) return null;
  const browserProfiles = getBrowserProfiles(config);
  return isRecord(browserProfiles[name]) ? browserProfiles[name] : null;
}

export function getRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return isRecord(config.profiles) ? (config.profiles as Record<string, MutableRuntimeProfile>) : {};
}

export function getCurrentRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return getRuntimeProfiles(config);
}

export function getLegacyRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return isRecord(config.auracallProfiles)
    ? (config.auracallProfiles as Record<string, MutableRuntimeProfile>)
    : {};
}

export function getBridgeRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  const legacyProfiles = getLegacyRuntimeProfiles(config);
  return Object.keys(legacyProfiles).length > 0 ? legacyProfiles : getCurrentRuntimeProfiles(config);
}

export function ensureBrowserProfiles(config: MutableRecord): Record<string, MutableBrowserProfile> {
  if (!isRecord(config.browserFamilies)) {
    config.browserFamilies = {};
  }
  return config.browserFamilies as Record<string, MutableBrowserProfile>;
}

export function ensureRuntimeProfiles(config: MutableRecord): Record<string, MutableRuntimeProfile> {
  if (!isRecord(config.profiles)) {
    config.profiles = {};
  }
  return config.profiles as Record<string, MutableRuntimeProfile>;
}

export function getRuntimeProfileBrowserProfileId(
  runtimeProfile: MutableRuntimeProfile | null | undefined,
): string | null {
  if (!isRecord(runtimeProfile)) return null;
  const value = runtimeProfile.browserFamily;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getRuntimeProfileBrowserProfile(
  config: OracleConfig | MutableRecord,
  runtimeProfile: MutableRuntimeProfile | null | undefined,
): MutableBrowserProfile | null {
  return getBrowserProfile(config, getRuntimeProfileBrowserProfileId(runtimeProfile));
}

export function getActiveRuntimeProfileName(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): string | null {
  const runtimeProfiles = getBridgeRuntimeProfiles(config);
  const explicit =
    typeof options.explicitProfileName === 'string' && options.explicitProfileName.trim().length > 0
      ? options.explicitProfileName.trim()
      : typeof config.auracallProfile === 'string' && config.auracallProfile.trim().length > 0
        ? config.auracallProfile.trim()
        : null;
  if (explicit && runtimeProfiles[explicit]) return explicit;
  if (runtimeProfiles.default) return 'default';
  const keys = Object.keys(runtimeProfiles);
  return keys.length > 0 ? keys[0] ?? null : null;
}

export function getPreferredRuntimeProfileName(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): string | null {
  const explicit =
    typeof options.explicitProfileName === 'string' && options.explicitProfileName.trim().length > 0
      ? options.explicitProfileName.trim()
      : null;
  if (!explicit) {
    return getActiveRuntimeProfileName(config);
  }
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(config);
  if (currentRuntimeProfiles[explicit]) {
    return explicit;
  }
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  if (legacyRuntimeProfiles[explicit]) {
    return explicit;
  }
  return getActiveRuntimeProfileName(config, {
    explicitProfileName: explicit,
  });
}

export function getActiveRuntimeProfile(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): MutableRuntimeProfile | null {
  const profileName = getActiveRuntimeProfileName(config, options);
  if (!profileName) return null;
  const runtimeProfiles = getBridgeRuntimeProfiles(config);
  return isRecord(runtimeProfiles[profileName]) ? runtimeProfiles[profileName] : null;
}

export function getPreferredRuntimeProfile(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): MutableRuntimeProfile | null {
  const profileName = getPreferredRuntimeProfileName(config, options);
  if (!profileName) return null;
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(config);
  if (isRecord(currentRuntimeProfiles[profileName])) {
    return currentRuntimeProfiles[profileName];
  }
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  return isRecord(legacyRuntimeProfiles[profileName]) ? legacyRuntimeProfiles[profileName] : null;
}

export function projectConfigModel(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ProjectedConfigModel {
  const activeRuntimeProfileId = getPreferredRuntimeProfileName(config, options);
  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeRuntimeProfileId,
  });
  const browserProfiles = Object.keys(getBrowserProfiles(config))
    .sort()
    .map((id) => ({ id }));
  const runtimeProfiles = Object.entries(getCurrentRuntimeProfiles(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, runtimeProfile]) => ({
      id,
      browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
      defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
    }));
  return {
    activeRuntimeProfileId,
    activeBrowserProfileId: getRuntimeProfileBrowserProfileId(activeRuntimeProfile),
    browserProfiles,
    runtimeProfiles,
  };
}

export function inspectConfigModel(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ConfigModelInspection {
  const activeRuntimeProfileId = getPreferredRuntimeProfileName(config, options);
  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeRuntimeProfileId,
  });
  const browserProfileIds = Object.keys(getBrowserProfiles(config)).sort();
  const runtimeProfiles = Object.entries(getCurrentRuntimeProfiles(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, runtimeProfile]) => ({
      id,
      browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
      defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
    }));
  const legacyRuntimeProfileIds = Object.keys(getLegacyRuntimeProfiles(config)).sort();
  return {
    activeRuntimeProfileId,
    activeBrowserProfileId: getRuntimeProfileBrowserProfileId(activeRuntimeProfile),
    activeDefaultService: asServiceId(isRecord(activeRuntimeProfile) ? activeRuntimeProfile.defaultService : undefined),
    browserProfileIds,
    runtimeProfiles,
    legacyRuntimeProfileIds,
    bridgeState: {
      browserProfilesPresent: browserProfileIds.length > 0,
      auracallRuntimeProfilesPresent: runtimeProfiles.length > 0,
      legacyRuntimeProfilesPresent: legacyRuntimeProfileIds.length > 0,
    },
    projectedModel: {
      activeRuntimeProfileId,
      activeBrowserProfileId: getRuntimeProfileBrowserProfileId(activeRuntimeProfile),
      browserProfiles: browserProfileIds.map((id) => ({ id })),
      runtimeProfiles,
    },
  };
}

export function analyzeConfigModelBridgeHealth(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ConfigModelDoctorReport {
  const activeAuracallRuntimeProfile = getPreferredRuntimeProfileName(config, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  const browserProfiles = getBrowserProfiles(config);
  const browserProfileNames = new Set(Object.keys(browserProfiles));
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  const issues: ConfigModelDoctorIssue[] = [];
  const referencedBrowserProfiles = new Set<string>();

  if (Object.keys(runtimeProfiles).length === 0) {
    issues.push({
      code: 'no-runtime-profiles',
      severity: 'warning',
      message: 'No AuraCall runtime profiles are defined under the current bridge key `profiles`.',
    });
  }

  if (Object.keys(legacyRuntimeProfiles).length > 0) {
    issues.push({
      code: 'legacy-runtime-profiles-present',
      severity: 'info',
      message: 'Legacy runtime profiles are still present under `auracallProfiles`.',
    });
  }

  for (const [name, runtimeProfile] of Object.entries(runtimeProfiles)) {
    const browserProfile = getRuntimeProfileBrowserProfileId(runtimeProfile);
    if (!browserProfile) {
      issues.push({
        code: 'runtime-profile-missing-browser-profile',
        severity: 'warning',
        message: `AuraCall runtime profile "${name}" does not explicitly reference a browser profile.`,
        auracallRuntimeProfile: name,
      });
      continue;
    }
    referencedBrowserProfiles.add(browserProfile);
    if (!browserProfileNames.has(browserProfile)) {
      issues.push({
        code: 'runtime-profile-browser-profile-missing',
        severity: 'warning',
        message: `AuraCall runtime profile "${name}" references missing browser profile "${browserProfile}".`,
        auracallRuntimeProfile: name,
        browserProfile,
      });
    }
  }

  for (const browserProfile of browserProfileNames) {
    if (!referencedBrowserProfiles.has(browserProfile)) {
      issues.push({
        code: 'unused-browser-profile',
        severity: 'info',
        message: `Browser profile "${browserProfile}" is defined but no AuraCall runtime profile references it.`,
        browserProfile,
      });
    }
  }

  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeAuracallRuntimeProfile,
  });
  const activeBrowserProfile = getRuntimeProfileBrowserProfileId(activeRuntimeProfile);
  if (activeAuracallRuntimeProfile && !activeBrowserProfile) {
    issues.push({
      code: 'active-runtime-profile-missing-browser-profile',
      severity: 'warning',
      message: `Active AuraCall runtime profile "${activeAuracallRuntimeProfile}" does not explicitly reference a browser profile.`,
      auracallRuntimeProfile: activeAuracallRuntimeProfile,
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'warning'),
    activeAuracallRuntimeProfile,
    activeBrowserProfile,
    issueCount: issues.length,
    issues,
  };
}

export function setBrowserProfile(
  config: MutableRecord,
  browserProfileName: string,
  browserProfile: MutableBrowserProfile,
): void {
  const browserProfiles = ensureBrowserProfiles(config);
  browserProfiles[browserProfileName] = browserProfile;
}

export function setRuntimeProfile(
  config: MutableRecord,
  runtimeProfileName: string,
  runtimeProfile: MutableRuntimeProfile,
): void {
  const runtimeProfiles = ensureRuntimeProfiles(config);
  runtimeProfiles[runtimeProfileName] = runtimeProfile;
}

export function setRuntimeProfileBrowserProfile(
  runtimeProfile: MutableRuntimeProfile,
  browserProfileName: string,
): void {
  runtimeProfile.browserFamily = browserProfileName;
}
