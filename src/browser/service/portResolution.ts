import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import type { BrowserProfileTarget } from '../profileStore.js';
import {
  resolveBrowserListTarget as resolveBrowserListTargetCore,
  type BrowserListTarget,
} from '../../../packages/browser-service/src/service/portResolution.js';
import {
  resolveManagedBrowserLaunchContextFromResolvedConfig,
  resolveUserBrowserLaunchContext,
} from './profileResolution.js';

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
  const target = serviceTarget ?? userConfig.browser?.target ?? 'chatgpt';
  const { resolvedConfig: resolved } = resolveUserBrowserLaunchContext(userConfig, target);
  const launchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: userConfig.auracallProfile ?? null,
    browserProfileName: launchContextBrowserProfileName(userConfig, target),
    browser: resolved,
    target,
  });
  const profilePath = process.env.AURACALL_BROWSER_PROFILE_DIR ?? launchContext.managedProfileDir;
  const profileName = launchContext.managedChromeProfile;
  const registryPath = path.join(getAuracallHomeDir(), 'browser-state.json');
  return resolveBrowserListTargetCore({
    envPort,
    configuredPort: null,
    configuredPortStrategy: null,
    profilePath,
    profileName,
    registryPath,
    resolveHost: () => '127.0.0.1',
  });
}

function launchContextBrowserProfileName(
  userConfig: ResolvedUserConfig,
  target: BrowserProfileTarget,
): string | null {
  return resolveUserBrowserLaunchContext(
    userConfig as ResolvedUserConfig & Record<string, unknown>,
    target,
  ).resolution.profileFamily.browserProfileId;
}
