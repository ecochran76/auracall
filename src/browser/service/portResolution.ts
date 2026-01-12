import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { UserConfig } from '../../config.js';
import { getOracleHomeDir } from '../../oracleHome.js';
import { isDevToolsResponsive } from '../processCheck.js';
import { resolveWslHost } from '../chromeLifecycle.js';
import { resolveProfileDirectoryName } from './profile.js';

export type BrowserListTarget = {
  port: number;
  host?: string;
};

export async function resolveBrowserListPort(userConfig: UserConfig): Promise<number | undefined> {
  const target = await resolveBrowserListTarget(userConfig);
  return target?.port;
}

export async function resolveBrowserListTarget(
  userConfig: UserConfig,
): Promise<BrowserListTarget | undefined> {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      const host = resolveWslHost() ?? '127.0.0.1';
      return { port: parsed, host };
    }
  }
  const configuredPort = userConfig.browser?.debugPort;
  if (configuredPort && Number.isFinite(configuredPort) && configuredPort > 0) {
    const host = resolveWslHost() ?? '127.0.0.1';
    return { port: configuredPort, host };
  }
  const profilePath =
    userConfig.browser?.manualLoginProfileDir ??
    process.env.ORACLE_BROWSER_PROFILE_DIR ??
    path.join(os.homedir(), '.oracle', 'browser-profile');
  const rawProfileName = (userConfig.browser?.chromeProfile ?? 'Default').trim();
  const resolvedProfileName = resolveProfileDirectoryName(profilePath, rawProfileName);
  const profileName = resolvedProfileName.trim().toLowerCase();
  const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
  try {
    const rawRegistry = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(rawRegistry) as {
      instances?: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string; profilePath?: string; profileName?: string }>;
    };
    const normalized = normalizeRegistry(registry);
    if (normalized.changed) {
      await fs.writeFile(registryPath, JSON.stringify(normalized.registry, null, 2), 'utf8');
    }
    const candidates = Object.values(normalized.registry.instances ?? {})
      .filter((instance) => {
        if (typeof instance.port !== 'number' || instance.port <= 0) return false;
        if (profilePath && instance.profilePath && instance.profilePath !== profilePath) return false;
        const instanceName = (instance.profileName ?? 'Default').trim().toLowerCase();
        if (profileName && instanceName !== profileName) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.lastSeenAt || a.launchedAt || '') || 0;
        const bTime = Date.parse(b.lastSeenAt || b.launchedAt || '') || 0;
        return bTime - aTime;
      });
    for (const instance of candidates) {
      const host = instance.host || '127.0.0.1';
      const port = instance.port as number;
      if (await isDevToolsResponsive({ host, port, attempts: 2, timeoutMs: 750 })) {
        return { host, port };
      }
    }
  } catch {
    // ignore registry read errors
  }
  return undefined;
}

function normalizeRegistry(registry: {
  instances?: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string; profilePath?: string; profileName?: string }>;
}): { registry: { instances: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string; profilePath?: string; profileName?: string }> }; changed: boolean } {
  const normalized: { instances: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string; profilePath?: string; profileName?: string }> } = { instances: {} };
  let changed = false;
  for (const [key, instance] of Object.entries(registry.instances ?? {})) {
    if (!instance.profilePath) {
      normalized.instances[key] = instance;
      continue;
    }
    const profileName = instance.profileName ?? 'Default';
    const resolvedProfileName = resolveProfileDirectoryName(instance.profilePath, profileName);
    const normalizedKey = buildRegistryKey(instance.profilePath, resolvedProfileName);
    normalized.instances[normalizedKey] = { ...instance, profileName: resolvedProfileName };
    if (normalizedKey !== key) {
      changed = true;
    }
  }
  if (!changed) {
    return { registry: (registry as { instances: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string; profilePath?: string; profileName?: string }> }), changed };
  }
  return { registry: normalized, changed };
}

function buildRegistryKey(profilePath: string, profileName: string): string {
  const normalizedPath = path.normalize(profilePath);
  const normalizedName = profileName.trim().toLowerCase();
  return `${normalizedPath}::${normalizedName}`;
}
