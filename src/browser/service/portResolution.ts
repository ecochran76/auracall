import os from 'node:os';
import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { getOracleHomeDir } from '../../oracleHome.js';
import { resolveWslHost } from '../chromeLifecycle.js';
import {
  resolveBrowserListTarget as resolveBrowserListTargetCore,
  type BrowserListTarget,
} from '../../../packages/browser-service/src/service/portResolution.js';

export type { BrowserListTarget };

export async function resolveBrowserListPort(userConfig: ResolvedUserConfig): Promise<number | undefined> {
  const target = await resolveBrowserListTarget(userConfig);
  return target?.port;
}

export async function resolveBrowserListTarget(
  userConfig: ResolvedUserConfig,
): Promise<BrowserListTarget | undefined> {
  const envPort = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT ?? null;
  const configuredPort = userConfig.browser?.debugPort ?? null;
  const profilePath =
    userConfig.browser?.manualLoginProfileDir ??
    process.env.ORACLE_BROWSER_PROFILE_DIR ??
    path.join(os.homedir(), '.oracle', 'browser-profile');
  const profileName = userConfig.browser?.chromeProfile ?? 'Default';
  const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
  return resolveBrowserListTargetCore({
    envPort,
    configuredPort,
    profilePath,
    profileName,
    registryPath,
    resolveHost: () => resolveWslHost() ?? '127.0.0.1',
  });
}
