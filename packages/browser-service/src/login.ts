import type { CookieParam, DebugPortStrategy } from './types.js';
import {
  exportCookiesFromCdp,
  inferProfileFromCookiePath,
  isWsl,
} from './loginHelpers.js';
import { pickAvailableDebugPort, DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE } from './portSelection.js';
import {
  formatBrowserOperationBusyResult,
  type BrowserOperationDispatcher,
} from './service/operationDispatcher.js';

export interface BrowserLoginOptions {
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  display?: string | null;
  loginUrl: string;
  compatibleHosts?: string[];
  loginLabel?: string;
  exportCookies?: boolean;
  preferCookieProfile?: boolean;
  cookieExport?: {
    urls: string[];
    requiredCookies?: string[];
    timeoutMs?: number;
    signedOutProbe?: {
      expression: string;
      errorMessage: string;
    };
    signedOutRecovery?: {
      expression: string;
      attemptLimit?: number;
      graceMs?: number;
    };
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
    compatibleHosts?: string[];
    display?: string | null;
    hideWindow?: boolean;
    debugPort?: number;
    debugPortStrategy?: DebugPortStrategy | null;
    serviceTabLimit?: number | null;
    blankTabLimit?: number | null;
    collapseDisposableWindows?: boolean;
    logger: () => void;
  }) => Promise<{ chrome: { process?: { unref?: () => void }; pid?: number | null; host?: string; port?: number } }>;
  onCookiesExported?: (cookies: CookieParam[]) => Promise<void> | void;
  debugPortStrategy?: DebugPortStrategy | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
  hideWindow?: boolean;
  operationDispatcher?: BrowserOperationDispatcher;
  operationOwnerCommand?: string;
}

export async function runBrowserLogin(options: BrowserLoginOptions): Promise<void> {
  const {
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    cookiePath,
    display,
    loginUrl,
    compatibleHosts,
    loginLabel,
    exportCookies,
    preferCookieProfile = true,
    cookieExport,
    onRegisterInstance,
    launchManualLoginSession,
    onCookiesExported,
    debugPortStrategy,
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
    hideWindow,
    operationDispatcher,
    operationOwnerCommand,
  } = options;

  const inferred = cookiePath && preferCookieProfile ? inferProfileFromCookiePath(cookiePath) : null;
  const userDataDir = inferred?.userDataDir ?? manualLoginProfileDir;
  const profileName = inferred?.profileDir ?? chromeProfile;
  const operation = operationDispatcher
    ? await operationDispatcher.acquire({
        managedProfileDir: userDataDir,
        serviceTarget: loginLabel ?? 'browser',
        kind: 'login',
        operationClass: 'exclusive-human',
        ownerCommand: operationOwnerCommand,
      })
    : null;
  if (operation && !operation.acquired) {
    throw new Error(formatBrowserOperationBusyResult(operation));
  }

  try {
    const effectiveDebugPortStrategy = debugPortStrategy ?? (isWsl() && /^\/mnt\/[a-z]\//i.test(chromePath) ? 'auto' : 'fixed');
    const debugPort = effectiveDebugPortStrategy === 'fixed'
      ? await pickAvailableDebugPort(
          DEFAULT_DEBUG_PORT,
          () => undefined,
          DEFAULT_DEBUG_PORT_RANGE,
        )
      : undefined;

    if (exportCookies) {
      if (!cookieExport?.urls?.length) {
        throw new Error('Cookie export requires cookieExport.urls to be set.');
      }
      if (process.platform !== 'win32' || isWsl()) {
        console.log(
          'Note: if Chrome is already running, it may ignore --user-data-dir; quit Chrome to force the login profile.',
        );
      }
      const cookieUrls = cookieExport.urls;
      const requiredCookies = cookieExport.requiredCookies ?? [];
      const timeoutMs = cookieExport.timeoutMs ?? 120_000;
      const { chrome } = await launchManualLoginSession({
        chromePath,
        profileName,
        userDataDir,
        url: loginUrl,
        compatibleHosts,
        display,
        hideWindow,
        debugPort,
        debugPortStrategy: effectiveDebugPortStrategy,
        serviceTabLimit,
        blankTabLimit,
        collapseDisposableWindows,
        logger: () => undefined,
      });
      chrome.process?.unref?.();
      const debugHost = chrome.host ?? '127.0.0.1';
      const activePort = chrome.port ?? debugPort ?? null;
      await onRegisterInstance?.({
        userDataDir,
        profileName,
        port: activePort ?? undefined,
        host: debugHost,
        pid: chrome.pid ?? undefined,
      });

      const label = loginLabel ?? 'browser';
      console.log(`Opened ${label} login in ${chromePath}`);
      console.log(`Profile: ${userDataDir} (${profileName})`);
      console.log(`URL: ${loginUrl}`);
      console.log('Waiting for cookies...');
      if (!activePort) {
        throw new Error('Chrome did not expose a DevTools port for cookie export.');
      }

      const cookies = await exportCookiesFromCdp({
        port: activePort,
        host: debugHost,
        requiredNames: requiredCookies,
        urls: cookieUrls,
        timeoutMs,
        signedOutProbe: cookieExport.signedOutProbe,
        signedOutRecovery: cookieExport.signedOutRecovery,
      });
      await onCookiesExported?.(cookies);
      return;
    }

    if (process.platform !== 'win32' || isWsl()) {
      console.log(
        'Note: if Chrome is already running, it may ignore --user-data-dir; quit Chrome to force the login profile.',
      );
    }
    const { chrome } = await launchManualLoginSession({
      chromePath,
      profileName,
      userDataDir,
      url: loginUrl,
      compatibleHosts,
      display,
      hideWindow,
      debugPort,
      debugPortStrategy: effectiveDebugPortStrategy,
      serviceTabLimit,
      blankTabLimit,
      collapseDisposableWindows,
      logger: () => undefined,
    });
    chrome.process?.unref?.();
    const debugHost = chrome.host ?? '127.0.0.1';
    const activePort = chrome.port ?? debugPort ?? null;
    await onRegisterInstance?.({
      userDataDir,
      profileName,
      port: activePort ?? undefined,
      host: debugHost,
      pid: chrome.pid ?? undefined,
    });
    const label = loginLabel ?? 'browser';
    console.log(`Opened ${label} login in ${chromePath}`);
    console.log(`Profile: ${userDataDir} (${profileName})`);
    console.log(`URL: ${loginUrl}`);
    if (activePort) {
      console.log(`Debug endpoint: ${debugHost}:${activePort}`);
    }
  } finally {
    if (operation?.acquired) {
      await operation.release();
    }
  }
}
