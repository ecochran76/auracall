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

export function getActiveRuntimeProfile(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): MutableRuntimeProfile | null {
  const profileName = getActiveRuntimeProfileName(config, options);
  if (!profileName) return null;
  const runtimeProfiles = getBridgeRuntimeProfiles(config);
  return isRecord(runtimeProfiles[profileName]) ? runtimeProfiles[profileName] : null;
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
