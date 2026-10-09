import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  launchChrome as launchChromeCore,
  listChromeTargets,
  registerTerminationHooks,
  hideChromeWindow,
  wasChromeLaunchedByAuracall,
  connectToChrome,
  connectToChromeTarget,
  connectToRemoteChrome,
  openChromeTarget,
  closeRemoteChromeTarget,
  resolveWslHost,
  buildWslFirewallHint,
  reuseRunningChromeProfile,
  resolveUserDataBaseDir,
} from '../../packages/browser-service/src/chromeLifecycle.js';
import type { BrowserLogger, ResolvedBrowserConfig } from './types.js';
import { launchAgentBrowserRdpSession } from './service/agentBrowserRdpLauncher.js';

export async function launchChrome(
  config: ResolvedBrowserConfig,
  userDataDir: string,
  logger: BrowserLogger,
  options: {
    onWindowsRetry?: (context: { failedPort: number; nextPort: number; attempt: number }) => Promise<void>;
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
    abortSignal?: AbortSignal;
  } = {},
) {
  if (config.agentBrowserRdp?.enabled) {
    options.abortSignal?.throwIfAborted();
    const result = await launchAgentBrowserRdpSession({
      config,
      userDataDir,
      url: config.url,
      serviceTarget: config.target ?? 'chatgpt',
      logger,
      abortSignal: options.abortSignal,
    });
    // Agent Browser owns the process; ending a prompt must not kill its desktop.
    return {
      ...result.chrome,
      remoteDebuggingPipes: null,
      process: undefined,
      kill: async () => { logger('Keeping Agent Browser-owned remote-view browser running.'); },
    } as unknown as Awaited<ReturnType<typeof launchChromeCore>>;
  }
  return launchChromeCore(config, userDataDir, logger, {
    registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'),
    onWindowsRetry: options.onWindowsRetry,
    ownedPids: options.ownedPids,
    ownedPorts: options.ownedPorts,
    abortSignal: options.abortSignal,
  });
}

export {
  listChromeTargets,
  registerTerminationHooks,
  hideChromeWindow,
  wasChromeLaunchedByAuracall,
  connectToChrome,
  connectToChromeTarget,
  connectToRemoteChrome,
  openChromeTarget,
  closeRemoteChromeTarget,
  resolveWslHost,
  buildWslFirewallHint,
  reuseRunningChromeProfile,
  resolveUserDataBaseDir,
};
