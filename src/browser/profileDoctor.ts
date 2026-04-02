import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DiagnosisReport } from '../inspector/doctor.js';
import type { ResolvedUserConfig } from '../config.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import { BrowserAutomationClient } from './client.js';
import { resolveBrowserConfig } from './config.js';
import { resolveBrowserProfileResolutionFromResolvedConfig } from './service/profileResolution.js';
import type { ProviderUserIdentity } from './providers/types.js';
import {
  findBrowserCookieFile,
  inferSourceProfileFromCookiePath,
  resolveManagedProfileDir,
  resolveBootstrapSourceCookiePath,
  resolveManagedProfileRoot,
} from './profileStore.js';
import { listInstances, pruneRegistry, type BrowserInstance } from '../../packages/browser-service/src/service/stateRegistry.js';
import { isChromeAlive } from '../../packages/browser-service/src/processCheck.js';
import type { BrowserToolsDoctorContract } from '../../packages/browser-service/src/browserTools.js';

export type BrowserDoctorTarget = 'chatgpt' | 'grok' | 'gemini';

export interface BrowserDoctorRegistryEntry {
  key: string;
  profilePath: string;
  profileName: string;
  pid: number;
  port: number;
  host: string;
  alive: boolean;
  managed: boolean;
  legacy: boolean;
  services: string[];
}

export interface BrowserDoctorReport {
  target: BrowserDoctorTarget;
  registryPath: string;
  managedProfileRoot: string;
  managedProfileDir: string;
  chromeProfile: string;
  sourceCookiePath: string | null;
  sourceProfile: { userDataDir: string; profileName: string } | null;
  managedProfileExists: boolean;
  managedCookiePath: string | null;
  managedPreferencesPath: string | null;
  managedLocalStatePath: string | null;
  chromeGoogleAccount: BrowserDoctorChromeAccountReport | null;
  registryEntries: BrowserDoctorRegistryEntry[];
  staleRegistryEntries: BrowserDoctorRegistryEntry[];
  legacyRegistryEntries: BrowserDoctorRegistryEntry[];
  managedRegistryEntry: BrowserDoctorRegistryEntry | null;
  prunedRegistryEntries: number;
  warnings: string[];
}

export interface BrowserDoctorChromeAccountReport {
  provider: 'google';
  source: 'local-state' | 'preferences' | 'merged';
  status: 'signed-in' | 'signed-out' | 'inconclusive';
  chromeProfile: string;
  profileName: string | null;
  displayName: string | null;
  givenName: string | null;
  email: string | null;
  gaiaId: string | null;
  consentedPrimaryAccount: boolean;
  explicitBrowserSignin: boolean;
  activeAccounts: number;
  localStatePath: string;
  preferencesPath: string | null;
}

export interface BrowserDoctorIdentityReport {
  target: BrowserDoctorTarget;
  supported: boolean;
  attempted: boolean;
  identity: ProviderUserIdentity | null;
  error: string | null;
}

export const AURACALL_BROWSER_DOCTOR_CONTRACT_VERSION = 1 as const;

export interface AuracallBrowserDoctorContract {
  contract: 'auracall.browser-doctor';
  version: typeof AURACALL_BROWSER_DOCTOR_CONTRACT_VERSION;
  generatedAt: string;
  target: BrowserDoctorTarget;
  localReport: BrowserDoctorReport;
  identityStatus: BrowserDoctorIdentityReport | null;
  runtime: {
    browserTools: BrowserToolsDoctorContract | null;
    browserToolsError: string | null;
    selectorDiagnosis:
      | {
          port: number;
          report: DiagnosisReport;
        }
      | null;
    selectorDiagnosisError: string | null;
  };
}

export function createAuracallBrowserDoctorContract(
  input: {
    target: BrowserDoctorTarget;
    localReport: BrowserDoctorReport;
    identityStatus?: BrowserDoctorIdentityReport | null;
    browserTools?: BrowserToolsDoctorContract | null;
    browserToolsError?: string | null;
    selectorDiagnosis?:
      | {
          port: number;
          report: DiagnosisReport;
        }
      | null;
    selectorDiagnosisError?: string | null;
  },
  options: { generatedAt?: string } = {},
): AuracallBrowserDoctorContract {
  return {
    contract: 'auracall.browser-doctor',
    version: AURACALL_BROWSER_DOCTOR_CONTRACT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    target: input.target,
    localReport: input.localReport,
    identityStatus: input.identityStatus ?? null,
    runtime: {
      browserTools: input.browserTools ?? null,
      browserToolsError: input.browserToolsError ?? null,
      selectorDiagnosis: input.selectorDiagnosis ?? null,
      selectorDiagnosisError: input.selectorDiagnosisError ?? null,
    },
  };
}

export async function inspectBrowserDoctorState(
  userConfig: Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'>,
  options: {
    target?: BrowserDoctorTarget;
    pruneDeadRegistryEntries?: boolean;
    registryPath?: string;
  } = {},
): Promise<BrowserDoctorReport> {
  const target = options.target ?? (userConfig.browser?.target as BrowserDoctorTarget | undefined) ?? 'chatgpt';
  const resolved = resolveBrowserConfig({
    ...(userConfig.browser ?? {}),
    target,
  });
  const launchProfile = resolveBrowserProfileResolutionFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browser: resolved,
    target,
  }).launchProfile;
  const registryPath = options.registryPath ?? path.join(getAuracallHomeDir(), 'browser-state.json');

  const managedProfileRoot = resolveManagedProfileRoot(
    launchProfile.managedProfileRoot ?? resolved.managedProfileRoot ?? null,
  );
  const managedProfileDir = resolveManagedProfileDir({
    configuredDir: launchProfile.manualLoginProfileDir ?? resolved.manualLoginProfileDir ?? null,
    managedProfileRoot,
    auracallProfileName: userConfig.auracallProfile ?? 'default',
    target,
  });
  const chromeProfile = launchProfile.chromeProfile ?? resolved.chromeProfile ?? 'Default';
  const sourceCookiePath = resolveBootstrapSourceCookiePath({
    configuredCookiePath:
      launchProfile.bootstrapCookiePath ??
      launchProfile.chromeCookiePath ??
      resolved.bootstrapCookiePath ??
      resolved.chromeCookiePath ??
      null,
    managedProfileDir,
    managedProfileName: chromeProfile,
  });
  const sourceProfile = inferSourceProfileFromCookiePath(sourceCookiePath);

  const beforeEntries = await classifyRegistryEntries(registryPath, managedProfileRoot);
  let prunedRegistryEntries = 0;
  let registryEntries = beforeEntries;
  if (options.pruneDeadRegistryEntries) {
    await pruneRegistry({ registryPath });
    const afterEntries = await classifyRegistryEntries(registryPath, managedProfileRoot);
    prunedRegistryEntries = beforeEntries.filter((entry) => !entry.alive).length - afterEntries.filter((entry) => !entry.alive).length;
    registryEntries = afterEntries;
  }

  const managedCookiePath = findBrowserCookieFile(managedProfileDir, chromeProfile);
  const managedPreferencesPath = resolveExistingPath(path.join(managedProfileDir, chromeProfile, 'Preferences'));
  const managedLocalStatePath = resolveExistingPath(path.join(managedProfileDir, 'Local State'));
  const chromeGoogleAccount = await inspectChromeGoogleAccount(
    managedLocalStatePath,
    managedPreferencesPath,
    chromeProfile,
  );
  const managedProfileExists =
    existsSync(managedProfileDir) ||
    Boolean(managedCookiePath) ||
    Boolean(managedPreferencesPath) ||
    Boolean(managedLocalStatePath);
  const staleRegistryEntries = registryEntries.filter((entry) => !entry.alive);
  const legacyRegistryEntries = registryEntries.filter((entry) => entry.legacy);
  const managedRegistryEntry =
    registryEntries.find(
      (entry) =>
        path.resolve(entry.profilePath) === managedProfileDir &&
        entry.profileName.toLowerCase() === chromeProfile.toLowerCase(),
    ) ?? null;

  const warnings: string[] = [];
  if (!managedProfileExists) {
    warnings.push('Managed Aura-Call browser profile has not been initialized yet.');
  }
  if (!sourceCookiePath && !managedCookiePath) {
    warnings.push('No source cookie path or managed cookie store was found; first-run browser bootstrap may not carry a signed-in session.');
  }
  const sourceCookieMtimeMs = await readFileMtimeMs(sourceCookiePath);
  const managedCookieMtimeMs = await readFileMtimeMs(managedCookiePath);
  if (
    sourceCookieMtimeMs != null &&
    (managedCookieMtimeMs == null || sourceCookieMtimeMs > managedCookieMtimeMs + 1000)
  ) {
    warnings.push(
      `Source Chrome cookies are newer than the managed ${target} profile. Rerun "auracall login --target ${target}" or "auracall setup --target ${target}" to refresh the managed profile.`,
    );
  }
  if (staleRegistryEntries.length > 0) {
    warnings.push(`browser-state.json contains ${staleRegistryEntries.length} stale entr${staleRegistryEntries.length === 1 ? 'y' : 'ies'}.`);
  }
  if (legacyRegistryEntries.length > 0) {
    warnings.push(`browser-state.json still contains ${legacyRegistryEntries.length} legacy entr${legacyRegistryEntries.length === 1 ? 'y' : 'ies'} from older profile paths.`);
  }

  return {
    target,
    registryPath,
    managedProfileRoot,
    managedProfileDir,
    chromeProfile,
    sourceCookiePath,
    sourceProfile,
    managedProfileExists,
    managedCookiePath,
    managedPreferencesPath,
    managedLocalStatePath,
    chromeGoogleAccount,
    registryEntries,
    staleRegistryEntries,
    legacyRegistryEntries,
    managedRegistryEntry,
    prunedRegistryEntries,
    warnings,
  };
}

export async function inspectBrowserDoctorIdentity(
  userConfig: ResolvedUserConfig,
  options: {
    target?: BrowserDoctorTarget;
    localReport?: BrowserDoctorReport | null;
  } = {},
): Promise<BrowserDoctorIdentityReport> {
  const target = options.target ?? (userConfig.browser?.target as BrowserDoctorTarget | undefined) ?? 'chatgpt';
  if (target === 'gemini') {
    return {
      target,
      supported: false,
      attempted: false,
      identity: null,
      error: null,
    };
  }

  const localReport =
    options.localReport ??
    (await inspectBrowserDoctorState(userConfig, {
      target,
    }));
  if (!localReport.managedRegistryEntry?.alive) {
    return {
      target,
      supported: true,
      attempted: false,
      identity: null,
      error: null,
    };
  }

  try {
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
    const identity = await client.getUserIdentity();
    return {
      target,
      supported: true,
      attempted: true,
      identity,
      error: null,
    };
  } catch (error) {
    return {
      target,
      supported: true,
      attempted: true,
      identity: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function classifyRegistryEntries(
  registryPath: string,
  managedProfileRoot: string,
): Promise<BrowserDoctorRegistryEntry[]> {
  const instances = await listInstances({ registryPath });
  const entries: BrowserDoctorRegistryEntry[] = [];
  for (const instance of instances) {
    const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port, undefined, instance.host);
    const profileName = (instance.profileName ?? 'Default').trim() || 'Default';
    const normalizedPath = path.resolve(instance.profilePath);
    entries.push({
      key: `${path.normalize(instance.profilePath)}::${profileName.toLowerCase()}`,
      profilePath: normalizedPath,
      profileName,
      pid: instance.pid,
      port: instance.port,
      host: instance.host,
      alive,
      managed: normalizedPath.startsWith(path.resolve(managedProfileRoot)),
      legacy: isLegacyBrowserProfilePath(normalizedPath),
      services: instance.services ?? [],
    });
  }
  return entries.sort((a, b) => {
    if (a.managed !== b.managed) return a.managed ? -1 : 1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return a.profilePath.localeCompare(b.profilePath);
  });
}

function isLegacyBrowserProfilePath(profilePath: string): boolean {
  const normalized = path.normalize(profilePath);
  const segments = normalized.split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === '.auracall' && segments[index + 1] === 'browser-profile') {
      return true;
    }
  }
  return path.basename(normalized).startsWith('auracall-browser-');
}

function resolveExistingPath(candidate: string): string | null {
  return existsSync(candidate) ? candidate : null;
}

async function readFileMtimeMs(candidate: string | null): Promise<number | null> {
  if (!candidate) {
    return null;
  }
  try {
    return (await stat(candidate)).mtimeMs;
  } catch {
    return null;
  }
}

async function inspectChromeGoogleAccount(
  localStatePath: string | null,
  preferencesPath: string | null,
  chromeProfile: string,
): Promise<BrowserDoctorChromeAccountReport | null> {
  try {
    const localState = await readJsonIfExists<{
      profile?: {
        info_cache?: Record<string, Record<string, unknown>>;
      };
      signin?: {
        active_accounts?: Record<string, unknown>;
      };
    }>(localStatePath);
    const preferences = await readJsonIfExists<{
      account_info?: Array<Record<string, unknown>>;
      google?: {
        services?: Record<string, unknown>;
      };
      signin?: Record<string, unknown>;
    }>(preferencesPath);

    const infoCache = localState?.profile?.info_cache ?? {};
    const profileInfo = infoCache[chromeProfile] ?? infoCache.Default ?? null;
    const preferenceAccount =
      preferences?.account_info?.find((entry) =>
        Boolean(
          asNonEmptyString(entry.email) ||
          asNonEmptyString(entry.gaia) ||
          asNonEmptyString(entry.full_name) ||
          asNonEmptyString(entry.given_name),
        ),
      ) ?? null;
    if (!profileInfo && !preferenceAccount && !localState && !preferences) {
      return null;
    }

    const activeAccounts = Object.keys(localState?.signin?.active_accounts ?? {}).length;
    const email =
      asNonEmptyString(profileInfo?.user_name) ??
      asNonEmptyString(preferenceAccount?.email);
    const gaiaId =
      asNonEmptyString(profileInfo?.gaia_id) ??
      asNonEmptyString(preferenceAccount?.gaia) ??
      asNonEmptyString(preferences?.google?.services?.last_gaia_id);
    const displayName =
      asNonEmptyString(profileInfo?.gaia_name) ??
      asNonEmptyString(preferenceAccount?.full_name);
    const givenName =
      asNonEmptyString(profileInfo?.gaia_given_name) ??
      asNonEmptyString(preferenceAccount?.given_name);
    const profileName = asNonEmptyString(profileInfo?.name) ?? chromeProfile;
    const consentedPrimaryAccount = profileInfo?.is_consented_primary_account === true;
    const explicitBrowserSignin = preferences?.signin?.explicit_browser_signin === true;
    const hasIdentity = Boolean(email || gaiaId || displayName || givenName);
    const status = hasIdentity ? 'signed-in' : activeAccounts > 0 ? 'inconclusive' : 'signed-out';
    const source =
      hasIdentity && localStatePath && preferencesPath && (
        (asNonEmptyString(profileInfo?.user_name) || asNonEmptyString(profileInfo?.gaia_id) || asNonEmptyString(profileInfo?.gaia_name))
        && (asNonEmptyString(preferenceAccount?.email) || asNonEmptyString(preferenceAccount?.gaia) || asNonEmptyString(preferenceAccount?.full_name))
      )
        ? 'merged'
        : hasIdentity && (asNonEmptyString(preferenceAccount?.email) || asNonEmptyString(preferenceAccount?.gaia) || asNonEmptyString(preferenceAccount?.full_name))
          && !(asNonEmptyString(profileInfo?.user_name) || asNonEmptyString(profileInfo?.gaia_id) || asNonEmptyString(profileInfo?.gaia_name))
          ? 'preferences'
          : 'local-state';

    return {
      provider: 'google',
      source,
      status,
      chromeProfile,
      profileName,
      displayName,
      givenName,
      email,
      gaiaId,
      consentedPrimaryAccount,
      explicitBrowserSignin,
      activeAccounts,
      localStatePath: localStatePath ?? '',
      preferencesPath,
    };
  } catch {
    return null;
  }
}

async function readJsonIfExists<T>(candidate: string | null): Promise<T | null> {
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(await readFile(candidate, 'utf8')) as T;
  } catch {
    return null;
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
