import path from 'node:path';
import { getAuracallHomeDir } from '../../auracallHome.js';
import { resolveBrowserConfig } from '../config.js';
import { resolveManagedProfileDir } from '../profileStore.js';
import type { BrowserAutomationConfig, BrowserRuntimeMetadata, BrowserSessionConfig } from '../types.js';
import type { BrowserSessionConfig as StoredBrowserSessionConfig } from '../../sessionManager.js';
import {
  listInstancesWithLiveness,
  type BrowserInstanceLiveness,
} from '../../../packages/browser-service/src/service/stateRegistry.js';

export type DiscardedRegistryCandidate = {
  key: string;
  profilePath: string;
  profileName: string;
  port: number;
  host: string;
  liveness: BrowserInstanceLiveness;
  actualPid: number | null;
  reason: 'selected-port-stale' | 'expected-profile-stale';
};

export type SelectedPortRegistryCandidate = {
  key: string;
  profilePath: string;
  profileName: string;
  port: number;
  host: string;
  liveness: BrowserInstanceLiveness;
  actualPid: number | null;
};

export type ReattachRegistryDiagnostics = {
  capturedAt: string;
  discardedRegistryCandidates: DiscardedRegistryCandidate[];
  expectedProfilePath: string;
  expectedProfileName: string;
  selectedPortCandidates?: SelectedPortRegistryCandidate[];
};

type ReattachRegistryConfig = BrowserSessionConfig | StoredBrowserSessionConfig | undefined;

export function collectDiscardedRegistryCandidates(input: {
  classifiedInstances: Awaited<ReturnType<typeof listInstancesWithLiveness>>;
  targetHost: string;
  targetPort: number;
  expectedProfilePath: string;
  expectedProfileName: string;
}): DiscardedRegistryCandidate[] {
  const normalizedExpectedPath = path.resolve(input.expectedProfilePath);
  const normalizedExpectedName = input.expectedProfileName.trim().toLowerCase();
  const candidates = new Map<string, DiscardedRegistryCandidate>();
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

export function collectSelectedPortRegistryCandidates(input: {
  classifiedInstances: Awaited<ReturnType<typeof listInstancesWithLiveness>>;
  targetHost: string;
  targetPort: number;
}): SelectedPortRegistryCandidate[] {
  const candidates = new Map<string, SelectedPortRegistryCandidate>();
  for (const entry of input.classifiedInstances) {
    const samePort =
      entry.instance.port === input.targetPort &&
      (entry.instance.host || '127.0.0.1') === input.targetHost;
    if (!samePort) continue;
    const normalizedName = (entry.instance.profileName ?? 'Default').trim().toLowerCase();
    const key = `${path.normalize(entry.instance.profilePath)}::${normalizedName}`;
    candidates.set(key, {
      key,
      profilePath: path.resolve(entry.instance.profilePath),
      profileName: entry.instance.profileName ?? 'Default',
      port: entry.instance.port,
      host: entry.instance.host,
      liveness: entry.liveness,
      actualPid: entry.actualPid,
    });
  }
  return Array.from(candidates.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export async function collectReattachRegistryDiagnostics(input: {
  runtime: Pick<BrowserRuntimeMetadata, 'chromePort' | 'chromeHost'>;
  config: ReattachRegistryConfig | undefined;
  registryPath?: string;
}): Promise<ReattachRegistryDiagnostics | null> {
  if (!input.runtime.chromePort) {
    return null;
  }
  const resolved = resolveBrowserConfig({
    ...(input.config ?? {}),
    target: input.config?.target ?? 'chatgpt',
  } as BrowserAutomationConfig, { auracallProfileName: input.config?.auracallProfileName ?? null });
  const expectedProfilePath =
    resolved.manualLoginProfileDir ??
    resolveManagedProfileDir({
      configuredDir: resolved.manualLoginProfileDir ?? null,
      managedProfileRoot: resolved.managedProfileRoot ?? null,
      target: resolved.target ?? 'chatgpt',
    });
  const expectedProfileName = resolved.chromeProfile ?? 'Default';
  const classifiedInstances = await listInstancesWithLiveness({
    registryPath: input.registryPath ?? path.join(getAuracallHomeDir(), 'browser-state.json'),
  });
  return {
    capturedAt: new Date().toISOString(),
    discardedRegistryCandidates: collectDiscardedRegistryCandidates({
      classifiedInstances,
      targetHost: input.runtime.chromeHost ?? '127.0.0.1',
      targetPort: input.runtime.chromePort,
      expectedProfilePath,
      expectedProfileName,
    }),
    expectedProfilePath,
    expectedProfileName,
    selectedPortCandidates: collectSelectedPortRegistryCandidates({
      classifiedInstances,
      targetHost: input.runtime.chromeHost ?? '127.0.0.1',
      targetPort: input.runtime.chromePort,
    }),
  };
}
