import type { BrowserModelStrategy } from './types.js';
import { CHATGPT_PROVIDER } from './providers/chatgpt.js';

export const CHATGPT_URL = 'https://chatgpt.com/';
export const GROK_URL = 'https://grok.com/';
export const DEFAULT_MODEL_TARGET = 'GPT-5.2 Instant';
export const DEFAULT_MODEL_STRATEGY: BrowserModelStrategy = 'select';
export const COOKIE_URLS = ['https://chatgpt.com', 'https://chat.openai.com', 'https://atlas.openai.com'];

export const INPUT_SELECTORS = CHATGPT_PROVIDER.selectors.input;

export const ANSWER_SELECTORS = CHATGPT_PROVIDER.selectors.assistantRole;

export const CONVERSATION_TURN_SELECTOR = CHATGPT_PROVIDER.selectors.assistantBubble.join(', ');
export const ASSISTANT_ROLE_SELECTOR = '[data-message-author-role="assistant"], [data-turn="assistant"]';
export const CLOUDFLARE_SCRIPT_SELECTOR = 'script[src*="/challenge-platform/"]';
export const CLOUDFLARE_TITLE = 'just a moment';
export const PROMPT_PRIMARY_SELECTOR = '#prompt-textarea';
export const PROMPT_FALLBACK_SELECTOR = 'textarea[name="prompt-textarea"]';
export const FILE_INPUT_SELECTORS = CHATGPT_PROVIDER.selectors.fileInput;
// Legacy single selectors kept for compatibility with older call-sites
export const FILE_INPUT_SELECTOR = FILE_INPUT_SELECTORS[0];
export const GENERIC_FILE_INPUT_SELECTOR = FILE_INPUT_SELECTORS[3];
export const MENU_CONTAINER_SELECTOR = '[role="menu"], [data-radix-collection-root]';
export const MENU_ITEM_SELECTOR = CHATGPT_PROVIDER.selectors.menuItem.join(', ');
export const UPLOAD_STATUS_SELECTORS = [
  '[data-testid*="upload"]',
  '[data-testid*="attachment"]',
  '[data-testid*="progress"]',
  '[data-state="loading"]',
  '[data-state="uploading"]',
  '[data-state="pending"]',
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
];

export const STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';
export const SEND_BUTTON_SELECTORS = CHATGPT_PROVIDER.selectors.sendButton;
export const SEND_BUTTON_SELECTOR = SEND_BUTTON_SELECTORS[0];
export const MODEL_BUTTON_SELECTORS = CHATGPT_PROVIDER.selectors.modelButton;
export const MODEL_BUTTON_SELECTOR = MODEL_BUTTON_SELECTORS[0];
export const COPY_BUTTON_SELECTORS = CHATGPT_PROVIDER.selectors.copyButton;
export const COPY_BUTTON_SELECTOR = COPY_BUTTON_SELECTORS[0];
// Action buttons that only appear once a turn has finished rendering.
export const FINISHED_ACTIONS_SELECTOR =
  'button[data-testid="copy-turn-action-button"], button[data-testid="good-response-turn-action-button"], button[data-testid="bad-response-turn-action-button"], button[aria-label="Share"]';
