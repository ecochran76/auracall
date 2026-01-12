import fs from 'node:fs/promises';
import path from 'node:path';
import { CHATGPT_URL, GROK_URL } from './constants.js';
import { getOracleHomeDir } from '../oracleHome.js';
import { registerInstance } from './service/stateRegistry.js';
import { findChromePidUsingUserDataDir, findWindowsChromePidUsingTasklist } from './processCheck.js';
import { launchManualLoginSession } from './manualLogin.js';
import {
  runBrowserLogin as runBrowserLoginCore,
  type BrowserLoginOptions as BrowserLoginCoreOptions,
} from '../../packages/browser-service/src/login.js';

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
  const coreOptions: BrowserLoginCoreOptions = {
    target,
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    chatgptUrl,
    geminiUrl,
    grokUrl,
    exportCookies,
    defaultUrlResolver: (service) =>
      service === 'gemini'
        ? 'https://gemini.google.com/app'
        : service === 'grok'
          ? GROK_URL
          : CHATGPT_URL,
    onRegisterInstance: async ({ userDataDir, profileName, port, host }) => {
      await registerLoginInstance(userDataDir, profileName, port, undefined, host);
    },
    launchManualLoginSession: async ({ chromePath, profileName, userDataDir, url, debugPort }) => {
      return launchManualLoginSession({
        chromePath,
        profileName,
        userDataDir,
        url,
        debugPort,
        logger: () => undefined,
      });
    },
    onCookiesExported: async (cookies) => {
      const oracleHome = getOracleHomeDir();
      const cookieOutput = path.join(oracleHome, 'cookies.json');
      await fs.mkdir(oracleHome, { recursive: true });
      await fs.writeFile(cookieOutput, JSON.stringify(cookies, null, 2), 'utf8');
      console.log(`Saved Gemini cookies to ${cookieOutput}`);
    },
  };
  await runBrowserLoginCore(coreOptions);
  return;
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
