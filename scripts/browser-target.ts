import { resolveConfig } from '../src/schema/resolver.js';
import { resolveWslHost } from '../src/browser/chromeLifecycle.js';
import { BrowserService } from '../src/browser/service/browserService.js';

export async function resolveScriptBrowserTarget(options?: {
  fallbackPort?: number;
}): Promise<{ host: string; port: number }> {
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const browserService = BrowserService.fromConfig(userConfig);
  const target = await browserService.resolveDevToolsTarget();
  if (target?.port) {
    return { host: target.host ?? '127.0.0.1', port: target.port };
  }
  if (typeof options?.fallbackPort === 'number' && Number.isFinite(options.fallbackPort)) {
    return { host: resolveWslHost() ?? '127.0.0.1', port: options.fallbackPort };
  }
  throw new Error('No DevTools port found. Launch an Oracle browser run or set ORACLE_BROWSER_PORT.');
}
