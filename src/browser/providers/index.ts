import { CHATGPT_PROVIDER } from './chatgpt.js';
import {
  createChatgptAdapter,
  extractChatgptProjectIdFromUrl,
  normalizeChatgptConversationId,
  normalizeChatgptProjectId,
  resolveChatgptConversationUrl,
  resolveChatgptProjectUrl,
} from './chatgptAdapter.js';
import { GROK_PROVIDER } from './grok.js';
import {
  createGrokAdapter,
  extractGrokProjectIdFromUrl,
  resolveGrokConversationUrl,
  resolveGrokProjectUrl,
} from './grokAdapter.js';
import type { BrowserProvider } from './types.js';
import { GEMINI_PROVIDER } from './gemini.js';
import {
  createGeminiAdapter,
  extractGeminiProjectIdFromUrl,
  normalizeGeminiConversationId,
  normalizeGeminiProjectId,
  resolveGeminiConversationUrl,
  resolveGeminiProjectUrl,
} from './geminiAdapter.js';

export const PROVIDERS: Record<BrowserProvider['id'], BrowserProvider> = {
  chatgpt: {
    id: 'chatgpt',
    config: CHATGPT_PROVIDER,
    normalizeProjectId: normalizeChatgptProjectId,
    normalizeConversationId: normalizeChatgptConversationId,
    extractProjectIdFromUrl: extractChatgptProjectIdFromUrl,
    resolveProjectUrl: (projectId) => resolveChatgptProjectUrl(projectId),
    resolveConversationUrl: (conversationId, projectId) => resolveChatgptConversationUrl(conversationId, projectId),
    ...createChatgptAdapter(),
  },
  gemini: {
    id: 'gemini',
    config: GEMINI_PROVIDER,
    normalizeProjectId: normalizeGeminiProjectId,
    normalizeConversationId: normalizeGeminiConversationId,
    extractProjectIdFromUrl: extractGeminiProjectIdFromUrl,
    resolveProjectUrl: (projectId) => resolveGeminiProjectUrl(projectId),
    resolveConversationUrl: (conversationId) => resolveGeminiConversationUrl(conversationId),
    ...createGeminiAdapter(),
  },
  grok: {
    id: 'grok',
    config: GROK_PROVIDER,
    extractProjectIdFromUrl: extractGrokProjectIdFromUrl,
    resolveProjectUrl: (projectId) => resolveGrokProjectUrl(projectId),
    resolveConversationUrl: (conversationId, projectId) => resolveGrokConversationUrl(conversationId, projectId),
    ...createGrokAdapter(),
  },
};

export function getProvider(id: BrowserProvider['id']): BrowserProvider {
  return PROVIDERS[id];
}
