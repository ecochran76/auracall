import type { OracleConfig } from './schema.js';

type MutableRecord = Record<string, unknown>;
type MutableBrowserProfile = Record<string, unknown>;
type MutableRuntimeProfile = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
