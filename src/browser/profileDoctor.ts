import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DiagnosisReport } from '../inspector/doctor.js';
import type { ResolvedUserConfig } from '../config.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import { BrowserAutomationClient } from './client.js';
import {
  resolveManagedBrowserLaunchContextFromResolvedConfig,
  resolveUserBrowserLaunchContext,
} from './service/profileResolution.js';
import type { ProviderUserIdentity } from './providers/types.js';
import {
  findBrowserCookieFile,
  inferSourceProfileFromCookiePath,
  resolveManagedProfileRoot,
} from './profileStore.js';
import {
  listInstancesWithLiveness,
  pruneRegistry,
  type BrowserInstance,
  type BrowserInstanceLiveness,
} from '../../packages/browser-service/src/service/stateRegistry.js';
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
  liveness: BrowserInstanceLiveness;
  actualPid: number | null;
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
  prunedRegistryEntryReasons: Record<string, number>;
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
  reason: string | null;
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
  const { resolvedConfig: resolved, launchProfile } = resolveUserBrowserLaunchContext(userConfig, target);
  const managedLaunchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browser: resolved,
    target,
  });
  const registryPath = options.registryPath ?? path.join(getAuracallHomeDir(), 'browser-state.json');

  const managedProfileRoot = resolveManagedProfileRoot(
    launchProfile.managedProfileRoot ?? resolved.managedProfileRoot ?? null,
  );
  const managedProfileDir = managedLaunchContext.managedProfileDir;
  const chromeProfile = managedLaunchContext.managedChromeProfile;
  const sourceCookiePath = managedLaunchContext.bootstrapCookiePath ?? null;
  const sourceProfile = inferSourceProfileFromCookiePath(sourceCookiePath);

  const beforeEntries = await classifyRegistryEntries(registryPath, managedProfileRoot);
  let prunedRegistryEntries = 0;
  let prunedRegistryEntryReasons: Record<string, number> = {};
  let registryEntries = beforeEntries;
  if (options.pruneDeadRegistryEntries) {
    const { pruneRegistryDetailed } = await import('../../packages/browser-service/src/service/stateRegistry.js');
    const pruned = await pruneRegistryDetailed({ registryPath });
    const afterEntries = await classifyRegistryEntries(registryPath, managedProfileRoot);
    prunedRegistryEntries = pruned.pruned.length;
    prunedRegistryEntryReasons = Object.fromEntries(
      Array.from(
        pruned.pruned.reduce((map, entry) => {
          map.set(entry.liveness, (map.get(entry.liveness) ?? 0) + 1);
          return map;
        }, new Map<string, number>()),
      ).sort(([left], [right]) => left.localeCompare(right)),
    );
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
    warnings.push('Managed browser profile has not been initialized yet.');
  }
  if (!sourceCookiePath && !managedCookiePath) {
    warnings.push('No source browser cookie path or managed browser profile cookie store was found; first-run bootstrap may not carry a signed-in session.');
  }
  const sourceCookieMtimeMs = await readFileMtimeMs(sourceCookiePath);
  const managedCookieMtimeMs = await readFileMtimeMs(managedCookiePath);
  if (
    sourceCookieMtimeMs != null &&
    (managedCookieMtimeMs == null || sourceCookieMtimeMs > managedCookieMtimeMs + 1000)
  ) {
    warnings.push(
      `Source browser cookies are newer than the managed browser profile for ${target}. Rerun "auracall login --target ${target}" or "auracall setup --target ${target}" to refresh the managed browser profile.`,
    );
  }
  if (staleRegistryEntries.length > 0) {
    warnings.push(
      `browser-state.json contains ${staleRegistryEntries.length} stale entr${staleRegistryEntries.length === 1 ? 'y' : 'ies'} (${summarizeRegistryLiveness(staleRegistryEntries)}).`,
    );
  }
  if (prunedRegistryEntries > 0) {
    warnings.push(
      `Pruned ${prunedRegistryEntries} stale browser-state entr${prunedRegistryEntries === 1 ? 'y' : 'ies'} (${summarizeReasonCounts(prunedRegistryEntryReasons)}).`,
    );
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
    prunedRegistryEntryReasons,
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
      reason:
        'Gemini browser doctor currently supports local browser-profile inspection only; provider account identity probing is not implemented.',
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
      reason: null,
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
      reason: null,
    };
  } catch (error) {
    return {
      target,
      supported: true,
      attempted: true,
      identity: null,
      error: error instanceof Error ? error.message : String(error),
      reason: null,
    };
  }
}

async function classifyRegistryEntries(
  registryPath: string,
  managedProfileRoot: string,
): Promise<BrowserDoctorRegistryEntry[]> {
  const instances = await listInstancesWithLiveness({ registryPath });
  const entries: BrowserDoctorRegistryEntry[] = [];
  for (const { instance, alive, liveness, actualPid } of instances) {
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
      liveness,
      actualPid,
      managed: normalizedPath.startsWith(path.resolve(managedProfileRoot)),
      legacy: isLegacyBrowserProfilePath(normalizedPath),
      services: instance.services ?? [],
    });
  }
  return entries.sort((a, b) => {
    if (a.managed !== b.managed) return a.managed ? -1 : 1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.liveness !== b.liveness) return a.liveness.localeCompare(b.liveness);
    return a.profilePath.localeCompare(b.profilePath);
  });
}

function summarizeRegistryLiveness(entries: ReadonlyArray<BrowserDoctorRegistryEntry>): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.liveness, (counts.get(entry.liveness) ?? 0) + 1);
  }
  return summarizeReasonCounts(Object.fromEntries(counts));
}

function summarizeReasonCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
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
