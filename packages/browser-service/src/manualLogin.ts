import CDP from 'chrome-remote-interface';
import type { BrowserLogger, ResolvedBrowserConfig } from './types.js';
import { DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE, pickAvailableDebugPort } from './portSelection.js';
import { launchChrome } from './chromeLifecycle.js';
import { writeChromePid, writeDevToolsActivePort } from './profileState.js';
import { isDevToolsResponsive } from './processCheck.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  profileName: string;
  userDataDir: string;
  url: string;
  logger: BrowserLogger;
  baseConfig: ResolvedBrowserConfig;
  debugPort?: number;
  debugPortRange?: [number, number] | null;
  detach?: boolean;
  registryPath?: string;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchChrome>>; port: number }> {
  const port = options.debugPort ?? await pickAvailableDebugPort(
    DEFAULT_DEBUG_PORT,
    options.logger,
    options.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE,
  );
  const config: ResolvedBrowserConfig = {
    ...options.baseConfig,
    chromePath: options.chromePath,
    chromeProfile: options.profileName,
    manualLogin: true,
    manualLoginProfileDir: options.userDataDir,
    debugPort: port,
    headless: false,
    hideWindow: false,
    keepBrowser: true,
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

  await openLoginUrl(host, chrome.port, options.url);
  return { chrome, port: chrome.port };
}

async function openLoginUrl(host: string, port: number, url: string): Promise<void> {
  try {
    await CDP.New({ host, port, url });
  } catch {
    // Best effort: login can proceed even if we can't open a new tab.
  }
}
