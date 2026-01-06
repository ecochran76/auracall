import { CHATGPT_PROVIDER } from './chatgpt.js';
import { GROK_PROVIDER } from './grok.js';
import type { BrowserProvider } from './types.js';

export const PROVIDERS: Record<BrowserProvider['id'], BrowserProvider> = {
  chatgpt: {
    id: 'chatgpt',
    config: CHATGPT_PROVIDER,
    resolveProjectUrl: (projectId) => `https://chatgpt.com/g/${projectId}/project`,
    resolveConversationUrl: (conversationId) => `https://chatgpt.com/c/${conversationId}`,
  },
  grok: {
    id: 'grok',
    config: GROK_PROVIDER,
    resolveProjectUrl: (projectId) => `https://grok.com/project/${projectId}`,
    resolveConversationUrl: (conversationId, projectId) =>
      projectId ? `https://grok.com/project/${projectId}?chat=${conversationId}` : `https://grok.com/?chat=${conversationId}`,
  },
};

export function getProvider(id: BrowserProvider['id']): BrowserProvider {
  return PROVIDERS[id];
}
