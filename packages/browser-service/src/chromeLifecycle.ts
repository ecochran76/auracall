import { rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import CDP from 'chrome-remote-interface';
import { launch, Launcher, type LaunchedChrome } from 'chrome-launcher';
import type { BrowserLogger, ResolvedBrowserConfig, ChromeClient } from './types.js';
import { cleanupStaleProfileState, readDevToolsPort } from './profileState.js';
import { isDevToolsResponsive, findChromePidUsingUserDataDir } from './processCheck.js';
import { findActiveInstance, registerInstance, unregisterInstance } from './service/stateRegistry.js';
import { resolveProfileDirectoryName } from './service/profile.js';

const execFileAsync = promisify(execFile);

export async function launchChrome(
  config: ResolvedBrowserConfig,
  userDataDir: string,
  logger: BrowserLogger,
  options: { registryPath?: string } = {},
) {
  const registryOptions = options.registryPath ? { registryPath: options.registryPath } : null;
  const resolvedProfileName = resolveProfileDirectoryName(userDataDir, config.chromeProfile ?? 'Default');
  logger(`Using Chrome profile directory "${resolvedProfileName}" in ${userDataDir}.`);
  // 1. Check persistent registry first
  const registered = registryOptions
    ? await findActiveInstance(registryOptions, userDataDir, resolvedProfileName)
    : null;
  if (registered) {
    logger(`Found active Chrome instance in registry (pid ${registered.pid}, port ${registered.port}); reusing.`);
    return {
      pid: registered.pid,
      port: registered.port,
      kill: async () => { logger('Skipping shutdown of reused Chrome instance.'); },
      process: undefined,
      host: registered.host,
    } as unknown as LaunchedChrome & { host?: string };
  }

  // 2. Legacy Fallback: check if this profile is already active via OS/FS
  const existingPid = await findChromePidUsingUserDataDir(userDataDir);
  if (existingPid) {
    const oracleHome = path.resolve(os.homedir(), '.oracle');
    const isOracleManagedProfile = path.resolve(userDataDir).startsWith(oracleHome + path.sep);
    const blockingAction = config.blockingProfileAction ?? 'restart-oracle';
    const requestedProfile = resolvedProfileName.trim();
    const isDefaultProfile = requestedProfile.toLowerCase() === 'default';
    const activePort = await readDevToolsPort(userDataDir);
    const connectHost = resolveRemoteDebugHost() || '127.0.0.1';
    if (activePort && await isDevToolsResponsive({ host: connectHost, port: activePort })) {
      if (isDefaultProfile) {
        logger(`Found running Chrome using profile ${userDataDir} on port ${activePort} (not in registry); adopting.`);
        if (registryOptions) {
          await registerInstance(registryOptions, {
            pid: existingPid,
            port: activePort,
            host: connectHost,
            profilePath: userDataDir,
            profileName: resolvedProfileName,
            type: 'chrome',
            launchedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        }
        return {
          pid: undefined, // We don't own the PID, so we don't return it to avoid killing it
          port: activePort,
          kill: async () => { logger('Skipping shutdown of reused Chrome instance.'); },
          process: undefined,
          host: connectHost,
        } as unknown as LaunchedChrome & { host?: string };
      }
      if (blockingAction === 'fail' || (blockingAction === 'restart-oracle' && !isOracleManagedProfile)) {
        throw new Error(
          `Chrome is already running with profile ${userDataDir}, but Oracle needs profile "${requestedProfile}". ` +
          `Close Chrome and retry so Oracle can launch the correct profile.`,
        );
      }
      logger(
        `Chrome is running with profile ${userDataDir} but "${requestedProfile}" was requested; restarting to ensure the correct profile.`,
      );
      await terminateChromeProcess(existingPid, logger);
    }
    if (blockingAction === 'fail' || (blockingAction === 'restart-oracle' && !isOracleManagedProfile)) {
      throw new Error(
        `Chrome is already running with profile ${userDataDir}, but DevTools is not enabled. ` +
        `Close Chrome and retry so Oracle can relaunch with remote debugging enabled.`,
      );
    }
    if (!isOracleManagedProfile && blockingAction === 'restart') {
      logger(`Forcing restart of user-managed Chrome profile ${userDataDir} (blockingProfileAction=restart).`);
    }
    logger(`Chrome (pid ${existingPid}) is running with profile ${userDataDir} but DevTools port is unreachable. Killing it to release lock.`);
    await terminateChromeProcess(existingPid, logger);
  }

  if (!config.headless && process.platform === 'linux') {
    const overrideDisplay = config.display ?? process.env.ORACLE_BROWSER_DISPLAY;
    if (overrideDisplay) {
      process.env.DISPLAY = overrideDisplay;
      logger(`DISPLAY override set to ${overrideDisplay}.`);
    } else {
      const display = process.env.DISPLAY;
      if (!display || display === '0' || display === '0.0' || display === ':0' || display === ':0.0') {
        process.env.DISPLAY = ':0.0';
        logger('DISPLAY not set; defaulting to :0.0 for Chrome launch.');
      }
    }
    if (!process.env.XAUTHORITY) {
      const fallback = path.join(os.homedir(), '.Xauthority');
      if (existsSync(fallback)) {
        process.env.XAUTHORITY = fallback;
        logger(`XAUTHORITY not set; using ${fallback}.`);
      }
    }
  }
  const minimalFlags = Boolean(config.manualLogin);
  const connectHost = resolveRemoteDebugHost();
  const debugBindAddress = connectHost && connectHost !== '127.0.0.1' ? '0.0.0.0' : connectHost;
  const debugPort = config.debugPort ?? parseDebugPortEnv();
  const chromeFlags = buildChromeFlags(
    config.headless ?? false,
    debugBindAddress,
    resolvedProfileName ?? undefined,
    { minimal: minimalFlags },
  );
  const bypassUserDataDir = shouldBypassLauncherUserDataDir(config.chromePath ?? undefined);
  const userDataDirFlag = `--user-data-dir=${resolveUserDataDirFlag(userDataDir, config.chromePath ?? undefined)}`;
  const effectiveChromeFlags =
    bypassUserDataDir && !chromeFlags.some((flag) => flag.startsWith('--user-data-dir='))
      ? [...chromeFlags, userDataDirFlag]
      : chromeFlags;
  const launcherUserDataDir = bypassUserDataDir ? false : userDataDir;
  logger(
    `[browser] chrome flags (${minimalFlags ? 'minimal' : 'default'}): ` +
      `${effectiveChromeFlags.join(' ')}`,
  );

  const usePatchedLauncher = Boolean(connectHost && connectHost !== '127.0.0.1');
  let launcher: LaunchedChrome;
  try {
    launcher = usePatchedLauncher
      ? await launchWithCustomHost({
          chromeFlags: effectiveChromeFlags,
          chromePath: config.chromePath ?? undefined,
          userDataDir: launcherUserDataDir,
          host: connectHost ?? '127.0.0.1',
          requestedPort: debugPort ?? undefined,
          ignoreDefaultFlags: minimalFlags,
        })
      : await launch({
          chromePath: config.chromePath ?? undefined,
          chromeFlags: effectiveChromeFlags,
          userDataDir: launcherUserDataDir,
          handleSIGINT: false,
          port: debugPort ?? undefined,
          ignoreDefaultFlags: minimalFlags,
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to launch Chrome: ${message}`);
    throw error;
  }
  const pidLabel = typeof launcher.pid === 'number' ? ` (pid ${launcher.pid})` : '';
  const hostLabel = connectHost ? ` on ${connectHost}` : '';
  logger(`Launched Chrome${pidLabel} on port ${launcher.port}${hostLabel}`);

  const reachable = await waitForDevTools({ host: connectHost ?? '127.0.0.1', port: launcher.port, logger });
  if (!reachable) {
    throw new Error(
      `Chrome launched but DevTools port ${connectHost ?? '127.0.0.1'}:${launcher.port} is unreachable. ` +
      `If Chrome is already running with this profile, close it and retry.`,
    );
  }

  if (launcher.pid && registryOptions) {
    await registerInstance(registryOptions, {
      pid: launcher.pid,
      port: launcher.port,
      host: connectHost ?? '127.0.0.1',
      profilePath: userDataDir,
      profileName: resolvedProfileName,
      type: 'chrome',
      launchedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  }

  const originalKill = launcher.kill;
  const kill = async () => {
    if (registryOptions) {
      await unregisterInstance(registryOptions, userDataDir, resolvedProfileName);
    }
    return originalKill();
  };

  return Object.assign(launcher, { kill, host: connectHost ?? '127.0.0.1' }) as LaunchedChrome & { host?: string };
}

async function waitForDevTools(options: { host: string; port: number; logger: BrowserLogger }): Promise<boolean> {
  const { host, port, logger } = options;
  const attempts = 10;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isDevToolsResponsive({ host, port })) {
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  logger(`DevTools port ${host}:${port} did not respond after ${attempts} attempts.`);
  return false;
}

async function terminateChromeProcess(pid: number, logger: BrowserLogger): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise(r => setTimeout(r, 1500));
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // already stopped
    }
  } catch (e) {
    logger(`Failed to kill Chrome process: ${e}`);
  }
}

export function registerTerminationHooks(
  chrome: LaunchedChrome,
  userDataDir: string,
  keepBrowser: boolean,
  logger: BrowserLogger,
  opts?: {
    /** Return true when the run is still in-flight (assistant response pending). */
    isInFlight?: () => boolean;
    /** Persist runtime hints so reattach can find the live Chrome. */
    emitRuntimeHint?: () => Promise<void>;
    /** Preserve the profile directory even when Chrome is terminated. */
    preserveUserDataDir?: boolean;
  },
): () => void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  let handling: boolean | undefined;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (handling) {
      return;
    }
    handling = true;
    const inFlight = opts?.isInFlight?.() ?? false;
    const leaveRunning = keepBrowser || inFlight;
    if (leaveRunning) {
      logger(`Received ${signal}; leaving Chrome running${inFlight ? ' (assistant response pending)' : ''}`);
    } else {
      logger(`Received ${signal}; terminating Chrome process`);
    }
    void (async () => {
      if (leaveRunning) {
        // Ensure reattach hints are written before we exit.
        await opts?.emitRuntimeHint?.().catch(() => undefined);
        if (inFlight) {
          logger('Session still in flight; reattach with "oracle session <slug>" to continue.');
        }
      } else {
        try {
          await chrome.kill();
        } catch {
          // ignore kill failures
        }
        if (opts?.preserveUserDataDir) {
          // Preserve the profile directory (manual login), but clear reattach hints so we don't
          // try to reuse a dead DevTools port on the next run.
          await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'never' }).catch(() => undefined);
        } else {
          await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    })().finally(() => {
      const exitCode = signal === 'SIGINT' ? 130 : 1;
      // Vitest treats any `process.exit()` call as an unhandled failure, even if mocked.
      // Keep production behavior (hard-exit on signals) while letting tests observe state changes.
      process.exitCode = exitCode;
      const isTestRun = process.env.VITEST === '1' || process.env.NODE_ENV === 'test';
      if (!isTestRun) {
        process.exit(exitCode);
      }
    });
  };

  for (const signal of signals) {
    process.on(signal, handleSignal);
  }

  return () => {
    for (const signal of signals) {
      process.removeListener(signal, handleSignal);
    }
  };
}

export async function hideChromeWindow(chrome: LaunchedChrome, logger: BrowserLogger): Promise<void> {
  if (process.platform !== 'darwin') {
    logger('Window hiding is only supported on macOS');
    return;
  }
  if (!chrome.pid) {
    logger('Unable to hide window: missing Chrome PID');
    return;
  }
  const script = `tell application "System Events"
    try
      set visible of (first process whose unix id is ${chrome.pid}) to false
    end try
  end tell`;
  try {
    await execFileAsync('osascript', ['-e', script]);
    logger('Chrome window hidden (Cmd-H)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to hide Chrome window: ${message}`);
  }
}

export async function connectToChrome(port: number, logger: BrowserLogger, host?: string): Promise<ChromeClient> {
  const client = await CDP({ port, host });
  logger('Connected to Chrome DevTools protocol');
  return client;
}

// NOTE: resolveWslHost/buildWslFirewallHint are defined below near isWsl to reuse helpers.

export async function connectToRemoteChrome(
  host: string,
  port: number,
  logger: BrowserLogger,
  targetUrl?: string,
): Promise<RemoteChromeConnection> {
  if (targetUrl) {
    try {
      const target = await CDP.New({ host, port, url: targetUrl });
      const client = await CDP({ host, port, target: target.id });
      logger(`Opened dedicated remote Chrome tab targeting ${targetUrl}`);
      return { client, targetId: target.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to open dedicated remote Chrome tab (${message}); falling back to first target.`);
    }
  }
  const fallbackClient = await CDP({ host, port });
  logger(`Connected to remote Chrome DevTools protocol at ${host}:${port}`);
  return { client: fallbackClient };
}

export async function closeRemoteChromeTarget(
  host: string,
  port: number,
  targetId: string | undefined,
  logger: BrowserLogger,
): Promise<void> {
  if (!targetId) {
    return;
  }
  try {
    await CDP.Close({ host, port, id: targetId });
    if (logger.verbose) {
      logger(`Closed remote Chrome tab ${targetId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to close remote Chrome tab ${targetId}: ${message}`);
  }
}

export interface RemoteChromeConnection {
  client: ChromeClient;
  targetId?: string;
}

function buildChromeFlags(
  headless: boolean,
  debugBindAddress?: string | null,
  chromeProfile?: string,
  options: { minimal?: boolean } = {},
): string[] {
  const flags = options.minimal
    ? ['--new-window']
    : [
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-features=TranslateUI,AutomationControlled',
        '--mute-audio',
        '--window-size=1280,720',
        '--lang=en-US',
        '--accept-lang=en-US,en',
      ];
  if (chromeProfile) {
    flags.push(`--profile-directory=${chromeProfile}`);
  }

  if (!options.minimal && process.platform !== 'win32' && !isWsl()) {
    flags.push('--password-store=basic');
    if (process.platform === 'darwin') {
      flags.push('--use-mock-keychain');
    }
  }

  if (debugBindAddress) {
    flags.push(`--remote-debugging-address=${debugBindAddress}`);
  }

  if (headless) {
    flags.push('--headless=new');
  }

  return flags;
}

function parseDebugPortEnv(): number | null {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return null;
  }
  return value;
}

function resolveRemoteDebugHost(): string | null {
  return resolveWslHost();
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  const release = os.release();
  return release.toLowerCase().includes('microsoft');
}

export function resolveWslHost(): string | null {
  const override = process.env.ORACLE_BROWSER_REMOTE_DEBUG_HOST?.trim() || process.env.WSL_HOST_IP?.trim();
  if (override) {
    return override;
  }
  if (!isWsl()) {
    return null;
  }
  try {
    const resolv = readFileSync('/etc/resolv.conf', 'utf8');
    for (const line of resolv.split('\n')) {
      const match = line.match(/^nameserver\s+([0-9.]+)/);
      if (match?.[1]) {
        return match[1];
      }
    }
  } catch {
    // ignore; fall back to localhost
  }
  return null;
}

export function buildWslFirewallHint(host: string, devtoolsPort: number): string | null {
  if (!isWsl()) {
    return null;
  }
  return [
    `DevTools port ${host}:${devtoolsPort} is blocked from WSL.`,
    'PowerShell (admin):',
    `New-NetFirewallRule -DisplayName 'Chrome DevTools ${devtoolsPort}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${devtoolsPort}`,
    "New-NetFirewallRule -DisplayName 'Chrome DevTools (chrome.exe)' -Direction Inbound -Action Allow -Program 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -Protocol TCP",
  ].join(' ');
}


async function launchWithCustomHost({
  chromeFlags,
  chromePath,
  userDataDir,
  host,
  requestedPort,
  ignoreDefaultFlags,
}: {
  chromeFlags: string[];
  chromePath?: string | null;
  userDataDir: string | boolean;
  host: string | null;
  requestedPort?: number;
  ignoreDefaultFlags?: boolean;
}): Promise<LaunchedChrome & { host?: string }> {
  const launcher = new Launcher({
    chromePath: chromePath ?? undefined,
    chromeFlags,
    userDataDir,
    handleSIGINT: false,
    port: requestedPort ?? undefined,
    ignoreDefaultFlags: Boolean(ignoreDefaultFlags),
  });

  if (host) {
    const patched = launcher as unknown as { isDebuggerReady?: () => Promise<void>; port?: number };
    patched.isDebuggerReady = function patchedIsDebuggerReady(this: Launcher & { port?: number }): Promise<void> {
      const debugPort = this.port ?? 0;
      if (!debugPort) {
        return Promise.reject(new Error('Missing Chrome debug port'));
      }
      return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: debugPort, host });
        const cleanup = () => {
          client.removeAllListeners();
          client.end();
          client.destroy();
          client.unref();
        };
        client.once('error', (err) => {
          cleanup();
          reject(err);
        });
        client.once('connect', () => {
          cleanup();
          resolve();
        });
      });
    };
  }

  await launcher.launch();

  const kill = async () => launcher.kill();
  return {
    pid: launcher.pid ?? undefined,
    port: launcher.port ?? 0,
    process: launcher.chromeProcess as unknown as NonNullable<LaunchedChrome['process']>,
    kill,
    host: host ?? undefined,
    remoteDebuggingPipes: launcher.remoteDebuggingPipes,
  } as unknown as LaunchedChrome & { host?: string };
}

function shouldBypassLauncherUserDataDir(_chromePath?: string): boolean {
  return isWsl();
}

function resolveUserDataDirFlag(userDataDir: string, chromePath?: string): string {
  if (!isWsl()) {
    return userDataDir;
  }
  const windowsChrome = Boolean(chromePath && /^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath));
  if (!windowsChrome) {
    return userDataDir;
  }
  return toWin32Path(userDataDir);
}

function toWin32Path(value: string): string {
  if (/^[a-zA-Z]:\\/.test(value)) {
    return value;
  }
  if (/^[a-zA-Z]:\//.test(value)) {
    return value.replace(/\//g, '\\');
  }
  if (value.startsWith('/mnt/')) {
    const drive = value[5]?.toLowerCase();
    if (drive && value[6] === '/') {
      return `${drive.toUpperCase()}:\\${value.slice(7).replace(/\//g, '\\')}`;
    }
  }
  if (value.startsWith('/')) {
    return `\\\\wsl.localhost\\${process.env.WSL_DISTRO_NAME ?? 'Ubuntu'}${value.replace(/\//g, '\\')}`;
  }
  return value;
}
