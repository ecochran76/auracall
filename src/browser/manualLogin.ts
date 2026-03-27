import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { DEFAULT_BROWSER_CONFIG } from './config.js';
import { launchManualLoginSession as launchManualLoginSessionCore } from '../../packages/browser-service/src/manualLogin.js';
import type { BrowserLogger, DebugPortStrategy } from './types.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  profileName: string;
  userDataDir: string;
  url: string;
  compatibleHosts?: string[];
  logger: BrowserLogger;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
  detach?: boolean;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchManualLoginSessionCore>>['chrome']; port: number }> {
  return launchManualLoginSessionCore({
    ...options,
    baseConfig: {
      ...DEFAULT_BROWSER_CONFIG,
      serviceTabLimit: options.serviceTabLimit ?? DEFAULT_BROWSER_CONFIG.serviceTabLimit,
      blankTabLimit: options.blankTabLimit ?? DEFAULT_BROWSER_CONFIG.blankTabLimit,
      collapseDisposableWindows:
        options.collapseDisposableWindows ?? DEFAULT_BROWSER_CONFIG.collapseDisposableWindows,
    },
    registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'),
  });
}
