import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import { resolveManagedProfileDirForUserConfig } from '../profileStore.js';
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
  const envPort = process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT ?? null;
  const configuredPort = userConfig.browser?.debugPort ?? null;
  const configuredPortStrategy = userConfig.browser?.debugPortStrategy ?? null;
  const profilePath =
    process.env.AURACALL_BROWSER_PROFILE_DIR ??
    userConfig.browser?.manualLoginProfileDir ??
    resolveManagedProfileDirForUserConfig(userConfig, userConfig.browser?.target ?? 'chatgpt');
  const profileName = userConfig.browser?.chromeProfile ?? 'Default';
  const registryPath = path.join(getAuracallHomeDir(), 'browser-state.json');
  return resolveBrowserListTargetCore({
    envPort,
    configuredPort,
    configuredPortStrategy,
    profilePath,
    profileName,
    registryPath,
    resolveHost: () => '127.0.0.1',
  });
}
