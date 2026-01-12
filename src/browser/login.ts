import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CHATGPT_URL, GROK_URL } from './constants.js';
import { getOracleHomeDir } from '../oracleHome.js';
import { registerInstance } from './service/stateRegistry.js';
import { findChromePidUsingUserDataDir, findWindowsChromePidUsingTasklist } from './processCheck.js';
import { DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE, pickAvailableDebugPort } from './portSelection.js';
import { resolveWslHost } from './chromeLifecycle.js';
import { launchManualLoginSession } from './manualLogin.js';
import { resolveProfileDirectoryName } from './service/profile.js';
import {
  exportCookiesFromCdp,
  inferProfileFromCookiePath,
  isWindowsChromePath,
  isWsl,
  quotePowerShellLiteral,
  toWindowsPath,
  waitForPortOpen,
} from '../../packages/browser-service/src/loginHelpers.js';

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
  } = options;
  const url =
    target === 'gemini'
      ? geminiUrl ?? 'https://gemini.google.com/app'
      : target === 'grok'
        ? grokUrl ?? GROK_URL
        : chatgptUrl ?? CHATGPT_URL;

  const inferred = cookiePath ? inferProfileFromCookiePath(cookiePath) : null;
  const userDataDir = target === 'chatgpt' ? manualLoginProfileDir : inferred?.userDataDir ?? manualLoginProfileDir;
  const resolvedProfile = resolveProfileDirectoryName(userDataDir, chromeProfile);
  const profileName = target === 'chatgpt' ? resolvedProfile : inferred?.profileDir ?? resolvedProfile;
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
    const oracleHome = getOracleHomeDir();
    const cookieOutput = path.join(oracleHome, 'cookies.json');
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
      await registerLoginInstance(userDataDir, profileName, debugPort, undefined, debugHost);
    } else {
      const { chrome } = await launchManualLoginSession({
        chromePath,
        profileName,
        userDataDir,
        url,
        debugPort,
        logger: () => undefined,
      });
      chrome.process?.unref();
    }

    console.log(`Opened ${target} login in ${chromePath}`);
    console.log(`Profile: ${userDataDir} (${profileName})`);
    console.log(`URL: ${url}`);
    console.log('Waiting for Gemini cookies...');

    const cookies = await exportCookiesFromCdp({ port: debugPort, requiredNames: requiredCookies, urls: cookieUrls, timeoutMs });
    await fs.mkdir(oracleHome, { recursive: true });
    await fs.writeFile(cookieOutput, JSON.stringify(cookies, null, 2), 'utf8');
    console.log(`Saved Gemini cookies to ${cookieOutput}`);
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
    await registerLoginInstance(userDataDir, profileName, debugPort, undefined, debugHost);
  } else if (process.platform === 'win32') {
    const { chrome } = await launchManualLoginSession({
      chromePath,
      profileName,
      userDataDir,
      url,
      debugPort,
      logger: () => undefined,
    });
    chrome.process?.unref();
  } else {
    const { chrome } = await launchManualLoginSession({
      chromePath,
      profileName,
      userDataDir,
      url,
      debugPort,
      logger: () => undefined,
    });
    chrome.process?.unref();
  }
  console.log(`Opened ${target} login in ${chromePath}`);
  console.log(`Profile: ${userDataDir} (${profileName})`);
  console.log(`URL: ${url}`);
  console.log(`Args: ${args.join(' ')}`);
}

async function registerLoginInstance(
  userDataDir: string,
  profileName: string,
  port: number | null | undefined,
  pid?: number | null,
  host = '127.0.0.1',
): Promise<void> {
  const resolvedPort = port ?? undefined;
  if (!resolvedPort) return;
  let resolvedPid = pid ?? undefined;
  if (!resolvedPid) {
    resolvedPid = await findChromePidUsingUserDataDir(userDataDir) ?? undefined;
  }
  if (!resolvedPid && host !== '127.0.0.1') {
    resolvedPid = await findWindowsChromePidUsingTasklist() ?? undefined;
  }
  if (!resolvedPid) return;
  await registerInstance({
    pid: resolvedPid,
    port: resolvedPort,
    host,
    profilePath: userDataDir,
    profileName,
    type: 'chrome',
    launchedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });
}

// launchLoginChrome helper removed; use launchManualLoginSession directly.
