import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResolvedUserConfig } from '../config.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import { inferProfileFromCookiePath } from '../../packages/browser-service/src/loginHelpers.js';
import { isWslEnvironment, toWindowsPath, toWslPath } from '../../packages/browser-service/src/platformPaths.js';
import { listInstances } from '../../packages/browser-service/src/service/stateRegistry.js';
import { findChromePidUsingUserDataDir, isChromeAlive } from '../../packages/browser-service/src/processCheck.js';
import { resolveWindowsPowerShellPath } from '../../packages/browser-service/src/windowsLoopbackRelay.js';

export type BrowserProfileTarget = 'chatgpt' | 'gemini' | 'grok';
export type ManagedProfileSeedPolicy = 'bootstrap-only' | 'reseed-if-source-newer' | 'force-reseed';

export interface ManagedProfileSeedResult {
  cloned: boolean;
  reseeded: boolean;
  sourceUserDataDir?: string;
  sourceProfileName?: string;
  sourceCookiePath?: string;
  sourceCookieMtimeMs?: number | null;
  managedCookiePath?: string | null;
  managedCookieMtimeMs?: number | null;
  skippedReason?:
    | 'missing-source'
    | 'missing-source-profile'
    | 'same-profile'
    | 'managed-has-state'
    | 'source-not-newer'
    | 'managed-profile-active';
}

const execFileAsync = promisify(execFile);

const MANAGED_PROFILE_TOP_LEVEL_BOOTSTRAP_ENTRIES = [
  'Local State',
  'First Run',
  'Last Version',
  'Variations',
] as const;

const MANAGED_PROFILE_AUTH_STATE_ENTRIES = [
  'Preferences',
  'Secure Preferences',
  'Network',
  'Local Storage',
  'IndexedDB',
  'WebStorage',
  'Web Data',
  'Web Data-journal',
  'Account Web Data',
  'Account Web Data-journal',
  'Login Data',
  'Login Data-journal',
  'Login Data For Account',
  'Login Data For Account-journal',
  'Affiliation Database',
  'Affiliation Database-journal',
] as const;

const MANAGED_PROFILE_SKIP_ENTRY_NAMES = new Set([
  'lock',
  'lockfile',
  'singletonlock',
  'singletonsocket',
  'singletoncookie',
  'devtoolsactiveport',
]);

const MANAGED_PROFILE_CRASH_PRUNE_ENTRIES = [
  'Sessions',
  'Current Session',
  'Current Tabs',
  'Last Session',
  'Last Tabs',
] as const;

export function resolveManagedProfileRoot(configuredRoot?: string | null): string {
  const root = configuredRoot?.trim()
    ? normalizeConfiguredPath(configuredRoot.trim())
    : path.join(getAuracallHomeDir(), 'browser-profiles');
  return path.resolve(root);
}

export function resolveManagedProfileDir(options: {
  configuredDir?: string | null;
  managedProfileRoot?: string | null;
  auracallProfileName?: string | null;
  target?: BrowserProfileTarget | null;
}): string {
  const root = resolveManagedProfileRoot(options.managedProfileRoot ?? null);
  const profileName = sanitizeProfileSegment(options.auracallProfileName ?? 'default');
  const target = sanitizeProfileSegment(options.target ?? 'chatgpt');
  const expectedManagedProfileDir = path.join(root, profileName, target);

  if (options.configuredDir?.trim()) {
    const resolvedConfiguredDir = path.resolve(normalizeConfiguredPath(options.configuredDir.trim()));
    if (
      shouldIgnoreConfiguredManagedProfileDir({
        resolvedConfiguredDir,
        managedProfileRoot: root,
        expectedProfileName: profileName,
        expectedTarget: target,
      })
    ) {
      return expectedManagedProfileDir;
    }
    return resolvedConfiguredDir;
  }

  return expectedManagedProfileDir;
}

export function resolveManagedProfileDirForUserConfig(
  userConfig: Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'>,
  target?: BrowserProfileTarget | null,
): string {
  return resolveManagedProfileDir({
    configuredDir: userConfig.browser?.manualLoginProfileDir ?? null,
    managedProfileRoot: userConfig.browser?.managedProfileRoot ?? null,
    auracallProfileName: userConfig.auracallProfile ?? 'default',
    target: target ?? userConfig.browser?.target ?? 'chatgpt',
  });
}

export function findBrowserCookieFile(profileDir: string, profileName = 'Default'): string | null {
  const candidates = [
    path.join(profileDir, profileName, 'Network', 'Cookies'),
    path.join(profileDir, profileName, 'Cookies'),
    path.join(profileDir, 'Default', 'Network', 'Cookies'),
    path.join(profileDir, 'Default', 'Cookies'),
    path.join(profileDir, 'Network', 'Cookies'),
    path.join(profileDir, 'Cookies'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveBootstrapSourceCookiePath(options: {
  configuredCookiePath?: string | null;
  managedProfileDir: string;
  managedProfileName?: string | null;
}): string | null {
  const configured = options.configuredCookiePath?.trim();
  if (!configured) {
    return null;
  }
  const managedCookiePath = findBrowserCookieFile(options.managedProfileDir, options.managedProfileName ?? 'Default');
  const resolvedConfigured = path.resolve(normalizeConfiguredPath(configured));
  if (managedCookiePath && path.resolve(managedCookiePath) === resolvedConfigured) {
    return null;
  }
  return existsSync(resolvedConfigured) ? resolvedConfigured : null;
}

export function inferSourceUserDataDir(cookiePath: string | null | undefined): string | null {
  const trimmed = cookiePath?.trim();
  if (!trimmed) {
    return null;
  }
  const inferred = inferProfileFromCookiePath(trimmed);
  return inferred?.userDataDir ? path.resolve(inferred.userDataDir) : null;
}

export function inferSourceProfileFromCookiePath(cookiePath: string | null | undefined): {
  userDataDir: string;
  profileName: string;
} | null {
  const trimmed = cookiePath?.trim();
  if (!trimmed) {
    return null;
  }
  const inferred = inferProfileFromCookiePath(trimmed);
  if (!inferred?.userDataDir || !inferred.profileDir) {
    return null;
  }
  return {
    userDataDir: path.resolve(inferred.userDataDir),
    profileName: inferred.profileDir,
  };
}

function normalizeConfiguredPath(value: string): string {
  if (!isWslEnvironment()) {
    return value;
  }
  return toWslPath(value);
}

function shouldIgnoreConfiguredManagedProfileDir(options: {
  resolvedConfiguredDir: string;
  managedProfileRoot: string;
  expectedProfileName: string;
  expectedTarget: string;
}): boolean {
  const relative = path.relative(options.managedProfileRoot, options.resolvedConfiguredDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.length < 2) {
    return false;
  }
  return segments[0] !== options.expectedProfileName || segments[1] !== options.expectedTarget;
}

export async function bootstrapManagedProfile(options: {
  managedProfileDir: string;
  managedProfileName?: string | null;
  sourceCookiePath?: string | null;
  seedPolicy?: ManagedProfileSeedPolicy;
  registryPath?: string;
  logger?: (message: string) => void;
}): Promise<ManagedProfileSeedResult> {
  const source = inferSourceProfileFromCookiePath(options.sourceCookiePath ?? null);
  if (!source) {
    return { cloned: false, reseeded: false, skippedReason: 'missing-source' };
  }

  const managedProfileDir = path.resolve(options.managedProfileDir);
  const managedProfileName = (options.managedProfileName ?? 'Default').trim() || 'Default';
  const resolvedSourceCookiePath =
    options.sourceCookiePath?.trim() ? path.resolve(options.sourceCookiePath) : undefined;
  const sourceUserDataDir = path.resolve(source.userDataDir);
  const sourceProfileName = source.profileName.trim() || 'Default';
  const sourceProfileDir = path.join(sourceUserDataDir, sourceProfileName);
  const logger = options.logger ?? (() => undefined);
  const seedPolicy = options.seedPolicy ?? 'bootstrap-only';
  const managedCookiePath = findBrowserCookieFile(managedProfileDir, managedProfileName);
  const sourceCookieMtimeMs = await readFileMtimeMs(resolvedSourceCookiePath);
  const managedCookieMtimeMs = await readFileMtimeMs(managedCookiePath);

  if (!existsSync(sourceProfileDir)) {
    return {
      cloned: false,
      reseeded: false,
      sourceUserDataDir,
      sourceProfileName,
      sourceCookiePath: resolvedSourceCookiePath,
      sourceCookieMtimeMs,
      managedCookiePath,
      managedCookieMtimeMs,
      skippedReason: 'missing-source-profile',
    };
  }
  if (managedProfileDir === sourceUserDataDir) {
    return {
      cloned: false,
      reseeded: false,
      sourceUserDataDir,
      sourceProfileName,
      sourceCookiePath: resolvedSourceCookiePath,
      sourceCookieMtimeMs,
      managedCookiePath,
      managedCookieMtimeMs,
      skippedReason: 'same-profile',
    };
  }
  const managedHasState = await hasManagedProfileState(managedProfileDir, managedProfileName);
  if (managedHasState) {
    const shouldReseed =
      seedPolicy === 'force-reseed' ||
      (seedPolicy === 'reseed-if-source-newer' && isSourceCookieNewer(sourceCookieMtimeMs, managedCookieMtimeMs));

    if (!shouldReseed) {
      return {
        cloned: false,
        reseeded: false,
        sourceUserDataDir,
        sourceProfileName,
        sourceCookiePath: resolvedSourceCookiePath,
        sourceCookieMtimeMs,
        managedCookiePath,
        managedCookieMtimeMs,
        skippedReason: seedPolicy === 'bootstrap-only' ? 'managed-has-state' : 'source-not-newer',
      };
    }

    if (await hasActiveManagedProfileInstance(managedProfileDir, managedProfileName, options.registryPath)) {
      return {
        cloned: false,
        reseeded: false,
        sourceUserDataDir,
        sourceProfileName,
        sourceCookiePath: resolvedSourceCookiePath,
        sourceCookieMtimeMs,
        managedCookiePath,
        managedCookieMtimeMs,
        skippedReason: 'managed-profile-active',
      };
    }

    logger(`Reseeding managed browser profile from source browser profile ${sourceUserDataDir} (${sourceProfileName})`);
    await rm(managedProfileDir, { recursive: true, force: true });
    await copySourceProfileTree(
      sourceUserDataDir,
      sourceProfileName,
      managedProfileDir,
      managedProfileName,
      logger,
    );
    return {
      cloned: false,
      reseeded: true,
      sourceUserDataDir,
      sourceProfileName,
      sourceCookiePath: resolvedSourceCookiePath,
      sourceCookieMtimeMs,
      managedCookiePath: findBrowserCookieFile(managedProfileDir, managedProfileName),
      managedCookieMtimeMs: await readFileMtimeMs(findBrowserCookieFile(managedProfileDir, managedProfileName)),
    };
  }

  logger(`Bootstrapping managed browser profile from source browser profile ${sourceUserDataDir} (${sourceProfileName})`);
  await copySourceProfileTree(
    sourceUserDataDir,
    sourceProfileName,
    managedProfileDir,
    managedProfileName,
    logger,
  );

  return {
    cloned: true,
    reseeded: false,
    sourceUserDataDir,
    sourceProfileName,
    sourceCookiePath: resolvedSourceCookiePath,
    sourceCookieMtimeMs,
    managedCookiePath: findBrowserCookieFile(managedProfileDir, managedProfileName),
    managedCookieMtimeMs: await readFileMtimeMs(findBrowserCookieFile(managedProfileDir, managedProfileName)),
  };
}

async function hasManagedProfileState(profileDir: string, profileName: string): Promise<boolean> {
  const cookieFile = findBrowserCookieFile(profileDir, profileName);
  if (cookieFile) {
    return true;
  }

  const profilePath = path.join(profileDir, profileName);
  if (!existsSync(profilePath)) {
    return false;
  }

  try {
    const entries = await readdir(profilePath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function hasActiveManagedProfileInstance(
  profileDir: string,
  profileName: string,
  registryPath?: string,
): Promise<boolean> {
  const resolvedProfileDir = path.resolve(profileDir);
  const normalizedProfileName = profileName.trim().toLowerCase();
  const instances = await listInstances({
    registryPath: registryPath ?? path.join(getAuracallHomeDir(), 'browser-state.json'),
  });
  for (const instance of instances) {
    if (path.resolve(instance.profilePath) !== resolvedProfileDir) {
      continue;
    }
    const instanceProfileName = (instance.profileName ?? 'Default').trim().toLowerCase();
    if (instanceProfileName !== normalizedProfileName) {
      continue;
    }
    if (await isChromeAlive(instance.pid, instance.profilePath, instance.port, undefined, instance.host)) {
      return true;
    }
  }
  return (await findChromePidUsingUserDataDir(resolvedProfileDir)) != null;
}

async function copySourceProfileTree(
  sourceUserDataDir: string,
  sourceProfileName: string,
  managedProfileDir: string,
  managedProfileName: string,
  logger: (message: string) => void = () => undefined,
): Promise<void> {
  const sourceProfileDir = path.join(sourceUserDataDir, sourceProfileName);
  const destinationProfileDir = path.join(managedProfileDir, managedProfileName);
  await mkdir(managedProfileDir, { recursive: true });

  logger(
    `Copying ${MANAGED_PROFILE_TOP_LEVEL_BOOTSTRAP_ENTRIES.length + MANAGED_PROFILE_AUTH_STATE_ENTRIES.length} auth/profile entries into managed browser profile ${managedProfileDir}.`,
  );

  for (const entry of MANAGED_PROFILE_TOP_LEVEL_BOOTSTRAP_ENTRIES) {
    const sourcePath = path.join(sourceUserDataDir, entry);
    if (!existsSync(sourcePath)) {
      continue;
    }
    logger(`Copying browser bootstrap state: ${entry}`);
    try {
      await copyProfileEntry(sourcePath, path.join(managedProfileDir, entry), logger);
    } catch (error) {
      if (!isRecoverableCopyError(error)) {
        throw error;
      }
      logger(`Skipping unreadable browser bootstrap state: ${entry}`);
    }
  }

  await mkdir(destinationProfileDir, { recursive: true });
  for (const entry of MANAGED_PROFILE_AUTH_STATE_ENTRIES) {
    const sourcePath = path.join(sourceProfileDir, entry);
    if (!existsSync(sourcePath)) {
      continue;
    }
    logger(`Copying browser auth state: ${managedProfileName}/${entry}`);
    try {
      await copyProfileEntry(sourcePath, path.join(destinationProfileDir, entry), logger);
    } catch (error) {
      if (!isRecoverableCopyError(error)) {
        throw error;
      }
      logger(`Skipping unreadable browser auth state: ${managedProfileName}/${entry}`);
    }
  }

  await sanitizeManagedProfileForAutomation(managedProfileDir, managedProfileName, logger);
}

async function copyProfileEntry(
  sourcePath: string,
  destinationPath: string,
  logger: (message: string) => void = () => undefined,
): Promise<void> {
  if (shouldSkipProfileEntry(sourcePath)) {
    return;
  }
  const sourceDetails = await stat(sourcePath);
  if (sourceDetails.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    const children = await readdir(sourcePath, { withFileTypes: true });
    for (const child of children) {
      const childSourcePath = path.join(sourcePath, child.name);
      const childDestinationPath = path.join(destinationPath, child.name);
      try {
        await copyProfileEntry(childSourcePath, childDestinationPath, logger);
      } catch (error) {
        if (isRecoverableCopyError(error)) {
          continue;
        }
        throw error;
      }
    }
    return;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await copyFile(sourcePath, destinationPath);
  } catch (error) {
    const copiedViaWindows = await tryCopyProfileFileViaWindowsSharedRead(sourcePath, destinationPath, error);
    if (!copiedViaWindows) {
      throw error;
    }
    logger(`Copied locked Chromium state via Windows shared-read fallback: ${path.basename(sourcePath)}`);
  }
}

function shouldSkipProfileEntry(sourcePath: string): boolean {
  const entryName = path.basename(sourcePath).trim().toLowerCase();
  return MANAGED_PROFILE_SKIP_ENTRY_NAMES.has(entryName);
}

function isRecoverableCopyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? error.code : undefined;
  return code === 'EACCES' || code === 'EPERM';
}

async function tryCopyProfileFileViaWindowsSharedRead(
  sourcePath: string,
  destinationPath: string,
  error: unknown,
): Promise<boolean> {
  if (!isRecoverableCopyError(error) || !isWslEnvironment()) {
    return false;
  }

  let sourceWindowsPath: string;
  let destinationWindowsPath: string;
  try {
    sourceWindowsPath = toWindowsPath(sourcePath);
    destinationWindowsPath = toWindowsPath(destinationPath);
  } catch {
    return false;
  }

  const script = buildWindowsSharedReadCopyScript(sourceWindowsPath, destinationWindowsPath);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    await execFileAsync(
      resolveWindowsPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

function buildWindowsSharedReadCopyScript(sourcePath: string, destinationPath: string): string {
  const src = sourcePath.replace(/'/g, "''");
  const dst = destinationPath.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
$sourcePath = '${src}'
$destinationPath = '${dst}'
$destinationDir = [System.IO.Path]::GetDirectoryName($destinationPath)
if ($destinationDir) {
  [System.IO.Directory]::CreateDirectory($destinationDir) | Out-Null
}
$shareMode = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
$source = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $shareMode)
try {
  $destination = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $source.CopyTo($destination)
  } finally {
    $destination.Dispose()
  }
} finally {
  $source.Dispose()
}
`.trim();
}

async function sanitizeManagedProfileForAutomation(
  managedProfileDir: string,
  managedProfileName: string,
  logger: (message: string) => void = () => undefined,
): Promise<void> {
  const profileDir = path.join(managedProfileDir, managedProfileName);
  for (const entry of MANAGED_PROFILE_CRASH_PRUNE_ENTRIES) {
    const entryPath = path.join(profileDir, entry);
    if (!existsSync(entryPath)) {
      continue;
    }
    await rm(entryPath, { recursive: true, force: true });
    logger(`Pruned volatile Chromium session state: ${managedProfileName}/${entry}`);
  }

  await patchJsonFile(path.join(profileDir, 'Preferences'), (doc) => {
    const root = ensurePlainObject(doc);
    const profile = ensurePlainObject(root.profile);
    profile.exit_type = 'Normal';
    profile.exited_cleanly = true;
    root.profile = profile;
    return root;
  });

  await patchJsonFile(path.join(managedProfileDir, 'Local State'), (doc) => {
    const root = ensurePlainObject(doc);
    root.exited_cleanly = true;
    return root;
  });
}

async function patchJsonFile(
  filePath: string,
  mutate: (value: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  if (!existsSync(filePath)) {
    return;
  }
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const next = mutate(ensurePlainObject(parsed));
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // Best effort only; malformed browser state should not abort bootstrap.
  }
}

function ensurePlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function isSourceCookieNewer(sourceCookieMtimeMs: number | null, managedCookieMtimeMs: number | null): boolean {
  if (sourceCookieMtimeMs == null) {
    return false;
  }
  if (managedCookieMtimeMs == null) {
    return true;
  }
  return sourceCookieMtimeMs > managedCookieMtimeMs + 1000;
}

async function readFileMtimeMs(filePath: string | null | undefined): Promise<number | null> {
  if (!filePath) {
    return null;
  }
  try {
    const details = await stat(filePath);
    return details.mtimeMs;
  } catch {
    return null;
  }
}

function sanitizeProfileSegment(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}
