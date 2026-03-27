import { rm, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import CDP from 'chrome-remote-interface';
import { launch, Launcher, type LaunchedChrome } from 'chrome-launcher';
import type { BrowserLogger, ResolvedBrowserConfig, ChromeClient } from './types.js';
import { cleanupStaleProfileState, readDevToolsPort, readChromePid, writeDevToolsActivePort } from './profileState.js';
import {
  findChromePidUsingUserDataDir,
  findChromeProcessUsingUserDataDir,
  findResponsiveWindowsDevToolsPortForUserDataDir,
  isDevToolsResponsive,
  probeWindowsLocalDevToolsPort,
} from './processCheck.js';
import { isWindowsPath, isWslEnvironment, toWindowsPath } from './platformPaths.js';
import { findActiveInstance, registerInstance, unregisterInstance } from './service/stateRegistry.js';
import { resolveProfileDirectoryName } from './service/profile.js';
import {
  DEFAULT_DEBUG_PORT,
  DEFAULT_DEBUG_PORT_RANGE,
  pickAvailableDebugPort,
} from './portSelection.js';
import {
  ensureDetachedWindowsLoopbackRelay,
  isWindowsLoopbackRemoteHost,
  resolveChromeEndpoint,
  resolveWindowsPowerShellPath,
  WINDOWS_LOOPBACK_REMOTE_HOST,
} from './windowsLoopbackRelay.js';

const execFileAsync = promisify(execFile);
const WINDOWS_WSL_DISCOVERY_ATTEMPTS = 40;
const WINDOWS_WSL_DISCOVERY_DELAY_MS = 250;

export async function launchChrome(
  config: ResolvedBrowserConfig,
  userDataDir: string,
  logger: BrowserLogger,
  options: {
    registryPath?: string;
    onWindowsRetry?: (context: { failedPort: number; nextPort: number; attempt: number }) => Promise<void>;
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
  } = {},
) {
  const registryOptions = options.registryPath ? { registryPath: options.registryPath } : null;
  const resolvedProfileName = resolveProfileDirectoryName(userDataDir, config.chromeProfile ?? 'Default');
  const windowsChromeFromWsl = isWindowsHostedChromePath(config.chromePath ?? undefined);
  logger(`Using Chrome profile directory "${resolvedProfileName}" in ${userDataDir}.`);
  // 1. Check persistent registry first
  const registered = registryOptions
    ? await findActiveInstance(registryOptions, userDataDir, resolvedProfileName)
    : null;
  if (registered) {
    if (isCurrentRunOwnedChrome(registered.pid, registered.port, options)) {
      logger(
        `Found active Chrome instance in registry (pid ${registered.pid}, port ${registered.port}) started by this run; reusing with cleanup ownership.`,
      );
      return createAdoptedChromeHandle({
        pid: registered.pid,
        port: registered.port,
        host: registered.host,
        logger,
        registryOptions,
        profilePath: userDataDir,
        profileName: resolvedProfileName,
        windowsChromeFromWsl,
        skipShutdown: false,
      });
    }
    logger(`Found active Chrome instance in registry (pid ${registered.pid}, port ${registered.port}); reusing.`);
    return createAdoptedChromeHandle({
      pid: registered.pid,
      port: registered.port,
      host: registered.host,
      logger,
      registryOptions,
      profilePath: userDataDir,
      profileName: resolvedProfileName,
      windowsChromeFromWsl,
      skipShutdown: true,
    });
  }

  // 2. Legacy Fallback: check if this profile is already active via OS/FS
  const existingProcess = await findChromeProcessUsingUserDataDir(userDataDir);
  const existingPid = existingProcess?.pid ?? null;
  if (existingPid) {
    const managedProfileRoot = config.managedProfileRoot
      ? path.resolve(config.managedProfileRoot)
      : null;
    const isManagedProfile = managedProfileRoot
      ? path.resolve(userDataDir).startsWith(managedProfileRoot + path.sep)
      : false;
    const blockingAction = config.blockingProfileAction ?? 'restart-managed';
    const requestedProfile = resolvedProfileName.trim();
    const isDefaultProfile = requestedProfile.toLowerCase() === 'default';
    const activePort = windowsChromeFromWsl
      ? await discoverWindowsChromeDevToolsPort({
          userDataDir,
          requestedPort: existingProcess?.port ?? null,
          pid: existingPid,
          logger,
        })
      : await readDevToolsPort(userDataDir) ?? existingProcess?.port ?? null;
    const probeHost = resolveRemoteDebugHost(config.chromePath ?? undefined) || '127.0.0.1';
    if (activePort && await isDevToolsResponsive({ host: probeHost, port: activePort })) {
      const runtimeHost = await ensurePersistentDevToolsEndpoint(activePort, probeHost, logger);
      if (isDefaultProfile) {
        if (isCurrentRunOwnedChrome(existingPid, activePort, options)) {
          logger(
            `Found running Chrome using profile ${userDataDir} on port ${activePort} started by this run; re-adopting with cleanup ownership.`,
          );
          if (registryOptions) {
            await registerInstance(registryOptions, {
              pid: existingPid,
              port: activePort,
              host: runtimeHost,
              profilePath: userDataDir,
              profileName: resolvedProfileName,
              type: 'chrome',
              launchedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            });
          }
          return createAdoptedChromeHandle({
            pid: existingPid,
            port: activePort,
            host: runtimeHost,
            logger,
            registryOptions,
            profilePath: userDataDir,
            profileName: resolvedProfileName,
            windowsChromeFromWsl,
            skipShutdown: false,
          });
        }
        logger(`Found running Chrome using profile ${userDataDir} on port ${activePort} (not in registry); adopting.`);
        if (registryOptions) {
          await registerInstance(registryOptions, {
            pid: existingPid,
            port: activePort,
            host: runtimeHost,
            profilePath: userDataDir,
            profileName: resolvedProfileName,
            type: 'chrome',
            launchedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        }
        return createAdoptedChromeHandle({
          pid: existingPid,
          port: activePort,
          host: runtimeHost,
          logger,
          registryOptions,
          profilePath: userDataDir,
          profileName: resolvedProfileName,
          windowsChromeFromWsl,
          skipShutdown: true,
        });
      }
      if (blockingAction === 'fail' || (blockingAction === 'restart-managed' && !isManagedProfile)) {
        throw new Error(
          `Chrome is already running with profile ${userDataDir}, but the automation needs profile "${requestedProfile}". ` +
          `Close Chrome and retry so it can launch the correct profile.`,
        );
      }
      logger(
        `Chrome is running with profile ${userDataDir} but "${requestedProfile}" was requested; restarting to ensure the correct profile.`,
      );
      await terminateChromeProcess(existingPid, logger);
    }
    if (blockingAction === 'fail' || (blockingAction === 'restart-managed' && !isManagedProfile)) {
      throw new Error(
        `Chrome is already running with profile ${userDataDir}, but DevTools is not enabled. ` +
        `Close Chrome and retry so it can relaunch with remote debugging enabled.`,
      );
    }
    if (!isManagedProfile && blockingAction === 'restart') {
      logger(`Forcing restart of user-managed Chrome profile ${userDataDir} (blockingProfileAction=restart).`);
    }
    logger(`Chrome (pid ${existingPid}) is running with profile ${userDataDir} but DevTools port is unreachable. Killing it to release lock.`);
    await terminateChromeProcess(existingPid, logger);
  }

  if (!config.headless && process.platform === 'linux') {
    const overrideDisplay =
      config.display ?? process.env.BROWSER_SERVICE_BROWSER_DISPLAY ?? process.env.AURACALL_BROWSER_DISPLAY;
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
  const probeHost = resolveRemoteDebugHost(config.chromePath ?? undefined);
  const debugBindAddress =
    probeHost && probeHost !== '127.0.0.1' && !isWindowsLoopbackRemoteHost(probeHost) ? '0.0.0.0' : undefined;
  const requestedDebugPort = config.debugPort ?? parseDebugPortEnv();
  const useAutoDebugPort = windowsChromeFromWsl && config.debugPortStrategy === 'auto';
  const debugPort = useAutoDebugPort
    ? 0
    : windowsChromeFromWsl
      ? await pickAvailableDebugPort(
          requestedDebugPort ?? DEFAULT_DEBUG_PORT,
          logger,
          config.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE,
        )
      : requestedDebugPort;
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

  const usePatchedLauncher = Boolean(probeHost && probeHost !== '127.0.0.1');
  const maxLaunchAttempts = windowsChromeFromWsl ? 8 : 1;
  const attemptedPorts: number[] = [];
  let launcher: LaunchedChrome | undefined;
  let requestedLaunchPort = debugPort ?? DEFAULT_DEBUG_PORT;
  if (useAutoDebugPort) {
    logger('Using Windows-assigned DevTools port (--remote-debugging-port=0) for WSL launch reliability.');
  }
  let reachable = false;
  const attemptedPortLabels: string[] = [];

  for (let attempt = 0; attempt < maxLaunchAttempts; attempt += 1) {
    attemptedPorts.push(requestedLaunchPort);
    attemptedPortLabels.push(windowsChromeFromWsl && requestedLaunchPort === 0 ? 'auto' : String(requestedLaunchPort));
    try {
      launcher = windowsChromeFromWsl
        ? await launchWindowsChromeFromWsl({
            chromePath: config.chromePath ?? undefined,
            chromeFlags: effectiveChromeFlags,
            userDataDir,
            requestedPort: requestedLaunchPort,
            logger,
          })
        : usePatchedLauncher
          ? await launchWithCustomHost({
              chromeFlags: effectiveChromeFlags,
              chromePath: config.chromePath ?? undefined,
              userDataDir: launcherUserDataDir,
              host: probeHost ?? '127.0.0.1',
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
    const hostLabel = probeHost ? ` on ${probeHost}` : '';
    logger(`Launched Chrome${pidLabel} on port ${launcher.port}${hostLabel}`);

    if (windowsChromeFromWsl) {
      const discoveredPort = await discoverWindowsChromeDevToolsPort({
        userDataDir,
        requestedPort: launcher.port,
        pid: launcher.pid ?? null,
        logger,
      });
      if (discoveredPort && discoveredPort !== launcher.port) {
        logger(
          `Windows Chrome exposed DevTools on ${discoveredPort} instead of requested ${launcher.port}; adopting the live endpoint.`,
        );
        launcher.port = discoveredPort;
      }
    }

    reachable = await waitForDevTools({ host: probeHost ?? '127.0.0.1', port: launcher.port, logger });
    if (reachable) {
      break;
    }

    await safeKillLaunchedChrome(launcher, logger);
    if (windowsChromeFromWsl) {
      await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'force' }).catch(() => undefined);
    }
    if (attempt >= maxLaunchAttempts - 1) {
      break;
    }
    const retryPort = useAutoDebugPort
      ? 0
      : await pickAvailableDebugPort((launcher.port || requestedLaunchPort) + 1, logger, null);
    await options.onWindowsRetry?.({
      failedPort: launcher.port || requestedLaunchPort,
      nextPort: retryPort,
      attempt: attempt + 1,
    });
    logger(
      useAutoDebugPort
        ? 'Windows Chrome did not expose an auto-assigned DevTools port; retrying launch with a fresh auto-assigned port.'
        : `Windows Chrome did not expose DevTools on ${launcher.port}; retrying launch on ${retryPort}.`,
    );
    requestedLaunchPort = retryPort;
  }

  if (!launcher || !reachable) {
    const attemptedPortLabel = attemptedPortLabels.length > 0 ? ` after trying ${attemptedPortLabels.join(', ')}` : '';
    throw new Error(
      `Chrome launched but DevTools port ${probeHost ?? '127.0.0.1'}:${requestedLaunchPort} is unreachable${attemptedPortLabel}. ` +
      `If Chrome is already running with this profile, close it and retry.`,
    );
  }
  const runtimeHost = await ensurePersistentDevToolsEndpoint(launcher.port, probeHost ?? '127.0.0.1', logger);

  if (launcher.pid && registryOptions) {
    await registerInstance(registryOptions, {
      pid: launcher.pid,
      port: launcher.port,
      host: runtimeHost,
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

  return Object.assign(launcher, { kill, host: runtimeHost }) as LaunchedChrome & { host?: string };
}

async function safeKillLaunchedChrome(chrome: LaunchedChrome, logger: BrowserLogger): Promise<void> {
  try {
    await chrome.kill();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to terminate unreachable Chrome process: ${message}`);
  }
}

async function waitForDevTools(options: { host: string; port: number; logger: BrowserLogger }): Promise<boolean> {
  const { host, port, logger } = options;
  if (isWindowsLoopbackRemoteHost(host)) {
    const localReady = await waitForWindowsLocalDevTools(port);
    if (!localReady) {
      logger(`Windows Chrome loopback 127.0.0.1:${port} did not expose DevTools after 12 attempts.`);
      return false;
    }
    const relayAttempts = 12;
    const relayDelayMs = 250;
    for (let attempt = 0; attempt < relayAttempts; attempt += 1) {
      if (await isDevToolsResponsive({ host, port })) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, relayDelayMs));
    }
    logger(`DevTools port ${host}:${port} did not respond through the local relay after ${relayAttempts} attempts.`);
    return false;
  }
  const attempts = isWindowsLoopbackRemoteHost(host) ? 60 : 10;
  const delayMs = isWindowsLoopbackRemoteHost(host) ? 500 : 200;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isDevToolsResponsive({ host, port })) {
      return true;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  logger(`DevTools port ${host}:${port} did not respond after ${attempts} attempts.`);
  return false;
}

async function waitForWindowsLocalDevTools(port: number): Promise<boolean> {
  return probeWindowsLocalDevToolsPort(port, { attempts: 12, delayMs: 500 });
}

export async function discoverWindowsChromeDevToolsPort(options: {
  userDataDir: string;
  requestedPort?: number | null;
  pid?: number | null;
  logger?: BrowserLogger;
}): Promise<number | null> {
  if (!isWsl() || !/^\/mnt\/[a-z]\//i.test(userDataDirToComparablePath(options.userDataDir))) {
    return null;
  }
  const logger = options.logger ?? (() => undefined);
  const candidatePorts = new Set<number>();
  const processMatch = await findChromeProcessUsingUserDataDir(options.userDataDir);
  let lastRecordedPort: number | null = null;

  for (let attempt = 0; attempt < WINDOWS_WSL_DISCOVERY_ATTEMPTS; attempt += 1) {
    const recordedPort = await readDevToolsPort(options.userDataDir);
    lastRecordedPort = recordedPort;
    for (const port of orderedCandidatePorts({
      recordedPort,
      requestedPort: options.requestedPort ?? null,
      processPort: processMatch?.port ?? null,
      historicalPorts: candidatePorts,
    })) {
      candidatePorts.add(port);
      if (await probeWindowsLocalDevToolsPort(port)) {
        if (recordedPort !== port) {
          await Promise.resolve(writeDevToolsActivePort(options.userDataDir, port)).catch(() => undefined);
        }
        return port;
      }
    }

    if (attempt < WINDOWS_WSL_DISCOVERY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, WINDOWS_WSL_DISCOVERY_DELAY_MS));
    }
  }

  const discoveredPort = await findResponsiveWindowsDevToolsPortForUserDataDir(options.userDataDir);
  if (discoveredPort) {
    if (lastRecordedPort !== discoveredPort) {
      await Promise.resolve(
        writeDevToolsActivePort(options.userDataDir, discoveredPort),
      ).catch(() => undefined);
    }
    if (processMatch?.port && processMatch.port !== discoveredPort) {
      logger(
        `Windows Chrome profile ${options.userDataDir} is listening on ${discoveredPort} even though the process args advertise ${processMatch.port}.`,
      );
    }
    return discoveredPort;
  }

  if (options.pid) {
    logger(
      `Windows Chrome pid ${options.pid} is running for ${options.userDataDir}, but no responsive DevTools port was discovered.`,
    );
  }
  return null;
}

function userDataDirToComparablePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function orderedCandidatePorts(options: {
  recordedPort: number | null;
  requestedPort: number | null;
  processPort: number | null;
  historicalPorts: ReadonlySet<number>;
}): number[] {
  const ordered: number[] = [];
  const add = (port: number | null) => {
    if (!port || port <= 0 || ordered.includes(port)) {
      return;
    }
    ordered.push(port);
  };

  add(options.recordedPort);
  add(options.requestedPort);
  add(options.processPort);
  for (const port of options.historicalPorts) {
    add(port);
  }
  return ordered;
}

function createAdoptedChromeHandle(options: {
  pid: number;
  port: number;
  host: string;
  logger: BrowserLogger;
  registryOptions: { registryPath: string } | null;
  profilePath: string;
  profileName: string;
  windowsChromeFromWsl: boolean;
  skipShutdown: boolean;
}): LaunchedChrome & { host?: string } {
  const {
    pid,
    port,
    host,
    logger,
    registryOptions,
    profilePath,
    profileName,
    windowsChromeFromWsl,
    skipShutdown,
  } = options;
  if (skipShutdown) {
    return {
      pid: undefined,
      port,
      kill: async () => { logger('Skipping shutdown of reused Chrome instance.'); },
      process: undefined,
      host,
    } as unknown as LaunchedChrome & { host?: string };
  }

  return {
    pid,
    port,
    kill: async () => {
      if (registryOptions) {
        await unregisterInstance(registryOptions, profilePath, profileName);
      }
      await terminateOwnedChromeProcess(pid, logger, { windowsChromeFromWsl });
    },
    process: undefined,
    host,
  } as unknown as LaunchedChrome & { host?: string };
}

function isCurrentRunOwnedChrome(
  pid: number,
  port: number,
  options: {
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
  },
): boolean {
  return Boolean(options.ownedPids?.has(pid) || options.ownedPorts?.has(port));
}

async function terminateOwnedChromeProcess(
  pid: number,
  logger: BrowserLogger,
  options: { windowsChromeFromWsl: boolean },
): Promise<void> {
  if (options.windowsChromeFromWsl) {
    await terminateWindowsProcess(pid, logger);
    return;
  }
  await terminateChromeProcess(pid, logger);
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
          logger('Session still in flight; use your reattach command to continue.');
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

export async function reuseRunningChromeProfile(
  userDataDir: string,
  logger: BrowserLogger,
): Promise<LaunchedChrome | null> {
  const port = await readDevToolsPort(userDataDir);
  if (!port) return null;

  const probe = await isDevToolsResponsive({ port });
  if (!probe) {
    logger(`DevToolsActivePort found for ${userDataDir} but unreachable; launching new Chrome.`);
    // Safe cleanup: remove stale DevToolsActivePort; only remove lock files if recorded pid is dead.
    await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
    return null;
  }

  const pid = await readChromePid(userDataDir);
  logger(
    `Found running Chrome for ${userDataDir}; reusing (DevTools port ${port}${pid ? `, pid ${pid}` : ''})`,
  );
  return {
    port,
    pid: pid ?? undefined,
    kill: async () => {},
    process: undefined,
  } as unknown as LaunchedChrome;
}

export async function resolveUserDataBaseDir(chromePath?: string | null): Promise<string> {
  // On WSL, only Windows-hosted Chrome needs a Windows-backed temp folder.
  if (isWsl() && chromePath && /^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath)) {
    const candidates = [
      '/mnt/c/Users/Public/AppData/Local/Temp',
      '/mnt/c/Temp',
      '/mnt/c/Windows/Temp',
    ];
    for (const candidate of candidates) {
      try {
        await mkdir(candidate, { recursive: true });
        return candidate;
      } catch {
        // try next
      }
    }
  }
  return os.tmpdir();
}

export async function connectToChromeTarget(options: {
  port: number;
  host?: string;
  target?: string;
  logger?: BrowserLogger;
}): Promise<ChromeClient> {
  const logger = options.logger ?? (() => undefined);
  const endpoint = await resolveChromeEndpoint(options.host, options.port, logger);
  const client = await CDP({
    port: endpoint.port,
    host: endpoint.host,
    target: options.target,
  });
  if (endpoint.dispose) {
    const originalClose = client.close.bind(client);
    let disposed = false;
    const cleanup = async () => {
      if (disposed) return;
      disposed = true;
      await endpoint.dispose?.().catch(() => undefined);
    };
    client.close = async () => {
      try {
        return await originalClose();
      } finally {
        await cleanup();
      }
    };
    client.on('disconnect', () => {
      void cleanup();
    });
  }
  return client;
}

export async function connectToChrome(port: number, logger: BrowserLogger, host?: string): Promise<ChromeClient> {
  const client = await connectToChromeTarget({ port, host, logger });
  logger('Connected to Chrome DevTools protocol');
  return client;
}

export async function listChromeTargets(
  port: number,
  host?: string,
  logger: BrowserLogger = () => undefined,
) {
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  try {
    return await CDP.List({ host: endpoint.host, port: endpoint.port });
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

export async function openChromeTarget(
  port: number,
  url: string,
  host?: string,
  logger: BrowserLogger = () => undefined,
) {
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  try {
    return await CDP.New({ host: endpoint.host, port: endpoint.port, url });
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

export type ChromeTabReusePolicy = 'new' | 'exact' | 'same-origin';

export type OpenOrReuseChromeTargetResult = {
  target: Awaited<ReturnType<typeof CDP.New>>;
  reused: boolean;
  reason: 'exact' | 'blank' | 'same-origin' | 'compatible-host' | 'new';
};

export async function openOrReuseChromeTarget(
  port: number,
  url: string,
  options: {
    host?: string;
    logger?: BrowserLogger;
    reusePolicy?: ChromeTabReusePolicy;
    compatibleHosts?: string[];
    matchingTabLimit?: number;
    blankTabLimit?: number;
    collapseDisposableWindows?: boolean;
  } = {},
): Promise<OpenOrReuseChromeTargetResult> {
  const logger = options.logger ?? (() => undefined);
  const reusePolicy = options.reusePolicy ?? 'same-origin';
  const compatibleHosts = normalizeCompatibleHosts(options.compatibleHosts);
  const matchingTabLimit = Math.max(1, options.matchingTabLimit ?? 3);
  const blankTabLimit = Math.max(0, options.blankTabLimit ?? 1);
  const collapseDisposableWindows = options.collapseDisposableWindows ?? true;
  const endpoint = await resolveChromeEndpoint(options.host, port, logger);
  try {
    const pageTargets = (await CDP.List({ host: endpoint.host, port: endpoint.port }))
      .filter((target) => target.type === 'page');
    if (reusePolicy !== 'new') {
      const normalizedUrl = normalizeChromeTargetUrl(url);
      const exactTarget = findLastMatchingTarget(
        pageTargets,
        (target) => normalizeChromeTargetUrl(target.url ?? '') === normalizedUrl,
      );
      if (exactTarget) {
        await focusChromeTarget(endpoint.host, endpoint.port, resolveTargetId(exactTarget), url, false);
        const result = { target: exactTarget, reused: true, reason: 'exact' as const };
        await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
          selectedTargetId: resolveTargetId(exactTarget),
          requestedUrl: url,
          compatibleHosts,
          matchingTabLimit,
          blankTabLimit,
          collapseDisposableWindows,
          logger,
        });
        return result;
      }

      const blankTarget = findLastMatchingTarget(pageTargets, (target) => isReusableBlankTarget(target.url ?? ''));
      if (blankTarget) {
        await focusChromeTarget(endpoint.host, endpoint.port, resolveTargetId(blankTarget), url, true);
        const result = { target: blankTarget, reused: true, reason: 'blank' as const };
        await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
          selectedTargetId: resolveTargetId(blankTarget),
          requestedUrl: url,
          compatibleHosts,
          matchingTabLimit,
          blankTabLimit,
          collapseDisposableWindows,
          logger,
        });
        return result;
      }

      if (reusePolicy === 'same-origin') {
        const sameOriginTarget = findLastMatchingTarget(
          pageTargets,
          (target) => urlsShareOrigin(target.url ?? '', url),
        );
        if (sameOriginTarget) {
          await focusChromeTarget(endpoint.host, endpoint.port, resolveTargetId(sameOriginTarget), url, true);
          const result = { target: sameOriginTarget, reused: true, reason: 'same-origin' as const };
          await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
            selectedTargetId: resolveTargetId(sameOriginTarget),
            requestedUrl: url,
            compatibleHosts,
            matchingTabLimit,
            blankTabLimit,
            collapseDisposableWindows,
            logger,
          });
          return result;
        }
        if (compatibleHosts.length > 0) {
          const compatibleHostTarget = findLastMatchingTarget(
            pageTargets,
            (target) => urlsShareCompatibleHost(target.url ?? '', url, compatibleHosts),
          );
          if (compatibleHostTarget) {
            await focusChromeTarget(endpoint.host, endpoint.port, resolveTargetId(compatibleHostTarget), url, true);
            const result = { target: compatibleHostTarget, reused: true, reason: 'compatible-host' as const };
            await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
              selectedTargetId: resolveTargetId(compatibleHostTarget),
              requestedUrl: url,
              compatibleHosts,
              matchingTabLimit,
              blankTabLimit,
              collapseDisposableWindows,
              logger,
            });
            return result;
          }
        }
      }
    }

    const created = await CDP.New({ host: endpoint.host, port: endpoint.port, url });
    const result = { target: created, reused: false, reason: 'new' as const };
    await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
      selectedTargetId: resolveTargetId(created),
      requestedUrl: url,
      compatibleHosts,
      matchingTabLimit,
      blankTabLimit,
      collapseDisposableWindows,
      logger,
    });
    return result;
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

// NOTE: resolveWslHost/buildWslFirewallHint are defined below near isWsl to reuse helpers.

export async function connectToRemoteChrome(
  host: string,
  port: number,
  logger: BrowserLogger,
  targetUrl?: string,
  options: {
    compatibleHosts?: string[];
    reusePolicy?: ChromeTabReusePolicy;
    serviceTabLimit?: number;
    blankTabLimit?: number;
    collapseDisposableWindows?: boolean;
  } = {},
): Promise<RemoteChromeConnection> {
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  const connectHost = endpoint.host;
  const connectPort = endpoint.port;
  const disposeRelay = endpoint.dispose;
  if (isWindowsLoopbackRemoteHost(host)) {
    logger(`Routing Windows Chrome loopback ${port} through local relay ${connectHost}:${connectPort}`);
  }

  if (targetUrl) {
    try {
      const opened = await openOrReuseChromeTarget(connectPort, targetUrl, {
        host: connectHost,
        logger,
        reusePolicy: options.reusePolicy ?? 'same-origin',
        compatibleHosts: options.compatibleHosts,
        matchingTabLimit: options.serviceTabLimit,
        blankTabLimit: options.blankTabLimit,
        collapseDisposableWindows: options.collapseDisposableWindows,
      });
      const targetId = resolveTargetId(opened.target);
      const client = await CDP({ host: connectHost, port: connectPort, target: targetId });
      logger(
        opened.reused
          ? `Reused ${opened.reason} remote Chrome tab targeting ${targetUrl}`
          : `Opened new remote Chrome tab targeting ${targetUrl}`,
      );
      return { client, targetId, host: connectHost, port: connectPort, dispose: disposeRelay };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to open dedicated remote Chrome tab (${message}); falling back to first target.`);
    }
  }
  try {
    const fallbackClient = await CDP({ host: connectHost, port: connectPort });
    logger(`Connected to remote Chrome DevTools protocol at ${connectHost}:${connectPort}`);
    return { client: fallbackClient, host: connectHost, port: connectPort, dispose: disposeRelay };
  } catch (error) {
    await disposeRelay?.().catch(() => undefined);
    throw error;
  }
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
    const endpoint = await resolveChromeEndpoint(host, port, logger);
    try {
      await CDP.Close({ host: endpoint.host, port: endpoint.port, id: targetId });
    } finally {
      await endpoint.dispose?.().catch(() => undefined);
    }
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
  host: string;
  port: number;
  dispose?: () => Promise<void>;
}

async function focusChromeTarget(
  host: string,
  port: number,
  targetId: string,
  navigateUrl?: string,
  navigate = false,
): Promise<void> {
  const client = await CDP({ host, port, target: targetId });
  try {
    await client.Page.enable().catch(() => undefined);
    if (navigate && navigateUrl) {
      await client.Page.navigate({ url: navigateUrl });
    }
    await client.Page.bringToFront().catch(() => undefined);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function resolveTargetId(target: { id?: string | null; targetId?: string | null }): string {
  const resolved = target.targetId ?? target.id;
  if (!resolved) {
    throw new Error('Chrome target id missing.');
  }
  return resolved;
}

function normalizeChromeTargetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function urlsShareOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function isReusableBlankTarget(value: string): boolean {
  const normalized = normalizeChromeTargetUrl(value);
  return normalized === 'about:blank'
    || normalized === 'chrome://newtab/'
    || normalized === 'chrome://new-tab-page/'
    || normalized === 'edge://newtab/';
}

async function cleanupChromeTargetStockpile(
  host: string,
  port: number,
  options: {
    selectedTargetId: string;
    requestedUrl: string;
    compatibleHosts: string[];
    matchingTabLimit: number;
    blankTabLimit: number;
    collapseDisposableWindows: boolean;
    logger: BrowserLogger;
  },
): Promise<void> {
  const {
    selectedTargetId,
    requestedUrl,
    compatibleHosts,
    matchingTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
    logger,
  } = options;
  const pageTargets = (await CDP.List({ host, port })).filter((target) => target.type === 'page');
  const windowAssignments = collapseDisposableWindows
    ? await loadChromeWindowAssignments(
        host,
        port,
        pageTargets.map((target) => resolveTargetId(target)),
      )
    : new Map<string, number>();
  const windowTargetsToClose = collapseDisposableWindows
    ? pickDisposableWindowTargetsToClose(
        pageTargets,
        windowAssignments,
        selectedTargetId,
        requestedUrl,
        compatibleHosts,
      )
    : [];
  const windowClosedTargetIds = new Set(windowTargetsToClose.map((target) => resolveTargetId(target)));
  const remainingTargets = pageTargets.filter((target) => !windowClosedTargetIds.has(resolveTargetId(target)));
  const matchingTargets = remainingTargets.filter((target) =>
    isMatchingChromeTargetFamily(target.url ?? '', requestedUrl, compatibleHosts),
  );
  const blankTargets = remainingTargets.filter((target) => isReusableBlankTarget(target.url ?? ''));
  const targetsToClose = [
    ...windowTargetsToClose,
    ...pickTargetsToClose(matchingTargets, matchingTabLimit, selectedTargetId),
    ...pickTargetsToClose(blankTargets, blankTabLimit, selectedTargetId),
  ];
  const uniqueTargetIds = Array.from(new Set(targetsToClose.map((target) => resolveTargetId(target))));
  if (uniqueTargetIds.length === 0) {
    return;
  }
  for (const targetId of uniqueTargetIds) {
    try {
      await CDP.Close({ host, port, id: targetId });
    } catch {
      // Best effort cleanup.
    }
  }
  logger(
    `[browser-tabs] Trimmed ${uniqueTargetIds.length} stale tab(s) after selecting ${selectedTargetId}.`,
  );
}

async function loadChromeWindowAssignments(
  host: string,
  port: number,
  targetIds: string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) {
    return new Map();
  }
  const client = await CDP({ host, port });
  try {
    if (typeof client.Browser?.getWindowForTarget !== 'function') {
      return new Map();
    }
    const assignments = await Promise.all(
      targetIds.map(async (targetId) => {
        try {
          const result = await client.Browser.getWindowForTarget({ targetId });
          return [targetId, result.windowId] as const;
        } catch {
          return null;
        }
      }),
    );
    return new Map(assignments.filter((entry): entry is readonly [string, number] => Boolean(entry)));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function pickTargetsToClose(
  targets: Array<{ id?: string | null; targetId?: string | null }>,
  limit: number,
  selectedTargetId: string,
): Array<{ id?: string | null; targetId?: string | null }> {
  const keep = new Set<string>([selectedTargetId]);
  const closable = targets.filter((target) => resolveTargetId(target) !== selectedTargetId);
  const allowedExtra = Math.max(0, limit - (targets.some((target) => resolveTargetId(target) === selectedTargetId) ? 1 : 0));
  const keepFromTail = closable.slice(Math.max(0, closable.length - allowedExtra));
  for (const target of keepFromTail) {
    keep.add(resolveTargetId(target));
  }
  return closable.filter((target) => !keep.has(resolveTargetId(target)));
}

function pickDisposableWindowTargetsToClose(
  targets: Array<{ id?: string | null; targetId?: string | null; url?: string | null }>,
  windowAssignments: Map<string, number>,
  selectedTargetId: string,
  requestedUrl: string,
  compatibleHosts: string[],
): Array<{ id?: string | null; targetId?: string | null; url?: string | null }> {
  const selectedWindowId = windowAssignments.get(selectedTargetId);
  if (selectedWindowId === undefined) {
    return [];
  }
  const windows = new Map<number, Array<{ id?: string | null; targetId?: string | null; url?: string | null }>>();
  for (const target of targets) {
    const targetId = resolveTargetId(target);
    const windowId = windowAssignments.get(targetId);
    if (windowId === undefined) {
      continue;
    }
    const bucket = windows.get(windowId) ?? [];
    bucket.push(target);
    windows.set(windowId, bucket);
  }
  const targetsToClose: Array<{ id?: string | null; targetId?: string | null; url?: string | null }> = [];
  for (const [windowId, windowTargets] of windows.entries()) {
    if (windowId === selectedWindowId) {
      continue;
    }
    const disposableWindow = windowTargets.every((target) =>
      isDisposableWindowTarget(target.url ?? '', requestedUrl, compatibleHosts),
    );
    if (!disposableWindow) {
      continue;
    }
    targetsToClose.push(...windowTargets);
  }
  return targetsToClose;
}

function isMatchingChromeTargetFamily(
  candidateUrl: string,
  requestedUrl: string,
  compatibleHosts: string[],
): boolean {
  const normalizedCandidate = normalizeChromeTargetUrl(candidateUrl);
  const normalizedRequested = normalizeChromeTargetUrl(requestedUrl);
  if (!normalizedCandidate || !normalizedRequested) {
    return false;
  }
  return normalizedCandidate === normalizedRequested
    || urlsShareOrigin(normalizedCandidate, normalizedRequested)
    || urlsShareCompatibleHost(normalizedCandidate, normalizedRequested, compatibleHosts);
}

function isDisposableWindowTarget(
  candidateUrl: string,
  requestedUrl: string,
  compatibleHosts: string[],
): boolean {
  return isReusableBlankTarget(candidateUrl)
    || isMatchingChromeTargetFamily(candidateUrl, requestedUrl, compatibleHosts);
}

function urlsShareCompatibleHost(left: string, right: string, compatibleHosts: string[]): boolean {
  try {
    const leftHost = new URL(left).host.toLowerCase();
    const rightHost = new URL(right).host.toLowerCase();
    return compatibleHosts.includes(leftHost) && compatibleHosts.includes(rightHost);
  } catch {
    return false;
  }
}

function normalizeCompatibleHosts(hosts: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (hosts ?? [])
        .map((host) => host.trim().toLowerCase())
        .filter((host) => host.length > 0),
    ),
  );
}

function findLastMatchingTarget<T>(
  targets: T[],
  predicate: (target: T) => boolean,
): T | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const candidate = targets[index];
    if (predicate(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function buildChromeFlags(
  headless: boolean,
  debugBindAddress?: string | null,
  chromeProfile?: string,
  options: { minimal?: boolean } = {},
): string[] {
  const flags = options.minimal
    ? ['--new-window', '--hide-crash-restore-bubble']
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
        '--hide-crash-restore-bubble',
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
  const raw =
    process.env.BROWSER_SERVICE_BROWSER_PORT ??
    process.env.BROWSER_SERVICE_BROWSER_DEBUG_PORT ??
    process.env.AURACALL_BROWSER_PORT ??
    process.env.AURACALL_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return null;
  }
  return value;
}

function resolveRemoteDebugHost(chromePath?: string): string | null {
  if (!isWsl()) {
    return null;
  }
  if (chromePath && !/^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath)) {
    return null;
  }
  return WINDOWS_LOOPBACK_REMOTE_HOST;
}

function isWsl(): boolean {
  return isWslEnvironment();
}

export function resolveWslHost(): string | null {
  const override =
    process.env.BROWSER_SERVICE_BROWSER_REMOTE_DEBUG_HOST?.trim() ||
    process.env.AURACALL_BROWSER_REMOTE_DEBUG_HOST?.trim() ||
    process.env.WSL_HOST_IP?.trim();
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
  if (isWindowsLoopbackRemoteHost(host)) {
    return [
      `Windows Chrome DevTools ${devtoolsPort} did not become reachable through the local loopback relay.`,
      'Verify that chrome.exe launched with --remote-debugging-port and that Windows PowerShell is available from WSL.',
    ].join(' ');
  }
  return [
    `DevTools port ${host}:${devtoolsPort} is blocked from WSL.`,
    'PowerShell (admin):',
    `New-NetFirewallRule -DisplayName 'Chrome DevTools ${devtoolsPort}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${devtoolsPort}`,
    "New-NetFirewallRule -DisplayName 'Chrome DevTools (chrome.exe)' -Direction Inbound -Action Allow -Program 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -Protocol TCP",
  ].join(' ');
}

async function ensurePersistentDevToolsEndpoint(
  port: number,
  host: string,
  logger: BrowserLogger,
): Promise<string> {
  if (!isWindowsLoopbackRemoteHost(host)) {
    return host || '127.0.0.1';
  }
  await ensureDetachedWindowsLoopbackRelay(port, logger, { listenPort: port });
  return WINDOWS_LOOPBACK_REMOTE_HOST;
}

function isWindowsHostedChromePath(chromePath?: string | null): boolean {
  return isWsl() && isWindowsPath(chromePath ?? null);
}

async function launchWindowsChromeFromWsl(options: {
  chromePath?: string | null;
  chromeFlags: string[];
  userDataDir: string;
  requestedPort: number;
  logger: BrowserLogger;
}): Promise<LaunchedChrome & { host?: string }> {
  const chromePath = options.chromePath ?? undefined;
  if (!chromePath) {
    throw new Error('Missing Windows Chrome path for WSL launch.');
  }
  const powershellPath = resolveWindowsPowerShellPath();
  const finalFlags = options.chromeFlags.includes('--remote-allow-origins=*')
    ? options.chromeFlags
    : ['--remote-allow-origins=*', ...options.chromeFlags];
  const remoteDebugPortFlag = options.requestedPort > 0
    ? `--remote-debugging-port=${options.requestedPort}`
    : '--remote-debugging-port=0';
  const argumentList = [
    ...finalFlags,
    remoteDebugPortFlag,
    'about:blank',
  ].map((entry) => quotePowerShellLiteral(toWindowsPath(entry)));
  const command =
    `$process = Start-Process -FilePath ${quotePowerShellLiteral(toWindowsPath(chromePath))} ` +
    `-ArgumentList @(${argumentList.join(', ')}) -PassThru -WindowStyle Normal; ` +
    'Write-Output $process.Id';

  const { stdout } = await execFileAsync(
    powershellPath,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  const pid = Number.parseInt(String(stdout ?? '').trim().split(/\r?\n/u).at(-1) ?? '', 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Failed to launch Windows Chrome via PowerShell: ${String(stdout ?? '').trim() || 'missing pid'}`);
  }
  options.logger(
    options.requestedPort > 0
      ? `Started Windows Chrome via PowerShell (pid ${pid}) on port ${options.requestedPort}`
      : `Started Windows Chrome via PowerShell (pid ${pid}) with an auto-assigned DevTools port`,
  );
  return {
    pid,
    port: options.requestedPort,
    process: undefined,
    kill: async () => {
      await terminateWindowsProcess(pid, options.logger);
    },
    host: WINDOWS_LOOPBACK_REMOTE_HOST,
  } as unknown as LaunchedChrome & { host?: string };
}

async function terminateWindowsProcess(pid: number, logger: BrowserLogger): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }
  try {
    await execFileAsync('/mnt/c/Windows/System32/taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to taskkill Windows Chrome pid ${pid}: ${message}`);
  }
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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
      return waitForDevTools({
        host,
        port: debugPort,
        logger: () => undefined,
      }).then((ready) => {
        if (!ready) {
          throw new Error(`Chrome DevTools ${host}:${debugPort} did not become ready`);
        }
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

export function resolveUserDataDirFlag(userDataDir: string, chromePath?: string): string {
  if (!isWsl()) {
    return userDataDir;
  }
  const windowsChrome = isWindowsPath(chromePath ?? null);
  if (!windowsChrome) {
    return userDataDir;
  }
  return `"${toWindowsPath(userDataDir)}"`;
}
