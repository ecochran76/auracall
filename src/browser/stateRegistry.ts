import path from 'node:path';
import fs from 'node:fs/promises';
import { getOracleHomeDir } from '../oracleHome.js';
import { isChromeAlive } from './processCheck.js';

export interface BrowserInstance {
  pid: number;
  port: number;
  host: string;
  profilePath: string;
  profileName?: string;
  type: 'chrome' | 'chromium';
  launchedAt: string;
  lastSeenAt: string;
}

export interface BrowserStateRegistry {
  instances: Record<string, BrowserInstance>;
}

function getRegistryPath(): string {
  return path.join(getOracleHomeDir(), 'browser-state.json');
}

async function loadRegistry(): Promise<BrowserStateRegistry> {
  const file = getRegistryPath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as BrowserStateRegistry;
    const normalized = normalizeRegistry(parsed);
    if (normalized.changed) {
      await saveRegistry(normalized.registry);
    }
    return normalized.registry;
  } catch {
    return { instances: {} };
  }
}

async function saveRegistry(registry: BrowserStateRegistry): Promise<void> {
  const file = getRegistryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Atomic write via temp file
  const temp = `${file}.tmp.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(temp, JSON.stringify(registry, null, 2), 'utf8');
  await fs.rename(temp, file);
}

export async function registerInstance(instance: BrowserInstance): Promise<void> {
  const registry = await loadRegistry();
  const profileName = instance.profileName ?? 'Default';
  const key = buildRegistryKey(instance.profilePath, profileName);
  registry.instances[key] = { ...instance, profileName };
  await saveRegistry(registry);
}

export async function unregisterInstance(profilePath: string, profileName?: string | null): Promise<void> {
  const registry = await loadRegistry();
  const key = buildRegistryKey(profilePath, profileName ?? undefined);
  if (registry.instances[key]) {
    delete registry.instances[key];
    await saveRegistry(registry);
  }
}

export async function findActiveInstance(
  profilePath: string,
  profileName?: string | null,
): Promise<BrowserInstance | null> {
  const registry = await loadRegistry();
  const normalizedName = profileName ?? 'Default';
  const key = buildRegistryKey(profilePath, normalizedName);
  let instance = registry.instances[key];
  if (!instance) {
    const legacyKey = path.normalize(profilePath);
    const legacy = registry.instances[legacyKey];
    if (legacy) {
      const migrated = { ...legacy, profileName: normalizedName };
      delete registry.instances[legacyKey];
      registry.instances[key] = migrated;
      await saveRegistry(registry);
      instance = migrated;
    }
  }
  if (!instance) return null;

  // Verify liveliness
  const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port);
  if (alive) {
    // We could update lastSeenAt here, but let's avoid IO churn on read.
    return instance;
  }

  // Prune if dead
  await unregisterInstance(profilePath, normalizedName);
  return null;
}

export async function pruneRegistry(): Promise<void> {
  const registry = await loadRegistry();
  let changed = false;
  for (const [key, instance] of Object.entries(registry.instances)) {
    const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port);
    if (!alive) {
      delete registry.instances[key];
      changed = true;
    }
  }
  if (changed) {
    await saveRegistry(registry);
  }
}

function buildRegistryKey(profilePath: string, profileName?: string): string {
  const normalizedPath = path.normalize(profilePath);
  const normalizedName = (profileName ?? 'Default').trim().toLowerCase();
  return `${normalizedPath}::${normalizedName}`;
}

function normalizeRegistry(
  registry: BrowserStateRegistry,
): { registry: BrowserStateRegistry; changed: boolean } {
  const normalized: BrowserStateRegistry = { instances: {} };
  let changed = false;
  for (const [key, instance] of Object.entries(registry.instances ?? {})) {
    const profileName = instance.profileName ?? 'Default';
    const normalizedKey = buildRegistryKey(instance.profilePath, profileName);
    normalized.instances[normalizedKey] = { ...instance, profileName };
    if (normalizedKey !== key) {
      changed = true;
    }
  }
  if (!changed) {
    return { registry, changed };
  }
  return { registry: normalized, changed };
}
