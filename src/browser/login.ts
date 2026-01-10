import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import type { CookieParam } from './types.js';
import { CHATGPT_URL, GROK_URL } from './constants.js';
import { getOracleHomeDir } from '../oracleHome.js';
import { registerInstance } from './stateRegistry.js';
import { findChromePidUsingUserDataDir, findWindowsChromePidUsingTasklist } from './processCheck.js';
import { DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE, pickAvailableDebugPort } from './portSelection.js';
import { resolveWslHost, buildWslFirewallHint } from './chromeLifecycle.js';
import { delay } from './utils.js';
import { launchManualLoginSession } from './manualLogin.js';

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

async function waitForPortOpen(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', (err) => {
          socket.destroy();
          reject(err);
        });
      });
      return;
    } catch {
      await delay(200);
    }
  }
  const hint = buildWslFirewallHint(host, port);
  const message = hint
    ? `Timed out waiting for Chrome debug port ${host}:${port}. ${hint}`
    : `Timed out waiting for Chrome debug port ${host}:${port}.`;
  throw new Error(message);
}

async function exportCookiesFromCdp({
  port,
  requiredNames,
  urls,
  timeoutMs,
}: {
  port: number | null;
  requiredNames: string[];
  urls: string[];
  timeoutMs: number;
}): Promise<CookieParam[]> {
  if (!port) {
    throw new Error('Missing Chrome debug port for cookie export.');
  }
  const client = await CDP({ port });
  try {
    await client.Network.enable();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { cookies } = await client.Network.getCookies({ urls });
      const hasRequired = requiredNames.every((name) => cookies.some((cookie) => cookie.name === name));
      if (hasRequired) {
        return cookies.map(mapCookieToParam);
      }
      await delay(2_000);
    }
    throw new Error(`Timed out waiting for cookies: ${requiredNames.join(', ')}`);
  } finally {
    await client.close();
  }
}

function mapCookieToParam(cookie: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CookieParam['sameSite'];
  priority?: CookieParam['priority'];
  sameParty?: boolean;
}): CookieParam {
  const param: CookieParam = {
    name: cookie.name,
    value: cookie.value,
  };
  if (cookie.domain) param.domain = cookie.domain;
  if (cookie.path) param.path = cookie.path;
  if (typeof cookie.expires === 'number') param.expires = cookie.expires;
  if (typeof cookie.httpOnly === 'boolean') param.httpOnly = cookie.httpOnly;
  if (typeof cookie.secure === 'boolean') param.secure = cookie.secure;
  if (cookie.sameSite) param.sameSite = cookie.sameSite;
  if (cookie.priority) param.priority = cookie.priority;
  if (typeof cookie.sameParty === 'boolean') param.sameParty = cookie.sameParty;
  return param;
}

function inferProfileFromCookiePath(cookiePath: string): { userDataDir: string; profileDir: string } | null {
  const normalized = path.normalize(cookiePath);
  const parts = normalized.split(path.sep);
  const userDataIndex = parts.findIndex((part) => part.toLowerCase() === 'user data');
  if (userDataIndex !== -1 && userDataIndex + 1 < parts.length) {
    const userDataDir = parts.slice(0, userDataIndex + 1).join(path.sep);
    const profileDir = parts[userDataIndex + 1];
    if (profileDir) {
      return { userDataDir, profileDir };
    }
  }

  // Fallback for paths like <profile>/Network/Cookies
  const networkIndex = parts.findIndex((part) => part.toLowerCase() === 'network');
  if (networkIndex > 0 && parts[networkIndex + 1]?.toLowerCase() === 'cookies') {
    const profileDir = parts[networkIndex - 1];
    const userDataDir = parts.slice(0, networkIndex - 1).join(path.sep);
    if (profileDir && userDataDir) {
      return { userDataDir, profileDir };
    }
  }

  return null;
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}

function toWindowsPath(value: string): string {
  if (!isWsl()) {
    return value;
  }
  const normalized = value.replace(/\\/g, '/');
  const match = normalized.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  if (normalized.startsWith('/')) {
    return `\\\\wsl.localhost\\${process.env.WSL_DISTRO_NAME ?? 'Ubuntu'}${normalized.replace(/\//g, '\\')}`;
  }
  return value;
}

function isWindowsChromePath(value: string): boolean {
  const trimmed = value.trim();
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    return true;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.startsWith('/mnt/');
}

function quotePowerShellLiteral(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}
