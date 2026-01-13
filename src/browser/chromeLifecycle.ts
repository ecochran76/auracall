import path from 'node:path';
import { getOracleHomeDir } from '../oracleHome.js';
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
) {
  return launchChromeCore(config, userDataDir, logger, {
    registryPath: path.join(getOracleHomeDir(), 'browser-state.json'),
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
