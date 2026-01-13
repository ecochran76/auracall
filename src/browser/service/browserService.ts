import os from 'node:os';
import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserConfig } from '../config.js';
import { resolveBrowserListTarget, pruneRegistry } from './session.js';
import { launchManualLoginSession } from '../manualLogin.js';
import { getOracleHomeDir } from '../../oracleHome.js';
import {
  scanRegisteredInstance,
  resolveTab,
  type TabDescriptor,
} from '../../../packages/browser-service/src/service/instanceScanner.js';
import {
  updateInstance,
  listInstances,
  registerInstance,
} from '../../../packages/browser-service/src/service/stateRegistry.js';
import { findChromePidUsingUserDataDir } from '../../../packages/browser-service/src/processCheck.js';
import {
  BrowserService as BrowserServiceCore,
  type BrowserServiceDependencies,
} from '../../../packages/browser-service/src/service/browserService.js';

type ServiceTargetMatchOptions = {
  serviceId: 'chatgpt' | 'grok' | 'gemini';
  configuredUrl?: string | null;
  ensurePort?: boolean;
  logger?: (message: string) => void;
};

export class BrowserService extends BrowserServiceCore {
  private readonly registryPath: string;
  private constructor(userConfig: ResolvedUserConfig) {
    const resolvedConfig = resolveBrowserConfig(userConfig.browser);
    const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
    const deps: BrowserServiceDependencies = {
      resolveBrowserListTarget: () => resolveBrowserListTarget(userConfig),
      pruneRegistry: () => pruneRegistry(),
      launchManualLoginSession,
    };
    super(resolvedConfig, deps);
    this.registryPath = registryPath;
  }

  static fromConfig(userConfig: ResolvedUserConfig): BrowserService {
    return new BrowserService(userConfig);
  }

  async resolveServiceTarget(
    options: ServiceTargetMatchOptions,
  ): Promise<{ host?: string; port?: number; tab?: TabDescriptor | null; tabs?: TabDescriptor[] }> {
    const target = await this.resolveDevToolsTarget({
      host: undefined,
      port: undefined,
      ensurePort: options.ensurePort,
      launchUrl: options.configuredUrl ?? undefined,
    });
    if (!target.port) {
      return { host: target.host, port: target.port };
    }

    const resolved = this.getConfig();
    const knownInstances = await listInstances({ registryPath: this.registryPath });
    const matchedByPort = knownInstances.find((instance) =>
      instance.port === target.port && (target.host ? instance.host === target.host : true),
    );
    const profilePath =
      matchedByPort?.profilePath ??
      resolved.manualLoginProfileDir ??
      path.join(os.homedir(), '.oracle', 'browser-profile');
    const profileName = matchedByPort?.profileName ?? resolved.chromeProfile ?? 'Default';
    if (!matchedByPort && target.port) {
      const pid = await findChromePidUsingUserDataDir(profilePath);
      if (pid) {
        await registerInstance(
          { registryPath: this.registryPath },
          {
            pid,
            port: target.port,
            host: target.host ?? '127.0.0.1',
            profilePath,
            profileName,
            type: 'chrome',
            launchedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            services: options.serviceId ? [options.serviceId] : undefined,
          },
        );
      }
    }
    const scan = await scanRegisteredInstance(
      { registryPath: this.registryPath },
      profilePath,
      profileName,
      options.logger,
      {
        services: options.serviceId ? [options.serviceId] : undefined,
      },
    );
    if (scan?.instance?.services && options.serviceId) {
      const merged = new Set(scan.instance.services);
      merged.add(options.serviceId);
      await updateInstance(
        { registryPath: this.registryPath },
        profilePath,
        profileName,
        { services: Array.from(merged) },
      );
    }
    const matchUrl = options.configuredUrl
      ? (url: string) => url.includes(options.configuredUrl ?? '')
      : (url: string) => url.includes(`${options.serviceId}.`) || url.includes(`/${options.serviceId}`);
    const tab = scan?.tabs ? resolveTab(scan.tabs, { matchUrl }) : null;
    return { host: target.host, port: target.port, tab, tabs: scan?.tabs };
  }

  override async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
  } = {}) {
    const fallbackDir = path.join(os.homedir(), '.oracle', 'browser-profile');
    return super.resolveDevToolsTarget({
      ...options,
      defaultProfileDir: options.defaultProfileDir ?? fallbackDir,
    });
  }
}
