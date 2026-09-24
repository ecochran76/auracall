import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  BrowserLogger,
  ChromeClient,
  DevToolsConnectionOptions,
  ResolvedBrowserConfig,
} from '../types.js';
import { isDevToolsResponsive } from '../processCheck.js';
import type { CredentialHint } from './types.js';
import { connectToChrome, connectToChromeTarget } from '../chromeLifecycle.js';

const DEFAULT_DEVTOOLS_ATTACHMENT_STAGE_TIMEOUT_MS = 10_000;
const MANAGED_PROFILE_OWNER_READINESS_ATTEMPTS = 10;
const MANAGED_PROFILE_OWNER_READINESS_INTERVAL_MS = 250;

export type BrowserServiceDependencies = {
  resolveBrowserListTarget: () => Promise<{ host?: string; port?: number } | undefined>;
  resolveManagedProfileOwner?: (userDataDir: string) => Promise<{
    host?: string;
    port?: number;
    pid?: number;
  } | null>;
  pruneRegistry: () => Promise<void>;
  launchManualLoginSession: (options: {
    chromePath: string;
    display?: string | null;
    profileName: string;
    userDataDir: string;
    url: string;
    compatibleHosts?: string[];
    logger: BrowserLogger;
    hideWindow?: boolean;
    debugPort?: number;
    debugPortStrategy?: ResolvedBrowserConfig['debugPortStrategy'];
    debugPortRange?: [number, number] | null;
    serviceTabLimit?: number | null;
    blankTabLimit?: number | null;
    collapseDisposableWindows?: boolean;
    detach?: boolean;
    abortSignal?: AbortSignal;
    onStage?: (stage: string) => void;
  }) => Promise<{ chrome: { port?: number; host?: string }; port: number }>;
};

export class BrowserService {
  private readonly resolvedConfig;
  private readonly deps;

  constructor(config: ResolvedBrowserConfig, deps: BrowserServiceDependencies) {
    this.resolvedConfig = config;
    this.deps = deps;
  }

  getConfig() {
    return this.resolvedConfig;
  }

  async pruneRegistry(): Promise<void> {
    await this.deps.pruneRegistry();
  }

  async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
    abortSignal?: AbortSignal;
    onStage?: (stage: string) => void;
  } = {}): Promise<{ host?: string; port?: number; launched?: boolean }> {
    const remoteChrome = this.resolvedConfig.remoteChrome ?? null;
    let port = options.port ?? remoteChrome?.port;
    let host = options.host ?? remoteChrome?.host;
    if (!port) {
      options.onStage?.('browserTargetDiscovery');
      const target = await this.deps.resolveBrowserListTarget();
      port = target?.port;
      host ??= target?.host;
    }
    if (options.ensurePort && port) {
      options.onStage?.('browserConfiguredDevToolsProbe');
      const candidateHost = host ?? '127.0.0.1';
      const reachable = await isDevToolsResponsive({
        host: candidateHost,
        port,
        attempts: 2,
        timeoutMs: 1000,
      });
      if (!reachable) {
        port = undefined;
      }
    }
    if (!port && options.ensurePort) {
      options.abortSignal?.throwIfAborted();
      const userDataDir =
        this.resolvedConfig.manualLoginProfileDir ??
        options.defaultProfileDir ??
        path.join(os.homedir(), '.browser-service', 'browser-profile');
      let managedProfileOwner = await this.deps.resolveManagedProfileOwner?.(userDataDir);
      if (managedProfileOwner) {
        options.onStage?.('browserManagedProfileOwnerProbe');
        const initialOwner = managedProfileOwner;
        for (let attempt = 1; attempt <= MANAGED_PROFILE_OWNER_READINESS_ATTEMPTS; attempt += 1) {
          const ownerHost = managedProfileOwner?.host ?? initialOwner.host ?? '127.0.0.1';
          const ownerPort = managedProfileOwner?.port;
          const ownerReachable = ownerPort
            ? await isDevToolsResponsive({
                host: ownerHost,
                port: ownerPort,
                attempts: 2,
                timeoutMs: 1000,
              })
            : false;
          if (ownerPort && ownerReachable) {
            return { host: ownerHost, port: ownerPort, launched: false };
          }
          if (attempt < MANAGED_PROFILE_OWNER_READINESS_ATTEMPTS) {
            await delay(MANAGED_PROFILE_OWNER_READINESS_INTERVAL_MS, undefined, {
              signal: options.abortSignal,
            });
            managedProfileOwner =
              (await this.deps.resolveManagedProfileOwner?.(userDataDir)) ?? managedProfileOwner;
          }
        }
        throw new Error(
          `Managed browser profile ${userDataDir} is already owned by Chrome process ${managedProfileOwner.pid ?? initialOwner.pid ?? 'unknown'}, but no responsive DevTools endpoint could be attributed. Refusing to launch a second Chrome process for the same managed browser profile.`,
        );
      }
      const profileName = this.resolvedConfig.chromeProfile ?? 'Default';
      const url = options.launchUrl ?? 'about:blank';
      options.onStage?.('browserDebugPortResolution');
      const launchDebugPort = await this.resolveLaunchDebugPort(options.defaultProfileDir);
      options.onStage?.('browserManualLoginLaunch');
      const { chrome } = await this.deps.launchManualLoginSession({
        chromePath: this.resolvedConfig.chromePath ?? 'google-chrome',
        display: this.resolvedConfig.display ?? null,
        profileName,
        userDataDir,
        url,
        logger: () => undefined,
        hideWindow: this.resolvedConfig.hideWindow,
        debugPortRange: this.resolvedConfig.debugPortRange ?? undefined,
        debugPort: launchDebugPort.debugPort,
        debugPortStrategy: launchDebugPort.debugPortStrategy,
        serviceTabLimit: this.resolvedConfig.serviceTabLimit ?? undefined,
        blankTabLimit: 0,
        collapseDisposableWindows: this.resolvedConfig.collapseDisposableWindows,
        detach: true,
        abortSignal: options.abortSignal,
        onStage: options.onStage,
      });
      port = chrome.port;
      host = chrome.host ?? host;
      return { host, port, launched: true };
    }
    return { host, port, launched: false };
  }

  private async resolveLaunchDebugPort(defaultProfileDir?: string): Promise<{
    debugPort?: number;
    debugPortStrategy?: ResolvedBrowserConfig['debugPortStrategy'];
  }> {
    const debugPort = this.resolvedConfig.debugPort ?? undefined;
    const debugPortStrategy = this.resolvedConfig.debugPortStrategy ?? undefined;
    if (!defaultProfileDir || !debugPort || debugPortStrategy === 'auto') {
      return { debugPort, debugPortStrategy };
    }
    const occupied = await isDevToolsResponsive({
      host: '127.0.0.1',
      port: debugPort,
      attempts: 1,
      timeoutMs: 500,
    });
    if (!occupied) {
      return { debugPort, debugPortStrategy };
    }
    return { debugPort: undefined, debugPortStrategy: 'auto' };
  }

  async connectDevTools(
    options: DevToolsConnectionOptions = {},
  ): Promise<{ client: ChromeClient; port: number }> {
    options.abortSignal?.throwIfAborted();
    const stageTimeoutMs = normalizePositiveTimeout(
      options.stageTimeoutMs,
      DEFAULT_DEVTOOLS_ATTACHMENT_STAGE_TIMEOUT_MS,
    );
    options.onStage?.('browserDevToolsTargetResolution');
    const exactTargetFields = [options.host, options.port, options.tabTargetId].filter(
      (value) => value !== undefined,
    ).length;
    if (exactTargetFields > 0 && exactTargetFields < 3) {
      throw new Error('Exact DevTools attachment requires host, port, and tabTargetId together.');
    }
    if (options.host && options.port && options.tabTargetId) {
      options.onStage?.('browserDevToolsCdpConnection');
      const client = await runDevToolsAttachmentStage(
        connectToChromeTarget({
          host: options.host,
          port: options.port,
          target: options.tabTargetId,
          abortSignal: options.abortSignal,
          timeoutMs: stageTimeoutMs,
        }),
        {
          stage: 'browserDevToolsCdpConnection',
          timeoutMs: stageTimeoutMs,
          abortSignal: options.abortSignal,
          onLateResolve: (lateClient) => lateClient.close().catch(() => undefined),
        },
      );
      options.onStage?.('browserDevToolsConnected');
      return { client, port: options.port };
    }
    const target = await runDevToolsAttachmentStage(
      this.deps.resolveBrowserListTarget(),
      {
        stage: 'browserDevToolsTargetResolution',
        timeoutMs: stageTimeoutMs,
        abortSignal: options.abortSignal,
      },
    );
    if (!target?.port) {
      throw new Error(
        'No DevTools port found. Launch a browser run to register the active session or set BROWSER_SERVICE_BROWSER_PORT.',
      );
    }
    options.onStage?.('browserDevToolsCdpConnection');
    const client = await runDevToolsAttachmentStage(
      connectToChrome(target.port, () => undefined, target.host, {
        abortSignal: options.abortSignal,
        timeoutMs: stageTimeoutMs,
      }),
      {
        stage: 'browserDevToolsCdpConnection',
        timeoutMs: stageTimeoutMs,
        abortSignal: options.abortSignal,
        onLateResolve: (lateClient) => lateClient.close().catch(() => undefined),
      },
    );
    options.onStage?.('browserDevToolsConnected');
    return { client, port: target.port };
  }

  async resolveCredentials(): Promise<CredentialHint | null> {
    return null;
  }
}

function normalizePositiveTimeout(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function runDevToolsAttachmentStage<T>(
  operation: Promise<T>,
  options: {
    stage: string;
    timeoutMs: number;
    abortSignal?: AbortSignal;
    onLateResolve?: (value: T) => Promise<void> | void;
  },
): Promise<T> {
  options.abortSignal?.throwIfAborted();
  let settled = false;
  let timeout: NodeJS.Timeout | null = null;
  let onAbort: (() => void) | null = null;

  return new Promise<T>((resolve, reject) => {
    const finish = (callback: () => void): boolean => {
      if (settled) return false;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (onAbort && options.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
      callback();
      return true;
    };

    operation.then(
      (value) => {
        if (!finish(() => resolve(value))) {
          void Promise.resolve(options.onLateResolve?.(value)).catch(() => undefined);
        }
      },
      (error) => {
        finish(() => reject(error));
      },
    );

    onAbort = () => {
      finish(() => reject(options.abortSignal?.reason ?? new Error('DevTools attachment aborted.')));
    };
    options.abortSignal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `DevTools attachment stage ${options.stage} timed out after ${options.timeoutMs}ms.`,
          ),
        ),
      );
    }, options.timeoutMs);
  });
}
