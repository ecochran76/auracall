import path from 'node:path';
import fs from 'node:fs/promises';
import { isChromeAlive } from '../processCheck.js';
import { resolveProfileDirectoryName } from './profile.js';

export interface BrowserInstance {
  pid: number;
  port: number;
  host: string;
  profilePath: string;
  profileName?: string;
  type: 'chrome' | 'chromium';
  launchedAt: string;
  lastSeenAt: string;
  args?: string[];
  services?: string[];
  tabs?: Array<{ targetId?: string; url?: string; title?: string; type?: string }>;
  lastKnownUrls?: string[];
}

export interface BrowserStateRegistry {
  instances: Record<string, BrowserInstance>;
  version?: number;
}

export type RegistryOptions = {
  registryPath: string;
};

async function loadRegistry(options: RegistryOptions): Promise<BrowserStateRegistry> {
  const file = options.registryPath;
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as BrowserStateRegistry;
    const normalized = normalizeRegistry(parsed);
    if (normalized.changed) {
      await saveRegistry(options, normalized.registry);
    }
    return normalized.registry;
  } catch {
    return { instances: {} };
  }
}

async function saveRegistry(options: RegistryOptions, registry: BrowserStateRegistry): Promise<void> {
  const file = options.registryPath;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(temp, JSON.stringify({ ...registry, version: 2 }, null, 2), 'utf8');
  await fs.rename(temp, file);
}

export async function registerInstance(options: RegistryOptions, instance: BrowserInstance): Promise<void> {
  const registry = await loadRegistry(options);
  const profileName = resolveProfileDirectoryName(instance.profilePath, instance.profileName ?? 'Default');
  const key = buildRegistryKey(instance.profilePath, profileName);
  registry.instances[key] = { ...instance, profileName };
  await saveRegistry(options, registry);
}

export async function unregisterInstance(
  options: RegistryOptions,
  profilePath: string,
  profileName?: string | null,
): Promise<void> {
  const registry = await loadRegistry(options);
  const resolvedProfile = resolveProfileDirectoryName(profilePath, profileName ?? 'Default');
  const key = buildRegistryKey(profilePath, resolvedProfile);
  if (registry.instances[key]) {
    delete registry.instances[key];
    await saveRegistry(options, registry);
  }
}

export async function findActiveInstance(
  options: RegistryOptions,
  profilePath: string,
  profileName?: string | null,
): Promise<BrowserInstance | null> {
  const registry = await loadRegistry(options);
  const normalizedName = resolveProfileDirectoryName(profilePath, profileName ?? 'Default');
  const key = buildRegistryKey(profilePath, normalizedName);
  let instance = registry.instances[key];
  if (!instance) {
    const legacyKey = path.normalize(profilePath);
    const legacy = registry.instances[legacyKey];
    if (legacy) {
      const migrated = { ...legacy, profileName: normalizedName };
      delete registry.instances[legacyKey];
      registry.instances[key] = migrated;
      await saveRegistry(options, registry);
      instance = migrated;
    }
  }
  if (!instance) return null;

  const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port);
  if (alive) {
    return instance;
  }

  await unregisterInstance(options, profilePath, normalizedName);
  return null;
}

export async function pruneRegistry(options: RegistryOptions): Promise<void> {
  const registry = await loadRegistry(options);
  let changed = false;
  for (const [key, instance] of Object.entries(registry.instances)) {
    const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port);
    if (!alive) {
      delete registry.instances[key];
      changed = true;
    }
  }
  if (changed) {
    await saveRegistry(options, registry);
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
  const normalized: BrowserStateRegistry = { instances: {}, version: 2 };
  let changed = false;
  for (const [key, instance] of Object.entries(registry.instances ?? {})) {
    const profileName = resolveProfileDirectoryName(instance.profilePath, instance.profileName ?? 'Default');
    const normalizedKey = buildRegistryKey(instance.profilePath, profileName);
    normalized.instances[normalizedKey] = { ...instance, profileName };
    if (normalizedKey !== key) {
      changed = true;
    }
  }
  if ((registry.version ?? 1) !== 2) {
    changed = true;
  }
  if (!changed) {
    return { registry, changed };
  }
  return { registry: normalized, changed };
}
