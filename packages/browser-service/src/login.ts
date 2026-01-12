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

export type LoginTarget = 'chatgpt' | 'gemini' | 'grok';

export interface BrowserLoginOptions {
  target: LoginTarget;
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  chatgptUrl?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  exportCookies?: boolean;
  defaultUrlResolver: (target: LoginTarget) => string;
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
    target,
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    chatgptUrl,
    geminiUrl,
    grokUrl,
    exportCookies,
    defaultUrlResolver,
    onRegisterInstance,
    launchManualLoginSession,
    onCookiesExported,
  } = options;
  const url =
    target === 'gemini'
      ? geminiUrl ?? defaultUrlResolver('gemini')
      : target === 'grok'
        ? grokUrl ?? defaultUrlResolver('grok')
        : chatgptUrl ?? defaultUrlResolver('chatgpt');

  const inferred = cookiePath ? inferProfileFromCookiePath(cookiePath) : null;
  const userDataDir = target === 'chatgpt' ? manualLoginProfileDir : inferred?.userDataDir ?? manualLoginProfileDir;
  const profileName = target === 'chatgpt' ? chromeProfile : inferred?.profileDir ?? chromeProfile;
  const wslWindowsChrome = isWsl() && isWindowsChromePath(chromePath);
  const debugHost = wslWindowsChrome ? (resolveWslHost() ?? '127.0.0.1') : '127.0.0.1';
  const debugPort = await pickAvailableDebugPort(
    DEFAULT_DEBUG_PORT,
    () => undefined,
    DEFAULT_DEBUG_PORT_RANGE,
  );

  if (exportCookies) {
    if (target !== 'gemini') {
      throw new Error('Cookie export currently supports Gemini login only.');
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
      url,
    ];
    if (wslWindowsChrome) {
      args.splice(args.length - 1, 0, '--remote-debugging-address=0.0.0.0');
    }
    const cookieUrls = ['https://gemini.google.com', 'https://accounts.google.com', 'https://www.google.com'];
    const requiredCookies = ['__Secure-1PSID', '__Secure-1PSIDTS'];
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
        url,
        debugPort,
        logger: () => undefined,
      });
      chrome.process?.unref?.();
    }

    console.log(`Opened ${target} login in ${chromePath}`);
    console.log(`Profile: ${userDataDir} (${profileName})`);
    console.log(`URL: ${url}`);
    console.log('Waiting for Gemini cookies...');

    const cookies = await exportCookiesFromCdp({ port: debugPort, requiredNames: requiredCookies, urls: cookieUrls, timeoutMs });
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
    url,
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
      url,
      debugPort,
      logger: () => undefined,
    });
    chrome.process?.unref?.();
  }
  console.log(`Opened ${target} login in ${chromePath}`);
  console.log(`Profile: ${userDataDir} (${profileName})`);
  console.log(`URL: ${url}`);
  console.log(`Args: ${args.join(' ')}`);
}
