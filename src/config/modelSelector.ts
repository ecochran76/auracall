import type { ThinkingTimeLevel } from '../browser/types.js';

export type ChatgptCanonicalModelSelector =
  | 'chatgpt:fast'
  | 'chatgpt:reasoning'
  | 'chatgpt:reasoning-high'
  | 'chatgpt:reasoning-max'
  | 'chatgpt:premium'
  | 'chatgpt:legacy';

export interface ChatgptSemanticModelSelection {
  /** Stable AuraCall intent ID. Persist this value instead of a provider model name. */
  canonicalSelector: ChatgptCanonicalModelSelector;
  /** Current ChatGPT picker label. This is provider-owned and may change independently. */
  desiredModel: 'GPT-6 Pro' | 'GPT-5.6 Sol' | 'GPT-5.6 Terra' | 'GPT-5.6 Luna' | 'GPT-5.5';
  /** Concrete API-compatible bridge used by shared runtime bookkeeping. */
  apiModel: 'gpt-6-astra' | 'gpt-5.6-sol' | 'gpt-5.2-instant';
  thinkingTime?: ThinkingTimeLevel;
}

export interface SemanticModelSelectorDescriptor {
  id: string;
  service: 'chatgpt' | 'gemini' | 'grok';
  label: string;
  executionReady: boolean;
}

const CHATGPT_SELECTOR_PREFIX = 'chatgpt:';

const CHATGPT_CANONICAL_SELECTIONS: Record<
  ChatgptCanonicalModelSelector,
  ChatgptSemanticModelSelection
> = {
  'chatgpt:fast': {
    canonicalSelector: 'chatgpt:fast',
    desiredModel: 'GPT-5.6 Sol',
    apiModel: 'gpt-5.6-sol',
    thinkingTime: 'light',
  },
  'chatgpt:reasoning': {
    canonicalSelector: 'chatgpt:reasoning',
    desiredModel: 'GPT-5.6 Sol',
    apiModel: 'gpt-5.6-sol',
    thinkingTime: 'standard',
  },
  'chatgpt:reasoning-high': {
    canonicalSelector: 'chatgpt:reasoning-high',
    desiredModel: 'GPT-5.6 Sol',
    apiModel: 'gpt-5.6-sol',
    thinkingTime: 'extended',
  },
  'chatgpt:reasoning-max': {
    canonicalSelector: 'chatgpt:reasoning-max',
    desiredModel: 'GPT-5.6 Sol',
    apiModel: 'gpt-5.6-sol',
    thinkingTime: 'heavy',
  },
  'chatgpt:premium': {
    canonicalSelector: 'chatgpt:premium',
    desiredModel: 'GPT-6 Pro',
    apiModel: 'gpt-6-astra',
  },
  'chatgpt:legacy': {
    canonicalSelector: 'chatgpt:legacy',
    desiredModel: 'GPT-5.5',
    apiModel: 'gpt-5.2-instant',
  },
};

const CHATGPT_SELECTOR_ALIASES: Readonly<Record<string, ChatgptCanonicalModelSelector>> = {
  auto: 'chatgpt:fast',
  instant: 'chatgpt:fast',
  'gpt-5.2': 'chatgpt:fast',
  'gpt-5.2-instant': 'chatgpt:fast',
  thinking: 'chatgpt:reasoning',
  'thinking-standard': 'chatgpt:reasoning',
  'gpt-5.2-thinking': 'chatgpt:reasoning',
  sol: 'chatgpt:reasoning',
  'sol-medium': 'chatgpt:reasoning',
  'thinking-extended': 'chatgpt:reasoning-high',
  'sol-high': 'chatgpt:reasoning-high',
  'gpt-5.6-sol-high': 'chatgpt:reasoning-high',
  'pro-standard': 'chatgpt:reasoning',
  'pro-extended': 'chatgpt:reasoning-high',
  'sol-extra-high': 'chatgpt:reasoning-max',
  'gpt-5.6-sol-extra-high': 'chatgpt:reasoning-max',
  'sol-pro': 'chatgpt:reasoning-max',
  'gpt-5.6-sol-pro': 'chatgpt:reasoning-max',
  pro: 'chatgpt:reasoning',
  premium: 'chatgpt:premium',
  'gpt-5.2-pro': 'chatgpt:reasoning',
  'gpt-6': 'chatgpt:premium',
  'gpt-6-pro': 'chatgpt:premium',
  'gpt-6-astra': 'chatgpt:premium',
  astra: 'chatgpt:premium',
  legacy: 'chatgpt:legacy',
  'gpt-5.5': 'chatgpt:legacy',
  '5.5': 'chatgpt:legacy',
};

const CHATGPT_EXPLICIT_PROVIDER_SELECTIONS: Readonly<Record<string, ChatgptSemanticModelSelection>> = {
  terra: {
    canonicalSelector: 'chatgpt:fast',
    desiredModel: 'GPT-5.6 Terra',
    apiModel: 'gpt-5.2-instant',
  },
  'gpt-5.6-terra': {
    canonicalSelector: 'chatgpt:fast',
    desiredModel: 'GPT-5.6 Terra',
    apiModel: 'gpt-5.2-instant',
  },
  luna: {
    canonicalSelector: 'chatgpt:fast',
    desiredModel: 'GPT-5.6 Luna',
    apiModel: 'gpt-5.2-instant',
  },
  'gpt-5.6-luna': {
    canonicalSelector: 'chatgpt:fast',
    desiredModel: 'GPT-5.6 Luna',
    apiModel: 'gpt-5.2-instant',
  },
  'gpt-5.6-sol': CHATGPT_CANONICAL_SELECTIONS['chatgpt:reasoning'],
};

export const SEMANTIC_MODEL_SELECTORS: readonly SemanticModelSelectorDescriptor[] = [
  { id: 'chatgpt:fast', service: 'chatgpt', label: 'ChatGPT Fast', executionReady: true },
  { id: 'chatgpt:reasoning', service: 'chatgpt', label: 'ChatGPT Reasoning', executionReady: true },
  { id: 'chatgpt:reasoning-high', service: 'chatgpt', label: 'ChatGPT Reasoning High', executionReady: true },
  { id: 'chatgpt:reasoning-max', service: 'chatgpt', label: 'ChatGPT Reasoning Max', executionReady: true },
  { id: 'chatgpt:premium', service: 'chatgpt', label: 'ChatGPT Premium', executionReady: true },
  { id: 'chatgpt:legacy', service: 'chatgpt', label: 'ChatGPT Legacy', executionReady: true },
  { id: 'gemini:auto', service: 'gemini', label: 'Gemini Auto', executionReady: false },
  { id: 'gemini:instant', service: 'gemini', label: 'Gemini Instant', executionReady: false },
  { id: 'gemini:thinking', service: 'gemini', label: 'Gemini Thinking', executionReady: false },
  { id: 'grok:auto', service: 'grok', label: 'Grok Auto', executionReady: false },
  { id: 'grok:instant', service: 'grok', label: 'Grok Instant', executionReady: false },
  { id: 'grok:thinking', service: 'grok', label: 'Grok Thinking', executionReady: false },
];

export function resolveChatgptSemanticModelSelector(
  value: unknown,
): ChatgptSemanticModelSelection | null {
  const selector = normalizeSelector(value);
  if (!selector) return null;
  const token = selector.startsWith(CHATGPT_SELECTOR_PREFIX)
    ? selector.slice(CHATGPT_SELECTOR_PREFIX.length)
    : selector;
  const explicitProviderSelection = CHATGPT_EXPLICIT_PROVIDER_SELECTIONS[token];
  if (explicitProviderSelection) return { ...explicitProviderSelection };
  const canonicalSelector = selector in CHATGPT_CANONICAL_SELECTIONS
    ? selector as ChatgptCanonicalModelSelector
    : CHATGPT_SELECTOR_ALIASES[token];
  const selection = canonicalSelector ? CHATGPT_CANONICAL_SELECTIONS[canonicalSelector] : null;
  return selection ? { ...selection } : null;
}

export function isChatgptSemanticModelSelector(value: unknown): boolean {
  const selector = normalizeSelector(value);
  return selector ? selector.startsWith(CHATGPT_SELECTOR_PREFIX) : false;
}

function normalizeSelector(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
