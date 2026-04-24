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

export function createBrowserWorkbenchCapabilityDiscovery(
  userConfig: ResolvedUserConfig,
): (request: WorkbenchCapabilityReportRequest) => Promise<WorkbenchCapability[]> {
  return async (request) => {
    if (request.provider !== 'gemini' && request.provider !== 'chatgpt' && request.provider !== 'grok') {
      return [];
    }
    const client = await BrowserAutomationClient.fromConfig(userConfig, { target: request.provider });
    const entrypointUrl = resolveWorkbenchCapabilityEntrypointUrl(request);
    const signature = await client.getFeatureSignature(entrypointUrl
      ? {
          configuredUrl: entrypointUrl,
          preserveActiveTab: true,
          mutationSourcePrefix: `workbench:${request.entrypoint}`,
        }
      : undefined);
    const observedAt = new Date().toISOString();
    if (request.provider === 'chatgpt') {
      return deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(signature, observedAt);
    }
    if (request.provider === 'grok') {
      return deriveGrokWorkbenchCapabilitiesFromFeatureSignature(signature, observedAt);
    }
    return deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(signature, observedAt);
  };
}
