import os from 'node:os';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import type { BrowserLogger, ChromeClient, ResolvedBrowserConfig } from '../types.js';
import { isDevToolsResponsive } from '../processCheck.js';
import type { CredentialHint } from './types.js';

export type BrowserServiceDependencies = {
  resolveBrowserListTarget: () => Promise<{ host?: string; port?: number } | undefined>;
  pruneRegistry: () => Promise<void>;
  launchManualLoginSession: (options: {
    chromePath: string;
    profileName: string;
    userDataDir: string;
    url: string;
    logger: BrowserLogger;
    debugPort?: number;
    debugPortRange?: [number, number] | null;
    detach?: boolean;
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
  } = {}): Promise<{ host?: string; port?: number; launched?: boolean }> {
    const remoteChrome = this.resolvedConfig.remoteChrome ?? null;
    let port = options.port ?? remoteChrome?.port;
    let host = options.host ?? remoteChrome?.host;
    if (!port) {
      const target = await this.deps.resolveBrowserListTarget();
      port = target?.port;
      host ??= target?.host;
    }
    if (options.ensurePort && port) {
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
      const userDataDir =
        this.resolvedConfig.manualLoginProfileDir ?? path.join(os.homedir(), '.oracle', 'browser-profile');
      const profileName = this.resolvedConfig.chromeProfile ?? 'Default';
      const url = options.launchUrl ?? 'about:blank';
      const { chrome } = await this.deps.launchManualLoginSession({
        chromePath: this.resolvedConfig.chromePath ?? 'google-chrome',
        profileName,
        userDataDir,
        url,
        logger: () => undefined,
        debugPortRange: this.resolvedConfig.debugPortRange ?? undefined,
        debugPort: this.resolvedConfig.debugPort ?? undefined,
        detach: true,
      });
      port = chrome.port;
      host = chrome.host ?? host;
      return { host, port, launched: true };
    }
    return { host, port, launched: false };
  }

  async connectDevTools(): Promise<{ client: ChromeClient; port: number }> {
    const target = await this.deps.resolveBrowserListTarget();
    if (!target?.port) {
      throw new Error(
        'No DevTools port found. Launch a browser run to register the active session or set ORACLE_BROWSER_PORT.',
      );
    }
    const client = await CDP({ port: target.port, host: target.host });
    return { client, port: target.port };
  }

  async resolveCredentials(): Promise<CredentialHint | null> {
    return null;
  }
}
