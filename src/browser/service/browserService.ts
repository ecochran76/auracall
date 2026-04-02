import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserConfig } from '../config.js';
import { resolveBrowserProfileResolutionFromResolvedConfig } from './profileResolution.js';
import type { ResolvedBrowserConfig } from '../types.js';
import {
  resolveManagedProfileDirForUserConfig,
  type BrowserProfileTarget,
} from '../profileStore.js';
import { matchesServiceUrl } from '../urlFamilies.js';
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
  listInstances,
  listInstancesWithLiveness,
  registerInstance,
  type BrowserInstanceLiveness,
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

export type ServiceTargetDiscardedRegistryCandidate = {
  key: string;
  profilePath: string;
  profileName: string;
  port: number;
  host: string;
  liveness: BrowserInstanceLiveness;
  actualPid: number | null;
  reason: 'selected-port-stale' | 'expected-profile-stale';
};

export type ServiceTargetResolution = {
  host?: string;
  port?: number;
  tab?: TabDescriptor | null;
  tabs?: TabDescriptor[];
  tabSelection?: TabResolutionExplanation;
  discardedRegistryCandidates?: ServiceTargetDiscardedRegistryCandidate[];
};

export class BrowserService extends BrowserServiceCore {
  private readonly registryPath: string;
  private readonly userConfig: ResolvedUserConfig;
  private readonly serviceTarget: BrowserProfileTarget;
  private constructor(userConfig: ResolvedUserConfig, target: BrowserProfileTarget) {
    const resolvedConfig = resolveBrowserConfig({
      ...(userConfig.browser ?? {}),
      target,
    });
    const registryPath = path.join(getAuracallHomeDir(), 'browser-state.json');
    const deps: BrowserServiceDependencies = {
      resolveBrowserListTarget: () => resolveBrowserListTarget(userConfig, target),
      pruneRegistry: () => pruneRegistry(),
      launchManualLoginSession,
    };
    super(resolvedConfig, deps);
    this.registryPath = registryPath;
    this.userConfig = userConfig;
    this.serviceTarget = target;
  }

  static fromConfig(
    userConfig: ResolvedUserConfig,
    target: BrowserProfileTarget = 'chatgpt',
  ): BrowserService {
    return new BrowserService(userConfig, target);
  }

  override getConfig(): ResolvedBrowserConfig {
    return super.getConfig() as ResolvedBrowserConfig;
  }

  async resolveServiceTarget(
    options: ServiceTargetMatchOptions,
  ): Promise<ServiceTargetResolution> {
    const launchProfile = this.resolveLaunchProfile(options.serviceId);
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
    const classifiedInstances = await listInstancesWithLiveness({ registryPath: this.registryPath });
    const knownInstances = classifiedInstances.map(({ instance }) => instance);
    const matchedByPort = classifiedInstances.find(({ instance, alive }) =>
      alive && instance.port === target.port && (target.host ? instance.host === target.host : true),
    )?.instance;
    const profileTarget = options.serviceId ?? this.serviceTarget;
    const expectedProfilePath =
      launchProfile.manualLoginProfileDir ??
      resolved.manualLoginProfileDir ??
      resolveManagedProfileDirForUserConfig(this.userConfigForProfilePath(profileTarget), profileTarget);
    const expectedProfileName = launchProfile.chromeProfile ?? resolved.chromeProfile ?? 'Default';
    const profilePath = matchedByPort?.profilePath ?? expectedProfilePath;
    const profileName = matchedByPort?.profileName ?? expectedProfileName;
    const discardedRegistryCandidates = collectDiscardedRegistryCandidates({
      classifiedInstances,
      targetHost: target.host ?? '127.0.0.1',
      targetPort: target.port,
      expectedProfilePath,
      expectedProfileName,
    });
    if (options.logger && discardedRegistryCandidates.length > 0) {
      options.logger(
        `[browser-service] Discarded registry candidates: ${discardedRegistryCandidates
          .map((candidate) =>
            `${candidate.reason} ${candidate.profilePath}::${candidate.profileName} port=${candidate.port} host=${candidate.host} liveness=${candidate.liveness}${candidate.actualPid ? ` actualPid=${candidate.actualPid}` : ''}`,
          )
          .join('; ')}`,
      );
    }
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
      {},
    );
    if (scan?.instance && options.serviceId && options.logger) {
      const recorded = scan.instance.services;
      if (recorded && !recorded.includes(options.serviceId)) {
        options.logger(
          `[browser-service] Skipping service-affinity merge for ${profilePath}::${profileName} ` +
            'to avoid cross-provider registry contamination',
        );
      }
    }
    const configuredMatcher =
      options.serviceId === 'grok' ? createConfiguredUrlMatcher(options.configuredUrl) : null;
    const serviceMatcher = (url: string) => matchesServiceUrl(options.serviceId, url);
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
      discardedRegistryCandidates,
    };
  }

  override async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
  } = {}) {
    const launchProfile = this.resolveLaunchProfile(this.serviceTarget);
    const fallbackDir =
      launchProfile.manualLoginProfileDir ??
      resolveManagedProfileDirForUserConfig(
        this.userConfigForProfilePath(this.serviceTarget),
        this.serviceTarget,
      );
    return super.resolveDevToolsTarget({
      ...options,
      defaultProfileDir: options.defaultProfileDir ?? fallbackDir,
    });
  }

  private resolveLaunchProfile(target: BrowserProfileTarget) {
    return resolveBrowserProfileResolutionFromResolvedConfig({
      auracallProfile: this.userConfig.auracallProfile ?? null,
      browser: this.userConfig.browser ?? {},
      target,
    }).launchProfile;
  }

  private userConfigForProfilePath(
    target: BrowserProfileTarget,
  ): Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'> {
    return {
      auracallProfile: this.userConfig.auracallProfile,
      browser: this.userConfig.browser ? { ...this.userConfig.browser, target } : { target },
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


function collectDiscardedRegistryCandidates(input: {
  classifiedInstances: Awaited<ReturnType<typeof listInstancesWithLiveness>>;
  targetHost: string;
  targetPort: number;
  expectedProfilePath: string;
  expectedProfileName: string;
}): ServiceTargetDiscardedRegistryCandidate[] {
  const normalizedExpectedPath = path.resolve(input.expectedProfilePath);
  const normalizedExpectedName = input.expectedProfileName.trim().toLowerCase();
  const candidates = new Map<string, ServiceTargetDiscardedRegistryCandidate>();
  for (const entry of input.classifiedInstances) {
    if (entry.alive) continue;
    const normalizedPath = path.resolve(entry.instance.profilePath);
    const normalizedName = (entry.instance.profileName ?? 'Default').trim().toLowerCase();
    const samePort =
      entry.instance.port === input.targetPort &&
      (entry.instance.host || '127.0.0.1') === input.targetHost;
    const sameExpectedProfile =
      normalizedPath === normalizedExpectedPath && normalizedName === normalizedExpectedName;
    const reason = samePort
      ? 'selected-port-stale'
      : sameExpectedProfile
        ? 'expected-profile-stale'
        : null;
    if (!reason) continue;
    const key = `${path.normalize(entry.instance.profilePath)}::${normalizedName}::${reason}`;
    candidates.set(key, {
      key,
      profilePath: normalizedPath,
      profileName: entry.instance.profileName ?? 'Default',
      port: entry.instance.port,
      host: entry.instance.host,
      liveness: entry.liveness,
      actualPid: entry.actualPid,
      reason,
    });
  }
  return Array.from(candidates.values()).sort((left, right) => {
    if (left.reason !== right.reason) return left.reason.localeCompare(right.reason);
    if (left.liveness !== right.liveness) return left.liveness.localeCompare(right.liveness);
    return left.profilePath.localeCompare(right.profilePath);
  });
}
