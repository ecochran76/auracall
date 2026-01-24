import { resolveConfig } from '../src/schema/resolver.js';
import { resolveWslHost } from '../src/browser/chromeLifecycle.js';
import { BrowserService } from '../src/browser/service/browserService.js';

export async function resolveScriptBrowserTarget(options?: {
  fallbackPort?: number;
  ensurePort?: boolean;
  launchUrl?: string;
}): Promise<{ host: string; port: number }> {
  // Oracle-only helper: uses Oracle config resolution + BrowserService wrapper.
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const browserService = BrowserService.fromConfig(userConfig);
  const target = await browserService.resolveDevToolsTarget({
    ensurePort: options?.ensurePort ?? true,
    launchUrl: options?.launchUrl,
  });
  if (target?.port) {
    return { host: target.host ?? '127.0.0.1', port: target.port };
  }
  if (typeof options?.fallbackPort === 'number' && Number.isFinite(options.fallbackPort)) {
    return { host: resolveWslHost() ?? '127.0.0.1', port: options.fallbackPort };
  }
  throw new Error('No DevTools port found. Launch a browser session or run scripts/start-devtools-session.ts.');
}
