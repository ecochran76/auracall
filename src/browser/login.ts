import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedUserConfig } from '../config.js';
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from './constants.js';
import { resolveBundledServiceCookieOrigins } from '../services/registry.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  bootstrapManagedProfile,
  type ManagedProfileSeedPolicy,
} from './profileStore.js';
import {
  resolveManagedBrowserLaunchContextFromResolvedConfig,
  resolveUserBrowserLaunchContext,
} from './service/profileResolution.js';
import { registerInstance } from './service/stateRegistry.js';
import { findChromePidUsingUserDataDir, findWindowsChromePidUsingTasklist } from './processCheck.js';
import { launchManualLoginSession } from './manualLogin.js';
import { resolveCompatibleHostsForTarget } from './urlFamilies.js';
import {
  runBrowserLogin as runBrowserLoginCore,
  type BrowserLoginOptions as BrowserLoginCoreOptions,
} from '../../packages/browser-service/src/login.js';
import type { DebugPortStrategy } from '../../packages/browser-service/src/types.js';

export type LoginTarget = 'chatgpt' | 'gemini' | 'grok';

export interface BrowserLoginOptions {
  target: LoginTarget;
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  bootstrapCookiePath?: string;
  chatgptUrl?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  exportCookies?: boolean;
  managedProfileSeedPolicy?: ManagedProfileSeedPolicy;
  debugPortStrategy?: DebugPortStrategy | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export function resolveBrowserLoginOptionsFromUserConfig(
  userConfig: Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'>,
  options: {
    target?: LoginTarget;
    exportCookies?: boolean;
    managedProfileSeedPolicy?: ManagedProfileSeedPolicy;
  } = {},
): BrowserLoginOptions {
  const target = options.target ?? (userConfig.browser?.target as LoginTarget | undefined) ?? 'chatgpt';
  const { resolvedConfig: resolved, launchProfile } = resolveUserBrowserLaunchContext(userConfig, target);
  const managedLaunchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browser: resolved,
    target,
  });

  if (!launchProfile.chromePath) {
    throw new Error(`No browser chromePath resolved for ${target} login.`);
  }

  return {
    target,
    chromePath: launchProfile.chromePath,
    chromeProfile: managedLaunchContext.configuredChromeProfile,
    manualLoginProfileDir: managedLaunchContext.managedProfileDir,
    cookiePath: launchProfile.chromeCookiePath,
    bootstrapCookiePath: managedLaunchContext.bootstrapCookiePath ?? undefined,
    chatgptUrl: resolved.chatgptUrl,
    geminiUrl: resolved.geminiUrl,
    grokUrl: resolved.grokUrl,
    exportCookies: options.exportCookies,
    managedProfileSeedPolicy: options.managedProfileSeedPolicy,
    debugPortStrategy: launchProfile.debugPortStrategy ?? null,
    serviceTabLimit: launchProfile.serviceTabLimit ?? null,
    blankTabLimit: launchProfile.blankTabLimit ?? null,
    collapseDisposableWindows: launchProfile.collapseDisposableWindows,
  };
}

export async function runBrowserLogin(options: BrowserLoginOptions): Promise<void> {
  const {
    target,
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    bootstrapCookiePath,
    chatgptUrl,
    geminiUrl,
    grokUrl,
    exportCookies,
    managedProfileSeedPolicy,
    debugPortStrategy,
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
  } = options;
  if (exportCookies && target !== 'gemini') {
    throw new Error('Cookie export currently supports Gemini login only.');
  }
  const resolvedUrl =
    target === 'gemini'
      ? geminiUrl ?? GEMINI_URL
      : target === 'grok'
        ? grokUrl ?? GROK_URL
        : chatgptUrl ?? CHATGPT_URL;
  const compatibleHosts = resolveCompatibleHostsForTarget(target);
  const bootstrapResult = await bootstrapManagedProfile({
    managedProfileDir: manualLoginProfileDir,
    managedProfileName: chromeProfile,
    sourceCookiePath: bootstrapCookiePath ?? cookiePath ?? null,
    seedPolicy: managedProfileSeedPolicy ?? 'reseed-if-source-newer',
    logger: (message) => console.log(`[login] ${message}`),
  });
  if (bootstrapResult.cloned) {
    console.log(
      `[login] Seeded managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}).`,
    );
  } else if (bootstrapResult.reseeded) {
    console.log(
      `[login] Refreshed managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}).`,
    );
  } else if (bootstrapResult.skippedReason === 'managed-profile-active') {
    console.log(
      `[login] Managed browser profile is already active; skipping source-browser-profile refresh and reusing ${manualLoginProfileDir}.`,
    );
  }
  const coreOptions: BrowserLoginCoreOptions = {
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    loginUrl: resolvedUrl,
    compatibleHosts,
    loginLabel: target,
    exportCookies,
    preferCookieProfile: false,
    cookieExport: exportCookies
      ? {
          urls: resolveBundledServiceCookieOrigins('gemini', [
            'https://gemini.google.com',
            'https://accounts.google.com',
            'https://www.google.com',
          ]),
          requiredCookies: ['__Secure-1PSID', '__Secure-1PSIDTS'],
        }
      : undefined,
    onRegisterInstance: async ({ userDataDir, profileName, port, host }) => {
      await registerLoginInstance(userDataDir, profileName, port, undefined, host);
    },
    launchManualLoginSession: async ({
      chromePath,
      profileName,
      userDataDir,
      url,
      compatibleHosts,
      hideWindow,
      debugPort,
      debugPortStrategy,
      serviceTabLimit,
      blankTabLimit,
      collapseDisposableWindows,
    }) => {
      return launchManualLoginSession({
        chromePath,
        profileName,
        userDataDir,
        url,
        compatibleHosts,
        hideWindow,
        debugPort,
        debugPortStrategy,
        serviceTabLimit,
        blankTabLimit,
        collapseDisposableWindows,
        logger: () => undefined,
      });
    },
    debugPortStrategy,
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
    onCookiesExported: async (cookies) => {
      const auracallHome = getAuracallHomeDir();
      const cookieOutput = path.join(auracallHome, 'cookies.json');
      await fs.mkdir(auracallHome, { recursive: true });
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
