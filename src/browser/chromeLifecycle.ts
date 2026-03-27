import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  launchChrome as launchChromeCore,
  registerTerminationHooks,
  hideChromeWindow,
  connectToChrome,
  connectToRemoteChrome,
  closeRemoteChromeTarget,
  resolveWslHost,
  buildWslFirewallHint,
  reuseRunningChromeProfile,
  resolveUserDataBaseDir,
} from '../../packages/browser-service/src/chromeLifecycle.js';
import type { BrowserLogger, ResolvedBrowserConfig } from './types.js';

export async function launchChrome(
  config: ResolvedBrowserConfig,
  userDataDir: string,
  logger: BrowserLogger,
  options: {
    onWindowsRetry?: (context: { failedPort: number; nextPort: number; attempt: number }) => Promise<void>;
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
  } = {},
) {
  return launchChromeCore(config, userDataDir, logger, {
    registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'),
    onWindowsRetry: options.onWindowsRetry,
    ownedPids: options.ownedPids,
    ownedPorts: options.ownedPorts,
  });
}

export {
  registerTerminationHooks,
  hideChromeWindow,
  connectToChrome,
  connectToRemoteChrome,
  closeRemoteChromeTarget,
  resolveWslHost,
  buildWslFirewallHint,
  reuseRunningChromeProfile,
  resolveUserDataBaseDir,
};
