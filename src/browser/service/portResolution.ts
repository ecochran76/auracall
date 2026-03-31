import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import {
  resolveManagedProfileDirForUserConfig,
  type BrowserProfileTarget,
} from '../profileStore.js';
import {
  resolveBrowserListTarget as resolveBrowserListTargetCore,
  type BrowserListTarget,
} from '../../../packages/browser-service/src/service/portResolution.js';

export type { BrowserListTarget };

export async function resolveBrowserListPort(
  userConfig: ResolvedUserConfig,
  serviceTarget?: BrowserProfileTarget,
): Promise<number | undefined> {
  const target = await resolveBrowserListTarget(userConfig, serviceTarget);
  return target?.port;
}

export async function resolveBrowserListTarget(
  userConfig: ResolvedUserConfig,
  serviceTarget?: BrowserProfileTarget,
): Promise<BrowserListTarget | undefined> {
  const envPort = process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT ?? null;
  const configuredPort = userConfig.browser?.debugPort ?? null;
  const configuredPortStrategy = userConfig.browser?.debugPortStrategy ?? null;
  const target = serviceTarget ?? userConfig.browser?.target ?? 'chatgpt';
  const profilePath =
    process.env.AURACALL_BROWSER_PROFILE_DIR ??
    userConfig.browser?.manualLoginProfileDir ??
    resolveManagedProfileDirForUserConfig(
      userConfig.browser ? { ...userConfig, browser: { ...userConfig.browser, target } } : { ...userConfig, browser: { target } },
      target,
    );
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
