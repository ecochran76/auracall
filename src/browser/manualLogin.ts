import path from 'node:path';
import { getOracleHomeDir } from '../oracleHome.js';
import { DEFAULT_BROWSER_CONFIG } from './config.js';
import { launchManualLoginSession as launchManualLoginSessionCore } from '../../packages/browser-service/src/manualLogin.js';
import type { BrowserLogger } from './types.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  profileName: string;
  userDataDir: string;
  url: string;
  logger: BrowserLogger;
  debugPort?: number;
  debugPortRange?: [number, number] | null;
  detach?: boolean;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchManualLoginSessionCore>>['chrome']; port: number }> {
  return launchManualLoginSessionCore({
    ...options,
    baseConfig: DEFAULT_BROWSER_CONFIG,
    registryPath: path.join(getOracleHomeDir(), 'browser-state.json'),
  });
}
