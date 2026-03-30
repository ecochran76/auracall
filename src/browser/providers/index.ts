import { CHATGPT_PROVIDER } from './chatgpt.js';
import {
  createChatgptAdapter,
  extractChatgptProjectIdFromUrl,
  normalizeChatgptConversationId,
  normalizeChatgptProjectId,
  resolveChatgptConversationUrl,
} from './chatgptAdapter.js';
import { GROK_PROVIDER } from './grok.js';
import { createGrokAdapter, extractGrokProjectIdFromUrl } from './grokAdapter.js';
import type { BrowserProvider } from './types.js';

export const PROVIDERS: Record<BrowserProvider['id'], BrowserProvider> = {
  chatgpt: {
    id: 'chatgpt',
    config: CHATGPT_PROVIDER,
    normalizeProjectId: normalizeChatgptProjectId,
    normalizeConversationId: normalizeChatgptConversationId,
    extractProjectIdFromUrl: extractChatgptProjectIdFromUrl,
    resolveProjectUrl: (projectId) => `https://chatgpt.com/g/${projectId}/project`,
    resolveConversationUrl: (conversationId, projectId) => resolveChatgptConversationUrl(conversationId, projectId),
    ...createChatgptAdapter(),
  },
  grok: {
    id: 'grok',
    config: GROK_PROVIDER,
    extractProjectIdFromUrl: extractGrokProjectIdFromUrl,
    resolveProjectUrl: (projectId) => `https://grok.com/project/${projectId}`,
    resolveConversationUrl: (conversationId, projectId) =>
      projectId ? `https://grok.com/project/${projectId}?chat=${conversationId}` : `https://grok.com/c/${conversationId}`,
    ...createGrokAdapter(),
  },
};

export function getProvider(id: BrowserProvider['id']): BrowserProvider {
  return PROVIDERS[id];
}
