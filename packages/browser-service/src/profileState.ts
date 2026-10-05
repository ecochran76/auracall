import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { findChromePidUsingUserDataDir, isDevToolsResponsive, isChromeAlive, verifyChromeProcessAbsent } from './processCheck.js';

export const CHROMIUM_SESSION_RESTORE_ENTRIES = [
  'Sessions', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs',
] as const;

export async function quarantineColdManagedProfileSessions(input: {
  userDataDir: string;
  profileName: string;
  managedProfileRoot: string;
}): Promise<string | null> {
  const root = path.resolve(input.managedProfileRoot);
  const userDataDir = path.resolve(input.userDataDir);
  if (!userDataDir.startsWith(root + path.sep)) return null;
  if (path.basename(input.profileName) !== input.profileName || ['.', '..'].includes(input.profileName)) {
    throw new Error('Invalid managed browser profile directory name.');
  }
  const profileDir = path.join(userDataDir, input.profileName);
  let names: string[];
  try {
    names = await readdir(profileDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const entries = CHROMIUM_SESSION_RESTORE_ENTRIES.filter(entry => names.includes(entry));
  if (entries.length === 0) return null;
  if (!(await verifyChromeProcessAbsent(userDataDir))) {
    throw new Error('Cannot quarantine browser sessions without proven managed browser absence.');
  }
  const backup = path.join(userDataDir, 'auracall-session-quarantine', randomUUID(), input.profileName);
  await mkdir(backup, { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    await rename(path.join(profileDir, entry), path.join(backup, entry));
  }
  return backup;
}

export type ProfileStateLogger = (message: string) => void;

const DEVTOOLS_ACTIVE_PORT_FILENAME = 'DevToolsActivePort';
const DEVTOOLS_ACTIVE_PORT_RELATIVE_PATHS = [
  DEVTOOLS_ACTIVE_PORT_FILENAME,
  path.join('Default', DEVTOOLS_ACTIVE_PORT_FILENAME),
] as const;

const CHROME_PID_FILENAME = 'chrome.pid';
const CHROME_LOCK_FILE_NAMES = new Set([
  'lockfile',
  'lock',
  'singletonlock',
  'singletonsocket',
  'singletoncookie',
]);

export function getDevToolsActivePortPaths(userDataDir: string): string[] {
  return DEVTOOLS_ACTIVE_PORT_RELATIVE_PATHS.map((relative) => path.join(userDataDir, relative));
}

export async function readDevToolsPort(userDataDir: string): Promise<number | null> {
  for (const candidate of getDevToolsActivePortPaths(userDataDir)) {
    try {
      const raw = await readFile(candidate, 'utf8');
      const firstLine = raw.split(/\r?\n/u)[0]?.trim();
      const port = Number.parseInt(firstLine ?? '', 10);
      if (Number.isFinite(port)) {
        return port;
      }
    } catch {
      // ignore missing/unreadable candidates
    }
  }
  return null;
}

export async function writeDevToolsActivePort(userDataDir: string, port: number): Promise<void> {
  const contents = `${port}\n/devtools/browser`;
  for (const candidate of getDevToolsActivePortPaths(userDataDir)) {
    try {
      await mkdir(path.dirname(candidate), { recursive: true });
      await writeFile(candidate, contents, 'utf8');
    } catch {
      // best effort
    }
  }
}

export async function readChromePid(userDataDir: string): Promise<number | null> {
  const pidPath = path.join(userDataDir, CHROME_PID_FILENAME);
  try {
    const raw = (await readFile(pidPath, 'utf8')).trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

export async function writeChromePid(userDataDir: string, pid: number): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) return;
  const pidPath = path.join(userDataDir, CHROME_PID_FILENAME);
  try {
    await mkdir(path.dirname(pidPath), { recursive: true });
    await writeFile(pidPath, `${Math.trunc(pid)}\n`, 'utf8');
  } catch {
    // best effort
  }
}


export async function shouldCleanupManualLoginProfileState(
  userDataDir: string,
  logger?: ProfileStateLogger,
  options: {
    connectionClosedUnexpectedly?: boolean;
    host?: string;
    probe?: (opts: { port: number; host?: string }) => Promise<boolean>;
  } = {},
): Promise<boolean> {
  if (!options.connectionClosedUnexpectedly) {
    return true;
  }
  const port = await readDevToolsPort(userDataDir);
  if (!port) {
    return true;
  }
  const alive = await (options.probe ?? isDevToolsResponsive)({ port, host: options.host });
  if (alive) {
    logger?.(`DevTools port ${port} still reachable; preserving manual-login profile state`);
    return false;
  }
  logger?.(`DevTools port ${port} unreachable; clearing stale profile state`);
  return true;
}

export async function cleanupStaleProfileState(
  userDataDir: string,
  logger?: ProfileStateLogger,
  options: { lockRemovalMode?: 'never' | 'if_recorded_pid_dead' | 'force' } = {},
): Promise<void> {
  for (const candidate of getDevToolsActivePortPaths(userDataDir)) {
    try {
      await rm(candidate, { force: true });
      logger?.(`Removed stale DevToolsActivePort: ${candidate}`);
    } catch {
      // ignore cleanup errors
    }
  }

  const lockRemovalMode = options.lockRemovalMode ?? 'never';
  if (lockRemovalMode === 'never') {
    return;
  }

  if (await findChromePidUsingUserDataDir(userDataDir)) {
    logger?.('Detected running Chrome using this profile; skipping profile lock cleanup');
    return;
  }

  if (lockRemovalMode === 'force') {
    await removeChromeProfileLocks(userDataDir);
    logger?.('Force-cleaned Chrome profile locks');
    return;
  }

  const pid = await readChromePid(userDataDir);
  if (!pid) {
    return;
  }
  // Robust check: verify the PID is actually *our* Chrome instance.
  // If PID is reused by a random process, isChromeAlive returns false, allowing cleanup.
  if (await isChromeAlive(pid, userDataDir)) {
    logger?.(`Chrome pid ${pid} still alive; skipping profile lock cleanup`);
    return;
  }

  await removeChromeProfileLocks(userDataDir);
  logger?.('Cleaned up stale Chrome profile locks');
}

async function removeChromeProfileLocks(rootDir: string): Promise<void> {
  await removeChromeProfileLocksRecursive(rootDir);
}

async function removeChromeProfileLocksRecursive(currentDir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await removeChromeProfileLocksRecursive(entryPath);
      continue;
    }
    if (!CHROME_LOCK_FILE_NAMES.has(entry.name.trim().toLowerCase())) {
      continue;
    }
    await rm(entryPath, { force: true }).catch(() => undefined);
  }
}
