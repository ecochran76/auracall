import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserConfig } from '../config.js';
import { resolveManagedProfileDirForUserConfig } from '../profileStore.js';
import { resolveBrowserListTarget, pruneRegistry } from './session.js';
import { launchManualLoginSession } from '../manualLogin.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import {
  scanRegisteredInstance,
  explainTabResolution,
  summarizeTabResolution,
  type TabDescriptor,
  type TabResolutionExplanation,
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

export type ServiceTargetResolution = {
  host?: string;
  port?: number;
  tab?: TabDescriptor | null;
  tabs?: TabDescriptor[];
  tabSelection?: TabResolutionExplanation;
};

export class BrowserService extends BrowserServiceCore {
  private readonly registryPath: string;
  private readonly userConfig: ResolvedUserConfig;
  private constructor(userConfig: ResolvedUserConfig) {
    const resolvedConfig = resolveBrowserConfig(userConfig.browser);
    const registryPath = path.join(getAuracallHomeDir(), 'browser-state.json');
    const deps: BrowserServiceDependencies = {
      resolveBrowserListTarget: () => resolveBrowserListTarget(userConfig),
      pruneRegistry: () => pruneRegistry(),
      launchManualLoginSession,
    };
    super(resolvedConfig, deps);
    this.registryPath = registryPath;
    this.userConfig = userConfig;
  }

  static fromConfig(userConfig: ResolvedUserConfig): BrowserService {
    return new BrowserService(userConfig);
  }

  async resolveServiceTarget(
    options: ServiceTargetMatchOptions,
  ): Promise<ServiceTargetResolution> {
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
      resolveManagedProfileDirForUserConfig(this.userConfigForProfilePath(), options.serviceId);
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
    const configuredMatcher =
      options.serviceId === 'grok' ? createConfiguredUrlMatcher(options.configuredUrl) : null;
    const serviceMatcher =
      options.serviceId === 'chatgpt'
        ? (url: string) => url.includes('chatgpt.com') || url.includes('chat.openai.com')
        : options.serviceId === 'gemini'
          ? (url: string) => url.includes('gemini.google.com')
          : (url: string) => url.includes('grok.com');
    const matchUrl = configuredMatcher ?? serviceMatcher;
    const tabSelection = scan?.tabs ? explainTabResolution(scan.tabs, { matchUrl }) : undefined;
    if (options.logger && tabSelection) {
      options.logger(`[browser-service] ${summarizeTabResolution(tabSelection)}`);
    }
    return {
      host: target.host,
      port: target.port,
      tab: tabSelection?.tab ?? null,
      tabs: scan?.tabs,
      tabSelection,
    };
  }

  override async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
  } = {}) {
    const fallbackDir = resolveManagedProfileDirForUserConfig(
      this.userConfigForProfilePath(),
      this.userConfig.browser?.target ?? 'chatgpt',
    );
    return super.resolveDevToolsTarget({
      ...options,
      defaultProfileDir: options.defaultProfileDir ?? fallbackDir,
    });
  }

  private userConfigForProfilePath(): Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'> {
    return {
      auracallProfile: this.userConfig.auracallProfile,
      browser: this.userConfig.browser,
    };
  }
}

function createConfiguredUrlMatcher(
  configuredUrl: string | null | undefined,
): ((url: string) => boolean) | null {
  if (!configuredUrl) {
    return null;
  }
  try {
    const configured = new URL(configuredUrl);
    const configuredPath = normalizeConfiguredPath(configured.pathname);
    const configuredSearch = normalizeConfiguredSearch(configured.searchParams);
    return (url: string) => {
      try {
        const candidate = new URL(url);
        if (candidate.host !== configured.host) {
          return false;
        }
        if (configuredPath === '/') {
          return true;
        }
        if (normalizeConfiguredPath(candidate.pathname) !== configuredPath) {
          return false;
        }
        if (!configured.search) {
          return true;
        }
        return normalizeConfiguredSearch(candidate.searchParams) === configuredSearch;
      } catch {
        return false;
      }
    };
  } catch {
    return (url: string) => url.includes(configuredUrl);
  }
}

function normalizeConfiguredPath(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return trimmed.replace(/\/+$/, '') || '/';
}

function normalizeConfiguredSearch(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
      }
      return leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
