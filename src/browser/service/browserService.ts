import os from 'node:os';
import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserConfig } from '../config.js';
import { resolveBrowserListTarget, pruneRegistry } from './session.js';
import { launchManualLoginSession } from '../manualLogin.js';
import {
  BrowserService as BrowserServiceCore,
  type BrowserServiceDependencies,
} from '../../../packages/browser-service/src/service/browserService.js';

export class BrowserService extends BrowserServiceCore {
  private constructor(userConfig: ResolvedUserConfig) {
    const resolvedConfig = resolveBrowserConfig(userConfig.browser);
    const deps: BrowserServiceDependencies = {
      resolveBrowserListTarget: () => resolveBrowserListTarget(userConfig),
      pruneRegistry: () => pruneRegistry(),
      launchManualLoginSession,
    };
    super(resolvedConfig, deps);
  }

  static fromConfig(userConfig: ResolvedUserConfig): BrowserService {
    return new BrowserService(userConfig);
  }

  override async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
  } = {}) {
    const fallbackDir = path.join(os.homedir(), '.oracle', 'browser-profile');
    return super.resolveDevToolsTarget({
      ...options,
      defaultProfileDir: options.defaultProfileDir ?? fallbackDir,
    });
  }
}
