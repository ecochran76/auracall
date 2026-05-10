import type { ThinkingTimeLevel } from '../browser/types.js';

export interface ChatgptSemanticModelSelection {
  desiredModel: 'Auto' | 'Instant' | 'Thinking' | 'Pro';
  thinkingTime?: ThinkingTimeLevel;
}

const CHATGPT_SELECTOR_PREFIX = 'chatgpt:';

export function resolveChatgptSemanticModelSelector(
  value: unknown,
): ChatgptSemanticModelSelection | null {
  const selector = normalizeSelector(value);
  if (!selector) {
    return null;
  }
  const token = selector.startsWith(CHATGPT_SELECTOR_PREFIX)
    ? selector.slice(CHATGPT_SELECTOR_PREFIX.length)
    : selector;

  switch (token) {
    case 'auto':
      return { desiredModel: 'Auto' };
    case 'instant':
      return { desiredModel: 'Instant' };
    case 'thinking':
    case 'thinking-standard':
      return { desiredModel: 'Thinking', thinkingTime: 'standard' };
    case 'thinking-extended':
      return { desiredModel: 'Thinking', thinkingTime: 'extended' };
    case 'pro':
    case 'pro-standard':
      return { desiredModel: 'Pro', thinkingTime: 'standard' };
    case 'pro-extended':
      return { desiredModel: 'Pro', thinkingTime: 'extended' };
    default:
      return null;
  }
}

export function isChatgptSemanticModelSelector(value: unknown): boolean {
  const selector = normalizeSelector(value);
  return selector ? selector.startsWith(CHATGPT_SELECTOR_PREFIX) : false;
}

function normalizeSelector(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
