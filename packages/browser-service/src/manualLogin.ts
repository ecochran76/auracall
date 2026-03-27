import type { BrowserLogger, DebugPortStrategy, ResolvedBrowserConfig } from './types.js';
import { DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE, pickAvailableDebugPort } from './portSelection.js';
import { launchChrome, openOrReuseChromeTarget } from './chromeLifecycle.js';
import { writeChromePid, writeDevToolsActivePort } from './profileState.js';
import { isDevToolsResponsive } from './processCheck.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  profileName: string;
  userDataDir: string;
  url: string;
  compatibleHosts?: string[];
  logger: BrowserLogger;
  baseConfig: ResolvedBrowserConfig;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
  detach?: boolean;
  registryPath?: string;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchChrome>>; port: number }> {
  const effectiveDebugPortStrategy = options.debugPortStrategy ?? options.baseConfig.debugPortStrategy ?? 'fixed';
  const port = effectiveDebugPortStrategy === 'fixed'
    ? options.debugPort ?? await pickAvailableDebugPort(
        DEFAULT_DEBUG_PORT,
        options.logger,
        options.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE,
      )
    : null;
  const config: ResolvedBrowserConfig = {
    ...options.baseConfig,
    chromePath: options.chromePath,
    chromeProfile: options.profileName,
    manualLogin: true,
    manualLoginProfileDir: options.userDataDir,
    debugPort: port,
    debugPortStrategy: effectiveDebugPortStrategy,
    headless: false,
    hideWindow: false,
    keepBrowser: true,
    serviceTabLimit: options.serviceTabLimit ?? options.baseConfig.serviceTabLimit,
    blankTabLimit: options.blankTabLimit ?? options.baseConfig.blankTabLimit,
    collapseDisposableWindows: options.collapseDisposableWindows ?? options.baseConfig.collapseDisposableWindows,
  };
  const chrome = await launchChrome(config, options.userDataDir, options.logger, {
    registryPath: options.registryPath,
  });
  if (options.detach) {
    chrome.process?.unref();
  }

  await writeDevToolsActivePort(options.userDataDir, chrome.port);
  if (chrome.pid) {
    await writeChromePid(options.userDataDir, chrome.pid);
  }

  const host = chrome.host ?? '127.0.0.1';
  const ready = await isDevToolsResponsive({ host, port: chrome.port, attempts: 5, timeoutMs: 1000 });
  if (!ready) {
    throw new Error(`Chrome DevTools did not respond on ${host}:${chrome.port}.`);
  }

  await openLoginUrl(host, chrome.port, options.url, {
    compatibleHosts: options.compatibleHosts,
    serviceTabLimit: config.serviceTabLimit,
    blankTabLimit: config.blankTabLimit,
    collapseDisposableWindows: config.collapseDisposableWindows,
  });
  return { chrome, port: chrome.port };
}

export async function openLoginUrl(
  host: string,
  port: number,
  url: string,
  options: {
    compatibleHosts?: string[];
    serviceTabLimit?: number | null;
    blankTabLimit?: number | null;
    collapseDisposableWindows?: boolean;
  } = {},
): Promise<void> {
  try {
    await openOrReuseChromeTarget(port, url, {
      host,
      reusePolicy: 'same-origin',
      compatibleHosts: options.compatibleHosts,
      matchingTabLimit: options.serviceTabLimit ?? undefined,
      blankTabLimit: options.blankTabLimit ?? undefined,
      collapseDisposableWindows: options.collapseDisposableWindows,
    });
  } catch {
    // Best effort: login can proceed even if we can't open a new tab.
  }
}
