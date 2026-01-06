import { CHATGPT_PROVIDER } from './chatgpt.js';
import { GROK_PROVIDER } from './grok.js';
import type { BrowserProvider } from './types.js';

export const PROVIDERS: Record<BrowserProvider['id'], BrowserProvider> = {
  chatgpt: { id: 'chatgpt', config: CHATGPT_PROVIDER },
  grok: { id: 'grok', config: GROK_PROVIDER },
};

export function getProvider(id: BrowserProvider['id']): BrowserProvider {
  return PROVIDERS[id];
}
