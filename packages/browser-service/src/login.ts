import { spawn } from 'node:child_process';
import type { CookieParam } from './types.js';
import {
  exportCookiesFromCdp,
  inferProfileFromCookiePath,
  isWindowsChromePath,
  isWsl,
  quotePowerShellLiteral,
  toWindowsPath,
  waitForPortOpen,
} from './loginHelpers.js';
import { resolveWslHost } from './chromeLifecycle.js';
import { pickAvailableDebugPort, DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE } from './portSelection.js';

export interface BrowserLoginOptions {
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  loginUrl: string;
  loginLabel?: string;
  exportCookies?: boolean;
  preferCookieProfile?: boolean;
  cookieExport?: {
    urls: string[];
    requiredCookies?: string[];
    timeoutMs?: number;
  };
  onRegisterInstance?: (options: {
    userDataDir: string;
    profileName: string;
    port?: number;
    host?: string;
    pid?: number;
  }) => Promise<void> | void;
  launchManualLoginSession: (options: {
    chromePath: string;
    profileName: string;
    userDataDir: string;
    url: string;
    debugPort?: number;
    logger: () => void;
  }) => Promise<{ chrome: { process?: { unref?: () => void } } }>;
  onCookiesExported?: (cookies: CookieParam[]) => Promise<void> | void;
}

export async function runBrowserLogin(options: BrowserLoginOptions): Promise<void> {
  const {
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    loginUrl,
    loginLabel,
    exportCookies,
    preferCookieProfile = true,
    cookieExport,
    onRegisterInstance,
    launchManualLoginSession,
    onCookiesExported,
  } = options;

  const inferred = cookiePath && preferCookieProfile ? inferProfileFromCookiePath(cookiePath) : null;
  const userDataDir = inferred?.userDataDir ?? manualLoginProfileDir;
  const profileName = inferred?.profileDir ?? chromeProfile;
  const wslWindowsChrome = isWsl() && isWindowsChromePath(chromePath);
  const debugHost = wslWindowsChrome ? (resolveWslHost() ?? '127.0.0.1') : '127.0.0.1';
  const debugPort = await pickAvailableDebugPort(
    DEFAULT_DEBUG_PORT,
    () => undefined,
    DEFAULT_DEBUG_PORT_RANGE,
  );

  if (exportCookies) {
    if (!cookieExport?.urls?.length) {
      throw new Error('Cookie export requires cookieExport.urls to be set.');
    }
    if (process.platform !== 'win32' || isWsl()) {
      console.log(
        'Note: if Chrome is already running, it may ignore --user-data-dir; quit Chrome to force the login profile.',
      );
    }
    const args = [
      '--new-window',
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileName}`,
      '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      loginUrl,
    ];
    if (wslWindowsChrome) {
      args.splice(args.length - 1, 0, '--remote-debugging-address=0.0.0.0');
    }
    const cookieUrls = cookieExport.urls;
    const requiredCookies = cookieExport.requiredCookies ?? [];
    const timeoutMs = cookieExport.timeoutMs ?? 120_000;

    if (wslWindowsChrome) {
      const winChromePath = toWindowsPath(chromePath);
      const winArgs = args.map(toWindowsPath);
      const argList = winArgs.map(quotePowerShellLiteral).join(', ');
      const psCommand =
        `Start-Process -FilePath ${quotePowerShellLiteral(winChromePath)} ` +
        `-ArgumentList @(${argList}) -WindowStyle Normal`;
      const loginProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      });
      loginProcess.unref();
      await waitForPortOpen(debugHost, debugPort, timeoutMs);
      await onRegisterInstance?.({ userDataDir, profileName, port: debugPort, host: debugHost });
    } else {
      const { chrome } = await launchManualLoginSession({
        chromePath,
        profileName,
        userDataDir,
        url: loginUrl,
        debugPort,
        logger: () => undefined,
      });
      chrome.process?.unref?.();
    }

    const label = loginLabel ?? 'browser';
    console.log(`Opened ${label} login in ${chromePath}`);
    console.log(`Profile: ${userDataDir} (${profileName})`);
    console.log(`URL: ${loginUrl}`);
    console.log('Waiting for cookies...');

    const cookies = await exportCookiesFromCdp({
      port: debugPort,
      requiredNames: requiredCookies,
      urls: cookieUrls,
      timeoutMs,
    });
    await onCookiesExported?.(cookies);
    return;
  }

  if (process.platform !== 'win32' || isWsl()) {
    console.log(
      'Note: if Chrome is already running, it may ignore --user-data-dir; quit Chrome to force the login profile.',
    );
  }
  const args = [
    '--new-window',
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileName}`,
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    loginUrl,
  ];
  if (wslWindowsChrome) {
    args.splice(args.length - 1, 0, '--remote-debugging-address=0.0.0.0');
  }
  const timeoutMs = 120_000;
  if (wslWindowsChrome) {
    const winChromePath = toWindowsPath(chromePath);
    const winArgs = args.map(toWindowsPath);
    const argList = winArgs.map(quotePowerShellLiteral).join(', ');
    const psCommand =
      `Start-Process -FilePath ${quotePowerShellLiteral(winChromePath)} ` +
      `-ArgumentList @(${argList}) -WindowStyle Normal`;
    const loginProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    loginProcess.unref();
    await waitForPortOpen(debugHost, debugPort, timeoutMs);
    await onRegisterInstance?.({ userDataDir, profileName, port: debugPort, host: debugHost });
  } else {
    const { chrome } = await launchManualLoginSession({
      chromePath,
      profileName,
      userDataDir,
      url: loginUrl,
      debugPort,
      logger: () => undefined,
    });
    chrome.process?.unref?.();
  }
  const label = loginLabel ?? 'browser';
  console.log(`Opened ${label} login in ${chromePath}`);
  console.log(`Profile: ${userDataDir} (${profileName})`);
  console.log(`URL: ${loginUrl}`);
  console.log(`Args: ${args.join(' ')}`);
}
