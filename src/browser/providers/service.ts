import type { BrowserProvider } from './types.js';
import { getProvider } from './index.js';

export interface ProviderResolutionInput {
  provider: BrowserProvider['id'];
  configuredUrl?: string | null;
  projectId?: string;
  conversationId?: string;
}

export interface ProviderResolutionResult {
  url: string | null;
  used: 'conversation' | 'project' | 'configured' | 'none';
}

export function resolveProviderUrl({
  provider,
  configuredUrl,
  projectId,
  conversationId,
}: ProviderResolutionInput): ProviderResolutionResult {
  const adapter = getProvider(provider);
  if (conversationId && adapter.resolveConversationUrl) {
    return { url: adapter.resolveConversationUrl(conversationId, projectId), used: 'conversation' };
  }
  if (projectId && adapter.resolveProjectUrl) {
    return { url: adapter.resolveProjectUrl(projectId), used: 'project' };
  }
  if (configuredUrl) {
    return { url: configuredUrl, used: 'configured' };
  }
  return { url: null, used: 'none' };
}
