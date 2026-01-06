import type { BrowserProvider } from './types.js';
import type { Conversation, Project, ProviderId } from './domain.js';
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

export function deriveProjectsFromConfig({
  provider,
  configuredUrl,
  projectId,
}: {
  provider: ProviderId;
  configuredUrl?: string | null;
  projectId?: string | null;
}): Project[] {
  const resolvedId = projectId ?? (configuredUrl ? extractProjectId(provider, configuredUrl) : null);
  if (!resolvedId) return [];
  return [
    {
      id: resolvedId,
      name: resolvedId,
      provider,
      url: configuredUrl ?? getProvider(provider).resolveProjectUrl?.(resolvedId),
    },
  ];
}

export function deriveConversationsFromConfig({
  provider,
  configuredUrl,
  projectId,
  conversationId,
}: {
  provider: ProviderId;
  configuredUrl?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
}): Conversation[] {
  const resolvedId =
    conversationId ??
    (configuredUrl ? extractConversationId(provider, configuredUrl) : null);
  if (!resolvedId) return [];
  const adapter = getProvider(provider);
  return [
    {
      id: resolvedId,
      title: resolvedId,
      provider,
      projectId: projectId ?? undefined,
      url: adapter.resolveConversationUrl?.(resolvedId, projectId ?? undefined),
    },
  ];
}

function extractProjectId(provider: ProviderId, url: string): string | null {
  try {
    const parsed = new URL(url);
    if (provider === 'grok') {
      const match = parsed.pathname.match(/\/project\/([^/]+)/);
      return match?.[1] ?? null;
    }
    if (provider === 'chatgpt') {
      const match = parsed.pathname.match(/\/g\/([^/]+)\/project/);
      return match?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function extractConversationId(provider: ProviderId, url: string): string | null {
  try {
    const parsed = new URL(url);
    if (provider === 'grok') {
      return parsed.searchParams.get('chat');
    }
    if (provider === 'chatgpt') {
      const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
      return match?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
