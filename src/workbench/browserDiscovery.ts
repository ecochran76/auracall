import { BrowserAutomationClient } from '../browser/client.js';
import type { ResolvedUserConfig } from '../config.js';
import { deriveChatgptWorkbenchCapabilitiesFromFeatureSignature } from './chatgptDiscovery.js';
import { deriveGeminiWorkbenchCapabilitiesFromFeatureSignature } from './geminiDiscovery.js';
import { deriveGrokWorkbenchCapabilitiesFromFeatureSignature } from './grokDiscovery.js';
import { resolveWorkbenchCapabilityEntrypointUrl } from './entrypoints.js';
import type {
  WorkbenchCapability,
  WorkbenchCapabilityReportRequest,
} from './types.js';

function mergeObjectArrays(
  left: unknown,
  right: unknown,
  identityKeys: readonly string[],
): unknown[] {
  const result = new Map<string, unknown>();
  for (const entry of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const key = identityKeys
      .map((identityKey) => record[identityKey])
      .find((value): value is string => typeof value === 'string' && value.length > 0);
    if (!key) continue;
    result.set(key, { ...(result.get(key) as Record<string, unknown> | undefined), ...record });
  }
  return [...result.values()];
}

export function mergeChatgptFeatureSignaturesForTest(
  composerSignature: string | null | undefined,
  pluginSignature: string | null | undefined,
): string | null {
  const parse = (value: string | null | undefined): Record<string, unknown> | null => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  };
  const composer = parse(composerSignature);
  const plugins = parse(pluginSignature);
  if (!composer && !plugins) return null;
  const merged: Record<string, unknown> = {
    ...(plugins ?? {}),
    ...(composer ?? {}),
  };
  for (const flag of ['web_search', 'deep_research', 'company_knowledge'] as const) {
    if (composer?.[flag] === true || plugins?.[flag] === true) merged[flag] = true;
  }
  merged.apps = Array.from(new Set([
    ...(Array.isArray(composer?.apps) ? composer.apps : []),
    ...(Array.isArray(plugins?.apps) ? plugins.apps : []),
  ].filter((value): value is string => typeof value === 'string')));
  merged.composer_apps = mergeObjectArrays(
    composer?.composer_apps,
    plugins?.composer_apps,
    ['plugin_id', 'app_id', 'name'],
  );
  merged.installed_apps = mergeObjectArrays(
    composer?.installed_apps,
    plugins?.installed_apps,
    ['plugin_id', 'name'],
  );
  merged.linked_apps = mergeObjectArrays(
    composer?.linked_apps,
    plugins?.linked_apps,
    ['link_id', 'connector_id', 'name'],
  );
  return JSON.stringify(merged);
}

export function createBrowserWorkbenchCapabilityDiscovery(
  userConfig: ResolvedUserConfig,
): (request: WorkbenchCapabilityReportRequest) => Promise<WorkbenchCapability[]> {
  return async (request) => {
    if (request.provider !== 'gemini' && request.provider !== 'chatgpt' && request.provider !== 'grok') {
      return [];
    }
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target: request.provider });
    const entrypointUrl = resolveWorkbenchCapabilityEntrypointUrl(request);
    const signature = await client.getFeatureSignature(
      entrypointUrl
        ? {
            configuredUrl: entrypointUrl,
            preserveActiveTab: true,
            discoveryAction: request.discoveryAction ?? null,
            mutationSourcePrefix: `workbench:${request.entrypoint}`,
          }
        : request.provider === 'chatgpt'
          ? {
              configuredUrl: 'https://chatgpt.com/',
              includeInstalledApps: true,
              tabLifecycle: 'dispose-new',
              mutationSourcePrefix: 'workbench:chatgpt-app-discovery',
            }
          : undefined,
    );
    if (request.provider === 'chatgpt') {
      return deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
        signature,
        new Date().toISOString(),
      );
    }
    const observedAt = new Date().toISOString();
    if (request.provider === 'grok') {
      return deriveGrokWorkbenchCapabilitiesFromFeatureSignature(signature, observedAt);
    }
    return deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(signature, observedAt);
  };
}
