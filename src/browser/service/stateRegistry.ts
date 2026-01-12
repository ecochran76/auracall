import path from 'node:path';
import { getOracleHomeDir } from '../../oracleHome.js';
import {
  findActiveInstance as findActiveInstanceCore,
  pruneRegistry as pruneRegistryCore,
  registerInstance as registerInstanceCore,
  unregisterInstance as unregisterInstanceCore,
  type BrowserInstance,
  type BrowserStateRegistry,
} from '../../../packages/browser-service/src/service/stateRegistry.js';

type RegistryOptions = {
  registryPath: string;
};

function getRegistryOptions(): RegistryOptions {
  return { registryPath: path.join(getOracleHomeDir(), 'browser-state.json') };
}

export type { BrowserInstance, BrowserStateRegistry };

export async function registerInstance(instance: BrowserInstance): Promise<void> {
  await registerInstanceCore(getRegistryOptions(), instance);
}

export async function unregisterInstance(profilePath: string, profileName?: string | null): Promise<void> {
  await unregisterInstanceCore(getRegistryOptions(), profilePath, profileName);
}

export async function findActiveInstance(
  profilePath: string,
  profileName?: string | null,
): Promise<BrowserInstance | null> {
  return findActiveInstanceCore(getRegistryOptions(), profilePath, profileName);
}

export async function pruneRegistry(): Promise<void> {
  await pruneRegistryCore(getRegistryOptions());
}
