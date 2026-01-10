import path from 'node:path';
import fs from 'node:fs/promises';
import { getOracleHomeDir } from '../oracleHome.js';
import { isChromeAlive } from './processCheck.js';

export interface BrowserInstance {
  pid: number;
  port: number;
  host: string;
  profilePath: string;
  type: 'chrome' | 'chromium';
  launchedAt: string;
  lastSeenAt: string;
}

export interface BrowserStateRegistry {
  instances: Record<string, BrowserInstance>; // Keyed by normalized profilePath
}

function getRegistryPath(): string {
  return path.join(getOracleHomeDir(), 'browser-state.json');
}

async function loadRegistry(): Promise<BrowserStateRegistry> {
  const file = getRegistryPath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as BrowserStateRegistry;
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
  const key = path.normalize(instance.profilePath);
  registry.instances[key] = instance;
  await saveRegistry(registry);
}

export async function unregisterInstance(profilePath: string): Promise<void> {
  const registry = await loadRegistry();
  const key = path.normalize(profilePath);
  if (registry.instances[key]) {
    delete registry.instances[key];
    await saveRegistry(registry);
  }
}

export async function findActiveInstance(profilePath: string): Promise<BrowserInstance | null> {
  const registry = await loadRegistry();
  const key = path.normalize(profilePath);
  const instance = registry.instances[key];
  if (!instance) return null;

  // Verify liveliness
  const alive = await isChromeAlive(instance.pid, instance.profilePath, instance.port);
  if (alive) {
    // We could update lastSeenAt here, but let's avoid IO churn on read.
    return instance;
  }

  // Prune if dead
  await unregisterInstance(profilePath);
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
